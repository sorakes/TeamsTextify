/**
 * ============================================================
 * LEI ZERO — DADOS REAIS APENAS (INVIOLÁVEL)
 * Zero mocks. Zero texto de teste. Zero dado fabricado.
 * Se não há gravação real, falha explicitamente.
 * ============================================================
 */

import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import prisma from "../lib/db/prisma";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { decrypt } from "../lib/encryption";
import { spawn } from "child_process";
import * as fs from "fs";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";

const connection = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null,
});

async function logAudit(level: "INFO" | "WARNING" | "ERROR", message: string, meetingId?: string) {
  try {
    await prisma.auditLog.create({ data: { level, source: "Worker", message: message.substring(0, 1000), meetingId: meetingId ?? null } });
  } catch (e) {
    console.error("Erro ao salvar log de auditoria:", e);
  }
}


// ── Helper: autenticar com MSAL e retornar Graph client ──────────────────────
async function getGraphClient(): Promise<Client> {
  const system = await prisma.systemSettings.findUnique({ where: { id: "global" } });
  const clientId = system?.entraClientId || process.env.AZURE_CLIENT_ID;
  const tenantId = system?.entraTenantId || process.env.AZURE_TENANT_ID;
  let clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (system?.entraClientSecret) {
    try { clientSecret = decrypt(system.entraClientSecret); } catch {}
  }

  if (!clientId || !tenantId || !clientSecret) {
    throw new Error("Credenciais do Entra ID não configuradas. Acesse Configurações > Sync API.");
  }

  const cca = new ConfidentialClientApplication({
    auth: { clientId, clientSecret, authority: `https://login.microsoftonline.com/${tenantId}` }
  });

  const authResult = await cca.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  if (!authResult?.accessToken) throw new Error("Falha ao obter token MSAL.");

  return Client.init({
    authProvider: (done) => done(null, authResult.accessToken),
  });
}

// ── Helper: buscar URL real da gravação via MS Graph (OneDrive First) ─────────
async function getRecordingContentUrl(graphClient: Client, meeting: any): Promise<string> {
  const apiPath = `/users/${meeting.ownerId}/drive/items/${meeting.teamsId}`;
  
  try {
    const itemData = await graphClient
      .api(apiPath)
      .select("@microsoft.graph.downloadUrl")
      .get();
      
    if (itemData?.["@microsoft.graph.downloadUrl"]) {
      return itemData["@microsoft.graph.downloadUrl"];
    }
  } catch (err: any) {
    throw new Error(`Falha ao acessar o arquivo MP4 no OneDrive: ${err.message}`);
  }
  
  throw new Error("Arquivo não possui URL de download (provavelmente foi deletado).");
}

// ── Helper: download de arquivo com token Bearer ──────────────────────────────
async function downloadFileWithAuth(url: string, destPath: string, accessToken: string): Promise<void> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Download falhou: HTTP ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
}

// ── Helper: extração de áudio com FFmpeg ─────────────────────────────────────
function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y", "-i", videoPath,
      "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
      audioPath
    ]);
    let stderr = "";
    ffmpeg.stderr.on("data", (d) => { stderr += d.toString(); });
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg falhou (código ${code}): ${stderr.slice(-300)}`));
    });
  });
}

// ── Helper: diarização com Python (Whisper + Pyannote) ───────────────────────
function runDiarization(audioPath: string, hfToken: string, meetingSubject: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const py = spawn("/opt/venv/bin/python3", ["/app/src/python/diarize.py", audioPath, hfToken, meetingSubject], {
      env: { 
        ...process.env, 
        PYTHONIOENCODING: "utf-8",
        HOME: "/tmp",
        HF_HOME: "/app/.cache",
        PYANNOTE_CACHE: "/app/.cache",
        PYANNOTE_DATABASE_CONFIG: "/app/.cache/database.yml"
      }
    });
    let stdout = "";
    let stderr = "";
    py.stdout.on("data", (d) => { stdout += d.toString("utf8"); });
    py.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
    py.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.success && parsed.raw_text) {
            resolve(parsed.raw_text);
          } else {
            resolve(stdout.trim());
          }
        } catch (e) {
          resolve(stdout.trim());
        }
      } else {
        reject(new Error(`Diarização Python falhou (código ${code}): ${stderr.slice(-300)}`));
      }
    });
  });
}

// ── Helper: instanciar modelo LLM ────────────────────────────────────────────
async function getActiveAIModel() {
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error("Organization not found");

  const config = await prisma.orgSettings.findUnique({ where: { organizationId: org.id } });
  if (!config) throw new Error("Config LLM não configurada.");

  const provider = config.activeLlmProvider;
  const llmConfigs = JSON.parse(config.llmConfigs || "{}");
  const activeConfig = llmConfigs[provider];
  if (!activeConfig?.apiKey) throw new Error(`LLM provider '${provider}' sem API Key.`);

  const apiKey = decrypt(activeConfig.apiKey);
  const modelName = activeConfig.modelName;
  const baseUrl = activeConfig.baseUrl;

  if (provider === "gemini") {
    return createGoogleGenerativeAI({ apiKey })(modelName);
  } else if (provider === "openai") {
    return createOpenAI({ apiKey })(modelName);
  } else {
    let finalBaseUrl = baseUrl;
    if (!finalBaseUrl) {
      if (provider === "openrouter") finalBaseUrl = "https://openrouter.ai/api/v1";
      if (provider === "groq") finalBaseUrl = "https://api.groq.com/openai/v1";
    }
    return createOpenAI({ apiKey: apiKey || "ollama", baseURL: finalBaseUrl })(modelName);
  }
}

// ── Helper: buscar prompts customizados do OrgSettings ───────────────────────
async function getCustomPrompts(): Promise<{ minutesPrompt: string | null; tagsPrompt: string | null }> {
  const org = await prisma.organization.findFirst();
  if (!org) return { minutesPrompt: null, tagsPrompt: null };
  const settings = await prisma.orgSettings.findUnique({ where: { organizationId: org.id } });
  return {
    minutesPrompt: (settings as any)?.minutesPrompt ?? null,
    tagsPrompt: (settings as any)?.tagsPrompt ?? null,
  };
}

// ── Recovery: reprocessa meetings travados por crash anterior ─────────────────
async function recoverStalledJobs() {
  try {
    // Status intermediários indicam que o worker estava processando e crashou
    const stalledMeetings = await prisma.meeting.findMany({
      where: { status: { in: ["TRANSCRIBING", "GENERATING"] } },
      select: { id: true, subject: true },
    });

    if (stalledMeetings.length === 0) {
      console.log("[Worker:Recovery] Nenhuma reunião travada encontrada.");
      return;
    }

    console.log(`[Worker:Recovery] ⚠️  ${stalledMeetings.length} reunião(ões) travada(s) detectada(s). Reprocessando...`);
    await logAudit("WARNING", `Recovery no boot: ${stalledMeetings.length} reunião(ões) travada(s) foram rereenfileiradas automaticamente.`);

    const { Queue } = await import("bullmq");
    const recoveryQueue = new Queue("sync-meetings-queue", { connection: connection as any });

    for (const meeting of stalledMeetings) {
      // Reseta o status para PENDING antes de reprocessar
      await prisma.meeting.update({ where: { id: meeting.id }, data: { status: "PENDING" } });
      await recoveryQueue.add("sync-microsoft-graph", { meetingId: meeting.id }, {
        priority: 1, // Prioridade alta
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      });
      console.log(`[Worker:Recovery] ✅ Reenfileirada: "${meeting.subject}" (${meeting.id})`);
    }

    await recoveryQueue.close();
  } catch (err) {
    console.error("[Worker:Recovery] Erro durante recovery:", err);
  }
}

// ── Global Sync Logic ─────────────────────────────────────────────────────────
async function runGlobalSync(job: Job) {
  const daysBack = job.data.daysBack || 60;
  
  const setRedisProgress = async (state: any) => {
    await connection.set("teamstextify_global_sync_progress", JSON.stringify({ ...state, lastUpdate: Date.now() }));
  };

  await setRedisProgress({ status: "running", scanned: 0, total: 0, currentUser: "", imported: 0, message: "" });
  console.log(`[Worker] Iniciando Varredura Global (Global Sync) em background...`);

  try {
    const graphClient = await getGraphClient();
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - daysBack);

    let users: any[] = [];
    let nextLink: string | null = '/users?$select=id,userPrincipalName,mail,displayName';
    while (nextLink) {
      const usersResponse = await graphClient.api(nextLink).get();
      if (usersResponse.value) users.push(...usersResponse.value);
      nextLink = usersResponse['@odata.nextLink'] || null;
    }

    const totalUsers = users.length;
    await setRedisProgress({ status: "running", scanned: 0, total: totalUsers, currentUser: "", imported: 0, message: "" });

    const org = await prisma.organization.findFirst();
    if (!org) throw new Error("Nenhuma organização encontrada no banco.");

    let totalImported = 0;
    let usersScanned = 0;

    for (const user of users) {
      const email = user.mail || user.userPrincipalName;
      if (!email) continue;

      usersScanned++;
      await setRedisProgress({
        status: "running",
        scanned: usersScanned,
        total: totalUsers,
        currentUser: email,
        imported: totalImported,
      });

      try {
        const possiblePaths = [
          "root:/Documents/Recordings:/children",
          "root:/Documentos/Recordings:/children",
          "root:/Recordings:/children",
          "root:/Gravações:/children"
        ];

        let foundRecordingsFolder = false;

        for (const path of possiblePaths) {
          if (foundRecordingsFolder) break;

          const driveItemsResponse = await graphClient.api(`/users/${user.id}/drive/${path}`)
            .select("id,name,createdDateTime,lastModifiedDateTime,file,audio,video,webUrl")
            .get().catch(() => null);

          if (driveItemsResponse?.value) {
            foundRecordingsFolder = true;
            const mp4s = driveItemsResponse.value.filter((i: any) => i.name?.toLowerCase().endsWith(".mp4"));

            for (const mp4 of mp4s) {
              const fileDate = mp4.createdDateTime || mp4.lastModifiedDateTime;
              if (!fileDate || new Date(fileDate) < dateLimit) continue;

              const existing = await prisma.meeting.findUnique({ where: { teamsId: mp4.id } });
              if (existing) continue;

              let durationMinutes = 0;
              if (mp4.video?.duration) durationMinutes = Math.round(mp4.video.duration / 60000);
              else if (mp4.audio?.duration) durationMinutes = Math.round(mp4.audio.duration / 60000);

              let participantsArr: string[] = [];
              try {
                const perms = await graphClient.api(`/users/${user.id}/drive/items/${mp4.id}/permissions`).get();
                if (perms?.value) {
                  perms.value.forEach((perm: any) => {
                    const grantedTo = perm.grantedToV2 || perm.grantedTo;
                    if (grantedTo?.user?.email) participantsArr.push(grantedTo.user.email);
                    const identities = perm.grantedToIdentitiesV2 || perm.grantedToIdentities || [];
                    identities.forEach((i: any) => { if (i?.user?.email) participantsArr.push(i.user.email); });
                  });
                }
              } catch (err) {}
              participantsArr = [...new Set(participantsArr.filter(Boolean))];

              const newMeeting = await prisma.meeting.create({
                data: {
                  teamsId: mp4.id,
                  organizationId: org.id,
                  subject: mp4.name?.replace(".mp4", "") || "Gravação Sem Título",
                  startedAt: new Date(fileDate),
                  endedAt: new Date(fileDate),
                  durationMinutes,
                  participants: JSON.stringify(participantsArr),
                  organizerEmail: email,
                  organizerName: user.displayName || "Desconhecido",
                  joinUrl: mp4.webUrl || `/users/${user.id}/drive/items/${mp4.id}`,
                  ownerId: user.id || null,
                  status: "PENDING",
                },
              });
              
              const { Queue } = await import("bullmq");
              const addQueue = new Queue("sync-meetings-queue", { connection: connection as any });
              await addQueue.add("sync-microsoft-graph", { meetingId: newMeeting.id });
              await addQueue.close();

              totalImported++;
            }
          }
        }
      } catch (e) {}
    }

    await setRedisProgress({ status: "done", scanned: usersScanned, total: totalUsers, currentUser: "", imported: totalImported });
    console.log(`[Worker] Varredura Global concluída. ${totalImported} novas reuniões encontradas.`);
    return { success: true, imported: totalImported };
  } catch (err: any) {
    await setRedisProgress({ status: "error", message: err.message });
    console.error(`[Worker] Erro na Varredura Global:`, err);
    throw err;
  }
}

// ── Worker principal ──────────────────────────────────────────────────────────
async function startWorker() {
  let concurrency = 1;
  try {
    const sys = await (prisma as any).systemSettings?.findUnique({ where: { id: "global" } });
    if (sys?.workerConcurrency) concurrency = sys.workerConcurrency;
  } catch { /* usa default 1 */ }

  // 🛡️ Recovery: detecta e reprocessa meetings travados por crash anterior
  await recoverStalledJobs();

  // 🕒 Configurar agendamento de varredura global
  try {
    const sys = await (prisma as any).systemSettings?.findUnique({ where: { id: "global" } });
    if (sys && sys.syncIntervalMinutes) {
      const { Queue } = await import("bullmq");
      const q = new Queue("sync-meetings-queue", { connection: connection as any });
      
      const repeatables = await q.getRepeatableJobs();
      for (const r of repeatables) await q.removeRepeatableByKey(r.key);
      
      if (sys.syncIntervalMinutes > 0) {
        await q.add("global-sync", { daysBack: 3 }, {
          repeat: { every: sys.syncIntervalMinutes * 60 * 1000 },
          jobId: "global-sync-cron"
        });
        console.log(`[Worker] ⏰ Cronjob Global Sync configurado: a cada ${sys.syncIntervalMinutes} minutos.`);
      }
      await q.close();
    }
  } catch (err) {
    console.error("[Worker] Erro ao configurar cron job:", err);
  }

  const syncWorker = new Worker("sync-meetings-queue", async (job: Job) => {
    if (job.name === "global-sync") {
      return await runGlobalSync(job);
    }

    const meetingId = job.data.meetingId || job.data.tenantId;

    if (!meetingId) throw new Error("meetingId não fornecido no Job.");

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) {
      console.warn(`[Worker] Reunião ${meetingId} não encontrada no banco. Job ignorado para limpar fila.`);
      return { skipped: true, reason: "Meeting not found in database." };
    }

    console.log(`[Worker] Job ${job.id} → "${meeting.subject}"`);
    await job.updateProgress(5);

    // Regra de ouro: sem joinUrl real, não há o que processar
    if (!meeting.joinUrl) {
      await prisma.meeting.update({ where: { id: meetingId }, data: { status: "AWAITING_RECORDING" } });
      console.log(`[Worker] Sem joinUrl → AWAITING_RECORDING: "${meeting.subject}"`);
      return { skipped: true, reason: "Sem joinUrl." };
    }
    if (!meeting.ownerId) {
      await prisma.meeting.update({ where: { id: meetingId }, data: { status: "AWAITING_RECORDING" } });
      console.log(`[Worker] Sem ownerId (organizador) → AWAITING_RECORDING: "${meeting.subject}"`);
      return { skipped: true, reason: "Sem ownerId." };
    }

    const videoPath = `/tmp/meeting_${meeting.id}.mp4`;
    const audioPath = `/tmp/meeting_${meeting.id}.wav`;

    const cleanup = () => {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    };

    try {
      let transcriptRaw = meeting.transcriptRaw;

      if (!transcriptRaw) {
        // ── 1. Autenticar com MS Graph ──────────────────────────────────────────
        await job.updateProgress(10);
        const graphClient = await getGraphClient();
        console.log(`[Worker] MS Graph autenticado.`);

        // ── 2. Buscar URL real da gravação ──────────────────────────────────────
        await job.updateProgress(15);
        let recordingUrl: string;
        try {
          recordingUrl = await getRecordingContentUrl(graphClient, meeting);
          console.log(`[Worker] URL da gravação obtida.`);
        } catch (recErr: any) {
          // Reunião sem gravação → não é erro do sistema, é estado esperado
          await prisma.meeting.update({ where: { id: meetingId }, data: { status: "AWAITING_RECORDING" } });
          console.log(`[Worker] Sem gravação disponível: ${recErr.message}`);
          await logAudit("WARNING", `Reunião "${meeting.subject}" (${meetingId}) não possui gravação no MS Graph: ${recErr.message}`);
          return { skipped: true, reason: recErr.message };
        }

        // ── 3. Download da gravação ─────────────────────────────────────────────
        await job.updateProgress(20);
        console.log(`[Worker] Baixando gravação...`);
        // Obter um token fresh para o download
        const system = await prisma.systemSettings.findUnique({ where: { id: "global" } });
        const clientId = system?.entraClientId!;
        const tenantId = system?.entraTenantId!;
        const clientSecret = decrypt(system?.entraClientSecret || "");
        const cca = new ConfidentialClientApplication({
          auth: { clientId, clientSecret, authority: `https://login.microsoftonline.com/${tenantId}` }
        });
        const tokenResult = await cca.acquireTokenByClientCredential({
          scopes: ["https://graph.microsoft.com/.default"],
        });
        await downloadFileWithAuth(recordingUrl, videoPath, tokenResult!.accessToken);
        await job.updateProgress(40);
        console.log(`[Worker] Download concluído: ${videoPath}`);

        // ── 4. Extrair áudio com FFmpeg ─────────────────────────────────────────
        console.log(`[Worker] Extraindo áudio com FFmpeg...`);
        await extractAudio(videoPath, audioPath);
        await job.updateProgress(60);
        console.log(`[Worker] Áudio extraído: ${audioPath}`);

        // ── 5. Diarização Whisper + Pyannote ────────────────────────────────────
        const sys = await prisma.systemSettings.findUnique({ where: { id: "global" } });
        const hfToken = (sys as any)?.huggingFaceToken;
        if (!hfToken) throw new Error("HuggingFace Token não configurado. Acesse Configurações.");

        // 🛡️ Marca como TRANSCRIBING para que o recovery detecte crash nesta etapa
        await prisma.meeting.update({ where: { id: meetingId }, data: { status: "TRANSCRIBING" } });
        console.log(`[Worker] Diarização em andamento (Whisper + Pyannote)...`);
        transcriptRaw = await runDiarization(audioPath, hfToken, meeting.subject || "Reunião corporativa");
        await job.updateProgress(78);
        console.log(`[Worker] Diarização concluída: ${transcriptRaw.split("\n").length} segmentos.`);

        // Salva a transcrição antecipadamente no banco de dados (Smart Retry / Fail-Safe)
        await prisma.meeting.update({ 
          where: { id: meetingId }, 
          data: { transcriptRaw, status: "GENERATING" } 
        });

        // ── 6. Limpeza dos arquivos de mídia ────────────────────────────────────
        cleanup();
        console.log(`[Worker] Arquivos de mídia deletados.`);
      } else {
        console.log(`[Worker] Transcrição já existe para "${meeting.subject}". Pulando processamento de GPU/Áudio (Smart Retry).`);
        await job.updateProgress(78);
      }

      // ── 7. Gerar Ata com LLM (usando transcrição REAL) ──────────────────────
      let finalMinutes = meeting.minutesText;

      if (!finalMinutes) {
        // 🛡️ Marca como GENERATING para que o recovery detecte crash nesta etapa
        await prisma.meeting.update({ where: { id: meetingId }, data: { status: "GENERATING" } });
        const aiModel = await getActiveAIModel();
        const customPrompts = await getCustomPrompts();
        console.log(`[Worker] Gerando Ata com LLM...`);

        // Usa prompt customizado se existir, caso contrário usa o padrão
        const defaultMinutesPrompt = `O Título desta reunião é: "${meeting.subject}".
Abaixo está a transcrição de uma reunião do Microsoft Teams.

GERAR UMA ATA ESTRUTURADA EM MARKDOWN contendo os seguintes cabeçalhos:

### 1. Cliente / Empresa Externa (OPCIONAL)
INCLUA esta seção APENAS se na transcrição houver menção explícita a um cliente externo ou empresa terceira como foco da reunião.
Se a reunião for interna (entre membros da mesma equipe/empresa) ou não houver cliente mencionado, OMITA esta seção completamente.
(Quando presente: descreva o nome completo oficial da empresa. Não use siglas.)

### 2. Resumo Executivo
(Resumo em 1 parágrafo.)

### 3. Tópicos Discutidos
(Use bullet points.)

### 4. Decisões Tomadas
(Use bullet points. Se não houver decisões claras, escreva "Nenhuma decisão formal registrada.")

### 5. Próximos Passos
(Use bullet points. Inclua responsáveis e prazos se citados. Se não houver, escreva "Nenhum próximo passo definido.")

---
Transcrição:
${transcriptRaw}`;

        const minutesPromptText = customPrompts.minutesPrompt
          ? customPrompts.minutesPrompt
              .replace(/\{\{TITULO\}\}/g, meeting.subject)
              .replace(/\{\{TRANSCRICAO\}\}/g, transcriptRaw || "")
          : defaultMinutesPrompt;

        const { text } = await generateText({
          model: aiModel,
          system: "Você é um assistente corporativo rigoroso especializado em documentação. Você DEVE formatar suas respostas utilizando Markdown (Títulos com #, listas com -, negrito com **). NUNCA gere textos em um único bloco ou parágrafo genérico.",
          prompt: minutesPromptText,
        });
        finalMinutes = text;
        await job.updateProgress(88);
        console.log(`[Worker] Ata gerada.`);

        // Salva a Ata antecipadamente no banco de dados (Smart Retry / Fail-Safe)
        await prisma.meeting.update({
          where: { id: meetingId },
          data: { minutesText: finalMinutes }
        });
      } else {
        console.log(`[Worker] Ata já existe para "${meeting.subject}". Pulando geração de texto (Smart Retry).`);
        await job.updateProgress(88);
      }

      // ── 8. Envio Automático de E-mail (se habilitado) ───────────────────────
      try {
        const emailSys = await prisma.systemSettings.findUnique({ where: { id: "global" } });
        if (emailSys?.ruleAutoSend && emailSys?.emailFromAddress) {
          console.log(`[Worker] Envio automático habilitado. Preparando e-mail...`);

          const participantEmails: string[] = (() => {
            try { return JSON.parse(meeting.participants || "[]"); } catch { return []; }
          })();

          const organizer = { email: meeting.organizerEmail, name: meeting.organizerName || meeting.organizerEmail };
          const participants = participantEmails.map(e => ({ email: e, name: e.split("@")[0] }));

          const emailBody = (emailSys.emailBodyPrompt || "{{ATA}}")
            .replace(/\{\{ATA\}\}/g, finalMinutes || "")
            .replace(/\{\{TRANSCRICAO\}\}/g, transcriptRaw || "")
            .replace(/\{\{TITULO\}\}/g, meeting.subject)
            .replace(/\{\{ORGANIZADOR\}\}/g, meeting.organizerName || meeting.organizerEmail)
            .replace(/\{\{DATA\}\}/g, meeting.startedAt.toLocaleDateString("pt-BR"))
            .replace(/\{\{PARTICIPANTES\}\}/g, participantEmails.join(", "));

          const emailSubject = (emailSys.emailSubjectPrompt || "[Ata] {{TITULO}}")
            .replace(/\{\{TITULO\}\}/g, meeting.subject);

          const distributionRules = {
            sendToOrganizerOnly: emailSys.ruleRestrictToOrgs,
            blockExternalGuests: emailSys.ruleBlockExternal,
            internalDomain: "@" + (emailSys.emailFromAddress.split("@")[1] || ""),
            bccAuditEmail: (() => {
              try { const arr = JSON.parse(emailSys.ruleBccEmails); return arr[0] || undefined; } catch { return undefined; }
            })(),
          };

          const graphClientForEmail = await getGraphClient();
          const { sendMinutesViaGraph } = await import("../lib/distribution/mailer");
          await sendMinutesViaGraph(
            graphClientForEmail,
            organizer,
            participants,
            emailBody,
            emailSubject,
            distributionRules,
            emailSys.emailFromAddress
          );
          console.log(`[Worker] E-mail enviado com sucesso para ${participants.length + 1} destinatários.`);
          await logAudit("INFO", `E-mail automático enviado para reunião "${meeting.subject}".`, meetingId);
          // Marca que o e-mail foi enviado para exibição nos cards
          await prisma.meeting.update({
            where: { id: meetingId },
            data: { emailSentAt: new Date() },
          });
        }
      } catch (emailErr: any) {
        // Falha no e-mail não deve derrubar o job inteiro — apenas loga
        console.error(`[Worker] Falha no envio de e-mail automático:`, emailErr.message);
        await logAudit("WARNING", `Falha no envio de e-mail para "${meeting.subject}": ${emailErr.message}`, meetingId);
      }

      await job.updateProgress(92);

      // ── 9. Criar KnowledgeNode no MemoryBrain ─────────────────────────────────
      const aiModel = await getActiveAIModel();
      const allExistingTags = await prisma.knowledgeTag.findMany({ select: { id: true, name: true } });

      // ─── PASSO A: Helper de Match por Palavras-Chave (código, sem IA) ─────────
      // Compara o nome retornado pela IA com tags existentes buscando palavras distintas em comum
      // Ignora stopwords comuns para não fazer matches acidentais
      const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'em', 'no', 'na', 'the', 'of', 'and']);
      const significantWords = (name: string) =>
        name.toLowerCase().split(/\s+/).filter(w => w.length >= 4 && !STOPWORDS.has(w));

      const findCanonicalTag = (aiName: string) => {
        const aiWords = significantWords(aiName);
        if (aiWords.length === 0) return null;
        // 1. Tentativa de match exato
        const exact = allExistingTags.find(t => t.name.toLowerCase() === aiName.toLowerCase());
        if (exact) return exact;
        // 2. Match por palavras significativas em comum (pelo menos 1 palavra com >= 5 letras)
        return allExistingTags.find(tag => {
          const tagWords = significantWords(tag.name);
          return tagWords.some(tw => tw.length >= 5 && aiWords.some(aw => aw.includes(tw) || tw.includes(aw)));
        }) || null;
      };

      // ─── PASSO B: Chamada IA — lê a Ata para identificar cliente e categoria ──
      // Usa generateText com instrução JSON explícita para máxima compatibilidade
      // com todos os providers (sem exigir Tool Calling ou JSON Mode nativo)
      const existingTagNames = allExistingTags.map(t => t.name).join(", ");
      const customPrompts2 = await getCustomPrompts();

      const defaultTagsPrompt = `Analise a ATA da reunião abaixo e retorne APENAS um objeto JSON válido, sem nenhum texto antes ou depois, sem blocos de código markdown.

O JSON deve ter EXATAMENTE esta estrutura:
{
  "summary": "Resumo executivo em 1 frase.",
  "clienteNome": "Nome COMPLETO do cliente/empresa externa REAL mencionado na ata (sem siglas). OBRIGATÓRIO retornar string vazia \"\" se: (1) não houver cliente externo explicitamente citado, (2) for reunião interna, (3) o único nome for da própria equipe/empresa.",
  "categoriaNome": "Categoria do assunto principal em 1 a 3 palavras (ex: Planejamento, Vendas, Suporte, Onboarding). Nunca use nomes de pessoas ou palavras genéricas como 'Reunião'.",
  "keywords": ["palavra-chave1", "palavra-chave2", "palavra-chave3"]
}

REGRAS CRÍTICAS:
- Se a reunião NÃO menciona nenhum cliente externo real → "clienteNome" DEVE ser "" (string vazia)
- Nunca invente um cliente. Só coloque um nome se ele aparecer explicitamente na ata como empresa contratante ou parceira
- "keywords" devem ser substantivos relevantes do conteúdo (máx. 5 palavras)

Título da reunião (referência): "${meeting.subject}"
Clientes já cadastrados no sistema (use o nome exato se reconhecer um deles na ata): [${existingTagNames || 'nenhum'}]

Ata:
${finalMinutes.substring(0, 3000)}`;

      const tagsPromptText = customPrompts2.tagsPrompt
        ? customPrompts2.tagsPrompt
            .replace(/\{\{TITULO\}\}/g, meeting.subject)
            .replace(/\{\{ATA\}\}/g, finalMinutes.substring(0, 3000))
            .replace(/\{\{CLIENTES_EXISTENTES\}\}/g, existingTagNames || 'nenhum')
        : defaultTagsPrompt;

      let parsed: { summary: string; clienteNome: string; categoriaNome: string; keywords: string[] };

      try {
        const { text: rawJson } = await generateText({
          model: aiModel,
          prompt: tagsPromptText,
        });

        // Parser defensivo: extrai o JSON mesmo se o modelo adicionar texto ao redor
        const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Modelo não retornou JSON válido.");
        const candidate = JSON.parse(jsonMatch[0]);

        parsed = {
          summary: typeof candidate.summary === "string" ? candidate.summary : meeting.subject,
          clienteNome: typeof candidate.clienteNome === "string" ? candidate.clienteNome : "",
          categoriaNome: typeof candidate.categoriaNome === "string" ? candidate.categoriaNome : "",
          keywords: Array.isArray(candidate.keywords)
            ? candidate.keywords.filter((k: unknown) => typeof k === "string")
            : [],
        };
      } catch (parseErr: any) {
        // Se a LLM falhar ou retornar JSON inválido, usa fallback seguro SEM criar tags espúrias
        console.warn(`[Worker] Memory Brain: parser falhou (${parseErr.message}). Usando fallback sem tags.`);
        await logAudit("WARNING", `Memory Brain usou fallback para "${meeting.subject}" — provider retornou JSON inválido: ${parseErr.message}`, meetingId);
        parsed = {
          summary: meeting.subject,
          clienteNome: "",   // NUNCA inferir cliente do título no fallback
          categoriaNome: "", // NUNCA inferir categoria do título no fallback
          keywords: [],       // NUNCA criar keywords genéricas de título
        };
      }

      const summary: string = parsed.summary || meeting.subject;
      const keywords: string[] = (parsed.keywords || [])
        .map((k: string) => k.substring(0, 40).replace(/,/g, '').trim())
        .filter(Boolean)
        .slice(0, 5);

      // ─── PASSO C: Resolução das Tags (código, não IA) ────────────────────────
      const sanitize = (s: string) => s.substring(0, 50).replace(/,/g, '').trim();

      // Tag de CLIENTE — match por palavras-chave contra o banco
      let clienteTagName = sanitize(parsed.clienteNome);
      const canonicalCliente = findCanonicalTag(clienteTagName);
      if (canonicalCliente) {
        console.log(`[Worker] Tag cliente canonicalizada: "${canonicalCliente.name}" (da IA: "${clienteTagName}")`);
        clienteTagName = canonicalCliente.name;
      } else {
        console.log(`[Worker] Tag cliente nova: "${clienteTagName}"`);
      }

      // Tag de CATEGORIA
      const categoriaNome = sanitize(parsed.categoriaNome);
      const exactCatMatch = allExistingTags.find(t =>
        t.name.toLowerCase() === categoriaNome.toLowerCase()
      );
      const categoriaTagName = exactCatMatch ? exactCatMatch.name : categoriaNome;

      // As 2 tags finais (cliente + categoria), deduplicadas
      const finalTagNames = [...new Set([clienteTagName, categoriaTagName].filter(Boolean))];
      console.log(`[Worker] Tags finais: [${finalTagNames.join(", ")}]`);

      // ─── PASSO D: Salvar no banco ────────────────────────────────────────────
      const node = await prisma.knowledgeNode.upsert({
        where: { meetingId },
        update: { title: meeting.subject, summary, keywords: JSON.stringify(keywords) },
        create: {
          meetingId,
          title: meeting.subject,
          summary,
          keywords: JSON.stringify(keywords),
          metadata: JSON.stringify({})
        }
      });

      for (const tagName of finalTagNames) {
        if (!tagName) continue;
        let tag = allExistingTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
        if (!tag) {
          tag = await prisma.knowledgeTag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName, color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)` }
          });
          allExistingTags.push({ id: tag.id, name: tag.name });
        }
        const existingRel = await prisma.knowledgeNodeTag.findFirst({
          where: { nodeId: node.id, tagId: tag.id }
        });
        if (!existingRel) {
          await prisma.knowledgeNodeTag.create({ data: { nodeId: node.id, tagId: tag.id } });
        }
      }

      // Criar arestas com nós que compartilhem keywords
      const relatedNodes = await prisma.knowledgeNode.findMany({
        where: { id: { not: node.id } },
        select: { id: true, keywords: true }
      });
      for (const related of relatedNodes) {
        const relKws: string[] = (() => { try { return JSON.parse(related.keywords); } catch { return []; } })();
        const shared = keywords.filter(k => relKws.some(rk => rk.toLowerCase() === k.toLowerCase()));
        if (shared.length > 0) {
          const exists = await prisma.knowledgeEdge.findFirst({
            where: { OR: [{ fromNodeId: node.id, toNodeId: related.id }, { fromNodeId: related.id, toNodeId: node.id }] }
          });
          if (!exists) {
            await prisma.knowledgeEdge.create({
              data: { fromNodeId: node.id, toNodeId: related.id, weight: shared.length, reason: `Tópicos em comum: ${shared.join(", ")}` }
            });
          }
        }
      }
      console.log(`[Worker] MemoryBrain atualizado. Nó: ${node.id}`);

      // ── 8. Marcar como Concluído (Apenas no Fim) ─────────────────────────────
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "DONE" }
      });

      await job.updateProgress(100);
      console.log(`[Worker] ✅ Job ${job.id} concluído: "${meeting.subject}"`);
      return { meetingId: meeting.id };

    } catch (err: any) {
      cleanup();
      await prisma.meeting.update({ where: { id: meetingId }, data: { status: "ERROR" } });
      console.error(`[Worker] Erro crítico no job ${job.id}:`, err);
      await logAudit("ERROR", `Falha no processamento da reunião "${meeting.subject}" (${meetingId}): ${err.message || String(err)}`, meetingId);
      throw err;
    }
  }, {
    connection: connection as any,
    concurrency,
  });

  syncWorker.on("completed", (job) => {
    console.log(`[Worker] ✅ Job ${job.id} finalizado com sucesso.`);
  });
  syncWorker.on("failed", (job, err) => {
    console.error(`[Worker] ❌ Job ${job?.id} falhou: ${err.message}`);
  });

  console.log(`[Worker] Motor iniciado. Fila: 'sync-meetings-queue' | Concorrência: ${concurrency}`);
}

startWorker().catch(console.error);

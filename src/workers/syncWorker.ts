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

async function logAudit(level: "INFO" | "WARNING" | "ERROR", message: string) {
  try {
    await prisma.auditLog.create({ data: { level, source: "Worker", message: message.substring(0, 1000) } });
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
function runDiarization(audioPath: string, hfToken: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const py = spawn("/opt/venv/bin/python3", ["/app/src/python/diarize.py", audioPath, hfToken], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
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

// ── Worker principal ──────────────────────────────────────────────────────────
async function startWorker() {
  let concurrency = 1;
  try {
    const sys = await (prisma as any).systemSettings?.findUnique({ where: { id: "global" } });
    if (sys?.workerConcurrency) concurrency = sys.workerConcurrency;
  } catch { /* usa default 1 */ }

  const syncWorker = new Worker("sync-meetings-queue", async (job: Job) => {
    const meetingId = job.data.meetingId || job.data.tenantId;
    if (!meetingId) throw new Error("meetingId não fornecido no Job.");

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new Error(`Reunião ${meetingId} não encontrada no banco.`);

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

      console.log(`[Worker] Diarização em andamento (Whisper + Pyannote)...`);
      const transcriptRaw = await runDiarization(audioPath, hfToken);
      await job.updateProgress(78);
      console.log(`[Worker] Diarização concluída: ${transcriptRaw.split("\n").length} segmentos.`);

      // ── 6. Limpeza dos arquivos de mídia ────────────────────────────────────
      cleanup();
      console.log(`[Worker] Arquivos de mídia deletados.`);

      // ── 7. Gerar Ata com LLM (usando transcrição REAL) ──────────────────────
      const aiModel = await getActiveAIModel();
      console.log(`[Worker] Gerando Ata com LLM...`);
      const { text: finalMinutes } = await generateText({
        model: aiModel,
        prompt: `Você é um assistente corporativo.
Abaixo está a transcrição real e diarizada de uma reunião do Microsoft Teams.
Gere uma Ata corporativa estruturada contendo:
1. Resumo Executivo
2. Tópicos Discutidos
3. Decisões Tomadas
4. Próximos Passos (Action Items) com responsáveis e prazos (se mencionados)

Transcrição:
${transcriptRaw}`,
      });
      await job.updateProgress(88);
      console.log(`[Worker] Ata gerada.`);

      // ── 8. Salvar no banco ──────────────────────────────────────────────────
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "DONE", transcriptRaw, minutesText: finalMinutes }
      });
      await job.updateProgress(92);

      // ── 9. Criar KnowledgeNode no MemoryBrain ───────────────────────────────
      try {
        const existingTagsForPrompt = await prisma.knowledgeTag.findMany({ select: { name: true } });
        const existingTagsList = existingTagsForPrompt.map(t => t.name).join(", ");
        
        const { text: metaText } = await generateText({
          model: aiModel,
          prompt: `Dado o texto de Ata abaixo, responda APENAS com JSON válido:
{"summary": "<resumo em 1 frase>", "keywords": ["kw1","kw2","kw3","kw4","kw5"]}

ATENÇÃO: Você DEVE analisar as seguintes tags já existentes no sistema e reutilizá-las no array "keywords" se o assunto for correspondente: [${existingTagsList}]. Se nenhum assunto bater com as tags existentes, crie novas.

Ata:
${finalMinutes.substring(0, 2000)}`,
        });
        const parsed = JSON.parse(metaText.match(/\{[\s\S]*\}/)?.[0] || "{}");
        const summary: string = parsed.summary || meeting.subject;
        const keywords: string[] = Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 10) : [];

        // A LLM decide a tag — busca tags existentes para reutilizar ou cria nova
        const existingTags = await prisma.knowledgeTag.findMany({ select: { id: true, name: true } });
        let tagToUse = existingTags.find(t =>
          keywords.some(k => k.toLowerCase().includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(k.toLowerCase()))
        );
        if (!tagToUse) {
          const tagName = keywords[0]?.toLowerCase().replace(/\s+/g, "-") || "geral";
          tagToUse = await prisma.knowledgeTag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName, color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)` }
          });
        }

        const node = await prisma.knowledgeNode.upsert({
          where: { meetingId },
          update: { title: meeting.subject, summary, keywords: JSON.stringify(keywords) },
          create: {
            meetingId,
            title: meeting.subject,
            summary,
            keywords: JSON.stringify(keywords),
            metadata: JSON.stringify({}),
            tags: { create: { tagId: tagToUse.id } }
          }
        });

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
      } catch (memErr) {
        console.error(`[Worker] Erro no MemoryBrain (não crítico):`, memErr);
      }

      await job.updateProgress(100);
      console.log(`[Worker] ✅ Job ${job.id} concluído: "${meeting.subject}"`);
      return { meetingId: meeting.id };

    } catch (err: any) {
      cleanup();
      await prisma.meeting.update({ where: { id: meetingId }, data: { status: "ERROR" } });
      console.error(`[Worker] Erro crítico no job ${job.id}:`, err);
      await logAudit("ERROR", `Falha no processamento da reunião "${meeting.subject}" (${meetingId}): ${err.message || String(err)}`);
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

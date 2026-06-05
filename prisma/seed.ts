import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUBJECTS = [
  "Sprint Planning Q3 — Produto",
  "Daily Standup Engineering",
  "Review Orçamento TI 2026",
  "1:1 com Gerente de Projeto",
  "Workshop Migração Cloud Azure",
  "Kick-off Cliente Petrobras",
  "Retrospectiva Sprint 14",
  "Alinhamento Marketing Digital",
  "Revisão de Arquitetura Microserviços",
  "Planejamento OKRs Trimestral",
  "Sync Time de Design UI/UX",
  "Demo para Stakeholders",
  "Treinamento Segurança da Informação",
  "Comitê de Governança de Dados",
  "Entrevista Técnica — Backend Sr",
  "Kick-off Projeto Automação RPA",
  "Review Pipeline CI/CD",
  "Reunião Comercial — Proposta Enterprise",
  "Sync DevOps + Infraestrutura",
  "Workshop de IA Generativa Interna",
];

const ORGANIZERS = [
  { email: "carlos.silva@empresa.com.br", name: "Carlos Silva" },
  { email: "ana.costa@empresa.com.br", name: "Ana Costa" },
  { email: "pedro.santos@empresa.com.br", name: "Pedro Santos" },
  { email: "maria.oliveira@empresa.com.br", name: "Maria Oliveira" },
  { email: "lucas.ferreira@empresa.com.br", name: "Lucas Ferreira" },
  { email: "admin.ti@empresa.com.br", name: "Admin TI Global" },
];

const PARTICIPANTS_POOL = [
  "carlos.silva@empresa.com.br",
  "ana.costa@empresa.com.br",
  "pedro.santos@empresa.com.br",
  "maria.oliveira@empresa.com.br",
  "lucas.ferreira@empresa.com.br",
  "julia.lima@empresa.com.br",
  "rafael.moreira@empresa.com.br",
  "isabela.rocha@empresa.com.br",
  "andre.barbosa@empresa.com.br",
  "camila.souza@empresa.com.br",
];

const STATUSES = ["PENDING", "TRANSCRIBING", "GENERATING", "DONE", "DONE", "DONE", "ERROR"];

const TAGS = [
  { name: "sprint", color: "#3b82f6" },
  { name: "orçamento", color: "#f59e0b" },
  { name: "cliente", color: "#10b981" },
  { name: "arquitetura", color: "#8b5cf6" },
  { name: "devops", color: "#ef4444" },
  { name: "design", color: "#ec4899" },
  { name: "segurança", color: "#f97316" },
  { name: "ia", color: "#06b6d4" },
  { name: "governança", color: "#6366f1" },
  { name: "comercial", color: "#84cc16" },
  { name: "rh", color: "#14b8a6" },
  { name: "cloud", color: "#a855f7" },
];

// Mapeia assuntos para tags relevantes
const SUBJECT_TAG_MAP: Record<string, string[]> = {
  "Sprint Planning Q3 — Produto": ["sprint", "devops"],
  "Daily Standup Engineering": ["sprint", "devops"],
  "Review Orçamento TI 2026": ["orçamento", "governança"],
  "1:1 com Gerente de Projeto": ["sprint", "rh"],
  "Workshop Migração Cloud Azure": ["cloud", "arquitetura", "devops"],
  "Kick-off Cliente Petrobras": ["cliente", "comercial"],
  "Retrospectiva Sprint 14": ["sprint"],
  "Alinhamento Marketing Digital": ["comercial", "design"],
  "Revisão de Arquitetura Microserviços": ["arquitetura", "devops", "cloud"],
  "Planejamento OKRs Trimestral": ["governança", "sprint"],
  "Sync Time de Design UI/UX": ["design", "sprint"],
  "Demo para Stakeholders": ["sprint", "cliente"],
  "Treinamento Segurança da Informação": ["segurança", "governança"],
  "Comitê de Governança de Dados": ["governança", "segurança"],
  "Entrevista Técnica — Backend Sr": ["rh", "arquitetura"],
  "Kick-off Projeto Automação RPA": ["ia", "devops", "cliente"],
  "Review Pipeline CI/CD": ["devops", "cloud"],
  "Reunião Comercial — Proposta Enterprise": ["comercial", "cliente"],
  "Sync DevOps + Infraestrutura": ["devops", "cloud", "arquitetura"],
  "Workshop de IA Generativa Interna": ["ia", "arquitetura"],
};

const LOG_MESSAGES = [
  { level: "INFO", source: "msal-auth", message: "Token MSAL renovado com sucesso para tenant da organização." },
  { level: "INFO", source: "graph-api", message: "Reunião capturada pela Graph API: nova gravação detectada." },
  { level: "INFO", source: "bullmq-worker", message: "Job de extração de áudio despachado para o Worker Python." },
  { level: "INFO", source: "whisper-engine", message: "Transcrição concluída em 42s — idioma detectado: pt-BR." },
  { level: "INFO", source: "llm-hub", message: "Ata gerada com sucesso pelo provider GPT-4o." },
  { level: "INFO", source: "mailer", message: "E-mail com ata enviado para 8 destinatários via Graph API." },
  { level: "WARNING", source: "llm-hub", message: "Rate limit atingido no Groq API. Fallback ativo para Ollama local." },
  { level: "WARNING", source: "graph-api", message: "Permissão OnlineMeetings.Read.All próxima de expirar (7 dias)." },
  { level: "WARNING", source: "mailer", message: "Destinatário externo bloqueado pela política DLP: user@gmail.com." },
  { level: "ERROR", source: "whisper-engine", message: "CUDA out of memory — arquivo de áudio excede 2GB. Job reenfileirado." },
  { level: "ERROR", source: "graph-api", message: "403 Forbidden: consent do admin não concedido para Mail.Send." },
  { level: "ERROR", source: "bullmq-worker", message: "Redis connection refused — verificar supervisord." },
  { level: "INFO", source: "knowledge-graph", message: "Novo nó de conhecimento criado. 3 conexões estabelecidas." },
  { level: "INFO", source: "memory-sync", message: "Grafo de memória exportado com sucesso (47 nós, 112 arestas)." },
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSubset<T>(arr: T[], min: number, max: number): T[] {
  const count = Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

async function main() {
  console.log("🧪 Iniciando Stress Test Seed (Fase 8 — Graph-First)...");

  // 1. Organização
  const org = await prisma.organization.upsert({
    where: { tenantId: "seed-tenant-001" },
    update: {},
    create: { tenantId: "seed-tenant-001", name: "Empresa Global de TI S.A." }
  });

  // 2. Tags do Knowledge Graph
  console.log("Criando Tags do Knowledge Graph...");
  const tagMap: Record<string, string> = {};
  for (const tag of TAGS) {
    const created = await prisma.knowledgeTag.upsert({
      where: { name: tag.name },
      update: { color: tag.color },
      create: { name: tag.name, color: tag.color },
    });
    tagMap[tag.name] = created.id;
  }

  // 3. Reuniões enriquecidas + Knowledge Nodes
  console.log("Injetando 100 Reuniões enriquecidas + Nós de Conhecimento...");
  const meetingIds: string[] = [];
  const nodeMap: Record<string, { id: string; tags: string[] }> = {};
  
  for (let i = 0; i < 100; i++) {
    const subject = SUBJECTS[i % SUBJECTS.length];
    const organizer = randomItem(ORGANIZERS);
    const participants = randomSubset(PARTICIPANTS_POOL, 3, 8);
    const recipients = randomSubset(participants, 2, participants.length);
    const durationMinutes = Math.floor(Math.random() * 90) + 15; // 15–105 minutos
    const startedAt = new Date(Date.now() - Math.random() * 30 * 86400000); // Últimos 30 dias
    const endedAt = new Date(startedAt.getTime() + durationMinutes * 60000);
    const status = randomItem(STATUSES);
    const autoSend = Math.random() > 0.4;

    const meeting = await prisma.meeting.create({
      data: {
        teamsId: `teams-seed-${Date.now()}-${i}`,
        organizationId: org.id,
        subject: `${subject} #${i + 1}`,
        startedAt,
        endedAt,
        durationMinutes,
        participants: JSON.stringify(participants),
        organizerEmail: organizer.email,
        organizerName: organizer.name,
        recipientsList: JSON.stringify(recipients),
        autoSendEnabled: autoSend,
        status,
        minutesText: status === "DONE" ? `# Ata: ${subject}\n\n**Duração:** ${durationMinutes}min\n**Organizador:** ${organizer.name}\n\n## Pontos discutidos\n- Revisão de entregas pendentes\n- Alinhamento de prazos\n- Próximos passos definidos\n\n## Ações\n- [ ] Atualizar backlog\n- [ ] Agendar follow-up` : null,
      }
    });

    meetingIds.push(meeting.id);

    // Cria KnowledgeNode para cada reunião
    const subjectTags = SUBJECT_TAG_MAP[subject] || ["sprint"];
    const metadata = JSON.stringify({
      duration: durationMinutes,
      participants: participants.length,
      organizer: organizer.name,
      date: startedAt.toISOString(),
      autoSend: autoSend,
    });

    const node = await prisma.knowledgeNode.create({
      data: {
        meetingId: meeting.id,
        title: `${subject} #${i + 1}`,
        summary: `Reunião de ${durationMinutes}min organizada por ${organizer.name} com ${participants.length} participantes.`,
        keywords: JSON.stringify(subjectTags),
        metadata,
      }
    });

    // Liga Node às Tags
    for (const tagName of subjectTags) {
      if (tagMap[tagName]) {
        await prisma.knowledgeNodeTag.create({
          data: { nodeId: node.id, tagId: tagMap[tagName] }
        });
      }
    }

    nodeMap[node.id] = { id: node.id, tags: subjectTags };
  }

  // 4. Knowledge Edges — Conecta nós que compartilham tags
  console.log("Construindo Arestas do Knowledge Graph (conexões entre assuntos)...");
  const nodeIds = Object.keys(nodeMap);
  let edgeCount = 0;
  
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const a = nodeMap[nodeIds[i]];
      const b = nodeMap[nodeIds[j]];
      const sharedTags = a.tags.filter(t => b.tags.includes(t));

      if (sharedTags.length > 0 && Math.random() > 0.6) { // Não conecta TODOS, só uma fração
        await prisma.knowledgeEdge.create({
          data: {
            fromNodeId: a.id,
            toNodeId: b.id,
            weight: sharedTags.length,
            reason: `Tags compartilhadas: ${sharedTags.join(", ")}`,
          }
        });
        edgeCount++;
      }
    }
  }

  // 5. Audit Logs
  console.log("Injetando 500 Logs de Auditoria...");
  for (let i = 0; i < 500; i++) {
    const log = randomItem(LOG_MESSAGES);
    await prisma.auditLog.create({
      data: {
        level: log.level,
        source: log.source,
        message: log.message,
        meetingId: meetingIds[i % meetingIds.length],
        createdAt: new Date(Date.now() - Math.random() * 7 * 86400000),
      }
    });
  }

  console.log(`✅ Seed completo!`);
  console.log(`   📊 100 reuniões enriquecidas`);
  console.log(`   🧠 100 nós de conhecimento`);
  console.log(`   🔗 ${edgeCount} arestas de grafo`);
  console.log(`   🏷️  ${TAGS.length} tags`);
  console.log(`   📋 500 logs de auditoria`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

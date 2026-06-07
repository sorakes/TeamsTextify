import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import Redis from "ioredis";
import prisma from "@/lib/db/prisma";

const connection = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

const syncQueue = new Queue("sync-meetings-queue", { connection: connection as any });

/**
 * POST /api/meetings/[id]/reprocess-granular
 * Body: { level: "TRANSCRIPTION" | "ATA" | "MEMORY_BRAIN" }
 *
 * TRANSCRIPTION → Apaga transcrição + ata + nó do Memory Brain. Refaz tudo.
 * ATA           → Mantém transcrição. Apaga ata + nó do Memory Brain. Refaz a partir da ata.
 * MEMORY_BRAIN  → Mantém transcrição + ata. Apaga apenas o KnowledgeNode. Refaz apenas o grafo.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;
    const body = await req.json().catch(() => ({}));
    const level: string = body.level ?? "MEMORY_BRAIN";

    if (!["TRANSCRIPTION", "ATA", "MEMORY_BRAIN"].includes(level)) {
      return NextResponse.json(
        { error: "Nível inválido. Use: TRANSCRIPTION, ATA ou MEMORY_BRAIN." },
        { status: 400 }
      );
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, subject: true, status: true },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });
    }

    // ── 1. Limpeza condicional do banco de dados ─────────────────────────────
    if (level === "TRANSCRIPTION") {
      // Refaz TUDO: apaga transcrição, ata e nó do Memory Brain
      await deleteKnowledgeNode(meetingId);
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { transcriptRaw: null, minutesText: null, status: "PENDING" },
      });
    } else if (level === "ATA") {
      // Mantém transcrição. Refaz Ata + Memory Brain
      await deleteKnowledgeNode(meetingId);
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { minutesText: null, status: "PENDING" },
      });
    } else if (level === "MEMORY_BRAIN") {
      // Mantém tudo. Refaz apenas o nó do grafo
      await deleteKnowledgeNode(meetingId);
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "PENDING" },
      });
    }

    // ── 2. Reenfileira com prioridade máxima ─────────────────────────────────
    const job = await syncQueue.add(
      "sync-microsoft-graph",
      { meetingId },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }
    );

    // ── 3. Audit Log ─────────────────────────────────────────────────────────
    const levelLabel: Record<string, string> = {
      TRANSCRIPTION: "Transcrição completa",
      ATA: "Ata Inteligente",
      MEMORY_BRAIN: "Memory Brain",
    };
    await prisma.auditLog.create({
      data: {
        level: "INFO",
        source: "Worker",
        message: `Reprocessamento granular (${levelLabel[level]}) solicitado para "${meeting.subject}" (${meetingId}).`,
        meetingId,
      },
    });

    return NextResponse.json({
      success: true,
      level,
      message: `Reprocessamento de "${levelLabel[level]}" iniciado para "${meeting.subject}".`,
      jobId: job.id,
    });
  } catch (error) {
    console.error("[ReprocessGranular] Erro:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// ── Helper: remove o KnowledgeNode e todas as arestas/tags relacionadas ──────
async function deleteKnowledgeNode(meetingId: string) {
  const node = await prisma.knowledgeNode.findUnique({ where: { meetingId } });
  if (!node) return;

  // Apaga arestas (de e para o nó)
  await prisma.knowledgeEdge.deleteMany({
    where: { OR: [{ fromNodeId: node.id }, { toNodeId: node.id }] },
  });

  // Apaga relacionamentos de tags
  await prisma.knowledgeNodeTag.deleteMany({ where: { nodeId: node.id } });

  // Apaga o nó em si
  await prisma.knowledgeNode.delete({ where: { id: node.id } });
}

// ── GET: retorna o nó atual do Memory Brain para a reunião ───────────────────
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;

    const node = await prisma.knowledgeNode.findUnique({
      where: { meetingId },
      include: {
        tags: { include: { tag: true } },
      },
    });

    return NextResponse.json({ node: node ?? null });
  } catch (error) {
    return NextResponse.json({ node: null, error: String(error) }, { status: 500 });
  }
}

// ── PATCH: atualiza manualmente o nó do Memory Brain (edição manual) ─────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;
    const body = await req.json();

    const { summary, keywords }: { summary?: string; keywords?: string[] } = body;

    const existingNode = await prisma.knowledgeNode.findUnique({ where: { meetingId } });
    if (!existingNode) {
      return NextResponse.json({ error: "Nó do Memory Brain não encontrado para esta reunião." }, { status: 404 });
    }

    const updatedNode = await prisma.knowledgeNode.update({
      where: { meetingId },
      data: {
        ...(summary && { summary }),
        ...(keywords && { keywords: JSON.stringify(keywords) }),
      },
    });

    // Se keywords foram alteradas, recria as tags
    if (keywords && keywords.length > 0) {
      // Apaga tags antigas
      await prisma.knowledgeNodeTag.deleteMany({ where: { nodeId: existingNode.id } });

      // Busca ou cria a primeira keyword como tag principal
      const tagName = keywords[0].toLowerCase().replace(/\s+/g, "-");
      const tag = await prisma.knowledgeTag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName, color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)` },
      });

      await prisma.knowledgeNodeTag.create({
        data: { nodeId: existingNode.id, tagId: tag.id },
      });
    }

    await prisma.auditLog.create({
      data: {
        level: "INFO",
        source: "Worker",
        message: `Memory Brain editado manualmente para a reunião (${meetingId}).`,
        meetingId,
      },
    });

    return NextResponse.json({ success: true, node: updatedNode });
  } catch (error) {
    console.error("[MemoryBrainPatch] Erro:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

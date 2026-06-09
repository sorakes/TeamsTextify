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

let _syncQueue: Queue | null = null;
function getSyncQueue() {
  if (!_syncQueue) _syncQueue = new Queue("sync-meetings-queue", { connection: connection as any });
  return _syncQueue;
}

// POST /api/meetings/[id]/reprocess — Reenfileira um meeting específico para reprocessamento
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, subject: true, status: true },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });
    }

    // Reseta o status no banco para PENDING
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: "PENDING" },
    });

    // Adiciona na fila com prioridade alta
    const job = await getSyncQueue().add(
      "sync-microsoft-graph",
      { meetingId },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }
    );

    // Loga o reprocessamento manual
    await prisma.auditLog.create({
      data: {
        level: "INFO",
        source: "Worker",
        message: `Reprocessamento manual solicitado para "${meeting.subject}" (${meetingId}).`,
        meetingId,
      },
    });

    console.log(`[Reprocess] Reunião "${meeting.subject}" reenfileirada manualmente. Job: ${job.id}`);

    return NextResponse.json({
      success: true,
      message: `Reunião "${meeting.subject}" reenviada para processamento.`,
      jobId: job.id,
    });
  } catch (error) {
    console.error("[Reprocess] Erro:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// GET /api/meetings/[id]/reprocess — Busca os logs de falha deste meeting
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;

    const logs = await prisma.auditLog.findMany({
      where: { meetingId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, level: true, message: true, createdAt: true },
    });

    return NextResponse.json({ logs });
  } catch (error) {
    return NextResponse.json({ logs: [], error: String(error) }, { status: 500 });
  }
}

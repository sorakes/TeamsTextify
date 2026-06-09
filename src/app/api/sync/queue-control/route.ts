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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body as { action: "pause" | "resume" | "retry-failed" };

    if (!["pause", "resume", "retry-failed"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    if (action === "pause") {
      await getSyncQueue().pause();
      console.log("[QueueControl] 🟡 Fila PAUSADA pelo usuário.");
      return NextResponse.json({ success: true, isPaused: true, message: "Fila pausada com sucesso." });
    }

    if (action === "resume") {
      await getSyncQueue().resume();
      console.log("[QueueControl] 🟢 Fila RETOMADA pelo usuário.");
      return NextResponse.json({ success: true, isPaused: false, message: "Fila retomada com sucesso." });
    }

    if (action === "retry-failed") {
      // Pega todos os jobs com falha e os retenta
      const failedJobs = await getSyncQueue().getFailed();
      let retried = 0;

      for (const job of failedJobs) {
        try {
          await job.retry();
          retried++;
          // Reseta o status no banco para PENDING
          const meetingId = job.data?.meetingId || job.data?.tenantId;
          if (meetingId) {
            await prisma.meeting.updateMany({
              where: { id: meetingId, status: "ERROR" },
              data: { status: "PENDING" },
            });
          }
        } catch (e) {
          console.error(`[QueueControl] Falha ao retentar job ${job.id}:`, e);
        }
      }

      console.log(`[QueueControl] 🔄 ${retried} job(s) reenfileirado(s) para retry.`);
      return NextResponse.json({
        success: true,
        message: `${retried} job(s) reenviado(s) para processamento.`,
        retried,
      });
    }
  } catch (error) {
    console.error("[QueueControl] Erro:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// GET: retorna estado atual (pausado ou não)
export async function GET() {
  try {
    const isPaused = await getSyncQueue().isPaused();
    const failedCount = await getSyncQueue().getFailedCount();
    return NextResponse.json({ isPaused, failedCount });
  } catch (error) {
    return NextResponse.json({ isPaused: false, failedCount: 0, error: String(error) }, { status: 500 });
  }
}

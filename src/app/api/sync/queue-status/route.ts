import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import Redis from "ioredis";
import prisma from "@/lib/db/prisma";

export const revalidate = 0;

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

export async function GET() {
  try {
    // Pega os jobs ativos (que o worker está processando AGORA)
    const activeJobs = await getSyncQueue().getActive();
    // Pega os próximos da fila (waiting)
    const waitingJobs = await getSyncQueue().getWaiting(0, 9);

    // Busca os dados das reuniões para os jobs ativos
    const activeMeetingIds = activeJobs
      .map(j => j.data?.meetingId || j.data?.tenantId)
      .filter(Boolean);

    const waitingMeetingIds = waitingJobs
      .map(j => j.data?.meetingId || j.data?.tenantId)
      .filter(Boolean);

    const allIds = [...new Set([...activeMeetingIds, ...waitingMeetingIds])];

    const meetingsMap: Record<string, any> = {};
    if (allIds.length > 0) {
      const meetings = await prisma.meeting.findMany({
        where: { id: { in: allIds } },
        select: { id: true, subject: true, organizerName: true, organizerEmail: true, startedAt: true }
      });
      meetings.forEach(m => { meetingsMap[m.id] = m; });
    }

    // Conta da fila
    const [waiting, active, completed, failed, isPaused] = await Promise.all([
      getSyncQueue().getWaitingCount(),
      getSyncQueue().getActiveCount(),
      getSyncQueue().getCompletedCount(),
      getSyncQueue().getFailedCount(),
      getSyncQueue().isPaused(),
    ]);

    const activeDetails = activeJobs.map(job => {
      const meetingId = job.data?.meetingId || job.data?.tenantId;
      const meeting = meetingsMap[meetingId];
      return {
        jobId: job.id,
        meetingId,
        subject: meeting?.subject || "Reunião Desconhecida",
        organizer: meeting?.organizerName || meeting?.organizerEmail?.split("@")[0] || "—",
        progress: job.progress || 0,
        state: "ACTIVE",
      };
    });

    const waitingDetails = waitingJobs.map((job, idx) => {
      const meetingId = job.data?.meetingId || job.data?.tenantId;
      const meeting = meetingsMap[meetingId];
      return {
        jobId: job.id,
        meetingId,
        subject: meeting?.subject || "Reunião Desconhecida",
        organizer: meeting?.organizerName || meeting?.organizerEmail?.split("@")[0] || "—",
        progress: 0,
        state: "WAITING",
        position: idx + 1,
      };
    });

    return NextResponse.json({
      queue: { waiting, active, completed, failed, isPaused },
      active: activeDetails,
      waiting: waitingDetails,
    });
  } catch (error) {
    console.error("Queue status error:", error);
    return NextResponse.json({
      queue: { waiting: 0, active: 0, completed: 0, failed: 0, isPaused: false },
      active: [],
      waiting: [],
      error: String(error),
    }, { status: 500 });
  }
}

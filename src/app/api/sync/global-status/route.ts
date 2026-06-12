import { NextResponse } from "next/server";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

export async function GET() {
  try {
    const raw = await redis.get("teamstextify_global_sync_progress");
    let state = raw ? JSON.parse(raw) : {
      status: "idle", scanned: 0, total: 0, currentUser: "", imported: 0, message: ""
    };

    try {
      const { Queue } = await import("bullmq");
      const q = new Queue("sync-meetings-queue", { connection: redis as any });
      const repeatables = await q.getRepeatableJobs();
      const globalJob = repeatables.find(r => r.name === "global-sync");
      if (globalJob) {
        state.nextRunAt = globalJob.next;
      }
      await q.close();
    } catch (e) {}

    return NextResponse.json(state);
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: "Erro ao ler progresso do Redis: " + error.message },
      { status: 500 }
    );
  }
}

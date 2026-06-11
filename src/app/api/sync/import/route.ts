import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import Redis from "ioredis";

export const runtime = "nodejs";

const connection = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});
const syncQueue = new Queue("sync-meetings-queue", { connection: connection as any });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const daysBack = body.daysBack || 60;

    // Dispara o job de varredura global imediatamente
    await syncQueue.add("global-sync", { daysBack }, {
      jobId: "global-sync-manual", // Evita enfileirar múltiplos manuais ao mesmo tempo
      removeOnComplete: true,
      removeOnFail: true,
    });

    return NextResponse.json({ success: true, message: "Varredura global enfileirada no backend." });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

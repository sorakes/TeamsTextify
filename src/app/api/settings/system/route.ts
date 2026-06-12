import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  try {
    let settings = await prisma.systemSettings.findUnique({ where: { id: "global" } });
    if (!settings) {
      settings = await prisma.systemSettings.create({ data: { id: "global" } });
    }
    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    console.error("GET System Settings Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();

    // Validate HuggingFace Token if provided
    if (data.huggingFaceToken && data.huggingFaceToken.trim() !== "") {
      const hfResponse = await fetch("https://huggingface.co/api/whoami-v2", {
        headers: {
          Authorization: `Bearer ${data.huggingFaceToken.trim()}`,
        },
      });

      if (!hfResponse.ok) {
        return NextResponse.json(
          { success: false, error: "Token do HuggingFace inválido ou expirado." },
          { status: 400 }
        );
      }
    }


    const settings = await prisma.systemSettings.upsert({
      where: { id: "global" },
      update: {
        workerConcurrency: data.workerConcurrency !== undefined ? data.workerConcurrency : undefined,
        huggingFaceToken: data.huggingFaceToken !== undefined ? data.huggingFaceToken : undefined,
        syncIntervalMinutes: data.syncIntervalMinutes !== undefined ? data.syncIntervalMinutes : undefined,
        ruleAutoSend: data.ruleAutoSend !== undefined ? data.ruleAutoSend : undefined,
        emailFromAddress: data.emailFromAddress !== undefined ? data.emailFromAddress : undefined,
        emailSubjectPrompt: data.emailSubjectPrompt !== undefined ? data.emailSubjectPrompt : undefined,
        emailBodyPrompt: data.emailBodyPrompt !== undefined ? data.emailBodyPrompt : undefined,
      },
      create: {
        id: "global",
        workerConcurrency: data.workerConcurrency !== undefined ? data.workerConcurrency : 1,
        huggingFaceToken: data.huggingFaceToken,
        syncIntervalMinutes: data.syncIntervalMinutes ?? null,
        ruleAutoSend: data.ruleAutoSend ?? false,
        emailFromAddress: data.emailFromAddress ?? null,
        emailSubjectPrompt: data.emailSubjectPrompt ?? null,
        emailBodyPrompt: data.emailBodyPrompt ?? null,
      }
    });


    // Sincroniza imediatamente o BullMQ
    if (data.syncIntervalMinutes !== undefined) {
      try {
        const { Queue } = await import("bullmq");
        const Redis = (await import("ioredis")).default;
        const connection = new Redis({
          host: process.env.REDIS_HOST || "127.0.0.1",
          port: parseInt(process.env.REDIS_PORT || "6379"),
        });
        const q = new Queue("sync-meetings-queue", { connection: connection as any });
        
        const repeatables = await q.getRepeatableJobs();
        for (const r of repeatables) {
          if (r.id === "global-sync-cron") {
             await q.removeRepeatableByKey(r.key);
          }
        }
        
        if (data.syncIntervalMinutes !== null && data.syncIntervalMinutes > 0) {
          await q.add("global-sync", { daysBack: 3 }, {
            repeat: { every: data.syncIntervalMinutes * 60 * 1000 },
            jobId: "global-sync-cron"
          });
        }
        await q.close();
        connection.disconnect();
      } catch (e) {
        console.error("Error updating BullMQ cron:", e);
      }
    }
    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    console.error("POST System Settings Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

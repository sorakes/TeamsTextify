import { NextResponse } from "next/server";
import { addSyncJob } from "@/lib/queue/bullmq";
import prisma from "@/lib/db/prisma";

export async function POST(req: Request) {
  try {
    const sys = await prisma.systemSettings.findUnique({ where: { id: "global" }});
    
    // Na vida real, usaríamos o tenantId do Entra. Aqui vamos mockar.
    const tenantId = sys?.entraTenantId || "demo-tenant-id";

    // Adiciona o trabalho na Fila do Redis (BullMQ)
    const job = await addSyncJob(tenantId);

    return NextResponse.json({ 
      success: true, 
      message: "Processo de sincronização enfileirado com sucesso!",
      jobId: job.id
    });
  } catch (error) {
    console.error("Erro ao enfileirar sync:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

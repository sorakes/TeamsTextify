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
      },
      create: {
        id: "global",
        workerConcurrency: data.workerConcurrency !== undefined ? data.workerConcurrency : 1,
        huggingFaceToken: data.huggingFaceToken,
        syncIntervalMinutes: data.syncIntervalMinutes ?? null,
      }
    });
    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    console.error("POST System Settings Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

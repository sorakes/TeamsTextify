import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "15"), 50);
    const since = searchParams.get("since"); // ISO timestamp para buscar apenas novos logs

    const where = since ? { createdAt: { gt: new Date(since) } } : {};

    const logs = await prisma.auditLog.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, level: true, source: true, message: true, createdAt: true },
    });

    return NextResponse.json({ logs, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ logs: [], error: String(error) }, { status: 500 });
  }
}

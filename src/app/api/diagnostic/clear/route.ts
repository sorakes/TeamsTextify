import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  try {
    await prisma.knowledgeEdge.deleteMany();
    await prisma.knowledgeNodeTag.deleteMany();
    await prisma.knowledgeTag.deleteMany();
    await prisma.knowledgeNode.deleteMany();
    await prisma.meeting.deleteMany();
    await prisma.auditLog.deleteMany();
    
    return NextResponse.json({ success: true, message: "Banco de dados limpo!" });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

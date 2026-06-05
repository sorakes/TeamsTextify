import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  try {
    const nodes = await prisma.knowledgeNode.findMany({
      include: {
        tags: { include: { tag: true } },
        meeting: { select: { subject: true, status: true, organizerName: true, durationMinutes: true, startedAt: true, minutesText: true } },
      }
    });

    const edges = await prisma.knowledgeEdge.findMany();
    const tags = await prisma.knowledgeTag.findMany();

    // Formato portável de exportação (compatível com Obsidian/Notion/APIs externas)
    const exportData = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      engine: "TeamsTextify Memory Brain",
      graph: {
        nodes: nodes.map(n => ({
          id: n.id,
          title: n.title,
          summary: n.summary,
          keywords: JSON.parse(n.keywords),
          metadata: JSON.parse(n.metadata),
          tags: n.tags.map(t => t.tag.name),
          meeting: n.meeting ? {
            subject: n.meeting.subject,
            status: n.meeting.status,
            organizer: n.meeting.organizerName,
            duration: n.meeting.durationMinutes,
            date: n.meeting.startedAt?.toISOString(),
            minutesText: n.meeting.minutesText,
          } : null,
        })),
        edges: edges.map(e => ({
          from: e.fromNodeId,
          to: e.toNodeId,
          weight: e.weight,
          reason: e.reason,
        })),
        tags: tags.map(t => ({ name: t.name, color: t.color })),
      },
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        totalTags: tags.length,
      }
    };

    return NextResponse.json(exportData);
  } catch (error) {
    console.error("Memory Export Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

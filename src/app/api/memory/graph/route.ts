import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const revalidate = 0;

export async function GET() {
  try {
    const nodes = await prisma.knowledgeNode.findMany({
      include: {
        tags: { include: { tag: true } },
        meeting: {
          select: {
            id: true,
            subject: true,
            status: true,
            organizerName: true,
            organizerEmail: true,
            durationMinutes: true,
            startedAt: true,
            endedAt: true,
            participants: true,
            recipientsList: true,
            autoSendEnabled: true,
            minutesText: true,
          }
        },
      }
    });

    const edges = await prisma.knowledgeEdge.findMany();

    const graphNodes = nodes.map((n: any) => {
      const primaryTag = n.tags[0]?.tag;
      const participantsList: string[] = (() => { try { return JSON.parse(n.meeting?.participants || "[]"); } catch { return []; } })();
      const recipientsList: string[] = (() => { try { return JSON.parse(n.meeting?.recipientsList || "[]"); } catch { return []; } })();

      return {
        id: n.id,
        meetingId: n.meeting?.id || "",
        title: n.title,
        summary: n.summary,
        keywords: (() => { try { return JSON.parse(n.keywords); } catch { return []; } })(),
        color: primaryTag?.color || "#3b82f6",
        tagName: primaryTag?.name || "geral",
        tags: n.tags.map((t: any) => ({ name: t.tag.name, color: t.tag.color })),
        meetingStatus: n.meeting?.status || "UNKNOWN",
        organizer: n.meeting?.organizerName || "",
        organizerEmail: n.meeting?.organizerEmail || "",
        duration: n.meeting?.durationMinutes || 0,
        date: n.meeting?.startedAt?.toISOString() || "",
        endDate: n.meeting?.endedAt?.toISOString() || "",
        participants: participantsList,
        recipients: recipientsList,
        autoSendEnabled: n.meeting?.autoSendEnabled || false,
        minutesText: n.meeting?.minutesText || null,
        // Lógica real: se tem minutesText + autoSend + status DONE = foi enviado
        emailSent: n.meeting?.status === "DONE" && n.meeting?.autoSendEnabled === true,
        val: (n.tags.length || 1) * 2,
      };
    });

    const graphLinks = edges.map((e: any) => ({
      source: e.fromNodeId,
      target: e.toNodeId,
      weight: e.weight,
      reason: e.reason,
    }));

    const tags = await prisma.knowledgeTag.findMany({
      include: { _count: { select: { nodes: true } } }
    });

    const stats = {
      totalNodes: graphNodes.length,
      totalEdges: graphLinks.length,
      totalTags: tags.length,
      tagDistribution: tags.map((t: any) => ({ name: t.name, color: t.color, count: t._count.nodes })),
    };

    return NextResponse.json({ nodes: graphNodes, links: graphLinks, stats });
  } catch (error) {
    console.error("Memory Graph Error:", error);
    return NextResponse.json({ nodes: [], links: [], stats: {}, error: String(error) }, { status: 500 });
  }
}

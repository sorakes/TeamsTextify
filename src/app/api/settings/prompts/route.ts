import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  try {
    const org = await prisma.organization.findFirst();
    if (!org) return NextResponse.json({ minutesPrompt: "", tagsPrompt: "" });

    const settings = await prisma.orgSettings.findUnique({ where: { organizationId: org.id } });
    return NextResponse.json({
      minutesPrompt: settings?.minutesPrompt ?? "",
      tagsPrompt: settings?.tagsPrompt ?? "",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { minutesPrompt, tagsPrompt } = await req.json();

    const org = await prisma.organization.findFirst();
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    await prisma.orgSettings.upsert({
      where: { organizationId: org.id },
      update: {
        ...(minutesPrompt !== undefined && { minutesPrompt }),
        ...(tagsPrompt !== undefined && { tagsPrompt }),
      },
      create: {
        organizationId: org.id,
        minutesPrompt: minutesPrompt ?? null,
        tagsPrompt: tagsPrompt ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

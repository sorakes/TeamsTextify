import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { sendMinutesViaGraph } from "@/lib/distribution/mailer";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";

async function getGraphClient(): Promise<Client> {
  const system = await prisma.systemSettings.findUnique({ where: { id: "global" } });
  const clientId = system?.entraClientId || process.env.AZURE_CLIENT_ID;
  const tenantId = system?.entraTenantId || process.env.AZURE_TENANT_ID;
  let clientSecret = process.env.AZURE_CLIENT_SECRET;

  const { decrypt } = await import("@/lib/encryption");
  if (system?.entraClientSecret) {
    try { clientSecret = decrypt(system.entraClientSecret); } catch {}
  }

  if (!clientId || !tenantId || !clientSecret) {
    throw new Error("Credenciais do Entra ID não configuradas.");
  }

  const cca = new ConfidentialClientApplication({
    auth: { clientId, clientSecret, authority: `https://login.microsoftonline.com/${tenantId}` }
  });

  const authResult = await cca.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  if (!authResult?.accessToken) throw new Error("Falha ao obter token MSAL.");

  return Client.init({
    authProvider: (done) => done(null, authResult.accessToken),
  });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) {
      return NextResponse.json({ success: false, error: "Reunião não encontrada." }, { status: 404 });
    }

    if (!meeting.minutesText) {
      return NextResponse.json({ success: false, error: "Esta reunião ainda não possui ata gerada." }, { status: 400 });
    }

    const sys = await prisma.systemSettings.findUnique({ where: { id: "global" } });
    if (!sys?.emailFromAddress) {
      return NextResponse.json({ success: false, error: "E-mail remetente não configurado. Acesse Configurações > E-mail de Saída." }, { status: 400 });
    }

    const participantEmails: string[] = (() => {
      try { return JSON.parse(meeting.participants || "[]"); } catch { return []; }
    })();

    const organizer = { email: meeting.organizerEmail, name: meeting.organizerName || meeting.organizerEmail };
    const participants = participantEmails.map(e => ({ email: e, name: e.split("@")[0] }));

    const emailBody = (sys.emailBodyPrompt || "{{ATA}}")
      .replace(/\{\{ATA\}\}/g, meeting.minutesText || "")
      .replace(/\{\{TRANSCRICAO\}\}/g, meeting.transcriptRaw || "")
      .replace(/\{\{TITULO\}\}/g, meeting.subject)
      .replace(/\{\{ORGANIZADOR\}\}/g, meeting.organizerName || meeting.organizerEmail)
      .replace(/\{\{DATA\}\}/g, meeting.startedAt.toLocaleDateString("pt-BR"))
      .replace(/\{\{PARTICIPANTES\}\}/g, participantEmails.join(", "));

    const emailSubject = (sys.emailSubjectPrompt || "[Ata] {{TITULO}}")
      .replace(/\{\{TITULO\}\}/g, meeting.subject);

    const distributionRules = {
      sendToOrganizerOnly: sys.ruleRestrictToOrgs,
      blockExternalGuests: sys.ruleBlockExternal,
      internalDomain: "@" + (sys.emailFromAddress.split("@")[1] || ""),
      bccAuditEmail: (() => {
        try { const arr = JSON.parse(sys.ruleBccEmails); return arr[0] || undefined; } catch { return undefined; }
      })(),
    };

    const graphClient = await getGraphClient();
    const result = await sendMinutesViaGraph(
      graphClient,
      organizer,
      participants,
      emailBody,
      emailSubject,
      distributionRules,
      sys.emailFromAddress
    );

    // Registrar no AuditLog e gravar timestamp de envio no meeting
    await prisma.auditLog.create({
      data: {
        level: "INFO",
        source: "email-manual",
        message: `E-mail reenviado manualmente para "${meeting.subject}" — ${result.count} destinatário(s).`,
        meetingId,
      }
    });

    await prisma.meeting.update({
      where: { id: meetingId },
      data: { emailSentAt: new Date() },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    const { id: meetingId } = await params;
    await prisma.auditLog.create({
      data: {
        level: "ERROR",
        source: "email-manual",
        message: `Falha no reenvio manual de e-mail: ${error.message}`,
        meetingId,
      }
    }).catch(() => {});
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// GET: retorna histórico de e-mails enviados para esta reunião
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;

    const logs = await prisma.auditLog.findMany({
      where: {
        meetingId,
        source: { in: ["email-manual", "Worker"] },
        message: { contains: "mail" },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, logs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

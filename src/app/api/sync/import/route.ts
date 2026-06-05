import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import { addSyncJob } from "@/lib/queue/bullmq";
import { decrypt } from "@/lib/encryption";
import prisma from "@/lib/db/prisma";

export const runtime = "nodejs";

function sseMsg(event: string, data: object): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const { daysBack = 60 } = await request.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        controller.enqueue(encoder.encode(sseMsg(event, data)));
      };

      try {
        // 1. Credenciais
        const system = await prisma.systemSettings.findUnique({ where: { id: "global" } });
        const clientId = system?.entraClientId || process.env.AZURE_CLIENT_ID;
        const tenantId = system?.entraTenantId || process.env.AZURE_TENANT_ID;
        let clientSecret = process.env.AZURE_CLIENT_SECRET;

        if (system?.entraClientSecret) {
          try { clientSecret = decrypt(system.entraClientSecret); } catch {}
        }

        if (!clientId || !tenantId || !clientSecret) {
          send("error", { message: "Credenciais do Entra ID não configuradas." });
          controller.close();
          return;
        }

        // 2. Auth MSAL
        const cca = new ConfidentialClientApplication({
          auth: { clientId, clientSecret, authority: `https://login.microsoftonline.com/${tenantId}` }
        });
        const authResult = await cca.acquireTokenByClientCredential({
          scopes: ["https://graph.microsoft.com/.default"],
        });

        if (!authResult?.accessToken) {
          send("error", { message: "Falha ao obter token MSAL." });
          controller.close();
          return;
        }

        // 3. MS Graph Client
        const client = Client.init({
          authProvider: (done) => done(null, authResult.accessToken),
        });

        // 4. Data limite
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - daysBack);
        const dateFilter = dateLimit.toISOString();

        // 5. Buscar todos os usuários (paginado)
        let users: any[] = [];
        let nextLink: string | null = '/users?$select=id,userPrincipalName,mail,displayName';
        while (nextLink) {
          const usersResponse = await client.api(nextLink).get();
          if (usersResponse.value) users.push(...usersResponse.value);
          nextLink = usersResponse['@odata.nextLink'] || null;
        }

        const totalUsers = users.length;
        send("start", { totalUsers });

        const org = await prisma.organization.findFirst();
        if (!org) {
          send("error", { message: "Nenhuma organização encontrada no banco." });
          controller.close();
          return;
        }

        let totalImported = 0;
        let totalDuplicates = 0;
        let usersScanned = 0;

        // 6. Varredura serial com progresso
        for (const user of users) {
          const email = user.mail || user.userPrincipalName;
          if (!email) continue;

          usersScanned++;
          send("progress", {
            scanned: usersScanned,
            total: totalUsers,
            currentUser: email,
            imported: totalImported,
          });

          try {
            const eventsResponse = await client
              .api(`/users/${user.id}/events`)
              .filter(`start/dateTime ge '${dateFilter}'`)
              .select("id,iCalUId,subject,start,end,attendees,organizer,isOnlineMeeting,onlineMeeting")
              .orderby("start/dateTime desc")
              .top(50)
              .get();

            const events = eventsResponse.value || [];

            for (const ev of events) {
              if (!ev.isOnlineMeeting) continue;

              const globalMeetingId = ev.iCalUId || ev.id;
              const existing = await prisma.meeting.findUnique({ where: { teamsId: globalMeetingId } });
              if (existing) { totalDuplicates++; continue; }

              const participants = ev.attendees?.map((a: any) => a.emailAddress?.address).filter(Boolean) || [];
              const newMeeting = await prisma.meeting.create({
                data: {
                  teamsId: globalMeetingId,
                  organizationId: org.id,
                  subject: ev.subject || "Reunião Sem Título",
                  startedAt: ev.start?.dateTime ? new Date(ev.start.dateTime) : new Date(),
                  endedAt: ev.end?.dateTime ? new Date(ev.end.dateTime) : new Date(),
                  participants: JSON.stringify(participants),
                  organizerEmail: ev.organizer?.emailAddress?.address || email,
                  organizerName: ev.organizer?.emailAddress?.name || user.displayName || "Desconhecido",
                  joinUrl: ev.onlineMeeting?.joinUrl || null,
                  ownerId: user.id || null,
                  status: "PENDING",
                },
              });
              await addSyncJob(newMeeting.id);
              totalImported++;
            }
          } catch {
            // conta sem mailbox, ignora
          }
        }

        send("done", {
          totalUsers,
          usersScanned,
          imported: totalImported,
          duplicates: totalDuplicates,
        });
      } catch (err: any) {
        send("error", { message: err.message || "Erro inesperado." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

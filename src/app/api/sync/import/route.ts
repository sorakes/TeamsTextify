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
            const possiblePaths = [
              "root:/Documents/Recordings:/children",
              "root:/Documentos/Recordings:/children",
              "root:/Recordings:/children",
              "root:/Gravações:/children"
            ];

            let foundRecordingsFolder = false;

            for (const path of possiblePaths) {
              if (foundRecordingsFolder) break;

              const driveItemsResponse = await client
                .api(`/users/${user.id}/drive/${path}`)
                .select("id,name,createdDateTime,lastModifiedDateTime,file,audio,video,webUrl")
                .get()
                .catch(() => null);

              if (driveItemsResponse?.value) {
                foundRecordingsFolder = true; // Achou a pasta certa, não precisa testar outras

                const mp4s = driveItemsResponse.value.filter((i: any) => i.name?.toLowerCase().endsWith(".mp4"));

                for (const mp4 of mp4s) {
                  const fileDate = mp4.createdDateTime || mp4.lastModifiedDateTime;
                  if (!fileDate || new Date(fileDate) < dateLimit) continue;

                  const existing = await prisma.meeting.findUnique({ where: { teamsId: mp4.id } });
                  if (existing) { totalDuplicates++; continue; }

                  // 1. Duração: Microsoft Graph retorna em milissegundos
                  let durationMinutes = 0;
                  if (mp4.video?.duration) {
                    durationMinutes = Math.round(mp4.video.duration / 60000);
                  } else if (mp4.audio?.duration) {
                    durationMinutes = Math.round(mp4.audio.duration / 60000);
                  }

                  // 2. Participantes: Extrair das permissões de compartilhamento
                  let participantsArr: string[] = [];
                  try {
                    const permissionsResponse = await client
                      .api(`/users/${user.id}/drive/items/${mp4.id}/permissions`)
                      .get();
                      
                    if (permissionsResponse?.value) {
                      permissionsResponse.value.forEach((perm: any) => {
                        // Permissão pode ter grantedTo ou grantedToV2
                        const grantedTo = perm.grantedToV2 || perm.grantedTo;
                        if (grantedTo?.user?.email) {
                          participantsArr.push(grantedTo.user.email);
                        }
                      });
                    }
                  } catch (err) {
                    console.error("Erro ao buscar permissões do item:", err);
                  }
                  
                  // Deduplicar e limpar lista de participantes
                  participantsArr = [...new Set(participantsArr.filter(Boolean))];

                  const newMeeting = await prisma.meeting.create({
                    data: {
                      teamsId: mp4.id,
                      organizationId: org.id,
                      subject: mp4.name?.replace(".mp4", "") || "Gravação Sem Título",
                      startedAt: new Date(fileDate),
                      endedAt: new Date(fileDate),
                      durationMinutes: durationMinutes,
                      participants: JSON.stringify(participantsArr),
                      organizerEmail: email,
                      organizerName: user.displayName || "Desconhecido",
                      joinUrl: mp4.webUrl || `/users/${user.id}/drive/items/${mp4.id}`,
                      ownerId: user.id || null,
                      status: "PENDING",
                    },
                  });
                  await addSyncJob(newMeeting.id);
                  totalImported++;
                }
              }
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

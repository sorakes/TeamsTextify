import { Client } from '@microsoft/microsoft-graph-client';

interface Participant {
  email: string;
  name: string;
}

interface DistributionRules {
  sendToOrganizerOnly: boolean;
  blockExternalGuests: boolean;
  internalDomain: string; // Exemplo: '@suaempresa.com.br'
  bccAuditEmail?: string; // Caixa invisível de compliance
}

export async function sendMinutesViaGraph(
  graphClient: Client,
  organizer: Participant,
  participants: Participant[],
  markdownContent: string,
  subject: string,
  rules: DistributionRules,
  fromEmail: string // O email oficial da conta de serviço
) {
  let recipients: string[] = [];

  // Regra 1: Apenas Dono
  if (rules.sendToOrganizerOnly) {
    recipients.push(organizer.email);
  } else {
    recipients.push(organizer.email); // Dono sempre recebe

    // Regra 2: Filtro Anti-Vazamento (Bloquear Externos)
    for (const p of participants) {
      if (rules.blockExternalGuests && !p.email.toLowerCase().endsWith(rules.internalDomain.toLowerCase())) {
        console.log(`[Compliance] Bloqueando envio da ata para convidado externo: ${p.email}`);
        continue; // Pula esta pessoa
      }
      recipients.push(p.email);
    }
  }

  // Deduplicar emails (caso a pessoa esteja na lista duas vezes)
  recipients = [...new Set(recipients)].filter(e => e.trim().length > 0);

  // Mapear para o formato estrito da Microsoft Graph
  const toRecipients = recipients.map(email => ({
    emailAddress: { address: email }
  }));

  // Regra 3: Cópia Oculta (BCC) Obrigatória para Auditoria
  const bccRecipients = [];
  if (rules.bccAuditEmail) {
    bccRecipients.push({
      emailAddress: { address: rules.bccAuditEmail }
    });
  }

  // Converter markdown simples para HTML para renderizar no Outlook
  const htmlContent = markdownContent.replace(/\n/g, '<br/>');

  const message = {
    subject: `[Ata Automática] ${subject}`,
    body: {
      contentType: "HTML",
      content: `<html><body style="font-family: sans-serif; padding: 20px;">${htmlContent}</body></html>`
    },
    toRecipients: toRecipients,
    bccRecipients: bccRecipients
  };

  // Disparo Atômico
  try {
    await graphClient.api(`/users/${fromEmail}/sendMail`).post({
      message: message,
      saveToSentItems: true
    });
    console.log(`[Distribution] Ata de ${subject} disparada com sucesso para ${recipients.length} pessoas.`);
    return { success: true, count: recipients.length };
  } catch (error: any) {
    console.error(`[Distribution Error] MS Graph rejeitou o envio:`, error);
    throw error;
  }
}

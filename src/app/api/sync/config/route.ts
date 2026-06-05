import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { ConfidentialClientApplication } from "@azure/msal-node";

export const revalidate = 0;

export async function GET() {
  try {
    const config = await prisma.systemSettings.findUnique({
      where: { id: "global" }
    });

    if (!config) {
      return NextResponse.json({
        hasConfig: false,
        tenantId: "",
        clientId: "",
        hasSecret: false
      });
    }

    return NextResponse.json({
      hasConfig: true,
      tenantId: config.entraTenantId || "",
      clientId: config.entraClientId || "",
      hasSecret: !!config.entraClientSecret
    });
  } catch (error) {
    console.error("Erro ao buscar config do Sync API:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tenantId, clientId, clientSecret } = body;

    if (!tenantId || !clientId || !clientSecret) {
      return NextResponse.json({ success: false, error: "Todos os campos (Tenant ID, Client ID e Client Secret) são obrigatórios." }, { status: 400 });
    }

    // 1. Testa a conexão com o Azure AD via MSAL
    try {
      const msalConfig = {
        auth: {
          clientId: clientId,
          authority: `https://login.microsoftonline.com/${tenantId}`,
          clientSecret: clientSecret,
        }
      };

      const cca = new ConfidentialClientApplication(msalConfig);
      
      // Tenta pegar um token para a própria Graph API
      await cca.acquireTokenByClientCredential({
        scopes: ["https://graph.microsoft.com/.default"]
      });
      
      // Se passou daqui, a conexão está OK!
    } catch (authError: any) {
      console.error("MSAL Auth Error:", authError);
      return NextResponse.json({ 
        success: false, 
        error: "Falha na autenticação com o Microsoft Entra ID. Verifique suas credenciais." 
      }, { status: 401 });
    }

    // 2. Se a conexão foi bem-sucedida, encriptamos o secret e salvamos
    const encryptedSecret = encrypt(clientSecret);

    await prisma.systemSettings.upsert({
      where: { id: "global" },
      update: {
        entraTenantId: tenantId,
        entraClientId: clientId,
        entraClientSecret: encryptedSecret,
      },
      create: {
        id: "global",
        entraTenantId: tenantId,
        entraClientId: clientId,
        entraClientSecret: encryptedSecret,
      }
    });

    return NextResponse.json({ success: true, message: "Conexão bem-sucedida. Credenciais salvas com segurança." });
  } catch (error) {
    console.error("Erro ao salvar config:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

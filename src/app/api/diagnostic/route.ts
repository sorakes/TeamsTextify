import { NextResponse } from 'next/server';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import "isomorphic-fetch";

export async function GET() {
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const tenantId = process.env.AZURE_TENANT_ID;

  const results = {
    envVars: {
      status: (clientId && clientSecret && tenantId) ? 'OK' : 'ERROR',
      message: (clientId && clientSecret && tenantId) ? 'Variáveis .env carregadas.' : 'Ausência de variáveis no .env (AZURE_CLIENT_ID, etc).'
    },
    msalToken: { status: 'PENDING', message: '' },
    graphApiAccess: { status: 'PENDING', message: '' }
  };

  if (results.envVars.status === 'ERROR') {
    return NextResponse.json(results);
  }

  // 1. Tentar Adquirir Token MSAL
  const cca = new ConfidentialClientApplication({
    auth: {
      clientId: clientId as string,
      clientSecret: clientSecret as string,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    }
  });

  let token = '';
  try {
    const authResult = await cca.acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"],
    });
    if (authResult?.accessToken) {
      token = authResult.accessToken;
      results.msalToken = { status: 'OK', message: 'Token de serviço gerado com sucesso.' };
    } else {
      throw new Error("Token nulo retornado.");
    }
  } catch (error: any) {
    results.msalToken = { status: 'ERROR', message: `MSAL Falhou: Verifique se o Tenant ID e Secret estão corretos.` };
    return NextResponse.json(results);
  }

  // 2. Tentar acessar a Graph API com o Token
  const client = Client.init({
    authProvider: (done) => done(null, token),
  });

  try {
    // Usamos um endpoint genérico "users" que exige permissão de Application.
    await client.api('/users').top(1).get();
    results.graphApiAccess = { status: 'OK', message: 'Leitura de Diretório / Usuários permitida!' };
  } catch (error: any) {
    if (error.statusCode === 403) {
      results.graphApiAccess = { 
        status: 'ERROR', 
        message: `ERRO 403 FORBIDDEN: O App autenticou no Azure, mas não tem permissão para ler dados. Vá no Entra ID -> App Registrations -> API Permissions -> Adicione 'User.Read.All' e 'OnlineMeetings.Read.All' (Application) e clique em 'Grant Admin Consent'.` 
      };
    } else {
      results.graphApiAccess = { status: 'ERROR', message: `Erro de API desconhecido: ${error.message}` };
    }
  }

  return NextResponse.json(results);
}

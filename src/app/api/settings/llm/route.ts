import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const revalidate = 0;

async function getOrCreateOrg() {
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: {
        tenantId: "default-tenant",
        name: "My Organization",
      }
    });
  }
  return org;
}

export async function GET() {
  try {
    const org = await getOrCreateOrg();
    const config = await prisma.orgSettings.findUnique({
      where: { organizationId: org.id }
    });

    if (!config) {
      return NextResponse.json({
        activeProvider: "openai",
        configs: {}
      });
    }

    let parsedConfigs: Record<string, any> = {};
    try {
      if (config.llmConfigs) {
        parsedConfigs = JSON.parse(config.llmConfigs);
      }
    } catch (e) {}

    // Mascarar as chaves de API antes de enviar para o frontend
    const safeConfigs: Record<string, any> = {};
    Object.keys(parsedConfigs).forEach(prov => {
      const p = parsedConfigs[prov];
      safeConfigs[prov] = {
        modelName: p.modelName,
        baseUrl: p.baseUrl,
        hasKey: !!p.apiKey 
      };
    });

    return NextResponse.json({
      activeProvider: config.activeLlmProvider,
      configs: safeConfigs
    });
  } catch (error) {
    console.error("Erro ao buscar config LLM:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, provider, apiKey, baseUrl, modelName } = body;

    const org = await getOrCreateOrg();
    let existingConfig = await prisma.orgSettings.findUnique({ where: { organizationId: org.id } });
    
    let currentConfigs: Record<string, any> = {};
    try {
      if (existingConfig?.llmConfigs) {
        currentConfigs = JSON.parse(existingConfig.llmConfigs);
      }
    } catch (e) {}

    // Ação 1: Definir apenas qual é o motor ativo (não altera as chaves)
    if (action === "set_active") {
      if (!provider) return NextResponse.json({ success: false, error: "Provider não informado." }, { status: 400 });
      
      await prisma.orgSettings.upsert({
        where: { organizationId: org.id },
        update: { activeLlmProvider: provider },
        create: {
          organizationId: org.id,
          activeLlmProvider: provider,
          llmConfigs: "{}"
        }
      });
      return NextResponse.json({ success: true, message: `Provedor ${provider} ativado com sucesso!` });
    }

    // Ação 2: Salvar e Testar Configuração de UM motor específico
    if (action === "save_config") {
      if (!provider || !modelName) {
        return NextResponse.json({ success: false, error: "Provedor e Modelo são obrigatórios." }, { status: 400 });
      }

      // Se a API Key vier em branco mas já existir uma no banco, reaproveita a do banco
      let effectiveApiKey = apiKey;
      if (!effectiveApiKey && currentConfigs[provider]?.apiKey) {
        effectiveApiKey = decrypt(currentConfigs[provider].apiKey);
      }

      // Alguns provedores (Ollama) não exigem API Key
      if (!effectiveApiKey && provider !== "ollama") {
        return NextResponse.json({ success: false, error: "API Key é obrigatória para este provedor." }, { status: 400 });
      }

      // 1. Testa a conexão usando o Vercel AI SDK
      try {
        let aiModel;

        if (provider === "gemini") {
          const google = createGoogleGenerativeAI({ apiKey: effectiveApiKey });
          aiModel = google(modelName);
        } else if (provider === "openai") {
          const openai = createOpenAI({ apiKey: effectiveApiKey });
          aiModel = openai(modelName);
        } else if (provider === "groq") {
          const groq = createOpenAI({ 
            apiKey: effectiveApiKey, 
            baseURL: baseUrl || "https://api.groq.com/openai/v1" 
          });
          aiModel = groq(modelName);
        } else if (provider === "openrouter") {
          const openrouter = createOpenAI({ 
            apiKey: effectiveApiKey, 
            baseURL: baseUrl || "https://openrouter.ai/api/v1" 
          });
          aiModel = openrouter(modelName);
        } else if (provider === "ollama") {
          const ollama = createOpenAI({ 
            apiKey: effectiveApiKey || "ollama", 
            baseURL: baseUrl || "http://127.0.0.1:11434/v1" 
          });
          aiModel = ollama(modelName);
        } else {
          return NextResponse.json({ success: false, error: "Provedor não suportado." }, { status: 400 });
        }

        // Dispara o ping real para a API
        const { text } = await generateText({
          model: aiModel,
          prompt: "Respond exactly with the word 'OK' and nothing else."
        });

        console.log(`[LLM Test] Provider ${provider} respondeu: ${text}`);
      } catch (aiError: any) {
        console.error("Erro na conexão com LLM:", aiError);
        return NextResponse.json({ 
          success: false, 
          error: `Falha na conexão com ${provider.toUpperCase()}: ${aiError.message || "Verifique sua API Key e rede."}` 
        }, { status: 401 });
      }

      // 2. Conexão bem sucedida. Atualiza o objeto JSON apenas para este provider.
      const encryptedKey = effectiveApiKey ? encrypt(effectiveApiKey) : "";

      currentConfigs[provider] = {
        modelName,
        baseUrl: baseUrl || "",
        ...(apiKey ? { apiKey: encryptedKey } : (currentConfigs[provider]?.apiKey ? { apiKey: currentConfigs[provider].apiKey } : {}))
      };

      await prisma.orgSettings.upsert({
        where: { organizationId: org.id },
        update: {
          llmConfigs: JSON.stringify(currentConfigs)
        },
        create: {
          organizationId: org.id,
          activeLlmProvider: provider,
          llmConfigs: JSON.stringify(currentConfigs)
        }
      });

      return NextResponse.json({ success: true, message: "Configuração salva com sucesso!" });
    }

    return NextResponse.json({ success: false, error: "Ação inválida." }, { status: 400 });

  } catch (error) {
    console.error("Erro ao salvar config LLM:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

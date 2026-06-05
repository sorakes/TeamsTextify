import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const revalidate = 0;

export async function GET() {
  try {
    const config = await prisma.systemSettings.findUnique({
      where: { id: "global" }
    });

    if (!config) {
      return NextResponse.json({
        ruleAutoSend: false,
        ruleBlockExternal: true,
        ruleMinDuration: 5,
        ruleMaxDuration: 240,
        ruleBccEmails: "[]",
        ruleExcludedEmails: "[]",
        ruleBlockedDomains: "[]",
        ruleIgnoreKeywords: "[]",
        ruleMandatoryTags: "[]",
        ruleRestrictToOrgs: false,
        ruleObfuscateSensitive: true,
        ruleSummaryLanguage: "pt-BR"
      });
    }

    return NextResponse.json({
      ruleAutoSend: config.ruleAutoSend,
      ruleBlockExternal: config.ruleBlockExternal,
      ruleMinDuration: config.ruleMinDuration,
      ruleMaxDuration: config.ruleMaxDuration,
      ruleBccEmails: config.ruleBccEmails,
      ruleExcludedEmails: config.ruleExcludedEmails,
      ruleBlockedDomains: config.ruleBlockedDomains,
      ruleIgnoreKeywords: config.ruleIgnoreKeywords,
      ruleMandatoryTags: config.ruleMandatoryTags,
      ruleRestrictToOrgs: config.ruleRestrictToOrgs,
      ruleObfuscateSensitive: config.ruleObfuscateSensitive,
      ruleSummaryLanguage: config.ruleSummaryLanguage
    });
  } catch (error) {
    console.error("Erro ao buscar regras:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Assegura que arrays JSON sejam passados como strings válidas se não forem
    const sanitizeJson = (val: any) => typeof val === 'string' ? val : JSON.stringify(val || []);

    const dataToSave = {
      ruleAutoSend: Boolean(body.ruleAutoSend),
      ruleBlockExternal: Boolean(body.ruleBlockExternal),
      ruleMinDuration: Number(body.ruleMinDuration) || 5,
      ruleMaxDuration: Number(body.ruleMaxDuration) || 240,
      ruleBccEmails: sanitizeJson(body.ruleBccEmails),
      ruleExcludedEmails: sanitizeJson(body.ruleExcludedEmails),
      ruleBlockedDomains: sanitizeJson(body.ruleBlockedDomains),
      ruleIgnoreKeywords: sanitizeJson(body.ruleIgnoreKeywords),
      ruleMandatoryTags: sanitizeJson(body.ruleMandatoryTags),
      ruleRestrictToOrgs: Boolean(body.ruleRestrictToOrgs),
      ruleObfuscateSensitive: Boolean(body.ruleObfuscateSensitive),
      ruleSummaryLanguage: String(body.ruleSummaryLanguage || "pt-BR")
    };

    await prisma.systemSettings.upsert({
      where: { id: "global" },
      update: dataToSave,
      create: {
        id: "global",
        ...dataToSave
      }
    });

    return NextResponse.json({ success: true, message: "Regras salvas com sucesso!" });
  } catch (error) {
    console.error("Erro ao salvar regras:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

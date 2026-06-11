"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Tag, Save, Loader2, RotateCcw, CheckCircle2 } from "lucide-react";

const DEFAULT_MINUTES_PROMPT = `O Título desta reunião é: "{{TITULO}}".
Abaixo está a transcrição de uma reunião do Microsoft Teams.

GERAR UMA ATA ESTRUTURADA EM MARKDOWN contendo os seguintes cabeçalhos:

### 1. Cliente / Empresa Externa (OPCIONAL)
INCLUA esta seção APENAS se na transcrição houver menção explícita a um cliente externo ou empresa terceira como foco da reunião.
Se a reunião for interna ou não houver cliente mencionado, OMITA esta seção completamente.
(Quando presente: descreva o nome completo oficial da empresa. Não use siglas.)

### 2. Resumo Executivo
(Resumo em 1 parágrafo.)

### 3. Tópicos Discutidos
(Use bullet points.)

### 4. Decisões Tomadas
(Use bullet points. Se não houver decisões claras, escreva "Nenhuma decisão formal registrada.")

### 5. Próximos Passos
(Use bullet points. Inclua responsáveis e prazos se citados. Se não houver, escreva "Nenhum próximo passo definido.")

---
Transcrição:
{{TRANSCRICAO}}`;

const DEFAULT_TAGS_PROMPT = `Analise a ATA da reunião abaixo e retorne APENAS um objeto JSON válido.

O JSON deve ter EXATAMENTE esta estrutura:
{
  "summary": "Resumo executivo em 1 frase.",
  "clienteNome": "Nome COMPLETO do cliente/empresa externa REAL mencionado na ata. OBRIGATÓRIO retornar string vazia "" se não houver cliente externo explicitamente citado.",
  "categoriaNome": "Categoria do assunto principal em 1 a 3 palavras (ex: Planejamento, Vendas, Suporte, Onboarding).",
  "keywords": ["palavra-chave1", "palavra-chave2", "palavra-chave3"]
}

REGRAS CRÍTICAS:
- Se a reunião NÃO menciona nenhum cliente externo real → "clienteNome" DEVE ser "" (string vazia)
- Nunca invente um cliente. Só coloque um nome se ele aparecer explicitamente na ata
- "keywords" devem ser substantivos relevantes do conteúdo (máx. 5 palavras)

Título da reunião: "{{TITULO}}"
Clientes já cadastrados no sistema: [{{CLIENTES_EXISTENTES}}]

Ata:
{{ATA}}`;

export default function PromptsPage() {
  const [minutesPrompt, setMinutesPrompt] = useState("");
  const [tagsPrompt, setTagsPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingMinutes, setSavingMinutes] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [savedMinutes, setSavedMinutes] = useState(false);
  const [savedTags, setSavedTags] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/settings/prompts");
        const data = await res.json();
        setMinutesPrompt(data.minutesPrompt || "");
        setTagsPrompt(data.tagsPrompt || "");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const saveMinutes = async () => {
    setSavingMinutes(true);
    try {
      await fetch("/api/settings/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutesPrompt }),
      });
      setSavedMinutes(true);
      setTimeout(() => setSavedMinutes(false), 3000);
    } finally {
      setSavingMinutes(false);
    }
  };

  const saveTags = async () => {
    setSavingTags(true);
    try {
      await fetch("/api/settings/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagsPrompt }),
      });
      setSavedTags(true);
      setTimeout(() => setSavedTags(false), 3000);
    } finally {
      setSavingTags(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-500 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <FileText className="w-6 h-6 text-purple-400" />
          Editor de Prompts
        </h2>
        <p className="text-zinc-400 mt-1">
          Personalize os prompts usados pela IA para gerar Atas e Tags. 
          Use os marcadores <code className="text-purple-300 bg-purple-500/10 px-1 rounded">{"{{TITULO}}"}</code>, <code className="text-purple-300 bg-purple-500/10 px-1 rounded">{"{{TRANSCRICAO}}"}</code> e <code className="text-purple-300 bg-purple-500/10 px-1 rounded">{"{{ATA}}"}</code> como variáveis.
          Deixe em branco para usar o padrão do sistema.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Prompt das Atas */}
        <Card className="bg-zinc-950 border-zinc-800 shadow-xl">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              Prompt de Geração de Atas
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Instrução enviada ao modelo ao gerar a ata de cada reunião. Variáveis: <code className="text-zinc-300">{"{{TITULO}}"}</code> e <code className="text-zinc-300">{"{{TRANSCRICAO}}"}</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={minutesPrompt}
              onChange={e => setMinutesPrompt(e.target.value)}
              placeholder={DEFAULT_MINUTES_PROMPT}
              rows={18}
              className="w-full bg-black border border-zinc-800 rounded-md py-3 px-3 text-xs text-zinc-300 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y leading-relaxed"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={saveMinutes}
                disabled={savingMinutes}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-700/70 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-md transition-all"
              >
                {savingMinutes ? <Loader2 className="w-4 h-4 animate-spin" /> : savedMinutes ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {savedMinutes ? "Salvo!" : "Salvar Prompt de Atas"}
              </button>
              <button
                onClick={() => setMinutesPrompt("")}
                title="Restaurar padrão"
                className="p-2 border border-zinc-700 rounded-md text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            {minutesPrompt === "" && (
              <p className="text-[10px] text-zinc-600 font-mono">Usando prompt padrão do sistema.</p>
            )}
          </CardContent>
        </Card>

        {/* Prompt de Tags */}
        <Card className="bg-zinc-950 border-zinc-800 shadow-xl">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-blue-400" />
              Prompt de Geração de Tags (Memory Brain)
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Instrução enviada ao modelo ao extrair cliente, categoria e keywords. Variáveis: <code className="text-zinc-300">{"{{TITULO}}"}</code>, <code className="text-zinc-300">{"{{ATA}}"}</code> e <code className="text-zinc-300">{"{{CLIENTES_EXISTENTES}}"}</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={tagsPrompt}
              onChange={e => setTagsPrompt(e.target.value)}
              placeholder={DEFAULT_TAGS_PROMPT}
              rows={18}
              className="w-full bg-black border border-zinc-800 rounded-md py-3 px-3 text-xs text-zinc-300 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y leading-relaxed"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={saveTags}
                disabled={savingTags}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-700/70 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm rounded-md transition-all"
              >
                {savingTags ? <Loader2 className="w-4 h-4 animate-spin" /> : savedTags ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {savedTags ? "Salvo!" : "Salvar Prompt de Tags"}
              </button>
              <button
                onClick={() => setTagsPrompt("")}
                title="Restaurar padrão"
                className="p-2 border border-zinc-700 rounded-md text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            {tagsPrompt === "" && (
              <p className="text-[10px] text-zinc-600 font-mono">Usando prompt padrão do sistema.</p>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

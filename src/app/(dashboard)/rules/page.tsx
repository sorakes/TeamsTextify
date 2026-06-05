"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldAlert, Save, X, Mail, Globe, Clock, FileText, Ban, Tag, Languages, ShieldCheck, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

// Componente auxiliar para as "Caixinhas Verdes" (Chips)
function ChipInput({ 
  items, 
  setItems, 
  placeholder, 
  icon: Icon,
  colorClass = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
}: { 
  items: string[], 
  setItems: (items: string[]) => void, 
  placeholder: string,
  icon: any,
  colorClass?: string
}) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = inputValue.trim().replace(/,$/, ""); // Remove vírgula final se houver
      if (val && !items.includes(val)) {
        setItems([...items, val]);
      }
      setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && items.length > 0) {
      setItems(items.slice(0, -1));
    }
  };

  const removeChip = (indexToRemove: number) => {
    setItems(items.filter((_, i) => i !== indexToRemove));
  };

  return (
    <div className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2 flex flex-wrap gap-2 items-center focus-within:ring-1 focus-within:ring-blue-500 transition-all shadow-inner">
      {items.map((item, i) => (
        <span key={i} className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border ${colorClass}`}>
          {item}
          <button type="button" onClick={() => removeChip(i)} className="hover:text-white hover:bg-black/20 rounded-full p-0.5 ml-1 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <div className="flex-1 min-w-[120px] flex items-center">
        <Icon className="w-4 h-4 text-zinc-600 mr-2 shrink-0" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={items.length === 0 ? placeholder : "Adicione mais..."}
          className="w-full bg-transparent border-none focus:outline-none text-sm text-zinc-300 font-mono"
        />
      </div>
    </div>
  );
}

export default function RulesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"success" | "error" | null>(null);

  const [rules, setRules] = useState({
    ruleAutoSend: false,
    ruleBlockExternal: true,
    ruleMinDuration: 5,
    ruleMaxDuration: 240,
    ruleRestrictToOrgs: false,
    ruleObfuscateSensitive: true,
    ruleSummaryLanguage: "pt-BR",
    ruleBccEmails: [] as string[],
    ruleExcludedEmails: [] as string[],
    ruleBlockedDomains: [] as string[],
    ruleIgnoreKeywords: [] as string[],
    ruleMandatoryTags: [] as string[],
  });

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const res = await fetch("/api/rules");
      const data = await res.json();
      setRules({
        ruleAutoSend: data.ruleAutoSend,
        ruleBlockExternal: data.ruleBlockExternal,
        ruleMinDuration: data.ruleMinDuration,
        ruleMaxDuration: data.ruleMaxDuration,
        ruleRestrictToOrgs: data.ruleRestrictToOrgs,
        ruleObfuscateSensitive: data.ruleObfuscateSensitive,
        ruleSummaryLanguage: data.ruleSummaryLanguage,
        ruleBccEmails: JSON.parse(data.ruleBccEmails || "[]"),
        ruleExcludedEmails: JSON.parse(data.ruleExcludedEmails || "[]"),
        ruleBlockedDomains: JSON.parse(data.ruleBlockedDomains || "[]"),
        ruleIgnoreKeywords: JSON.parse(data.ruleIgnoreKeywords || "[]"),
        ruleMandatoryTags: JSON.parse(data.ruleMandatoryTags || "[]"),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const payload = {
        ...rules,
        ruleBccEmails: JSON.stringify(rules.ruleBccEmails),
        ruleExcludedEmails: JSON.stringify(rules.ruleExcludedEmails),
        ruleBlockedDomains: JSON.stringify(rules.ruleBlockedDomains),
        ruleIgnoreKeywords: JSON.stringify(rules.ruleIgnoreKeywords),
        ruleMandatoryTags: JSON.stringify(rules.ruleMandatoryTags),
      };

      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        setSaveStatus("error");
      }
    } catch (e) {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-500 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-500" />
            Firewall de Regras & Compliance
          </h2>
          <p className="text-zinc-400 mt-1">Políticas estritas de distribuição de e-mails, auditoria e comportamento do LLM.</p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === "success" && <span className="text-emerald-400 text-sm flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> Salvo</span>}
          {saveStatus === "error" && <span className="text-red-400 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Erro</span>}
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="flex items-center px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-sm transition-colors shadow-lg shadow-amber-900/20 font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Políticas
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        
        {/* Bloco: DLP (Data Loss Prevention) */}
        <Card className="bg-zinc-950 border-zinc-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
          <CardHeader className="pb-4 border-b border-zinc-800/50 mb-4">
            <CardTitle className="text-white flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-400" /> Prevenção de Vazamento (DLP)
            </CardTitle>
            <CardDescription className="text-zinc-400">Quem está proibido de receber Atas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-200">Bloquear Domínios Externos</p>
                <p className="text-xs text-zinc-500">Impede envio para quem não for do seu Tenant.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={rules.ruleBlockExternal} onChange={e => setRules({...rules, ruleBlockExternal: e.target.checked})} className="sr-only peer" />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-200">Apenas para o Organizador</p>
                <p className="text-xs text-zinc-500">Ignora os participantes e envia a Ata só para quem criou a call.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={rules.ruleRestrictToOrgs} onChange={e => setRules({...rules, ruleRestrictToOrgs: e.target.checked})} className="sr-only peer" />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest">E-mails Excluídos (Blacklist)</label>
              <ChipInput 
                items={rules.ruleExcludedEmails} 
                setItems={v => setRules({...rules, ruleExcludedEmails: v})} 
                placeholder="Ex: estagiario@empresa.com, use vírgula..."
                icon={Mail}
                colorClass="bg-red-500/20 text-red-400 border-red-500/30"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest">Domínios Bloqueados Específicos</label>
              <ChipInput 
                items={rules.ruleBlockedDomains} 
                setItems={v => setRules({...rules, ruleBlockedDomains: v})} 
                placeholder="Ex: gmail.com, hotmail.com..."
                icon={Globe}
                colorClass="bg-orange-500/20 text-orange-400 border-orange-500/30"
              />
            </div>
          </CardContent>
        </Card>

        {/* Bloco: Automação & Auditoria */}
        <Card className="bg-zinc-950 border-zinc-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardHeader className="pb-4 border-b border-zinc-800/50 mb-4">
            <CardTitle className="text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" /> Automação & Auditoria
            </CardTitle>
            <CardDescription className="text-zinc-400">Como o robô se comporta e quem ele avisa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-200">Envio Automático</p>
                <p className="text-xs text-zinc-500">Se ativo, envia sem aprovação humana. Se falso, requer revisão.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={rules.ruleAutoSend} onChange={e => setRules({...rules, ruleAutoSend: e.target.checked})} className="sr-only peer" />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest">Caixas Ocultas (BCC Global)</label>
              <ChipInput 
                items={rules.ruleBccEmails} 
                setItems={v => setRules({...rules, ruleBccEmails: v})} 
                placeholder="Ex: auditoria@empresa.com..."
                icon={Mail}
                colorClass="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-200">Ofuscar Dados Sensíveis</p>
                <p className="text-xs text-zinc-500">Pede ao LLM para trocar CPFs e Cartões por [CENSURADO].</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={rules.ruleObfuscateSensitive} onChange={e => setRules({...rules, ruleObfuscateSensitive: e.target.checked})} className="sr-only peer" />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest">Linguagem do Resumo</label>
              <div className="flex relative">
                <Languages className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <select value={rules.ruleSummaryLanguage} onChange={e => setRules({...rules, ruleSummaryLanguage: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-md py-2 pl-10 pr-3 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500 font-mono cursor-pointer">
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (US)</option>
                  <option value="es-ES">Español</option>
                  <option value="detect">Manter o Idioma Original da Call</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bloco: Filtros de Processamento */}
        <Card className="bg-zinc-950 border-zinc-800 shadow-2xl relative overflow-hidden md:col-span-2">
          <div className="absolute top-0 left-0 w-1 h-full bg-purple-500" />
          <CardHeader className="pb-4 border-b border-zinc-800/50 mb-4">
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-400" /> Filtros de Inteligência
            </CardTitle>
            <CardDescription className="text-zinc-400">Condições para o LLM processar ou ignorar reuniões.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Clock className="w-3 h-3"/> Duração Mínima (Minutos)</label>
                <input 
                  type="number" 
                  value={rules.ruleMinDuration} 
                  onChange={e => setRules({...rules, ruleMinDuration: parseInt(e.target.value) || 0})}
                  className="w-full bg-black border border-zinc-800 rounded-md py-2 px-3 text-sm text-zinc-300 focus:outline-none focus:border-purple-500 font-mono" 
                />
                <p className="text-[10px] text-zinc-500">Ignora reuniões muito curtas.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Clock className="w-3 h-3"/> Duração Máxima (Minutos)</label>
                <input 
                  type="number" 
                  value={rules.ruleMaxDuration} 
                  onChange={e => setRules({...rules, ruleMaxDuration: parseInt(e.target.value) || 0})}
                  className="w-full bg-black border border-zinc-800 rounded-md py-2 px-3 text-sm text-zinc-300 focus:outline-none focus:border-purple-500 font-mono" 
                />
                <p className="text-[10px] text-zinc-500">Ignora maratonas longas para poupar tokens do LLM.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest">Palavras-Chave P/ Ignorar (Assunto)</label>
                <ChipInput 
                  items={rules.ruleIgnoreKeywords} 
                  setItems={v => setRules({...rules, ruleIgnoreKeywords: v})} 
                  placeholder="Ex: Confidencial, Privado..."
                  icon={Ban}
                  colorClass="bg-purple-500/20 text-purple-400 border-purple-500/30"
                />
                <p className="text-[10px] text-zinc-500">Se o assunto da call tiver alguma dessas, o robô deleta imediatamente.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest">Forçar Tags Globais</label>
                <ChipInput 
                  items={rules.ruleMandatoryTags} 
                  setItems={v => setRules({...rules, ruleMandatoryTags: v})} 
                  placeholder="Ex: processado-ia, matriz..."
                  icon={Tag}
                  colorClass="bg-blue-500/20 text-blue-400 border-blue-500/30"
                />
                <p className="text-[10px] text-zinc-500">Essas tags serão penduradas em TODOS os nós do Memory Brain obrigatoriamente.</p>
              </div>
            </div>

          </CardContent>
        </Card>

      </div>
    </div>
  );
}

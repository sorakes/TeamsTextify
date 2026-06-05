"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, BrainCircuit, Loader2, CheckCircle2, AlertCircle, KeyRound, Link as LinkIcon, Cpu, RefreshCw, Power, Key } from "lucide-react";

type ProviderType = "openai" | "gemini" | "groq" | "openrouter" | "ollama";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  
  const [systemSaveStatus, setSystemSaveStatus] = useState<"success" | "error" | null>(null);
  const [systemErrorMsg, setSystemErrorMsg] = useState("");

  const [provider, setProvider] = useState<ProviderType>("openai");
  const [activeProvider, setActiveProvider] = useState<ProviderType>("openai");
  const [allConfigs, setAllConfigs] = useState<Record<string, any>>({});
  
  const [modelName, setModelName] = useState("gpt-4o");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const [workerConcurrency, setWorkerConcurrency] = useState(1);
  const [huggingFaceToken, setHuggingFaceToken] = useState("");
  const [savingSystem, setSavingSystem] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchSystemSettings();
  }, []);

  const fetchSystemSettings = async () => {
    try {
      const res = await fetch("/api/settings/system");
      const data = await res.json();
      if (data.success && data.settings) {
        setWorkerConcurrency(data.settings.workerConcurrency || 1);
        setHuggingFaceToken(data.settings.huggingFaceToken || "");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchConfig = async (silent = false) => {
    try {
      const res = await fetch("/api/settings/llm");
      const data = await res.json();
      
      const currentActive = (data.activeProvider as ProviderType) || "openai";
      
      if (!silent) {
        setProvider(currentActive);
        loadProviderFields(currentActive, data.configs);
      }
      
      setActiveProvider(currentActive);
      setAllConfigs(data.configs || {});
      
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadProviderFields = (prov: ProviderType, configsDict: Record<string, any>) => {
    const pConf = configsDict[prov];
    setApiKey(""); // Reset security
    
    if (pConf) {
      setModelName(pConf.modelName || "");
      setBaseUrl(pConf.baseUrl || "");
    } else {
      setBaseUrl("");
      if (prov === "openai") setModelName("gpt-4o");
      if (prov === "gemini") setModelName("gemini-1.5-pro");
      if (prov === "groq") setModelName("llama3-70b-8192");
      if (prov === "openrouter") setModelName("anthropic/claude-3.5-sonnet");
      if (prov === "ollama") {
        setModelName("llama3");
        setBaseUrl("http://127.0.0.1:11434/v1");
      }
    }
  };

  const handleProviderChange = (newProvider: ProviderType) => {
    setProvider(newProvider);
    setSaveStatus(null);
    loadProviderFields(newProvider, allConfigs);
  };

  const handleSaveAndTest = async () => {
    setTesting(true);
    setSaveStatus(null);
    setErrorMsg("");

    try {
      const payload = {
        action: "save_config",
        provider,
        modelName,
        apiKey,
        baseUrl
      };

      const res = await fetch("/api/settings/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSaveStatus("success");
        setApiKey(""); 
        
        // Refresh local memory to reflect saved state
        await fetchConfig(true); 
        setTimeout(() => setSaveStatus(null), 4000);
      } else {
        setSaveStatus("error");
        setErrorMsg(data.error || "Falha ao conectar com o provedor.");
      }
    } catch (e) {
      setSaveStatus("error");
      setErrorMsg("Erro de comunicação com o servidor.");
    } finally {
      setTesting(false);
    }
  };

  const handleSetActive = async () => {
    setActivating(true);
    setSaveStatus(null);
    setErrorMsg("");

    try {
      const payload = {
        action: "set_active",
        provider
      };

      const res = await fetch("/api/settings/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setActiveProvider(provider);
      } else {
        setSaveStatus("error");
        setErrorMsg(data.error || "Falha ao definir como ativo.");
      }
    } catch (e) {
      setSaveStatus("error");
      setErrorMsg("Erro de comunicação com o servidor.");
    } finally {
      setActivating(false);
    }
  };

  const handleSaveSystem = async () => {
    setSavingSystem(true);
    setSystemSaveStatus(null);
    setSystemErrorMsg("");

    try {
      const res = await fetch("/api/settings/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerConcurrency, huggingFaceToken }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSystemSaveStatus("success");
        setTimeout(() => setSystemSaveStatus(null), 4000);
      } else {
        setSystemSaveStatus("error");
        setSystemErrorMsg(data.error || "Falha ao salvar configurações do sistema.");
      }
    } catch (e) {
      setSystemSaveStatus("error");
      setSystemErrorMsg("Erro de comunicação com o servidor.");
    } finally {
      setSavingSystem(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const currentHasKey = allConfigs[provider]?.hasKey === true;
  const showEncryptedPlaceholder = currentHasKey;
  const isCurrentlyActive = provider === activeProvider;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-500 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-blue-400" /> Cofre de Motores (LLM)
          </h2>
          <p className="text-zinc-400 mt-1">Configure múltiplas chaves e escolha qual Inteligência Artificial vai operar.</p>
        </div>
      </div>

      <Card className="bg-zinc-950 border-zinc-800 shadow-2xl overflow-hidden relative group">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
        <CardHeader className="pb-4 border-b border-zinc-800/50 mb-4">
          <div className="flex justify-between items-center">
            <CardTitle className="text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-400" /> Seletor de Motor
            </CardTitle>
            
            {/* Botão de Ativar Motor (Novo) */}
            {!isCurrentlyActive && currentHasKey && (
              <button 
                onClick={handleSetActive}
                disabled={activating}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-full text-xs font-bold transition-colors shadow-lg shadow-emerald-900/20"
              >
                {activating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                TORNAR TITULAR
              </button>
            )}
            {isCurrentlyActive && (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-1.5 rounded-full text-xs font-bold">
                <CheckCircle2 className="w-3 h-3" /> MOTOR TITULAR ATIVO
              </div>
            )}
          </div>
          <CardDescription className="text-zinc-400">
            A chave de API é encriptada (AES-256) antes de ser salva no SQLite.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Seletor Visual de Provedor */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { id: "openai", name: "OpenAI", color: "hover:border-green-500 hover:text-green-400" },
              { id: "gemini", name: "Google Gemini", color: "hover:border-blue-500 hover:text-blue-400" },
              { id: "groq", name: "Groq (Llama 3)", color: "hover:border-red-500 hover:text-red-400" },
              { id: "openrouter", name: "OpenRouter", color: "hover:border-purple-500 hover:text-purple-400" },
              { id: "ollama", name: "Ollama (Local)", color: "hover:border-zinc-300 hover:text-zinc-300" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id as ProviderType)}
                className={`p-3 rounded-md border text-sm font-semibold transition-all flex flex-col items-center justify-center text-center relative
                  ${provider === p.id 
                    ? "bg-zinc-800 border-zinc-500 text-white shadow-inner" 
                    : `bg-black border-zinc-800 text-zinc-500 ${p.color}`
                  }`}
              >
                {p.name}
                {activeProvider === p.id && (
                  <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded-full border border-zinc-900 shadow-lg">
                    TITULAR
                  </span>
                )}
                {/* Se estiver configurado (tem key salva), mostra um checkzinho pra saber que já salvou antes */}
                {allConfigs[p.id]?.hasKey && activeProvider !== p.id && (
                  <span className="absolute -top-1 -right-1">
                    <CheckCircle2 className="w-3 h-3 text-blue-400" />
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Campos Dinâmicos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-zinc-900/40 p-4 rounded-lg border border-zinc-800/60">
            <div className="space-y-2">
              <label className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <Cpu className="w-3 h-3" /> Nome do Modelo
              </label>
              <input 
                type="text" 
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                placeholder="Ex: gpt-4o" 
                className="w-full bg-black border border-zinc-800 rounded-md py-2.5 px-3 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 font-mono transition-all" 
              />
              <p className="text-[10px] text-zinc-500">Ex: gpt-4o, gemini-1.5-pro, llama3-70b-8192</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <KeyRound className="w-3 h-3" /> API Key (Secret)
              </label>
              <input 
                type="password" 
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={showEncryptedPlaceholder ? "•••••••• (Criptografada e salva)" : "sk-..."}
                className="w-full bg-black border border-zinc-800 rounded-md py-2.5 px-3 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 font-mono transition-all" 
              />
              {provider === "ollama" ? (
                <p className="text-[10px] text-amber-500/80">Ollama local geralmente não requer API Key.</p>
              ) : (
                <p className="text-[10px] text-zinc-500">
                  {showEncryptedPlaceholder ? "Preencha apenas se desejar sobrescrever a chave salva." : "Cole sua chave secreta aqui."}
                </p>
              )}
            </div>

            {(provider === "openrouter" || provider === "groq" || provider === "ollama") && (
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <LinkIcon className="w-3 h-3" /> Custom Base URL
                </label>
                <input 
                  type="text" 
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1" 
                  className="w-full bg-black border border-zinc-800 rounded-md py-2.5 px-3 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 font-mono transition-all" 
                />
                <p className="text-[10px] text-zinc-500">Sobrescreve a URL base do Vercel SDK (útil para Ollama ou Proxies).</p>
              </div>
            )}
          </div>

          {/* Feedback Visual */}
          {saveStatus === "error" && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 p-3 rounded-md border border-red-400/20 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          
          {saveStatus === "success" && (
            <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 p-3 rounded-md border border-emerald-400/20 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Conexão testada e salva com sucesso neste cofre.</span>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-3">
            <button 
              onClick={handleSaveAndTest} 
              disabled={testing || (!apiKey && !showEncryptedPlaceholder && provider !== 'ollama')}
              className="flex-1 flex justify-center items-center px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-md text-sm transition-colors border border-zinc-700 shadow-lg font-medium disabled:opacity-50"
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testando conexão...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" /> Salvar Configuração Neste Motor
                </>
              )}
            </button>
            
            {currentHasKey && (
              <button 
                onClick={handleSaveAndTest}
                disabled={testing}
                className="flex items-center justify-center px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded-md text-sm transition-colors border border-zinc-800 font-medium disabled:opacity-50"
                title="Testar conexão novamente"
              >
                <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin text-blue-400' : ''}`} />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* NOVO CARTÃO: Extração de Áudio e Paralelismo */}
      <Card className="bg-zinc-950 border-zinc-800 shadow-2xl overflow-hidden relative group mt-6">
        <div className="absolute top-0 left-0 w-1 h-full bg-purple-500" />
        <CardHeader className="pb-4 border-b border-zinc-800/50 mb-4">
          <div className="flex justify-between items-center">
            <CardTitle className="text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-400" /> Processamento de Áudio & Paralelismo
            </CardTitle>
          </div>
          <CardDescription className="text-zinc-400">
            Controle a performance de download e extração local das reuniões gravadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-purple-900/10 border border-purple-500/20 p-4 rounded-lg">
            <h4 className="text-purple-400 font-semibold flex items-center gap-2 mb-2 text-sm">
              <AlertCircle className="w-4 h-4" /> Como funciona a extração local?
            </h4>
            <p className="text-zinc-300 text-sm leading-relaxed mb-3">
              Em vez de usar transcrições prontas, o Worker <strong>baixa a gravação original (.mp4)</strong> da Microsoft para o servidor. Em seguida, ele usa <strong>FFmpeg</strong> para isolar o áudio e a IA <strong>Whisper</strong> para realizar a <strong>Diarização</strong> (reconhecimento de voz para identificar quem falou cada frase).
            </p>
            <p className="text-zinc-400 text-xs italic">
              * Por segurança, logo após a geração do texto bruto, o arquivo de áudio e vídeo é permanentemente deletado do disco.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-zinc-200">
                Workers Simultâneos (Concorrência)
              </label>
              <span className="bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-xs font-mono border border-zinc-700">
                {workerConcurrency} {workerConcurrency === 1 ? "Worker" : "Workers"}
              </span>
            </div>
            
            <input 
              type="range" 
              min="1" 
              max="10" 
              value={workerConcurrency} 
              onChange={(e) => setWorkerConcurrency(parseInt(e.target.value))}
              className="w-full accent-purple-500 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
            />
            
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>Mais Seguro (1)</span>
              <span>Mais Rápido (10)</span>
            </div>
            
            <p className="text-xs text-zinc-500">
              Aumentar este número fará com que o sistema baixe e processe múltiplas reuniões pesadas ao mesmo tempo. <strong>Aviso:</strong> Cada Worker adicional exige mais memória RAM e CPU do seu servidor.
            </p>
          </div>

          <div className="space-y-3 pt-4 border-t border-zinc-800">
            <div>
              <label className="text-sm font-bold text-zinc-200">
                Token HuggingFace (Obrigatório para Diarização)
              </label>
              <p className="text-xs text-zinc-400 mb-2">
                Para que o Pyannote identifique "quem" falou na reunião (Speaker A, Speaker B), você precisa fornecer um <a href="https://huggingface.co/settings/tokens" target="_blank" className="text-purple-400 hover:underline">Token de Acesso do HuggingFace</a> e aceitar os termos do modelo no site deles. Se não for preenchido, a transcrição será feita, mas sem separar as vozes.
              </p>
              <div className="relative">
                <input
                  type="password"
                  value={huggingFaceToken}
                  onChange={(e) => setHuggingFaceToken(e.target.value)}
                  placeholder="hf_..."
                  className="w-full bg-zinc-900 border border-zinc-700 text-white p-3 rounded-md pl-10 focus:ring-2 focus:ring-purple-500 outline-none font-mono text-sm"
                />
                <div className="absolute left-3 top-3 text-zinc-500">
                  <Key className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              onClick={handleSaveSystem} 
              disabled={savingSystem}
              className="flex justify-center items-center px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-md text-sm transition-colors border border-zinc-700 shadow-lg font-medium disabled:opacity-50"
            >
              {savingSystem ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" /> Salvar Concorrência</>
              )}
            </button>
          </div>
          
          {/* Feedback Visual Sistema */}
          {systemSaveStatus === "error" && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 p-3 rounded-md border border-red-400/20 text-sm mt-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{systemErrorMsg}</span>
            </div>
          )}
          
          {systemSaveStatus === "success" && (
            <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 p-3 rounded-md border border-emerald-400/20 text-sm mt-4">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Concorrência salva com sucesso no sistema.</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

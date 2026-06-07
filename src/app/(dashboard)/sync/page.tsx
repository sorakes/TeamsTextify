"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CloudCog, ShieldCheck, ShieldAlert, KeyRound, Server, AlertCircle, CheckCircle2, X } from "lucide-react";

// Toast system
interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

let toastId = 0;

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-sm pointer-events-auto animate-in slide-in-from-right-full duration-300
            ${t.type === "success" ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-300" :
              t.type === "error" ? "bg-red-950/90 border-red-500/40 text-red-300" :
              "bg-zinc-900/95 border-zinc-700/60 text-zinc-200"}`}
        >
          {t.type === "success" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> :
           t.type === "error" ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> :
           <Server className="w-4 h-4 mt-0.5 shrink-0" />}
          <p className="text-sm flex-1 leading-snug">{t.message}</p>
          <button onClick={() => onRemove(t.id)} className="opacity-60 hover:opacity-100 shrink-0 mt-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function SyncPage() {
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<"connected" | "disconnected" | "error">("disconnected");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [daysBack, setDaysBack] = useState("7");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [formData, setFormData] = useState({
    tenantId: "",
    clientId: "",
    clientSecret: "",
  });

  const addToast = useCallback((type: Toast["type"], message: string, duration = 7000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, type, message }]);
    if (duration > 0) setTimeout(() => removeToast(id), duration);
    return id;
  }, []);

  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/sync/config");
      const data = await res.json();
      if (data.hasConfig) {
        setFormData(prev => ({ ...prev, tenantId: data.tenantId, clientId: data.clientId }));
        setStatus("connected");
      } else {
        setStatus("disconnected");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Erro ao carregar configurações locais.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tenantId || !formData.clientId || !formData.clientSecret) {
      setErrorMsg("Preencha todos os campos.");
      return;
    }
    setTesting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/sync/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message);
        setStatus("connected");
        setFormData(prev => ({ ...prev, clientSecret: "" }));
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Falha na conexão.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Falha ao comunicar com o servidor.");
    } finally {
      setTesting(false);
    }
  };

  const handleStartScan = async () => {
    // Dispara evento para o painel global (SyncProgressPanel) que vive no layout
    window.dispatchEvent(new CustomEvent("start_global_sync", { detail: { daysBack: parseInt(daysBack) } }));
    addToast("info", "Varredura iniciada em segundo plano. Você pode acompanhar pelo painel lateral.", 5000);
  };

  // Lemos o status global para desabilitar o botão enquanto roda
  const [globalStatus, setGlobalStatus] = useState<string>("idle");
  useEffect(() => {
    const check = () => {
      try {
        const s = localStorage.getItem("teamstextify_sync_progress");
        if (s) setGlobalStatus(JSON.parse(s).status);
      } catch {}
    };
    check();
    window.addEventListener("sync_progress_update", check);
    return () => window.removeEventListener("sync_progress_update", check);
  }, []);

  const isRunning = globalStatus === "running";

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="space-y-6 animate-in fade-in zoom-in duration-500 max-w-4xl">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <CloudCog className="w-6 h-6 text-blue-400" />
            Sync API (Microsoft Graph)
          </h2>
          <p className="text-zinc-400 mt-1">Conecte o TeamsTextify ao Microsoft Entra ID para sincronização de contas e atas.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Formulário */}
          <Card className="md:col-span-2 bg-zinc-950 border-zinc-800 shadow-xl">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                Credenciais do Entra ID
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Insira as chaves do aplicativo registrado no Azure AD. O Client Secret será salvo com encriptação AES-256 no banco local.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center items-center py-10">
                  <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                </div>
              ) : (
                <form onSubmit={handleSaveAndTest} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Tenant ID</label>
                    <input
                      type="text"
                      value={formData.tenantId}
                      onChange={e => setFormData({ ...formData, tenantId: e.target.value })}
                      placeholder="Ex: 8ea4d... ou contoso.onmicrosoft.com"
                      className="w-full bg-black border border-zinc-800 rounded-md py-2 px-3 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Client ID (Application ID)</label>
                    <input
                      type="text"
                      value={formData.clientId}
                      onChange={e => setFormData({ ...formData, clientId: e.target.value })}
                      placeholder="Ex: 4f3a..."
                      className="w-full bg-black border border-zinc-800 rounded-md py-2 px-3 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Client Secret</label>
                    <input
                      type="password"
                      value={formData.clientSecret}
                      onChange={e => setFormData({ ...formData, clientSecret: e.target.value })}
                      placeholder={status === "connected" ? "•••••••• (Salvo e Encriptado)" : "Cole o valor do secret aqui"}
                      className="w-full bg-black border border-zinc-800 rounded-md py-2 px-3 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                    {status === "connected" && (
                      <p className="text-[10px] text-zinc-500">
                        O secret já está configurado. Preencha apenas se quiser atualizá-lo.
                      </p>
                    )}
                  </div>

                  {errorMsg && (
                    <div className="flex items-center gap-2 text-red-400 bg-red-400/10 p-3 rounded-md border border-red-400/20 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {successMsg && (
                    <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 p-3 rounded-md border border-emerald-400/20 text-sm">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{successMsg}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={testing}
                    className="w-full flex items-center justify-center py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Testando Conexão e Salvando...
                      </>
                    ) : "Salvar e Testar Conexão"}
                  </button>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Coluna direita */}
          <div className="space-y-4">
            {/* Status Badge */}
            <Card className={`border shadow-xl ${status === 'connected' ? 'bg-emerald-950/20 border-emerald-500/30' : status === 'error' ? 'bg-red-950/20 border-red-500/30' : 'bg-zinc-950 border-zinc-800'}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm uppercase tracking-wider flex items-center gap-2">
                  <Server className="w-4 h-4" /> Status da API
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-4 text-center space-y-3">
                  {status === "connected" ? (
                    <>
                      <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/40">
                        <ShieldCheck className="w-6 h-6 text-emerald-400" />
                      </div>
                      <div>
                        <h4 className="text-emerald-400 font-bold">Conectado</h4>
                        <p className="text-xs text-zinc-400 mt-1">Token de acesso MSAL gerado e validado com sucesso.</p>
                      </div>
                    </>
                  ) : status === "error" ? (
                    <>
                      <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/40">
                        <ShieldAlert className="w-6 h-6 text-red-400" />
                      </div>
                      <div>
                        <h4 className="text-red-400 font-bold">Falha de Autenticação</h4>
                        <p className="text-xs text-zinc-400 mt-1">Verifique se as credenciais estão corretas ou expiradas.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                        <CloudCog className="w-6 h-6 text-zinc-400" />
                      </div>
                      <div>
                        <h4 className="text-zinc-300 font-bold">Desconectado</h4>
                        <p className="text-xs text-zinc-500 mt-1">Nenhuma credencial válida encontrada no banco.</p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Importação Histórica */}
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100 flex items-center gap-2">
                  <Server className="w-5 h-5 text-blue-500" />
                  Importação Histórica
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Busca reuniões passadas de TODOS os funcionários da empresa (Varredura Global).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <select
                    value={daysBack}
                    onChange={e => setDaysBack(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-zinc-200"
                    disabled={status !== "connected" || isRunning}
                  >
                    <option value="7">Últimos 7 dias</option>
                    <option value="15">Últimos 15 dias</option>
                    <option value="30">Últimos 30 dias</option>
                  </select>

                  <button
                    disabled={isRunning || status !== "connected"}
                    onClick={handleStartScan}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-md transition-all shadow-lg shadow-blue-900/30"
                  >
                    {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                    {status === "connected" ? (isRunning ? "Varrendo no background..." : "Iniciar Varredura Global") : "Conecte a API MSAL Primeiro"}
                  </button>
                </div>

                {status === "connected" && !isRunning && (
                  <div className="pt-2 border-t border-zinc-800/50">
                    <p className="text-[10px] text-zinc-500 text-center">Conectado. Você já pode rodar a Varredura Global acima.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Permissões */}
            <Card className="bg-zinc-950 border-zinc-800">
              <CardContent className="p-4 text-xs text-zinc-400 space-y-2 font-mono">
                <p><strong>Permissões necessárias:</strong></p>
                <ul className="list-disc pl-4 space-y-1 text-[10px]">
                  <li>Calendars.Read (Application/Aplicativo)</li>
                  <li>OnlineMeetings.Read.All</li>
                  <li>User.Read.All</li>
                  <li>Mail.Send</li>
                </ul>
                <p className="mt-2 text-[10px] text-amber-500/80 bg-amber-500/10 p-2 rounded">O Consentimento do Administrador (Admin Consent) no Entra ID é obrigatório para estas permissões.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

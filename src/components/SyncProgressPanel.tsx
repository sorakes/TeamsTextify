"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  RefreshCw, X, ChevronRight, ChevronLeft,
  CheckCircle2, AlertCircle, Loader2, Users, Download
} from "lucide-react";

// ─── Tipos ──────────────────────────────────────────────────────────────────
export interface SyncProgressState {
  status: "idle" | "running" | "done" | "error";
  scanned: number;
  total: number;
  currentUser: string;
  imported: number;
  message?: string;
  startedAt?: number;
  daysBack?: number;
  nextRunAt?: number;
}

const STORAGE_KEY = "teamstextify_sync_progress";
const EMPTY: SyncProgressState = {
  status: "idle", scanned: 0, total: 0, currentUser: "", imported: 0
};

// ─── Helpers de storage ──────────────────────────────────────────────────────
function saveProgress(p: SyncProgressState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}
function loadProgress(): SyncProgressState {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return EMPTY;
}
function clearProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ─── Hook global de estado de sync ──────────────────────────────────────────
// Singleton via localStorage + custom events (cross-tab aware)
export function useSyncProgress() {
  const [state, setState] = useState<SyncProgressState>(EMPTY);

  useEffect(() => {
    // Recupera do storage ao montar
    setState(loadProgress());

    // Escuta eventos de atualização (broadcast entre componentes)
    const handler = () => setState(loadProgress());
    window.addEventListener("sync_progress_update", handler);
    return () => window.removeEventListener("sync_progress_update", handler);
  }, []);

  const update = useCallback((patch: Partial<SyncProgressState>) => {
    const next = { ...loadProgress(), ...patch };
    saveProgress(next);
    setState(next);
    window.dispatchEvent(new Event("sync_progress_update"));
  }, []);

  const reset = useCallback(() => {
    clearProgress();
    setState(EMPTY);
    window.dispatchEvent(new Event("sync_progress_update"));
  }, []);

  return { state, update, reset };
}

// ─── Componente ─────────────────────────────────────────────────────────────
export function SyncProgressPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SyncProgressState>(EMPTY);
  const prevStatusRef = useRef<string>("idle");

  // Sincroniza com o storage
  useEffect(() => {
    const sync = () => {
      const s = loadProgress();
      setState(s);
      // Auto-abre quando inicia
      if (s.status === "running" && prevStatusRef.current !== "running") {
        setOpen(true);
      }
      prevStatusRef.current = s.status;
    };
    sync();
    window.addEventListener("sync_progress_update", sync);
    return () => {
      window.removeEventListener("sync_progress_update", sync);
    };
  }, []);

  // Polling de 1 em 1 segundo no backend (Estado Global Real)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/sync/global-status");
        if (res.ok) {
          const data = await res.json();
          if (data && data.status) {
            const current = loadProgress();
            const { lastUpdate: _, ...newData } = data;
            const { lastUpdate: __, ...curData } = current as any;
            if (JSON.stringify(newData) !== JSON.stringify(curData)) {
              saveProgress(data);
              setState(data);
              window.dispatchEvent(new Event("sync_progress_update"));
            }
          }
        }
      } catch (err) {}
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleStart = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const daysBack = customEvent.detail?.daysBack || 60;
      
      setOpen(true);
      const next: SyncProgressState = { ...loadProgress(), status: "running", scanned: 0, currentUser: "Conectando...", message: "" };
      saveProgress(next);
      setState(next);
      window.dispatchEvent(new Event("sync_progress_update"));

      try {
        const res = await fetch("/api/sync/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ daysBack }),
        });
        if (!res.ok) throw new Error("Falha ao iniciar varredura no servidor.");
      } catch (err: any) {
        const errorState: SyncProgressState = { ...loadProgress(), status: "error", message: err.message };
        saveProgress(errorState);
        setState(errorState);
        window.dispatchEvent(new Event("sync_progress_update"));
      }
    };

    window.addEventListener("start_global_sync", handleStart);
    return () => window.removeEventListener("start_global_sync", handleStart);
  }, []);

  const isActive = state.status === "running";
  const isDone = state.status === "done";
  const isError = state.status === "error";
  const pct = state.total > 0 ? Math.round((state.scanned / state.total) * 100) : 0;

  const elapsed = state.startedAt
    ? Math.round((Date.now() - state.startedAt) / 1000)
    : 0;
  const elapsedStr = elapsed > 60
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`;

  const handleDismiss = () => {
    clearProgress();
    setState(EMPTY);
    window.dispatchEvent(new Event("sync_progress_update"));
    setOpen(false);
  };

  // Não renderiza nada se está idle e nunca foi usado
  if (state.status === "idle" && !open) return null;

  return (
    <>
      {/* ── Botão Flutuante ────────────────────────────────────────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full shadow-2xl border transition-all duration-300 group ${
            isActive
              ? "bg-blue-600 border-blue-500/60 hover:bg-blue-500 text-white shadow-blue-900/50"
              : isDone
              ? "bg-emerald-900/80 border-emerald-500/40 hover:bg-emerald-800/80 text-emerald-300"
              : isError
              ? "bg-red-900/80 border-red-500/40 hover:bg-red-800/80 text-red-300"
              : "bg-zinc-900/80 border-zinc-700 text-zinc-400"
          }`}
        >
          {isActive ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          ) : isDone ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : isError ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <RefreshCw className="w-4 h-4 shrink-0" />
          )}
          <span className="text-xs font-mono font-semibold">
            {isActive
              ? `Sincronizando... ${pct}%`
              : isDone
              ? `✓ Concluído — ${state.imported} reuniões`
              : isError
              ? "Falha na varredura"
              : "Sync"}
          </span>
          {isActive && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-ping" />
          )}
          <ChevronLeft className="w-3 h-3 ml-1 opacity-60 group-hover:opacity-100" />
        </button>
      )}

      {/* ── Painel Lateral Flutuante ────────────────────────────────────────── */}
      {open && (
        <>
          {/* Overlay sutil */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          <div className="fixed top-1/2 -translate-y-1/2 right-0 z-50 w-[340px] animate-in slide-in-from-right-full duration-300">
            {/* Aba de abertura */}
            <button
              onClick={() => setOpen(false)}
              className={`absolute -left-8 top-1/2 -translate-y-1/2 w-8 h-16 flex items-center justify-center rounded-l-xl border-l border-t border-b transition-colors ${
                isActive
                  ? "bg-blue-600/90 border-blue-500/60 text-white"
                  : isDone
                  ? "bg-emerald-900/80 border-emerald-700/50 text-emerald-400"
                  : "bg-zinc-900/90 border-zinc-700 text-zinc-400"
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Painel principal */}
            <div className={`h-full rounded-l-2xl border-l border-t border-b shadow-2xl overflow-hidden flex flex-col ${
              isActive
                ? "bg-zinc-950 border-blue-500/30 shadow-blue-900/30"
                : isDone
                ? "bg-zinc-950 border-emerald-500/30 shadow-emerald-900/20"
                : isError
                ? "bg-zinc-950 border-red-500/30"
                : "bg-zinc-950 border-zinc-800"
            }`}>

              {/* Header */}
              <div className={`px-5 py-4 border-b flex items-center justify-between ${
                isActive ? "border-blue-500/20 bg-blue-950/20" :
                isDone ? "border-emerald-500/20 bg-emerald-950/20" :
                isError ? "border-red-500/20 bg-red-950/20" :
                "border-zinc-800 bg-zinc-900/50"
              }`}>
                <div className="flex items-center gap-2">
                  {isActive ? (
                    <div className="relative">
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-400 rounded-full animate-ping" />
                    </div>
                  ) : isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : isError ? (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-zinc-400" />
                  )}
                  <h3 className="text-sm font-bold text-white font-mono">
                    {isActive ? "Varredura em andamento" :
                     isDone ? "Varredura concluída" :
                     isError ? "Falha na varredura" :
                     "Sincronização"}
                  </h3>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Conteúdo */}
              <div className="flex-1 p-5 space-y-5 overflow-y-auto">

                {/* Status badge */}
                <div className={`text-center py-4 rounded-xl border ${
                  isActive ? "bg-blue-950/20 border-blue-500/20" :
                  isDone ? "bg-emerald-950/20 border-emerald-500/20" :
                  isError ? "bg-red-950/20 border-red-500/20" :
                  "bg-zinc-900/50 border-zinc-800"
                }`}>
                  {isActive ? (
                    <>
                      <p className="text-3xl font-bold text-white font-mono">{pct}%</p>
                      <p className="text-blue-400 text-xs font-mono mt-1">varrendo o tenant</p>
                    </>
                  ) : isDone ? (
                    <>
                      <p className="text-3xl font-bold text-emerald-400 font-mono">{state.imported}</p>
                      <p className="text-zinc-400 text-xs font-mono mt-1">reuniões importadas</p>
                    </>
                  ) : isError ? (
                    <>
                      <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                      <p className="text-red-400 text-xs font-mono">{state.message || "Erro desconhecido"}</p>
                    </>
                  ) : null}
                </div>

                {/* Barra de progresso */}
                {(isActive || isDone) && state.total > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {state.scanned} / {state.total} usuários
                      </span>
                      <span className={isActive ? "text-blue-400" : "text-emerald-400"}>
                        {pct}%
                      </span>
                    </div>
                    <div className="w-full bg-zinc-800/80 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                          isActive
                            ? "bg-gradient-to-r from-blue-700 to-blue-400"
                            : isDone
                            ? "bg-gradient-to-r from-emerald-700 to-emerald-400"
                            : "bg-zinc-600"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Usuário atual */}
                {isActive && state.currentUser && (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 space-y-1">
                    <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Processando</p>
                    <p className="text-xs text-blue-300 font-mono truncate">→ {state.currentUser}</p>
                  </div>
                )}

                {/* Métricas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Download className="w-3 h-3 text-emerald-400" />
                    </div>
                    <p className="text-lg font-bold text-white font-mono">{state.imported}</p>
                    <p className="text-[10px] text-zinc-500 font-mono">reuniões importadas</p>
                  </div>
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Users className="w-3 h-3 text-blue-400" />
                    </div>
                    <p className="text-lg font-bold text-white font-mono">{state.scanned}</p>
                    <p className="text-[10px] text-zinc-500 font-mono">usuários varridos</p>
                  </div>
                </div>

                {/* Configuração usada */}
                {state.daysBack && (
                  <div className="text-center">
                    <span className="text-[10px] text-zinc-600 font-mono">
                      Janela temporal: últimos {state.daysBack} dias
                    </span>
                  </div>
                )}

                {/* Tempo decorrido */}
                {isActive && state.startedAt && (
                  <div className="text-center">
                    <span className="text-[10px] text-zinc-600 font-mono">
                      Em execução há {elapsedStr}
                    </span>
                  </div>
                )}

              </div>

              {/* Footer */}
              {(isDone || isError) && (
                <div className="p-4 border-t border-zinc-800">
                  <button
                    onClick={handleDismiss}
                    className="w-full py-2 text-xs font-mono text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg transition-colors"
                  >
                    Fechar e limpar
                  </button>
                </div>
              )}

              {/* Footer durante sync */}
              {isActive && (
                <div className="p-4 border-t border-zinc-800/50 bg-zinc-900/30">
                  <p className="text-[10px] text-zinc-600 font-mono text-center">
                    Pode navegar livremente — a varredura continua em segundo plano
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

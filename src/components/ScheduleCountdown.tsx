"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock, Play, Loader2, CheckCircle2, AlertCircle, Users, Download } from "lucide-react";
import { useSyncProgress } from "@/components/SyncProgressPanel";

export function ScheduleCountdown() {
  const [intervalMinutes, setIntervalMinutes] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const [isTriggeringManual, setIsTriggeringManual] = useState(false);

  // Usa o mesmo estado global do SyncProgressPanel
  const { state: syncState } = useSyncProgress();

  const isRunning = syncState.status === "running";
  const isDone = syncState.status === "done";
  const isError = syncState.status === "error";
  const pct = syncState.total > 0 ? Math.round((syncState.scanned / syncState.total) * 100) : 0;

  // Lê configuração do schedule do banco
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/system", { cache: "no-store" });
      const data = await res.json();
      const mins: number | null = data.settings?.syncIntervalMinutes ?? null;
      setIntervalMinutes(mins);

      try {
        const s = localStorage.getItem("teamstextify_last_scan_at");
        if (s) setLastScanAt(new Date(s));
      } catch {}
    } catch {}
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Quando um scan termina (done/error), registra o horário do último scan
  useEffect(() => {
    if (isDone || isError) {
      const now = new Date();
      setLastScanAt(now);
      try { localStorage.setItem("teamstextify_last_scan_at", now.toISOString()); } catch {}
    }
  }, [isDone, isError]);

  // Countdown ticker — só ativo quando não está rodando
  useEffect(() => {
    if (!intervalMinutes || !lastScanAt || isRunning) {
      setSecondsLeft(intervalMinutes ? intervalMinutes * 60 : 0);
      return;
    }
    const total = intervalMinutes * 60;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - lastScanAt.getTime()) / 1000);
      const remaining = Math.max(total - elapsed, 0);
      setSecondsLeft(remaining);
      if (remaining === 0) {
        triggerScan();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMinutes, lastScanAt, isRunning]);

  const triggerScan = () => {
    if (isRunning) return;
    setIsTriggeringManual(true);
    window.dispatchEvent(new CustomEvent("start_global_sync", { detail: { daysBack: 7 } }));
    setTimeout(() => setIsTriggeringManual(false), 2000);
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const progress = intervalMinutes && secondsLeft > 0
    ? Math.round(((intervalMinutes * 60 - secondsLeft) / (intervalMinutes * 60)) * 100)
    : intervalMinutes ? 100 : 0;

  return (
    <Card className="bg-zinc-950 border-zinc-800 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl" />
      <CardHeader className="pb-3 border-b border-zinc-800/50">
        <CardTitle className="text-white flex items-center justify-between text-sm uppercase tracking-wider font-mono">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-400" />
            {isRunning ? "Varrendo Tenant" : isDone ? "Varredura Concluída" : isError ? "Falha na Varredura" : "Próximo Scan"}
          </div>
          {intervalMinutes ? (
            <span className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded border font-mono ${
              isRunning
                ? "text-blue-400 bg-blue-500/10 border-blue-500/30"
                : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-blue-400 animate-ping" : "bg-emerald-400 animate-pulse"}`} />
              {isRunning ? "AO VIVO" : `A CADA ${intervalMinutes}MIN`}
            </span>
          ) : (
            <span className="text-[10px] text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 font-mono">
              MANUAL
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">

        {/* Estado: RODANDO */}
        {isRunning && (
          <>
            {/* Barra de progresso */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {syncState.scanned} / {syncState.total || "?"} usuários
                </span>
                <span className="text-blue-400">{pct}%</span>
              </div>
              <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-700 to-blue-400 transition-all duration-500"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
            </div>

            {/* Usuário atual */}
            {syncState.currentUser && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2">
                <p className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider mb-0.5">Processando</p>
                <p className="text-[11px] text-blue-300 font-mono truncate">→ {syncState.currentUser}</p>
              </div>
            )}

            {/* Contador de importadas */}
            <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400">
              <Download className="w-3 h-3 shrink-0" />
              <span>{syncState.imported} reuniões encontradas até agora</span>
            </div>
          </>
        )}

        {/* Estado: CONCLUÍDO */}
        {isDone && (
          <div className="text-center py-2">
            <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto mb-2" />
            <p className="text-2xl font-bold font-mono text-white">{syncState.imported}</p>
            <p className="text-[10px] text-zinc-400 font-mono">reuniões importadas</p>
            <p className="text-[9px] text-zinc-600 font-mono mt-1">
              {syncState.scanned} usuários varridos · últimos {syncState.daysBack || 7} dias
            </p>
          </div>
        )}

        {/* Estado: ERRO */}
        {isError && (
          <div className="text-center py-2">
            <AlertCircle className="w-7 h-7 text-red-400 mx-auto mb-2" />
            <p className="text-[11px] text-red-300 font-mono">{syncState.message || "Erro desconhecido na varredura"}</p>
          </div>
        )}

        {/* Estado: IDLE — exibe countdown */}
        {!isRunning && !isError && (
          <>
            {intervalMinutes ? (
              <div className="text-center">
                <div className={`text-4xl font-bold font-mono tracking-widest ${isDone ? "text-emerald-300" : "text-white"}`}>
                  {secondsLeft > 0 ? fmt(secondsLeft) : "—"}
                </div>
                <p className="text-[10px] text-zinc-600 font-mono mt-1 uppercase tracking-widest">
                  {isDone
                    ? "concluído · aguardando próximo ciclo"
                    : "restantes para o próximo scan"}
                </p>

                {/* Barra de progresso do intervalo */}
                <div className="w-full bg-zinc-900 rounded-full h-1 overflow-hidden mt-3">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600/60 to-blue-400/60 transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {lastScanAt && (
                  <p className="text-[9px] text-zinc-600 font-mono mt-1.5">
                    Último scan: {lastScanAt.toLocaleTimeString("pt-BR")}
                    {isDone && ` · ${syncState.imported} importadas`}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-2">
                <CalendarClock className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-500 font-mono">Agendamento desativado.</p>
                <p className="text-[10px] text-zinc-600 mt-1">Configure em Sync API → Schedule.</p>
              </div>
            )}
          </>
        )}

        {/* Botão Escanear Agora */}
        <button
          onClick={triggerScan}
          disabled={isRunning || isTriggeringManual}
          className={`w-full flex items-center justify-center gap-2 py-2 text-[11px] font-mono uppercase tracking-wider border rounded-md transition-all ${
            isRunning
              ? "border-blue-500/20 text-blue-400/50 cursor-not-allowed"
              : "text-blue-400 border-blue-500/30 hover:bg-blue-500/10 hover:border-blue-500/50"
          }`}
        >
          {isRunning || isTriggeringManual
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Varrendo...</>
            : <><Play className="w-3 h-3" /> Escanear Agora</>
          }
        </button>
      </CardContent>
    </Card>
  );
}

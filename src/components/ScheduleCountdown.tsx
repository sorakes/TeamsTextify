"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Play, Loader2, CalendarClock } from "lucide-react";

export function ScheduleCountdown() {
  const [intervalMinutes, setIntervalMinutes] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Lê configuração do schedule e o estado do sync global
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/system", { cache: "no-store" });
      const data = await res.json();
      const mins: number | null = data.settings?.syncIntervalMinutes ?? null;
      setIntervalMinutes(mins);

      // Lê o último scan do localStorage
      try {
        const s = localStorage.getItem("teamstextify_last_scan_at");
        if (s) setLastScanAt(new Date(s));
      } catch {}
    } catch {}
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Countdown ticker
  useEffect(() => {
    if (!intervalMinutes || !lastScanAt) {
      setSecondsLeft(0);
      return;
    }
    const total = intervalMinutes * 60;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - lastScanAt.getTime()) / 1000);
      const remaining = Math.max(total - elapsed, 0);
      setSecondsLeft(remaining);
      // Auto-disparo quando chega a zero
      if (remaining === 0) {
        triggerScan();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMinutes, lastScanAt]);

  // Ouve evento de sync iniciado externamente
  useEffect(() => {
    const handler = () => {
      const now = new Date();
      setLastScanAt(now);
      try { localStorage.setItem("teamstextify_last_scan_at", now.toISOString()); } catch {}
    };
    window.addEventListener("start_global_sync", handler);
    return () => window.removeEventListener("start_global_sync", handler);
  }, []);

  const triggerScan = () => {
    if (isScanning) return;
    setIsScanning(true);
    const now = new Date();
    setLastScanAt(now);
    try { localStorage.setItem("teamstextify_last_scan_at", now.toISOString()); } catch {}
    window.dispatchEvent(new CustomEvent("start_global_sync", { detail: { daysBack: 7 } }));
    setTimeout(() => setIsScanning(false), 3000);
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
    <Card className="bg-zinc-950 border-zinc-800 shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl" />
      <CardHeader className="pb-3 border-b border-zinc-800/50">
        <CardTitle className="text-white flex items-center justify-between text-sm uppercase tracking-wider font-mono">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-400" />
            Próximo Scan
          </div>
          {intervalMinutes ? (
            <span className="flex items-center gap-2 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              A CADA {intervalMinutes}MIN
            </span>
          ) : (
            <span className="text-[10px] text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
              MANUAL
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        {intervalMinutes ? (
          <>
            {/* Countdown */}
            <div className="text-center">
              <div className="text-4xl font-bold font-mono text-white tracking-widest">
                {secondsLeft > 0 ? fmt(secondsLeft) : (
                  <span className="text-emerald-400 animate-pulse">SCANNING</span>
                )}
              </div>
              <p className="text-[10px] text-zinc-600 font-mono mt-1 uppercase tracking-widest">
                {secondsLeft > 0 ? "restantes para o próximo scan" : "varrendo agora..."}
              </p>
            </div>

            {/* Barra de progresso */}
            <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-1.5 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>

            {lastScanAt && (
              <p className="text-[10px] text-zinc-600 font-mono text-center">
                Último scan: {lastScanAt.toLocaleTimeString("pt-BR")}
              </p>
            )}
          </>
        ) : (
          <div className="text-center py-2">
            <Clock className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-500 font-mono">
              Agendamento desativado.
            </p>
            <p className="text-[10px] text-zinc-600 mt-1">
              Configure em Sync API → Schedule.
            </p>
          </div>
        )}

        {/* Botão Escanear Agora */}
        <button
          onClick={triggerScan}
          disabled={isScanning}
          className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-mono uppercase tracking-wider text-blue-400 border border-blue-500/30 rounded-md hover:bg-blue-500/10 hover:border-blue-500/50 transition-all disabled:opacity-50"
        >
          {isScanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          Escanear Agora
        </button>
      </CardContent>
    </Card>
  );
}

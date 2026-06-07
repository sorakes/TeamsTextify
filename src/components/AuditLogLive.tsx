"use client";

import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AuditLogEntry {
  id: string;
  level: "INFO" | "WARNING" | "ERROR";
  source: string;
  message: string;
  createdAt: string;
}

const LEVEL_STYLES: Record<string, string> = {
  ERROR: "text-red-400",
  WARNING: "text-amber-400",
  INFO: "text-blue-400",
};

const LEVEL_DOT: Record<string, string> = {
  ERROR: "bg-red-500",
  WARNING: "bg-amber-400",
  INFO: "bg-blue-400",
};

export function AuditLogLive() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const lastIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/audit-logs?limit=15", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const incoming: AuditLogEntry[] = data.logs || [];

      if (incoming.length === 0) {
        setIsConnected(true);
        return;
      }

      if (isFirstLoad.current) {
        // Primeiro carregamento: mostra os últimos 15
        setLogs(incoming);
        lastIdRef.current = incoming[0]?.id ?? null;
        isFirstLoad.current = false;
      } else {
        // Polling incremental: adiciona apenas logs novos no topo
        const lastId = lastIdRef.current;
        const newLogs = lastId
          ? incoming.filter((l) => l.id !== lastId && new Date(l.createdAt) > new Date(logs[0]?.createdAt ?? 0))
          : [];

        if (newLogs.length > 0) {
          setLogs((prev) => {
            const merged = [...newLogs, ...prev].slice(0, 30); // máx 30 entradas no display
            return merged;
          });
          lastIdRef.current = newLogs[0]?.id ?? lastIdRef.current;
        }
      }

      setIsConnected(true);
    } catch {
      setIsConnected(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      {/* Header do log */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-red-500 animate-pulse" : "bg-zinc-600"}`}
          />
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            Audit Log
          </span>
        </div>
        <span className="text-[9px] font-mono text-zinc-600">
          {isConnected ? "• ao vivo" : "offline"}
        </span>
      </div>

      {/* Lista de logs */}
      <ScrollArea className="h-[250px] pr-1">
        <div ref={scrollRef} className="space-y-3 font-mono text-xs">
          {logs.length === 0 && (
            <p className="text-zinc-600 text-center pt-8 font-mono text-xs">
              Nenhum log registrado.
            </p>
          )}
          {logs.map((log, i) => (
            <div
              key={log.id}
              className={`flex flex-col gap-0.5 border-b border-zinc-800/50 pb-2 transition-opacity duration-300 ${
                i === 0 ? "animate-in fade-in slide-in-from-top-2 duration-500" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_DOT[log.level] || "bg-zinc-500"}`} />
                <span className={`${LEVEL_STYLES[log.level] || "text-zinc-400"} font-semibold`}>
                  [{log.level}]
                </span>
                <span className="text-zinc-600 text-[9px]">
                  {new Date(log.createdAt).toLocaleTimeString("pt-BR")}
                </span>
                <span className="text-zinc-700 text-[9px] ml-auto">{log.source}</span>
              </div>
              <p className="text-zinc-300 pl-3.5 leading-relaxed break-words">{log.message}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

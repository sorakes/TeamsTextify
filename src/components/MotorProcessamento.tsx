"use client";

import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Cpu, Loader2, Clock, CheckCircle2 } from "lucide-react";

interface QueueJob {
  jobId: string | undefined;
  meetingId: string;
  subject: string;
  organizer: string;
  progress: number;
  state: "ACTIVE" | "WAITING";
  position?: number;
}

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export function MotorProcessamento() {
  const [activeJobs, setActiveJobs] = useState<QueueJob[]>([]);
  const [waitingJobs, setWaitingJobs] = useState<QueueJob[]>([]);
  const [stats, setStats] = useState<QueueStats>({ waiting: 0, active: 0, completed: 0, failed: 0 });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState(false);

  const fetchQueueStatus = async () => {
    try {
      const res = await fetch("/api/sync/queue-status", { cache: "no-store" });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setActiveJobs(data.active || []);
      setWaitingJobs(data.waiting || []);
      setStats(data.queue || { waiting: 0, active: 0, completed: 0, failed: 0 });
      setLastUpdated(new Date());
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    fetchQueueStatus();
    const interval = setInterval(fetchQueueStatus, 3000); // Polling a cada 3 segundos
    return () => clearInterval(interval);
  }, []);

  // Combina: ativos primeiro, depois aguardando (máx 8 no total)
  const displayJobs = [
    ...activeJobs,
    ...waitingJobs.slice(0, Math.max(0, 8 - activeJobs.length)),
  ];

  return (
    <div className="space-y-3">

      {/* Barra de status do motor */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          {stats.active > 0 ? (
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">
                {stats.active} WORKER{stats.active > 1 ? "S" : ""} ATIVO{stats.active > 1 ? "S" : ""}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-zinc-600" />
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">OCIOSO</span>
            </div>
          )}

          <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
            <span className="text-amber-400">{stats.waiting} na fila</span>
            <span className="text-emerald-400">{stats.completed} concluídos</span>
            {stats.failed > 0 && <span className="text-red-400">{stats.failed} falhas</span>}
          </div>
        </div>

        {lastUpdated && !error && (
          <div className="flex items-center gap-1 text-[9px] text-zinc-600 font-mono">
            <Clock className="w-2.5 h-2.5" />
            {lastUpdated.toLocaleTimeString("pt-BR")}
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-ping ml-1" />
          </div>
        )}
        {error && (
          <span className="text-[9px] text-red-500 font-mono">REDIS OFFLINE</span>
        )}
      </div>

      {/* Tabela de jobs */}
      <Table>
        <TableHeader className="border-zinc-800">
          <TableRow className="hover:bg-transparent border-zinc-800">
            <TableHead className="text-zinc-500 text-[10px] uppercase tracking-wider w-[100px]">ID Reunião</TableHead>
            <TableHead className="text-zinc-500 text-[10px] uppercase tracking-wider">Assunto</TableHead>
            <TableHead className="text-zinc-500 text-[10px] uppercase tracking-wider">Responsável</TableHead>
            <TableHead className="text-zinc-500 text-[10px] uppercase tracking-wider text-right">Status na Fila</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayJobs.length === 0 && (
            <TableRow className="border-zinc-800">
              <TableCell colSpan={4} className="text-center py-8 text-zinc-600 font-mono text-xs">
                {error
                  ? "⚠️ Não foi possível conectar ao Redis"
                  : "Nenhum job em processamento no momento"
                }
              </TableCell>
            </TableRow>
          )}

          {displayJobs.map((job) => (
            <TableRow
              key={job.jobId || job.meetingId}
              className={`border-zinc-800/60 transition-colors ${
                job.state === "ACTIVE"
                  ? "bg-emerald-950/10 hover:bg-emerald-950/20"
                  : "hover:bg-zinc-900/60"
              }`}
            >
              <TableCell className="font-mono text-[10px] text-zinc-500">
                {job.meetingId?.substring(0, 8) || "—"}
              </TableCell>

              <TableCell className="max-w-[200px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-zinc-200 text-sm font-medium truncate">{job.subject}</span>
                  {job.state === "ACTIVE" && job.progress > 0 && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-emerald-400 font-mono shrink-0">{job.progress}%</span>
                    </div>
                  )}
                </div>
              </TableCell>

              <TableCell className="text-blue-400 font-mono text-xs">
                @{job.organizer}
              </TableCell>

              <TableCell className="text-right">
                {job.state === "ACTIVE" ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/60 text-emerald-300 bg-emerald-500/10 text-[10px] uppercase tracking-widest gap-1"
                  >
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    PROCESSANDO
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-500/50 text-amber-400 bg-amber-500/10 text-[10px] uppercase tracking-widest"
                  >
                    #{job.position} NA FILA
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Rodapé quando há mais jobs */}
      {stats.waiting > 8 && (
        <p className="text-center text-[10px] text-zinc-600 font-mono pt-1">
          + {stats.waiting - 8} reuniões aguardando na fila...
        </p>
      )}
    </div>
  );
}

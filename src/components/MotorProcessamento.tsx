"use client";

import { useEffect, useState, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cpu, Loader2, Clock, Pause, Play, RefreshCw, AlertTriangle } from "lucide-react";

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
  isPaused: boolean;
}

export function MotorProcessamento() {
  const [activeJobs, setActiveJobs] = useState<QueueJob[]>([]);
  const [waitingJobs, setWaitingJobs] = useState<QueueJob[]>([]);
  const [stats, setStats] = useState<QueueStats>({ waiting: 0, active: 0, completed: 0, failed: 0, isPaused: false });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const [isControlLoading, setIsControlLoading] = useState<"pause" | "resume" | "retry" | null>(null);
  const [controlFeedback, setControlFeedback] = useState<string | null>(null);

  const fetchQueueStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/queue-status", { cache: "no-store" });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setActiveJobs(data.active || []);
      setWaitingJobs(data.waiting || []);
      setStats(data.queue || { waiting: 0, active: 0, completed: 0, failed: 0, isPaused: false });
      setLastUpdated(new Date());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchQueueStatus();
    const interval = setInterval(fetchQueueStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchQueueStatus]);

  const handleControl = async (action: "pause" | "resume" | "retry-failed") => {
    const loadingKey = action === "retry-failed" ? "retry" : action;
    setIsControlLoading(loadingKey as "pause" | "resume" | "retry");
    setControlFeedback(null);
    try {
      const res = await fetch("/api/sync/queue-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setControlFeedback(data.message);
        await fetchQueueStatus(); // Atualiza estado imediatamente
      } else {
        setControlFeedback(`Erro: ${data.error || "Falha desconhecida"}`);
      }
    } catch {
      setControlFeedback("Erro ao comunicar com a API.");
    } finally {
      setIsControlLoading(null);
      // Limpa o feedback após 4 segundos
      setTimeout(() => setControlFeedback(null), 4000);
    }
  };

  // Combina: ativos primeiro, depois aguardando (máx 8 no total)
  const displayJobs = [
    ...activeJobs,
    ...waitingJobs.slice(0, Math.max(0, 8 - activeJobs.length)),
  ];

  return (
    <div className="space-y-3">

      {/* Barra de status + controles do motor */}
      <div className="flex items-center justify-between px-1 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {/* Estado: Pausado / Ativo / Ocioso */}
          {stats.isPaused ? (
            <div className="flex items-center gap-1.5">
              <Pause className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest">
                FILA PAUSADA
              </span>
            </div>
          ) : stats.active > 0 ? (
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
            {stats.failed > 0 && (
              <span className="text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {stats.failed} falhas
              </span>
            )}
          </div>
        </div>

        {/* Botões de controle */}
        <div className="flex items-center gap-2">
          {/* Reprocessar falhas - só aparece quando há falhas */}
          {stats.failed > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={isControlLoading !== null}
              onClick={() => handleControl("retry-failed")}
              className="h-7 text-[10px] font-mono uppercase tracking-wide border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/60 transition-all gap-1.5"
            >
              {isControlLoading === "retry" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Reprocessar {stats.failed} falha{stats.failed > 1 ? "s" : ""}
            </Button>
          )}

          {/* Pausar / Retomar */}
          {stats.isPaused ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isControlLoading !== null}
              onClick={() => handleControl("resume")}
              className="h-7 text-[10px] font-mono uppercase tracking-wide border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-500/60 transition-all gap-1.5"
            >
              {isControlLoading === "resume" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              Retomar Fila
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={isControlLoading !== null}
              onClick={() => handleControl("pause")}
              className="h-7 text-[10px] font-mono uppercase tracking-wide border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/60 transition-all gap-1.5"
            >
              {isControlLoading === "pause" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Pause className="w-3 h-3" />
              )}
              Pausar Fila
            </Button>
          )}
        </div>
      </div>

      {/* Feedback de ação de controle */}
      {controlFeedback && (
        <div className="px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700 text-[10px] font-mono text-zinc-300 animate-in fade-in slide-in-from-top-1 duration-300">
          {controlFeedback}
        </div>
      )}

      {/* Banner de fila pausada */}
      {stats.isPaused && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 animate-in fade-in duration-300">
          <Pause className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[10px] font-mono text-amber-300">
            O motor está pausado. Novos jobs não serão processados até você retomar.
          </span>
        </div>
      )}

      {/* Timestamp + Indicador Redis */}
      <div className="flex items-center justify-between px-1">
        <div />
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
                  : stats.isPaused
                  ? "⏸ Fila pausada — jobs aguardam retomada"
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
                  stats.isPaused ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500/50 text-amber-400 bg-amber-500/10 text-[10px] uppercase tracking-widest gap-1"
                    >
                      <Pause className="w-2.5 h-2.5" />
                      PAUSADO
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/60 text-emerald-300 bg-emerald-500/10 text-[10px] uppercase tracking-widest gap-1"
                    >
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      PROCESSANDO
                    </Badge>
                  )
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

"use client";

import React, { useState, useEffect } from "react";
import {
  X, FileText, AudioLines, Info, Calendar, Clock, Users, User,
  Link as LinkIcon, Download, ChevronRight, RefreshCw, Loader2,
  AlertTriangle, Terminal
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MeetingDrawerProps {
  meeting: any | null;
  onClose: () => void;
  onReprocess?: (meeting: any) => Promise<any>;
}

interface FailureLog {
  id: string;
  level: string;
  message: string;
  createdAt: string;
}

export function MeetingDrawer({ meeting, onClose, onReprocess }: MeetingDrawerProps) {
  const [activeTab, setActiveTab] = useState<"transcricao" | "ata" | "info" | "falhas">("transcricao");
  const [failureLogs, setFailureLogs] = useState<FailureLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [reprocessFeedback, setReprocessFeedback] = useState<string | null>(null);

  // ── Todos os hooks ANTES de qualquer early return ───────────────────────
  // Carrega logs quando a aba de falhas é aberta
  useEffect(() => {
    if (!meeting?.id) return;
    if (activeTab === "falhas") {
      setLogsLoading(true);
      fetch(`/api/meetings/${meeting.id}/reprocess`)
        .then(r => r.json())
        .then(data => setFailureLogs(data.logs || []))
        .catch(() => setFailureLogs([]))
        .finally(() => setLogsLoading(false));
    }
  }, [activeTab, meeting?.id]);

  // Pré-carrega logs quando o meeting muda (útil para meetings com ERROR)
  useEffect(() => {
    if (!meeting?.id) return;
    const isErr = meeting.status === "ERROR" || meeting.status === "AWAITING_RECORDING";
    if (isErr) {
      fetch(`/api/meetings/${meeting.id}/reprocess`)
        .then(r => r.json())
        .then(data => setFailureLogs(data.logs || []))
        .catch(() => {});
    } else {
      setFailureLogs([]);
    }
  }, [meeting?.id, meeting?.status]);

  // Guard: não renderiza nada sem meeting
  if (!meeting) return null;

  const participants: string[] = (() => { try { return JSON.parse(meeting.participants); } catch { return []; } })();
  const duration = meeting.durationMinutes || Math.round((new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime()) / 60000);
  const hasTranscript = !!meeting.transcriptRaw;
  const hasMinutes = !!meeting.minutesText;
  const isError = meeting.status === "ERROR";
  const isAwaiting = meeting.status === "AWAITING_RECORDING";
  const canReprocess = isError || isAwaiting;

  const handleReprocess = async () => {
    if (!onReprocess) return;
    setIsReprocessing(true);
    setReprocessFeedback(null);
    try {
      const data = await onReprocess(meeting);
      if (data.success) {
        setReprocessFeedback("✅ Reenfileirado com sucesso!");
      } else {
        setReprocessFeedback(`❌ ${data.error || "Erro desconhecido"}`);
      }
    } catch {
      setReprocessFeedback("❌ Erro de conexão");
    } finally {
      setIsReprocessing(false);
      setTimeout(() => setReprocessFeedback(null), 4000);
    }
  };

  // Formata transcrição diarizada para visual rico
  function renderTranscript(raw: string) {
    const lines = raw.split("\n").filter(Boolean);
    return lines.map((line, idx) => {
      const match = line.match(/^\[(.+?)\]\s+(\w[\w\s]*):\s+(.+)$/);
      if (match) {
        const [, time, speaker, text] = match;
        const speakerColors = [
          "text-blue-400", "text-emerald-400", "text-purple-400",
          "text-amber-400", "text-rose-400", "text-cyan-400"
        ];
        const colorIdx = speaker.charCodeAt(speaker.length - 1) % speakerColors.length;
        return (
          <div key={idx} className="flex gap-3 py-2 border-b border-zinc-800/40 hover:bg-zinc-800/20 rounded px-2 transition-colors">
            <span className="text-zinc-600 font-mono text-[10px] shrink-0 pt-0.5 w-28">{time}</span>
            <div className="flex-1">
              <span className={`font-semibold text-xs font-mono ${speakerColors[colorIdx]}`}>{speaker}:</span>
              <span className="text-zinc-300 text-sm ml-2">{text}</span>
            </div>
          </div>
        );
      }
      return (
        <div key={idx} className="py-1.5 px-2 text-zinc-400 text-sm border-b border-zinc-800/20">
          {line}
        </div>
      );
    });
  }

  return (
    <>
      {/* Overlay Escuro */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Gaveta Lateral */}
      <div className="fixed top-0 right-0 h-full w-full md:w-[640px] lg:w-[860px] bg-zinc-950 border-l border-zinc-800 shadow-2xl z-50 flex flex-col">

        {/* Header */}
        <div className={`p-5 border-b border-zinc-800 flex items-start justify-between bg-gradient-to-r ${
          isError ? "from-red-950/30 to-zinc-950" : "from-zinc-900 to-zinc-950"
        }`}>
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="outline" className={`text-[10px] uppercase tracking-widest shrink-0 ${
                meeting.status === "DONE" ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" :
                isError ? "border-red-500/50 text-red-400 bg-red-500/10" :
                isAwaiting ? "border-zinc-500/50 text-zinc-400 bg-zinc-500/10" :
                "border-amber-500/50 text-amber-400 bg-amber-500/10"
              }`}>
                {isAwaiting ? "SEM GRAVAÇÃO" : meeting.status}
              </Badge>
              <ChevronRight className="w-3 h-3 text-zinc-600" />
              <span className="text-zinc-500 text-xs">{new Date(meeting.startedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</span>

              {/* Indicador de falha com contagem de logs */}
              {canReprocess && failureLogs.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-red-400 bg-red-900/20 border border-red-700/30 rounded px-2 py-0.5">
                  <AlertTriangle className="w-3 h-3" />
                  {failureLogs.length} log{failureLogs.length > 1 ? "s" : ""} de falha
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-white leading-tight line-clamp-2">{meeting.subject}</h2>
            <p className="text-zinc-400 text-sm mt-1">
              <span className="text-blue-400">@{meeting.organizerName || meeting.organizerEmail?.split("@")[0]}</span>
              <span className="text-zinc-600 mx-2">·</span>
              <span>{duration} min</span>
              <span className="text-zinc-600 mx-2">·</span>
              <span>{participants.length} participantes</span>
            </p>

            {/* Feedback de reprocessamento */}
            {reprocessFeedback && (
              <p className="text-xs font-mono mt-2 text-emerald-400 animate-in fade-in duration-300">{reprocessFeedback}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Botão Reprocessar no header (só para meetings com falha) */}
            {canReprocess && onReprocess && (
              <button
                onClick={handleReprocess}
                disabled={isReprocessing}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono uppercase bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 hover:border-red-500/60 text-red-400 hover:text-red-300 rounded-md transition-all"
              >
                {isReprocessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Reprocessar
              </button>
            )}
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 p-2 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-5 border-b border-zinc-800 bg-zinc-900/30 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("transcricao")}
            className={`relative px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors border-b-2 shrink-0 ${
              activeTab === "transcricao"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-300"
            }`}
          >
            <AudioLines className="w-4 h-4" />
            Transcrição
            {hasTranscript && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />}
          </button>
          <button
            onClick={() => setActiveTab("ata")}
            className={`relative px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors border-b-2 shrink-0 ${
              activeTab === "ata"
                ? "border-purple-500 text-purple-400"
                : "border-transparent text-zinc-400 hover:text-zinc-300"
            }`}
          >
            <FileText className="w-4 h-4" />
            Ata Inteligente
            {hasMinutes && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />}
          </button>
          <button
            onClick={() => setActiveTab("info")}
            className={`relative px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors border-b-2 shrink-0 ${
              activeTab === "info"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-300"
            }`}
          >
            <Info className="w-4 h-4" />
            Metadados
          </button>

          {/* Aba de Logs de Falha — aparece sempre, destaque quando tem erro */}
          <button
            onClick={() => setActiveTab("falhas")}
            className={`relative px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors border-b-2 shrink-0 ${
              activeTab === "falhas"
                ? "border-red-500 text-red-400"
                : canReprocess && failureLogs.length > 0
                ? "border-transparent text-red-400/70 hover:text-red-400 animate-pulse"
                : "border-transparent text-zinc-400 hover:text-zinc-300"
            }`}
          >
            <Terminal className="w-4 h-4" />
            Logs de Falha
            {failureLogs.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 text-[9px] font-mono border border-red-700/30">
                {failureLogs.length}
              </span>
            )}
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">

          {/* TAB 1: TRANSCRIÇÃO */}
          {activeTab === "transcricao" && (
            <div className="p-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {!hasTranscript ? (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500 gap-3">
                  <AudioLines className="w-16 h-16 opacity-10" />
                  <p className="text-center">
                    {meeting.status === "PENDING" || meeting.status === "TRANSCRIBING"
                      ? "Aguardando processamento pelo Motor de Diarização..."
                      : isError
                      ? "Falha no processamento — veja a aba Logs de Falha para detalhes."
                      : "Nenhuma transcrição disponível para esta reunião."}
                  </p>
                  {(meeting.status === "PENDING" || meeting.status === "TRANSCRIBING") && (
                    <div className="flex gap-1 mt-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  )}
                  {isError && onReprocess && (
                    <button
                      onClick={handleReprocess}
                      disabled={isReprocessing}
                      className="mt-2 flex items-center gap-2 px-4 py-2 text-sm font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-md transition-all"
                    >
                      {isReprocessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Tentar reprocessar
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                      <AudioLines className="w-4 h-4 text-emerald-400" />
                      Transcrição Diarizada por Participante
                    </h3>
                    <span className="text-xs text-zinc-500 font-mono">
                      {meeting.transcriptRaw.split("\n").filter(Boolean).length} segmentos
                    </span>
                  </div>
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-0.5">
                    {renderTranscript(meeting.transcriptRaw)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ATA INTELIGENTE */}
          {activeTab === "ata" && (
            <div className="p-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {!hasMinutes ? (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500 gap-3">
                  <FileText className="w-16 h-16 opacity-10" />
                  <p className="text-center">
                    {meeting.status === "PENDING" || meeting.status === "GENERATING"
                      ? "A IA ainda está gerando a ata desta reunião..."
                      : "Nenhuma ata foi gerada para esta reunião."}
                  </p>
                </div>
              ) : (
                <div>
                  <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-4">
                    <FileText className="w-4 h-4 text-purple-400" />
                    Ata Estruturada pela IA
                  </h3>
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6">
                    <div className="whitespace-pre-wrap text-zinc-300 text-sm leading-relaxed">
                      {meeting.minutesText}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: METADADOS */}
          {activeTab === "info" && (
            <div className="p-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl divide-y divide-zinc-800">

                <div className="flex items-center gap-4 p-4">
                  <User className="w-5 h-5 text-zinc-500 shrink-0" />
                  <div>
                    <p className="text-zinc-500 text-xs mb-0.5">Organizador</p>
                    <p className="text-zinc-200 text-sm font-medium">
                      {meeting.organizerName}
                      {meeting.organizerEmail && (
                        <span className="text-zinc-500 font-normal ml-2">({meeting.organizerEmail})</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4">
                  <Calendar className="w-5 h-5 text-zinc-500 shrink-0" />
                  <div>
                    <p className="text-zinc-500 text-xs mb-0.5">Data e Hora</p>
                    <p className="text-zinc-200 text-sm font-medium">
                      {new Date(meeting.startedAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4">
                  <Clock className="w-5 h-5 text-zinc-500 shrink-0" />
                  <div>
                    <p className="text-zinc-500 text-xs mb-0.5">Duração</p>
                    <p className="text-zinc-200 text-sm font-medium">{duration} minutos</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4">
                  <Users className="w-5 h-5 text-zinc-500 shrink-0 mt-1" />
                  <div className="flex-1">
                    <p className="text-zinc-500 text-xs mb-2">Participantes ({participants.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {participants.length > 0
                        ? participants.map((p, idx) => (
                            <span key={idx} className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono">
                              {p}
                            </span>
                          ))
                        : <span className="text-zinc-500 italic text-sm">Nenhum participante listado</span>
                      }
                    </div>
                  </div>
                </div>

                {meeting.joinUrl && (
                  <div className="flex items-center gap-4 p-4">
                    <LinkIcon className="w-5 h-5 text-blue-500 shrink-0" />
                    <div>
                      <p className="text-zinc-500 text-xs mb-0.5">Link Original (MS Teams)</p>
                      <a
                        href={meeting.joinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm hover:underline transition-colors"
                      >
                        Acessar gravação no Microsoft Teams →
                      </a>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 p-4">
                  <Info className="w-5 h-5 text-zinc-500 shrink-0" />
                  <div>
                    <p className="text-zinc-500 text-xs mb-0.5">ID Técnico</p>
                    <p className="text-zinc-500 text-xs font-mono">{meeting.id}</p>
                  </div>
                </div>

                {/* Status de processamento */}
                {canReprocess && (
                  <div className="flex items-start gap-4 p-4 bg-red-950/10">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-red-400 text-xs mb-1 font-semibold">Falha no Processamento</p>
                      <p className="text-zinc-400 text-xs">
                        Esta reunião {isError ? "falhou durante o processamento" : "não possui gravação disponível no OneDrive"}.
                        Você pode tentar reprocessá-la manualmente.
                      </p>
                      {onReprocess && (
                        <button
                          onClick={handleReprocess}
                          disabled={isReprocessing}
                          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 rounded transition-all"
                        >
                          {isReprocessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          {reprocessFeedback ?? "Reprocessar agora"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* TAB 4: LOGS DE FALHA */}
          {activeTab === "falhas" && (
            <div className="p-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-red-400" />
                  Histórico de Falhas
                </h3>
                {canReprocess && onReprocess && (
                  <button
                    onClick={handleReprocess}
                    disabled={isReprocessing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 rounded transition-all"
                  >
                    {isReprocessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Reprocessar
                  </button>
                )}
              </div>

              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
                </div>
              ) : failureLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-600 gap-2">
                  <Terminal className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-mono">Nenhum log de falha registrado para esta reunião.</p>
                  <p className="text-xs text-zinc-700">Logs são gerados quando o worker tenta processar e falha.</p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="space-y-3">
                    {failureLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`rounded-xl border p-4 font-mono text-xs space-y-2 ${
                          log.level === "ERROR"
                            ? "bg-red-950/20 border-red-900/40"
                            : log.level === "WARNING"
                            ? "bg-amber-950/20 border-amber-900/40"
                            : "bg-zinc-900/60 border-zinc-800"
                        }`}
                      >
                        {/* Header do log */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              log.level === "ERROR" ? "bg-red-900/50 text-red-400" :
                              log.level === "WARNING" ? "bg-amber-900/50 text-amber-400" :
                              "bg-blue-900/50 text-blue-400"
                            }`}>
                              {log.level}
                            </span>
                            <span className="text-zinc-600 text-[10px]">
                              {new Date(log.createdAt).toLocaleString("pt-BR")}
                            </span>
                          </div>
                        </div>

                        {/* Mensagem de erro */}
                        <div className="bg-zinc-950/60 rounded-lg p-3 border border-zinc-800/50">
                          <p className={`leading-relaxed break-words whitespace-pre-wrap text-[11px] ${
                            log.level === "ERROR" ? "text-red-300" :
                            log.level === "WARNING" ? "text-amber-300" :
                            "text-zinc-300"
                          }`}>
                            {log.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {hasTranscript && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Transcrição disponível
              </span>
            )}
            {hasMinutes && (
              <span className="text-xs text-purple-400 flex items-center gap-1 ml-3">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />
                Ata no MemoryBrain
              </span>
            )}
            {canReprocess && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Falha no processamento
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-300 hover:text-white transition-colors rounded-md">
              Fechar
            </button>
            {hasMinutes && (
              <button className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-md shadow-lg transition-colors flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar PDF
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

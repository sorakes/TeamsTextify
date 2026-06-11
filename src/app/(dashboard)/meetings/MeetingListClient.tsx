"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, User, Users, Clock, Calendar, Eye, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { MeetingDrawer } from "@/components/MeetingDrawer";
import { useSearchParams } from "next/navigation";

export function MeetingListClient({ initialMeetings }: { initialMeetings: any[] }) {
  const [search, setSearch] = useState("");
  const [meetings, setMeetings] = useState<any[]>(initialMeetings);
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [reprocessFeedback, setReprocessFeedback] = useState<Record<string, string>>({});
  const searchParams = useSearchParams();

  // Abre o drawer automaticamente se vier da rota /meetings/[id]
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      const found = meetings.find(m => m.id === openId);
      if (found) setSelectedMeeting(found);
    }
  }, [searchParams, meetings]);

  const filtered = meetings.filter(m =>
    m.subject?.toLowerCase().includes(search.toLowerCase()) ||
    m.organizerName?.toLowerCase().includes(search.toLowerCase()) ||
    m.organizerEmail?.toLowerCase().includes(search.toLowerCase())
  );

  const doneMeetings = filtered.filter(m => m.status === "DONE").length;
  const pendingMeetings = filtered.filter(m => m.status === "PENDING").length;
  const errorMeetings = filtered.filter(m => m.status === "ERROR" || m.status === "AWAITING_RECORDING").length;

  // Reprocessa um meeting específico
  const handleReprocess = async (e: React.MouseEvent, meeting: any) => {
    e.stopPropagation(); // Não abre o drawer
    setReprocessingId(meeting.id);

    try {
      const res = await fetch(`/api/meetings/${meeting.id}/reprocess`, { method: "POST" });
      const data = await res.json();

      if (data.success) {
        // Atualiza o status local para PENDING
        setMeetings(prev =>
          prev.map(m => m.id === meeting.id ? { ...m, status: "PENDING" } : m)
        );
        // Se o drawer estiver aberto com essa reunião, atualiza ele também
        if (selectedMeeting?.id === meeting.id) {
          setSelectedMeeting((prev: any) => ({ ...prev, status: "PENDING" }));
        }
        setReprocessFeedback(prev => ({ ...prev, [meeting.id]: "✅ Reenfileirado!" }));
      } else {
        setReprocessFeedback(prev => ({ ...prev, [meeting.id]: "❌ Erro ao reprocessar" }));
      }
    } catch {
      setReprocessFeedback(prev => ({ ...prev, [meeting.id]: "❌ Erro de conexão" }));
    } finally {
      setReprocessingId(null);
      setTimeout(() => {
        setReprocessFeedback(prev => {
          const next = { ...prev };
          delete next[meeting.id];
          return next;
        });
      }, 3500);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Central de Atas</h2>
          <p className="text-zinc-400">
            Clique em uma reunião para ver a <span className="text-emerald-400 font-medium">transcrição completa</span> e a <span className="text-purple-400 font-medium">ata gerada pela IA</span>.
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar por assunto ou organizador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-2 pl-9 pr-3 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all shadow-inner"
          />
        </div>
      </div>

      {/* Stats rápidos */}
      <div className="flex gap-4 flex-wrap">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-sm">
          <span className="text-zinc-500">Total: </span>
          <span className="text-white font-bold">{filtered.length}</span>
        </div>
        <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-lg px-4 py-2 text-sm">
          <span className="text-zinc-500">Concluídas: </span>
          <span className="text-emerald-400 font-bold">{doneMeetings}</span>
        </div>
        <div className="bg-amber-950/30 border border-amber-800/30 rounded-lg px-4 py-2 text-sm">
          <span className="text-zinc-500">Processando: </span>
          <span className="text-amber-400 font-bold">{pendingMeetings}</span>
        </div>
        {errorMeetings > 0 && (
          <div className="bg-red-950/30 border border-red-800/30 rounded-lg px-4 py-2 text-sm flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-zinc-500">Com falha: </span>
            <span className="text-red-400 font-bold">{errorMeetings}</span>
          </div>
        )}
      </div>

      {/* Grid de Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((m) => {
          const participants: string[] = (() => { try { return JSON.parse(m.participants); } catch { return []; } })();
          const duration = m.durationMinutes || Math.round((new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()) / 60000);
          const hasTranscript = !!m.transcriptRaw;
          const hasMinutes = !!m.minutesText;
          const isError = m.status === "ERROR";
          const isAwaiting = m.status === "AWAITING_RECORDING";
          const canReprocess = isError || isAwaiting;
          const isPending = m.status === "PENDING" || m.status === "TRANSCRIBING" || m.status === "GENERATING";
          const feedback = reprocessFeedback[m.id];

          // Inferência granular da etapa da falha
          const failStage: "TRANSCRIPTION" | "ATA" | "MEMORY_BRAIN" | null = isError
            ? !hasTranscript
              ? "TRANSCRIPTION"
              : !hasMinutes
              ? "ATA"
              : "MEMORY_BRAIN"
            : null;

          const failStageLabel: Record<string, string> = {
            TRANSCRIPTION: "ERRO NA TRANSCRIÇÃO",
            ATA: "ERRO NA ATA",
            MEMORY_BRAIN: "ERRO NO MEMORY BRAIN",
          };
          const failStageTitle: Record<string, string> = {
            TRANSCRIPTION: "Falhou ao baixar ou transcrever o áudio",
            ATA: "Transcrição OK — falhou ao gerar a Ata com IA",
            MEMORY_BRAIN: "Ata OK — falhou ao gerar tags/nó no Knowledge Graph",
          };

          return (
            <Card
              key={m.id}
              className={`bg-zinc-950 border-zinc-800 shadow-xl transition-all group relative overflow-hidden cursor-pointer ${
                canReprocess
                  ? "hover:border-red-800/50 hover:shadow-red-950/20"
                  : "hover:border-zinc-600 hover:shadow-purple-950/30"
              }`}
              onClick={() => setSelectedMeeting(m)}
            >
              {/* Barra de status no topo */}
              <div className={`absolute top-0 left-0 w-full h-0.5 ${
                m.status === "DONE" ? "bg-emerald-500" :
                isError ? "bg-red-500" :
                isAwaiting ? "bg-zinc-500" :
                "bg-amber-500 animate-pulse"
              }`} />

              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className={`text-white text-sm leading-tight line-clamp-2 transition-colors ${
                    canReprocess ? "group-hover:text-red-400" : "group-hover:text-purple-400"
                  }`}>
                    {m.subject}
                  </CardTitle>
                  <Badge variant="outline" className={`ml-2 shrink-0 text-[10px] uppercase tracking-widest ${
                    m.status === "DONE" ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" :
                    isError ? "border-red-500/50 text-red-400 bg-red-500/10" :
                    isAwaiting ? "border-zinc-500/50 text-zinc-400 bg-zinc-500/10" :
                    "border-amber-500/50 text-amber-400 bg-amber-500/10"
                  }`}>
                    {isAwaiting ? "SEM GRAVAÇÃO" : m.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Organizador */}
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-xs text-blue-400 font-mono font-semibold truncate">
                    @{m.organizerName || m.organizerEmail?.split("@")[0] || "—"}
                  </span>
                </div>

                {/* Data e Duração */}
                <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(m.startedAt).toLocaleDateString("pt-BR")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(m.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-zinc-400 font-bold">{duration}min</span>
                </div>

                {/* Participantes */}
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span className="text-xs text-zinc-500">{participants.length} participantes</span>
                </div>

                {/* Footer do card */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50">
                  <div className="flex gap-2">
                    {hasTranscript && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 border border-emerald-700/30 font-mono">
                        TRANSCRITO
                      </span>
                    )}
                    {hasMinutes && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-400 border border-purple-700/30 font-mono">
                        ATA PRONTA
                      </span>
                    )}
                    {isPending && !hasTranscript && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/20 text-amber-500 border border-amber-700/20 font-mono animate-pulse">
                        PROCESSANDO
                      </span>
                    )}
                    {failStage && (
                      <span
                        title={failStageTitle[failStage]}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/20 text-red-400 border border-red-700/30 font-mono flex items-center gap-1 cursor-help animate-in fade-in"
                      >
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                        {failStageLabel[failStage]}
                      </span>
                    )}
                  </div>

                  {/* Botão de reprocessamento ou "VER DETALHES" */}
                  {canReprocess ? (
                    <button
                      onClick={(e) => handleReprocess(e, m)}
                      disabled={reprocessingId === m.id}
                      className={`flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded transition-all ${
                        feedback
                          ? "text-emerald-400 border border-emerald-700/30 bg-emerald-900/20"
                          : "text-red-400 border border-red-700/30 bg-red-900/10 hover:bg-red-900/30 hover:text-red-300 hover:border-red-600/50"
                      }`}
                    >
                      {reprocessingId === m.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      {feedback ?? "REPROCESSAR"}
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-600 group-hover:text-purple-400 transition-colors">
                      <Eye className="w-3 h-3" />
                      VER DETALHES
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-zinc-500 py-24 font-mono">
          {search ? `Nenhuma reunião encontrada para "${search}"` : "Nenhuma reunião no repositório corporativo."}
        </div>
      )}

      {/* A Gaveta (Drawer) */}
      <MeetingDrawer
        meeting={selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        onReprocess={async (meeting) => {
          const res = await fetch(`/api/meetings/${meeting.id}/reprocess`, { method: "POST" });
          const data = await res.json();
          if (data.success) {
            setMeetings(prev =>
              prev.map(m => m.id === meeting.id ? { ...m, status: "PENDING" } : m)
            );
            setSelectedMeeting((prev: any) => ({ ...prev, status: "PENDING" }));
          }
          return data;
        }}
      />
    </div>
  );
}

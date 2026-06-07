"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X, FileText, AudioLines, Info, Calendar, Clock, Users, User,
  Link as LinkIcon, Download, ChevronRight, RefreshCw, Loader2,
  AlertTriangle, Terminal, Brain, Tag, Pencil, Save, RotateCcw, Plus, Trash2
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

interface KnowledgeNode {
  id: string;
  summary: string;
  keywords: string;
  tags: { tag: { id: string; name: string; color: string } }[];
}

type TabId = "transcricao" | "ata" | "memory" | "info" | "falhas";
type ReprocessLevel = "TRANSCRIPTION" | "ATA" | "MEMORY_BRAIN";

export function MeetingDrawer({ meeting, onClose, onReprocess }: MeetingDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("transcricao");
  const [failureLogs, setFailureLogs] = useState<FailureLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Granular reprocess state
  const [reprocessing, setReprocessing] = useState<ReprocessLevel | "FULL" | null>(null);
  const [reprocessFeedback, setReprocessFeedback] = useState<string | null>(null);

  // Memory Brain state
  const [memoryNode, setMemoryNode] = useState<KnowledgeNode | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [isEditingMemory, setIsEditingMemory] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const [editKeywords, setEditKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);

  // ── Carrega logs de falha ──────────────────────────────────────────────────
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

  // Pré-carrega logs quando meeting tem erro
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

  // ── Carrega nó do Memory Brain ─────────────────────────────────────────────
  const loadMemoryNode = useCallback(async () => {
    if (!meeting?.id) return;
    setMemoryLoading(true);
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/reprocess-granular`);
      const data = await res.json();
      setMemoryNode(data.node);
      if (data.node) {
        setEditSummary(data.node.summary || "");
        const kws: string[] = (() => { try { return JSON.parse(data.node.keywords); } catch { return []; } })();
        setEditKeywords(kws);
      }
    } catch { setMemoryNode(null); }
    finally { setMemoryLoading(false); }
  }, [meeting?.id]);

  useEffect(() => {
    if (activeTab === "memory") loadMemoryNode();
  }, [activeTab, loadMemoryNode]);

  if (!meeting) return null;

  const participants: string[] = (() => { try { return JSON.parse(meeting.participants); } catch { return []; } })();
  const duration = meeting.durationMinutes || Math.round((new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime()) / 60000);
  const hasTranscript = !!meeting.transcriptRaw;
  const hasMinutes = !!meeting.minutesText;
  const hasMemory = !!memoryNode;
  const isError = meeting.status === "ERROR";
  const isAwaiting = meeting.status === "AWAITING_RECORDING";
  const canReprocess = isError || isAwaiting;

  // ── Reprocessamento Granular ───────────────────────────────────────────────
  const handleGranularReprocess = async (level: ReprocessLevel) => {
    setReprocessing(level);
    setReprocessFeedback(null);
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/reprocess-granular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });
      const data = await res.json();
      if (data.success) {
        setReprocessFeedback(`✅ ${data.message}`);
        if (level === "MEMORY_BRAIN") {
          setMemoryNode(null);
          setTimeout(loadMemoryNode, 2000);
        }
      } else {
        setReprocessFeedback(`❌ ${data.error || "Erro desconhecido"}`);
      }
    } catch {
      setReprocessFeedback("❌ Erro de conexão");
    } finally {
      setReprocessing(null);
      setTimeout(() => setReprocessFeedback(null), 5000);
    }
  };

  // Reprocessamento full (compatível com o onReprocess do pai)
  const handleFullReprocess = async () => {
    if (!onReprocess) return;
    setReprocessing("FULL");
    setReprocessFeedback(null);
    try {
      const data = await onReprocess(meeting);
      setReprocessFeedback(data.success ? "✅ Reenfileirado!" : `❌ ${data.error}`);
    } catch {
      setReprocessFeedback("❌ Erro de conexão");
    } finally {
      setReprocessing(null);
      setTimeout(() => setReprocessFeedback(null), 4000);
    }
  };

  // ── Salva edição manual do Memory Brain ───────────────────────────────────
  const handleSaveMemory = async () => {
    setSavingMemory(true);
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/reprocess-granular`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: editSummary, keywords: editKeywords }),
      });
      const data = await res.json();
      if (data.success) {
        setIsEditingMemory(false);
        await loadMemoryNode();
      }
    } finally { setSavingMemory(false); }
  };

  // ── Renderiza transcrição diarizada ───────────────────────────────────────
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

  const isReprocessing = reprocessing !== null;
  const tabBtn = (id: TabId, label: string, icon: React.ReactNode, dotColor?: string, badge?: number | boolean) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`relative px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors border-b-2 shrink-0 ${
        activeTab === id
          ? id === "transcricao" ? "border-emerald-500 text-emerald-400"
            : id === "ata" ? "border-purple-500 text-purple-400"
            : id === "memory" ? "border-cyan-500 text-cyan-400"
            : id === "info" ? "border-blue-500 text-blue-400"
            : "border-red-500 text-red-400"
          : canReprocess && id === "falhas" && failureLogs.length > 0
          ? "border-transparent text-red-400/70 hover:text-red-400 animate-pulse"
          : "border-transparent text-zinc-400 hover:text-zinc-300"
      }`}
    >
      {icon}
      {label}
      {dotColor && <span className={`ml-1 w-1.5 h-1.5 rounded-full ${dotColor} inline-block`} />}
      {typeof badge === "number" && badge > 0 && (
        <span className="ml-1 px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 text-[9px] font-mono border border-red-700/30">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Gaveta */}
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
            {reprocessFeedback && (
              <p className="text-xs font-mono mt-2 text-emerald-400 animate-in fade-in duration-300">{reprocessFeedback}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canReprocess && onReprocess && (
              <button
                onClick={handleFullReprocess}
                disabled={isReprocessing}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono uppercase bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 hover:border-red-500/60 text-red-400 hover:text-red-300 rounded-md transition-all"
              >
                {reprocessing === "FULL" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Reprocessar
              </button>
            )}
            <button onClick={onClose} className="text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 p-2 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-5 border-b border-zinc-800 bg-zinc-900/30 gap-1 overflow-x-auto">
          {tabBtn("transcricao", "Transcrição", <AudioLines className="w-4 h-4" />, hasTranscript ? "bg-emerald-500" : undefined)}
          {tabBtn("ata", "Ata Inteligente", <FileText className="w-4 h-4" />, hasMinutes ? "bg-purple-500" : undefined)}
          {tabBtn("memory", "Memory Brain", <Brain className="w-4 h-4" />)}
          {tabBtn("info", "Metadados", <Info className="w-4 h-4" />)}
          {tabBtn("falhas", "Logs de Falha", <Terminal className="w-4 h-4" />, undefined, failureLogs.length)}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">

          {/* ── TAB 1: TRANSCRIÇÃO ── */}
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
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                      <AudioLines className="w-4 h-4 text-emerald-400" />
                      Transcrição Diarizada por Participante
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500 font-mono">
                        {meeting.transcriptRaw.split("\n").filter(Boolean).length} segmentos
                      </span>
                      {/* Botão Reprocessar Transcrição */}
                      <button
                        onClick={() => handleGranularReprocess("TRANSCRIPTION")}
                        disabled={isReprocessing}
                        title="Reprocessar transcrição completa (refaz tudo)"
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono border border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/5 rounded transition-all"
                      >
                        {reprocessing === "TRANSCRIPTION" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Reprocessar transcrição
                      </button>
                    </div>
                  </div>
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-0.5">
                    {renderTranscript(meeting.transcriptRaw)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: ATA INTELIGENTE ── */}
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
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-400" />
                      Ata Estruturada pela IA
                    </h3>
                    {/* Botão Reprocessar Ata */}
                    <button
                      onClick={() => handleGranularReprocess("ATA")}
                      disabled={isReprocessing}
                      title="Regerar ata (mantém transcrição)"
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono border border-zinc-700 text-zinc-400 hover:text-purple-400 hover:border-purple-500/50 hover:bg-purple-500/5 rounded transition-all"
                    >
                      {reprocessing === "ATA" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Regerar ata
                    </button>
                  </div>
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6">
                    <div className="whitespace-pre-wrap text-zinc-300 text-sm leading-relaxed">
                      {meeting.minutesText}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: MEMORY BRAIN ── */}
          {activeTab === "memory" && (
            <div className="p-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-cyan-400" />
                  Nó do Memory Brain
                </h3>
                <div className="flex items-center gap-2">
                  {/* Reprocessar Memory Brain via IA */}
                  {hasMinutes && (
                    <button
                      onClick={() => handleGranularReprocess("MEMORY_BRAIN")}
                      disabled={isReprocessing || memoryLoading}
                      title="Mandar a IA recriar o nó do Memory Brain a partir da Ata"
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono border border-zinc-700 text-zinc-400 hover:text-cyan-400 hover:border-cyan-500/50 hover:bg-cyan-500/5 rounded transition-all"
                    >
                      {reprocessing === "MEMORY_BRAIN" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                      Reprocessar via IA
                    </button>
                  )}
                  {/* Edição manual */}
                  {memoryNode && !isEditingMemory && (
                    <button
                      onClick={() => setIsEditingMemory(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-800 rounded transition-all"
                    >
                      <Pencil className="w-3 h-3" />
                      Editar
                    </button>
                  )}
                </div>
              </div>

              {memoryLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
                </div>
              ) : !memoryNode ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3">
                  <Brain className="w-16 h-16 opacity-10" />
                  <p className="text-center text-sm">Esta reunião ainda não tem um nó no Memory Brain.</p>
                  {hasMinutes && (
                    <button
                      onClick={() => handleGranularReprocess("MEMORY_BRAIN")}
                      disabled={isReprocessing}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-mono border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 rounded-md transition-all"
                    >
                      {reprocessing === "MEMORY_BRAIN" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                      Gerar nó agora
                    </button>
                  )}
                </div>
              ) : isEditingMemory ? (
                /* ── Modo Edição Manual ── */
                <div className="space-y-5">
                  {/* Resumo */}
                  <div>
                    <label className="text-xs text-zinc-400 font-mono uppercase tracking-wider block mb-2">Resumo</label>
                    <textarea
                      value={editSummary}
                      onChange={e => setEditSummary(e.target.value)}
                      rows={3}
                      className="w-full bg-zinc-900/80 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 resize-none focus:outline-none focus:border-cyan-500/60 transition-colors"
                    />
                  </div>

                  {/* Keywords */}
                  <div>
                    <label className="text-xs text-zinc-400 font-mono uppercase tracking-wider block mb-2">Keywords / Tags</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {editKeywords.map((kw, i) => (
                        <span key={i} className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-full text-xs font-mono">
                          <Tag className="w-2.5 h-2.5 text-cyan-400" />
                          {kw}
                          <button
                            onClick={() => setEditKeywords(prev => prev.filter((_, idx) => idx !== i))}
                            className="ml-0.5 text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newKeyword}
                        onChange={e => setNewKeyword(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && newKeyword.trim()) {
                            setEditKeywords(prev => [...prev, newKeyword.trim().toLowerCase()]);
                            setNewKeyword("");
                          }
                        }}
                        placeholder="Nova keyword (Enter para adicionar)"
                        className="flex-1 bg-zinc-900/80 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/60 transition-colors placeholder:text-zinc-600"
                      />
                      <button
                        onClick={() => {
                          if (newKeyword.trim()) {
                            setEditKeywords(prev => [...prev, newKeyword.trim().toLowerCase()]);
                            setNewKeyword("");
                          }
                        }}
                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-300 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Ações de edição */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveMemory}
                      disabled={savingMemory}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-md transition-colors font-medium"
                    >
                      {savingMemory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Salvar Alterações
                    </button>
                    <button
                      onClick={() => { setIsEditingMemory(false); loadMemoryNode(); }}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded-md transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Modo Visualização ── */
                <div className="space-y-5">
                  {/* Resumo */}
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                    <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-2">Resumo da IA</p>
                    <p className="text-zinc-200 text-sm leading-relaxed">{memoryNode.summary}</p>
                  </div>

                  {/* Keywords */}
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                    <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">Keywords do Grafo</p>
                    <div className="flex flex-wrap gap-2">
                      {(() => { try { return JSON.parse(memoryNode.keywords) as string[]; } catch { return []; } })().map((kw: string, i: number) => (
                        <span key={i} className="flex items-center gap-1.5 bg-cyan-900/20 border border-cyan-700/40 text-cyan-300 px-3 py-1 rounded-full text-xs font-mono">
                          <Tag className="w-2.5 h-2.5" />
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Tags do sistema */}
                  {memoryNode.tags && memoryNode.tags.length > 0 && (
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                      <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">Tags do Sistema</p>
                      <div className="flex flex-wrap gap-2">
                        {memoryNode.tags.map(({ tag }) => (
                          <span
                            key={tag.id}
                            className="px-3 py-1 rounded-full text-xs font-mono font-medium"
                            style={{ backgroundColor: tag.color + "22", color: tag.color, borderColor: tag.color + "55", borderWidth: 1 }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 4: METADADOS ── */}
          {activeTab === "info" && (
            <div className="p-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
                <div className="flex items-center gap-4 p-4">
                  <User className="w-5 h-5 text-zinc-500 shrink-0" />
                  <div>
                    <p className="text-zinc-500 text-xs mb-0.5">Organizador</p>
                    <p className="text-zinc-200 text-sm font-medium">
                      {meeting.organizerName}
                      {meeting.organizerEmail && <span className="text-zinc-500 font-normal ml-2">({meeting.organizerEmail})</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4">
                  <Calendar className="w-5 h-5 text-zinc-500 shrink-0" />
                  <div>
                    <p className="text-zinc-500 text-xs mb-0.5">Data e Hora</p>
                    <p className="text-zinc-200 text-sm font-medium">{new Date(meeting.startedAt).toLocaleString("pt-BR")}</p>
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
                            <span key={idx} className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono">{p}</span>
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
                      <a href={meeting.joinUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 text-sm hover:underline transition-colors">
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
                {canReprocess && (
                  <div className="flex items-start gap-4 p-4 bg-red-950/10">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-red-400 text-xs mb-1 font-semibold">Falha no Processamento</p>
                      <p className="text-zinc-400 text-xs">
                        Esta reunião {isError ? "falhou durante o processamento" : "não possui gravação disponível no OneDrive"}.
                      </p>
                      {onReprocess && (
                        <button
                          onClick={handleFullReprocess}
                          disabled={isReprocessing}
                          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 rounded transition-all"
                        >
                          {reprocessing === "FULL" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Reprocessar agora
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 5: LOGS DE FALHA ── */}
          {activeTab === "falhas" && (
            <div className="p-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-red-400" />
                  Histórico de Falhas
                </h3>
                {canReprocess && onReprocess && (
                  <button
                    onClick={handleFullReprocess}
                    disabled={isReprocessing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 rounded transition-all"
                  >
                    {reprocessing === "FULL" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
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
                      <div key={log.id} className={`rounded-xl border p-4 font-mono text-xs space-y-2 ${
                        log.level === "ERROR" ? "bg-red-950/20 border-red-900/40" :
                        log.level === "WARNING" ? "bg-amber-950/20 border-amber-900/40" :
                        "bg-zinc-900/60 border-zinc-800"
                      }`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              log.level === "ERROR" ? "bg-red-900/50 text-red-400" :
                              log.level === "WARNING" ? "bg-amber-900/50 text-amber-400" :
                              "bg-blue-900/50 text-blue-400"
                            }`}>{log.level}</span>
                            <span className="text-zinc-600 text-[10px]">{new Date(log.createdAt).toLocaleString("pt-BR")}</span>
                          </div>
                        </div>
                        <div className="bg-zinc-950/60 rounded-lg p-3 border border-zinc-800/50">
                          <p className={`leading-relaxed break-words whitespace-pre-wrap text-[11px] ${
                            log.level === "ERROR" ? "text-red-300" :
                            log.level === "WARNING" ? "text-amber-300" : "text-zinc-300"
                          }`}>{log.message}</p>
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
                Ata disponível
              </span>
            )}
            {memoryNode && (
              <span className="text-xs text-cyan-400 flex items-center gap-1 ml-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 inline-block" />
                No Memory Brain
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

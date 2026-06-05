"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit, Download, Loader2, Search, Mail, MailX, User, Users, Clock, Calendar, FileText } from "lucide-react";

interface NodeTag { name: string; color: string; }

interface GraphNode {
  id: string;
  meetingId: string;
  title: string;
  summary: string;
  keywords: string[];
  color: string;
  tagName: string;
  tags: NodeTag[];
  meetingStatus: string;
  organizer: string;
  organizerEmail: string;
  duration: number;
  date: string;
  endDate: string;
  participants: string[];
  recipients: string[];
  autoSendEnabled: boolean;
  minutesText: string | null;
  emailSent: boolean;
  val: number;
}

interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  totalTags: number;
  tagDistribution: { name: string; color: string; count: number }[];
}

// Verifica se um nó bate com a busca (busca ampla em todos os campos)
function nodeMatchesQuery(node: GraphNode, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    (node.title || "").toLowerCase().includes(lower) ||
    (node.summary || "").toLowerCase().includes(lower) ||
    (node.organizer || "").toLowerCase().includes(lower) ||
    (node.organizerEmail || "").toLowerCase().includes(lower) ||
    (node.tagName || "").toLowerCase().includes(lower) ||
    (node.minutesText || "").toLowerCase().includes(lower) ||
    (node.keywords || []).some(k => k.toLowerCase().includes(lower)) ||
    (node.tags || []).some(t => t.name.toLowerCase().includes(lower)) ||
    (node.participants || []).some(p => p.toLowerCase().includes(lower)) ||
    (node.recipients || []).some(r => r.toLowerCase().includes(lower))
  );
}

export default function MemoryPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const searchRef = useRef<string>("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailTab, setDetailTab] = useState<"info" | "ata">("info");
  const [matchCount, setMatchCount] = useState<number | null>(null);

  // Atualiza o ref e força o refresh do grafo quando a busca muda
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    searchRef.current = value.toLowerCase().trim();

    if (graphRef.current) {
      // Força o 3d-force-graph a re-avaliar todos os callbacks
      graphRef.current
        .nodeColor(graphRef.current.nodeColor())
        .nodeOpacity(graphRef.current.nodeOpacity())
        .linkVisibility(graphRef.current.linkVisibility());
    }
  }, []);

  useEffect(() => {
    const loadGraph = async () => {
      try {
        const res = await fetch("/api/memory/graph");
        const data = await res.json();
        setStats(data.stats);

        const ForceGraph3D = (await import("3d-force-graph")).default;

        if (!containerRef.current) return;

        // @ts-ignore
        const graph = ForceGraph3D()(containerRef.current)
          .graphData({ nodes: data.nodes, links: data.links })
          .backgroundColor("#000000")
          .nodeLabel((node: any) => {
            const n = node as GraphNode;
            return `<div style="background:#18181b;color:white;padding:8px 12px;border-radius:6px;font-family:monospace;font-size:11px;border:1px solid #27272a;max-width:280px;">
              <div style="font-weight:bold;margin-bottom:4px;color:#34d399;">${n.title}</div>
              <div style="color:#a1a1aa;">👤 ${n.organizer} · ⏱ ${n.duration}min · 👥 ${n.participants?.length || 0}</div>
              <div style="margin-top:4px;">${n.tags?.map(t => `<span style="background:${t.color}22;color:${t.color};padding:1px 6px;border-radius:4px;font-size:9px;margin-right:3px;">${t.name}</span>`).join("")}</div>
              <div style="margin-top:6px;color:${n.emailSent ? '#34d399' : '#f59e0b'};font-size:10px;">${n.emailSent ? '✅ E-mail enviado' : '⏳ Pendente'}</div>
            </div>`;
          })
          .nodeColor((node: any) => {
            const q = searchRef.current;
            if (!q) return node.color;
            // Se bate com a busca, mantém a cor. Se não, fica bem escuro e transparente.
            return nodeMatchesQuery(node, q) ? node.color : "rgba(30, 30, 30, 0.1)";
          })
          .nodeOpacity(0.9) // <--- O SEGREDO: ISSO TEM QUE SER UM NÚMERO GLOBAL!
          .nodeVal((node: any) => {
            const q = searchRef.current;
            if (!q) return node.val;
            return nodeMatchesQuery(node, q) ? node.val * 1.5 : node.val * 0.3;
          })
          .linkColor(() => "rgba(255, 255, 255, 0.15)")
          .linkWidth((link: any) => Math.max(link.weight * 0.4, 0.2))
          .linkOpacity(1)
          .linkVisibility((link: any) => {
            const q = searchRef.current;
            if (!q) return true;
            const sourceNode = typeof link.source === 'object' ? link.source : null;
            const targetNode = typeof link.target === 'object' ? link.target : null;
            if (!sourceNode || !targetNode) return false;
            return nodeMatchesQuery(sourceNode, q) && nodeMatchesQuery(targetNode, q);
          })
          .onNodeClick((node: any) => {
            setSelectedNode(node as GraphNode);
            setDetailTab("info");
          })
          .warmupTicks(50)
          .cooldownTicks(100);

        graphRef.current = graph;

        const handleResize = () => {
          if (containerRef.current && graphRef.current) {
            graphRef.current.width(containerRef.current.clientWidth);
            graphRef.current.height(containerRef.current.clientHeight);
          }
        };
        window.addEventListener('resize', handleResize);
        handleResize();

        setLoading(false);
      } catch (e) {
        console.error("Erro ao carregar o grafo:", e);
        setLoading(false);
      }
    };

    loadGraph();

    return () => {
      if (graphRef.current) {
        graphRef.current._destructor?.();
      }
    };
  }, []);

  // Recalcula o refresh do grafo sempre que searchQuery muda
  useEffect(() => {
    searchRef.current = searchQuery.toLowerCase().trim();
    if (graphRef.current) {
      const q = searchRef.current;
      
      // Passar novas referências de função força a biblioteca a recalcular e atualizar o WebGL
      graphRef.current
        .nodeColor((node: any) => !q ? node.color : (nodeMatchesQuery(node, q) ? node.color : "rgba(30, 30, 30, 0.1)"))
        .nodeVal((node: any) => !q ? node.val : (nodeMatchesQuery(node, q) ? node.val * 1.5 : node.val * 0.3))
        .linkVisibility((link: any) => {
          if (!q) return true;
          const sourceNode = typeof link.source === 'object' ? link.source : null;
          const targetNode = typeof link.target === 'object' ? link.target : null;
          if (!sourceNode || !targetNode) return false;
          return nodeMatchesQuery(sourceNode, q) && nodeMatchesQuery(targetNode, q);
        });
    }
  }, [searchQuery]);

  const handleExport = async () => {
    const res = await fetch("/api/memory/export");
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teamstextify-brain-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-in fade-in zoom-in duration-500 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-purple-400" />
            Memory Brain
          </h2>
          <p className="text-zinc-400 mt-1">Knowledge Graph corporativo — categorias criadas automaticamente pela LLM.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar: assunto, email, participante, tag..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-2 pl-9 pr-3 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all shadow-inner font-mono"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-2.5 text-zinc-500 hover:text-white text-xs font-mono">✕</button>
            )}
          </div>
          <button onClick={handleExport} className="flex items-center px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-white hover:bg-zinc-800 transition-all shadow-md font-mono shrink-0">
            <Download className="w-4 h-4 mr-2 text-purple-400" />
            Exportar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Grafo 3D */}
        <div className="lg:col-span-3 relative bg-black border border-zinc-800 rounded-lg overflow-hidden" style={{ height: "72vh" }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/80">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
              <span className="ml-3 text-zinc-400 font-mono text-sm">Renderizando neurônios...</span>
            </div>
          )}
          <div ref={containerRef} className="w-full h-full" />
        </div>

        {/* Painel lateral */}
        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "72vh" }}>
          {stats && (
            <Card className="bg-zinc-950 border-zinc-800 shadow-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm font-mono uppercase tracking-wider">Estatísticas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs font-mono">
                <div className="flex justify-between text-zinc-400">
                  <span>Neurônios</span>
                  <span className="text-purple-400 font-bold">{stats.totalNodes}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Sinapses</span>
                  <span className="text-blue-400 font-bold">{stats.totalEdges}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Categorias</span>
                  <span className="text-emerald-400 font-bold">{stats.totalTags}</span>
                </div>
                <hr className="border-zinc-800" />
                <div className="space-y-2 pt-1">
                  <span className="text-zinc-500 text-[10px] uppercase tracking-widest">Tags (Auto-LLM)</span>
                  {stats.tagDistribution?.map((t) => (
                    <div key={t.name} className="flex items-center justify-between cursor-pointer hover:bg-zinc-900 px-1 rounded transition-colors" onClick={() => setSearchQuery(t.name)}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }}></div>
                        <span className="text-zinc-300">{t.name}</span>
                      </div>
                      <span className="text-zinc-500">{t.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {selectedNode && (
            <Card className="bg-zinc-950 border-purple-500/30 shadow-xl shadow-purple-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-purple-400 text-sm font-mono uppercase tracking-wider">Nó Selecionado</CardTitle>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setDetailTab("info")}
                    className={`text-[10px] font-mono uppercase px-3 py-1 rounded transition-all ${detailTab === "info" ? "bg-purple-500/20 text-purple-400 border border-purple-500/40" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    Detalhes
                  </button>
                  <button
                    onClick={() => setDetailTab("ata")}
                    className={`text-[10px] font-mono uppercase px-3 py-1 rounded transition-all ${detailTab === "ata" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    Ver Ata
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {detailTab === "info" && (
                  <>
                    <p className="text-white font-semibold text-sm leading-tight">{selectedNode.title}</p>
                    <p className="text-zinc-400">{selectedNode.summary}</p>

                    <div className="flex flex-wrap gap-1 pt-1">
                      {selectedNode.tags.map((t, i) => (
                        <Badge key={i} className="text-[10px] cursor-pointer" style={{ backgroundColor: `${t.color}22`, color: t.color, borderColor: `${t.color}44` }} onClick={() => setSearchQuery(t.name)}>
                          {t.name}
                        </Badge>
                      ))}
                    </div>

                    {selectedNode.keywords && selectedNode.keywords.length > 0 && (
                      <div className="pt-2 border-t border-zinc-800 space-y-1">
                        <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">Keywords de Interseção:</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedNode.keywords.map((kw, i) => (
                            <span key={i} className="text-[10px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-800 cursor-pointer hover:bg-zinc-800 hover:text-white transition-colors" onClick={() => setSearchQuery(kw)}>
                              #{kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-zinc-800 space-y-2">
                      <div className="flex items-center gap-2 text-zinc-400">
                        <User className="w-3 h-3 text-blue-400" />
                        <span className="text-blue-400 font-mono font-semibold">@{selectedNode.organizer}</span>
                      </div>
                      <div className="text-zinc-600 font-mono text-[10px] pl-5">{selectedNode.organizerEmail}</div>
                    </div>

                    <div className="flex items-center gap-3 text-zinc-500 font-mono">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{selectedNode.date ? new Date(selectedNode.date).toLocaleDateString("pt-BR") : "—"}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{selectedNode.date ? new Date(selectedNode.date).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' }) : "—"}</span>
                      <span className="text-zinc-300 font-bold">{selectedNode.duration}min</span>
                    </div>

                    <div className="pt-2 border-t border-zinc-800">
                      <div className="flex items-center gap-2 mb-2 text-zinc-400">
                        <Users className="w-3 h-3" />
                        <span>Participantes ({selectedNode.participants?.length || 0})</span>
                      </div>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {selectedNode.participants?.map((p, i) => (
                          <div key={i} className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-1 rounded cursor-pointer hover:text-blue-400 transition-colors" onClick={() => setSearchQuery(p)}>
                            {p}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-800">
                      <div className="flex items-center gap-2 mb-2 text-zinc-400">
                        {selectedNode.emailSent ? <Mail className="w-3 h-3 text-emerald-400" /> : <MailX className="w-3 h-3 text-amber-400" />}
                        <span>{selectedNode.emailSent ? "E-mail Enviado" : "Não Enviado"}</span>
                      </div>
                      {selectedNode.emailSent && selectedNode.recipients && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-zinc-600 font-mono">Destinatários:</span>
                          {selectedNode.recipients.map((r, i) => (
                            <div key={i} className="text-[10px] font-mono text-emerald-400/70 bg-emerald-500/5 px-2 py-1 rounded">{r}</div>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 text-[10px] font-mono text-zinc-600">
                        Modo: {selectedNode.autoSendEnabled ?
                          <span className="text-emerald-400">Automático</span> :
                          <span className="text-amber-400">Manual (Aprovação)</span>
                        }
                      </div>
                    </div>
                  </>
                )}

                {detailTab === "ata" && (
                  <div className="space-y-2">
                    {selectedNode.minutesText ? (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                        {selectedNode.minutesText}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
                        <FileText className="w-8 h-8 mb-2" />
                        <span className="font-mono text-xs">Ata ainda não gerada pelo LLM.</span>
                        <span className="font-mono text-[10px] text-zinc-700 mt-1">Status: {selectedNode.meetingStatus}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

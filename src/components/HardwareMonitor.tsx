"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cpu, Server, Activity } from "lucide-react";

export function HardwareMonitor() {
  const [cpuUsage, setCpuUsage] = useState(0);
  const [ramUsage, setRamUsage] = useState(0);
  const [gpuUsage, setGpuUsage] = useState(0);

  useEffect(() => {
    const fetchRealTelemetry = async () => {
      try {
        const res = await fetch("/api/telemetry");
        if (res.ok) {
          const data = await res.json();
          setCpuUsage(data.cpu || 0);
          setRamUsage(data.ram || 0);
          setGpuUsage(data.gpu || 0);
        }
      } catch (e) {
        console.error("Falha ao buscar telemetria real:", e);
      }
    };

    fetchRealTelemetry(); // Carga Inicial
    const interval = setInterval(fetchRealTelemetry, 2500); // Polling a cada 2.5s

    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="bg-zinc-950 border-zinc-800 shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl" />
      <CardHeader className="pb-3 border-b border-zinc-800/50">
        <CardTitle className="text-white flex items-center justify-between text-sm uppercase tracking-wider font-mono">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Node Telemetry
          </div>
          <span className="flex items-center gap-2 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            REALTIME
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-5">
        {/* CPU */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5"/> CPU CORE</span>
            <span className={cpuUsage > 80 ? 'text-red-400 font-bold' : 'text-blue-400'}>{cpuUsage}%</span>
          </div>
          <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
            <div 
              className={`h-1.5 rounded-full transition-all duration-700 ease-out ${cpuUsage > 80 ? 'bg-red-500' : 'bg-blue-500'}`} 
              style={{ width: `${Math.max(cpuUsage, 1)}%` }}
            ></div>
          </div>
        </div>
        
        {/* GPU */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400 flex items-center gap-1.5"><Server className="w-3.5 h-3.5"/> GPU VRAM</span>
            <span className={gpuUsage > 75 ? 'text-amber-400 font-bold' : 'text-purple-400'}>{gpuUsage}%</span>
          </div>
          <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
            <div 
              className={`h-1.5 rounded-full transition-all duration-700 ease-out ${gpuUsage > 75 ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-purple-500'}`} 
              style={{ width: `${Math.max(gpuUsage, 1)}%` }}
            ></div>
          </div>
        </div>

        {/* RAM */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400 flex items-center gap-1.5"><Server className="w-3.5 h-3.5"/> RAM ALLOC</span>
            <span className={ramUsage > 85 ? 'text-red-400 font-bold' : 'text-emerald-400'}>{ramUsage}%</span>
          </div>
          <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
            <div 
              className={`h-1.5 rounded-full transition-all duration-700 ease-out ${ramUsage > 85 ? 'bg-red-500' : 'bg-emerald-500'}`} 
              style={{ width: `${Math.max(ramUsage, 1)}%` }}
            ></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

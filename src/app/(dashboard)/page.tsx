import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import prisma from "@/lib/db/prisma";
import { HardwareMonitor } from "@/components/HardwareMonitor";
import { MotorProcessamento } from "@/components/MotorProcessamento";

export const revalidate = 0;

export default async function DashboardPage() {
  const totalMeetings = await prisma.meeting.count();
  const doneMeetings = await prisma.meeting.count({ where: { status: "DONE" } });
  const pendingMeetings = await prisma.meeting.count({ where: { status: { in: ["PENDING", "TRANSCRIBING", "GENERATING", "AWAITING_RECORDING"] } } });
  const errorLogs = await prisma.auditLog.count({ where: { level: "ERROR" } });

  const recentLogs = await prisma.auditLog.findMany({
    take: 6,
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-950 border-zinc-800 shadow-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Total em Banco</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white font-mono">{totalMeetings}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
          <CardHeader className="pb-2">
            <CardTitle className="text-emerald-400 text-sm font-medium uppercase tracking-wider">Atas Concluídas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white font-mono">{doneMeetings}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
          <CardHeader className="pb-2">
            <CardTitle className="text-amber-400 text-sm font-medium uppercase tracking-wider">Processando</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white font-mono">{pendingMeetings}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
          <CardHeader className="pb-2">
            <CardTitle className="text-red-400 text-sm font-medium uppercase tracking-wider">Alertas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white font-mono">{errorLogs}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Motor de Processamento em Tempo Real */}
        <Card className="col-span-2 bg-zinc-950 border-zinc-800 shadow-xl">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              Motor de Processamento
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Jobs ativos e fila de transcrição — atualiza a cada 3 segundos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MotorProcessamento />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <HardwareMonitor />

          <Card className="bg-zinc-950 border-zinc-800 shadow-xl">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2 text-sm uppercase font-mono tracking-widest">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                Audit Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 font-mono text-xs overflow-hidden h-[250px]">
                {recentLogs.length === 0 && (
                  <p className="text-zinc-600 text-center pt-8">Nenhum log registrado.</p>
                )}
                {recentLogs.map((log) => (
                  <div key={log.id} className="flex flex-col gap-1 border-b border-zinc-800/50 pb-2">
                    <div className="flex items-center gap-2">
                      <span className={log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARNING' ? 'text-amber-400' : 'text-blue-400'}>
                        [{log.level}]
                      </span>
                      <span className="text-zinc-600">{new Date(log.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <span className="text-zinc-300 truncate">{log.message}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

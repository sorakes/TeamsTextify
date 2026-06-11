import React from "react";
import Link from "next/link";
import { Activity, Settings, BrainCircuit, FolderOpen, RefreshCw, ShieldAlert, Video, FileText } from "lucide-react";

import { SyncProgressPanel } from "@/components/SyncProgressPanel";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      {/* Sidebar Terminal Style */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Video className="w-5 h-5 mr-3 text-white" />
          <span className="font-bold tracking-wider font-mono">TeamsTextify</span>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          <Link href="/" className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 rounded-md font-mono transition-colors">
            <Activity className="w-4 h-4 mr-3" />
            Workers
          </Link>
          <Link href="/meetings" className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 rounded-md font-mono transition-colors">
            <FolderOpen className="w-4 h-4 mr-3" />
            Central de Atas
          </Link>
          <Link href="/sync" className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 rounded-md font-mono transition-colors">
            <RefreshCw className="w-4 h-4 mr-3" />
            Sync API
          </Link>
          <Link href="/memory" className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 rounded-md font-mono transition-colors">
            <BrainCircuit className="w-4 h-4 mr-3 text-purple-400" />
            Memory
          </Link>
          <Link href="/rules" className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 rounded-md font-mono transition-colors">
            <ShieldAlert className="w-4 h-4 mr-3 text-amber-400" />
            Rules
          </Link>
          <Link href="/prompts" className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 rounded-md font-mono transition-colors">
            <FileText className="w-4 h-4 mr-3 text-purple-400" />
            Prompts
          </Link>
          <Link href="/settings" className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 rounded-md font-mono transition-colors">
            <Settings className="w-4 h-4 mr-3" />
            Settings
          </Link>
        </nav>
        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground font-mono flex items-center">
            <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
            MSAL Connected
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 overflow-y-auto bg-background relative">
        <header className="h-16 flex items-center justify-between px-8 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <h1 className="text-sm font-medium text-muted-foreground font-mono">/overview</h1>
          <div className="text-xs text-muted-foreground font-mono">Admin Session Active</div>
        </header>
        <div className="p-8">
          {children}
        </div>
        
        {/* Painel Global de Progresso da Sync */}
        <SyncProgressPanel />
      </main>
    </div>
  );
}

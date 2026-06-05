import { NextResponse } from "next/server";
import si from "systeminformation";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Busca informações reais do Sistema Operacional (Windows/Linux/Docker)
    const mem = await si.mem();
    const currentLoad = await si.currentLoad();
    const graphics = await si.graphics();

    // RAM usage %
    const ramUsage = Math.round((mem.active / mem.total) * 100);
    
    // CPU usage %
    const cpuUsage = Math.round(currentLoad.currentLoad);
    
    // GPU usage % (Fallback se não houver placa dedicada)
    let gpuUsage = 0;
    if (graphics.controllers && graphics.controllers.length > 0) {
      const gpu = graphics.controllers[0];
      // Tenta usar a memória VRAM alocada como métrica de estresse, se disponível
      if (gpu.memoryTotal && gpu.memoryUsed) {
        gpuUsage = Math.round((gpu.memoryUsed / gpu.memoryTotal) * 100);
      } else {
        // Se a lib não conseguir ler (limitação do Windows sem admin), mantemos 0
        gpuUsage = 0; 
      }
    }

    return NextResponse.json({
      cpu: cpuUsage,
      ram: ramUsage,
      gpu: gpuUsage
    });
  } catch (error) {
    console.error("Telemetry Error:", error);
    return NextResponse.json({ cpu: 0, ram: 0, gpu: 0, error: "Falha na leitura OS" }, { status: 500 });
  }
}

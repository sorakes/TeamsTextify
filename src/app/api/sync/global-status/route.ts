import { NextResponse } from "next/server";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

export async function GET() {
  try {
    const raw = await redis.get("teamstextify_global_sync_progress");
    if (!raw) {
      return NextResponse.json({
        status: "idle",
        scanned: 0,
        total: 0,
        currentUser: "",
        imported: 0,
        message: ""
      });
    }
    return NextResponse.json(JSON.parse(raw));
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: "Erro ao ler progresso do Redis: " + error.message },
      { status: 500 }
    );
  }
}

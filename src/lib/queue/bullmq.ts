import { Queue } from "bullmq";
import Redis from "ioredis";

// Centraliza a conexão Redis
const connection = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

let _syncQueue: Queue | null = null;
function getSyncQueue() {
  if (!_syncQueue) _syncQueue = new Queue("sync-meetings-queue", { connection: connection as any });
  return _syncQueue;
}

// Helper para adicionar um novo Job na fila
export async function addSyncJob(meetingId: string) {
  return await getSyncQueue().add("sync-microsoft-graph", { meetingId }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    }
  });
}

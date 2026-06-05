import { Queue } from 'bullmq';

// Conexão interna para o Redis que roda no mesmo container (via supervisord)
const connection = {
  host: 'localhost',
  port: 6379,
};

// Instância da Fila. O Python Worker está escutando este mesmo nome.
export const videoQueue = new Queue('video-extraction', { connection });

export async function addVideoToExtractionQueue(meetingId: string, videoUrl: string) {
  const job = await videoQueue.add('extract-audio', {
    meetingId,
    videoUrl,
  });
  
  console.log(`[Next.js] Job de extração enfileirado: ${job.id}`);
  return job;
}

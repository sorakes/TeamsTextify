import asyncio
import os
from bullmq import Worker

async def process_video(job, job_token):
    print(f"[Python Worker] Job recebido do Next.js: {job.id} - {job.name}")
    data = job.data
    meeting_id = data.get("meetingId")
    video_url = data.get("videoUrl")
    
    print(f"[FFmpeg/Whisper] Extraindo áudio e transcrevendo: {meeting_id}...")
    
    # Aqui faremos a execução real do WhisperX e FFmpeg
    await asyncio.sleep(2) # Simulação de processamento pesado
    
    print(f"[Python Worker] Transcrição concluída com sucesso: {meeting_id}")
    
    # O BullMQ envia esse return de volta para o Node.js automaticamente
    return {
        "status": "success", 
        "transcript": "Transcrição gerada pelo Python...",
        "speaker_diarization": []
    }

async def main():
    print("[Python Worker] Boot concluído. Escutando fila Redis 'video-extraction'...")
    worker = Worker(
        "video-extraction",
        process_video,
        {"connection": "redis://localhost:6379"}
    )
    
    import signal
    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()

    def signal_handler():
        stop_event.set()

    loop.add_signal_handler(signal.SIGINT, signal_handler)
    loop.add_signal_handler(signal.SIGTERM, signal_handler)

    await stop_event.wait()
    await worker.close()

if __name__ == "__main__":
    asyncio.run(main())

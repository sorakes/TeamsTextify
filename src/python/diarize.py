import sys
import json
import torch
import whisper
from pyannote.audio import Pipeline

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Caminho do arquivo de áudio não fornecido."}))
        sys.exit(1)

    audio_path = sys.argv[1]
    hf_token = sys.argv[2] if len(sys.argv) > 2 else None

    # Detect device (CPU or GPU if available)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    try:
        # Load Whisper model (using 'base' for faster CPU processing, can be adjusted to 'small')
        model = whisper.load_model("base", device=device)
        result = model.transcribe(audio_path, language="pt")
        
        segments = result.get("segments", [])
        
        # Se o token HF foi fornecido, roda Pyannote para identificar os Speakers
        diarization_results = []
        if hf_token and hf_token.strip() != "null":
            try:
                pipeline = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token=hf_token
                )
                pipeline.to(device)
                diarization = pipeline(audio_path)
                
                # Intersect Whisper segments with Pyannote speakers
                for segment in segments:
                    w_start = segment["start"]
                    w_end = segment["end"]
                    w_text = segment["text"].strip()
                    
                    # Encontrar o speaker predominante para este segmento de tempo
                    speaker = "Speaker Desconhecido"
                    max_overlap = 0
                    for turn, _, spk in diarization.itertracks(yield_label=True):
                        overlap = max(0, min(w_end, turn.end) - max(w_start, turn.start))
                        if overlap > max_overlap:
                            max_overlap = overlap
                            speaker = spk
                    
                    diarization_results.append({
                        "start": w_start,
                        "end": w_end,
                        "speaker": speaker,
                        "text": w_text
                    })
            except Exception as e:
                # Fallback to no diarization if pyannote fails
                for segment in segments:
                    diarization_results.append({
                        "start": segment["start"],
                        "end": segment["end"],
                        "speaker": "Speaker (Sem Diarização)",
                        "text": segment["text"].strip()
                    })
        else:
            # Fallback (Sem Token)
            for segment in segments:
                diarization_results.append({
                    "start": segment["start"],
                    "end": segment["end"],
                    "speaker": "Speaker (Sem Token Pyannote)",
                    "text": segment["text"].strip()
                })

        # Formata o texto final
        final_text = []
        for d in diarization_results:
            final_text.append(f"[{d['start']:.2f}s - {d['end']:.2f}s] {d['speaker']}: {d['text']}")
        
        output = {
            "success": True,
            "raw_text": "\n".join(final_text),
            "segments": diarization_results
        }
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()

import sys
import json
import torch
import whisper
from pyannote.audio import Pipeline

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Caminho do arquivo de áudio não fornecido."}, ensure_ascii=False))
        sys.exit(1)

    audio_path = sys.argv[1]
    hf_token = sys.argv[2] if len(sys.argv) > 2 else None

    # Detect device (CPU or GPU if available)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    try:
        # Load Whisper model ('small' é o balanço ideal entre qualidade altíssima PT-BR e baixo uso de VRAM: ~2GB)
        model = whisper.load_model("small", device=device)
        result = model.transcribe(audio_path, language="pt", word_timestamps=True)
        
        segments = result.get("segments", [])
        
        # Extrair todas as palavras geradas para alinhamento fino
        words_list = []
        for segment in segments:
            if "words" in segment:
                words_list.extend(segment["words"])
            else:
                words_list.append({
                    "start": segment["start"],
                    "end": segment["end"],
                    "word": segment["text"]
                })
        
        diarization_results = []
        if hf_token and hf_token.strip() != "null":
            try:
                pipeline = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token=hf_token
                )
                pipeline.to(device)
                diarization = pipeline(audio_path)
                
                # Atribui o locutor a CADA PALAVRA individualmente (precisão absurda de milissegundos)
                for w in words_list:
                    w_start = w["start"]
                    w_end = w["end"]
                    
                    speaker = "Speaker Desconhecido"
                    max_overlap = 0
                    for turn, _, spk in diarization.itertracks(yield_label=True):
                        overlap = max(0, min(w_end, turn.end) - max(w_start, turn.start))
                        if overlap > max_overlap:
                            max_overlap = overlap
                            speaker = spk
                    w["speaker"] = speaker

                # Agrupa palavras consecutivas do mesmo locutor
                if words_list:
                    current_speaker = words_list[0]["speaker"]
                    current_start = words_list[0]["start"]
                    current_end = words_list[0]["end"]
                    current_text = [words_list[0]["word"].strip()]
                    
                    for w in words_list[1:]:
                        # Se for o mesmo locutor e o silêncio entre as falas for menor que 2 segundos, junta a frase
                        if w["speaker"] == current_speaker and (w["start"] - current_end < 2.0):
                            current_text.append(w["word"].strip())
                            current_end = w["end"]
                        else:
                            diarization_results.append({
                                "start": current_start,
                                "end": current_end,
                                "speaker": current_speaker,
                                "text": " ".join(current_text)
                            })
                            current_speaker = w["speaker"]
                            current_start = w["start"]
                            current_end = w["end"]
                            current_text = [w["word"].strip()]
                    
                    diarization_results.append({
                        "start": current_start,
                        "end": current_end,
                        "speaker": current_speaker,
                        "text": " ".join(current_text)
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
        print(json.dumps(output, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()

import sys
import json
import torch
from faster_whisper import WhisperModel
from pyannote.audio import Pipeline

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Caminho do arquivo de áudio não fornecido."}, ensure_ascii=False))
        sys.exit(1)

    audio_path = sys.argv[1]
    hf_token = sys.argv[2] if len(sys.argv) > 2 else None
    meeting_subject = sys.argv[3] if len(sys.argv) > 3 else "Reunião corporativa"

    # Detect device
    device_name = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if torch.cuda.is_available() else "int8"

    try:
        # Load Faster-Whisper model ('large-v3-turbo' é ultra-rápido, consome ~3GB VRAM e entende gírias perfeitamente)
        model = WhisperModel("large-v3-turbo", device=device_name, compute_type=compute_type)

        # Prompt inicial dinâmico: orienta o Whisper ao contexto corporativo e ao título da reunião
        initial_prompt = (
            f"Transcrição de reunião corporativa em português brasileiro. "
            f"Reunião sobre: {meeting_subject}. "
            f"Vocabulário técnico e de negócios esperado."
        )

        segments_gen, _ = model.transcribe(
            audio_path,
            language="pt",
            word_timestamps=True,
            beam_size=5,
            vad_filter=True,                              # Ignora silêncio, evita alucinações
            vad_parameters={"min_silence_duration_ms": 500},
            initial_prompt=initial_prompt,
        )
        
        segments = list(segments_gen)
        
        # Extrair palavras geradas
        words_list = []
        for segment in segments:
            if hasattr(segment, "words") and getattr(segment, "words", None):
                for w in segment.words:
                    words_list.append({
                        "start": w.start,
                        "end": w.end,
                        "word": w.word
                    })
            else:
                words_list.append({
                    "start": segment.start,
                    "end": segment.end,
                    "word": segment.text
                })
        
        diarization_results = []
        if hf_token and hf_token.strip() != "null":
            try:
                pipeline = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token=hf_token
                )
                pipeline.to(torch.device(device_name))
                diarization = pipeline(audio_path)
                
                # Atribui locutor a cada palavra
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

                # Agrupa em frases brutas
                raw_phrases = []
                if words_list:
                    current_speaker = words_list[0]["speaker"]
                    current_start = words_list[0]["start"]
                    current_end = words_list[0]["end"]
                    current_text = [words_list[0]["word"].strip()]
                    
                    for w in words_list[1:]:
                        if w["speaker"] == current_speaker and (w["start"] - current_end < 2.0):
                            current_text.append(w["word"].strip())
                            current_end = w["end"]
                        else:
                            raw_phrases.append({
                                "start": current_start,
                                "end": current_end,
                                "speaker": current_speaker,
                                "text": " ".join(current_text)
                            })
                            current_speaker = w["speaker"]
                            current_start = w["start"]
                            current_end = w["end"]
                            current_text = [w["word"].strip()]
                    
                    raw_phrases.append({
                        "start": current_start,
                        "end": current_end,
                        "speaker": current_speaker,
                        "text": " ".join(current_text)
                    })

                # Algoritmo Anti-Picote: absorve falas isoladas < 1.5s
                for i, phrase in enumerate(raw_phrases):
                    duration = phrase["end"] - phrase["start"]
                    if duration < 1.5 and i > 0 and i < len(raw_phrases) - 1:
                        prev_speaker = raw_phrases[i-1]["speaker"]
                        next_speaker = raw_phrases[i+1]["speaker"]
                        if prev_speaker == next_speaker and phrase["speaker"] != prev_speaker:
                            phrase["speaker"] = prev_speaker

                # Segundo passe: funde blocos adjacentes que agora têm o mesmo speaker
                if raw_phrases:
                    final_speaker = raw_phrases[0]["speaker"]
                    final_start = raw_phrases[0]["start"]
                    final_end = raw_phrases[0]["end"]
                    final_text = [raw_phrases[0]["text"]]
                    
                    for p in raw_phrases[1:]:
                        if p["speaker"] == final_speaker and (p["start"] - final_end < 2.0):
                            final_text.append(p["text"])
                            final_end = p["end"]
                        else:
                            diarization_results.append({
                                "start": final_start,
                                "end": final_end,
                                "speaker": final_speaker,
                                "text": " ".join(final_text)
                            })
                            final_speaker = p["speaker"]
                            final_start = p["start"]
                            final_end = p["end"]
                            final_text = [p["text"]]
                            
                    diarization_results.append({
                        "start": final_start,
                        "end": final_end,
                        "speaker": final_speaker,
                        "text": " ".join(final_text)
                    })

            except Exception as e:
                for segment in segments:
                    diarization_results.append({
                        "start": segment.start,
                        "end": segment.end,
                        "speaker": "Speaker (Sem Diarização)",
                        "text": segment.text.strip()
                    })
        else:
            for segment in segments:
                diarization_results.append({
                    "start": segment.start,
                    "end": segment.end,
                    "speaker": "Speaker (Sem Token Pyannote)",
                    "text": segment.text.strip()
                })

        # Formatar a saída final
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

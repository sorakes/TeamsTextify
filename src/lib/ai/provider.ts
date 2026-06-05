import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

// Função principal de abstração multi-LLM (Hub Global)
export async function generateMeetingMinutes(
  transcript: string, 
  settings: {
    provider: string,
    modelName?: string | null,
    apiKey?: string | null,
    baseUrl?: string | null
  }
) {
  let model;

  const prompt = `Abaixo está a transcrição de uma reunião gerada internamente pelo WhisperX.\n\n${transcript}\n\nSua tarefa é formatar o texto em uma Ata de Reunião profissional (Em Markdown) com os seguintes blocos: Resumo Executivo, Principais Tópicos Discutidos, Decisões Tomadas e Ações Pós-Reunião (com responsáveis).`;

  switch(settings.provider.toLowerCase()) {
    case 'openai':
      const openai = createOpenAI({ apiKey: settings.apiKey || '' });
      model = openai(settings.modelName || 'gpt-4o-mini');
      break;
    
    case 'gemini':
      const google = createGoogleGenerativeAI({ apiKey: settings.apiKey || '' });
      model = google(settings.modelName || 'gemini-1.5-flash');
      break;

    case 'claude':
    case 'anthropic':
      const anthropic = createAnthropic({ apiKey: settings.apiKey || '' });
      model = anthropic(settings.modelName || 'claude-3-haiku-20240307');
      break;
      
    case 'ollama':
      // Ollama emula a API da OpenAI. Permite URL customizada para GPUs locais/secundárias.
      const ollama = createOpenAI({ 
        baseURL: settings.baseUrl || 'http://localhost:11434/v1', 
        apiKey: 'ollama' // Chave dummy
      });
      model = ollama(settings.modelName || 'llama3');
      break;

    case 'openrouter':
      const openrouter = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: settings.apiKey || '',
      });
      model = openrouter(settings.modelName || 'meta-llama/llama-3-8b-instruct:free');
      break;

    default:
      throw new Error(`[LLM Hub] Provedor de LLM não suportado no painel: ${settings.provider}`);
  }

  const { text } = await generateText({
    model: model,
    prompt: prompt,
  });

  return text;
}

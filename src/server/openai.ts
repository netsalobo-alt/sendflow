import { GoogleGenAI } from '@google/genai';
import { db } from './db.ts';

export interface GenerateVariationsParams {
  baseMessage: string;
  count: number;
  tone?: 'mais curto' | 'mais comercial' | 'mais natural' | 'mais amigável' | 'urgência' | 'padrão';
  customInstructions?: string;
}

export async function generateVariations(params: GenerateVariationsParams): Promise<{
  success: boolean;
  variations: string[];
  providerUsed: 'OpenAI' | 'Gemini' | 'Heurística';
  error?: string;
}> {
  const { baseMessage, count = 5, tone = 'padrão', customInstructions } = params;

  if (!baseMessage || !baseMessage.trim()) {
    return {
      success: false,
      variations: [],
      providerUsed: 'Heurística',
      error: 'Mensagem-base não fornecida',
    };
  }

  const openAiKey = db.getRawOpenAIKey();
  const settings = db.getOpenAISettings();

  const toneGuidanceMap: Record<string, string> = {
    'mais curto': 'Seja direto e conciso, reduzindo palavras desnecessárias.',
    'mais comercial': 'Destaque valor, benefício claro e chamada para ação persuasiva.',
    'mais natural': 'Use linguagem espontânea e humana como se fosse uma conversa pessoal no WhatsApp.',
    'mais amigável': 'Seja caloroso, atencioso e empático.',
    urgência: 'Destaque senso de oportunidade com tempo ou vagas limitadas de forma respeitosa.',
    padrão: 'Equilíbrio entre simpatia, clareza e apelo comercial.',
  };

  const toneGuidance = toneGuidanceMap[tone] || toneGuidanceMap['padrão'];

  const systemInstruction = `Você é um redator especialista em mensagens comerciais para WhatsApp e canais de atendimento Chatwoot.
Sua missão é gerar exatamente ${count} variações distintas da mensagem fornecida pelo usuário, mantendo estritamente:
1. O objetivo e intenção comercial principal.
2. Todas as variáveis dinâmicas existentes no texto original (por exemplo: {{name}}, {{phone_number}}, {{cidade}}, etc.) no formato exato com chaves duplas.
3. Tom desejado: ${toneGuidance}
${customInstructions ? `Instruções adicionais: ${customInstructions}` : ''}

IMPORTANTE: Responda estritamente com um JSON válido no formato:
{
  "variations": [
    "Variação 1...",
    "Variação 2..."
  ]
}
Não inclua nenhum texto adicional fora do bloco JSON.`;

  // 1. Try OpenAI if API key is provided
  if (openAiKey && openAiKey.trim().length > 10) {
    try {
      const openAiUrl = 'https://api.openai.com/v1/chat/completions';
      const openAiModel = settings.model || 'gpt-4o-mini';

      const response = await fetch(openAiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey.trim()}`,
        },
        body: JSON.stringify({
          model: openAiModel,
          messages: [
            { role: 'system', content: systemInstruction },
            {
              role: 'user',
              content: `Mensagem base:\n"${baseMessage}"\n\nGere ${count} variações agora.`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.variations) && parsed.variations.length > 0) {
            return {
              success: true,
              variations: parsed.variations.slice(0, count),
              providerUsed: 'OpenAI',
            };
          }
        }
      } else {
        const errJson = await response.json().catch(() => ({}));
        console.warn('OpenAI error:', errJson);
      }
    } catch (openAiErr) {
      console.warn('OpenAI call failed, checking fallback:', openAiErr);
    }
  }

  // 2. Try Gemini fallback if GEMINI_API_KEY is present
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const prompt = `${systemInstruction}\n\nMensagem base:\n"${baseMessage}"\n\nGere ${count} variações mantendo as variáveis.`;
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = res.text;
      if (text) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.variations) && parsed.variations.length > 0) {
          return {
            success: true,
            variations: parsed.variations.slice(0, count),
            providerUsed: 'Gemini',
          };
        }
      }
    } catch (geminiErr) {
      console.warn('Gemini fallback failed:', geminiErr);
    }
  }

  // 3. Fallback Heuristic variations if no API keys are present
  const cleanBase = baseMessage.trim();
  const heuristics: string[] = [];

  const greetings = [
    'Olá {{name}}, tudo bem?',
    'Oi {{name}}, tudo certo?',
    'Olá {{name}}! Como vai?',
    'Oi {{name}}, passando por aqui!',
    'Olá {{name}}, espero que este dia esteja ótimo!',
    'Oi {{name}}, um ótimo dia para você!',
  ];

  // Strip initial greeting if present to combine
  const bodyText = cleanBase.replace(/^(Olá|Oi|Bom dia|Boa tarde|Boa noite)\s*(\{\{name\}\})?[,!.]?\s*/i, '');

  for (let i = 0; i < count; i++) {
    const greeting = greetings[i % greetings.length];
    if (tone === 'mais curto') {
      heuristics.push(`${greeting} ${bodyText.slice(0, 120)}`);
    } else if (tone === 'mais comercial') {
      heuristics.push(`${greeting} ${bodyText} Quer conhecer nossa oferta especial?`);
    } else {
      heuristics.push(`${greeting} ${bodyText}`);
    }
  }

  return {
    success: true,
    variations: heuristics.slice(0, count),
    providerUsed: 'Heurística',
  };
}

export async function testOpenAIConnection(apiKey: string, model = 'gpt-4o-mini'): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Responda OK se a conexão estiver funcionando.' }],
        max_tokens: 5,
      }),
    });

    if (response.ok) {
      return { success: true, message: 'Conexão com OpenAI estabelecida com sucesso!' };
    }

    const errData = await response.json().catch(() => ({}));
    return {
      success: false,
      message: errData?.error?.message || `Erro HTTP ${response.status}`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

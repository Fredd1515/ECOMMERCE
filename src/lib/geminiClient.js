// =====================================================
// CLIENTE DE GEMINI A TRAVÉS DE PUTER.JS
// FarmaBot y el Orquestador usan Gemini sin API key propia.
// Puter se carga mediante el CDN oficial antes de la aplicación.
// =====================================================

export const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.8-flash';

const getPuter = () => {
  const client = typeof globalThis !== 'undefined' ? globalThis.puter : null;
  if (!client?.ai?.chat) {
    throw new Error('Puter.js no está disponible. Verifica la conexión al CDN https://js.puter.com/v2/.');
  }
  return client;
};

const waitForPuter = async (timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      return getPuter();
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return getPuter();
};

// Puter documenta ai.chat() con un prompt de texto, no con el formato
// messages[] de OpenAI. Convertimos el contexto para evitar llamadas que
// quedan pendientes sin producir contenido.
const buildPuterPrompt = (systemPrompt, history = [], userMessage = '') => {
  const historyText = history
    .filter(message => message && typeof message.content === 'string' && message.content.trim())
    .map(message => {
      const role = message.role === 'assistant' || message.role === 'model'
        ? 'Asistente'
        : 'Usuario';
      return `${role}: ${message.content.trim()}`;
    })
    .join('\n\n');

  return [
    'INSTRUCCIONES DEL AGENTE:',
    systemPrompt.trim(),
    historyText ? `HISTORIAL RELEVANTE:\n${historyText}` : '',
    `CONSULTA ACTUAL:\n${userMessage.trim()}`,
  ].filter(Boolean).join('\n\n');
};

const contentToText = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => typeof part === 'string' ? part : part?.text || part?.content || '')
      .join('');
  }
  return content?.text || content?.content || '';
};

const responseToText = (response) => contentToText(response?.message?.content ?? response?.content ?? response);

const normalizePuterError = (error) => {
  if (error instanceof Error && error.message) return error;
  if (typeof error === 'string' && error.trim()) return new Error(error);
  const message = error?.message || error?.error?.message || 'Puter no pudo responder con Gemini.';
  return new Error(String(message));
};

const consumePuterStream = async (stream, onChunk) => {
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw new Error('Puter no devolvió un stream de Gemini.');
  }

  let fullText = '';
  for await (const part of stream) {
    if (part?.type === 'error' || part?.error) {
      throw normalizePuterError(part?.message || part?.error);
    }

    const chunk = contentToText(part?.text || part?.content || '');
    if (chunk) {
      fullText += chunk;
      onChunk(chunk);
    }
  }

  if (!fullText.trim()) throw new Error('Gemini devolvió una respuesta vacía mediante Puter.');
  return fullText;
};

const withTimeout = (promise, timeoutMs = 60000) => Promise.race([
  promise,
  new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Gemini tardó demasiado en responder mediante Puter.')), timeoutMs);
  }),
]);

export const generateGeminiAgentResponse = async ({
  systemPrompt,
  history = [],
  userMessage,
  onChunk = null,
  maxOutputTokens = 700,
}) => {
  try {
    const client = await waitForPuter();
    const response = await withTimeout(client.ai.chat(buildPuterPrompt(systemPrompt, history, userMessage), {
      model: GEMINI_MODEL,
      stream: Boolean(onChunk),
    }));

    if (onChunk) return withTimeout(consumePuterStream(response, onChunk));

    const content = responseToText(response);
    if (!content.trim()) throw new Error('Gemini devolvió una respuesta vacía mediante Puter.');
    return content;
  } catch (error) {
    throw normalizePuterError(error);
  }
};

export const sendMessageToGemini = generateGeminiAgentResponse;

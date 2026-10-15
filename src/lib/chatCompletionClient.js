/**
 * Utilidades compartidas para proveedores compatibles con Chat Completions.
 * La clave nunca se maneja en el navegador: los endpoints locales/serverless
 * son los responsables de autenticar contra el proveedor.
 */

export const buildChatMessages = (systemPrompt, history = [], userMessage = '') => {
  const normalizedHistory = history
    .filter(message => message && typeof message.content === 'string' && message.content.trim())
    .map(message => ({
      role: message.role === 'assistant' || message.role === 'model' ? 'assistant' : 'user',
      content: message.content.trim(),
    }));

  const firstUserIndex = normalizedHistory.findIndex(message => message.role === 'user');
  const safeHistory = firstUserIndex === -1 ? [] : normalizedHistory.slice(firstUserIndex);

  return [
    { role: 'system', content: systemPrompt },
    ...safeHistory,
    { role: 'user', content: userMessage },
  ];
};

const readErrorMessage = async (response, providerName) => {
  let detail = '';

  try {
    const body = await response.clone().json();
    detail = body?.error?.metadata?.raw
      || body?.error?.metadata?.provider_error
      || body?.error?.message
      || body?.message
      || '';
  } catch {
    try {
      detail = await response.clone().text();
    } catch {
      detail = '';
    }
  }

  if (response.status === 401 || response.status === 403) {
    return new Error(`La clave de ${providerName} no es válida o no está autorizada.`);
  }

  if (response.status === 429) {
    return new Error(`Se alcanzó el límite de ${providerName}.${detail ? ` ${detail}` : ' Espera unos minutos e inténtalo nuevamente.'}`);
  }

  return new Error(detail || `${providerName} respondió con el código HTTP ${response.status}.`);
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

const consumeSse = async (response, onChunk, providerName) => {
  if (!response.body) {
    throw new Error(`${providerName} no devolvió un stream de respuesta.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let finishReason = '';

  const processLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;

    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') return;

    try {
      const payload = JSON.parse(data);
      if (payload?.error?.message) throw new Error(payload.error.message);
      const choice = payload.choices?.[0] || {};
      finishReason = choice.finish_reason || finishReason;
      const chunk = contentToText(choice.delta?.content || '');
      if (chunk) {
        fullText += chunk;
        onChunk(chunk);
      }
    } catch (error) {
      if (error instanceof Error && error.message && !error.message.includes('Unexpected token')) {
        throw error;
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(processLine);
    if (done) break;
  }

  if (buffer) processLine(buffer);
  if (!fullText.trim()) {
    if (finishReason === 'length') {
      throw new Error(`${providerName} agotó el límite de tokens antes de generar texto.`);
    }
    throw new Error(`${providerName} devolvió una respuesta vacía.`);
  }
  return fullText;
};

export const requestOpenAICompatibleChat = async ({
  endpoint,
  providerName,
  model,
  messages,
  maxTokens = 650,
  maxCompletionTokens = null,
  requestOptions = {},
  onChunk = null,
}) => {
  const tokenParams = maxCompletionTokens
    ? { max_completion_tokens: maxCompletionTokens }
    : { max_tokens: maxTokens };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: Boolean(onChunk),
      ...tokenParams,
      ...requestOptions,
    }),
  });

  if (!response.ok) throw await readErrorMessage(response, providerName);

  if (onChunk) return consumeSse(response, onChunk, providerName);

  const data = await response.json();
  const choice = data.choices?.[0] || {};
  const content = contentToText(choice.message?.content || '');
  if (!content.trim()) {
    if (choice.finish_reason === 'length') {
      throw new Error(`${providerName} agotó el límite de tokens antes de generar texto.`);
    }
    const providerError = data.error?.message;
    throw new Error(providerError || `${providerName} devolvió una respuesta vacía.`);
  }
  return content;
};

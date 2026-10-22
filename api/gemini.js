const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const readBody = async (req) => {
  if (req?.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
};

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const getGeminiContents = (messages) => (Array.isArray(messages) ? messages : [])
  .filter((message) => message && typeof message.content === 'string' && message.content.trim())
  .filter((message) => message.role !== 'system')
  .map((message) => ({
    role: message.role === 'assistant' || message.role === 'model' ? 'model' : 'user',
    parts: [{ text: message.content.trim() }],
  }));

const getSystemInstruction = (messages) => {
  const instructions = (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === 'system' && typeof message.content === 'string')
    .map((message) => message.content.trim())
    .filter(Boolean);

  return instructions.length > 0
    ? { parts: [{ text: instructions.join('\n\n') }] }
    : undefined;
};

const getGeminiChunkText = (chunk) => {
  try {
    return chunk.text?.() || '';
  } catch {
    return chunk.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  }
};

const pipeOpenAiResponse = async (upstream, res, stream) => {
  res.statusCode = upstream.status;
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');

  if (stream && upstream.body) {
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    const reader = upstream.body.getReader();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      res.end();
    }
    return;
  }

  res.end(await upstream.text());
};

const runGemini = async ({ apiKey, model, messages, maxTokens, stream, res }) => {
  const action = stream ? 'streamGenerateContent' : 'generateContent';
  const query = stream ? '?alt=sse&key=' : '?key=';
  const endpoint = `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:${action}${query}${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(getSystemInstruction(messages) ? { systemInstruction: getSystemInstruction(messages) } : {}),
      contents: getGeminiContents(messages),
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });

  if (!response.ok) {
    return sendJson(res, response.status, {
      error: { message: await response.text() || 'Gemini no pudo procesar la solicitud.' },
    });
  }

  if (stream && response.body) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const writeChunk = (payload) => {
      const text = getGeminiChunkText(payload);
      if (text) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) return;
          try {
            writeChunk(JSON.parse(trimmed.slice(5).trim()));
          } catch {
            // La siguiente lectura completará una línea SSE parcial.
          }
        });
        if (done) break;
      }
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
    return;
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  return sendJson(res, 200, {
    choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
  });
};

const runGroqFallback = async ({ apiKey, model, messages, maxTokens, stream, res }) => {
  const upstream = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: (Array.isArray(messages) ? messages : []).map((message) => ({
        role: message.role === 'model' ? 'assistant' : message.role,
        content: message.content,
      })),
      max_tokens: maxTokens,
      stream,
    }),
  });

  return pipeOpenAiResponse(upstream, res, stream);
};

export default async function handler(req, res, runtimeEnv = {}) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: { message: 'Method not allowed.' } });
  }

  try {
    const body = await readBody(req);
    const stream = Boolean(body.stream);
    const maxTokens = Number(body.max_tokens || body.max_completion_tokens || 1200);
    const geminiApiKey = runtimeEnv.geminiApiKey || process.env.GEMINI_API_KEY;
    const model = runtimeEnv.model || process.env.GEMINI_MODEL || 'gemini-2.0-flash';

    if (geminiApiKey) {
      return runGemini({ apiKey: geminiApiKey, model, messages: body.messages, maxTokens, stream, res });
    }

    // Fallback server-side para instalaciones que ya tienen Groq configurado.
    // Nunca vuelve a llamar a Puter ni expone una clave al navegador.
    const groqApiKey = runtimeEnv.groqApiKey || process.env.GROQ_API_KEY;
    if (groqApiKey) {
      return runGroqFallback({
        apiKey: groqApiKey,
        model: process.env.GEMINI_FALLBACK_GROQ_MODEL || 'openai/gpt-oss-120b',
        messages: body.messages,
        maxTokens,
        stream,
        res,
      });
    }

    return sendJson(res, 500, {
      error: { message: 'Configura GEMINI_API_KEY en el servidor. Como alternativa, configura GROQ_API_KEY.' },
    });
  } catch (error) {
    console.error('Gemini server proxy error:', error);
    return sendJson(res, 500, {
      error: { message: 'No se pudo conectar con el proveedor de IA desde el servidor.' },
    });
  }
}

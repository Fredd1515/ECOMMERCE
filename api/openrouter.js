const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const readBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
};

const pipeResponse = async (upstream, res, stream) => {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: { message: 'Method not allowed.' } });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'OPENROUTER_API_KEY no está configurada en el entorno del servidor.' },
    });
  }

  try {
    const body = readBody(req.body);
    const stream = Boolean(body.stream);
    const tokenParams = body.max_completion_tokens
      ? { max_completion_tokens: body.max_completion_tokens }
      : { max_tokens: body.max_tokens || 1400 };
    const upstream = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
        ...(process.env.OPENROUTER_APP_NAME ? { 'X-Title': process.env.OPENROUTER_APP_NAME } : {}),
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-lightning:free',
        messages: Array.isArray(body.messages) ? body.messages : [],
        stream,
        ...tokenParams,
        ...(body.reasoning_effort ? { reasoning_effort: body.reasoning_effort } : {}),
      }),
    });

    await pipeResponse(upstream, res, stream);
  } catch (error) {
    console.error('OpenRouter proxy error:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: { message: 'No se pudo conectar con OpenRouter desde el servidor.' },
      });
    }
    return res.end();
  }
}

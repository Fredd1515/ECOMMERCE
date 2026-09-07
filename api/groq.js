const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const readBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: { message: 'Method not allowed.' } });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'GROQ_API_KEY no está configurada en el entorno del servidor.' },
    });
  }

  try {
    const body = readBody(req.body);
    const upstream = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: body.model || 'openai/gpt-oss-120b',
        messages: body.messages || [],
        max_tokens: body.max_tokens || 500,
        stream: Boolean(body.stream),
      }),
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', contentType);

    if (body.stream && upstream.body) {
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

    const responseText = await upstream.text();
    return res.end(responseText);
  } catch (error) {
    console.error('Groq proxy error:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: { message: 'No se pudo conectar con Groq desde el servidor.' },
      });
    }
    return res.end();
  }
}
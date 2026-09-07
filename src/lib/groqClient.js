// =====================================================
// CLIENTE DE GROQ
// Motor del Asistente Virtual Farmacéutico
// =====================================================

const IS_DEVELOPMENT = import.meta.env.DEV;
const API_KEY = import.meta.env.VITE_GROQ_API_KEY;
export const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_ENDPOINT = IS_DEVELOPMENT
  ? 'https://api.groq.com/openai/v1/chat/completions'
  : '/api/groq';

/**
 * Construye el prompt de sistema con contexto de la farmacia y catálogo.
 */
export const buildSystemPrompt = (products = [], user = null) => {
  const productList = products
    .filter(p => p.is_active !== false)
    .slice(0, 60)
    .map(p => {
      const price = p.onSale && p.sale_price
        ? 'S/' + p.sale_price + ' (oferta, antes S/' + p.price + ')'
        : 'S/' + p.price;
      return '• ' + p.name + ' — ' + price + ' — Stock: ' + (p.stock || 0) + ' uds — Categoría: ' + (p.category || 'General') + ' — ' + (p.prescription_required ? '⚠️ Requiere receta' : 'Sin receta');
    })
    .join('\n');

  const userName = user?.first_name ? 'El cliente se llama ' + user.first_name + '.' : '';

  return [
    'Eres FarmaBot, el asistente virtual inteligente de Farmacia Digital. Eres un farmacéutico virtual profesional, amigable y empático que atiende clientes en Perú.',
    '',
    userName,
    '',
    '## TU ROL',
    '- Ayudas a los clientes a encontrar medicamentos y productos de salud',
    '- Explicas de forma clara y sencilla para qué sirven los productos',
    '- Siempre recuerdas que NO reemplazas a un médico y que ante dudas graves deben consultar a un profesional',
    '- Respondes SIEMPRE en español peruano amigable',
    '- Eres conciso: máximo 3 párrafos por respuesta',
    '',
    '## CATÁLOGO ACTUAL DE PRODUCTOS DISPONIBLES EN STOCK',
    productList || 'Catálogo cargando...',
    '',
    '## REGLAS IMPORTANTES',
    '1. Si el cliente pregunta por un medicamento que requiere receta, recuérdale que necesita presentarla en farmacia',
    '2. Si el cliente tiene síntomas graves (dolor en el pecho, dificultad para respirar, etc.), SIEMPRE recomienda ir a emergencias',
    '3. Cuando recomiendes productos, menciona el precio exacto y si está en oferta',
    '4. Si el producto no está en el catálogo, dilo honestamente y sugiere alternativas',
    '5. Puedes hacer preguntas cortas para entender mejor lo que el cliente necesita',
    '6. Formato: usa emojis con moderación para ser más amigable, pero no en exceso',
    '',
    '## EJEMPLOS DE LO QUE PUEDES HACER',
    '- "Tengo dolor de cabeza" → recomendar analgésicos del catálogo con precios',
    '- "¿Tienen vitamina C?" → responder con el stock y precio exacto',
    '- "¿Para qué sirve el Paracetamol?" → explicar de forma clara',
    '- "Mi hijo tiene fiebre" → dar recomendaciones y recordar consultar al médico',
  ].join('\n');
};

/**
 * Convierte el historial visual del chat al formato OpenAI-compatible de Groq.
 * Se descarta el mensaje inicial del bot para que la conversación empiece
 * con una consulta real del usuario.
 */
const normalizeChatHistory = (history = []) => {
  const normalized = history
    .filter(msg => msg && typeof msg.content === 'string' && msg.content.trim())
    .map(msg => ({
      role: msg.role === 'assistant' || msg.role === 'model' ? 'assistant' : 'user',
      content: msg.content.trim(),
    }));

  const firstUserIndex = normalized.findIndex(msg => msg.role === 'user');
  return firstUserIndex === -1 ? [] : normalized.slice(firstUserIndex);
};

const getGroqError = async (response) => {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error?.message || '';
  } catch {
    // La respuesta puede no contener JSON.
  }

  if (response.status === 401) {
    return new Error('La clave de Groq no es válida. Revisa la configuración del servidor.');
  }

  if (response.status === 429) {
    return new Error('Se alcanzó el límite gratuito de Groq. Espera unos minutos o revisa los límites de tu cuenta.');
  }

  return new Error(detail || 'Groq respondió con el código ' + response.status + '.');
};

/**
 * Envía un mensaje a Groq y obtiene la respuesta en streaming.
 */
export const sendMessageToGroq = async (
  userMessage,
  history = [],
  products = [],
  user = null,
  onChunk = null
) => {
  if (IS_DEVELOPMENT && !API_KEY) {
    throw new Error('VITE_GROQ_API_KEY no configurada. Agrégala a .env.local y reinicia Vite.');
  }

  const messages = [
    { role: 'system', content: buildSystemPrompt(products, user) },
    ...normalizeChatHistory(history.slice(-10)),
    { role: 'user', content: userMessage },
  ];

  const headers = { 'Content-Type': 'application/json' };
  if (IS_DEVELOPMENT) headers.Authorization = 'Bearer ' + API_KEY;

  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: 500,
      stream: Boolean(onChunk),
    }),
  });

  if (!response.ok) throw await getGroqError(response);

  if (!onChunk) {
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (!response.body) {
    throw new Error('Groq no devolvió un stream de respuesta.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  const processLine = (line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith('data:')) return;

    const data = trimmedLine.slice(5).trim();
    if (!data || data === '[DONE]') return;

    try {
      const payload = JSON.parse(data);
      const chunkText = payload.choices?.[0]?.delta?.content || '';
      if (chunkText) {
        fullText += chunkText;
        onChunk(chunkText);
      }
    } catch {
      // Ignorar líneas SSE incompletas o no relacionadas con texto.
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
  return fullText;
};

export const isGroqConfigured = () => (IS_DEVELOPMENT ? Boolean(API_KEY) : true);

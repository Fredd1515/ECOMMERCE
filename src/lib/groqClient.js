// =====================================================
// CLIENTE DE GROQ
// DataBot usa este proveedor dentro del flujo multiagente.
// La clave se conserva en el proxy /api/groq.
// =====================================================

import { buildChatMessages, requestOpenAICompatibleChat } from './chatCompletionClient';

export const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_ENDPOINT = '/api/groq';

/**
 * Prompt legado del cliente independiente de Groq. Se conserva para no
 * romper consumidores existentes, aunque el multiagente usa prompts propios.
 */
export const buildSystemPrompt = (products = [], user = null) => {
  const productList = products
    .filter(p => p.is_active !== false)
    .slice(0, 60)
    .map(p => {
      const price = p.onSale && p.sale_price
        ? `S/${p.sale_price} (oferta, antes S/${p.price})`
        : `S/${p.price}`;
      return `• ${p.name} — ${price} — Stock: ${p.stock || 0} uds — Categoría: ${p.category || 'General'} — ${p.prescription_required ? '⚠️ Requiere receta' : 'Sin receta'}`;
    })
    .join('\n');

  const userName = user?.first_name ? `El cliente se llama ${user.first_name}.` : '';

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
  ].join('\n');
};

export const generateGroqAgentResponse = async ({
  systemPrompt,
  history = [],
  userMessage,
  onChunk = null,
  maxTokens = 650,
}) => requestOpenAICompatibleChat({
  endpoint: GROQ_ENDPOINT,
  providerName: 'Groq',
  model: GROQ_MODEL,
  messages: buildChatMessages(systemPrompt, history, userMessage),
  maxTokens,
  onChunk,
});

export const sendMessageToGroq = async (
  userMessage,
  history = [],
  products = [],
  user = null,
  onChunk = null
) => generateGroqAgentResponse({
  systemPrompt: buildSystemPrompt(products, user),
  history,
  userMessage,
  onChunk,
  maxTokens: 500,
});

// En producción el proxy puede estar configurado aunque el navegador no
// conozca la clave. La comprobación real la realiza /api/groq.
export const isGroqConfigured = () => true;

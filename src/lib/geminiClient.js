// =====================================================
// CLIENTE DE GOOGLE GEMINI AI
// Motor del Asistente Virtual Farmacéutico
// =====================================================

import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Construye el prompt de sistema con contexto de la farmacia y catálogo de productos
 */
export const buildSystemPrompt = (products = [], user = null) => {
  const productList = products
    .filter(p => p.is_active !== false)
    .slice(0, 60) // límite para no exceder el contexto
    .map(p => {
      const price = p.onSale && p.sale_price
        ? `S/${p.sale_price} (oferta, antes S/${p.price})`
        : `S/${p.price}`;
      return `• ${p.name} — ${price} — Stock: ${p.stock || 0} uds — Categoría: ${p.category || 'General'} — ${p.prescription_required ? '⚠️ Requiere receta' : 'Sin receta'}`;
    })
    .join('\n');

  const userName = user?.first_name ? `El cliente se llama ${user.first_name}.` : '';

  return `Eres FarmaBot, el asistente virtual inteligente de Farmacia Digital. Eres un farmacéutico virtual profesional, amigable y empático que atiende clientes en Perú.

${userName}

## TU ROL
- Ayudas a los clientes a encontrar medicamentos y productos de salud
- Explicas de forma clara y sencilla para qué sirven los productos
- Siempre recuerdas que NO reemplazas a un médico y que ante dudas graves deben consultar a un profesional
- Respondes SIEMPRE en español peruano amigable
- Eres conciso: máximo 3 párrafos por respuesta

## CATÁLOGO ACTUAL DE PRODUCTOS DISPONIBLES EN STOCK
${productList || 'Catálogo cargando...'}

## REGLAS IMPORTANTES
1. Si el cliente pregunta por un medicamento que requiere receta, recuérdale que necesita presentarla en farmacia
2. Si el cliente tiene síntomas graves (dolor en el pecho, dificultad para respirar, etc.), SIEMPRE recomienda ir a emergencias
3. Cuando recomiendes productos, menciona el precio exacto y si está en oferta
4. Si el producto no está en el catálogo, dilo honestamente y sugiere alternativas
5. Puedes hacer preguntas cortas para entender mejor lo que el cliente necesita
6. Formato: usa emojis con moderación para ser más amigable, pero no en exceso

## EJEMPLOS DE LO QUE PUEDES HACER
- "Tengo dolor de cabeza" → recomendar analgésicos del catálogo con precios
- "¿Tienen vitamina C?" → responder con el stock y precio exacto
- "¿Para qué sirve el Paracetamol?" → explicar de forma clara
- "Mi hijo tiene fiebre" → dar recomendaciones y recordar consultar al médico`;
};

/**
 * Envía un mensaje al asistente y obtiene respuesta en streaming
 * @param {string} userMessage - Mensaje del usuario
 * @param {Array} history - Historial de conversación [{role, parts: [{text}]}]
 * @param {Array} products - Catálogo de productos para contexto
 * @param {Object} user - Perfil del usuario actual
 * @param {Function} onChunk - Callback llamado con cada fragmento de texto recibido
 * @returns {Promise<string>} - Texto completo de la respuesta
 */
export const sendMessageToGemini = async (userMessage, history = [], products = [], user = null, onChunk = null) => {
  if (!API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY no configurada. Por favor agrega tu API key de Google en .env.local');
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: buildSystemPrompt(products, user),
    generationConfig: {
      maxOutputTokens: 500,
      temperature: 0.7,
      topP: 0.9,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',      threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',threshold: 'BLOCK_ONLY_HIGH' },
    ]
  });

  // Convertir historial al formato de Gemini
  const chatHistory = history.slice(-10).map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));

  const chat = model.startChat({ history: chatHistory });

  if (onChunk) {
    // Streaming mode
    const result = await chat.sendMessageStream(userMessage);
    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onChunk(chunkText);
    }
    return fullText;
  } else {
    // Non-streaming mode
    const result = await chat.sendMessage(userMessage);
    return result.response.text();
  }
};

/**
 * Verifica si la API key está configurada
 */
export const isGeminiConfigured = () => {
  return !!(import.meta.env.VITE_GEMINI_API_KEY);
};

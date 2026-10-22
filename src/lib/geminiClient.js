// Cliente de Gemini a través del proxy del servidor.
// La clave del proveedor nunca se expone en el navegador.

import { buildChatMessages, requestOpenAICompatibleChat } from './chatCompletionClient';

export const GEMINI_MODEL = 'gemini-2.0-flash';

export const generateGeminiAgentResponse = ({
  systemPrompt,
  history = [],
  userMessage,
  onChunk = null,
  maxOutputTokens = 700,
}) => requestOpenAICompatibleChat({
  endpoint: '/api/gemini',
  providerName: 'Gemini',
  model: GEMINI_MODEL,
  messages: buildChatMessages(systemPrompt, history, userMessage),
  maxTokens: maxOutputTokens,
  onChunk,
});

export const sendMessageToGemini = generateGeminiAgentResponse;

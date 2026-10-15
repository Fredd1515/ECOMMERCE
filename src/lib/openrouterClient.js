import { buildChatMessages, requestOpenAICompatibleChat } from './chatCompletionClient';

const OPENROUTER_ENDPOINT = '/api/openrouter';
export const OPENROUTER_MODEL = 'nvidia/nemotron-3.5-lightning:free';

export const generateOpenRouterAgentResponse = async ({
  systemPrompt,
  history = [],
  userMessage,
  onChunk = null,
  maxTokens = 1400,
}) => requestOpenAICompatibleChat({
  endpoint: OPENROUTER_ENDPOINT,
  providerName: 'OpenRouter',
  model: OPENROUTER_MODEL,
  messages: buildChatMessages(systemPrompt, history, userMessage),
  maxTokens,
  maxCompletionTokens: Math.max(maxTokens, 1400),
  requestOptions: {
    reasoning_effort: 'none',
  },
  onChunk,
});

export const sendMessageToOpenRouter = generateOpenRouterAgentResponse;

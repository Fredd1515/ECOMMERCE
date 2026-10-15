import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, Bot, User, Loader2, Sparkles, Pill, AlertTriangle,
  ChevronDown, RefreshCw, BarChart3, Activity
} from 'lucide-react';
import { executeMultiAgentChat, isAdminUser } from '@/lib/multiAgentChatbot';

// ── Quick suggestion chips (Multiagente: Farmacia + Machine Learning) ────────
const QUICK_SUGGESTIONS = [
  { label: '📈 Predicción 30 días', text: '¿Cuál es la predicción de ventas y demanda para los próximos 30 días?', adminOnly: true },
  { label: '⚠️ Clientes en riesgo', text: '¿Qué clientes están en riesgo de abandono (churn) según el modelo de ML?', adminOnly: true },
  { label: '🏆 Clientes VIP', text: '¿Quiénes son nuestros mejores clientes VIP y cuánto han gastado?', adminOnly: true },
  { label: '🤖 Métricas de ML', text: '¿Cuáles son las métricas de precisión y detalles del modelo de Machine Learning?', adminOnly: true },
  { label: '📦 Stock crítico', text: '¿Qué productos tienen stock bajo o necesitan reposición?', adminOnly: true },
  { label: '💊 Dolor de cabeza', text: 'Tengo dolor de cabeza, ¿qué medicamento me recomiendas?' },
  { label: '💰 Productos en oferta', text: '¿Qué productos tienen en oferta hoy?' },
];

const getAgentRoleLabel = (agentType, admin) => {
  if (admin) {
    return {
      PHARMACY: 'Atención farmacéutica y catálogo',
      ML_ANALYST: 'Datos, predicciones y métricas',
      SALES_INVENTORY: 'Ventas, inventario y reposición',
    }[agentType];
  }

  return {
    PHARMACY: 'Atención farmacéutica y catálogo',
    ML_ANALYST: 'Conceptos generales de datos',
    SALES_INVENTORY: 'Catálogo y productos públicos',
  }[agentType];
};

const getVisibleAgentRoles = (roles, admin) => roles.map(agent => ({
  ...agent,
  role: getAgentRoleLabel(agent.agentType, admin) || agent.role,
}));

// Renderizador Markdown pequeño y seguro para el chat. Usa nodos React en
// lugar de HTML crudo, por lo que una respuesta del modelo no puede inyectar
// etiquetas o scripts en la farmacia.
const renderInlineMarkdown = (text, keyPrefix = 'inline') => {
  const tokenPattern = /(\[[^\]]+\]\((?:https?:\/\/|\/)[^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  const nodes = [];
  let lastIndex = 0;

  for (const match of String(text).matchAll(tokenPattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    const link = token.match(/^\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)$/);
    if (link) {
      nodes.push(
        <a
          key={`${keyPrefix}-${start}`}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-indigo-300 underline-offset-2 hover:text-indigo-700"
        >
          {link[1]}
        </a>
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-${start}`} className="rounded bg-gray-100 px-1 py-0.5 text-[0.9em] text-indigo-700">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={`${keyPrefix}-${start}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={`${keyPrefix}-${start}`}>{token.slice(1, -1)}</em>);
    }

    lastIndex = start + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : [text];
};

const MarkdownContent = ({ content, isUser = false }) => {
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  const isBlank = (line) => !line.trim();
  const isListItem = (line) => /^\s*(?:[-*+]|•)\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line);
  const isBlockStart = (line) => /^\s*#{1,6}\s+/.test(line) || isListItem(line) || /^\s*```/.test(line) || /^\s*~~~/.test(line) || /^\s*>/.test(line);

  while (index < lines.length) {
    if (isBlank(lines[index])) {
      index += 1;
      continue;
    }

    const fence = lines[index].match(/^\s*(```+|~~~+)\s*(.*)$/);
    if (fence) {
      const language = fence[2].trim();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^\s*(```+|~~~+)\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={`code-${blocks.length}`} className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
          {language && <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">{language}</div>}
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    const heading = lines[index].match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      const Heading = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
      const headingClass = level === 1 ? 'text-base font-bold' : level === 2 ? 'text-sm font-semibold' : 'text-sm font-medium';
      blocks.push(
        <Heading key={`heading-${blocks.length}`} className={`${headingClass} ${isUser ? 'text-white' : 'text-gray-900'}`}>
          {renderInlineMarkdown(heading[2], `heading-${blocks.length}`)}
        </Heading>
      );
      index += 1;
      continue;
    }

    const firstListItem = lines[index].match(/^\s*(?:([-*+]|•)|(\d+[.)]))\s+(.+)$/);
    if (firstListItem) {
      const ordered = Boolean(firstListItem[2]);
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:([-*+]|•)|(\d+[.)]))\s+(.+)$/);
        if (!item || Boolean(item[2]) !== ordered) break;
        items.push(item[3]);
        index += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={`list-${blocks.length}`} className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>
          {items.map((item, itemIndex) => (
            <li key={`item-${itemIndex}`}>{renderInlineMarkdown(item, `list-${blocks.length}-${itemIndex}`)}</li>
          ))}
        </List>
      );
      continue;
    }

    if (/^\s*>/.test(lines[index])) {
      const quoteLines = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${blocks.length}`} className="border-l-2 border-indigo-300 pl-3 italic text-gray-500">
          {quoteLines.map((line, lineIndex) => (
            <React.Fragment key={`quote-line-${lineIndex}`}>
              {lineIndex > 0 && <br />}
              {renderInlineMarkdown(line, `quote-${blocks.length}-${lineIndex}`)}
            </React.Fragment>
          ))}
        </blockquote>
      );
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && !isBlank(lines[index]) && !isBlockStart(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    if (paragraphLines.length) {
      blocks.push(
        <p key={`paragraph-${blocks.length}`}>
          {paragraphLines.map((line, lineIndex) => (
            <React.Fragment key={`paragraph-line-${lineIndex}`}>
              {lineIndex > 0 && <br />}
              {renderInlineMarkdown(line, `paragraph-${blocks.length}-${lineIndex}`)}
            </React.Fragment>
          ))}
        </p>
      );
    } else {
      index += 1;
    }
  }

  return <div className={`chat-markdown space-y-2 ${isUser ? 'chat-markdown-user' : ''}`}>{blocks}</div>;
};

// ── Message bubble ──────────────────────────────────────────────────────────
const MessageBubble = ({ msg }) => {
  const [showAgentDetails, setShowAgentDetails] = useState(false);
  const isUser = msg.role === 'user';
  const isError = msg.role === 'error';
  const isML = msg.agentType === 'ML_ANALYST';
  const isStock = msg.agentType === 'SALES_INVENTORY';
  const isOrchestrator = msg.agentType === 'ORCHESTRATOR';

  if (isError) {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-xs border border-red-200 rounded-xl px-4 py-2 max-w-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{msg.content}</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {/* Avatar Bot */}
      {!isUser && (
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm text-white ${
            isOrchestrator
              ? 'bg-gradient-to-br from-indigo-600 via-purple-600 to-teal-600 shadow-indigo-500/20'
              : isML
              ? 'bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 shadow-purple-500/20'
              : isStock
              ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20'
              : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20'
          }`}
          title={msg.agentName || 'Asistente'}
        >
          {isML && !isOrchestrator ? <BarChart3 className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>
      )}

      <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        {/* Badge del Agente que respondió */}
        {!isUser && msg.badge && (
          <div className="mb-1 flex items-center gap-1">
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 ${
                isOrchestrator
                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                  : isML
                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                  : isStock
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              }`}
            >
              {msg.badge}
            </span>
            {isOrchestrator && (
              <span className="text-[9px] font-bold tracking-wide text-indigo-500">MENSAJE PRINCIPAL</span>
            )}
          </div>
        )}

        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-tr-sm shadow-md'
              : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
          }`}
        >
          {msg.content && <MarkdownContent content={msg.content} isUser={isUser} />}
          {msg.streaming && (
            <span className="inline-flex gap-0.5 ml-1 align-middle">
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          )}
        </div>

        {!isUser && msg.agentRoles?.length > 0 && (
          <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-2.5 py-2">
            <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-indigo-500">
              Roles del sistema multiagente
            </div>
            <div className="space-y-1">
              {msg.agentRoles.map((agent) => (
                <div key={agent.agentType}>
                  <div
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${
                      agent.status === 'ERROR'
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : agent.active
                        ? 'border-indigo-200 bg-white text-indigo-900'
                        : 'border-transparent bg-white/60 text-gray-400'
                    }`}
                  >
                    <span className="text-[10px] font-semibold">{agent.badge}</span>
                    <span className="min-w-0 flex-1 truncate text-[9px]">{agent.role}</span>
                    <span className="shrink-0 text-[8px] font-medium text-gray-500">{agent.provider}</span>
                    <span className={`shrink-0 text-[8px] font-bold tracking-wide ${agent.status === 'ERROR' ? 'text-red-600' : agent.active ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {agent.status}
                    </span>
                  </div>
                  {agent.status === 'ERROR' && agent.error && (
                    <div className="px-2 pt-1 text-[9px] leading-snug text-red-700">
                      {agent.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!msg.streaming && (
              <button
                type="button"
                onClick={() => setShowAgentDetails(value => !value)}
                className="mt-2 text-[9px] font-semibold text-indigo-700 hover:text-indigo-900"
              >
                {showAgentDetails ? 'Ocultar análisis' : 'Ver análisis de cada agente'}
              </button>
            )}
            {showAgentDetails && !msg.streaming && (
              <div className="mt-2 space-y-2 border-t border-indigo-100 pt-2">
                {msg.agentRoles.map(agent => (
                  <div key={`${agent.agentType}-detail`} className="rounded-lg bg-white/80 p-2 text-[10px] text-gray-700">
                    <div className="mb-1 font-semibold text-gray-900">{agent.badge} · {agent.provider}</div>
                    {agent.content ? <MarkdownContent content={agent.content} /> : <span className="text-red-600">{agent.error || 'Sin respuesta disponible.'}</span>}
                  </div>
                ))}
              </div>
            )}
            {msg.partial && !msg.streaming && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] text-amber-800">
                Respuesta parcial: uno o más agentes no estuvieron disponibles.
              </div>
            )}
          </div>
        )}
        <div className={`text-[10px] text-gray-400 mt-0.5 ${isUser ? 'text-right' : 'text-left'} px-1`}>
          {msg.time}
        </div>
      </div>

      {/* Avatar User */}
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm text-white">
          <User className="w-4 h-4" />
        </div>
      )}
    </motion.div>
  );
};

// ── Main Component ──────────────────────────────────────────────────────────
const AIAssistant = ({ products = [], user = null, profile = null }) => {
  const admin = isAdminUser(profile || user);
  const visibleSuggestions = QUICK_SUGGESTIONS.filter(suggestion => admin || !suggestion.adminOnly);
  const audienceKey = `${user?.id || 'anonymous'}:${admin ? 'admin' : 'customer'}`;
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const audienceKeyRef = useRef(audienceKey);

  const now = () => new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  // Nunca conservar una conversación administrativa al cambiar de usuario o
  // pasar de administrador a cliente en la misma pestaña.
  useEffect(() => {
    audienceKeyRef.current = audienceKey;
    setMessages([]);
    setInput('');
    setShowSuggestions(true);
  }, [audienceKey]);

  // Welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const name = profile?.first_name || user?.email?.split('@')[0] || 'amigo';
      const welcomeRoles = [
        { agentType: 'PHARMACY', provider: 'GEMINI', badge: '💊 FarmaBot', role: getAgentRoleLabel('PHARMACY', admin), status: 'DISPONIBLE', active: false },
        { agentType: 'ML_ANALYST', provider: 'GROQ', badge: '📊 DataBot', role: getAgentRoleLabel('ML_ANALYST', admin), status: 'DISPONIBLE', active: false },
        { agentType: 'SALES_INVENTORY', provider: 'OPENROUTER', badge: '📦 StockBot', role: getAgentRoleLabel('SALES_INVENTORY', admin), status: 'DISPONIBLE', active: false },
      ];
      const welcomeContent = admin
        ? `¡Hola ${name}! 👋 Soy tu **Asistente Virtual Multiagente** con tres agentes activos y un orquestador Gemini:\n\n• 💊 **FarmaBot (Gemini):** Resuelve dudas sobre medicamentos, precios, síntomas y compras.\n• 📊 **DataBot (Groq):** Responde preguntas sobre predicciones, métricas y clientes en riesgo.\n• 📦 **StockBot (OpenRouter):** Analiza ventas, inventario y reposición.\n\n¿En qué te puedo ayudar hoy?`
        : `¡Hola ${name}! 👋 Soy tu **Asistente Virtual Multiagente**.\n\n• 💊 **FarmaBot (Gemini):** Medicamentos, precios, ofertas y orientación general de salud.\n• 📊 **DataBot (Groq):** Conceptos generales de datos y Machine Learning.\n• 📦 **StockBot (OpenRouter):** Información pública del catálogo.\n\nLos datos internos de inventario, stock, ventas, ganancias y otros usuarios están protegidos y solo están disponibles para administradores.\n\n¿En qué te puedo ayudar hoy?`;
      setMessages([{
        id: Date.now(),
        role: 'assistant',
        badge: '🧭 Orquestador',
        agentType: 'ORCHESTRATOR',
        agentRoles: welcomeRoles,
        content: welcomeContent,
        time: now()
      }]);
    }
  }, [isOpen, admin, profile?.first_name, user?.email]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
      setHasUnread(false);
    }
  }, [isOpen]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const userText = (text || input).trim();
    if (!userText || isThinking) return;
    const requestAudienceKey = audienceKey;

    const userMsg = { id: Date.now(), role: 'user', content: userText, time: now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setShowSuggestions(false);
    setIsThinking(true);

    // Placeholder streaming message
    const botId = Date.now() + 1;
    const botMsg = {
      id: botId,
      role: 'assistant',
      content: '',
      streaming: true,
      time: now(),
      badge: '🧭 Orquestador Gemini',
      agentType: 'ORCHESTRATOR',
      agentRoles: [
        { agentType: 'PHARMACY', provider: 'GEMINI', badge: '💊 FarmaBot', role: getAgentRoleLabel('PHARMACY', admin), status: 'EN PROCESO', active: true },
        { agentType: 'ML_ANALYST', provider: 'GROQ', badge: '📊 DataBot', role: getAgentRoleLabel('ML_ANALYST', admin), status: 'EN PROCESO', active: true },
        { agentType: 'SALES_INVENTORY', provider: 'OPENROUTER', badge: '📦 StockBot', role: getAgentRoleLabel('SALES_INVENTORY', admin), status: 'EN PROCESO', active: true },
      ]
    };
    setMessages(prev => [...prev, botMsg]);

    try {
      // Build history (exclude current user message and streaming placeholder)
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .filter(m => !m.streaming)
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

      let accumulated = '';
      const result = await executeMultiAgentChat({
        userMessage: userText,
        history,
        products,
        user: profile || user,
        onChunk: (chunk) => {
          accumulated += chunk;
          setMessages(prev =>
            prev.map(m => m.id === botId ? { ...m, content: accumulated } : m)
          );
        },
        onAgentStatus: (agentRoles) => {
          setMessages(prev =>
            prev.map(m => m.id === botId ? { ...m, agentRoles: getVisibleAgentRoles(agentRoles, admin) } : m)
          );
        }
      });

      // Finalize with the exact agent routing badge and complete text
      setMessages(prev =>
        prev.map(m => m.id === botId ? {
          ...m,
          content: result.content || accumulated,
          badge: '🧭 Orquestador',
          agentName: 'Orquestador Multiagente',
          agentType: 'ORCHESTRATOR',
          agentRoles: getVisibleAgentRoles(result.agentRoles, admin),
          partial: result.partial,
          streaming: false
        } : m)
      );

      if (!isOpen) setHasUnread(true);

    } catch (err) {
      if (audienceKeyRef.current !== requestAudienceKey) return;
      const isSelfMedication = err?.code === 'SELF_MEDICATION_DETECTED';
      const isRestricted = err?.code === 'ADMIN_DATA_REQUIRED';
      setMessages(prev => [...prev.filter(m => m.id !== botId), {
        id: Date.now(),
        role: isSelfMedication || isRestricted ? 'assistant' : 'error',
        badge: isRestricted ? '🔒 Acceso restringido' : isSelfMedication ? '⚠️ Seguridad farmacéutica' : undefined,
        agentType: isRestricted ? 'ORCHESTRATOR' : 'PHARMACY',
        content: err.message || 'Error al conectar con el asistente.',
        time: now()
      }]);
    } finally {
      setIsThinking(false);
    }
  }, [input, isThinking, messages, products, profile, user, isOpen, admin, audienceKey]);

  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <motion.button
        onClick={() => setIsOpen(prev => !prev)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-indigo-600 text-white shadow-xl shadow-emerald-500/30 flex items-center justify-center transition-all"
        aria-label="Abrir asistente IA"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} className="relative">
              <Sparkles className="w-6 h-6" />
              {hasUnread && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-24 right-6 z-50 w-[385px] max-h-[620px] flex flex-col bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden"
            style={{ maxWidth: 'calc(100vw - 24px)' }}
          >
            {/* Header Multiagente */}
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 px-5 py-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-sm flex items-center gap-1.5">
                  Multiagente Gemini + Groq + OpenRouter
                  <span className="text-[10px] bg-white/25 px-2 py-0.5 rounded-full font-semibold">MULTIAGENTE</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  <span className="text-emerald-100 text-[11px] truncate">
                    3 agentes en paralelo · Orquestador Gemini
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearChat}
                  className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                  title="Nueva conversación"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sub-banner informativo de agentes */}
            <div className="bg-gradient-to-r from-emerald-50 to-indigo-50 border-b border-gray-200/60 px-4 py-1.5 flex items-center justify-between text-[11px] text-gray-600">
              <span className="flex items-center gap-1 font-medium text-emerald-800">
                <Pill className="w-3 h-3 text-emerald-600" /> FarmaBot · Gemini
              </span>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-1 font-medium text-indigo-800">
                <Activity className="w-3 h-3 text-indigo-600" /> DataBot · Groq
              </span>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-1 font-medium text-amber-800">
                <BarChart3 className="w-3 h-3 text-amber-600" /> StockBot · OpenRouter
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/50 min-h-0">
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

              {/* Suggestions */}
              {showSuggestions && messages.length <= 1 && (
                <div className="pt-2">
                  <p className="text-[11px] text-gray-400 text-center mb-2 font-medium uppercase tracking-wider">
                    Preguntas sugeridas
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {visibleSuggestions.map((s, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => sendMessage(s.text)}
                        disabled={isThinking}
                        className="text-left text-[11px] bg-white border border-gray-200 rounded-xl px-2.5 py-2 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-900 transition-all leading-snug disabled:opacity-50 shadow-2xs"
                      >
                        {s.label}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Context pill: products & ML status */}
            <div className="px-4 py-1.5 bg-white border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                <Pill className="w-3 h-3 text-emerald-500" />
                <span>{products.filter(p => p.is_active !== false).length} medicamentos</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-indigo-600 font-medium">
                <BarChart3 className="w-3 h-3" />
                <span>{admin ? 'ML + inventario autorizados' : 'Protección de datos activa'}</span>
              </div>
            </div>

            {/* Input Area */}
            <div className="px-3 pb-3 bg-white">
              <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isThinking}
                  placeholder={admin ? 'Pregunta sobre medicamentos, inventario o métricas...' : 'Pregunta sobre medicamentos, precios u ofertas...'}
                  rows={1}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none resize-none max-h-28 leading-5 disabled:opacity-60"
                  style={{ minHeight: '20px' }}
                  onInput={e => {
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`;
                  }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isThinking}
                  className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-600 text-white flex items-center justify-center shrink-0 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                >
                  {isThinking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-1.5">
                Markdown compatible · Tres agentes analizan en paralelo y Gemini sintetiza.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIAssistant;

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, Bot, User, Loader2, Sparkles, Pill, AlertTriangle,
  ChevronDown, RefreshCw, Mic, Volume2
} from 'lucide-react';
import { sendMessageToGemini, isGeminiConfigured } from '@/lib/geminiClient';

// ── Quick suggestion chips ──────────────────────────────────────────────────
const QUICK_SUGGESTIONS = [
  { label: '💊 Tengo dolor de cabeza', text: 'Tengo dolor de cabeza, ¿qué me recomiendas?' },
  { label: '🤒 Mi hijo tiene fiebre', text: 'Mi hijo tiene fiebre, ¿qué producto puedo darle?' },
  { label: '💰 ¿Qué hay en oferta?', text: '¿Qué productos tienen en oferta hoy?' },
  { label: '💉 Vitaminas disponibles', text: '¿Qué vitaminas y suplementos tienen disponibles?' },
  { label: '🩹 Primeros auxilios', text: '¿Tienen productos para primeros auxilios?' },
  { label: '😴 Para el insomnio', text: '¿Qué me recomiendan para el insomnio?' },
];

// ── Message bubble ──────────────────────────────────────────────────────────
const MessageBubble = ({ msg }) => {
  const isUser = msg.role === 'user';
  const isError = msg.role === 'error';

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
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-tr-sm shadow-md'
              : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
          }`}
        >
          {msg.content}
          {msg.streaming && (
            <span className="inline-flex gap-0.5 ml-1 align-middle">
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          )}
        </div>
        <div className={`text-[10px] text-gray-400 mt-0.5 ${isUser ? 'text-right' : 'text-left'} px-1`}>
          {msg.time}
        </div>
      </div>

      {/* Avatar User */}
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <User className="w-4 h-4 text-white" />
        </div>
      )}
    </motion.div>
  );
};

// ── Main Component ──────────────────────────────────────────────────────────
const AIAssistant = ({ products = [], user = null, profile = null }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const configured = isGeminiConfigured();

  // Welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const name = profile?.first_name || user?.email?.split('@')[0] || 'amigo';
      setMessages([{
        id: Date.now(),
        role: 'assistant',
        content: `¡Hola ${name}! 👋 Soy **FarmaBot**, tu asistente farmacéutico virtual.\n\nEstoy aquí para ayudarte a encontrar el medicamento o producto que necesitas, resolver tus dudas de salud y guiarte en tu compra. ¿En qué puedo ayudarte hoy?`,
        time: now()
      }]);
    }
  }, [isOpen]);

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

  const now = () => new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const userText = (text || input).trim();
    if (!userText || isThinking) return;

    const userMsg = { id: Date.now(), role: 'user', content: userText, time: now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setShowSuggestions(false);
    setIsThinking(true);

    // Placeholder streaming message
    const botId = Date.now() + 1;
    const botMsg = { id: botId, role: 'assistant', content: '', streaming: true, time: now() };
    setMessages(prev => [...prev, botMsg]);

    try {
      if (!configured) throw new Error('API key de Gemini no configurada. Agrega VITE_GEMINI_API_KEY en tu archivo .env.local');

      // Build history (exclude current user message and streaming placeholder)
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .filter(m => !m.streaming)
        .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', content: m.content }));

      let accumulated = '';
      await sendMessageToGemini(
        userText,
        history,
        products,
        profile || user,
        (chunk) => {
          accumulated += chunk;
          setMessages(prev =>
            prev.map(m => m.id === botId ? { ...m, content: accumulated } : m)
          );
        }
      );

      // Finalize (remove streaming indicator)
      setMessages(prev =>
        prev.map(m => m.id === botId ? { ...m, streaming: false } : m)
      );

      // Show unread badge if chat is closed
      if (!isOpen) setHasUnread(true);

    } catch (err) {
      // Remove streaming placeholder and show error
      setMessages(prev => prev.filter(m => m.id !== botId));
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'error',
        content: err.message || 'Error al conectar con el asistente. Revisa tu API key.',
        time: now()
      }]);
    } finally {
      setIsThinking(false);
    }
  }, [input, isThinking, messages, products, profile, user, configured, isOpen]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(true);
    setInput('');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating Toggle Button */}
      <motion.button
        onClick={() => setIsOpen(v => !v)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 text-white shadow-xl shadow-emerald-500/30 flex items-center justify-center transition-all"
        aria-label="Abrir asistente IA"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} className="relative">
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
            className="fixed bottom-24 right-6 z-50 w-[370px] max-h-[600px] flex flex-col bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden"
            style={{ maxWidth: 'calc(100vw - 24px)' }}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-sm flex items-center gap-1.5">
                  FarmaBot
                  <span className="text-[10px] bg-white/25 px-1.5 py-0.5 rounded-full font-normal">IA</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  <span className="text-emerald-100 text-[11px]">
                    {configured ? 'En línea · Powered by Gemini' : 'API Key requerida'}
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

            {/* API key missing warning */}
            {!configured && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Agrega <code className="bg-amber-100 px-1 rounded text-[11px]">VITE_GEMINI_API_KEY</code> en <code className="bg-amber-100 px-1 rounded text-[11px]">.env.local</code> para activar el chat IA.{' '}
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="font-bold underline">Obtener gratis →</a>
                </p>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/50 min-h-0">
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

              {/* Thinking indicator (before first streaming chunk) */}
              {isThinking && messages[messages.length - 1]?.streaming && messages[messages.length - 1]?.content === '' && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <div className="flex gap-1 items-center">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Suggestions */}
              {showSuggestions && messages.length <= 1 && (
                <div className="pt-2">
                  <p className="text-[11px] text-gray-400 text-center mb-2 font-medium uppercase tracking-wider">Preguntas frecuentes</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK_SUGGESTIONS.map((s, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => sendMessage(s.text)}
                        disabled={isThinking}
                        className="text-left text-[11px] bg-white border border-gray-200 rounded-xl px-2.5 py-2 text-gray-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 transition-all leading-snug disabled:opacity-50"
                      >
                        {s.label}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Context pill: products count */}
            <div className="px-4 py-1.5 bg-white border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <Pill className="w-3 h-3" />
                <span>{products.filter(p => p.is_active !== false).length} productos en catálogo</span>
              </div>
              <span className="text-[10px] text-gray-300">Gemini 1.5 Flash</span>
            </div>

            {/* Input Area */}
            <div className="px-3 pb-3 bg-white">
              <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isThinking}
                  placeholder={configured ? 'Escribe tu consulta farmacéutica…' : 'Configura la API key para chatear…'}
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
                  disabled={!input.trim() || isThinking || !configured}
                  className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                >
                  {isThinking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-300 text-center mt-1.5">
                FarmaBot no reemplaza la consulta médica. Ante emergencias llama al 117.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIAssistant;

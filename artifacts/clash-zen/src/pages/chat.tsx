import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft, Send, Shield, RefreshCw, CheckCheck } from "lucide-react";
import { apiFetch, apiPost } from "@/lib/api";
import { useLocation } from "wouter";

interface ChatMessage {
  id: number;
  message: string;
  isFromAdmin: boolean;
  readByUser: boolean;
  createdAt: string;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return ""; }
}

export default function ChatPage() {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
    }, 50);
  };

  const loadMessages = useCallback(async () => {
    try {
      const data = await apiFetch<ChatMessage[]>("/support/messages");
      setMessages(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages().then(() => scrollToBottom("instant"));
    const interval = setInterval(loadMessages, 10000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [messages, loading]);

  async function send() {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    const optimistic: ChatMessage = {
      id: Date.now(),
      message: text,
      isFromAdmin: false,
      readByUser: true,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    scrollToBottom();

    try {
      const sent = await apiPost<ChatMessage>("/support/messages", { message: text });
      setMessages(prev => prev.map(m => m.id === optimistic.id ? sent : m));
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setInput(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const isEmpty = !loading && messages.length === 0;

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #050810 0%, #060a14 50%, #040608 100%)" }}>

      <div className="absolute top-0 left-1/4 w-[280px] h-[280px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[260px] h-[260px] bg-indigo-600/10 rounded-full blur-[90px] pointer-events-none" />

      {/* Header */}
      <div className="relative z-20 flex items-center gap-3 px-4 py-3 border-b border-white/5"
        style={{ background: "rgba(8,10,16,0.85)", backdropFilter: "blur(20px)" }}>
        <button onClick={() => navigate("/support")} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500/30 to-indigo-600/30 border border-sky-500/40 flex items-center justify-center shadow-[0_0_16px_rgba(56,189,248,0.3)]">
            <Shield className="w-5 h-5 text-sky-300" />
          </div>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#060a14] shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-bold text-white text-sm tracking-tight">Clash Ren Support</p>
          <p className="text-[11px] text-emerald-400 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />Online
          </p>
        </div>
        <button onClick={() => loadMessages()} disabled={loading} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
          <RefreshCw className={cn("w-4 h-4 text-zinc-400", loading && "animate-spin")} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 relative z-10">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
            <p className="text-zinc-500 text-xs">Loading messages...</p>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <Shield className="w-7 h-7 text-sky-400" strokeWidth={1.5} />
            </div>
            <p className="font-bold text-white text-sm">How can we help?</p>
            <p className="text-zinc-500 text-xs max-w-[220px] leading-relaxed">Send us a message and our support team will get back to you as soon as possible.</p>
          </div>
        )}

        {!loading && messages.length > 0 && (
          <>
            <div className="flex items-center justify-center mb-4">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider px-3 py-1 rounded-full bg-white/3 border border-white/5">
                {messages.length} message{messages.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-2.5">
              {messages.map((m, idx) => {
                const isMe = !m.isFromAdmin;
                const prevSameSide = idx > 0 && messages[idx - 1].isFromAdmin === m.isFromAdmin;
                return (
                  <div key={m.id} className={cn("flex gap-2", isMe ? "flex-row-reverse" : "flex-row")}>
                    <div className={cn("w-7 h-7 shrink-0", prevSameSide && "invisible")}>
                      {!prevSameSide && (
                        <div className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0",
                          isMe
                            ? "bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border border-cyan-500/40"
                            : "bg-gradient-to-br from-sky-500/30 to-indigo-600/30 border border-sky-500/40"
                        )}>
                          {isMe ? "🎮" : <Shield className="w-3.5 h-3.5 text-sky-300" />}
                        </div>
                      )}
                    </div>
                    <div className={cn("max-w-[75%] flex flex-col", isMe ? "items-end" : "items-start")}>
                      <div className={cn(
                        "px-3.5 py-2 text-sm leading-relaxed shadow-md",
                        isMe
                          ? "bg-gradient-to-br from-cyan-600 to-sky-700 text-white rounded-2xl rounded-tr-md"
                          : "bg-white/8 border border-white/10 text-white rounded-2xl rounded-tl-md backdrop-blur-sm"
                      )}>
                        {m.message}
                      </div>
                      <div className="flex items-center gap-1 mt-1 px-1">
                        <span className="text-[10px] text-zinc-600">{fmtTime(m.createdAt)}</span>
                        {isMe && <CheckCheck className={cn("w-3 h-3", m.readByUser ? "text-cyan-400" : "text-zinc-600")} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Composer */}
      <div className="relative z-20 px-3 py-3 border-t border-white/5"
        style={{ background: "rgba(8,10,16,0.92)", backdropFilter: "blur(20px)" }}>
        <div className="flex items-center gap-2 rounded-full px-4 py-1.5"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Message support…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none py-2"
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0",
              input.trim() && !sending
                ? "bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-[0_0_14px_rgba(56,189,248,0.5)] active:scale-95"
                : "bg-white/5 text-zinc-600"
            )}
          >
            {sending
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

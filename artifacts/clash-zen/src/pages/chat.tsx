import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft, Send, Shield, CheckCheck } from "lucide-react";
import { apiFetch, apiPost } from "@/lib/api";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

interface ChatMessage {
  id: number;
  message: string;
  isFromAdmin: boolean;
  readByUser: boolean;
  createdAt: string;
}

interface Presence {
  online: boolean;
  lastActive: string | null;
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }); }
  catch { return ""; }
}

function resolveAvatar(pic: string | null | undefined): string | null {
  if (!pic) return null;
  if (pic.startsWith("/api/") || pic.startsWith("http")) return pic;
  return `/api/storage${pic}`;
}

export default function ChatPage() {
  const [, navigate]  = useLocation();
  const { user }      = useAuth();

  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(true);
  const [sending, setSending]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [adminTyping, setAdminTyping] = useState(false);
  const [presence, setPresence]       = useState<Presence>({ online: false, lastActive: null });
  const [chatH, setChatH]             = useState<number | null>(null);

  const scrollRef        = useRef<HTMLDivElement>(null);
  const inputRef         = useRef<HTMLInputElement>(null);
  const adminTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userTypingActive = useRef(false);
  const userTypingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolved user avatar URL
  const userAvatar = resolveAvatar(user?.profilePicture);
  const userInitial = (user?.inGameName?.[0] ?? "U").toUpperCase();

  /* ── Scroll to bottom ─────────────────────────────────────────────────────── */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
    }, 60);
  }, []);

  /* ── Keyboard-aware height (WhatsApp style) ──────────────────────────────── */
  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;
    const update = () => {
      setChatH(vp.offsetTop + vp.height);
      scrollToBottom("instant");
    };
    vp.addEventListener("resize", update);
    vp.addEventListener("scroll", update);
    update();
    return () => {
      vp.removeEventListener("resize", update);
      vp.removeEventListener("scroll", update);
    };
  }, [scrollToBottom]);

  /* ── Load messages ────────────────────────────────────────────────────────── */
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
  }, [loadMessages, scrollToBottom]);

  /* ── Fetch presence on mount ─────────────────────────────────────────────── */
  useEffect(() => {
    fetch("/api/support/presence", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((p: Presence | null) => { if (p) setPresence(p); })
      .catch(() => {});
  }, []);

  /* ── SSE connection ───────────────────────────────────────────────────────── */
  useEffect(() => {
    const es = new EventSource("/api/users/sse", { withCredentials: true });

    es.addEventListener("chat_message", (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data) as ChatMessage;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        scrollToBottom();
      } catch {}
    });

    es.addEventListener("support_typing", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { typing: boolean };
        setAdminTyping(d.typing);
        if (adminTypingTimer.current) clearTimeout(adminTypingTimer.current);
        if (d.typing) {
          adminTypingTimer.current = setTimeout(() => setAdminTyping(false), 6000);
        }
      } catch {}
    });

    es.addEventListener("support_presence", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { online: boolean; lastActive?: string };
        setPresence({ online: d.online, lastActive: d.lastActive ?? null });
      } catch {}
    });

    return () => { es.close(); };
  }, [scrollToBottom]);

  /* ── Auto-scroll on new messages / typing ────────────────────────────────── */
  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [messages, adminTyping, loading, scrollToBottom]);

  /* ── User typing signal ───────────────────────────────────────────────────── */
  function notifyTyping(active: boolean) {
    fetch("/api/support/typing", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typing: active }),
    }).catch(() => {});
  }

  function handleInputChange(v: string) {
    setInput(v);
    if (!userTypingActive.current) {
      userTypingActive.current = true;
      notifyTyping(true);
    }
    if (userTypingTimer.current) clearTimeout(userTypingTimer.current);
    userTypingTimer.current = setTimeout(() => {
      userTypingActive.current = false;
      notifyTyping(false);
    }, 2500);
  }

  /* ── Send message ─────────────────────────────────────────────────────────── */
  async function send() {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    if (userTypingTimer.current) clearTimeout(userTypingTimer.current);
    userTypingActive.current = false;
    notifyTyping(false);

    setSending(true);
    const optimistic: ChatMessage = {
      id: Date.now(), message: text, isFromAdmin: false, readByUser: true,
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

  const isEmpty = !loading && messages.length === 0 && !error;

  /* ── User avatar node (reused in message list) ───────────────────────────── */
  function UserAvatar() {
    return userAvatar ? (
      <img src={userAvatar} alt="" className="w-7 h-7 rounded-full object-cover" />
    ) : (
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
        style={{ background: "linear-gradient(135deg,rgba(56,189,248,0.4),rgba(99,102,241,0.4))", border: "1px solid rgba(56,189,248,0.35)" }}>
        {userInitial}
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────── */
  return (
    <div
      className="flex flex-col relative overflow-hidden"
      style={{
        height: chatH ? `${chatH}px` : "100dvh",
        background: "linear-gradient(180deg, #050810 0%, #060a14 50%, #040608 100%)",
      }}>
      {/* CSS for typing bubble */}
      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        .typing-dot { animation: typingBounce 1.2s ease-in-out infinite; }
        .typing-dot:nth-child(2) { animation-delay: 0.15s; }
        .typing-dot:nth-child(3) { animation-delay: 0.3s; }
      `}</style>

      <div className="absolute top-0 left-1/4 w-[280px] h-[280px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[260px] h-[260px] bg-indigo-600/10 rounded-full blur-[90px] pointer-events-none" />

      {/* ── Header ── */}
      <div className="relative z-20 flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ background: "rgba(8,10,16,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <button onClick={() => navigate("/support")}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:bg-white/10 transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>

        {/* Support avatar */}
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg,rgba(56,189,248,0.25),rgba(99,102,241,0.25))",
              border: "1px solid rgba(56,189,248,0.35)",
            }}>
            <Shield className="w-5 h-5 text-sky-300" />
          </div>
          {presence.online && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#060a14]"
              style={{ boxShadow: "0 0 6px rgba(52,211,153,0.7)" }} />
          )}
        </div>

        {/* Name + status — only shown when online or typing */}
        <div className="flex-1 min-w-0">
          <p className="font-heading font-bold text-white text-sm">Human Support</p>
          {adminTyping ? (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-0.5">
                <span className="typing-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                <span className="typing-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                <span className="typing-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              </div>
              <span className="text-[11px] text-emerald-400">typing…</span>
            </div>
          ) : presence.online ? (
            <p className="text-[11px] text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              Online
            </p>
          ) : null}
        </div>
      </div>

      {/* ── Messages ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 relative z-10" style={{ minHeight: 0 }}>
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <span key={i} className="typing-dot w-2 h-2 rounded-full bg-sky-400 inline-block" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <p className="text-zinc-500 text-xs">Loading messages…</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={() => { setLoading(true); loadMessages(); }}
              className="text-xs text-sky-400 underline">Retry</button>
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center pb-6">
            {/* Support avatar */}
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg,rgba(56,189,248,0.15),rgba(99,102,241,0.15))",
                  border: "1px solid rgba(56,189,248,0.25)",
                  boxShadow: "0 0 32px rgba(56,189,248,0.1)",
                }}>
                <Shield className="w-8 h-8 text-sky-300" strokeWidth={1.5} />
              </div>
              {presence.online && (
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-[#060a14] flex items-center justify-center"
                  style={{ boxShadow: "0 0 8px rgba(52,211,153,0.7)" }} />
              )}
            </div>

            {presence.online ? (
              <>
                <div>
                  <p className="font-bold text-white text-base">We're online right now!</p>
                  <p className="text-emerald-400 text-xs mt-0.5 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Support is available
                  </p>
                </div>
                <div className="rounded-2xl px-4 py-3 max-w-[260px]"
                  style={{ background: "rgba(56,189,248,0.07)", border: "1px solid rgba(56,189,248,0.15)" }}>
                  <p className="text-zinc-300 text-sm leading-relaxed">
                    Tell us what problem you're facing — we'll help you right away 👇
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="font-bold text-white text-base">Chat with Human Support</p>
                  <p className="text-zinc-500 text-xs mt-0.5">We'll reply as soon as we're back</p>
                </div>
                <div className="rounded-2xl px-4 py-3 max-w-[260px]"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Describe your issue below and we'll get back to you shortly.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {!loading && messages.length > 0 && (
          <div className="space-y-2.5">
            {messages.map((m, idx) => {
              const isMe = !m.isFromAdmin;
              const prevSameSide = idx > 0 && messages[idx - 1].isFromAdmin === m.isFromAdmin;
              const prevSameMin  = idx > 0 && Math.abs(
                new Date(m.createdAt).getTime() - new Date(messages[idx - 1].createdAt).getTime()
              ) < 60000 && messages[idx - 1].isFromAdmin === m.isFromAdmin;
              return (
                <div key={m.id} className={cn("flex gap-2 items-end", isMe ? "flex-row-reverse" : "flex-row")}>
                  <div className={cn("w-7 h-7 shrink-0", prevSameSide && "invisible")}>
                    {!prevSameSide && (
                      isMe ? <UserAvatar /> : (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.3)" }}>
                          <Shield className="w-3.5 h-3.5 text-sky-300" />
                        </div>
                      )
                    )}
                  </div>
                  <div className={cn("max-w-[75%] flex flex-col", isMe ? "items-end" : "items-start")}>
                    <div className={cn(
                      "px-3.5 py-2 text-sm leading-relaxed shadow-md break-words",
                      isMe
                        ? "text-white rounded-2xl rounded-br-sm"
                        : "bg-white/8 border border-white/10 text-white rounded-2xl rounded-bl-sm backdrop-blur-sm"
                    )} style={isMe ? {
                      background: "linear-gradient(135deg,rgba(14,165,233,0.9),rgba(6,182,212,0.85))",
                      boxShadow: "0 2px 12px rgba(14,165,233,0.25)",
                    } : {}}>
                      {m.message}
                    </div>
                    {!prevSameMin && (
                      <div className="flex items-center gap-1 mt-1 px-1">
                        <span className="text-[10px] text-zinc-600">{fmtTime(m.createdAt)}</span>
                        {isMe && <CheckCheck className={cn("w-3 h-3", m.readByUser ? "text-cyan-400" : "text-zinc-600")} />}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Admin typing bubble ── */}
        {adminTyping && (
          <div className="flex gap-2 items-end mt-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.3)" }}>
              <Shield className="w-3.5 h-3.5 text-sky-300" />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-zinc-400 inline-block" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-zinc-400 inline-block" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-zinc-400 inline-block" />
            </div>
          </div>
        )}
      </div>

      {/* ── Input bar (WhatsApp-style, keyboard-aware) ── */}
      <div className="relative z-20 px-3 py-3 shrink-0"
        style={{ background: "rgba(8,10,16,0.95)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
          {/* User's own avatar pill */}
          <div className="shrink-0">
            {userAvatar ? (
              <img src={userAvatar} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: "linear-gradient(135deg,rgba(14,165,233,0.4),rgba(6,182,212,0.4))", border: "1px solid rgba(14,165,233,0.35)" }}>
                {userInitial}
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Describe your problem…"
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
            )}>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

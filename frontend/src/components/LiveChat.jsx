import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Headset } from "lucide-react";
import api from "@/lib/api";

const SID_KEY = "cavi_chat_sid";

export default function LiveChat() {
  const [open, setOpen] = useState(false);
  const [sid, setSid] = useState(() => localStorage.getItem(SID_KEY) || null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const pollRef = useRef(null);

  const scrollDown = () => setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 80);

  const ensureSession = async () => {
    if (sid) return sid;
    const { data } = await api.post("/chat/session", {});
    const id = data.session.id;
    localStorage.setItem(SID_KEY, id);
    setSid(id);
    return id;
  };

  const loadMessages = async (id) => {
    if (!id) return;
    try {
      const { data } = await api.get(`/chat/${id}/messages`);
      setMessages(data.messages || []);
    } catch (_) { /* ignore */ }
  };

  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    (async () => {
      const id = await ensureSession();
      await loadMessages(id);
      scrollDown();
      pollRef.current = setInterval(() => loadMessages(id), 4000);
    })();
    return () => pollRef.current && clearInterval(pollRef.current);
    // eslint-disable-next-line
  }, [open]);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const optimistic = { id: `tmp-${Date.now()}`, sender: "user", text: t, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setText("");
    scrollDown();
    try {
      const id = await ensureSession();
      await api.post(`/chat/${id}/message`, { text: t });
      await loadMessages(id);
    } catch (_) { /* ignore */ }
    finally { setSending(false); scrollDown(); }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="fixed bottom-24 right-5 z-[60] w-[92vw] max-w-sm h-[28rem] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            style={{ background: "rgba(10,15,26,0.96)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(20px)" }}
            data-testid="livechat-panel"
          >
            <div className="px-4 py-3.5 flex items-center gap-3 border-b border-white/10" style={{ background: "linear-gradient(90deg,#00d4a0,#6c63ff)" }}>
              <span className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center"><Headset className="w-4.5 h-4.5 text-white" /></span>
              <div className="leading-tight">
                <div className="font-bold text-white text-sm">CAVI Support</div>
                <div className="text-[11px] text-white/80 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> We typically reply in minutes</div>
              </div>
              <button onClick={() => setOpen(false)} className="ml-auto text-white/80 hover:text-white" data-testid="livechat-close"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" data-testid="livechat-messages">
              <div className="flex">
                <div className="bg-white/8 text-white/80 text-sm rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[80%]">
                  👋 Hi! Welcome to CAVI. Ask us anything about staking, deposits, withdrawals or your account.
                </div>
              </div>
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`text-sm rounded-2xl px-3.5 py-2.5 max-w-[80%] ${m.sender === "user" ? "bg-[#00d4a0] text-[#04140f] rounded-tr-sm" : "bg-white/8 text-white/85 rounded-tl-sm"}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <form onSubmit={send} className="p-3 border-t border-white/10 flex items-center gap-2">
              <input
                value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your message…"
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00d4a0]/50"
                data-testid="livechat-input"
              />
              <button type="submit" disabled={sending} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50" style={{ background: "linear-gradient(135deg,#00d4a0,#6c63ff)" }} data-testid="livechat-send">
                <Send className="w-4 h-4 text-white" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
        className="fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-full flex items-center justify-center shadow-xl"
        style={{ background: "linear-gradient(135deg,#00d4a0,#6c63ff)", boxShadow: "0 8px 30px rgba(0,212,160,0.4)" }}
        data-testid="livechat-toggle" aria-label="Live chat"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ opacity: 0 }}><X className="w-6 h-6 text-white" /></motion.span>
          ) : (
            <motion.span key="c" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ opacity: 0 }}><MessageCircle className="w-6 h-6 text-white" /></motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}

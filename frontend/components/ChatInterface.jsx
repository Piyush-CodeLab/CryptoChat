"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ShieldCheck, Lock, ArrowLeft, Users, ShieldAlert } from "lucide-react";

export default function ChatInterface({
  messages,
  onSend,
  identity,
  onlineUsers = [],
  selectedPeer,
  setSelectedPeer,
  initiateSession,
  isConnected,
  handshakeComplete,
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, selectedPeer]);

  const handleSend = () => {
    if (input.trim() && isConnected && handshakeComplete) {
      onSend(input);
      setInput("");
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Filter messages for the current conversation pair
  const filteredMessages = selectedPeer
    ? messages.filter(
        (m) =>
          (m.senderId === selectedPeer.id && m.targetId === identity.id) ||
          (m.senderId === identity.id && m.targetId === selectedPeer.id)
      )
    : [];

  if (!selectedPeer) {
    return (
      <div className="h-full flex flex-col p-4">
        <div className="flex items-center gap-2 mb-4 px-1">
          <Users size={18} className="text-purple-400" />
          <h2 className="text-sm font-semibold text-white">Online Peers</h2>
          <span className="text-[10px] ml-auto bg-purple-500/15 text-purple-300 px-2 py-0.5 rounded-full font-medium">
            {onlineUsers.length} available
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {onlineUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/[0.02] border border-white/[0.06] mb-3">
                <Users size={20} className="text-[var(--text-muted)]" />
              </div>
              <p className="text-xs text-[var(--text-secondary)] font-medium">Waiting for other peers...</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-1 max-w-[200px]">
                Open another tab or device and log in to begin E2EE chat.
              </p>
            </div>
          ) : (
            onlineUsers.map((user) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setSelectedPeer(user)}
                className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all cursor-pointer flex items-center gap-3 group"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white uppercase">
                  {user.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate group-hover:text-purple-300 transition-colors">
                    {user.name}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">{user.email}</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
              </motion.div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Chat header */}
      <div className="flex-shrink-0 px-4 py-3 flex items-center gap-3"
           style={{ borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={() => setSelectedPeer(null)}
          className="p-1.5 rounded-xl hover:bg-white/[0.05] text-[var(--text-secondary)] hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white uppercase">
            {selectedPeer.name.slice(0, 2)}
          </div>
          {handshakeComplete && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
                  style={{ background: "var(--green)", borderColor: "var(--bg-secondary)" }}>
              <Lock size={6} className="text-white" />
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold text-white truncate">{selectedPeer.name}</h2>
          <p className="text-[10px] truncate" style={{ color: handshakeComplete ? "var(--green)" : "var(--text-muted)" }}>
            {handshakeComplete
              ? "Serpent-256-CBC Active"
              : isConnected
                ? "Handshake required"
                : "Connecting..."}
          </p>
        </div>
        {handshakeComplete && (
          <div className="px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400">
            Secured
          </div>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollRef}
           className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
           style={{ scrollBehavior: "smooth" }}>
        {!handshakeComplete ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 bg-purple-500/10 border border-purple-500/20 glow-accent">
              <ShieldAlert size={24} className="text-purple-400" />
            </div>
            <h3 className="text-xs font-semibold mb-1 text-white">ML-KEM Handshake Required</h3>
            <p className="text-[10px] leading-relaxed text-[var(--text-muted)] max-w-[240px] mb-4">
              To guarantee perfect secrecy, negotiate a quantum-resistant key with {selectedPeer.name} first.
            </p>
            <button
              id="initiate-handshake-btn"
              onClick={() => initiateSession(selectedPeer.id)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", boxShadow: "0 4px 12px rgba(139,92,246,0.3)" }}
            >
              Negotiate Session Key
            </button>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 bg-emerald-500/10 border border-emerald-500/20">
              <ShieldCheck size={20} className="text-emerald-400" />
            </div>
            <h3 className="text-xs font-semibold mb-1 text-white">Secure Session Active</h3>
            <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
              All messages are end-to-end encrypted with Serpent-256 block cipher.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={`flex ${msg.isSelf ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[78%] ${msg.isSelf ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                  {/* Bubble */}
                  <div
                    className="px-3.5 py-2 rounded-2xl text-[12px] leading-relaxed break-words"
                    style={
                      msg.isSelf
                        ? {
                            background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                            color: "white",
                            borderBottomRightRadius: "6px",
                            boxShadow: "0 4px 15px rgba(139,92,246,0.3)",
                          }
                        : {
                            background: "var(--bg-tertiary)",
                            color: "var(--text-primary)",
                            borderBottomLeftRadius: "6px",
                            border: "1px solid var(--border)",
                          }
                    }
                  >
                    {msg.text}
                  </div>

                  {/* Timestamp */}
                  <span className={`text-[9px] font-medium ${msg.isSelf ? "mr-1" : "ml-1"}`}
                        style={{ color: "var(--text-muted)" }}>
                    {formatTime(msg.timestamp)}
                    {msg.isSelf && (
                      <span className="ml-1 text-purple-400">✓✓</span>
                    )}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-4 pb-3 pt-2">
        <div className="flex items-center gap-2 rounded-2xl px-3 py-1.5 bg-white/[0.02] border border-white/[0.06]">
          <input
            ref={inputRef}
            id="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              handshakeComplete
                ? "Type a message..."
                : "Negotiate key to start chatting"
            }
            disabled={!handshakeComplete}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--text-muted)] disabled:opacity-40 text-white"
          />
          <button
            id="send-button"
            onClick={handleSend}
            disabled={!input.trim() || !handshakeComplete}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 disabled:opacity-30 cursor-pointer"
            style={{
              background:
                input.trim() && handshakeComplete
                  ? "linear-gradient(135deg, #8b5cf6, #6366f1)"
                  : "var(--bg-hover)",
            }}
          >
            <Send size={12} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

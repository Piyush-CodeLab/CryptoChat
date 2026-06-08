"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Zap, Globe, Radio, KeyRound, CheckCircle2, AlertCircle, ArrowRightLeft, Lock, Unlock } from "lucide-react";

const EC = {
  ws_connect: { icon: Zap, color: "var(--green)", bg: "var(--green-glow)", label: "CONNECTION" },
  ws_disconnect: { icon: AlertCircle, color: "var(--red)", bg: "rgba(239,68,68,0.1)", label: "DISCONNECT" },
  identity: { icon: Radio, color: "var(--cyan)", bg: "var(--cyan-glow)", label: "IDENTITY" },
  system: { icon: Globe, color: "var(--text-secondary)", bg: "rgba(152,152,176,0.08)", label: "SYSTEM" },
  kem_keygen: { icon: KeyRound, color: "var(--amber)", bg: "rgba(245,158,11,0.1)", label: "ML-KEM KEYGEN" },
  kem_encap: { icon: Lock, color: "var(--accent-light)", bg: "var(--accent-glow)", label: "KEM ENCAPSULATE" },
  kem_decap: { icon: Unlock, color: "var(--cyan)", bg: "var(--cyan-glow)", label: "KEM DECAPSULATE" },
  handshake_complete: { icon: CheckCircle2, color: "var(--green)", bg: "var(--green-glow)", label: "HANDSHAKE ✓" },
  serpent_encrypt: { icon: Lock, color: "var(--accent-light)", bg: "var(--accent-glow)", label: "SERPENT ENCRYPT" },
  serpent_decrypt: { icon: Unlock, color: "var(--green)", bg: "var(--green-glow)", label: "SERPENT DECRYPT" },
  network_transit: { icon: ArrowRightLeft, color: "var(--amber)", bg: "rgba(245,158,11,0.1)", label: "NETWORK TRANSIT" },
  unknown: { icon: AlertCircle, color: "var(--text-muted)", bg: "rgba(90,90,120,0.1)", label: "EVENT" },
};

function LogEntry({ log }) {
  const c = EC[log.event] || EC.unknown;
  const Icon = c.icon;
  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: c.bg }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${c.color}20` }}>
          <Icon size={14} style={{ color: c.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: c.color }}>{c.label}</span>
            {log.sender && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>{log.sender}</span>}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{log.detail}</p>
          {log.hex && (
            <div className="mt-2 rounded-lg px-3 py-2 overflow-hidden" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full pulse-glow" style={{ background: "var(--amber)" }} />
                <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "var(--amber)" }}>Encrypted Ciphertext (Hex)</span>
              </div>
              <p className="text-[10px] break-all font-mono select-all text-white" style={{ color: "var(--text-primary)", userSelect: "all" }}>{log.hex}</p>
            </div>
          )}
          {(log.pk_preview || log.ct_preview || log.secret_preview) && (
            <div className="mt-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
              <div className="text-[8px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
                {log.pk_preview ? "Public Key Preview (Hex)" : log.ct_preview ? "Ciphertext Preview (Hex)" : "Shared Secret Key (256-bit Hex)"}
              </div>
              <p className="text-[10px] break-all font-mono select-all" style={{ color: "var(--text-primary)", userSelect: "all" }}>
                {log.pk_preview || log.ct_preview || log.secret_preview}
              </p>
              {log.key_length && <p className="text-[9px] mt-1.5 font-semibold" style={{ color: c.color }}>Key Length: {log.key_length}-bit</p>}
            </div>
          )}
        </div>
        <span className="text-[9px] font-mono flex-shrink-0 mt-1" style={{ color: "var(--text-muted)" }}>
          {new Date(log.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
    </motion.div>
  );
}

export default function EngineLogs({ logs }) {
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [logs]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-5 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--accent-glow)" }}>
          <ShieldCheck size={16} style={{ color: "var(--accent-light)" }} />
        </div>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Cryptographic Engine</h2>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Real-time security event monitor</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full pulse-glow" style={{ background: "var(--green)" }} />
          <span className="text-[10px] font-semibold" style={{ color: "var(--green)" }}>{logs.length} events</span>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
        {logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--accent-glow)" }}>
              <ShieldCheck size={24} style={{ color: "var(--accent-light)" }} />
            </div>
            <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Engine Idle</h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Cryptographic events will appear here in real-time.</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {logs.map((log) => <LogEntry key={log.id} log={log} />)}
        </AnimatePresence>
      </div>
    </div>
  );
}

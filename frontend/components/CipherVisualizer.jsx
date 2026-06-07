"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Play, RefreshCw, Key, ShieldCheck, ArrowRight, ShieldAlert, FileText } from "lucide-react";

// ============================================================================
// SERPENT BLOCK CIPHER ENGINE (JavaScript Port - Both Encrypt & Decrypt)
// ============================================================================

const SBOX = [
  [3,8,15,1,10,6,5,11,14,13,4,2,7,0,9,12],
  [15,12,2,7,9,0,5,10,1,11,14,8,6,13,3,4],
  [8,6,7,9,3,12,10,15,13,1,14,4,0,11,5,2],
  [0,15,11,8,12,9,6,3,13,1,2,4,10,7,5,14],
  [1,15,8,3,12,0,11,6,2,5,4,10,9,14,7,13],
  [15,5,2,11,4,10,9,12,0,3,14,8,13,6,7,1],
  [7,2,12,5,8,4,6,11,14,9,1,15,13,3,10,0],
  [1,13,15,0,14,8,2,11,7,4,12,10,9,3,5,6],
];

const SBOX_INV = SBOX.map(box => {
  const inv = new Array(16);
  for (let i = 0; i < 16; i++) {
    inv[box[i]] = i;
  }
  return inv;
});

const PHI = 0x9E3779B9;

function rotl32(v, n) {
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

function rotr32(v, n) {
  return ((v >>> n) | (v << (32 - n))) >>> 0;
}

function applySBox(sboxIdx, w) {
  const box = SBOX[sboxIdx % 8];
  const r = [0, 0, 0, 0];
  for (let bit = 0; bit < 32; bit++) {
    const inp = ((w[0] >>> bit) & 1) |
                (((w[1] >>> bit) & 1) << 1) |
                (((w[2] >>> bit) & 1) << 2) |
                (((w[3] >>> bit) & 1) << 3);
    const out = box[inp];
    r[0] |= ((out >>> 0) & 1) << bit;
    r[1] |= ((out >>> 1) & 1) << bit;
    r[2] |= ((out >>> 2) & 1) << bit;
    r[3] |= ((out >>> 3) & 1) << bit;
  }
  return [r[0] >>> 0, r[1] >>> 0, r[2] >>> 0, r[3] >>> 0];
}

function applySBoxInv(sboxIdx, w) {
  const box = SBOX_INV[sboxIdx % 8];
  const r = [0, 0, 0, 0];
  for (let bit = 0; bit < 32; bit++) {
    const inp = ((w[0] >>> bit) & 1) |
                (((w[1] >>> bit) & 1) << 1) |
                (((w[2] >>> bit) & 1) << 2) |
                (((w[3] >>> bit) & 1) << 3);
    const out = box[inp];
    r[0] |= ((out >>> 0) & 1) << bit;
    r[1] |= ((out >>> 1) & 1) << bit;
    r[2] |= ((out >>> 2) & 1) << bit;
    r[3] |= ((out >>> 3) & 1) << bit;
  }
  return [r[0] >>> 0, r[1] >>> 0, r[2] >>> 0, r[3] >>> 0];
}

function linearTransform(w) {
  let x0 = rotl32(w[0], 13);
  let x2 = rotl32(w[2], 3);
  let x1 = (w[1] ^ x0 ^ x2) >>> 0;
  let x3 = (w[3] ^ x2 ^ (x0 << 3)) >>> 0;
  x1 = rotl32(x1, 1);
  x3 = rotl32(x3, 7);
  x0 = (x0 ^ x1 ^ x3) >>> 0;
  x2 = (x2 ^ x3 ^ (x1 << 7)) >>> 0;
  x0 = rotl32(x0, 5);
  x2 = rotl32(x2, 22);
  return [x0, x1, x2, x3];
}

function linearTransformInv(w) {
  let x0 = w[0];
  let x1 = w[1];
  let x2 = w[2];
  let x3 = w[3];
  
  x2 = rotr32(x2, 22);
  x0 = rotr32(x0, 5);
  x2 = (x2 ^ x3 ^ (x1 << 7)) >>> 0;
  x0 = (x0 ^ x1 ^ x3) >>> 0;
  x3 = rotr32(x3, 7);
  x1 = rotr32(x1, 1);
  x3 = (x3 ^ x2 ^ (x0 << 3)) >>> 0;
  x1 = (x1 ^ x0 ^ x2) >>> 0;
  x2 = rotr32(x2, 3);
  x0 = rotr32(x0, 13);
  return [x0, x1, x2, x3];
}

function generateSubkeys(keyString) {
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < Math.min(keyString.length, 32); i++) {
    keyBytes[i] = keyString.charCodeAt(i);
  }
  
  const w = [];
  for (let i = 0; i < 8; i++) {
    w.push(
      (keyBytes[i * 4] |
      (keyBytes[i * 4 + 1] << 8) |
      (keyBytes[i * 4 + 2] << 16) |
      (keyBytes[i * 4 + 3] << 24)) >>> 0
    );
  }

  for (let i = 8; i < 140; i++) {
    const val = w[i - 8] ^ w[i - 5] ^ w[i - 3] ^ w[i - 1] ^ PHI ^ (i - 8);
    w.push(rotl32(val >>> 0, 11));
  }

  const subkeys = [];
  for (let i = 0; i < 33; i++) {
    const group = [w[8 + 4 * i], w[8 + 4 * i + 1], w[8 + 4 * i + 2], w[8 + 4 * i + 3]];
    const sboxIdx = (35 - i) % 8;
    subkeys.push(applySBox(sboxIdx, group));
  }
  return subkeys;
}

function wordsToHex(w) {
  return w.map(val => {
    // Little-endian serialization simulation
    const b0 = val & 0xff;
    const b1 = (val >>> 8) & 0xff;
    const b2 = (val >>> 16) & 0xff;
    const b3 = (val >>> 24) & 0xff;
    return [b0, b1, b2, b3].map(b => b.toString(16).padStart(2, "0")).join("");
  }).join("");
}

function hexToWords(hex) {
  const words = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const b0 = parseInt(hex.substr(i * 8, 2), 16) || 0;
    const b1 = parseInt(hex.substr(i * 8 + 2, 2), 16) || 0;
    const b2 = parseInt(hex.substr(i * 8 + 4, 2), 16) || 0;
    const b3 = parseInt(hex.substr(i * 8 + 6, 2), 16) || 0;
    words[i] = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
  }
  return words;
}

export default function CipherVisualizer() {
  const [message, setMessage] = useState("Hello CryptoChat PQ!");
  const [cipherKey, setCipherKey] = useState("quantum_safe_key_2026");
  
  // Encryption Simulator States
  const [encPhase, setEncPhase] = useState("idle"); // idle, padding, keyschedule, rounds, completed
  const [encRound, setEncRound] = useState(0);
  const [encState, setEncState] = useState([0, 0, 0, 0]);
  const [encDetail, setEncDetail] = useState("");
  const [finalCiphertext, setFinalCiphertext] = useState("");
  
  // Decryption Simulator States
  const [decInput, setDecInput] = useState("");
  const [decPhase, setDecPhase] = useState("idle"); // idle, keyschedule, rounds, completed
  const [decRound, setDecRound] = useState(31);
  const [decState, setDecState] = useState([0, 0, 0, 0]);
  const [decDetail, setDecDetail] = useState("");
  const [finalPlaintext, setFinalPlaintext] = useState("");

  const simIntervalRef = useRef(null);

  // Stop simulation on unmount
  useEffect(() => {
    return () => clearInterval(simIntervalRef.current);
  }, []);

  // Run Encryption Simulation
  const startEncryption = () => {
    clearInterval(simIntervalRef.current);
    setEncPhase("padding");
    setEncRound(0);
    setFinalCiphertext("");
    setEncDetail("Padding message to 16 bytes (128-bit block) using PKCS#7...");

    setTimeout(() => {
      // PKCS7 Padding
      const bytes = new TextEncoder().encode(message);
      const padLen = 16 - (bytes.length % 16);
      const paddedBytes = new Uint8Array(bytes.length + padLen);
      paddedBytes.set(bytes);
      for (let i = bytes.length; i < paddedBytes.length; i++) {
        paddedBytes[i] = padLen;
      }
      
      const blockBytes = paddedBytes.slice(0, 16);
      const state = [
        (blockBytes[0] | (blockBytes[1] << 8) | (blockBytes[2] << 16) | (blockBytes[3] << 24)) >>> 0,
        (blockBytes[4] | (blockBytes[5] << 8) | (blockBytes[6] << 16) | (blockBytes[7] << 24)) >>> 0,
        (blockBytes[8] | (blockBytes[9] << 8) | (blockBytes[10] << 16) | (blockBytes[11] << 24)) >>> 0,
        (blockBytes[12] | (blockBytes[13] << 8) | (blockBytes[14] << 16) | (blockBytes[15] << 24)) >>> 0,
      ];

      setEncState(state);
      setEncPhase("keyschedule");
      setEncDetail("Expanding 256-bit key into 33 subkeys (132 words)...");

      setTimeout(() => {
        const subkeys = generateSubkeys(cipherKey);
        setEncPhase("rounds");
        let activeRound = 0;
        let activeState = [...state];

        simIntervalRef.current = setInterval(() => {
          if (activeRound < 32) {
            const r = activeRound;
            const subkey = subkeys[r];
            
            // 1. Key Mixing
            const stateXor = [
              (activeState[0] ^ subkey[0]) >>> 0,
              (activeState[1] ^ subkey[1]) >>> 0,
              (activeState[2] ^ subkey[2]) >>> 0,
              (activeState[3] ^ subkey[3]) >>> 0,
            ];

            // 2. S-Box Substitution
            const stateSbox = applySBox(r % 8, stateXor);

            // 3. Linear Transform
            let nextState;
            if (r < 31) {
              nextState = linearTransform(stateSbox);
            } else {
              // Final Key Mix
              const lastSubkey = subkeys[32];
              nextState = [
                (stateSbox[0] ^ lastSubkey[0]) >>> 0,
                (stateSbox[1] ^ lastSubkey[1]) >>> 0,
                (stateSbox[2] ^ lastSubkey[2]) >>> 0,
                (stateSbox[3] ^ lastSubkey[3]) >>> 0,
              ];
            }

            activeState = nextState;
            setEncState(activeState);
            setEncRound(r);
            setEncDetail(`Round ${r}: XOR Key -> SBox S${r % 8} -> ${r < 31 ? "Linear Transform" : "Final Key Mix"}`);
            activeRound++;
          } else {
            clearInterval(simIntervalRef.current);
            setEncPhase("completed");
            const hexResult = wordsToHex(activeState);
            setFinalCiphertext(hexResult);
            // Auto-populate decryption input for smooth user flow!
            setDecInput(hexResult);
            setEncDetail("Encryption Completed! 128-bit Ciphertext produced.");
          }
        }, 60);
      }, 800);
    }, 800);
  };

  // Run Decryption Simulation
  const startDecryption = () => {
    if (!decInput.trim()) return;
    clearInterval(simIntervalRef.current);
    setDecPhase("keyschedule");
    setDecRound(31);
    setFinalPlaintext("");
    setDecDetail("Deriving Serpent-256 key schedule for decryption...");

    setTimeout(() => {
      const subkeys = generateSubkeys(cipherKey);
      const state = hexToWords(decInput.trim());
      setDecState(state);
      setDecPhase("rounds");
      
      let activeRound = 31;
      let activeState = [...state];

      simIntervalRef.current = setInterval(() => {
        if (activeRound >= 0) {
          const r = activeRound;
          
          // 1. Inverse Linear Transform (skipped in round 31)
          let stateLtInv;
          if (r < 31) {
            stateLtInv = linearTransformInv(activeState);
          } else {
            // Undo round 31 final key mix
            const lastSubkey = subkeys[32];
            stateLtInv = [
              (activeState[0] ^ lastSubkey[0]) >>> 0,
              (activeState[1] ^ lastSubkey[1]) >>> 0,
              (activeState[2] ^ lastSubkey[2]) >>> 0,
              (activeState[3] ^ lastSubkey[3]) >>> 0,
            ];
          }

          // 2. Inverse S-Box
          const stateSboxInv = applySBoxInv(r % 8, stateLtInv);

          // 3. Inverse Key Mix
          const subkey = subkeys[r];
          const nextState = [
            (stateSboxInv[0] ^ subkey[0]) >>> 0,
            (stateSboxInv[1] ^ subkey[1]) >>> 0,
            (stateSboxInv[2] ^ subkey[2]) >>> 0,
            (stateSboxInv[3] ^ subkey[3]) >>> 0,
          ];

          activeState = nextState;
          setDecState(activeState);
          setDecRound(r);
          setDecDetail(`Round ${r}: ${r < 31 ? "Inv Linear Transform" : "Inv Final Key Mix"} -> Inv SBox S${r % 8} -> XOR Key`);
          activeRound--;
        } else {
          clearInterval(simIntervalRef.current);
          setDecPhase("completed");
          
          // Decode bytes & remove padding
          const bytes = new Uint8Array(16);
          for (let i = 0; i < 4; i++) {
            const w = activeState[i];
            bytes[i * 4] = w & 0xff;
            bytes[i * 4 + 1] = (w >>> 8) & 0xff;
            bytes[i * 4 + 2] = (w >>> 16) & 0xff;
            bytes[i * 4 + 3] = (w >>> 24) & 0xff;
          }

          // PKCS7 Unpadding
          const padLen = bytes[15];
          let unpadded = bytes;
          if (padLen >= 1 && padLen <= 16) {
            let valid = true;
            for (let i = 16 - padLen; i < 16; i++) {
              if (bytes[i] !== padLen) valid = false;
            }
            if (valid) {
              unpadded = bytes.slice(0, 16 - padLen);
            }
          }

          const decodedText = new TextDecoder().decode(unpadded);
          setFinalPlaintext(decodedText);
          setDecDetail("Decryption Completed! PKCS#7 padding removed.");
        }
      }, 60);
    }, 800);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-3 flex items-center gap-3 animate-shimmer" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--cyan-glow)" }}>
          <Cpu size={16} style={{ color: "var(--cyan)" }} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Serpent Cipher Visualizer</h2>
          <p className="text-[10px] text-[var(--text-secondary)]">Interactive 32-round pipeline sandbox</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        
        {/* ===================================================================== */}
        {/* SECTION 1: ENCRYPTION SIMULATION */}
        {/* ===================================================================== */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">01. Encryption pipeline</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 block">
              Plaintext Message Input
            </label>
            <input
              id="sim-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={encPhase !== "idle" && encPhase !== "completed"}
              className="w-full px-4 py-2.5 rounded-xl text-xs bg-transparent border border-white/[0.06] focus:border-purple-500/50 outline-none text-white disabled:opacity-50"
              placeholder="Type plaintext message..."
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 block">
              Cipher Key (256-bit seed)
            </label>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/[0.01] border border-white/[0.06]">
              <Key size={12} className="text-[var(--text-muted)]" />
              <input
                id="sim-key"
                value={cipherKey}
                onChange={(e) => setCipherKey(e.target.value)}
                disabled={(encPhase !== "idle" && encPhase !== "completed") || (decPhase !== "idle" && decPhase !== "completed")}
                className="bg-transparent text-[11px] font-mono outline-none w-full text-white disabled:opacity-50"
                placeholder="Enter key seed..."
              />
            </div>
          </div>

          <button
            id="visualize-btn"
            onClick={startEncryption}
            disabled={encPhase !== "idle" && encPhase !== "completed"}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", boxShadow: "0 4px 15px rgba(139,92,246,0.3)" }}
          >
            {encPhase === "idle" || encPhase === "completed" ? (
              <>
                <Play size={14} fill="white" />
                Visualize Encryption
              </>
            ) : (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Running Encryption...
              </>
            )}
          </button>

          {/* Encryption status card */}
          {encPhase !== "idle" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.04]"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                  {encPhase === "rounds" ? `Encryption Round ${encRound}/31` : `Encryption: ${encPhase}`}
                </span>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {encState.map(w => w.toString(16).padStart(8, "0")).slice(0, 2).join(" ")}...
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">{encDetail}</p>
              <div className="w-full bg-white/[0.03] h-1.5 rounded-full overflow-hidden mt-3">
                <div
                  className="h-full rounded-full bg-purple-500"
                  style={{
                    width:
                      encPhase === "padding"
                        ? "10%"
                        : encPhase === "keyschedule"
                        ? "30%"
                        : encPhase === "rounds"
                        ? `${30 + (encRound / 31) * 60}%`
                        : "100%",
                  }}
                />
              </div>
            </motion.div>
          )}

          {/* Encryption State Visualizer */}
          {(encPhase === "rounds" || encPhase === "completed") && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.04]"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 block">
                Intermediate Encryption State (128-bit)
              </span>
              <div className="grid grid-cols-2 gap-2 text-center">
                {encState.map((word, i) => (
                  <div key={i} className="bg-black/30 p-2.5 rounded-xl border border-white/[0.03]">
                    <span className="text-[9px] text-[var(--text-muted)] block mb-0.5">Word {i}</span>
                    <span className="text-xs font-mono font-bold text-purple-300">
                      {word.toString(16).padStart(8, "0")}
                    </span>
                    <span className="text-[8px] font-mono text-[var(--text-muted)] block mt-1">
                      {word.toString(2).padStart(32, "0").replace(/(.{8})/g, "$1 ")}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Ciphertext Output Window */}
          {finalCiphertext && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-2xl bg-black/40 border border-purple-500/20"
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldCheck size={14} className="text-purple-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300">
                  Ciphertext Output (Hex)
                </span>
              </div>
              <div className="font-mono text-xs text-white break-all select-all select-none bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04]">
                {finalCiphertext}
              </div>
            </motion.div>
          )}
        </div>

        {/* ===================================================================== */}
        {/* SECTION 2: DECRYPTION SIMULATION */}
        {/* ===================================================================== */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">02. Decryption pipeline</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 block">
              Ciphertext Pasted Input (Hex)
            </label>
            <input
              id="sim-ciphertext"
              value={decInput}
              onChange={(e) => setDecInput(e.target.value)}
              disabled={decPhase !== "idle" && decPhase !== "completed"}
              className="w-full px-4 py-2.5 rounded-xl text-xs bg-transparent border border-white/[0.06] focus:border-cyan-500/50 outline-none text-white font-mono disabled:opacity-50"
              placeholder="Paste hexadecimal ciphertext here..."
            />
          </div>

          <button
            id="decrypt-btn"
            onClick={startDecryption}
            disabled={decPhase !== "idle" && decPhase !== "completed" || !decInput.trim()}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #0891b2, #0e7490)", boxShadow: "0 4px 15px rgba(8,145,178,0.2)" }}
          >
            {decPhase === "idle" || decPhase === "completed" ? (
              <>
                <Play size={14} fill="white" />
                Decrypt Ciphertext
              </>
            ) : (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Running Decryption...
              </>
            )}
          </button>

          {/* Decryption status card */}
          {decPhase !== "idle" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.04]"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                  {decPhase === "rounds" ? `Decryption Round ${decRound}/0` : `Decryption: ${decPhase}`}
                </span>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {decState.map(w => w.toString(16).padStart(8, "0")).slice(0, 2).join(" ")}...
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">{decDetail}</p>
              <div className="w-full bg-white/[0.03] h-1.5 rounded-full overflow-hidden mt-3">
                <div
                  className="h-full rounded-full bg-cyan-500"
                  style={{
                    width:
                      decPhase === "keyschedule"
                        ? "20%"
                        : decPhase === "rounds"
                        ? `${20 + ((31 - decRound) / 31) * 80}%`
                        : "100%",
                  }}
                />
              </div>
            </motion.div>
          )}

          {/* Decryption State Visualizer */}
          {(decPhase === "rounds" || decPhase === "completed") && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.04]"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 block">
                Intermediate Decryption State (128-bit)
              </span>
              <div className="grid grid-cols-2 gap-2 text-center">
                {decState.map((word, i) => (
                  <div key={i} className="bg-black/30 p-2.5 rounded-xl border border-white/[0.03]">
                    <span className="text-[9px] text-[var(--text-muted)] block mb-0.5">Word {i}</span>
                    <span className="text-xs font-mono font-bold text-cyan-300">
                      {word.toString(16).padStart(8, "0")}
                    </span>
                    <span className="text-[8px] font-mono text-[var(--text-muted)] block mt-1">
                      {word.toString(2).padStart(32, "0").replace(/(.{8})/g, "$1 ")}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Decrypted Plaintext Output Window */}
          {finalPlaintext && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-2xl bg-black/40 border border-emerald-500/20"
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText size={14} className="text-emerald-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                  Decrypted Plaintext
                </span>
              </div>
              <div className="font-sans text-xs text-emerald-200 break-words bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04]">
                {finalPlaintext}
              </div>
            </motion.div>
          )}
        </div>

      </div>
    </div>
  );
}

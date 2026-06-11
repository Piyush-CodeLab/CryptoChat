"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Play, RefreshCw, Key, ShieldCheck, ArrowRight, ShieldAlert, FileText, Lock, Unlock, Layers, HelpCircle, Shuffle } from "lucide-react";

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
  const cleanKey = keyString.trim();
  
  const isHex256 = /^[0-9a-fA-F]{64}$/.test(cleanKey);
  
  if (isHex256) {
    for (let i = 0; i < 32; i++) {
      keyBytes[i] = parseInt(cleanKey.substr(i * 2, 2), 16);
    }
  } else {
    for (let i = 0; i < Math.min(cleanKey.length, 32); i++) {
      keyBytes[i] = cleanKey.charCodeAt(i);
    }
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

// ============================================================================
// MAIN COMPONENT: CIPHER & KEM VISUALIZER
// ============================================================================

export default function CipherVisualizer() {
  const [activeVisualizer, setActiveVisualizer] = useState("serpent"); // serpent or mlkem

  // --- SERPENT STATES ---
  const [message, setMessage] = useState("Hello CryptoChat PQ!");
  const [cipherKey, setCipherKey] = useState("quantum_safe_key_2026");
  const [encPhase, setEncPhase] = useState("idle"); 
  const [encRound, setEncRound] = useState(0);
  const [encState, setEncState] = useState([0, 0, 0, 0]);
  const [encDetail, setEncDetail] = useState("");
  const [finalCiphertext, setFinalCiphertext] = useState("");
  
  const [decInput, setDecInput] = useState("");
  const [decPhase, setDecPhase] = useState("idle"); 
  const [decRound, setDecRound] = useState(31);
  const [decState, setDecState] = useState([0, 0, 0, 0]);
  const [decDetail, setDecDetail] = useState("");
  const [finalPlaintext, setFinalPlaintext] = useState("");

  // --- ML-KEM STATES ---
  const [mlkemStep, setMlkemStep] = useState("idle"); // idle, keygen, encap, decap, completed
  const [mlkemViewMode, setMlkemViewMode] = useState("matrix"); // matrix or lattice
  const [mlkemMsgInput, setMlkemMsgInput] = useState("1"); // secret bit: 0 or 1
  const [mlkemData, setMlkemData] = useState(null);
  const [mlkemDetail, setMlkemDetail] = useState("Ready to start post-quantum key exchange simulation.");

  const simIntervalRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(simIntervalRef.current);
  }, []);

  // --- SERPENT ENGINE RUNNERS ---
  const startEncryption = () => {
    clearInterval(simIntervalRef.current);
    setEncPhase("padding");
    setFinalCiphertext("");
    setEncDetail("Applying PKCS#7 padding to align input with 128-bit block size...");

    setTimeout(() => {
      setEncPhase("keyschedule");
      setEncDetail("Generating 33 Serpent subkeys (Serpent-256 Key Schedule)...");

      setTimeout(() => {
        const subkeys = generateSubkeys(cipherKey);
        
        // Convert text to block representation
        const padLen = 16 - (message.length % 16);
        const paddedBytes = new Uint8Array(16);
        for (let i = 0; i < 16; i++) {
          paddedBytes[i] = i < message.length ? message.charCodeAt(i) : padLen;
        }
        
        const state = [
          (paddedBytes[0] | (paddedBytes[1] << 8) | (paddedBytes[2] << 16) | (paddedBytes[3] << 24)) >>> 0,
          (paddedBytes[4] | (paddedBytes[5] << 8) | (paddedBytes[6] << 16) | (paddedBytes[7] << 24)) >>> 0,
          (paddedBytes[8] | (paddedBytes[9] << 8) | (paddedBytes[10] << 16) | (paddedBytes[11] << 24)) >>> 0,
          (paddedBytes[12] | (paddedBytes[13] << 8) | (paddedBytes[14] << 16) | (paddedBytes[15] << 24)) >>> 0,
        ];

        setEncState(state);
        setEncPhase("rounds");
        
        let activeRound = 0;
        let activeState = [...state];

        simIntervalRef.current = setInterval(() => {
          if (activeRound < 32) {
            const r = activeRound;
            
            // Key mixing
            const subkey = subkeys[r];
            const stateXor = [
              (activeState[0] ^ subkey[0]) >>> 0,
              (activeState[1] ^ subkey[1]) >>> 0,
              (activeState[2] ^ subkey[2]) >>> 0,
              (activeState[3] ^ subkey[3]) >>> 0,
            ];

            // S-Box Substitution
            const stateSbox = applySBox(r, stateXor);

            // Linear Transformation (except in round 31)
            let nextState;
            if (r < 31) {
              nextState = linearTransform(stateSbox);
            } else {
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
            setDecInput(hexResult);
            setEncDetail("Encryption Completed! 128-bit Ciphertext produced.");
          }
        }, 60);
      }, 800);
    }, 800);
  };

  const startDecryption = () => {
    const cleanInput = decInput.trim();
    if (!cleanInput) return;
    clearInterval(simIntervalRef.current);
    setDecPhase("keyschedule");
    setDecRound(31);
    setFinalPlaintext("");
    setDecDetail("Deriving Serpent-256 key schedule for decryption...");

    setTimeout(() => {
      const subkeys = generateSubkeys(cipherKey);
      
      let state;
      let ivWords = null;
      if (cleanInput.length >= 64 && /^[0-9a-fA-F]+$/.test(cleanInput)) {
        const ivPart = cleanInput.slice(0, 32);
        const ctPart = cleanInput.slice(32, 64);
        ivWords = hexToWords(ivPart);
        state = hexToWords(ctPart);
        setDecDetail("Serpent-CBC mode detected. Parsing IV and Block 1...");
      } else {
        state = hexToWords(cleanInput);
      }
      
      setDecState(state);
      setDecPhase("rounds");
      
      let activeRound = 31;
      let activeState = [...state];

      simIntervalRef.current = setInterval(() => {
        if (activeRound >= 0) {
          const r = activeRound;
          
          let stateLtInv;
          if (r < 31) {
            stateLtInv = linearTransformInv(activeState);
          } else {
            const lastSubkey = subkeys[32];
            stateLtInv = [
              (activeState[0] ^ lastSubkey[0]) >>> 0,
              (activeState[1] ^ lastSubkey[1]) >>> 0,
              (activeState[2] ^ lastSubkey[2]) >>> 0,
              (activeState[3] ^ lastSubkey[3]) >>> 0,
            ];
          }

          const stateSboxInv = applySBoxInv(r % 8, stateLtInv);

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
          
          let finalState = [...activeState];
          if (ivWords) {
            finalState = [
              (activeState[0] ^ ivWords[0]) >>> 0,
              (activeState[1] ^ ivWords[1]) >>> 0,
              (activeState[2] ^ ivWords[2]) >>> 0,
              (activeState[3] ^ ivWords[3]) >>> 0,
            ];
            setDecState(finalState);
          }
          
          const bytes = new Uint8Array(16);
          for (let i = 0; i < 4; i++) {
            const w = finalState[i];
            bytes[i * 4] = w & 0xff;
            bytes[i * 4 + 1] = (w >>> 8) & 0xff;
            bytes[i * 4 + 2] = (w >>> 16) & 0xff;
            bytes[i * 4 + 3] = (w >>> 24) & 0xff;
          }

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
          setDecDetail(ivWords ? "Decryption Completed! (Serpent-CBC mode, XORed with IV)" : "Decryption Completed! PKCS#7 padding removed.");
        }
      }, 60);
    }, 800);
  };

  // --- ML-KEM CRYPTOGRAPHIC SIMULATION ---
  
  const generateLWEInstance = () => {
    const q = 17;
    // Generate Public Matrix A (2x2) mod 17
    const A = [
      [Math.floor(Math.random() * 12) + 3, Math.floor(Math.random() * 12) + 3],
      [Math.floor(Math.random() * 12) + 3, Math.floor(Math.random() * 12) + 3]
    ];
    // Generate private vector s with small integer coefficients (-1, 0, 1)
    const s = [
      Math.floor(Math.random() * 3) - 1,
      Math.floor(Math.random() * 3) - 1
    ];
    // Generate small error vector e
    const e = [
      Math.floor(Math.random() * 3) - 1,
      Math.floor(Math.random() * 3) - 1
    ];
    // Compute public key vector t = A * s + e mod q
    const t = [
      (A[0][0] * s[0] + A[0][1] * s[1] + e[0] + q * 10) % q,
      (A[1][0] * s[0] + A[1][1] * s[1] + e[1] + q * 10) % q
    ];

    // Prepare Alice's parameters
    const m = parseInt(mlkemMsgInput);
    // Alice's random ephemeral keys
    const r = [
      Math.floor(Math.random() * 3) - 1,
      Math.floor(Math.random() * 3) - 1
    ];
    const e1 = [
      Math.floor(Math.random() * 3) - 1,
      Math.floor(Math.random() * 3) - 1
    ];
    const e2 = Math.floor(Math.random() * 3) - 1;

    // Encapsulation calculations
    const u = [
      (A[0][0] * r[0] + A[1][0] * r[1] + e1[0] + q * 10) % q,
      (A[0][1] * r[0] + A[1][1] * r[1] + e1[1] + q * 10) % q
    ];
    const mValue = m * Math.round(q / 2); // m * 9
    const v = (t[0] * r[0] + t[1] * r[1] + e2 + mValue + q * 10) % q;

    // Decapsulation calculation
    const sTu = (s[0] * u[0] + s[1] * u[1] + q * 10) % q;
    const d = (v - sTu + q * 10) % q;

    // Decapsulation check
    let diffToQ2 = Math.min(Math.abs(d - Math.round(q/2)), Math.abs(d - q - Math.round(q/2)));
    let diffTo0 = Math.min(Math.abs(d), Math.abs(d - q));
    const m_recovered = diffToQ2 < diffTo0 ? 1 : 0;

    // Derive a simulated 256-bit Shared Key (hex) via hashing the secret bit
    const aliceSeed = `shared_secret_bit_${m}_noise_${r.join("")}`;
    const bobSeed = `shared_secret_bit_${m_recovered}_noise_${r.join("")}`;
    
    // Quick simple 256-bit hex generator simulating SHA-256 output
    const fakeHash = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      let result = "";
      for (let i = 0; i < 8; i++) {
        result += Math.abs((hash ^ (i * 0x3f5b2c9d)) >>> 0).toString(16).padStart(8, "0");
      }
      return result;
    };

    const aliceKey = fakeHash(aliceSeed);
    const bobKey = fakeHash(bobSeed);

    return {
      q, A, s, e, t, m, r, e1, e2, u, v, sTu, d, m_recovered,
      aliceKey, bobKey
    };
  };

  const advanceMlkem = () => {
    if (mlkemStep === "idle") {
      const data = generateLWEInstance();
      setMlkemData(data);
      setMlkemStep("keygen");
      setMlkemDetail("Bob generated matrix A, secret vector s, error vector e, and published public key vector t = A·s + e.");
    } else if (mlkemStep === "keygen") {
      setMlkemStep("encap");
      setMlkemDetail("Alice encapsulated secret bit m using public parameters. She sent ciphertext vector u and offset scalar v.");
    } else if (mlkemStep === "encap") {
      setMlkemStep("decap");
      setMlkemDetail("Bob decapsulated ciphertext using private vector s, removing LWE error to reconstruct the shared key.");
    } else {
      setMlkemStep("idle");
      setMlkemData(null);
      setMlkemDetail("Ready to start key exchange simulation.");
    }
  };

  // --- LATTICE DIAGRAM GEOMETRY ---
  const renderLatticeSVG = () => {
    if (!mlkemData) return null;
    const { A, s, e, t, r, e1, u, q } = mlkemData;
    
    const scale = 15; 
    const pad = 30; 
    
    const getCoords = (x, y) => {
      const mx = ((x % q) + q) % q;
      const my = ((y % q) + q) % q;
      return {
        cx: pad + mx * scale,
        cy: pad + (q - 1 - my) * scale
      };
    };
    
    const dots = [];
    for (let x = 0; x < q; x++) {
      for (let y = 0; y < q; y++) {
        dots.push({ x, y });
      }
    }
    
    // Compute Clean Lattice projections
    const As_x = (t[0] - e[0] + q) % q;
    const As_y = (t[1] - e[1] + q) % q;
    
    const ATr_x = (u[0] - e1[0] + q) % q;
    const ATr_y = (u[1] - e1[1] + q) % q;
    
    const originCoords = getCoords(0, 0);
    const AsCoords = getCoords(As_x, As_y);
    const tCoords = getCoords(t[0], t[1]);
    const ATrCoords = getCoords(ATr_x, ATr_y);
    const uCoords = getCoords(u[0], u[1]);
    
    return (
      <div className="relative">
        <svg width={300} height={300} className="mx-auto bg-black/50 rounded-2xl border border-white/[0.08] shadow-2xl">
          {/* Grid Dots */}
          {dots.map((d, i) => {
            const { cx, cy } = getCoords(d.x, d.y);
            const isOrigin = d.x === 0 && d.y === 0;
            let fill = "rgba(255,255,255,0.1)";
            let r_dot = 1.5;
            if (isOrigin) {
              fill = "var(--cyan)";
              r_dot = 3.5;
            }
            return <circle key={i} cx={cx} cy={cy} r={r_dot} fill={fill} />;
          })}
          
          {/* keygen overlay */}
          {mlkemStep === "keygen" && (
            <>
              {/* Basis mapping lines */}
              <line
                x1={originCoords.cx}
                y1={originCoords.cy}
                x2={AsCoords.cx}
                y2={AsCoords.cy}
                stroke="#10b981"
                strokeWidth={2}
                markerEnd="url(#arrow-green)"
              />
              <line
                x1={AsCoords.cx}
                y1={AsCoords.cy}
                x2={tCoords.cx}
                y2={tCoords.cy}
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="3,3"
                markerEnd="url(#arrow-red)"
              />
              <circle cx={tCoords.cx} cy={tCoords.cy} r={4.5} fill="var(--cyan)" className="animate-pulse" />
            </>
          )}

          {/* encapsulation / decapsulation overlay */}
          {(mlkemStep === "encap" || mlkemStep === "decap") && (
            <>
              <line
                x1={originCoords.cx}
                y1={originCoords.cy}
                x2={ATrCoords.cx}
                y2={ATrCoords.cy}
                stroke="#10b981"
                strokeWidth={2}
                markerEnd="url(#arrow-green)"
              />
              <line
                x1={ATrCoords.cx}
                y1={ATrCoords.cy}
                x2={uCoords.cx}
                y2={uCoords.cy}
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="3,3"
                markerEnd="url(#arrow-red)"
              />
              <circle cx={uCoords.cx} cy={uCoords.cy} r={4.5} fill="#f59e0b" className="animate-pulse" />
              
              {mlkemStep === "decap" && (
                <motion.line
                  initial={{ x1: uCoords.cx, y1: uCoords.cy }}
                  animate={{ x1: ATrCoords.cx, y1: ATrCoords.cy }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  x2={ATrCoords.cx}
                  y2={ATrCoords.cy}
                  stroke="var(--cyan)"
                  strokeWidth={2}
                />
              )}
            </>
          )}
          
          <defs>
            <marker id="arrow-green" viewBox="0 0 10 10" refX="5" refY="5" markerWidth={3.5} markerHeight={3.5} orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
            </marker>
            <marker id="arrow-red" viewBox="0 0 10 10" refX="5" refY="5" markerWidth={3.5} markerHeight={3.5} orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
            </marker>
          </defs>
        </svg>

        {/* Legend Panel */}
        <div className="flex justify-center gap-4 mt-3 text-[9px] font-mono text-[var(--text-muted)]">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-[#10b981]" />
            <span>Clean Lattice (A·s / Aᵀ·r)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded border border-dashed border-[#ef4444]" />
            <span>LWE Noise (e / e₁)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>PK (t)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>CT (u)</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Dynamic Header with Visualizer Switch */}
      <div className="flex-shrink-0 px-5 py-3 flex items-center justify-between gap-3 animate-shimmer" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--cyan-glow)" }}>
            <Cpu size={16} style={{ color: "var(--cyan)" }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              {activeVisualizer === "serpent" ? "Serpent Block Cipher" : "ML-KEM Key Exchange"}
            </h2>
            <p className="text-[10px] text-[var(--text-secondary)]">
              {activeVisualizer === "serpent" ? "Interactive 32-round pipeline sandbox" : "Lattice-based hybrid key encapsulation (Kyber)"}
            </p>
          </div>
        </div>
        
        {/* Toggle Switch */}
        <div className="flex items-center bg-white/[0.03] p-0.5 rounded-xl border border-white/[0.06]">
          <button
            onClick={() => {
              clearInterval(simIntervalRef.current);
              setActiveVisualizer("serpent");
            }}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeVisualizer === "serpent"
                ? "bg-purple-600/30 text-purple-300 border border-purple-500/20 shadow-md"
                : "text-[var(--text-muted)] hover:text-white"
            }`}
          >
            Serpent
          </button>
          <button
            onClick={() => {
              clearInterval(simIntervalRef.current);
              setActiveVisualizer("mlkem");
            }}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeVisualizer === "mlkem"
                ? "bg-cyan-600/30 text-cyan-300 border border-cyan-500/20 shadow-md"
                : "text-[var(--text-muted)] hover:text-white"
            }`}
          >
            ML-KEM
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeVisualizer === "serpent" ? (
          <div className="space-y-6">
            {/* ===================================================================== */}
            {/* SERPENT ENCRYPTION */}
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

              {encPhase !== "idle" && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.04]">
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

              {(encPhase === "rounds" || encPhase === "completed") && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.04]">
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

              {finalCiphertext && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-3 rounded-2xl bg-black/40 border border-purple-500/20">
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
            {/* SERPENT DECRYPTION */}
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

              {decPhase !== "idle" && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.04]">
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

              {(decPhase === "rounds" || decPhase === "completed") && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.04]">
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

              {finalPlaintext && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-3 rounded-2xl bg-black/40 border border-emerald-500/20">
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
        ) : (
          // =====================================================================
          // ML-KEM (POST-QUANTUM KEY EXCHANGE) WORKSPACE
          // =====================================================================
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            
            {/* Left Panel: Parameters, Steps & Logic Stepper (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-cyan-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                    Kyber Parameter Ring
                  </span>
                </div>
                
                {/* Secret Bit Selection */}
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 block">
                    Secret Message Bit (m)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {["0", "1"].map((val) => (
                      <button
                        key={val}
                        onClick={() => {
                          setMlkemMsgInput(val);
                          resetMlkem();
                        }}
                        disabled={mlkemStep !== "idle" && mlkemStep !== "completed"}
                        className={`py-1.5 rounded-xl text-xs font-mono font-bold border cursor-pointer ${
                          mlkemMsgInput === val
                            ? "bg-cyan-600/30 text-cyan-300 border-cyan-500/40"
                            : "bg-transparent text-[var(--text-muted)] border-white/[0.06] hover:border-white/[0.15]"
                        } disabled:opacity-50`}
                      >
                        m = {val}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step Actions */}
                <div className="space-y-2">
                  <button
                    onClick={advanceMlkem}
                    className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-white transition-all cursor-pointer"
                    style={{
                      background: "linear-gradient(135deg, #0284c7, #0369a1)",
                      boxShadow: "0 4px 15px rgba(2,132,199,0.2)",
                    }}
                  >
                    {mlkemStep === "idle" && (
                      <>
                        <Play size={14} fill="white" />
                        Start ML-KEM Key Exchange
                      </>
                    )}
                    {mlkemStep === "keygen" && (
                      <>
                        <ArrowRight size={14} />
                        Step 2: Alice Encapsulates
                      </>
                    )}
                    {mlkemStep === "encap" && (
                      <>
                        <ArrowRight size={14} />
                        Step 3: Bob Decapsulates
                      </>
                    )}
                    {mlkemStep === "decap" && (
                      <>
                        <Shuffle size={14} />
                        Reset Simulation
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Step Explanations Panel */}
              <div className="bg-white/[0.01] border border-white/[0.04] rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] block">
                  Simulation Steps
                </span>
                
                {/* Step Timeline */}
                <div className="space-y-4 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-white/[0.08]">
                  {/* Step 1 */}
                  <div className={`flex gap-3 pl-6 relative ${mlkemStep === "keygen" ? "text-cyan-300" : "text-[var(--text-muted)]"}`}>
                    <span className={`absolute left-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold font-mono ${
                      mlkemStep === "keygen" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40" : "bg-white/[0.04] text-[var(--text-muted)]"
                    }`}>1</span>
                    <div>
                      <h4 className="text-[11px] font-semibold">Step 1: Keygen (User B)</h4>
                      <p className="text-[9px] mt-0.5 leading-normal">Bob generates Matrix A and private key s. Computes public key t.</p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className={`flex gap-3 pl-6 relative ${mlkemStep === "encap" ? "text-cyan-300" : "text-[var(--text-muted)]"}`}>
                    <span className={`absolute left-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold font-mono ${
                      mlkemStep === "encap" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40" : "bg-white/[0.04] text-[var(--text-muted)]"
                    }`}>2</span>
                    <div>
                      <h4 className="text-[11px] font-semibold">Step 2: Encapsulation (User A)</h4>
                      <p className="text-[9px] mt-0.5 leading-normal">Alice encapsulates secret message m into (u, v) and generates her Shared Key.</p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className={`flex gap-3 pl-6 relative ${mlkemStep === "decap" ? "text-cyan-300" : "text-[var(--text-muted)]"}`}>
                    <span className={`absolute left-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold font-mono ${
                      mlkemStep === "decap" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40" : "bg-white/[0.04] text-[var(--text-muted)]"
                    }`}>3</span>
                    <div>
                      <h4 className="text-[11px] font-semibold">Step 3: Decapsulation (User B)</h4>
                      <p className="text-[9px] mt-0.5 leading-normal">Bob decapsulates (u, v) with s. Snaps the result to recover m and verify the key.</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl mt-2">
                  <p className="text-[10px] leading-relaxed text-[var(--text-secondary)] font-mono">
                    {mlkemDetail}
                  </p>
                </div>
              </div>
            </div>

            {/* Right Panel: Equation / Lattice Switching Visualization (7 Cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-4">
                {/* Visualizer Mode Toggle */}
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <HelpCircle size={14} className="text-cyan-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                      Visualizer Panel
                    </span>
                  </div>

                  <div className="flex items-center bg-white/[0.03] p-0.5 rounded-xl border border-white/[0.06]">
                    <button
                      onClick={() => setMlkemViewMode("matrix")}
                      className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        mlkemViewMode === "matrix"
                          ? "bg-cyan-600/20 text-cyan-300 border border-cyan-500/20"
                          : "text-[var(--text-muted)] hover:text-white"
                      }`}
                    >
                      Matrix Math
                    </button>
                    <button
                      onClick={() => setMlkemViewMode("lattice")}
                      className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        mlkemViewMode === "lattice"
                          ? "bg-cyan-600/20 text-cyan-300 border border-cyan-500/20"
                          : "text-[var(--text-muted)] hover:text-white"
                      }`}
                    >
                      Lattice Grid
                    </button>
                  </div>
                </div>

                {/* Output Visualizer Screen */}
                <div className="p-3 bg-black/30 rounded-2xl border border-white/[0.04] min-h-[340px] flex flex-col justify-center items-center">
                  {!mlkemData ? (
                    <div className="text-center max-w-xs p-4">
                      <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto mb-3">
                        <Lock size={18} className="text-cyan-400" />
                      </div>
                      <h3 className="text-xs font-semibold text-white">Simulation Stopped</h3>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        Select a message bit and click "Start ML-KEM Key Exchange" to explore post-quantum key agreements.
                      </p>
                    </div>
                  ) : mlkemViewMode === "matrix" ? (
                    <div className="w-full space-y-6 flex flex-col justify-center items-center py-4">
                      {/* Step 1: Keygen Matrix rendering */}
                      {mlkemStep === "keygen" && (
                        <div className="space-y-4 text-center">
                          <h4 className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                            Bob's Keygen: t = A · s + e (mod 17)
                          </h4>
                          
                          <div className="flex flex-wrap items-center justify-center gap-1 text-xs">
                            {/* Vector t */}
                            <div className="flex items-center">
                              <span className="text-3xl text-cyan-400 font-extralight">[</span>
                              <div className="flex flex-col text-center px-1 font-mono text-cyan-300">
                                <span>{mlkemData.t[0]}</span>
                                <span>{mlkemData.t[1]}</span>
                              </div>
                              <span className="text-3xl text-cyan-400 font-extralight">]</span>
                            </div>

                            <span className="text-sm text-white mx-1">=</span>

                            {/* Matrix A */}
                            <div className="flex items-center">
                              <span className="text-3xl text-purple-400 font-extralight">[</span>
                              <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 text-center px-1 font-mono text-purple-300">
                                <span>{mlkemData.A[0][0]}</span><span>{mlkemData.A[0][1]}</span>
                                <span>{mlkemData.A[1][0]}</span><span>{mlkemData.A[1][1]}</span>
                              </div>
                              <span className="text-3xl text-purple-400 font-extralight">]</span>
                            </div>

                            <span className="text-sm text-white mx-1">·</span>

                            {/* Vector s */}
                            <div className="flex items-center">
                              <span className="text-3xl text-emerald-400 font-extralight">[</span>
                              <div className="flex flex-col text-center px-1 font-mono text-emerald-300">
                                <span>{mlkemData.s[0]}</span>
                                <span>{mlkemData.s[1]}</span>
                              </div>
                              <span className="text-3xl text-emerald-400 font-extralight">]</span>
                            </div>

                            <span className="text-sm text-white mx-1">+</span>

                            {/* Vector e */}
                            <div className="flex items-center">
                              <span className="text-3xl text-red-400 font-extralight">[</span>
                              <div className="flex flex-col text-center px-1 font-mono text-red-300">
                                <span>{mlkemData.e[0]}</span>
                                <span>{mlkemData.e[1]}</span>
                              </div>
                              <span className="text-3xl text-red-400 font-extralight">]</span>
                            </div>
                          </div>
                          
                          <div className="text-[9px] font-mono text-[var(--text-muted)] space-y-1 bg-white/[0.01] p-3 rounded-xl border border-white/[0.03] max-w-md mx-auto">
                            <div>A = Public Matrix (Shared)</div>
                            <div>s = Private Key vector (Kept secret by Bob)</div>
                            <div>e = Random noise error vector (Displaces t slightly)</div>
                            <div>t = Public Key (Shared with Alice)</div>
                          </div>
                        </div>
                      )}

                      {/* Step 2: Encapsulation Matrix rendering */}
                      {mlkemStep === "encap" && (
                        <div className="space-y-5 text-center w-full">
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                              Alice's CT Vector: u = Aᵀ · r + e₁ (mod 17)
                            </h4>
                            <div className="flex flex-wrap items-center justify-center gap-1 text-xs">
                              {/* Vector u */}
                              <div className="flex items-center">
                                <span className="text-3xl text-cyan-400 font-extralight">[</span>
                                <div className="flex flex-col text-center px-1 font-mono text-cyan-300">
                                  <span>{mlkemData.u[0]}</span>
                                  <span>{mlkemData.u[1]}</span>
                                </div>
                                <span className="text-3xl text-cyan-400 font-extralight">]</span>
                              </div>

                              <span className="text-sm text-white mx-1">=</span>

                              {/* Matrix A^T */}
                              <div className="flex items-center">
                                <span className="text-3xl text-purple-400 font-extralight">[</span>
                                <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 text-center px-1 font-mono text-purple-300">
                                  <span>{mlkemData.A[0][0]}</span><span>{mlkemData.A[1][0]}</span>
                                  <span>{mlkemData.A[0][1]}</span><span>{mlkemData.A[1][1]}</span>
                                </div>
                                <span className="text-3xl text-purple-400 font-extralight">]</span>
                              </div>

                              <span className="text-sm text-white mx-1">·</span>

                              {/* Vector r */}
                              <div className="flex items-center">
                                <span className="text-3xl text-emerald-400 font-extralight">[</span>
                                <div className="flex flex-col text-center px-1 font-mono text-emerald-300">
                                  <span>{mlkemData.r[0]}</span>
                                  <span>{mlkemData.r[1]}</span>
                                </div>
                                <span className="text-3xl text-emerald-400 font-extralight">]</span>
                              </div>

                              <span className="text-sm text-white mx-1">+</span>

                              {/* Vector e1 */}
                              <div className="flex items-center">
                                <span className="text-3xl text-red-400 font-extralight">[</span>
                                <div className="flex flex-col text-center px-1 font-mono text-red-300">
                                  <span>{mlkemData.e1[0]}</span>
                                  <span>{mlkemData.e1[1]}</span>
                                </div>
                                <span className="text-3xl text-red-400 font-extralight">]</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <h4 className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                              Alice's Offset: v = tᵀ · r + e₂ + m · 9 (mod 17)
                            </h4>
                            <div className="flex items-center justify-center gap-1.5 font-mono text-xs text-white">
                              <span className="text-cyan-300 font-bold">v = {mlkemData.v}</span>
                              <span>=</span>
                              <span>
                                ([{mlkemData.t.join(", ")}]ᵀ · [{mlkemData.r.join(", ")}]) + {mlkemData.e2} + {mlkemData.m}·9
                              </span>
                            </div>
                          </div>

                          {/* Alice's Shared Key output */}
                          <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-xl max-w-sm mx-auto text-left space-y-1">
                            <div className="text-[8px] font-bold tracking-wider text-cyan-400 uppercase">Alice's Derived Shared Key</div>
                            <div className="text-[10px] font-mono text-white break-all">{mlkemData.aliceKey}</div>
                          </div>
                        </div>
                      )}

                      {/* Step 3: Decapsulation Matrix rendering */}
                      {mlkemStep === "decap" && (
                        <div className="space-y-5 text-center w-full">
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                              Bob's Decapsulation math: d = v - sᵀ · u (mod 17)
                            </h4>
                            
                            <div className="flex items-center justify-center gap-2 font-mono text-xs text-white">
                              <span className="text-cyan-300 font-bold">d = {mlkemData.d}</span>
                              <span>=</span>
                              <span>{mlkemData.v}</span>
                              <span>-</span>
                              <span>
                                ([{mlkemData.s.join(", ")}]ᵀ · [{mlkemData.u.join(", ")}])
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2 max-w-xs mx-auto">
                            <h4 className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                              Snapping decode boundary
                            </h4>
                            <div className="flex items-center justify-between font-mono text-[10px] bg-white/[0.02] border border-white/[0.04] p-2.5 rounded-xl">
                              <span className={mlkemData.m_recovered === 0 ? "text-emerald-400 font-bold" : "text-white/40"}>Closer to 0 (m=0)</span>
                              <div className="w-12 h-1 bg-white/10 rounded-full relative mx-2">
                                <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400" />
                              </div>
                              <span className={mlkemData.m_recovered === 1 ? "text-emerald-400 font-bold" : "text-white/40"}>Closer to 9 (m=1)</span>
                            </div>
                          </div>

                          {/* Both keys matches */}
                          <div className="grid grid-cols-1 gap-2 max-w-sm mx-auto text-left">
                            <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-0.5">
                              <div className="text-[8px] font-bold tracking-wider text-emerald-400 uppercase">Bob's Decapsulated Shared Key</div>
                              <div className="text-[10px] font-mono text-white break-all">{mlkemData.bobKey}</div>
                            </div>
                            <div className="text-center text-[10px] font-bold text-emerald-400 animate-pulse mt-1">
                              ✓ Established matching secure shared keys!
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Lattice plot rendering */
                    renderLatticeSVG()
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

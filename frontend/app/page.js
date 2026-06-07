"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageCircle,
  Shield,
  Cpu,
  Wifi,
  WifiOff,
  Lock,
  LogOut,
} from "lucide-react";
import ChatInterface from "@/components/ChatInterface";
import EngineLogs from "@/components/EngineLogs";
import CipherVisualizer from "@/components/CipherVisualizer";
import AuthScreen from "@/components/AuthScreen";
import { supabase, isUsingMock } from "@/utils/supabase";

const TABS = [
  { id: "chat", label: "Messages", icon: MessageCircle },
  { id: "logs", label: "Engine", icon: Shield },
  { id: "cipher", label: "Visualizer", icon: Cpu },
];

const pageVariants = {
  enter: (direction) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction) => ({
    x: direction < 0 ? 60 : -60,
    opacity: 0,
    scale: 0.98,
  }),
};

export default function Home() {
  const [activeTab, setActiveTab] = useState("chat");
  const [direction, setDirection] = useState(0);
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [identity, setIdentity] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [selectedPeer, setSelectedPeer] = useState(null);

  // Track handshake state per peer: { [peerId]: boolean }
  const [peerSessions, setPeerSessions] = useState({});

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  const addLog = useCallback((entry) => {
    setLogs((prev) => [
      ...prev,
      { ...entry, id: Date.now() + Math.random(), receivedAt: Date.now() },
    ]);
  }, []);

  const connectWebSocket = useCallback((user) => {
    if (!user) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8765";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      addLog({
        event: "ws_connect",
        detail: `WebSocket connected. Authenticating as ${user.name}...`,
      });
      // Immediately authenticate session on server
      ws.send(
        JSON.stringify({
          type: "auth",
          id: user.id,
          name: user.name,
          email: user.email,
        })
      );
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
      setPeerSessions({});
      addLog({
        event: "ws_disconnect",
        detail: "WebSocket connection closed",
      });
      // Auto-reconnect after 3s
      reconnectRef.current = setTimeout(() => connectWebSocket(user), 3000);
    };

    ws.onerror = () => {
      setWsStatus("error");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "identity":
            addLog({
              event: "identity",
              detail: `Identity confirmed by server: ${data.name} (${data.email})`,
            });
            break;

          case "users_list":
            // Filter out current user from the list
            setOnlineUsers(data.users.filter((u) => u.id !== user.id));
            break;

          case "system":
            addLog({ event: "system", detail: data.text });
            break;

          case "engine_log":
            addLog(data);
            break;

          case "handshake_complete":
            setPeerSessions((prev) => ({
              ...prev,
              [data.peer_id]: true,
            }));
            addLog({
              event: "handshake_complete",
              detail: `Secure channel established with ${data.peer_name} using ${data.algorithm}`,
            });
            break;

          case "network":
            addLog({
              event: "network_transit",
              detail: `Ciphertext in transit (${data.text.length / 2} bytes)`,
              hex: data.text,
              sender: data.sender,
            });
            break;

          case "chat":
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now() + Math.random(),
                text: data.text,
                sender: data.sender,
                senderId: data.sender_id,
                targetId: data.target_id,
                isSelf: data.is_self,
                timestamp: data.timestamp,
              },
            ]);
            break;

          default:
            addLog({
              event: "unknown",
              detail: `Unknown message: ${data.type}`,
            });
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };
  }, [addLog]);

  useEffect(() => {
    // Check initial session if using real Supabase
    if (!isUsingMock && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const user = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.full_name || session.user.email.split("@")[0],
          };
          setIdentity(user);
          connectWebSocket(user);
        }
      });
    }

    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connectWebSocket]);

  const handleAuthSuccess = (user) => {
    setIdentity(user);
    connectWebSocket(user);
  };

  const handleSignOut = async () => {
    if (!isUsingMock && supabase) {
      await supabase.auth.signOut();
    }
    clearTimeout(reconnectRef.current);
    wsRef.current?.close();
    wsRef.current = null;
    setIdentity(null);
    setWsStatus("disconnected");
    setOnlineUsers([]);
    setSelectedPeer(null);
    setPeerSessions({});
    setMessages([]);
  };

  const initiateSession = (peerId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "initiate_session",
          target_id: peerId,
        })
      );
    }
  };

  const sendMessage = useCallback(
    (text) => {
      if (
        wsRef.current?.readyState === WebSocket.OPEN &&
        text.trim() &&
        selectedPeer
      ) {
        wsRef.current.send(
          JSON.stringify({
            type: "chat",
            text: text.trim(),
            target_id: selectedPeer.id,
          })
        );
      }
    },
    [selectedPeer]
  );

  const handleTabChange = (newTab) => {
    const oldIdx = TABS.findIndex((t) => t.id === activeTab);
    const newIdx = TABS.findIndex((t) => t.id === newTab);
    setDirection(newIdx > oldIdx ? 1 : -1);
    setActiveTab(newTab);
  };

  const isHandshakeComplete = selectedPeer ? !!peerSessions[selectedPeer.id] : false;

  return (
    <div className="h-screen w-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(145deg, #08080f 0%, #0d0d1a 40%, #0a0a15 100%)" }}>
      {/* Ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-20 blur-[100px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse, rgba(139,92,246,0.3), transparent 70%)" }} />

      {/* Main container */}
      <div className="relative w-full max-w-[480px] h-[92vh] max-h-[860px] flex flex-col rounded-3xl overflow-hidden border border-white/[0.06]"
        style={{
          background: "linear-gradient(180deg, rgba(18,18,30,0.95) 0%, rgba(10,10,18,0.98) 100%)",
          boxShadow: "0 25px 80px rgba(0,0,0,0.6), 0 0 60px rgba(139,92,246,0.08)",
        }}>

        {/* ═══ Header ═══ */}
        <header className="flex-shrink-0 px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}>
                <Lock size={16} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                  CryptoChat <span className="gradient-text">PQ-SC</span>
                </h1>
                <p className="text-[10px] font-medium tracking-widest uppercase"
                  style={{ color: "var(--text-muted)" }}>
                  Post-Quantum Secure Channel
                </p>
              </div>
            </div>

            {/* Connection status (only visible when logged in) */}
            {identity && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: wsStatus === "connected" ? "var(--green-glow)" : "rgba(239,68,68,0.1)" }}>
                {wsStatus === "connected" ? (
                  <Wifi size={12} style={{ color: "var(--green)" }} />
                ) : (
                  <WifiOff size={12} style={{ color: "var(--red)" }} />
                )}
                <span className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: wsStatus === "connected" ? "var(--green)" : "var(--red)" }}>
                  {wsStatus === "connected"
                    ? isHandshakeComplete ? "Secured" : "Online"
                    : "Offline"}
                </span>
                {wsStatus === "connected" && (
                  <span className="w-1.5 h-1.5 rounded-full pulse-glow"
                    style={{ background: isHandshakeComplete ? "var(--green)" : "var(--amber)" }} />
                )}
              </div>
            )}
          </div>

          {/* Identity and Logout pill */}
          {identity && (
            <div className="flex justify-between items-center mt-1">
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[11px] font-medium px-3 py-1 rounded-full inline-flex items-center gap-1.5"
                style={{ background: "var(--accent-glow)", color: "var(--accent-light)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                {identity.name}
              </motion.div>
              <button
                onClick={handleSignOut}
                className="text-[10px] flex items-center gap-1 text-[var(--text-muted)] hover:text-red-400 transition-colors"
              >
                <LogOut size={12} />
                Sign Out
              </button>
            </div>
          )}
        </header>

        {/* ═══ Content Area ═══ */}
        <main className="flex-1 min-h-0 relative overflow-hidden">
          {!identity ? (
            <AuthScreen onAuthSuccess={handleAuthSuccess} />
          ) : (
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={activeTab}
                custom={direction}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 350, damping: 35, mass: 0.8 }}
                className="absolute inset-0"
              >
                {activeTab === "chat" && (
                  <ChatInterface
                    messages={messages}
                    onSend={sendMessage}
                    identity={identity}
                    onlineUsers={onlineUsers}
                    selectedPeer={selectedPeer}
                    setSelectedPeer={setSelectedPeer}
                    initiateSession={initiateSession}
                    isConnected={wsStatus === "connected"}
                    handshakeComplete={isHandshakeComplete}
                  />
                )}
                {activeTab === "logs" && <EngineLogs logs={logs} />}
                {activeTab === "cipher" && <CipherVisualizer />}
              </motion.div>
            </AnimatePresence>
          )}
        </main>

        {/* ═══ Bottom Navigation (only visible when logged in) ═══ */}
        {identity && (
          <nav className="flex-shrink-0 px-4 pb-4 pt-2">
            <div className="flex items-center justify-around rounded-2xl p-1.5"
              style={{ background: "rgba(18,18,30,0.8)", border: "1px solid var(--border)" }}>
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    id={`nav-${tab.id}`}
                    onClick={() => handleTabChange(tab.id)}
                    className="relative flex flex-col items-center gap-0.5 px-5 py-2 rounded-xl transition-all duration-200"
                    style={
                      isActive
                        ? { background: "var(--accent-glow)", color: "var(--accent-light)" }
                        : { color: "var(--text-muted)" }
                    }
                  >
                    {isActive && (
                      <motion.div
                        layoutId="navIndicator"
                        className="absolute inset-0 rounded-xl"
                        style={{
                          background: "var(--accent-glow)",
                          border: "1px solid var(--border-accent)",
                        }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <Icon size={18} className="relative z-10" />
                    <span className="text-[10px] font-semibold relative z-10 tracking-wide">
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

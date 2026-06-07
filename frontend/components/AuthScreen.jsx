"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Mail, User, ShieldAlert, ArrowRight } from "lucide-react";
import { supabase, mockAuth, isUsingMock } from "@/utils/supabase";

export default function AuthScreen({ onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const client = isUsingMock ? mockAuth : supabase.auth;

    try {
      if (isSignUp) {
        const { data, error } = await client.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName || email.split("@")[0],
            },
          },
        });

        if (error) throw error;
        // Mock auth directly logs in; real auth might require confirmation depending on Supabase settings.
        // We'll proceed with logging in or checking session.
        if (data?.user) {
          onAuthSuccess({
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || data.user.name || data.user.email.split("@")[0]
          });
        }
      } else {
        const { data, error } = await client.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        if (data?.user) {
          onAuthSuccess({
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || data.user.name || data.user.email.split("@")[0]
          });
        }
      }
    } catch (err) {
      setErrorMsg(err.message || "An authentication error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 h-full">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className="w-full max-w-sm rounded-3xl p-6 glass-strong relative overflow-hidden"
        style={{ boxShadow: "0 25px 80px rgba(0,0,0,0.6), 0 0 60px rgba(139,92,246,0.08)" }}
      >
        {/* Glow behind logo */}
        <div className="absolute -top-12 -left-12 w-36 h-36 rounded-full opacity-20 blur-[40px] bg-purple-600 pointer-events-none" />

        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
            <Lock size={20} className="text-white" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            CryptoChat <span className="gradient-text">PQ-SC</span>
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1 text-center">
            Sign in to initialize security session
          </p>
        </div>

        {isUsingMock && (
          <div className="mb-4 p-3 rounded-xl flex items-start gap-2 bg-amber-500/10 border border-amber-500/20">
            <ShieldAlert size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-[10px] text-amber-300 leading-normal">
              <strong>Local Mock Mode Active</strong><br />
              Supabase env variables not found. Sign up any user or use credentials:<br />
              <code className="text-white bg-black/40 px-1 py-0.5 rounded">alice@codex.pq</code> / <code className="text-white bg-black/40 px-1 py-0.5 rounded">password123</code>
            </div>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 block">
                Full Name
              </label>
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/[0.03] border border-white/[0.06] focus-within:border-purple-500/50 transition-colors">
                <User size={14} className="text-[var(--text-muted)]" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alice Smith"
                  className="bg-transparent text-xs outline-none w-full text-white placeholder:text-[var(--text-muted)]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 block">
              Email Address
            </label>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/[0.03] border border-white/[0.06] focus-within:border-purple-500/50 transition-colors">
              <Mail size={14} className="text-[var(--text-muted)]" />
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alice@codex.pq"
                className="bg-transparent text-xs outline-none w-full text-white placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 block">
              Password
            </label>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/[0.03] border border-white/[0.06] focus-within:border-purple-500/50 transition-colors">
              <Lock size={14} className="text-[var(--text-muted)]" />
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-transparent text-xs outline-none w-full text-white placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            id="auth-submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", boxShadow: "0 4px 15px rgba(139,92,246,0.3)" }}
          >
            {loading ? "Authenticating..." : isSignUp ? "Sign Up" : "Sign In"}
            <ArrowRight size={14} />
          </button>
        </form>

        <div className="mt-5 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg("");
            }}
            className="text-xs text-[var(--text-secondary)] hover:text-purple-400 transition-colors focus:outline-none"
          >
            {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

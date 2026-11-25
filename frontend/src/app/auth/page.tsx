"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Lock, Mail, User as UserIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function AuthPage() {
  const { user, login, register, logout } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(username, displayName, email, password);
      }
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <div className="max-w-md mx-auto mt-8 bg-fb-card border border-fb-border rounded-xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-fb-blue text-white flex items-center justify-center font-bold text-lg">
            {user.display_name[0]?.toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold">{user.display_name}</h1>
            <p className="text-sm text-fb-muted">@{user.username}</p>
          </div>
        </div>
        <div className="p-3 rounded-lg bg-fb-input text-xs space-y-1.5">
          <div className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            JWT Bearer Session Active
          </div>
          <p className="text-fb-muted text-[11px]">Authenticated via RFC 7519 JSON Web Token (HS256).</p>
          <p className="text-fb-muted font-mono break-all text-[11px]">Email Hash: {user.email_hash_preview}</p>
        </div>
        <button
          onClick={logout}
          className="w-full py-2.5 rounded-lg bg-red-600/15 text-red-600 dark:text-red-400 hover:bg-red-600/25 text-sm font-semibold transition"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-6">
      <div className="bg-fb-card border border-fb-border rounded-xl p-6 shadow-sm">
        <div className="flex gap-2 p-1 bg-fb-input rounded-lg mb-5">
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${
              mode === "register" ? "bg-fb-card shadow-sm text-fb-blue" : "text-fb-muted"
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${
              mode === "login" ? "bg-fb-card shadow-sm text-fb-blue" : "text-fb-muted"
            }`}
          >
            Sign In
          </button>
        </div>

        <h1 className="text-xl font-bold mb-1">
          {mode === "register" ? "Join NexusHub" : "Sign in to NexusHub"}
        </h1>
        <p className="text-xs text-fb-muted mb-5 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          Secured with JWT (JSON Web Tokens) &amp; Argon2id password encryption.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === "register" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-fb-muted mb-1">Username</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-fb-muted absolute left-3 top-3" />
                  <input
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="rahim_dev"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-fb-input text-sm focus:outline-none focus:ring-2 focus:ring-fb-blue"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-fb-muted mb-1">Display Name</label>
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Rahim Ahmed"
                  className="w-full px-3 py-2.5 rounded-lg bg-fb-input text-sm focus:outline-none focus:ring-2 focus:ring-fb-blue"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-fb-muted mb-1">
              {mode === "register" ? "Email Address" : "Email or Username"}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-fb-muted absolute left-3 top-3" />
              <input
                required
                type={mode === "register" ? "email" : "text"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === "register" ? "you@example.com" : "Email or username"}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-fb-input text-sm focus:outline-none focus:ring-2 focus:ring-fb-blue"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fb-muted mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-fb-muted absolute left-3 top-3" />
              <input
                required
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-fb-input text-sm focus:outline-none focus:ring-2 focus:ring-fb-blue"
              />
            </div>
          </div>

          <button
            disabled={busy}
            type="submit"
            className="w-full py-2.5 rounded-lg bg-fb-blue hover:bg-fb-blueHover disabled:opacity-50 text-white font-semibold text-sm transition"
          >
            {busy ? "Please wait..." : mode === "register" ? "Create Account" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

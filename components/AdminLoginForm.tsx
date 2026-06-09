"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function signInWithPassword() {
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    window.location.href = "/admin";
  }

  async function sendMagicLink() {
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/admin`
      }
    });
    setLoading(false);
    setMessage(error ? error.message : "Magic link sent. Check your email.");
  }

  return (
    <div className="quiet-card mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold text-ink">Admin login</h1>
      <p className="mt-2 text-sm leading-6 text-black/60">
        Sign in with Supabase Auth. Access is limited to configured SimpleCity admin emails.
      </p>
      <div className="mt-6 space-y-3">
        <label className="block">
          <span className="text-sm font-semibold text-black/70">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-black/15 px-3 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-black/70">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-black/15 px-3 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
          />
        </label>
        {message ? <p className="text-sm text-black/65">{message}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || !email || !password}
            onClick={signInWithPassword}
            className="min-h-11 rounded-md bg-civic px-4 text-sm font-bold text-white transition hover:bg-[#1c4788] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sign in
          </button>
          <button
            type="button"
            disabled={loading || !email}
            onClick={sendMagicLink}
            className="min-h-11 rounded-md border border-black/15 bg-white px-4 text-sm font-bold transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Email magic link
          </button>
        </div>
      </div>
    </div>
  );
}

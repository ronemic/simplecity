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
    <div className="quiet-card mx-auto max-w-md p-6 sm:p-8">
      <p className="label-eyebrow">Admin access</p>
      <h1 className="mt-2 text-3xl font-black text-ink">Admin login</h1>
      <p className="mt-2 text-sm leading-6 text-black/60">
        Sign in with Supabase Auth. Access is limited to configured SimpleCity admin emails.
      </p>
      <div className="mt-6 space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-black/70">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input-control"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-black/70">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input-control"
          />
        </label>
        {message ? <p className="rounded-2xl bg-black/5 p-3 text-sm text-black/65">{message}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || !email || !password}
            onClick={signInWithPassword}
            className="action-primary"
          >
            Sign in
          </button>
          <button
            type="button"
            disabled={loading || !email}
            onClick={sendMagicLink}
            className="action-secondary"
          >
            Email magic link
          </button>
        </div>
      </div>
    </div>
  );
}

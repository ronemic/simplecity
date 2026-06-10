"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";

const LOCKOUT_STORAGE_KEY = "simplecity-admin-lockout-until";

function formatLockoutMessage(lockedUntil: number) {
  const remainingMs = Math.max(0, lockedUntil - Date.now());
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  return `Locked out for ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"} after too many failed attempts.`;
}

export function AdminLoginForm() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCKOUT_STORAGE_KEY);
    if (!stored) return;

    const parsed = Number(stored);
    if (!Number.isFinite(parsed) || parsed <= Date.now()) {
      window.localStorage.removeItem(LOCKOUT_STORAGE_KEY);
      return;
    }

    const timer = window.setTimeout(() => {
      setLockedUntil(parsed);
      setMessage(formatLockoutMessage(parsed));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;

    const timer = window.setInterval(() => {
      if (lockedUntil <= Date.now()) {
        window.localStorage.removeItem(LOCKOUT_STORAGE_KEY);
        setLockedUntil(null);
        setMessage("");
      } else {
        setMessage(formatLockoutMessage(lockedUntil));
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lockedUntil && lockedUntil > Date.now()) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        lockedUntil?: number;
      };

      if (!response.ok) {
        if (typeof body.lockedUntil === "number") {
          window.localStorage.setItem(LOCKOUT_STORAGE_KEY, String(body.lockedUntil));
          setLockedUntil(body.lockedUntil);
          setMessage(formatLockoutMessage(body.lockedUntil));
          return;
        }

        setMessage(body.error || "Incorrect password.");
        return;
      }

      window.localStorage.removeItem(LOCKOUT_STORAGE_KEY);
      window.location.href = "/admin";
    } catch {
      setMessage("Unable to reach the admin login endpoint.");
    } finally {
      setLoading(false);
    }
  }

  const isLocked = Boolean(lockedUntil);

  return (
    <div className="quiet-card mx-auto max-w-md p-6 sm:p-8">
      <p className="label-eyebrow">Admin access</p>
      <h1 className="mt-2 text-3xl font-black text-ink">Admin login</h1>
      <form className="mt-6 space-y-3" onSubmit={signIn}>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-black/70">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input-control"
            autoComplete="current-password"
            disabled={loading || isLocked}
          />
        </label>
        {message ? <p className="rounded-lg bg-black/5 p-3 text-sm text-black/75">{message}</p> : null}
        <button
          type="submit"
          disabled={loading || !password || isLocked}
          className="action-primary"
        >
          {isLocked ? "Locked out" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

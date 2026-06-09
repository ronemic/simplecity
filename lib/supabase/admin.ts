import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const ADMIN_SESSION_COOKIE = "simplecity_admin_session";
const ADMIN_LOCKOUT_COOKIE = "simplecity_admin_login_state";
const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 12;
const ADMIN_LOCKOUT_DURATION_MS = 1000 * 60 * 15;
const ADMIN_SESSION_MARKER = "simplecity-admin-session" as const;
const ADMIN_LOCKOUT_MARKER = "simplecity-admin-lockout" as const;
const ADMIN_LABEL = "admin";

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

type AdminSessionPayload = {
  marker: typeof ADMIN_SESSION_MARKER;
  issuedAt: number;
  expiresAt: number;
};

type AdminLockoutPayload = {
  marker: typeof ADMIN_LOCKOUT_MARKER;
  attempts: number;
  lockedUntil: number | null;
  updatedAt: number;
};

export type AuthenticatedAdmin = {
  email: string;
  sessionExpiresAt: number;
};

function getAdminAuthSecret() {
  return process.env.ADMIN_PASSWORD?.trim() || null;
}

export function hasAdminPassword() {
  return Boolean(getAdminAuthSecret());
}

function baseCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds
  };
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function encodeSignedValue<T>(value: T, secret: string) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = signPayload(payload, secret);
  return `${payload}.${signature}`;
}

function decodeSignedValue<T>(value: string | undefined, secret: string) {
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = signPayload(payload, secret);
  if (!safeCompare(signature, expectedSignature)) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function getSecretOrNull() {
  return getAdminAuthSecret();
}

function getSessionPayload(cookieValue: string | undefined) {
  const secret = getSecretOrNull();
  if (!secret) return null;

  const payload = decodeSignedValue<AdminSessionPayload>(cookieValue, secret);
  if (!payload || payload.marker !== ADMIN_SESSION_MARKER) return null;
  if (payload.expiresAt <= Date.now()) return null;
  return payload;
}

function getLockoutPayload(cookieValue: string | undefined) {
  const secret = getSecretOrNull();
  if (!secret) return null;

  const payload = decodeSignedValue<AdminLockoutPayload>(cookieValue, secret);
  if (!payload || payload.marker !== ADMIN_LOCKOUT_MARKER) return null;
  return payload;
}

function normalizeLockoutPayload(payload: AdminLockoutPayload | null) {
  if (!payload) {
    return {
      marker: ADMIN_LOCKOUT_MARKER,
      attempts: 0,
      lockedUntil: null,
      updatedAt: Date.now()
    };
  }

  if (payload.lockedUntil && payload.lockedUntil <= Date.now()) {
    return {
      marker: ADMIN_LOCKOUT_MARKER,
      attempts: 0,
      lockedUntil: null,
      updatedAt: Date.now()
    };
  }

  return payload;
}

export function readAdminLockoutState(cookieReader: CookieReader) {
  return normalizeLockoutPayload(getLockoutPayload(cookieReader.get(ADMIN_LOCKOUT_COOKIE)?.value));
}

export function isAdminLockedOut(cookieReader: CookieReader) {
  const state = readAdminLockoutState(cookieReader);
  return Boolean(state.lockedUntil && state.lockedUntil > Date.now());
}

export function createAdminSessionCookieValue(now = Date.now()) {
  const secret = getAdminAuthSecret();
  if (!secret) {
    throw new Error("Missing ADMIN_PASSWORD.");
  }

  return encodeSignedValue<AdminSessionPayload>(
    {
      marker: ADMIN_SESSION_MARKER,
      issuedAt: now,
      expiresAt: now + ADMIN_SESSION_DURATION_MS
    },
    secret
  );
}

export function createAdminLockoutCookieValue(state: AdminLockoutPayload) {
  const secret = getAdminAuthSecret();
  if (!secret) {
    throw new Error("Missing ADMIN_PASSWORD.");
  }

  return encodeSignedValue(state, secret);
}

export function getAdminCookieOptions() {
  return baseCookieOptions(Math.ceil(ADMIN_SESSION_DURATION_MS / 1000));
}

export function getAdminLockoutCookieOptions(lockoutUntil?: number | null) {
  const durationSeconds = lockoutUntil && lockoutUntil > Date.now()
    ? Math.max(1, Math.ceil((lockoutUntil - Date.now()) / 1000))
    : Math.ceil(ADMIN_LOCKOUT_DURATION_MS / 1000);
  return baseCookieOptions(durationSeconds);
}

export async function getAuthenticatedAdmin(): Promise<AuthenticatedAdmin | null> {
  const secret = getAdminAuthSecret();
  if (!secret) return null;

  let cookieStore;
  try {
    cookieStore = await cookies();
  } catch {
    return null;
  }

  const payload = getSessionPayload(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!payload) return null;

  return {
    email: ADMIN_LABEL,
    sessionExpiresAt: payload.expiresAt
  };
}

export function getAuthenticatedAdminFromCookies(cookieReader: CookieReader): AuthenticatedAdmin | null {
  const secret = getAdminAuthSecret();
  if (!secret) return null;

  const payload = getSessionPayload(cookieReader.get(ADMIN_SESSION_COOKIE)?.value);
  if (!payload) return null;

  return {
    email: ADMIN_LABEL,
    sessionExpiresAt: payload.expiresAt
  };
}

export function isRequestAdmin(cookieReader: CookieReader) {
  return Boolean(getAuthenticatedAdminFromCookies(cookieReader));
}

export async function requireAdmin() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) redirect("/admin");
  return admin;
}

export async function assertAdminForRoute() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return {
      admin: null,
      response: Response.json({ error: "Admin authentication required." }, { status: 401 })
    };
  }

  return { admin, response: null };
}

export function createAdminSessionCookieOptions() {
  return baseCookieOptions(Math.ceil(ADMIN_SESSION_DURATION_MS / 1000));
}

export function createAdminLockoutPayload(attempts: number, lockedUntil: number | null, updatedAt = Date.now()) {
  return {
    marker: ADMIN_LOCKOUT_MARKER,
    attempts,
    lockedUntil,
    updatedAt
  };
}

export function getAdminLockoutStatus(cookieReader: CookieReader) {
  const state = readAdminLockoutState(cookieReader);
  const locked = Boolean(state.lockedUntil && state.lockedUntil > Date.now());
  return {
    state,
    locked
  };
}

export function getFailedLoginMessage(attemptsRemaining: number) {
  if (attemptsRemaining <= 0) {
    return "Too many failed attempts. Try again in 15 minutes.";
  }

  return `Incorrect password. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} left before lockout.`;
}

export function getAdminLoginResult(cookieReader: CookieReader) {
  return getAdminLockoutStatus(cookieReader);
}

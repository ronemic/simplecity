import { NextRequest, NextResponse } from "next/server";
import {
  createAdminLockoutCookieValue,
  createAdminLockoutPayload,
  createAdminSessionCookieOptions,
  createAdminSessionCookieValue,
  getAdminLockoutCookieOptions,
  getFailedLoginMessage,
  hasAdminPassword,
  readAdminLockoutState
} from "@/lib/supabase/admin";

const ADMIN_LOCKOUT_DURATION_MS = 1000 * 60 * 15;

export async function POST(request: NextRequest) {
  const configuredPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!hasAdminPassword() || !configuredPassword) {
    return NextResponse.json(
      { error: "Missing ADMIN_PASSWORD in your environment." },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const password = String(body.password || "");
  const cookieReader = request.cookies;
  const state = readAdminLockoutState(cookieReader);

  if (state.lockedUntil && state.lockedUntil > Date.now()) {
    return NextResponse.json(
      {
        error: "Too many failed attempts. Try again in 15 minutes.",
        lockedUntil: state.lockedUntil
      },
      { status: 423 }
    );
  }

  if (password === configuredPassword) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set("simplecity_admin_session", createAdminSessionCookieValue(), createAdminSessionCookieOptions());
    response.cookies.delete("simplecity_admin_login_state");
    return response;
  }

  const attempts = Math.min(3, state.attempts + 1);
  const lockedUntil = attempts >= 3 ? Date.now() + ADMIN_LOCKOUT_DURATION_MS : null;
  const nextState = createAdminLockoutPayload(attempts, lockedUntil);
  const response = NextResponse.json(
    {
      error: getFailedLoginMessage(3 - attempts),
      lockedUntil
    },
    { status: lockedUntil ? 423 : 401 }
  );

  response.cookies.set(
    "simplecity_admin_login_state",
    createAdminLockoutCookieValue(nextState),
    getAdminLockoutCookieOptions(lockedUntil)
  );

  return response;
}

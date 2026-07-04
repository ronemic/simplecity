import { NextRequest, NextResponse } from "next/server";
import { getPublicAppUrlForRequest } from "@/lib/appUrl";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/admin", getPublicAppUrlForRequest(request)), {
    status: 303
  });
  response.cookies.set("simplecity_admin_session", "", { path: "/", maxAge: 0 });
  response.cookies.set("simplecity_admin_login_state", "", { path: "/", maxAge: 0 });
  return response;
}

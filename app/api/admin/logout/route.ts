import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/admin", request.url));
  response.cookies.delete("simplecity_admin_session");
  response.cookies.delete("simplecity_admin_login_state");
  return response;
}

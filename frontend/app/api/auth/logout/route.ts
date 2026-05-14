import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("sessionid");

  if (sessionCookie) {
    // Tell Django to destroy the session server-side.
    await fetch(`${process.env.API_URL}/api/auth/logout/`, {
      method: "POST",
      headers: { Cookie: `sessionid=${sessionCookie.value}` },
    }).catch(() => {}); // Best-effort — we clear the cookie regardless.
  }

  // Expire the sessionid cookie on the browser regardless of whether
  // the Django call succeeded. This is the definitive logout signal.
  // Build the redirect from the Host header so we stay on whatever host the
  // browser used (127.0.0.1 vs localhost) — Next dev rewrites `request.url`
  // to "localhost" otherwise, which would orphan the user's session cookies.
  const host = request.headers.get("host") ?? "127.0.0.1:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const response = NextResponse.redirect(`${proto}://${host}/`, { status: 303 });
  response.cookies.set("sessionid", "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

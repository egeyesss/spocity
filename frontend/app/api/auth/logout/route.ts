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
  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  response.cookies.set("sessionid", "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

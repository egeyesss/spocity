import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // User denied access on Spotify's page.
  if (error || !code) {
    return NextResponse.redirect(new URL("/?error=spotify_denied", request.url));
  }

  // Read the verifier we stored in the login route.
  // If it's missing the cookie expired or someone hit this URL directly.
  const codeVerifier = request.cookies.get("spotify_code_verifier")?.value;
  if (!codeVerifier) {
    return NextResponse.redirect(new URL("/?error=session_expired", request.url));
  }

  try {
    // Hand off to Django. Django does the token exchange with Spotify,
    // creates/updates the user in the DB, and opens a session.
    // We use API_URL (Docker internal DNS) because this runs server-side.
    const djangoRes = await fetch(`${process.env.API_URL}/api/auth/callback/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: codeVerifier }),
    });

    if (!djangoRes.ok) {
      throw new Error(`Django ${djangoRes.status}`);
    }

    // Django returns the session key in the body.
    const data = await djangoRes.json() as { session_key: string };

    // Browsers block Set-Cookie on redirect responses mid-cross-site chain
    // (Spotify → us → /me). Returning a 200 with a meta-refresh breaks the
    // chain: the browser stores the cookie from OUR origin's 200 response,
    // then navigates to /me as a fresh same-site request with the cookie included.
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    const headers = new Headers({ "Content-Type": "text/html" });
    headers.append(
      "Set-Cookie",
      `sessionid=${data.session_key}; Path=/; HttpOnly; SameSite=Lax${secure}`
    );
    headers.append(
      "Set-Cookie",
      `spotify_code_verifier=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );

    return new Response(
      `<!DOCTYPE html><html><head>
        <meta http-equiv="refresh" content="0;url=/me">
      </head><body>Logging you in...</body></html>`,
      { status: 200, headers }
    );
  } catch {
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }
}

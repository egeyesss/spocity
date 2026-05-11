import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/?error=spotify_denied", request.url));
  }

  const codeVerifier = request.cookies.get("spotify_code_verifier")?.value;
  if (!codeVerifier) {
    return NextResponse.redirect(new URL("/?error=session_expired", request.url));
  }

  try {
    const djangoRes = await fetch(`${process.env.API_URL}/api/auth/callback/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: codeVerifier }),
    });

    if (!djangoRes.ok) {
      throw new Error(`Django ${djangoRes.status}`);
    }

    const data = await djangoRes.json() as { session_key: string };

    // Returning 200 + meta-refresh instead of a redirect so that browsers
    // apply Set-Cookie before navigating (cross-site redirects drop cookies).
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

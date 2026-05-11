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

    // Redirect the browser to /me now that auth is complete.
    const response = NextResponse.redirect(new URL("/me", request.url));

    // Clear the verifier cookie — it's single-use.
    response.cookies.delete("spotify_code_verifier");

    // Django's session middleware set a `sessionid` cookie on its response.
    // We forward it so the browser has it for future API calls to Django.
    const setCookie = djangoRes.headers.get("set-cookie");
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
    }

    return response;
  } catch {
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }
}

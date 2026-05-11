import crypto from "crypto";
import { NextResponse } from "next/server";

// Every scope we need from Spotify. Requested upfront — user approves all at once.
const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-top-read",
  "user-read-recently-played",
  "user-read-currently-playing",
  "user-read-playback-state",
].join(" ");

export async function GET() {
  // PKCE step 1: generate a random 64-char string — this is the secret we keep.
  const codeVerifier = crypto.randomBytes(48).toString("base64url");

  // PKCE step 2: hash it — this is what we send to Spotify upfront.
  // Spotify will later verify that hash(verifier) === challenge we sent.
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  // Build Spotify's authorization URL with all required params.
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID!,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    scope: SCOPES,
  });

  const response = NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params}`
  );

  // Store the verifier in an httpOnly cookie so only our server can read it.
  // The browser carries it to the callback route — JS on the page cannot touch it.
  response.cookies.set("spotify_code_verifier", codeVerifier, {
    httpOnly: true,
    sameSite: "lax",  // travels on top-level redirects (Spotify → us)
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10, // expires in 10 minutes — one-time use
    path: "/",
  });

  return response;
}

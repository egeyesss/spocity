import crypto from "crypto";
import { NextResponse } from "next/server";

const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-top-read",
  "user-read-recently-played",
  "user-read-currently-playing",
  "user-read-playback-state",
].join(" ");

export async function GET() {
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

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

  response.cookies.set("spotify_code_verifier", codeVerifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/",
  });

  return response;
}

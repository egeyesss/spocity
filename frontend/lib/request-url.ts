import type { NextRequest } from "next/server";

/**
 * Build an absolute URL targeting the same host the browser used.
 *
 * Next 16 dev canonicalizes `request.url` to "localhost" regardless of the
 * Host header the browser sent, so `new URL(path, request.url)` will silently
 * cross-origin redirect users from 127.0.0.1 to localhost — orphaning any
 * host-scoped cookies along the way. Reading the Host header directly is the
 * authoritative source for "what host did the browser actually use".
 *
 * `x-forwarded-proto` is honored when present (Vercel / Railway set it).
 * Falls back to http in dev.
 */
export function absoluteUrl(request: NextRequest, path: string): string {
  const host = request.headers.get("host") ?? "127.0.0.1:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

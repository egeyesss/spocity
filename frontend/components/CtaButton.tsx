"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

// Pixel-art button in the city HUD language: hard 2px border, offset block
// shadow, nudges up on hover. Primary = Spotify-green; ghost = dark panel.
const BASE =
  "inline-flex items-center gap-2 border-2 border-[#0a0812] px-6 py-3 font-semibold shadow-[4px_4px_0_0_rgba(0,0,0,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_rgba(0,0,0,0.55)] active:translate-y-0.5 active:shadow-[2px_2px_0_0_rgba(0,0,0,0.55)]";

const STYLES = {
  primary: `${BASE} bg-[#22C55E] text-[#0c1408] hover:bg-[#2fd66c]`,
  ghost: `${BASE} bg-[rgba(15,12,24,0.7)] text-zinc-200 hover:bg-[rgba(25,20,38,0.85)]`,
} as const;

// Demo-only deployments (frontend on Vercel, no Django backend) can't do
// Spotify OAuth — every conversion button honestly points at the sample
// city instead. Inlined at build time.
const DEMO_ONLY = process.env.NEXT_PUBLIC_DEMO_ONLY === "1";

/**
 * The main conversion button. Swaps between "connect Spotify" and "enter
 * your city" based on the cached auth state, so returning users go straight
 * back in. In demo-only deployments it links to /demo instead.
 */
export function CtaButton({
  variant = "primary",
  size = "lg",
  signedOutLabel = "Build my city",
}: {
  variant?: keyof typeof STYLES;
  size?: "lg" | "sm";
  signedOutLabel?: string;
}) {
  const { user } = useAuth();
  const sizeCls = size === "lg" ? "text-base" : "px-4 py-2 text-sm";

  if (DEMO_ONLY) {
    return (
      <Link href="/demo" className={`${STYLES[variant]} ${sizeCls}`}>
        See the sample city
        <span aria-hidden>→</span>
      </Link>
    );
  }

  return (
    <Link
      href={user ? "/me" : "/api/auth/login"}
      className={`${STYLES[variant]} ${sizeCls}`}
    >
      {user ? "Enter your city" : signedOutLabel}
      <span aria-hidden>→</span>
    </Link>
  );
}

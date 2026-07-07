"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Wordmark } from "@/components/Wordmark";
import { CityView } from "../me/city/CityView";
import { demoCityPayload, demoNowPlaying } from "@/lib/demoCity";

const PANEL =
  "border-2 border-[#0a0812] bg-[rgba(15,12,24,0.88)] shadow-[3px_3px_0_0_rgba(0,0,0,0.55)] backdrop-blur";

// The public sample city: the full interactive CityView driven by the
// deterministic demo payload, so anyone can wander a city without a Spotify
// account. The fake now-playing stays on — the pulsing tower and live card
// are half the point of the product.
export default function DemoCity() {
  const payload = useMemo(() => demoCityPayload(), []);
  const nowPlaying = useMemo(() => demoNowPlaying(payload), [payload]);

  return (
    <div className="relative h-screen w-screen">
      <CityView data={payload} nowPlaying={nowPlaying} />

      {/* Who/where am I — wordmark home link + sample badge */}
      <div
        className={`absolute left-4 top-4 z-20 flex items-center gap-3 px-3 py-2 ${PANEL}`}
      >
        <Link href="/" aria-label="Back to the spocity homepage">
          <Wordmark size={22} />
        </Link>
        <span className="border-2 border-[#4ADE80] px-1.5 py-0.5 font-pixel text-sm uppercase tracking-[0.12em] text-[#4ADE80]">
          Sample city
        </span>
      </div>

      {/* What am I looking at */}
      <div
        className={`absolute left-1/2 top-4 z-20 hidden -translate-x-1/2 px-4 py-2 md:block ${PANEL}`}
      >
        <p className="font-pixel text-sm uppercase tracking-[0.1em] text-zinc-400">
          Drag to orbit · scroll to zoom · click a building
        </p>
      </div>
    </div>
  );
}

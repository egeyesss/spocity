"use client";

import Link from "next/link";
import { CityView } from "../me/city/CityView";
import type { CityPayload } from "../me/city/types";
import { Wordmark } from "@/components/Wordmark";
import { CtaButton } from "@/components/CtaButton";
import { useNowPlaying } from "@/lib/useNowPlaying";

const PANEL =
  "border-2 border-[#0a0812] bg-[rgba(15,12,24,0.88)] shadow-[3px_3px_0_0_rgba(0,0,0,0.55)] backdrop-blur";

// A public city page: read-only for visitors (hover/click/postcard all work,
// nothing requires a session). Polls the owner's now-playing so visitors see
// their live pulsing tower.
export default function PublicCity({
  data,
  ownerName,
  username,
}: {
  data: CityPayload;
  ownerName: string;
  username: string;
}) {
  const nowPlaying = useNowPlaying(username);

  return (
    <div className="relative h-screen w-screen">
      <CityView
        data={data}
        nowPlaying={nowPlaying}
        postcardTitle={`${ownerName}'s city`}
      />

      {/* Whose city is this */}
      <div
        className={`absolute left-4 top-4 z-20 flex items-center gap-3 px-3 py-2 ${PANEL}`}
      >
        <Link href="/" aria-label="Back to the spocity homepage">
          <Wordmark size={22} />
        </Link>
        <span className="font-pixel text-sm uppercase tracking-[0.1em] text-zinc-300">
          {ownerName}&apos;s city
        </span>
      </div>

      {/* Conversion path for visitors */}
      <div className="absolute right-4 top-4 z-10">
        <CtaButton size="sm" signedOutLabel="Build your own city" />
      </div>
    </div>
  );
}

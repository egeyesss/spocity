"use client";

import { useMemo, useState } from "react";
import { CityView } from "../../me/city/CityView";
import { demoCityPayload, demoNowPlaying } from "@/lib/demoCity";

export default function DevCity() {
  const payload = useMemo(() => demoCityPayload(), []);
  const [withNowPlaying, setWithNowPlaying] = useState(true);
  const nowPlaying = useMemo(() => demoNowPlaying(payload), [payload]);

  return (
    <div className="relative h-screen w-screen">
      <CityView data={payload} nowPlaying={withNowPlaying ? nowPlaying : null} />
      <button
        type="button"
        onClick={() => setWithNowPlaying((v) => !v)}
        className="absolute left-4 top-4 z-30 rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-300"
      >
        now playing: {withNowPlaying ? "on" : "off"}
      </button>
    </div>
  );
}

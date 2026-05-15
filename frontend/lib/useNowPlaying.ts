"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAPI } from "./api";

export type NowPlayingData = {
  track_id: string;
  track_name: string;
  artist_spotify_id: string | null;
  artist_name: string | null;
  album_image: string | null;
  progress_ms: number;
  duration_ms: number;
  is_playing: boolean;
};

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls GET /api/now-playing/ every 30s and returns the current track, or
 * null when nothing is playing or the fetch fails. Errors are swallowed —
 * a polling failure shouldn't crash the city.
 */
export function useNowPlaying(): NowPlayingData | null {
  const [data, setData] = useState<NowPlayingData | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const result = await fetchAPI<NowPlayingData | null>("/api/now-playing/");
        if (!cancelled) {
          setData(result && result.is_playing ? result : null);
        }
      } catch {
        // Silently ignore — we don't want a network blip to break the city UI.
      }
    }

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, []);

  return data;
}

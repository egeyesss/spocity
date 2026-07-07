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
 * Polls the now-playing endpoint every 30s and returns the current track,
 * or null when nothing is playing or the fetch fails. Errors are swallowed —
 * a polling failure shouldn't crash the city.
 *
 * Without `username` it polls the session user's endpoint; with one it polls
 * the public per-city endpoint, so visitors on public pages see the owner's
 * live pulsing tower.
 */
export function useNowPlaying(username?: string): NowPlayingData | null {
  const [data, setData] = useState<NowPlayingData | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = username
      ? `/api/city/${encodeURIComponent(username)}/now-playing/`
      : "/api/now-playing/";

    async function poll() {
      try {
        const result = await fetchAPI<NowPlayingData | null>(path);
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
  }, [username]);

  return data;
}

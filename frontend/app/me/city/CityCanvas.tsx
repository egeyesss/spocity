"use client";

import { useEffect, useState } from "react";
import { fetchAPI, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useNowPlaying } from "@/lib/useNowPlaying";
import { CityView } from "./CityView";
import type { CityPayload } from "./types";

type Status =
  | { kind: "loading" }
  | { kind: "building"; note: string; progress: number | null }
  | { kind: "ready"; data: CityPayload }
  | { kind: "empty" }
  | { kind: "error"; message: string };

interface GenreFillResponse {
  classified: number;
  remaining: number;
}

export default function CityCanvas() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  const { user } = useAuth();
  const nowPlaying = useNowPlaying();

  useEffect(() => {
    let cancelled = false;
    const guard = <T,>(v: T): T => {
      if (cancelled) throw new Error("cancelled");
      return v;
    };

    (async () => {
      try {
        const data = guard(await fetchAPI<CityPayload>("/api/me/city/"));

        if (data.artists.length > 0) {
          setStatus({ kind: "ready", data });
          // Keep the city fresh without a Celery worker: pull the latest
          // plays (the endpoint recomputes scores), then refresh silently.
          try {
            guard(await fetchAPI("/api/ingest/recent/", { method: "POST" }));
            const fresh = guard(await fetchAPI<CityPayload>("/api/me/city/"));
            setStatus({ kind: "ready", data: fresh });
          } catch {
            // Refresh is best-effort — the city already rendered.
          }
          return;
        }

        // First login: seed the city (fast, Spotify only), then classify
        // artists into districts in batches with visible progress.
        setStatus({
          kind: "building",
          note: "Pulling your top artists from Spotify…",
          progress: null,
        });
        guard(await fetchAPI("/api/ingest/initial/", { method: "POST" }));

        let total: number | null = null;
        for (;;) {
          const r = guard(
            await fetchAPI<GenreFillResponse>("/api/ingest/genres/", {
              method: "POST",
              body: JSON.stringify({ budget: 25 }),
            }),
          );
          if (total === null) total = r.remaining + r.classified;
          if (r.remaining === 0) break;
          setStatus({
            kind: "building",
            note: "Zoning your city into districts…",
            progress: total > 0 ? 1 - r.remaining / total : null,
          });
        }

        const built = guard(await fetchAPI<CityPayload>("/api/me/city/"));
        if (built.artists.length === 0) setStatus({ kind: "empty" });
        else setStatus({ kind: "ready", data: built });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? `${err.status === 0 ? "" : err.status + " — "}${err.message}`
            : "Unknown error loading your city.";
        setStatus({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status.kind === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full text-zinc-500">
        <div className="h-8 w-8 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin" />
        <p className="text-sm">Loading your city…</p>
      </div>
    );
  }

  if (status.kind === "building") {
    const pct =
      status.progress !== null ? Math.round(status.progress * 100) : null;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 bg-[#161129] px-6 text-center">
        <p className="font-pixel text-2xl uppercase tracking-[0.2em] text-[#4ADE80]">
          Building your city
        </p>
        <p className="max-w-sm text-sm text-zinc-400">{status.note}</p>
        <div className="h-4 w-72 border-2 border-[#0a0812] bg-[rgba(15,12,24,0.88)]">
          <div
            className="h-full bg-[#22C55E] transition-all duration-500"
            style={{ width: `${pct ?? 8}%` }}
          />
        </div>
        <p className="font-pixel text-base uppercase tracking-[0.1em] text-zinc-500">
          {pct !== null ? `${pct}%` : "Starting…"} · first build takes a minute
        </p>
      </div>
    );
  }

  if (status.kind === "empty") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full text-zinc-500 text-center px-6">
        <p className="text-lg">No artists yet.</p>
        <p className="text-sm text-zinc-600 max-w-md">
          We couldn&apos;t find any Spotify listening history for your account.
          Listen to a few tracks and check back.
        </p>
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full text-rose-400 text-center px-6">
        <p className="text-lg">Couldn&apos;t load your city.</p>
        <p className="text-sm text-rose-500/80">{status.message}</p>
      </div>
    );
  }

  return (
    <CityView
      data={status.data}
      nowPlaying={nowPlaying}
      postcardTitle={
        user ? `${user.display_name}'s city` : "My city"
      }
    />
  );
}

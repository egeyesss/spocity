"use client";

import { useEffect, useState } from "react";
import { fetchAPI, ApiError } from "@/lib/api";
import { useNowPlaying } from "@/lib/useNowPlaying";
import { CityView } from "./CityView";
import type { CityPayload } from "./types";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; data: CityPayload }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export default function CityCanvas() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  const nowPlaying = useNowPlaying();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAPI<CityPayload>("/api/me/city/");
        if (cancelled) return;
        if (data.artists.length === 0) setStatus({ kind: "empty" });
        else setStatus({ kind: "ready", data });
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

  return <CityView data={status.data} nowPlaying={nowPlaying} />;
}

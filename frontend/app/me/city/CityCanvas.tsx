"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { fetchAPI, ApiError } from "@/lib/api";
import { CityScene } from "./CityScene";
import { TIER_LABEL } from "./constants";
import { gridLayout } from "./grid";
import type { CityPayload, PlacedArtist } from "./types";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; data: CityPayload }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export default function CityCanvas() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const placed: PlacedArtist[] = useMemo(
    () => (status.kind === "ready" ? gridLayout(status.data.artists) : []),
    [status]
  );

  const selectedArtist = useMemo(
    () => placed.find((a) => a.spotify_id === selectedId) ?? null,
    [placed, selectedId]
  );
  const hoveredArtist = useMemo(
    () => placed.find((a) => a.spotify_id === hoveredId) ?? null,
    [placed, hoveredId]
  );

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

  return (
    <div className="relative h-full w-full">
      <Canvas
        // "percentage" → PCFShadowMap. R3F's default "soft" maps to the
        // PCFSoftShadowMap path that three r170+ deprecated.
        shadows="percentage"
        camera={{ position: [25, 25, 25], fov: 45, near: 0.1, far: 500 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0a0a0a"]} />
        <fog attach="fog" args={["#0a0a0a", 60, 200]} />
        <CityScene
          artists={placed}
          buckets={status.data.buckets}
          hoveredId={hoveredId}
          selectedId={selectedId}
          onHover={setHoveredId}
          onSelect={setSelectedId}
        />
      </Canvas>

      {hoveredArtist && hoveredArtist.spotify_id !== selectedId && (
        <HoverTooltip artist={hoveredArtist} />
      )}

      {selectedArtist && (
        <DetailPanel
          artist={selectedArtist}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function HoverTooltip({ artist }: { artist: PlacedArtist }) {
  // Anchored to the cursor via CSS — uses pointer-events:none so it never
  // intercepts the click that selects the building.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  if (!pos) return null;

  return (
    <div
      className="pointer-events-none fixed z-30 rounded-md border border-zinc-700 bg-zinc-900/90 px-3 py-2 text-xs shadow-lg backdrop-blur"
      style={{ left: pos.x + 14, top: pos.y + 14 }}
    >
      <div className="font-medium text-zinc-100">{artist.name}</div>
      <div className="text-zinc-400">
        {TIER_LABEL[artist.tier]} · score {Math.round(artist.score)}
      </div>
    </div>
  );
}

function DetailPanel({
  artist,
  onClose,
}: {
  artist: PlacedArtist;
  onClose: () => void;
}) {
  return (
    <aside className="absolute right-4 top-4 z-20 w-72 rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 shadow-2xl backdrop-blur">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-200"
      >
        ✕
      </button>

      {artist.image_url ? (
        // Spotify image URLs come signed and don't go through Next's Image
        // optimizer — plain <img> is fine here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artist.image_url}
          alt={artist.name}
          className="mb-3 h-32 w-full rounded-lg object-cover"
        />
      ) : (
        <div className="mb-3 h-32 w-full rounded-lg bg-zinc-800" />
      )}

      <h3 className="text-lg font-semibold text-zinc-100">{artist.name}</h3>
      <p className="text-sm text-zinc-400">{TIER_LABEL[artist.tier]}</p>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
        <dt className="text-zinc-500">Score</dt>
        <dd className="text-zinc-200">{Math.round(artist.score)}</dd>

        <dt className="text-zinc-500">Seed</dt>
        <dd className="text-zinc-200">{Math.round(artist.seed_score)}</dd>

        <dt className="text-zinc-500">District</dt>
        <dd className="text-zinc-200">
          {artist.primary_genre_bucket ?? "—"}
        </dd>

        <dt className="text-zinc-500">Last played</dt>
        <dd className="text-zinc-200">
          {artist.last_played_at
            ? new Date(artist.last_played_at).toLocaleDateString()
            : "—"}
        </dd>
      </dl>
    </aside>
  );
}

"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { fetchAPI, ApiError } from "@/lib/api";
import { useNowPlaying } from "@/lib/useNowPlaying";
import { CityScene } from "./CityScene";
import { TIER_LABEL } from "./constants";
import { districtLayout } from "./grid";
import type { BucketRow, CityPayload, PlacedArtist } from "./types";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; data: CityPayload }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export default function CityCanvas() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nowPlaying = useNowPlaying();
  const nowPlayingId = nowPlaying?.artist_spotify_id ?? null;

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
    () =>
      status.kind === "ready"
        ? districtLayout(status.data.artists, status.data.buckets)
        : [],
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
        shadows="percentage"
        camera={{ position: [50, 45, 70], fov: 45, near: 0.1, far: 600 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0a0a0a"]} />
        <fog attach="fog" args={["#0a0a0a", 100, 300]} />
        <CityScene
          artists={placed}
          buckets={status.data.buckets}
          hoveredId={hoveredId}
          selectedId={selectedId}
          nowPlayingId={nowPlayingId}
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

      {nowPlaying && <NowPlayingCard nowPlaying={nowPlaying} />}

      <MiniMap
        buckets={status.data.buckets}
        artists={placed}
        nowPlayingBucket={
          nowPlayingId
            ? (placed.find((a) => a.spotify_id === nowPlayingId)
                ?.primary_genre_bucket ?? null)
            : null
        }
      />
    </div>
  );
}

// ── HoverTooltip ──────────────────────────────────────────────────────────────

function HoverTooltip({ artist }: { artist: PlacedArtist }) {
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

// ── DetailPanel ───────────────────────────────────────────────────────────────

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

// ── NowPlayingCard ────────────────────────────────────────────────────────────

function NowPlayingCard({
  nowPlaying,
}: {
  nowPlaying: NonNullable<ReturnType<typeof useNowPlaying>>;
}) {
  return (
    <div className="absolute bottom-4 left-4 z-20 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/90 px-3 py-2 shadow-2xl backdrop-blur max-w-xs">
      {nowPlaying.album_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={nowPlaying.album_image}
          alt="Album art"
          className="h-10 w-10 rounded-md object-cover flex-shrink-0"
        />
      ) : (
        <div className="h-10 w-10 rounded-md bg-zinc-800 flex-shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 mb-0.5 flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          Now Playing
        </p>
        <p className="text-sm font-medium text-zinc-100 truncate">
          {nowPlaying.track_name}
        </p>
        <p className="text-xs text-zinc-400 truncate">
          {nowPlaying.artist_name}
        </p>
      </div>
    </div>
  );
}

// ── MiniMap ───────────────────────────────────────────────────────────────────

// Short label for each bucket in the 36px-wide mini-map cells.
function shortLabel(label: string): string {
  return label.split(/[\s/]/)[0].slice(0, 6);
}

function MiniMap({
  buckets,
  artists,
  nowPlayingBucket,
}: {
  buckets: BucketRow[];
  artists: PlacedArtist[];
  nowPlayingBucket: string | null;
}) {
  const sorted = useMemo(
    () => [...buckets].sort((a, b) => a.sort_order - b.sort_order),
    [buckets]
  );

  const occupied = useMemo(() => {
    const s = new Set<string>();
    for (const a of artists) if (a.primary_genre_bucket) s.add(a.primary_genre_bucket);
    return s;
  }, [artists]);

  const COLS = 4;
  const cellW = 38;
  const cellH = 28;
  const gap = 3;
  const pad = 6;
  const nRows = Math.ceil(sorted.length / COLS);
  const svgW = COLS * cellW + (COLS - 1) * gap + 2 * pad;
  const svgH = nRows * cellH + (nRows - 1) * gap + 2 * pad;

  return (
    <div className="absolute bottom-4 right-4 z-20 rounded-xl border border-zinc-800 bg-zinc-950/90 p-2 shadow-xl backdrop-blur select-none">
      <p className="text-[10px] text-zinc-500 mb-1 px-1 tracking-wide uppercase">
        Districts
      </p>
      <svg width={svgW} height={svgH} aria-label="City district mini-map">
        {sorted.map((bucket, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          const x = pad + col * (cellW + gap);
          const y = pad + row * (cellH + gap);
          const isOccupied = occupied.has(bucket.slug);
          const isNowPlaying = bucket.slug === nowPlayingBucket;
          const fill = isOccupied ? bucket.color_palette[1] : "#27272a";
          const textFill = isOccupied ? "#0a0a0a" : "#71717a";
          return (
            <g key={bucket.slug}>
              <rect
                x={x}
                y={y}
                width={cellW}
                height={cellH}
                rx={4}
                fill={fill}
                opacity={isOccupied ? 1 : 0.5}
              />
              {isNowPlaying && (
                <rect
                  x={x - 1}
                  y={y - 1}
                  width={cellW + 2}
                  height={cellH + 2}
                  rx={5}
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth={2}
                />
              )}
              <text
                x={x + cellW / 2}
                y={y + cellH / 2 + 4}
                textAnchor="middle"
                fill={textFill}
                fontSize={8}
                fontFamily="system-ui, sans-serif"
                fontWeight={500}
              >
                {shortLabel(bucket.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { fetchAPI, ApiError } from "@/lib/api";
import { useNowPlaying } from "@/lib/useNowPlaying";
import { CityScene } from "./CityScene";
import { TIER_LABEL } from "./constants";
import { buildCity, type DistrictBlock } from "./grid";
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

  const { placed, blocks, parks } = useMemo(
    () =>
      status.kind === "ready"
        ? buildCity(status.data.artists, status.data.buckets)
        : { placed: [], blocks: [], parks: [] },
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
        camera={{ position: [90, 95, 130], fov: 26, near: 1, far: 600 }}
        gl={{ antialias: true }}
      >
        <CityScene
          artists={placed}
          blocks={blocks}
          parks={parks}
          buckets={status.data.buckets}
          hoveredId={hoveredId}
          selectedId={selectedId}
          nowPlayingId={nowPlayingId}
          nowPlaying={nowPlaying}
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
        blocks={blocks}
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

// First word of the label, clipped to fit a mini-map cell.
function shortLabel(label: string): string {
  return label.split(/[\s/]/)[0].slice(0, 7);
}

// Top-down view of the actual block grid: one tile per district at its real
// (col, row) slot, tile size scaled by how many artists live there — so the
// mini-map reads like a zoomed-out version of the city itself.
function MiniMap({
  blocks,
  nowPlayingBucket,
}: {
  blocks: DistrictBlock[];
  nowPlayingBucket: string | null;
}) {
  if (blocks.length === 0) return null;

  const nCols = Math.max(...blocks.map((b) => b.col)) + 1;
  const nRows = Math.max(...blocks.map((b) => b.row)) + 1;
  const maxCount = Math.max(...blocks.map((b) => b.count));

  const cellW = 44;
  const cellH = 32;
  const gap = 4; // the "road" in the mini-map
  const pad = 7;
  const svgW = nCols * cellW + (nCols - 1) * gap + 2 * pad;
  const svgH = nRows * cellH + (nRows - 1) * gap + 2 * pad;

  return (
    <div className="absolute bottom-4 right-4 z-20 rounded-xl border-2 border-[#0a0812] bg-[rgba(15,12,24,0.85)] p-2 shadow-xl backdrop-blur select-none">
      <p className="text-[10px] text-zinc-400 mb-1 px-1 tracking-[0.1em] uppercase">
        Districts
      </p>
      <svg width={svgW} height={svgH} aria-label="City district mini-map">
        {/* asphalt backplane — the gaps between tiles read as roads */}
        <rect
          x={0}
          y={0}
          width={svgW}
          height={svgH}
          rx={4}
          fill="#3c352c"
          opacity={0.35}
        />
        {blocks.map((b) => {
          // Scale the tile by artist count (min 55% of the cell so tiny
          // districts are still legible), centered in its grid slot.
          const scale = 0.55 + 0.45 * Math.sqrt(b.count / maxCount);
          const w = cellW * scale;
          const h = cellH * scale;
          const slotX = pad + b.col * (cellW + gap);
          const slotY = pad + b.row * (cellH + gap);
          const x = slotX + (cellW - w) / 2;
          const y = slotY + (cellH - h) / 2;
          const isNowPlaying = b.slug === nowPlayingBucket;
          return (
            <g key={b.slug}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={3}
                fill={b.palette[1]}
                stroke={b.palette[2]}
                strokeWidth={1}
              />
              {isNowPlaying && (
                <rect
                  x={x - 2}
                  y={y - 2}
                  width={w + 4}
                  height={h + 4}
                  rx={4}
                  fill="none"
                  stroke="#FAFAF5"
                  strokeWidth={2}
                >
                  <animate
                    attributeName="opacity"
                    values="1;0.25;1"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </rect>
              )}
              <text
                x={slotX + cellW / 2}
                y={slotY + cellH / 2 + 3}
                textAnchor="middle"
                fill="#0a0a0a"
                fontSize={8}
                fontFamily="system-ui, sans-serif"
                fontWeight={600}
              >
                {shortLabel(b.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

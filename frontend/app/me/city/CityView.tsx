"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import type { NowPlayingData } from "@/lib/useNowPlaying";
import { CityScene } from "./CityScene";
import { DetailPanel, HoverTooltip, MiniMap, NowPlayingCard } from "./Hud";
import { CaptureBridge, PostcardButton, type CaptureFn } from "./Postcard";
import { buildCity } from "./grid";
import type { CityPayload } from "./types";

/**
 * The full city view: 3D canvas + HUD overlays. Takes an already-fetched
 * payload so it can be driven by the real API (/me, public pages) or by
 * mock data (/dev/city) — the render path is identical either way.
 *
 * `postcardTitle` enables the postcard button, labelled with whose city
 * this is (e.g. "Ege Y's city").
 */
export function CityView({
  data,
  nowPlaying,
  postcardTitle,
}: {
  data: CityPayload;
  nowPlaying: NowPlayingData | null;
  postcardTitle?: string;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nowPlayingId = nowPlaying?.artist_spotify_id ?? null;

  const { placed, blocks, parks } = useMemo(
    () => buildCity(data.artists, data.buckets),
    [data],
  );

  const selectedArtist = useMemo(
    () => placed.find((a) => a.spotify_id === selectedId) ?? null,
    [placed, selectedId],
  );
  const hoveredArtist = useMemo(
    () => placed.find((a) => a.spotify_id === hoveredId) ?? null,
    [placed, hoveredId],
  );

  // District accent colour (the palette's mid tone) for the HUD panels.
  const accentFor = useMemo(() => {
    const map = new Map(data.buckets.map((b) => [b.slug, b.color_palette[1]]));
    return (slug: string | null): string =>
      (slug ? map.get(slug) : undefined) ?? "#9CA3AF";
  }, [data.buckets]);

  const captureRef = useRef<CaptureFn | null>(null);
  const districtCount = useMemo(
    () => new Set(placed.map((a) => a.primary_genre_bucket ?? "other")).size,
    [placed],
  );

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows="percentage"
        camera={{ position: [90, 95, 130], fov: 26, near: 1, far: 600 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <CaptureBridge captureRef={captureRef} />
        <CityScene
          artists={placed}
          blocks={blocks}
          parks={parks}
          buckets={data.buckets}
          hoveredId={hoveredId}
          selectedId={selectedId}
          nowPlayingId={nowPlayingId}
          nowPlaying={nowPlaying}
          onHover={setHoveredId}
          onSelect={setSelectedId}
        />
      </Canvas>

      {hoveredArtist && hoveredArtist.spotify_id !== selectedId && (
        <HoverTooltip
          artist={hoveredArtist}
          accent={accentFor(hoveredArtist.primary_genre_bucket)}
        />
      )}

      {selectedArtist && (
        <DetailPanel
          artist={selectedArtist}
          accent={accentFor(selectedArtist.primary_genre_bucket)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {nowPlaying && <NowPlayingCard nowPlaying={nowPlaying} />}

      {postcardTitle && (
        <PostcardButton
          captureRef={captureRef}
          title={postcardTitle}
          subtitle={`${placed.length} artists · ${districtCount} districts`}
          filename={`spocity-postcard.png`}
        />
      )}

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

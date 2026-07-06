"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import type { NowPlayingData } from "@/lib/useNowPlaying";
import { CityScene } from "./CityScene";
import { DetailPanel, HoverTooltip, MiniMap, NowPlayingCard } from "./Hud";
import { buildCity } from "./grid";
import type { CityPayload } from "./types";

/**
 * The full city view: 3D canvas + HUD overlays. Takes an already-fetched
 * payload so it can be driven by the real API (/me) or by mock data
 * (/dev/city) — the render path is identical either way.
 */
export function CityView({
  data,
  nowPlaying,
}: {
  data: CityPayload;
  nowPlaying: NowPlayingData | null;
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

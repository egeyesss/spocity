// Deterministic mock payload for the /dev/city preview page.
//
// Mirrors the shape of GET /api/me/city/ so CityView renders exactly what a
// real logged-in user would see, without needing Spotify OAuth or the
// backend. Bucket data comes from the shared static copy in lib/districts.

import { DISTRICTS } from "@/lib/districts";
import type { NowPlayingData } from "@/lib/useNowPlaying";
import type { ArtistRow, CityPayload, Tier } from "../../me/city/types";

const BUCKETS = DISTRICTS;

// Artist counts roughly shaped like the real smoke-test account (hip-hop
// heavy), padded so every district shows up with at least a few buildings.
const DISTRICT_SIZES: Record<string, number> = {
  "hip-hop": 26,
  pop: 14,
  "r-and-b-soul": 12,
  rock: 12,
  electronic: 10,
  "folk-singer-songwriter": 9,
  jazz: 8,
  latin: 6,
  classical: 5,
  metal: 4,
  other: 6,
};

const FIRST = [
  "Velvet", "Midnight", "Golden", "Neon", "Paper", "Silver", "Lunar",
  "Wild", "Broken", "Electric", "Crimson", "Hollow", "Static", "Amber",
];
const SECOND = [
  "Harbor", "Foxes", "Motel", "Parade", "Avenue", "Youth", "Mirrors",
  "Garden", "Signal", "Empire", "Tigers", "Waves", "Theory", "Nights",
];

// Tier by rank within a district: the #1 artist of the biggest district is a
// landmark, early ranks are skyscrapers/offices, the long tail is shacks —
// same shape Hybrid C scoring produces on a real account.
function tierFor(rank: number, districtSize: number, isTopDistrict: boolean): Tier {
  if (rank === 0 && isTopDistrict) return "landmark";
  if (rank === 0) return "skyscraper";
  if (rank === 1 && districtSize > 10) return "skyscraper";
  if (rank <= 2) return "office";
  if (rank <= 5) return "apartment";
  if (rank <= Math.max(7, districtSize * 0.6)) return "house";
  return "shack";
}

const TIER_SCORE: Record<Tier, number> = {
  landmark: 4200,
  skyscraper: 1800,
  office: 800,
  apartment: 320,
  house: 90,
  shack: 12,
};

export function devCityPayload(): CityPayload {
  const artists: ArtistRow[] = [];
  let n = 0;
  const maxSize = Math.max(...Object.values(DISTRICT_SIZES));

  for (const bucket of BUCKETS) {
    const size = DISTRICT_SIZES[bucket.slug] ?? 4;
    for (let rank = 0; rank < size; rank++) {
      const tier = tierFor(rank, size, size === maxSize);
      // Deterministic two-word name; index shifts per district so names vary.
      const name = `${FIRST[(n * 7 + rank) % FIRST.length]} ${SECOND[(n * 3 + rank * 5) % SECOND.length]}`;
      artists.push({
        spotify_id: `dev-${bucket.slug}-${rank}`,
        name,
        image_url: null,
        tier,
        score: TIER_SCORE[tier] + rank,
        seed_score: Math.round(TIER_SCORE[tier] * 0.8),
        primary_genre_bucket: bucket.slug,
        last_played_at: new Date(
          Date.UTC(2026, 5, 1 + (rank % 28), 12),
        ).toISOString(),
      });
      n++;
    }
  }

  // API returns artists score-desc; grid.ts relies on that for rank order.
  artists.sort((a, b) => b.score - a.score);

  return { artists, buckets: BUCKETS };
}

export function devNowPlaying(payload: CityPayload): NowPlayingData {
  // Pick a mid-tier hip-hop artist so the pulse is visible but not the landmark.
  const artist =
    payload.artists.find(
      (a) => a.primary_genre_bucket === "hip-hop" && a.tier === "apartment",
    ) ?? payload.artists[0];
  return {
    track_id: "dev-track",
    track_name: "Skyline (feat. Nobody)",
    artist_spotify_id: artist.spotify_id,
    artist_name: artist.name,
    album_image: null,
    progress_ms: 61_000,
    duration_ms: 203_000,
    is_playing: true,
  };
}

// Deterministic mock payload for the /dev/city preview page.
//
// Mirrors the shape of GET /api/me/city/ so CityView renders exactly what a
// real logged-in user would see, without needing Spotify OAuth or the
// backend. Bucket slugs/labels/palettes are copied from genres.py::BUCKETS —
// same contract the building library is keyed on.

import type { NowPlayingData } from "@/lib/useNowPlaying";
import type { ArtistRow, BucketRow, CityPayload, Tier } from "../../me/city/types";

const BUCKETS: BucketRow[] = [
  { slug: "pop", label: "Pop", color_palette: ["#FFD1DC", "#FF69B4", "#C71585"], sort_order: 1 },
  { slug: "hip-hop", label: "Hip-Hop", color_palette: ["#FFE599", "#FFC107", "#B8860B"], sort_order: 2 },
  { slug: "r-and-b-soul", label: "R&B / Soul", color_palette: ["#D6BCFA", "#9F7AEA", "#553C9A"], sort_order: 3 },
  { slug: "rock", label: "Rock", color_palette: ["#FCA5A5", "#EF4444", "#991B1B"], sort_order: 4 },
  { slug: "metal", label: "Metal", color_palette: ["#A0AEC0", "#4A5568", "#1A202C"], sort_order: 5 },
  { slug: "electronic", label: "Electronic", color_palette: ["#7DD3FC", "#06B6D4", "#0E7490"], sort_order: 6 },
  { slug: "folk-singer-songwriter", label: "Folk / Singer-Songwriter", color_palette: ["#BBF7D0", "#22C55E", "#15803D"], sort_order: 7 },
  { slug: "classical", label: "Classical", color_palette: ["#F5F5DC", "#E8DCC4", "#B8A582"], sort_order: 8 },
  { slug: "jazz", label: "Jazz", color_palette: ["#A5B4FC", "#6366F1", "#3730A3"], sort_order: 9 },
  { slug: "latin", label: "Latin", color_palette: ["#FED7AA", "#F97316", "#9A3412"], sort_order: 10 },
  { slug: "other", label: "Other", color_palette: ["#E5E7EB", "#9CA3AF", "#4B5563"], sort_order: 99 },
];

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

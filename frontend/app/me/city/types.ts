// Shape returned by GET /api/me/city/ — kept in lockstep with backend/core/views.py::me_city.

export type Tier =
  | "shack"
  | "house"
  | "apartment"
  | "office"
  | "skyscraper"
  | "landmark";

export interface ArtistRow {
  spotify_id: string;
  name: string;
  image_url: string | null;
  tier: Tier;
  score: number;
  seed_score: number;
  primary_genre_bucket: string | null;
  last_played_at: string | null;
}

export interface BucketRow {
  slug: string;
  label: string;
  color_palette: [string, string, string];
  sort_order: number;
}

export interface CityPayload {
  artists: ArtistRow[];
  buckets: BucketRow[];
}

// Position assigned by the layout pass — kept separate from the API shape so
// the layout can be re-run client-side without re-fetching.
export interface PlacedArtist extends ArtistRow {
  position: [number, number, number];
}

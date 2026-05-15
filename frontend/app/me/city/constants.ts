import type { Tier } from "./types";

// Voxel count per building, per tier. Values from implementation-plan §Week 4.
export const TIER_HEIGHT: Record<Tier, number> = {
  shack: 1,
  house: 3,
  apartment: 6,
  office: 10,
  skyscraper: 18,
  landmark: 30,
};

// Human-readable label for the detail panel.
export const TIER_LABEL: Record<Tier, string> = {
  shack: "Shack",
  house: "House",
  apartment: "Apartment",
  office: "Office",
  skyscraper: "Skyscraper",
  landmark: "Landmark",
};

// Fallback palette for artists with primary_genre_bucket = null
// (e.g. Last.fm rollup couldn't classify them — they land in "other").
// Neutral concrete-gray scale so they don't visually compete with real districts.
export const FALLBACK_PALETTE: [string, string, string] = [
  "#D4D4D8",
  "#71717A",
  "#27272A",
];

export const VOXEL_SIZE = 1;

// District layout (Week 5): each genre bucket occupies one cell in a 4-col grid.
export const DISTRICT_COLS = 4;
export const DISTRICT_CELL = 30; // world-unit width/depth per district cell
// Phyllotaxis spiral radius for rank-n artist within its district.
// r = SPIRAL_BASE * sqrt(rank), so buildings pack tight at center and spread outward.
export const SPIRAL_BASE = 2.8;

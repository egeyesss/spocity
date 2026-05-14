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

// One world-unit per voxel; buildings sit on a grid with this much spacing
// between footprints. Week 5 replaces the grid with district-based layout.
export const VOXEL_SIZE = 1;
export const GRID_SPACING = 2.2;

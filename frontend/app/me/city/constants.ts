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

// City layout (Barcelona Eixample block grid). Districts are arranged as
// rectangular blocks in a DISTRICT_COLS-wide grid; the gaps between blocks are
// the asphalt roads.
export const DISTRICT_COLS = 4;
// Center-to-center spacing between adjacent buildings inside a block. Must be
// wide enough to clear the largest footprint (skyscraper podiums span 4 voxels).
export const BUILDING_PITCH = 6;
// Width of the asphalt road between two district blocks, in world units.
export const ROAD_WIDTH = 11;

// Static copy of the district buckets for surfaces that render without the
// API (landing page, /dev/city mock). Slugs/labels/palettes mirror
// backend/core/genres.py::BUCKETS — same contract the building library is
// keyed on, so keep them in lockstep.

import type { BucketRow } from "@/app/me/city/types";

export const DISTRICTS: BucketRow[] = [
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

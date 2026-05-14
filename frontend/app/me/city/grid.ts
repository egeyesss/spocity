import { GRID_SPACING } from "./constants";
import type { ArtistRow, PlacedArtist } from "./types";

/**
 * Lay artists out on a square-ish grid centered on the origin.
 *
 * Week 4 deliberately keeps this dumb — same artists → same positions,
 * but no genre clustering yet. Week 5's district layout replaces this
 * with a deterministic per-bucket placement that packs buildings tightest
 * at each district's center.
 */
export function gridLayout(artists: ArtistRow[]): PlacedArtist[] {
  const n = artists.length;
  if (n === 0) return [];

  // cols ≈ √n, rounded up so tall rectangles aren't worse than wide ones
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  // Centre the grid on (0, 0) so the camera default looks at something sensible.
  const xOffset = ((cols - 1) * GRID_SPACING) / 2;
  const zOffset = ((rows - 1) * GRID_SPACING) / 2;

  return artists.map((a, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      ...a,
      position: [
        col * GRID_SPACING - xOffset,
        0,
        row * GRID_SPACING - zOffset,
      ],
    };
  });
}

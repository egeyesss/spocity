// The spocity wordmark: lowercase "spocity" with an isometric voxel cube as
// the dot of the "i" (brand decision §4). The "i" stem is drawn as a small
// pill so the cube can float above it cleanly at any size.

const GREEN: [string, string, string] = ["#22C55E", "#16A34A", "#15803D"];

export function VoxelDot({
  size = 18,
  palette = GREEN,
}: {
  size?: number;
  palette?: [string, string, string];
}) {
  const S = size / 2;
  const cx = size / 2;
  const cy = size / 2 + S * 0.2;
  const top = `${cx},${cy - S} ${cx + S},${cy - S * 0.5} ${cx},${cy} ${cx - S},${cy - S * 0.5}`;
  const right = `${cx},${cy} ${cx + S},${cy - S * 0.5} ${cx + S},${cy + S * 0.5} ${cx},${cy + S}`;
  const left = `${cx},${cy} ${cx - S},${cy - S * 0.5} ${cx - S},${cy + S * 0.5} ${cx},${cy + S}`;
  const [light, mid, dark] = palette;
  return (
    <svg
      width={size}
      height={size * 1.1}
      viewBox={`0 0 ${size} ${size * 1.1}`}
      className="inline-block align-baseline"
      aria-hidden
    >
      <polygon points={left} fill={dark} />
      <polygon points={right} fill={mid} />
      <polygon points={top} fill={light} />
    </svg>
  );
}

export function Wordmark({
  size = 32,
  color = "#FAFAF5",
  palette = GREEN,
}: {
  size?: number;
  color?: string;
  palette?: [string, string, string];
}) {
  return (
    <span
      className="inline-flex items-baseline font-display font-bold"
      style={{
        fontSize: size,
        color,
        lineHeight: 1,
        letterSpacing: "-0.04em",
      }}
    >
      <span>spoc</span>
      <span className="relative inline-block">
        {/* stem of the "i" */}
        <span
          className="inline-block bg-current align-baseline"
          style={{
            width: size * 0.1,
            height: size * 0.55,
            borderRadius: size * 0.03,
          }}
        />
        {/* voxel cube as the dot */}
        <span
          className="absolute left-1/2"
          style={{ transform: `translate(-50%, ${-size * 0.62}px)` }}
        >
          <VoxelDot size={Math.round(size * 0.4)} palette={palette} />
        </span>
      </span>
      <span>ty</span>
    </span>
  );
}

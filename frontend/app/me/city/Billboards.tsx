"use client";

import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { TIER_LABEL } from "./constants";
import type { DistrictBlock, ParkCell } from "./grid";
import type { CityBounds } from "./grid";
import type { NowPlayingData } from "@/lib/useNowPlaying";
import type { BucketRow, PlacedArtist } from "./types";

// Animated roadside ad boards. Each is a posted panel whose face is a
// CanvasTexture we repaint when the slide changes (never per-frame). Boards
// come in a few flavours and loop through their slides, so the city always
// has something moving and personal in it:
//   • now-playing  — the track you're listening to right now (live)
//   • top-artists  — your top 5, looping
//   • districts    — genre-district spotlight, looping
//   • stats        — city summary cards, looping
// They're placed on the outskirts approaches and in park corners — empty
// space that otherwise reads as dead.

const PANEL_W = 8;
const PANEL_H = 5;
const POST_H = 5;
const CANVAS_W = 640;
const CANVAS_H = 400;
const SLIDE_MS = 4500;
const PANEL_BG = "#15121d";

type Slide = {
  title: string;
  big: string;
  sub?: string;
  accent: string;
  imageUrl?: string | null;
};

type BoardKind = "now-playing" | "top-artists" | "districts" | "stats";

// ── canvas drawing ────────────────────────────────────────────────────────────

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dW: number,
  dH: number,
) {
  const ir = img.width / img.height;
  const r = dW / dH;
  let sw: number, sh: number, sx: number, sy: number;
  if (ir > r) {
    sh = img.height;
    sw = sh * r;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / r;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dW, dH);
}

function clipText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

function wrap2(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
  if (ctx.measureText(text).width <= maxW) return [text];
  const words = text.split(/\s+/);
  let a = "";
  let i = 0;
  for (; i < words.length; i++) {
    const test = a ? a + " " + words[i] : words[i];
    if (ctx.measureText(test).width <= maxW) a = test;
    else break;
  }
  if (!a) return [clipText(ctx, text, maxW)];
  const rest = words.slice(i).join(" ");
  return [a, rest ? clipText(ctx, rest, maxW) : ""].filter(Boolean);
}

function drawSlide(
  ctx: CanvasRenderingContext2D,
  s: Slide,
  img: HTMLImageElement | null,
) {
  const W = CANVAS_W;
  const H = CANVAS_H;
  ctx.clearRect(0, 0, W, H);

  // panel
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(0, 0, W, H);

  // accent header bar
  const barH = Math.round(H * 0.17);
  ctx.fillStyle = s.accent;
  ctx.fillRect(0, 0, W, barH);
  ctx.fillStyle = "#F4F0E6";
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  try {
    ctx.letterSpacing = "4px";
  } catch {
    /* not supported — fine */
  }
  ctx.fillText(s.title.toUpperCase(), 28, barH / 2 + 2);
  try {
    ctx.letterSpacing = "0px";
  } catch {
    /* noop */
  }

  const pad = 28;
  const bodyY = barH + pad;
  const bodyH = H - barH - pad * 2;
  let textX = pad;

  if (s.imageUrl) {
    const sz = bodyH;
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad, bodyY, sz, sz);
      ctx.clip();
      drawCover(ctx, img, pad, bodyY, sz, sz);
      ctx.restore();
    } else {
      ctx.fillStyle = "#241f30";
      ctx.fillRect(pad, bodyY, sz, sz);
    }
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(pad + 1.5, bodyY + 1.5, sz - 3, sz - 3);
    textX = pad + sz + 28;
  }

  const textW = W - textX - pad;

  // big line(s)
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 52px system-ui, sans-serif";
  const lines = wrap2(ctx, s.big, textW);
  let ty = bodyY + 18;
  for (const ln of lines) {
    ctx.fillText(ln, textX, ty + 26);
    ty += 60;
  }

  if (s.sub) {
    ctx.fillStyle = "#b9b3c4";
    ctx.font = "500 30px system-ui, sans-serif";
    ctx.fillText(clipText(ctx, s.sub, textW), textX, ty + 24);
  }

  // outer border
  ctx.strokeStyle = s.accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);
}

// ── one billboard ─────────────────────────────────────────────────────────────

function Billboard({
  id,
  position,
  rotationY,
  slides,
  onFocus,
}: {
  id: number;
  position: [number, number, number];
  rotationY: number;
  slides: Slide[];
  onFocus: (id: number, target: THREE.Vector3, camPos: THREE.Vector3) => void;
}) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  // Canvas + texture live in a ref (not useMemo) so useFrame can flag
  // texture.needsUpdate — the react-hooks lint forbids mutating a memoized
  // value, and forbids reading a ref during render. So nothing here is
  // touched during render; the map is attached imperatively after mount.
  const tcRef = useRef<{
    canvas: HTMLCanvasElement;
    texture: THREE.CanvasTexture;
  } | null>(null);
  const imgCache = useRef<Map<string, HTMLImageElement | null>>(new Map());
  // mutable runtime state, kept off React to avoid per-frame renders
  const rt = useRef({ idx: 0, t: SLIDE_MS, fade: 1, dirty: true });

  const redraw = () => {
    const tc = tcRef.current;
    if (!tc) return;
    const ctx = tc.canvas.getContext("2d");
    if (!ctx || slides.length === 0) return;
    const s = slides[rt.current.idx % slides.length];
    let img: HTMLImageElement | null = null;
    if (s.imageUrl) {
      const cache = imgCache.current;
      if (cache.has(s.imageUrl)) {
        img = cache.get(s.imageUrl) ?? null;
      } else {
        cache.set(s.imageUrl, null); // pending
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => {
          cache.set(s.imageUrl!, el);
          rt.current.dirty = true;
        };
        el.onerror = () => cache.set(s.imageUrl!, null);
        el.src = s.imageUrl;
      }
    }
    drawSlide(ctx, s, img);
    tc.texture.needsUpdate = true;
  };

  // Build the canvas/texture after mount, attach it to the material, paint
  // the first slide. Cleanup disposes the texture.
  useEffect(() => {
    const cvs = document.createElement("canvas");
    cvs.width = CANVAS_W;
    cvs.height = CANVAS_H;
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tcRef.current = { canvas: cvs, texture: tex };
    if (matRef.current) {
      matRef.current.map = tex;
      matRef.current.needsUpdate = true;
    }
    rt.current.dirty = true;
    redraw();
    return () => {
      tex.dispose();
      tcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to the first slide whenever the slide set changes (e.g. the
  // now-playing track updated).
  useEffect(() => {
    rt.current.idx = 0;
    rt.current.t = 0;
    rt.current.fade = 0;
    rt.current.dirty = true;
  }, [slides]);

  useFrame((_, delta) => {
    const r = rt.current;
    r.t += delta * 1000;
    if (r.t >= SLIDE_MS && slides.length > 1) {
      r.t = 0;
      r.idx = (r.idx + 1) % slides.length;
      r.fade = 0;
      r.dirty = true;
    }
    if (r.dirty) {
      r.dirty = false;
      redraw();
    }
    if (r.fade < 1) {
      r.fade = Math.min(1, r.fade + delta * 3);
      if (matRef.current) matRef.current.opacity = r.fade;
    }
  });

  const panelY = POST_H + PANEL_H / 2;

  // Click → fly the camera to frame the panel from the front (the panel's
  // +Z faces the city, so a viewpoint along +Z reads it straight-on).
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const nx = Math.sin(rotationY);
    const nz = Math.cos(rotationY);
    const target = new THREE.Vector3(
      position[0] + nx * 0.12,
      panelY,
      position[2] + nz * 0.12,
    );
    const camPos = new THREE.Vector3(
      target.x + nx * 14,
      target.y + 3.5,
      target.z + nz * 14,
    );
    onFocus(id, target, camPos);
  };

  return (
    <group
      position={position}
      rotation={[0, rotationY, 0]}
      onClick={handleClick}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      {/* post */}
      <mesh position={[0, POST_H / 2, -0.06]} castShadow>
        <boxGeometry args={[0.5, POST_H, 0.5]} />
        <meshStandardMaterial color="#241f30" roughness={0.9} />
      </mesh>
      {/* backboard / frame */}
      <mesh position={[0, panelY, -0.08]} castShadow>
        <boxGeometry args={[PANEL_W + 0.5, PANEL_H + 0.5, 0.35]} />
        <meshStandardMaterial color="#1a1626" roughness={0.9} />
      </mesh>
      {/* lit display panel */}
      <mesh position={[0, panelY, 0.12]}>
        <planeGeometry args={[PANEL_W, PANEL_H]} />
        <meshBasicMaterial
          ref={matRef}
          toneMapped={false}
          transparent
          opacity={1}
        />
      </mesh>
    </group>
  );
}

// ── placement + slide building ────────────────────────────────────────────────

function yawToward(x: number, z: number, cx: number, cz: number): number {
  // Panel faces local +Z; rotate so +Z points at (cx,cz).
  return Math.atan2(cx - x, cz - z);
}

export function Billboards({
  artists,
  blocks,
  parks,
  buckets,
  bounds,
  nowPlaying,
  onFocus,
}: {
  artists: PlacedArtist[];
  blocks: DistrictBlock[];
  parks: ParkCell[];
  buckets: BucketRow[];
  bounds: CityBounds | null;
  nowPlaying: NowPlayingData | null;
  onFocus: (id: number, target: THREE.Vector3, camPos: THREE.Vector3) => void;
}) {
  const paletteFor = useMemo(() => {
    const m = new Map<string, [string, string, string]>();
    for (const b of buckets) m.set(b.slug, b.color_palette);
    return (slug: string | null) =>
      (slug && m.get(slug)) || (["#D4D4D8", "#71717A", "#27272A"] as const);
  }, [buckets]);

  // Slide sets per board kind.
  const slidesByKind = useMemo<Record<BoardKind, Slide[]>>(() => {
    const top5 = [...artists].sort((a, b) => b.score - a.score).slice(0, 5);

    const nowPlayingSlides: Slide[] = nowPlaying
      ? [
          {
            title: "Now Playing",
            big: nowPlaying.track_name || "—",
            sub: nowPlaying.artist_name || undefined,
            accent: "#1DB954",
            imageUrl: nowPlaying.album_image,
          },
        ]
      : [
          {
            title: "Spocity FM",
            big: "Nothing playing",
            sub: "Start a track on Spotify",
            accent: "#3a2f44",
          },
        ];

    const topArtistSlides: Slide[] = top5.length
      ? top5.map((a, i) => ({
          title: `Top Artist #${i + 1}`,
          big: a.name,
          sub: TIER_LABEL[a.tier],
          accent: paletteFor(a.primary_genre_bucket)[1],
          imageUrl: a.image_url,
        }))
      : [{ title: "Top Artists", big: "No data yet", accent: "#3a2f44" }];

    const districtSlides: Slide[] = blocks.length
      ? [...blocks]
          .sort((a, b) => b.count - a.count)
          .map((b) => ({
            title: "District",
            big: b.label,
            sub: `${b.count} artist${b.count === 1 ? "" : "s"}`,
            accent: b.palette[1],
          }))
      : [{ title: "Districts", big: "No data yet", accent: "#3a2f44" }];

    const biggest = [...blocks].sort((a, b) => b.count - a.count)[0];
    const topArtist = top5[0];
    const statSlides: Slide[] = [
      {
        title: "Spocity",
        big: `${artists.length}`,
        sub: "artists in your city",
        accent: "#6366F1",
      },
      {
        title: "Spocity",
        big: `${blocks.length}`,
        sub: "genre districts",
        accent: "#06B6D4",
      },
      ...(biggest
        ? [
            {
              title: "Biggest District",
              big: biggest.label,
              sub: `${biggest.count} artists`,
              accent: biggest.palette[1],
            } as Slide,
          ]
        : []),
      ...(topArtist
        ? [
            {
              title: "Your #1",
              big: topArtist.name,
              sub: TIER_LABEL[topArtist.tier],
              accent: paletteFor(topArtist.primary_genre_bucket)[1],
              imageUrl: topArtist.image_url,
            } as Slide,
          ]
        : []),
    ];

    return {
      "now-playing": nowPlayingSlides,
      "top-artists": topArtistSlides,
      districts: districtSlides,
      stats: statSlides,
    };
  }, [artists, blocks, nowPlaying, paletteFor]);

  // Placements: outskirts approaches first (so a now-playing board greets you),
  // then a capped set of park corners. Fully deterministic.
  const placements = useMemo(() => {
    if (!bounds) return [];
    const cx = (bounds.x0 + bounds.x1) / 2;
    const cz = (bounds.z0 + bounds.z1) / 2;
    const off = 34;
    const out: { pos: [number, number, number]; yaw: number }[] = [];

    // four cardinal approach boards, just outside the city bounds
    const approaches: [number, number][] = [
      [cx, bounds.z0 - off],
      [cx, bounds.z1 + off],
      [bounds.x0 - off, cz],
      [bounds.x1 + off, cz],
    ];
    for (const [x, z] of approaches) {
      out.push({ pos: [x, 0, z], yaw: yawToward(x, z, cx, cz) });
    }

    // one per sufficiently-large park, capped, facing the city centre
    const bigParks = parks
      .filter((p) => p.x1 - p.x0 > 22 && p.z1 - p.z0 > 22)
      .slice(0, 6);
    for (const p of bigParks) {
      const x = p.x0 + 3;
      const z = p.z0 + 3;
      out.push({ pos: [x, 0, z], yaw: yawToward(x, z, cx, cz) });
    }
    return out;
  }, [bounds, parks]);

  const order: BoardKind[] = [
    "now-playing",
    "top-artists",
    "districts",
    "stats",
  ];

  if (placements.length === 0) return null;

  return (
    <>
      {placements.map((pl, i) => {
        const kind = order[i % order.length];
        return (
          <Billboard
            key={i}
            id={i}
            position={pl.pos}
            rotationY={pl.yaw}
            slides={slidesByKind[kind]}
            onFocus={onFocus}
          />
        );
      })}
    </>
  );
}

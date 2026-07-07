"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useState, type MutableRefObject } from "react";
import * as THREE from "three";

// Postcard pipeline: snap the WebGL canvas from a deterministic hero angle,
// composite it onto a branded 1200×630 card, download as PNG. Fully
// client-side — no upload, works for anonymous visitors on public pages.

export type CaptureFn = () => string | null;

// Hero pose for the snapshot — same angle the city loads at, so postcards
// look consistent no matter where the visitor orbited to (the "share pose"
// requirement from the design docs).
const POSE_POSITION = new THREE.Vector3(90, 95, 130);
const POSE_TARGET = new THREE.Vector3(0, 2, 0);

type OrbitLike = {
  target: THREE.Vector3;
  update: () => void;
} | null;

/**
 * Lives inside the Canvas; registers an imperative capture function on the
 * ref the DOM button calls. Capture = save camera pose → jump to the hero
 * pose → render one frame → read pixels → restore.
 */
export function CaptureBridge({
  captureRef,
}: {
  captureRef: MutableRefObject<CaptureFn | null>;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitLike;

  useEffect(() => {
    captureRef.current = () => {
      const prevPos = camera.position.clone();
      const prevQuat = camera.quaternion.clone();
      const prevTarget = controls ? controls.target.clone() : null;

      camera.position.copy(POSE_POSITION);
      if (controls) {
        controls.target.copy(POSE_TARGET);
        controls.update();
      } else {
        camera.lookAt(POSE_TARGET);
      }

      gl.render(scene, camera);
      const dataUrl = gl.domElement.toDataURL("image/png");

      camera.position.copy(prevPos);
      camera.quaternion.copy(prevQuat);
      if (controls && prevTarget) {
        controls.target.copy(prevTarget);
        controls.update();
      }

      return dataUrl;
    };
    return () => {
      captureRef.current = null;
    };
  }, [captureRef, gl, scene, camera, controls]);

  return null;
}

// ── 2D composition ────────────────────────────────────────────────────────────

const CARD_W = 1200;
const CARD_H = 630;
const SKY_TOP = "#161129";
const GREEN: [string, string, string] = ["#22C55E", "#16A34A", "#15803D"];

function fontFamily(cssVar: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar)
    .trim();
  return v || fallback;
}

// The wordmark's isometric voxel cube, drawn onto the card canvas.
function drawCube(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const [light, mid, dark] = GREEN;
  const h = s / 2;
  const poly = (points: [number, number][], fill: string) => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  poly([[cx, cy], [cx - h, cy - h * 0.5], [cx - h, cy + h * 0.5], [cx, cy + h]], dark);
  poly([[cx, cy], [cx + h, cy - h * 0.5], [cx + h, cy + h * 0.5], [cx, cy + h]], mid);
  poly([[cx, cy - h], [cx + h, cy - h * 0.5], [cx, cy], [cx - h, cy - h * 0.5]], light);
}

export async function composePostcard(
  snapshotDataUrl: string,
  title: string,
  subtitle: string,
): Promise<Blob | null> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = snapshotDataUrl;
  });

  const cvs = document.createElement("canvas");
  cvs.width = CARD_W;
  cvs.height = CARD_H;
  const ctx = cvs.getContext("2d")!;

  // Snapshot, cover-fitted, full bleed.
  ctx.fillStyle = SKY_TOP;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const scale = Math.max(CARD_W / img.width, CARD_H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (CARD_W - dw) / 2, (CARD_H - dh) / 2, dw, dh);

  // Bottom caption band, faded up from solid.
  const band = ctx.createLinearGradient(0, CARD_H - 190, 0, CARD_H);
  band.addColorStop(0, "rgba(15, 12, 24, 0)");
  band.addColorStop(0.45, "rgba(15, 12, 24, 0.82)");
  band.addColorStop(1, "rgba(15, 12, 24, 0.95)");
  ctx.fillStyle = band;
  ctx.fillRect(0, CARD_H - 190, CARD_W, 190);

  const display = fontFamily("--font-space-grotesk", "system-ui, sans-serif");
  const pixel = fontFamily("--font-vt323", "monospace");

  // Wordmark ("spocity" + cube over the i).
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 40px ${display}`;
  ctx.fillStyle = "#FAFAF5";
  const wm = "spocity";
  ctx.fillText(wm, 48, CARD_H - 118);
  const iX = 48 + ctx.measureText("spoc").width + ctx.measureText("i").width / 2;
  drawCube(ctx, iX, CARD_H - 158, 18);

  // Title + stats.
  ctx.font = `700 34px ${display}`;
  ctx.fillStyle = "#FAFAF5";
  ctx.fillText(title, 48, CARD_H - 66);
  ctx.font = `22px ${pixel}`;
  ctx.fillStyle = "#4ADE80";
  ctx.fillText(subtitle.toUpperCase(), 48, CARD_H - 32);

  // URL, bottom right.
  ctx.font = `22px ${pixel}`;
  ctx.fillStyle = "#a6a0b8";
  const url = "SPOCITY-SMOKY.VERCEL.APP";
  ctx.fillText(url, CARD_W - 48 - ctx.measureText(url).width, CARD_H - 32);

  return new Promise((resolve) => cvs.toBlob(resolve, "image/png"));
}

// ── Button ────────────────────────────────────────────────────────────────────

export function PostcardButton({
  captureRef,
  title,
  subtitle,
  filename,
}: {
  captureRef: MutableRefObject<CaptureFn | null>;
  title: string;
  subtitle: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    const snap = captureRef.current?.();
    if (!snap) return;
    setBusy(true);
    try {
      const blob = await composePostcard(snap, title, subtitle);
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 border-2 border-[#0a0812] bg-[rgba(15,12,24,0.88)] px-4 py-2 font-pixel text-base uppercase tracking-[0.1em] text-zinc-200 shadow-[3px_3px_0_0_rgba(0,0,0,0.55)] backdrop-blur transition-all hover:-translate-y-0.5 hover:text-[#4ADE80] disabled:opacity-60"
    >
      {busy ? "Rendering…" : "✦ Save postcard"}
    </button>
  );
}

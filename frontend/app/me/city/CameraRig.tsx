"use client";

import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import * as THREE from "three";

// Minimal structural view of the drei OrbitControls instance we touch.
interface OrbitLike {
  target: THREE.Vector3;
  enabled: boolean;
  update: () => void;
}

export interface FocusState {
  // a click sets `requested` + which board + its framing; rig picks it up
  requested: boolean;
  reqId: number;
  reqPos: THREE.Vector3;
  reqTarget: THREE.Vector3;
  // tween runtime
  active: boolean;
  t: number;
  dur: number;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  // which board we're currently framed on (null = free camera), plus the
  // pose to fly back to when the same board is clicked again
  focusedId: number | null;
  homePos: THREE.Vector3;
  homeTarget: THREE.Vector3;
}

export function makeFocusState(): FocusState {
  return {
    requested: false,
    reqId: -1,
    reqPos: new THREE.Vector3(),
    reqTarget: new THREE.Vector3(),
    active: false,
    t: 0,
    dur: 0.7,
    toPos: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    fromPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    focusedId: null,
    homePos: new THREE.Vector3(),
    homeTarget: new THREE.Vector3(),
  };
}

/**
 * Smoothly flies the camera to frame a clicked billboard. A click writes the
 * destination into `focusRef` (requested=true); this rig captures the current
 * pose, disables OrbitControls for the ~0.7s flight so it can't fight the
 * lerp, eases over, then re-enables + `.update()`s controls so the user keeps
 * orbiting from the new vantage. Reads OrbitControls via drei `makeDefault`
 * (state.controls) — no ref plumbing. Drives Three objects directly in
 * useFrame, no per-frame React render.
 */
export function CameraRig({ focusRef }: { focusRef: RefObject<FocusState> }) {
  useFrame((state, delta) => {
    const f = focusRef.current;
    // From the frame state (set by drei `makeDefault`), not a hook return —
    // so it's fine to drive it here.
    const controls = (state.controls as unknown as OrbitLike | null) ?? null;

    if (f.requested) {
      f.requested = false;
      // Fly from wherever we are right now.
      f.fromPos.copy(state.camera.position);
      f.fromTarget.copy(controls ? controls.target : f.fromTarget);

      if (f.focusedId === f.reqId) {
        // Clicking the board we're already framed on → return home.
        f.toPos.copy(f.homePos);
        f.toTarget.copy(f.homeTarget);
        f.focusedId = null;
      } else {
        // Entering focus from a free camera → remember where to return to.
        if (f.focusedId === null) {
          f.homePos.copy(state.camera.position);
          f.homeTarget.copy(controls ? controls.target : f.fromTarget);
        }
        f.toPos.copy(f.reqPos);
        f.toTarget.copy(f.reqTarget);
        f.focusedId = f.reqId;
      }

      f.active = true;
      f.t = 0;
      if (controls) controls.enabled = false;
    }
    if (!f.active) return;

    f.t = Math.min(f.dur, f.t + delta);
    const k = f.t / f.dur;
    const e = k * k * (3 - 2 * k); // smoothstep ease

    state.camera.position.lerpVectors(f.fromPos, f.toPos, e);
    if (controls) controls.target.lerpVectors(f.fromTarget, f.toTarget, e);
    state.camera.lookAt(controls ? controls.target : f.toTarget);

    if (f.t >= f.dur) {
      f.active = false;
      if (controls) {
        controls.enabled = true;
        controls.update();
      }
    }
  });

  return null;
}

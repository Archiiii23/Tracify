/**
 * Camera path.
 *
 * The chapter keyframes in storyConfig are turned into a continuous
 * Catmull-Rom spline sampled by story progress, so the camera never jumps
 * between chapters — it flies one deliberate curve through the whole world.
 */
import * as THREE from "three";

import { CHAPTERS, type Vec3 } from "./storyConfig";
import { clamp01, smoothstep } from "./animationUtils";

interface Key {
  t: number;
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

const KEYS: Key[] = CHAPTERS.map((c) => ({
  t: c.at,
  pos: new THREE.Vector3(...(c.camera as Vec3)),
  target: new THREE.Vector3(...(c.target as Vec3)),
}));

const at = (i: number) => KEYS[Math.max(0, Math.min(KEYS.length - 1, i))]!;

/** Catmull-Rom on one axis. */
function cr(p0: number, p1: number, p2: number, p3: number, u: number) {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  );
}

function sample(
  key: "pos" | "target",
  p: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const t = clamp01(p);
  let i = 0;
  while (i < KEYS.length - 2 && t > at(i + 1).t) i++;
  const a = at(i);
  const b = at(i + 1);
  const span = Math.max(1e-5, b.t - a.t);
  // Ease inside each segment: chapters settle instead of sliding linearly.
  const u = smoothstep((t - a.t) / span);
  const p0 = at(i - 1)[key];
  const p1 = a[key];
  const p2 = b[key];
  const p3 = at(i + 2)[key];
  out.set(
    cr(p0.x, p1.x, p2.x, p3.x, u),
    cr(p0.y, p1.y, p2.y, p3.y, u),
    cr(p0.z, p1.z, p2.z, p3.z, u),
  );
  return out;
}

export const samplePosition = (p: number, out: THREE.Vector3) =>
  sample("pos", p, out);

export const sampleTarget = (p: number, out: THREE.Vector3) =>
  sample("target", p, out);

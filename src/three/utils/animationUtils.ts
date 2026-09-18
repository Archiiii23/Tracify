/**
 * Small math helpers shared by the landing world.
 * Kept dependency-free so both React and the WebGL frame loop can use them.
 */
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const smoothstep = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Eased 0 -> 1 ramp between two story stops. */
export const ramp = (p: number, from: number, to: number) =>
  smoothstep((p - from) / (to - from));

/** Eased 0 -> 1 -> 0 window: active only while inside a chapter. */
export const window01 = (
  p: number,
  from: number,
  to: number,
  fade = 0.05,
) => Math.min(ramp(p, from - fade, from + fade), 1 - ramp(p, to - fade, to + fade));

/** Frame-rate independent exponential approach. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Deterministic pseudo-random generator so the world is identical each load. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

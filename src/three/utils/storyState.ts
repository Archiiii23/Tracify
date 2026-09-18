/**
 * Render-free bridge between the scroll container and the WebGL loop.
 *
 * Mutating a module object keeps the world at 60fps: scroll frames never cause
 * React re-renders, and the frame loop always reads the latest value.
 */
export const story = {
  /** Raw scroll progress, 0 → 1. */
  raw: 0,
  /** Smoothed progress the world actually renders (Lenis-like inertia). */
  progress: 0,
  /** Normalised pointer, -1 → 1 on both axes. */
  pointerX: 0,
  pointerY: 0,
  /** Canvas on screen. */
  visible: true,
  /** Reduced complexity: small screens, weak GPUs, reduced-motion users. */
  lite: false,
  /** prefers-reduced-motion. */
  reduced: false,
  /** Adaptive quality multiplier, 1 = full. Scenes scale detail by this. */
  quality: 1,
  /** Current adaptive tier index (0 = best). */
  fpsTier: 0,
  /** Last measured frame rate. */
  fps: 60,
};

/** Adaptive render tiers, best → cheapest. */
export const QUALITY_TIERS = [
  { dpr: 1.75, quality: 1 },
  { dpr: 1.35, quality: 0.75 },
  { dpr: 1, quality: 0.55 },
  { dpr: 0.8, quality: 0.4 },
] as const;

export function detectLite() {
  if (typeof window === "undefined") return { lite: false, reduced: false };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = window.innerWidth < 900;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  return { lite: reduced || small || weak, reduced };
}

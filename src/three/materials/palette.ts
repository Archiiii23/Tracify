import * as THREE from "three";

/**
 * Colour has meaning in this world. Nothing here is decorative:
 * grey = unanalysed, blue = active trace, violet = intelligence context,
 * amber = attention, red = critical risk, green = verified attribution.
 */
export const PAL = {
  void: new THREE.Color("#080a0f"),
  dim: new THREE.Color("#252b38"),
  grey: new THREE.Color("#5c667a"),
  signal: new THREE.Color("#22d3ee"),
  accent: new THREE.Color("#38bdf8"),
  violet: new THREE.Color("#818cf8"),
  amber: new THREE.Color("#fbbf24"),
  critical: new THREE.Color("#f87171"),
  verified: new THREE.Color("#34d399"),
  light: new THREE.Color("#eef2f8"),
};

export const BG = "#080a0f";

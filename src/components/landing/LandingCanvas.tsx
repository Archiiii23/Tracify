/**
 * Fixed full-viewport WebGL layer. Everything scrolls above it; the canvas
 * itself never moves, so the sense of travel comes from the camera flight.
 */
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";

import { AdaptiveQuality } from "@/components/landing/AdaptiveQuality";
import { StoryWorld } from "@/three/scenes/StoryWorld";
import { story } from "@/three/utils/storyState";
import { BG } from "@/three/materials/palette";

export default function LandingCanvas() {
  const lite = story.lite;
  return (
    <Canvas
      className="!fixed inset-0"
      dpr={lite ? 1 : [1, 1.75]}
      gl={{
        antialias: !lite,
        powerPreference: "high-performance",
        alpha: false,
      }}
      camera={{ position: [0, 0, 92], fov: 55, near: 0.1, far: 1400 }}
      style={{ background: BG, pointerEvents: "none" }}
    >
      <AdaptiveQuality />
      <Suspense fallback={null}>
        <StoryWorld />
      </Suspense>
    </Canvas>
  );
}

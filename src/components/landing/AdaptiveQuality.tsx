/**
 * Adaptive performance governor for the landing world.
 *
 * Measures the real frame rate inside the render loop and steps render quality
 * down (device pixel ratio + `story.quality` tier the scenes read for particle
 * counts and effects) whenever FPS sags. Recovers one step at a time when the
 * GPU is comfortable again, with hysteresis so it never oscillates.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import { story, QUALITY_TIERS } from "@/three/utils/storyState";

export function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  const tier = useRef(story.lite ? 1 : 0);
  const frames = useRef(0);
  const windowStart = useRef(0);
  const cooldown = useRef(0);

  useEffect(() => {
    const t = QUALITY_TIERS[tier.current]!;
    story.quality = t.quality;
    setDpr(Math.min(t.dpr, window.devicePixelRatio));
  }, [setDpr]);

  const apply = (next: number) => {
    const clamped = Math.max(0, Math.min(QUALITY_TIERS.length - 1, next));
    if (clamped === tier.current) return;
    tier.current = clamped;
    const t = QUALITY_TIERS[clamped]!;
    story.quality = t.quality;
    story.fpsTier = clamped;
    setDpr(Math.min(t.dpr, window.devicePixelRatio));
  };

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (windowStart.current === 0) {
      windowStart.current = now;
      return;
    }
    frames.current += 1;
    const span = now - windowStart.current;
    if (span < 1) return;

    const fps = frames.current / span;
    story.fps = fps;
    frames.current = 0;
    windowStart.current = now;

    if (cooldown.current > 0) {
      cooldown.current -= 1;
      return;
    }

    if (fps < 40) {
      apply(tier.current + (fps < 26 ? 2 : 1));
      cooldown.current = 2;
    } else if (fps > 57 && tier.current > 0) {
      apply(tier.current - 1);
      cooldown.current = 4;
    }
  });

  return null;
}

/**
 * TRACIFY landing experience.
 *
 * The page is not a stack of sections: it is a single 3D world. A fixed WebGL
 * canvas holds the entire journey while a tall scroll track drives one
 * continuous camera flight through it. The DOM only carries chapter copy.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import {
  BrandMark,
  ChapterCopy,
  ChapterPanel,
  ChapterRail,
  DepthHud,
  FinalCta,
  GateEntrancePrompt,
  ScanlineSweep,
  StatusTicker,
  StoryProgressRibbon,
  TopRightAuth,
} from "@/components/landing/StoryOverlay";
import { useLenis } from "@/hooks/useLenis";
import { useStoryProgress } from "@/hooks/useStoryProgress";

const LandingCanvas = lazy(() => import("@/components/landing/LandingCanvas"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TRACIFY — Travel Inside the Blockchain" },
      {
        name: "description",
        content:
          "Scroll into a living blockchain world: trace value hop by hop, resolve entities, and turn on-chain noise into defensible investigation evidence.",
      },
      { property: "og:title", content: "TRACIFY — Travel Inside the Blockchain" },
      {
        property: "og:description",
        content:
          "A cinematic 3D journey from raw on-chain noise to attributed, evidence-backed intelligence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const track = useRef<HTMLDivElement>(null);
  const { chapter, progress } = useStoryProgress(track);
  const lenis = useLenis();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const jump = useCallback((at: number) => {
    const el = track.current;
    if (!el) return;
    const total = el.offsetHeight - window.innerHeight;
    const top = el.offsetTop + total * at;
    if (lenis.current) lenis.current.scrollTo(top, { duration: 2.1 });
    else window.scrollTo({ top, behavior: "smooth" });
  }, [lenis]);

  return (
    <main className="relative bg-background text-foreground">
      <h1 className="sr-only">
        TRACIFY — blockchain investigation and financial intelligence platform
      </h1>

      {/* The world. Fixed, full-viewport, behind everything. */}
      <div className="fixed inset-0 z-0">
        {mounted ? (
          <Suspense fallback={null}>
            <LandingCanvas />
          </Suspense>
        ) : null}
      </div>

      {/* Cinematic vignette so world typography never fights overlay copy. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 50%, transparent 30%, color-mix(in oklab, var(--background) 85%, transparent) 100%)",
        }}
      />

      <StoryProgressRibbon progress={progress} />
      <ScanlineSweep chapterId={chapter.id} />
      <BrandMark />
      <TopRightAuth />
      <GateEntrancePrompt progress={progress} onEnter={() => jump(0.085)} />
      <ChapterCopy chapter={chapter} />
      <ChapterPanel chapter={chapter} />
      <ChapterRail chapter={chapter} onJump={jump} />
      <DepthHud progress={progress} />
      <StatusTicker />
      <FinalCta visible={progress > 0.975} />

      {/* Scroll track: pure length. 12 chapters of travel. */}
      <div ref={track} style={{ height: "1200vh" }} aria-hidden />
    </main>
  );
}

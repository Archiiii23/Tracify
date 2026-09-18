import { useEffect, useRef } from "react";
import Lenis from "lenis";

/**
 * Buttery-smooth momentum scrolling for the cinematic landing journey.
 *
 * A single Lenis instance is kept at module level so the 3D camera loop, the
 * chapter rail and keyboard navigation all read/drive the exact same scroll
 * source — no drift between DOM scroll and the WebGL camera on wheel, touch or
 * resize. Disabled automatically when the visitor prefers reduced motion.
 */
let instance: Lenis | null = null;
const listeners = new Set<() => void>();

export function getLenis() {
  return instance;
}

/** Subscribe to every Lenis scroll frame (also fires for native fallback). */
export function onLenisScroll(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  for (const cb of listeners) cb();
}

/** Force Lenis to re-measure — call after layout/viewport changes. */
export function resyncLenis() {
  instance?.resize();
  emit();
}

export function useLenis() {
  const ref = useRef<Lenis | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Native scrolling still needs to feed the camera loop.
      const onScroll = () => emit();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }

    const lenis = new Lenis({
      duration: 1.35,
      easing: (t) => 1 - Math.pow(1 - t, 3.2),
      smoothWheel: true,
      syncTouch: true,
      touchMultiplier: 1.4,
      wheelMultiplier: 0.9,
    });
    ref.current = lenis;
    instance = lenis;

    // Every Lenis frame (wheel, touch, programmatic scrollTo) pushes the camera.
    lenis.on("scroll", emit);

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    // Resize / orientation / font-load layout shifts: re-measure, then re-sync.
    const onResize = () => resyncLenis();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(document.documentElement);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      lenis.off("scroll", emit);
      lenis.destroy();
      if (instance === lenis) instance = null;
      ref.current = null;
    };
  }, []);

  return ref;
}

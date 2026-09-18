/**
 * The 2D storytelling layer for TRACIFY.
 *
 * Designed like an investigative flight terminal: the 3D world carries the spatial
 * travel, while this overlay presents telemetry, tactical reads, and chapter statements.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

import {
  CHAPTERS,
  chapterAt,
  chapterNumber,
  type Chapter,
} from "@/three/utils/storyConfig";
import { story } from "@/three/utils/storyState";
import { cn } from "@/lib/utils";

// On mobile every chapter uses one calm left-aligned column. Alignment varies from md up.
const ALIGN = {
  left: "items-start text-left md:left-[6vw] md:right-auto",
  center:
    "items-start text-left md:items-center md:text-center md:left-1/2 md:right-auto md:top-[12vh] md:bottom-auto md:h-auto md:-translate-x-1/2 md:justify-start",
  right: "items-start text-left md:items-end md:text-right md:left-auto md:right-[15vw]",
} as const;

/** Scan-line sweep triggered across the viewport whenever the chapter transitions */
export function ScanlineSweep({ chapterId }: { chapterId: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(true);
    const t = setTimeout(() => setActive(false), 600);
    return () => clearTimeout(t);
  }, [chapterId]);

  if (!active) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
    >
      <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary/80 to-transparent shadow-[0_0_15px_var(--primary)] animate-[scanline_0.6s_ease-out_forwards]" />
    </div>
  );
}

/**
 * Gate entrance callout at the beginning of the journey (Chapter 00 / Void).
 * Invites the user to scroll to physically fly through the blockchain entry portal.
 */
export function GateEntrancePrompt({
  progress,
  onEnter,
}: {
  progress: number;
  onEnter: () => void;
}) {
  const visible = progress < 0.04;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[14vh] z-30 flex flex-col items-center justify-center transition-all duration-700 pointer-events-none",
        visible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-8 scale-95 pointer-events-none"
      )}
    >
      <button
        onClick={onEnter}
        className="group pointer-events-auto flex flex-col items-center gap-3.5 focus-visible:outline-none"
        aria-label="Scroll or click to enter the blockchain network"
      >
        {/* Animated concentric gate reticle */}
        <div className="relative flex h-14 w-14 items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-primary/30 animate-[spin_8s_linear_infinite]" />
          <div className="absolute inset-1.5 rounded-full border border-dashed border-primary/50 animate-[spin_6s_linear_infinite_reverse]" />
          <div className="absolute inset-3 rounded-full bg-primary/10 border border-primary/70 shadow-[0_0_20px_var(--primary)] group-hover:scale-110 transition-transform duration-300" />
          <span className="relative font-mono text-[10px] text-primary animate-pulse font-bold tracking-tighter">
            ▼
          </span>
        </div>

        {/* Narrative prompt text */}
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.38em] text-primary/90 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
            PORTAL SYNCHRONIZED
          </div>
          <span className="font-mono text-[11px] tracking-[0.24em] text-foreground/90 uppercase group-hover:text-primary transition-colors">
            SCROLL TO ENTER NETWORK
          </span>
          <span className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground/60">
            [ FLIGHT VECTOR: READY · 1200VH JOURNEY ]
          </span>
        </div>
      </button>
    </div>
  );
}

export function ChapterCopy({ chapter }: { chapter: Chapter }) {
  const o = chapter.overlay;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setShown(false);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [chapter.id]);

  if (!o) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-6 bottom-[19vh] top-[14vh] z-20 flex max-w-[calc(100vw-3rem)] flex-col justify-center gap-3.5 md:inset-x-auto md:inset-y-[20vh] md:w-[min(38vw,36rem)] md:max-w-none md:gap-5",
        ALIGN[o.align],
      )}
    >
      {/* Chapter Index Badge */}
      <div
        className={cn(
          "flex items-center gap-2.5 font-mono text-[10px] tracking-[0.42em] text-primary/90 transition-all duration-700",
          shown ? "opacity-100 translate-y-0" : "translate-y-3 opacity-0",
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
        <span>{chapterNumber(chapter)} / {chapter.label}</span>
      </div>

      <h2 className="max-w-full text-pretty [text-wrap:balance]">
        {o.lines.map((line, i) => (
          <span
            key={line}
            className={cn(
              "block font-semibold leading-[1.1] tracking-[-0.02em] text-foreground transition-all duration-[900ms] ease-out md:leading-[1.02] md:tracking-[-0.03em] drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]",
              o.align === "center"
                ? "text-[clamp(1.5rem,6.4vw,3rem)] md:text-[clamp(1.65rem,3vw,3rem)]"
                : "text-[clamp(1.6rem,7vw,3.75rem)] md:text-[clamp(1.75rem,3.8vw,3.75rem)]",
              shown ? "opacity-100 blur-0 translate-y-0" : "translate-y-6 opacity-0 blur-sm",
            )}
            style={{ transitionDelay: `${120 + i * 110}ms` }}
          >
            {line}
          </span>
        ))}
      </h2>

      {o.lines2 ? (
        <h3 className="max-w-full text-pretty [text-wrap:balance]">
          {o.lines2.map((line, i) => (
            <span
              key={line}
              className={cn(
                "block font-light leading-[1.25] tracking-[-0.01em] text-muted-foreground transition-all duration-[900ms] ease-out md:leading-[1.1] md:tracking-[-0.02em]",
                o.align === "center"
                  ? "text-[clamp(1rem,4.2vw,1.75rem)] md:text-[clamp(1.1rem,1.8vw,1.75rem)]"
                  : "text-[clamp(1.05rem,4.6vw,2rem)] md:text-[clamp(1.2rem,2.2vw,2rem)]",
                shown ? "opacity-100 blur-0 translate-y-0" : "translate-y-6 opacity-0 blur-sm",
              )}
              style={{ transitionDelay: `${420 + i * 110}ms` }}
            >
              {line}
            </span>
          ))}
        </h3>
      ) : null}

      {o.note ? (
        <p
          className={cn(
            "max-w-[42ch] text-pretty text-[0.8125rem] leading-[1.65] text-muted-foreground/90 transition-all duration-700 sm:max-w-md md:text-sm md:leading-relaxed backdrop-blur-xs",
            shown ? "opacity-100 translate-y-0" : "translate-y-4 opacity-0",
          )}
          style={{ transitionDelay: "700ms" }}
        >
          {o.note}
        </p>
      ) : null}

      {o.bullets ? (
        <ul
          className={cn(
            "flex max-w-full flex-col gap-2.5 transition-all duration-700 md:gap-2",
            o.align === "right" ? "items-start md:items-end" : "items-start",
            shown ? "opacity-100 translate-y-0" : "translate-y-4 opacity-0",
          )}
          style={{ transitionDelay: "780ms" }}
        >
          {o.bullets.map((b) => (
            <li
              key={b}
              className={cn(
                "flex max-w-[38ch] items-start gap-2.5 text-pretty text-[0.75rem] leading-[1.55] text-muted-foreground/85 sm:max-w-sm md:text-xs md:leading-snug",
                o.align === "right" ? "md:flex-row-reverse md:text-right" : "",
              )}
            >
              <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-primary/80 shadow-[0_0_10px_var(--primary)]" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {o.meta ? (
        <dl
          className={cn(
            "flex max-w-full flex-wrap gap-x-5 gap-y-2.5 font-mono text-[9px] leading-tight tracking-[0.14em] transition-all duration-700 md:gap-x-6 md:tracking-[0.16em] md:text-[10px]",
            o.align === "right" ? "md:justify-end" : "",
            shown ? "opacity-100 translate-y-0" : "translate-y-4 opacity-0",
          )}
          style={{ transitionDelay: "880ms" }}
        >
          {o.meta.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 border-l border-primary/30 pl-2.5">
              <dt className="text-muted-foreground/50">{k}</dt>
              <dd className="text-foreground/85 font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

const PANEL_POS = {
  left: "md:right-[9vw] md:items-start",
  right: "md:left-[6vw] md:items-start",
  center: "md:left-[6vw] md:items-start",
} as const;

/**
 * Investigation read-out docked opposite the chapter copy. Keeps each chapter
 * feeling like a live investigative console.
 */
export function ChapterPanel({ chapter }: { chapter: Chapter }) {
  const panel = chapter.overlay?.panel;
  const align = chapter.overlay?.align ?? "left";
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setShown(false);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [chapter.id]);

  if (!panel) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-20 hidden w-[17rem] flex-col md:flex",
        align === "center" ? "md:top-[46vh]" : "md:top-[30vh]",
        PANEL_POS[align],
      )}
    >
      <div
        className={cn(
          "rounded-2xl border border-primary/20 bg-background/55 p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-all duration-[900ms] ease-out relative overflow-hidden",
          shown ? "opacity-100 blur-0 translate-y-0" : "translate-y-5 opacity-0 blur-sm",
        )}
        style={{ transitionDelay: "560ms" }}
      >
        {/* Subtle accent border glow line */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[9px] tracking-[0.32em] text-primary font-semibold">
            {panel.title}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] text-muted-foreground/60">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            LIVE TELEMETRY
          </span>
        </div>
        <dl className="flex flex-col gap-2">
          {panel.rows.map(([k, v]) => (
            <div
              key={k}
              className="flex items-baseline justify-between gap-3 border-b border-border/30 pb-1.5 last:border-0 last:pb-0"
            >
              <dt className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground/55">
                {k}
              </dt>
              <dd className="font-mono text-[10px] tracking-[0.06em] text-foreground/85 font-medium">
                {v}
              </dd>
            </div>
          ))}
        </dl>
        {panel.footer ? (
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/60 font-mono">
            // {panel.footer}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const TICKER = [
  "INGEST · ETH · TRON · POLYGON · BTC",
  "WATCHLIST · 12 HITS",
  "ENTITY RESOLUTION · 38 ADDRESSES CLUSTERED",
  "PATH RANKING · 1,000 → 1",
  "EVIDENCE · CHAIN OF CUSTODY SEALED",
  "ATTRIBUTION · 0.92 CONFIDENCE",
];

/** Bottom-edge telemetry strip: constant low-level activity under the story. */
export function StatusTicker() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 hidden h-9 items-center overflow-hidden border-t border-border/30 bg-background/40 backdrop-blur-md md:flex">
      <div className="flex min-w-max animate-[ticker_38s_linear_infinite] items-center gap-10 px-6 font-mono text-[9px] tracking-[0.28em] text-muted-foreground/50">
        {[...TICKER, ...TICKER, ...TICKER].map((t, i) => (
          <span key={`${t}-${i}`} className="flex items-center gap-3">
            <span className="h-1 w-1 rounded-full bg-primary/60" />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Thin neon progress ribbon showing global story travel progress at the top of the viewport.
 */
export function StoryProgressRibbon({ progress }: { progress: number }) {
  return (
    <div className="pointer-events-none fixed top-0 inset-x-0 z-30 h-[2px] bg-border/20">
      <div
        className="h-full bg-gradient-to-r from-primary/60 via-primary to-teal shadow-[0_0_12px_var(--primary)] transition-all duration-150"
        style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
      />
    </div>
  );
}

/**
 * Persistent chapter navigation: tracks live Lenis scroll value.
 */
export function ChapterRail({
  chapter,
  onJump,
}: {
  chapter: Chapter;
  onJump: (at: number) => void;
}) {
  const [activeId, setActiveId] = useState(chapter.id);
  const activeRef = useRef(chapter.id);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const next = chapterAt(story.raw).id;
      if (next !== activeRef.current) {
        activeRef.current = next;
        setActiveId(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const step = (dir: number) => {
      const i = CHAPTERS.findIndex((c) => c.id === activeRef.current);
      const next = CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, i + dir))];
      if (next) onJump(next.at);
    };

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      )
        return;

      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
        case "PageDown":
        case "j":
          e.preventDefault();
          step(1);
          break;
        case "ArrowUp":
        case "ArrowLeft":
        case "PageUp":
        case "k":
          e.preventDefault();
          step(-1);
          break;
        case "Home":
          e.preventDefault();
          onJump(0);
          break;
        case "End":
          e.preventDefault();
          onJump(1);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onJump]);

  return (
    <nav
      aria-label="Chapters"
      className="fixed right-4 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-end gap-3 md:flex"
    >
      {CHAPTERS.map((c) => {
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            onClick={() => onJump(c.at)}
            className="group flex items-center gap-3 text-right focus-visible:outline-none cursor-pointer"
            aria-label={`Go to chapter ${c.label}`}
            aria-current={active ? "true" : undefined}
          >
            <span
              className={cn(
                "font-mono text-[9px] tracking-[0.24em] transition-all duration-500",
                active
                  ? "text-foreground font-semibold opacity-100"
                  : "text-muted-foreground opacity-0 group-hover:opacity-70 group-focus-visible:opacity-70",
              )}
            >
              {c.label}
            </span>
            <span
              className={cn(
                "h-px transition-all duration-500",
                active
                  ? "w-8 bg-primary shadow-[0_0_8px_var(--primary)]"
                  : "w-3 bg-muted-foreground/40 group-hover:w-5 group-focus-visible:w-5",
              )}
            />
          </button>
        );
      })}
    </nav>
  );
}

/** Depth read-out with animated frequency telemetry bars. */
export function DepthHud({ progress }: { progress: number }) {
  const [depth, setDepth] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const tick = () => {
      setDepth(Math.round(story.progress * 680));
      raf.current = window.setTimeout(tick, 80);
    };
    tick();
    return () => window.clearTimeout(raf.current);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-6 left-6 z-30 flex items-end gap-6 font-mono text-[10px] tracking-[0.24em] text-muted-foreground/70 md:bottom-12">
      {/* Visual audio / telemetry activity bars */}
      <div className="hidden sm:flex items-end gap-[3px] h-6 pb-1">
        <span className="w-1 bg-primary/80 rounded-full animate-[pulse_1.2s_ease-in-out_infinite] h-3" />
        <span className="w-1 bg-primary/60 rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.2s] h-5" />
        <span className="w-1 bg-primary/90 rounded-full animate-[pulse_1.4s_ease-in-out_infinite_0.4s] h-4" />
        <span className="w-1 bg-primary/50 rounded-full animate-[pulse_1.0s_ease-in-out_infinite_0.1s] h-2" />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground/40">DEPTH</span>
        <span className="text-foreground/90 font-medium">−{depth} Z</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground/40">PROGRESS</span>
        <span className="text-primary font-medium">
          {String(Math.round(progress * 100)).padStart(3, "0")}%
        </span>
      </div>
      <div className="hidden h-8 w-px bg-border sm:block" />
      <span className="hidden sm:block text-[9px] tracking-[0.2em] text-muted-foreground/50">
        NAV: FLIGHT ONLINE
      </span>
    </div>
  );
}

/** Only entry point out of the experience, revealed at the convergence. */
export function FinalCta({ visible }: { visible: boolean }) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[9vh] z-30 flex flex-col items-center gap-4 transition-all duration-1000 md:bottom-[8vh]",
        visible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none translate-y-6 opacity-0",
      )}
    >
      <p className="max-w-sm px-6 text-center text-sm leading-relaxed text-muted-foreground">
        Bounded tracing, entity attribution and defensible evidence — in one
        investigation workspace.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/auth"
          className="rounded-full bg-primary px-7 py-3 text-sm font-medium text-primary-foreground shadow-[0_0_40px_-8px_var(--primary)] transition-transform hover:scale-[1.03]"
        >
          Enter the platform
        </Link>
        <Link
          to="/auth"
          className="rounded-full border border-border px-7 py-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent/40"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}

/** Top-left brand mark, present the whole flight. */
export function BrandMark() {
  return (
    <div className="fixed left-6 top-6 z-30 flex items-center gap-3">
      <span className="relative flex h-7 w-7 items-center justify-center">
        <span className="absolute inset-0 rounded-[10px] border border-primary/40" />
        <span className="absolute inset-1.5 rounded-[6px] bg-primary/70" />
      </span>
      <span className="font-mono text-xs tracking-[0.34em] text-foreground/90 font-bold">
        TRACIFY
      </span>
    </div>
  );
}

/** Persistent sign-in entry point in the top-right corner. */
export function TopRightAuth() {
  return (
    <Link
      to="/auth"
      className="fixed right-6 top-6 z-30 rounded-full border border-border/60 bg-background/60 px-4 py-2 text-xs font-medium text-foreground/90 shadow-lg backdrop-blur-md transition-all hover:border-primary/40 hover:bg-background/80 hover:text-primary"
    >
      Sign in
    </Link>
  );
}

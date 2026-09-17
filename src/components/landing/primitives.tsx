import { useRef, useState } from "react";
import { motion, useInView, useReducedMotion, type Variants } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Line mask reveal. The clipping wrapper owns the in-view trigger: an
 * observer on the line itself never fires, because the line starts
 * translated outside its parent's clip rect.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-8% 0px" });
  const reduced = useReducedMotion();
  const hidden = reduced ? { opacity: 0 } : { y: "110%", opacity: 0 };

  return (
    <span ref={ref} className={cn("block overflow-hidden", className)}>
      <motion.span
        className="block"
        initial={hidden}
        animate={inView ? { y: 0, opacity: 1 } : hidden}
        transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.span>
    </span>
  );
}



const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

/** Soft entrance for supporting copy and technical blocks. */
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Chapter marker: 01 / THE PROBLEM */
export function ChapterLabel({
  index,
  label,
}: {
  index: string;
  label: string;
}) {
  return (
    <FadeIn className="flex items-center gap-3">
      <span className="lp-meta text-lp-accent">{index}</span>
      <span className="h-px w-10 bg-lp-line-strong" />
      <span className="lp-meta">{label}</span>
    </FadeIn>
  );
}

/**
 * Magnetic CTA. The label tracks the cursor slightly and a light source
 * follows the pointer across the surface.
 */
export function MagneticButton({
  children,
  onClick,
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const [t, setT] = useState({ x: 0, y: 0, lx: 50, ly: 50 });

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      onPointerMove={(e) => {
        if (reduced) return;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        setT({
          x: (px - 0.5) * 12,
          y: (py - 0.5) * 8,
          lx: px * 100,
          ly: py * 100,
        });
      }}
      onPointerLeave={() => setT({ x: 0, y: 0, lx: 50, ly: 50 })}
      animate={{ x: t.x, y: t.y }}
      transition={{ type: "spring", stiffness: 200, damping: 18, mass: 0.4 }}
      className={cn(
        "group relative inline-flex h-12 items-center gap-2.5 overflow-hidden px-6 text-[13px] font-medium tracking-[0.06em] uppercase transition-colors",
        variant === "primary"
          ? "text-lp-bg"
          : "border border-lp-line-strong text-lp-text-2 hover:text-lp-text",
        className,
      )}
      style={{
        background:
          variant === "primary"
            ? "linear-gradient(100deg,#F4F7FB,#C9D6FF)"
            : "transparent",
      }}
    >
      {variant === "primary" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(120px circle at ${t.lx}% ${t.ly}%, rgba(110,140,255,0.55), transparent 70%)`,
          }}
        />
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(160px circle at ${t.lx}% ${t.ly}%, rgba(110,140,255,0.16), transparent 70%)`,
          }}
        />
      )}
      <span className="relative z-10 flex items-center gap-2.5">{children}</span>
    </motion.button>
  );
}

/** Technical key/value row used across the narrative sections. */
export function MetaRow({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "signal" | "critical" | "verified" | "warning";
}) {
  const toneClass = tone
    ? {
        signal: "text-lp-signal",
        critical: "text-lp-critical",
        verified: "text-lp-verified",
        warning: "text-lp-warning",
      }[tone]
    : "text-lp-text";
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 lp-rule">
      <span className="lp-meta">{k}</span>
      <span className={cn("mono text-[12px]", toneClass)}>{v}</span>
    </div>
  );
}

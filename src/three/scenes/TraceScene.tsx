/**
 * CHAPTER 03 — FOLLOWING THE MONEY.
 *
 * The camera flies along a bounded multi-hop path. Each hop is a real wallet
 * object with attached metadata; the pulse riding the curve is value moving.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { PAL } from "../materials/palette";
import { BlockchainNode } from "../objects/BlockchainNode";
import { DataFragment } from "../objects/DataFragments";
import { TransactionPath, useCurve } from "../objects/TransactionPath";
import { ramp } from "../utils/animationUtils";
import { story } from "../utils/storyState";
import { DEPTH, type Vec3 } from "../utils/storyConfig";

const FROM = DEPTH.traceFrom;
const TO = DEPTH.traceTo;
const span = (t: number) => FROM + (TO - FROM) * t;

const HOPS: { p: Vec3; label: string; value: string }[] = [
  { p: [-15, 4, span(0)], label: "VICTIM", value: "-412,900 USDT" },
  { p: [-7, -3, span(0.2)], label: "HOP 1", value: "412,900" },
  { p: [3, 5, span(0.4)], label: "HOP 2", value: "206,450 · split" },
  { p: [11, -2, span(0.6)], label: "HOP 3", value: "198,010" },
  { p: [19, 6, span(0.8)], label: "HOP 4", value: "191,220" },
  { p: [26, -1, span(1)], label: "CASH-OUT", value: "189,400" },
];

const BRANCH: Vec3[] = [
  [3, 5, span(0.4)],
  [8, 15, span(0.55)],
  [17, 19, span(0.75)],
];

export function TraceScene() {
  const curve = useCurve(useMemo(() => HOPS.map((h) => h.p), []));
  const branch = useCurve(BRANCH);
  const group = useRef<THREE.Group>(null);
  const reveal = useRef(0);
  const branchReveal = useRef(0);

  useFrame(() => {
    const p = story.progress;
    reveal.current = ramp(p, 0.33, 0.52);
    branchReveal.current = ramp(p, 0.42, 0.55) * 0.85;
    if (group.current) group.current.visible = p > 0.26 && p < 0.66;
  });

  return (
    <group ref={group}>
      <TransactionPath curve={curve} revealRef={reveal} pulses={4} />
      <TransactionPath
        curve={branch}
        revealRef={branchReveal}
        color={PAL.amber}
        pulses={1}
        speed={0.1}
      />

      {HOPS.map((h, i) => (
        <group key={h.label}>
          <BlockchainNode
            position={h.p}
            radius={i === 0 ? 2 : i === HOPS.length - 1 ? 2.2 : 1.3}
            color={
              i === 0
                ? PAL.critical
                : i === HOPS.length - 1
                  ? PAL.verified
                  : PAL.signal
            }
          />
          <DataFragment
            position={[h.p[0], h.p[1] + 3.4, h.p[2]]}
            label={h.label}
            size={0.72}
            color={PAL.signal}
            near={30}
            far={70}
          />
          <DataFragment
            position={[h.p[0], h.p[1] - 3.2, h.p[2]]}
            label={h.value}
            size={0.56}
            color={PAL.grey}
            near={24}
            far={58}
          />
        </group>
      ))}

      <DataFragment
        position={[17, 22, span(0.75)]}
        label="BRIDGE · CONTINUITY BREAK"
        size={0.6}
        color={PAL.amber}
        near={40}
        far={90}
      />
    </group>
  );
}

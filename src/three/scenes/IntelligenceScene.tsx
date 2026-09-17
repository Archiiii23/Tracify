/**
 * CHAPTER 08 — INTELLIGENCE (the filtering).
 *
 * A thousand nodes are shown, then progressively dismissed until a single
 * critical path remains. Nothing pops out of existence: irrelevant nodes dim
 * and sink away, so the viewer feels judgement being applied to data.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { PAL } from "../materials/palette";
import { WorldNumber } from "../objects/DataFragments";
import { clamp01, ramp, rng } from "../utils/animationUtils";
import { story } from "../utils/storyState";
import { DEPTH, FILTER_STEPS } from "../utils/storyConfig";

const Z = DEPTH.filtering;

export function IntelligenceScene({ lite }: { lite: boolean }) {
  const count = lite ? 420 : 1000;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  // One ref per counter; written in the frame loop, read by WorldNumber.
  const counters = useRef<number[]>(FILTER_STEPS.map(() => 0));
  const counterRefs = useMemo(
    () =>
      FILTER_STEPS.map((_, i) => ({
        get current() {
          return counters.current[i] ?? 0;
        },
        set current(v: number) {
          counters.current[i] = v;
        },
      })),
    [],
  );

  const data = useMemo(() => {
    const rand = rng(777001);
    const pos: THREE.Vector3[] = [];
    const rank: number[] = [];
    const color = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = 4 + Math.sqrt(rand()) * 44;
      pos.push(
        new THREE.Vector3(
          Math.cos(a) * r,
          Math.sin(a) * r * 0.6,
          Z + (rand() - 0.5) * 40,
        ),
      );
      // Relevance rank: low = critical path, high = irrelevant noise.
      rank.push(rand());
      color[i * 3] = PAL.grey.r;
      color[i * 3 + 1] = PAL.grey.g;
      color[i * 3 + 2] = PAL.grey.b;
    }
    return { pos, rank, color };
  }, [count]);

  useFrame((state) => {
    const p = story.progress;
    const t = state.clock.elapsedTime;
    const alive = ramp(p, 0.82, 0.86) * (1 - ramp(p, 0.92, 0.95));
    // Survival threshold walks from 1 (all shown) to ~0.015 (one path left).
    const cut = 1 - ramp(p, 0.845, 0.915) * 0.985;

    FILTER_STEPS.forEach((s, i) => {
      counters.current[i] = Math.min(
        ramp(p, s.at - 0.014, s.at),
        1 - ramp(p, s.at + 0.012, s.at + 0.028),
      );
    });

    const m = mesh.current;
    if (!m) return;
    m.visible = alive > 0.02;
    if (!m.visible) return;

    const colorAttr = m.instanceColor;
    for (let i = 0; i < count; i++) {
      const keep = clamp01((cut - data.rank[i]!) * 14 + 0.5);
      const base = data.pos[i]!;
      dummy.position.set(base.x, base.y - (1 - keep) * 26, base.z);
      dummy.rotation.set(t * 0.08 + i, t * 0.06, 0);
      dummy.scale.setScalar((0.28 + 0.9 * keep) * alive);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (colorAttr) {
        const c = keep > 0.85 ? PAL.critical : keep > 0.5 ? PAL.amber : PAL.grey;
        const b = 0.25 + 0.75 * keep;
        colorAttr.setXYZ(i, c.r * b, c.g * b, c.b * b);
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (colorAttr) colorAttr.needsUpdate = true;
    (m.material as THREE.MeshBasicMaterial).opacity = alive;
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
        <octahedronGeometry args={[0.6, 0]} />
        <meshBasicMaterial transparent opacity={1} toneMapped={false} />
        <instancedBufferAttribute attach="instanceColor" args={[data.color, 3]} />
      </instancedMesh>

      {FILTER_STEPS.map((s, i) => (
        <WorldNumber
          key={s.caption}
          position={[0, 0, Z + 18]}
          value={s.value}
          caption={s.caption}
          opacityRef={counterRefs[i]!}
          size={16}
        />
      ))}
    </group>
  );
}

/**
 * CHAPTER 01 — THE DATA EXPLOSION.
 *
 * The camera travels through an enormous transfer field built from three real
 * depth layers (distant clusters, mid-range connected transactions, close data
 * objects). Everything is one InstancedMesh plus one LineSegments batch, so the
 * density costs two draw calls.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { PAL } from "../materials/palette";
import { rng, ramp } from "../utils/animationUtils";
import { story } from "../utils/storyState";
import { DATA_FRAGMENTS } from "../utils/storyConfig";
import { DataFragment } from "../objects/DataFragments";

export function DataUniverse({ lite }: { lite: boolean }) {
  const count = lite ? 700 : 2200;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const lines = useRef<THREE.LineSegments>(null);

  const data = useMemo(() => {
    const rand = rng(90210);
    const pos: THREE.Vector3[] = [];
    const scale: number[] = [];
    const color = new Float32Array(count * 3);
    const drift: number[] = [];

    for (let i = 0; i < count; i++) {
      // Layer split: 40% distant, 40% mid, 20% close-in data objects.
      const layer = rand();
      let spread: number;
      let depth: number;
      let s: number;
      if (layer < 0.4) {
        spread = 240;
        depth = -60 - rand() * 200;
        s = 0.5 + rand() * 0.6;
      } else if (layer < 0.8) {
        spread = 110;
        depth = 10 - rand() * 190;
        s = 0.3 + rand() * 0.5;
      } else {
        spread = 42;
        depth = 20 - rand() * 200;
        s = 0.6 + rand() * 1.1;
      }
      pos.push(
        new THREE.Vector3(
          (rand() - 0.5) * spread,
          (rand() - 0.5) * spread * 0.55,
          depth,
        ),
      );
      scale.push(s);
      drift.push(rand() * Math.PI * 2);
      const roll = rand();
      const c =
        roll > 0.985
          ? PAL.critical
          : roll > 0.96
            ? PAL.amber
            : roll > 0.9
              ? PAL.accent
              : roll > 0.7
                ? PAL.grey
                : PAL.dim;
      color[i * 3] = c.r;
      color[i * 3 + 1] = c.g;
      color[i * 3 + 2] = c.b;
    }

    // Sparse nearest-neighbour edges so the field reads as a lattice.
    const pairs: [number, number][] = [];
    for (let i = 0; i < count; i += 2) {
      let best = -1;
      let bestD = Infinity;
      for (let k = 0; k < 10; k++) {
        const j = Math.floor(rand() * count);
        if (j === i) continue;
        const d = pos[i]!.distanceToSquared(pos[j]!);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (best >= 0 && bestD < 340) pairs.push([i, best]);
    }
    return { pos, scale, color, drift, pairs };
  }, [count]);

  const lineGeom = useMemo(() => {
    const arr = new Float32Array(data.pairs.length * 6);
    data.pairs.forEach(([i, j], e) => {
      const a = data.pos[i]!;
      const b = data.pos[j]!;
      arr.set([a.x, a.y, a.z, b.x, b.y, b.z], e * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [data]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state, delta) => {
    const p = story.progress;
    const t = state.clock.elapsedTime;
    // Field is born as the camera enters and quiets down once the signal is found.
    const alive = ramp(p, 0.03, 0.2) * (1 - 0.85 * ramp(p, 0.3, 0.46));

    const m = mesh.current;
    if (m) {
      m.visible = alive > 0.02;
      if (m.visible) {
        for (let i = 0; i < count; i++) {
          const base = data.pos[i]!;
          const d = data.drift[i]!;
          dummy.position.set(
            base.x + Math.sin(t * 0.18 + d) * 0.7,
            base.y + Math.cos(t * 0.15 + d) * 0.7,
            base.z,
          );
          dummy.rotation.set(t * 0.05 + d, t * 0.07 + d, 0);
          dummy.scale.setScalar(data.scale[i]! * (0.4 + 0.6 * alive));
          dummy.updateMatrix();
          m.setMatrixAt(i, dummy.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
        (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * alive;
      }
    }
    if (lines.current) {
      lines.current.visible = alive > 0.02;
      (lines.current.material as THREE.LineBasicMaterial).opacity = 0.075 * alive;
    }
    void delta;
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshBasicMaterial
          vertexColors={false}
          transparent
          opacity={0.9}
          toneMapped={false}
        />
        <instancedBufferAttribute
          attach="instanceColor"
          args={[data.color, 3]}
        />
      </instancedMesh>

      <lineSegments ref={lines} geometry={lineGeom}>
        <lineBasicMaterial
          color={PAL.accent}
          transparent
          opacity={0.07}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      {/* Metadata that only resolves when the camera passes close by. */}
      {DATA_FRAGMENTS.map((label, i) => {
        const rand = rng(1200 + i * 37);
        return (
          <DataFragment
            key={label + i}
            label={label}
            position={[
              (rand() - 0.5) * 46,
              (rand() - 0.5) * 24,
              10 - i * 15 - rand() * 8,
            ]}
            size={0.9}
            color={i % 5 === 0 ? PAL.amber : PAL.grey}
          />
        );
      })}
    </group>
  );
}

/**
 * CHAPTER 02 — THE SIGNAL.
 *
 * The chaotic field is still there, but one node activates. A controlled pulse
 * jumps node to node while everything else falls dark: the moment the platform
 * finds the relevant path inside overwhelming complexity.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { PAL } from "../materials/palette";
import { BlockchainNode } from "../objects/BlockchainNode";
import { DataFragment } from "../objects/DataFragments";
import { clamp01, ramp, rng } from "../utils/animationUtils";
import { story } from "../utils/storyState";
import { DEPTH, type Vec3 } from "../utils/storyConfig";

const Z = DEPTH.signal;

const CHAIN: Vec3[] = [
  [-2, 0, Z],
  [-9, 3.5, Z - 8],
  [3.5, -4, Z - 14],
  [10, 2.5, Z - 20],
];

export function SignalScene({ lite }: { lite: boolean }) {
  const dormant = useMemo(() => {
    const rand = rng(5150);
    const n = lite ? 90 : 220;
    return Array.from({ length: n }, () => ({
      p: [
        (rand() - 0.5) * 90,
        (rand() - 0.5) * 46,
        Z + 26 - rand() * 70,
      ] as Vec3,
      s: 0.3 + rand() * 0.5,
    }));
  }, [lite]);

  const dormantMesh = useRef<THREE.InstancedMesh>(null);
  const nodes = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const p = story.progress;
    const t = state.clock.elapsedTime;
    const active = ramp(p, 0.24, 0.32) * (1 - ramp(p, 0.44, 0.52));

    if (dormantMesh.current) {
      const m = dormantMesh.current;
      m.visible = active > 0.02;
      if (m.visible) {
        dormant.forEach((d, i) => {
          dummy.position.set(
            d.p[0] + Math.sin(t * 0.2 + i) * 0.5,
            d.p[1] + Math.cos(t * 0.17 + i) * 0.5,
            d.p[2],
          );
          dummy.scale.setScalar(d.s);
          dummy.updateMatrix();
          m.setMatrixAt(i, dummy.matrix);
        });
        m.instanceMatrix.needsUpdate = true;
        // Everything unrelated dims as the signal is isolated.
        (m.material as THREE.MeshBasicMaterial).opacity =
          active * (0.5 - 0.4 * ramp(p, 0.3, 0.4));
      }
    }

    if (nodes.current) {
      nodes.current.visible = active > 0.02;
      nodes.current.children.forEach((child, i) => {
        // Chained activation: each hop lights only after the previous one.
        const reach = clamp01((ramp(p, 0.28, 0.4) * CHAIN.length - i) * 1.4);
        child.scale.setScalar(0.7 + 0.3 * reach);
        child.visible = reach > 0.01 || i === 0;
        void t;
      });
    }
  });

  return (
    <group>
      <instancedMesh ref={dormantMesh} args={[undefined, undefined, dormant.length]}>
        <octahedronGeometry args={[0.45, 0]} />
        <meshBasicMaterial color={PAL.dim} transparent opacity={0.4} />
      </instancedMesh>

      <group ref={nodes}>
        {CHAIN.map((p, i) => (
          <group key={i}>
            <BlockchainNode
              position={p}
              radius={i === 0 ? 2.2 : 1.4}
              color={i === 0 ? PAL.critical : PAL.signal}
              activity={1}
            />
          </group>
        ))}
      </group>

      <DataFragment
        position={[-2, 4.4, Z]}
        label="0x8F29…C12"
        color={PAL.critical}
        size={1}
        near={40}
        far={95}
      />
      <DataFragment
        position={[-2, 2.6, Z]}
        label="ANOMALOUS OUTFLOW"
        color={PAL.amber}
        size={0.65}
        near={34}
        far={80}
      />
    </group>
  );
}

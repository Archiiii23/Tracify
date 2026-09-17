/**
 * CHAPTER 06 — CONTEXT, and CHAPTER 07 — THE VASP CONNECTION.
 *
 * Context is literal: intelligence layers are stacked planes in space and the
 * camera flies *through* them, one after another. It ends at a regulated
 * service — a large architectural structure the traced flow terminates in.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { PAL } from "../materials/palette";
import { DataFragment } from "../objects/DataFragments";
import { TransactionPath, useCurve } from "../objects/TransactionPath";
import { ramp } from "../utils/animationUtils";
import { story } from "../utils/storyState";
import { DEPTH, type Vec3 } from "../utils/storyConfig";

const LAYERS: { z: number; label: string; color: THREE.Color }[] = [
  { z: DEPTH.context + 22, label: "RAW TRANSFERS", color: PAL.grey },
  { z: DEPTH.context + 8, label: "BEHAVIOURAL PATTERN", color: PAL.accent },
  { z: DEPTH.context - 6, label: "ENTITY RELATIONSHIPS", color: PAL.violet },
  { z: DEPTH.context - 20, label: "RISK SIGNALS", color: PAL.amber },
  { z: DEPTH.context - 34, label: "ATTRIBUTION", color: PAL.verified },
];

const APPROACH: Vec3[] = [
  [0, 0, DEPTH.context - 40],
  [4, -2, DEPTH.vasp + 34],
  [1, 1, DEPTH.vasp + 12],
  [0, 0, DEPTH.vasp],
];

export function ContextScene() {
  const layers = useRef<THREE.Group>(null);
  const vasp = useRef<THREE.Group>(null);
  const reveal = useRef(0);

  useFrame((state, delta) => {
    const p = story.progress;
    const t = state.clock.elapsedTime;
    reveal.current = ramp(p, 0.74, 0.83);

    if (layers.current) {
      const alive = ramp(p, 0.66, 0.71) * (1 - ramp(p, 0.82, 0.88));
      layers.current.visible = alive > 0.02;
      layers.current.children.forEach((child, i) => {
        child.rotation.z = Math.sin(t * 0.1 + i) * 0.04;
        child.children.forEach((c) => {
          const mat = (c as THREE.Mesh).material as THREE.Material | undefined;
          if (mat && "opacity" in mat) {
            mat.transparent = true;
            (mat as THREE.MeshBasicMaterial).opacity =
              alive * (0.028 + 0.02 * Math.sin(t * 0.5 + i));
          }
        });
      });
    }

    if (vasp.current) {
      const alive = ramp(p, 0.72, 0.78) * (1 - ramp(p, 0.9, 0.95));
      vasp.current.visible = alive > 0.02;
      vasp.current.rotation.y += delta * 0.05;
      vasp.current.children.forEach((child, i) => {
        const mat = (child as THREE.Mesh).material as
          | THREE.MeshBasicMaterial
          | undefined;
        if (mat) mat.opacity = alive * (0.14 + 0.06 * ((i % 3) / 3));
      });
    }
  });

  return (
    <group>
      <group ref={layers}>
        {LAYERS.map((l, i) => (
          <group key={l.label} position={[0, 0, l.z]}>
            <mesh>
              <planeGeometry args={[86, 48, 8, 5]} />
              <meshBasicMaterial
                color={l.color}
                wireframe
                transparent
                opacity={0.05}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <DataFragment
              position={[-34, 22 - i * 2, 0.4]}
              label={l.label}
              size={1}
              color={l.color}
              near={30}
              far={70}
              plane={false}
            />
          </group>
        ))}
      </group>

      <TransactionPath curve={useCurve(APPROACH)} revealRef={reveal} pulses={2} />

      {/* Regulated service: an architectural structure, not a logo. */}
      <group ref={vasp} position={[0, 0, DEPTH.vasp]}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[0, (i - 3) * 4.4, 0]}>
            <cylinderGeometry args={[16 - Math.abs(i - 3) * 1.8, 16 - Math.abs(i - 3) * 1.8, 0.6, 6, 1, true]} />
            <meshBasicMaterial
              color={i === 3 ? PAL.verified : PAL.signal}
              wireframe
              transparent
              opacity={0.18}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>

      <DataFragment
        position={[0, 20, DEPTH.vasp]}
        label="REGULATED SERVICE · DEPOSIT ADDRESS"
        size={1.1}
        color={PAL.verified}
        near={44}
        far={100}
      />
      <DataFragment
        position={[0, -20, DEPTH.vasp]}
        label="ATTRIBUTION CONFIDENCE 0.92"
        size={0.8}
        color={PAL.grey}
        near={40}
        far={92}
      />
    </group>
  );
}

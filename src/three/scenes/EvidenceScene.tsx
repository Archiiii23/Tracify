/**
 * CHAPTER 09 — EVIDENCE.
 *
 * The trace becomes a case: findings assemble into physical, stacked evidence
 * slabs the camera passes between. Solid, still, slightly heavy — the visual
 * opposite of the chaotic data field.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { PAL } from "../materials/palette";
import { DataFragment } from "../objects/DataFragments";
import { lerp, ramp } from "../utils/animationUtils";
import { story } from "../utils/storyState";
import { DEPTH } from "../utils/storyConfig";

const Z = DEPTH.evidence;

const SLABS: { x: number; y: number; z: number; label: string }[] = [
  { x: -13, y: 4, z: Z + 16, label: "FLOW RECONSTRUCTION" },
  { x: 13, y: -3, z: Z + 4, label: "ENTITY ATTRIBUTION" },
  { x: -12, y: -5, z: Z - 10, label: "RISK JUSTIFICATION" },
  { x: 12, y: 5, z: Z - 22, label: "TIMELINE OF EVENTS" },
  { x: 0, y: 0, z: Z - 34, label: "EXPORTABLE CASE FILE" },
];

export function EvidenceScene() {
  const group = useRef<THREE.Group>(null);
  const labels = useRef<THREE.Group>(null);

  useFrame((state) => {
    const p = story.progress;
    const t = state.clock.elapsedTime;
    // Clears out before the convergence so nothing overlaps the final mark.
    const alive = ramp(p, 0.9, 0.94) * (1 - ramp(p, 0.945, 0.962));
    // Labels clear the frame before the convergence so nothing overlaps the mark.
    if (labels.current) labels.current.visible = p > 0.885 && p < 0.945;
    const g = group.current;
    if (!g) return;
    g.visible = alive > 0.02;
    if (!g.visible) return;
    g.children.forEach((child, i) => {
      // Slabs assemble into place rather than fading in.
      const settle = ramp(p, 0.9 + i * 0.006, 0.945 + i * 0.006);
      const s = SLABS[i]!;
      child.position.set(
        lerp(s.x * 2.6, s.x, settle),
        lerp(s.y * 2.6, s.y, settle) + Math.sin(t * 0.4 + i) * 0.25,
        s.z,
      );
      child.rotation.y = lerp(0.9, Math.sin(t * 0.12 + i) * 0.06, settle);
      child.children.forEach((c) => {
        const mat = (c as THREE.Mesh).material as
          | THREE.MeshBasicMaterial
          | undefined;
        if (mat && mat.opacity !== undefined) {
          mat.transparent = true;
          mat.opacity = settle * alive * (mat.wireframe ? 0.3 : 0.1);
        }
      });
    });
  });

  return (
    <group>
      <group ref={group}>
        {SLABS.map((s) => (
          <group key={s.label}>
            <mesh>
              <boxGeometry args={[13, 7.6, 0.5]} />
              <meshBasicMaterial
                color={PAL.accent}
                transparent
                opacity={0.1}
                depthWrite={false}
              />
            </mesh>
            <mesh>
              <boxGeometry args={[13, 7.6, 0.5]} />
              <meshBasicMaterial
                color={PAL.signal}
                wireframe
                transparent
                opacity={0.3}
              />
            </mesh>
          </group>
        ))}
      </group>

      <group ref={labels}>
      {SLABS.filter((s) => s.label !== "EXPORTABLE CASE FILE").map((s) => (
        <DataFragment
          key={s.label}
          position={[s.x, s.y, s.z + 0.6]}
          label={s.label}
          size={0.62}
          color={PAL.light}
          near={26}
          far={54}
          plane={false}
        />
      ))}
      </group>
    </group>
  );
}

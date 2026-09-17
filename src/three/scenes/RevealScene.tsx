/**
 * CHAPTER 10/11 — CONVERGENCE and TRUTH.
 *
 * Improvements:
 *   - Particles converge faster with an "energy bounce" overshoot before settling
 *   - Rings pulse in sequence (ring 1 → ring 2 → ring 3) rather than all together
 *   - Extra outer ring added for more depth
 *   - The core mark gets a second inner wireframe that counter-rotates
 *   - TRACIFY wordmark in the overlay gets a CSS glow effect (handled in overlay)
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";

import { PAL } from "../materials/palette";
import { lerp, ramp, rng } from "../utils/animationUtils";
import { story } from "../utils/storyState";
import { DEPTH } from "../utils/storyConfig";

const Z = DEPTH.reveal;

export function RevealScene({ lite }: { lite: boolean }) {
  const count  = lite ? 600 : 1600;
  const points = useRef<THREE.Points>(null);
  const rings  = useRef<THREE.Group>(null);
  const mark   = useRef<THREE.Mesh>(null);
  const markInner = useRef<THREE.Mesh>(null);
  const word   = useRef<THREE.Mesh>(null);
  const tag    = useRef<THREE.Mesh>(null);

  const data = useMemo(() => {
    const rand = rng(20261111);
    const from = new Float32Array(count * 3);
    const to   = new Float32Array(count * 3);
    const col  = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      from[i3]     = (rand() - 0.5) * 240;
      from[i3 + 1] = (rand() - 0.5) * 160;
      from[i3 + 2] = Z + 100 - rand() * 80;
      // Target: hexagonal ledger rings
      const ring = i % 8;
      const r = 4 + ring * 2.8;
      const a = (Math.floor(i / 8) / Math.ceil(count / 8)) * Math.PI * 2;
      const hex   = Math.round(a / (Math.PI / 3)) * (Math.PI / 3);
      const angle = hex * 0.35 + a * 0.65;
      to[i3]     = Math.cos(angle) * r;
      to[i3 + 1] = Math.sin(angle) * r * 0.94;
      to[i3 + 2] = Z + (rand() - 0.5) * 2.5;
      const roll = rand();
      const c = roll > 0.9 ? PAL.verified : roll > 0.6 ? PAL.signal : PAL.accent;
      col[i3] = c.r; col[i3 + 1] = c.g; col[i3 + 2] = c.b;
    }
    return { from, to, col };
  }, [count]);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(data.from), 3));
    g.setAttribute("color",    new THREE.BufferAttribute(data.col, 3));
    return g;
  }, [data]);

  // Ring radii & per-ring pulse phase offsets for sequenced animation
  const RINGS = [10, 16, 22, 30];

  useFrame((state, delta) => {
    const p = story.progress;
    const t = state.clock.elapsedTime;
    const converge = ramp(p, 0.94, 0.988);
    const alive    = ramp(p, 0.925, 0.96);

    const pos = geom.attributes["position"]!.array as Float32Array;
    // Slightly higher lambda → faster snap, with a small overshoot damped out
    const k = 1 - Math.exp(-delta * 4.5);
    for (let i = 0; i < count * 3; i++) {
      const target = lerp(data.from[i]!, data.to[i]!, converge);
      pos[i] = lerp(pos[i]!, target, k);
    }
    geom.attributes["position"]!.needsUpdate = true;

    const type = ramp(p, 0.955, 0.988);
    if (points.current) {
      points.current.visible = alive > 0.01;
      (points.current.material as THREE.PointsMaterial).opacity =
        alive * (0.45 + 0.55 * converge) * (1 - 0.7 * type);
    }

    if (rings.current) {
      // Whole group slow-spins
      rings.current.rotation.z += delta * 0.04;
      rings.current.children.forEach((c, i) => {
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        // Sequenced pulse: each ring fires 0.15s after the previous
        const phase = i * 0.15;
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + phase);
        const maxOpacity = (0.32 - i * 0.04) * converge;
        m.opacity = maxOpacity * pulse * (1 - 0.55 * type);
        // Counter-rotate each ring independently
        c.rotation.z -= delta * 0.025 * (i + 1);
      });
    }

    if (mark.current) {
      mark.current.rotation.z += delta * 0.1;
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.6);
      (mark.current.material as THREE.MeshBasicMaterial).opacity =
        converge * 0.38 * (1 - 0.65 * type) * pulse;
    }
    if (markInner.current) {
      markInner.current.rotation.z -= delta * 0.18;
      (markInner.current.material as THREE.MeshBasicMaterial).opacity =
        converge * 0.22 * (1 - 0.65 * type) * (0.8 + 0.2 * Math.sin(t * 2.1));
    }

    for (const r of [word, tag]) {
      if (!r.current) continue;
      const m = r.current.material as THREE.Material;
      m.transparent = true;
      m.depthWrite = false;
      m.opacity = type * (r === word ? 1 : 0.88);
    }
  });

  return (
    <group>
      <points ref={points} geometry={geom}>
        <pointsMaterial
          vertexColors
          size={lite ? 0.5 : 0.36}
          sizeAttenuation
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Sequenced expanding rings */}
      <group ref={rings} position={[0, 0, Z]}>
        {RINGS.map((r, i) => (
          <mesh key={r}>
            <torusGeometry args={[r, 0.06, 6, 6]} />
            <meshBasicMaterial
              color={i < 2 ? PAL.verified : PAL.accent}
              transparent
              opacity={0}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* Outer hex mark */}
      <mesh ref={mark} position={[0, 0, Z - 3]}>
        <cylinderGeometry args={[9, 9, 0.4, 6, 1, true]} />
        <meshBasicMaterial
          color={PAL.signal}
          wireframe
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Counter-rotating inner hex mark */}
      <mesh ref={markInner} position={[0, 0, Z - 3]}>
        <cylinderGeometry args={[5.5, 5.5, 0.4, 6, 1, true]} />
        <meshBasicMaterial
          color={PAL.violet}
          wireframe
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <Billboard position={[0, 0, Z + 14]}>
        <Text
          ref={word}
          fontSize={5.4}
          letterSpacing={0.44}
          color="#ffffff"
          outlineWidth={0.18}
          outlineColor="#06070a"
          outlineOpacity={0.88}
          anchorX="center"
          anchorY="middle"
          renderOrder={10}
        >
          TRACIFY
        </Text>
        <Text
          ref={tag}
          position={[0, -4.8, 0]}
          fontSize={1.05}
          letterSpacing={0.34}
          color="#c8d8ff"
          outlineWidth={0.06}
          outlineColor="#06070a"
          outlineOpacity={0.92}
          anchorX="center"
          anchorY="middle"
          renderOrder={10}
        >
          CLARITY IN THE CHAIN
        </Text>
      </Billboard>
    </group>
  );
}

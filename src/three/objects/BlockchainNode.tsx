/**
 * A wallet / transaction node with real physical presence.
 *
 * Layers (outside-in):
 *   1. Outer orbit ring A (slow, primary axis)
 *   2. Outer orbit ring B (medium speed, secondary axis — electron-orbit feel)
 *   3. Icosahedron wireframe hull
 *   4. Semi-transparent engineered metallic shell
 *   5. Inner emissive glow sphere
 *   6. Solid emissive core (icosahedron)
 *
 * All opacity / scale driven per-frame via refs — no React re-renders.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { PAL } from "../materials/palette";
import type { Vec3 } from "../utils/storyConfig";

export interface NodeProps {
  position: Vec3;
  radius?: number;
  color?: THREE.Color;
  /** 0 → dormant, 1 → fully active. Driven per-frame by the scenes. */
  activity?: number;
  rings?: boolean;
  spin?: number;
}

export function BlockchainNode({
  position,
  radius = 1,
  color = PAL.accent,
  activity = 1,
  rings = true,
  spin = 0.25,
}: NodeProps) {
  const core    = useRef<THREE.Mesh>(null);
  const glow    = useRef<THREE.Mesh>(null);
  const shell   = useRef<THREE.Mesh>(null);
  const wire    = useRef<THREE.Mesh>(null);
  const ringA   = useRef<THREE.Mesh>(null);
  const ringB   = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    // Heartbeat: subtle breathing on a non-integer frequency so nearby nodes
    // drift out of phase with each other.
    const beat = 0.82 + 0.18 * Math.sin(t * 2.1 + position[2] * 0.04);
    const beatFast = 0.88 + 0.12 * Math.sin(t * 3.7 + position[2] * 0.07);

    if (core.current) {
      core.current.scale.setScalar(radius * 0.32 * beat);
      (core.current.material as THREE.MeshBasicMaterial).opacity =
        activity * (0.9 + 0.1 * beat);
    }

    if (glow.current) {
      // Inner emissive glow — slightly larger than core, very transparent, additive
      glow.current.scale.setScalar(radius * 0.72 * beatFast);
      (glow.current.material as THREE.MeshBasicMaterial).opacity =
        0.18 * activity * beatFast;
    }

    if (shell.current) {
      shell.current.rotation.y += delta * spin;
      shell.current.rotation.x += delta * spin * 0.38;
      (shell.current.material as THREE.MeshStandardMaterial).opacity =
        0.12 + 0.24 * activity * beat;
    }

    if (wire.current) {
      wire.current.rotation.y -= delta * spin * 0.55;
      wire.current.rotation.z += delta * spin * 0.22;
      (wire.current.material as THREE.MeshBasicMaterial).opacity =
        (0.16 + 0.12 * beat) * activity;
    }

    if (rings) {
      if (ringA.current) {
        ringA.current.rotation.z += delta * 0.55 * activity;
        (ringA.current.material as THREE.MeshBasicMaterial).opacity =
          0.42 * activity * (0.8 + 0.2 * beat);
      }
      if (ringB.current) {
        // Second ring on a tilted axis — electron-orbit feel
        ringB.current.rotation.x += delta * 0.38 * activity;
        (ringB.current.material as THREE.MeshBasicMaterial).opacity =
          0.28 * activity * (0.7 + 0.3 * beatFast);
      }
    }
  });

  return (
    <group position={position}>
      {/* Solid emissive core */}
      <mesh ref={core}>
        <icosahedronGeometry args={[1, 2]} />
        <meshBasicMaterial
          color={color}
          transparent
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Inner additive glow blob */}
      <mesh ref={glow}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.18}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Metallic engineered shell */}
      <mesh ref={shell} scale={radius}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial
          color={color}
          metalness={0.9}
          roughness={0.25}
          transparent
          opacity={0.22}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Counter-rotating wireframe hull */}
      <mesh ref={wire} scale={radius * 1.04}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>

      {rings ? (
        <>
          {/* Primary equatorial ring */}
          <mesh ref={ringA} scale={radius}>
            <torusGeometry args={[1.55, 0.014, 8, 64]} />
            <meshBasicMaterial
              color={color}
              transparent
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* Secondary tilted orbit ring */}
          <mesh
            ref={ringB}
            scale={radius}
            rotation={[Math.PI / 3, 0, Math.PI / 6]}
          >
            <torusGeometry args={[1.72, 0.009, 6, 48]} />
            <meshBasicMaterial
              color={color}
              transparent
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      ) : null}
    </group>
  );
}

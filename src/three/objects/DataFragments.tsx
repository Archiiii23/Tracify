/**
 * Spatial metadata: hash/value/network fragments that exist *in* the world, on
 * tiny data planes, and only resolve when the camera comes near them.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";

import { PAL } from "../materials/palette";
import { clamp01 } from "../utils/animationUtils";
import type { Vec3 } from "../utils/storyConfig";

export function DataFragment({
  position,
  label,
  size = 1.1,
  color = PAL.grey,
  /** Distance at which the fragment is fully legible. */
  near = 26,
  far = 78,
  plane = true,
  opacityScale = 1,
}: {
  position: Vec3;
  label: string;
  size?: number;
  color?: THREE.Color;
  near?: number;
  far?: number;
  plane?: boolean;
  opacityScale?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const text = useRef<THREE.Mesh>(null);
  const panel = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const d = state.camera.position.distanceTo(g.position);
    const o = clamp01(1 - (d - near) / (far - near)) * opacityScale;
    g.visible = o > 0.01;
    if (text.current) {
      const m = text.current.material as THREE.Material;
      m.transparent = true;
      m.opacity = o;
    }
    if (panel.current) {
      (panel.current.material as THREE.MeshBasicMaterial).opacity = o * 0.14;
    }
  });

  return (
    <group ref={group} position={position}>
      <Billboard>
        {plane ? (
          <mesh ref={panel} position={[0, 0, -0.02]}>
            <planeGeometry args={[label.length * size * 0.62 + 1, size * 2]} />
            <meshBasicMaterial
              color={PAL.dim}
              transparent
              opacity={0.14}
              depthWrite={false}
            />
          </mesh>
        ) : null}
        <Text
          ref={text}
          fontSize={size}
          color={`#${color.getHexString()}`}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.12}
        >
          {label}
        </Text>
      </Billboard>
    </group>
  );
}

/**
 * Large transparent world typography — used for the filtering counters.
 * Opacity is driven from a ref written in the render loop, so counting through
 * 1000 → 1 costs no React renders.
 */
export function WorldNumber({
  position,
  value,
  caption,
  opacityRef,
  size = 14,
}: {
  position: Vec3;
  value: string;
  caption: string;
  opacityRef: React.MutableRefObject<number>;
  size?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const o = opacityRef.current;
    if (group.current) group.current.visible = o > 0.01;
    if (a.current) {
      const m = a.current.material as THREE.Material;
      m.transparent = true;
      m.opacity = o * 0.55;
    }
    if (b.current) {
      const m = b.current.material as THREE.Material;
      m.transparent = true;
      m.opacity = o * 0.8;
    }
  });

  return (
    <group ref={group}>
      <Billboard position={position}>
        <Text
          ref={a}
          fontSize={size}
          color="#eaf2ff"
          anchorX="center"
          anchorY="middle"
        >
          {value}
        </Text>
        <Text
          ref={b}
          position={[0, -size * 0.72, 0]}
          fontSize={size * 0.16}
          color="#38bdf8"
          letterSpacing={0.35}
          anchorX="center"
          anchorY="middle"
        >
          {caption}
        </Text>
      </Billboard>
    </group>
  );
}

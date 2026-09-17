/**
 * A traced value path: a precise thin polyline through wallet hops with a
 * luminous tube glow layer beneath it and pulses riding along it.
 *
 * Visual layers:
 *   1. Glow tube — wide, very transparent, additive
 *   2. Precise spine line — thin, solid
 *   3. Value-packet pulses — bright spheres + small octahedra riding the curve
 */
import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { PAL } from "../materials/palette";
import type { Vec3 } from "../utils/storyConfig";

export function useCurve(points: Vec3[]) {
  return useMemo(
    () => new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points],
  );
}

const SEG = 220;

export function TransactionPath({
  curve,
  reveal = 1,
  revealRef,
  color = PAL.signal,
  speed = 0.16,
  pulses = 3,
}: {
  curve: THREE.CatmullRomCurve3;
  reveal?: number;
  revealRef?: MutableRefObject<number>;
  color?: THREE.Color;
  speed?: number;
  pulses?: number;
}) {
  const line       = useRef<THREE.Line>(null);
  const glowLine   = useRef<THREE.Mesh>(null);
  const pulseGroup = useRef<THREE.Group>(null);

  const spineGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3),
    );
    return g;
  }, []);

  const glowGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3),
    );
    return g;
  }, []);

  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const r = revealRef ? revealRef.current : reveal;
    const shown = Math.max(0.001, r);

    // Update spine geometry (same curve points for both spine and glow)
    const arr = spineGeom.attributes["position"]!.array as Float32Array;
    const garr = glowGeom.attributes["position"]!.array as Float32Array;
    for (let i = 0; i <= SEG; i++) {
      curve.getPoint((i / SEG) * shown, v);
      const o = i * 3;
      arr[o] = v.x; arr[o + 1] = v.y; arr[o + 2] = v.z;
      garr[o] = v.x; garr[o + 1] = v.y; garr[o + 2] = v.z;
    }
    spineGeom.attributes["position"]!.needsUpdate = true;
    glowGeom.attributes["position"]!.needsUpdate = true;

    if (line.current) {
      (line.current.material as THREE.LineBasicMaterial).opacity = Math.min(1, r * 1.8) * 0.92;
    }

    if (pulseGroup.current) {
      pulseGroup.current.visible = r > 0.02;
      pulseGroup.current.children.forEach((child, i) => {
        // Each child group has [sphere, octahedron]
        const u = ((t * speed + i / pulses) % 1) * shown;
        curve.getPoint(u, v);
        child.position.copy(v);
        const brightness = 0.5 + 0.5 * Math.sin(u * Math.PI);
        child.children.forEach((c, ci) => {
          const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
          m.opacity = r * brightness * (ci === 0 ? 0.9 : 0.6);
        });
      });
    }
  });

  return (
    <group>
      {/* Glow tube — thicker line rendered additively behind the spine */}
      {/* @ts-expect-error three-fiber line intrinsic */}
      <line ref={glowLine} geometry={glowGeom}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={0.18}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          linewidth={3}
          depthWrite={false}
        />
      </line>

      {/* Precise spine line */}
      {/* @ts-expect-error three-fiber line intrinsic */}
      <line ref={line} geometry={spineGeom}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={0.92}
          toneMapped={false}
        />
      </line>

      {/* Value-packet pulses */}
      <group ref={pulseGroup}>
        {Array.from({ length: pulses }, (_, i) => (
          <group key={i}>
            {/* Bright sphere (the main pulse) */}
            <mesh>
              <sphereGeometry args={[0.42, 14, 14]} />
              <meshBasicMaterial
                color={PAL.light}
                transparent
                opacity={0.9}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            {/* Small octahedron riding alongside — the "data packet" */}
            <mesh position={[0.6, 0.3, 0]}>
              <octahedronGeometry args={[0.2, 0]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.65}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

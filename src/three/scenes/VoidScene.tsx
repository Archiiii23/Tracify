/**
 * CHAPTER 00 — THE VOID.
 *
 * An enormous quiet space with a blockchain entry portal directly in front of
 * the camera. Scroll and the camera flies *through* the gate. After the gate,
 * the data universe opens up.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { PAL } from "../materials/palette";
import { rng, ramp } from "../utils/animationUtils";
import { story } from "../utils/storyState";

const TAU = Math.PI * 2;

/** Concentric hex-ring portal sitting ~60 units in front of the start camera. */
function EntryPortal({ lite }: { lite: boolean }) {
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const ringC = useRef<THREE.Mesh>(null);
  const halo  = useRef<THREE.Mesh>(null);
  const core  = useRef<THREE.Mesh>(null);
  const streaks = useRef<THREE.LineSegments>(null);

  const streakGeom = useMemo(() => {
    const rand = rng(8800);
    const n = lite ? 24 : 60;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU;
      const r0 = 18 + rand() * 22;
      const r1 = r0 * (0.35 + rand() * 0.3);
      const o = i * 6;
      pos[o]     = Math.cos(a) * r0;
      pos[o + 1] = Math.sin(a) * r0;
      pos[o + 2] = 0;
      pos[o + 3] = Math.cos(a) * r1;
      pos[o + 4] = Math.sin(a) * r1;
      pos[o + 5] = 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [lite]);

  useFrame((state, delta) => {
    const p = story.progress;
    const t = state.clock.elapsedTime;
    // Portal fades out once camera has flown through (progress > 0.09)
    const portalFade = 1 - ramp(p, 0.04, 0.11);

    if (ringA.current) {
      ringA.current.rotation.z += delta * 0.18;
      (ringA.current.material as THREE.MeshBasicMaterial).opacity =
        portalFade * (0.55 + 0.2 * Math.sin(t * 1.1));
    }
    if (ringB.current) {
      ringB.current.rotation.z -= delta * 0.12;
      (ringB.current.material as THREE.MeshBasicMaterial).opacity =
        portalFade * (0.35 + 0.15 * Math.sin(t * 0.9 + 1));
    }
    if (ringC.current) {
      ringC.current.rotation.z += delta * 0.07;
      (ringC.current.material as THREE.MeshBasicMaterial).opacity =
        portalFade * (0.18 + 0.1 * Math.sin(t * 0.7 + 2));
    }
    if (halo.current) {
      (halo.current.material as THREE.MeshBasicMaterial).opacity =
        portalFade * (0.06 + 0.04 * Math.sin(t * 0.6));
    }
    if (core.current) {
      core.current.rotation.z += delta * 0.9;
      core.current.rotation.x += delta * 0.4;
      const scale = 1 + 0.06 * Math.sin(t * 2.2);
      core.current.scale.setScalar(scale);
      (core.current.material as THREE.MeshBasicMaterial).opacity =
        portalFade * (0.5 + 0.2 * Math.sin(t * 2.2));
    }
    if (streaks.current) {
      (streaks.current.material as THREE.LineBasicMaterial).opacity =
        portalFade * (0.18 + 0.12 * Math.sin(t * 1.6));
    }
  });

  // The portal sits at z=55 so the start camera (z=92 looking at z=-40) sees it
  // directly ahead — camera enters and passes through it at progress ~0.06.
  return (
    <group position={[0, 0, 55]}>
      {/* Converging data streaks toward portal centre */}
      <lineSegments ref={streaks} geometry={streakGeom}>
        <lineBasicMaterial
          color={PAL.signal}
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      {/* Outer halo disc */}
      <mesh ref={halo}>
        <circleGeometry args={[28, 6]} />
        <meshBasicMaterial
          color={PAL.accent}
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Outer hex ring */}
      <mesh ref={ringC}>
        <torusGeometry args={[24, 0.08, 6, 6]} />
        <meshBasicMaterial
          color={PAL.dim}
          transparent
          opacity={0.18}
          toneMapped={false}
        />
      </mesh>

      {/* Mid hex ring */}
      <mesh ref={ringB}>
        <torusGeometry args={[16, 0.1, 6, 6]} />
        <meshBasicMaterial
          color={PAL.accent}
          transparent
          opacity={0.38}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Inner glowing hex ring */}
      <mesh ref={ringA}>
        <torusGeometry args={[9, 0.14, 6, 6]} />
        <meshBasicMaterial
          color={PAL.signal}
          transparent
          opacity={0.65}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Core spinning icosahedron — looks like a blockchain hash */}
      <mesh ref={core}>
        <icosahedronGeometry args={[2.2, 1]} />
        <meshBasicMaterial
          color={PAL.signal}
          wireframe
          transparent
          opacity={0.55}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Ambient data-pulse lines that travel from the far field toward the portal. */
function DataPulses({ lite }: { lite: boolean }) {
  const group = useRef<THREE.Group>(null);

  const pulseData = useMemo(() => {
    const rand = rng(5501);
    const n = lite ? 12 : 28;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * TAU;
      const r = 32 + rand() * 20;
      return {
        startX: Math.cos(a) * r,
        startY: Math.sin(a) * r,
        speed: 0.08 + rand() * 0.14,
        phase: rand(),
      };
    });
  }, [lite]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const p = story.progress;
    const alive = 1 - ramp(p, 0.05, 0.12);

    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      const d = pulseData[i]!;
      // Pulse travels from outer radius to centre
      const u = ((t * d.speed + d.phase) % 1);
      const frac = 1 - u; // inward
      (child as THREE.Mesh).position.set(
        d.startX * frac,
        d.startY * frac,
        55, // same z as portal
      );
      const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = alive * Math.sin(u * Math.PI) * 0.9;
    });
  });

  return (
    <group ref={group}>
      {pulseData.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.25, 8, 8]} />
          <meshBasicMaterial
            color={i % 3 === 0 ? PAL.amber : PAL.signal}
            transparent
            opacity={0}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function VoidScene({ lite }: { lite: boolean }) {
  const count = lite ? 1400 : 3600;
  const far = useRef<THREE.Points>(null);
  const near = useRef<THREE.Points>(null);
  const structures = useRef<THREE.Group>(null);

  const { farGeom, nearGeom } = useMemo(() => {
    const rand = rng(4711);

    // Far: enormous shell of distant activity
    const farPos = new Float32Array(count * 3);
    const farCol = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      farPos[i3]     = (rand() - 0.5) * 560;
      farPos[i3 + 1] = (rand() - 0.5) * 320;
      farPos[i3 + 2] = 80 - rand() * 950;
      const roll = rand();
      const c = roll > 0.988 ? PAL.signal : roll > 0.96 ? PAL.accent : roll > 0.92 ? PAL.violet : PAL.dim;
      const b = 0.3 + rand() * 0.7;
      farCol[i3] = c.r * b;
      farCol[i3 + 1] = c.g * b;
      farCol[i3 + 2] = c.b * b;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(farPos, 3));
    fg.setAttribute("color", new THREE.BufferAttribute(farCol, 3));

    // Near: a denser cluster around the entry portal zone (z = 30-80)
    const nearCount = lite ? 300 : 800;
    const nearPos = new Float32Array(nearCount * 3);
    const nearCol = new Float32Array(nearCount * 3);
    for (let i = 0; i < nearCount; i++) {
      const i3 = i * 3;
      nearPos[i3]     = (rand() - 0.5) * 140;
      nearPos[i3 + 1] = (rand() - 0.5) * 80;
      nearPos[i3 + 2] = 20 + rand() * 60;
      const roll = rand();
      const c = roll > 0.9 ? PAL.signal : roll > 0.7 ? PAL.accent : PAL.grey;
      nearCol[i3] = c.r;
      nearCol[i3 + 1] = c.g;
      nearCol[i3 + 2] = c.b;
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute("position", new THREE.BufferAttribute(nearPos, 3));
    ng.setAttribute("color", new THREE.BufferAttribute(nearCol, 3));

    return { farGeom: fg, nearGeom: ng };
  }, [count, lite]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const p = story.progress;

    if (far.current) {
      far.current.rotation.y += delta * 0.003;
      const m = far.current.material as THREE.PointsMaterial;
      m.opacity = 0.48 + 0.1 * Math.sin(t * 0.35);
    }

    if (near.current) {
      // Near particles fade as we enter the portal
      const m = near.current.material as THREE.PointsMaterial;
      m.opacity = (1 - ramp(p, 0.02, 0.1)) * (0.65 + 0.15 * Math.sin(t * 0.8));
    }

    if (structures.current) {
      structures.current.rotation.y += delta * 0.008;
      structures.current.visible = p < 0.42;
      structures.current.children.forEach((c, i) => {
        c.rotation.x += delta * 0.018 * (1 + i * 0.18);
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = 0.04 + 0.04 * Math.sin(t * 0.28 + i) - ramp(p, 0.3, 0.45) * 0.06;
      });
    }
  });

  return (
    <group>
      {/* Far star-field */}
      <points ref={far} geometry={farGeom}>
        <pointsMaterial
          vertexColors
          size={lite ? 0.7 : 0.5}
          sizeAttenuation
          transparent
          opacity={0.52}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Near cluster around portal entry */}
      <points ref={near} geometry={nearGeom}>
        <pointsMaterial
          vertexColors
          size={lite ? 0.9 : 0.65}
          sizeAttenuation
          transparent
          opacity={0.65}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* The portal gate */}
      <EntryPortal lite={lite} />

      {/* Data pulses converging on the portal */}
      {!lite && <DataPulses lite={lite} />}

      {/* Barely visible large-scale topology in extreme distance */}
      <group ref={structures}>
        {[
          [-120, 40, -420, 90],
          [140, -50, -520, 130],
          [30, 70, -700, 170],
          [-90, -60, -260, 70],
        ].map(([x, y, z, s], i) => (
          <mesh key={i} position={[x!, y!, z!]}>
            <icosahedronGeometry args={[s!, 1]} />
            <meshBasicMaterial
              color={i % 2 ? PAL.accent : PAL.dim}
              wireframe
              transparent
              opacity={0.05}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

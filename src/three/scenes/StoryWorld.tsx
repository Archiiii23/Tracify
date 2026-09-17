/**
 * The world.
 *
 * One persistent scene graph holds every chapter at its own depth. The camera
 * flies a single continuous spline through all of it, driven by scroll — there
 * are no scene swaps, no fades between "sections", and no separate canvases.
 *
 * Lighting improvements:
 *   - Brighter key light over the portal entry area
 *   - Extended fog so distant stars stay visible longer
 *   - Extra warm fill light near the evidence / reveal zone
 *   - Slightly stronger camera roll for cinematic weight
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { BG } from "../materials/palette";
import { samplePosition, sampleTarget } from "../utils/cameraPath";
import { damp } from "../utils/animationUtils";
import { story } from "../utils/storyState";
import { VoidScene } from "./VoidScene";
import { DataUniverse } from "./DataUniverse";
import { SignalScene } from "./SignalScene";
import { TraceScene } from "./TraceScene";
import { NetworkScene3D } from "./NetworkScene3D";
import { ContextScene } from "./ContextScene";
import { IntelligenceScene } from "./IntelligenceScene";
import { EvidenceScene } from "./EvidenceScene";
import { RevealScene } from "./RevealScene";

function CameraRig() {
  const { camera } = useThree();
  const pos     = useMemo(() => new THREE.Vector3(), []);
  const target  = useMemo(() => new THREE.Vector3(), []);
  const current = useRef(new THREE.Vector3(0, 0, 92));
  const look    = useRef(new THREE.Vector3(0, 0, -40));

  useFrame((_, delta) => {
    const p = story.progress;
    samplePosition(p, pos);
    sampleTarget(p, target);

    // Pointer parallax: subtle, so it feels like looking around, not dragging.
    const par = story.reduced ? 0 : 1;
    pos.x += story.pointerX * 3.4 * par;
    pos.y += -story.pointerY * 2.2 * par;

    const l = 4.5;
    current.current.set(
      damp(current.current.x, pos.x, l, delta),
      damp(current.current.y, pos.y, l, delta),
      damp(current.current.z, pos.z, l, delta),
    );
    look.current.set(
      damp(look.current.x, target.x, l * 0.8, delta),
      damp(look.current.y, target.y, l * 0.8, delta),
      damp(look.current.z, target.z, l * 0.8, delta),
    );
    camera.position.copy(current.current);
    camera.lookAt(look.current);
    // Slightly stronger cinematic roll through the flight
    camera.rotation.z = Math.sin(p * Math.PI * 2) * 0.032;
  });
  return null;
}

export function StoryWorld() {
  const lite = story.lite;

  return (
    <>
      <color attach="background" args={[BG]} />
      {/* Extended fog distance: far stars remain visible longer */}
      <fog attach="fog" args={[BG, 60, 420]} />

      <ambientLight intensity={0.38} />

      {/* Portal-zone key light — strong blue over the entry gate */}
      <pointLight position={[0, 12, 58]}   intensity={140} color="#22d3ee" distance={180} />
      {/* Mid-world fill — main trace path */}
      <pointLight position={[20, -10, -300]} intensity={130} color="#38bdf8" distance={280} />
      {/* Network cluster — violet tint */}
      <pointLight position={[-18, 8, -370]}  intensity={100} color="#818cf8" distance={220} />
      {/* Evidence / intelligence zone — cool cyan */}
      <pointLight position={[0, 18, -540]}   intensity={110} color="#38bdf8" distance={250} />
      {/* Reveal finale — mint accent for verified palette */}
      <pointLight position={[0, -8, -660]}   intensity={90}  color="#34d399" distance={180} />

      <CameraRig />

      <VoidScene    lite={lite} />
      <DataUniverse lite={lite} />
      <SignalScene  lite={lite} />
      <TraceScene />
      <NetworkScene3D lite={lite} />
      <ContextScene />
      <IntelligenceScene lite={lite} />
      <EvidenceScene />
      <RevealScene  lite={lite} />
    </>
  );
}

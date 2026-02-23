// HeaderPencil3D.jsx
import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

function HeaderPencilModel({ url, open, cssTargetRef }) {
  const group = useRef();
  const { scene } = useGLTF(url);
  const { viewport, camera, size } = useThree();

  const ROT_BASE = useMemo(() => new THREE.Euler(0, 0, -0.786), []);

  // Center + bbox once
  const { centeredScene, bboxMinX, bboxMaxX, longestDim } = useMemo(() => {
    const root = scene.clone(true);

    const box = new THREE.Box3().setFromObject(root);
    const sizeV = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(sizeV);
    box.getCenter(center);

    root.position.sub(center);

    // recompute bbox after centering
    const box2 = new THREE.Box3().setFromObject(root);

    const longest = Math.max(sizeV.x, sizeV.y, sizeV.z) || 1;

    return {
      centeredScene: root,
      bboxMinX: box2.min.x,
      bboxMaxX: box2.max.x,
      longestDim: longest,
    };
  }, [scene]);

  const anim = useRef({ p: 0 });

  // temp vectors for projection
  const pA = useMemo(() => new THREE.Vector3(), []);
  const pB = useMemo(() => new THREE.Vector3(), []);
  const pAW = useMemo(() => new THREE.Vector3(), []);
  const pBW = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;

    // smooth open/close progress (if you're still animating flip)
    const target = open ? 1 : 0;
    anim.current.p = THREE.MathUtils.damp(anim.current.p, target, 5, dt);
    const p = anim.current.p;

    // responsive scale
    const targetWorldLength = viewport.width * 0.35;
    const scale = targetWorldLength / longestDim;
    g.scale.setScalar(scale);

    // responsive anchor
    const x = viewport.width * 0.28;
    const y = viewport.height * 0.0;
    g.position.set(x, y, 0);

    // your flip animation (keep whatever you decided)
    const flip = p * Math.PI;
    g.rotation.set(ROT_BASE.x + flip, ROT_BASE.y, ROT_BASE.z);

    // --- PANEL WIDTH = "CENTER BODY" WIDTH IN SCREEN SPACE ---
    // Define the center body segment along the model's local X range:
    const lenX = bboxMaxX - bboxMinX;
    const bodyStart = bboxMinX + lenX * -0.004; // tweak
    const bodyEnd   = bboxMinX + lenX * .972
    ; // tweak

    // Two local points on the axis (y=z=0 in centered model space)
    pA.set(bodyStart, 0, 0);
    pB.set(bodyEnd, 0, 0);

    // Convert those local points to world space using the group's transform
    pAW.copy(pA).applyMatrix4(g.matrixWorld);
    pBW.copy(pB).applyMatrix4(g.matrixWorld);

    // Project to screen pixels
    const ndcA = pAW.clone().project(camera);
    const ndcB = pBW.clone().project(camera);

    const ax = (ndcA.x * 0.5 + 0.5) * size.width;
    const bx = (ndcB.x * 0.5 + 0.5) * size.width;

    const leftPx = Math.min(ax, bx);
    const widthPx = Math.abs(bx - ax);

    // Write CSS variables onto the header element
    const el = cssTargetRef?.current;
    if (el) {
      el.style.setProperty('--pencil-center-left', `${leftPx}px`);
      el.style.setProperty('--pencil-center-width', `${widthPx}px`);
    }
  });

  return (
    <group ref={group}>
      <primitive object={centeredScene} />
    </group>
  );
}

export default function HeaderPencil3D({ open, cssTargetRef }) {
  return (
    <div className="hdrp-wrap" aria-hidden="true">
      <Canvas gl={{ alpha: true, antialias: true }}>
        <OrthographicCamera makeDefault position={[0, 0, 10]} zoom={65} />

        <ambientLight intensity={1.1} />
        <directionalLight position={[6, 6, 8]} intensity={1.1} />
        <directionalLight position={[-6, -2, 6]} intensity={0.5} />

        <HeaderPencilModel url="/models/pencil.glb" open={open} cssTargetRef={cssTargetRef} />
      </Canvas>
    </div>
  );
}

useGLTF.preload('/models/pencil.glb');
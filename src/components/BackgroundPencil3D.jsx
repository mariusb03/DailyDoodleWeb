/* BackgroundPencil3D.jsx */
import React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

function isCoarsePointer() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia?.('(pointer: coarse)').matches ?? true;
}

/**
 * PencilModel
 * - fixed in place (ANCHOR)
 * - graphite tip aims at cursor
 * - TRUE "sphere swivel" via camera ray -> sphere intersection
 * - smooth + deadzone
 * - roll-locked (fixes: up when right / down when left)
 * - max-outward clamp (won't aim to extreme edges)
 */
function PencilModel({ url, stateRef }) {
  const group = useRef();
  const { camera } = useThree();
  const { scene } = useGLTF(url);

  // === tweakables ===
  const TARGET_WORLD_LENGTH = 2.4; // size
  const ANCHOR_X = 0;
  const ANCHOR_Y = -0.5;
  const ANCHOR_Z = 0.0;

  const SPHERE_RADIUS = 3.0; // bigger = less extreme swivel
  const DEADZONE = 0.01; // tiny input deadzone (jitter)

  // NEW: clamp how far out it can aim (NDC radius in [0..1])
  // 0.65–0.8 feels good. Lower = less extreme pointing.
  const MAX_NDC_RADIUS = 0.72;

  // If it aims with the eraser, flip this (-1 <-> +1)
  const TIP_SIGN = -1;

  // If it leans away/toward glass wrong, flip this (1 <-> -1)
  const DEPTH_SIGN = 1;

  const { centeredScene, uniformScale, tipAxisLocal, upAxisLocal } = useMemo(() => {
    const root = scene.clone(true);

    root.traverse((obj) => {
      if (obj?.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        if (obj.material) {
          obj.material.metalness = 0.12;
          obj.material.roughness = 0.62;
        }
      }
    });

    // center pivot
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    root.position.sub(center);

    // scale
    const longest = Math.max(size.x, size.y, size.z) || 1;
    const scale = TARGET_WORLD_LENGTH / longest;

    // detect one end (farthest vertex after centering) => long axis
    let farthest = new THREE.Vector3(1, 0, 0);
    let farDist = 0;
    const tmp = new THREE.Vector3();

    root.traverse((obj) => {
      if (!obj?.isMesh || !obj.geometry) return;
      const pos = obj.geometry.attributes?.position;
      if (!pos) return;

      obj.updateWorldMatrix(true, false);

      for (let i = 0; i < pos.count; i++) {
        tmp.fromBufferAttribute(pos, i);
        tmp.applyMatrix4(obj.matrixWorld);
        const d = tmp.lengthSq();
        if (d > farDist) {
          farDist = d;
          farthest.copy(tmp);
        }
      }
    });

    // tip axis in model space
    const tipAxis = farthest.clone().normalize().multiplyScalar(TIP_SIGN);

    // Choose a stable "up axis" from bbox: second-longest axis, then orthogonalize to tip
    const axes = [
      { v: new THREE.Vector3(1, 0, 0), len: size.x },
      { v: new THREE.Vector3(0, 1, 0), len: size.y },
      { v: new THREE.Vector3(0, 0, 1), len: size.z },
    ].sort((a, b) => b.len - a.len);

    let upAxis = axes[1].v.clone();
    if (Math.abs(upAxis.dot(tipAxis)) > 0.85) upAxis = axes[2].v.clone();

    // orthogonalize up to tip
    upAxis.sub(tipAxis.clone().multiplyScalar(upAxis.dot(tipAxis))).normalize();

    return {
      centeredScene: root,
      uniformScale: scale,
      tipAxisLocal: tipAxis.normalize(),
      upAxisLocal: upAxis.normalize(),
    };
  }, [scene]);

  // temp objects
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const sphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(), SPHERE_RADIUS), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);

  const hit = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const aimQuat = useMemo(() => new THREE.Quaternion(), []);
  const twistQuat = useMemo(() => new THREE.Quaternion(), []);
  const desiredQuat = useMemo(() => new THREE.Quaternion(), []);

  const worldUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const upAfter = useMemo(() => new THREE.Vector3(), []);
  const aProj = useMemo(() => new THREE.Vector3(), []);
  const bProj = useMemo(() => new THREE.Vector3(), []);
  const cross = useMemo(() => new THREE.Vector3(), []);
  const tmpV = useMemo(() => new THREE.Vector3(), []);

  // smooth cursor
  const smooth = useRef({ nx: 0, ny: 0 });

  useFrame((_, dt) => {
    const g = group.current;
    const s = stateRef.current;
    if (!g || !s) return;

    // fixed anchor
    g.position.set(ANCHOR_X, ANCHOR_Y, ANCHOR_Z);

    // input
    const rawNx = THREE.MathUtils.clamp(s.nx, -1, 1);
    const rawNy = THREE.MathUtils.clamp(s.ny, -1, 1);

    // tiny deadzone (jitter)
    let nx = Math.abs(rawNx) < DEADZONE ? 0 : rawNx;
    let ny = Math.abs(rawNy) < DEADZONE ? 0 : rawNy;

    // smooth (framerate-independent)
    const k = 1 - Math.pow(0.001, dt);
    const follow = 0.990 * k;
    smooth.current.nx = THREE.MathUtils.lerp(smooth.current.nx, nx, follow);
    smooth.current.ny = THREE.MathUtils.lerp(smooth.current.ny, ny, follow);

    // NEW: clamp outward aim so it never goes to extreme edges
    nx = smooth.current.nx;
    ny = smooth.current.ny;
    const r = Math.hypot(nx, ny);
    if (r > MAX_NDC_RADIUS) {
      const s = MAX_NDC_RADIUS / r;
      nx *= s;
      ny *= s;
    }

    // ray from camera through cursor
    raycaster.setFromCamera({ x: nx, y: ny }, camera);

    // sphere centered at anchor
    sphere.center.copy(g.position);

    const ok = raycaster.ray.intersectSphere(sphere, hit);
    if (!ok) {
      plane.constant = -g.position.z;
      raycaster.ray.intersectPlane(plane, hit);
      if (!isFinite(hit.x) || !isFinite(hit.y) || !isFinite(hit.z)) {
        hit.set(g.position.x + 1, g.position.y, g.position.z);
      }
    }

    // direction from pencil to hit point
    dir.copy(hit).sub(g.position).normalize();

    // optional front/back flip
    dir.z *= DEPTH_SIGN;
    dir.normalize();

    if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);

    // 1) aim: tipAxisLocal -> dir
    aimQuat.setFromUnitVectors(tipAxisLocal, dir);

    // 2) roll-lock: rotate around dir so the model's "up" matches worldUp (projected)
    upAfter.copy(upAxisLocal).applyQuaternion(aimQuat);

    // project onto plane perpendicular to dir: v - dir*(v·dir)
    tmpV.copy(dir).multiplyScalar(upAfter.dot(dir));
    aProj.copy(upAfter).sub(tmpV);

    tmpV.copy(dir).multiplyScalar(worldUp.dot(dir));
    bProj.copy(worldUp).sub(tmpV);

    const aLen = aProj.length();
    const bLen = bProj.length();

    if (aLen > 1e-6 && bLen > 1e-6) {
      aProj.multiplyScalar(1 / aLen);
      bProj.multiplyScalar(1 / bLen);

      cross.crossVectors(aProj, bProj);
      const sin = cross.dot(dir);
      const cos = aProj.dot(bProj);
      const angle = Math.atan2(sin, cos);

      twistQuat.setFromAxisAngle(dir, angle);
      desiredQuat.copy(twistQuat).multiply(aimQuat);
    } else {
      desiredQuat.copy(aimQuat);
    }

    // smooth rotation
    const rot = 0.28 * k;
    g.quaternion.slerp(desiredQuat, rot);
  });

  return (
    <group ref={group}>
      <primitive object={centeredScene} scale={uniformScale} />
    </group>
  );
}

export default function BackgroundPencil3D() {
  const paperRef = useRef(null);
  const coarse = useMemo(() => isCoarsePointer(), []);

  const stateRef = useRef({
    nx: 0,
    ny: 0,
    x: 0,
    y: 0,
    t: 0,
  });

  useEffect(() => {
    const canvas = paperRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const prefersReduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;

      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, w, h);
    }

    function setPointer(clientX, clientY) {
      const cx = w * 0.5;
      const cy = h * 0.5;

      stateRef.current.x = clientX;
      stateRef.current.y = clientY;

      stateRef.current.nx = (clientX - cx) / (w * 0.5);
      stateRef.current.ny = (cy - clientY) / (h * 0.5);
    }

    resize();
    window.addEventListener('resize', resize);

    function onMove(e) {
      if (coarse) return;
      setPointer(e.clientX, e.clientY);
    }
    window.addEventListener('pointermove', onMove, { passive: true });

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let raf = 0;

    function step() {
      ctx.fillStyle = 'rgba(247,246,242,0.08)';
      ctx.fillRect(0, 0, w, h);

      const s = stateRef.current;

      if (coarse) {
        s.t += prefersReduced ? 0.0035 : 0.0075;
        const a = s.t;

        const cx = w * 0.5;
        const cy = h * 0.52;

        const px = cx + Math.cos(a * 1.0) * (w * 0.22) + Math.cos(a * 2.3) * 70;
        const py = cy + Math.sin(a * 0.9) * (h * 0.16) + Math.sin(a * 1.7) * 45;

        setPointer(px, py);
      }

      // faint line (optional)
      const cx = w * 0.5;
      const cy = h * 0.6;
      const tx = s.x || cx;
      const ty = s.y || cy;

      const dx = tx - cx;
      const dy = ty - cy;
      const dist = Math.hypot(dx, dy);

      if (dist > 12) {
        const ux = dx / dist;
        const uy = dy / dist;

        const tipOffset = 80;
        const sx = cx + ux * tipOffset;
        const sy = cy + uy * tipOffset;

        ctx.strokeStyle = 'rgba(35,35,40,0.12)';
        ctx.lineWidth = 2.0;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }

      raf = requestAnimationFrame(step);
    }

    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
    };
  }, [coarse]);

  return (
    <div className="bgp-wrap" aria-hidden="true">
      <canvas ref={paperRef} className="bgp-canvas" />

      <div className="bgp-3d">
        <Canvas
          camera={{ position: [0, 0, 6.5], fov: 35, near: 0.1, far: 100 }}
          gl={{ alpha: true, antialias: true }}
        >
          <ambientLight intensity={1.1} />
          <directionalLight position={[6, 8, 10]} intensity={1.25} />
          <directionalLight position={[-6, -2, 6]} intensity={0.55} />
          <PencilModel url="/models/pencil.glb" stateRef={stateRef} />
        </Canvas>
      </div>

      <div className="bg-glass" />
    </div>
  );
}

useGLTF.preload('/models/pencil.glb');
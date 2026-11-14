"use client";
// KPIs as translucent glass columns. Height = level; floating points = recent samples (or the confidence interval on Proofs).
import { Canvas, useFrame } from "@react-three/fiber";
import { Edges, Line } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Kpi, Tone } from "../../kpi-model";

export const TONE: Record<Tone, string> = { teal: "#22d3c5", violet: "#8b7bff", amber: "#ffb547", rose: "#ff6b8b", blue: "#5aa2ff" };
const MAXH = 2.6;
const SPACING = 1.55;

// Label drawn to a canvas texture (no DOM overlay, no network font). Redrawn only when text or hover changes.
function Label({ value, label, color, hot }: { value: string; label: string; color: string; hot: boolean }) {
  const tex = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = 512; cv.height = 200;
    const g = cv.getContext("2d")!;
    g.fillStyle = "rgba(6,9,30,0.82)";
    g.strokeStyle = color; g.lineWidth = hot ? 6 : 3;
    g.beginPath(); g.roundRect(8, 8, 496, 184, 36); g.fill(); g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = color; g.font = "700 84px system-ui, sans-serif"; g.fillText(value, 256, 72);
    g.fillStyle = "#b4bde6"; g.font = "500 44px system-ui, sans-serif"; g.fillText(label, 256, 144);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [value, label, color, hot]);
  useEffect(() => () => tex.dispose(), [tex]);
  return <sprite position={[0, -0.3, 1.0]} scale={hot ? [1.5, 0.585, 1] : [1.3, 0.51, 1]}><spriteMaterial map={tex} transparent depthTest={false} /></sprite>;
}

function Column({ k, x, hot, onHover }: { k: Kpi; x: number; hot: boolean; onHover: (id: string | null) => void }) {
  const col = useRef<THREE.Group>(null!);
  const orbit = useRef<THREE.Group>(null!);
  const h = useRef(0.05);
  const c = TONE[k.tone];
  const pts = useMemo(
    () => k.points.map((p, i) => new THREE.Vector3(Math.cos(i * 0.62) * 0.78, 0.15 + p * MAXH, Math.sin(i * 0.62) * 0.78)),
    [k.points],
  );

  useFrame((s, dt) => {
    h.current = THREE.MathUtils.lerp(h.current, 0.12 + k.level * MAXH, 1 - Math.exp(-4 * dt));
    col.current.scale.y = h.current;
    col.current.position.y = h.current / 2;
    orbit.current.rotation.y += dt * (hot ? 0.9 : 0.35);
    orbit.current.position.y = Math.sin(s.clock.elapsedTime * 1.2 + x) * 0.05;
  });

  return (
    <group position={[x, 0, 0]} onPointerOver={(e) => { e.stopPropagation(); onHover(k.id); }} onPointerOut={() => onHover(null)}>
      <group ref={col}>
        <mesh>
          <boxGeometry args={[0.8, 1, 0.8]} />
          <meshPhysicalMaterial color={c} transparent opacity={hot ? 0.42 : 0.26} roughness={0.08} clearcoat={1} side={THREE.DoubleSide} depthWrite={false} />
          <Edges color={c} />
        </mesh>
        <mesh scale={[0.3, 0.98, 0.3]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={hot ? 1.2 : 0.6} transparent opacity={0.7} />
        </mesh>
      </group>
      <group ref={orbit}>
        {pts.length > 1 && <Line points={pts} color={c} lineWidth={1} transparent opacity={0.5} />}
        {pts.map((p, i) => (
          <mesh key={i} position={p} scale={i === pts.length - 1 ? 1.9 : 1}>
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshStandardMaterial color="#fff" emissive={c} emissiveIntensity={1.8} />
          </mesh>
        ))}
      </group>
      <Label value={k.value} label={k.label} color={c} hot={hot} />
    </group>
  );
}

function Rig({ kpis, hot, onHover }: { kpis: Kpi[]; hot: string | null; onHover: (id: string | null) => void }) {
  const g = useRef<THREE.Group>(null!);
  useFrame((s) => {
    g.current.rotation.y = Math.sin(s.clock.elapsedTime * 0.22) * 0.3 + s.pointer.x * 0.25;
    g.current.rotation.x = -0.12 - s.pointer.y * 0.06;
  });
  const off = ((kpis.length - 1) * SPACING) / 2;
  return (
    <group ref={g} position={[0, -1.2, 0]}>
      <gridHelper args={[kpis.length * SPACING + 2, kpis.length * 3 + 3, "#4a5bb5", "#222b66"]} position={[0, -0.02, 0]} />
      {kpis.map((k, i) => <Column key={k.id} k={k} x={i * SPACING - off} hot={hot === k.id} onHover={onHover} />)}
    </group>
  );
}

export default function KpiScene({ kpis, hot, onHover, active = true }: { kpis: Kpi[]; hot: string | null; onHover: (id: string | null) => void; active?: boolean }) {
  const [still, setStill] = useState(false);
  useEffect(() => setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  const w = kpis.length * SPACING + 1;
  return (
    <Canvas camera={{ position: [0, 2.2, Math.max(8.2, w * 0.74)], fov: 38 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }} frameloop={!active ? "never" : still ? "demand" : "always"}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 6, 5]} intensity={1.4} />
      <pointLight position={[-5, 3, -3]} intensity={30} color="#8b7bff" />
      <Rig kpis={kpis} hot={hot} onHover={onHover} />
    </Canvas>
  );
}

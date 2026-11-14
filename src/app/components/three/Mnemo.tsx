"use client";
// Mnemo: the memory keeper. A glass robot whose antenna orb and core take the colour of the last memory change.
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Edges } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { MOOD_EVENT, MOOD_HOLD, type Mood } from "../../mood";

const COLOR: Record<Mood, string> = { idle: "#5aa2ff", thinking: "#8b7bff", saved: "#22d3c5", updated: "#ffb547", deleted: "#ff6b8b" };
const CHIPS = [0, 1, 2, 3];

function Bot({ mood }: { mood: Mood }) {
  const root = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const eyes = useRef<THREE.Group>(null!);
  const chips = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Mesh>(null!);
  const armR = useRef<THREE.Mesh>(null!);
  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#000", emissiveIntensity: 1.4 }), []);
  const core = useRef<THREE.MeshStandardMaterial>(null!);
  const orb = useRef<THREE.MeshStandardMaterial>(null!);
  const color = useMemo(() => new THREE.Color(COLOR.idle), []);
  const target = useMemo(() => new THREE.Color(), []);
  const since = useRef({ t: 0, fresh: true });
  useEffect(() => { since.current.fresh = true; }, [mood]);

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    if (since.current.fresh) { since.current = { t, fresh: false }; }
    const k = t - since.current.t;
    color.lerp(target.set(COLOR[mood]), 1 - Math.exp(-7 * dt));
    eyeMat.emissive.copy(color);
    orb.current.color.copy(color); orb.current.emissive.copy(color);
    core.current.color.copy(color); core.current.emissive.copy(color);

    const hop = mood === "saved" ? Math.abs(Math.sin(k * 7)) * Math.max(0, 1 - k / 1.4) * 0.5 : 0;
    root.current.position.y = Math.sin(t * 1.6) * 0.08 + hop;
    const spin = mood === "updated" ? (1 - Math.pow(1 - Math.min(k, 1.1) / 1.1, 3)) * Math.PI * 2 : 0;
    const wobble = mood === "deleted" ? Math.sin(k * 22) * 0.1 * Math.max(0, 1 - k / 1.2) : 0;
    root.current.rotation.y = Math.sin(t * 0.5) * 0.3 + spin + wobble;
    head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, s.pointer.x * 0.45, 0.08);
    head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, -s.pointer.y * 0.2, 0.08);

    const blink = t % 3.4 < 0.12 ? 0.1 : 1;
    eyes.current.scale.y = mood === "saved" ? 0.45 : mood === "deleted" ? 0.7 : blink;
    eyes.current.position.x = mood === "thinking" ? Math.sin(t * 3) * 0.09 : 0;

    chips.current.rotation.y += dt * (mood === "thinking" ? 3.2 : 0.7);
    const sc = mood === "deleted" ? 1 + Math.min(k, 1) * 0.7 : mood === "saved" ? 0.82 : 1;
    chips.current.scale.setScalar(THREE.MathUtils.lerp(chips.current.scale.x, sc, 0.08));
    const wave = Math.sin(t * (mood === "thinking" ? 7 : 2.2));
    armR.current.position.y = -0.42 + wave * 0.1;
    armL.current.position.y = -0.42 - wave * 0.1;
  });

  return (
    <group ref={root}>
      <mesh position={[0, -0.55, 0]}>
        <capsuleGeometry args={[0.42, 0.45, 8, 24]} />
        <meshPhysicalMaterial color="#a9b9ff" transparent opacity={0.5} roughness={0.1} clearcoat={1} depthWrite={false} />
        <Edges color="#9fb4ff" threshold={20} />
      </mesh>
      <mesh position={[0, -0.55, 0]}>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshStandardMaterial ref={core} emissiveIntensity={0.9} />
      </mesh>
      <mesh ref={armL} position={[-0.58, -0.42, 0]}><sphereGeometry args={[0.1, 16, 16]} /><meshStandardMaterial color="#c9d4ff" roughness={0.2} /></mesh>
      <mesh ref={armR} position={[0.58, -0.42, 0]}><sphereGeometry args={[0.1, 16, 16]} /><meshStandardMaterial color="#c9d4ff" roughness={0.2} /></mesh>

      <group ref={head} position={[0, 0.55, 0]}>
        <mesh>
          <sphereGeometry args={[0.55, 40, 40]} />
          <meshPhysicalMaterial color="#cfdaff" transparent opacity={0.38} roughness={0.08} clearcoat={1} depthWrite={false} />
        </mesh>
        <mesh scale={[1, 0.86, 0.9]}>
          <sphereGeometry args={[0.46, 32, 32]} />
          <meshStandardMaterial color="#0b1240" roughness={0.75} metalness={0} />
        </mesh>
        <group ref={eyes} position={[0, 0.03, 0.4]}>
          {[-0.16, 0.16].map((x) => (
            <mesh key={x} position={[x, 0, 0]} scale={[1, 1.5, 0.5]}>
              <sphereGeometry args={[0.075, 16, 16]} />
              <primitive object={eyeMat} attach="material" />
            </mesh>
          ))}
        </group>
        <mesh position={[0, 0.78, 0]}><cylinderGeometry args={[0.02, 0.02, 0.3, 8]} /><meshStandardMaterial color="#c9d4ff" /></mesh>
        <mesh position={[0, 0.98, 0]}>
          <sphereGeometry args={[0.1, 20, 20]} />
          <meshStandardMaterial ref={orb} emissiveIntensity={1.2} />
        </mesh>
        <group ref={chips}>
          {CHIPS.map((i) => {
            const a = (i / CHIPS.length) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.95, Math.sin(i * 1.7) * 0.18, Math.sin(a) * 0.95]} rotation={[0.3, -a, 0.2]}>
                <boxGeometry args={[0.2, 0.2, 0.05]} />
                <meshPhysicalMaterial color="#8b7bff" transparent opacity={0.45} roughness={0.1} clearcoat={1} depthWrite={false} />
                <Edges color="#cfd6ff" />
              </mesh>
            );
          })}
        </group>
      </group>
    </group>
  );
}

export default function Mnemo({ mood: fixed, active = true }: { mood?: Mood; active?: boolean }) {
  const [mood, setMood] = useState<Mood>(fixed ?? "idle");
  const [still, setStill] = useState(false);
  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (fixed) { setMood(fixed); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      const m = (e as CustomEvent<Mood>).detail;
      setMood(m);
      clearTimeout(timer);
      if (MOOD_HOLD[m]) timer = setTimeout(() => setMood("idle"), MOOD_HOLD[m]);
    };
    window.addEventListener(MOOD_EVENT, on);
    return () => { window.removeEventListener(MOOD_EVENT, on); clearTimeout(timer); };
  }, [fixed]);

  return (
    <Canvas camera={{ position: [0, 0.35, 5.6], fov: 34 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }} frameloop={!active ? "never" : still ? "demand" : "always"} aria-label={`Mnemo the memory keeper, ${mood}`}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <pointLight position={[-3, 2, -2]} intensity={25} color="#8b7bff" />
      <pointLight position={[3, -1, 3]} intensity={12} color="#22d3c5" />
      <Bot mood={mood} />
      <ContactShadows position={[0, -1.35, 0]} opacity={0.4} scale={4} blur={2.6} far={2} color="#000" />
    </Canvas>
  );
}

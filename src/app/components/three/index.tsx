"use client";
// Lazy, client-only 3D. SSR and first paint show a CSS cube; WebGL failure or no-GPU falls back to it too.
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import type { Kpi } from "../../kpi-model";
import type { Mood } from "../../mood";

const Mnemo = lazy(() => import("./Mnemo"));
const KpiScene = lazy(() => import("./KpiScene"));

export const CubeLoader = ({ label }: { label?: string }) => (
  <div className="cube-load" role="status" aria-label={label ?? "Loading 3D scene"}>
    <div className="cube-spin" aria-hidden>{["f", "b", "r", "l", "t", "u"].map((f) => <i key={f} className={`cf cf-${f}`} />)}</div>
  </div>
);

class Guard extends Component<{ children: ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  render() { return this.state.bad ? <CubeLoader label="3D unavailable" /> : this.props.children; }
}

// True only after mount, and false again while scrolled out of view so the render loop stops.
function useLive() {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setMounted(true);
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, mounted, visible };
}

export function MnemoCanvas({ size = "hero", mood }: { size?: "hero" | "mini" | "load"; mood?: Mood }) {
  const { ref, mounted, visible } = useLive();
  return (
    <div ref={ref} className={`mnemo mnemo-${size}`}>
      {mounted ? <Guard><Suspense fallback={<CubeLoader />}><Mnemo {...(mood ? { mood } : {})} active={visible} /></Suspense></Guard> : <CubeLoader />}
    </div>
  );
}

export function KpiStage({ kpis, hot, onHover }: { kpis: Kpi[]; hot: string | null; onHover: (id: string | null) => void }) {
  const { ref, mounted, visible } = useLive();
  return (
    <div ref={ref} className="kpi-canvas">
      {mounted ? <Guard><Suspense fallback={<CubeLoader />}><KpiScene kpis={kpis} hot={hot} onHover={onHover} active={visible} /></Suspense></Guard> : <CubeLoader />}
    </div>
  );
}

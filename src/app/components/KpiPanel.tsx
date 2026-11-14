"use client";
import { useState } from "react";
import type { Kpi } from "../kpi-model";
import { KpiStage } from "./three";

// 3D glass columns on top, the same numbers as plain text below (the text is the accessible source of truth).
export function KpiPanel({ kpis, caption }: { kpis: Kpi[]; caption: string }) {
  const [hot, setHot] = useState<string | null>(null);
  if (!kpis.length) return null;
  return (
    <section className="kpi-panel" aria-label="Key metrics">
      <div className="kpi-stage" aria-hidden>
        <KpiStage kpis={kpis} hot={hot} onHover={setHot} />
        <p className="kpi-cap">{caption}</p>
      </div>
      <ul className="kpi-legend">
        {kpis.map((k) => (
          <li key={k.id} data-tone={k.tone} className={hot === k.id ? "hot" : ""} onMouseEnter={() => setHot(k.id)} onMouseLeave={() => setHot(null)}>
            <span className="kl-label">{k.label}</span>
            <b className="kl-value">{k.value}</b>
            <small>{k.detail}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

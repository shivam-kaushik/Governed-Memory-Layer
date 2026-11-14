"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { MnemoCanvas } from "./three";

// One consistent 1.75-stroke icon set, drawn inline so nothing loads.
const ICON: Record<string, ReactNode> = {
  "/": <path d="M4 5h16v11H9l-5 4V5z" />,
  "/monitor": <path d="M3 12h4l2.5-7 5 14 2.5-7H21" />,
  "/memories": <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  "/audit": <><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  "/proof": <><path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 001.3 2h11.4A1.5 1.5 0 0019 19l-5-10V3" /><path d="M7.5 15h9" /></>,
  "/judge": <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 3.8M12 17h.01" /></>,
};
const LINKS = [
  ["/", "Chat"],
  ["/monitor", "Monitor"],
  ["/memories", "Memories"],
  ["/audit", "Audit"],
  ["/proof", "Proofs"],
  ["/judge", "Judge Q&A"],
] as const;

export function SideNav({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [slim, setSlim] = useState(false);
  useEffect(() => {
    try { setSlim(localStorage.getItem("gml:nav") === "slim"); } catch { /* storage blocked: stay wide */ }
  }, []);
  const toggle = () => {
    try { localStorage.setItem("gml:nav", slim ? "wide" : "slim"); } catch { /* not persisted */ }
    setSlim(!slim);
  };
  const idx = Math.max(0, LINKS.findIndex(([h]) => (h === "/" ? path === "/" : path.startsWith(h))));
  return (
    <aside className={slim ? "side slim" : "side"}>
      <div className="brand">
        <span className="logo" aria-hidden><i /><i /><i /></span>
        <span className="brand-t">Governed<br />Memory</span>
        <button className="collapse" onClick={toggle} aria-label={slim ? "Expand navigation" : "Collapse navigation"} aria-expanded={!slim}>
          <svg viewBox="0 0 24 24" aria-hidden><path d={slim ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"} /></svg>
        </button>
      </div>
      <nav aria-label="Main" style={{ "--i": idx } as React.CSSProperties}>
        <span className="nav-ind" aria-hidden />
        {LINKS.map(([href, label], n) => (
          <Link key={href} href={href} className={n === idx ? "nav on" : "nav"} aria-current={n === idx ? "page" : undefined} title={label}>
            <svg viewBox="0 0 24 24" className="ico" aria-hidden>{ICON[href]}</svg>
            <span className="nav-t">{label}</span>
          </Link>
        ))}
      </nav>
      {!slim && <div className="dock"><MnemoCanvas size="mini" /><span className="dock-cap">Mnemo reacts to every memory change</span></div>}
      <div className="sidefoot">{children}</div>
    </aside>
  );
}

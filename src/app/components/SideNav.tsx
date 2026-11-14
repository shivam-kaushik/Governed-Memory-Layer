"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const LINKS = [
  ["/", "Chat"],
  ["/monitor", "Monitor"],
  ["/memories", "Memories"],
  ["/audit", "Audit"],
  ["/proof", "Proofs"],
] as const;

export function SideNav({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <aside className="side">
      <div className="brand"><span className="logo" aria-hidden />Governed Memory</div>
      <nav aria-label="Main">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className={path === href ? "nav on" : "nav"} aria-current={path === href ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      <div className="sidefoot">{children}</div>
    </aside>
  );
}

import type { ReactNode } from "react";
import { SessionPicker } from "./components/SessionPicker";
import { getServer } from "./server";

export const metadata = { title: "Governed Memory Layer" };
export const dynamic = "force-dynamic";

const css = `body{font:15px system-ui;margin:0;color:#1a1a1a}main{padding:1rem 1.5rem;max-width:1100px}
nav{display:flex;gap:1rem;align-items:center;padding:.75rem 1.5rem;border-bottom:1px solid #ddd;flex-wrap:wrap}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #eee;padding:.4rem;text-align:left;vertical-align:top}
button{cursor:pointer;margin-right:.4rem}pre{background:#f6f6f6;padding:.6rem;overflow:auto}.err{color:#b00020}`;

export default async function Layout({ children }: { children: ReactNode }) {
  const { sessions } = await getServer();
  return (
    <html lang="en">
      <body>
        <style>{css}</style>
        <nav>
          <strong>Governed Memory Layer</strong>
          <a href="/">Live</a>
          <a href="/memories">Memories</a>
          <a href="/audit">Audit</a>
          <a href="/proof">Proof</a>
          <SessionPicker sessions={sessions} />
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}

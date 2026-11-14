import type { ReactNode } from "react";
import { SessionPicker } from "./components/SessionPicker";
import { getServer } from "./server";

export const metadata = { title: "Governed Memory Layer" };
export const dynamic = "force-dynamic";

const css = `body{font:15px/1.45 system-ui,sans-serif;margin:0;color:#1a1a1a;background:#fafafa}main{padding:1rem 1.5rem;max-width:1180px;margin:0 auto}
nav{display:flex;gap:1rem;align-items:center;padding:.75rem 1.5rem;border-bottom:1px solid #ddd;flex-wrap:wrap;background:#fff}
table{border-collapse:collapse;width:100%;background:#fff}th,td{border-bottom:1px solid #eee;padding:.45rem .5rem;text-align:left;vertical-align:top}th{font-size:12px;color:#555;text-transform:uppercase;letter-spacing:.03em}
button{cursor:pointer;margin-right:.4rem;padding:.3rem .7rem;border:1px solid #bbb;background:#fff;border-radius:6px;font:inherit}button:disabled{opacity:.45;cursor:default}
pre{background:#f6f6f6;padding:.6rem;overflow:auto}.err,.bad{color:#b00020}.ok{color:#1b7f3b;font-weight:600}.bad{font-weight:600}
.help{color:#555;margin:.4rem 0 1rem}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;word-break:break-all}
.whoami{margin:.2rem 0 .8rem}.tabs{display:flex;gap:.3rem;border-bottom:2px solid #e3e3e3;flex-wrap:wrap}
.tab{border:0;border-bottom:3px solid transparent;border-radius:0;background:none;padding:.55rem 1rem;font-size:15px;margin:0 0 -2px}.tab.active{border-bottom-color:#2f5fe0;font-weight:600;color:#2f5fe0}
.cards{display:flex;gap:.6rem;flex-wrap:wrap;margin:.8rem 0}.card{border:1px solid #ddd;background:#fff;border-radius:8px;padding:.5rem .8rem;min-width:150px}
.cardk{font-size:12px;color:#666}.cardv{font-size:22px;font-weight:600}.cardv small,.cardv.small{font-size:13px;font-weight:400}
.badge{display:inline-block;padding:.05rem .5rem;border-radius:999px;font-size:12px;font-weight:600;background:#eee;color:#333;margin-right:.3rem}
.b-active,.b-allow{background:#dcf3e2;color:#14602d}.b-expired,.b-deny{background:#eee;color:#555}.b-quarantined{background:#fbdcdc;color:#8a1313}
.b-disputed,.b-partial{background:#fdeccb;color:#7a4b00}.b-superseded{background:#dce8fb;color:#1c3f8a}.b-deleted{background:#e7dcf5;color:#4a2a7a}.b-total{background:#222;color:#fff}
.strip{margin:.4rem 0 .8rem}.barrow{display:flex;align-items:center;gap:.6rem;margin:.25rem 0}.barlabel{width:140px}.barn{width:2rem}
.bar{flex:1;max-width:420px;background:#eee;border-radius:4px;height:12px;display:block}.bar>span{display:block;background:#2f5fe0;height:12px;border-radius:4px}
.turns{padding-left:1.1rem}.turns>li{margin:.6rem 0;padding:.5rem .7rem;border:1px solid #e3e3e3;border-radius:8px;background:#fff;list-style:decimal}
.step{margin:.35rem 0}.steplabel{display:block;font-size:12px;text-transform:uppercase;color:#666;letter-spacing:.03em}
.evidence{border-left:3px solid #2f5fe0;background:#f2f6ff;padding:.3rem .6rem;margin:.25rem 0}tr.changed td{background:#fff6d6}`;

export default async function Layout({ children }: { children: ReactNode }) {
  const { sessions } = await getServer();
  return (
    <html lang="en">
      <body>
        <style>{css}</style>
        <nav>
          <strong>Governed Memory Layer</strong>
          <a href="/">Dashboard</a>
          <a href="/monitor">Monitor</a>
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

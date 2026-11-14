import type { ReactNode } from "react";
import { SideNav } from "./components/SideNav";
import { SessionPicker } from "./components/SessionPicker";
import { getServer } from "./server";

export const metadata = { title: "Governed Memory Layer" };
export const dynamic = "force-dynamic";

const css = `:root{--bg:#f6f7fb;--panel:#fff;--ink:#14151f;--mute:#6b7085;--line:#e6e8f0;--accent:#6d5efc;--accent2:#22d3ee;--side:#0e1020}
*{box-sizing:border-box}body{font:15px/1.5 Inter,system-ui,-apple-system,sans-serif;margin:0;color:var(--ink);background:var(--bg)}
.shell{display:flex;min-height:100vh}main{flex:1;min-width:0;padding:2rem clamp(1rem,4vw,3rem);max-width:1180px;margin:0 auto}
.side{width:232px;flex:none;background:var(--side);color:#c9cce0;display:flex;flex-direction:column;padding:1.25rem 1rem;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:.6rem;color:#fff;font-weight:650;font-size:16px;margin:0 .5rem 1.5rem}
.logo{width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,var(--accent),var(--accent2))}
.side nav{display:flex;flex-direction:column;gap:.15rem}.nav{color:#c9cce0;text-decoration:none;padding:.55rem .75rem;border-radius:8px;font-weight:500}
.nav:hover{background:#1a1d33;color:#fff}.nav.on{background:#23264a;color:#fff;box-shadow:inset 2px 0 0 var(--accent)}
.nav:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent2);outline-offset:2px}
.sidefoot{margin-top:auto;font-size:13px;padding:.5rem}.sidefoot select{width:100%;margin-top:.3rem;background:#1a1d33;color:#fff;border:1px solid #2c3057;border-radius:8px;padding:.4rem}
@media(max-width:720px){.shell{flex-direction:column}.side{width:auto;height:auto;position:static;flex-direction:row;flex-wrap:wrap;align-items:center;gap:.5rem}.brand{margin:0}.side nav{flex-direction:row;flex-wrap:wrap}.sidefoot{margin:0}}
h2{margin:0 0 1rem;font-size:24px;letter-spacing:-.02em}
table{border-collapse:collapse;width:100%;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}th,td{border-bottom:1px solid var(--line);padding:.55rem .7rem;text-align:left;vertical-align:top}th{font-size:12px;color:var(--mute);text-transform:uppercase;letter-spacing:.04em;background:#fafbfe}
button{cursor:pointer;padding:.4rem .85rem;border:1px solid var(--line);background:var(--panel);border-radius:8px;font:inherit;color:inherit}button:hover:not(:disabled){border-color:var(--accent)}button:disabled{opacity:.45;cursor:default}
button.primary,.send{background:linear-gradient(135deg,var(--accent),#8b5cf6);color:#fff;border:0}
pre{background:#f0f1f7;padding:.6rem;overflow:auto;border-radius:8px}.err,.bad{color:#c0213b}.ok{color:#0f8a4b;font-weight:600}.bad{font-weight:600}
.help{color:var(--mute);margin:.4rem 0 1rem}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;word-break:break-all}
.cards{display:flex;gap:.7rem;flex-wrap:wrap;margin:.8rem 0}.card{border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:.6rem .9rem;min-width:150px}
.cardk{font-size:12px;color:var(--mute)}.cardv{font-size:22px;font-weight:650}.cardv small,.cardv.small{font-size:13px;font-weight:400}
.badge{display:inline-block;padding:.05rem .55rem;border-radius:999px;font-size:12px;font-weight:600;background:#eceef6;color:#333;margin-right:.3rem}
.b-active,.b-allow{background:#d9f5e5;color:#0d6236}.b-expired,.b-deny{background:#eceef6;color:#555}.b-quarantined{background:#fde0e4;color:#8a1328}
.b-disputed,.b-partial{background:#fdeccb;color:#7a4b00}.b-superseded{background:#e0e8fd;color:#1c3f8a}.b-deleted{background:#eadffa;color:#4a2a7a}.b-total{background:#14151f;color:#fff}
.strip{margin:.4rem 0 .8rem}.barrow{display:flex;align-items:center;gap:.6rem;margin:.25rem 0}.barlabel{width:140px}.barn{width:2rem}
.bar{flex:1;max-width:420px;background:#eceef6;border-radius:4px;height:12px;display:block}.bar>span{display:block;background:var(--accent);height:12px;border-radius:4px}
.turns{padding-left:1.1rem}.turns>li{margin:.6rem 0;padding:.6rem .8rem;border:1px solid var(--line);border-radius:10px;background:#fbfbfe;list-style:decimal}
.step{margin:.35rem 0}.steplabel{display:block;font-size:12px;text-transform:uppercase;color:var(--mute);letter-spacing:.04em}
.evidence{border-left:3px solid var(--accent);background:#f1effe;padding:.3rem .6rem;margin:.25rem 0;border-radius:0 6px 6px 0}tr.changed td{background:#fff6d6}
.chat{display:flex;flex-direction:column;min-height:calc(100vh - 4rem)}.hero{text-align:center;margin:8vh auto 1.5rem;max-width:620px}
.hero h1{font-size:clamp(28px,4vw,42px);letter-spacing:-.03em;line-height:1.1;margin:0 0 .75rem;background:linear-gradient(120deg,var(--ink),var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{color:var(--mute);margin:0}.chips{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center;margin-top:1.25rem}.chip{border-radius:999px;font-size:13px;padding:.35rem .8rem}
.thread{flex:1;display:flex;flex-direction:column;gap:.9rem;padding:.5rem 0 1rem}.msg{max-width:88%;padding:.7rem .95rem;border-radius:14px;background:var(--panel);border:1px solid var(--line)}
.msg.you{align-self:flex-end;background:var(--accent);color:#fff;border:0}.who{display:block;font-size:12px;font-weight:600;color:var(--mute);margin-bottom:.2rem}
.composer{position:sticky;bottom:1rem;display:flex;gap:.5rem;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:.5rem;box-shadow:0 8px 30px rgba(20,21,31,.08)}
.composer input{flex:1;border:0;background:none;font:inherit;padding:.5rem .6rem;min-width:0}.composer input:focus-visible{outline:0}.composer:focus-within{border-color:var(--accent)}
.chatbar{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin-bottom:.5rem}.chip.on{background:#ece9ff;border-color:var(--accent)}
.tl{list-style:none;margin:.4rem 0;padding:0 0 0 .3rem;border-left:2px solid var(--line)}.tl-step{display:flex;gap:.6rem;margin:.5rem 0 .5rem -.45rem;opacity:0;animation:tlin .4s ease forwards}
.dot{flex:none;width:10px;height:10px;border-radius:50%;margin-top:.45rem;background:var(--mute);box-shadow:0 0 0 3px var(--panel)}
.tone-ok .dot{background:#16a34a}.tone-warn .dot{background:#f59e0b}.tone-bad .dot{background:#dc2626}.tone-info .dot{background:var(--accent)}
.tl-detail{color:var(--mute)}.tl-ids{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.25rem}.pill{font:600 11.5px ui-monospace,Menlo,monospace;padding:.1rem .5rem;border-radius:999px;background:#eceef6}
.pill-used{background:#d9f5e5;color:#0d6236}.pill-saved{background:#e0e8fd;color:#1c3f8a}.pill-forgot{background:#eadffa;color:#4a2a7a}.pill-rej{background:#fde0e4;color:#8a1328}
.said{margin:.2rem 0 .4rem}.tl-head{margin:.2rem 0}.turn{margin:.4rem 0}.evidence-box{margin:.3rem 0}.evidence-box summary{cursor:pointer;color:var(--mute);font-size:13px}
.working{opacity:.9}.shimmer{background:linear-gradient(90deg,var(--mute),var(--accent),var(--mute));background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:shim 1.6s linear infinite}
@keyframes tlin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes shim{to{background-position:-200% 0}}
@media(prefers-reduced-motion:reduce){.tl-step{animation:none;opacity:1}.shimmer{animation:none;color:var(--mute)}}
.send{padding:.5rem 1.1rem;font-weight:600}`;

export default async function Layout({ children }: { children: ReactNode }) {
  const { sessions } = await getServer();
  return (
    <html lang="en">
      <body>
        <style>{css}</style>
        <div className="shell">
          <SideNav>
            <SessionPicker sessions={sessions} />
          </SideNav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}

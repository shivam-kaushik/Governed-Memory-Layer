"use client";
import { useState } from "react";

type Json = Record<string, unknown>;
interface Turn {
  action: { tool: string; args: Json; usedMemoryIds: string[] };
  result: { executed: boolean; fixed: boolean; rejected?: string; findings?: string };
  traceId: string;
  explanation?: string;
}
interface Run {
  brain: string;
  fixed: boolean;
  turns: Turn[];
}

export function LivePanel({ alert, demo }: { alert: { id: string } & Json; demo: boolean }) {
  const [run, setRun] = useState<Run | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const call = async (path: string, body: unknown) => {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, json: (await r.json()) as Json };
  };
  const go = async () => {
    setBusy(true);
    const r = await call("/api/live/run", { alertId: alert.id });
    setBusy(false);
    setMsg(r.ok ? "" : `Error: ${String(r.json["error"])}`);
    setRun(r.ok ? (r.json as unknown as Run) : null);
  };
  const clock = async (op: string) => {
    const r = await call("/api/live/clock", { op });
    setMsg(r.ok ? `Clock now ${String(r.json["nowMs"])}` : `Error: ${String(r.json["error"])}`);
  };

  return (
    <section>
      <h2>Alert</h2>
      <pre>{JSON.stringify(alert, null, 2)}</pre>
      <button onClick={go} disabled={busy}>{busy ? "Agent working..." : "Run triage"}</button>
      {demo && <button onClick={() => clock("advance_day")}>Advance 1 day</button>}
      {demo && <button onClick={() => clock("jump_to_expiry")}>Jump to expiry</button>}
      {msg && <p className={msg.startsWith("Error") ? "err" : ""}>{msg}</p>}
      {run && (
        <>
          <h3>Agent run: {run.fixed ? "incident fixed" : "not fixed"} (brain: {run.brain})</h3>
          <ol>
            {run.turns.map((t) => (
              <li key={t.traceId}>
                <strong>{t.action.tool}</strong> {JSON.stringify(t.action.args)}
                {t.action.usedMemoryIds.length > 0 && <> · used memory {t.action.usedMemoryIds.join(", ")}</>}
                {t.result.rejected && <span className="err"> · BLOCKED {t.result.rejected}</span>}
                {t.result.fixed && <> · fixed</>}
                {t.explanation && <div><em>Agent: {t.explanation}</em></div>}
                {t.result.findings && <div>Finding: {t.result.findings}</div>}
                <div>trace <a href="/monitor">{t.traceId}</a></div>
              </li>
            ))}
          </ol>
          <p>Check <a href="/memories">Memories</a> to see what it learned, <a href="/monitor">Monitor</a> for the governed trace.</p>
        </>
      )}
    </section>
  );
}

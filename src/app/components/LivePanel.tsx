"use client";
import { useState } from "react";

type Json = Record<string, unknown>;

export function LivePanel({ alert, demo }: { alert: { id: string; title?: string } & Json; demo: boolean }) {
  const [out, setOut] = useState<Json | null>(null);
  const [trace, setTrace] = useState<Json | null>(null);
  const [msg, setMsg] = useState("");

  const call = async (path: string, body: unknown) => {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, json: (await r.json()) as Json };
  };
  const run = async () => {
    const r = await call("/api/live/run", { alertId: alert.id });
    setMsg(r.ok ? "" : `Error: ${String(r.json["error"])}`);
    setOut(r.ok ? r.json : null);
    if (r.ok) {
      const t = await fetch(`/api/traces/${String(r.json["traceId"])}`);
      setTrace(t.ok ? ((await t.json()) as Json) : null);
    }
  };
  const clock = async (op: string) => {
    const r = await call("/api/live/clock", { op });
    setMsg(r.ok ? `Clock now ${String(r.json["nowMs"])}` : `Error: ${String(r.json["error"])}`);
  };

  return (
    <section>
      <h2>Alert</h2>
      <pre>{JSON.stringify(alert, null, 2)}</pre>
      <button onClick={run}>Run triage</button>
      {demo && <button onClick={() => clock("advance_day")}>Advance 1 day</button>}
      {demo && <button onClick={() => clock("jump_to_expiry")}>Jump to expiry</button>}
      {msg && <p className={msg.startsWith("Error") ? "err" : ""}>{msg}</p>}
      {out && (<><h3>Outcome</h3><pre>{JSON.stringify(out, null, 2)}</pre></>)}
      {trace && (<><h3>Trace (ids and reason codes only)</h3><pre>{JSON.stringify(trace, null, 2)}</pre></>)}
    </section>
  );
}

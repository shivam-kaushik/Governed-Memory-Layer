"use client";
import { useEffect, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { LivePanel } from "./LivePanel";
import { MemoryActions } from "./MemoryActions";
import { MemoriesTable, type MemoryRow } from "./MemoriesTable";
import { MonitorClient } from "./MonitorClient";

interface Agent {
  running: boolean;
  brain: string;
  actingAs: string;
  notifierConfigured: boolean;
  ticks: number;
  fixed: number;
  escalated: number;
  learned: number;
  reused: number;
  forgotten: number;
  blocked: number;
  rotations: number;
  errors: number;
  notifications: { kind: string; alertId: string; ok: boolean; detail: string }[];
}
interface Status {
  manual: boolean;
  agent: Agent | null;
}

// Autonomous by default: the agent triages, learns, forgets stale memory and alerts by SMS on its own.
// The manual switch (reviewer/admin) pauses it and turns the human controls on.
export function AgentDashboard({ alert, demo }: { alert?: { id: string } & Record<string, unknown>; demo: boolean }) {
  const [st, setSt] = useState<Status | null>(null);
  const [mems, setMems] = useState<MemoryRow[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const [a, m] = await Promise.all([fetch("/api/agent/status"), fetch("/api/memories")]);
        if (!live) return;
        if (a.ok) setSt((await a.json()) as Status);
        if (m.ok) setMems(((await m.json()) as { memories: MemoryRow[] }).memories);
      } catch {
        // keep last data
      }
    };
    void tick();
    const t = setInterval(tick, 2000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const flip = async (manual: boolean) => {
    const r = await fetch("/api/agent/mode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ manual }) });
    setErr(r.ok ? "" : `Switching mode needs a reviewer session (${String(((await r.json()) as { error?: string }).error)})`);
    if (r.ok) setSt((s) => (s ? { ...s, manual } : s));
  };

  const a = st?.agent;
  const cards: [string, string | number][] = a
    ? [["Incidents handled", a.ticks], ["Fixed", a.fixed], ["Escalated", a.escalated], ["Learned", a.learned], ["Reused memory", a.reused], ["Forgot stale", a.forgotten], ["Guard blocks", a.blocked], ["World drifts", a.rotations]]
    : [];

  return (
    <section>
      <h2>Autonomous agent</h2>
      {!st && <p>Loading...</p>}
      {st && (
        <>
          <p>
            Status: <strong>{st.manual ? "PAUSED (manual controls on)" : a?.running ? "RUNNING on its own" : "idle"}</strong>
            {a && <> · brain: <strong>{a.brain}</strong> · acting as {a.actingAs} · SMS alerts: <strong>{a.notifierConfigured ? "Vonage on" : "off"}</strong></>}
          </p>
          {a?.brain === "rule-brain" && <p className="err">No ANTHROPIC_API_KEY: the rule brain cannot learn. Set the key and restart for the real agent.</p>}
          <label>
            <input type="checkbox" checked={st.manual} onChange={(e) => void flip(e.target.checked)} /> Manual controls (pauses the agent)
          </label>
          {err && <p className="err">{err}</p>}
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", margin: "1rem 0" }}>
            {cards.map(([k, v]) => (
              <div key={k} style={{ border: "1px solid #ddd", padding: ".4rem .7rem", minWidth: 100 }}>
                <div style={{ fontSize: 12, color: "#666" }}>{k}</div>
                <div style={{ fontSize: 20 }}>{v}</div>
              </div>
            ))}
          </div>
          {a && a.notifications.length > 0 && (
            <>
              <h3>SMS alerts</h3>
              <ul>
                {a.notifications.map((n, i) => (
                  <li key={i}>
                    {n.kind} · {n.alertId} · {n.ok ? "sent" : `not sent (${n.detail})`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <ChatPanel />
      {st?.manual && alert && <LivePanel alert={alert} demo={demo} />}
      <h2>Memory (agent-managed)</h2>
      <MemoriesTable memories={mems} {...(st?.manual ? { actions: (m: MemoryRow) => <MemoryActions id={m.id} /> } : {})} />
      <h2>What the agent is doing</h2>
      <MonitorClient events={[]} metrics={null} alerts={[]} />
    </section>
  );
}

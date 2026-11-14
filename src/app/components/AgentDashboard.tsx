"use client";
import { useEffect, useState } from "react";
import type { AuditEvent } from "../../contracts/contracts";
import type { ProofReport } from "../../eval/run";
import { AuditTable, RejectionBreakdown } from "./AuditTable";
import { ChatPanel } from "./ChatPanel";
import { LivePanel } from "./LivePanel";
import { MemoriesTable, StatusSummary, type MemoryRow } from "./MemoriesTable";
import { MemoryActions } from "./MemoryActions";
import { MonitorClient } from "./MonitorClient";
import { ProofScorecard } from "./ProofScorecard";

interface Agent {
  running: boolean;
  brain: string;
  store?: string;
  nowMs?: number;
  clockControllable?: boolean;
  actingAs: string;
  ticks: number;
  fixed: number;
  escalated: number;
  learned: number;
  reused: number;
  forgotten: number;
  blocked: number;
  rotations: number;
  errors: number;
}
interface Status {
  manual: boolean;
  agent: Agent | null;
}
type Session = { token: string; label: string };
type Alert = { id: string } & Record<string, unknown>;

const TABS = [
  ["live", "Live demo", "Report an incident and watch the agent use memory."],
  ["memories", "Memories", "Everything the agent knows, with its state and trust. Correct or forget here."],
  ["audit", "Audit", "Every memory request: who asked, what was allowed, and why candidates were rejected. Ids only, never memory text."],
  ["proof", "Proof", "Evidence that memory changes behavior and the safety gates hold."],
  ["monitor", "Monitor", "Live trace of each agent step."],
] as const;
type Tab = (typeof TABS)[number][0];

const cookie = () => (typeof document === "undefined" ? "" : (document.cookie.split("; ").find((c) => c.startsWith("session="))?.split("=")[1] ?? ""));

// Polls one JSON endpoint; keeps the last good value on a failed poll.
function usePoll<T>(path: string, ms: number, active: boolean): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!active) return;
    let live = true;
    const tick = async () => {
      try {
        const r = await fetch(path);
        if (live && r.ok) setData((await r.json()) as T);
      } catch {
        // keep last data
      }
    };
    void tick();
    const t = ms > 0 ? setInterval(tick, ms) : undefined;
    return () => {
      live = false;
      if (t) clearInterval(t);
    };
  }, [path, ms, active]);
  return data;
}

export function AgentDashboard({ alert, demo, sessions }: { alert?: Alert; demo: boolean; sessions: Session[] }) {
  const [tab, setTab] = useState<Tab>("live");
  const [err, setErr] = useState("");
  const [clockMsg, setClockMsg] = useState("");
  const status = usePoll<Status>("/api/agent/status", 2000, true);
  const mems = usePoll<{ memories: MemoryRow[] }>("/api/memories", 2000, tab === "live" || tab === "memories")?.memories ?? [];
  const audit = usePoll<{ events: AuditEvent[] }>("/api/audit", 3000, tab === "audit")?.events ?? [];
  const proof = usePoll<{ report: ProofReport }>("/api/proof", 0, tab === "proof")?.report ?? null;

  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    if (TABS.some(([k]) => k === h)) setTab(h);
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    window.location.hash = t;
  };

  const a = status?.agent;
  const who = sessions.find((s) => s.token === cookie())?.label;
  const flip = async (manual: boolean) => {
    const r = await fetch("/api/agent/mode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ manual }) });
    setErr(r.ok ? "" : `Switching mode needs a reviewer session (${String(((await r.json()) as { error?: string }).error)})`);
  };
  const clock = async (op: string) => {
    const r = await fetch("/api/live/clock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op }) });
    const j = (await r.json()) as { error?: string };
    setClockMsg(r.ok ? "" : j.error === "CLOCK_FIXED" ? "This store uses the real clock, so time cannot be moved." : `Error: ${String(j.error)}`);
  };
  const cards: [string, string | number][] = a
    ? [["Incidents handled", a.ticks], ["Fixed", a.fixed], ["Escalated", a.escalated], ["Learned", a.learned], ["Reused memory", a.reused], ["Forgot stale", a.forgotten], ["Guard blocks", a.blocked]]
    : [];
  const help = TABS.find(([k]) => k === tab)![2];

  return (
    <section>
      <div className="whoami">
        Signed in as <strong>{who ?? "nobody: pick a session in the top bar"}</strong>
        {a && <> · brain <strong>{a.brain}</strong> · memory in <strong>{a.store ?? "?"}</strong></>}
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "tab active" : "tab"} onClick={() => pick(k)}>{label}</button>
        ))}
      </div>
      <p className="help">{help}</p>

      {tab === "live" && (
        <>
          {a?.brain === "rule-brain" && <p className="bad">No ANTHROPIC_API_KEY: the rule brain cannot learn. Set the key and restart for the real agent.</p>}
          <div className="cards">
            {cards.map(([k, v]) => (
              <div key={k} className="card"><div className="cardk">{k}</div><div className="cardv">{v}</div></div>
            ))}
            <div className="card">
              <div className="cardk">Clock</div>
              <div className="cardv small">{a?.nowMs ? new Date(a.nowMs).toISOString().replace("T", " ").slice(0, 16) : "-"}</div>
              {demo && (
                <div>
                  <button disabled={!a?.clockControllable} onClick={() => clock("advance_day")}>+1 day</button>
                  <button disabled={!a?.clockControllable} onClick={() => clock("jump_to_expiry")}>Jump to expiry</button>
                </div>
              )}
              {a && !a.clockControllable && <small>real clock</small>}
              {clockMsg && <small className="bad">{clockMsg}</small>}
            </div>
          </div>
          {a?.store?.startsWith("memory") && (
            <label>
              <input type="checkbox" checked={!!status?.manual} onChange={(e) => void flip(e.target.checked)} /> Manual controls (pauses the background agent)
            </label>
          )}
          {err && <p className="bad">{err}</p>}
          <ChatPanel />
          {status?.manual && alert && a?.store?.startsWith("memory") && <LivePanel alert={alert} demo={demo} />}
          <h3>Memory right now</h3>
          <StatusSummary memories={mems} />
          <MemoriesTable memories={mems} />
        </>
      )}

      {tab === "memories" && (
        <>
          <StatusSummary memories={mems} />
          <MemoriesTable memories={mems} actions={(m) => <MemoryActions id={m.id} />} />
        </>
      )}

      {tab === "audit" && (
        <>
          <RejectionBreakdown events={audit} />
          <h3>Requests</h3>
          <AuditTable events={audit} />
        </>
      )}

      {tab === "proof" && (proof ? <ProofScorecard report={proof} /> : <p className="help">Running the proof (20 seeds and 300 isolation trials)...</p>)}

      {tab === "monitor" && <MonitorClient events={[]} metrics={null} alerts={[]} />}
    </section>
  );
}

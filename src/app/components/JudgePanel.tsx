"use client";
import { useEffect, useState } from "react";
import { AgentReply, type Reply } from "./ChatPanel";

interface Step { label: string; detail: string; ok: boolean }
interface Experiment { title: string; steps: Step[]; pass: boolean }
interface ArmRun { arm: string; label: string; why?: string; runs: number; restartedTruePool: number; restartedOtherPool: number; investigated: number; action: { tool: string; args: Record<string, unknown>; usedMemoryIds: string[] }; memory: string; memoryTokens: number; promptTokens: number }
interface Behavior { arms: ArmRun[]; truePool: string; otherPool: string; pass: boolean; note: string; brain: string }
interface Expiry { id: string; expiresAtMs: number; nowMs: number; eligibleNow: boolean }
interface ExpiryCheck { eligible: boolean; reason?: string }

const post = async <T,>(action: string, body: unknown = {}): Promise<T | { error: string }> => {
  try {
    const r = await fetch(`/api/judge/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json()) as T & { error?: string };
    return r.ok ? j : { error: j.error === "UNAUTHENTICATED" ? "Pick a session in the top bar first." : String(j.error) };
  } catch {
    return { error: "Request failed." };
  }
};
const isErr = <T,>(x: T | { error: string }): x is { error: string } => typeof x === "object" && x !== null && "error" in x;

function Steps({ exp }: { exp: Experiment }) {
  return (
    <>
      <p>{exp.pass ? <span className="ok">ALL CHECKS PASSED</span> : <span className="bad">A CHECK FAILED</span>} <small>({exp.steps.filter((s) => s.ok).length} / {exp.steps.length} steps)</small></p>
      <table>
        <tbody>
          {exp.steps.map((s) => (
            <tr key={s.label}><td><span className={s.ok ? "ok" : "bad"}>{s.ok ? "PASS" : "FAIL"}</span></td><td><strong>{s.label}</strong><div><small>{s.detail}</small></div></td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// One button, one experiment: runs live against the real stores and shows each step.
function Run({ action, label, children }: { action: string; label: string; children?: never }) {
  const [res, setRes] = useState<Experiment | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="exp">
      <button disabled={busy} onClick={async () => { setBusy(true); setRes(await post<Experiment>(action)); setBusy(false); }}>{busy ? "Running..." : label}</button>
      {res && (isErr(res) ? <p className="bad">{res.error}</p> : <Steps exp={res} />)}
    </div>
  );
}

function ExpiryDemo() {
  const [start, setStart] = useState<Expiry | null>(null);
  const [left, setLeft] = useState(0);
  const [check, setCheck] = useState<ExpiryCheck | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!start) return;
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [start]);
  return (
    <div className="exp">
      <button onClick={async () => {
        setCheck(null); setErr("");
        const r = await post<Expiry>("expiry-start");
        if (isErr(r)) return setErr(r.error);
        setStart(r); setLeft(Math.ceil((r.expiresAtMs - r.nowMs) / 1000));
      }}>1. Store a memory that lives 15 seconds</button>
      {start && <p>Stored <span className="mono">{start.id}</span>. Recalled right away: <strong>{start.eligibleNow ? "yes" : "no"}</strong>. {left > 0 ? `Expires in ${left}s.` : "Expired by the clock."}</p>}
      {start && (
        <button disabled={left > 0} onClick={async () => { const r = await post<ExpiryCheck>("expiry-check", { id: start.id }); isErr(r) ? setErr(r.error) : setCheck(r); }}>2. Ask for it now</button>
      )}
      {check && <p>{check.eligible ? <span className="bad">Still recalled</span> : <span className="ok">Not recalled</span>}{check.reason && <> · reason code <strong>{check.reason}</strong></>}</p>}
      {err && <p className="bad">{err}</p>}
    </div>
  );
}

function BehaviorDemo() {
  const [res, setRes] = useState<Behavior | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="exp">
      <button disabled={busy} onClick={async () => { setBusy(true); setRes(await post<Behavior>("behavior")); setBusy(false); }}>{busy ? "Asking the agent 4 times..." : "Run the 4-way experiment"}</button>
      {res && (isErr(res) ? <p className="bad">{res.error}</p> : (
        <>
          <p>{res.pass ? <span className="ok">MEMORY CHANGED THE ACTION</span> : <span className="bad">CHECK FAILED</span>} <small>brain: {res.brain}. True pool in memory: <span className="mono">{res.truePool}</span>, counterfactual: <span className="mono">{res.otherPool}</span></small></p>
          <table>
            <thead><tr><th>Arm</th><th>Memory block given to the agent</th><th>Tokens</th><th>What the agent did ({res.arms[0]?.runs} runs each)</th></tr></thead>
            <tbody>
              {res.arms.map((a) => (
                <tr key={a.arm} className={a.arm === "C" || a.arm === "R" ? "changed" : ""}>
                  <td><strong>{a.arm}</strong><div><small>{a.label}</small></div></td>
                  <td><small>{a.memory}</small></td>
                  <td>{a.memoryTokens}</td>
                  <td><div>Restarted the pool named by real memory: <strong>{a.restartedTruePool} / {a.runs}</strong></div><div>Restarted the counterfactual pool: <strong>{a.restartedOtherPool} / {a.runs}</strong></div><div>Only investigated: <strong>{a.investigated} / {a.runs}</strong></div><div><small>First run: <strong>{a.action.tool}</strong> <span className="mono">{JSON.stringify(a.action.args)}</span></small></div><div><small>cited: {a.action.usedMemoryIds.join(", ") || "none"}</small></div>{a.why && <div><em><small>{a.why}</small></em></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="help">{res.note}</p>
        </>
      ))}
    </div>
  );
}

function DriftDemo() {
  const [res, setRes] = useState<Reply | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="exp">
      <button disabled={busy} onClick={async () => { setBusy(true); setRes(await post<Reply>("drift")); setBusy(false); }}>{busy ? "Agent working..." : "Change the real failing pool, then send the same alert"}</button>
      {res && (isErr(res) ? <p className="bad">{res.error}</p> : <AgentReply reply={res} />)}
    </div>
  );
}

function ResetDemo() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="exp">
      <button disabled={busy} onClick={async () => {
        if (!window.confirm("Wipe the demo database and restore the seed data?")) return;
        setBusy(true);
        const r = await post<{ ok: boolean }>("reset");
        setMsg(isErr(r) ? (r.error === "OP_DENIED" ? "Only a reviewer can reset: pick the EcoCharge Ops reviewer session." : r.error) : "Reset done. Wait a few seconds for the index.");
        setBusy(false);
      }}>{busy ? "Resetting..." : "Reset demo data"}</button>
      {msg && <p>{msg}</p>}
    </div>
  );
}

export function JudgePanel() {
  return (
    <div>
      <h3>1. How do you keep one client&apos;s or team&apos;s memory from leaking into another&apos;s?</h3>
      <p><strong>Answer.</strong> The caller&apos;s tenant and scopes come from the server-side session, never from the request. Every database query is filtered by tenant, scope, status and expiry before ranking, then each hit is re-read and re-checked. Private notes stay private to their owner. Other clients cannot correct or forget by id. Every request is audited with ids only.</p>
      <Run action="isolation" label="Run the isolation attack" />
      <p className="help">Sample size for the leak gate is in the Proof tab: cross-tenant leaks 0 / 300 trials. Zero in N trials is an observed count, not proof of impossibility.</p>

      <h3>2. How does the agent fix or drop a memory that turns out wrong or expired?</h3>
      <p><strong>Answer.</strong> Every memory carries a mandatory time to live, enforced when it is read, not by a background job. A wrong memory is corrected into a new version that supersedes it, or forgotten: a tombstone is written first, then everything derived from it is cascaded. And when acting on a memory fails to fix the incident, the agent forgets that memory itself.</p>
      <h4>Expiry</h4>
      <ExpiryDemo />
      <h4>Correct a wrong memory</h4>
      <Run action="correct" label="Correct a memory" />
      <h4>Forget a memory</h4>
      <Run action="forget" label="Forget a memory and probe for it" />
      <h4>The world changes under the agent</h4>
      <DriftDemo />

      <h3>3. How do you prove a memory changed the agent&apos;s behavior and did not just fill the prompt?</h3>
      <p><strong>Answer.</strong> The same alert and prompt are run four ways and only the memory block differs: real memory, no memory, a placebo of the same length with irrelevant text, and a counterfactual where only the pool in the memory is changed. If the memory merely filled the prompt, the placebo would behave like the real memory. Instead the action follows the fact in memory.</p>
      <BehaviorDemo />

      <h3>Reset</h3>
      <p className="help">The drift test changes the demo world and the agent learns from it. Reset wipes the demo database (memories, audit, traces) and restores the seed set. Needs a reviewer session. The vector index takes a few seconds to catch up afterwards.</p>
      <ResetDemo />
    </div>
  );
}

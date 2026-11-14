"use client";
import { useState } from "react";

type Json = Record<string, unknown>;
interface Turn {
  action: { tool: string; args: Json; usedMemoryIds: string[] };
  result: { fixed: boolean; rejected?: string; findings?: string };
  traceId: string;
  explanation?: string;
  learnedId?: string;
  forgotten?: string[];
  cards?: { memoryId: string; version: number; statement: string; confidence: number; sourceAuthority: number; score: number }[];
}
interface Reply {
  brain: string;
  fixed: boolean;
  turns: Turn[];
}
interface Msg {
  from: "you" | "agent";
  text?: string;
  reply?: Reply;
  error?: boolean;
}

const EXAMPLES = ["5xx spike on checkout-service 2.3.1 in prod after deploy", "5xx spike on payments-service 1.4.0 in prod after deploy"];

// Type an incident; the agent recalls governed memory, acts, and the cards/tables around this panel update live.
export function ChatPanel() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (message: string) => {
    if (!message.trim() || busy) return;
    setBusy(true);
    setMsgs((m) => [...m, { from: "you", text: message }]);
    setText("");
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) });
      const j = (await r.json()) as Json;
      const fail = r.status === 401 ? "Pick a session in the top bar first." : j["error"] === "INVALID_ALERT" ? "Include a service (e.g. checkout-service) and a version (e.g. 2.3.1)." : `Error: ${String(j["error"])}`;
      setMsgs((m) => [...m, r.ok ? { from: "agent", reply: j as unknown as Reply } : { from: "agent", text: fail, error: true }]);
    } catch {
      setMsgs((m) => [...m, { from: "agent", text: "Request failed.", error: true }]);
    }
    setBusy(false);
  };

  return (
    <section>
      <h3>Report an incident</h3>
      <p>
        Describe an incident. Examples:{" "}
        {EXAMPLES.map((e) => (
          <button key={e} onClick={() => setText(e)} disabled={busy}>{e}</button>
        ))}
      </p>
      <div style={{ border: "1px solid #ddd", padding: ".6rem", maxHeight: 360, overflow: "auto" }}>
        {msgs.length === 0 && <em>No messages yet.</em>}
        {msgs.map((m, i) => (
          <div key={i} style={{ margin: ".5rem 0" }}>
            <strong>{m.from === "you" ? "Alert from you:" : "Agent:"}</strong> {m.text && <span className={m.error ? "err" : ""}>{m.text}</span>}
            {m.reply && (
              <>
                <span> {m.reply.fixed ? "Incident fixed." : "Not fixed, escalate."} (brain: {m.reply.brain})</span>
                <ol className="turns">
                  {m.reply.turns.map((t) => (
                    <li key={t.traceId}>
                      <div className="step"><span className="steplabel">1 · Memory recalled</span>
                        {t.cards && t.cards.length > 0 ? (
                          t.cards.map((c) => (
                            <div key={c.memoryId} className="evidence">
                              {c.statement}
                              <div><small className="mono">{c.memoryId} v{c.version}</small> <small>· confidence {c.confidence} · authority {c.sourceAuthority} · match {c.score.toFixed(2)}</small></div>
                            </div>
                          ))
                        ) : <em> nothing eligible: no precedent, expired, wrong version or out of scope</em>}
                      </div>
                      <div className="step"><span className="steplabel">2 · Action chosen</span>
                        <strong>{t.action.tool}</strong> <span className="mono">{JSON.stringify(t.action.args)}</span>
                        {t.action.usedMemoryIds.length > 0 ? <div><small>used memory: <span className="mono">{t.action.usedMemoryIds.join(", ")}</span></small></div> : <div><small>used memory: none</small></div>}
                        {t.explanation && <div><em>{t.explanation}</em></div>}
                      </div>
                      <div className="step"><span className="steplabel">3 · Tool result</span>
                        {t.result.rejected ? <span className="bad">BLOCKED by guard: {t.result.rejected}</span> : t.result.fixed ? <span className="ok">incident fixed</span> : <span>executed, not fixed yet</span>}
                        {t.result.findings && <div>Finding: {t.result.findings}</div>}
                        {t.learnedId && <div>Saved to memory: <span className="mono">{t.learnedId}</span></div>}
                        {t.forgotten && t.forgotten.length > 0 && <div>Forgot proven-wrong memory: <span className="mono">{t.forgotten.join(", ")}</span></div>}
                      </div>
                      <small>trace <span className="mono">{t.traceId}</span> (see the Monitor tab)</small>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(text); }} style={{ display: "flex", gap: ".4rem", marginTop: ".5rem" }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="5xx spike on checkout-service 2.3.1 in prod" style={{ flex: 1, padding: ".4rem" }} maxLength={1000} />
        <button type="submit" disabled={busy || !text.trim()}>{busy ? "Agent working..." : "Send"}</button>
      </form>
    </section>
  );
}

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
      <h2>Chat with the agent</h2>
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
            <strong>{m.from === "you" ? "You" : "Agent"}:</strong> {m.text && <span className={m.error ? "err" : ""}>{m.text}</span>}
            {m.reply && (
              <>
                <span> {m.reply.fixed ? "Incident fixed." : "Not fixed, escalate."} (brain: {m.reply.brain})</span>
                <ol>
                  {m.reply.turns.map((t) => (
                    <li key={t.traceId}>
                      <strong>{t.action.tool}</strong> {JSON.stringify(t.action.args)}
                      {t.action.usedMemoryIds.length > 0 && <> · used memory {t.action.usedMemoryIds.join(", ")}</>}
                      {t.result.rejected && <span className="err"> · BLOCKED {t.result.rejected}</span>}
                      {t.result.fixed && <> · fixed</>}
                      {t.learnedId && <> · learned {t.learnedId}</>}
                      {t.forgotten && t.forgotten.length > 0 && <> · forgot {t.forgotten.join(", ")}</>}
                      {t.explanation && <div><em>{t.explanation}</em></div>}
                      {t.result.findings && <div>Finding: {t.result.findings}</div>}
                      <div>trace <a href="/monitor">{t.traceId}</a></div>
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

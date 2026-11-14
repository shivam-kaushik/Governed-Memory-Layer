"use client";
import { useEffect, useState } from "react";
import { readSession, SESSION_EVENT } from "./session-cookie";

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
export interface Reply {
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

export function AgentReply({ reply }: { reply: Reply }) {
  return (
    <>
                <span> {reply.fixed ? "Incident fixed." : "Not fixed, escalate."} (brain: {reply.brain})</span>
                <ol className="turns">
                  {reply.turns.map((t) => (
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
  );
}

const EXAMPLES = ["charging sessions failing with 5xx on session-service 3.2.1 in prod after deploy", "charging sessions failing with 5xx on roaming-service 1.4.0 in prod after deploy"];

interface Chat { id: string; title: string; msgs: Msg[] }
const fresh = (): Chat => ({ id: crypto.randomUUID(), title: "New chat", msgs: [] });
const KEY = (t: string) => `gml:chats:${t}`;

// Chats live in this browser only, keyed by session token, so each tenant/user sees just their own.
function loadChats(token: string): Chat[] {
  try {
    const c = token ? (JSON.parse(localStorage.getItem(KEY(token)) ?? "null") as Chat[] | null) : null;
    if (c?.length) return c;
  } catch {
    // unreadable storage: start clean
  }
  return [fresh()];
}

// Type an incident; the agent recalls governed memory and acts. History is per session.
export function ChatPanel() {
  const [token, setToken] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => setToken(readSession());
    sync();
    window.addEventListener(SESSION_EVENT, sync);
    return () => window.removeEventListener(SESSION_EVENT, sync);
  }, []);
  useEffect(() => {
    const c = loadChats(token);
    setChats(c);
    setActiveId(c[0]!.id);
    setText("");
    setLoadedFor(token);
  }, [token]);
  useEffect(() => {
    if (!token || loadedFor !== token) return;
    try {
      localStorage.setItem(KEY(token), JSON.stringify(chats));
    } catch {
      // quota or blocked storage: history just won't persist
    }
  }, [chats, token, loadedFor]);

  const msgs = chats.find((c) => c.id === activeId)?.msgs ?? [];
  const add = (id: string, m: Msg) =>
    setChats((cs) => cs.map((c) => (c.id === id ? { ...c, title: c.msgs.length === 0 && m.from === "you" ? (m.text ?? "").slice(0, 32) : c.title, msgs: [...c.msgs, m] } : c)));
  const newChat = () => {
    const c = fresh();
    setChats((cs) => [c, ...cs]);
    setActiveId(c.id);
    setText("");
  };

  const send = async (message: string) => {
    if (!message.trim() || busy) return;
    const id = activeId;
    setBusy(true);
    add(id, { from: "you", text: message });
    setText("");
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) });
      const j = (await r.json()) as Json;
      const fail = r.status === 401 ? "Pick a session in the sidebar first." : j["error"] === "INVALID_ALERT" ? "Include a service (e.g. checkout-service) and a version (e.g. 2.3.1)." : `Error: ${String(j["error"])}`;
      add(id, r.ok ? { from: "agent", reply: j as unknown as Reply } : { from: "agent", text: fail, error: true });
    } catch {
      add(id, { from: "agent", text: "Request failed.", error: true });
    }
    setBusy(false);
  };

  return (
    <section className="chat">
      <div className="chatbar" role="tablist" aria-label="Chats">
        <button className="send" onClick={newChat} disabled={busy}>+ New chat</button>
        {chats.map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === activeId} className={c.id === activeId ? "chip on" : "chip"} onClick={() => setActiveId(c.id)} disabled={busy}>{c.title}</button>
        ))}
      </div>
      {msgs.length === 0 ? (
        <div className="hero">
          <h1>Ask an agent that remembers, within limits.</h1>
          <p>Every memory it recalls is scoped, versioned, expiring and audited. Describe an incident to see it work.</p>
          <div className="chips">
            {EXAMPLES.map((e) => (
              <button key={e} className="chip" onClick={() => setText(e)} disabled={busy}>{e}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="thread" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={m.from === "you" ? "msg you" : "msg"}>
              <span className="who">{m.from === "you" ? "You" : "Agent"}</span>
              {m.text && <span className={m.error ? "err" : ""}>{m.text}</span>}
              {m.reply && <AgentReply reply={m.reply} />}
            </div>
          ))}
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <input aria-label="Describe an incident" value={text} onChange={(e) => setText(e.target.value)} placeholder="charging sessions failing with 5xx on session-service 3.2.1 in prod" maxLength={1000} />
        <button className="send" type="submit" disabled={busy || !text.trim()}>{busy ? "Working..." : "Send"}</button>
      </form>
    </section>
  );
}

"use client";
import { useEffect, useState } from "react";
import { readSession, SESSION_EVENT } from "./session-cookie";

type Json = Record<string, unknown>;
export interface Step {
  kind: string;
  title: string;
  detail: string;
  tone: "ok" | "warn" | "bad" | "info";
  ids?: string[];
  rejected?: { id: string; reason: string }[];
}
interface Turn {
  action: { tool: string; args: Json; usedMemoryIds: string[] };
  result: { fixed: boolean; rejected?: string; findings?: string };
  traceId: string;
  explanation?: string;
  learnedId?: string;
  forgotten?: string[];
  steps?: Step[];
  cards?: { memoryId: string; version: number; statement: string; confidence: number; sourceAuthority: number; score: number }[];
}
export interface Reply {
  brain: string;
  fixed: boolean;
  turns: Turn[];
  alert?: { service: string; version: string; environment: string };
}
interface Msg {
  from: "you" | "agent";
  text?: string;
  reply?: Reply;
  error?: boolean;
}

const short = (id: string) => (id.length > 14 ? `${id.slice(0, 12)}…` : id);

// Replays the recorded trace one step at a time. Ids and reason codes only; memory text lives in the evidence list below.
function Timeline({ steps, base }: { steps: Step[]; base: number }) {
  return (
    <ol className="tl">
      {steps.map((st, i) => (
        <li key={st.kind} className={`tl-step tone-${st.tone}`} style={{ animationDelay: `${(base + i) * 0.45}s` }}>
          <span className="dot" aria-hidden />
          <div>
            <strong>{st.title}</strong> <span className="tl-detail">{st.detail}</span>
            {st.ids && st.ids.length > 0 && (
              <div className="tl-ids">
                {st.ids.map((id) => <span key={id} className={`pill pill-${st.kind === "memory" ? (st.tone === "warn" ? "forgot" : "saved") : "used"}`} title={id}>{st.kind === "memory" ? (st.tone === "warn" ? "forgot " : "saved ") : st.kind === "decision" ? "used " : "kept "}{short(id)}</span>)}
              </div>
            )}
            {st.rejected && st.rejected.length > 0 && (
              <div className="tl-ids">
                {st.rejected.map((r) => <span key={r.id} className="pill pill-rej" title={r.id}>{r.reason} {short(r.id)}</span>)}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AgentReply({ reply }: { reply: Reply }) {
  const last = reply.turns.at(-1);
  return (
    <>
      {last?.explanation && <p className="said">{last.explanation}</p>}
      <p className="tl-head">{reply.fixed ? <span className="ok">Incident fixed.</span> : "Not fixed yet."} <small>brain: {reply.brain}{reply.alert ? ` · ${reply.alert.service} ${reply.alert.version} ${reply.alert.environment}` : ""}</small></p>
      {reply.turns.map((t, ti) => (
        <div key={t.traceId} className="turn">
          {reply.turns.length > 1 && <span className="steplabel">Attempt {ti + 1}</span>}
          {t.steps && <Timeline steps={t.steps} base={ti * 6} />}
          {t.cards && t.cards.length > 0 && (
            <details className="evidence-box">
              <summary>Memory the agent read ({t.cards.length})</summary>
              {t.cards.map((c) => (
                <div key={c.memoryId} className="evidence">
                  {c.statement}
                  <div><small className="mono">{c.memoryId} v{c.version}</small> <small>· confidence {c.confidence} · authority {c.sourceAuthority} · match {c.score.toFixed(2)}</small></div>
                </div>
              ))}
            </details>
          )}
          {t.result.findings && <div className="step"><span className="steplabel">Tool finding</span>{t.result.findings}</div>}
          <small>trace <span className="mono">{t.traceId}</span> (full event log in Monitor)</small>
        </div>
      ))}
    </>
  );
}

const EXAMPLES = ["charging sessions failing with 5xx on session-service 3.2.1 in prod after deploy", "charging sessions failing with 5xx on roaming-service 1.4.0 in prod after deploy", "that did not work, what else can we try?"];

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
    // Follow-ups reuse the service/version the last reply in this chat worked on.
    const prior = [...(chats.find((c) => c.id === id)?.msgs ?? [])].reverse().find((m) => m.reply?.alert && m.reply.alert.service !== "unknown-service")?.reply?.alert;
    const context = prior ? { service: prior.service, version: prior.version, environment: prior.environment } : undefined;
    setBusy(true);
    add(id, { from: "you", text: message });
    setText("");
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, ...(context ? { context } : {}) }) });
      const j = (await r.json()) as Json;
      const fail = r.status === 401 ? "Pick a session in the sidebar first." : `Error: ${String(j["error"])}`;
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
          {busy && <div className="msg working" aria-live="polite"><span className="who">Agent</span><span className="shimmer">Reading your message, searching memory, deciding…</span></div>}
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <input aria-label="Describe an incident" value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe the incident, or just ask. e.g. charging sessions failing with 5xx on session-service 3.2.1" maxLength={1000} />
        <button className="send" type="submit" disabled={busy || !text.trim()}>{busy ? "Working..." : "Send"}</button>
      </form>
    </section>
  );
}

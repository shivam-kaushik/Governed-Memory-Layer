"use client";
import { useEffect, useState } from "react";
import { readSession, SESSION_EVENT } from "./session-cookie";
import { MemoryCloud, type MemoryOp } from "./MemoryCloud";
import { MnemoCanvas } from "./three";
import { emitMood, moodForOp, replyOp } from "../mood";

type Json = Record<string, unknown>;
export interface Step {
  kind: string;
  title: string;
  detail: string;
  tone: "ok" | "warn" | "bad" | "info";
  ids?: string[];
  rejected?: { id: string; reason: string }[];
  op?: MemoryOp;
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
  kind?: "chat" | "incident"; // chat: answered conversationally, no incident run
  text?: string; // the conversational answer (chat replies)
  steps?: Step[]; // what the agent did to answer (chat replies)
  usedMemoryIds?: string[];
  cards?: Turn["cards"];
  brain: string;
  fixed?: boolean;
  turns?: Turn[];
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
        <li key={st.kind} className={`tl-step tone-${st.tone}`} style={{ animationDelay: `${(base + i) * 0.45}s`, "--sd": `${(base + i) * 0.45}s` } as React.CSSProperties}>
          <span className="dot" aria-hidden />
          <div>
            <strong>{st.title}</strong> <span className="tl-detail">{st.detail}</span>
            {st.ids && st.ids.length > 0 && (
              <div className="tl-ids">
                {st.ids.map((id) => <span key={id} className={`pill pill-${st.kind === "memory" ? (st.tone === "warn" ? "forgot" : "saved") : "used"}`} title={id}>{st.kind === "memory" ? (st.tone === "warn" ? "forgot " : "saved ") : st.kind === "decision" || st.kind === "answer" ? "used " : "kept "}{short(id)}</span>)}
              </div>
            )}
            {st.rejected && st.rejected.length > 0 && (
              <div className="tl-ids">
                {st.rejected.map((r) => <span key={r.id} className="pill pill-rej" title={r.id}>{r.reason} {short(r.id)}</span>)}
              </div>
            )}
            {st.op && <MemoryCloud op={st.op} />}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ChatAnswer({ reply }: { reply: Reply }) {
  return (
    <>
      <p className="said">{reply.text}</p>
      {reply.steps && <Timeline steps={reply.steps} base={0} />}
      {reply.cards && reply.cards.length > 0 && (
        <details className="evidence-box">
          <summary>Memory the agent read ({reply.cards.length})</summary>
          {reply.cards.map((c) => (
            <div key={c.memoryId} className="evidence">
              {c.statement}
              <div><small className="mono">{c.memoryId} v{c.version}</small> <small>· confidence {c.confidence} · authority {c.sourceAuthority} · match {c.score.toFixed(2)}</small></div>
            </div>
          ))}
        </details>
      )}
      <p className="tl-head"><small>brain: {reply.brain}</small></p>
    </>
  );
}

export function AgentReply({ reply: r }: { reply: Reply }) {
  if (r.kind === "chat") return <ChatAnswer reply={r} />;
  const reply = { ...r, turns: r.turns ?? [], fixed: !!r.fixed };
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

const EXAMPLES = ["hi, what can you do?", "what do you remember about session-service 3.2.1?", "charging sessions failing with 5xx on session-service 3.2.1 in prod after deploy", "charging sessions failing with 5xx on roaming-service 1.4.0 in prod after deploy", "that did not work, what else can we try?"];

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

  const remove = (id: string) => {
    const c = chats.find((x) => x.id === id);
    if (c?.msgs.length && !window.confirm(`Delete chat "${c.title}"? This cannot be undone.`)) return;
    const rest = chats.filter((x) => x.id !== id);
    const next = rest.length ? rest : [fresh()];
    setChats(next);
    if (id === activeId) setActiveId(next[0]!.id);
  };

  const send = async (message: string) => {
    if (!message.trim() || busy) return;
    const id = activeId;
    // Follow-ups reuse the service/version the last reply in this chat worked on.
    const prior = [...(chats.find((c) => c.id === id)?.msgs ?? [])].reverse().find((m) => m.reply?.alert && m.reply.alert.service !== "unknown-service")?.reply?.alert;
    const context = prior ? { service: prior.service, version: prior.version, environment: prior.environment } : undefined;
    // Recent conversation, so the agent can follow up ("that didn't work") and know when memory applies.
    const history = (chats.find((c) => c.id === id)?.msgs ?? []).slice(-8).map((m) => ({ from: m.from, text: (m.text ?? m.reply?.text ?? m.reply?.turns?.at(-1)?.explanation ?? "").slice(0, 500) })).filter((h) => h.text);
    setBusy(true);
    emitMood("thinking");
    add(id, { from: "you", text: message });
    setText("");
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, ...(context ? { context } : {}), history }) });
      const j = (await r.json()) as Json;
      const fail = r.status === 401 ? "Pick a session in the sidebar first." : `Error: ${String(j["error"])}`;
      add(id, r.ok ? { from: "agent", reply: j as unknown as Reply } : { from: "agent", text: fail, error: true });
      emitMood(r.ok ? moodForOp(replyOp(j as unknown as Reply)) : "idle");
    } catch {
      add(id, { from: "agent", text: "Request failed.", error: true });
      emitMood("idle");
    }
    setBusy(false);
  };

  return (
    <section className="chat">
      <div className="chatbar" role="tablist" aria-label="Chats">
        <button className="send" onClick={newChat} disabled={busy}>+ New chat</button>
        {chats.map((c) => (
          <span key={c.id} className={c.id === activeId ? "chip on tabwrap" : "chip tabwrap"}>
            <button role="tab" aria-selected={c.id === activeId} className="tabbtn" onClick={() => setActiveId(c.id)} disabled={busy}>{c.title}</button>
            <button className="tabx" aria-label={`Delete chat ${c.title}`} title="Delete chat" onClick={() => remove(c.id)} disabled={busy}>×</button>
          </span>
        ))}
      </div>
      {msgs.length === 0 ? (
        <div className="hero">
          <MnemoCanvas size="hero" />
          <h1>Ask an agent that remembers, within limits.</h1>
          <p>Every memory it recalls is scoped, versioned, expiring and audited. Describe an incident, or just chat: it decides when memory applies.</p>
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
          {busy && <div className="msg working" aria-live="polite"><span className="who">Agent</span><span className="shimmer">Reading your message…</span></div>}
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <input aria-label="Describe an incident" value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe the incident, or just ask. e.g. charging sessions failing with 5xx on session-service 3.2.1" maxLength={1000} />
        <button className="send" type="submit" disabled={busy || !text.trim()}>{busy ? "Working..." : "Send"}</button>
      </form>
    </section>
  );
}

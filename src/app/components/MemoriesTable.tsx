import type { ReactElement } from "react";

export interface MemoryRow {
  id: string;
  scope: string;
  status: string;
  displayStatus?: string; // "expired" once past expiry, even though the stored status is still active
  version: number;
  supersedes?: string | null;
  derivedFrom?: string[];
  memoryType: string;
  claimKey: string;
  text: string;
  confidence: number;
  sourceAuthority?: number;
  source?: string | { type?: string; ref?: string };
  expiresInMs: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const countdown = (ms: number) =>
  ms >= DAY ? `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h` : ms >= HOUR ? `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MIN)}m` : `${Math.max(1, Math.floor(ms / MIN))}m`;
const statusOf = (m: MemoryRow) => (m.expiresInMs <= 0 && m.status === "active" ? "expired" : (m.displayStatus ?? m.status));
const provenance = (s: MemoryRow["source"]) => (typeof s === "string" ? s : s ? [s.type, s.ref].filter(Boolean).join(" · ") : "-");

export const Badge = ({ status }: { status: string }) => <span className={`badge b-${status}`}>{status}</span>;

// How many memories sit in each state, as a small strip above the table.
export function StatusSummary({ memories }: { memories: MemoryRow[] }) {
  const counts = new Map<string, number>();
  for (const m of memories) counts.set(statusOf(m), (counts.get(statusOf(m)) ?? 0) + 1);
  return (
    <div className="strip">
      <span className="badge b-total">{memories.length} total</span>
      {[...counts].map(([s, n]) => <span key={s} className={`badge b-${s}`}>{n} {s}</span>)}
    </div>
  );
}

// Memory text is data: React escapes it. Never dangerouslySetInnerHTML.
export function MemoriesTable({ memories, actions }: { memories: MemoryRow[]; actions?: (m: MemoryRow) => ReactElement }) {
  if (!memories.length) return <p className="help">No memories visible to this session.</p>;
  return (
    <table>
      <thead>
        <tr><th>Status</th><th>Memory</th><th>Scope</th><th>Version</th><th>Expiry</th><th>Trust</th><th>Provenance</th>{actions && <th />}</tr>
      </thead>
      <tbody>
        {memories.map((m) => (
          <tr key={m.id}>
            <td><Badge status={statusOf(m)} /></td>
            <td>
              <strong>{m.claimKey}</strong> <small>({m.memoryType})</small>
              <div>{m.text}</div>
              <small className="mono">{m.id}</small>
            </td>
            <td>{m.scope.startsWith("private") ? "private" : "team"}<div><small className="mono">{m.scope}</small></div></td>
            <td>
              v{m.version}
              {m.supersedes && <div><small>replaces <span className="mono">{m.supersedes}</span></small></div>}
              {m.derivedFrom && m.derivedFrom.length > 0 && <div><small>derived from {m.derivedFrom.length}</small></div>}
            </td>
            <td>{m.expiresInMs > 0 ? `expires in ${countdown(m.expiresInMs)}` : "EXPIRED"}</td>
            <td>
              <div>confidence {m.confidence}</div>
              {m.sourceAuthority !== undefined && <div>authority {m.sourceAuthority}</div>}
            </td>
            <td><small>{provenance(m.source)}</small></td>
            {actions && <td>{actions(m)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

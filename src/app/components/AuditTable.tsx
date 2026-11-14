import type { AuditEvent } from "../../contracts/contracts";

const REASONS: Record<string, string> = {
  EXPIRED: "Expired",
  WRONG_VERSION: "Wrong version",
  WRONG_SERVICE: "Wrong service",
  OTHER_SCOPE: "Outside scope",
  QUARANTINED: "Quarantined",
  TOMBSTONED: "Forgotten",
  STALE_INDEX: "Stale index entry",
};

// Which rules removed candidates, summed over the rows shown. Tenant filtering happens inside the search itself, so foreign rows never become candidates.
export function RejectionBreakdown({ events }: { events: AuditEvent[] }) {
  const counts = new Map<string, number>();
  for (const e of events) for (const r of e.rejectedIds) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  const rows = [...counts].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <div>
      <h3>Why candidates were filtered out</h3>
      {rows.length === 0 && <p className="help">Nothing was filtered in these requests yet.</p>}
      {rows.map(([reason, n]) => (
        <div key={reason} className="barrow">
          <span className="barlabel">{REASONS[reason] ?? reason}</span>
          <span className="bar"><span style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="barn">{n}</span>
        </div>
      ))}
      <p className="help">Tenant isolation is applied in the database filter before ranking, so other tenants&apos; memories are never candidates and never counted here.</p>
    </div>
  );
}

// Ids, decisions and reason codes only. The audit row never holds memory text.
export function AuditTable({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <p className="help">No audit events yet.</p>;
  return (
    <table>
      <thead>
        <tr><th>Time</th><th>Who</th><th>Operation</th><th>Decision</th><th>Reasons</th><th>Selected</th><th>Rejected (reason)</th><th>Trace</th></tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e._id}>
            <td><small>{new Date(e.createdAtMs).toISOString().replace("T", " ").slice(0, 19)}</small></td>
            <td>{e.actorId}<div><small>{e.purpose}</small></div></td>
            <td><strong>{e.op}</strong></td>
            <td><span className={`badge b-${e.decision}`}>{e.decision}</span></td>
            <td>{e.reasonCodes.join(", ") || "-"}</td>
            <td className="mono">{e.selectedIds.join(", ") || "-"}</td>
            <td className="mono">{e.rejectedIds.map((r) => `${r.id} (${r.reason})`).join(", ") || "-"}</td>
            <td className="mono"><small>{e.traceId}</small></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

import type { AuditEvent } from "../../contracts/contracts";

// Ids, decisions and reason codes only. The audit row never holds memory text.
export function AuditTable({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <p>No audit events yet.</p>;
  return (
    <table>
      <thead>
        <tr><th>Op</th><th>Decision</th><th>Reasons</th><th>Purpose</th><th>Selected</th><th>Rejected (reason)</th></tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e._id}>
            <td>{e.op}</td>
            <td>{e.decision}</td>
            <td>{e.reasonCodes.join(", ") || "-"}</td>
            <td>{e.purpose}</td>
            <td>{e.selectedIds.join(", ") || "-"}</td>
            <td>{e.rejectedIds.map((r) => `${r.id} (${r.reason})`).join(", ") || "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

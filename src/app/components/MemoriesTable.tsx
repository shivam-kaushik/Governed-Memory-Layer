import type { ReactElement } from "react";

export interface MemoryRow {
  id: string;
  scope: string;
  status: string;
  version: number;
  memoryType: string;
  claimKey: string;
  text: string;
  confidence: number;
  expiresInMs: number;
}

const fmt = (ms: number) => (ms >= 86_400_000 ? `${Math.floor(ms / 86_400_000)}d` : `${Math.floor(ms / 3_600_000)}h`);

// Memory text is data: React escapes it. Never dangerouslySetInnerHTML.
export function MemoriesTable({ memories, actions }: { memories: MemoryRow[]; actions?: (m: MemoryRow) => ReactElement }) {
  if (!memories.length) return <p>No memories visible to this session.</p>;
  return (
    <table>
      <thead>
        <tr><th>Memory</th><th>Scope</th><th>Status</th><th>TTL</th><th>Conf.</th>{actions && <th />}</tr>
      </thead>
      <tbody>
        {memories.map((m) => (
          <tr key={m.id}>
            <td>
              <strong>{m.claimKey}</strong> v{m.version} <small>({m.memoryType})</small>
              <div>{m.text}</div>
              <small>{m.id}</small>
            </td>
            <td>{m.scope}</td>
            <td>{m.status}</td>
            <td>{m.expiresInMs > 0 ? `expires in ${fmt(m.expiresInMs)}` : "EXPIRED"}</td>
            <td>{m.confidence}</td>
            {actions && <td>{actions(m)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

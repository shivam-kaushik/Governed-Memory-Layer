import type { AuditEvent } from "../../contracts/contracts";
import { AuditTable } from "../components/AuditTable";
import { load } from "../page-data";

export default async function AuditPage() {
  const { status, data } = await load<{ events: AuditEvent[] }>("/api/audit");
  if (status === 401) return <p>Pick a session in the sidebar to continue.</p>;
  return (
    <>
      <h2>Audit</h2>
      <AuditTable events={data?.events ?? []} />
    </>
  );
}

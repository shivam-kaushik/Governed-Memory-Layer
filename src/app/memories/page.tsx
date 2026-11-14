import { MemoriesTable, type MemoryRow } from "../components/MemoriesTable";
import { MemoryActions } from "../components/MemoryActions";
import { load } from "../page-data";

export default async function MemoriesPage() {
  const { status, data } = await load<{ memories: MemoryRow[] }>("/api/memories");
  if (status === 401) return <p>Pick a session above to continue.</p>;
  const mode = await load<{ manual: boolean }>("/api/agent/status");
  return (
    <>
      <h2>Memories</h2>
      <MemoriesTable memories={data?.memories ?? []} {...(mode.data?.manual ? { actions: (m: MemoryRow) => <MemoryActions id={m.id} /> } : {})} />
    </>
  );
}

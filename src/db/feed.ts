import { ObjectId, type Db } from "mongodb";
import type { TraceEvent } from "../contracts/contracts.js";
import { toTraceEvent } from "./trace-mapping.js";

const POLL_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Live feed of one tenant's trace events: backlog since `sinceMs`, then new inserts.
// Uses a change stream; falls back to polling if change streams are unavailable (or forced off).
// Both paths work in short slices so a consumer calling return() is released promptly.
export async function* traceFeed(db: Db, tenantId: string, sinceMs: number, opts: { forcePolling?: boolean } = {}): AsyncGenerator<TraceEvent> {
  const col = db.collection("agent_traces");
  const startId = new ObjectId();
  const seen = new Set<string>();
  const filter = { tenantId, $or: [{ createdAtMs: { $gte: sinceMs } }, { _id: { $gt: startId } }] };
  let cs: ReturnType<typeof col.watch> | null = null;
  const pending: any[] = [];

  if (!opts.forcePolling) {
    try {
      cs = col.watch([{ $match: { operationType: "insert", "fullDocument.tenantId": tenantId } }]);
      const first = await cs.tryNext(); // forces the stream open before the backlog is read
      if (first && (first as any).fullDocument) pending.push((first as any).fullDocument);
    } catch {
      await cs?.close().catch(() => {});
      cs = null; // change streams unsupported: polling fallback
    }
  }

  const fresh = (docs: any[]) => docs.filter((d) => { const k = String(d._id); if (seen.has(k)) return false; seen.add(k); return true; });

  try {
    for (const d of fresh(await col.find(filter).sort({ createdAtMs: 1, _id: 1 }).toArray())) yield toTraceEvent(d);
    for (const d of fresh(pending)) yield toTraceEvent(d);
    for (;;) {
      let docs: any[];
      if (cs) {
        try {
          const c = await cs.tryNext();
          docs = c && (c as any).fullDocument ? fresh([(c as any).fullDocument]) : [];
        } catch {
          await cs.close().catch(() => {});
          cs = null; // degrade to polling mid-run
          continue;
        }
        if (docs.length === 0) { await sleep(100); continue; }
      } else {
        docs = fresh(await col.find(filter).sort({ _id: 1 }).toArray());
        if (docs.length === 0) { await sleep(POLL_MS); continue; }
      }
      for (const d of docs) yield toTraceEvent(d);
    }
  } finally {
    await cs?.close().catch(() => {});
  }
}

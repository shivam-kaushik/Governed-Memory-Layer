import { ObjectId, type Db } from "mongodb";
import type { TraceEvent } from "../contracts/contracts.js";
import { toTraceEvent } from "./trace-mapping.js";

const POLL_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Live feed of one tenant's trace events: backlog since `sinceMs`, then new inserts.
// Uses a change stream; falls back to polling if change streams are unavailable (or forced off).
// With `idleMs`, the feed ends once the backlog is drained and nothing new arrives for that long (snapshot reads); without it, it runs until return().
// Both paths work in short slices so a consumer calling return() is released promptly.
export async function* traceFeed(db: Db, tenantId: string, sinceMs: number, opts: { forcePolling?: boolean; idleMs?: number; limit?: number } = {}): AsyncGenerator<TraceEvent> {
  const col = db.collection("agent_traces");
  const startId = new ObjectId();
  const seen = new Set<string>();
  // The `_id > startId` arm only matters for the live tail; a pure snapshot drops it so the query can use a (tenantId, createdAtMs) range.
  const filter = opts.idleMs === 0 ? { tenantId, createdAtMs: { $gte: sinceMs } } : { tenantId, $or: [{ createdAtMs: { $gte: sinceMs } }, { _id: { $gt: startId } }] };
  let cs: ReturnType<typeof col.watch> | null = null;
  const pending: any[] = [];

  if (!opts.forcePolling && opts.idleMs === undefined) { // snapshot reads (idleMs) poll: opening a change stream costs more than the read
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

  let lastActive = performance.now(); // monotonic: tryNext() can itself block for up to a second, so counting sleeps undercounts idle time
  try {
    const backlog = col.find(filter).sort({ createdAtMs: 1, _id: 1 });
    for (const d of fresh(await (opts.limit ? backlog.limit(opts.limit) : backlog).toArray())) yield toTraceEvent(d);
    for (const d of fresh(pending)) yield toTraceEvent(d);
    if (opts.idleMs === 0) return; // pure snapshot: the backlog is the answer, skip the tail poll
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
        if (docs.length === 0) {
          if (opts.idleMs !== undefined && performance.now() - lastActive >= opts.idleMs) return;
          await sleep(100); continue;
        }
      } else {
        docs = fresh(await col.find(filter).sort({ _id: 1 }).toArray());
        if (docs.length === 0) {
          if (opts.idleMs !== undefined && performance.now() - lastActive >= opts.idleMs) return;
          await sleep(POLL_MS); continue;
        }
      }
      lastActive = performance.now();
      for (const d of docs) yield toTraceEvent(d);
    }
  } finally {
    await cs?.close().catch(() => {});
  }
}

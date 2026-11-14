# Person A handoff (MongoDB layer)

What exists in `src/db` and how Person B plugs in. Swap `Fake*` for `Mongo*` in `src/core/index.ts`:

```ts
const db = await getDb();
const repo = new MongoMemoryRepo(db, clock);
const audit = new MongoAuditStore(db);
const traces = new MongoTraceStore(db, clock, { canaries: [...] });
const evals = new MongoEvalStore(db);
const embedder = createEmbedder();
```

Run once per database: `npm run bootstrap` (collections, validators, indexes, vector index). `npm run doctor` checks it.
`npm run reset` wipes data and reseeds (principals alice/rita in tenantA, bob in tenantB).

## Behavior Person B must know (rulings)

1. **Reads are limited to `principal.scopes`.** `getById`, `byIds`, `findActiveByClaimKey` and `vectorSearch` only
   return docs whose `scopeId` is in the principal's scopes. A reviewer who must `promote` another person's
   `private:` memory will not see it through the repo; change this by a joint edit, not by widening silently.
2. **`byIds`/`getById` hide `status: "deleted"` docs** but return `expired`, `superseded`, `quarantined`, `disputed`,
   so `recall` can produce reason codes. Use `isTombstoned` for the `TOMBSTONED` reason.
3. **Ids, claim keys and scope ids must be strings**; anything else throws (operator-injection guard).
4. **`insert` throws `TOMBSTONED`** if the id or content hash was forgotten. `tombstoneAndPurge` and `findDerived`
   are tenant-scoped but not scope-limited, so a cascade can reach derived memories in other scopes.
5. **`vectorSearch` is a candidate list.** Always recheck with `byIds` (index lag).
6. **Memory docs get a `purgeAt` TTL date anchored to real time**, so a fake/logical clock can never make
   MongoDB's cleanup delete a live memory.
7. **Trace/audit stores whitelist fields**; trace payload strings over 256 chars are rejected.

## Trace payload conventions (the alert worker and metrics depend on these)

| step | payload keys |
|---|---|
| `recall_result` | `decision`, `rejectedIds: [{id, reason}]`, `latencyMs` |
| `brain_decision` | `action` (tool name), `usedMemoryIds`, `latencyMs` |
| `tool_validation` | `result: "pass"\|"reject"`, `memoryValid: boolean`, `reason` |
| `tool_executed` | `tool` |

Alerts: `canary_in_trace`, `stale_memory_adopted` (tool executed although `memoryValid: false`),
`tool_guard_rejected`, `deny_rate_spike` (>50% denies over at least 5 recalls).

## Needs Atlas to verify

`vector_index_reaches_READY`, the `$vectorSearch` behavior tests, ANN recall vs exact, `p95 vectorSearch < 300 ms`,
and the vector part of the leakage test are skipped unless `MONGODB_URI` is set. Everything else runs on a local
in-memory replica set (transactions, change streams, validators, TTL indexes).

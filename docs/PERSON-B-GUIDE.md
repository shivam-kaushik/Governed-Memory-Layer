# Person B Guide: build everything above the database

You own the **app**: memory logic, agent, proof harness, dashboard, monitor UI, demo.
Person A already built and tested the **MongoDB layer** (`src/db`) against a real Atlas cluster.
You never touch the `mongodb` driver. You code against interfaces and fakes first, then swap in A's real stores.

Full design: `plan.md` (sections 3 to 11 and your tasks B1 to B8 in section 13). This file is the short path.

---

## 0. Get set up (15 minutes)

1. `git pull` and check out the shared branch (ask Person A which one; A worked on `ishika-dev`). Create your own branch from it, e.g. `git checkout -b b-dev`.
2. `npm install`
3. **For fakes-only work you need no database.** Skip `.env` until step 6 of section 5.
4. Run `npm test`. Without a `MONGODB_URI`, A's DB tests use a local in-memory MongoDB and the Atlas-only tests are skipped. A few tests download a mongod binary and the MiniLM model on first run, so allow a few minutes.
5. Read these files in this order (about 20 minutes):
   1. `src/contracts/contracts.ts`: **the frozen seam**. Every type you need is here.
   2. `docs/person-a-handoff.md`: behavior of A's stores that affects your code.
   3. `plan.md` sections 3.2 (recall pipeline), 3.3 (lifecycle states), 3.4 (write path), 8 (guardrails G1 to G25).

---

## 1. Rules you must not break

| Rule | Why |
|---|---|
| Never import `mongodb` outside `src/db` and `scripts` | A test (`tests/security/driver-boundary.test.ts`) fails the build |
| Never call `Date.now(` except inside a file named `*clock*.ts` | Same test. Use the injected `Clock` |
| `tenantId` comes only from the server-resolved `Principal`, never from input, prompt or request body | Isolation guarantee (G1) |
| Fail closed: unknown principal, purpose, scope, bad clock or failed recheck means **deny** | G2 |
| Audit and trace rows hold ids, hashes, reason codes only, never raw memory text | G15, G23 |
| Memory text is **data**, never instructions; it must never add a tool call | G17 |
| Do not edit `contracts.ts` alone. Changes are a joint edit with Person A | Keeps both sides compiling |

---

## 2. What Person A already gives you

Real implementations in `src/db` of the interfaces in `contracts.ts`:

| Interface | Implementation | Notes |
|---|---|---|
| `MemoryRepo` | `MongoMemoryRepo(db, clock)` | tenant-injected; see behavior list below |
| `AuditStore` | `MongoAuditStore(db)` | whitelists fields; write failure throws, so the op must fail closed |
| `TraceStore` | `MongoTraceStore(db, clock, { canaries })` | append-only; `feed`, `metrics`, `alerts` included |
| `EvalStore` | `MongoEvalStore(db)` | for proof runs and the scorecard |
| `Embedder` | `createEmbedder()` | MiniLM 384-d, normalized, in-process |

Also: `npm run reset` wipes and reseeds Atlas; `npm run doctor` checks health. Seed principals: `alice` (tenantA responder), `rita` (tenantA reviewer), `bob` (tenantB responder).

### Behavior of A's repo you must design around

1. **Reads are limited to `principal.scopes`.** `getById`, `byIds`, `findActiveByClaimKey`, `vectorSearch` only return docs whose `scopeId` is in the principal's scopes. If `promote()` needs a reviewer to read someone's private memory, raise it with Person A (joint edit), do not work around it.
2. `byIds`/`getById` **hide `status: "deleted"`** but still return `expired`, `superseded`, `quarantined`, `disputed`, so you can produce reason codes. Use `isTombstoned()` for the `TOMBSTONED` reason.
3. Ids, claim keys and scope ids must be **strings** or the repo throws.
4. `insert` throws `TOMBSTONED` if the id or content hash was forgotten.
5. `vectorSearch` returns **candidates only**. You must recheck every id with `byIds` and re-verify tenant, scope, status, tombstone, expiry, quarantine and policy version.
6. `supersede` and `tombstoneAndPurge` are single transactions. `findDerived` is tenant-scoped but not scope-limited, so a forget cascade can reach children in other scopes.
7. Trace payload strings longer than 256 characters are rejected. Keep payloads to ids, hashes, codes, short summaries.

---

## 3. Trace payload contract (the monitor and alerts depend on it)

Emit these steps with a shared `traceId` (the same one you pass into audit):

`alert_received`, `recall_requested`, `recall_result`, `brain_input`, `brain_decision`, `tool_validation`, `tool_executed`, `memory_written`, `trace_closed`

| step | required payload keys |
|---|---|
| `recall_result` | `decision` ("allow"/"deny"/"partial"), `rejectedIds: [{id, reason}]`, `latencyMs` |
| `brain_decision` | `action` (tool name), `usedMemoryIds`, `latencyMs` |
| `tool_validation` | `result` ("pass"/"reject"), `memoryValid` (boolean), `reason` |
| `tool_executed` | `tool` |

Reason codes for rejected candidates: `EXPIRED`, `WRONG_VERSION`, `WRONG_SERVICE`, `OTHER_SCOPE`, `QUARANTINED`, `TOMBSTONED`, `STALE_INDEX`.

Order matters (G24): `brain_decision` and `tool_validation` are emitted **before** `tool_executed`.
Trace writes are best-effort: if one fails, the agent keeps going and the final `trace_closed` event has `complete: false`. **Audit writes are mandatory**: if one fails, the operation fails.

Alerts the dashboard will show come from these conventions: `tool_executed` after `tool_validation.memoryValid === false` raises `stale_memory_adopted`; `result: "reject"` raises `tool_guard_rejected`.

---

## 4. Your tasks, in order (build against fakes first)

Use TDD: write the failing test, watch it fail, write the code, watch it pass, commit. Test names below are required by the plan.

### B1: Fakes and scenarios (start here, about 1 hour)
**Files:** `src/fakes/{fake-repo,fake-trace-store,fake-embedder,fake-clock}.ts`, `src/agent/scenarios.ts`, `tests/agent/scenarios.test.ts`
- `FakeMemoryRepo implements MemoryRepo`: mirror A's rules (tenant injection, scope limit, hide `deleted`, string guards, tombstone-blocks-insert, expiry). Copy the behavior list in section 2, otherwise your tests prove nothing.
- `FakeEmbedder`: deterministic hash embedding (flag it in test names). `FakeClock` with `advanceMs`. Fake clock file names must contain "clock".
- `makeScenario(seed, kind)` returns `{ alert, memoriesToSeed, truth: Action, principals }` for the 9 scenarios in plan section 10.
- Test: `nonce_not_in_alert_or_prompt_template` over 50 seeds.

### B2: Identity, policy, remember
**Files:** `src/core/{identity,policy,remember,inject-scan}.ts`, `tests/core/remember.test.ts`
- `resolvePrincipal(token)`, `authorize(p, op, scopeId, purpose)`, `scanInjection(text)`, `remember` per plan 3.4.
- zod schemas that **strip unknown keys** (this is how a forged `tenantId` is ignored).
- Tests: `rejects_missing_ttl`, `rejects_ttl_over_max_for_type` (fix over 30 days), `rejects_scope_broader_than_caller`, `rejects_unknown_purpose`, `quarantines_instruction_text`, `dedupes_same_claimKey_and_hash`, `marks_conflict_same_claimKey`, `forged_tenantId_in_input_stripped`, `read_permission_does_not_allow_write`.

### B3: Recall and lifecycle
**Files:** `src/core/{recall,rerank,applicability,cards,lifecycle}.ts`, tests in `tests/core/`
- Recall pipeline exactly as plan 3.2: identity, purpose, scope intersection, embed, `repo.vectorSearch`, **recheck via `repo.byIds`**, applicability (service, semver range, environment), rerank `0.6*sim + 0.2*confidence + 0.1*authority + 0.1*recency`, token budget, evidence cards, audit.
- `correct`, `forget` (walk `findDerived`, then one `tombstoneAndPurge`), `promote` (reviewer only).
- Recall tests: `returns_valid_fix`, `excludes_wrong_version`, `excludes_wrong_service`, `excludes_quarantined_and_disputed`, `denies_unknown_purpose`, `empty_when_no_precedent`, `stale_index_recheck_drops_deleted`, `rejected_ids_have_reason_codes`.
- Lifecycle tests: `correct_supersedes_and_versions`, `correct_invalidates_derived`, `forget_denies_immediately`, `forget_cascades_via_derivedFrom`, `forget_preserves_unrelated_similar_memory`, `forget_probe_id_text_paraphrase_all_empty`, `relearn_after_forget`, `promote_requires_reviewer`, `derived_inherits_narrowest_scope`.

### B4: Agent, tools, brains, traces
**Files:** `src/agent/{triage-agent,brain-rules,brain-llm,tools,trace}.ts`, `tests/agent/agent.test.ts`
- `runTriage(alert, caller, layer, brain, trace, clock)` returns `{ action, result, traceId }`.
- Tool allowlist with zod arg validation; deterministic simulator where `restart_cache_pool(pool)` fixes the incident only for the true nonce pool.
- Rule brain returns a structured rationale `{ rule, evidenceIds, rejectedBecause, confidence }`.
- No evidence means `investigate`. Never invent a fix.
- Tests: `no_precedent_investigates`, `valid_fix_uses_nonce_pool_and_usedMemoryIds`, `expired_fix_investigates`, `rejects_unlisted_tool`, `memory_text_cannot_add_tool`, `unreferenced_usedMemoryIds_invalid`, `emits_all_step_events_in_order`, `trace_write_failure_does_not_stop_agent_and_marks_incomplete`, `rationale_contains_rule_and_evidenceIds`.
- LLM brain is optional. Cut it first if behind.

### B5: Proof harness
**Files:** `src/eval/{checkpoint,arms,scorers,stats,run}.ts`, `tests/proof/proof.test.ts`
- Four arms from a frozen checkpoint: **R** real memory, **O** none, **P** placebo (same token count and format), **C** one fact changed.
- `runProof(seeds, brain)` returns `{ arms: { R|O|P|C: { n, success, ci } }, targetedResponse, collateralStability, harmfulAdoption }`. Wilson 95% interval; at least 20 seeds. Save runs with `EvalStore.saveRun`.
- Tests: `prompt_identical_outside_memory_block`, `placebo_token_length_within_2pct`, `arm_R_success_ge_95pct`, `arm_O_and_P_fail_on_nonce_tasks`, `counterfactual_changes_only_target_arg`, `harmful_adoption_zero_for_expired_wrongversion_foreign_deleted`, `scorer_blind_to_arm`.
- Pass targets: R at least 95%, O and P about 0%, R minus P lower bound at least 15 points, targeted response at least 90%, collateral stability at least 98%, harmful adoption exactly 0.

### B6: Dashboard (Next.js): Live, Memories, Audit, Proof
**Files:** `src/app/{live,memories,audit,proof}/page.tsx`, `src/app/api/*/route.ts`
- Next.js is not installed yet. Add it with `npm i next react react-dom` and add the `dev` script.
- **Live demo:** principal switcher (alice, rita, bob), alert picker, clock buttons (`+1 day`, `jump to expiry`), run button, action and result.
- **Memories:** status badge, version chain, expiry countdown, `correct` and `forget` buttons.
- **Audit:** decisions, selected and rejected ids with reason codes.
- **Proof:** arms table, changed vs stable fields, scorecard (leaks `0/300`, expired uses, forget recoveries, trace completeness).
- The identity for each request is resolved on the **server** from the session; never trust a body field.

### B7: Monitor tab
**Files:** `src/app/monitor/*`, `src/app/api/monitor/*/route.ts`
- Live feed using server-sent events from `TraceStore.feed`, run timeline from `listByTrace`, decision explainer, metrics cards from `metrics`, alert banner from `alerts`.
- Check: a run appears step by step within 2 seconds; a Team B session sees none of Team A's traces.

### B8: Demo, README, pitch
**Files:** `README.md`, `docs/demo-script.md`
- Rehearse the 3-minute script in plan section 14 twice. README states what is proven and what is not.

---

## 5. Integration with Person A's real stores

1. Finish B1 to B5 on fakes. Everything must pass with `npx vitest run` and no database.
2. Create `src/core/index.ts` as the **only** composition file. It builds fakes for tests and Mongo stores for the app:
   ```ts
   import { getDb } from "../db/client.js";
   import { MongoMemoryRepo } from "../db/mongo-memory-repo.js";
   import { MongoAuditStore } from "../db/mongo-audit-store.js";
   import { MongoTraceStore } from "../db/mongo-trace-store.js";
   import { MongoEvalStore } from "../db/mongo-eval-store.js";
   import { createEmbedder } from "../db/embedder.js";
   ```
   (`src/core` may not import the `mongodb` driver directly, but importing A's classes from `../db` is the one allowed seam. If the boundary test objects, import them from a thin `src/db/index.ts` re-export that Person A adds.)
3. Get an Atlas connection string from Person A (or create your own free M0 cluster). Put it in a local `.env` (copy `.env.example`; **never commit `.env`**, never paste the password in chat).
4. `npm run bootstrap`, then `npm run reset`, then `npm test`. Expect all tests green.
5. Run the proof with at least 20 seeds against Atlas and save the report. Check the Proof and Monitor pages.
6. If your network blocks `mongodb+srv` DNS lookups, the code already forces public DNS (`src/db/dns.ts`); override with `MONGODB_DNS_SERVERS` in `.env` if needed.

---

## 6. Suggested schedule

| Block | You |
|---|---|
| Today 1 | Setup, B1, B2 |
| Today 2 | B3, B4 |
| Today end | B5, B6 skeleton |
| Tomorrow 1 | Integration with real stores, B6, B7 |
| Tomorrow 2 | B8, rehearse the demo twice |

**Cut order if behind:** LLM brain, then `promote`, then alert worker polish, then dashboard polish, then the disputed state.
**Never cut:** the isolation suite, expiry boundary, forget probes, the proof harness, trace events.

## 7. Definition of done (yours)

- [ ] `npx vitest run` is green on fakes, then on Atlas.
- [ ] Proof report with 20+ seeds: R far above O and P, targeted response at least 90%, collateral at least 98%, harmful adoption 0.
- [ ] Dashboard runs every demo beat from `npm run reset` in 3 minutes or less.
- [ ] Monitor shows a run step by step within 2 seconds, with rejected-memory reasons; Team B cannot see Team A's traces; no raw memory text in any trace.
- [ ] README says what is and is not proven.

## 8. When stuck

- Interface mismatch or something you need changed in `contracts.ts` or the repo: ask Person A, edit together.
- Do not weaken a security test to make it pass. If a test and the plan disagree, ask.
- Atlas errors: run `npm run doctor` and read what it prints.

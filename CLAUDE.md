# CLAUDE.md — Governed Memory Layer (Person B: the app)

Source of truth: `plan.md`. This file is the working contract for Person B. If this file and `plan.md` disagree, stop and ask; do not guess.

## 1. Role and ownership

You are **Person B**. You build everything above MongoDB: memory logic, agent, proof harness, dashboard, monitor UI, demo, README.

| You own (write here) | Person A owns (never edit) | Joint (edit only with A's agreement) |
|---|---|---|
| `src/core/**`, `src/fakes/**`, `src/agent/**`, `src/eval/**`, `src/app/**` | `src/db/**`, `scripts/**` | `src/contracts/contracts.ts`, `package.json`, `tsconfig.json`, `.env.example`, `tests/security/driver-boundary.test.ts` |
| `tests/core`, `tests/agent`, `tests/proof` | `tests/db` | `tests/security`, `tests/integration` |
| `README.md`, `docs/demo-script.md` | | |

You develop against in-memory fakes. Person A builds the real Atlas stores. The swap is one constructor change in `src/core/index.ts` at integration.

## 2. Method: strict TDD

Every task (B1–B8) follows this order. No exceptions.

1. **Red.** Write the full test list for the task first, using the exact test names in `plan.md` section 13. Run them. They must fail for the right reason (missing implementation, not a typo or import error).
2. **Commit the red state** (`test(B2): failing tests for remember`).
3. **Green.** Write the smallest code that passes. Do not add behavior no test asks for.
4. **Refactor** with tests green. Re-run.
5. **Commit green** (`feat(B2): remember`).
6. Move to the next task only when `npx vitest run tests/<area>` passes and the driver-boundary test passes.

Rules:
- Never weaken, skip (`it.skip`, `.only`), delete, or loosen an assertion to get green. A failing test means fix the code, or raise a plan conflict with the user.
- A bug found later gets a failing regression test first, then the fix.
- Tests use `FakeClock` and seeded data. No `Date.now()`, no `Math.random()` without a seeded generator, no network, no real Mongo.
- A test that cannot fail is worthless. For each guardrail test, confirm it fails when the guardrail is removed (mutation check by hand once).
- Fake embedder tests carry `fake_embedder` in the test name so nobody mistakes them for semantic-quality evidence.

## 3. Build order and test lists

Test names are fixed by `plan.md`. Add more; never rename or drop these.

**Task 0 (joint).** Do not unilaterally redefine contracts. Draft `src/contracts/contracts.ts` from plan sections 9 and 13 (types: `Principal`, `Memory`, `AuditEvent`, `TraceEvent`, `MonitorMetrics`, `MonitorAlert`, `EvalRun`, `MemoryRepo`, `AuditStore`, `TraceStore`, `EvalStore`, `Embedder`, `Clock`, `MemoryLayer`, `Action`, `Brain`) and get A's sign-off. After freezing, a contract change needs a joint edit.

**B1 — fakes + scenarios** (`tests/agent/scenarios.test.ts`)
`nonce_not_in_alert_or_prompt_template` (50 seeds). Fakes must mirror the real repo: tenant injection on every method, status filter, expiry `now < expiresAtMs`, tombstones, unique `(tenantId, claimKey, version)`. Plan lists no fake audit or eval store; add `FakeAuditStore` and `FakeEvalStore` because the seam needs them. The fake `vectorSearch` must be able to return stale ids (a deleted doc) so index-lag tests work. Scenarios 1–9 from plan section 10.

**B2 — identity, policy, remember** (`tests/core/remember.test.ts`)
`rejects_missing_ttl`, `rejects_ttl_over_max_for_type` (fix ≤ 30d, playbook ≤ 90d, preference ≤ 365d), `rejects_scope_broader_than_caller`, `rejects_unknown_purpose`, `quarantines_instruction_text`, `dedupes_same_claimKey_and_hash`, `marks_conflict_same_claimKey`, `forged_tenantId_in_input_stripped`, `read_permission_does_not_allow_write`.

**B3 — recall + lifecycle** (`tests/core/recall.test.ts`, `tests/core/lifecycle.test.ts`)
Recall: `returns_valid_fix`, `excludes_wrong_version` (fix `<2.0.0`, alert `2.3.1`), `excludes_wrong_service`, `excludes_quarantined_and_disputed`, `denies_unknown_purpose`, `empty_when_no_precedent`, `stale_index_recheck_drops_deleted`, `rejected_ids_have_reason_codes`. Add the expiry boundary trio: `expiresAt − 1ms` eligible, `expiresAt` ineligible, `expiresAt + 1ms` ineligible.
Lifecycle: `correct_supersedes_and_versions`, `correct_invalidates_derived`, `forget_denies_immediately`, `forget_cascades_via_derivedFrom`, `forget_preserves_unrelated_similar_memory`, `forget_probe_id_text_paraphrase_all_empty`, `relearn_after_forget`, `promote_requires_reviewer`, `derived_inherits_narrowest_scope`.
Rerank formula: `0.6*sim + 0.2*confidence + 0.1*authority + 0.1*recency`. Recency affects ranking only, never eligibility.

**B4 — agent** (`tests/agent/agent.test.ts`)
`no_precedent_investigates`, `valid_fix_uses_nonce_pool_and_usedMemoryIds`, `expired_fix_investigates`, `rejects_unlisted_tool`, `memory_text_cannot_add_tool`, `unreferenced_usedMemoryIds_invalid`, `emits_all_step_events_in_order`, `trace_write_failure_does_not_stop_agent_and_marks_incomplete`, `rationale_contains_rule_and_evidenceIds`. Add a test for each scenario 1–9 and a tool-guard test that rechecks memory validity right before `tool_executed`.

**B5 — proof** (`tests/proof/proof.test.ts`)
`prompt_identical_outside_memory_block`, `placebo_token_length_within_2pct`, `arm_R_success_ge_95pct`, `arm_O_and_P_fail_on_nonce_tasks`, `counterfactual_changes_only_target_arg`, `harmful_adoption_zero_for_expired_wrongversion_foreign_deleted`, `scorer_blind_to_arm`. Add Wilson-interval tests with known values.

**B6/B7 — dashboard + monitor.** API route tests (identity from session, forged body fields ignored, tenant isolation of traces) come first. Then pages. Then a manual browser check, reported honestly.

**B8 — README + demo script.** Rehearse the plan section 14 script twice, ≤ 3 minutes.

## 4. DO

- Build `core` against the interfaces in `src/contracts/contracts.ts` only.
- Validate every boundary input with `zod` and **strip unknown keys** (this is what removes forged `tenantId` and `scopeId`).
- Resolve `Principal` server-side from the session token. Pass the `Principal` into every repo call.
- Take time only from the injected `Clock`.
- **Fail closed**: unknown principal, missing policy, invalid time, invalid scope, failed recheck → deny. Never broaden scope to make a call succeed.
- Run the full recall pipeline in order: identity → purpose → scope intersection → embed → vector search → **recheck** → applicability → rerank → token budget → evidence cards → audit.
- Treat vector results as a candidate list only. Always reload from the repo and re-verify tenant, scope, status, tombstone, expiry, quarantine.
- Write an audit row for every op, including denies. If the audit write fails, the op fails closed.
- Return reason codes for every rejected candidate: `EXPIRED`, `WRONG_VERSION`, `WRONG_SERVICE`, `OTHER_SCOPE`, `QUARANTINED`, `TOMBSTONED`, `STALE_INDEX`.
- Wrap retrieved memory as data in evidence cards. Cards carry no DB records and no foreign ids.
- Emit trace events in order: `alert_received`, `recall_requested`, `recall_result`, `brain_input`, `brain_decision`, `tool_validation`, `tool_executed`, `memory_written`, `trace_closed`. Intent (`brain_decision`, `tool_validation`) is written before `tool_executed`.
- Make the agent choose `investigate` when recall is empty or nothing is applicable.
- Require `usedMemoryIds` to reference ids actually present in the evidence cards.
- Use `semver` for version applicability. Reject invalid ranges as non-applicable, not as match.
- Keep nonces seed-generated. Fixed fixtures only for the live demo.
- Report numbers with sample counts (`0 / 300`), never "impossible" or "secure".
- Keep commits small, one per red state and one per green state.

## 5. DO NOT

- Do not import `mongodb`, or touch any collection, outside `src/db` and `scripts`. Person B never imports it at all.
- Do not edit `src/db/**`, `scripts/**`, `tests/db/**`. If you need a repo behavior, ask A; do not work around it.
- Do not change `contracts.ts` alone after it is frozen.
- Do not read `tenantId`, `scopeId`, role, or purposes from request bodies, query strings, prompt text, or memory text.
- Do not call `Date.now()`, `new Date()` for logic, or `setTimeout`-based timing outside `Clock` implementations and UI-only rendering.
- Do not put raw memory text, secrets, or another tenant's data in audit rows, trace events, logs, error messages, or the Monitor tab. IDs, hashes, reason codes, short redacted summaries only. Full text appears only on the Memories page behind the same policy check as `recall`.
- Do not add `update` or `delete` methods to anything that implements `TraceStore`. It is append-only.
- Do not let a trace write failure stop the agent. Mark the trace `complete: false` and continue. Audit failures are different: they fail the op.
- Do not let memory text grant tools, args, permissions, or scopes. Tools come from the allowlist only, validated separately by zod.
- Do not make `forget` accept a query, wildcard, or list of unrelated ids. One id plus provenance-derived children only.
- Do not let an agent hard-delete. It calls `forget`; policy decides. Team-scope `forget` needs `reviewer` or `admin`.
- Do not let read permission imply write, correct, forget, or promote.
- Do not use TTL indexes or recency as an eligibility rule. Expiry is a read-time hard gate.
- Do not let a derived memory be broader than its narrowest source. Only `promote()` by a reviewer broadens, and it creates a new audited memory.
- Do not tune the proof harness to hit targets: no arm-specific prompt text, no leaking arm labels to scorers, no reusing nonces across seeds, no cherry-picked seeds.
- Do not claim the deterministic brain proves model behavior. State which brain produced each number.
- Do not add dependencies beyond plan section 2.1 without asking. Do not add third-party services or telemetry.
- Do not commit `.env`, API keys, Mongo URIs, or downloaded model weights.
- Do not skip, `.only`, or delete tests. Do not use `--no-verify`. Do not force-push or rewrite shared history.
- Do not build deferred scope early: LLM brain, `promote` polish, alert worker, disputed-state polish are cut-list items. The cut order is LLM brain → `promote` → alert worker → dashboard polish → disputed state.
- **Never cut**: isolation suite, expiry boundary tests, forget probes, proof harness, trace events.

## 6. Guardrail map for Person B (from plan section 8)

| ID | Rule | Where | Test |
|---|---|---|---|
| G1 | Tenant from session only; schema strips fields | `identity`, zod | forged tenantId ignored |
| G2 | Unknown principal/purpose/scope → deny | `policy` | table-driven deny tests |
| G4 | Prefilter has tenant/scope/status/validity/expiry | `recall` | filter unit test on the query passed to `vectorSearch` |
| G5 | Recheck after vector search | `recall` | stale-index simulation |
| G6 | Expiry hard gate at boundary | `recall`, tool exec | t−1 / t / t+1 |
| G7 | Applicability (service/version/env) | `applicability` | wrong-version test |
| G8 | Derived memory inherits narrowest scope | `lifecycle` | derivation test |
| G9 | Promote needs reviewer, creates new audited memory | `lifecycle` | promote test |
| G10 | TTL required and ≤ max per type | `remember` | validation test |
| G11 | Injection-like text quarantined | `inject-scan` | quarantine test |
| G12 | Quarantined/disputed never recalled | `recall` | status test |
| G13 | Tombstone first, then cascade | `lifecycle` | cascade test |
| G15 | Audit every op, ids/hashes only | `audit` calls | completeness + raw-text scan |
| G16 | Tools validated separately from memory | `agent/tools` | tool-guard test |
| G17 | Memory text never grants permissions | `agent` | injection test |
| G18 | Injected `Clock` only | all | grep test |
| G19 | No precedent → `investigate` | `agent` | abstain test |
| G20 | Prompt identical outside memory block | `eval` | prompt-diff test |
| G23 | Traces append-only, tenant-scoped, ids/hashes only | trace usage | monitor tests |
| G24 | Intent logged before `tool_executed` | `agent` | event-order test |
| G25 | Trace failure never blocks agent | `agent` | failure-injection test |

G3, G14, G21, G22 belong to Person A. The driver-boundary test is joint and must stay green.

## 7. Validation checklist before every commit

Run and report real output. If something fails, say so; do not summarize it away.

```bash
npx tsc --noEmit
npx vitest run tests/core tests/agent tests/proof
npx vitest run tests/security/driver-boundary.test.ts
```

Also confirm by grep that:
- `src/core`, `src/agent`, `src/eval`, `src/app`, `src/fakes` contain no `from "mongodb"` and no `Date.now(`.
- No `.only(` or `.skip(` in tests.
- No raw memory text appears in any audit or trace payload built by your code (a test scans for seeded canary strings).

## 8. Integration and definition of done

- Integration happens only after A2–A4 and B2–B3 are done. Swap `Fake*` for `Mongo*` in `src/core/index.ts` only. No test logic changes.
- Run `npx vitest run`. Expected: all pass, `leaks: 0/300`, trace completeness 100%.
- Run the proof with N ≥ 20 seeds against Atlas and save the report.
- Proof targets: R success ≥ 95%; Ø and P ≈ 0% on nonce tasks; R−P lower CI bound ≥ 15 points; targeted response ≥ 90%; collateral stability ≥ 98%; harmful adoption = 0.
- Done = `plan.md` section 16 checklist, all items.

## 9. Honest-limits (must appear in README and demo)

- Isolation is application-enforced logical isolation in a shared collection. Zero leaks in N tests is not a proof of impossibility.
- Forgetting means the agent cannot recover the memory from our stores. Atlas backups and external copies are out of scope.
- The deterministic brain proves plumbing and governance, not model behavior. Headline model numbers come only from the LLM brain, and are reported only if it was run.
- The proof shows that changing memory input under control changes the observable action. It does not show the model's internal mechanism.

## 10. Working agreements

- Ask the user before: changing contracts, adding dependencies, touching Person A's files, pushing, opening PRs, or deviating from plan test names.
- Spec conflict or gap (e.g. missing fake stores, ambiguous behavior): write it down, pick the safest fail-closed reading, and flag it in the commit message and to the user.
- Commit style: `test(Bn): ...` for red, `feat(Bn): ...` for green, `fix(...)`/`refactor(...)` otherwise.

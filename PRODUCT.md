# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
On-call responders who triage incidents with an agent that remembers past fixes, and the judges and stakeholders who watch a live demo of the governance (scope, expiry, forget) working. Both need to see what the agent recalled, why it acted, and what it changed in memory.

## Product Purpose
A governed memory layer for an incident-triage agent. Every memory is scoped, versioned, expiring and audited; recall is policy-checked and the agent can save, update and forget memory. The UI lets a person chat with the agent, watch its memory activity, inspect and manage memories, read the audit trail, and see proof numbers.

## Positioning
Memory the agent can lose on purpose: forgetting is a first-class, audited, verifiable operation, not a side effect.

## Operating Context
Next.js app (React 19) in `src/app`. Pages: Chat, Monitor (KPIs and alerts), Memories, Audit, Proofs. Session picker chooses the acting principal; identity is resolved server-side. Chat history lives in the browser per session.

## Capabilities and Constraints
- Raw memory text appears only on the Memories page (and chat evidence cards behind the same recall policy). Audit, trace and Monitor show ids, hashes, reason codes only.
- Time comes from the injected Clock; no Date.now() in app logic (UI-only rendering excepted).
- Numbers are reported with sample counts (e.g. 0 / 300), never "impossible" or "secure".
- The deterministic brain proves plumbing, not model behavior; the UI states which brain produced a result.
- Dependencies beyond the plan need approval. Approved for this redesign: three, @react-three/fiber, @react-three/drei.

## Evidence on Hand
Real data from the running app (monitor metrics, audit rows, memories, proof reports). No testimonials or customers exist; none may be invented.

## Product Principles
1. Show governance happening, not just results: recall, rejection reason codes, saves, updates, forgets.
2. Never expose raw memory text outside its permitted surface.
3. Numbers carry their sample size.
4. Motion explains state change; it never hides data.

## Accessibility & Inclusion
Respect prefers-reduced-motion (3D scenes fall back to static or 2D). Every 3D visual has a text/number equivalent. WCAG AA contrast.

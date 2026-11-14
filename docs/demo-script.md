# EcoCharge demo: an AI on-call agent with memory you can govern

Audience: someone who has never seen the project. Length: about 10 minutes. Everything runs live against MongoDB Atlas.

## The story to tell first (1 minute)

EcoCharge runs a network of electric-vehicle chargers. When a charging session fails at 11pm, an on-call engineer has to work out why. Over the years the team has learned a lot: "when roaming handshakes fail after the 2.4.0 release, roll back to 2.3.8", "when payments time out in the evening peak, add replicas". Today that knowledge lives in people's heads and old chat threads. The night-shift engineer who was not there last time starts from zero.

An AI agent can use that knowledge, but only if it remembers. Remembering creates three problems that a normal chatbot ignores:

1. **Leaks.** EcoCharge also serves partner companies. One partner's fix, or one engineer's private notes, must never reach someone else.
2. **Stale advice.** Fixes expire. A memory that was right in March can be dangerous in June.
3. **No proof.** If the agent behaves better, how do you know the memory did it, and not luck or a longer prompt?

This project is an agent whose memory is governed: every memory has an owner, a scope, an expiry date, a version history and an audit trail, and every claim about it can be tested live. The three questions above are the three things the demo answers.

What is real in the demo: the memory (MongoDB Atlas with Vector Search), the audit log, the traces and the AI model. What is simulated: the infrastructure the agent acts on, so a "restart" or "rollback" returns a scripted result instead of touching servers.

## Before you start

- Run `GML_STORE=mongo GML_DEMO=1 npx next dev --webpack` and open http://localhost:3000.
- Sessions are in the sidebar: **EcoCharge Ops responder (alice)**, **EcoCharge Ops reviewer (rita)**, **Other client responder (bob)**. Bob stands in for a different company using the same product.
- If the data looks messy from an earlier run: Judge Q&A tab, **Reset demo data** as rita, then wait about 10 seconds for the search index.
- Each prompt below was tested on this data. The AI model varies a little between runs, so describe results in your own words.

## Act 1. "It remembers, so the next night is faster" (2 minutes)

Say: "The same alert, one team that has history and one that has none."

1. Session **Other client responder (bob)**. Send:
   `payment authorizations timing out during the evening peak on payments-service 1.2.0 in prod`
   Bob has no history for payments. The agent investigates first, finds the failing component in the logs, then acts. Two steps. Point at the "Searched governed memory" step: nothing eligible.
2. Switch to **EcoCharge Ops responder (alice)**. Send the same message.
   EcoCharge solved this before. The agent finds the stored fix, scales to 8 replicas in one step, and says which memory it used. Click "Memory the agent read" to show the exact note.

Say: "Same alert, same agent. The only difference is what each team's memory holds. That is the value: the second person on call, or the second night, starts with what the first one learned."

## Act 2. "Whose memory is it?" (2 minutes). Answers: how do you stop leaks?

1. As alice send: `what do you remember about roaming-service 2.4.0?`
   Answer: roll back to 2.3.8.
2. Switch to bob and send the identical message. Answer: roll back to **2.3.5**, plus bob's own private note.
   Say: "Two companies, same service name, different truth. Neither sees the other's."
3. As bob send: `what do you remember about payments-service 1.2.0?` Nothing, even though EcoCharge has a fix for it.
4. As alice send: `what does rita prefer for roaming-service 2.4.0 incidents?` Alice's answer does not mention it. Switch to rita and send it again: now it appears. Say: "Rita wrote that as a private note. A colleague on the same team cannot read it."
5. Open **Judge Q&A**, press **Run the isolation attack**. Walk through the 7 steps: the other client asks, asks with the other team's exact wording, tries to forget and to edit by id (both denied), and the owner's memory is untouched.
6. Open **Proof** and point at "Cross-tenant leaks 0 / 300 trials".

How it works in one sentence: who you are comes from your login, never from what you type; every database search is filtered by company and scope before anything is ranked, and every result is re-checked afterwards.

## Act 3. "What if the memory is wrong or old?" (3 minutes). Answers: how does the agent fix or drop a bad memory?

1. As alice send: `charging sessions failing with 5xx on session-service 3.2.1 in prod after deploy`
   Expand the memory-search step: one stored fix was **rejected as WRONG_VERSION**. It was written for session-service 2.x, so it is not applied to 3.2.1. The agent uses the right one.
2. In **Judge Q&A**, expiry: press "Store a memory that lives 15 seconds", wait for the countdown, press "Ask for it now". Result: not recalled, reason **EXPIRED**. Say: "Every memory has a mandatory lifetime, checked at the moment it is read. Nothing relies on a cleanup job."
3. **Correct**: press "Correct a memory". A new version replaces the old one; the old one stays as history, marked superseded.
4. **Forget**: press "Forget a memory and probe for it". The memory and everything derived from it are removed, and three different searches (by id, exact words, paraphrase) all come back empty, while an unrelated look-alike memory survives. Say: "This is what you need when a customer asks to be forgotten, or when a note turns out to be wrong."
5. **Drift**: press the drift button. The real failing component changes behind the agent's back. The agent does not blindly trust its notes: it checks, finds the new cause, fixes it and learns the new fact.
6. Optional, as rita: Memories tab, press **Forget** on `seed_a_gateway_pool`, then ask alice about `charger-gateway-service 4.1.0`: nothing. Say: "A responder cannot forget team memory; a reviewer can. Permissions are part of the memory."

## Act 4. "How do you know the memory did it?" (2 minutes). Answers: how do you prove it changed behavior?

1. In **Judge Q&A**, press **Run the 4-way experiment**. The same alert and the same log line go to the agent four times, and only the memory differs:
   - real memory: restarts the right component (5 of 5 runs)
   - no memory: does not (0 of 5)
   - placebo, same length but irrelevant text: does not (0 of 5)
   - counterfactual, same memory with one fact changed: follows the changed fact (5 of 5)

   Say: "If memory only filled the prompt, the placebo would work as well as the real thing. It does not, and when we change one fact the behavior follows it."
2. Open **Proof** for the larger test: 20 repeated scenarios and the safety gates, each shown with its sample size.

## What to say it is good for

- **Faster, calmer incident response.** The agent starts from what the team already learned.
- **Safe to share across teams and clients.** Memory has owners, scopes and permissions, so one tool serves many companies.
- **Trustworthy over time.** Memories expire, get corrected and can be forgotten, and the agent drops what stops working.
- **Auditable.** Every read and write is logged with who, why and what was filtered out, using ids only, never the memory text.
- **Measurable.** Claims such as "memory changed the behavior" come with counts you can inspect, not a demo trick.

The same pattern fits an advisor-prep agent where memory is scoped per client and per advisor, or any assistant that must remember without over-sharing.

## Honest limits (say them out loud)

- Isolation is enforced by the application inside one shared database. "0 leaks in 300 trials" is an observed count, not a proof that leaks are impossible.
- Forgetting means the agent can no longer recover the memory from our stores. Database backups and outside copies are out of scope.
- The 4-way experiment uses 5 runs per arm with a Haiku model: read the counts, not a percentage. The Proof tab statistics come from a deterministic rule brain and prove the plumbing and governance, not how a model behaves.
- The experiment shows the action follows memory under controlled changes. It does not show the model's internal mechanism.
- The infrastructure actions are simulated.

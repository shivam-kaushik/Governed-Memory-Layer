# EcoCharge demo (about 3 minutes)

Setup: `GML_STORE=mongo GML_DEMO=1 npx next dev --webpack`, then open http://localhost:3000, pick **EcoCharge Ops reviewer (rita)**, open the **Judge Q&A** tab. If a run left the data messy, press **Reset demo data** at the bottom and wait about 10 seconds.

EcoCharge is the example company: an EV charging network. Its on-call agent triages incidents such as `charging sessions failing with 5xx on session-service`. Memory lives in MongoDB Atlas with Vector Search. Infrastructure tools are simulated; memory, audit, traces and the model are real.

1. **Leaks.** Press *Run the isolation attack*. Point at: the other client asks the same alert and gets 0 cards from EcoCharge; the exact-text probe leaks 0; a colleague's private note stays hidden; forget and correct by id are denied. Then show the Proof tab: cross-tenant leaks 0 / 300 trials.
2. **Wrong or expired.** Press *Store a memory that lives 15 seconds*, wait for the countdown, press *Ask for it now* (reason code EXPIRED). Press *Correct a memory* (new version, old one superseded). Press *Forget a memory* (cascade, three probes empty, unrelated memory survives). Press the drift button: the real pool changes, the agent notices and relearns.
3. **Behavior.** Press *Run the 4-way experiment*. Real memory restarts the true pool, no memory and the placebo do not, and the counterfactual follows the changed fact. Then Proof tab for the 20-seed numbers.

Honest limits to say out loud: isolation is application-enforced in a shared collection, and zero in N trials is not proof of impossibility. Forgetting means the agent cannot recover the memory from our stores, not that Atlas backups are erased. The 4-way experiment uses 5 runs per arm with the Haiku model; the Proof tab statistics come from the deterministic brain and prove plumbing and governance, not model behavior. The experiment varies one fact, so it shows the action follows memory, not the model's internal mechanism.

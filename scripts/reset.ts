import { getDb, closeDb } from "../src/db/client.js";
import { resetAll } from "../src/db/seed.js";
import { createEmbedder } from "../src/db/embedder.js";
import { systemClock } from "../src/db/system-clock.js";

const db = await getDb();
const t0 = performance.now();
await resetAll(db, createEmbedder(), systemClock);
console.log(`reset complete in ${Math.round(performance.now() - t0)} ms`);
await closeDb();

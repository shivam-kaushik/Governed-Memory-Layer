import { getDb, closeDb } from "../src/db/client.js";
import { seedAll } from "../src/db/seed.js";
import { createEmbedder } from "../src/db/embedder.js";
import { systemClock } from "../src/db/system-clock.js";

const db = await getDb();
await seedAll(db, createEmbedder(), systemClock);
console.log("seeded principals and memories (run `npm run reset` to wipe and reseed)");
await closeDb();

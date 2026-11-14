import { getDb, closeDb } from "../src/db/client.js";
import { COLLECTIONS } from "../src/db/bootstrap.js";
import { VECTOR_INDEX_NAME } from "../src/db/vector-index.js";

const db = await getDb();
const infos = (await db.listCollections().toArray()) as any[];
for (const name of COLLECTIONS) {
  const info = infos.find((c) => c.name === name);
  const count = info ? await db.collection(name).estimatedDocumentCount() : 0;
  const validator = !!info?.options?.validator;
  console.log(`${name.padEnd(14)} exists=${!!info} docs=${count} validator=${validator}`);
}
try {
  const idx = (await db.collection("memories").listSearchIndexes(VECTOR_INDEX_NAME).toArray()) as any[];
  console.log(`vector index ${VECTOR_INDEX_NAME}: ${idx[0]?.status ?? "MISSING"} queryable=${idx[0]?.queryable}`);
} catch (e) {
  console.log(`vector index: cannot list (${(e as Error).message}) - is this an Atlas cluster?`);
}
try {
  const cs = db.collection("agent_traces").watch();
  await cs.close();
  console.log("change streams: supported");
} catch {
  console.log("change streams: NOT supported -> feed.ts will use polling fallback");
}
await closeDb();

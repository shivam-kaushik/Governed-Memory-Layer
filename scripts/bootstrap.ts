import { getDb, closeDb } from "../src/db/client.js";
import { bootstrap } from "../src/db/bootstrap.js";
import { waitForIndexReady, VECTOR_INDEX_NAME } from "../src/db/vector-index.js";

const db = await getDb();
await bootstrap(db);
console.log("collections, validators, indexes created; waiting for vector index READY...");
await waitForIndexReady(db, VECTOR_INDEX_NAME, 300_000);
console.log("vector index READY");
await closeDb();

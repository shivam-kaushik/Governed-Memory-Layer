import type { Db } from "mongodb";
import { VALIDATORS } from "./validators.js";
import { ensureIndexes } from "./indexes.js";
import { ensureVectorIndex } from "./vector-index.js";

export const COLLECTIONS = ["memories", "principals", "audit", "tombstones", "eval_runs", "agent_traces"] as const;

// Idempotent: safe to run repeatedly. vectorIndex:false for local (non-Atlas) databases.
export async function bootstrap(db: Db, opts: { vectorIndex?: boolean } = {}): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of COLLECTIONS) {
    const validator = VALIDATORS[name];
    if (!existing.has(name)) {
      await db.createCollection(name, validator ? { validator, validationLevel: "strict", validationAction: "error" } : {});
    } else if (validator) {
      await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
    }
  }
  await ensureIndexes(db);
  if (opts.vectorIndex ?? true) await ensureVectorIndex(db);
}

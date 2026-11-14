import { MongoClient, type Db } from "mongodb";
import "dotenv/config";

let client: MongoClient | null = null;

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (see .env.example)");
  if (!client) client = await new MongoClient(uri).connect();
  return client.db(process.env.MONGODB_DB ?? "governed_memory");
}

export async function closeDb(): Promise<void> {
  if (client) { await client.close(); client = null; }
}

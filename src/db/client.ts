import { MongoClient, type Db } from "mongodb";
import dns from "node:dns";
import "dotenv/config";

// Some networks/ISPs refuse the SRV lookup that mongodb+srv:// needs from Node's resolver.
// MONGODB_DNS_SERVERS (comma separated) overrides it; default to public resolvers for SRV URIs.
if (process.env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  dns.setServers((process.env.MONGODB_DNS_SERVERS ?? "8.8.8.8,1.1.1.1").split(","));
}

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

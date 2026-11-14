import dns from "node:dns";
import "dotenv/config";

// Some networks/ISPs refuse the SRV lookup that mongodb+srv:// needs from Node's resolver.
// MONGODB_DNS_SERVERS (comma separated) overrides it; default to public resolvers for SRV URIs.
// Import this module (for its side effect) before creating any MongoClient.
if (process.env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  dns.setServers((process.env.MONGODB_DNS_SERVERS ?? "8.8.8.8,1.1.1.1").split(","));
}

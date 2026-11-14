import type { Alert } from "../contracts/contracts";
import { sha256 } from "../core/audit";

const SERVICE = /\b([a-z][a-z0-9]*(?:-[a-z0-9]+)*-service)\b/i;
const VERSION = /\bv?(\d+\.\d+\.\d+)\b/;
const ENV = /\b(prod|production|staging|stage|dev)\b/i;

// Turns a typed incident message into an Alert. Fields come only from this text; identity never does.
// shortcut: regex extraction needs "<name>-service" and "x.y.z" in the text, upgrade to an LLM parser if chat gets freer.
export function parseAlertMessage(message: string): Alert | null {
  const service = SERVICE.exec(message)?.[1]?.toLowerCase();
  const version = VERSION.exec(message)?.[1];
  if (!service || !version) return null;
  const env = ENV.exec(message)?.[1]?.toLowerCase();
  const environment = env === undefined || env === "production" ? "prod" : env === "stage" ? "staging" : env;
  return { id: `chat-${sha256(message).slice(0, 10)}`, service, version, environment, symptom: message, text: message };
}

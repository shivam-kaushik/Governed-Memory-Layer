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

export interface ChatContext { service: string; version: string; environment: string }

// Free chat: never fails. Fields come from the text, then from earlier turns of the same chat, then placeholders that match no service memory.
// shortcut: placeholders make recall reject service-scoped memories (WRONG_SERVICE), which is the honest answer for "no incident named".
export function parseChatMessage(message: string, ctx?: ChatContext): { alert: Alert; inferred: { service: boolean; version: boolean } } {
  const parsed = parseAlertMessage(message);
  const service = parsed?.service ?? SERVICE.exec(message)?.[1]?.toLowerCase() ?? ctx?.service ?? "unknown-service";
  const version = parsed?.version ?? VERSION.exec(message)?.[1] ?? ctx?.version ?? "0.0.0";
  const env = ENV.exec(message)?.[1]?.toLowerCase();
  const environment = env === undefined ? (ctx?.environment ?? "prod") : env === "production" ? "prod" : env === "stage" ? "staging" : env;
  const base = parsed ?? { id: `chat-${sha256(message).slice(0, 10)}`, service, version, environment, symptom: message, text: message };
  return {
    alert: { ...base, service, version, environment },
    inferred: { service: !SERVICE.test(message), version: !VERSION.test(message) },
  };
}

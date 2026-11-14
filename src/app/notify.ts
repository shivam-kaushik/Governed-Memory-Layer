export type NotifyKind = "ESCALATE" | "BLOCKED" | "FORGOT_STALE_MEMORY";
export interface NotifyEvent {
  kind: NotifyKind;
  alertId: string;
  traceId: string;
  detail: string; // reason codes only
}
export interface Notifier {
  configured: boolean;
  notify(e: NotifyEvent): Promise<{ ok: boolean; detail: string }>;
}

export const noopNotifier: Notifier = { configured: false, notify: async () => ({ ok: false, detail: "NOT_CONFIGURED" }) };

const clean = (s: string) => s.replace(/[^A-Za-z0-9_,:. -]/g, "").slice(0, 80);

export interface VonageConfig {
  apiKey: string;
  apiSecret: string;
  from: string;
  to: string;
  fetch?: typeof fetch;
  maxSends?: number;
}

// Vonage SMS API. Text carries ids and reason codes only, never memory text. Failures never throw: the agent must not depend on SMS.
export function createVonageNotifier(c: VonageConfig): Notifier {
  const doFetch = c.fetch ?? fetch;
  const cap = c.maxSends ?? 20; // cost guard per process
  let sent = 0;
  return {
    configured: true,
    async notify(e) {
      if (sent >= cap) return { ok: false, detail: "SEND_CAP" };
      sent++;
      const text = clean(`GML ${e.kind}: alert ${e.alertId} trace ${e.traceId} ${e.detail}`);
      try {
        const res = await doFetch("https://rest.nexmo.com/sms/json", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ api_key: c.apiKey, api_secret: c.apiSecret, from: c.from, to: c.to, text }).toString(),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { ok: false, detail: `HTTP_${res.status}` };
        const status = ((await res.json()) as { messages?: { status?: string }[] }).messages?.[0]?.status;
        return status === "0" ? { ok: true, detail: "sent" } : { ok: false, detail: `VONAGE_STATUS_${String(status ?? "unknown").replace(/\W/g, "")}` };
      } catch {
        return { ok: false, detail: "SEND_FAILED" };
      }
    },
  };
}

export function notifierFromEnv(env: Record<string, string | undefined>, f?: typeof fetch): Notifier {
  const { VONAGE_API_KEY: apiKey, VONAGE_API_SECRET: apiSecret, VONAGE_FROM: from, VONAGE_TO: to } = env;
  return apiKey && apiSecret && from && to ? createVonageNotifier({ apiKey, apiSecret, from, to, ...(f ? { fetch: f } : {}) }) : noopNotifier;
}

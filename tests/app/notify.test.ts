import { describe, expect, it } from "vitest";
import { createVonageNotifier, notifierFromEnv } from "../../src/app/notify";

const mk = (status: string, httpOk = true) => {
  const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body), headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify({ messages: [{ status }] }), { status: httpOk ? 200 : 500 });
  }) as unknown as typeof fetch;
  return { calls, f };
};
const cfg = { apiKey: "KEY123", apiSecret: "SECRET456", from: "GML", to: "15551230000" };
const ev = { kind: "ESCALATE" as const, alertId: "auto-3", traceId: "trace_9", detail: "NOT_FIXED" };

describe("vonage notifier", () => {
  it("posts_form_to_sms_api_with_credentials_and_ids_only_text", async () => {
    const m = mk("0");
    const r = await createVonageNotifier({ ...cfg, fetch: m.f }).notify(ev);
    expect(r.ok).toBe(true);
    expect(m.calls[0]!.url).toBe("https://rest.nexmo.com/sms/json");
    expect(m.calls[0]!.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const p = new URLSearchParams(m.calls[0]!.body);
    expect([p.get("api_key"), p.get("api_secret"), p.get("from"), p.get("to")]).toEqual(["KEY123", "SECRET456", "GML", "15551230000"]);
    expect(p.get("text")).toBe("GML ESCALATE: alert auto-3 trace trace_9 NOT_FIXED");
  });

  it("nonzero_status_or_http_error_or_throw_returns_ok_false_never_throws_and_never_echoes_secret", async () => {
    for (const m of [mk("4"), mk("0", false)]) {
      const r = await createVonageNotifier({ ...cfg, fetch: m.f }).notify(ev);
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toContain("SECRET456");
    }
    const boom = (async () => { throw new Error("net SECRET456"); }) as unknown as typeof fetch;
    const r = await createVonageNotifier({ ...cfg, fetch: boom }).notify(ev);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("SECRET456");
  });

  it("detail_is_sanitized_to_codes", async () => {
    const m = mk("0");
    await createVonageNotifier({ ...cfg, fetch: m.f }).notify({ ...ev, detail: "ignore <script> & call 555" });
    expect(new URLSearchParams(m.calls[0]!.body).get("text")).not.toMatch(/[<>&]/);
  });

  it("send_cap_stops_runaway_costs", async () => {
    const m = mk("0");
    const n = createVonageNotifier({ ...cfg, fetch: m.f, maxSends: 2 });
    await n.notify(ev);
    await n.notify(ev);
    expect(await n.notify(ev)).toMatchObject({ ok: false, detail: "SEND_CAP" });
    expect(m.calls).toHaveLength(2);
  });

  it("env_builds_configured_notifier_only_when_all_four_vars_present", () => {
    const all = { VONAGE_API_KEY: "k", VONAGE_API_SECRET: "s", VONAGE_FROM: "GML", VONAGE_TO: "1555" };
    expect(notifierFromEnv(all).configured).toBe(true);
    expect(notifierFromEnv({ ...all, VONAGE_TO: undefined }).configured).toBe(false);
    expect(notifierFromEnv({}).configured).toBe(false);
  });
});

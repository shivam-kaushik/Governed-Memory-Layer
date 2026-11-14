import { describe, expect, it } from "vitest";
import { toApiRequest, toResponse } from "../../src/app/http";

describe("http adapter", () => {
  it("maps_method_path_query_headers_and_json_body", async () => {
    const r = new Request("http://x/api/audit?limit=5", {
      method: "POST",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body: JSON.stringify({ id: "m1" }),
    });
    const q = await toApiRequest(r);
    expect(q.method).toBe("POST");
    expect(q.path).toBe("/api/audit");
    expect(q.query).toEqual({ limit: "5" });
    expect(q.headers["authorization"]).toBe("Bearer t");
    expect(q.body).toEqual({ id: "m1" });
  });

  it("invalid_json_body_becomes_undefined_not_a_throw", async () => {
    const r = new Request("http://x/api/memories/forget", { method: "POST", body: "{nope" });
    expect((await toApiRequest(r)).body).toBeUndefined();
  });

  it("get_has_no_body", async () => {
    expect((await toApiRequest(new Request("http://x/api/memories"))).body).toBeUndefined();
  });

  it("response_carries_status_json_and_no_store", async () => {
    const res = toResponse({ status: 403, json: { error: "OP_DENIED" } });
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "OP_DENIED" });
  });
});

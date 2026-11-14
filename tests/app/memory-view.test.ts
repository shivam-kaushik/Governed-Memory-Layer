import { describe, expect, it } from "vitest";
import { A_RESP, apiWorld } from "./helpers";

type J = Record<string, any>;
const DAY = 86_400_000;

describe("memory rows carry what the Memories tab shows", () => {
  it("includes_source_authority_and_provenance", async () => {
    const w = await apiWorld();
    const m = ((await w.call("GET", "/api/memories", A_RESP)).json as J).memories[0];
    expect(typeof m.sourceAuthority).toBe("number");
    expect(m.source).toBeDefined();
    expect(m.displayStatus).toBe("active");
  });
  it("display_status_is_expired_once_the_clock_passes_expiry", async () => {
    const w = await apiWorld();
    w.clock.advanceMs!(400 * DAY);
    const m = ((await w.call("GET", "/api/memories", A_RESP)).json as J).memories[0];
    expect(m.status).toBe("active"); // stored status is untouched: expiry is a read-time gate
    expect(m.displayStatus).toBe("expired");
  });
});

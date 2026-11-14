import type { Clock } from "../contracts/contracts.js";

// The only real-time source in src/db (G18). Everything else takes an injected Clock.
export const systemClock: Clock = { nowMs: () => Date.now() };

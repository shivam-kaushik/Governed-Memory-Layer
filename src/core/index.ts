import type { MemoryLayer } from "../contracts/contracts";
import type { CoreDeps } from "./deps";
import { correct, forget, promote } from "./lifecycle";
import { recall } from "./recall";
import { remember } from "./remember";

// The one place that binds core ops to their stores. Swapping Fake* for Mongo* happens where deps are built.
export function createMemoryLayer(deps: CoreDeps): MemoryLayer {
  return {
    remember: (input, caller) => remember(deps, input, caller),
    recall: (query, caller) => recall(deps, query, caller),
    correct: (id, patch, caller) => correct(deps, id, patch, caller),
    forget: (id, reason, caller) => forget(deps, id, reason, caller),
    promote: (id, caller) => promote(deps, id, caller),
  };
}

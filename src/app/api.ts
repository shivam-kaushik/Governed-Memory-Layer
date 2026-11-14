import type { ApiContext, ApiRequest, ApiResponse } from "./ports";

// Stub: red state for B6. Behavior arrives in the green commit.
export function createApi(_ctx: ApiContext): (req: ApiRequest) => Promise<ApiResponse> {
  return async () => {
    throw new Error("not implemented");
  };
}

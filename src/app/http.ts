import type { ApiRequest, ApiResponse } from "./ports";

// Web Request -> framework-free ApiRequest. A body that is not valid JSON becomes undefined,
// which the handler's zod schema then rejects as INVALID_INPUT.
export async function toApiRequest(req: Request): Promise<ApiRequest> {
  const url = new URL(req.url);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.json().catch(() => undefined);
  return {
    method: req.method,
    path: url.pathname,
    headers: Object.fromEntries(req.headers.entries()),
    query: Object.fromEntries(url.searchParams.entries()),
    body,
  };
}

export const toResponse = (r: ApiResponse): Response =>
  Response.json(r.json, { status: r.status, headers: { "cache-control": "no-store" } });

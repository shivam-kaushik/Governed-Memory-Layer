export const SESSION_EVENT = "gml-session";
// Client-only; the cookie is an opaque token, never a tenant or role.
export const readSession = () => (typeof document === "undefined" ? "" : (document.cookie.split("; ").find((c) => c.startsWith("session="))?.split("=")[1] ?? ""));

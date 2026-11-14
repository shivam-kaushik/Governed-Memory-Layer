import { cookies } from "next/headers";
import { getServer } from "./server";

// Server components call the same handler the HTTP route uses. Identity is the session cookie only.
export async function load<T>(path: string): Promise<{ status: number; data: T | null }> {
  const token = (await cookies()).get("session")?.value ?? "";
  const r = await (await getServer()).handle({ method: "GET", path, headers: { authorization: `Bearer ${token}` } });
  return { status: r.status, data: r.status === 200 ? (r.json as T) : null };
}

import { z } from "zod";
import type { Principal } from "../contracts/contracts";
import type { PrincipalResolver } from "./deps";

// zod strips unknown keys. Scopes must belong to the principal's own tenant/id.
const schema = z
  .object({
    id: z.string().min(1),
    tenantId: z.string().min(1),
    role: z.enum(["responder", "reviewer", "admin"]),
    scopes: z.array(z.string().min(1)),
    purposes: z.array(z.string().min(1)).min(1),
  })
  .refine((p) => p.scopes.every((s) => s === `team:${p.tenantId}` || s === `private:${p.id}`));

// Fail closed: any problem returns null.
export async function resolvePrincipal(resolver: PrincipalResolver, token: string): Promise<Principal | null> {
  if (!token) return null;
  try {
    const parsed = schema.safeParse(await resolver(token));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

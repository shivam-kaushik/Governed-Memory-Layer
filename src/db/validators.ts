// DB-level backstop only; zod in the app is the primary check (plan 4.3, G22).
const str = { bsonType: "string", minLength: 1 };

export const memoriesValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "tenantId", "scopeId", "expiresAtMs", "status"],
    properties: {
      tenantId: str,
      scopeId: str,
      expiresAtMs: { bsonType: ["double", "int", "long"] },
      status: { enum: ["active", "quarantined", "disputed", "superseded", "expired", "deleted"] },
    },
  },
};

export const auditValidator = {
  $jsonSchema: { bsonType: "object", required: ["tenantId"], properties: { tenantId: str } },
};

export const tracesValidator = {
  $jsonSchema: { bsonType: "object", required: ["tenantId"], properties: { tenantId: str } },
};

export const VALIDATORS: Record<string, object> = {
  memories: memoriesValidator,
  audit: auditValidator,
  agent_traces: tracesValidator,
};

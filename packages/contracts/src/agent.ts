import { z } from "zod";

const jsonSchemaSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

export const agentVariableSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
  type: z.enum(["string", "number", "boolean", "object", "array"]),
  required: z.boolean().default(true),
  description: z.string().max(500).default(""),
  defaultValue: z.unknown().optional(),
  sensitive: z.boolean().default(false)
});

export const agentDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(1).max(1_000),
    purpose: z.string().trim().min(1).max(2_000),
    visibility: z.enum(["private", "workspace"]),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
    prompts: z.object({
      system: z.string().min(1).max(30_000),
      developer: z.string().max(30_000).default(""),
      user: z.string().min(1).max(30_000),
      variables: z.array(agentVariableSchema).max(100).default([])
    }),
    modelPolicy: z.object({
      role: z.enum(["fast", "balanced", "reasoning", "vision"]),
      requiredCapabilities: z
        .array(z.enum(["text", "vision", "structured_output", "tool_use"]))
        .min(1),
      temperature: z.number().min(0).max(2).default(0.2),
      reasoning: z.enum(["none", "low", "medium", "high"]).default("medium"),
      fallbackRoles: z
        .array(z.enum(["fast", "balanced", "reasoning", "vision"]))
        .max(3)
        .default([])
    }),
    inputSchema: jsonSchemaSchema,
    outputSchema: jsonSchemaSchema,
    tools: z
      .array(
        z.object({
          toolKey: z.string().min(1).max(160),
          version: z.number().int().positive(),
          scopes: z.array(z.string().min(1).max(160)).max(50),
          risk: z.enum(["low", "medium", "high", "critical"]),
          environment: z.enum(["fixture", "sandbox", "production"]),
          approvalRequired: z.boolean()
        })
      )
      .max(50)
      .default([]),
    knowledge: z
      .array(
        z.object({
          sourceId: z.string().min(1).max(160),
          permission: z.enum(["read"]),
          required: z.boolean().default(false)
        })
      )
      .max(50)
      .default([]),
    memory: z.object({
      scope: z.enum(["none", "execution", "user_private", "workspace_shared"]),
      retentionDays: z.number().int().min(0).max(2_555),
      purpose: z.string().max(500)
    }),
    limits: z.object({
      maxModelCalls: z.number().int().min(1).max(100),
      maxToolCalls: z.number().int().min(0).max(100),
      maxInputTokens: z.number().int().min(1).max(2_000_000),
      maxOutputTokens: z.number().int().min(1).max(2_000_000),
      maxDurationMs: z.number().int().min(1_000).max(3_600_000),
      maxCostMinor: z.number().int().min(0).max(100_000_000)
    }),
    fallback: z.object({
      behavior: z.enum(["fail", "human_task", "queue"]),
      message: z.string().max(1_000)
    }),
    humanApproval: z.object({
      requiredForRisk: z.array(z.enum(["low", "medium", "high", "critical"])),
      policyId: z.uuid().optional()
    })
  })
  .superRefine((definition, context) => {
    const variables = new Set<string>();
    for (const [index, variable] of definition.prompts.variables.entries()) {
      if (variables.has(variable.key))
        context.addIssue({
          code: "custom",
          message: "DUPLICATE_VARIABLE",
          path: ["prompts", "variables", index, "key"]
        });
      variables.add(variable.key);
    }
    for (const field of ["system", "developer", "user"] as const) {
      const referenced = [...definition.prompts[field].matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/gu)].map(
        (match) => match[1]!
      );
      for (const key of referenced)
        if (!variables.has(key))
          context.addIssue({
            code: "custom",
            message: "UNDECLARED_VARIABLE",
            path: ["prompts", field]
          });
    }
    if (
      definition.tools.some(
        ({ risk, approvalRequired }) => ["high", "critical"].includes(risk) && !approvalRequired
      )
    )
      context.addIssue({
        code: "custom",
        message: "HIGH_RISK_TOOL_REQUIRES_APPROVAL",
        path: ["tools"]
      });
    if (definition.memory.scope !== "none" && !definition.memory.purpose)
      context.addIssue({
        code: "custom",
        message: "MEMORY_PURPOSE_REQUIRED",
        path: ["memory", "purpose"]
      });
  });

export const agentDraftSaveSchema = z.object({
  expectedRevision: z.number().int().positive(),
  definition: agentDefinitionSchema
});

export const agentCreateSchema = z.object({ definition: agentDefinitionSchema });

export const agentSimulationSchema = z.object({
  version: z.number().int().positive().optional(),
  fixture: z.record(z.string(), z.unknown()),
  expectedOutput: z.record(z.string(), z.unknown()).optional()
});

export interface AgentFinding {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly path: string;
  readonly message: string;
}

function matchesType(value: unknown, type: z.infer<typeof agentVariableSchema>["type"]) {
  if (type === "array") return Array.isArray(value);
  if (type === "object")
    return typeof value === "object" && value !== null && !Array.isArray(value);
  return typeof value === type;
}

export function renderAgentPrompts(
  definitionInput: unknown,
  fixture: Readonly<Record<string, unknown>>
) {
  const definition = agentDefinitionSchema.parse(definitionInput);
  const findings: AgentFinding[] = [];
  const values: Record<string, unknown> = {};
  for (const variable of definition.prompts.variables) {
    const value = fixture[variable.key] ?? variable.defaultValue;
    if (value === undefined && variable.required)
      findings.push({
        code: "VARIABLE_REQUIRED",
        severity: "error",
        path: variable.key,
        message: `${variable.key} is required`
      });
    else if (value !== undefined && !matchesType(value, variable.type))
      findings.push({
        code: "VARIABLE_TYPE",
        severity: "error",
        path: variable.key,
        message: `${variable.key} must be ${variable.type}`
      });
    values[variable.key] = value;
  }
  const render = (template: string) =>
    template.replace(/\{\{([a-z][a-z0-9_]*)\}\}/gu, (_match, key: string) => {
      const value = values[key];
      return value === undefined
        ? `[MISSING:${key}]`
        : `<data name="${key}">${JSON.stringify(value)}</data>`;
    });
  const prompts = {
    system: render(definition.prompts.system),
    developer: render(definition.prompts.developer),
    user: render(definition.prompts.user)
  };
  return {
    prompts,
    findings,
    estimatedTokens: Math.ceil(Object.values(prompts).join("\n").length / 4)
  };
}

export function validateAgentDefinition(input: unknown): AgentFinding[] {
  const parsed = agentDefinitionSchema.safeParse(input);
  if (!parsed.success)
    return parsed.error.issues.map((issue) => ({
      code: issue.message,
      severity: "error" as const,
      path: issue.path.join("."),
      message: issue.message
    }));
  const findings: AgentFinding[] = [];
  for (const [name, schema] of [
    ["inputSchema", parsed.data.inputSchema],
    ["outputSchema", parsed.data.outputSchema]
  ] as const) {
    if (schema.type !== "object")
      findings.push({
        code: "ROOT_SCHEMA_OBJECT_REQUIRED",
        severity: "error",
        path: name,
        message: `${name} root type must be object`
      });
  }
  if (parsed.data.tools.some(({ environment }) => environment === "production"))
    findings.push({
      code: "PRODUCTION_TOOL_UNAVAILABLE",
      severity: "error",
      path: "tools",
      message: "Production tools are unavailable until the tool broker milestone"
    });
  return findings;
}

export function diffAgentDefinitions(
  before: z.infer<typeof agentDefinitionSchema>,
  after: z.infer<typeof agentDefinitionSchema>
) {
  const sections = [
    "prompts",
    "modelPolicy",
    "inputSchema",
    "outputSchema",
    "tools",
    "knowledge",
    "memory",
    "limits",
    "fallback",
    "humanApproval"
  ] as const;
  return sections
    .filter((section) => JSON.stringify(before[section]) !== JSON.stringify(after[section]))
    .map((section) => ({ section, before: before[section], after: after[section] }));
}

export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;

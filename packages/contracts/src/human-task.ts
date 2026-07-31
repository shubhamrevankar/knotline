import { z } from "zod";

export const humanFieldTypeSchema = z.enum([
  "text",
  "number",
  "date_time",
  "boolean",
  "choice",
  "multiselect",
  "person",
  "group",
  "file",
  "url",
  "rich_text",
  "json",
  "repeatable"
]);

export interface HumanFormField {
  key: string;
  label: string;
  type: z.infer<typeof humanFieldTypeSchema>;
  required?: boolean | undefined;
  readOnly?: boolean | undefined;
  help?: string | undefined;
  options?: { value: string; label: string }[] | undefined;
  visibleWhen?: { field: string; equals: unknown } | undefined;
  children?: HumanFormField[] | undefined;
}

export const humanFormFieldSchema: z.ZodType<HumanFormField> = z.lazy(() =>
  z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
    label: z.string().min(1).max(160),
    type: humanFieldTypeSchema,
    required: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    help: z.string().max(500).optional(),
    options: z
      .array(z.object({ value: z.string().max(160), label: z.string().max(160) }))
      .max(100)
      .optional(),
    visibleWhen: z.object({ field: z.string(), equals: z.unknown() }).optional(),
    children: z.array(humanFormFieldSchema).max(50).optional()
  })
);

export const humanFormSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    title: z.string().min(1).max(160),
    fields: z.array(humanFormFieldSchema).min(1).max(200)
  })
  .superRefine((form, context) => {
    const keys = new Set<string>();
    for (const field of form.fields) {
      if (keys.has(field.key))
        context.addIssue({
          code: "custom",
          message: "DUPLICATE_FIELD_KEY",
          path: ["fields", field.key]
        });
      keys.add(field.key);
      if (["choice", "multiselect"].includes(field.type) && !field.options?.length)
        context.addIssue({
          code: "custom",
          message: "CHOICES_REQUIRED",
          path: ["fields", field.key, "options"]
        });
    }
    for (const field of form.fields)
      if (field.visibleWhen && !keys.has(field.visibleWhen.field))
        context.addIssue({
          code: "custom",
          message: "CONDITION_FIELD_UNKNOWN",
          path: ["fields", field.key, "visibleWhen"]
        });
  });

export const humanTaskFilterSchema = z.object({
  view: z
    .enum(["mine", "created", "group", "unassigned", "watched", "completed", "all"])
    .default("mine"),
  state: z.enum(["ready", "running", "waiting", "succeeded", "failed", "cancelled"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  queueId: z.uuid().optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const taskClaimSchema = z.object({
  idempotencyKey: z.string().min(16).max(160),
  expectedVersion: z.number().int().positive()
});
export const taskDraftSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  schemaVersion: z.number().int().positive(),
  expectedVersion: z.number().int().nonnegative()
});
export const taskSubmissionSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  schemaVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(16).max(160),
  expectedVersion: z.number().int().positive()
});

export const taskAssignmentSchema = z
  .object({
    assigneeUserId: z.uuid().nullable().optional(),
    assigneeGroupId: z.uuid().nullable().optional(),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(500)
  })
  .refine((value) => !(value.assigneeUserId && value.assigneeGroupId), "ASSIGN_ONE_PRINCIPAL");

export const taskDelegationSchema = z
  .object({
    delegateUserId: z.uuid(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: z.string().trim().min(1).max(500),
    retainWatcher: z.boolean().default(true),
    recallable: z.boolean().default(true),
    expectedVersion: z.number().int().positive()
  })
  .refine(
    (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
    "INVALID_DELEGATION_INTERVAL"
  );

export const taskActionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().min(16).max(160)
});

export const taskBulkActionSchema = z.object({
  taskRunIds: z.array(z.uuid()).min(1).max(100),
  action: z.enum(["assign", "priority", "due_at", "complete"]),
  value: z.unknown(),
  idempotencyKey: z.string().min(16).max(160)
});

export const taskQueueInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  routingMode: z.enum(["manual", "round_robin", "least_loaded", "skills"]),
  capacity: z.number().int().min(1).max(100_000),
  fallbackOwnerId: z.uuid().nullable().optional(),
  calendarId: z.uuid().nullable().optional()
});

export const taskQueueMemberSchema = z.object({
  principalType: z.enum(["user", "group"]),
  skills: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  capacity: z.number().int().min(1).max(100_000).nullable().optional()
});

export const taskRoutingPolicySchema = z.object({
  version: z.number().int().positive(),
  rules: z
    .array(
      z.object({
        field: z.string().min(1).max(80),
        operator: z.enum(["equals", "includes", "present"]),
        value: z.unknown().optional(),
        skill: z.string().max(80).optional()
      })
    )
    .max(100)
});

export const taskTemplateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  formSchema: humanFormSchema,
  outputSchema: z.record(z.string(), z.unknown()),
  defaults: z.record(z.string(), z.unknown()).default({})
});

export const restrictedUploadRequestSchema = z.object({
  purpose: z.enum(["task_attachment", "comment_attachment"]),
  mediaType: z.enum(["application/pdf", "image/jpeg", "image/png", "text/plain"]),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(25 * 1024 * 1024),
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  idempotencyKey: z.string().min(16).max(160)
});

export const restrictedUploadCompletionSchema = z.object({
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(25 * 1024 * 1024),
  malwareResult: z.enum(["clean", "quarantined", "rejected"])
});

export function visibleHumanFields(
  form: z.infer<typeof humanFormSchema>,
  values: Readonly<Record<string, unknown>>
) {
  return form.fields.filter(
    (field) =>
      !field.visibleWhen || Object.is(values[field.visibleWhen.field], field.visibleWhen.equals)
  );
}

export function validateHumanSubmission(
  form: z.infer<typeof humanFormSchema>,
  values: Readonly<Record<string, unknown>>
) {
  const errors: Record<string, string> = {};
  for (const field of visibleHumanFields(form, values)) {
    const value = values[field.key];
    if (field.required && (value === undefined || value === null || value === ""))
      errors[field.key] = "REQUIRED";
    else if (value !== undefined && field.type === "number" && typeof value !== "number")
      errors[field.key] = "NUMBER_REQUIRED";
    else if (value !== undefined && field.type === "boolean" && typeof value !== "boolean")
      errors[field.key] = "BOOLEAN_REQUIRED";
    else if (
      value !== undefined &&
      field.type === "url" &&
      (!z.url().safeParse(value).success || typeof value !== "string")
    )
      errors[field.key] = "URL_REQUIRED";
  }
  return errors;
}

export type HumanForm = z.infer<typeof humanFormSchema>;

import { humanFormSchema, type HumanForm, type HumanFormField } from "@knotline/contracts";

const humanize = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .replace(/^./u, (character) => character.toUpperCase());

const fieldKey = (value: string, index: number) => {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 64);
  return /^[a-z]/u.test(normalized) ? normalized : `field_${index + 1}`;
};

const inferredType = (key: string): HumanFormField["type"] =>
  /(?:complete|confirmed|compliant|approved|verified)$/iu.test(key)
    ? "boolean"
    : /(?:context|description|details|evidence|notes?|plan|reason|summary)$/iu.test(key)
      ? "rich_text"
      : /(?:url|link)$/iu.test(key)
        ? "url"
        : "text";

const fieldPresentation = (source: string): Pick<HumanFormField, "label" | "help"> => {
  const key = fieldKey(source, 0);
  if (key === "owner")
    return {
      label: "Accountable owner",
      help: "Enter the person responsible for coordinating this response, including their role."
    };
  if (key === "response_target")
    return {
      label: "Response commitment",
      help: "State the promised response and recovery timeframes, including update frequency."
    };
  if (key === "customer_context")
    return {
      label: "Customer situation",
      help: "Summarize who is affected, business impact, urgency, known facts, and open questions."
    };
  if (key === "evidence_complete")
    return {
      label: "Required evidence is complete",
      help: "Confirm only after checking the evidence available in the run."
    };
  return { label: humanize(source), help: undefined };
};

/** Converts legacy generated field lists into the canonical, validated human-task form. */
export function normalizeHumanForm(value: unknown, title: string): HumanForm {
  const canonical = humanFormSchema.safeParse(value);
  if (canonical.success) return canonical.data;

  const configuredFields =
    value && typeof value === "object" && "fields" in value && Array.isArray(value.fields)
      ? value.fields.filter(
          (field): field is string => typeof field === "string" && field.length > 0
        )
      : [];
  const sourceFields = configuredFields.length > 0 ? configuredFields : ["response"];
  const usedKeys = new Set<string>();
  const fields = sourceFields.map((source, index) => {
    let key = fieldKey(source, index);
    while (usedKeys.has(key)) key = `${key.slice(0, 60)}_${index + 1}`;
    usedKeys.add(key);
    const presentation = fieldPresentation(source);
    return {
      key,
      label: presentation.label,
      type: inferredType(source),
      required: true,
      ...(presentation.help ? { help: presentation.help } : {})
    } satisfies HumanFormField;
  });

  return humanFormSchema.parse({
    schemaVersion: 1,
    title: humanize(title).slice(0, 160),
    fields
  });
}

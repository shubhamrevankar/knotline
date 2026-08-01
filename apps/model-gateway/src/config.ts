import {
  GovernedModelGateway,
  OpenAIResponsesAdapter,
  RecordedContractAdapter,
  type ModelAdapter,
  type ModelMapping,
  type ModelPolicy
} from "@knotline/model-gateway";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required gateway configuration: ${name}`);
  return value;
};

export function buildGatewayFromEnvironment() {
  const provider = process.env.MODEL_GATEWAY_PROVIDER === "openai" ? "openai" : "recorded";
  const common = {
    capabilities: ["text", "structured_output", "tool_use"],
    residency: [process.env.MODEL_GATEWAY_RESIDENCY ?? "local"],
    currency: "USD",
    enabled: true
  } as const;
  const roles = [
    ["fast", "gpt-5.6-luna"],
    ["balanced", "gpt-5.6-terra"],
    ["quality", "gpt-5.6-sol"],
    ["judge", "gpt-5.6-sol"]
  ] as const;
  const mappings: ModelMapping[] = roles.map(([role, openAIModel]) => ({
    ...common,
    role,
    provider,
    modelId: provider === "openai" ? openAIModel : `recorded-${role}-v1`,
    inputPricePerMillion:
      provider === "openai" ? required(`OPENAI_${role.toUpperCase()}_INPUT_PRICE`) : "0",
    outputPricePerMillion:
      provider === "openai" ? required(`OPENAI_${role.toUpperCase()}_OUTPUT_PRICE`) : "0",
    priceVersionId:
      provider === "openai" ? required("OPENAI_PRICE_VERSION") : "recorded-zero-cost-v1"
  }));
  const policy: ModelPolicy = {
    versionId: "default-v1",
    allowedRoles: roles.map(([role]) => role),
    allowedProviders: [provider],
    maxCostDecimal: process.env.MODEL_GATEWAY_MAX_COST ?? "10.000000000000",
    emergencyDisabled: process.env.MODEL_GATEWAY_DISABLED === "true",
    allowedResidencies: common.residency
  };
  const adapter: ModelAdapter =
    provider === "openai"
      ? new OpenAIResponsesAdapter({ apiKey: required("OPENAI_API_KEY") })
      : new RecordedContractAdapter({
          definition: {
            schemaVersion: 1,
            name: "Recorded contract workflow",
            description: "Reviewable workflow returned by the recorded gateway contract.",
            inputSchema: { type: "object", additionalProperties: true },
            outputSchema: { type: "object", additionalProperties: true },
            nodes: [
              {
                key: "request_received",
                kind: "trigger",
                name: "Request received",
                description: "",
                position: { x: 80, y: 120 },
                configuration: { triggerType: "manual" }
              },
              {
                key: "prepare_request",
                kind: "human",
                name: "Prepare request",
                description: "",
                position: { x: 360, y: 120 },
                configuration: { assignment: "workflow_initiator" }
              }
            ],
            edges: [
              {
                key: "path_1",
                source: "request_received",
                target: "prepare_request",
                pathType: "success"
              }
            ]
          },
          assumptions: ["The recorded contract starts manually."],
          assignments: ["Prepare request → workflow initiator"],
          missingIntegrations: []
        });
  return new GovernedModelGateway(
    mappings,
    new Map([[policy.versionId, policy]]),
    new Map([[provider, adapter]]),
    {
      safetySalt: required("MODEL_GATEWAY_SAFETY_SALT"),
      maxConcurrency: Number(process.env.MODEL_GATEWAY_CONCURRENCY ?? "16")
    }
  );
}

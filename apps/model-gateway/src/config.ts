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

const recordedWorkflowFixture = {
  definition: {
    schemaVersion: 1,
    name: "Enterprise customer recovery orchestration",
    description:
      "Coordinate intelligent triage, evidence collection, human judgment, governed remediation, customer communication, and an auditable closeout for consequential customer incidents.",
    inputSchema: {
      type: "object",
      required: ["caseId", "customerId", "summary", "reportedAt"],
      properties: {
        caseId: { type: "string" },
        customerId: { type: "string" },
        summary: { type: "string" },
        reportedAt: { type: "string", format: "date-time" },
        contractTier: { type: "string" },
        estimatedImpact: { type: "number" }
      },
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      required: ["caseId", "resolution", "customerNotified", "evidencePackageId"],
      properties: {
        caseId: { type: "string" },
        resolution: { type: "string" },
        customerNotified: { type: "boolean" },
        evidencePackageId: { type: "string" }
      },
      additionalProperties: false
    },
    nodes: [
      {
        key: "case_received",
        kind: "trigger",
        name: "Receive critical customer case",
        description:
          "Accept a structured escalation from the support or monitoring intake channel.",
        position: { x: 80, y: 320 },
        configuration: { triggerType: "webhook", owner: "Customer operations" }
      },
      {
        key: "normalize_context",
        kind: "transform",
        name: "Normalize account and incident context",
        description: "Create a canonical case record and remove duplicate or incomplete signals.",
        position: { x: 340, y: 320 },
        configuration: {
          mode: "map_fields",
          mapping: {
            caseId: "${input.caseId}",
            customerId: "${input.customerId}",
            summary: "${input.summary}",
            reportedAt: "${input.reportedAt}",
            contractTier: "${input.contractTier}"
          },
          deduplicateBy: ["caseId"],
          dropEmpty: true,
          transformRevision: "customer-case.v2"
        }
      },
      {
        key: "classify_impact",
        kind: "agent",
        name: "Classify severity and customer impact",
        description: "Assess urgency, contract exposure, sentiment, and likely operational impact.",
        position: { x: 600, y: 320 },
        configuration: { agentRole: "impact_analyst", evidenceRequired: true, maxCostMinor: 18 }
      },
      {
        key: "priority_gate",
        kind: "condition",
        name: "Route by priority and exposure",
        description: "Separate critical cases from the standard governed review path.",
        position: { x: 860, y: 320 },
        configuration: { expression: "severity == critical or contractExposure == high" }
      },
      {
        key: "standard_review",
        kind: "human",
        name: "Confirm standard-case ownership",
        description: "A customer operations lead confirms ownership and response timing.",
        position: { x: 1120, y: 520 },
        configuration: {
          assignment: "customer_operations_lead",
          dueInMinutes: 60,
          formSchema: { fields: ["owner", "responseTarget", "customerContext"] }
        }
      },
      {
        key: "investigate_case",
        kind: "agent",
        name: "Investigate account, product, and service signals",
        description:
          "Build an evidence-backed incident narrative using authorized workspace context.",
        position: { x: 1380, y: 320 },
        configuration: {
          agentRole: "incident_investigator",
          citationsRequired: true,
          maxCostMinor: 32
        }
      },
      {
        key: "evidence_collection",
        kind: "loop",
        name: "Collect missing evidence",
        description:
          "Repeat bounded evidence collection until coverage is sufficient or the limit is reached.",
        position: { x: 1640, y: 320 },
        configuration: { maxIterations: 3, exitCondition: "evidenceCoverage >= 0.9" }
      },
      {
        key: "risk_gate",
        kind: "condition",
        name: "Evaluate remediation risk",
        description: "Route high-impact remediation through an additional executive authorization.",
        position: { x: 1900, y: 320 },
        configuration: { expression: "refundValue > 5000 or productionChange == true" }
      },
      {
        key: "executive_authorization",
        kind: "approval",
        name: "Authorize high-impact remediation",
        description:
          "An accountable executive reviews evidence, risk, and the proposed customer remedy.",
        position: { x: 2160, y: 120 },
        configuration: {
          policy: "executive-remediation-v1",
          assignment: "customer_experience_executive",
          allowSelfApproval: false,
          dueInMinutes: 30
        }
      },
      {
        key: "design_remediation",
        kind: "transform",
        name: "Assemble remediation plan",
        description:
          "Combine technical recovery, commercial remedy, owners, deadlines, and rollback conditions.",
        position: { x: 2420, y: 320 },
        configuration: { template: "governed-remediation-plan.v3" }
      },
      {
        key: "commander_review",
        kind: "human",
        name: "Incident commander review",
        description:
          "Confirm feasibility, customer language, dependencies, and accountable owners.",
        position: { x: 2680, y: 320 },
        configuration: {
          assignment: "incident_commander",
          dueInMinutes: 20,
          formSchema: { fields: ["technicalOwner", "customerOwner", "rollbackPlan", "reviewNote"] }
        }
      },
      {
        key: "remediation_approval",
        kind: "approval",
        name: "Approve remediation execution",
        description: "Require explicit approval before any governed external action is attempted.",
        position: { x: 2940, y: 320 },
        configuration: {
          policy: "incident-remediation-v2",
          assignment: "service_owner",
          allowSelfApproval: false
        }
      },
      {
        key: "open_incident_room",
        kind: "integration_action",
        name: "Open incident command room",
        description:
          "Create the coordinated response space with owners, evidence, and the approved plan.",
        position: { x: 3200, y: 320 },
        configuration: {
          connectionRef: "conn_incident_ops_12345678",
          idempotencyKey: "${nodes.case_received.output.caseId}",
          risk: "medium",
          action: "create_incident_room"
        }
      },
      {
        key: "execute_recovery",
        kind: "subworkflow",
        name: "Execute governed service recovery",
        description:
          "Delegate the approved technical recovery to a separately versioned workflow contract.",
        position: { x: 3460, y: 320 },
        configuration: { workflowRef: "wf_service_recovery_12345678", versionPolicy: "published" }
      },
      {
        key: "monitor_stability",
        kind: "delay",
        name: "Monitor the stability window",
        description: "Wait for the agreed observation period before evaluating the outcome.",
        position: { x: 3720, y: 320 },
        configuration: { duration: "PT30M", timezone: "workspace" }
      },
      {
        key: "verify_outcome",
        kind: "agent",
        name: "Verify recovery and customer impact",
        description: "Compare current signals with the baseline and identify unresolved risk.",
        position: { x: 3980, y: 320 },
        configuration: { agentRole: "recovery_verifier", evidenceRequired: true, maxCostMinor: 20 }
      },
      {
        key: "resolution_gate",
        kind: "condition",
        name: "Confirm resolution quality",
        description:
          "Route incomplete recoveries to an exception decision without bypassing accountability.",
        position: { x: 4240, y: 320 },
        configuration: { expression: "serviceHealthy == true and customerImpact == contained" }
      },
      {
        key: "exception_review",
        kind: "human",
        name: "Review unresolved exception",
        description:
          "Document residual impact, options, customer expectations, and the next recovery window.",
        position: { x: 4500, y: 520 },
        configuration: {
          assignment: "incident_commander",
          formSchema: { fields: ["residualRisk", "nextAction", "customerCommitment"] }
        }
      },
      {
        key: "exception_approval",
        kind: "approval",
        name: "Authorize exception plan",
        description: "An executive accepts the residual risk and the next customer commitment.",
        position: { x: 4760, y: 520 },
        configuration: { policy: "customer-exception-v1", assignment: "service_executive" }
      },
      {
        key: "update_customer_record",
        kind: "integration_action",
        name: "Update the authoritative customer record",
        description:
          "Write the resolution, owners, commitments, and evidence reference to the CRM.",
        position: { x: 5020, y: 320 },
        configuration: {
          connectionRef: "conn_crm_primary_12345678",
          idempotencyKey: "${nodes.case_received.output.caseId}",
          risk: "high",
          action: "upsert_case_resolution"
        }
      },
      {
        key: "notify_customer",
        kind: "integration_action",
        name: "Send approved customer communication",
        description: "Deliver the reviewed outcome and commitments through the preferred channel.",
        position: { x: 5280, y: 320 },
        configuration: {
          connectionRef: "conn_messaging_primary_12345678",
          idempotencyKey: "${nodes.case_received.output.caseId}",
          risk: "medium",
          action: "send_resolution_update"
        }
      },
      {
        key: "compile_evidence",
        kind: "transform",
        name: "Compile the audit evidence package",
        description:
          "Create a canonical package of decisions, approvals, actions, results, and provenance.",
        position: { x: 5540, y: 320 },
        configuration: { template: "customer-recovery-evidence.v2" }
      },
      {
        key: "quality_review",
        kind: "human",
        name: "Quality and compliance review",
        description:
          "Check customer commitments, required evidence, policy adherence, and record completeness.",
        position: { x: 5800, y: 320 },
        configuration: {
          assignment: "quality_reviewer",
          formSchema: { fields: ["evidenceComplete", "policyCompliant", "reviewNote"] }
        }
      },
      {
        key: "closeout_approval",
        kind: "approval",
        name: "Approve final closeout",
        description:
          "Authorize the immutable closeout record after customer and compliance review.",
        position: { x: 6060, y: 320 },
        configuration: {
          policy: "customer-closeout-v2",
          assignment: "customer_operations_director"
        }
      },
      {
        key: "publish_audit_record",
        kind: "integration_action",
        name: "Publish immutable audit record",
        description: "Persist the signed evidence package in the approved system of record.",
        position: { x: 6320, y: 320 },
        configuration: {
          connectionRef: "conn_audit_store_12345678",
          idempotencyKey: "${nodes.case_received.output.caseId}",
          risk: "high",
          action: "publish_evidence_package"
        }
      },
      {
        key: "produce_outcome",
        kind: "transform",
        name: "Produce recovery outcome",
        description:
          "Return the final resolution, customer notification status, and evidence package reference.",
        position: { x: 6580, y: 320 },
        configuration: { outputContract: "customer-recovery-outcome.v1" }
      }
    ],
    edges: [
      { key: "received_to_normalize", source: "case_received", target: "normalize_context" },
      { key: "normalize_to_classify", source: "normalize_context", target: "classify_impact" },
      { key: "classify_to_priority", source: "classify_impact", target: "priority_gate" },
      {
        key: "priority_critical",
        source: "priority_gate",
        target: "investigate_case",
        condition: "severity == 'critical'",
        label: "Critical"
      },
      {
        key: "priority_standard",
        source: "priority_gate",
        target: "standard_review",
        condition: "severity != 'critical'",
        label: "Standard"
      },
      { key: "standard_to_investigate", source: "standard_review", target: "investigate_case" },
      { key: "investigate_to_evidence", source: "investigate_case", target: "evidence_collection" },
      { key: "evidence_to_risk", source: "evidence_collection", target: "risk_gate" },
      {
        key: "risk_high",
        source: "risk_gate",
        target: "executive_authorization",
        condition: "risk == 'high'",
        label: "High risk"
      },
      {
        key: "risk_standard",
        source: "risk_gate",
        target: "design_remediation",
        condition: "risk != 'high'",
        label: "Standard risk"
      },
      { key: "executive_to_plan", source: "executive_authorization", target: "design_remediation" },
      { key: "plan_to_review", source: "design_remediation", target: "commander_review" },
      { key: "review_to_approval", source: "commander_review", target: "remediation_approval" },
      { key: "approval_to_room", source: "remediation_approval", target: "open_incident_room" },
      { key: "room_to_recovery", source: "open_incident_room", target: "execute_recovery" },
      { key: "recovery_to_monitor", source: "execute_recovery", target: "monitor_stability" },
      { key: "monitor_to_verify", source: "monitor_stability", target: "verify_outcome" },
      { key: "verify_to_resolution", source: "verify_outcome", target: "resolution_gate" },
      {
        key: "resolution_complete",
        source: "resolution_gate",
        target: "update_customer_record",
        condition: "serviceHealthy == true",
        label: "Resolved"
      },
      {
        key: "resolution_exception",
        source: "resolution_gate",
        target: "exception_review",
        condition: "serviceHealthy != true",
        label: "Needs escalation"
      },
      { key: "exception_to_approval", source: "exception_review", target: "exception_approval" },
      {
        key: "exception_to_record",
        source: "exception_approval",
        target: "update_customer_record"
      },
      { key: "record_to_notify", source: "update_customer_record", target: "notify_customer" },
      { key: "notify_to_evidence", source: "notify_customer", target: "compile_evidence" },
      { key: "evidence_to_quality", source: "compile_evidence", target: "quality_review" },
      { key: "quality_to_closeout", source: "quality_review", target: "closeout_approval" },
      { key: "closeout_to_audit", source: "closeout_approval", target: "publish_audit_record" },
      { key: "audit_to_outcome", source: "publish_audit_record", target: "produce_outcome" }
    ]
  },
  assumptions: [
    "Critical cases require an accountable incident commander and explicit remediation approval.",
    "High-impact commercial or production actions require an additional executive authorization.",
    "Every external write uses an idempotency key derived from the authoritative case identifier.",
    "Customer communication is sent only after the system of record has been updated.",
    "Closeout requires a complete evidence package and an independent quality review."
  ],
  assignments: [
    "Standard ownership confirmation → Customer operations lead",
    "Incident investigation → Governed incident investigator agent",
    "Remediation review → Incident commander",
    "High-impact authorization → Customer experience executive",
    "Remediation approval → Service owner",
    "Exception authorization → Service executive",
    "Quality review → Independent quality reviewer",
    "Final closeout → Customer operations director"
  ],
  missingIntegrations: [
    "Incident operations connection",
    "Customer relationship management connection",
    "Customer messaging connection",
    "Immutable audit-store connection"
  ]
} as const;

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
      : new RecordedContractAdapter(recordedWorkflowFixture);
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

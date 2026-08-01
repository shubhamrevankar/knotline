export function releaseDecision({ milestones, environmentGates, externalGates, criticalRisks }) {
  const incompleteMilestones = milestones
      .filter((item) => item.status !== "COMMITTED")
      .map((item) => item.id),
    incompleteEnvironment = environmentGates
      .filter(
        (item) =>
          item.actualState !== item.requiredTerminalState && item.actualState !== "NOT_APPLICABLE"
      )
      .map((item) => item.criterionId),
    incompleteExternal = externalGates
      .filter((item) => item.state !== item.requiredTerminalState)
      .map((item) => item.gateId),
    blockingRisks = criticalRisks
      .filter((item) => ["critical", "high"].includes(item.severity) && item.state !== "closed")
      .map((item) => item.id);
  const blockers = {
    incompleteMilestones,
    incompleteEnvironment,
    incompleteExternal,
    blockingRisks
  };
  return { authorized: Object.values(blockers).every((items) => items.length === 0), blockers };
}
export function migrationMapping(records) {
  const seen = new Set();
  return records.map((record) => {
    if (seen.has(record.sourceId)) throw new Error(`duplicate source ${record.sourceId}`);
    seen.add(record.sourceId);
    return {
      sourceId: record.sourceId,
      targetId: record.targetId,
      state: record.valid ? "mapped" : "attention",
      checksum: record.checksum
    };
  });
}

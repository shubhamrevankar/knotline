import type { AgentExecutionRequest } from "@knotline/contracts";

export interface RetrievalContextAuthorization {
  reauthorize(reference: {
    readonly reference: string;
    readonly permissionProofId: string;
    readonly principalId: string;
    readonly workspaceId: string;
  }): Promise<boolean>;
  invalidate(reference: string): Promise<void>;
}

export class RetrievalAuthorizedContextAdapter {
  constructor(private readonly authorization: RetrievalContextAuthorization) {}

  async reauthorize(request: AgentExecutionRequest) {
    for (const reference of request.contextManifest.references) {
      if (reference.kind !== "knowledge_chunk") continue;
      if (
        !(await this.authorization.reauthorize({
          reference: reference.referenceId,
          permissionProofId: reference.permissionProofId,
          principalId: request.principalId,
          workspaceId: request.workspaceId
        }))
      )
        return false;
    }
    return true;
  }

  invalidate(reference: string) {
    return this.authorization.invalidate(reference);
  }
}

import { deterministicLayout } from "./studio-reducer.js";
import type { WorkflowDefinition } from "@knotline/contracts";

self.onmessage = (
  event: MessageEvent<{ definition: WorkflowDefinition; direction: "horizontal" | "vertical" }>
) => {
  self.postMessage(deterministicLayout(event.data.definition, event.data.direction));
};

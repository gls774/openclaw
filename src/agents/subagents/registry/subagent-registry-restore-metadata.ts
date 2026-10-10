import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { resolveSubagentRequesterAgentId } from "../../subagent-requester-owner.js";
import { updateSubagentArchiveAtMs } from "./subagent-registry-helpers.js";
import type { SubagentRunMutation } from "./subagent-registry-mutation.types.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

export function prepareRestoredSubagentRunMetadata(
  rows: ReadonlyMap<string, SubagentRunRecord>,
  cfg: OpenClawConfig,
): SubagentRunMutation<void> {
  const postimages = new Map<string, SubagentRunRecord>();
  for (const [runId, entry] of rows) {
    const draft = { ...entry };
    const requesterAgentId = resolveSubagentRequesterAgentId(cfg, draft);
    const ownerChanged = !draft.requesterAgentId && requesterAgentId !== undefined;
    if (ownerChanged) {
      draft.requesterAgentId = requesterAgentId;
    }
    if (updateSubagentArchiveAtMs(draft, cfg) || ownerChanged) {
      postimages.set(runId, draft);
    }
  }
  return { value: undefined, postimages };
}

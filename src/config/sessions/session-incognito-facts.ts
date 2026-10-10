import type { IncognitoSessionFacts } from "./session-incognito-facts.types.js";
import type { InternalSessionEntry as SessionEntry } from "./types.js";

/** Project content-free steering facts without copying delivery payload contents. */
export function projectIncognitoSessionSteeringFacts(
  entry: SessionEntry,
): NonNullable<IncognitoSessionFacts["steering"]> {
  return {
    lifecycleRevision: entry.lifecycleRevision,
    restartRecoveryHarnessCompletion: entry.restartRecoveryHarnessCompletion,
    restartRecoveryTerminalDeliveryEvidence: entry.restartRecoveryTerminalDeliveryEvidence?.map(
      (receipt) => ({
        runId: receipt.runId,
        harnessCompletion: receipt.harnessCompletion,
        deliveryContext: receipt.deliveryContext,
        payloads: receipt.payloads?.map(({ visible }) => ({ visible })),
        payloadsTruncated: receipt.payloadsTruncated,
        deliveryStatus: receipt.deliveryStatus && {
          status: receipt.deliveryStatus.status,
          resultCount: receipt.deliveryStatus.resultCount,
        },
        messagingToolSentTargets: receipt.messagingToolSentTargets?.map(
          ({
            provider,
            accountId,
            to,
            threadId,
            threadImplicit,
            threadSuppressed,
            visible,
            sourceReplyFinal,
          }) => ({
            provider,
            accountId,
            to,
            threadId,
            threadImplicit,
            threadSuppressed,
            visible,
            sourceReplyFinal,
          }),
        ),
        messagingToolSentTargetsTruncated: receipt.messagingToolSentTargetsTruncated,
        messagingToolAggregateEvidenceUnaccounted:
          receipt.messagingToolAggregateEvidenceUnaccounted,
      }),
    ),
    sessionId: entry.sessionId,
    updatedAt: entry.updatedAt,
    status: entry.status,
    restartRecoveryDeliveryRunId: entry.restartRecoveryDeliveryRunId,
    restartRecoveryDeliverySourceRunId: entry.restartRecoveryDeliverySourceRunId,
    restartRecoveryDeliveryReceiptState: entry.restartRecoveryDeliveryReceiptState,
    restartRecoveryDeliveryToolCallId: entry.restartRecoveryDeliveryToolCallId,
    restartRecoveryTerminalRunIds: entry.restartRecoveryTerminalRunIds,
  };
}

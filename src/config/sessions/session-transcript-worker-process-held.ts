import type { WorkerTaskOptions } from "../../infra/worker-task-pool.types.js";
import {
  sessionHistoryCleanupError,
  unwrapSessionTranscriptWorkerReply,
} from "./session-history-worker-errors.js";
import {
  armDatabaseWorkerIdleRetirement,
  historyClearTimeout,
  historyLane,
  refreshDatabaseWorkerPressureSubscription,
  rotateDatabaseWorkers,
} from "./session-transcript-worker-resources.js";
import type { SessionHistoryWorkerInput } from "./session-transcript-worker.types.js";

/** Process-held sources exchange bounded pages without reopening their memory database. */
export async function runProcessHeldHistoryTask(
  request: import("./session-history-types.js").ChatHistoryDisplayRequest,
  onRequest: NonNullable<WorkerTaskOptions<SessionHistoryWorkerInput>["onRequest"]>,
  signal?: AbortSignal,
) {
  historyLane.pending++;
  historyClearTimeout(historyLane.idleTimer);
  historyLane.idleTimer = undefined;
  refreshDatabaseWorkerPressureSubscription();
  let sequence = 0;
  let retirement: Promise<void> | undefined;
  try {
    await historyLane.rotation;
    const value = unwrapSessionTranscriptWorkerReply<SessionHistoryWorkerInput["kind"]>(
      await historyLane.pool.run(
        () => {
          sequence = ++historyLane.nativeSequence;
          return { kind: "cli-process-history", request };
        },
        {
          inputBytes: request.params.cliHistoryRedaction?.retainedBytes,
          timeoutMs: 60_000,
          onRequest,
          signal,
          onExecutionSettled: ({ retired }) => {
            if (retired) {
              retirement = rotateDatabaseWorkers(historyLane);
            }
          },
        },
      ),
    );
    await retirement;
    if (
      typeof value === "boolean" ||
      Array.isArray(value) ||
      (value.kind !== "rpc" && value.kind !== "rpc-message")
    ) {
      throw new Error("Unexpected process-held history reply");
    }
    return value;
  } catch (error) {
    if (sequence > 0) {
      try {
        await (retirement ?? rotateDatabaseWorkers(historyLane));
      } catch (cleanupError) {
        throw sessionHistoryCleanupError(error, cleanupError, "worker retirement");
      }
    }
    throw error;
  } finally {
    historyLane.pending--;
    armDatabaseWorkerIdleRetirement(historyLane);
  }
}

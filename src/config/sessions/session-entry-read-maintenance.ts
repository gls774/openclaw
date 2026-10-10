import { isIncognitoSessionKey, normalizeAgentId } from "../../routing/session-key.js";
import { assertAgentDatabaseAdmitted } from "../../state/agent-database-admission.js";
import { resolveOpenClawAgentSqlitePath } from "../../state/openclaw-agent-db.paths.js";
import type { SessionEntrySummary } from "./session-accessor.types.js";
import { captureSessionEntryReadScope } from "./session-entry-read-request.js";
import { withSessionStoreReaderInWorker } from "./session-entry-read-runtime.js";
import type { SessionStoreWorkerReadScope } from "./session-entry-read-runtime.types.js";
import { resolveSessionTranscriptReadFence } from "./session-transcript-read-fence.js";
import { maintenanceLane } from "./session-transcript-worker-resources.js";
import { withSessionHistoryWorkerDatabase } from "./session-transcript-worker-runtime.js";

/** Keep the physical reader owner through a registry maintenance consumer and its commit guard. */
export function withSessionRegistryEntriesInWorker<T>(
  input: SessionStoreWorkerReadScope,
  consume: (entries: SessionEntrySummary[], assertCurrent: () => void) => Promise<T>,
): Promise<T> {
  assertAgentDatabaseAdmitted(input.agentId, { env: input.env });
  return withSessionStoreReaderInWorker(
    input,
    async ({ reader, database, assertCurrent: assertReaderCurrent }) => {
      const assertCurrent = () => {
        assertAgentDatabaseAdmitted(input.agentId, { env: database.env });
        assertAgentDatabaseAdmitted(database.agentId, { env: database.env });
        assertReaderCurrent();
      };
      assertCurrent();
      const { entries } = await reader.readEntries({
        agentId: database.agentId,
        storePath: database.path,
        env: database.env,
        cronRetention: true,
      });
      assertCurrent();
      return await consume(entries, assertCurrent);
    },
    { lane: maintenanceLane },
  );
}

/** Return owned full entries only for expired cron runs; live deletion guards stay on the host. */
export async function readExpiredCronRunEntriesInWorker(
  input: SessionStoreWorkerReadScope & { updatedBefore: number },
) {
  const expiredCronRuns = {
    agentId: normalizeAgentId(input.agentId),
    updatedBefore: input.updatedBefore,
  };
  assertAgentDatabaseAdmitted(expiredCronRuns.agentId, { env: input.env });
  return withSessionStoreReaderInWorker(
    input,
    async ({ reader, database, assertCurrent }) => {
      const assertAdmitted = () => {
        assertAgentDatabaseAdmitted(expiredCronRuns.agentId, { env: database.env });
        assertAgentDatabaseAdmitted(database.agentId, { env: database.env });
      };
      assertAdmitted();
      const { entries } = await reader.readEntries({
        agentId: database.agentId,
        storePath: database.path,
        env: database.env,
        expiredCronRuns,
      });
      assertAdmitted();
      assertCurrent();
      return entries;
    },
    { lane: maintenanceLane, dataOnly: true },
  );
}

/** Diagnostic identities name the default agent store, not a logical store locator. */
export async function withSessionDiagnosticTextInWorker(
  input: { agentId: string; sessionKey: string; sessionId: string },
  assertCurrent: () => void,
  consume: (text: string | undefined) => void,
): Promise<void> {
  const { scope, env } = captureSessionEntryReadScope(input);
  const agentId = normalizeAgentId(input.agentId);
  assertCurrent();
  if (isIncognitoSessionKey(scope.sessionKey)) {
    consume(undefined);
    return;
  }
  const storePath = resolveOpenClawAgentSqlitePath({ agentId, env });
  const admission = resolveSessionTranscriptReadFence(input);
  await withSessionHistoryWorkerDatabase(
    { agentId, path: storePath, env },
    async (owner) => {
      assertCurrent();
      const text = await owner.readDiagnosticText({
        scope: {
          ...scope,
          agentId,
          databaseAgentId: agentId,
          storePath,
          sessionId: input.sessionId,
        },
        admission,
      });
      owner.assertCurrent();
      assertCurrent();
      consume(text);
    },
    maintenanceLane,
  );
}

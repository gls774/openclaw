import { resolveIntegerOption } from "@openclaw/normalization-core/number-coercion";
import { asOptionalRecord } from "@openclaw/normalization-core/record-coerce";
import {
  SOURCE_PAGE_MAX_BYTES,
  SOURCE_PAGE_MAX_MESSAGES,
} from "../../gateway/session-transcript-source-pages.js";
import type { CurrentTranscriptProjection } from "./session-accessor.sqlite-projection-read.js";
import {
  iterateVisibleMessageMetadata,
  readVisibleMessageRange,
  resolveVisibleMessagePositions,
} from "./session-accessor.sqlite-reset-window.js";
import type { IncognitoHistoryOperations } from "./session-incognito-history-contract.js";

/** Read one bounded visitor page inside the actor's existing admitted projection snapshot. */
export function readIncognitoHistorySourcePage(
  projection: CurrentTranscriptProjection,
  offset: IncognitoHistoryOperations["session.history.visitor-source"]["input"]["offset"],
) {
  const { total } = resolveVisibleMessagePositions(projection);
  const start = resolveIntegerOption(offset, 0, { min: 0, max: total });
  let end = start;
  let bytes = 0;
  for (const row of iterateVisibleMessageMetadata(
    projection,
    start,
    Math.min(total, start + SOURCE_PAGE_MAX_MESSAGES),
  )) {
    if (row.serialized_bytes > SOURCE_PAGE_MAX_BYTES) {
      throw new Error(
        `Transcript source message exceeds the ${SOURCE_PAGE_MAX_BYTES}-byte page limit`,
      );
    }
    if (bytes + row.serialized_bytes > SOURCE_PAGE_MAX_BYTES) {
      break;
    }
    bytes += row.serialized_bytes;
    end++;
  }
  if (end === start && start < total) {
    throw new Error("Transcript visitor page is incomplete");
  }
  const events = readVisibleMessageRange(projection, start, end);
  return {
    ...(end < total ? { nextOffset: end } : {}),
    messages: events.flatMap(({ event, seq }) => {
      const message = asOptionalRecord(event)?.message;
      return message === undefined ? [] : [{ message, seq }];
    }),
  };
}

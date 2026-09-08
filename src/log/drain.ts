import type { IntakeRequest, LogEvent, RecordType } from "./events.ts";

import { contentId, displayNumber, formatDisplay, SCHEMA_VERSION } from "./events.ts";

/**
 * The drain is canon's elected leader: the single serialized writer that turns
 * conflict-free {@link IntakeRequest}s from the staging area into sequenced
 * {@link LogEvent}s in the log. Because it is the *only* writer and runs one at
 * a time (a `concurrency: 1` Action), it can hand out a global monotonic `seq`
 * and a stable per-type display ID with no coordination — the property git's
 * leaderless merges can't provide on their own. It is a pure function so the
 * Action (or a future GitHub App) is just deployment glue around it.
 */

/** The outcome of a drain: the full log after it, plus what changed. */
export type DrainResult = {
  /** Events newly sequenced in this drain, in assignment order. */
  added: LogEvent[];
  /** The complete log after draining (existing + added), sorted by `seq`. */
  events: LogEvent[];
  /** Intakes skipped because an event with their content id already exists. */
  skipped: IntakeRequest[];
};

/**
 * Deterministic order for a batch of pending intakes: by advisory capture
 * timestamp, then by content id as a stable tie-break. Ordering only decides
 * *within* a single drain — once `seq` is assigned it is frozen, so later
 * drains never renumber earlier events even if clocks were imperfect.
 */
function batchOrder(a: IntakeRequest, b: IntakeRequest): number {
  return a.ts.localeCompare(b.ts) || contentId(a).localeCompare(contentId(b));
}

/**
 * Fold a batch of pending intakes into the existing log, assigning each a global
 * `seq` and a per-type display ID. Idempotent: any intake whose content id is
 * already in the log (a re-run, or a double-submitted nonce) is skipped, never
 * duplicated — so the Action can safely re-drain the same `intake/` folder. The
 * inputs are never mutated; a fresh, `seq`-sorted event list is returned.
 */
export function drain(
  existing: readonly LogEvent[],
  pending: readonly IntakeRequest[],
): DrainResult {
  const known = new Set(existing.map((event) => event.id));
  const typeCount = new Map<RecordType, number>();
  let nextSeq = 1;
  for (const event of existing) {
    nextSeq = Math.max(nextSeq, event.seq + 1);
    typeCount.set(
      event.type,
      Math.max(typeCount.get(event.type) ?? 0, displayNumber(event.display)),
    );
  }

  const added: LogEvent[] = [];
  const skipped: IntakeRequest[] = [];
  for (const intake of [...pending].sort(batchOrder)) {
    const id = contentId(intake);
    if (known.has(id)) {
      skipped.push(intake);
      continue;
    }
    known.add(id);
    const ordinal = (typeCount.get(intake.type) ?? 0) + 1;
    typeCount.set(intake.type, ordinal);
    added.push({
      actor: intake.actor,
      body: intake.body,
      display: formatDisplay(intake.type, ordinal),
      id,
      op: "create",
      schemaVersion: SCHEMA_VERSION,
      seq: nextSeq,
      ts: intake.ts,
      title: intake.title,
      type: intake.type,
      ...(intake.supersedes ? { supersedes: intake.supersedes } : {}),
    });
    nextSeq += 1;
  }

  const events = [...existing, ...added].sort((a, b) => a.seq - b.seq);
  return { added, events, skipped };
}

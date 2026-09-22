import { createHash, randomUUID } from "node:crypto";

/**
 * The append-only event log is canon's source of truth: nobody reads it
 * directly, and every human/AI-facing doc is a deterministic projection of it
 * (like a compacted Kafka topic reconstructing a table). This module defines the
 * two record shapes at the edges of that log — the {@link IntakeRequest} a
 * client submits (no ID, conflict-free capture) and the {@link LogEvent} the
 * single-writer drain commits (sequenced, content-addressed) — plus the pure
 * identity helpers both depend on.
 */

/** The kinds of record the log can carry. MVS ships only `decision`. */
export type RecordType = "decision";

/** Human-facing display-ID prefix per record type (e.g. `decision` -> `DEC`). */
export const DISPLAY_PREFIX: Record<RecordType, string> = {
  decision: "DEC",
};

/**
 * Version stamped onto every committed event. Bumped when a record type's
 * schema changes; kept on each event so the projector can still fold history
 * authored under an older schema. MVS has exactly one version.
 */
export const SCHEMA_VERSION = 1;

/** Zero-pad width for the numeric part of a display ID (`DEC-0007`). */
const DISPLAY_PAD = 4;

/**
 * A submission into the staging area (`intake/`), authored by a human or agent
 * via `canon add-decision`. It carries **no** sequence or display ID: those are
 * assigned later, once, by the single-writer drain — so two concurrent intakes
 * can never race for the same number. The `nonce` is minted at capture time and
 * seeds the content hash, making each submission a distinct, idempotently
 * re-drainable event even if its prose duplicates another's.
 */
export type IntakeRequest = {
  /** Author handle (a human username or an agent id) — folds into provenance. */
  actor: string;
  /** The record's prose body (Markdown). */
  body: string;
  /** Unique per-submission id minted at capture; seeds the content hash. */
  nonce: string;
  /** Display ID or canonical id of a prior record this one supersedes. */
  supersedes?: string;
  /** Advisory ISO-8601 capture timestamp; used only for intra-batch ordering. */
  ts: string;
  /** The record's one-line title. */
  title: string;
  /** Which kind of record this is. */
  type: RecordType;
};

/**
 * A committed event in `log/`, written only by the drain. `seq` is the global
 * monotonic order the drain assigned (the elected leader's "offset"); `display`
 * is the stable per-type human ID; `id` is the opaque content hash used as the
 * canonical reference/dedup key. Records never mutate — supersession and future
 * transitions are new events, so the log only ever grows.
 */
export type LogEvent = {
  actor: string;
  body: string;
  /** Stable human-facing ID, e.g. `DEC-0007`. Assigned once by the drain. */
  display: string;
  /** Opaque content-addressed canonical id (sha256 hex); dedup + reference key. */
  id: string;
  /** The mutation this event expresses. MVS emits only `create`. */
  op: "create";
  /** Schema version this event was authored under. */
  schemaVersion: number;
  /** Global monotonic order assigned by the drain; the log's total order. */
  seq: number;
  /** Normalized display/canonical id of a record this one supersedes. */
  supersedes?: string;
  ts: string;
  title: string;
  type: RecordType;
};

/** Build a fresh {@link IntakeRequest}, minting the nonce and capture timestamp. */
export function createIntake(
  fields: Omit<IntakeRequest, "nonce" | "ts"> & { nonce?: string; ts?: string },
): IntakeRequest {
  return {
    actor: fields.actor,
    body: fields.body,
    nonce: fields.nonce ?? randomUUID(),
    ts: fields.ts ?? new Date().toISOString(),
    title: fields.title,
    type: fields.type,
    ...(fields.supersedes ? { supersedes: fields.supersedes } : {}),
  };
}

/**
 * The canonical content id of an intake: a sha256 over its identity-bearing
 * fields in a fixed order (so serialization can't perturb it). Including the
 * `nonce` makes the hash unique per submission yet stable across re-drains,
 * which is exactly what the drain's idempotency check relies on.
 */
export function contentId(intake: IntakeRequest): string {
  const canonical = JSON.stringify([
    intake.nonce,
    intake.type,
    intake.title,
    intake.body,
    intake.actor,
    intake.ts,
    intake.supersedes ?? null,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Format a per-type display ID, e.g. `formatDisplay("decision", 7)` -> `DEC-0007`. */
export function formatDisplay(type: RecordType, ordinal: number): string {
  return `${DISPLAY_PREFIX[type]}-${String(ordinal).padStart(DISPLAY_PAD, "0")}`;
}

/**
 * The numeric part of a display ID (`DEC-0007` -> `7`), or `0` if it doesn't
 * match the expected shape. Used to reseed per-type counters from existing log
 * events without trusting array position.
 */
export function displayNumber(display: string): number {
  const match = /-(\d+)$/.exec(display);
  return match?.[1] ? Number.parseInt(match[1], 10) : 0;
}

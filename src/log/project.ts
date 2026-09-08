import type { LogEvent, RecordType } from "./events.ts";

/**
 * The projector is the pure fold `events -> state` at the heart of "docs are a
 * projection": it replays the log in its committed order and reconstructs the
 * current records, deriving everything that isn't stored — status, the
 * supersession back-link, and the per-type render ordinal. Keeping the folded
 * state as an explicit value (rather than rendering inline) is what makes later
 * compaction a truncation rather than a rewrite. Renderers consume this state;
 * they never touch raw events.
 */

/** A record's lifecycle state, derived entirely from the event stream. */
export type RecordStatus = "accepted" | "superseded";

/** A single decision reconstructed from the log. */
export type DecisionRecord = {
  actor: string;
  body: string;
  display: string;
  id: string;
  /** Per-type render index in commit order (`1`-based); derived, not stored. */
  ordinal: number;
  status: RecordStatus;
  /** Normalized display ID of the record this one supersedes, if any. */
  supersedes?: string;
  /** Display ID of the record that later superseded this one, if any. */
  supersededBy?: string;
  ts: string;
  title: string;
  type: RecordType;
};

/** Resolve a `supersedes` ref (a display or canonical id) to a display id. */
function resolveRef(
  ref: string,
  byId: ReadonlyMap<string, LogEvent>,
  byDisplay: ReadonlyMap<string, LogEvent>,
): string | undefined {
  return byDisplay.get(ref)?.display ?? byId.get(ref)?.display;
}

/**
 * Fold the log into the current decision records. Events are replayed in `seq`
 * order (the drain's total order); each `create` becomes a record, and a
 * `supersedes` ref links the two records in both directions and flips the
 * superseded one's status. Output is sorted by `seq` and fully determined by the
 * input, so any two builds of the same log produce identical state.
 */
export function project(events: readonly LogEvent[]): DecisionRecord[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const byId = new Map(ordered.map((event) => [event.id, event]));
  const byDisplay = new Map(ordered.map((event) => [event.display, event]));

  const typeCount = new Map<RecordType, number>();
  const records = new Map<string, DecisionRecord>();
  for (const event of ordered) {
    const ordinal = (typeCount.get(event.type) ?? 0) + 1;
    typeCount.set(event.type, ordinal);
    records.set(event.display, {
      actor: event.actor,
      body: event.body,
      display: event.display,
      id: event.id,
      ordinal,
      status: "accepted",
      ts: event.ts,
      title: event.title,
      type: event.type,
    });
  }

  for (const event of ordered) {
    if (!event.supersedes) {
      continue;
    }
    const target = resolveRef(event.supersedes, byId, byDisplay);
    const self = records.get(event.display);
    if (self && target) {
      self.supersedes = target;
    }
    const superseded = target ? records.get(target) : undefined;
    if (superseded) {
      superseded.status = "superseded";
      superseded.supersededBy = event.display;
    }
  }

  return [...records.values()].sort((a, b) => a.ordinal - b.ordinal);
}

import { describe, expect, it } from "vitest";

import { drain } from "./drain.ts";
import { createIntake, type IntakeRequest } from "./events.ts";

function intake(overrides: Partial<IntakeRequest> & { nonce: string; ts: string }): IntakeRequest {
  return createIntake({
    actor: "alice",
    body: "body",
    title: `title ${overrides.nonce}`,
    type: "decision",
    ...overrides,
  });
}

describe("drain", () => {
  it("assigns monotonic seq and per-type display ids from empty", () => {
    const a = intake({ nonce: "a", ts: "2026-01-01T00:00:00.000Z" });
    const b = intake({ nonce: "b", ts: "2026-01-02T00:00:00.000Z" });
    const result = drain([], [a, b]);
    expect(result.added.map((event) => [event.seq, event.display])).toEqual([
      [1, "DEC-0001"],
      [2, "DEC-0002"],
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("orders a batch by timestamp then content id, not input order", () => {
    const late = intake({ nonce: "late", ts: "2026-01-09T00:00:00.000Z" });
    const early = intake({ nonce: "early", ts: "2026-01-01T00:00:00.000Z" });
    const result = drain([], [late, early]);
    expect(result.added.map((event) => event.title)).toEqual([
      "title early",
      "title late",
    ]);
  });

  it("continues numbering from an existing log", () => {
    const first = drain([], [intake({ nonce: "a", ts: "2026-01-01T00:00:00.000Z" })]);
    const second = drain(first.events, [intake({ nonce: "b", ts: "2026-01-02T00:00:00.000Z" })]);
    expect(second.added[0]?.seq).toBe(2);
    expect(second.added[0]?.display).toBe("DEC-0002");
  });

  it("is idempotent: an already-committed intake is skipped, not duplicated", () => {
    const one = intake({ nonce: "a", ts: "2026-01-01T00:00:00.000Z" });
    const first = drain([], [one]);
    const again = drain(first.events, [one]);
    expect(again.added).toEqual([]);
    expect(again.skipped).toHaveLength(1);
    expect(again.events).toHaveLength(1);
  });

  it("carries a supersedes ref onto the committed event", () => {
    const sup = intake({
      nonce: "b",
      ts: "2026-01-02T00:00:00.000Z",
      supersedes: "DEC-0001",
    });
    const result = drain([], [sup]);
    expect(result.added[0]?.supersedes).toBe("DEC-0001");
  });

  it("does not mutate its inputs", () => {
    const existing = drain([], [intake({ nonce: "a", ts: "2026-01-01T00:00:00.000Z" })]).events;
    const snapshot = JSON.stringify(existing);
    drain(existing, [intake({ nonce: "b", ts: "2026-01-02T00:00:00.000Z" })]);
    expect(JSON.stringify(existing)).toBe(snapshot);
  });
});

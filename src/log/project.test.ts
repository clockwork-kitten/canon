import { describe, expect, it } from "vitest";

import { drain } from "./drain.ts";
import { createIntake, type IntakeRequest, type LogEvent } from "./events.ts";
import { project } from "./project.ts";

function intake(nonce: string, ts: string, supersedes?: string): IntakeRequest {
  return createIntake({
    actor: "alice",
    body: `body ${nonce}`,
    nonce,
    title: `Decision ${nonce}`,
    ts,
    type: "decision",
    ...(supersedes ? { supersedes } : {}),
  });
}

function logOf(...intakes: IntakeRequest[]): LogEvent[] {
  return drain([], intakes).events;
}

describe("project", () => {
  it("folds each create into an accepted record with a per-type ordinal", () => {
    const records = project(
      logOf(
        intake("a", "2026-01-01T00:00:00.000Z"),
        intake("b", "2026-01-02T00:00:00.000Z"),
      ),
    );
    expect(records.map((r) => [r.display, r.ordinal, r.status])).toEqual([
      ["DEC-0001", 1, "accepted"],
      ["DEC-0002", 2, "accepted"],
    ]);
  });

  it("marks a record superseded and links both directions when referenced by display id", () => {
    const records = project(
      logOf(
        intake("a", "2026-01-01T00:00:00.000Z"),
        intake("b", "2026-01-02T00:00:00.000Z", "DEC-0001"),
      ),
    );
    const [first, second] = records;
    expect(first?.status).toBe("superseded");
    expect(first?.supersededBy).toBe("DEC-0002");
    expect(second?.supersedes).toBe("DEC-0001");
    expect(second?.status).toBe("accepted");
  });

  it("resolves a supersedes ref given by canonical id", () => {
    const log = logOf(intake("a", "2026-01-01T00:00:00.000Z"));
    const canonicalId = log[0]?.id as string;
    const next = drain(log, [intake("b", "2026-01-02T00:00:00.000Z", canonicalId)]).events;
    const records = project(next);
    expect(records[0]?.status).toBe("superseded");
    expect(records[1]?.supersedes).toBe("DEC-0001");
  });

  it("ignores an unresolvable supersedes ref", () => {
    const records = project(logOf(intake("a", "2026-01-01T00:00:00.000Z", "DEC-9999")));
    expect(records[0]?.status).toBe("accepted");
    expect(records[0]?.supersedes).toBeUndefined();
  });

  it("is deterministic regardless of event input order", () => {
    const log = logOf(
      intake("a", "2026-01-01T00:00:00.000Z"),
      intake("b", "2026-01-02T00:00:00.000Z"),
    );
    const shuffled = [...log].reverse();
    expect(project(shuffled)).toEqual(project(log));
  });
});

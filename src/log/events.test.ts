import { describe, expect, it } from "vitest";

import {
  contentId,
  createIntake,
  displayNumber,
  formatDisplay,
  type IntakeRequest,
} from "./events.ts";

const base: Omit<IntakeRequest, "nonce" | "ts"> = {
  actor: "alice",
  body: "We will do the thing.",
  title: "Do the thing",
  type: "decision",
};

describe("createIntake", () => {
  it("mints a nonce and timestamp when omitted", () => {
    const a = createIntake(base);
    const b = createIntake(base);
    expect(a.nonce).not.toBe("");
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("preserves explicit fields and omits supersedes when absent", () => {
    const intake = createIntake({ ...base, nonce: "n1", ts: "2026-01-01T00:00:00.000Z" });
    expect(intake).toEqual({ ...base, nonce: "n1", ts: "2026-01-01T00:00:00.000Z" });
    expect("supersedes" in intake).toBe(false);
  });
});

describe("contentId", () => {
  it("is stable for identical content", () => {
    const intake = createIntake({ ...base, nonce: "n1", ts: "2026-01-01T00:00:00.000Z" });
    expect(contentId(intake)).toBe(contentId({ ...intake }));
  });

  it("differs when the nonce differs even if prose matches", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    const a = createIntake({ ...base, nonce: "n1", ts });
    const b = createIntake({ ...base, nonce: "n2", ts });
    expect(contentId(a)).not.toBe(contentId(b));
  });

  it("differs when a field changes", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    const a = createIntake({ ...base, nonce: "n1", ts });
    const b = createIntake({ ...base, nonce: "n1", ts, title: "Other" });
    expect(contentId(a)).not.toBe(contentId(b));
  });
});

describe("formatDisplay / displayNumber", () => {
  it("formats a zero-padded per-type display id", () => {
    expect(formatDisplay("decision", 7)).toBe("DEC-0007");
    expect(formatDisplay("decision", 1234)).toBe("DEC-1234");
  });

  it("round-trips the numeric part", () => {
    expect(displayNumber("DEC-0007")).toBe(7);
    expect(displayNumber("DEC-1234")).toBe(1234);
  });

  it("returns 0 for an unrecognized shape", () => {
    expect(displayNumber("garbage")).toBe(0);
  });
});

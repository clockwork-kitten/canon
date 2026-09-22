import { describe, expect, it } from "vitest";

import type { DecisionRecord } from "./project.ts";

import { renderDecision, renderGraph, renderIndex, renderProjection } from "./render.ts";

function record(overrides: Partial<DecisionRecord>): DecisionRecord {
  return {
    actor: "alice",
    body: "The body.",
    display: "DEC-0001",
    id: "hash1",
    ordinal: 1,
    status: "accepted",
    title: "First",
    ts: "2026-01-01T00:00:00.000Z",
    type: "decision",
    ...overrides,
  };
}

describe("renderDecision", () => {
  it("renders an h1, metadata block, and body", () => {
    const out = renderDecision(record({}));
    expect(out).toBe(
      [
        "# DEC-0001 · First",
        "",
        "- Status: accepted",
        "- Author: alice",
        "- Date: 2026-01-01T00:00:00.000Z",
        "",
        "The body.",
      ].join("\n") + "\n",
    );
  });

  it("includes supersedes / superseded-by links when present", () => {
    const out = renderDecision(
      record({ status: "superseded", supersededBy: "DEC-0002" }),
    );
    expect(out).toContain("- Superseded by: [DEC-0002](DEC-0002.md)");
  });
});

describe("renderIndex", () => {
  it("lists records and flags superseded ones", () => {
    const out = renderIndex([
      record({ display: "DEC-0001", status: "superseded", title: "Old" }),
      record({ display: "DEC-0002", ordinal: 2, title: "New" }),
    ]);
    expect(out).toContain("- [DEC-0001 Old](DEC-0001.md) — superseded");
    expect(out).toContain("- [DEC-0002 New](DEC-0002.md)");
  });

  it("renders a placeholder when empty", () => {
    expect(renderIndex([])).toBe("# Decisions\n\n_No decisions recorded yet._\n");
  });
});

describe("renderGraph", () => {
  it("emits nodes and supersedes edges with stable key order", () => {
    const graph = JSON.parse(
      renderGraph([
        record({ display: "DEC-0001", status: "superseded" }),
        record({ display: "DEC-0002", ordinal: 2, supersedes: "DEC-0001" }),
      ]),
    );
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toEqual([
      { from: "DEC-0002", to: "DEC-0001", type: "supersedes" },
    ]);
  });
});

describe("renderProjection", () => {
  it("produces one doc per record plus the index and graph, path-sorted", () => {
    const files = renderProjection([
      record({ display: "DEC-0001" }),
      record({ display: "DEC-0002", ordinal: 2 }),
    ]);
    expect(files.map((f) => f.path)).toEqual([
      "decisions/DEC-0001.md",
      "decisions/DEC-0002.md",
      "decisions/index.md",
      "graph.json",
    ]);
  });

  it("is byte-identical across repeated renders", () => {
    const records = [record({ display: "DEC-0001" })];
    expect(renderProjection(records)).toEqual(renderProjection(records));
  });
});

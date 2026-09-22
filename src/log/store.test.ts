import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runAddDecision, runBuild, runDrain } from "../cli/main.ts";
import { readIntake, readLog } from "./store.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "canon-log-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("intake -> drain -> build loop", () => {
  it("stages without an ID, drains into the log, and projects docs", () => {
    expect(runAddDecision(["Pick Bun", "--actor", "alice", "--body", "Use Bun."], cwd)).toBe(0);
    expect(readIntake(cwd)).toHaveLength(1);
    expect(readLog(cwd)).toHaveLength(0);

    expect(runDrain([], cwd)).toBe(0);
    const log = readLog(cwd);
    expect(log).toHaveLength(1);
    expect(log[0]?.display).toBe("DEC-0001");
    // Staging file is consumed by the drain.
    expect(readIntake(cwd)).toHaveLength(0);

    expect(runBuild([], cwd)).toBe(0);
    const doc = readFileSync(join(cwd, "decisions", "DEC-0001.md"), "utf8");
    expect(doc).toContain("# DEC-0001 · Pick Bun");
    expect(existsSync(join(cwd, "graph.json"))).toBe(true);
  });

  it("re-draining is a no-op and re-building is byte-identical", () => {
    runAddDecision(["A", "--actor", "alice"], cwd);
    runDrain([], cwd);
    runBuild([], cwd);

    const firstDoc = readFileSync(join(cwd, "decisions", "index.md"), "utf8");
    const firstGraph = readFileSync(join(cwd, "graph.json"), "utf8");

    // A second drain with nothing staged must not change the log.
    const logBefore = JSON.stringify(readLog(cwd));
    expect(runDrain([], cwd)).toBe(0);
    expect(JSON.stringify(readLog(cwd))).toBe(logBefore);

    // A rebuild must produce identical bytes.
    runBuild([], cwd);
    expect(readFileSync(join(cwd, "decisions", "index.md"), "utf8")).toBe(firstDoc);
    expect(readFileSync(join(cwd, "graph.json"), "utf8")).toBe(firstGraph);
  });

  it("build --check passes when current and fails after a hand-edit", () => {
    runAddDecision(["A", "--actor", "alice"], cwd);
    runDrain([], cwd);
    runBuild([], cwd);
    expect(runBuild(["--check"], cwd)).toBe(0);

    // Simulate a stale/hand-edited generated file: add another decision but
    // don't rebuild, so the committed projection is out of date.
    runAddDecision(["B", "--actor", "alice"], cwd);
    runDrain([], cwd);
    expect(runBuild(["--check"], cwd)).toBe(1);
  });

  it("supersession flows through to the projected status", () => {
    runAddDecision(["Original", "--actor", "alice"], cwd);
    runDrain([], cwd);
    runAddDecision(["Replacement", "--actor", "alice", "--supersedes", "DEC-0001"], cwd);
    runDrain([], cwd);
    runBuild([], cwd);

    const graph = JSON.parse(readFileSync(join(cwd, "graph.json"), "utf8"));
    expect(graph.edges).toEqual([
      { from: "DEC-0002", to: "DEC-0001", type: "supersedes" },
    ]);
    const original = graph.nodes.find((n: { display: string }) => n.display === "DEC-0001");
    expect(original.status).toBe("superseded");
  });
});

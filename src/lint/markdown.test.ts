import { describe, expect, it } from "vitest";

import { STUDIO_MARKDOWNLINT_BASELINE } from "../config/baseline.ts";
import { fixContents, formatIssues, lintContent } from "./markdown.ts";

describe("lintContent", () => {
  it("reports no issues for conformant markdown", async () => {
    const issues = await lintContent(
      { "ok.md": "# Title\n\nA conformant paragraph.\n" },
      STUDIO_MARKDOWNLINT_BASELINE,
    );
    expect(issues).toEqual([]);
  });

  it("flags a missing top-level heading", async () => {
    const issues = await lintContent(
      { "bad.md": "no heading here\n" },
      STUDIO_MARKDOWNLINT_BASELINE,
    );
    const rules = issues.map((issue) => issue.rule);
    expect(rules).toContain("MD041/first-line-heading");
    expect(issues[0]?.file).toBe("bad.md");
  });

  it("respects config overrides — MD013 off means long lines pass", async () => {
    const longLine = `# Title\n\n${"word ".repeat(40).trim()}\n`;
    const withBaseline = await lintContent(
      { "a.md": longLine },
      STUDIO_MARKDOWNLINT_BASELINE,
    );
    expect(withBaseline.some((issue) => issue.rule.startsWith("MD013"))).toBe(
      false,
    );

    const withMd013 = await lintContent(
      { "a.md": longLine },
      { default: true, MD013: true },
    );
    expect(withMd013.some((issue) => issue.rule.startsWith("MD013"))).toBe(
      true,
    );
  });

  it("sorts issues by file then line", async () => {
    const issues = await lintContent(
      { "a.md": "#y\n", "z.md": "#x\n" },
      STUDIO_MARKDOWNLINT_BASELINE,
    );
    const files = issues.map((issue) => issue.file);
    expect(files).toEqual([...files].toSorted());
  });
});

describe("formatIssues", () => {
  it("returns an empty string for no issues", () => {
    expect(formatIssues([])).toBe("");
  });

  it("renders file:line rule description with optional detail", () => {
    const line = formatIssues([
      {
        description: "Multiple blanks",
        detail: "Expected: 1",
        file: "a.md",
        line: 3,
        rule: "MD012/no-multiple-blanks",
      },
    ]);
    expect(line).toBe(
      "a.md:3 MD012/no-multiple-blanks Multiple blanks [Expected: 1]",
    );
  });
});

describe("fixContents", () => {
  it("returns an empty array for no documents", async () => {
    expect(await fixContents({}, STUDIO_MARKDOWNLINT_BASELINE)).toEqual([]);
  });

  it("leaves conformant content unchanged with no residue", async () => {
    const [result] = await fixContents(
      { "ok.md": "# Title\n\nA conformant paragraph.\n" },
      STUDIO_MARKDOWNLINT_BASELINE,
    );
    expect(result?.changed).toBe(false);
    expect(result?.residue).toEqual([]);
    expect(result?.content).toBe("# Title\n\nA conformant paragraph.\n");
  });

  it("autofixes fixable rules (trailing spaces, multiple blanks)", async () => {
    const dirty =
      "# Title\n\ntrailing spaces here   \n\n\n\nafter extra blanks\n";
    const [result] = await fixContents(
      { "a.md": dirty },
      STUDIO_MARKDOWNLINT_BASELINE,
    );
    expect(result?.changed).toBe(true);
    expect(result?.content).not.toContain("here   ");
    expect(result?.content).not.toContain("\n".repeat(3));
    expect(result?.residue).toEqual([]);
  });

  it("reports residue for a rule with no autofix (missing top-level heading)", async () => {
    const [result] = await fixContents(
      { "bad.md": "no heading here\n" },
      STUDIO_MARKDOWNLINT_BASELINE,
    );
    expect(result?.changed).toBe(false);
    expect(result?.residue.map((issue) => issue.rule)).toContain(
      "MD041/first-line-heading",
    );
  });

  it("fixes what it can and still reports the unfixable remainder", async () => {
    // Trailing spaces are fixable; the missing H1 is not.
    const [result] = await fixContents(
      { "mix.md": "no heading   \n" },
      STUDIO_MARKDOWNLINT_BASELINE,
    );
    expect(result?.changed).toBe(true);
    expect(result?.content).toBe("no heading\n");
    expect(result?.residue.map((issue) => issue.rule)).toContain(
      "MD041/first-line-heading",
    );
  });
});

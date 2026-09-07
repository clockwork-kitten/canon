import { describe, expect, it } from "vitest";

import type { ResolvedLlmsConfig } from "../config/resolve.ts";

import {
  type DocMeta,
  extractDocMeta,
  generateLlms,
  renderLlms,
} from "./llms.ts";

describe("extractDocMeta", () => {
  it("takes the first h1 and the first following paragraph", () => {
    const meta = extractDocMeta(
      "# Title\n\nThe summary line.\n\nMore body.\n",
      "fallback.md",
    );
    expect(meta).toEqual({ description: "The summary line.", title: "Title" });
  });

  it("flattens links and inline formatting in the description", () => {
    const meta = extractDocMeta(
      "# T\n\nSee **bold** and [the docs](x.md) and `code`.\n",
      "f.md",
    );
    expect(meta.description).toBe("See bold and the docs and code.");
  });

  it("skips non-paragraph blocks between the heading and the first paragraph", () => {
    const meta = extractDocMeta(
      "# T\n\n> a quote\n\n| a | b |\n| - | - |\n\nReal prose here.\n",
      "f.md",
    );
    expect(meta.description).toBe("Real prose here.");
  });

  it("collapses whitespace across wrapped lines", () => {
    const meta = extractDocMeta(
      "# T\n\nline one\nwrapped   onto  two\n",
      "f.md",
    );
    expect(meta.description).toBe("line one wrapped onto two");
  });

  it("falls back to the filename and empty description without an h1", () => {
    expect(extractDocMeta("no heading here\n", "readme.md")).toEqual({
      description: "",
      title: "readme.md",
    });
  });
});

const config: ResolvedLlmsConfig = {
  output: "llms.txt",
  project: "Proj",
  sections: [
    { prefix: "", shallow: true, title: "Top level" },
    { prefix: "docs/", shallow: false, title: "Docs" },
  ],
  summary: "A summary.",
};

describe("renderLlms", () => {
  it("renders title, summary, and one section per group with first-match placement", () => {
    const docs: DocMeta[] = [
      { description: "root doc", path: "README.md", title: "Readme" },
      { description: "", path: "docs/a.md", title: "A" },
      { description: "nested", path: "docs/deep/b.md", title: "B" },
    ];
    expect(renderLlms(docs, config)).toBe(
      [
        "# Proj",
        "",
        "> A summary.",
        "",
        "## Top level",
        "",
        "- [Readme](README.md): root doc",
        "",
        "## Docs",
        "",
        "- [A](docs/a.md)",
        "- [B](docs/deep/b.md): nested",
      ].join("\n") + "\n",
    );
  });

  it("omits empty sections and documents matching no section", () => {
    const narrow: ResolvedLlmsConfig = {
      ...config,
      sections: [{ prefix: "docs/", shallow: false, title: "Docs" }],
    };
    const out = renderLlms(
      [{ description: "", path: "README.md", title: "R" }],
      narrow,
    );
    expect(out).toBe("# Proj\n\n> A summary.\n");
  });
});

describe("generateLlms", () => {
  it("sorts files and reads each via the injected reader", () => {
    const files = ["docs/b.md", "README.md", "docs/a.md"];
    const contents: Record<string, string> = {
      "docs/a.md": "# Alpha\n\nFirst doc.\n",
      "docs/b.md": "# Beta\n\nSecond doc.\n",
      "README.md": "# Home\n\nThe root.\n",
    };
    const out = generateLlms(files, config, (path) => contents[path] ?? "");
    expect(out).toContain("- [Home](README.md): The root.");
    // docs sorted: a before b
    expect(out.indexOf("docs/a.md")).toBeLessThan(out.indexOf("docs/b.md"));
  });
});

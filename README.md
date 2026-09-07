# canon

Standalone **documentation-repo conformance** tool for the clockwork-kitten studio: markdown lint,
reference integrity, and `llms.txt` generation over one pinned mdast/GFM parser and one config —
with schema-aware entry operations and cross-repo intake to come.

`canon` runs on any documentation repo by itself, and is invoked by
[`conform`](https://github.com/clockwork-kitten/standards) as one tool in the studio's global check
(alongside `bedrock` and the code toolchain).

> Extracted from `clockwork-kitten/standards` (the `@clockwork-kitten/conform` engine). Its
> documentation surface — the pinned parser, the markdownlint/reference/`llms.txt` operations, and
> the config machinery — was lifted out and adapted to stand alone.

## Why one parser, one config

canon's core value is that every doc operation shares the **single** pinned mdast/GFM parser and the
**single** resolved config object in-process. The linter and the structural operations agree on
document structure and settings, so a precondition can't drift from its postcondition. Keeping that
guarantee intact is the whole point of the tool.

## Install

canon is published to npm as [`@clockwork-kitten/canon`](https://www.npmjs.com/package/@clockwork-kitten/canon)
and consumed as a normal dependency. It runs its TypeScript directly under Bun, so there is no build
step — the `canon` binary works straight from the installed source.

```sh
bun add -D @clockwork-kitten/canon        # latest
bun add -D @clockwork-kitten/canon@0.1.0  # pinned
```

`conform` consumes canon this way (one tool among the studio's global check); any pure-documentation
repo can depend on it directly. Releases are cut deliberately by the `release` workflow, which tags,
publishes a GitHub Release, and publishes the package to npm (see [ROADMAP.md](ROADMAP.md)).

## Usage

```sh
canon check                 # markdown lint + reference integrity over **/*.md
canon check --no-references # markdown lint only
canon fix                   # autofix fixable markdown rules, then regenerate llms.txt
canon fix --no-llms         # autofix only
canon llms                  # write llms.txt from the configured sections
canon llms --check          # fail if llms.txt is out of date (CI gate)
```

`check` is the failing gate CI runs; `fix` is authoring-time only (it never fails on unfixable
residue) so it can't fight the human-merge gate.

## Configuration

canon ships the studio markdownlint baseline as its default. A repo overrides it with a
`canon.config.ts` (or `.jsonc`) at its root, deep-merged over the baseline:

```ts
import { defineConfig } from "@clockwork-kitten/canon";

export default defineConfig({
  markdownlint: { MD013: { line_length: 120 } }, // deep-merged over the baseline
  references: { ignore: ["ops/docs/"] }, // backtick paths that live in another repo
  llms: {
    project: "My Docs",
    summary: "One-line description rendered as the llms.txt blockquote.",
    sections: [{ prefix: "", title: "Documentation" }],
  },
});
```

Set `extends: false` to opt out of the baseline and use only the rules you declare.

## Development

```sh
bun install
bun run test        # vitest with an 80% coverage gate
bun run typecheck   # tsc --noEmit
bun run check       # canon check, dogfooded on this repo
bun run check:llms  # verify llms.txt is up to date
```

See [ROADMAP.md](ROADMAP.md) for what ships next (schema-aware entry operations and cross-repo
intake).

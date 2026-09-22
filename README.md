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

canon is published privately to **GitHub Packages** as `@clockwork-kitten/canon`, scoped to the
clockwork-kitten org. It runs its TypeScript directly under Bun, so there is no build step — the
`canon` binary works straight from the installed source.

Consumers add a committed `.npmrc` that maps the scope to the GitHub Packages registry:

```ini
# .npmrc
@clockwork-kitten:registry=https://npm.pkg.github.com
```

Then install (pin to a version):

```sh
bun add -D @clockwork-kitten/canon        # latest
bun add -D @clockwork-kitten/canon@0.1.0  # pinned
```

**Auth.** GitHub Packages requires a token even for reads:

- **CI:** the consuming workflow reads with the auto-scoped `GITHUB_TOKEN` — add
  `permissions: { packages: read }` to the job, and grant the canon package access to the
  consuming repo (or make the package org-internal so all org repos can read it).
- **Local dev:** add a personal token with the `read:packages` scope to your `~/.npmrc` once:

  ```ini
  # ~/.npmrc
  //npm.pkg.github.com/:_authToken=<YOUR_READ_PACKAGES_TOKEN>
  ```

`conform` consumes canon this way (one tool among the studio's global check); any pure-documentation
repo can depend on it directly. Releases are cut deliberately by the `release` workflow, which tags,
publishes a GitHub Release, and publishes the package to GitHub Packages (see [ROADMAP.md](ROADMAP.md)).

> Moving to public npm later is a ~2-line change: drop `publishConfig.registry` from
> `package.json`, swap the publish token in `release.yml`, and delete the registry line from
> consumers' `.npmrc`. No package rename — the `@clockwork-kitten/canon` name is unchanged.

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

## Decision log (event-sourced docs)

canon can also treat a folder of records as an **append-only event log** whose docs are a
deterministic projection — the log is the source of truth, and every `.md` under `decisions/`
plus `graph.json` is generated from it. Capture is conflict-free; a single serialized "drain"
assigns IDs, so concurrent authors never race for a number:

```sh
canon add-decision "Adopt Bun" --actor jc --body "Use Bun everywhere."   # stage intake/ (no ID yet)
canon add-decision "Drop npm" --supersedes DEC-0001                      # supersede an earlier one
canon drain                 # single writer: assign DEC-000N, commit to log/
canon build                 # project log/ -> decisions/*.md + graph.json
canon build --check         # fail if generated docs were hand-edited or are stale (CI gate)
```

The flow is: `add-decision` writes a conflict-free file to `intake/` with **no** ID; the
`canon-drain` Action (a single-concurrency writer, the "elected leader") runs on merge to `main`,
assigns each a monotonic `DEC-000N` display ID plus an opaque content-addressed canonical ID, and
appends it to `log/`. `canon build` folds the log into docs. Because assignment happens once, in
one writer, IDs are stable and re-running either step is idempotent.

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

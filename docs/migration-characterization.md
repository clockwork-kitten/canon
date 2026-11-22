# Canon 0.1.0 characterization and migration inventory

This T0 snapshot freezes Canon's existing behavior before later engine-contract adoption. The
machine-readable inventory is
[`test/characterization/canon-v0.1.0/ledger.json`](../test/characterization/canon-v0.1.0/ledger.json);
its normalized golden is
[`expected.json`](../test/characterization/canon-v0.1.0/expected.json). The fixture revision is `1`,
the characterized package is `@clockwork-kitten/canon@0.1.0`, and the source revision is
`7162ec763a9e99fbe4ef047e6ffb7fcfb5a8e18c`.

## Support boundary frozen here

The corpus covers Markdown findings and fixes, reference integrity, `llms.txt` content, config
resolution, CLI parsing and exit classifications, deterministic decision drain/projection APIs,
and no-lock operation. Canon 0.1.0 predates compatibility bundles, lock input, profiles, canonical
results, and an `unlocked` status: a local no-config check uses the studio baseline and may pass.
The ledger records that absence rather than adding later contract behavior in this issue.

Verdict-affecting parser/tool versions are recorded exactly in the ledger from `bun.lock`. Golden
normalization replaces temporary roots with `<fixture>`, fixes decision nonces/timestamps, retains
stable finding fields, and sorts unordered collections. Run `bun run test:characterization` to
reproduce the golden comparison.

This is characterization evidence, not a second policy or migration authority. Future canonical
dispositions belong to Crux. There are no command, rule-ID, or suppression aliases and no
compatibility window. Known consumers (`standards` and `ops`) are inventory only and require
separate repo-local cutovers before retirement or rename work. The recorded organization search
also found `incubator`, but its pinned Standards v0.4.0 workflow predates Canon extraction, so it is
explicitly not classified as a current Canon consumer.

## Pull request 6 disposition

Retain [Canon PR #6](https://github.com/clockwork-kitten/canon/pull/6) as a separate change. At
inventory time it is open, cleanly mergeable, and green at head
`9441019afb8cfcda9f98ec7b6eb08b7c500d6389`. Its files are drain deployment glue
(`.github/workflows/drain.yml` plus deployment documentation), not characterization or future
engine-contract authority. It is neither a prerequisite for nor superseded by this snapshot; it
only needs rebasing if `main` moves before that PR is merged.

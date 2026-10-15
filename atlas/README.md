# forkctl: how it works

Mapped at 2026-10-15 from commit f1142aa by Atlas 1.24.0.

## What this is

7 parts, mostly TypeScript (131 files), CSS (2), Astro (1) and JavaScript (1). Work enters through 5 doors; the busiest is CI, which reaches 2 parts. It deploys a site to GitHub Pages. People run forkctl and forkctl-mcp.

## What changed since 2026-10-14 (569ba84)

- CI now also runs tests/run-command.test.ts.
- .env.example is now read by tests/_helpers/rename-fixtures.ts, tests/assess.test.ts, tests/drift.test.ts, tests/make-forkable.test.ts, tests/rename/textual.test.ts and tests/snapshot.test.ts.
- .github/workflows/ci.yml is now read by tests/_helpers/rename-fixtures.ts and tests/rename/identity.test.ts.
- CHANGELOG.md is now read by tests/_helpers/rename-fixtures.ts and tests/rename/textual.test.ts.
- And 7 more new writers and readers of places.
- 3 files added and 2 changed content, across 2 parts.

## What comes in

1. **CI.** On a pull request; on a push to main touching 12 paths; or by hand. Runs tests/assess.test.ts, tests/audit.test.ts, tests/backend-hardening.test.ts and 48 more; builds src/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **@mcptoolshop/forkctl** (the package's entry, not published from here). Loads src/index.ts.
4. **forkctl** (a command people run). Runs src/cli.ts.
5. **forkctl-mcp** (a command people run). Runs src/server.ts.

## What happens through CI

1. The workflow runs 51 files in tests; it builds src/ in src.
2. It uploads coverage to Codecov.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@mcptoolshop/forkctl** (the package's entry, not published from here) loads src/index.ts.

**forkctl** (a command people run) runs src/cli.ts and changes other repositories through the GitHub API.

**forkctl-mcp** (a command people run) runs src/server.ts and changes other repositories through the GitHub API.

## What breaks what

- **src** is imported only from tests, by 1 part (tests), and sits on the path of 4 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, assets/, design/, the repository root and site/; 8 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → src/cli.ts → src/dispatch.ts → src/lib/result.ts → src/lib/errors.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 8 writes and 8 reads use paths built at run time and are not named here.
- 26 writes and 22 reads go to a path their caller passes, not to this repository.
- 14 reads go to the directory the command is run in (.env.example, .github/, LICENSE and 4 more places), not to this repository.
- 1 command is built at run time and not followed.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.

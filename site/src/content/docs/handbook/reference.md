---
title: Tool Reference
description: All twenty-two forkable tools, grouped by layer, with inputs and outputs.
sidebar:
  order: 4
---

Every tool is a `ToolDescriptor<TInput, TOutput>` with a Zod-validated input schema. The MCP and CLI surfaces both call the same handlers through the central `dispatch()` boundary.

## Assessment

### `forkable_assess`

Score a repo's adoption-readiness across six categories (legal, setup, contribution, hygiene, template, sync).

| Field | Type | Notes |
|---|---|---|
| `repo` | `owner/repo` | Required |
| `goal` | `Goal` | Optional context |

Returns `AdoptionReport`: `score` (0–100), `blockers[]`, `strengths[]`, `nextActions[]` (top 5), `categories[]`.

CLI: `forkable assess <repo>`

### `forkable_choose_path`

Recommend `fork | template | import | clone_detached` for a given source + goal.

| Field | Type | Notes |
|---|---|---|
| `repo` | `owner/repo` | Required |
| `goal` | `contribute_upstream \| ship_derivative \| internal_seed \| client_copy \| experiment` | Required |

Decision logic:
- `contribute_upstream` → fork (only path that preserves upstream link)
- `ship_derivative` → template if `isTemplate`, else clone_detached
- `internal_seed` → template if available, else fork
- `client_copy` → template if available, else clone_detached
- `experiment` → fork

**Override:** if fork is policy-blocked and a template is available, downgrades to template.

CLI: `forkable choose-path <repo> --goal <goal>`

### `forkable_make_forkable`

Generate a patch plan (default) or open a PR (opt-in) that fixes the source repo's adoption blockers.

| Field | Type | Default |
|---|---|---|
| `repo` | `owner/repo` | required |
| `mode` | `plan \| pr` | `plan` |
| `branch` | string | `forkable/adoption-fixes` |

Generators cover: `NO_LICENSE`, `NO_README`, `NO_ENV_EXAMPLE`, `NO_CONTRIBUTING`, `NO_SECURITY`.

CLI: `forkable make-forkable <repo> [--mode pr] [--branch <name>]`

## Execution

### `forkable_preflight_policy`

Resolve fork policy across the enterprise → org → repo cascade. Catches:

- Archived source
- `allow_forking: false` at the repo level
- `members_can_fork_private_repositories: false` at the org level

Returns `ForkPolicyVerdict` with `allowed: yes | no | unknown` and a `reason`.

CLI: `forkable preflight-policy <repo>`

### `forkable_create_fork`

Kick off an async fork. Records a pending operation; returns immediately.

| Field | Type | Notes |
|---|---|---|
| `source` | `owner/repo` | Required |
| `destinationOrg` | string | Optional — defaults to authenticated user |
| `name` | string | Optional fork rename |
| `defaultBranchOnly` | boolean | Default `false` |

Returns `{ operationId, status, destination, destinationUrl, message }`.

CLI: `forkable create-fork <source> [--destination-org <org>] [--name <name>] [--default-branch-only]`

### `forkable_create_from_template`

Generate a new repo from a template via `POST /repos/{owner}/{repo}/generate`.

| Field | Type | Notes |
|---|---|---|
| `template` | `owner/repo` | Required |
| `owner` | string | Required (new repo owner) |
| `name` | string | Required (new repo name) |
| `description` | string | Optional |
| `private` | boolean | Default `false` |
| `includeAllBranches` | boolean | Default `false` |

CLI: `forkable create-from-template <template> --owner <owner> --name <name> [...]`

### `forkable_check_operation`

Idempotent single-probe poller. For pending fork/template ops, performs one `repos.get` against the destination; updates state on success.

CLI: `forkable check-operation <operationId>`

## Bootstrap

### `forkable_bootstrap`

Apply a profile's step sequence to a destination repo.

| Field | Type | Default |
|---|---|---|
| `destination` | `owner/repo` | required |
| `source` | `owner/repo` | optional |
| `profile` | `ProfileId` | required |
| `apply` | boolean | `true` |

Returns per-step `outcome` (`applied | skipped | advisory | failed`) plus a summary.

CLI: `forkable bootstrap <destination> --profile <id> [--source <source>] [--no-apply]`

### `forkable_configure_upstream`

Wire upstream sync. Returns the canonical `git remote add upstream` command sequence and optionally installs `.github/workflows/sync-upstream.yml`.

CLI: `forkable configure-upstream <destination> --source <source> [--branch main] [--no-install-workflow]`

### `forkable_scan_drift`

Scan a destination repo for hardcoded local paths, leaked secrets (GitHub PAT, AWS, OpenAI, Google), and stale source-owner references. Secret values are **never** echoed — `evidence: "<redacted>"`.

CLI: `forkable scan-drift <destination> [--source <source>]`

### `forkable_emit_handoff`

Single, truthful handoff artifact. Combines clone commands, upstream wiring, drift caveats, and a single next-action sentence. High-severity caveats override the next action.

CLI: `forkable emit-handoff <destination> [--source <source>] [--profile <id>]`

## Sync

### `forkable_sync`

Calls `POST /repos/{owner}/{repo}/merge-upstream`. Returns `mergeType: fast-forward | merge | none`. On 409 conflict, raises `SYNC_CONFLICT` with a hint pointing at `propose_sync_pr`. **Never force-pushes.**

CLI: `forkable sync <fork> [--branch <name>]`

### `forkable_diagnose_divergence`

Read-only. Uses the cross-repo compare API. Returns `status: ahead | behind | identical | diverged`, `aheadBy`, `behindBy`, files at risk, and a `fastForwardable` boolean.

CLI: `forkable diagnose-divergence <fork> [--branch <name>]`

### `forkable_propose_sync_pr`

PR-based sync for diverged forks. Creates a branch on the fork pointing at the upstream HEAD SHA (works because forks share git storage with their parent), then opens a PR into the fork's branch.

CLI: `forkable propose-sync-pr <fork> [--branch <name>] [--sync-branch <name>] [--pr-title <title>]`

## Fleet

### `forkable_list_forks`

List the authenticated user's forks (default) or forks of a specific source.

CLI: `forkable list-forks [--source <owner/repo>] [--limit <n>]`

### `forkable_fleet_health`

Health-check a set of forks. Sorts diverged + behind to the top.

CLI: `forkable fleet-health [--limit <n>]`

### `forkable_batch_sync`

Sequential sync across many forks. Stops after `failFastAfter` consecutive non-success outcomes (conflict + error).

CLI: `forkable batch-sync <fork>... [--branch <name>] [--fail-fast-after <n>]`

## Receipts

### `forkable_receipt`

Machine-readable receipt for an operation. Returns the operation record + every audit entry that referenced it + a one-line summary.

CLI: `forkable receipt <operationId>`

### `forkable_audit_log`

Query the append-only audit log. Filter by tool, operation id, ok flag, sinceMs.

CLI: `forkable audit-log [--tool <name>] [--operation-id <id>] [--ok <true|false>] [--limit <n>]`

## Rename *(new in v1.1.0)*

The rename layer works on a *local working tree* rather than through the GitHub API. It performs an AST-aware coherent rename across identity files, code symbols, non-code textual surfaces, and a post-pass that regenerates lockfiles and emits an asset-regeneration manifest. See [Rename](./rename/) for a walkthrough.

### `forkable_rename_plan`

Read-only. Analyse the tree and produce a `RenamePlan` with the intended diff per layer, plus the human-reviewable file `.forkable/rename-plan.diff`.

| Field | Type | Notes |
|---|---|---|
| `path` | string | Repo root (absolute or relative) |
| `from` | string | Canonical old name (e.g. `forkable`) |
| `to` | string | Canonical new name (e.g. `splitshift`) |
| `layers` | `("identity" \| "symbols" \| "deep-ts" \| "textual" \| "post")[]` | Default: all except `deep-ts` (auto when tsconfig resolves) |
| `exclude` | `string[]` | Glob patterns added to built-in excludes |
| `lockfileStrategy` | `"regenerate" \| "skip"` | Default `"regenerate"` |
| `deepTs` | boolean | Auto when `tsconfig.json` + `ts-morph` resolvable |

Returns a `RenamePlan` — casing variant map, per-layer dry-run report, warnings (including `STRING_LITERAL_REWRITTEN` and `ENV_REQUIRES_REVIEW`).

CLI: `forkable rename plan <path> --from <old> --to <new> [--exclude <glob>] [--no-deep-ts]`

### `forkable_rename_apply`

Consumes a `RenamePlan`. Snapshots the tree first, then runs the five passes in order (identity → symbols → deep-ts → textual → post). Returns a `RenameReceipt` with per-layer outcomes, paths moved, lockfiles regenerated, and any assets flagged for regeneration.

| Field | Type | Notes |
|---|---|---|
| `path` | string | Repo root |
| `plan` | string | Path to the `.forkable/rename-plan.json` produced by `plan` |
| `planHash` | string | Optional — defends against stale plans (fails with `RENAME_PLAN_STALE`) |

CLI: `forkable rename apply <path> --plan .forkable/rename-plan.json`

### `forkable_rename_rollback`

Restores from the latest snapshot. For git repos, `git reset --hard <pre-rename-HEAD>` + stash pop. For non-git repos, extracts the snapshot tarball.

| Field | Type | Notes |
|---|---|---|
| `path` | string | Repo root |

CLI: `forkable rename rollback <path>`

If no snapshot exists, returns `RENAME_ROLLBACK_NOT_FOUND`. Snapshots are kept for 7 days.

## ToolResult shape

Every tool returns:

```ts
type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ForkableErrorCode; message: string; hint?: string; details?: unknown } };
```

Error codes are exhaustively enumerated in `src/lib/errors.ts` — see the [Architecture](./architecture/) page for the full list.

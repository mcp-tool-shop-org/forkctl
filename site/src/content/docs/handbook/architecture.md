---
title: Architecture
description: How forkctl is wired internally — layers, dispatch boundary, async operations, audit log.
sidebar:
  order: 5
---

forkctl is one TypeScript package that exposes the same twenty-two tools through two transports (MCP stdio + commander CLI), behind a single dispatch boundary that handles validation and audit.

## High-level shape

```
┌──────────────────┐   ┌──────────────────┐
│   MCP server     │   │       CLI        │
│   (stdio)        │   │  (commander)     │
└────────┬─────────┘   └─────────┬────────┘
         │                       │
         ▼                       ▼
   ┌─────────────────────────────────────┐
   │     dispatch(tool, input, ctx)      │
   │   • Zod-validates input             │
   │   • Calls handler                   │
   │   • Records audit entry             │
   │   • Returns ToolResult              │
   └─────────────────┬───────────────────┘
                     │
   ┌─────────────────┴───────────────────┐
   │   22 ToolDescriptors (registry)     │
   │   Seven layers, all sharing ToolCtx │
   └─────┬─────────────────────┬─────────┘
         │                     │
         ▼                     ▼
   ┌──────────┐         ┌──────────────┐
   │  Octokit │         │  SQLite      │
   │  (GitHub)│         │  (state +    │
   │          │         │   audit log) │
   └──────────┘         └──────────────┘
```

## Seven layers

| Layer | Responsibility | Tools |
|---|---|---|
| Assessment | Score readiness, choose strategy, fix sources | 3 |
| Execution | Async fork/template + operation tracking | 4 |
| Bootstrap | Profile-driven aftercare on the destination | 4 |
| Sync | merge-upstream, divergence diagnosis, PR fallback | 3 |
| Fleet | Many forks at once | 3 |
| Receipts | Audit log + per-operation receipts | 2 |
| Rename *(new in v1.1.0)* | AST-aware rename across identity, symbols, textual, post passes | 3 |

The rename layer slots in after Receipts because it operates on a *working tree* rather than on the GitHub API — it runs entirely locally, uses Octokit only indirectly (to rewrite repo URL mentions), and is the first layer that writes back to the user's filesystem. Its three tools (`forkctl_rename_plan`, `forkctl_rename_apply`, `forkctl_rename_rollback`) share the same dispatch boundary and audit surface as the first six layers. See [Rename](./rename/) for the user-facing walkthrough.

## The dispatch boundary

There is exactly one place where tool input is validated and audit is recorded: `src/dispatch.ts`.

```ts
export async function dispatch<I, O>(
  tool: ToolDescriptor<I, O>,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolResult<O>>
```

It does four things, in order:

1. Validates `rawInput` against `tool.inputSchema` (Zod). Bad input → `INVALID_INPUT` with a `hint` listing the offending paths.
2. Calls the tool's pure handler with the parsed input.
3. Extracts `operationId` from the result if present (fork/template ops carry one).
4. Writes an `AuditLog` entry with the tool name, redacted input, ok flag, result (or error), and operation id.

Handlers themselves never touch audit and never throw to dispatch — they always return a `ToolResult`. This makes them trivially testable in isolation.

## Async operations

Fork creation can take **up to 5 minutes** per GitHub's docs. Template generation is faster but still asynchronous. forkctl models this honestly:

```
create_fork
  └─ resolveForkPolicy (preflight)
  └─ Operations.create({ kind: 'create_fork', source, destination })  ──> 'pending'
  └─ POST /repos/{o}/{r}/forks
  └─ return { operationId, status: 'pending', destination, ... }

check_operation(operationId)
  └─ Operations.get(id)
  └─ if status != 'pending' → return as-is
  └─ try repos.get(destination)
       ├─ 200 → Operations.succeed(id, repoMeta)
       ├─ 404 → leave 'pending' (still propagating)
       └─ other → Operations.fail(id, error)
```

The `Operations` class lives in `src/lib/operations.ts` and is the single owner of the `operations` SQLite table.

## Sync semantics

forkctl's sync layer never force-pushes. There are exactly three ways a sync can land:

1. **Fast-forward** — `forkctl_sync` calls `merge-upstream`, fork is behind, merge succeeds. `mergeType: 'fast-forward'`.
2. **No-op** — fork is identical to upstream. `mergeType: 'none'`. Returns `ok`.
3. **Diverged** — fast-forward impossible. `merge-upstream` returns 409. forkctl raises `SYNC_CONFLICT` with a hint pointing at `propose_sync_pr`.

`propose_sync_pr` exploits the fact that **forks share git storage with their parent**. It reads the upstream HEAD SHA, then creates a branch on the fork pointing at that SHA via `git.createRef`. A PR from that branch into the fork's default branch becomes the user's resolution surface.

## State directory layout

```
<state-dir>/
  forkable-state.db          # SQLite, WAL mode
  forkable-state.db-wal
  forkable-state.db-shm
```

Two tables:

```sql
CREATE TABLE operations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,             -- create_fork | create_from_template | batch_sync
  status TEXT NOT NULL,           -- pending | succeeded | failed | timed_out
  source TEXT,
  destination TEXT,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  result_json TEXT,
  error_json TEXT
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  tool TEXT NOT NULL,
  input_json TEXT NOT NULL,       -- redacted
  ok INTEGER NOT NULL,
  result_json TEXT,
  operation_id TEXT
);
```

Schema version is tracked in a `schema_version` table and applied at `openState()` time.

## Error codes

Every error is a `ForkctlError` with a stable `code`. Full list:

```text
INVALID_INPUT          MISSING_TOKEN          BAD_REPO_REF
GITHUB_NOT_FOUND       GITHUB_FORBIDDEN       GITHUB_UNAUTHORIZED
GITHUB_RATE_LIMITED    GITHUB_CONFLICT        GITHUB_VALIDATION
GITHUB_UNKNOWN         FORK_POLICY_BLOCKED    TEMPLATE_NOT_AVAILABLE
OPERATION_NOT_FOUND    OPERATION_TIMEOUT      OPERATION_FAILED
SYNC_CONFLICT          SYNC_DIVERGED          SYNC_BRANCH_EXISTS
MAKE_FORKABLE_BRANCH_EXISTS                   INTERNAL
NOT_IMPLEMENTED
RENAME_INVALID_NAME    RENAME_NOT_A_REPO      RENAME_SNAPSHOT_FAILED
RENAME_APPLY_FAILED    RENAME_ROLLBACK_NOT_FOUND                RENAME_PLAN_STALE
RENAME_LOCKFILE_REGEN_FAILED                  RENAME_DEEP_TS_FAILED
RENAME_LANG_UNAVAILABLE                       STRING_LITERAL_REWRITTEN
ENV_REQUIRES_REVIEW
```

New in v1.1.0: the nine `RENAME_*` codes, plus `STRING_LITERAL_REWRITTEN` and `ENV_REQUIRES_REVIEW` emitted by the rename passes. See [Troubleshooting](../troubleshooting/) for per-code recovery guidance.

The CLI exits with code 1 on `ok: false` and prints `ERROR <code>: <message>` (plus `hint:` if present) to stderr. The MCP layer maps `ok: false` to `{ isError: true, content: [{ type: "text", text: <json> }] }`.

## What forkctl will never do

These are enforced by code, not by docs:

- Force-push to any branch
- Delete a repository
- Delete a branch
- Skip git hooks
- Send telemetry, analytics, or any outbound network call other than to the configured GitHub API
- Print or persist the `GITHUB_TOKEN` value

See [Security](../security/) for the full threat model.

## Docs conventions

### Counts as data

The small count-ish facts that show up in marketing copy — number of layers, number of tools, test count, current version — live in a single JSON file: [`site/src/data/counts.json`](https://github.com/mcp-tool-shop-org/forkctl/blob/main/site/src/data/counts.json). The landing page and Starlight handbook read from there.

READMEs (English master + seven translations) can't `import` JSON, so the lines that restate those counts are wrapped in HTML marker comments:

```html
<!-- FORKABLE_COUNTS_START -->
## The twenty-two tools
<!-- FORKABLE_COUNTS_END -->
```

A future sync script will use those markers to keep prose in step with `counts.json`. Today the markers are just discovery aids: if you change a count, grep for the markers and update every file in one pass. Don't remove the markers — future automation depends on them.

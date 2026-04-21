---
title: Troubleshooting
description: Error code reference, common scenarios, and where to look when forkctl misbehaves.
sidebar:
  order: 7
---

Something went sideways. This page is organised the way you'd actually look for help: **what did the error code mean**, **what's the scenario this feels like**, and **where do I look if the error wasn't specific enough**.

If you read something here that's wrong, that's a bug — [open an issue](https://github.com/mcp-tool-shop-org/forkctl/issues) with the template at the bottom of this page.

## Error code reference

Every forkctl tool returns either `{ ok: true, data }` or `{ ok: false, error: { code, message, hint?, details? } }`. The `code` is one of the values below. The `message` is human copy. The `hint` — when present — is the fastest next step.

### Input / validation

#### `INVALID_INPUT`

**What it means.** A tool input failed its Zod schema check. Before anything hit GitHub, the input was rejected.

**What to check.**
- `details.issues` — an array of `{ path, message }` — tells you exactly which field is wrong.
- If you're calling from MCP, the LLM may have hallucinated a field name. Compare against the schema in [Reference](../reference/).

**How to recover.** Fix the offending input and call again. No state was created.

**Example.**

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "Input did not match schema",
    "details": { "issues": [{ "path": ["source"], "message": "Expected owner/repo format" }] }
  }
}
```

#### `MISSING_TOKEN`

**What it means.** No `GITHUB_TOKEN` was set in the environment.

**What to check.** Did you export it in the shell that launched forkctl? For MCP, is it in the `env` block of the server config?

**How to recover.**

```bash
export GITHUB_TOKEN=ghp_yourtokenhere
npx @mcptoolshop/forkctl assess owner/repo
```

For MCP, put it in the server config `env`, not in a separate dotfile — forkctl-mcp inherits from the spawning process.

#### `BAD_REPO_REF`

**What it means.** A `source`, `repo`, or similar field didn't match `owner/repo`. Common causes: leading `https://`, trailing `.git`, or whitespace.

**How to recover.** Strip the URL to bare `owner/repo`. No slashes, no scheme, no `.git`.

### GitHub API

#### `GITHUB_NOT_FOUND`

**What it means.** The target repo does not exist, **or** your token can't see it. GitHub returns 404 in both cases deliberately.

**What to check.**
- Typo in `owner/repo`?
- Is the repo private? Does your token have `repo` scope (not just `public_repo`)?
- If targeting an org repo, does your token have `read:org`?

**How to recover.** Rotate the token with the right scopes. For a private repo inside an org with SSO, you may also need to *authorize* the token against the org.

#### `GITHUB_FORBIDDEN`

**What it means.** Authenticated, but not allowed. This is the one you get when org policy blocks the operation.

**What to check.**
- For `create_fork`: run `preflight-policy` first — it decodes enterprise/org/repo fork restrictions into a structured answer.
- For writes to a fork: did SSO expire? Re-authorize the token.
- For `make_forkable` in `pr` mode: do you have write access to the *source* repo?

#### `GITHUB_UNAUTHORIZED`

**What it means.** The token is bad — expired, revoked, malformed, or sent with the wrong auth scheme.

**How to recover.** Mint a fresh PAT at https://github.com/settings/tokens with `repo`, `workflow`, and `read:org` scopes. Re-export.

#### `GITHUB_RATE_LIMITED`

**What it means.** GitHub returned 403/429 with a rate-limit header. Either primary rate limits (5000/hour for authenticated requests) or secondary limits (abuse protection).

**What to check.**
- `details.resetsAt` — when the window refreshes.
- Are you running `batch-sync` in a tight loop? It already paces itself, but if you're also running ad-hoc syncs on the side you can trip the secondary limit.

**How to recover.** Wait until `resetsAt`. Re-run. If it's the *secondary* limit, wait longer — GitHub won't tell you exactly when. A minute usually works.

#### `GITHUB_CONFLICT`

**What it means.** The request conflicts with current repo state. Most commonly: a branch you tried to create already exists, or a PR already exists for this head/base pair.

**What to check.** `details` usually names the resource. `make_forkable` and `propose_sync_pr` will have more specific codes (below) that wrap this.

#### `GITHUB_VALIDATION`

**What it means.** GitHub accepted the auth but rejected the shape of the request (422). Rare in normal use — usually means a bad branch name, a repo name that's taken, or a template source that doesn't allow generation.

**How to recover.** `details` from the GitHub API usually names the field. Fix it and retry.

#### `GITHUB_UNKNOWN`

**What it means.** GitHub returned an error we didn't categorise. Includes 5xx from the API.

**How to recover.** Retry with exponential backoff for 5xx. If it persists, check https://www.githubstatus.com/. Include `details` in any issue you file.

### Policy

#### `FORK_POLICY_BLOCKED`

**What it means.** `preflight-policy` (or `create_fork`) determined that this fork cannot legally happen given the enterprise / organization / repo policy cascade.

**What to check.** `details.level` tells you where the block is (`enterprise` / `organization` / `repo`). `details.reason` is the machine-readable cause.

**How to recover.** This is not a bug. You need a policy change upstream, or you need to pick a different path — template generation, `clone-detached`, or `import`. Run `choose-path` for a recommendation.

#### `TEMPLATE_NOT_AVAILABLE`

**What it means.** The source you passed to `create_from_template` either isn't a template repo or isn't visible to your token.

**How to recover.** Visit the repo on github.com and confirm there's a "Use this template" button. If there isn't, the owner needs to check "Template repository" in Settings.

### Operations

#### `OPERATION_NOT_FOUND`

**What it means.** You passed an `operation_id` that isn't in the state DB.

**What to check.**
- Are you pointing at the right state dir? Set `FORKCTL_STATE_DIR` if you use a non-default location.
- Did you run `create_fork` and `check_operation` from different machines? The DB is local.

#### `OPERATION_TIMEOUT`

**What it means.** The async operation (usually a fork) didn't finish within its window. GitHub never confirmed completion.

**What to check.** Go look at the destination on github.com. Sometimes the fork *is* there and the API just never told us. If it's there, the operation is effectively done — you can proceed.

**How to recover.** Re-run `check_operation`. If the fork really didn't finish (rare), call `create_fork` again. Fork creation is idempotent from GitHub's side — if the destination exists, GitHub returns the existing one.

#### `OPERATION_FAILED`

**What it means.** The operation reached a terminal failed state. `details.cause` holds the proximate reason.

**How to recover.** Read `details.cause`. It will usually point at one of the GitHub error codes above.

### Sync

#### `SYNC_CONFLICT`

**What it means.** The GitHub merge-upstream API refused the fast-forward because the fork has diverged from upstream.

**How to recover.** This is what `propose_sync_pr` is for. It opens a PR from upstream into your fork's default branch so you can resolve conflicts in the UI.

```bash
forkctl propose-sync-pr myhandle/my-fork
```

#### `SYNC_DIVERGED`

**What it means.** `diagnose_divergence` ran and found the fork is ahead *and* behind — i.e. real divergence, not just "behind".

**How to recover.** Look at `details.filesAtRisk` and `details.predictedConflicts`. If the fork has genuine local commits you want to keep, go the PR route. If not, you can reset locally and force-pull — but forkctl won't do that for you.

#### `SYNC_BRANCH_EXISTS`

**What it means.** `propose_sync_pr` tried to create a branch (default: `forkctl/sync-from-upstream`) but that branch already exists on the fork.

**What to check.** Is there a stale previous sync attempt? Go look at the fork's branches on github.com.

**How to recover.**

```bash
forkctl propose-sync-pr myhandle/my-fork --branch forkctl/sync-from-upstream-retry
```

Or delete the stale branch first.

### Make-forkctl

#### `MAKE_FORKABLE_BRANCH_EXISTS`

**What it means.** `make_forkable` in `pr` mode tried to create its branch on the source repo, but that branch already exists.

**How to recover.** Pass an explicit `--branch` with a fresh name:

```bash
forkctl make-forkable owner/source-repo --mode pr --branch forkctl/adoption-fixes-v2
```

### Rename (new in v1.1.0)

#### `RENAME_INVALID_NAME`

**What it means.** `--from` or `--to` failed validation — empty, whitespace, contains path separators, or produces the same casing variants in both positions.

**How to recover.** Pass a plain, single-word identifier (kebab, snake, or camel — forkctl produces the full variant set internally). No slashes, no spaces.

#### `RENAME_NOT_A_REPO`

**What it means.** The path you passed isn't a working tree — it's missing, it's a file, or it points at nothing forkctl can snapshot.

**How to recover.** Point at the repo root. Non-git directories are supported (snapshot uses a tarball); the directory just has to actually exist.

#### `RENAME_SNAPSHOT_FAILED`

**What it means.** forkctl couldn't record a pre-apply snapshot. Usually a disk-full, permissions, or locked-file issue. Apply is refused when snapshot fails — rollback would be impossible.

**What to check.** `details.cause` has the OS-level error. `.forkctl/snapshots/` under the repo root needs to be writable.

**How to recover.** Fix the underlying filesystem issue and re-run `rename apply`.

#### `RENAME_APPLY_FAILED`

**What it means.** One of the five passes (identity / symbols / deep-ts / textual / post) errored mid-apply. The snapshot is intact.

**How to recover.** Run `forkctl rename rollback <path>` to restore the pre-apply state, then review `details.layer` and `details.cause`. File an issue with the payload if the failure looks like a forkctl bug.

#### `RENAME_ROLLBACK_NOT_FOUND`

**What it means.** `rename rollback` ran but no snapshot exists for this tree — either apply was never run, the snapshot expired (kept for 7 days), or `.forkctl/snapshots/` was deleted.

**How to recover.** If apply never succeeded, no rollback is needed. If the snapshot was removed by hand or timed out, recover from your own VCS history.

#### `RENAME_PLAN_STALE`

**What it means.** The `.forkctl/rename-plan.json` you passed to `apply` no longer matches the working tree — files changed between `plan` and `apply`.

**How to recover.** Re-run `forkctl rename plan <path> --from <old> --to <new>` and re-review the new diff before calling `apply`.

#### `RENAME_LOCKFILE_REGEN_FAILED`

**What it means.** The post-pass deleted and tried to regenerate the lockfile (`npm install` / `pnpm install` / `cargo build` / `poetry lock` / `uv lock`) but the native install failed.

**What to check.** `details.stderr` captures the toolchain's output. Most commonly: the package manager isn't installed, or a dependency no longer resolves.

**How to recover.** Fix the toolchain or dependency issue, then regenerate the lockfile by hand. The rename itself is already applied; this is post-pass cleanup only.

#### `RENAME_DEEP_TS_FAILED`

**What it means.** The ts-morph deep pass errored — usually due to a malformed `tsconfig.json` or incompatible TS version.

**How to recover.** Re-run with `--no-deep-ts` to skip this pass; the ast-grep symbol pass still handles the common cases. Open an issue with `details.cause` if it looks like a real ts-morph incompatibility.

#### `RENAME_LANG_UNAVAILABLE`

**What it means.** The ast-grep pass encountered a file in a language whose binding isn't bundled in v1.1.0 (JS, TS, TSX, HTML, CSS ship bundled; other languages resolve at runtime when the corresponding `@ast-grep/napi-*` binding is installed).

**How to recover.** This is a warning, not a failure — the rename continues. Install the missing binding and re-run if you need that file rewritten. Full polyglot bundling is a v1.2.0 target.

#### `STRING_LITERAL_REWRITTEN`

**What it means.** The symbol pass rewrote `from` inside a string literal in source code. This is the default behaviour (most product-name string literals are real product references — error messages, config keys, log lines), surfaced as a warning so you can review.

**How to recover.** Review `details.files` in the plan diff. If a specific file has an incidental match, add it to `--exclude` and re-plan.

#### `ENV_REQUIRES_REVIEW`

**What it means.** `.env*` files contain matches (key names or values referencing `from`) that forkctl won't rewrite silently. These live in diff-only mode.

**How to recover.** Open `.forkctl/rename-plan.diff` and apply the `.env*` changes by hand — or accept them via an explicit `--apply-env` flag if you've reviewed the diff.

### Generic

#### `INTERNAL`

**What it means.** forkctl threw an exception we didn't classify. Not your fault.

**What to check.** The `message` should describe the failure with secrets already redacted. Stack traces are never surfaced — they're in the audit log locally.

**How to recover.** Re-run once. If it repeats, [open an issue](#when-to-open-an-issue) with the payload.

#### `NOT_IMPLEMENTED`

**What it means.** You hit a code path that's documented but not shipped yet. This should be very rare on a released version.

**How to recover.** File an issue — this indicates a docs/code drift that we want to fix.

## Common scenarios

### My fork is stuck in `pending`

Symptoms: `check_operation` keeps returning status `pending`. It's been minutes.

**First, look at the destination on github.com.** If the repo is there, the fork succeeded and the operation state is just lagging. You can proceed with bootstrap — use the destination URL directly.

**If it's not there yet.** Forks of large repos can take a surprisingly long time. Wait up to ~5 minutes. If still nothing, you'll hit `OPERATION_TIMEOUT`. Re-run `create_fork` — fork creation is idempotent.

**If `preflight_policy` was skipped.** The fork may have silently been blocked by org policy. Run:

```bash
forkctl preflight-policy source-owner/source-repo
```

If it reports a block, that's your answer — the "pending" was a phantom and nothing was ever going to happen.

### Org policy blocks forks

Symptoms: `GITHUB_FORBIDDEN` on `create_fork`, or `FORK_POLICY_BLOCKED` if you ran preflight.

This is a *feature*, not a bug, of GitHub Enterprise / org settings. Options:

1. **Talk to your admin.** Fork allowlists exist for a reason; sometimes the reason is "we haven't gotten to it yet."
2. **Use `create_from_template`** if the source is a template repo.
3. **Use `clone-detached`** — forkctl doesn't need a GitHub fork relationship to manage a repo. You lose upstream sync, but you gain a repo that actually exists.
4. **Ask `choose-path`** which path is best given your goal:

```bash
forkctl choose-path source-owner/source-repo --goal internal_seed
```

### Sync PR conflicted

Symptoms: `SYNC_CONFLICT`, or `propose_sync_pr` opened a PR that GitHub marks as conflicted.

forkctl deliberately does *not* try to auto-resolve conflicts. That's a human call. Your options:

1. **Resolve in the PR UI.** GitHub's conflict editor handles most cases.
2. **Pull the branch locally,** resolve in your editor, push.
3. **Abandon this sync.** Close the PR. You can always re-sync later — forkctl keeps no state that locks you in.

If the same PR keeps coming back conflicted, the fork has structural divergence from upstream. Consider `diagnose_divergence` to see what's driving it.

### Rate-limited

Symptoms: `GITHUB_RATE_LIMITED` with `details.resetsAt`.

Usually means `batch-sync` across many forks, or you're running forkctl alongside another GitHub-heavy tool on the same token.

- Wait until `resetsAt`. Don't hammer the API to "check if it's back."
- For the secondary (abuse) limiter, the reset time isn't exposed. Wait 60 seconds.
- Long-term: give forkctl its own token distinct from your dev tooling.

### `create_fork` succeeded but bootstrap didn't

Symptoms: the fork is there on github.com, but `bootstrap` failed or never ran.

This is normal — `create_fork` and `bootstrap` are separate steps by design. After the fork exists, call bootstrap:

```bash
forkctl bootstrap myhandle/my-new-fork \
  --source source-owner/source-repo \
  --profile contributor
```

If bootstrap itself failed:
- Check the error code — usually it's a `GITHUB_*` code on a step like "create upstream remote config" or "commit contributor README."
- Bootstrap is **idempotent**. It never overwrites existing files. Re-run safely.
- The `forkctl_emit_handoff` tool gives you a truthful snapshot of what bootstrap actually did vs. skipped.

## Where to look

### The state DB

forkctl keeps its operations DB and audit log in a single SQLite file:

- **Default path.** OS user-state dir, resolved via [`env-paths`](https://www.npmjs.com/package/env-paths) with app name `forkctl`:
  - Windows: `%LOCALAPPDATA%\forkctl\Data\forkable-state.db`
  - macOS: `~/Library/Application Support/forkctl/forkable-state.db`
  - Linux: `~/.local/share/forkctl/forkable-state.db`
- **Override.** Set `FORKCTL_STATE_DIR` to any directory.

You can open it with any SQLite client to inspect operations and audit rows. Secrets are redacted at write time, so it's safe to share snippets.

### The audit log

Every tool call writes one row to the `audit` table in the state DB. Fastest way to eyeball recent activity:

```bash
sqlite3 "$(forkctl doctor --state-path 2>/dev/null || echo ~/.local/share/forkctl/forkable-state.db)" \
  "select ts, tool, ok, error_code from audit order by ts desc limit 20;"
```

If you don't have `sqlite3` on the path, any SQLite GUI (DB Browser for SQLite, TablePlus, DataGrip) will work.

### How to reset

If the state DB is wedged (corrupt schema, stuck operation you can't clear, an upgrade warning you can't get past), reset is safe — forkctl is designed to re-derive truth from GitHub:

1. Back up the existing file if you want the audit history.
2. Delete it.
3. Re-run any tool — forkctl will recreate the DB on first touch.

```bash
# Linux example
mv ~/.local/share/forkctl/forkable-state.db ~/forkable-state.db.bak
forkctl assess octocat/hello-world   # will recreate
```

You will lose in-flight operation IDs. You will *not* lose anything that lives on GitHub.

## When to open an issue

Open an issue when:

- An error code or message is wrong, misleading, or unhelpful.
- forkctl crashes without a structured error (stack trace makes it to the user).
- A documented scenario doesn't match what forkctl actually does.
- You think there's a missing guardrail (we take security reports privately — see [Security](../security/)).

**Template** — copy, fill in, paste into the issue body:

```markdown
**forkctl version:** (output of `forkctl --version`)
**Node version:** (output of `node --version`)
**OS:** macOS / Linux / Windows

**What I ran**

```bash
# exact command
```

**What I expected**

One or two sentences.

**What happened**

Paste the full error payload, or the stdout/stderr. If it's a JSON error, include `code`, `message`, `hint`, and `details`.

**State DB notes (optional)**

Anything relevant from the audit log for the last few calls. Secrets are already redacted at write time.
```

Issue tracker: https://github.com/mcp-tool-shop-org/forkctl/issues

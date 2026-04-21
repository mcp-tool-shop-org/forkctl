---
title: Configuration
description: Environment variables, bootstrap profiles, state directory, and tuning knobs.
sidebar:
  order: 3
---

forkctl has very few knobs by design. Everything that needs to vary per deployment is an env var; everything that's a behavioral choice is a bootstrap profile.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GITHUB_TOKEN` | yes | — | Token for every API call. **Never logged.** Required scopes: `repo`, `workflow`, `read:org`. SSO-authorized for any restricted org. |
| `GITHUB_API_URL` | no | `https://api.github.com` | For GitHub Enterprise Server or `ghe.com`. Pass the full base URL. |
| `FORKCTL_STATE_DIR` | no | OS user-state directory (via `env-paths`) | Where the SQLite operations and audit DB live. Override for tests or shared runners. |

## State directory

A single SQLite database file (`forkable-state.db`) holds:

- The **operations** table — async create_fork / create_from_template / batch_sync state
- The **audit_log** table — append-only record of every tool call

Default paths:

| OS | Path |
|---|---|
| Linux | `~/.local/share/forkctl/forkable-state.db` |
| macOS | `~/Library/Application Support/forkctl/forkable-state.db` |
| Windows | `%LOCALAPPDATA%\forkctl\Data\forkable-state.db` |

Override with `FORKCTL_STATE_DIR=/path/to/dir`.

The DB is opened in WAL mode and is safe for concurrent reads. Writes from multiple forkctl processes against the same DB are serialized by SQLite.

## Token scopes — the minimum

| Scope | Why |
|---|---|
| `repo` | Read/write access to public + private repos (forks, syncs, bootstrap commits) |
| `workflow` | Required when `forkctl_configure_upstream` installs `.github/workflows/sync-upstream.yml` |
| `read:org` | Lets `forkctl_preflight_policy` read org-level fork policy (members_can_fork_private_repositories) |

For fine-grained tokens: grant the same effective permissions on the source and destination repos.

## Bootstrap profiles

Profiles are stable identifiers — adding a profile is fine, renaming or deleting one is a breaking change.

```text
contributor       For forks that will PR back upstream
starter-kit       For repos generated from a template
internal-seed     For internal team copies of a shared seed
client-delivery   For per-client forks of a deliverable
experiment        For throwaway / detached copies
```

Every profile is a sequence of step IDs. Some steps are **executable** (commit a file, change repo settings via API), others are **advisory** (return commands the API cannot run for you, like local `git remote add`).

Run any profile in dry-run with `--no-apply` to see only the advisory output — no writes happen.

```bash
forkctl bootstrap my-org/copy --profile contributor --no-apply
```

## Tunable inputs (per tool)

Most tools default to safe values. The most useful overrides:

| Tool | Flag | Default | Why change it |
|---|---|---|---|
| `make-forkable` | `--mode pr` | `plan` | Opt in to actually opening a PR on the source repo |
| `make-forkable` | `--branch <name>` | `forkctl/adoption-fixes` | Custom branch name for the fix PR |
| `create-fork` | `--default-branch-only` | `false` | Faster forks of large repos with many branches |
| `bootstrap` | `--no-apply` | `apply=true` | Dry-run a profile to see what it would do |
| `sync` | `--branch <name>` | repo's default | Sync a non-default branch |
| `propose-sync-pr` | `--sync-branch <name>` | `forkctl/sync-from-upstream` | Use a different branch name on the fork |
| `propose-sync-pr` | `--pr-title <title>` | `forkctl: sync from upstream` | Custom PR title |
| `batch-sync` | `--fail-fast-after <n>` | `3` | Stop the batch after N consecutive failures |
| `list-forks` | `--source <owner/repo>` | (lists yours) | List forks of a specific source repo |
| `audit-log` | `--ok false` | (no filter) | Find recent failures |

## Defaults that are intentional

A few defaults are choices, not accidents:

- **`make_forkable` defaults to `plan`.** Writing to someone else's repo without explicit consent is a bad default.
- **`bootstrap` defaults to `apply=true`.** Once you've created the destination, you almost certainly want the aftercare to actually run.
- **`create_fork` defaults to all branches** (matches GitHub's default). Use `--default-branch-only` to opt into the faster path.
- **`batch_sync` is sequential.** Parallelism would hammer rate limits with no real upside for most fleets.

## Output formats

Every CLI command supports `--json` to print the raw `ToolResult` discriminated union.

```bash
forkctl assess octocat/hello-world --json
# → { "ok": true, "data": { "score": 87, "blockers": [...], ... } }

forkctl create-fork bad/ref --json
# → { "ok": false, "error": { "code": "BAD_REPO_REF", "message": "...", "hint": "..." } }
```

The CLI exits non-zero on `ok: false`. The MCP server maps `ok: false` to `{ isError: true, content: [...] }` per the MCP spec.

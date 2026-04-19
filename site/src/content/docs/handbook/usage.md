---
title: Usage
description: End-to-end workflows for adoption, sync, and fleet management.
sidebar:
  order: 2
---

This page walks through the workflows forkable was built for. Each example uses the CLI; the MCP tool name is shown in parentheses so you can call them from Claude or another client too.

## Workflow 1 — Adopt a repo (full chain)

You found an open-source repo, you want to fork it, you want it to actually work, and you want to send PRs back upstream.

```bash
# 1. Score it before you commit any time
forkable assess octocat/hello-world

# 2. Confirm the right path for your goal
forkable choose-path octocat/hello-world --goal contribute_upstream
# → recommends fork

# 3. Preflight the fork policy (catches org/enterprise blockers up front)
forkable preflight-policy octocat/hello-world

# 4. Kick off the async fork
forkable create-fork octocat/hello-world --destination-org my-org
# → { "operationId": "...", "status": "pending" }

# 5. Wait for GitHub to finish
forkable check-operation <operationId>

# 6. Apply the contributor profile (upstream wiring, sync workflow, PR template)
forkable bootstrap my-org/hello-world \
  --source octocat/hello-world \
  --profile contributor

# 7. Scan for drift (hardcoded paths, leaked secrets, stale refs)
forkable scan-drift my-org/hello-world --source octocat/hello-world

# 8. Get the truthful handoff artifact
forkable emit-handoff my-org/hello-world \
  --source octocat/hello-world \
  --profile contributor
```

The handoff artifact is a single JSON receipt with clone commands, upstream wiring, drift caveats, and the recommended next action.

## Workflow 2 — Improve a source repo (`make_forkable`)

You **own** a repo and want it to be more adoptable. Default mode is `plan` (no writes); `pr` mode opens a branch + PR with the suggested fixes.

```bash
# Plan mode — shows what would change
forkable make-forkable my-org/my-product

# PR mode — opens an actual PR with a default MIT LICENSE,
# README seed, .env.example, CONTRIBUTING.md, SECURITY.md
forkable make-forkable my-org/my-product --mode pr
```

Generated content is conservative starter material. Always review before merging — the goal is to remove blockers, not to author your final docs.

## Workflow 3 — Sync a single fork

```bash
# Best practice: diagnose before syncing
forkable diagnose-divergence myhandle/my-fork

# If status is 'behind' or 'identical', sync is a fast-forward:
forkable sync myhandle/my-fork

# If status is 'diverged', sync will return SYNC_CONFLICT.
# Open a PR-based sync instead (never force-pushes):
forkable propose-sync-pr myhandle/my-fork
```

## Workflow 4 — Fleet maintenance

```bash
# What forks do I have?
forkable list-forks

# Which ones need attention?
forkable fleet-health
# → sorted: diverged > behind > ahead > in_sync > no_upstream > error

# Sync many at once (sequential, rate-limit-friendly)
forkable batch-sync me/fork-a me/fork-b me/fork-c \
  --fail-fast-after 3
```

Conflicts surface as `outcome: conflict` — never as errors and never as silent overwrites.

## Workflow 5 — Generate a fresh repo from a template

```bash
forkable create-from-template templator/seed \
  --owner my-org \
  --name fresh-product \
  --private \
  --description "Our new product"

forkable check-operation <operationId>

forkable bootstrap my-org/fresh-product --profile starter-kit
```

The `starter-kit` profile strips template references, freshes the README, prompts a license update, and ensures `.env.example` exists.

## Bootstrap profiles at a glance

| Profile | For | Aftercare |
|---|---|---|
| `contributor` | Forking to send PRs upstream | Upstream remote, sync workflow, PR template |
| `starter-kit` | Generated from a template | Strip template refs, fresh README, .env.example |
| `internal-seed` | Internal team copy of a shared seed | Replace placeholders, CODEOWNERS, lock visibility |
| `client-delivery` | Per-client fork of a deliverable | Client branches, sanitized history check, locked default branch |
| `experiment` | Throwaway / detached copy | Detach upstream, mark as experiment in README |

## Receipts

Every operation is recorded in a local SQLite store and audit log.

```bash
# Look up a single operation
forkable receipt <operationId>

# Query the audit log
forkable audit-log --tool forkable_create_fork --limit 20
forkable audit-log --ok false --limit 50
```

Tokens and known sensitive keys (`token`, `GITHUB_TOKEN`, `password`, `secret`, `apiKey`, `api_key`) are redacted at write time. GitHub PAT patterns inside string values are also redacted.

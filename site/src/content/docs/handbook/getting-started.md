---
title: Getting Started
description: Install forkctl as a CLI or wire it up as an MCP server in 60 seconds.
sidebar:
  order: 1
---

forkctl ships as a single npm package that is **both** a CLI and an MCP stdio server. Pick whichever surface fits the way you work — they call the same handlers.

## Requirements

- Node.js **20 or newer**
- A GitHub personal access token (classic or fine-grained) with `repo`, `workflow`, and `read:org` scopes
- For org-restricted operations, the token must be SSO-authorized for that org

## Install

### As a one-shot command

```bash
npx @mcptoolshop/forkctl assess octocat/hello-world
```

### As a global CLI

```bash
npm install -g @mcptoolshop/forkctl
forkctl --help
```

### As a project dependency (embed mode)

```bash
npm install @mcptoolshop/forkctl
```

```ts
import { TOOLS, dispatch, buildOctokit, openState, Operations } from "@mcptoolshop/forkctl";
```

## Configure your GitHub token

```bash
# bash / zsh
export GITHUB_TOKEN=ghp_xxxxx

# PowerShell
$env:GITHUB_TOKEN = "ghp_xxxxx"
```

| Variable | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | yes | Authenticates every API call. Never logged. |
| `GITHUB_API_URL` | no | Defaults to `https://api.github.com`. Set for GitHub Enterprise Server. |
| `FORKCTL_STATE_DIR` | no | Override the SQLite state directory. Defaults to the OS user-state path. |

## First runs

```bash
# 1. Score a repo's adoption-readiness
forkctl assess octocat/hello-world

# 2. Decide the right copy strategy
forkctl choose-path octocat/hello-world --goal contribute_upstream

# 3. Run a fork-policy preflight
forkctl preflight-policy octocat/hello-world

# 4. Kick off the fork (async — returns operation_id)
forkctl create-fork octocat/hello-world --destination-org my-org

# 5. Probe the operation
forkctl check-operation <operationId>
```

Every command prints a structured response. Add `--json` for raw machine-readable output.

## Wire it into Claude Code

Edit your MCP client config:

```json
{
  "mcpServers": {
    "forkctl": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/forkctl", "mcp"],
      "env": { "GITHUB_TOKEN": "ghp_xxxxx" }
    }
  }
}
```

Restart your client. The 22 tools appear under the `forkctl` server.

## Smoke test

```bash
forkctl list-forks --limit 5
```

If you see your forks listed, your token works and forkctl is happy.

## Next

- Learn the day-to-day patterns in [Usage](../usage/).
- Look up any specific tool in the [Reference](../reference/).

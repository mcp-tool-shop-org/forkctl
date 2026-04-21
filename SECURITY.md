# Security Policy

## Threat model

Forkctl is an MCP server and CLI that takes a GitHub token and operates on
repositories on the user's behalf. Its threat model is:

| Asset                   | Risk                                                                 | Mitigation                                                                 |
|-------------------------|----------------------------------------------------------------------|----------------------------------------------------------------------------|
| `GITHUB_TOKEN`          | Leaked via logs, error messages, or telemetry                         | Never logged or echoed. Scrubbed from error output. No telemetry.          |
| Tool inputs (from LLM)  | Prompt-injected paths, owner/repo strings, branch names               | All inputs validated through Zod schemas. No shell interpolation of inputs.|
| Destination repo        | Wrong owner / wrong visibility on `create`                            | Operations require explicit destination owner; visibility is opt-in field. |
| Source repo             | Accidental writes during `make_forkable`                              | Default mode is `plan`; `pr` mode requires explicit flag.                  |
| Sync conflicts          | Force-overwrite of fork branches                                      | `sync` never force-pushes. Conflicts surface as `propose_sync_pr`.         |
| Local state DB          | Operation history with org/repo metadata                              | Stored in OS user-state dir, not in repo. Never transmitted.               |

## What forkctl will never do

- Force-push to any branch
- Delete a repository
- Delete a branch
- Skip git hooks
- Send telemetry, analytics, or any outbound network call other than to the configured GitHub API
- Print or persist the `GITHUB_TOKEN` value

## Reporting a vulnerability

Report security issues by opening a [private security advisory](https://github.com/mcp-tool-shop-org/forkctl/security/advisories/new).
Do not file public issues for security problems.

We aim to acknowledge within 72 hours and ship a fix or mitigation within 14 days for high-severity reports.

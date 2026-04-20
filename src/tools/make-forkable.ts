import { ForkableError } from "../lib/errors.js";
import { mapGitHubError, parseRepoRef } from "../lib/github.js";
import { fetchSnapshot } from "../lib/snapshot.js";
import { scoreReadiness, type Blocker } from "../lib/readiness.js";
import { safe } from "../lib/result.js";
import { MakeForkableInputSchema, type MakeForkableInput } from "../schemas/assess.js";
import type { ToolDescriptor } from "./types.js";

export interface PatchStep {
  blockerCode: string;
  path: string;
  action: "create" | "edit";
  /** Suggested file content for `create` actions. Plain text, ready to commit. */
  content: string;
  /** Human-friendly summary of the change. */
  summary: string;
}

export interface MakeForkablePlan {
  repo: string;
  mode: "plan" | "pr";
  steps: PatchStep[];
  prUrl?: string;
}

const PATCH_GENERATORS: Record<string, (repo: string) => PatchStep | null> = {
  NO_LICENSE: (repo) => ({
    blockerCode: "NO_LICENSE",
    path: "LICENSE",
    action: "create",
    summary: "Add MIT LICENSE",
    content: mitLicense(repo),
  }),
  NO_README: (repo) => ({
    blockerCode: "NO_README",
    path: "README.md",
    action: "create",
    summary: "Seed README",
    content: seedReadme(repo),
  }),
  NO_ENV_EXAMPLE: () => ({
    blockerCode: "NO_ENV_EXAMPLE",
    path: ".env.example",
    action: "create",
    summary: "Add empty .env.example",
    content: "# Required environment variables go here, with safe placeholders.\n",
  }),
  NO_CONTRIBUTING: () => ({
    blockerCode: "NO_CONTRIBUTING",
    path: "CONTRIBUTING.md",
    action: "create",
    summary: "Seed CONTRIBUTING.md",
    content: seedContributing(),
  }),
  NO_SECURITY: () => ({
    blockerCode: "NO_SECURITY",
    path: "SECURITY.md",
    action: "create",
    summary: "Seed SECURITY.md",
    content: seedSecurity(),
  }),
  NO_DESCRIPTION: () => null, // requires repo settings change, not a file patch
  UNUSUAL_DEFAULT_BRANCH: () => null, // requires branch rename, not a file patch
};

export const makeForkableTool: ToolDescriptor<MakeForkableInput, MakeForkablePlan> = {
  name: "forkable_make_forkable",
  description:
    "Generate a patch plan that fixes the top adoption-readiness blockers for a source repo. Default mode is `plan` (no writes). Set mode=`pr` to open a branch and PR with the generated changes.",
  inputSchema: MakeForkableInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const { owner, repo } = parseRepoRef(input.repo);
      const snap = await fetchSnapshot(ctx.octokit, owner, repo);
      const report = scoreReadiness(snap);

      const steps: PatchStep[] = [];
      for (const blocker of report.blockers) {
        const gen = PATCH_GENERATORS[blocker.code];
        if (!gen) continue;
        const step = gen(`${owner}/${repo}`);
        if (step) steps.push(step);
      }

      const result: MakeForkablePlan = {
        repo: `${owner}/${repo}`,
        mode: input.mode,
        steps,
      };

      if (input.mode === "pr") {
        if (steps.length === 0) return result;
        result.prUrl = await openPatchPr(ctx.octokit, owner, repo, snap.defaultBranch, input.branch, steps, report.blockers);
      }
      return result;
    }),
};

async function openPatchPr(
  octokit: import("@octokit/rest").Octokit,
  owner: string,
  repo: string,
  baseBranch: string,
  branch: string,
  steps: PatchStep[],
  blockers: Blocker[],
): Promise<string> {
  let baseSha: string;
  try {
    const baseRef = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });
    baseSha = baseRef.data.object.sha;
  } catch (err) {
    throw mapGitHubError(err);
  }

  try {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });
  } catch (err) {
    const e = mapGitHubError(err);
    if (e.code !== "GITHUB_VALIDATION") throw e;
    // 422 — branch may already exist. Idempotent reuse is only safe if the
    // existing branch points at the same base SHA; otherwise we'd be
    // committing adoption-readiness patches on top of unknown work and
    // silently opening a PR from that mess. Surface a structured error
    // instead (old behavior: reuse regardless of where the ref pointed).
    let existingSha: string | undefined;
    try {
      const existing = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      existingSha = existing.data.object.sha;
    } catch (getErr) {
      throw new ForkableError(
        "MAKE_FORKABLE_BRANCH_EXISTS",
        `Could not create or read branch '${branch}' on ${owner}/${repo}.`,
        {
          hint: `Delete the stale branch (${owner}:${branch}) or pass a different branch name via input.branch.`,
          details: { branch, baseSha },
          cause: getErr,
        },
      );
    }
    if (existingSha !== baseSha) {
      throw new ForkableError(
        "MAKE_FORKABLE_BRANCH_EXISTS",
        `Branch '${branch}' already exists on ${owner}/${repo} and points at a different commit.`,
        {
          hint: `Delete ${owner}:${branch} or pass a different branch name via input.branch. Expected ${baseSha.slice(0, 7)}, found ${existingSha.slice(0, 7)}.`,
          details: { branch, expectedSha: baseSha, existingSha },
        },
      );
    }
    // Same SHA — safe to reuse the branch.
  }

  for (const step of steps) {
    try {
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: step.path,
        branch,
        message: `forkable: ${step.summary}`,
        content: Buffer.from(step.content, "utf8").toString("base64"),
      });
    } catch (err) {
      const e = mapGitHubError(err);
      if (e.code === "GITHUB_CONFLICT" || e.code === "GITHUB_VALIDATION") {
        // file already exists in the destination branch; skip
        continue;
      }
      throw e;
    }
  }

  try {
    const pr = await octokit.rest.pulls.create({
      owner,
      repo,
      head: branch,
      base: baseBranch,
      title: "forkable: improve adoption-readiness",
      body: prBody(blockers, steps),
    });
    return pr.data.html_url;
  } catch (err) {
    const e = mapGitHubError(err);
    if (e.code === "GITHUB_VALIDATION") {
      // Likely a PR already exists for this head/base
      throw new ForkableError(
        "GITHUB_VALIDATION",
        "PR could not be opened — one may already exist for this branch.",
        { hint: `Check open PRs from ${owner}:${branch} into ${baseBranch}.` },
      );
    }
    throw e;
  }
}

function prBody(blockers: Blocker[], steps: PatchStep[]): string {
  const lines = [
    "Auto-generated by [forkable](https://github.com/mcp-tool-shop-org/forkable) to improve adoption-readiness.",
    "",
    "## Changes",
    ...steps.map((s) => `- \`${s.path}\` — ${s.summary} _(fixes ${s.blockerCode})_`),
    "",
    "## Blockers detected",
    ...blockers.map((b) => `- **${b.code}** (${b.severity}): ${b.message}`),
    "",
    "Review the generated content before merging — defaults are conservative starters, not final copy.",
  ];
  return lines.join("\n");
}

function mitLicense(repoName: string): string {
  const year = new Date().getUTCFullYear();
  return `MIT License

Copyright (c) ${year} ${repoName.split("/")[0] ?? "the authors"}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

function seedReadme(repoName: string): string {
  return `# ${repoName.split("/")[1] ?? "project"}

> One sentence describing what this project is and why it exists.

## Quick start

\`\`\`bash
# install
# run
\`\`\`

## Configuration

See \`.env.example\` for required environment variables.

## License

See [LICENSE](LICENSE).
`;
}

function seedContributing(): string {
  return `# Contributing

Thanks for your interest!

## Development

1. Fork and clone the repo.
2. Create a feature branch.
3. Make your change with tests.
4. Open a PR against \`main\`.

## Code style

(Describe the linter / formatter / commit-message conventions here.)

## Issues

When filing an issue, include the version, your environment, and a minimal reproduction.
`;
}

function seedSecurity(): string {
  return `# Security Policy

## Reporting a vulnerability

Please open a [private security advisory](../../security/advisories/new) rather than a public issue.

We aim to acknowledge within 72 hours and ship a fix or mitigation within 14 days for high-severity reports.

## Supported versions

(Describe which versions receive security fixes.)
`;
}

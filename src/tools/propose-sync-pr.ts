import { ForkctlError } from "../lib/errors.js";
import { mapGitHubError, parseRepoRef } from "../lib/github.js";
import { safe } from "../lib/result.js";
import { ProposeSyncPrInputSchema, type ProposeSyncPrInput } from "../schemas/sync.js";
import type { ToolDescriptor } from "./types.js";

export interface ProposeSyncPrOutput {
  fork: string;
  upstream: string;
  branch: string;
  syncBranch: string;
  prUrl: string;
  message: string;
}

/**
 * PR-based sync for diverged forks where fast-forward is impossible.
 *
 * Approach:
 *   1. Look up the fork's parent (upstream) and the upstream branch tip SHA.
 *   2. Create a branch on the FORK pointing at that SHA. This works because
 *      forks share git storage with their parent — the SHA is valid in both.
 *   3. Open a PR from that new branch into the fork's existing branch.
 *
 * The PR is the user's resolution surface. Forkctl never force-pushes.
 */
export const proposeSyncPrTool: ToolDescriptor<ProposeSyncPrInput, ProposeSyncPrOutput> = {
  name: "forkctl_propose_sync_pr",
  description:
    "Open a PR-based sync from upstream into a fork's branch. Use when forkctl_sync returns SYNC_CONFLICT. Creates a fork-side branch at the upstream's HEAD SHA and opens a PR you can resolve interactively. Never force-pushes.",
  inputSchema: ProposeSyncPrInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const { owner, repo } = parseRepoRef(input.fork);

      const forkRes = await ctx.octokit.rest.repos.get({ owner, repo }).catch((err) => {
        throw mapGitHubError(err);
      });
      const forkData = forkRes.data as {
        fork: boolean;
        parent?: { full_name: string; default_branch: string };
        default_branch: string;
      };
      if (!forkData.fork || !forkData.parent) {
        throw new ForkctlError("INVALID_INPUT", `${owner}/${repo} is not a fork.`, {
          hint: "propose_sync_pr requires a fork with a known parent.",
        });
      }
      const branch = input.branch ?? forkData.default_branch;
      const upstream = forkData.parent.full_name;
      const { owner: upstreamOwner, repo: upstreamRepo } = parseRepoRef(upstream, {
        field: `parent.full_name of ${owner}/${repo}`,
        hint: `GitHub returned a malformed parent full_name for fork ${owner}/${repo}. Re-run diagnose_divergence to refresh, or file an issue with the parent value.`,
      });

      const upstreamRef = await ctx.octokit.rest.git
        .getRef({
          owner: upstreamOwner,
          repo: upstreamRepo,
          ref: `heads/${branch}`,
        })
        .catch((err) => {
          throw mapGitHubError(err);
        });
      const upstreamSha = upstreamRef.data.object.sha;

      try {
        await ctx.octokit.rest.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${input.syncBranch}`,
          sha: upstreamSha,
        });
      } catch (err) {
        const e = mapGitHubError(err);
        if (e.code !== "GITHUB_VALIDATION") throw e;
        // 422 — branch may already exist. If it exists AND already points at
        // the SHA we were about to sync to, this is an idempotent retry and
        // we proceed silently. Otherwise surface a structured error so the
        // user can delete the stale branch or pick a fresh syncBranch name
        // rather than silently reusing it (the old behavior hid a real
        // divergence: the existing branch could be pointing anywhere).
        let existingSha: string | undefined;
        try {
          const existing = await ctx.octokit.rest.git.getRef({
            owner,
            repo,
            ref: `heads/${input.syncBranch}`,
          });
          existingSha = existing.data.object.sha;
        } catch (getErr) {
          // Couldn't read the ref back — treat as unresolvable and surface.
          throw new ForkctlError(
            "SYNC_BRANCH_EXISTS",
            `Could not create sync branch '${input.syncBranch}' on ${owner}/${repo}.`,
            {
              hint: `Delete the stale branch (${owner}:${input.syncBranch}) or pass a different syncBranch name.`,
              details: { syncBranch: input.syncBranch, upstreamSha },
              cause: getErr,
            },
          );
        }
        if (existingSha !== upstreamSha) {
          throw new ForkctlError(
            "SYNC_BRANCH_EXISTS",
            `Sync branch '${input.syncBranch}' already exists on ${owner}/${repo} and points at a different commit.`,
            {
              hint: `Delete ${owner}:${input.syncBranch} or pass a different syncBranch name. Expected ${upstreamSha.slice(0, 7)}, found ${existingSha.slice(0, 7)}.`,
              details: {
                syncBranch: input.syncBranch,
                expectedSha: upstreamSha,
                existingSha,
              },
            },
          );
        }
        // Same SHA — safe to proceed and open/find the PR.
      }

      try {
        const pr = await ctx.octokit.rest.pulls.create({
          owner,
          repo,
          head: input.syncBranch,
          base: branch,
          title: input.prTitle,
          body: prBody(upstream, branch, upstreamSha),
        });
        return {
          fork: `${owner}/${repo}`,
          upstream,
          branch,
          syncBranch: input.syncBranch,
          prUrl: pr.data.html_url,
          message: "PR opened. Resolve any conflicts interactively in the PR before merging.",
        };
      } catch (err) {
        const e = mapGitHubError(err);
        if (e.code === "GITHUB_VALIDATION") {
          throw new ForkctlError(
            "GITHUB_VALIDATION",
            "Could not open PR — one may already exist for this branch, or there are no commits to merge.",
            {
              hint: `Check open PRs from ${owner}:${input.syncBranch} into ${owner}:${branch}.`,
            },
          );
        }
        throw e;
      }
    }),
};

function prBody(upstream: string, branch: string, sha: string): string {
  return `Auto-generated by [forkctl](https://github.com/mcp-tool-shop-org/forkctl).

Brings this fork's \`${branch}\` up to date with upstream \`${upstream}\` at commit \`${sha.slice(0, 7)}\`.

The branches have diverged, so a fast-forward via the merge-upstream API is not possible.
Resolve any conflicts directly in this PR.
`;
}

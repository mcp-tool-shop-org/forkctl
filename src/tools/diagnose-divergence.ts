import { ForkableError } from "../lib/errors.js";
import { mapGitHubError, parseRepoRef } from "../lib/github.js";
import { safe } from "../lib/result.js";
import {
  DiagnoseDivergenceInputSchema,
  type DiagnoseDivergenceInput,
} from "../schemas/sync.js";
import type { ToolDescriptor } from "./types.js";

export interface DiagnoseDivergenceOutput {
  fork: string;
  upstream: string;
  branch: string;
  status: "ahead" | "behind" | "identical" | "diverged" | "unknown";
  aheadBy: number;
  behindBy: number;
  commits: number;
  filesAtRisk: { filename: string; status: string }[];
  /** Predicted: can a fast-forward sync succeed? */
  fastForwardable: boolean;
  recommendation: string;
}

/**
 * Read-only divergence report. Uses GET /repos/{upstream}/compare/{branch}...{fork-owner}:{branch}
 * and GitHub's compare semantics (status: ahead | behind | identical | diverged).
 *
 * - ahead     → fork has commits upstream does not. Sync is unnecessary (or destructive).
 * - behind    → upstream has commits fork doesn't. Fast-forward is possible.
 * - identical → in sync.
 * - diverged  → both have unique commits. Fast-forward not possible; PR needed.
 */
export const diagnoseDivergenceTool: ToolDescriptor<
  DiagnoseDivergenceInput,
  DiagnoseDivergenceOutput
> = {
  name: "forkable_diagnose_divergence",
  description:
    "Read-only report on how a fork's branch has diverged from its upstream. Returns status (ahead | behind | identical | diverged), aheadBy/behindBy counts, files at risk, and a fast-forward prediction. Call this BEFORE forkable_sync to avoid surprises.",
  inputSchema: DiagnoseDivergenceInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const { owner, repo } = parseRepoRef(input.fork);

      let forkData;
      try {
        const r = await ctx.octokit.rest.repos.get({ owner, repo });
        forkData = r.data as {
          fork: boolean;
          parent?: { full_name: string; default_branch: string };
          default_branch: string;
        };
      } catch (err) {
        throw mapGitHubError(err);
      }
      if (!forkData.fork || !forkData.parent) {
        throw new ForkableError("INVALID_INPUT", `${owner}/${repo} is not a fork.`, {
          hint: "diagnose_divergence requires a fork with a known parent.",
        });
      }

      const branch = input.branch ?? forkData.default_branch;
      const upstream = forkData.parent.full_name;
      const upstreamDefaultBranch = forkData.parent.default_branch;
      const [upstreamOwner, upstreamRepo] = upstream.split("/") as [string, string];

      // Compare upstream's default branch (base) against the fork's branch (head).
      // Using the fork's branch name on both sides silently misreports divergence
      // whenever the fork renamed its default branch or the upstream uses a
      // different default (e.g. master vs main).
      try {
        const cmp = await ctx.octokit.rest.repos.compareCommitsWithBasehead({
          owner: upstreamOwner,
          repo: upstreamRepo,
          basehead: `${upstreamDefaultBranch}...${owner}:${branch}`,
        });
        const data = cmp.data as {
          status: string;
          ahead_by: number;
          behind_by: number;
          total_commits: number;
          files?: { filename: string; status: string }[];
        };

        const status = (
          ["ahead", "behind", "identical", "diverged"].includes(data.status) ? data.status : "unknown"
        ) as DiagnoseDivergenceOutput["status"];

        const fastForwardable = status === "behind" || status === "identical";

        return {
          fork: `${owner}/${repo}`,
          upstream,
          branch,
          status,
          aheadBy: data.ahead_by,
          behindBy: data.behind_by,
          commits: data.total_commits,
          filesAtRisk: (data.files ?? []).map((f) => ({ filename: f.filename, status: f.status })),
          fastForwardable,
          recommendation: recommend(status, data.behind_by, data.ahead_by),
        };
      } catch (err) {
        throw mapGitHubError(err);
      }
    }),
};

function recommend(status: string, behindBy: number, aheadBy: number): string {
  switch (status) {
    case "identical":
      return "Already in sync — no action needed.";
    case "behind":
      return `Fork is ${behindBy} commit(s) behind. Call forkable_sync to fast-forward.`;
    case "ahead":
      return `Fork is ${aheadBy} commit(s) ahead. Sync is unnecessary; consider opening a PR upstream.`;
    case "diverged":
      return `Both have unique commits (ahead ${aheadBy}, behind ${behindBy}). Fast-forward not possible — call forkable_propose_sync_pr to open an interactive resolution.`;
    default:
      return "Status indeterminate.";
  }
}

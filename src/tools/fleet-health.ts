import { mapGitHubError, parseRepoRef } from "../lib/github.js";
import { safe } from "../lib/result.js";
import { FleetHealthInputSchema, type FleetHealthInput } from "../schemas/fleet.js";
import type { ToolDescriptor } from "./types.js";

export interface ForkHealth {
  fullName: string;
  upstream: string | null;
  status: "in_sync" | "behind" | "ahead" | "diverged" | "no_upstream" | "error";
  aheadBy: number;
  behindBy: number;
  daysSincePush: number | null;
  archived: boolean;
  /** Plain English summary of the fork's adoption health. */
  note: string;
}

export interface FleetHealthOutput {
  scanned: number;
  errors: number;
  forks: ForkHealth[];
  summary: {
    inSync: number;
    behind: number;
    diverged: number;
    ahead: number;
    noUpstream: number;
    archived: number;
  };
}

export const fleetHealthTool: ToolDescriptor<FleetHealthInput, FleetHealthOutput> = {
  name: "forkable_fleet_health",
  description:
    "Health-check a set of forks. For each: resolves upstream, computes ahead/behind via the compare API, and produces a one-line health note. Sorts diverged + behind to the top so you see what needs attention first.",
  inputSchema: FleetHealthInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const inputs = input.forks ?? (await listMyForkRefs(ctx.octokit, input.limit));
      const limited = inputs.slice(0, input.limit);

      const results: ForkHealth[] = [];
      let errors = 0;
      for (const ref of limited) {
        try {
          results.push(await healthOne(ctx.octokit, ref));
        } catch (err) {
          errors++;
          results.push(errorEntry(ref, err));
        }
      }

      // Sort: diverged > behind > ahead > in_sync > no_upstream > error
      const rank: Record<ForkHealth["status"], number> = {
        diverged: 0,
        behind: 1,
        ahead: 2,
        in_sync: 3,
        no_upstream: 4,
        error: 5,
      };
      results.sort((a, b) => rank[a.status] - rank[b.status]);

      const summary = {
        inSync: results.filter((r) => r.status === "in_sync").length,
        behind: results.filter((r) => r.status === "behind").length,
        diverged: results.filter((r) => r.status === "diverged").length,
        ahead: results.filter((r) => r.status === "ahead").length,
        noUpstream: results.filter((r) => r.status === "no_upstream").length,
        archived: results.filter((r) => r.archived).length,
      };

      return { scanned: results.length, errors, forks: results, summary };
    }),
};

async function listMyForkRefs(
  octokit: import("@octokit/rest").Octokit,
  limit: number,
): Promise<string[]> {
  const out: string[] = [];
  try {
    for await (const res of octokit.paginate.iterator(octokit.rest.repos.listForAuthenticatedUser, {
      affiliation: "owner",
      per_page: 100,
    })) {
      for (const r of res.data) {
        if (r.fork) out.push(r.full_name);
        if (out.length >= limit) return out;
      }
    }
    return out;
  } catch (err) {
    throw mapGitHubError(err);
  }
}

async function healthOne(
  octokit: import("@octokit/rest").Octokit,
  ref: string,
): Promise<ForkHealth> {
  const { owner, repo } = parseRepoRef(ref);
  const r = await octokit.rest.repos.get({ owner, repo });
  const data = r.data as {
    fork: boolean;
    parent?: { full_name: string; default_branch: string };
    default_branch: string;
    archived: boolean;
    pushed_at?: string;
  };
  const archived = data.archived;
  const daysSincePush = data.pushed_at
    ? Math.floor((Date.now() - Date.parse(data.pushed_at)) / 86_400_000)
    : null;

  if (!data.fork || !data.parent) {
    return {
      fullName: ref,
      upstream: null,
      status: "no_upstream",
      aheadBy: 0,
      behindBy: 0,
      daysSincePush,
      archived,
      note: "Not a fork or upstream is not visible.",
    };
  }
  const upstream = data.parent.full_name;
  const branch = data.default_branch;
  const upstreamDefaultBranch = data.parent.default_branch;
  const [upOwner, upRepo] = upstream.split("/") as [string, string];

  // Base is upstream's default branch; head is the fork's branch. Using the
  // fork's branch name on both sides misreports divergence when the fork has
  // renamed its default or the upstream uses a different one (master vs main).
  const cmp = await octokit.rest.repos.compareCommitsWithBasehead({
    owner: upOwner,
    repo: upRepo,
    basehead: `${upstreamDefaultBranch}...${owner}:${branch}`,
  });
  const c = cmp.data as {
    status: string;
    ahead_by: number;
    behind_by: number;
  };

  const status = (
    c.status === "identical"
      ? "in_sync"
      : c.status === "behind"
        ? "behind"
        : c.status === "ahead"
          ? "ahead"
          : c.status === "diverged"
            ? "diverged"
            : "no_upstream"
  ) as ForkHealth["status"];

  return {
    fullName: ref,
    upstream,
    status,
    aheadBy: c.ahead_by,
    behindBy: c.behind_by,
    daysSincePush,
    archived,
    note: noteFor(status, c.behind_by, c.ahead_by, archived),
  };
}

function noteFor(
  status: ForkHealth["status"],
  behindBy: number,
  aheadBy: number,
  archived: boolean,
): string {
  if (archived) return "Archived — read-only.";
  switch (status) {
    case "in_sync":
      return "In sync with upstream.";
    case "behind":
      return `Behind by ${behindBy}. Fast-forward sync available.`;
    case "ahead":
      return `Ahead by ${aheadBy}. Consider opening PR upstream.`;
    case "diverged":
      return `Diverged: ahead ${aheadBy}, behind ${behindBy}. Use propose_sync_pr.`;
    case "no_upstream":
      return "No upstream link.";
    default:
      return "";
  }
}

function errorEntry(ref: string, err: unknown): ForkHealth {
  const msg = err instanceof Error ? err.message : "unknown error";
  return {
    fullName: ref,
    upstream: null,
    status: "error",
    aheadBy: 0,
    behindBy: 0,
    daysSincePush: null,
    archived: false,
    note: `Could not check: ${msg}`,
  };
}

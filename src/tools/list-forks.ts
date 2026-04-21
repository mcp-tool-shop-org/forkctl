import { mapGitHubError, parseRepoRef } from "../lib/github.js";
import { safe } from "../lib/result.js";
import { ListForksInputSchema, type ListForksInput } from "../schemas/fleet.js";
import type { ToolDescriptor } from "./types.js";

export interface ForkSummary {
  fullName: string;
  htmlUrl: string;
  parent: string | null;
  defaultBranch: string;
  visibility: "public" | "private" | "internal";
  archived: boolean;
  pushedAt: string | null;
}

export interface ListForksOutput {
  source: string | null;
  count: number;
  forks: ForkSummary[];
}

export const listForksTool: ToolDescriptor<ListForksInput, ListForksOutput> = {
  name: "forkctl_list_forks",
  description:
    "List forks. With source=owner/repo, lists forks of that repo. Without source, lists the authenticated user's owned forks. Returns full_name, parent, defaultBranch, visibility, archived, and last push time.",
  inputSchema: ListForksInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const forks = input.source
        ? await listForksOfRepo(ctx.octokit, input.source, input.limit)
        : await listMyForks(ctx.octokit, input.limit);

      return {
        source: input.source ?? null,
        count: forks.length,
        forks,
      };
    }),
};

async function listMyForks(
  octokit: import("@octokit/rest").Octokit,
  limit: number,
): Promise<ForkSummary[]> {
  const out: ForkSummary[] = [];
  try {
    for await (const res of octokit.paginate.iterator(octokit.rest.repos.listForAuthenticatedUser, {
      affiliation: "owner",
      per_page: 100,
    })) {
      for (const r of res.data) {
        if (!r.fork) continue;
        out.push({
          fullName: r.full_name,
          htmlUrl: r.html_url,
          parent: null, // listForAuthenticatedUser doesn't return parent; fleet_health enriches if needed
          defaultBranch: r.default_branch,
          visibility: ((r.visibility ?? (r.private ? "private" : "public")) as ForkSummary["visibility"]),
          archived: r.archived ?? false,
          pushedAt: r.pushed_at ?? null,
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  } catch (err) {
    throw mapGitHubError(err);
  }
}

async function listForksOfRepo(
  octokit: import("@octokit/rest").Octokit,
  source: string,
  limit: number,
): Promise<ForkSummary[]> {
  const { owner, repo } = parseRepoRef(source);
  const out: ForkSummary[] = [];
  try {
    for await (const res of octokit.paginate.iterator(octokit.rest.repos.listForks, {
      owner,
      repo,
      per_page: 100,
    })) {
      for (const r of res.data) {
        out.push({
          fullName: r.full_name,
          htmlUrl: r.html_url,
          parent: source,
          defaultBranch: r.default_branch ?? "main",
          visibility: ((r.visibility ?? (r.private ? "private" : "public")) as ForkSummary["visibility"]),
          archived: r.archived ?? false,
          pushedAt: r.pushed_at ?? null,
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  } catch (err) {
    throw mapGitHubError(err);
  }
}

import type { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";

export interface FleetRepo {
  full_name: string;
  fork: boolean;
  parent?: { full_name: string; default_branch: string };
  default_branch: string;
  archived?: boolean;
  pushed_at?: string;
  visibility?: "public" | "private" | "internal";
  private?: boolean;
  html_url?: string;
}

export interface FleetOctokitConfig {
  /** Repos returned by listForAuthenticatedUser */
  myRepos?: FleetRepo[];
  /** Repos returned by listForks (keyed by source full_name) */
  sourceForks?: Record<string, FleetRepo[]>;
  /** Per-fork compare results */
  compareByFork?: Record<
    string,
    { status: string; ahead_by: number; behind_by: number; total_commits?: number }
  >;
  /** Per-fork mergeUpstream behavior */
  mergeByFork?: Record<string, "ok-ff" | "ok-merge" | "ok-none" | "conflict" | "error">;
  /** Track calls */
  calls?: {
    mergeUpstream?: Array<{ owner: string; repo: string; branch: string }>;
    compareCommits?: Array<{ owner: string; repo: string; basehead: string }>;
  };
}

function err(status: number, msg: string): RequestError {
  return new RequestError(msg, status, {
    request: { method: "POST", url: "x", headers: {} },
    response: { status, url: "x", headers: {}, data: {} },
  });
}

function asPaginate(arr: unknown[]) {
  return {
    iterator() {
      return {
        async *[Symbol.asyncIterator]() {
          yield { data: arr };
        },
      };
    },
  };
}

export function fleetFakeOctokit(cfg: FleetOctokitConfig = {}): Octokit {
  const my = cfg.myRepos ?? [];
  const sourceForks = cfg.sourceForks ?? {};
  const lookup = new Map<string, FleetRepo>();
  for (const r of my) lookup.set(r.full_name, r);
  for (const list of Object.values(sourceForks)) {
    for (const r of list) lookup.set(r.full_name, r);
  }

  const paginate = ((endpoint: unknown, params?: { owner?: string; repo?: string }) => {
    if (endpoint === client.rest.repos.listForAuthenticatedUser) {
      return asPaginate(my).iterator();
    }
    if (endpoint === client.rest.repos.listForks) {
      const key = params ? `${params.owner}/${params.repo}` : "";
      return asPaginate(sourceForks[key] ?? []).iterator();
    }
    return asPaginate([]).iterator();
  }) as unknown as Octokit["paginate"];
  (paginate as unknown as { iterator: typeof paginate }).iterator = paginate;

  const client = {
    paginate,
    rest: {
      repos: {
        listForAuthenticatedUser: (() => Promise.resolve({ data: my })) as unknown as Octokit["rest"]["repos"]["listForAuthenticatedUser"],
        listForks: (({ owner, repo }: { owner: string; repo: string }) =>
          Promise.resolve({ data: sourceForks[`${owner}/${repo}`] ?? [] })) as unknown as Octokit["rest"]["repos"]["listForks"],
        get: async ({ owner, repo }: { owner: string; repo: string }) => {
          const fullName = `${owner}/${repo}`;
          const r = lookup.get(fullName);
          if (!r) throw err(404, "not found");
          return {
            data: {
              full_name: r.full_name,
              fork: r.fork,
              parent: r.parent,
              default_branch: r.default_branch,
              archived: r.archived ?? false,
              pushed_at: r.pushed_at ?? new Date().toISOString(),
              visibility: r.visibility ?? "public",
              private: r.private ?? false,
              html_url: r.html_url ?? `https://github.com/${r.full_name}`,
            },
          };
        },
        compareCommitsWithBasehead: async ({
          owner,
          repo,
          basehead,
        }: {
          owner: string;
          repo: string;
          basehead: string;
        }) => {
          cfg.calls?.compareCommits?.push({ owner, repo, basehead });
          // Determine fork's full_name from basehead string ("branch...forkOwner:branch")
          const m = basehead.match(/\.\.\.([^:]+):/);
          const forkOwner = m ? m[1]! : "";
          // Find a fork in `lookup` whose owner matches and parent matches owner/repo
          const upstream = `${owner}/${repo}`;
          let forkName: string | undefined;
          for (const r of lookup.values()) {
            if (r.parent?.full_name === upstream && r.full_name.startsWith(`${forkOwner}/`)) {
              forkName = r.full_name;
              break;
            }
          }
          const c =
            (forkName && cfg.compareByFork?.[forkName]) ||
            { status: "behind", ahead_by: 0, behind_by: 1, total_commits: 1 };
          return { data: { ...c, files: [] } };
        },
        mergeUpstream: async (params: { owner: string; repo: string; branch: string }) => {
          cfg.calls?.mergeUpstream?.push(params);
          const fullName = `${params.owner}/${params.repo}`;
          const behavior = cfg.mergeByFork?.[fullName] ?? "ok-ff";
          if (behavior === "conflict") throw err(409, "conflict");
          if (behavior === "error") throw err(500, "boom");
          if (behavior === "ok-merge")
            return { data: { merge_type: "merge", base_branch: "x:main", message: "merged" } };
          if (behavior === "ok-none")
            return { data: { merge_type: "none", base_branch: "x:main", message: "in sync" } };
          return { data: { merge_type: "fast-forward", base_branch: "x:main", message: "ff" } };
        },
      },
    },
  } as unknown as Octokit;
  return client;
}

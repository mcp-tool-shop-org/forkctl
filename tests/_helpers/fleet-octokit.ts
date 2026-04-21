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

/**
 * Extract a stable string key from an Octokit endpoint passed to
 * `octokit.paginate(endpoint, params)`. We prefer the endpoint's
 * `.endpoint.DEFAULTS.url` because that's the stable, documented
 * identifier (e.g. "/user/repos"). We fall back to the function's
 * `.name` property so purely-synthetic test fakes still work.
 *
 * Reference-identity dispatch (the old approach, `endpoint === client.rest...`)
 * was fragile because Octokit wraps methods with the @octokit/plugin-retry /
 * @octokit/plugin-throttling plugins — once those are attached in production,
 * the wrapped function is NOT reference-equal to `client.rest.repos.listForks`,
 * so all paginate calls silently fell through to the `[]` branch.
 */
export function endpointKey(endpoint: unknown): string {
  // Real Octokit endpoints (and our test fakes built with Object.assign) are
  // FUNCTIONS that also expose a `.endpoint.DEFAULTS.url` property. Check
  // the url regardless of whether endpoint is an object or a function.
  if (endpoint && (typeof endpoint === "object" || typeof endpoint === "function")) {
    const ep = (endpoint as { endpoint?: { DEFAULTS?: { url?: string } } }).endpoint;
    const url = ep?.DEFAULTS?.url;
    if (typeof url === "string" && url.length > 0) return url;
  }
  if (typeof endpoint === "function") {
    const name = (endpoint as { name?: string }).name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  return "";
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
    const key = endpointKey(endpoint);
    // Match either the REST URL (real Octokit endpoints) or the function
    // name (test fakes / wrapped plugin functions).
    if (key === "/user/repos" || key === "listForAuthenticatedUser") {
      return asPaginate(my).iterator();
    }
    if (key === "/repos/{owner}/{repo}/forks" || key === "listForks") {
      const k = params ? `${params.owner}/${params.repo}` : "";
      return asPaginate(sourceForks[k] ?? []).iterator();
    }
    return asPaginate([]).iterator();
  }) as unknown as Octokit["paginate"];
  (paginate as unknown as { iterator: typeof paginate }).iterator = paginate;

  // Tag the underlying endpoint functions with the shape real Octokit methods
  // have so both the reference-identity path (pre-retry-plugin) AND the
  // string-key path (post-retry-plugin) resolve correctly.
  const listForAuthenticatedUserFn = Object.assign(
    () => Promise.resolve({ data: my }),
    { endpoint: { DEFAULTS: { url: "/user/repos" } } },
  ) as unknown as Octokit["rest"]["repos"]["listForAuthenticatedUser"];
  const listForksFn = Object.assign(
    ({ owner, repo }: { owner: string; repo: string }) =>
      Promise.resolve({ data: sourceForks[`${owner}/${repo}`] ?? [] }),
    { endpoint: { DEFAULTS: { url: "/repos/{owner}/{repo}/forks" } } },
  ) as unknown as Octokit["rest"]["repos"]["listForks"];

  const client = {
    paginate,
    rest: {
      repos: {
        listForAuthenticatedUser: listForAuthenticatedUserFn,
        listForks: listForksFn,
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

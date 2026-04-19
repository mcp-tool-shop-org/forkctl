import type { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";

export interface SyncOctokitConfig {
  /** Make repos.get return this fork data */
  fork?: {
    fork?: boolean;
    parent?: { full_name: string; default_branch: string };
    default_branch?: string;
  };
  /** mergeUpstream behavior */
  mergeUpstream?: "ok-fast-forward" | "ok-merge" | "ok-none" | "conflict";
  /** Compare result */
  compare?: {
    status: "ahead" | "behind" | "identical" | "diverged";
    ahead_by: number;
    behind_by: number;
    total_commits: number;
    files?: { filename: string; status: string }[];
  };
  /** Upstream ref SHA returned by git.getRef */
  upstreamSha?: string;
  /** What pulls.create should do */
  prCreate?: "ok" | "conflict";
  /** What git.createRef should do */
  createRef?: "ok" | "exists";
  /** Track calls */
  calls?: {
    mergeUpstream?: unknown[];
    createRef?: unknown[];
    pullsCreate?: unknown[];
  };
}

function err(status: number, msg: string): RequestError {
  return new RequestError(msg, status, {
    request: { method: "POST", url: "x", headers: {} },
    response: { status, url: "x", headers: {}, data: {} },
  });
}

export function syncFakeOctokit(cfg: SyncOctokitConfig = {}): Octokit {
  const fork = cfg.fork ?? { fork: true, parent: { full_name: "octocat/source", default_branch: "main" }, default_branch: "main" };
  return {
    rest: {
      repos: {
        get: async ({ owner, repo }: { owner: string; repo: string }) => ({
          data: {
            full_name: `${owner}/${repo}`,
            fork: fork.fork ?? true,
            parent: fork.parent,
            default_branch: fork.default_branch ?? "main",
            visibility: "public",
            private: false,
          },
        }),
        mergeUpstream: async (params: unknown) => {
          cfg.calls?.mergeUpstream?.push(params);
          switch (cfg.mergeUpstream) {
            case "conflict":
              throw err(409, "merge conflict");
            case "ok-merge":
              return { data: { merge_type: "merge", base_branch: "octocat/source:main", message: "merged" } };
            case "ok-none":
              return { data: { merge_type: "none", base_branch: "octocat/source:main", message: "in sync" } };
            case "ok-fast-forward":
            default:
              return { data: { merge_type: "fast-forward", base_branch: "octocat/source:main", message: "fast-forwarded" } };
          }
        },
        compareCommitsWithBasehead: async () => ({
          data: cfg.compare ?? {
            status: "behind",
            ahead_by: 0,
            behind_by: 3,
            total_commits: 3,
            files: [{ filename: "README.md", status: "modified" }],
          },
        }),
      },
      git: {
        getRef: async () => ({
          data: { object: { sha: cfg.upstreamSha ?? "abc1234567890" } },
        }),
        createRef: async (params: unknown) => {
          cfg.calls?.createRef?.push(params);
          if (cfg.createRef === "exists") throw err(422, "Reference already exists");
          return { data: { ref: "refs/heads/forkable/sync-from-upstream" } };
        },
      },
      pulls: {
        create: async (params: unknown) => {
          cfg.calls?.pullsCreate?.push(params);
          if (cfg.prCreate === "conflict")
            throw err(422, "A pull request already exists");
          return { data: { html_url: "https://github.com/myhandle/fork/pull/42" } };
        },
      },
    },
  } as unknown as Octokit;
}

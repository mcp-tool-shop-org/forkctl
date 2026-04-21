import type { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";

export interface FakeRepoConfig {
  description?: string | null;
  homepage?: string | null;
  visibility?: "public" | "private" | "internal";
  private?: boolean;
  archived?: boolean;
  is_template?: boolean;
  default_branch?: string;
  topics?: string[];
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  license?: { spdx_id: string | null; name: string | null } | null;
  pushed_at?: string;
  owner?: { type: "User" | "Organization"; login: string };
  allow_forking?: boolean;
  /** Files (paths) considered present in the repo */
  files?: string[];
  /** README content; if undefined, README is treated as absent */
  readme?: string | undefined;
  branches?: string[];
  workflows?: number;
}

function notFound(): RequestError {
  return new RequestError("Not Found", 404, {
    request: { method: "GET", url: "x", headers: {} },
    response: { status: 404, url: "x", headers: {}, data: {} },
  });
}

export function fakeOctokit(cfg: FakeRepoConfig): Octokit {
  const files = new Set(cfg.files ?? []);
  return {
    rest: {
      repos: {
        get: async () => ({
          data: {
            description: cfg.description ?? "A repo",
            homepage: cfg.homepage ?? null,
            visibility: cfg.visibility ?? (cfg.private ? "private" : "public"),
            private: cfg.private ?? false,
            archived: cfg.archived ?? false,
            is_template: cfg.is_template ?? false,
            default_branch: cfg.default_branch ?? "main",
            topics: cfg.topics ?? [],
            stargazers_count: cfg.stargazers_count ?? 0,
            forks_count: cfg.forks_count ?? 0,
            open_issues_count: cfg.open_issues_count ?? 0,
            license: cfg.license ?? null,
            pushed_at: cfg.pushed_at ?? new Date().toISOString(),
            owner: cfg.owner ?? { type: "User", login: "octocat" },
            allow_forking: cfg.allow_forking ?? true,
          },
        }),
        getReadme: async () => {
          if (cfg.readme === undefined) throw notFound();
          return {
            data: { content: Buffer.from(cfg.readme).toString("base64"), encoding: "base64" },
          };
        },
        getContent: async ({ path }: { path: string }) => {
          if (files.has(path)) return { data: { type: "file", path } };
          throw notFound();
        },
        listBranches: async () => ({ data: (cfg.branches ?? ["main"]).map((name) => ({ name })) }),
      },
      orgs: {
        get: async () => ({ data: { members_can_fork_private_repositories: true } }),
      },
      actions: {
        listRepoWorkflows: async () => ({ data: { total_count: cfg.workflows ?? 0 } }),
      },
    },
  } as unknown as Octokit;
}

import type { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";

interface ExecOctokitConfig {
  /** Authenticated user login */
  login?: string;
  /** Repos that exist (full_name) — used by check_operation probe */
  existingRepos?: Set<string>;
  /** What createFork should do: 'ok' | 'fail-403' */
  createForkBehavior?: "ok" | "fail-403";
  /** What createUsingTemplate should do */
  createTemplateBehavior?: "ok" | "fail-422";
  /** Source repo metadata for resolveForkPolicy */
  sourceRepo?: {
    visibility?: "public" | "private" | "internal";
    private?: boolean;
    archived?: boolean;
    allow_forking?: boolean;
    owner?: { type: "User" | "Organization"; login: string };
  };
  /** Org policy for org-owned private repos */
  orgAllowsPrivateForks?: boolean;
  /** Track calls for assertions */
  calls?: { createFork: unknown[]; createTemplate: unknown[] };
}

function notFound(): RequestError {
  return new RequestError("Not Found", 404, {
    request: { method: "GET", url: "x", headers: {} },
    response: { status: 404, url: "x", headers: {}, data: {} },
  });
}
function forbidden(msg: string): RequestError {
  return new RequestError(msg, 403, {
    request: { method: "POST", url: "x", headers: {} },
    response: { status: 403, url: "x", headers: {}, data: {} },
  });
}
function validation(msg: string): RequestError {
  return new RequestError(msg, 422, {
    request: { method: "POST", url: "x", headers: {} },
    response: { status: 422, url: "x", headers: {}, data: {} },
  });
}

export function execFakeOctokit(cfg: ExecOctokitConfig = {}): Octokit {
  const existing = cfg.existingRepos ?? new Set<string>();
  const calls = cfg.calls;
  return {
    rest: {
      users: {
        getAuthenticated: async () => ({ data: { login: cfg.login ?? "tester" } }),
      },
      repos: {
        get: async ({ owner, repo }: { owner: string; repo: string }) => {
          const fullName = `${owner}/${repo}`;
          // First, source repo lookup pattern (resolveForkPolicy)
          if (cfg.sourceRepo && existing.size === 0) {
            return {
              data: {
                visibility:
                  cfg.sourceRepo.visibility ??
                  (cfg.sourceRepo.private ? "private" : "public"),
                private: cfg.sourceRepo.private ?? false,
                archived: cfg.sourceRepo.archived ?? false,
                allow_forking: cfg.sourceRepo.allow_forking ?? true,
                owner: cfg.sourceRepo.owner ?? { type: "User", login: owner },
                default_branch: "main",
                full_name: fullName,
                id: 12345,
                html_url: `https://github.com/${fullName}`,
              },
            };
          }
          if (existing.has(fullName)) {
            return {
              data: {
                id: 99,
                full_name: fullName,
                html_url: `https://github.com/${fullName}`,
                default_branch: "main",
                visibility: "public",
                private: false,
                archived: false,
                allow_forking: true,
                owner: { type: "User", login: owner },
              },
            };
          }
          throw notFound();
        },
        createFork: async (params: unknown) => {
          calls?.createFork.push(params);
          if (cfg.createForkBehavior === "fail-403") throw forbidden("Forks not allowed");
          return { status: 202 };
        },
        createUsingTemplate: async (params: unknown) => {
          calls?.createTemplate.push(params);
          if (cfg.createTemplateBehavior === "fail-422") throw validation("Owner not found");
          return { status: 201 };
        },
      },
      orgs: {
        get: async () => ({
          data: { members_can_fork_private_repositories: cfg.orgAllowsPrivateForks ?? true },
        }),
      },
    },
  } as unknown as Octokit;
}

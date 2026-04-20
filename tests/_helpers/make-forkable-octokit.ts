import type { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";

/**
 * Octokit fake for the make-forkable PR-mode flow.
 *
 * Covers the full call chain used by `makeForkableTool` in mode=`pr`:
 *   1. fetchSnapshot — repos.get, repos.getReadme, repos.getContent (multi),
 *      repos.listBranches, actions.listRepoWorkflows
 *   2. openPatchPr — git.getRef, git.createRef, repos.createOrUpdateFileContents (per step),
 *      pulls.create
 *
 * Behaviors are selectable per endpoint so tests can simulate 422 branch-exists,
 * 403 forbidden (token scope missing), and other failure modes without brittle
 * mock libraries.
 */
export interface MakeForkableOctokitConfig {
  /** Snapshot inputs — these determine which blockers fire, and therefore which patch steps run. */
  snapshot?: {
    readme?: string | undefined;
    files?: string[];
    license?: { spdx_id: string | null; name: string | null } | null;
    default_branch?: string;
    description?: string | null;
  };
  /** git.getRef on heads/<baseBranch> */
  getRefBehavior?: "ok" | "not-found" | "forbidden" | "unauthorized";
  /** git.createRef for the new feature branch */
  createRefBehavior?: "ok" | "exists" | "forbidden";
  /** repos.createOrUpdateFileContents per patch step */
  fileContentsBehavior?: "ok" | "conflict" | "forbidden";
  /** pulls.create for the final PR */
  pullsCreateBehavior?: "ok" | "exists" | "forbidden";
  /** SHA returned by git.getRef on the base branch */
  baseSha?: string;
  /** URL returned by pulls.create */
  prUrl?: string;
  /** Capture-hooks for assertion */
  calls?: {
    getRef?: unknown[];
    createRef?: unknown[];
    fileContents?: unknown[];
    pullsCreate?: unknown[];
  };
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
function unauthorized(msg: string): RequestError {
  return new RequestError(msg, 401, {
    request: { method: "POST", url: "x", headers: {} },
    response: { status: 401, url: "x", headers: {}, data: {} },
  });
}
function validation(msg: string): RequestError {
  return new RequestError(msg, 422, {
    request: { method: "POST", url: "x", headers: {} },
    response: { status: 422, url: "x", headers: {}, data: {} },
  });
}

export function makeForkableFakeOctokit(cfg: MakeForkableOctokitConfig = {}): Octokit {
  const snap = cfg.snapshot ?? {};
  const files = new Set(snap.files ?? []);
  const defaultBranch = snap.default_branch ?? "main";
  const baseSha = cfg.baseSha ?? "basesha123456";
  const prUrl = cfg.prUrl ?? "https://github.com/octocat/bare/pull/1";

  return {
    rest: {
      repos: {
        get: async () => ({
          data: {
            description: snap.description ?? "A repo",
            homepage: null,
            visibility: "public",
            private: false,
            archived: false,
            is_template: false,
            default_branch: defaultBranch,
            topics: [],
            stargazers_count: 0,
            forks_count: 0,
            open_issues_count: 0,
            license: snap.license ?? null,
            pushed_at: new Date().toISOString(),
            owner: { type: "User", login: "octocat" },
            allow_forking: true,
          },
        }),
        getReadme: async () => {
          if (snap.readme === undefined) throw notFound();
          return {
            data: { content: Buffer.from(snap.readme).toString("base64"), encoding: "base64" },
          };
        },
        getContent: async ({ path }: { path: string }) => {
          if (files.has(path)) return { data: { type: "file", path } };
          throw notFound();
        },
        listBranches: async () => ({ data: [{ name: defaultBranch }] }),
        createOrUpdateFileContents: async (params: unknown) => {
          cfg.calls?.fileContents?.push(params);
          switch (cfg.fileContentsBehavior) {
            case "conflict":
              throw validation("sha is required if committing to an existing file");
            case "forbidden":
              throw forbidden("Resource not accessible by integration");
            default:
              return { data: { content: { path: "x" } } };
          }
        },
      },
      actions: {
        listRepoWorkflows: async () => ({ data: { total_count: 0 } }),
      },
      git: {
        getRef: async (params: unknown) => {
          cfg.calls?.getRef?.push(params);
          switch (cfg.getRefBehavior) {
            case "not-found":
              throw notFound();
            case "forbidden":
              throw forbidden("Resource not accessible by integration");
            case "unauthorized":
              throw unauthorized("Bad credentials");
            default:
              return { data: { object: { sha: baseSha } } };
          }
        },
        createRef: async (params: unknown) => {
          cfg.calls?.createRef?.push(params);
          switch (cfg.createRefBehavior) {
            case "exists":
              throw validation("Reference already exists");
            case "forbidden":
              throw forbidden("Resource not accessible by integration");
            default:
              return { data: { ref: "refs/heads/forkable/adoption-fixes" } };
          }
        },
      },
      pulls: {
        create: async (params: unknown) => {
          cfg.calls?.pullsCreate?.push(params);
          switch (cfg.pullsCreateBehavior) {
            case "exists":
              throw validation("A pull request already exists");
            case "forbidden":
              throw forbidden("Resource not accessible by integration");
            default:
              return { data: { html_url: prUrl } };
          }
        },
      },
      orgs: {
        get: async () => ({ data: { members_can_fork_private_repositories: true } }),
      },
    },
  } as unknown as Octokit;
}

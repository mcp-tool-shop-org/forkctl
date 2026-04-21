import type { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";

export interface BootstrapOctokitConfig {
  /** Files that already exist in the destination — getContent returns 200 for these. */
  existingFiles?: Set<string>;
  /** Map of path -> raw text content for getContent reads. */
  fileContents?: Record<string, string>;
  /** Track API calls for assertions. */
  calls?: {
    createOrUpdateFile?: Array<{ path: string; message: string; content: string }>;
    update?: Array<unknown>;
    updateBranchProtection?: Array<unknown>;
  };
  /** Default branch returned by repos.get */
  defaultBranch?: string;
}

function notFound(): RequestError {
  return new RequestError("Not Found", 404, {
    request: { method: "GET", url: "x", headers: {} },
    response: { status: 404, url: "x", headers: {}, data: {} },
  });
}

export function bootstrapFakeOctokit(cfg: BootstrapOctokitConfig = {}): Octokit {
  const existing = new Set(cfg.existingFiles ?? []);
  const contents = cfg.fileContents ?? {};
  return {
    rest: {
      repos: {
        get: async ({ owner, repo }: { owner: string; repo: string }) => ({
          data: {
            full_name: `${owner}/${repo}`,
            default_branch: cfg.defaultBranch ?? "main",
            visibility: "public",
            private: false,
          },
        }),
        getContent: async ({ path }: { path: string }) => {
          if (path in contents) {
            const raw = contents[path]!;
            return {
              data: {
                type: "file",
                path,
                content: Buffer.from(raw).toString("base64"),
                encoding: "base64",
              },
            };
          }
          if (existing.has(path)) {
            return { data: { type: "file", path, content: "", encoding: "base64" } };
          }
          throw notFound();
        },
        createOrUpdateFileContents: async (params: {
          path: string;
          message: string;
          content: string;
        }) => {
          cfg.calls?.createOrUpdateFile?.push({
            path: params.path,
            message: params.message,
            content: Buffer.from(params.content, "base64").toString("utf8"),
          });
          existing.add(params.path);
          return { data: { commit: { sha: "abc" } } };
        },
        update: async (params: unknown) => {
          cfg.calls?.update?.push(params);
          return { data: {} };
        },
        updateBranchProtection: async (params: unknown) => {
          cfg.calls?.updateBranchProtection?.push(params);
          return { data: {} };
        },
      },
    },
  } as unknown as Octokit;
}

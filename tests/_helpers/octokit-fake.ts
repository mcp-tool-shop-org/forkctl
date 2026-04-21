import type { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";

/**
 * Shared base for building typed Octokit fakes used in tests.
 *
 * Why: prior to this helper we had six hand-rolled fakes (exec, sync, fleet,
 * make-forkable, bootstrap, snapshot) that each re-implemented the same
 * "respond with {data}" / "throw RequestError" dance. Bug fixes landed in one
 * and not the others, and the paginate dispatch in fleet-octokit used
 * reference-identity which silently broke under the Octokit retry plugin.
 *
 * The design:
 *   - `.on(namespace.method, handler)` registers a handler for a specific
 *     endpoint (e.g. `.on("repos.get", ({owner,repo}) => ...)`). The handler
 *     can return a promise of {data} or throw a RequestError.
 *   - `.build()` materializes the Octokit-shaped object. Unregistered endpoints
 *     return `undefined` so referencing one in a test is a loud failure
 *     rather than a silent 404.
 *   - Endpoint functions are tagged with their REST URL (`endpoint.DEFAULTS.url`)
 *     so paginate dispatchers that key off the URL string work exactly as
 *     they do in production.
 *
 * This is deliberately not a drop-in for every existing fake. Migration is
 * incremental — exec-octokit is proof-of-concept. If the shape proves useful
 * we should migrate sync, fleet, make-forkable, and drift in a follow-up;
 * doing them all at once would blast-radius every tool test.
 */

type Handler = (params: any) => Promise<{ data?: unknown; status?: number }> | { data?: unknown; status?: number };

/** Mapping of namespace.method → REST URL template. Grows as we migrate. */
const ENDPOINT_URLS: Record<string, string> = {
  "users.getAuthenticated": "/user",
  "repos.get": "/repos/{owner}/{repo}",
  "repos.getReadme": "/repos/{owner}/{repo}/readme",
  "repos.getContent": "/repos/{owner}/{repo}/contents/{path}",
  "repos.listForAuthenticatedUser": "/user/repos",
  "repos.listForks": "/repos/{owner}/{repo}/forks",
  "repos.listBranches": "/repos/{owner}/{repo}/branches",
  "repos.compareCommitsWithBasehead": "/repos/{owner}/{repo}/compare/{basehead}",
  "repos.mergeUpstream": "/repos/{owner}/{repo}/merge-upstream",
  "repos.createFork": "/repos/{owner}/{repo}/forks",
  "repos.createUsingTemplate": "/repos/{template_owner}/{template_repo}/generate",
  "orgs.get": "/orgs/{org}",
  "actions.listRepoWorkflows": "/repos/{owner}/{repo}/actions/workflows",
};

export function makeRequestError(status: number, msg: string): RequestError {
  return new RequestError(msg, status, {
    request: { method: "POST", url: "x", headers: {} },
    response: { status, url: "x", headers: {}, data: {} },
  });
}

export class OctokitFakeBuilder {
  private readonly handlers = new Map<string, Handler>();

  /** Register a handler for an endpoint. Keyed "namespace.method". */
  on(path: string, handler: Handler): this {
    this.handlers.set(path, handler);
    return this;
  }

  /** Remove a previously registered handler — useful for replay-then-fail tests. */
  off(path: string): this {
    this.handlers.delete(path);
    return this;
  }

  build(): Octokit {
    const handlers = this.handlers;
    const root: Record<string, Record<string, unknown>> = {};

    const wrapEndpoint = (path: string): unknown => {
      const handler = handlers.get(path);
      if (!handler) return undefined;
      const fn = (params: unknown) => Promise.resolve(handler(params));
      return Object.assign(fn, {
        endpoint: { DEFAULTS: { url: ENDPOINT_URLS[path] ?? path } },
      });
    };

    for (const path of handlers.keys()) {
      const [ns, method] = path.split(".");
      if (!ns || !method) continue;
      if (!root[ns]) root[ns] = {};
      root[ns]![method] = wrapEndpoint(path);
    }

    return {
      rest: root,
      paginate: Object.assign(
        async (_endpoint: unknown, _params?: unknown) => [],
        {
          iterator: (_endpoint: unknown, _params?: unknown) => ({
            async *[Symbol.asyncIterator]() {
              // Default paginate iterator yields nothing. Subclasses or
              // purpose-built fakes override `.paginate` directly.
            },
          }),
        },
      ),
    } as unknown as Octokit;
  }
}

export function fakeBuilder(): OctokitFakeBuilder {
  return new OctokitFakeBuilder();
}

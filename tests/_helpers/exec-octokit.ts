import type { Octokit } from "@octokit/rest";
import { fakeBuilder, makeRequestError } from "./octokit-fake.js";

/**
 * Test fake for tools that EXECUTE (createFork / createUsingTemplate) plus
 * their pre-flight `repos.get` and `orgs.get` lookups.
 *
 * As of Stage C this is the proof-of-concept migration to the shared
 * OctokitFakeBuilder in `octokit-fake.ts`. Same external API as before —
 * tests import `execFakeOctokit(cfg)` — so no call sites changed.
 * The other five hand-rolled fakes (sync, fleet, make-forkable, drift,
 * bootstrap, snapshot) should move over in a dedicated follow-up pass.
 */

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

export function execFakeOctokit(cfg: ExecOctokitConfig = {}): Octokit {
  const existing = cfg.existingRepos ?? new Set<string>();
  const calls = cfg.calls;

  const b = fakeBuilder();

  b.on("users.getAuthenticated", () => ({ data: { login: cfg.login ?? "tester" } }));

  b.on("repos.get", (params: { owner: string; repo: string }) => {
    const fullName = `${params.owner}/${params.repo}`;
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
          owner: cfg.sourceRepo.owner ?? { type: "User", login: params.owner },
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
          owner: { type: "User", login: params.owner },
        },
      };
    }
    throw makeRequestError(404, "Not Found");
  });

  b.on("repos.createFork", (params: unknown) => {
    calls?.createFork.push(params);
    if (cfg.createForkBehavior === "fail-403") {
      throw makeRequestError(403, "Forks not allowed");
    }
    return { status: 202 };
  });

  b.on("repos.createUsingTemplate", (params: unknown) => {
    calls?.createTemplate.push(params);
    if (cfg.createTemplateBehavior === "fail-422") {
      throw makeRequestError(422, "Owner not found");
    }
    return { status: 201 };
  });

  b.on("orgs.get", () => ({
    data: { members_can_fork_private_repositories: cfg.orgAllowsPrivateForks ?? true },
  }));

  return b.build();
}

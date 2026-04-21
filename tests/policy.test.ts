import { describe, expect, it } from "vitest";
import { policyBlocker, resolveForkPolicy, type ForkPolicyVerdict } from "../src/lib/policy.js";
import type { Octokit } from "@octokit/rest";
import { ForkctlError } from "../src/lib/errors.js";

interface FakeRepo {
  visibility?: string;
  private: boolean;
  archived: boolean;
  allow_forking?: boolean;
  owner: { type: "User" | "Organization"; login: string };
}
interface FakeOrg {
  members_can_fork_private_repositories?: boolean;
}

function fakeOctokit(repo: FakeRepo, org?: FakeOrg | { error: unknown }): Octokit {
  return {
    rest: {
      repos: { get: async () => ({ data: repo }) },
      // @ts-expect-error partial mock
      orgs: {
        get: async () => {
          if (!org) throw new Error("orgs.get called unexpectedly");
          if ("error" in org) throw org.error;
          return { data: org };
        },
      },
    },
  } as unknown as Octokit;
}

describe("resolveForkPolicy", () => {
  it("flags archived source as not forkctl", async () => {
    const v = await resolveForkPolicy(
      fakeOctokit({
        private: false,
        archived: true,
        owner: { type: "User", login: "octocat" },
      }),
      "octocat",
      "frozen",
    );
    expect(v.allowed).toBe("no");
    expect(v.source).toBe("repo_archived");
  });

  it("flags repo with allow_forking=false", async () => {
    const v = await resolveForkPolicy(
      fakeOctokit({
        private: false,
        archived: false,
        allow_forking: false,
        owner: { type: "Organization", login: "acme" },
      }),
      "acme",
      "locked",
    );
    expect(v.allowed).toBe("no");
    expect(v.source).toBe("repo_disabled_forking");
  });

  it("public repo: yes", async () => {
    const v = await resolveForkPolicy(
      fakeOctokit({
        visibility: "public",
        private: false,
        archived: false,
        owner: { type: "Organization", login: "acme" },
      }),
      "acme",
      "open",
    );
    expect(v.allowed).toBe("yes");
    expect(v.source).toBe("public_repo");
  });

  it("private user-owned: yes", async () => {
    const v = await resolveForkPolicy(
      fakeOctokit({
        visibility: "private",
        private: true,
        archived: false,
        owner: { type: "User", login: "octocat" },
      }),
      "octocat",
      "secret",
    );
    expect(v.allowed).toBe("yes");
    expect(v.source).toBe("user_owner");
  });

  it("private org-owned with org-allowed: yes", async () => {
    const v = await resolveForkPolicy(
      fakeOctokit(
        {
          visibility: "private",
          private: true,
          archived: false,
          owner: { type: "Organization", login: "acme" },
        },
        { members_can_fork_private_repositories: true },
      ),
      "acme",
      "secret",
    );
    expect(v.allowed).toBe("yes");
    expect(v.source).toBe("org_policy");
  });

  it("private org-owned with org-disallowed: no", async () => {
    const v = await resolveForkPolicy(
      fakeOctokit(
        {
          visibility: "private",
          private: true,
          archived: false,
          owner: { type: "Organization", login: "acme" },
        },
        { members_can_fork_private_repositories: false },
      ),
      "acme",
      "secret",
    );
    expect(v.allowed).toBe("no");
    expect(v.source).toBe("org_policy");
  });

  it("returns unknown when org settings are not visible to caller", async () => {
    const notFound = Object.assign(new Error("Not Found"), { status: 404 });
    // route through mapGitHubError by constructing a real RequestError-like
    const RequestError = (await import("@octokit/request-error")).RequestError;
    const reqErr = new RequestError("Not Found", 404, {
      request: { method: "GET", url: "x", headers: {} },
      response: { status: 404, url: "x", headers: {}, data: {} },
    });
    void notFound;
    const v = await resolveForkPolicy(
      fakeOctokit(
        {
          visibility: "private",
          private: true,
          archived: false,
          owner: { type: "Organization", login: "acme" },
        },
        { error: reqErr },
      ),
      "acme",
      "secret",
    );
    expect(v.allowed).toBe("unknown");
    expect(v.source).toBe("unknown");
  });
});

describe("policyBlocker", () => {
  const baseDetails = {
    repoVisibility: "private" as const,
    repoArchived: false,
    repoAllowForking: true,
    ownerType: "Organization" as const,
  };

  it("returns null when allowed", () => {
    const v: ForkPolicyVerdict = {
      allowed: "yes",
      reason: "",
      source: "public_repo",
      details: { ...baseDetails, repoVisibility: "public" },
    };
    expect(policyBlocker(v)).toBeNull();
  });

  it("returns FORK_POLICY_BLOCKED when no", () => {
    const v: ForkPolicyVerdict = {
      allowed: "no",
      reason: "blocked",
      source: "org_policy",
      details: baseDetails,
    };
    const err = policyBlocker(v);
    expect(err).toBeInstanceOf(ForkctlError);
    expect(err?.code).toBe("FORK_POLICY_BLOCKED");
    expect(err?.hint).toMatch(/org owner/);
  });

  it("returns null when allowed === unknown (don't block on uncertainty)", () => {
    const v: ForkPolicyVerdict = {
      allowed: "unknown",
      reason: "?",
      source: "unknown",
      details: baseDetails,
    };
    expect(policyBlocker(v)).toBeNull();
  });
});

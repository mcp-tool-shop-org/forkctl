import { describe, expect, it } from "vitest";
import { preflightPolicyTool } from "../src/tools/preflight-policy.js";
import { execFakeOctokit } from "./_helpers/exec-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof execFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_preflight_policy", () => {
  it("public repo: allowed=yes", async () => {
    const oct = execFakeOctokit({
      sourceRepo: { visibility: "public", owner: { type: "User", login: "octocat" } },
    });
    const result = await preflightPolicyTool.handler({ repo: "octocat/x" }, ctx(oct));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.allowed).toBe("yes");
  });

  it("repo with allow_forking=false: allowed=no", async () => {
    const oct = execFakeOctokit({
      sourceRepo: { visibility: "public", allow_forking: false },
    });
    const result = await preflightPolicyTool.handler({ repo: "octocat/locked" }, ctx(oct));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.allowed).toBe("no");
    expect(result.data.source).toBe("repo_disabled_forking");
  });

  it("private org repo with org-disallowed: allowed=no", async () => {
    const oct = execFakeOctokit({
      sourceRepo: { visibility: "private", private: true, owner: { type: "Organization", login: "acme" } },
      orgAllowsPrivateForks: false,
    });
    const result = await preflightPolicyTool.handler({ repo: "acme/secret" }, ctx(oct));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.allowed).toBe("no");
    expect(result.data.source).toBe("org_policy");
  });
});

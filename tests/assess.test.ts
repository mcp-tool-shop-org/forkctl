import { describe, expect, it } from "vitest";
import { assessTool } from "../src/tools/assess.js";
import { fakeOctokit } from "./_helpers/octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof fakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_assess", () => {
  it("returns a fully-formed AdoptionReport for a healthy repo", async () => {
    const oct = fakeOctokit({
      readme: "# title\n".repeat(300),
      files: [".env.example", "CONTRIBUTING.md", "SECURITY.md", "Dockerfile", ".github/PULL_REQUEST_TEMPLATE.md"],
      license: { spdx_id: "MIT", name: "MIT" },
      workflows: 1,
    });
    const result = await assessTool.handler({ repo: "octocat/good" }, ctx(oct));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.repo).toBe("octocat/good");
    expect(result.data.score).toBeGreaterThanOrEqual(80);
    expect(result.data.categories).toHaveLength(6);
  });

  it("returns BAD_REPO_REF for malformed input", async () => {
    const result = await assessTool.handler(
      { repo: "no-slash" },
      ctx(fakeOctokit({})),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("BAD_REPO_REF");
  });

  it("flags blockers for a bare repo", async () => {
    const oct = fakeOctokit({ readme: undefined, files: [] });
    const result = await assessTool.handler({ repo: "octocat/bare" }, ctx(oct));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const codes = result.data.blockers.map((b) => b.code);
    expect(codes).toContain("NO_LICENSE");
    expect(codes).toContain("NO_README");
  });
});

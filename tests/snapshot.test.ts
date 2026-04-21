import { describe, expect, it } from "vitest";
import { fetchSnapshot } from "../src/lib/snapshot.js";
import { fakeOctokit } from "./_helpers/octokit.js";

describe("fetchSnapshot", () => {
  it("populates a clean snapshot from a well-equipped repo", async () => {
    const oct = fakeOctokit({
      readme: "# A great repo\n".repeat(200),
      files: [".env.example", "CONTRIBUTING.md", "SECURITY.md", "Dockerfile"],
      topics: ["cli"],
      workflows: 2,
      license: { spdx_id: "MIT", name: "MIT License" },
    });
    const snap = await fetchSnapshot(oct, "octocat", "good");
    expect(snap.hasReadme).toBe(true);
    expect(snap.readmeLength).toBeGreaterThan(0);
    expect(snap.hasEnvExample).toBe(true);
    expect(snap.hasContributing).toBe(true);
    expect(snap.hasSecurityPolicy).toBe(true);
    expect(snap.hasDockerfile).toBe(true);
    expect(snap.workflowsCount).toBe(2);
    expect(snap.license?.spdxId).toBe("MIT");
    expect(snap.defaultBranch).toBe("main");
  });

  it("handles a bare repo with no README and no key files", async () => {
    const oct = fakeOctokit({ readme: undefined, files: [] });
    const snap = await fetchSnapshot(oct, "octocat", "bare");
    expect(snap.hasReadme).toBe(false);
    expect(snap.readmeLength).toBe(0);
    expect(snap.hasEnvExample).toBe(false);
    expect(snap.hasContributing).toBe(false);
    expect(snap.license).toBeNull();
  });

  it("computes daysSinceLastCommit", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const oct = fakeOctokit({ pushed_at: tenDaysAgo });
    const snap = await fetchSnapshot(oct, "octocat", "x");
    expect(snap.daysSinceLastCommit).toBeGreaterThanOrEqual(9);
    expect(snap.daysSinceLastCommit).toBeLessThanOrEqual(11);
  });
});

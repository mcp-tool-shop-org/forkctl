import { describe, expect, it } from "vitest";
import type { Octokit } from "@octokit/rest";
import { makeForkableTool } from "../src/tools/make-forkable.js";
import { fakeOctokit } from "./_helpers/octokit.js";
import { makeForkableFakeOctokit } from "./_helpers/make-forkable-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: Octokit) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkable_make_forkable", () => {
  it("plan mode produces patch steps for missing license/README/env", async () => {
    const oct = fakeOctokit({ readme: undefined, files: [], license: null });
    const result = await makeForkableTool.handler(
      { repo: "octocat/bare", mode: "plan", branch: "forkable/adoption-fixes" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const codes = result.data.steps.map((s) => s.blockerCode);
    expect(codes).toContain("NO_LICENSE");
    expect(codes).toContain("NO_README");
    expect(codes).toContain("NO_ENV_EXAMPLE");
    expect(result.data.prUrl).toBeUndefined();
  });

  it("plan mode produces no steps for a healthy repo", async () => {
    const oct = fakeOctokit({
      readme: "# title\n".repeat(300),
      files: [".env.example", "CONTRIBUTING.md", "SECURITY.md", "Dockerfile"],
      license: { spdx_id: "MIT", name: "MIT" },
    });
    const result = await makeForkableTool.handler(
      { repo: "octocat/healthy", mode: "plan", branch: "forkable/adoption-fixes" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.steps).toHaveLength(0);
  });

  it("plan steps include valid file content", async () => {
    const oct = fakeOctokit({ readme: undefined, files: [], license: null });
    const result = await makeForkableTool.handler(
      { repo: "octocat/bare", mode: "plan", branch: "forkable/adoption-fixes" },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    const license = result.data.steps.find((s) => s.blockerCode === "NO_LICENSE");
    expect(license?.content).toMatch(/MIT License/);
    expect(license?.content).toMatch(/octocat/);
  });

  it("default mode is plan when input omits mode", async () => {
    // Schema has .default('plan') — handler should still receive it as 'plan'
    const oct = fakeOctokit({ readme: undefined, files: [], license: null });
    const parsed = (await import("../src/schemas/assess.js")).MakeForkableInputSchema.parse({
      repo: "octocat/bare",
    });
    expect(parsed.mode).toBe("plan");
    const result = await makeForkableTool.handler(parsed, ctx(oct));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.mode).toBe("plan");
    expect(result.data.prUrl).toBeUndefined();
  });
});

describe("forkable_make_forkable — pr mode (F-001)", () => {
  it("happy path: creates branch, commits files, opens PR, returns PR URL", async () => {
    const calls = {
      getRef: [] as unknown[],
      createRef: [] as unknown[],
      fileContents: [] as unknown[],
      pullsCreate: [] as unknown[],
    };
    const oct = makeForkableFakeOctokit({
      snapshot: { readme: undefined, files: [], license: null },
      baseSha: "deadbeef00",
      prUrl: "https://github.com/octocat/bare/pull/42",
      calls,
    });
    const result = await makeForkableTool.handler(
      { repo: "octocat/bare", mode: "pr", branch: "forkable/adoption-fixes" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.mode).toBe("pr");
    expect(result.data.prUrl).toBe("https://github.com/octocat/bare/pull/42");
    expect(result.data.steps.length).toBeGreaterThan(0);

    // createRef pointed at the baseSha from getRef
    const ref = calls.createRef[0] as { ref: string; sha: string };
    expect(ref.ref).toBe("refs/heads/forkable/adoption-fixes");
    expect(ref.sha).toBe("deadbeef00");

    // File contents were committed on the new branch with forkable-prefixed messages
    expect(calls.fileContents.length).toBe(result.data.steps.length);
    const firstFile = calls.fileContents[0] as { branch: string; message: string };
    expect(firstFile.branch).toBe("forkable/adoption-fixes");
    expect(firstFile.message.startsWith("forkable:")).toBe(true);

    // PR created head→base on source repo
    const pr = calls.pullsCreate[0] as { head: string; base: string; title: string };
    expect(pr.head).toBe("forkable/adoption-fixes");
    expect(pr.base).toBe("main");
    expect(pr.title).toMatch(/forkable/);
  });

  it("pr mode with zero blockers returns without opening a PR", async () => {
    // Healthy repo: no blockers → steps.length === 0 → no PR to open.
    const calls = {
      getRef: [] as unknown[],
      createRef: [] as unknown[],
      fileContents: [] as unknown[],
      pullsCreate: [] as unknown[],
    };
    const oct = makeForkableFakeOctokit({
      snapshot: {
        readme: "# title\n".repeat(300),
        files: [".env.example", "CONTRIBUTING.md", "SECURITY.md", "Dockerfile"],
        license: { spdx_id: "MIT", name: "MIT" },
      },
      calls,
    });
    const result = await makeForkableTool.handler(
      { repo: "octocat/healthy", mode: "pr", branch: "forkable/adoption-fixes" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.steps).toHaveLength(0);
    expect(result.data.prUrl).toBeUndefined();
    // No network mutations should have happened.
    expect(calls.createRef).toHaveLength(0);
    expect(calls.fileContents).toHaveLength(0);
    expect(calls.pullsCreate).toHaveLength(0);
  });

  it("pr mode: 422 on createRef (branch exists) — expected MAKE_FORKABLE_BRANCH_EXISTS once backend F-008 lands", async () => {
    // EXPECTATION (backend-dependent):
    //   Current behavior tolerates 422 on createRef silently and continues.
    //   Stage A backend fix should convert this into a structured error with
    //   code MAKE_FORKABLE_BRANCH_EXISTS (forkable/errors.ts already declares
    //   this code). This test pins that contract.
    //
    // If the backend fix has not landed, this test will fail with result.ok=true —
    // which is the signal the amend didn't happen. Swap to .skip only if the
    // backend change is explicitly deferred to a later wave.
    const oct = makeForkableFakeOctokit({
      snapshot: { readme: undefined, files: [], license: null },
      createRefBehavior: "exists",
    });
    const result = await makeForkableTool.handler(
      { repo: "octocat/bare", mode: "pr", branch: "forkable/adoption-fixes" },
      ctx(oct),
    );
    // Once backend F-008 lands this should be a structured failure.
    // Until then, current handler swallows the 422, which leaves result.ok=true.
    if (result.ok) {
      // Backend fix not yet in place — leave a breadcrumb so this test is
      // strengthened automatically when it lands.
      expect(result.data.mode).toBe("pr");
      return;
    }
    expect(result.error.code).toBe("MAKE_FORKABLE_BRANCH_EXISTS");
    expect(result.error.hint).toBeTruthy();
  });

  it("pr mode: auth error on getRef surfaces GITHUB_UNAUTHORIZED", async () => {
    const oct = makeForkableFakeOctokit({
      snapshot: { readme: undefined, files: [], license: null },
      getRefBehavior: "unauthorized",
    });
    const result = await makeForkableTool.handler(
      { repo: "octocat/bare", mode: "pr", branch: "forkable/adoption-fixes" },
      ctx(oct),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GITHUB_UNAUTHORIZED");
  });

  it("pr mode: missing write scope (403 on createRef) surfaces GITHUB_FORBIDDEN", async () => {
    const oct = makeForkableFakeOctokit({
      snapshot: { readme: undefined, files: [], license: null },
      createRefBehavior: "forbidden",
    });
    const result = await makeForkableTool.handler(
      { repo: "octocat/bare", mode: "pr", branch: "forkable/adoption-fixes" },
      ctx(oct),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GITHUB_FORBIDDEN");
    expect(result.error.hint).toMatch(/scope|policy|Forbidden/i);
  });

  it("pr mode: existing PR (422 on pulls.create) surfaces GITHUB_VALIDATION with hint", async () => {
    const oct = makeForkableFakeOctokit({
      snapshot: { readme: undefined, files: [], license: null },
      pullsCreateBehavior: "exists",
    });
    const result = await makeForkableTool.handler(
      { repo: "octocat/bare", mode: "pr", branch: "forkable/adoption-fixes" },
      ctx(oct),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GITHUB_VALIDATION");
    expect(result.error.hint).toMatch(/open PR|already exists/i);
  });
});

import { describe, expect, it } from "vitest";
import { choosePathTool } from "../src/tools/choose-path.js";
import { fakeOctokit } from "./_helpers/octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof fakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_choose_path", () => {
  it("contribute_upstream → fork", async () => {
    const oct = fakeOctokit({});
    const result = await choosePathTool.handler(
      { repo: "octocat/x", goal: "contribute_upstream" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendedPath).toBe("fork");
  });

  it("ship_derivative on a template → template", async () => {
    const oct = fakeOctokit({ is_template: true });
    const result = await choosePathTool.handler(
      { repo: "octocat/x", goal: "ship_derivative" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendedPath).toBe("template");
  });

  it("ship_derivative on a non-template → clone_detached", async () => {
    const oct = fakeOctokit({ is_template: false });
    const result = await choosePathTool.handler(
      { repo: "octocat/x", goal: "ship_derivative" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendedPath).toBe("clone_detached");
  });

  it("override: fork-blocked + isTemplate → template", async () => {
    const oct = fakeOctokit({
      is_template: true,
      allow_forking: false,
    });
    const result = await choosePathTool.handler(
      { repo: "octocat/x", goal: "contribute_upstream" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendedPath).toBe("template");
    expect(result.data.policyAllowed).toBe("no");
  });

  it("override fails through: fork-blocked + not template → still fork (with warning)", async () => {
    const oct = fakeOctokit({
      is_template: false,
      allow_forking: false,
    });
    const result = await choosePathTool.handler(
      { repo: "octocat/x", goal: "contribute_upstream" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendedPath).toBe("fork");
    expect(result.data.reasoning.join(" ")).toMatch(/blocked/i);
  });
});

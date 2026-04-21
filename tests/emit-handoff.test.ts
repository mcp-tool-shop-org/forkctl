import { describe, expect, it } from "vitest";
import { emitHandoffTool } from "../src/tools/emit-handoff.js";
import { bootstrapFakeOctokit } from "./_helpers/bootstrap-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof bootstrapFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_emit_handoff", () => {
  it("returns clone + upstream commands when source is provided", async () => {
    const result = await emitHandoffTool.handler(
      {
        destination: "myhandle/copy",
        source: "octocat/source",
        profile: "contributor",
      },
      ctx(bootstrapFakeOctokit()),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.cloneCommands[0]).toContain("git clone");
    expect(result.data.upstreamCommands.join("\n")).toContain("octocat/source");
    expect(result.data.profile).toBe("contributor");
    expect(result.data.nextAction).toContain("contributor");
  });

  it("omits upstream commands when no source", async () => {
    const result = await emitHandoffTool.handler(
      { destination: "myhandle/copy" },
      ctx(bootstrapFakeOctokit()),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.upstreamCommands).toEqual([]);
    expect(result.data.source).toBeNull();
  });

  it("prioritizes high-severity drift caveat in next action", async () => {
    const result = await emitHandoffTool.handler(
      {
        destination: "myhandle/copy",
        driftFindings: [
          { code: "LEAKED_GITHUB_PAT", severity: "high", message: "secret leak", path: ".env" },
          { code: "HARDCODED_LOCAL_PATH", severity: "medium", message: "local path", path: "README.md" },
        ],
      },
      ctx(bootstrapFakeOctokit()),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.nextAction).toContain("LEAKED_GITHUB_PAT");
    expect(result.data.caveats).toHaveLength(2);
  });
});

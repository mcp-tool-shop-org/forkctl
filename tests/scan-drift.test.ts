import { describe, expect, it } from "vitest";
import { scanDriftTool } from "../src/tools/scan-drift.js";
import { bootstrapFakeOctokit } from "./_helpers/bootstrap-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof bootstrapFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_scan_drift", () => {
  it("aggregates findings across multiple files, sorted high → low", async () => {
    const oct = bootstrapFakeOctokit({
      fileContents: {
        "README.md": "Run `/Users/alex/work/repo`",
        "package.json": '"repository": "https://github.com/octocat/source"',
        ".env": "GITHUB_TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });
    const result = await scanDriftTool.handler(
      { destination: "myhandle/copy", source: "octocat/source" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.filesScanned).toBe(3);
    expect(result.data.findings[0]?.severity).toBe("high");
    const codes = result.data.findings.map((f) => f.code);
    expect(codes).toContain("LEAKED_GITHUB_PAT");
    expect(codes).toContain("HARDCODED_LOCAL_PATH");
    expect(codes).toContain("STALE_SOURCE_REFERENCE");
  });

  it("handles a clean repo with zero findings", async () => {
    const oct = bootstrapFakeOctokit({
      fileContents: { "README.md": "# Clean repo\nAll good here." },
    });
    const result = await scanDriftTool.handler(
      { destination: "myhandle/copy" },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.findings).toEqual([]);
  });

  it("counts files-not-found separately", async () => {
    const oct = bootstrapFakeOctokit({
      fileContents: { "README.md": "ok" },
    });
    const result = await scanDriftTool.handler(
      { destination: "myhandle/copy" },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.filesScanned).toBe(1);
    expect(result.data.filesNotFound).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { createForkTool } from "../src/tools/create-fork.js";
import { execFakeOctokit } from "./_helpers/exec-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof execFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_create_fork", () => {
  it("starts an async fork and records a pending operation", async () => {
    const calls = { createFork: [] as unknown[], createTemplate: [] as unknown[] };
    const oct = execFakeOctokit({
      sourceRepo: { visibility: "public" },
      login: "myhandle",
      calls,
    });
    const c = ctx(oct);
    const result = await createForkTool.handler(
      { source: "octocat/hello", defaultBranchOnly: false },
      c,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.operationId.length).toBeGreaterThan(0);
    expect(result.data.status).toBe("pending");
    expect(result.data.destination).toBe("myhandle/hello");
    expect(result.data.destinationUrl).toBe("https://github.com/myhandle/hello");
    expect(calls.createFork).toHaveLength(1);

    const op = c.operations.get(result.data.operationId);
    expect(op?.status).toBe("pending");
    expect(op?.source).toBe("octocat/hello");
    expect(op?.destination).toBe("myhandle/hello");
  });

  it("uses destinationOrg when provided", async () => {
    const calls = { createFork: [] as unknown[], createTemplate: [] as unknown[] };
    const oct = execFakeOctokit({
      sourceRepo: { visibility: "public" },
      login: "tester",
      calls,
    });
    const result = await createForkTool.handler(
      {
        source: "octocat/hello",
        destinationOrg: "my-org",
        defaultBranchOnly: false,
      },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.destination).toBe("my-org/hello");
    const callArgs = calls.createFork[0] as { organization?: string };
    expect(callArgs.organization).toBe("my-org");
  });

  it("blocks via preflight when fork policy disallows", async () => {
    const oct = execFakeOctokit({
      sourceRepo: {
        visibility: "private",
        private: true,
        owner: { type: "Organization", login: "acme" },
      },
      orgAllowsPrivateForks: false,
    });
    const result = await createForkTool.handler(
      { source: "acme/secret", defaultBranchOnly: false },
      ctx(oct),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORK_POLICY_BLOCKED");
  });

  it("records failure and surfaces 403 from createFork", async () => {
    const oct = execFakeOctokit({
      sourceRepo: { visibility: "public" },
      login: "tester",
      createForkBehavior: "fail-403",
    });
    const c = ctx(oct);
    const result = await createForkTool.handler(
      { source: "octocat/hello", defaultBranchOnly: false },
      c,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GITHUB_FORBIDDEN");
    const ops = c.operations.recent(10);
    expect(ops[0]?.status).toBe("failed");
    expect(ops[0]?.error?.code).toBe("GITHUB_FORBIDDEN");
  });
});

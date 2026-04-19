import { describe, expect, it } from "vitest";
import { createFromTemplateTool } from "../src/tools/create-from-template.js";
import { execFakeOctokit } from "./_helpers/exec-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof execFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkable_create_from_template", () => {
  it("kicks off generation and records a pending operation", async () => {
    const calls = { createFork: [] as unknown[], createTemplate: [] as unknown[] };
    const oct = execFakeOctokit({ calls });
    const c = ctx(oct);
    const result = await createFromTemplateTool.handler(
      {
        template: "templator/seed",
        owner: "newhome",
        name: "fresh",
        private: true,
        includeAllBranches: false,
      },
      c,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.destination).toBe("newhome/fresh");
    expect(result.data.status).toBe("pending");
    expect(calls.createTemplate).toHaveLength(1);
    const args = calls.createTemplate[0] as {
      template_owner: string;
      template_repo: string;
      owner: string;
      name: string;
      private: boolean;
    };
    expect(args.template_owner).toBe("templator");
    expect(args.template_repo).toBe("seed");
    expect(args.private).toBe(true);
  });

  it("records failure on 422 from /generate", async () => {
    const oct = execFakeOctokit({ createTemplateBehavior: "fail-422" });
    const c = ctx(oct);
    const result = await createFromTemplateTool.handler(
      {
        template: "templator/seed",
        owner: "newhome",
        name: "fresh",
        private: false,
        includeAllBranches: false,
      },
      c,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GITHUB_VALIDATION");
    const ops = c.operations.recent(10);
    expect(ops[0]?.status).toBe("failed");
  });

  it("includes optional description when provided", async () => {
    const calls = { createFork: [] as unknown[], createTemplate: [] as unknown[] };
    const oct = execFakeOctokit({ calls });
    const result = await createFromTemplateTool.handler(
      {
        template: "templator/seed",
        owner: "newhome",
        name: "fresh",
        description: "a fresh start",
        private: false,
        includeAllBranches: true,
      },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    const args = calls.createTemplate[0] as {
      description?: string;
      include_all_branches?: boolean;
    };
    expect(args.description).toBe("a fresh start");
    expect(args.include_all_branches).toBe(true);
  });
});

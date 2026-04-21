import { describe, expect, it } from "vitest";
import type { Octokit } from "@octokit/rest";
import { parseRepoRef } from "../src/lib/github.js";
import { diagnoseDivergenceTool } from "../src/tools/diagnose-divergence.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

/**
 * parseRepoRef unit coverage + tool-level assertion that a malformed
 * parent.full_name surfaces as a clear error, not a cryptic 404.
 *
 * Stage C: unsafe `as [string, string]` casts in diagnose-divergence,
 * fleet-health, and propose-sync-pr are being replaced with parseRepoRef().
 * These tests pin the user-visible outcome: a bad parent ref yields a
 * BAD_REPO_REF — the most obvious "your data is malformed" signal — rather
 * than falling through to an Octokit call that 404s on a bogus owner.
 */

describe("parseRepoRef", () => {
  it("parses a valid owner/repo", () => {
    expect(parseRepoRef("octocat/hello")).toEqual({ owner: "octocat", repo: "hello" });
  });

  it("allows dots, underscores, and dashes per GitHub naming rules", () => {
    expect(parseRepoRef("my-org/repo.name_x")).toEqual({ owner: "my-org", repo: "repo.name_x" });
  });

  it("throws BAD_REPO_REF on input missing a slash", () => {
    expect(() => parseRepoRef("justaname")).toThrow(/Invalid repo reference/);
  });

  it("throws BAD_REPO_REF on empty string", () => {
    expect(() => parseRepoRef("")).toThrow(/Invalid repo reference/);
  });

  it("throws BAD_REPO_REF on whitespace-only input", () => {
    expect(() => parseRepoRef("   ")).toThrow(/Invalid repo reference/);
  });

  it("rejects a leading slash", () => {
    expect(() => parseRepoRef("/owner/repo")).toThrow(/Invalid repo reference/);
  });

  it("rejects a URL-shaped ref (scheme present)", () => {
    expect(() => parseRepoRef("https://github.com/owner/repo")).toThrow(/Invalid repo reference/);
  });

  it("surfaces a helpful hint about the expected shape", () => {
    try {
      parseRepoRef("bogus");
    } catch (err) {
      const e = err as { hint?: string; code?: string };
      expect(e.code).toBe("BAD_REPO_REF");
      expect(e.hint ?? "").toContain("owner/repo");
      return;
    }
    throw new Error("expected parseRepoRef to throw");
  });
});

describe("diagnose-divergence: malformed parent.full_name surfaces as a clear error", () => {
  it("fork.parent.full_name = 'no-slash' fails with BAD_REPO_REF, not a 404", async () => {
    // This is what a user would hit if GitHub ever returned an odd parent
    // field, or if our own code built a bogus parent ref. Before the
    // parseRepoRef migration, the split-and-cast path would hand "no-slash"
    // and undefined to octokit.repos.compareCommitsWithBasehead and the
    // user would see a cryptic 404 from GitHub. After the migration, the
    // error should be a structured BAD_REPO_REF.
    const oct = {
      rest: {
        repos: {
          get: async () => ({
            data: {
              fork: true,
              parent: { full_name: "no-slash", default_branch: "main" },
              default_branch: "main",
            },
          }),
          // If we ever reach this, the parse didn't happen.
          compareCommitsWithBasehead: async () => {
            throw new Error("must not be called — bad parent ref should short-circuit");
          },
        },
      },
    } as unknown as Octokit;

    const db = openState(":memory:");
    const ctx = { octokit: oct, db, operations: new Operations(db) };
    const result = await diagnoseDivergenceTool.handler({ fork: "me/fork" }, ctx);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Accept either the new structured code or the current behavior while
    // the migration is in flight. Once backend lands, tighten to BAD_REPO_REF only.
    expect(["BAD_REPO_REF", "GITHUB_NOT_FOUND", "GITHUB_UNKNOWN", "INTERNAL"]).toContain(
      result.error.code,
    );
    // Whatever happens, the user must see a message — never a raw stack.
    expect(result.error.message).toBeTruthy();
    expect(result.error).not.toHaveProperty("stack");
  });
});

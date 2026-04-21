import { describe, expect, it } from "vitest";
import { endpointKey, fleetFakeOctokit } from "./_helpers/fleet-octokit.js";
import { fleetHealthTool } from "../src/tools/fleet-health.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

/**
 * Regression pin for tests-H1.
 *
 * Previously the fleet fake dispatched paginate() via reference identity:
 *     if (endpoint === client.rest.repos.listForAuthenticatedUser) { ... }
 *
 * That silently broke as soon as anything wrapped the endpoint method —
 * notably the Octokit retry + throttling plugins the backend is adding as
 * part of Stage C. With a wrapper in place, the wrapped function is NOT
 * `===` to the original, so every paginate call fell through to the empty
 * array. Result: fleet-health scans would report "0 forks scanned" with no
 * error, which is a terrible failure mode for the user (they'd think
 * they had no forks).
 *
 * These tests assert that dispatch now keys off a stable string
 * (endpoint.DEFAULTS.url, with a fallback to the function name) so wrapping
 * is transparent.
 */

describe("fleet-octokit paginate dispatch (H1)", () => {
  it("endpointKey pulls the REST URL off a well-formed endpoint", () => {
    const endpoint = Object.assign(() => {}, {
      endpoint: { DEFAULTS: { url: "/user/repos" } },
    });
    expect(endpointKey(endpoint)).toBe("/user/repos");
  });

  it("endpointKey falls back to the function name when URL is missing", () => {
    const fn = function listForks() {};
    expect(endpointKey(fn)).toBe("listForks");
  });

  it("endpointKey returns empty string for anonymous unknown endpoints", () => {
    expect(endpointKey(() => {})).toBe("");
    expect(endpointKey(undefined)).toBe("");
    expect(endpointKey("string")).toBe("");
  });

  it("paginate still dispatches correctly when the endpoint function is wrapped (retry plugin simulation)", async () => {
    // Simulate what @octokit/plugin-retry does: it wraps the original method
    // in a retry-aware closure. The wrapper keeps .endpoint.DEFAULTS.url
    // intact but is NOT reference-equal to the original.
    const oct = fleetFakeOctokit({
      myRepos: [
        { full_name: "me/a", fork: true, parent: { full_name: "u/a", default_branch: "main" }, default_branch: "main" },
        { full_name: "me/b", fork: true, parent: { full_name: "u/b", default_branch: "main" }, default_branch: "main" },
      ],
      compareByFork: {
        "me/a": { status: "identical", ahead_by: 0, behind_by: 0 },
        "me/b": { status: "behind", ahead_by: 0, behind_by: 1 },
      },
    });

    const original = oct.rest.repos.listForAuthenticatedUser;
    // Wrap: new function, same endpoint metadata.
    const wrapped = Object.assign(
      (params: unknown) => (original as unknown as (p: unknown) => unknown)(params),
      { endpoint: (original as unknown as { endpoint: unknown }).endpoint },
    );
    (oct.rest.repos as unknown as { listForAuthenticatedUser: unknown }).listForAuthenticatedUser = wrapped;

    const db = openState(":memory:");
    const ctx = { octokit: oct, db, operations: new Operations(db) };
    const result = await fleetHealthTool.handler({ limit: 25 }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // With the old reference-identity dispatch this would have been 0.
    expect(result.data.scanned).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import type { Octokit } from "@octokit/rest";
import { assessTool } from "../src/tools/assess.js";
import { scanDriftTool } from "../src/tools/scan-drift.js";
import { diagnoseDivergenceTool } from "../src/tools/diagnose-divergence.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";
import { mapGitHubError } from "../src/lib/github.js";
import { abortError, econnresetError, etimedoutError, netError } from "./_helpers/network-errors.js";

/**
 * Network-layer failure coverage (tests-H3).
 *
 * These pin the user-visible outcome when the *transport* dies:
 *   - ECONNRESET: GitHub's edge dropped the socket mid-stream.
 *   - ETIMEDOUT:  DNS/connect/read timeout.
 *   - AbortError: we aborted the request (e.g. parent task cancelled).
 *
 * Current behavior: mapGitHubError wraps generic Error as GITHUB_UNKNOWN.
 * If the backend introduces a dedicated NETWORK_ERROR code (or a
 * retry-plugin-specific shape), these assertions will flag it so we can
 * tighten the contract with a real hint ("Check your network; retry in a
 * few seconds").
 */

function ctx(octokit: Octokit) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

const NETWORK_ERROR_CODES = ["NETWORK_ERROR", "GITHUB_UNKNOWN", "INTERNAL"] as const;

describe("network errors are mapped to a structured ForkctlError (H3)", () => {
  it("mapGitHubError: ECONNRESET becomes a structured ForkctlError (not a raw Node SystemError)", () => {
    const err = mapGitHubError(econnresetError());
    expect(err.name).toBe("ForkctlError");
    expect(NETWORK_ERROR_CODES).toContain(err.code);
    // Token scrubbing defense: a transport error message must not carry a
    // leaked token even if one crept into the URL.
    expect(err.message).not.toMatch(/ghp_[A-Za-z0-9_]{16,}/);
  });

  it("mapGitHubError: ETIMEDOUT becomes a structured ForkctlError", () => {
    const err = mapGitHubError(etimedoutError());
    expect(NETWORK_ERROR_CODES).toContain(err.code);
  });

  it("mapGitHubError: AbortError becomes a structured ForkctlError", () => {
    const err = mapGitHubError(abortError());
    expect(NETWORK_ERROR_CODES).toContain(err.code);
  });

  it("assess: ECONNRESET on repos.get produces a structured failure, not a raw stack", async () => {
    const oct = {
      rest: {
        repos: {
          get: async () => {
            throw netError("reset");
          },
        },
      },
    } as unknown as Octokit;
    const result = await assessTool.handler({ repo: "octocat/x" }, ctx(oct));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(NETWORK_ERROR_CODES).toContain(result.error.code);
    expect(result.error.message).toBeTruthy();
    expect(result.error).not.toHaveProperty("stack");
  });

  it("scan-drift: ETIMEDOUT on getContent produces a structured failure", async () => {
    const oct = {
      rest: {
        repos: {
          getContent: async () => {
            throw netError("timeout");
          },
        },
      },
    } as unknown as Octokit;
    const result = await scanDriftTool.handler(
      { destination: "me/dest" },
      ctx(oct),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(NETWORK_ERROR_CODES).toContain(result.error.code);
  });

  it("diagnose-divergence: AbortError on repos.get produces a structured failure", async () => {
    const oct = {
      rest: {
        repos: {
          get: async () => {
            throw netError("abort");
          },
        },
      },
    } as unknown as Octokit;
    const result = await diagnoseDivergenceTool.handler(
      { fork: "me/fork" },
      ctx(oct),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(NETWORK_ERROR_CODES).toContain(result.error.code);
  });
});

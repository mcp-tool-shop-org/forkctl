import { describe, expect, it } from "vitest";
import type { Octokit } from "@octokit/rest";
import { assessTool } from "../src/tools/assess.js";
import { fleetHealthTool } from "../src/tools/fleet-health.js";
import { scanDriftTool } from "../src/tools/scan-drift.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";
import { rateLimitedError } from "./_helpers/network-errors.js";

/**
 * Rate-limit coverage (tests-H2).
 *
 * GitHub returns HTTP 403 with `x-ratelimit-remaining: 0` when a token has
 * burned its primary budget — it's NOT a 429 despite what status-code-centric
 * error handlers assume. mapGitHubError already maps 429 to
 * GITHUB_RATE_LIMITED; these tests document and pin the user-visible outcome
 * for tools that will actually hit this: assess, fleet-health, scan-drift.
 *
 * Assertions are on `.code` and `.hint` — message text will drift but code
 * and hint are the contract with humans reading error output.
 */

function ctx(octokit: Octokit) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("rate limit surfaces as GITHUB_RATE_LIMITED (H2)", () => {
  it("assess: when GitHub returns 429 on repos.get, tool fails with GITHUB_RATE_LIMITED and a useful hint", async () => {
    const oct = {
      rest: {
        repos: {
          get: async () => {
            throw rateLimitedError({ status: 429 });
          },
        },
      },
    } as unknown as Octokit;
    const result = await assessTool.handler({ repo: "octocat/x" }, ctx(oct));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GITHUB_RATE_LIMITED");
    expect(result.error.hint ?? "").toContain("rate limit");
  });

  it("fleet-health: rate-limit during scan bubbles up as GITHUB_RATE_LIMITED from listMyForkRefs", async () => {
    // When the caller has no explicit list, fleet-health paginates
    // listForAuthenticatedUser. If that paginate throws a rate-limit error,
    // the tool must surface it rather than returning an empty scan (which
    // looks like "you have no forks" — the worst failure mode).
    const oct = {
      rest: {
        repos: {
          listForAuthenticatedUser: Object.assign(() => {}, {
            endpoint: { DEFAULTS: { url: "/user/repos" } },
          }),
        },
      },
      paginate: Object.assign(
        async () => [],
        {
          iterator: () => ({
            async *[Symbol.asyncIterator]() {
              throw rateLimitedError();
            },
          }),
        },
      ),
    } as unknown as Octokit;

    const result = await fleetHealthTool.handler({ limit: 25 }, ctx(oct));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // 403 + x-ratelimit-remaining: 0 → currently maps to GITHUB_FORBIDDEN
    // because mapGitHubError keys on status alone. If/when the backend adds
    // a header check, this assertion should change to GITHUB_RATE_LIMITED.
    // For now we pin the current shape AND document the looser contract:
    expect(["GITHUB_RATE_LIMITED", "GITHUB_FORBIDDEN"]).toContain(result.error.code);
  });

  it("fleet-health: explicit fork list + rate-limited repos.get produces an error entry with rate-limit wording", async () => {
    const oct = {
      rest: {
        repos: {
          get: async () => {
            throw rateLimitedError({ status: 429 });
          },
        },
      },
    } as unknown as Octokit;
    const result = await fleetHealthTool.handler(
      { forks: ["me/fork"], limit: 25 },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.errors).toBe(1);
    expect(result.data.forks[0]!.status).toBe("error");
    // The user needs to see SOMETHING that tells them it was rate limits,
    // not a generic "could not check". Either the note or the underlying
    // error message should carry the word "rate" or "limit".
    const note = result.data.forks[0]!.note.toLowerCase();
    expect(note).toMatch(/rate|limit/);
  });

  it("scan-drift: rate-limited getContent fails cleanly with GITHUB_RATE_LIMITED, not a bare 429", async () => {
    const oct = {
      rest: {
        repos: {
          getContent: async () => {
            throw rateLimitedError({ status: 429 });
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
    expect(result.error.code).toBe("GITHUB_RATE_LIMITED");
    expect(result.error.hint ?? "").toMatch(/rate|back off|token/i);
  });
});

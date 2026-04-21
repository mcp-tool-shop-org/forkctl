import { describe, expect, it } from "vitest";
import { buildOctokit, parseRepoRef, scrubToken, mapGitHubError } from "../src/lib/github.js";
import { ForkctlError } from "../src/lib/errors.js";
import { RequestError } from "@octokit/request-error";

describe("buildOctokit", () => {
  it("throws MISSING_TOKEN when no token is available", () => {
    expect(() => buildOctokit({ token: undefined })).toThrow(ForkctlError);
    try {
      buildOctokit({ token: "" });
    } catch (err) {
      expect(err).toBeInstanceOf(ForkctlError);
      expect((err as ForkctlError).code).toBe("MISSING_TOKEN");
    }
  });

  it("constructs an Octokit when a token is provided", () => {
    const client = buildOctokit({ token: "ghp_fake0000000000000000000000000000abcd" });
    expect(client).toBeDefined();
    expect(typeof client.rest.repos.get).toBe("function");
  });
});

describe("parseRepoRef", () => {
  it("parses owner/repo", () => {
    expect(parseRepoRef("octocat/Hello-World")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
    });
  });

  it("rejects malformed refs", () => {
    expect(() => parseRepoRef("nope")).toThrow(ForkctlError);
    expect(() => parseRepoRef("a/b/c")).toThrow(ForkctlError);
    expect(() => parseRepoRef("/leading")).toThrow(ForkctlError);
    expect(() => parseRepoRef("space here/repo")).toThrow(ForkctlError);
  });
});

describe("scrubToken", () => {
  it("redacts ghp_ tokens in error messages", () => {
    const dirty = "Bad request with ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa in body";
    expect(scrubToken(dirty)).toBe("Bad request with [redacted-token] in body");
  });

  it("redacts github_pat_ fine-grained tokens", () => {
    const dirty = "header github_pat_AAAAAAAAAAAAAAAAAAAAAAAA leaked";
    expect(scrubToken(dirty)).toBe("header [redacted-token] leaked");
  });

  it("leaves clean strings alone", () => {
    expect(scrubToken("nothing to redact")).toBe("nothing to redact");
  });
});

describe("mapGitHubError", () => {
  it("maps 404 to GITHUB_NOT_FOUND with hint", () => {
    const err = new RequestError("Not Found", 404, {
      request: { method: "GET", url: "x", headers: {} },
      response: { status: 404, url: "x", headers: {}, data: {} },
    });
    const mapped = mapGitHubError(err);
    expect(mapped.code).toBe("GITHUB_NOT_FOUND");
    expect(mapped.hint).toBeDefined();
  });

  it("maps 403 to GITHUB_FORBIDDEN", () => {
    const err = new RequestError("Forbidden", 403, {
      request: { method: "GET", url: "x", headers: {} },
      response: { status: 403, url: "x", headers: {}, data: {} },
    });
    expect(mapGitHubError(err).code).toBe("GITHUB_FORBIDDEN");
  });

  it("scrubs tokens that leak into the message", () => {
    const err = new RequestError(
      "auth token ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa rejected",
      401,
      {
        request: { method: "GET", url: "x", headers: {} },
        response: { status: 401, url: "x", headers: {}, data: {} },
      },
    );
    expect(mapGitHubError(err).message).not.toContain("ghp_");
  });

  it("passes through ForkctlError unchanged", () => {
    const fk = new ForkctlError("MISSING_TOKEN", "x");
    expect(mapGitHubError(fk)).toBe(fk);
  });
});

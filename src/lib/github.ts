import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";
import { ForkableError, type ForkableErrorCode } from "./errors.js";

export interface GitHubClientOptions {
  token?: string;
  baseUrl?: string;
  userAgent?: string;
}

/**
 * Build an Octokit instance with token + base URL resolved from options or env.
 * Throws MISSING_TOKEN if no token is available — forkable never makes anonymous calls.
 */
export function buildOctokit(opts: GitHubClientOptions = {}): Octokit {
  const token = opts.token ?? process.env.GITHUB_TOKEN;
  if (!token || token.trim().length === 0) {
    throw new ForkableError("MISSING_TOKEN", "GITHUB_TOKEN is required", {
      hint: "Set GITHUB_TOKEN in env or pass token via the configured MCP server env block.",
    });
  }
  const baseUrl = opts.baseUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com";
  return new Octokit({
    auth: token,
    baseUrl,
    userAgent: opts.userAgent ?? "forkable",
  });
}

/**
 * Map an Octokit RequestError to a structured ForkableError.
 * Token strings, if leaked into the error, are scrubbed.
 */
export function mapGitHubError(err: unknown): ForkableError {
  if (err instanceof ForkableError) return err;
  if (err instanceof RequestError) {
    const code = mapStatus(err.status);
    const message = scrubToken(err.message);
    return new ForkableError(code, message, {
      hint: hintForStatus(err.status),
      details: { status: err.status },
      cause: err,
    });
  }
  if (err instanceof Error) {
    return new ForkableError("GITHUB_UNKNOWN", scrubToken(err.message), { cause: err });
  }
  return new ForkableError("GITHUB_UNKNOWN", "Unknown GitHub error");
}

function mapStatus(status: number): ForkableErrorCode {
  switch (status) {
    case 401:
      return "GITHUB_UNAUTHORIZED";
    case 403:
      return "GITHUB_FORBIDDEN";
    case 404:
      return "GITHUB_NOT_FOUND";
    case 409:
      return "GITHUB_CONFLICT";
    case 422:
      return "GITHUB_VALIDATION";
    case 429:
      return "GITHUB_RATE_LIMITED";
    default:
      return "GITHUB_UNKNOWN";
  }
}

function hintForStatus(status: number): string | undefined {
  switch (status) {
    case 401:
      return "Token rejected. Check that GITHUB_TOKEN is current and has SSO enabled if required.";
    case 403:
      return "Forbidden. Likely missing scopes (repo / workflow / read:org) or hit by org/enterprise policy.";
    case 404:
      return "Not found. Verify the repo reference, or the token may not have access.";
    case 422:
      return "GitHub rejected the request. Check the source/destination owner and that the resource exists.";
    case 429:
      return "Rate limited. Back off and retry; consider authenticated or app token for higher limits.";
    default:
      return undefined;
  }
}

const TOKEN_PATTERN = /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}\b/g;

export function scrubToken(input: string): string {
  return input.replace(TOKEN_PATTERN, "[redacted-token]");
}

/** Parse "owner/repo" into parts. Throws BAD_REPO_REF on malformed input. */
export function parseRepoRef(ref: string): { owner: string; repo: string } {
  const trimmed = ref.trim();
  const match = trimmed.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/);
  if (!match) {
    throw new ForkableError("BAD_REPO_REF", `Invalid repo reference: ${ref}`, {
      hint: 'Expected "owner/repo" with no leading slash, scheme, or whitespace.',
    });
  }
  return { owner: match[1]!, repo: match[2]! };
}

import { Octokit as CoreOctokit } from "@octokit/rest";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { RequestError } from "@octokit/request-error";
import { ForkctlError, type ForkctlErrorCode } from "./errors.js";
import { buildLogger, type Logger } from "./logger.js";

/**
 * Octokit with retry + throttling plugins wired in.
 *
 * - @octokit/plugin-retry: retries 5xx with exponential backoff.
 * - @octokit/plugin-throttling: waits out primary/secondary rate limits,
 *   respecting the `retry-after` header when GitHub gives us one.
 *
 * We pick these plugins specifically because a human running forkctl at
 * fleet scale (`fleet-health`, `batch-sync`) WILL hit rate limits, and when
 * they do the worst possible experience is a silent hang followed by a
 * cryptic 403. Instead we log a readable line, back off, and try again.
 */
// The plugin types target a different nested @octokit/core than the one
// bundled with @octokit/rest. Plugins are runtime-compatible. Cast through
// the plugin-shape expected by CoreOctokit.plugin to unblock typecheck
// without masking real incompatibilities.
type OctokitRestPlugin = Parameters<typeof CoreOctokit.plugin>[0];
const Octokit = CoreOctokit.plugin(
  retry as unknown as OctokitRestPlugin,
  throttling as unknown as OctokitRestPlugin,
);

const RATE_LIMIT_HANDBOOK_URL =
  "https://github.com/mcp-tool-shop-org/forkctl#rate-limits";

export interface GitHubClientOptions {
  token?: string;
  baseUrl?: string;
  userAgent?: string;
  /** Optional logger; defaults to the env-configured one. */
  logger?: Logger;
  /** Max retries for transient failures. Default 3. */
  maxRetries?: number;
}

/**
 * Build an Octokit instance with token + base URL resolved from options or env.
 * Throws MISSING_TOKEN if no token is available — forkctl never makes anonymous calls.
 */
export function buildOctokit(opts: GitHubClientOptions = {}): CoreOctokit {
  const token = opts.token ?? process.env.GITHUB_TOKEN;
  if (!token || token.trim().length === 0) {
    throw new ForkctlError("MISSING_TOKEN", "GITHUB_TOKEN is required", {
      hint: "Set GITHUB_TOKEN in env or pass token via the configured MCP server env block.",
    });
  }
  const baseUrl = opts.baseUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com";
  const log = opts.logger ?? buildLogger({ defaultLevel: "info" });
  const maxRetries = opts.maxRetries ?? 3;

  return new Octokit({
    auth: token,
    baseUrl,
    userAgent: opts.userAgent ?? "forkctl",
    retry: {
      // Exponential backoff on 5xx. 429 is handled by the throttle plugin.
      doNotRetry: ["400", "401", "403", "404", "422"],
      retries: maxRetries,
    },
    throttle: {
      onRateLimit: (retryAfter: number, options: { method?: string; url?: string; request?: { retryCount?: number } }, _octokit: unknown, retryCount: number) => {
        const attempt = retryCount + 1;
        if (retryCount < maxRetries) {
          log.warn(
            `GitHub is rate-limiting this token; backing off ${retryAfter}s before retry ${attempt}/${maxRetries}`,
            {
              method: options.method,
              url: options.url,
              retry_after_s: retryAfter,
              retry_count: attempt,
              max_retries: maxRetries,
              kind: "primary_rate_limit",
            },
          );
          return true;
        }
        log.error(
          `GitHub rate limit exceeded after ${maxRetries} retries. Giving up.`,
          {
            method: options.method,
            url: options.url,
            retry_after_s: retryAfter,
            max_retries: maxRetries,
            kind: "primary_rate_limit",
          },
        );
        return false;
      },
      onSecondaryRateLimit: (retryAfter: number, options: { method?: string; url?: string }, _octokit: unknown, retryCount: number) => {
        const attempt = retryCount + 1;
        if (retryCount < maxRetries) {
          log.warn(
            `GitHub secondary rate limit hit; backing off ${retryAfter}s before retry ${attempt}/${maxRetries}. This usually means too many requests in a short window.`,
            {
              method: options.method,
              url: options.url,
              retry_after_s: retryAfter,
              retry_count: attempt,
              max_retries: maxRetries,
              kind: "secondary_rate_limit",
            },
          );
          return true;
        }
        log.error(
          `GitHub secondary rate limit exceeded after ${maxRetries} retries. Giving up.`,
          {
            method: options.method,
            url: options.url,
            retry_after_s: retryAfter,
            max_retries: maxRetries,
            kind: "secondary_rate_limit",
          },
        );
        return false;
      },
    },
  });
}

/**
 * Map an Octokit RequestError to a structured ForkctlError.
 * Token strings, if leaked into the error, are scrubbed.
 */
export function mapGitHubError(err: unknown): ForkctlError {
  if (err instanceof ForkctlError) return err;
  if (err instanceof RequestError) {
    const code = mapStatus(err.status);
    const message = scrubToken(err.message);
    // Secondary rate-limit comes back as 403 with a distinctive message body.
    // Surface a specific rate-limit hint so the user doesn't mistake it for a
    // scopes/permissions problem.
    const isRateLimit =
      err.status === 429 ||
      (err.status === 403 && /rate limit|secondary rate|abuse/i.test(err.message));
    const retryAfterHeader = readRetryAfter(err);
    const hint = isRateLimit
      ? rateLimitHint(retryAfterHeader)
      : hintForStatus(err.status);
    const details: Record<string, unknown> = { status: err.status };
    if (retryAfterHeader !== undefined) details.retryAfterSeconds = retryAfterHeader;
    return new ForkctlError(isRateLimit ? "GITHUB_RATE_LIMITED" : code, message, {
      hint,
      details,
      cause: err,
    });
  }
  if (err instanceof Error) {
    return new ForkctlError("GITHUB_UNKNOWN", scrubToken(err.message), { cause: err });
  }
  return new ForkctlError("GITHUB_UNKNOWN", "Unknown GitHub error");
}

function readRetryAfter(err: RequestError): number | undefined {
  const headers = (err.response?.headers ?? {}) as Record<string, string | number | undefined>;
  const raw = headers["retry-after"];
  if (raw === undefined) return undefined;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : undefined;
}

function rateLimitHint(retryAfter: number | undefined): string {
  const waitClause = retryAfter
    ? `Wait ${retryAfter} seconds`
    : "Wait a minute";
  return `You've hit GitHub's rate limit. ${waitClause}, or use a different token with higher limits (an app token or one from a different account). See ${RATE_LIMIT_HANDBOOK_URL}`;
}

function mapStatus(status: number): ForkctlErrorCode {
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

/**
 * Parse "owner/repo" (or the GitHub API's `full_name` form, which is the same
 * shape) into parts. Throws BAD_REPO_REF on malformed input with a message
 * that names the offending value and what we expected instead — so a user
 * staring at a wall of fleet-health output can see which fork entry is bad.
 *
 * Accepts:
 *   - "owner/repo" (canonical CLI/MCP input)
 *   - "owner/repo" from GitHub's `full_name` field (identical shape)
 *
 * Rejects:
 *   - empty strings, leading slashes, URLs ("https://github.com/..."),
 *     whitespace-containing strings, nested paths ("owner/repo/sub")
 */
export function parseRepoRef(ref: string, context?: { field?: string; hint?: string }): { owner: string; repo: string } {
  if (typeof ref !== "string" || ref.length === 0) {
    throw new ForkctlError(
      "BAD_REPO_REF",
      `Invalid repo reference: <empty>${context?.field ? ` (field: ${context.field})` : ""}`,
      {
        hint:
          context?.hint ??
          'Expected a non-empty "owner/repo" string (e.g. "torvalds/linux").',
      },
    );
  }
  const trimmed = ref.trim();
  const match = trimmed.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/);
  if (!match) {
    throw new ForkctlError(
      "BAD_REPO_REF",
      `Invalid repo reference: "${ref}"${context?.field ? ` (field: ${context.field})` : ""}`,
      {
        hint:
          context?.hint ??
          'Expected "owner/repo" with no leading slash, scheme, or whitespace (e.g. "torvalds/linux").',
        details: { value: ref, ...(context?.field ? { field: context.field } : {}) },
      },
    );
  }
  return { owner: match[1]!, repo: match[2]! };
}

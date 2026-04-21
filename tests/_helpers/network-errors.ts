import { RequestError } from "@octokit/request-error";

/**
 * Helpers that produce the raw transport-layer failures Octokit surfaces
 * when the network misbehaves. Used to pin behavior through mapGitHubError
 * so a user who hits a flaky connection sees a structured ForkctlError —
 * not a cryptic "ECONNRESET" stack.
 *
 * Shape philosophy: the tests assert on the *user-visible outcome*
 * (ForkctlError.code, hint substring) rather than "Octokit got thrown
 * an instance of SystemError with errno -104". If the backend later swaps
 * one error class for another, these helpers are the one place to update.
 */

interface NodeSystemError extends Error {
  code: string;
  errno?: number;
  syscall?: string;
}

export function econnresetError(): NodeSystemError {
  const e = new Error("socket hang up") as NodeSystemError;
  e.code = "ECONNRESET";
  e.syscall = "read";
  return e;
}

export function etimedoutError(): NodeSystemError {
  const e = new Error("connect ETIMEDOUT 140.82.121.5:443") as NodeSystemError;
  e.code = "ETIMEDOUT";
  e.syscall = "connect";
  return e;
}

export function abortError(): Error {
  const e = new Error("The operation was aborted");
  e.name = "AbortError";
  return e;
}

export function enotfoundError(): NodeSystemError {
  const e = new Error("getaddrinfo ENOTFOUND api.github.com") as NodeSystemError;
  e.code = "ENOTFOUND";
  e.syscall = "getaddrinfo";
  return e;
}

/**
 * Build a 403 RequestError that carries the `x-ratelimit-remaining: 0` header
 * GitHub sends when a client has exhausted its primary rate limit. Octokit
 * surfaces this as a 403 — NOT a 429 — so the mapping layer has to key off
 * the header, not the status code.
 *
 * (We also expose a true-429 variant for secondary rate limits and abuse
 * detection, since GitHub has used both over the product's lifetime.)
 */
export function rateLimitedError(
  opts: { status?: 403 | 429; resetAt?: number } = {},
): RequestError {
  const status = opts.status ?? 403;
  const resetAt = opts.resetAt ?? Math.floor(Date.now() / 1000) + 60;
  return new RequestError("API rate limit exceeded", status, {
    request: { method: "GET", url: "https://api.github.com/x", headers: {} },
    response: {
      status,
      url: "https://api.github.com/x",
      headers: {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(resetAt),
        "x-ratelimit-limit": "5000",
      },
      data: {
        message: "API rate limit exceeded for installation ID 12345.",
      },
    },
  });
}

/**
 * Pretend Octokit threw a raw Node system error — what actually happens when
 * the socket dies before GitHub answers. If/when the backend adds a
 * NETWORK_ERROR code or a richer mapping, the assertions at call sites will
 * light up and point us to the right adjustment.
 */
export function netError(kind: "reset" | "timeout" | "abort" | "notfound"): Error {
  switch (kind) {
    case "reset":
      return econnresetError();
    case "timeout":
      return etimedoutError();
    case "abort":
      return abortError();
    case "notfound":
      return enotfoundError();
  }
}

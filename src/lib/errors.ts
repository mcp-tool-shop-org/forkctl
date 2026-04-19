/**
 * Structured errors for forkable.
 *
 * Every tool returns either { ok: true, data } or { ok: false, error: ForkableErrorPayload }.
 * Stack traces are never surfaced to end users — see toUserPayload().
 */

export type ForkableErrorCode =
  // Input / validation
  | "INVALID_INPUT"
  | "MISSING_TOKEN"
  | "BAD_REPO_REF"
  // GitHub API
  | "GITHUB_NOT_FOUND"
  | "GITHUB_FORBIDDEN"
  | "GITHUB_UNAUTHORIZED"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_CONFLICT"
  | "GITHUB_VALIDATION"
  | "GITHUB_UNKNOWN"
  // Policy
  | "FORK_POLICY_BLOCKED"
  | "TEMPLATE_NOT_AVAILABLE"
  // Operations
  | "OPERATION_NOT_FOUND"
  | "OPERATION_TIMEOUT"
  | "OPERATION_FAILED"
  // Sync
  | "SYNC_CONFLICT"
  | "SYNC_DIVERGED"
  // Generic
  | "INTERNAL"
  | "NOT_IMPLEMENTED";

export interface ForkableErrorPayload {
  code: ForkableErrorCode;
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
}

export class ForkableError extends Error {
  readonly code: ForkableErrorCode;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ForkableErrorCode,
    message: string,
    options: { hint?: string; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ForkableError";
    this.code = code;
    if (options.hint !== undefined) this.hint = options.hint;
    if (options.details !== undefined) this.details = options.details;
  }

  toUserPayload(): ForkableErrorPayload {
    const payload: ForkableErrorPayload = {
      code: this.code,
      message: this.message,
    };
    if (this.hint !== undefined) payload.hint = this.hint;
    if (this.details !== undefined) payload.details = this.details;
    return payload;
  }
}

/** Coerces any thrown value into a ForkableError without leaking stack traces. */
export function asForkableError(err: unknown): ForkableError {
  if (err instanceof ForkableError) return err;
  if (err instanceof Error) {
    return new ForkableError("INTERNAL", err.message, { cause: err });
  }
  return new ForkableError("INTERNAL", "Unknown error");
}

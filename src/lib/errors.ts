/**
 * Structured errors for forkctl.
 *
 * Every tool returns either { ok: true, data } or { ok: false, error: ForkctlErrorPayload }.
 * Stack traces are never surfaced to end users — see toUserPayload().
 */

export type ForkctlErrorCode =
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
  | "SYNC_BRANCH_EXISTS"
  // Make-forkctl
  | "MAKE_FORKABLE_BRANCH_EXISTS"
  // Rename (Layer 7)
  | "RENAME_INVALID_NAME"
  | "RENAME_NOT_A_REPO"
  | "RENAME_SNAPSHOT_FAILED"
  | "RENAME_APPLY_FAILED"
  | "RENAME_ROLLBACK_NOT_FOUND"
  | "RENAME_PLAN_STALE"
  | "RENAME_LOCKFILE_REGEN_FAILED"
  | "RENAME_DEEP_TS_FAILED"
  | "RENAME_LANG_UNAVAILABLE"
  | "STRING_LITERAL_REWRITTEN"
  | "ENV_REQUIRES_REVIEW"
  // Generic
  | "INTERNAL"
  | "NOT_IMPLEMENTED";

export interface ForkctlErrorPayload {
  code: ForkctlErrorCode;
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
}

export class ForkctlError extends Error {
  readonly code: ForkctlErrorCode;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ForkctlErrorCode,
    message: string,
    options: { hint?: string; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ForkctlError";
    this.code = code;
    if (options.hint !== undefined) this.hint = options.hint;
    if (options.details !== undefined) this.details = options.details;
  }

  toUserPayload(): ForkctlErrorPayload {
    const payload: ForkctlErrorPayload = {
      code: this.code,
      message: this.message,
    };
    if (this.hint !== undefined) payload.hint = this.hint;
    if (this.details !== undefined) payload.details = this.details;
    return payload;
  }
}

/**
 * Patterns for secrets/tokens that must never leak into user-visible error
 * payloads. Kept here (not imported from github.ts) to avoid a circular import;
 * the same TOKEN_PATTERN is mirrored in github.ts's scrubToken() and both stay
 * in sync.
 */
const REDACTION_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_)
  { pattern: /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}\b/g, replacement: "[redacted-token]" },
  // Bearer/authorization headers that may have been echoed back in error text
  { pattern: /\b[Bb]earer\s+[A-Za-z0-9._\-]+/g, replacement: "Bearer [redacted-token]" },
  // OpenAI keys
  { pattern: /\bsk-(proj-)?[A-Za-z0-9_\-]{20,}\b/g, replacement: "[redacted-key]" },
  // AWS access keys
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "[redacted-key]" },
  // Google API keys
  { pattern: /\bAIza[0-9A-Za-z_\-]{35}\b/g, replacement: "[redacted-key]" },
];

/**
 * Strip tokens/secrets that may appear in raw error messages before they
 * reach a user-visible ForkctlError payload.
 */
export function redact(input: string): string {
  let out = input;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Coerces any thrown value into a ForkctlError without leaking stack traces. */
export function asForkctlError(err: unknown): ForkctlError {
  if (err instanceof ForkctlError) return err;
  if (err instanceof Error) {
    return new ForkctlError("INTERNAL", redact(err.message), { cause: err });
  }
  return new ForkctlError("INTERNAL", "Unknown error");
}

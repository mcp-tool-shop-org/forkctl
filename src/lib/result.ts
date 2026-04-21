import type { ForkctlError, ForkctlErrorPayload } from "./errors.js";
import { asForkctlError } from "./errors.js";

/**
 * Discriminated tool result. Every public tool returns this shape.
 *
 * The MCP layer maps `ok: false` to `{ isError: true, content: [...] }` per spec.
 * The CLI layer maps it to non-zero exit + JSON-on-stderr.
 */
export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ForkctlErrorPayload };

export function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

export function fail(error: ForkctlError | ForkctlErrorPayload): ToolResult<never> {
  if ("toUserPayload" in error) return { ok: false, error: error.toUserPayload() };
  return { ok: false, error };
}

/** Wrap any sync or async function so thrown errors become structured failures. */
export async function safe<T>(fn: () => Promise<T> | T): Promise<ToolResult<T>> {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(asForkctlError(err));
  }
}

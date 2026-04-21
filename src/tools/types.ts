import type { Octokit } from "@octokit/rest";
import type { ZodType, ZodTypeDef } from "zod";
import type { ToolResult } from "../lib/result.js";
import type { Operations } from "../lib/operations.js";
import type { Database as DatabaseT } from "better-sqlite3";

/**
 * Context passed into every tool handler.
 *
 * Tools are pure consumers of this context — they never read process.env or
 * touch global state. This keeps tools trivially mockable in tests.
 */
export interface ToolContext {
  octokit: Octokit;
  db: DatabaseT;
  operations: Operations;
  /** Optional clock injection for tests. Defaults to Date.now. */
  now?: () => number;
}

/**
 * Stable descriptor consumed by both the MCP server registration and the CLI dispatcher.
 *
 * - `name` is the wire-level tool name (snake_case, prefixed with `forkctl_`)
 * - `inputSchema` is the Zod schema; runtime-validated on every call
 * - `handler` returns a `ToolResult<TOutput>` — never throws to its caller
 */
export interface ToolDescriptor<TInput, TOutput> {
  name: string;
  description: string;
  /** Schema may apply defaults — output type is `TInput` (post-default), wire input may be wider. */
  inputSchema: ZodType<TInput, ZodTypeDef, unknown>;
  handler: (input: TInput, ctx: ToolContext) => Promise<ToolResult<TOutput>>;
}

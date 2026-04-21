import { randomUUID } from "node:crypto";
import { redact } from "./errors.js";

/**
 * Minimal structured logger for forkctl.
 *
 * Ground rules:
 *   - JSON-line output to stderr. stdout is reserved for MCP stdio transport;
 *     logging to stdout would corrupt the MCP protocol. Even the CLI uses
 *     stderr so human-facing tool output on stdout stays machine-parseable.
 *   - Every log value is passed through redact() before serialization so a
 *     GitHub token, OpenAI key, AWS key, etc. can never reach a user's terminal
 *     via a log line.
 *   - Env-controlled via FORKCTL_LOG = debug | info | warn | error | off.
 *     Default depends on the surface: CLI defaults to info (users want to see
 *     what's happening); the MCP server defaults to warn (hosts want quiet
 *     unless something's wrong).
 *
 * Fields written on every line: ts (ISO-8601), level, msg.
 * Contextual fields when applicable: tool, operation_id, correlation_id,
 * duration_ms, plus any caller-supplied structured fields.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "off";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  off: 100,
};

export interface LogFields {
  tool?: string;
  operation_id?: string;
  correlation_id?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

export interface Logger {
  readonly level: LogLevel;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Return a child logger that merges these fields into every line. */
  child(fields: LogFields): Logger;
}

function parseLevel(raw: string | undefined, fallback: LogLevel): LogLevel {
  if (!raw) return fallback;
  const lower = raw.trim().toLowerCase();
  if (lower === "debug" || lower === "info" || lower === "warn" || lower === "error" || lower === "off") {
    return lower;
  }
  return fallback;
}

/**
 * Recursively redact any string values in the log payload. This is the
 * belt-and-suspenders guarantee that a credential pasted into an error
 * message or request body never hits the user's stderr.
 */
function redactDeep(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redact(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message) };
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactDeep(v, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value as object)) return "[circular]";
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v, seen);
    }
    return out;
  }
  return String(value);
}

class StderrLogger implements Logger {
  readonly level: LogLevel;
  private readonly baseFields: LogFields;

  constructor(level: LogLevel, baseFields: LogFields = {}) {
    this.level = level;
    this.baseFields = baseFields;
  }

  private shouldLog(lvl: LogLevel): boolean {
    return LEVEL_RANK[lvl] >= LEVEL_RANK[this.level];
  }

  private emit(lvl: Exclude<LogLevel, "off">, msg: string, fields?: LogFields): void {
    if (!this.shouldLog(lvl)) return;
    const merged: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: lvl,
      msg: redact(msg),
      ...redactDeep({ ...this.baseFields, ...(fields ?? {}) }) as Record<string, unknown>,
    };
    try {
      process.stderr.write(JSON.stringify(merged) + "\n");
    } catch {
      // Never let logging throw — if stderr is closed we silently drop.
    }
  }

  debug(msg: string, fields?: LogFields): void {
    this.emit("debug", msg, fields);
  }
  info(msg: string, fields?: LogFields): void {
    this.emit("info", msg, fields);
  }
  warn(msg: string, fields?: LogFields): void {
    this.emit("warn", msg, fields);
  }
  error(msg: string, fields?: LogFields): void {
    this.emit("error", msg, fields);
  }
  child(fields: LogFields): Logger {
    return new StderrLogger(this.level, { ...this.baseFields, ...fields });
  }
}

/** No-op logger used when FORKCTL_LOG=off. */
class NullLogger implements Logger {
  readonly level: LogLevel = "off";
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  child(): Logger {
    return this;
  }
}

/**
 * Build a logger honoring FORKCTL_LOG env. Pass the default level you want
 * when the env var is unset — "info" for CLI, "warn" for the MCP server.
 */
export function buildLogger(opts: {
  defaultLevel: LogLevel;
  env?: NodeJS.ProcessEnv;
  baseFields?: LogFields;
} = { defaultLevel: "info" }): Logger {
  const env = opts.env ?? process.env;
  const level = parseLevel(env.FORKCTL_LOG, opts.defaultLevel);
  if (level === "off") return new NullLogger();
  return new StderrLogger(level, opts.baseFields ?? {});
}

/** Generate a short correlation id for a single tool call. */
export function newCorrelationId(): string {
  return randomUUID().slice(0, 8);
}

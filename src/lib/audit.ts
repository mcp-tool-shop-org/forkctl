import type { Database as DatabaseT } from "better-sqlite3";

/**
 * Append-only audit log for every tool invocation.
 *
 * Recorded at the dispatch boundary (MCP server, CLI). Individual tool
 * handlers do not call into this — keeping audit a pure cross-cutting concern.
 */

export interface AuditEntry {
  id: number;
  ts: number;
  tool: string;
  input: unknown;
  ok: boolean;
  result: unknown;
  operationId: string | null;
}

interface AuditRow {
  id: number;
  ts: number;
  tool: string;
  input_json: string;
  ok: number;
  result_json: string | null;
  operation_id: string | null;
}

export class AuditLog {
  constructor(private readonly db: DatabaseT) {}

  record(input: {
    tool: string;
    input: unknown;
    ok: boolean;
    result: unknown;
    operationId?: string | null;
    now?: number;
  }): AuditEntry {
    const ts = input.now ?? Date.now();
    const info = this.db
      .prepare(
        `INSERT INTO audit_log (ts, tool, input_json, ok, result_json, operation_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ts,
        input.tool,
        JSON.stringify(redactInput(input.input)),
        input.ok ? 1 : 0,
        input.result === null || input.result === undefined ? null : JSON.stringify(input.result),
        input.operationId ?? null,
      );
    return {
      id: Number(info.lastInsertRowid),
      ts,
      tool: input.tool,
      input: redactInput(input.input),
      ok: input.ok,
      result: input.result ?? null,
      operationId: input.operationId ?? null,
    };
  }

  query(filter: {
    tool?: string;
    operationId?: string;
    ok?: boolean;
    sinceMs?: number;
    limit?: number;
  }): AuditEntry[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.tool) {
      where.push("tool = ?");
      params.push(filter.tool);
    }
    if (filter.operationId) {
      where.push("operation_id = ?");
      params.push(filter.operationId);
    }
    if (filter.ok !== undefined) {
      where.push("ok = ?");
      params.push(filter.ok ? 1 : 0);
    }
    if (filter.sinceMs !== undefined) {
      where.push("ts >= ?");
      params.push(filter.sinceMs);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 1000);
    const rows = this.db
      .prepare(`SELECT * FROM audit_log ${whereSql} ORDER BY ts DESC LIMIT ?`)
      .all(...params, limit) as AuditRow[];
    return rows.map(rowToEntry);
  }

  byOperation(operationId: string): AuditEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM audit_log WHERE operation_id = ? ORDER BY ts ASC")
      .all(operationId) as AuditRow[];
    return rows.map(rowToEntry);
  }
}

function rowToEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    ts: row.ts,
    tool: row.tool,
    input: JSON.parse(row.input_json),
    ok: row.ok === 1,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    operationId: row.operation_id,
  };
}

const SENSITIVE_KEYS = new Set(["token", "GITHUB_TOKEN", "password", "secret", "apiKey", "api_key"]);
const TOKEN_PATTERN = /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}\b/g;

function redactInput(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return input.replace(TOKEN_PATTERN, "[redacted]");
  if (Array.isArray(input)) return input.map(redactInput);
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = SENSITIVE_KEYS.has(k) ? "[redacted]" : redactInput(v);
    }
    return out;
  }
  return input;
}

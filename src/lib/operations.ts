import { randomUUID } from "node:crypto";
import type { Database as DatabaseT } from "better-sqlite3";
import { ForkctlError } from "./errors.js";

/**
 * Async operation tracking. Fork creation can take up to 5 minutes per GitHub docs;
 * template generation is faster but still async. Every long-running create returns
 * an operation_id that callers poll via forkctl_check_operation.
 */

export type OperationKind = "create_fork" | "create_from_template" | "batch_sync";
export type OperationStatus = "pending" | "succeeded" | "failed" | "timed_out";

export interface OperationRecord {
  id: string;
  kind: OperationKind;
  status: OperationStatus;
  source: string | null;
  destination: string | null;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  result: unknown;
  error: { code: string; message: string; hint?: string } | null;
}

interface OperationRow {
  id: string;
  kind: string;
  status: string;
  source: string | null;
  destination: string | null;
  started_at: number;
  updated_at: number;
  completed_at: number | null;
  result_json: string | null;
  error_json: string | null;
}

function rowToRecord(row: OperationRow): OperationRecord {
  return {
    id: row.id,
    kind: row.kind as OperationKind,
    status: row.status as OperationStatus,
    source: row.source,
    destination: row.destination,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error_json ? JSON.parse(row.error_json) : null,
  };
}

export class Operations {
  constructor(private readonly db: DatabaseT) {}

  create(input: {
    kind: OperationKind;
    source?: string;
    destination?: string;
    id?: string;
    now?: number;
  }): OperationRecord {
    const id = input.id ?? randomUUID();
    const now = input.now ?? Date.now();
    this.db
      .prepare(
        `INSERT INTO operations (id, kind, status, source, destination, started_at, updated_at)
         VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
      )
      .run(id, input.kind, input.source ?? null, input.destination ?? null, now, now);
    const row = this.get(id);
    if (!row) throw new ForkctlError("INTERNAL", `Operation ${id} vanished after insert`);
    return row;
  }

  get(id: string): OperationRecord | null {
    const row = this.db.prepare("SELECT * FROM operations WHERE id = ?").get(id) as
      | OperationRow
      | undefined;
    return row ? rowToRecord(row) : null;
  }

  succeed(id: string, result: unknown, now: number = Date.now()): OperationRecord {
    this.db
      .prepare(
        `UPDATE operations
         SET status = 'succeeded', result_json = ?, error_json = NULL,
             completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(result ?? null), now, now, id);
    return this.requireGet(id);
  }

  fail(
    id: string,
    error: { code: string; message: string; hint?: string },
    now: number = Date.now(),
  ): OperationRecord {
    this.db
      .prepare(
        `UPDATE operations
         SET status = 'failed', error_json = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(error), now, now, id);
    return this.requireGet(id);
  }

  timeout(id: string, now: number = Date.now()): OperationRecord {
    this.db
      .prepare(
        `UPDATE operations
         SET status = 'timed_out', completed_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(now, now, id);
    return this.requireGet(id);
  }

  listPending(): OperationRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM operations WHERE status = 'pending' ORDER BY started_at")
      .all() as OperationRow[];
    return rows.map(rowToRecord);
  }

  recent(limit: number = 50): OperationRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM operations ORDER BY started_at DESC LIMIT ?")
      .all(limit) as OperationRow[];
    return rows.map(rowToRecord);
  }

  private requireGet(id: string): OperationRecord {
    const rec = this.get(id);
    if (!rec) throw new ForkctlError("OPERATION_NOT_FOUND", `Operation ${id} not found`);
    return rec;
  }
}

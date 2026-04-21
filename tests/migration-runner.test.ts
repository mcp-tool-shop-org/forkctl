import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openState, CURRENT_SCHEMA_VERSION } from "../src/lib/state.js";

/**
 * Migration runner coverage.
 *
 * Stage C backend work adds a migration runner so a DB opened at an older
 * schema_version gets its structural changes applied silently on open. Until
 * the runner ships we can still pin the invariant: after `openState`, the
 * schema_version row reads back CURRENT_SCHEMA_VERSION and re-opening the
 * same file doesn't double-insert or reset any data.
 *
 * When the real migration runner lands, the "schema_version starts at 0"
 * test below should flip from "openState leaves it alone" to "openState
 * promotes it to CURRENT_SCHEMA_VERSION" — that change is the behavioral
 * pin the backend fix needs.
 */

const tmpDirsToCleanup: string[] = [];
afterEach(() => {
  while (tmpDirsToCleanup.length > 0) {
    const dir = tmpDirsToCleanup.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function mkTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "forkctl-migrate-"));
  tmpDirsToCleanup.push(dir);
  return join(dir, "state.db");
}

describe("migration runner", () => {
  it("openState on a fresh DB writes schema_version = CURRENT_SCHEMA_VERSION", () => {
    const path = mkTmp();
    const db = openState(path);
    const row = db.prepare("SELECT version FROM schema_version").get() as { version: number };
    expect(row.version).toBe(CURRENT_SCHEMA_VERSION);
    db.close();
  });

  it("openState is idempotent — second open reads the existing version, no extra row, no data loss", () => {
    const path = mkTmp();
    const db1 = openState(path);

    // Write an audit row so we can verify openState does NOT wipe anything.
    db1
      .prepare("INSERT INTO audit_log (ts, tool, input_json, ok) VALUES (?, ?, ?, ?)")
      .run(Date.now(), "forkctl_assess", "{}", 1);
    db1.close();

    const db2 = openState(path);
    const countVersion = db2.prepare("SELECT COUNT(*) as c FROM schema_version").get() as { c: number };
    const countAudit = db2.prepare("SELECT COUNT(*) as c FROM audit_log").get() as { c: number };
    expect(countVersion.c).toBe(1);
    expect(countAudit.c).toBe(1);
    db2.close();
  });

  it("openState on a DB that has the tables but no schema_version row backfills the version", () => {
    // Simulates the "legacy DB" case: a caller bypassed openState and ran the
    // schema DDL by hand, leaving schema_version empty. The migration runner
    // must treat this as version-0 and backfill to current.
    const path = mkTmp();
    const raw = new Database(path);
    raw.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      CREATE TABLE operations (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
        source TEXT, destination TEXT,
        started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        completed_at INTEGER, result_json TEXT, error_json TEXT
      );
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL,
        tool TEXT NOT NULL, input_json TEXT NOT NULL, ok INTEGER NOT NULL,
        result_json TEXT, operation_id TEXT
      );
    `);
    // Intentionally DO NOT insert into schema_version.
    raw.close();

    const db = openState(path);
    const row = db.prepare("SELECT version FROM schema_version").get() as { version: number } | undefined;
    expect(row?.version).toBe(CURRENT_SCHEMA_VERSION);
    db.close();
  });

  it("second openState after the legacy-backfill path is stable (no duplicate version rows)", () => {
    const path = mkTmp();
    const raw = new Database(path);
    raw.exec("CREATE TABLE schema_version (version INTEGER PRIMARY KEY);");
    raw.close();

    openState(path).close();
    const db2 = openState(path);
    const count = db2.prepare("SELECT COUNT(*) as c FROM schema_version").get() as { c: number };
    expect(count.c).toBe(1);
    db2.close();
  });
});

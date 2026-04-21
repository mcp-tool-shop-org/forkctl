import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database, { type Database as DatabaseT } from "better-sqlite3";
import envPaths from "env-paths";
import { ForkctlError } from "./errors.js";

/**
 * Resolves the path to the forkctl state DB.
 *
 * Order: FORKCTL_STATE_DIR env var > OS user-state dir from env-paths.
 * The DB filename is fixed at "forkctl-state.db".
 */
export function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.FORKCTL_STATE_DIR;
  if (override && override.trim().length > 0) return override;
  return envPaths("forkctl", { suffix: "" }).data;
}

export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveStateDir(env), "forkctl-state.db");
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT,
  destination TEXT,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  result_json TEXT,
  error_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
CREATE INDEX IF NOT EXISTS idx_operations_started ON operations(started_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  tool TEXT NOT NULL,
  input_json TEXT NOT NULL,
  ok INTEGER NOT NULL,
  result_json TEXT,
  operation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_tool ON audit_log(tool);
CREATE INDEX IF NOT EXISTS idx_audit_op ON audit_log(operation_id);
`;

const CURRENT_SCHEMA_VERSION = 1;

/**
 * A migration takes a DB at version N-1 and leaves it at version N.
 * Migrations run inside a single sqlite transaction — if one throws, the
 * whole transaction rolls back and the DB stays at the previous version.
 * That keeps a half-migrated DB from becoming a silent footgun six months
 * later when a future boot can't figure out what to do with it.
 */
export type Migration = (db: DatabaseT) => void;

/**
 * Migration registry. One entry per schema version, keyed by the target
 * version (the version the DB is AT after the migration runs).
 *
 * v1 (1.0.0 ship): no-op. The schema is bootstrapped by SCHEMA_SQL so a fresh
 * DB already lands at v1. This entry exists to establish the upgrade pattern
 * — when v2 ships, add `2: (db) => { db.exec(... ALTER TABLE ...) }` and the
 * runner picks it up automatically.
 */
export const MIGRATIONS: Record<number, Migration> = {
  1: (_db: DatabaseT) => {
    // No-op. Schema is bootstrapped by SCHEMA_SQL.
  },
};

/**
 * Read the current schema version from the DB, defaulting to 0 (fresh DB).
 * A DB where schema_version has no row is treated as pre-migration; the
 * runner will walk it up to CURRENT_SCHEMA_VERSION.
 */
export function readSchemaVersion(db: DatabaseT): number {
  const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;
  return row?.version ?? 0;
}

/**
 * Apply migrations in order from `fromVersion` to `toVersion`.
 *
 * Each version transition runs inside its own transaction so we never leave
 * the DB in a half-migrated state. On failure we surface a ForkctlError
 * naming the exact version that blew up so the user can find the fix.
 */
export function runMigrations(
  db: DatabaseT,
  fromVersion: number,
  toVersion: number,
): void {
  if (fromVersion === toVersion) return;
  if (fromVersion > toVersion) {
    throw new ForkctlError(
      "INTERNAL",
      `State DB is at schema v${fromVersion} but this forkctl build only knows up to v${toVersion}. You likely ran a newer forkctl against this state dir and are now running an older one.`,
      {
        hint: "Upgrade forkctl (`npm i -g @mcptoolshop/forkctl`) or point FORKCTL_STATE_DIR at a fresh directory.",
        details: { currentVersion: fromVersion, maxKnownVersion: toVersion },
      },
    );
  }

  for (let v = fromVersion + 1; v <= toVersion; v++) {
    const migration = MIGRATIONS[v];
    if (!migration) {
      throw new ForkctlError(
        "INTERNAL",
        `No migration registered for schema v${v}. The DB is at v${v - 1} and cannot advance.`,
        {
          hint: "This is a forkctl bug — every version between the old and new schema must have a migration entry. File an issue at https://github.com/mcp-tool-shop-org/forkctl/issues.",
          details: { missingVersion: v, fromVersion, toVersion },
        },
      );
    }
    const runOne = db.transaction(() => {
      migration(db);
      // Upsert the version row. We DELETE+INSERT so the table never has
      // more than one row even if someone (or a prior buggy write) leaves
      // a stale one behind.
      db.prepare("DELETE FROM schema_version").run();
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(v);
    });
    try {
      runOne();
    } catch (err) {
      throw new ForkctlError(
        "INTERNAL",
        `Migration to schema v${v} failed: ${err instanceof Error ? err.message : String(err)}. The DB is still at v${v - 1}.`,
        {
          hint: "The transaction rolled back — your state DB is intact at the old version. File an issue with the error message and the migration number.",
          details: { failedVersion: v, stayedAt: v - 1 },
          cause: err,
        },
      );
    }
  }
}

/** Open the state DB, creating directories and applying the schema if needed. */
export function openState(path?: string): DatabaseT {
  const dbPath = path ?? resolveDbPath();
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);

  // Advance the schema to the current version through the migration runner.
  // For v1 this is a no-op; the machinery exists so the first real migration
  // (v2) is a single-line registry addition, not a surgery on this function.
  const current = readSchemaVersion(db);
  const effectiveFrom = current === 0 ? CURRENT_SCHEMA_VERSION - 1 : current;
  // A fresh DB has no schema_version row; SCHEMA_SQL already created the
  // v1 tables, so jump straight to v1 without re-running the v1 no-op by
  // seeding the row when empty.
  if (current === 0) {
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(CURRENT_SCHEMA_VERSION);
  } else {
    runMigrations(db, effectiveFrom, CURRENT_SCHEMA_VERSION);
  }

  return db;
}

export { CURRENT_SCHEMA_VERSION };

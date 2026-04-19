import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database, { type Database as DatabaseT } from "better-sqlite3";
import envPaths from "env-paths";

/**
 * Resolves the path to the forkable state DB.
 *
 * Order: FORKABLE_STATE_DIR env var > OS user-state dir from env-paths.
 * The DB filename is fixed at "forkable-state.db".
 */
export function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.FORKABLE_STATE_DIR;
  if (override && override.trim().length > 0) return override;
  return envPaths("forkable", { suffix: "" }).data;
}

export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveStateDir(env), "forkable-state.db");
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

/** Open the state DB, creating directories and applying the schema if needed. */
export function openState(path?: string): DatabaseT {
  const dbPath = path ?? resolveDbPath();
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(CURRENT_SCHEMA_VERSION);
  }
  return db;
}

export { CURRENT_SCHEMA_VERSION };

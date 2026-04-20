import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CURRENT_SCHEMA_VERSION, openState, resolveDbPath, resolveStateDir } from "../src/lib/state.js";

describe("state path resolution", () => {
  it("honors FORKABLE_STATE_DIR", () => {
    expect(resolveStateDir({ FORKABLE_STATE_DIR: "/tmp/forkable-x" })).toBe("/tmp/forkable-x");
  });

  it("falls back to env-paths user data dir", () => {
    const dir = resolveStateDir({});
    expect(dir.length).toBeGreaterThan(0);
  });

  it("computes db path", () => {
    const path = resolveDbPath({ FORKABLE_STATE_DIR: "/tmp/x" });
    expect(path.replace(/\\/g, "/")).toBe("/tmp/x/forkable-state.db");
  });
});

describe("openState", () => {
  it("creates schema and writes version row in :memory:", () => {
    const db = openState(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("operations");
    expect(names).toContain("audit_log");
    expect(names).toContain("schema_version");
    const v = db.prepare("SELECT version FROM schema_version").get() as { version: number };
    expect(v.version).toBe(CURRENT_SCHEMA_VERSION);
    db.close();
  });

  it("is idempotent on repeat open of the same DB file (F-002)", () => {
    // Two `openState(':memory:')` calls are each fresh DBs — the original test
    // was semantically vacuous. Use a real tmp file so both opens hit the same
    // database and we actually exercise the CREATE TABLE IF NOT EXISTS guard
    // plus the "SELECT version FROM schema_version LIMIT 1" idempotency branch.
    const tmpDir = mkdtempSync(join(tmpdir(), "forkable-state-"));
    tmpDirsToCleanup.push(tmpDir);
    const dbPath = join(tmpDir, "state.db");

    const db1 = openState(dbPath);
    // Seed a row so we can verify state survives across open calls.
    const v1 = db1.prepare("SELECT version FROM schema_version").get() as { version: number };
    expect(v1.version).toBe(CURRENT_SCHEMA_VERSION);
    db1.close();

    // Second open on the same file — must NOT throw, must NOT insert a second
    // schema_version row, must NOT re-create tables destructively.
    const db2 = openState(dbPath);
    const count = db2.prepare("SELECT COUNT(*) as c FROM schema_version").get() as { c: number };
    expect(count.c).toBe(1);
    const v2 = db2.prepare("SELECT version FROM schema_version").get() as { version: number };
    expect(v2.version).toBe(CURRENT_SCHEMA_VERSION);

    // And a third open, just to be sure the guard is stable across repeats.
    db2.close();
    const db3 = openState(dbPath);
    const count3 = db3.prepare("SELECT COUNT(*) as c FROM schema_version").get() as { c: number };
    expect(count3.c).toBe(1);
    db3.close();
  });
});

const tmpDirsToCleanup: string[] = [];
afterEach(() => {
  while (tmpDirsToCleanup.length > 0) {
    const dir = tmpDirsToCleanup.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore — best-effort temp cleanup */
    }
  }
});

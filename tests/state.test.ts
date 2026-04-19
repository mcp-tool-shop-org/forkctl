import { describe, expect, it } from "vitest";
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

  it("is idempotent on repeat open of the same DB file", () => {
    const db1 = openState(":memory:");
    db1.close();
    const db2 = openState(":memory:");
    const v = db2.prepare("SELECT COUNT(*) as c FROM schema_version").get() as { c: number };
    expect(v.c).toBe(1);
    db2.close();
  });
});

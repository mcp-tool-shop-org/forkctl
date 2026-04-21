import { beforeEach, describe, expect, it } from "vitest";
import type { Database as DatabaseT } from "better-sqlite3";
import { AuditLog } from "../src/lib/audit.js";
import { openState } from "../src/lib/state.js";

let db: DatabaseT;
let log: AuditLog;

beforeEach(() => {
  db = openState(":memory:");
  log = new AuditLog(db);
});

describe("AuditLog", () => {
  it("redacts known sensitive keys before persisting", () => {
    log.record({
      tool: "forkctl_assess",
      input: { token: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", repo: "x/y" },
      ok: true,
      result: { score: 80 },
    });
    const entries = log.query({ limit: 10 });
    const stored = entries[0]!.input as { token: string; repo: string };
    expect(stored.token).toBe("[redacted]");
    expect(stored.repo).toBe("x/y");
  });

  it("redacts tokens that appear inside string values", () => {
    log.record({
      tool: "test",
      input: { description: "use ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa here" },
      ok: true,
      result: null,
    });
    const e = log.query({ limit: 10 })[0]!;
    expect(JSON.stringify(e.input)).not.toContain("ghp_");
    expect(JSON.stringify(e.input)).toContain("[redacted]");
  });

  it("filters by tool", () => {
    log.record({ tool: "a", input: {}, ok: true, result: null });
    log.record({ tool: "b", input: {}, ok: false, result: null });
    log.record({ tool: "a", input: {}, ok: true, result: null });
    expect(log.query({ tool: "a", limit: 10 })).toHaveLength(2);
    expect(log.query({ tool: "b", limit: 10 })).toHaveLength(1);
  });

  it("filters by ok flag", () => {
    log.record({ tool: "a", input: {}, ok: true, result: null });
    log.record({ tool: "a", input: {}, ok: false, result: null });
    expect(log.query({ ok: false, limit: 10 })).toHaveLength(1);
  });

  it("filters by sinceMs", () => {
    log.record({ tool: "a", input: {}, ok: true, result: null, now: 100 });
    log.record({ tool: "a", input: {}, ok: true, result: null, now: 200 });
    expect(log.query({ sinceMs: 150, limit: 10 })).toHaveLength(1);
  });

  it("byOperation returns entries in chronological order", () => {
    log.record({ tool: "a", input: {}, ok: true, result: null, operationId: "op1", now: 200 });
    log.record({ tool: "b", input: {}, ok: true, result: null, operationId: "op1", now: 100 });
    const trail = log.byOperation("op1");
    expect(trail.map((e) => e.tool)).toEqual(["b", "a"]);
  });

  it("query returns newest first", () => {
    log.record({ tool: "a", input: {}, ok: true, result: null, now: 100 });
    log.record({ tool: "a", input: {}, ok: true, result: null, now: 200 });
    const entries = log.query({ limit: 10 });
    expect(entries[0]!.ts).toBe(200);
    expect(entries[1]!.ts).toBe(100);
  });
});

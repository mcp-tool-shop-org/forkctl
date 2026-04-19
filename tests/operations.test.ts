import { beforeEach, describe, expect, it } from "vitest";
import type { Database as DatabaseT } from "better-sqlite3";
import { Operations } from "../src/lib/operations.js";
import { openState } from "../src/lib/state.js";

let db: DatabaseT;
let ops: Operations;

beforeEach(() => {
  db = openState(":memory:");
  ops = new Operations(db);
});

describe("Operations", () => {
  it("creates a pending operation with both source and destination", () => {
    const rec = ops.create({
      kind: "create_fork",
      source: "octocat/hello-world",
      destination: "my-org",
    });
    expect(rec.status).toBe("pending");
    expect(rec.kind).toBe("create_fork");
    expect(rec.source).toBe("octocat/hello-world");
    expect(rec.destination).toBe("my-org");
    expect(rec.startedAt).toBeGreaterThan(0);
    expect(rec.completedAt).toBeNull();
  });

  it("marks an operation succeeded with a result payload", () => {
    const rec = ops.create({ kind: "create_fork", source: "a/b" });
    const updated = ops.succeed(rec.id, { repoUrl: "https://github.com/x/b" });
    expect(updated.status).toBe("succeeded");
    expect(updated.result).toEqual({ repoUrl: "https://github.com/x/b" });
    expect(updated.completedAt).not.toBeNull();
    expect(updated.error).toBeNull();
  });

  it("marks an operation failed with structured error", () => {
    const rec = ops.create({ kind: "create_fork", source: "a/b" });
    const updated = ops.fail(rec.id, {
      code: "FORK_POLICY_BLOCKED",
      message: "blocked",
      hint: "ask org owner",
    });
    expect(updated.status).toBe("failed");
    expect(updated.error).toEqual({
      code: "FORK_POLICY_BLOCKED",
      message: "blocked",
      hint: "ask org owner",
    });
  });

  it("times out only pending operations", () => {
    const rec = ops.create({ kind: "create_fork", source: "a/b" });
    ops.succeed(rec.id, { ok: true });
    const after = ops.timeout(rec.id);
    expect(after.status).toBe("succeeded");
  });

  it("listPending excludes completed ops", () => {
    const a = ops.create({ kind: "create_fork", source: "a/b" });
    ops.create({ kind: "create_fork", source: "c/d" });
    ops.succeed(a.id, {});
    const pending = ops.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.source).toBe("c/d");
  });

  it("recent returns newest first", () => {
    const a = ops.create({ kind: "create_fork", source: "a/b", now: 1000 });
    const b = ops.create({ kind: "create_fork", source: "c/d", now: 2000 });
    const recent = ops.recent(10);
    expect(recent.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it("get returns null for unknown id", () => {
    expect(ops.get("nope")).toBeNull();
  });
});

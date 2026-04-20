import { describe, expect, it } from "vitest";
import { TOOLS, findTool } from "../src/tools/registry.js";

describe("tool registry", () => {
  it("has exactly 22 tools (6 layers + rename layer 7)", () => {
    expect(TOOLS).toHaveLength(22);
  });

  it("every tool has a unique, forkable_-prefixed name", () => {
    const names = TOOLS.map((t) => t.name);
    for (const n of names) expect(n.startsWith("forkable_")).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every tool has a non-empty description", () => {
    for (const t of TOOLS) expect(t.description.length).toBeGreaterThan(10);
  });

  it("every tool has an inputSchema", () => {
    for (const t of TOOLS) expect(t.inputSchema).toBeDefined();
  });

  it("findTool returns matching descriptor", () => {
    expect(findTool("forkable_assess")?.name).toBe("forkable_assess");
    expect(findTool("forkable_nonexistent")).toBeUndefined();
  });

  it("covers all six product layers", () => {
    const names = new Set(TOOLS.map((t) => t.name));
    // Assessment
    expect(names.has("forkable_assess")).toBe(true);
    expect(names.has("forkable_choose_path")).toBe(true);
    expect(names.has("forkable_make_forkable")).toBe(true);
    // Execution
    expect(names.has("forkable_preflight_policy")).toBe(true);
    expect(names.has("forkable_create_fork")).toBe(true);
    expect(names.has("forkable_create_from_template")).toBe(true);
    expect(names.has("forkable_check_operation")).toBe(true);
    // Bootstrap
    expect(names.has("forkable_bootstrap")).toBe(true);
    expect(names.has("forkable_configure_upstream")).toBe(true);
    expect(names.has("forkable_scan_drift")).toBe(true);
    expect(names.has("forkable_emit_handoff")).toBe(true);
    // Sync
    expect(names.has("forkable_sync")).toBe(true);
    expect(names.has("forkable_diagnose_divergence")).toBe(true);
    expect(names.has("forkable_propose_sync_pr")).toBe(true);
    // Fleet
    expect(names.has("forkable_list_forks")).toBe(true);
    expect(names.has("forkable_fleet_health")).toBe(true);
    expect(names.has("forkable_batch_sync")).toBe(true);
    // Receipts
    expect(names.has("forkable_receipt")).toBe(true);
    expect(names.has("forkable_audit_log")).toBe(true);
  });
});

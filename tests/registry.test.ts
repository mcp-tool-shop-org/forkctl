import { describe, expect, it } from "vitest";
import { TOOLS, findTool } from "../src/tools/registry.js";

describe("tool registry", () => {
  it("has exactly 22 tools (6 layers + rename layer 7)", () => {
    expect(TOOLS).toHaveLength(22);
  });

  it("every tool has a unique, forkctl_-prefixed name", () => {
    const names = TOOLS.map((t) => t.name);
    for (const n of names) expect(n.startsWith("forkctl_")).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every tool has a non-empty description", () => {
    for (const t of TOOLS) expect(t.description.length).toBeGreaterThan(10);
  });

  it("every tool has an inputSchema", () => {
    for (const t of TOOLS) expect(t.inputSchema).toBeDefined();
  });

  it("findTool returns matching descriptor", () => {
    expect(findTool("forkctl_assess")?.name).toBe("forkctl_assess");
    expect(findTool("forkctl_nonexistent")).toBeUndefined();
  });

  it("covers all six product layers", () => {
    const names = new Set(TOOLS.map((t) => t.name));
    // Assessment
    expect(names.has("forkctl_assess")).toBe(true);
    expect(names.has("forkctl_choose_path")).toBe(true);
    expect(names.has("forkctl_make_forkable")).toBe(true);
    // Execution
    expect(names.has("forkctl_preflight_policy")).toBe(true);
    expect(names.has("forkctl_create_fork")).toBe(true);
    expect(names.has("forkctl_create_from_template")).toBe(true);
    expect(names.has("forkctl_check_operation")).toBe(true);
    // Bootstrap
    expect(names.has("forkctl_bootstrap")).toBe(true);
    expect(names.has("forkctl_configure_upstream")).toBe(true);
    expect(names.has("forkctl_scan_drift")).toBe(true);
    expect(names.has("forkctl_emit_handoff")).toBe(true);
    // Sync
    expect(names.has("forkctl_sync")).toBe(true);
    expect(names.has("forkctl_diagnose_divergence")).toBe(true);
    expect(names.has("forkctl_propose_sync_pr")).toBe(true);
    // Fleet
    expect(names.has("forkctl_list_forks")).toBe(true);
    expect(names.has("forkctl_fleet_health")).toBe(true);
    expect(names.has("forkctl_batch_sync")).toBe(true);
    // Receipts
    expect(names.has("forkctl_receipt")).toBe(true);
    expect(names.has("forkctl_audit_log")).toBe(true);
  });
});

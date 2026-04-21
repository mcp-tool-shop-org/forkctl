import { describe, expect, it } from "vitest";
import {
  RenameApplyInputSchema,
  RenameChangeSchema,
  RenameLayerSchema,
  RenamePlanInputSchema,
  RenamePlanSchema,
  RenameReceiptSchema,
  RenameRollbackInputSchema,
  VariantEntrySchema,
  VariantKeySchema,
} from "../../src/schemas/rename.js";

/**
 * Covers design §2 (input schema) + F1 scaffolding.
 * The schemas are landed — these lock their shape.
 */

describe("RenamePlanInputSchema", () => {
  it("requires path, from, to at minimum", () => {
    const result = RenamePlanInputSchema.safeParse({
      path: "./repo",
      from: "forkable",
      to: "splitshift",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.layers).toEqual(["identity", "symbols", "textual", "post"]);
    expect(result.data.lockfileStrategy).toBe("regenerate");
    expect(result.data.historyRewrite).toBe(false);
    expect(result.data.preserveHistory).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["starts with hyphen", "-forkable"],
    ["contains slash", "forkable/x"],
    ["contains space", "fork able"],
    ["too long", "a".repeat(200)],
  ])("rejects malformed name (%s)", (_label, bad) => {
    const result = RenamePlanInputSchema.safeParse({
      path: "./repo",
      from: bad,
      to: "splitshift",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed `to`", () => {
    const result = RenamePlanInputSchema.safeParse({
      path: "./repo",
      from: "forkable",
      to: "has space",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an explicit layers array", () => {
    const result = RenamePlanInputSchema.safeParse({
      path: "./repo",
      from: "a",
      to: "b",
      layers: ["identity"],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.layers).toEqual(["identity"]);
  });

  it("rejects unknown layer values", () => {
    const result = RenamePlanInputSchema.safeParse({
      path: "./repo",
      from: "a",
      to: "b",
      layers: ["bogus"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid lockfileStrategy values", () => {
    const result = RenamePlanInputSchema.safeParse({
      path: "./repo",
      from: "a",
      to: "b",
      lockfileStrategy: "weird",
    });
    expect(result.success).toBe(false);
  });
});

describe("RenameApplyInputSchema", () => {
  it("requires a plan path", () => {
    const bad = RenameApplyInputSchema.safeParse({ path: "./repo" });
    expect(bad.success).toBe(false);
  });

  it("defaults verify to true", () => {
    const r = RenameApplyInputSchema.safeParse({ path: "./repo", plan: "./plan.json" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.verify).toBe(true);
  });
});

describe("RenameRollbackInputSchema", () => {
  it("requires path; snapshotId optional", () => {
    const r = RenameRollbackInputSchema.safeParse({ path: "./repo" });
    expect(r.success).toBe(true);
    const rb = RenameRollbackInputSchema.safeParse({});
    expect(rb.success).toBe(false);
  });
});

describe("RenameLayerSchema + VariantKeySchema", () => {
  it("enumerates all five passes A-E", () => {
    expect(RenameLayerSchema.options).toEqual([
      "identity",
      "symbols",
      "deep-ts",
      "textual",
      "post",
    ]);
  });

  it("enumerates the 7 variants from design §3", () => {
    expect(new Set(VariantKeySchema.options)).toEqual(
      new Set([
        "kebab-case",
        "snake_case",
        "camelCase",
        "PascalCase",
        "SCREAMING_SNAKE",
        "dot.case",
        "Title Case",
      ]),
    );
  });
});

describe("RenameChangeSchema", () => {
  it("accepts a well-formed change record", () => {
    const r = RenameChangeSchema.safeParse({
      file: "src/index.ts",
      layer: "symbols",
      kind: "identifier",
      line: 12,
      before: "Forkable",
      after: "Splitshift",
    });
    expect(r.success).toBe(true);
  });

  it("line is optional but must be positive when present", () => {
    expect(
      RenameChangeSchema.safeParse({
        file: "x",
        layer: "textual",
        kind: "md-text",
        before: "a",
        after: "b",
      }).success,
    ).toBe(true);
    expect(
      RenameChangeSchema.safeParse({
        file: "x",
        layer: "textual",
        kind: "md-text",
        line: 0,
        before: "a",
        after: "b",
      }).success,
    ).toBe(false);
  });
});

describe("VariantEntrySchema", () => {
  it("defaults enabled to true", () => {
    const r = VariantEntrySchema.safeParse({ from: "forkable", to: "splitshift" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.enabled).toBe(true);
  });
});

describe("RenamePlanSchema — minimal valid plan round-trips", () => {
  it("parses a minimal plan object", () => {
    const r = RenamePlanSchema.safeParse({
      from: "forkable",
      to: "splitshift",
      path: "/tmp/x",
      createdAt: new Date().toISOString(),
      variants: {
        "kebab-case": { from: "forkable", to: "splitshift", enabled: true },
      },
      layers: {},
      excluded: [],
      warnings: [],
      totalFiles: 0,
      selectedLayers: ["identity"],
      lockfileStrategy: "regenerate",
      fingerprint: "abc123",
    });
    expect(r.success).toBe(true);
  });
});

describe("RenameReceiptSchema — minimal valid receipt", () => {
  it("parses a minimal receipt", () => {
    const r = RenameReceiptSchema.safeParse({
      path: "/tmp/x",
      from: "forkable",
      to: "splitshift",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      snapshotId: "snap-1",
      snapshotDir: "/tmp/.forkctl/snapshots/snap-1",
      layersApplied: ["identity"],
      filesChanged: 3,
      perLayer: {},
      warnings: [],
    });
    expect(r.success).toBe(true);
  });
});

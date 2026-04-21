import { describe, expect, it } from "vitest";
import {
  classifyBrandCategory,
  countByBrandCategory,
  filesByBrandCategory,
} from "../../src/lib/rename/categories.js";
import type { RenameChange } from "../../src/schemas/rename.js";

/**
 * Covers design/brand-mode.md §4 — the brand-category classifier that tags
 * each RenameChange with a semantic bucket so the plan diff can report
 * "47 identifiers, 12 env-vars, …".
 */

const mk = (partial: Partial<RenameChange> & Pick<RenameChange, "kind" | "before" | "after">): RenameChange => ({
  file: "src/a.ts",
  layer: "symbols",
  ...partial,
});

describe("classifyBrandCategory", () => {
  it("identifier kind → identifier category", () => {
    expect(classifyBrandCategory(mk({ kind: "TypeScript:identifier", before: "forkable", after: "forkctl" })))
      .toBe("identifier");
  });

  it("SCREAMING_SNAKE identifier → envVar category", () => {
    expect(classifyBrandCategory(mk({ kind: "TypeScript:identifier", before: "FORKABLE_LOG", after: "FORKCTL_LOG" })))
      .toBe("envVar");
  });

  it("identifier ending Error → errorClass category", () => {
    expect(classifyBrandCategory(mk({ kind: "TypeScript:identifier", before: "ForkableError", after: "ForkctlError" })))
      .toBe("errorClass");
  });

  it("identifier ending ErrorCode → errorClass category", () => {
    expect(classifyBrandCategory(mk({ kind: "TypeScript:identifier", before: "ForkableErrorCode", after: "ForkctlErrorCode" })))
      .toBe("errorClass");
  });

  it("identifier ending Exception → errorClass category", () => {
    expect(classifyBrandCategory(mk({ kind: "TypeScript:identifier", before: "ForkableException", after: "ForkctlException" })))
      .toBe("errorClass");
  });

  it("snake_case string literal → toolName category", () => {
    expect(classifyBrandCategory(mk({ kind: "TypeScript:string", before: "forkable_assess", after: "forkctl_assess" })))
      .toBe("toolName");
  });

  it("quoted snake_case string literal → toolName category (strips quotes)", () => {
    expect(classifyBrandCategory(mk({ kind: "TypeScript:string", before: '"forkable_plan"', after: '"forkctl_plan"' })))
      .toBe("toolName");
  });

  it("markdown header string → header category", () => {
    expect(classifyBrandCategory(mk({ kind: "TypeScript:string", before: "# forkable rename plan", after: "# forkctl rename plan" })))
      .toBe("header");
  });

  it("SCREAMING_SNAKE string literal → envVar category", () => {
    expect(classifyBrandCategory(mk({ kind: "TypeScript:string", before: "FORKABLE_LOG", after: "FORKCTL_LOG" })))
      .toBe("envVar");
  });

  it("prose string → other category", () => {
    expect(classifyBrandCategory(mk({ kind: "TypeScript:string", before: "the forkable tool", after: "the forkctl tool" })))
      .toBe("other");
  });

  it("property_identifier → identifier category", () => {
    expect(classifyBrandCategory(mk({ kind: "TypeScript:property_identifier", before: "forkable", after: "forkctl" })))
      .toBe("identifier");
  });

  it("comment kind → other category", () => {
    expect(classifyBrandCategory(mk({ kind: "TypeScript:comment", before: "// forkable", after: "// forkctl" })))
      .toBe("other");
  });

  it("deep-ts file change → other category (file-level, not single identifier)", () => {
    expect(classifyBrandCategory(mk({ kind: "deep-ts:file", before: "…", after: "…", layer: "deep-ts" })))
      .toBe("other");
  });
});

describe("countByBrandCategory", () => {
  it("produces zero-initialized counts on empty input", () => {
    const c = countByBrandCategory([]);
    expect(c).toEqual({ identifier: 0, envVar: 0, toolName: 0, errorClass: 0, header: 0, other: 0 });
  });

  it("aggregates a mixed set of changes", () => {
    const changes = [
      mk({ kind: "TypeScript:identifier", before: "forkable", after: "forkctl" }),
      mk({ kind: "TypeScript:identifier", before: "ForkableError", after: "ForkctlError" }),
      mk({ kind: "TypeScript:identifier", before: "FORKABLE_LOG", after: "FORKCTL_LOG" }),
      mk({ kind: "TypeScript:identifier", before: "FORKABLE_STATE_DIR", after: "FORKCTL_STATE_DIR" }),
      mk({ kind: "TypeScript:string", before: "forkable_assess", after: "forkctl_assess" }),
      mk({ kind: "TypeScript:string", before: "# forkable", after: "# forkctl" }),
    ];
    const c = countByBrandCategory(changes);
    expect(c.identifier).toBe(1);
    expect(c.errorClass).toBe(1);
    expect(c.envVar).toBe(2);
    expect(c.toolName).toBe(1);
    expect(c.header).toBe(1);
    expect(c.other).toBe(0);
  });
});

describe("filesByBrandCategory", () => {
  it("counts distinct files per category", () => {
    const changes = [
      mk({ file: "a.ts", kind: "TypeScript:identifier", before: "forkable", after: "forkctl" }),
      mk({ file: "b.ts", kind: "TypeScript:identifier", before: "forkable", after: "forkctl" }),
      mk({ file: "a.ts", kind: "TypeScript:identifier", before: "ForkableError", after: "ForkctlError" }),
      mk({ file: "c.ts", kind: "TypeScript:identifier", before: "FORKABLE_LOG", after: "FORKCTL_LOG" }),
    ];
    const f = filesByBrandCategory(changes);
    expect(f.identifier).toBe(2); // a.ts, b.ts
    expect(f.errorClass).toBe(1); // a.ts
    expect(f.envVar).toBe(1); // c.ts
  });
});

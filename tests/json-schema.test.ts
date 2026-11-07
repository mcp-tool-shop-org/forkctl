import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TOOLS } from "../src/tools/registry.js";
import { toolInputJsonSchema } from "../src/tools/json-schema.js";

function objects(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) node.forEach((n) => objects(n, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o.type === "object") out.push(o);
    Object.values(o).forEach((v) => objects(v, out));
  }
  return out;
}

describe("tool input JSON Schema", () => {
  it("every tool's input, and every nested object, refuses extra keys (the zod 3 contract)", () => {
    expect(TOOLS.length).toBeGreaterThan(0);
    for (const t of TOOLS) {
      const found = objects(toolInputJsonSchema(t.inputSchema));
      expect(found.length, t.name).toBeGreaterThan(0);
      for (const o of found) expect(o.additionalProperties, t.name).toBe(false);
    }
  });

  it("leaves an explicit additionalProperties alone", () => {
    const s = toolInputJsonSchema(z.object({ a: z.string() }).catchall(z.number()));
    expect(s.additionalProperties).toEqual({ type: "number" });
  });

  it("targets draft-7", () => {
    expect(String(toolInputJsonSchema(z.object({})).$schema)).toContain("draft-07");
  });
});

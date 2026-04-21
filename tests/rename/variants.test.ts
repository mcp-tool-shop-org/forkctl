import { describe, expect, it } from "vitest";
import {
  buildIdentifierBoundaryRegex,
  buildVariantSet,
  buildWordBoundaryRegex,
  escapeRegex,
  lookupReplacement,
  rewriteIdentifierVariants,
  rewriteTextual,
} from "../../src/lib/rename/variants.js";

/**
 * Covers design §3 Pass B (variant engine) + feature-phase F2.
 * Tests the shipped `variants.ts` — these must stay green.
 */

describe("buildVariantSet — all 7 variants emitted", () => {
  it("produces every expected variant for forkable → splitshift", () => {
    const vs = buildVariantSet("forkable", "splitshift");
    expect(vs["kebab-case"]).toEqual({ from: "forkable", to: "splitshift", enabled: true });
    expect(vs.snake_case).toEqual({ from: "forkable", to: "splitshift", enabled: true });
    expect(vs.camelCase).toEqual({ from: "forkable", to: "splitshift", enabled: true });
    expect(vs.PascalCase).toEqual({ from: "Forkable", to: "Splitshift", enabled: true });
    expect(vs.SCREAMING_SNAKE).toEqual({ from: "FORKABLE", to: "SPLITSHIFT", enabled: true });
    expect(vs["dot.case"].from).toBe("forkable");
    expect(vs["dot.case"].to).toBe("splitshift");
    expect(vs["Title Case"].from).toBe("Forkable");
    expect(vs["Title Case"].to).toBe("Splitshift");
  });

  it("handles multi-word source (forkable-adapter) with all casings", () => {
    const vs = buildVariantSet("forkable-adapter", "splitshift-adapter");
    expect(vs["kebab-case"].from).toBe("forkable-adapter");
    expect(vs.snake_case.from).toBe("forkable_adapter");
    expect(vs.camelCase.from).toBe("forkableAdapter");
    expect(vs.PascalCase.from).toBe("ForkableAdapter");
    expect(vs.SCREAMING_SNAKE.from).toBe("FORKABLE_ADAPTER");
    expect(vs["dot.case"].from).toBe("forkable.adapter");
    expect(vs["Title Case"].from).toBe("Forkable Adapter");
    // And the `to` side matches in shape:
    expect(vs.PascalCase.to).toBe("SplitshiftAdapter");
    expect(vs.SCREAMING_SNAKE.to).toBe("SPLITSHIFT_ADAPTER");
  });

  it("preserves acronym normalization (URLLoader → url loader tokens)", () => {
    const vs = buildVariantSet("URLLoader", "DataLoader");
    // camelCase of URLLoader normalizes via change-case tokenization
    expect(vs.SCREAMING_SNAKE.from).toBe("URL_LOADER");
    expect(vs.PascalCase.from).toBe("UrlLoader");
    expect(vs.SCREAMING_SNAKE.to).toBe("DATA_LOADER");
    expect(vs.PascalCase.to).toBe("DataLoader");
  });

  it("identity rename (foo → foo) still builds a complete set (caller decides no-op)", () => {
    const vs = buildVariantSet("foo", "foo");
    for (const key of Object.keys(vs) as (keyof typeof vs)[]) {
      expect(vs[key].from).toBe(vs[key].to);
      expect(vs[key].enabled).toBe(true);
    }
  });

  it("handles numeric suffix (forkable-2)", () => {
    const vs = buildVariantSet("forkable-2", "splitshift-2");
    expect(vs["kebab-case"].from).toBe("forkable-2");
    expect(vs.PascalCase.from.startsWith("Forkable")).toBe(true);
  });
});

describe("escapeRegex", () => {
  it("escapes regex metacharacters", () => {
    expect(escapeRegex("a.b+c*")).toBe("a\\.b\\+c\\*");
    expect(escapeRegex("(x|y)")).toBe("\\(x\\|y\\)");
  });
});

describe("buildWordBoundaryRegex — word boundary matching", () => {
  it("matches exact words only — no partial matches", () => {
    const vs = buildVariantSet("forkable", "splitshift");
    const re = buildWordBoundaryRegex(vs);
    expect("forkable".match(re)?.[0]).toBe("forkable");
    expect("The forkable tool".match(re)?.[0]).toBe("forkable");
    // Partial-match safety from §5:
    expect("starship".match(re)).toBeNull();
    expect("unforkable".match(re)).toBeNull();
    expect("forkableness".match(re)).toBeNull();
  });

  it("sorts longest-first so PascalCase isn't masked by camelCase", () => {
    const vs = buildVariantSet("forkable", "splitshift");
    // All-lowercase for kebab/snake/camel collapse to one form ("forkable");
    // longer variants shouldn't get clobbered by the shorter one.
    const re = buildWordBoundaryRegex(vs);
    expect("Forkable".match(re)?.[0]).toBe("Forkable");
    expect("FORKABLE".match(re)?.[0]).toBe("FORKABLE");
  });

  it("when no variants enabled, produces a never-match regex", () => {
    const vs = buildVariantSet("foo", "bar");
    for (const k of Object.keys(vs) as (keyof typeof vs)[]) {
      vs[k].enabled = false;
    }
    const re = buildWordBoundaryRegex(vs);
    expect("foo bar baz".match(re)).toBeNull();
  });
});

describe("lookupReplacement", () => {
  it("returns the `to` form for a known `from` match", () => {
    const vs = buildVariantSet("forkable", "splitshift");
    expect(lookupReplacement(vs, "Forkable")).toBe("Splitshift");
    expect(lookupReplacement(vs, "FORKABLE")).toBe("SPLITSHIFT");
  });

  it("returns undefined for unknown strings", () => {
    const vs = buildVariantSet("forkable", "splitshift");
    expect(lookupReplacement(vs, "banana")).toBeUndefined();
  });

  it("ignores disabled variants", () => {
    const vs = buildVariantSet("forkable", "splitshift");
    // Disable every variant whose `from` is the PascalCase form. Title Case
    // also produces "Forkable", so disabling only PascalCase isn't enough to
    // make lookup return undefined — we disable all that match.
    for (const k of Object.keys(vs) as (keyof typeof vs)[]) {
      if (vs[k].from === "Forkable") vs[k].enabled = false;
    }
    expect(lookupReplacement(vs, "Forkable")).toBeUndefined();
  });
});

describe("rewriteTextual — text replacement with hit tracking", () => {
  it("rewrites all casings preserving shape", () => {
    const vs = buildVariantSet("forkable", "splitshift");
    const { output, hits } = rewriteTextual(
      "forkable Forkable FORKABLE — starship untouched",
      vs,
    );
    expect(output).toBe("splitshift Splitshift SPLITSHIFT — starship untouched");
    expect(hits).toHaveLength(3);
    expect(hits.map((h) => h.before)).toEqual(["forkable", "Forkable", "FORKABLE"]);
  });

  it("never touches partial matches (§5 star/starship, unforkable, forkableness)", () => {
    const vs = buildVariantSet("forkable", "splitshift");
    const input = "starship unforkable forkableness a starforkable";
    const { output, hits } = rewriteTextual(input, vs);
    expect(output).toBe(input);
    expect(hits).toHaveLength(0);
  });

  it("is idempotent when run twice on the same input", () => {
    const vs = buildVariantSet("forkable", "splitshift");
    const once = rewriteTextual("a forkable b", vs).output;
    const twice = rewriteTextual(once, vs).output;
    expect(twice).toBe(once);
  });
});

describe("rewriteIdentifierVariants — case-aware word-boundary rewrite", () => {
  const vs = buildVariantSet("forkable", "forkctl");

  it("rewrites whole-word PascalCase identifier", () => {
    expect(rewriteIdentifierVariants("Forkable", vs)).toBe("Forkctl");
  });

  it("rewrites PascalCase-prefix compound (ForkableError → ForkctlError)", () => {
    expect(rewriteIdentifierVariants("ForkableError", vs)).toBe("ForkctlError");
  });

  it("rewrites nested PascalCase compound (ForkableErrorCode → ForkctlErrorCode)", () => {
    expect(rewriteIdentifierVariants("ForkableErrorCode", vs)).toBe("ForkctlErrorCode");
  });

  it("rewrites mid-camelCase occurrence (makeForkableTool → makeForkctlTool)", () => {
    expect(rewriteIdentifierVariants("makeForkableTool", vs)).toBe("makeForkctlTool");
  });

  it("rewrites SCREAMING_SNAKE prefix (FORKABLE_LOG → FORKCTL_LOG)", () => {
    expect(rewriteIdentifierVariants("FORKABLE_LOG", vs)).toBe("FORKCTL_LOG");
  });

  it("rewrites SCREAMING_SNAKE multi-segment (FORKABLE_STATE_DIR → FORKCTL_STATE_DIR)", () => {
    expect(rewriteIdentifierVariants("FORKABLE_STATE_DIR", vs)).toBe("FORKCTL_STATE_DIR");
  });

  it("rewrites snake_case prefix (forkable_assess → forkctl_assess)", () => {
    expect(rewriteIdentifierVariants("forkable_assess", vs)).toBe("forkctl_assess");
  });

  it("rewrites kebab-case prefix (forkable-adapter → forkctl-adapter)", () => {
    expect(rewriteIdentifierVariants("forkable-adapter", vs)).toBe("forkctl-adapter");
  });

  it("does NOT rewrite Forkableness (lowercase tail fails boundary)", () => {
    expect(rewriteIdentifierVariants("Forkableness", vs)).toBeNull();
  });

  it("does NOT rewrite unforkable (preceded by lowercase letter)", () => {
    expect(rewriteIdentifierVariants("unforkable", vs)).toBeNull();
  });

  it("does NOT rewrite forkability (lowercase tail on lowercase variant)", () => {
    expect(rewriteIdentifierVariants("forkability", vs)).toBeNull();
  });

  it("does NOT rewrite starship (no variant match at all)", () => {
    expect(rewriteIdentifierVariants("starship", vs)).toBeNull();
  });

  it("returns null when input is empty", () => {
    expect(rewriteIdentifierVariants("", vs)).toBeNull();
  });

  it("returns null when identifier has no brand reference", () => {
    expect(rewriteIdentifierVariants("someOtherName", vs)).toBeNull();
  });
});

describe("buildIdentifierBoundaryRegex — boundary rules", () => {
  it("PascalCase `Forkable` matches prefix followed by Uppercase", () => {
    const re = buildIdentifierBoundaryRegex("Forkable")!;
    expect(re.test("ForkableError")).toBe(true);
  });

  it("PascalCase `Forkable` does NOT match followed by lowercase (Forkableness)", () => {
    const re = buildIdentifierBoundaryRegex("Forkable")!;
    expect(re.test("Forkableness")).toBe(false);
  });

  it("SCREAMING `FORKABLE` matches prefix followed by underscore", () => {
    const re = buildIdentifierBoundaryRegex("FORKABLE")!;
    expect(re.test("FORKABLE_LOG")).toBe(true);
  });

  it("lowercase `forkable` does NOT match when preceded by lowercase letter", () => {
    const re = buildIdentifierBoundaryRegex("forkable")!;
    expect(re.test("unforkable")).toBe(false);
  });

  it("returns null for empty input", () => {
    expect(buildIdentifierBoundaryRegex("")).toBeNull();
  });
});

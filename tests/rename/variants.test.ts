import { describe, expect, it } from "vitest";
import {
  buildVariantSet,
  buildWordBoundaryRegex,
  escapeRegex,
  lookupReplacement,
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

import { describe, expect, it } from "vitest";
import { scanFile } from "../src/lib/drift.js";

describe("scanFile", () => {
  it("flags a hardcoded Windows local path", () => {
    const findings = scanFile("README.md", "Run `node C:\\Users\\mike\\repo\\index.js`");
    expect(findings.map((f) => f.code)).toContain("HARDCODED_LOCAL_PATH");
  });

  it("flags a hardcoded macOS path", () => {
    const findings = scanFile("Makefile", "/Users/alex/work/foo");
    expect(findings.map((f) => f.code)).toContain("HARDCODED_LOCAL_PATH");
  });

  it("flags a leaked GitHub PAT", () => {
    const findings = scanFile(
      ".env",
      "GITHUB_TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    const pat = findings.find((f) => f.code === "LEAKED_GITHUB_PAT")!;
    expect(pat).toBeDefined();
    expect(pat.severity).toBe("high");
    expect(pat.evidence).toBe("<redacted>");
  });

  it("flags a leaked AWS access key", () => {
    const findings = scanFile(".env", "AWS_KEY=AKIAABCDEFGHIJKLMNOP");
    expect(findings.map((f) => f.code)).toContain("LEAKED_AWS_ACCESS_KEY");
  });

  it("flags stale source-owner reference when sourceOwner is provided", () => {
    const findings = scanFile(
      "README.md",
      "originally from octocat/hello-world",
      "octocat",
    );
    expect(findings.map((f) => f.code)).toContain("STALE_SOURCE_REFERENCE");
  });

  it("returns empty for clean content", () => {
    expect(scanFile("README.md", "# A clean repo\nNothing to see here.")).toEqual([]);
  });

  it("accepts real-format OpenAI project keys as HIGH severity (backend F-007)", () => {
    // Project-scoped: sk-proj- then 100+ chars of [A-Za-z0-9_-]
    const projKey = "sk-proj-" + "A".repeat(120);
    const findings = scanFile(".env", `OPENAI_API_KEY=${projKey}`);
    const match = findings.find((f) => f.code === "LEAKED_OPENAI_KEY");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("high");
  });

  it("accepts real-format legacy OpenAI keys as HIGH severity (backend F-007)", () => {
    // Legacy: sk- then exactly 48 alnum
    const legacyKey = "sk-" + "A".repeat(48);
    const findings = scanFile(".env", `OPENAI_API_KEY=${legacyKey}`);
    const match = findings.find((f) => f.code === "LEAKED_OPENAI_KEY");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("high");
  });

  it("does NOT flag short/generic placeholder sk- strings at HIGH severity (backend F-007)", () => {
    // The canonical placeholder — sk-xxxxxxxxxxxxxxxxxxxx (20 x's) — is a
    // tutorial/placeholder shape, not a real key. The tight structural regexes
    // must not match it at HIGH. The loose fallback may still flag it at
    // MEDIUM, which is acceptable for "suspicious but not confirmed."
    const placeholder = "sk-xxxxxxxxxxxxxxxxxxxx"; // 20 x's, deliberately under the 48 legacy cutoff
    const findings = scanFile(".env.example", `OPENAI_API_KEY=${placeholder}`);
    const openai = findings.filter((f) => f.code === "LEAKED_OPENAI_KEY");
    // If anything fires, it must be medium (fallback), NEVER high.
    for (const f of openai) {
      expect(f.severity).not.toBe("high");
    }
  });

  it("does NOT flag obviously fake filler like sk-xxxx-test at HIGH (backend F-007)", () => {
    const findings = scanFile(".env.example", "OPENAI_API_KEY=sk-xxxx-test-key");
    const high = findings.find((f) => f.code === "LEAKED_OPENAI_KEY" && f.severity === "high");
    expect(high).toBeUndefined();
  });
});

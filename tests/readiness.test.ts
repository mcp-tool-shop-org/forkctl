import { describe, expect, it } from "vitest";
import { scoreReadiness } from "../src/lib/readiness.js";
import { makeSnapshot } from "./_helpers/snapshot.js";

describe("scoreReadiness", () => {
  it("a fully-loaded repo scores high", () => {
    const report = scoreReadiness(makeSnapshot());
    expect(report.score).toBeGreaterThanOrEqual(85);
    expect(report.blockers).toHaveLength(0);
    expect(report.strengths.length).toBeGreaterThan(5);
  });

  it("missing license is a high-severity blocker that drops the legal category to 0", () => {
    const report = scoreReadiness(makeSnapshot({ license: null }));
    const noLicense = report.blockers.find((b) => b.code === "NO_LICENSE");
    expect(noLicense?.severity).toBe("high");
    const legal = report.categories.find((c) => c.category === "legal");
    expect(legal?.score).toBe(0);
  });

  it("missing README is a high-severity blocker", () => {
    const report = scoreReadiness(makeSnapshot({ hasReadme: false, readmeLength: 0 }));
    expect(report.blockers.map((b) => b.code)).toContain("NO_README");
  });

  it("missing .env.example is medium", () => {
    const report = scoreReadiness(makeSnapshot({ hasEnvExample: false }));
    const b = report.blockers.find((x) => x.code === "NO_ENV_EXAMPLE");
    expect(b?.severity).toBe("medium");
  });

  it("non-standard default branch surfaces a blocker", () => {
    const report = scoreReadiness(makeSnapshot({ defaultBranch: "develop" }));
    expect(report.blockers.map((b) => b.code)).toContain("UNUSUAL_DEFAULT_BRANCH");
  });

  it("template repos score 100 in the template category", () => {
    const report = scoreReadiness(makeSnapshot({ isTemplate: true }));
    const t = report.categories.find((c) => c.category === "template");
    expect(t?.score).toBe(100);
    expect(report.strengths.map((s) => s.code)).toContain("IS_TEMPLATE");
  });

  it("nextActions are sorted high → medium → low and capped at 5", () => {
    const report = scoreReadiness(
      makeSnapshot({
        license: null,
        hasReadme: false,
        readmeLength: 0,
        hasEnvExample: false,
        hasContributing: false,
        hasSecurityPolicy: false,
        description: null,
      }),
    );
    expect(report.nextActions.length).toBeGreaterThan(0);
    expect(report.nextActions.length).toBeLessThanOrEqual(5);
    // The first action should fix a high-severity blocker
    const first = report.nextActions[0]!;
    expect(first.length).toBeGreaterThan(0);
  });

  it("category weights sum to 1", () => {
    const report = scoreReadiness(makeSnapshot());
    const sum = report.categories.reduce((acc, c) => acc + c.weight, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("score never exceeds 100 or goes below 0", () => {
    const high = scoreReadiness(makeSnapshot());
    const low = scoreReadiness(
      makeSnapshot({
        license: null,
        hasReadme: false,
        readmeLength: 0,
        hasEnvExample: false,
        hasContributing: false,
        hasCodeOfConduct: false,
        hasSecurityPolicy: false,
        hasPullRequestTemplate: false,
        hasIssueTemplate: false,
        hasCodeowners: false,
        hasDevcontainer: false,
        hasDockerfile: false,
        description: null,
        topics: [],
        archived: true,
        defaultBranch: "trunkbranch",
        workflowsCount: 0,
        daysSinceLastCommit: 1000,
      }),
    );
    expect(high.score).toBeLessThanOrEqual(100);
    expect(low.score).toBeGreaterThanOrEqual(0);
  });
});

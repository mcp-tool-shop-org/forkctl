/**
 * Adoption-readiness scoring engine.
 *
 * Pure: takes a RepoSnapshot, returns an AdoptionReport. No I/O.
 * The snapshot is built by lib/snapshot.ts (Octokit-backed) — kept separate so
 * scoring is trivially testable with synthetic snapshots.
 */

export interface RepoSnapshot {
  owner: string;
  repo: string;
  description: string | null;
  homepage: string | null;
  visibility: "public" | "private" | "internal";
  archived: boolean;
  isTemplate: boolean;
  defaultBranch: string;
  branchCount: number;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  daysSinceLastCommit: number | null;
  workflowsCount: number;
  license: { spdxId: string | null; name: string | null } | null;
  hasReadme: boolean;
  readmeLength: number;
  hasContributing: boolean;
  hasCodeOfConduct: boolean;
  hasSecurityPolicy: boolean;
  hasPullRequestTemplate: boolean;
  hasIssueTemplate: boolean;
  hasEnvExample: boolean;
  hasCodeowners: boolean;
  hasDevcontainer: boolean;
  hasDockerfile: boolean;
}

export type Severity = "high" | "medium" | "low";

export interface Blocker {
  code: string;
  severity: Severity;
  message: string;
  fix: string;
}

export interface Strength {
  code: string;
  message: string;
}

export interface CategoryScore {
  category: "legal" | "setup" | "contribution" | "hygiene" | "template" | "sync";
  score: number; // 0..100
  weight: number; // 0..1, sums to 1 across categories
}

export interface AdoptionReport {
  repo: string;
  score: number; // 0..100, weighted
  blockers: Blocker[];
  strengths: Strength[];
  nextActions: string[];
  categories: CategoryScore[];
}

const WEIGHTS = {
  legal: 0.25,
  setup: 0.25,
  contribution: 0.15,
  hygiene: 0.1,
  template: 0.05,
  sync: 0.2,
} as const;

export function scoreReadiness(snap: RepoSnapshot): AdoptionReport {
  const blockers: Blocker[] = [];
  const strengths: Strength[] = [];

  // ---- Legal -------------------------------------------------------------
  let legal = 0;
  if (snap.license && snap.license.spdxId && snap.license.spdxId !== "NOASSERTION") {
    legal = 100;
    strengths.push({
      code: "HAS_LICENSE",
      message: `Licensed under ${snap.license.spdxId}`,
    });
  } else {
    legal = 0;
    blockers.push({
      code: "NO_LICENSE",
      severity: "high",
      message: "No clear reuse license is detected.",
      fix: "Add a LICENSE file. MIT or Apache-2.0 are common defaults for adoption.",
    });
  }

  // ---- Setup -------------------------------------------------------------
  let setup = 0;
  if (snap.hasReadme) {
    setup += 40;
    strengths.push({ code: "HAS_README", message: "README present" });
    if (snap.readmeLength >= 1500) setup += 20;
  } else {
    blockers.push({
      code: "NO_README",
      severity: "high",
      message: "No README at the repo root.",
      fix: "Add a README that explains what the project is and how to run it.",
    });
  }
  if (snap.hasEnvExample) {
    setup += 15;
    strengths.push({ code: "HAS_ENV_EXAMPLE", message: ".env.example present" });
  } else {
    blockers.push({
      code: "NO_ENV_EXAMPLE",
      severity: "medium",
      message: "No .env.example — runtime setup is likely fragile for adopters.",
      fix: "Add .env.example listing every required env var with safe placeholders.",
    });
  }
  if (snap.hasDevcontainer || snap.hasDockerfile) {
    setup += 15;
    strengths.push({
      code: "HAS_REPRODUCIBLE_ENV",
      message: snap.hasDevcontainer ? "Devcontainer present" : "Dockerfile present",
    });
  }
  if (snap.workflowsCount > 0) {
    setup += 10;
    strengths.push({ code: "HAS_CI", message: `${snap.workflowsCount} CI workflow(s)` });
  }
  setup = Math.min(100, setup);

  // ---- Contribution ------------------------------------------------------
  let contribution = 0;
  if (snap.hasContributing) {
    contribution += 30;
    strengths.push({ code: "HAS_CONTRIBUTING", message: "CONTRIBUTING present" });
  } else {
    blockers.push({
      code: "NO_CONTRIBUTING",
      severity: "low",
      message: "No CONTRIBUTING.md — contributors lack guidance.",
      fix: "Add CONTRIBUTING.md explaining branch model, test command, and PR norms.",
    });
  }
  if (snap.hasPullRequestTemplate) {
    contribution += 25;
    strengths.push({ code: "HAS_PR_TEMPLATE", message: "PR template present" });
  }
  if (snap.hasIssueTemplate) {
    contribution += 20;
    strengths.push({ code: "HAS_ISSUE_TEMPLATE", message: "Issue template present" });
  }
  if (snap.hasCodeOfConduct) contribution += 15;
  if (snap.hasSecurityPolicy) {
    contribution += 10;
    strengths.push({ code: "HAS_SECURITY", message: "SECURITY.md present" });
  } else {
    blockers.push({
      code: "NO_SECURITY",
      severity: "low",
      message: "No SECURITY.md — vulnerability reporting path is unclear.",
      fix: "Add SECURITY.md with a reporting channel (private security advisory).",
    });
  }
  contribution = Math.min(100, contribution);

  // ---- Hygiene -----------------------------------------------------------
  let hygiene = 0;
  if (snap.description && snap.description.trim().length > 0) {
    hygiene += 30;
    strengths.push({ code: "HAS_DESCRIPTION", message: "Repo description set" });
  } else {
    blockers.push({
      code: "NO_DESCRIPTION",
      severity: "low",
      message: "Repo has no description.",
      fix: "Set a one-sentence description in repo settings.",
    });
  }
  if (snap.topics.length > 0) hygiene += 20;
  if (snap.daysSinceLastCommit !== null) {
    if (snap.daysSinceLastCommit <= 90) hygiene += 30;
    else if (snap.daysSinceLastCommit <= 365) hygiene += 15;
  }
  if (!snap.archived) hygiene += 20;
  hygiene = Math.min(100, hygiene);

  // ---- Template-readiness ------------------------------------------------
  let template = 0;
  if (snap.isTemplate) {
    template = 100;
    strengths.push({ code: "IS_TEMPLATE", message: "Marked as a template repo" });
  } else if (snap.hasReadme) {
    template = 50; // possible-but-not-great
  }

  // ---- Sync-friendliness -------------------------------------------------
  let sync = 0;
  if (["main", "trunk"].includes(snap.defaultBranch)) {
    sync += 60;
  } else if (snap.defaultBranch === "master") {
    sync += 30;
  } else {
    blockers.push({
      code: "UNUSUAL_DEFAULT_BRANCH",
      severity: "low",
      message: `Default branch is "${snap.defaultBranch}" — non-standard, may surprise adopters.`,
      fix: "Consider renaming the default branch to main if there is no domain reason otherwise.",
    });
  }
  if (snap.branchCount <= 10) sync += 20;
  if (!snap.archived) sync += 20;
  sync = Math.min(100, sync);

  // ---- Aggregate ---------------------------------------------------------
  const categories: CategoryScore[] = [
    { category: "legal", score: legal, weight: WEIGHTS.legal },
    { category: "setup", score: setup, weight: WEIGHTS.setup },
    { category: "contribution", score: contribution, weight: WEIGHTS.contribution },
    { category: "hygiene", score: hygiene, weight: WEIGHTS.hygiene },
    { category: "template", score: template, weight: WEIGHTS.template },
    { category: "sync", score: sync, weight: WEIGHTS.sync },
  ];
  const score = Math.round(
    categories.reduce((acc, c) => acc + c.score * c.weight, 0),
  );

  const nextActions = blockers
    .slice()
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 5)
    .map((b) => b.fix);

  return {
    repo: `${snap.owner}/${snap.repo}`,
    score,
    blockers,
    strengths,
    nextActions,
    categories,
  };
}

function severityRank(s: Severity): number {
  switch (s) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
  }
}

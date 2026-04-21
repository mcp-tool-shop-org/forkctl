import type { RepoSnapshot } from "../../src/lib/readiness.js";

export function makeSnapshot(overrides: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return {
    owner: "octocat",
    repo: "hello-world",
    description: "A great repo.",
    homepage: null,
    visibility: "public",
    archived: false,
    isTemplate: false,
    defaultBranch: "main",
    branchCount: 2,
    topics: ["cli", "tools"],
    stars: 10,
    forks: 0,
    openIssues: 0,
    daysSinceLastCommit: 5,
    workflowsCount: 1,
    license: { spdxId: "MIT", name: "MIT License" },
    hasReadme: true,
    readmeLength: 2500,
    hasContributing: true,
    hasCodeOfConduct: true,
    hasSecurityPolicy: true,
    hasPullRequestTemplate: true,
    hasIssueTemplate: true,
    hasEnvExample: true,
    hasCodeowners: true,
    hasDevcontainer: false,
    hasDockerfile: true,
    ...overrides,
  };
}

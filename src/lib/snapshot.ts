import type { Octokit } from "@octokit/rest";
import { mapGitHubError } from "./github.js";
import type { RepoSnapshot } from "./readiness.js";

/**
 * Build a RepoSnapshot by issuing the smallest practical set of GitHub API calls.
 *
 * Calls used:
 *   GET /repos/{owner}/{repo}                 (1)
 *   GET /repos/{owner}/{repo}/contents/{path} (parallel; 404 = absent)
 *   GET /repos/{owner}/{repo}/branches?per_page=100 (1, capped)
 *   GET /repos/{owner}/{repo}/actions/workflows (1)
 *   GET /repos/{owner}/{repo}/commits?per_page=1 (1, for last commit timestamp)
 */

const KEY_FILES = [
  ".env.example",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/config.yml",
  "CODEOWNERS",
  ".github/CODEOWNERS",
  ".devcontainer/devcontainer.json",
  "Dockerfile",
] as const;

interface RepoLite {
  description: string | null;
  homepage: string | null;
  visibility?: string;
  private: boolean;
  archived: boolean;
  is_template?: boolean;
  default_branch: string;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  license: { spdx_id: string | null; name: string | null } | null;
  pushed_at?: string;
}

interface ReadmeData {
  content?: string;
  encoding?: string;
}

export async function fetchSnapshot(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<RepoSnapshot> {
  let repoData: RepoLite;
  try {
    const res = await octokit.rest.repos.get({ owner, repo });
    repoData = res.data as unknown as RepoLite;
  } catch (err) {
    throw mapGitHubError(err);
  }

  const [readme, fileFlags, branchCount, workflowsCount] = await Promise.all([
    fetchReadme(octokit, owner, repo),
    fetchFileFlags(octokit, owner, repo),
    fetchBranchCount(octokit, owner, repo),
    fetchWorkflowsCount(octokit, owner, repo),
  ]);

  const visibility = (repoData.visibility ??
    (repoData.private ? "private" : "public")) as "public" | "private" | "internal";

  const lastCommit = repoData.pushed_at ? Date.parse(repoData.pushed_at) : null;
  const daysSinceLastCommit =
    lastCommit !== null ? Math.floor((Date.now() - lastCommit) / 86_400_000) : null;

  return {
    owner,
    repo,
    description: repoData.description,
    homepage: repoData.homepage,
    visibility,
    archived: repoData.archived,
    isTemplate: repoData.is_template ?? false,
    defaultBranch: repoData.default_branch,
    branchCount,
    topics: repoData.topics ?? [],
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    openIssues: repoData.open_issues_count,
    daysSinceLastCommit,
    workflowsCount,
    license: repoData.license
      ? { spdxId: repoData.license.spdx_id, name: repoData.license.name }
      : null,
    hasReadme: readme.present,
    readmeLength: readme.length,
    hasContributing: fileFlags.has("CONTRIBUTING.md"),
    hasCodeOfConduct: fileFlags.has("CODE_OF_CONDUCT.md"),
    hasSecurityPolicy: fileFlags.has("SECURITY.md"),
    hasPullRequestTemplate: fileFlags.has(".github/PULL_REQUEST_TEMPLATE.md"),
    hasIssueTemplate: fileFlags.has(".github/ISSUE_TEMPLATE/config.yml"),
    hasEnvExample: fileFlags.has(".env.example"),
    hasCodeowners: fileFlags.has("CODEOWNERS") || fileFlags.has(".github/CODEOWNERS"),
    hasDevcontainer: fileFlags.has(".devcontainer/devcontainer.json"),
    hasDockerfile: fileFlags.has("Dockerfile"),
  };
}

async function fetchReadme(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<{ present: boolean; length: number }> {
  try {
    const res = await octokit.rest.repos.getReadme({ owner, repo });
    const data = res.data as unknown as ReadmeData;
    if (!data.content) return { present: true, length: 0 };
    const decoded = Buffer.from(data.content, (data.encoding ?? "base64") as BufferEncoding);
    return { present: true, length: decoded.length };
  } catch (err) {
    const e = mapGitHubError(err);
    if (e.code === "GITHUB_NOT_FOUND") return { present: false, length: 0 };
    throw e;
  }
}

async function fetchFileFlags(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<Set<string>> {
  const present = new Set<string>();
  await Promise.all(
    KEY_FILES.map(async (path) => {
      try {
        await octokit.rest.repos.getContent({ owner, repo, path });
        present.add(path);
      } catch (err) {
        const e = mapGitHubError(err);
        if (e.code !== "GITHUB_NOT_FOUND") throw e;
      }
    }),
  );
  return present;
}

async function fetchBranchCount(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<number> {
  try {
    const res = await octokit.rest.repos.listBranches({ owner, repo, per_page: 100 });
    return res.data.length;
  } catch (err) {
    const e = mapGitHubError(err);
    if (e.code === "GITHUB_NOT_FOUND" || e.code === "GITHUB_FORBIDDEN") return 0;
    throw e;
  }
}

async function fetchWorkflowsCount(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<number> {
  try {
    const res = await octokit.rest.actions.listRepoWorkflows({ owner, repo });
    return res.data.total_count ?? 0;
  } catch (err) {
    const e = mapGitHubError(err);
    if (e.code === "GITHUB_NOT_FOUND" || e.code === "GITHUB_FORBIDDEN") return 0;
    throw e;
  }
}

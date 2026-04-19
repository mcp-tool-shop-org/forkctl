import type { Octokit } from "@octokit/rest";
import { ForkableError } from "./errors.js";
import { mapGitHubError } from "./github.js";

/**
 * Fork policy resolution.
 *
 * GitHub policy cascades: enterprise > organization > repository.
 * Repos owned by users (not orgs) have no org/enterprise restriction.
 * Private repos are forkable only if the org explicitly enables forking.
 *
 * This module determines whether a fork attempt will be blocked BEFORE the
 * attempt is made — turning an avoidable 403 into actionable preflight info.
 */

export type ForkAllowed = "yes" | "no" | "unknown";

export interface ForkPolicyVerdict {
  allowed: ForkAllowed;
  reason: string;
  source: "repo_archived" | "repo_disabled_forking" | "org_policy" | "user_owner" | "public_repo" | "unknown";
  details: {
    repoVisibility: "public" | "private" | "internal";
    repoArchived: boolean;
    repoAllowForking: boolean;
    ownerType: "User" | "Organization";
    orgMembersCanForkPrivate?: boolean;
  };
}

interface RepoLite {
  visibility?: string;
  private: boolean;
  archived: boolean;
  allow_forking?: boolean;
  owner: { type: string; login: string };
}

interface OrgLite {
  members_can_fork_private_repositories?: boolean;
}

export async function resolveForkPolicy(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<ForkPolicyVerdict> {
  let repoData: RepoLite;
  try {
    const res = await octokit.rest.repos.get({ owner, repo });
    repoData = res.data as unknown as RepoLite;
  } catch (err) {
    throw mapGitHubError(err);
  }

  const visibility = (repoData.visibility ?? (repoData.private ? "private" : "public")) as
    | "public"
    | "private"
    | "internal";

  if (repoData.archived) {
    return {
      allowed: "no",
      reason: "Source repository is archived. Archived repos cannot be forked.",
      source: "repo_archived",
      details: {
        repoVisibility: visibility,
        repoArchived: true,
        repoAllowForking: repoData.allow_forking ?? false,
        ownerType: repoData.owner.type as "User" | "Organization",
      },
    };
  }

  if (repoData.allow_forking === false) {
    return {
      allowed: "no",
      reason: "Forking is disabled at the repository level.",
      source: "repo_disabled_forking",
      details: {
        repoVisibility: visibility,
        repoArchived: false,
        repoAllowForking: false,
        ownerType: repoData.owner.type as "User" | "Organization",
      },
    };
  }

  // Public repos owned by anyone with allow_forking !== false: always allowed.
  if (visibility === "public") {
    return {
      allowed: "yes",
      reason: "Public repository with forking enabled.",
      source: "public_repo",
      details: {
        repoVisibility: visibility,
        repoArchived: false,
        repoAllowForking: true,
        ownerType: repoData.owner.type as "User" | "Organization",
      },
    };
  }

  // Private/internal user-owned repo: forking by collaborators is generally allowed.
  if (repoData.owner.type === "User") {
    return {
      allowed: "yes",
      reason: "User-owned repository; no org policy applies.",
      source: "user_owner",
      details: {
        repoVisibility: visibility,
        repoArchived: false,
        repoAllowForking: repoData.allow_forking ?? true,
        ownerType: "User",
      },
    };
  }

  // Org-owned, non-public: must check org policy.
  let orgData: OrgLite | null = null;
  try {
    const res = await octokit.rest.orgs.get({ org: repoData.owner.login });
    orgData = res.data as unknown as OrgLite;
  } catch (err) {
    const e = mapGitHubError(err);
    if (e.code === "GITHUB_NOT_FOUND" || e.code === "GITHUB_FORBIDDEN") {
      return {
        allowed: "unknown",
        reason: `Could not read org settings for ${repoData.owner.login} (${e.code}). Cannot confirm fork policy.`,
        source: "unknown",
        details: {
          repoVisibility: visibility,
          repoArchived: false,
          repoAllowForking: repoData.allow_forking ?? true,
          ownerType: "Organization",
        },
      };
    }
    throw e;
  }

  const allowed = orgData?.members_can_fork_private_repositories === true;
  return {
    allowed: allowed ? "yes" : "no",
    reason: allowed
      ? "Org allows forking private repositories."
      : "Org disallows forking of private/internal repositories. Default for new orgs.",
    source: "org_policy",
    details: {
      repoVisibility: visibility,
      repoArchived: false,
      repoAllowForking: repoData.allow_forking ?? true,
      ownerType: "Organization",
      orgMembersCanForkPrivate: orgData?.members_can_fork_private_repositories ?? false,
    },
  };
}

export function policyBlocker(verdict: ForkPolicyVerdict): ForkableError | null {
  if (verdict.allowed === "no") {
    return new ForkableError("FORK_POLICY_BLOCKED", verdict.reason, {
      hint:
        verdict.source === "org_policy"
          ? "An org owner must enable 'Allow forking of private repositories' in org settings."
          : verdict.source === "repo_archived"
            ? "Unarchive the repo first, or use forkable_create_from_template if it is a template."
            : verdict.source === "repo_disabled_forking"
              ? "The repo owner must re-enable forking in repository settings."
              : undefined,
      details: { ...verdict.details, source: verdict.source },
    });
  }
  return null;
}

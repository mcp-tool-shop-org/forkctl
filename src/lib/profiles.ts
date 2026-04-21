/**
 * Bootstrap profiles. Each profile is a declarative recipe of aftercare steps
 * applied after a fork or template-generated repo has been created.
 *
 * Profiles are stable identifiers — adding a profile is fine, renaming or
 * deleting one is a breaking change.
 */

export type ProfileId =
  | "contributor"
  | "starter-kit"
  | "internal-seed"
  | "client-delivery"
  | "experiment";

export type StepId =
  | "set_upstream_remote"
  | "install_sync_workflow"
  | "add_contributor_readme_block"
  | "ensure_pr_template"
  | "strip_template_references"
  | "fresh_readme"
  | "prompt_fresh_license"
  | "ensure_env_example"
  | "replace_placeholders"
  | "set_codeowners"
  | "lock_visibility_private"
  | "client_named_branches"
  | "sanitized_history_check"
  | "lock_default_branch"
  | "detach_upstream"
  | "mark_experiment_in_readme";

export interface Profile {
  id: ProfileId;
  description: string;
  steps: StepId[];
}

export const PROFILES: Record<ProfileId, Profile> = {
  contributor: {
    id: "contributor",
    description: "Forking to send PRs back upstream.",
    steps: [
      "set_upstream_remote",
      "install_sync_workflow",
      "add_contributor_readme_block",
      "ensure_pr_template",
    ],
  },
  "starter-kit": {
    id: "starter-kit",
    description: "Generated from a template to kick off your own product.",
    steps: [
      "strip_template_references",
      "fresh_readme",
      "prompt_fresh_license",
      "ensure_env_example",
    ],
  },
  "internal-seed": {
    id: "internal-seed",
    description: "Internal team copy of a shared seed repo.",
    steps: ["replace_placeholders", "set_codeowners", "lock_visibility_private"],
  },
  "client-delivery": {
    id: "client-delivery",
    description: "Per-client fork of a deliverable.",
    steps: ["client_named_branches", "sanitized_history_check", "lock_default_branch"],
  },
  experiment: {
    id: "experiment",
    description: "Throwaway / detached copy.",
    steps: ["detach_upstream", "mark_experiment_in_readme"],
  },
};

export function getProfile(id: ProfileId): Profile {
  const profile = PROFILES[id];
  if (!profile) throw new Error(`Unknown profile: ${String(id)}`);
  return profile;
}

export function listProfiles(): Profile[] {
  return Object.values(PROFILES);
}

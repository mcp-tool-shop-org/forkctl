import { parseRepoRef } from "../lib/github.js";
import { resolveForkPolicy, type ForkPolicyVerdict } from "../lib/policy.js";
import { safe } from "../lib/result.js";
import {
  PreflightPolicyInputSchema,
  type PreflightPolicyInput,
} from "../schemas/execution.js";
import type { ToolDescriptor } from "./types.js";

export const preflightPolicyTool: ToolDescriptor<PreflightPolicyInput, ForkPolicyVerdict> = {
  name: "forkctl_preflight_policy",
  description:
    "Detect enterprise / org / repo fork-policy blockers BEFORE attempting a fork. Resolves visibility, archival state, repo allow_forking flag, and (for org-owned private repos) members_can_fork_private_repositories. Returns allowed: yes | no | unknown with the reason.",
  inputSchema: PreflightPolicyInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const { owner, repo } = parseRepoRef(input.repo);
      return resolveForkPolicy(ctx.octokit, owner, repo);
    }),
};

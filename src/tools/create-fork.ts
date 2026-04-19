import { ForkableError } from "../lib/errors.js";
import { mapGitHubError, parseRepoRef } from "../lib/github.js";
import { policyBlocker, resolveForkPolicy } from "../lib/policy.js";
import type { OperationRecord } from "../lib/operations.js";
import { safe } from "../lib/result.js";
import {
  CreateForkInputSchema,
  type CreateForkInput,
} from "../schemas/execution.js";
import type { ToolDescriptor } from "./types.js";

export interface CreateForkOutput {
  operationId: string;
  status: OperationRecord["status"];
  destination: string;
  destinationUrl: string;
  message: string;
}

/**
 * Kick off an async fork. Per GitHub docs, fork creation may take up to
 * 5 minutes before git objects are accessible. This handler:
 *
 *   1. Runs a fork-policy preflight (turns avoidable 403 into actionable error)
 *   2. Calls POST /repos/{owner}/{repo}/forks (returns 202 with eventual metadata)
 *   3. Records an operation in the local store
 *   4. Returns the operation_id; caller polls forkable_check_operation
 *
 * The handler does NOT busy-wait for completion. That keeps the MCP/CLI surface
 * responsive and lets check_operation own the readiness probe.
 */
export const createForkTool: ToolDescriptor<CreateForkInput, CreateForkOutput> = {
  name: "forkable_create_fork",
  description:
    "Start an async fork of a source repo. Runs fork-policy preflight, kicks off the GitHub fork, and returns an operation_id. Poll forkable_check_operation to track readiness (forks can take up to 5 minutes per GitHub docs).",
  inputSchema: CreateForkInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const { owner, repo } = parseRepoRef(input.source);
      const verdict = await resolveForkPolicy(ctx.octokit, owner, repo);
      const blocker = policyBlocker(verdict);
      if (blocker) throw blocker;

      const requestedName = input.name ?? repo;
      const destinationOwner = input.destinationOrg ?? (await getAuthenticatedLogin(ctx.octokit));
      const destination = `${destinationOwner}/${requestedName}`;

      const op = ctx.operations.create({
        kind: "create_fork",
        source: `${owner}/${repo}`,
        destination,
      });

      try {
        const params: {
          owner: string;
          repo: string;
          organization?: string;
          name?: string;
          default_branch_only?: boolean;
        } = { owner, repo };
        if (input.destinationOrg !== undefined) params.organization = input.destinationOrg;
        if (input.name !== undefined) params.name = input.name;
        if (input.defaultBranchOnly) params.default_branch_only = true;
        await ctx.octokit.rest.repos.createFork(params);
      } catch (err) {
        const e = mapGitHubError(err);
        ctx.operations.fail(op.id, {
          code: e.code,
          message: e.message,
          ...(e.hint !== undefined ? { hint: e.hint } : {}),
        });
        throw e;
      }

      return {
        operationId: op.id,
        status: op.status,
        destination,
        destinationUrl: `https://github.com/${destination}`,
        message:
          "Fork creation accepted. Poll forkable_check_operation with the operation_id to track readiness.",
      };
    }),
};

async function getAuthenticatedLogin(octokit: import("@octokit/rest").Octokit): Promise<string> {
  try {
    const res = await octokit.rest.users.getAuthenticated();
    return res.data.login;
  } catch (err) {
    const e = mapGitHubError(err);
    throw new ForkableError(e.code, "Could not resolve authenticated user", {
      hint: "Check that GITHUB_TOKEN is valid and has user:read scope.",
      cause: err,
    });
  }
}

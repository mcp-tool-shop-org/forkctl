import { ForkctlError } from "../lib/errors.js";
import { mapGitHubError, parseRepoRef } from "../lib/github.js";
import type { OperationRecord } from "../lib/operations.js";
import { safe } from "../lib/result.js";
import {
  CheckOperationInputSchema,
  type CheckOperationInput,
} from "../schemas/execution.js";
import type { ToolDescriptor } from "./types.js";

/**
 * Probe a pending operation. If the destination repo is now visible to GitHub,
 * mark the operation succeeded. Otherwise leave it pending. We never busy-wait
 * — one probe per call.
 */
export const checkOperationTool: ToolDescriptor<CheckOperationInput, OperationRecord> = {
  name: "forkctl_check_operation",
  description:
    "Get the status of an async operation by id. For pending fork/template operations, performs a single readiness probe against GitHub and updates state if the destination is now accessible. Idempotent — call as often as you like.",
  inputSchema: CheckOperationInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const op = ctx.operations.get(input.operationId);
      if (!op) {
        throw new ForkctlError("OPERATION_NOT_FOUND", `Operation ${input.operationId} not found`, {
          hint: "Check the operation_id; it may have been recorded in a different state directory.",
        });
      }
      if (op.status !== "pending" || !op.destination) return op;

      const { owner, repo } = parseRepoRef(op.destination);
      try {
        const res = await ctx.octokit.rest.repos.get({ owner, repo });
        return ctx.operations.succeed(op.id, {
          repoId: res.data.id,
          fullName: res.data.full_name,
          htmlUrl: res.data.html_url,
          defaultBranch: res.data.default_branch,
        });
      } catch (err) {
        const e = mapGitHubError(err);
        if (e.code === "GITHUB_NOT_FOUND") {
          // Still propagating through GitHub's eventual-consistency window.
          return op;
        }
        ctx.operations.fail(op.id, {
          code: e.code,
          message: e.message,
          ...(e.hint !== undefined ? { hint: e.hint } : {}),
        });
        throw e;
      }
    }),
};

import { mapGitHubError, parseRepoRef } from "../lib/github.js";
import type { OperationRecord } from "../lib/operations.js";
import { safe } from "../lib/result.js";
import {
  CreateFromTemplateInputSchema,
  type CreateFromTemplateInput,
} from "../schemas/execution.js";
import type { ToolDescriptor } from "./types.js";

export interface CreateFromTemplateOutput {
  operationId: string;
  status: OperationRecord["status"];
  destination: string;
  destinationUrl: string;
  message: string;
}

/**
 * Generate a new repository from a template. Per GitHub docs:
 *
 *   POST /repos/{template_owner}/{template_repo}/generate
 *
 * Unlike fork, the new repo starts with a single commit and no upstream link.
 * The endpoint is also async (the new repo may not be immediately readable),
 * so we mirror create_fork's operation pattern.
 */
export const createFromTemplateTool: ToolDescriptor<
  CreateFromTemplateInput,
  CreateFromTemplateOutput
> = {
  name: "forkable_create_from_template",
  description:
    "Create a new repository from a template using POST /repos/{owner}/{repo}/generate. Returns an operation_id to poll. Best for starter-kits and per-client copies where you do NOT want an upstream link.",
  inputSchema: CreateFromTemplateInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const { owner: templateOwner, repo: templateRepo } = parseRepoRef(input.template);
      const destination = `${input.owner}/${input.name}`;

      const op = ctx.operations.create({
        kind: "create_from_template",
        source: `${templateOwner}/${templateRepo}`,
        destination,
      });

      try {
        const params: {
          template_owner: string;
          template_repo: string;
          owner: string;
          name: string;
          description?: string;
          private?: boolean;
          include_all_branches?: boolean;
        } = {
          template_owner: templateOwner,
          template_repo: templateRepo,
          owner: input.owner,
          name: input.name,
          private: input.private,
          include_all_branches: input.includeAllBranches,
        };
        if (input.description !== undefined) params.description = input.description;
        await ctx.octokit.rest.repos.createUsingTemplate(params);
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
        message: "Template generation accepted. Poll forkable_check_operation to track readiness.",
      };
    }),
};

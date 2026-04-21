import { parseRepoRef } from "../lib/github.js";
import { getProfile, type ProfileId } from "../lib/profiles.js";
import { STEP_EXECUTORS, type StepResult } from "../lib/bootstrap-steps.js";
import { safe } from "../lib/result.js";
import { BootstrapInputSchema, type BootstrapInput } from "../schemas/bootstrap.js";
import type { ToolDescriptor } from "./types.js";

export interface BootstrapOutput {
  destination: string;
  profile: ProfileId;
  applied: boolean;
  results: StepResult[];
  summary: { applied: number; skipped: number; advisory: number; failed: number };
}

export const bootstrapTool: ToolDescriptor<BootstrapInput, BootstrapOutput> = {
  name: "forkctl_bootstrap",
  description:
    "Apply a bootstrap profile (contributor | starter-kit | internal-seed | client-delivery | experiment) to a freshly-created destination repo. Each profile is a sequence of executable + advisory aftercare steps. Set apply=false for dry-run.",
  inputSchema: BootstrapInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const dest = parseRepoRef(input.destination);
      const src = input.source ? parseRepoRef(input.source) : undefined;
      const profile = getProfile(input.profile);

      const results: StepResult[] = [];
      for (const stepId of profile.steps) {
        const exec = STEP_EXECUTORS[stepId];
        const stepCtx = {
          octokit: ctx.octokit,
          destinationOwner: dest.owner,
          destinationRepo: dest.repo,
          ...(src ? { sourceOwner: src.owner, sourceRepo: src.repo } : {}),
          apply: input.apply,
        };
        results.push(await exec(stepCtx));
      }

      const summary = {
        applied: results.filter((r) => r.outcome === "applied").length,
        skipped: results.filter((r) => r.outcome === "skipped").length,
        advisory: results.filter((r) => r.outcome === "advisory").length,
        failed: results.filter((r) => r.outcome === "failed").length,
      };

      return {
        destination: `${dest.owner}/${dest.repo}`,
        profile: input.profile,
        applied: input.apply,
        results,
        summary,
      };
    }),
};

import { parseRepoRef } from "../lib/github.js";
import { STEP_EXECUTORS } from "../lib/bootstrap-steps.js";
import { safe } from "../lib/result.js";
import {
  ConfigureUpstreamInputSchema,
  type ConfigureUpstreamInput,
} from "../schemas/bootstrap.js";
import type { ToolDescriptor } from "./types.js";

export interface ConfigureUpstreamOutput {
  destination: string;
  source: string;
  remoteCommands: string[];
  workflowInstalled: boolean;
  workflowPath: string;
  message: string;
}

/**
 * Wire upstream sync. Two halves:
 *
 *   (a) The git-remote half is local-only. We can't `git remote add upstream`
 *       on the user's machine via the API. We return the exact commands.
 *
 *   (b) The workflow half IS server-side. If installWorkflow=true we drop a
 *       .github/workflows/sync-upstream.yml that runs `gh repo sync` on cron.
 */
export const configureUpstreamTool: ToolDescriptor<
  ConfigureUpstreamInput,
  ConfigureUpstreamOutput
> = {
  name: "forkctl_configure_upstream",
  description:
    "Wire upstream sync between a fork and its source. Returns the local git remote commands (which the API cannot run for you) and optionally installs a sync-upstream GitHub Actions workflow that runs `gh repo sync` on a daily cron.",
  inputSchema: ConfigureUpstreamInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const dest = parseRepoRef(input.destination);
      const src = parseRepoRef(input.source);

      const remoteCommands = [
        `git clone https://github.com/${dest.owner}/${dest.repo}.git`,
        `cd ${dest.repo}`,
        `git remote add upstream https://github.com/${src.owner}/${src.repo}.git`,
        "git fetch upstream",
        `git checkout ${input.branch}`,
        `git rebase upstream/${input.branch}`,
      ];

      let workflowInstalled = false;
      const workflowPath = ".github/workflows/sync-upstream.yml";
      if (input.installWorkflow) {
        const result = await STEP_EXECUTORS.install_sync_workflow({
          octokit: ctx.octokit,
          destinationOwner: dest.owner,
          destinationRepo: dest.repo,
          sourceOwner: src.owner,
          sourceRepo: src.repo,
          apply: true,
        });
        workflowInstalled = result.outcome === "applied";
      }

      return {
        destination: `${dest.owner}/${dest.repo}`,
        source: `${src.owner}/${src.repo}`,
        remoteCommands,
        workflowInstalled,
        workflowPath,
        message: workflowInstalled
          ? "Upstream wired. Sync workflow installed and runs daily."
          : input.installWorkflow
            ? "Upstream commands ready. Sync workflow already existed (or could not be installed)."
            : "Upstream commands ready. Skipped workflow installation per input.",
      };
    }),
};

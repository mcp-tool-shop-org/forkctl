import { parseRepoRef } from "../lib/github.js";
import { resolveForkPolicy } from "../lib/policy.js";
import { fetchSnapshot } from "../lib/snapshot.js";
import { safe } from "../lib/result.js";
import { ChoosePathInputSchema, type ChoosePathInput } from "../schemas/assess.js";
import type { PathChoice, Goal } from "../schemas/common.js";
import type { ToolDescriptor } from "./types.js";

export interface ChoosePathOutput {
  repo: string;
  goal: Goal;
  recommendedPath: PathChoice;
  reasoning: string[];
  alternatives: { path: PathChoice; reason: string }[];
  policyAllowed: "yes" | "no" | "unknown";
}

/**
 * Decision logic:
 *
 *   contribute_upstream → fork (only path that preserves upstream link)
 *   ship_derivative     → template if isTemplate, else clone_detached
 *   internal_seed       → template if isTemplate, else fork
 *   client_copy         → template if isTemplate, else clone_detached
 *   experiment          → fork (cheap, deletable)
 *
 * Override: if fork is policy-blocked and a template is available, downgrade to template.
 */
export const choosePathTool: ToolDescriptor<ChoosePathInput, ChoosePathOutput> = {
  name: "forkctl_choose_path",
  description:
    "Recommend the right duplication path (fork | template | import | clone_detached) for a given source repo and adoption goal. Considers fork policy and template availability.",
  inputSchema: ChoosePathInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const { owner, repo } = parseRepoRef(input.repo);
      const [snap, verdict] = await Promise.all([
        fetchSnapshot(ctx.octokit, owner, repo),
        resolveForkPolicy(ctx.octokit, owner, repo),
      ]);

      const reasoning: string[] = [];
      const alternatives: { path: PathChoice; reason: string }[] = [];

      let recommended: PathChoice;
      switch (input.goal) {
        case "contribute_upstream":
          recommended = "fork";
          reasoning.push("Goal is to contribute back; fork preserves the upstream link required for sync and PRs.");
          alternatives.push({
            path: "clone_detached",
            reason: "Choose only if you do NOT plan to upstream changes — loses the link.",
          });
          break;
        case "ship_derivative":
          if (snap.isTemplate) {
            recommended = "template";
            reasoning.push("Source is a template repo; template generates a clean, history-free starter.");
          } else {
            recommended = "clone_detached";
            reasoning.push("Source is not a template; clone-detached gives a fresh independent product without phantom upstream link.");
            alternatives.push({
              path: "fork",
              reason: "Use a fork if you want to occasionally pull upstream improvements.",
            });
          }
          break;
        case "internal_seed":
          if (snap.isTemplate) {
            recommended = "template";
            reasoning.push("Template generates a clean copy — best when many internal teams will derive from the same seed.");
          } else {
            recommended = "fork";
            reasoning.push("Source isn't a template; fork preserves history and upstream sync option.");
          }
          break;
        case "client_copy":
          if (snap.isTemplate) {
            recommended = "template";
            reasoning.push("Per-client copy: template avoids leaking commits between clients.");
          } else {
            recommended = "clone_detached";
            reasoning.push("Per-client copy without template: clone-detached prevents any upstream entanglement.");
          }
          break;
        case "experiment":
          recommended = "fork";
          reasoning.push("Experiment: fork is cheap, deletable, and keeps the option to upstream a fix if the experiment proves something.");
          break;
      }

      // Override: fork blocked but template is an option
      if (recommended === "fork" && verdict.allowed === "no") {
        if (snap.isTemplate) {
          alternatives.unshift({
            path: "fork",
            reason: `Original recommendation. Blocked: ${verdict.reason}`,
          });
          recommended = "template";
          reasoning.push(`Fork is blocked by policy (${verdict.source}); source is a template, switching recommendation to template.`);
        } else {
          reasoning.push(`Fork is blocked by policy (${verdict.source}). Recommendation stands but will fail to execute — see preflight_policy.`);
        }
      }

      return {
        repo: `${owner}/${repo}`,
        goal: input.goal,
        recommendedPath: recommended,
        reasoning,
        alternatives,
        policyAllowed: verdict.allowed,
      };
    }),
};

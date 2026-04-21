import { parseRepoRef } from "../lib/github.js";
import { fetchSnapshot } from "../lib/snapshot.js";
import { scoreReadiness, type AdoptionReport } from "../lib/readiness.js";
import { safe } from "../lib/result.js";
import { AssessInputSchema, type AssessInput } from "../schemas/assess.js";
import type { ToolDescriptor } from "./types.js";

export const assessTool: ToolDescriptor<AssessInput, AdoptionReport> = {
  name: "forkctl_assess",
  description:
    "Score a GitHub repo's adoption-readiness. Returns weighted score (0–100), per-category scores, blockers with fixes, strengths, and the top 5 next actions.",
  inputSchema: AssessInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const { owner, repo } = parseRepoRef(input.repo);
      const snap = await fetchSnapshot(ctx.octokit, owner, repo);
      return scoreReadiness(snap);
    }),
};

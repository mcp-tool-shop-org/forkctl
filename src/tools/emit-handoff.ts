import { parseRepoRef } from "../lib/github.js";
import { getProfile } from "../lib/profiles.js";
import { safe } from "../lib/result.js";
import { EmitHandoffInputSchema, type EmitHandoffInput } from "../schemas/bootstrap.js";
import type { ToolDescriptor } from "./types.js";

export interface HandoffArtifact {
  destination: string;
  destinationUrl: string;
  source: string | null;
  profile: string | null;
  cloneCommands: string[];
  upstreamCommands: string[];
  caveats: { code: string; severity: "high" | "medium" | "low"; message: string; path?: string }[];
  nextAction: string;
}

/**
 * Single, truthful, machine-readable handoff for a freshly-prepared destination repo.
 * Combines: clone commands, upstream wiring (if a source is known), drift caveats,
 * and a single next-action sentence.
 */
export const emitHandoffTool: ToolDescriptor<EmitHandoffInput, HandoffArtifact> = {
  name: "forkctl_emit_handoff",
  description:
    "Emit a single, truthful handoff artifact for a destination repo: clone commands, upstream-wiring commands (if source provided), drift caveats, and the recommended next action. Designed to be the one thing forkctl returns at the end of an adoption flow.",
  inputSchema: EmitHandoffInputSchema,
  handler: (input) =>
    safe(async () => {
      const dest = parseRepoRef(input.destination);
      const src = input.source ? parseRepoRef(input.source) : null;

      const cloneCommands = [
        `git clone https://github.com/${dest.owner}/${dest.repo}.git`,
        `cd ${dest.repo}`,
      ];

      const upstreamCommands = src
        ? [
            `git remote add upstream https://github.com/${src.owner}/${src.repo}.git`,
            "git fetch upstream",
          ]
        : [];

      const caveats = (input.driftFindings ?? []).map((f) => {
        const c: HandoffArtifact["caveats"][number] = {
          code: f.code,
          severity: f.severity,
          message: f.message,
        };
        if (f.path !== undefined) c.path = f.path;
        return c;
      });

      const nextAction = computeNextAction(input.profile, caveats, !!src);

      return {
        destination: `${dest.owner}/${dest.repo}`,
        destinationUrl: `https://github.com/${dest.owner}/${dest.repo}`,
        source: src ? `${src.owner}/${src.repo}` : null,
        profile: input.profile ?? null,
        cloneCommands,
        upstreamCommands,
        caveats,
        nextAction,
      };
    }),
};

function computeNextAction(
  profileId: EmitHandoffInput["profile"],
  caveats: HandoffArtifact["caveats"],
  hasSource: boolean,
): string {
  const high = caveats.find((c) => c.severity === "high");
  if (high) return `Resolve high-severity caveat first: ${high.code} (${high.message})`;
  if (!profileId) {
    return hasSource
      ? "Clone the repo, wire the upstream remote, and start working."
      : "Clone the repo and start working.";
  }
  const profile = getProfile(profileId);
  return `Profile '${profile.id}' applied. ${profile.description} Continue per the profile's intent.`;
}

import { mapGitHubError, parseRepoRef } from "../lib/github.js";
import { scanFile, type DriftFinding } from "../lib/drift.js";
import { safe } from "../lib/result.js";
import { ScanDriftInputSchema, type ScanDriftInput } from "../schemas/bootstrap.js";
import type { ToolDescriptor } from "./types.js";

const SCAN_PATHS = [
  "README.md",
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "Makefile",
  ".env",
  ".env.local",
  "src/config.ts",
  "src/config.js",
] as const;

export interface ScanDriftOutput {
  destination: string;
  findings: DriftFinding[];
  filesScanned: number;
  filesNotFound: number;
}

export const scanDriftTool: ToolDescriptor<ScanDriftInput, ScanDriftOutput> = {
  name: "forkctl_scan_drift",
  description:
    "Scan a destination repo for hardcoded local paths, leaked secrets, and stale references to the source owner. Reports per-file findings with severity.",
  inputSchema: ScanDriftInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const dest = parseRepoRef(input.destination);
      const src = input.source ? parseRepoRef(input.source) : undefined;

      const findings: DriftFinding[] = [];
      let filesScanned = 0;
      let filesNotFound = 0;

      await Promise.all(
        SCAN_PATHS.map(async (path) => {
          try {
            const res = await ctx.octokit.rest.repos.getContent({
              owner: dest.owner,
              repo: dest.repo,
              path,
            });
            const data = res.data as { content?: string; encoding?: string; type?: string };
            if (data.type !== "file" || !data.content) return;
            const content = Buffer.from(
              data.content,
              (data.encoding ?? "base64") as BufferEncoding,
            ).toString("utf8");
            filesScanned++;
            findings.push(...scanFile(path, content, src?.owner));
          } catch (err) {
            const e = mapGitHubError(err);
            if (e.code === "GITHUB_NOT_FOUND") {
              filesNotFound++;
              return;
            }
            throw e;
          }
        }),
      );

      // Sort findings: high → medium → low
      const sevRank = { high: 0, medium: 1, low: 2 } as const;
      findings.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

      return {
        destination: `${dest.owner}/${dest.repo}`,
        findings,
        filesScanned,
        filesNotFound,
      };
    }),
};

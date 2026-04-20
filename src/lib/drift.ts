/**
 * Drift detection. Pure-ish: takes raw file contents (not Octokit) and produces
 * structured findings. The fetch layer (snapshot or scan tool) decides which
 * files to read.
 */

export type DriftSeverity = "high" | "medium" | "low";

export interface DriftFinding {
  code: string;
  severity: DriftSeverity;
  message: string;
  path: string;
  /** Optional excerpt — never includes secret values. */
  evidence?: string;
}

const ABSOLUTE_PATH_PATTERNS = [
  /[A-Z]:\\Users\\[A-Za-z0-9._-]+/g,
  /\/Users\/[A-Za-z0-9._-]+/g,
  /\/home\/[A-Za-z0-9._-]+/g,
];

interface SecretPattern {
  code: string;
  regex: RegExp;
  severity: DriftSeverity;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { code: "GITHUB_PAT", regex: /\b(ghp|ghu|gho|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}\b/g, severity: "high" },
  { code: "AWS_ACCESS_KEY", regex: /\bAKIA[0-9A-Z]{16}\b/g, severity: "high" },
  // OpenAI structural matches: project-scoped sk-proj-... (100+ chars of
  // [A-Za-z0-9_-]) or legacy sk-<48 alnum>. Both are real, parseable key shapes.
  { code: "OPENAI_KEY", regex: /\bsk-proj-[A-Za-z0-9_-]{100,}\b/g, severity: "high" },
  { code: "OPENAI_KEY", regex: /\bsk-[A-Za-z0-9]{48}\b/g, severity: "high" },
  // Fallback: the old loose prefix match. Kept at MEDIUM so truly-accidental
  // leaks (odd-length keys, placeholders, partial paste) still surface, but
  // don't get flagged at HIGH unless the structural pattern above matched.
  { code: "OPENAI_KEY", regex: /\bsk-[A-Za-z0-9]{20,}\b/g, severity: "medium" },
  { code: "GOOGLE_API_KEY", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: "high" },
];

export function scanFile(path: string, content: string, sourceOwner?: string): DriftFinding[] {
  const findings: DriftFinding[] = [];

  for (const pat of ABSOLUTE_PATH_PATTERNS) {
    const matches = content.match(pat);
    if (matches && matches.length > 0) {
      findings.push({
        code: "HARDCODED_LOCAL_PATH",
        severity: "medium",
        message: `Hardcoded local filesystem path detected.`,
        path,
        evidence: matches[0],
      });
      break;
    }
  }

  // Track the best (highest-severity) finding per secret code so the loose
  // fallback OpenAI pattern doesn't add a duplicate LEAKED_OPENAI_KEY when
  // the structural pattern already matched at HIGH.
  const secretSeverityRank: Record<DriftSeverity, number> = { low: 0, medium: 1, high: 2 };
  const bestByCode = new Map<string, DriftFinding>();
  for (const { code, regex, severity } of SECRET_PATTERNS) {
    const m = content.match(regex);
    if (m && m.length > 0) {
      const finding: DriftFinding = {
        code: `LEAKED_${code}`,
        severity,
        message: `Possible ${code} secret leaked in committed file.`,
        path,
        // Never include the value itself.
        evidence: "<redacted>",
      };
      const prev = bestByCode.get(finding.code);
      if (!prev || secretSeverityRank[severity] > secretSeverityRank[prev.severity]) {
        bestByCode.set(finding.code, finding);
      }
    }
  }
  for (const finding of bestByCode.values()) findings.push(finding);

  if (sourceOwner) {
    const stale = new RegExp(`\\b${escapeRe(sourceOwner)}/[A-Za-z0-9._-]+`, "g");
    const matches = content.match(stale);
    if (matches && matches.length > 0) {
      findings.push({
        code: "STALE_SOURCE_REFERENCE",
        severity: "low",
        message: `References to the original source owner remain — may need to be rewritten for the new home.`,
        path,
        evidence: matches[0],
      });
    }
  }

  return findings;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

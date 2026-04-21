import type { SiteConfig } from '@mcptoolshop/site-theme';
import counts from './data/counts.json';

export const config: SiteConfig = {
  title: '@mcptoolshop/forkctl',
  description: 'Adoption control plane for GitHub repos. Assess, choose path, fork or template, bootstrap, sync. MCP server + CLI.',
  logoBadge: 'F',
  brandName: 'forkctl',
  repoUrl: 'https://github.com/mcp-tool-shop-org/forkctl',
  npmUrl: 'https://www.npmjs.com/package/@mcptoolshop/forkctl',
  footerText: 'MIT Licensed — built by <a href="https://mcp-tool-shop.github.io/" style="color:var(--color-muted);text-decoration:underline">MCP Tool Shop</a>',

  hero: {
    badge: `v${counts.version} · ${counts.tools} tools · ${counts.tests} tests`,
    headline: 'Adoption control plane',
    headlineAccent: 'for GitHub repos.',
    description:
      'Forking is one click. Adoption is everything else. forkctl assesses readiness, picks fork vs template, executes the copy as a tracked async operation, leaves the result runnable, and keeps it synced.',
    primaryCta: { href: '#usage', label: 'Quick start' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Assess', code: 'npx @mcptoolshop/forkctl assess octocat/hello-world' },
      { label: 'Choose path', code: 'npx @mcptoolshop/forkctl choose-path octocat/hello-world --goal contribute_upstream' },
      { label: 'Sync a fork', code: 'npx @mcptoolshop/forkctl sync myhandle/my-fork' },
      { label: 'Fleet health', code: 'npx @mcptoolshop/forkctl fleet-health' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Seven layers, one product',
      subtitle: 'Forkctl is not a fork wrapper. It is end-to-end adoption infrastructure.',
      features: [
        {
          title: 'Assessment',
          desc: 'Score a repo\'s adoption-readiness across legal, setup, contribution, hygiene, template, and sync. Get blockers with fixes.',
        },
        {
          title: 'Execution',
          desc: 'Async-aware fork or template generation with a real operation state machine. Surfaces enterprise/org policy blockers before the call.',
        },
        {
          title: 'Bootstrap',
          desc: 'Five profiles (contributor, starter-kit, internal-seed, client-delivery, experiment). Idempotent — never overwrites existing files.',
        },
        {
          title: 'Sync',
          desc: 'Real GitHub merge-upstream API. Cross-repo divergence diagnosis. Diverged forks route to a PR — never force-pushes.',
        },
        {
          title: 'Fleet',
          desc: 'List, health-check, and batch-sync your forks. Conflicts surface as conflicts, not errors. Rate-limit-friendly.',
        },
        {
          title: 'Receipts',
          desc: 'Append-only SQLite audit log. Every operation has a machine-readable receipt. Tokens are redacted at write time.',
        },
        {
          title: 'Rename · new in v1.1.0',
          desc: 'AST-aware polyglot rename. Identity files, code symbols (tree-sitter, 26 languages), textual surfaces, lockfile regen. Reviewable diff, snapshotted apply, one-command rollback.',
        },
      ],
    },

    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Quick start',
      cards: [
        {
          title: 'Audit a repo',
          code: 'npx @mcptoolshop/forkctl assess octocat/hello-world',
        },
        {
          title: 'Pick the right path',
          code: 'npx @mcptoolshop/forkctl choose-path octocat/hello-world \\\n  --goal contribute_upstream',
        },
        {
          title: 'Fork it (async, tracked)',
          code: 'npx @mcptoolshop/forkctl create-fork octocat/hello-world \\\n  --destination-org my-org',
        },
        {
          title: 'Sync your fork',
          code: 'npx @mcptoolshop/forkctl sync myhandle/my-fork',
        },
        {
          title: 'Bootstrap with a profile',
          code: 'npx @mcptoolshop/forkctl bootstrap myhandle/my-fork \\\n  --source octocat/hello-world \\\n  --profile contributor',
        },
        {
          title: 'Use as an MCP server',
          code: '{\n  "mcpServers": {\n    "forkctl": {\n      "command": "npx",\n      "args": ["-y", "@mcptoolshop/forkctl", "mcp"],\n      "env": { "GITHUB_TOKEN": "ghp_..." }\n    }\n  }\n}',
        },
      ],
    },

    {
      kind: 'features',
      id: 'tools',
      title: 'The twenty-two tools',
      subtitle: 'Every tool is schema-validated, audit-logged, and exposed through both MCP and CLI.',
      features: [
        {
          title: 'Assessment · 3',
          desc: 'forkctl_assess · forkctl_choose_path · forkctl_make_forkable',
        },
        {
          title: 'Execution · 4',
          desc: 'forkctl_preflight_policy · forkctl_create_fork · forkctl_create_from_template · forkctl_check_operation',
        },
        {
          title: 'Bootstrap · 4',
          desc: 'forkctl_bootstrap · forkctl_configure_upstream · forkctl_scan_drift · forkctl_emit_handoff',
        },
        {
          title: 'Sync · 3',
          desc: 'forkctl_sync · forkctl_diagnose_divergence · forkctl_propose_sync_pr',
        },
        {
          title: 'Fleet · 3',
          desc: 'forkctl_list_forks · forkctl_fleet_health · forkctl_batch_sync',
        },
        {
          title: 'Receipts · 2',
          desc: 'forkctl_receipt · forkctl_audit_log',
        },
        {
          title: 'Rename · 3 · new',
          desc: 'forkctl_rename_plan · forkctl_rename_apply · forkctl_rename_rollback',
        },
      ],
    },
  ],
};

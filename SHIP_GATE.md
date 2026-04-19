# Ship Gate — forkable

Tracked against [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck) v1.0+ standards. Hard gates A–D block release.

## Gate A — Security

- [x] SECURITY.md present with threat model
- [x] Threat model section in README (link to SECURITY.md)
- [x] No secrets committed; `.env.example` only
- [x] No telemetry, no outbound calls beyond configured GitHub API
- [ ] Tool inputs validated through Zod (untrusted-input rule)
- [ ] Dependency scan passing on CI

## Gate B — Errors

- [ ] Structured error shape: `{ code, message, hint }` for every tool
- [ ] CLI exits with non-zero on tool failure
- [ ] No raw stack traces in user-facing output
- [ ] MCP error responses set `isError: true` per spec

## Gate C — Docs

- [x] README current and complete
- [x] CHANGELOG present (Keep a Changelog)
- [x] LICENSE present (MIT)
- [ ] `--help` accurate for every CLI subcommand
- [ ] Tool description strings match behavior

## Gate D — Hygiene

- [ ] `npm run verify` passes (typecheck + test + build)
- [x] Version matches tag (v1.0.0)
- [ ] Dependency scanning enabled
- [x] Clean packaging (`files` field in package.json restricts publish to dist + docs)

## Gate E — Polish (non-blocking but required for full treatment)

- [ ] Logo / wordmark
- [ ] Translations (full-treatment)
- [ ] Landing page entry on marketing site
- [ ] Starlight handbook page connected to landing
- [ ] GitHub repo metadata (description, topics, homepage)

---

Update this file as gates flip green during build. The README scorecard reflects the actual state of this file, not estimates.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial scaffold: MCP server + CLI surface, six product layers (assessment, execution, bootstrap, sync, fleet, receipts).
- TypeScript / Node 20+ / ESM, Zod schemas on every tool input.
- SQLite state store for async operations and audit log.
- CI workflow (paths-gated, ubuntu-latest, concurrency-guarded).
- SHIP_GATE.md, SECURITY.md, threat model, MIT license.

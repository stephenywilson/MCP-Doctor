# Changelog

All notable changes to MCP Doctor will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-05-04

### Added

- `mcp-doctor scan` command with full config diagnosis
- `--config <path>` option to scan a specific MCP config file
- `--out <directory>` option to set the output directory
- `--json` flag to generate a machine-readable JSON report
- `--no-html` flag to skip HTML report generation
- `mcp-doctor list-configs` command to show all detected config locations
- Auto-detection for Claude Desktop (macOS/Windows), Cursor (project/global), `.mcp.json`, XDG config
- JSON parsing with detailed error messages for invalid configs
- 20+ diagnostic checks across 7 categories:
  - Config file problems (invalid JSON, missing keys, wrong types)
  - Command and path problems (shell operators, relative paths, missing `command`)
  - Executable availability (node, npx, uv, uvx, python, python3, docker, bun, deno)
  - GUI app PATH warnings for macOS
  - Env/token analysis (empty values, placeholder detection, secret masking)
  - Filesystem risk detection (root `/` access, home directory access)
  - Network and token risk detection (GitHub, Slack, Notion, Postgres, browser automation)
- Risk scoring: 0–100 score with HIGH/MEDIUM/LOW deductions
- Report status: OK, NEEDS_REVIEW, BROKEN, RISKY
- Markdown report (`MCP_DOCTOR_REPORT.md`) with findings table, details, and fix suggestions
- HTML report (`mcp-doctor-report.html`) with dark theme, score ring, server cards, grouped findings
- JSON report (`mcp-doctor-report.json`) with masked secrets
- Secret masking — secrets never appear in full in any report
- Example broken configs (5 files covering common failure patterns)
- Documentation: what-mcp-doctor-checks.md, common-mcp-errors.md, supported-clients.md, risk-model.md, safe-config-examples.md
- Smoke test suite (`npm run smoke`)
- GitHub Actions CI for Node 18, 20, 22

### Security

- No data is sent to any network
- No telemetry or analytics
- Config files are never modified
- Secrets in env vars are masked in all reports

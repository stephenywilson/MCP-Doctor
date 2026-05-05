# Changelog

All notable changes to MCP Doctor will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] — 2026-05-05

### Added

- **`mcp-doctor firewall init`** — Create a local policy file (`mcp-doctor.firewall.json`) with sensible defaults for sensitive paths and per-category rules.
- **`mcp-doctor firewall audit --file <path>`** — Audit one or more MCP tool call payloads from a JSON file. Prints risk level, recommended action, and reasons per call. Writes `MCP_TOOL_AUDIT_REPORT.md`.
- **`mcp-doctor firewall audit --stdin`** — Same as above, reading from stdin (pipe-friendly).
- **`mcp-doctor firewall demo`** — Built-in demo covering: safe read (LOW/ALLOW), package.json write (CRITICAL/BLOCK), .env write (CRITICAL/BLOCK), `rm -rf` shell command (CRITICAL/BLOCK), network request with token (HIGH/BLOCK).
- **`mcp-doctor firewall report`** — Run audit and always write the Markdown report. Defaults to demo if no `--file` given.
- **Risk classifier** (`src/firewall/classifier.ts`) — Classifies tool calls into categories (READ/WRITE/DELETE/EXECUTE/SECRET/NETWORK/DATABASE/GIT/UNKNOWN) and severity levels (LOW/MEDIUM/HIGH/CRITICAL). Detects sensitive paths (`.env`, `.ssh`, `package.json`, etc.), sensitive arg keys (`token`, `api_key`, `secret`, etc.), and dangerous command patterns (`rm -rf`, `eval`, `curl | bash`, etc.).
- **Policy engine** (`src/firewall/policy.ts`) — Loads `mcp-doctor.firewall.json` from CWD. Falls back to built-in defaults. First-match rule wins.
- **Audit report writer** (`src/firewall/reporter.ts`) — Generates `MCP_TOOL_AUDIT_REPORT.md` with per-call table, findings, verdict, and next steps.
- **Demo data** (`src/firewall/demo.ts`) — Five built-in tool call scenarios.
- **Example payloads** (`examples/tool-calls/`) — `safe-read-file.json`, `risky-write-package-json.json`, `critical-write-env.json`, `dangerous-shell-command.json`, `network-request-with-token.json`, `mixed-batch.json`.
- **Docs** — `docs/tool-call-audit.md`, `docs/firewall-policy.md`.
- Smoke test expanded from 19 to 30 assertions.

### Changed

- README repositioned: "Diagnose, safely install, and audit MCP servers."
- Version bumped to 0.3.0 across CLI, reporters, package.json.

### Not included in v0.3.0

- Live MCP proxy (planned for v0.4.0)
- Real-time allow/ask/block enforcement (planned for v0.4.0)
- Cloud or account features (out of scope)

---

## [0.2.0] — 2026-05-05

### Added

- **`mcp-doctor preview [configPath]`** — Risk preview before installing any MCP config. Prints per-server risk levels (HIGH/MEDIUM/LOW), reasons, and recommendations. Read-only, no secrets printed.
- **`mcp-doctor inspect [configPath]`** — Detailed server-by-server inspection with risk analysis, env var names (values redacted), detected filesystem paths, and safer suggestions. `--report` flag writes `MCP_DOCTOR_SAFE_INSTALL_REPORT.md`.
- **`mcp-doctor safe-config [configPath]`** — Generates a safer MCP config: replaces broad filesystem paths with `~/projects/YOUR_PROJECT`, replaces all env values with `${VAR_NAME}` shell placeholders. Supports `--client claude|cursor|vscode|generic`, `--out <dir>`, `--no-write`.
- **Risk analyzer** (`src/safe-install/risk-analyzer.ts`) — Static analysis engine detecting HIGH/MEDIUM/LOW risk patterns: broad filesystem paths, shell commands, high-privilege credential env vars, network/API integrations, relative path execution, and remote package execution.
- **Safe config generator** (`src/safe-install/safe-config-generator.ts`) — Produces valid JSON with redacted env values and scoped path suggestions.
- **Report writer** (`src/safe-install/report-writer.ts`) — Generates Markdown safe install reports.
- New example: `examples/safe-install-preview/` with intentionally risky config and usage README.
- Updated smoke test to cover all three new commands (11 checks total).

### Changed

- Package description updated: "Diagnose, inspect, and safely configure MCP servers"
- README repositioned with v0.2.0 Safe Install Preview section
- Version bumped to 0.2.0 across CLI, reporters, package.json

### Security

- `preview`, `inspect`, and `safe-config` never execute MCP servers
- No secret values are printed at any point
- No real client configs are modified
- All analysis is local and offline

---

## [0.1.3] — 2026-05-05

### Fixed

- Fixed README Markdown table rendering on GitHub and npm by using `| --- | --- |` separator format (spaces inside pipes required by GFM spec)
- All four tables now render correctly: What It Checks, Reports Generated, Supported Clients, Examples
- Kept MarketLayer-style HTML report design unchanged
- Confirmed all README image references exist and are valid

---

## [0.1.2] — 2026-05-04

### Changed

- Reworked HTML report visual style to match MarketLayer/Catalayer product console (exact `ml-bg`, `ml-panel`, `ml-accent` token values; `rounded-sm` pills; verdict panel; two-column findings + fixes layout)
- Regenerated README HTML report preview PNG from the new design

### Fixed

- Updated terminal demo block in README to show current version
- Updated `terminal-demo.svg` version badge
- Normalized Markdown table separator rows to `|---|---|` for consistent GitHub rendering
- Synced version string across CLI, HTML reporter, and Markdown reporter

---

## [0.1.1] — 2026-05-04

### Fixed

- Replaced fragile HTML report preview SVG (had undefined XML entity `&thinsp;`) with a PNG screenshot generated from the actual report
- Fixed broken image in GitHub and npm README
- Updated version string across CLI, HTML reporter, and Markdown reporter

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

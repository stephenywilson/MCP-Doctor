# MCP Config Audit

MCP Config Audit scans MCP server configuration files for risky permissions before those servers are connected to Claude Desktop, Cursor, VS Code, or another MCP client.

```bash
mcp-doctor config-audit
mcp-doctor config-audit --config examples/risky-config-audit-config.json
```

## What it scans

- Claude Desktop MCP config
- Cursor MCP config
- Project-level `.mcp.json` and `.cursor/mcp.json`
- Local `mcp.json`, `mcp.config.json`, `.mcp/config.json`, and `.mcp/mcp.json`
- Explicit JSON files passed with `--config`

The scan is static. MCP Doctor reads JSON config files, parses `mcpServers`, and does not execute server commands.

## Risk signals

Critical findings include shell execution, suspicious command patterns, plaintext API keys or tokens, and filesystem access to the home directory or root directory.

High findings include network-connected servers, local executables, unpinned package execution, sensitive environment variable references, and broad filesystem paths.

Medium findings include missing descriptions, unknown server sources, weak documentation, and missing allowlist-like policy fields.

Low findings include local-only patterns, limited path access, and no sensitive env usage detected.

## Reports

`mcp-doctor config-audit` writes:

- `MCP_CONFIG_AUDIT_REPORT.md`
- `mcp-config-audit-report.json`

Reports include scanned config files, detected MCP servers, risk score, risk level, findings grouped by severity, remediation suggestions, and safe configuration recommendations.

Risk score ranges:

| Score | Level |
| --- | --- |
| 0-39 | Low |
| 40-69 | Medium |
| 70-84 | High |
| 85-100 | Critical |

## Safe configuration recommendations

- Restrict filesystem paths to the smallest project directory needed.
- Move secrets to environment variables instead of storing plaintext values in JSON.
- Pin package versions for MCP servers launched through `npx`, `uvx`, or similar package runners.
- Remove unknown servers that are not actively needed.
- Document each server purpose, source, expected tools, and required permissions.
- Use allowlists where your MCP client or server wrapper supports them.

## Privacy

MCP Doctor runs locally and does not send your MCP configuration, API keys, or project files to any external service.

MCP Doctor has no telemetry. Secret values are redacted in generated JSON reports.


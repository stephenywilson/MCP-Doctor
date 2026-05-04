# Safe Install Preview — Example

This example shows how to use MCP-Doctor's v0.2.0 `preview`, `inspect`, and `safe-config` commands before adding an MCP config to Claude Desktop, Cursor, VS Code, or any other AI tool.

---

## What's in this example

`unsafe-mcp-config.json` is an intentionally risky MCP config containing:

- **filesystem** — grants broad access to `/Users/stephen` (the entire home directory)
- **github** — requires `GITHUB_TOKEN` with a placeholder value
- **local-helper** — runs a local shell script (`./scripts/helper.sh`) with an `API_SECRET` env var

None of these are safe to install without review.

---

## Commands to try

### 1. Preview risks

```bash
mcp-doctor preview examples/safe-install-preview/unsafe-mcp-config.json
```

Prints a risk summary for each server. Fast, read-only. No output files.

### 2. Detailed inspection with report

```bash
mcp-doctor inspect examples/safe-install-preview/unsafe-mcp-config.json --report
```

Prints full per-server inspection and writes `MCP_DOCTOR_SAFE_INSTALL_REPORT.md`.

### 3. Generate a safer config

```bash
mcp-doctor safe-config examples/safe-install-preview/unsafe-mcp-config.json --client claude
```

Writes `MCP_DOCTOR_SAFE_CONFIG.example.json` with:
- broad paths replaced by `~/projects/YOUR_PROJECT`
- env values replaced by `${VARIABLE_NAME}` placeholders

### 4. Print safe config to stdout only

```bash
mcp-doctor safe-config examples/safe-install-preview/unsafe-mcp-config.json --client claude --no-write
```

---

## Why home directory access is risky

Granting an MCP server access to `/Users/stephen` means the server can read and potentially write:

- `~/.ssh/` — SSH private keys
- `~/.aws/` — AWS credentials
- `~/Documents/` — all documents
- `~/Desktop/` — all files on Desktop
- `~/Downloads/` — all downloaded files
- Any file in your home directory

If the MCP server has a vulnerability, or the underlying package is compromised, an attacker could read your private keys, credentials, and personal files.

**Always scope filesystem access to a specific project folder:**

```json
"args": ["-y", "@modelcontextprotocol/server-filesystem", "~/projects/my-project"]
```

---

## Safety guarantees

MCP-Doctor:
- **Never executes** unknown MCP server packages or scripts
- **Never modifies** your real Claude Desktop, Cursor, or VS Code config
- **Never prints** secret or token values — only env var names
- **Never sends** data to external services
- Works fully offline

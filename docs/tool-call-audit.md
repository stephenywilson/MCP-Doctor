# Tool Call Audit — MCP Doctor v0.3.0

## What it does

Tool Call Audit inspects MCP tool call payloads and classifies each one by risk level before it reaches your filesystem, shell, or external services.

An AI agent connected to an MCP server can silently call tools like `write_file`, `execute_command`, or `http_request`. Without audit visibility, these calls are invisible until something goes wrong.

MCP Doctor v0.3.0 gives you a local, offline preview of what a set of tool calls would do — and whether any of them should be blocked.

## What it does NOT do (v0.3.0)

- Does not intercept live MCP traffic
- Does not act as a network proxy
- Does not execute any tool calls
- Does not send data to external services
- Does not modify Claude Desktop, Cursor, or VS Code config

This is an audit preview. A future v0.4.0 release may add live proxy interception.

---

## Commands

### `mcp-doctor firewall init`

Creates a local policy file (`mcp-doctor.firewall.json`) in the current directory.

```bash
mcp-doctor firewall init
```

Edit the policy to customise which actions are blocked, which require confirmation, and which paths are treated as sensitive.

---

### `mcp-doctor firewall demo`

Runs five built-in demo cases showing the full severity range:

```bash
mcp-doctor firewall demo
```

Output includes:
- Safe file read → LOW → ALLOW
- Write to `package.json` → CRITICAL → BLOCK
- Write to `.env` → CRITICAL → BLOCK
- Shell command with `rm -rf` → CRITICAL → BLOCK
- Network request with `token` argument → HIGH → BLOCK

Also writes `MCP_TOOL_AUDIT_REPORT.md`.

---

### `mcp-doctor firewall audit --file <path>`

Audit a JSON file containing one or more tool call events:

```bash
mcp-doctor firewall audit --file examples/tool-calls/mixed-batch.json
```

Use `--policy <path>` to load a custom policy:

```bash
mcp-doctor firewall audit \
  --file my-tool-calls.json \
  --policy mcp-doctor.firewall.json
```

### `mcp-doctor firewall audit --stdin`

Pipe tool call JSON from stdin:

```bash
cat my-tool-call.json | mcp-doctor firewall audit --stdin
```

---

### `mcp-doctor firewall report`

Run audit and always write `MCP_TOOL_AUDIT_REPORT.md`. Defaults to demo if no `--file` is given:

```bash
mcp-doctor firewall report --file examples/tool-calls/mixed-batch.json
```

---

## Input format

### Internal format (simple)

```json
{
  "server": "filesystem",
  "tool": "write_file",
  "arguments": {
    "path": ".env",
    "content": "API_KEY=example"
  }
}
```

### JSON-RPC format (MCP protocol)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "write_file",
    "arguments": {
      "path": ".env",
      "content": "API_KEY=example"
    }
  }
}
```

### Batch (array of calls)

```json
[
  { "server": "fs", "tool": "read_file", "arguments": { "path": "src/index.ts" } },
  { "server": "fs", "tool": "write_file", "arguments": { "path": ".env", "content": "KEY=val" } }
]
```

---

## Severity levels

| Severity | When |
| --- | --- |
| LOW | Safe reads, no sensitive paths or args |
| MEDIUM | Network requests, database reads, unknown tools |
| HIGH | Writes, Git push/commit, network + token args |
| CRITICAL | `.env` write, `rm -rf`, `.ssh` access, shell execution, root paths |

---

## How this relates to Safe Install

| Feature | When to use |
| --- | --- |
| `mcp-doctor preview` | Before installing an MCP server config |
| `mcp-doctor firewall audit` | Before connecting a server to an AI agent |

Safe Install checks configuration risk. Tool Call Audit checks runtime behaviour risk.

---

## Roadmap

| Version | Feature |
| --- | --- |
| v0.3.0 | Static audit preview (this version) |
| v0.4.0 | Live MCP proxy with allow/ask/block controls |

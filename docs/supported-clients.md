# Supported MCP Clients

MCP Doctor v0.1.0 auto-detects config files for the following clients.

---

## Auto-Detected Clients

### Claude Desktop (macOS)
- Config: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Format: `{ "mcpServers": { ... } }`

### Claude Desktop (Windows)
- Config: `%APPDATA%\Claude\claude_desktop_config.json`
- Format: same as macOS

### Cursor (project-level)
- Config: `.cursor/mcp.json` in your project root
- Format: `{ "mcpServers": { ... } }`

### Cursor (global)
- Config: `~/.cursor/mcp.json`
- Format: same as project-level

### MCP (project root)
- Config: `.mcp.json` in your project root
- Format: `{ "mcpServers": { ... } }`

### MCP (XDG config)
- Config: `~/.config/mcp/config.json`
- Format: `{ "mcpServers": { ... } }`

---

## Scan Any Config

You can scan any MCP JSON file regardless of client:

```bash
mcp-doctor scan --config /path/to/your/mcp-config.json
```

---

## Client Auto-Detection is Expanding

v0.1.0 focuses on the most commonly used clients. Future versions may add:

- VS Code / Cline
- Windsurf
- Continue.dev
- Zed
- Other IDE extensions that support MCP

If your client uses a `{ "mcpServers": { ... } }` format, you can already scan it with `--config`.

---

## Not Supported in v0.1.0

- Clients that use non-JSON config formats (TOML, YAML)
- Clients with encrypted or binary config storage
- Remote or cloud-hosted MCP configurations

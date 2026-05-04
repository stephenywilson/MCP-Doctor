# Safe MCP Config Examples

These examples follow best practices for MCP server configuration.

---

## Minimal Safe Config (npx)

```json
{
  "mcpServers": {
    "my-server": {
      "command": "/opt/homebrew/bin/npx",
      "args": ["-y", "my-mcp-package"]
    }
  }
}
```

Key points:
- Uses absolute path for `npx` to avoid GUI PATH issues
- No env block if no env vars needed

---

## With API Token (masked in report)

```json
{
  "mcpServers": {
    "github": {
      "command": "/opt/homebrew/bin/npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_yourActualTokenHere"
      }
    }
  }
}
```

Key points:
- Token is a real value (not a placeholder)
- MCP Doctor will MEDIUM-flag that a secret is in the config file (this is informational)
- To avoid the flag: use a shell script wrapper that injects the token from a secrets manager

---

## Python/uv Server (macOS Apple Silicon)

```json
{
  "mcpServers": {
    "my-python-tool": {
      "command": "/Users/yourname/.local/bin/uvx",
      "args": ["my-mcp-tool"],
      "env": {
        "PYTHONPATH": "/Users/yourname/my-project"
      }
    }
  }
}
```

Run `which uvx` to find your absolute path.

---

## Filesystem Server (scoped to project)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "/opt/homebrew/bin/npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "--directory",
        "/Users/yourname/my-project"
      ]
    }
  }
}
```

Key points:
- Scoped to a specific project directory (not `~` or `/`)
- Uses absolute path for npx

---

## Multiple Servers

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "/opt/homebrew/bin/npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "--directory", "/Users/yourname/projects/myapp"]
    },
    "github": {
      "command": "/opt/homebrew/bin/npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_yourTokenHere"
      }
    }
  }
}
```

---

## Finding Your Absolute Paths

```bash
which npx       # → /opt/homebrew/bin/npx  (Apple Silicon)
which uv        # → /home/user/.local/bin/uv
which uvx       # → /home/user/.local/bin/uvx
which python3   # → /opt/homebrew/bin/python3
which docker    # → /usr/local/bin/docker
```

Use these absolute paths in your `"command"` field.

---

## Config File Locations

| Client | Path |
|--------|------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor (project) | `.cursor/mcp.json` |
| Cursor (global) | `~/.cursor/mcp.json` |
| MCP (project) | `.mcp.json` |

After editing, **fully restart** your MCP client. Config is read at startup only.

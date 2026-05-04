# Common MCP Errors and How to Fix Them

Search terms: MCP server not working, Claude Desktop MCP not working, Cursor MCP not connecting,
MCP tools not showing, spawn npx ENOENT, spawn uv ENOENT, env variables not loading,
wrong config file, invalid claude_desktop_config.json

---

## spawn npx ENOENT

**What it means:** The MCP host tried to run `npx` but couldn't find it.

**Why it happens:** GUI apps (Claude Desktop, Cursor) do not inherit your terminal's shell PATH. Even if `npx` works in your terminal, the GUI app may not find it.

**Fix:**

1. Find the absolute path: `which npx`
2. Use it in your config:

```json
{
  "command": "/opt/homebrew/bin/npx"
}
```

Common locations:
- Apple Silicon Mac: `/opt/homebrew/bin/npx`
- Intel Mac: `/usr/local/bin/npx`
- Linux: `/usr/bin/npx` or `/usr/local/bin/npx`

---

## spawn uv ENOENT / spawn uvx ENOENT

Same cause as above. Find the path with `which uv` or `which uvx`.

`uv` is usually installed at:
- `~/.local/bin/uv` (Linux)
- `~/.cargo/bin/uv` (Rust-based install)

```json
{
  "command": "/home/user/.local/bin/uvx"
}
```

---

## MCP server not connecting / tools not showing

Possible causes in order of likelihood:

1. **Config file in wrong location** — Run `mcp-doctor list-configs` to see detected paths.
2. **Invalid JSON** — Even one missing comma breaks the entire file. Validate with `cat <path> | python3 -m json.tool`.
3. **Command not found** — Use `mcp-doctor scan` to check executable availability.
4. **Missing or empty env vars** — The server may fail silently if required tokens are missing.
5. **Wrong package name** — Confirm the npm package exists: `npm show <package>`.
6. **Server crash** — Check logs in your MCP client.

---

## invalid claude_desktop_config.json

**Fix:**
1. Open the file in a text editor
2. Look for: missing commas between fields, trailing commas, unmatched brackets/braces
3. Validate online at https://jsonlint.com or:
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool
   ```

---

## env variables not loading

MCP env variables only apply within the server process. They do not get set in the terminal.

Common mistakes:
- Putting the env block in the wrong place (must be inside the server object, not at root)
- Using `"env": null` or `"env": []` (must be an object)
- Leaving token values empty or as placeholders

Correct structure:
```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "my-package"],
      "env": {
        "MY_API_KEY": "actual-value-here"
      }
    }
  }
}
```

---

## Claude Desktop MCP not working after restart

1. Fully quit Claude Desktop (don't just close the window)
2. Reopen — config is read at startup only
3. Check the config file location: `~/Library/Application Support/Claude/claude_desktop_config.json`
4. Run `mcp-doctor scan` to verify the config is valid

---

## Cursor MCP not connecting

Cursor reads MCP config from `.cursor/mcp.json` in your project directory, or `~/.cursor/mcp.json` globally.

1. Check both locations: `mcp-doctor list-configs`
2. Ensure the config file contains valid JSON
3. Restart the Cursor window/workspace after editing

---

## Tools not appearing in Claude / Cursor

If the MCP server starts but tools don't show:

1. The server may have started but returned no tools — check server logs
2. The MCP server package may not implement any tools (check its README)
3. There may be a version mismatch between the MCP SDK and host
4. The server may require specific env vars to initialize its tool list

---

## Wrong config file location

Run `mcp-doctor list-configs` to see all known locations and which ones exist on your machine.

You can always scan a specific file: `mcp-doctor scan --config /path/to/your/config.json`

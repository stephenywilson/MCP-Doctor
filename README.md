# MCP Doctor

Diagnose and fix broken MCP servers.

MCP Doctor helps developers debug MCP servers that do not work in Claude Desktop, Cursor, VS Code, Cline, and other AI tools.

It checks the real failure points:
- wrong config file location
- invalid JSON
- missing `node`, `npx`, `uv`, `uvx`, `python`, or `docker`
- GUI apps not inheriting your shell PATH (`spawn npx ENOENT`)
- missing env vars and API tokens
- MCP servers showing no tools, prompts, or resources
- tools not appearing after install
- unsafe filesystem access
- risky MCP permissions

Run one command before wasting another hour on MCP config.

```
❯ mcp-doctor scan

  MCP Doctor v0.1.2
  Diagnose and fix broken MCP server configs

  Found 1 config:
    ✓  Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json

  Running diagnostics...

  ── Results ──

  Score:   24/100
  Status:  ❌ BROKEN
  Servers: 3
  Findings: 6 total

  HIGH    Server missing required "command" field  [broken-no-command]
          ↳ Add a "command" field to server "broken-no-command"
  HIGH    Placeholder value detected: GITHUB_TOKEN  [github]
          ↳ Replace the placeholder with your real GITHUB_TOKEN value
  HIGH    Filesystem server has overly broad access  [filesystem]
          ↳ Scope filesystem access to your project directory
  MEDIUM  GUI app PATH may not include your shell PATH  [filesystem]

  ── Writing Reports ──

  ✓  Markdown: MCP_DOCTOR_REPORT.md
  ✓  HTML:     mcp-doctor-report.html

  ❌  BROKEN — Fix HIGH severity issues to get your MCP servers working.
```

![Terminal Demo](docs/assets/terminal-demo.svg)

![HTML Report Preview](docs/assets/html-report-preview.png)

---

## Why MCP Doctor Exists

MCP servers fail silently and often. The error messages are unhelpful. The config format is simple JSON — but the failure modes are not:

- `spawn npx ENOENT` — GUI app can't find npx because it doesn't inherit your shell PATH
- Tools don't appear — empty args, missing command, or token not set
- JSON parse error — one missing comma breaks the entire config
- Token set but wrong — placeholder like `YOUR_API_KEY` left in place
- Filesystem server grants access to `/Users` or `/` — works but dangerous

MCP Doctor scans your config, detects these patterns, and tells you exactly what to fix.

---

## Quick Start

**Install from npm** (package is scoped — the unscoped `mcp-doctor` name was already taken):

```bash
npm install -g @stephenywilson/mcp-doctor

mcp-doctor scan
```

**Or build from source:**

```bash
git clone https://github.com/stephenywilson/MCP-Doctor.git
cd MCP-Doctor
npm install
npm run build
npm link

mcp-doctor scan
```

**Common commands:**

```bash
# Scan auto-detected MCP configs
mcp-doctor scan

# Scan a specific config file
mcp-doctor scan --config ~/.cursor/mcp.json

# Scan with JSON output
mcp-doctor scan --json

# Choose output directory
mcp-doctor scan --out ~/Desktop/mcp-report

# List all auto-detected config locations
mcp-doctor list-configs
```

---

## Development

```bash
npm install
npm run build        # compile TypeScript → dist/
npm run typecheck    # type-check without build
npm run smoke        # full smoke test suite
npm run clean        # remove dist/

# Try the broken examples
mcp-doctor scan --config examples/broken-claude-config.json --out /tmp/test --json
```

---

## What It Checks

| Category | Examples |
|---|---|
| Config file | Invalid JSON, missing `mcpServers`, file not found |
| Commands | Shell operators in command, relative paths, missing `command` field |
| Executables | `npx`, `uv`, `uvx`, `node`, `python`, `docker` not found on PATH |
| GUI PATH | macOS apps don't inherit shell PATH — `spawn npx ENOENT` |
| Env/tokens | Empty values, placeholder tokens, secrets in config |
| Args | Empty args for `npx`/`uvx`, non-string values, no package specified |
| Filesystem | Access to root `/`, home `~`, or entire `/Users` |
| Network | GitHub, Slack, Notion, Postgres, browser automation |

Full check list → [docs/what-mcp-doctor-checks.md](docs/what-mcp-doctor-checks.md)

---

## Reports Generated

`mcp-doctor scan` writes two files by default:

| File | Description |
|---|---|
| `MCP_DOCTOR_REPORT.md` | Human-readable Markdown report with all findings and fixes |
| `mcp-doctor-report.html` | Visual HTML report — dark theme, score card, server cards, grouped findings |

Add `--json` to also generate `mcp-doctor-report.json` (machine-readable).

Reports are written to the current directory. Use `--out <dir>` to change the output directory.

> Secrets in env vars are always masked (`sk-****`, `ghp_****`). No data is sent to any network.

---

## Supported Clients

Auto-detected config locations:

| Client | Config Path |
|---|---|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor (project) | `.cursor/mcp.json` |
| Cursor (global) | `~/.cursor/mcp.json` |
| MCP (project root) | `.mcp.json` |

Scan any config: `mcp-doctor scan --config /path/to/config.json`

Client auto-detection is still expanding. More clients in future versions.
See [docs/supported-clients.md](docs/supported-clients.md).

---

## Safe Config Suggestions

MCP Doctor generates suggested fixes inline. Common patterns it suggests:

**Use absolute paths to avoid GUI PATH issues:**
```json
{
  "command": "/opt/homebrew/bin/npx"
}
```

**Scope filesystem access to your project:**
```json
{
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "--directory", "/your/project"]
}
```

**Set real token values:**
```json
{
  "env": {
    "GITHUB_TOKEN": "ghp_yourActualToken"
  }
}
```

MCP Doctor never modifies your config files. Suggestions are in the report only.

---

## Examples

The `examples/` folder contains intentionally broken configs for testing:

| File | What's broken |
|---|---|
| `broken-claude-config.json` | Missing command, placeholder token, broad filesystem access |
| `broken-cursor-config.json` | Empty args, shell operators, relative path |
| `filesystem-too-broad.json` | Root `/` and home dir access |
| `missing-env-token.json` | Empty and placeholder env values |
| `invalid-json-example.json` | Syntax error in JSON |

See [examples/README.md](examples/README.md) for expected findings.

---

## Roadmap

### v0.1.2 (current)
- [x] Auto-detect common MCP config locations
- [x] Parse and validate JSON configs
- [x] Diagnose 20+ failure patterns
- [x] Executable availability checks
- [x] GUI PATH warnings (macOS)
- [x] Env/token analysis with secret masking
- [x] Filesystem and network risk checks
- [x] Markdown report
- [x] HTML report (dark theme, score card, server cards)
- [x] JSON report (--json flag)
- [x] GitHub Actions CI

### v0.1.3 ideas
- [ ] VS Code / Cline config detection
- [ ] Windsurf config detection
- [ ] Detect common MCP package names and verify they exist on npm/PyPI
- [ ] Suggested config snippets with absolute paths pre-filled
- [ ] `mcp-doctor fix --dry-run` preview mode

### v0.2.0 ideas
- [ ] Interactive fix wizard
- [ ] Watch mode for config changes
- [ ] Docker-based MCP server checks

---

## Security Notes

- MCP Doctor reads config files and checks local executables only
- No data is sent to any network or external service
- No telemetry, no analytics, no account required
- Secrets in env vars are always masked in reports
- Config files are never modified
- Works fully offline

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

Found a false positive? Have a new failure pattern to add? Open an issue or PR.

---

## GitHub Topics

Suggest adding these topics to the repo:
`mcp` `mcp-server` `mcp-doctor` `mcp-debug` `mcp-tools` `model-context-protocol` `claude` `claude-desktop` `cursor` `vscode` `cline` `ai-agents` `developer-tools` `typescript`

---

## License

[MIT](LICENSE)

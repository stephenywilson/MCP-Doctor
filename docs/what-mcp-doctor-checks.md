# What MCP Doctor Checks

MCP Doctor runs rule-based diagnostics across six categories.

---

## A. Config File Problems

| Check | Severity |
|-------|----------|
| Config file not found | MEDIUM |
| Invalid JSON | HIGH |
| Root is not a JSON object | HIGH |
| Missing `mcpServers` key | HIGH |
| `mcpServers` is empty | MEDIUM |
| `mcpServers` is not an object | HIGH |
| Server config missing `command` | HIGH |
| `args` is not an array | HIGH |
| `env` is not an object | HIGH |
| Non-string values in `args` | MEDIUM |

---

## B. Command and Path Problems

| Check | Severity |
|-------|----------|
| `command` contains shell operators (`&&`, `\|`, `;`, `>`, `<`) | HIGH |
| `command` is a relative path (`./`, `../`) | MEDIUM |
| `command` is an absolute path that doesn't exist | HIGH |
| `npx` with no args (nothing will run) | HIGH |
| `npx` args are only flags (no package name) | HIGH |
| `uvx`/`uv` with no args | HIGH |

---

## C. Executable Not Found

For each server command (`npx`, `uv`, `uvx`, `python`, `python3`, `node`, `npm`, `docker`, `bun`, `deno`):

| Check | Severity |
|-------|----------|
| Executable not found on PATH or common locations | HIGH |
| Executable only found in GUI-unsafe paths | MEDIUM |

MCP Doctor checks your current shell PATH and common install locations including:
- `/usr/local/bin`
- `/opt/homebrew/bin` (Apple Silicon Mac)
- `/usr/bin`
- `/bin`

---

## D. GUI App PATH Warning (macOS)

On macOS, GUI apps (Claude Desktop, Cursor, VS Code) launch without inheriting your terminal's shell PATH.

This means executables installed by Homebrew, nvm, pyenv, or user-local installers may not be reachable.

**Affected commands:** `npx`, `uv`, `uvx`, `node`, `python`, `python3`, `docker`, `bun`, `deno`

**Fix:** Use the absolute path of the executable in your MCP config:

```json
{
  "command": "/opt/homebrew/bin/npx"
}
```

Run `which npx` (or `which uv`, etc.) in Terminal to find the absolute path.

---

## E. Env / Token Problems

| Check | Severity |
|-------|----------|
| Env value is an empty string | HIGH |
| Env value matches placeholder patterns (`YOUR_API_KEY`, `replace-me`, `TODO`, etc.) | HIGH |
| Sensitive env key has missing or placeholder value | HIGH |
| Secret is embedded in config file (non-empty real value) | MEDIUM |

**Masked in reports:** MCP Doctor never prints full secret values. They are masked as `sk-****`, `ghp_****`, etc.

---

## F. Filesystem Risk

| Check | Severity |
|-------|----------|
| Filesystem server with access to root path `/` | HIGH |
| Filesystem server with access to full home directory | HIGH |
| Filesystem server detected — access scope not reviewed | LOW |
| Any arg contains `/` or root paths | HIGH |

---

## G. Network and Token Risk

Servers with names suggesting network access receive contextual warnings:

| Pattern | Warning |
|---------|---------|
| `github` | GitHub token review recommended |
| `slack` | Slack token review recommended |
| `notion` | Notion token review recommended |
| `postgres` / `mysql` / `database` | Database credentials review recommended |
| `browser` / `puppeteer` / `playwright` | Headless browser — can access any URL and local files |
| `fetch` / `http` | Network access risk — review allowed domains |

---

## Risk Scoring

| Severity | Score Deduction |
|----------|----------------|
| HIGH | −20 |
| MEDIUM | −8 |
| LOW | −3 |

Starting score: **100**. Minimum score: **0**.

| Status | When |
|--------|------|
| OK | No HIGH, few/no MEDIUM |
| NEEDS_REVIEW | MEDIUM findings exist |
| BROKEN | HIGH findings present |
| RISKY | Security-sensitive findings (secrets, filesystem, network) |

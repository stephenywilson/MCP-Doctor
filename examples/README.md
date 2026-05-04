# MCP Doctor — Example Configs

These example configs are **intentionally broken** to demonstrate what MCP Doctor detects.

Run any of them with:

```bash
mcp-doctor scan --config examples/<filename>.json --out /tmp/mcp-test --json
```

---

## broken-claude-config.json

**What's broken:**
- `filesystem` server grants access to all of `/Users` (overly broad)
- `github` server has a placeholder `GITHUB_TOKEN`
- `broken-no-command` server is missing the required `command` field

**Expected MCP Doctor findings:**
- HIGH — Server missing required "command" field
- HIGH — Placeholder value detected: GITHUB_TOKEN
- HIGH — Filesystem server has overly broad access
- MEDIUM — GitHub token review recommended

**Expected status:** BROKEN (score < 40)

---

## broken-cursor-config.json

**What's broken:**
- `my-tool` uses `uvx` with no args (nothing will run)
- `my-tool` has an empty `API_KEY`
- `shell-injection` has shell operators (`&&`) in the command
- `relative-path-server` uses a relative path

**Expected MCP Doctor findings:**
- HIGH — uvx with no args
- HIGH — Empty env value: API_KEY
- HIGH — Command contains shell operators
- MEDIUM — Command uses relative path

**Expected status:** BROKEN

---

## filesystem-too-broad.json

**What's broken:**
- First server mounts the root filesystem `/`
- Second server mounts the entire home directory

**Expected MCP Doctor findings:**
- HIGH — Filesystem server has access to root path "/"
- HIGH — Filesystem server has overly broad access (home dir)

**Expected status:** BROKEN

---

## missing-env-token.json

**What's broken:**
- `notion` has an empty `NOTION_API_KEY`
- `slack` has placeholder values for both `SLACK_TOKEN` and `SLACK_TEAM_ID`
- `postgres` embeds a `YOUR_PASSWORD` placeholder directly in the connection URL arg

**Expected MCP Doctor findings:**
- HIGH — Empty env value: NOTION_API_KEY
- HIGH — Placeholder value detected: SLACK_TOKEN
- HIGH — Placeholder value detected: SLACK_TEAM_ID
- MEDIUM — Network risk warnings (notion, slack, postgres)

**Expected status:** BROKEN

---

## invalid-json-example.json

**What's broken:**
- Missing comma between `"command"` and `"args"` lines
- Trailing comma in args array

**Expected MCP Doctor findings:**
- HIGH — Invalid JSON in config file

**Expected status:** BROKEN (score <= 0)

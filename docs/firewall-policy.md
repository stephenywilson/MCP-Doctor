# Firewall Policy — MCP Doctor v0.3.0

## Overview

The firewall policy file (`mcp-doctor.firewall.json`) controls how each tool call category is handled during audit.

Generate the default policy:

```bash
mcp-doctor firewall init
```

---

## Policy structure

```json
{
  "version": 1,
  "defaultAction": "ask",
  "workspaceRoot": ".",
  "sensitivePaths": [
    ".env",
    ".env.*",
    "**/.ssh/**",
    "**/secrets/**",
    "package.json",
    "package-lock.json",
    ".github/workflows/**"
  ],
  "rules": [
    {
      "name": "Block critical severity",
      "match": { "severity": "CRITICAL" },
      "action": "block"
    },
    {
      "name": "Block secret access",
      "match": { "category": "SECRET" },
      "action": "block"
    },
    {
      "name": "Block deletes",
      "match": { "category": "DELETE" },
      "action": "block"
    },
    {
      "name": "Ask before writes",
      "match": { "category": "WRITE" },
      "action": "ask"
    },
    {
      "name": "Allow safe reads",
      "match": { "category": "READ" },
      "action": "allow"
    }
  ]
}
```

---

## Fields

### `defaultAction`

Action taken when no rule matches. Options: `allow`, `ask`, `block`.

Recommended: `ask` (safest default for unknown tools).

### `workspaceRoot`

Reserved for future use. Will restrict allowed filesystem paths to this directory.

### `sensitivePaths`

List of path patterns treated as sensitive. Supports:

- Exact match: `.env`, `package.json`
- Wildcard: `.env.*` (matches `.env.local`, `.env.production`, etc.)
- Recursive: `**/.ssh/**`, `**/secrets/**`

### `rules`

Ordered list of rules. **First matching rule wins.**

Each rule has:
- `name` — human-readable label
- `match` — one or more conditions:
  - `category` — `READ`, `WRITE`, `DELETE`, `EXECUTE`, `SECRET`, `NETWORK`, `DATABASE`, `GIT`, `UNKNOWN`
  - `severity` — `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
  - `tool` — substring match on tool name
  - `server` — substring match on server name
- `action` — `allow`, `ask`, `block`

---

## Actions

| Action | Meaning in v0.3.0 |
| --- | --- |
| `allow` | Classified as permitted |
| `ask` | Flagged as requiring human review |
| `block` | Classified as should be blocked |

In v0.3.0, no live blocking occurs — actions are recommendations in the audit report. A future proxy may enforce them at runtime.

---

## Example: strict policy (block everything except reads)

```json
{
  "version": 1,
  "defaultAction": "block",
  "workspaceRoot": ".",
  "sensitivePaths": [".env", ".env.*", "**/.ssh/**", "**/secrets/**"],
  "rules": [
    { "name": "Allow reads", "match": { "category": "READ" }, "action": "allow" }
  ]
}
```

## Example: permissive dev policy

```json
{
  "version": 1,
  "defaultAction": "allow",
  "workspaceRoot": ".",
  "sensitivePaths": [".env", "**/.ssh/**"],
  "rules": [
    { "name": "Block .env and SSH", "match": { "category": "SECRET" }, "action": "block" },
    { "name": "Block deletes", "match": { "category": "DELETE" }, "action": "block" }
  ]
}
```

# MCP Doctor Risk Model

## Overview

MCP Doctor assigns a score (0–100) and a status to each scan. The goal is to surface the issues most likely to prevent MCP servers from working or to cause security concerns.

---

## Score Calculation

```
score = 100
score -= (HIGH findings × 20)
score -= (MEDIUM findings × 8)
score -= (LOW findings × 3)
score = max(0, score)
```

### Example

Config with:
- 2 HIGH findings: −40
- 1 MEDIUM finding: −8
- 2 LOW findings: −6

Score: 100 − 40 − 8 − 6 = **46**

---

## Status Labels

| Status | Meaning |
|--------|---------|
| **OK** | No HIGH findings, zero or few MEDIUM |
| **NEEDS_REVIEW** | At least one MEDIUM finding |
| **BROKEN** | At least one HIGH finding — server likely fails to start |
| **RISKY** | Security-sensitive findings (secrets, filesystem, network access) |

A scan with both HIGH and RISKY conditions will show `BROKEN`.
A scan with only MEDIUM + RISKY conditions will show `RISKY`.

---

## Severity Definitions

### HIGH
The issue will almost certainly prevent the MCP server from starting or functioning:
- Invalid JSON
- Missing `command`
- Executable not found
- Shell operators in command
- Empty or placeholder env token values
- Overly broad filesystem access

### MEDIUM
The issue may cause intermittent failures or security exposure:
- Executable found only in GUI-unsafe paths
- Relative path in command
- Secret embedded in config (non-empty value)
- Network/token access without visible scope
- Config file not found (may be expected for optional clients)

### LOW
Good-to-know issues that don't block operation but represent improvement opportunities:
- Filesystem server with unreviewed scope
- Config has servers but some secondary checks flagged

---

## What MCP Doctor Does NOT Do

- Does not modify any config file
- Does not send any data to a network
- Does not install or uninstall packages
- Does not require authentication or an account
- Does not run the MCP server process

MCP Doctor is a static analysis tool. It reads config files and checks system conditions locally.

---

## False Positives

Some findings may not apply to your setup:

- **GUI PATH warning** — If you use a wrapper script or launch file that sets PATH, the warning may not apply.
- **Relative path** — If your MCP config is always launched from a specific working directory where the relative path resolves correctly, this may be acceptable (though not recommended).
- **Secret embedded** — If you intentionally use hardcoded values in a local config (e.g., a local API key for development), the MEDIUM finding is informational.

MCP Doctor cannot know your full runtime environment. Use its output as a starting checklist, not an absolute verdict.

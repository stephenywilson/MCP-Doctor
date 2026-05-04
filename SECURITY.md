# Security Policy

## Design Principles

MCP Doctor is designed with security as a core constraint:

- **No network access** — MCP Doctor never sends any data to external servers. It reads local files and checks local executables only.
- **No telemetry** — No usage data, crash reports, or analytics are collected.
- **No config modification** — MCP Doctor never writes to or modifies any MCP config file. It is read-only.
- **Secret masking** — Secrets and tokens detected in env vars are always masked in reports (`sk-****`, `ghp_****`). Full values are never logged or stored.
- **Local output only** — Reports are written to the local filesystem in the directory you specify.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Yes    |

## Reporting a Vulnerability

If you discover a security vulnerability in MCP Doctor, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Email details to the maintainer (add your email here), or use GitHub's private vulnerability reporting feature.
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge your report within 48 hours and aim to release a fix within 7 days for critical issues.

## What Counts as a Vulnerability

- Any path by which MCP Doctor could send data to a remote server
- Any path by which MCP Doctor could modify a user's MCP config file
- Any path by which full secret values could appear in a report or stdout
- Command injection vulnerabilities in the CLI argument handling
- Any path by which MCP Doctor could execute code from a user's config file

## Out of Scope

- Issues in the MCP servers themselves (not MCP Doctor's responsibility)
- False positives or incorrect findings (these are bugs, not security issues — please file a normal issue)
- Missing check coverage (open a normal feature request)

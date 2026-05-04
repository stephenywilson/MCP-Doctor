# Contributing to MCP Doctor

Thank you for your interest in contributing! MCP Doctor is an open-source project and welcomes contributions.

---

## Ways to Contribute

- **Report a new MCP failure pattern** — Open an issue describing what broke and what the error looked like
- **Submit a new diagnostic check** — Add a check to `src/scanner/diagnostics.ts`
- **Add a new broken example** — Add to `examples/` with a README explanation
- **Improve an existing check** — Fix a false positive or improve fix suggestions
- **Add a new client config path** — Add to `src/scanner/configDetector.ts`
- **Improve the HTML report** — CSS and layout improvements welcome
- **Write documentation** — Improve docs or add common error explanations

---

## Development Setup

```bash
git clone https://github.com/stephenywilson/MCP-Doctor.git
cd mcp-doctor
npm install
npm run build

# Run the CLI
node dist/index.js scan --config examples/broken-claude-config.json

# Run smoke tests
npm run smoke

# Type check only
npm run typecheck
```

---

## Project Structure

```
src/
  index.ts              CLI entry point
  cli.ts                Commander program definition
  types.ts              Shared TypeScript types
  utils.ts              Utility functions (masking, path helpers, etc.)
  scanner/
    configDetector.ts   Find known config file locations
    configParser.ts     Parse and validate JSON configs
    executableChecker.ts Check if executables are available
    diagnostics.ts      All diagnostic rules (main logic)
    riskScorer.ts       Score findings and assign status
    index.ts            Orchestrate a full scan
  reporters/
    markdownReporter.ts Generate MCP_DOCTOR_REPORT.md
    htmlReporter.ts     Generate mcp-doctor-report.html
    jsonReporter.ts     Generate mcp-doctor-report.json
examples/               Intentionally broken configs for testing
docs/                   Documentation
scripts/
  smoke.sh              End-to-end smoke test
```

---

## Adding a New Diagnostic Check

1. Open `src/scanner/diagnostics.ts`
2. Find the relevant `diagnose*` function or create one
3. Add a new `finding(...)` call with:
   - A unique ID prefix (e.g., `CMD`, `ENV`, `FS`, `NET`, `EXE`, `CFG`, `ARG`, `SEC`)
   - A clear, actionable title
   - The right severity (HIGH/MEDIUM/LOW — see `docs/risk-model.md`)
   - Good `evidence` (what was found)
   - A `suggestedFix` (what the user should do)
4. Add an example config to `examples/` that triggers the check
5. Run `npm run smoke` to ensure nothing breaks

---

## Adding a New Config Location

Edit `KNOWN_CONFIG_LOCATIONS` in `src/scanner/configDetector.ts`:

```typescript
{
  path: path.join(HOME, '.config', 'windsurf', 'mcp.json'),
  clientLabel: 'Windsurf (global)',
  exists: false,
},
```

---

## Code Style

- TypeScript strict mode (no `any`, no `as` unless necessary)
- ESM imports with `.js` extension (`import ... from './types.js'`)
- No framework dependencies beyond `commander`
- No test framework required for v0.1.x (smoke tests are sufficient)
- Comments only when the WHY is non-obvious

---

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Run `npm run typecheck` and `npm run smoke` before submitting
- Include a brief description of what you're fixing or adding
- For new diagnostic checks, explain the real-world failure it catches

---

## Questions

Open a GitHub issue or start a discussion. We're happy to help.

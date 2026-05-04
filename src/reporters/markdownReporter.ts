import { Finding, ParsedConfig, ScanReport, Severity } from '../types.js';
import { maskSecret, isSensitiveKey } from '../utils.js';
import { statusLabel } from '../scanner/riskScorer.js';

function severityBadge(s: Severity): string {
  switch (s) {
    case 'HIGH':
      return '🔴 HIGH';
    case 'MEDIUM':
      return '🟡 MEDIUM';
    case 'LOW':
      return '🔵 LOW';
  }
}

function findingRow(f: Finding): string {
  return `| ${severityBadge(f.severity)} | ${f.id} | ${f.server ?? '—'} | ${f.title} |`;
}

function configSummary(cfg: ParsedConfig): string {
  const lines: string[] = [];
  lines.push(`- **${cfg.clientLabel}**`);
  lines.push(`  - Path: \`${cfg.path}\``);
  if (cfg.notFound) {
    lines.push(`  - Status: ⚠️  File not found`);
  } else if (cfg.parseError) {
    lines.push(`  - Status: ❌ Parse error — ${cfg.parseError}`);
  } else {
    const count = Object.keys(cfg.servers ?? {}).length;
    lines.push(`  - Status: ✅ Valid JSON — ${count} server(s) configured`);
  }
  return lines.join('\n');
}

function maskedEnvSection(env: Record<string, string>): string {
  if (Object.keys(env).length === 0) return '';
  const lines = Object.entries(env).map(([k, v]) => `    - \`${k}\` = \`${maskSecret(k, v)}\``);
  return lines.join('\n');
}

function formatFix(fix: string): string {
  return fix
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

export function generateMarkdown(report: ScanReport): string {
  const lines: string[] = [];

  lines.push('# MCP Doctor Report');
  lines.push('');
  lines.push(`> Generated: ${report.timestamp}`);
  lines.push(`> MCP Doctor v0.2.0 — https://github.com/stephenywilson/MCP-Doctor`);
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Status** | ${statusLabel(report.status)} |`);
  lines.push(`| **Score** | ${report.score}/100 |`);
  lines.push(`| **Configs scanned** | ${report.configs.length} |`);
  lines.push(`| **Servers found** | ${report.servers.length} |`);
  lines.push(`| **Total findings** | ${report.allFindings.length} |`);
  lines.push(`| **HIGH** | ${report.allFindings.filter((f) => f.severity === 'HIGH').length} |`);
  lines.push(`| **MEDIUM** | ${report.allFindings.filter((f) => f.severity === 'MEDIUM').length} |`);
  lines.push(`| **LOW** | ${report.allFindings.filter((f) => f.severity === 'LOW').length} |`);
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## Scanned Configs');
  lines.push('');
  for (const cfg of report.configs) {
    lines.push(configSummary(cfg));
  }
  lines.push('');

  if (report.servers.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Detected Servers');
    lines.push('');
    for (const srv of report.servers) {
      lines.push(`### \`${srv.name}\``);
      lines.push('');
      lines.push(`- **Command**: \`${srv.config.command || '(none)'}\``);
      if (srv.config.args.length > 0) {
        lines.push(`- **Args**: \`${JSON.stringify(srv.config.args)}\``);
      }
      if (Object.keys(srv.config.env).length > 0) {
        lines.push(`- **Env** (secrets masked):`);
        lines.push(maskedEnvSection(srv.config.env));
      }
      const sCount = srv.findings.length;
      if (sCount === 0) {
        lines.push(`- Findings: ✅ No issues detected`);
      } else {
        lines.push(`- Findings: ${sCount} issue(s) — see table below`);
      }
      lines.push('');
    }
  }

  if (report.allFindings.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Findings');
    lines.push('');
    lines.push('| Severity | ID | Server | Title |');
    lines.push('|----------|----|--------|-------|');
    const sorted = [...report.allFindings].sort((a, b) => {
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return order[a.severity] - order[b.severity];
    });
    for (const f of sorted) {
      lines.push(findingRow(f));
    }
    lines.push('');

    lines.push('---');
    lines.push('');
    lines.push('## Finding Details');
    lines.push('');
    for (const f of sorted) {
      lines.push(`### ${severityBadge(f.severity)} — ${f.title}`);
      lines.push('');
      lines.push(`**ID:** \`${f.id}\` | **Category:** ${f.category}${f.server ? ` | **Server:** \`${f.server}\`` : ''}`);
      lines.push('');
      if (f.evidence) {
        lines.push('**Evidence:**');
        lines.push('```');
        lines.push(f.evidence);
        lines.push('```');
        lines.push('');
      }
      if (f.suggestedFix) {
        lines.push('**Suggested Fix:**');
        lines.push('```');
        lines.push(f.suggestedFix);
        lines.push('```');
        lines.push('');
      }
    }
  } else {
    lines.push('---');
    lines.push('');
    lines.push('## ✅ No Issues Found');
    lines.push('');
    lines.push('All scanned MCP configs look good!');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Safe Config Template');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    mcpServers: {
      'your-server': {
        command: '/opt/homebrew/bin/npx',
        args: ['-y', 'your-mcp-package'],
        env: {
          API_KEY: 'your-actual-api-key',
        },
      },
    },
  }, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## Next Steps');
  lines.push('');

  const highs = report.allFindings.filter((f) => f.severity === 'HIGH');
  const meds = report.allFindings.filter((f) => f.severity === 'MEDIUM');

  if (highs.length > 0) {
    lines.push('1. **Fix HIGH severity issues first** — these likely prevent MCP servers from starting:');
    for (const f of highs.slice(0, 5)) {
      lines.push(`   - ${f.title}${f.server ? ` (server: ${f.server})` : ''}`);
    }
    if (highs.length > 5) lines.push(`   - … and ${highs.length - 5} more`);
    lines.push('');
  }
  if (meds.length > 0) {
    lines.push('2. **Review MEDIUM severity issues** — these may cause intermittent failures:');
    for (const f of meds.slice(0, 3)) {
      lines.push(`   - ${f.title}${f.server ? ` (server: ${f.server})` : ''}`);
    }
    lines.push('');
  }
  lines.push('3. **Re-run MCP Doctor** after making changes:');
  lines.push('   ```');
  lines.push('   mcp-doctor scan');
  lines.push('   ```');
  lines.push('');
  lines.push('4. **Restart your MCP client** (Claude Desktop / Cursor / VS Code) after editing configs.');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('> ⚠️  Secrets are masked in this report. Full values are never logged or sent anywhere.');
  lines.push('> MCP Doctor does not modify your config files or send any data over the network.');
  lines.push('');

  return lines.join('\n');
}

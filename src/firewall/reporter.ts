import { AuditResult, BatchAuditResult, PolicyAction, ToolCallSeverity } from './types.js';

function severityBadge(s: ToolCallSeverity): string {
  switch (s) {
    case 'CRITICAL': return '🔴 CRITICAL';
    case 'HIGH':     return '🟠 HIGH';
    case 'MEDIUM':   return '🟡 MEDIUM';
    case 'LOW':      return '🟢 LOW';
  }
}

function actionBadge(a: PolicyAction): string {
  switch (a) {
    case 'block': return '🚫 BLOCK';
    case 'ask':   return '⚠️  ASK';
    case 'allow': return '✅ ALLOW';
  }
}

function actionMd(a: PolicyAction): string {
  switch (a) {
    case 'block': return '`BLOCK`';
    case 'ask':   return '`ASK`';
    case 'allow': return '`ALLOW`';
  }
}

function callSummaryLine(r: AuditResult, idx: number): string {
  const server = r.event.server ? `[${r.event.server}] ` : '';
  const paths = r.sensitivePathsFound.length > 0
    ? ` (${r.sensitivePathsFound[0]})`
    : '';
  return `| ${idx + 1} | \`${server}${r.event.tool}${paths}\` | ${r.categories.join(', ')} | ${r.severity} | ${actionMd(r.recommendedAction)} |`;
}

export function generateAuditReport(batch: BatchAuditResult): string {
  const lines: string[] = [];

  lines.push('# MCP Doctor — Tool Call Audit Report');
  lines.push('');
  lines.push(`> **Generated:** ${batch.timestamp}`);
  lines.push(`> **Source:** \`${batch.source}\``);
  lines.push(`> **Policy:** \`${batch.policyFile}\``);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Total tool calls | ${batch.totalCalls} |`);
  lines.push(`| 🟢 LOW | ${batch.severitySummary.LOW} |`);
  lines.push(`| 🟡 MEDIUM | ${batch.severitySummary.MEDIUM} |`);
  lines.push(`| 🟠 HIGH | ${batch.severitySummary.HIGH} |`);
  lines.push(`| 🔴 CRITICAL | ${batch.severitySummary.CRITICAL} |`);
  lines.push('');
  lines.push(`**Verdict:** ${batch.verdict}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Per-Call Results');
  lines.push('');
  lines.push('| # | Tool | Categories | Severity | Action |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (let i = 0; i < batch.results.length; i++) {
    lines.push(callSummaryLine(batch.results[i], i));
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Detailed Findings');
  lines.push('');

  for (let i = 0; i < batch.results.length; i++) {
    const r = batch.results[i];
    const server = r.event.server ? `[${r.event.server}] ` : '';
    lines.push(`### ${i + 1}. \`${server}${r.event.tool}\``);
    lines.push('');
    lines.push(`**Severity:** ${severityBadge(r.severity)}`);
    lines.push(`**Recommended Action:** ${actionBadge(r.recommendedAction)}`);
    lines.push(`**Categories:** ${r.categories.join(', ')}`);
    lines.push('');

    if (r.sensitivePathsFound.length > 0) {
      lines.push('**Sensitive paths detected:**');
      lines.push('');
      for (const p of r.sensitivePathsFound) {
        lines.push(`- \`${p}\``);
      }
      lines.push('');
    }

    if (r.sensitiveKeysFound.length > 0) {
      lines.push('**Sensitive argument keys detected:**');
      lines.push('');
      for (const k of r.sensitiveKeysFound) {
        lines.push(`- \`${k}\``);
      }
      lines.push('');
    }

    lines.push('**Reasons:**');
    lines.push('');
    for (const reason of r.reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## Next Steps');
  lines.push('');
  if (batch.severitySummary.CRITICAL > 0 || batch.severitySummary.HIGH > 0) {
    lines.push('- Do not connect this MCP server to Claude Desktop, Cursor, or VS Code without review.');
    lines.push('- Run `mcp-doctor safe-config` to generate a safer installation config.');
    lines.push('- Consider running this server in an isolated, sandboxed environment.');
  } else {
    lines.push('- Review MEDIUM findings before connecting to production AI tools.');
    lines.push('- Consider generating a policy file: `mcp-doctor firewall init`');
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('> ⚠️  MCP Doctor Tool Call Audit is a static preview, not a live firewall.');
  lines.push('> It analyses tool call shapes without executing them.');
  lines.push('> No secrets are read, printed, or transmitted.');
  lines.push('');

  return lines.join('\n');
}

// ── Terminal pretty-print ─────────────────────────────────────────────────────

export function terminalAuditResult(r: AuditResult, index?: number): string {
  const lines: string[] = [];
  const prefix = index !== undefined ? `  ${index + 1}. ` : '  ';

  const server = r.event.server ? `[${r.event.server}] ` : '';
  lines.push(`${prefix}\x1b[1m${server}${r.event.tool}\x1b[0m`);

  const sevColor = r.severity === 'CRITICAL' ? '\x1b[31m'
    : r.severity === 'HIGH' ? '\x1b[33m'
    : r.severity === 'MEDIUM' ? '\x1b[33m'
    : '\x1b[32m';

  const actColor = r.recommendedAction === 'block' ? '\x1b[31m'
    : r.recommendedAction === 'ask' ? '\x1b[33m'
    : '\x1b[32m';

  lines.push(`     Severity: ${sevColor}${r.severity}\x1b[0m   Action: ${actColor}${r.recommendedAction.toUpperCase()}\x1b[0m`);
  lines.push(`     Categories: ${r.categories.join('  ')}`);

  if (r.sensitivePathsFound.length > 0) {
    lines.push(`     \x1b[31m⚠ Sensitive paths: ${r.sensitivePathsFound.join(', ')}\x1b[0m`);
  }
  if (r.sensitiveKeysFound.length > 0) {
    lines.push(`     \x1b[31m⚠ Sensitive keys: ${r.sensitiveKeysFound.join(', ')}\x1b[0m`);
  }

  lines.push('     Reasons:');
  for (const reason of r.reasons) {
    lines.push(`       \x1b[2m─\x1b[0m ${reason}`);
  }

  return lines.join('\n');
}

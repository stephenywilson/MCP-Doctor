import { PreviewReport, RiskLevel } from './risk-analyzer.js';
import { SafeConfigResult } from './safe-config-generator.js';

function badge(level: RiskLevel): string {
  switch (level) {
    case 'HIGH':   return '🔴 HIGH';
    case 'MEDIUM': return '🟡 MEDIUM';
    case 'LOW':    return '🟢 LOW';
  }
}

export function generateSafeInstallReport(
  preview: PreviewReport,
  safeConfig?: SafeConfigResult,
): string {
  const lines: string[] = [];

  lines.push('# MCP-Doctor Safe Install Report');
  lines.push('');
  lines.push(`> **Config:** \`${preview.configPath}\``);
  lines.push(`> **Servers:** ${preview.serverCount}`);
  lines.push(`> **Overall Risk:** ${badge(preview.overallRisk)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const srv of preview.servers) {
    lines.push(`## ${srv.name}`);
    lines.push('');
    lines.push(`**Risk:** ${badge(srv.riskLevel)}`);
    lines.push('');

    lines.push('**Command:**');
    lines.push('');
    lines.push('```');
    const argStr = srv.args.length > 0 ? ' ' + srv.args.join(' ') : '';
    lines.push(`${srv.command}${argStr}`);
    lines.push('```');
    lines.push('');

    if (srv.envKeys.length > 0) {
      lines.push('**Environment Variables** (names only, values redacted):');
      lines.push('');
      for (const key of srv.envKeys) {
        lines.push(`- \`${key}\` = \`[REDACTED]\``);
      }
      lines.push('');
    }

    if (srv.detectedPaths.length > 0) {
      lines.push('**Detected Filesystem Paths:**');
      lines.push('');
      for (const p of srv.detectedPaths) {
        lines.push(`- \`${p}\` — broad access detected`);
      }
      lines.push('');
    }

    lines.push('**Risk Reasons:**');
    lines.push('');
    for (const r of srv.reasons) {
      lines.push(`- ${r}`);
    }
    lines.push('');

    if (srv.safePathSuggestion) {
      lines.push(`**Safer path:** \`${srv.safePathSuggestion}\` — replace with your actual project folder`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  lines.push('## Recommendations');
  lines.push('');
  for (const rec of preview.recommendations) {
    lines.push(`- ${rec}`);
  }
  lines.push('');

  if (safeConfig) {
    lines.push('## Safe Config Suggestion');
    lines.push('');
    if (safeConfig.transformations.length > 0) {
      lines.push('**Transformations applied:**');
      lines.push('');
      for (const t of safeConfig.transformations) {
        lines.push(`- ${t}`);
      }
      lines.push('');
    }
    lines.push('```json');
    lines.push(safeConfig.json);
    lines.push('```');
    lines.push('');
    for (const note of safeConfig.notes) {
      lines.push(`> ${note}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('> ⚠️  MCP-Doctor does not execute MCP servers, modify client configs, or print secret values.');
  lines.push('> This report is for informational purposes only. Review carefully before installing.');
  lines.push('');

  return lines.join('\n');
}

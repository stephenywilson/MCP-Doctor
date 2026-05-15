import { FirewallConfigScanReport, FirewallFinding, ConfigRiskSeverity } from './configScanner.js';

function severityOrder(severity: ConfigRiskSeverity): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[severity];
}

function bySeverity(a: FirewallFinding, b: FirewallFinding): number {
  return severityOrder(a.severity) - severityOrder(b.severity);
}

function groupedFindings(report: FirewallConfigScanReport, severity: ConfigRiskSeverity): FirewallFinding[] {
  return report.findings.filter((finding) => finding.severity === severity).sort(bySeverity);
}

function safeJson(report: FirewallConfigScanReport): FirewallConfigScanReport {
  return {
    ...report,
    configs: report.configs.map((cfg) => ({
      ...cfg,
      raw: undefined,
      servers: cfg.servers ? Object.fromEntries(
        Object.entries(cfg.servers).map(([name, raw]) => [
          name,
          {
            ...raw,
            env: typeof raw.env === 'object' && raw.env !== null && !Array.isArray(raw.env)
              ? Object.fromEntries(Object.keys(raw.env as Record<string, unknown>).map((key) => [key, '[REDACTED]']))
              : raw.env,
          },
        ]),
      ) : cfg.servers,
    })),
  };
}

export function generateFirewallJson(report: FirewallConfigScanReport): string {
  return JSON.stringify(safeJson(report), null, 2);
}

export function generateFirewallMarkdown(report: FirewallConfigScanReport): string {
  const lines: string[] = [];
  lines.push('# MCP Config Audit Report');
  lines.push('');
  lines.push('MCP configuration security scan by MCP Doctor');
  lines.push('');
  lines.push(`Generated: ${report.timestamp}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Risk score | ${report.riskScore}/100 |`);
  lines.push(`| Risk level | ${report.riskLevel} |`);
  lines.push(`| Config files scanned | ${report.configs.length} |`);
  lines.push(`| MCP servers detected | ${report.servers.length} |`);
  lines.push(`| Findings | ${report.findings.length} |`);
  lines.push('');

  lines.push('## Scanned Config Files');
  lines.push('');
  if (report.configs.length === 0) {
    lines.push('No MCP config files were found.');
  } else {
    for (const cfg of report.configs) {
      const serverCount = Object.keys(cfg.servers ?? {}).length;
      lines.push(`- ${cfg.clientLabel}: \`${cfg.path}\` (${cfg.parseError ? 'parse error' : `${serverCount} server(s)`})`);
    }
  }
  lines.push('');

  lines.push('## Detected MCP Servers');
  lines.push('');
  if (report.servers.length === 0) {
    lines.push('No MCP servers were detected.');
  } else {
    lines.push('| Server | Config | Command | Risk | Findings |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const server of report.servers) {
      lines.push(`| ${server.name} | ${server.clientLabel} | \`${server.command || '(missing)'}\` | ${server.riskScore}/100 ${server.riskLevel} | ${server.findings.length} |`);
    }
  }
  lines.push('');

  lines.push('## Findings by Severity');
  lines.push('');
  for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as ConfigRiskSeverity[]) {
    const findings = groupedFindings(report, severity);
    lines.push(`### ${severity}`);
    lines.push('');
    if (findings.length === 0) {
      lines.push('None.');
      lines.push('');
      continue;
    }
    for (const finding of findings) {
      lines.push(`- **${finding.title}**${finding.server ? ` (${finding.server})` : ''}`);
      lines.push(`  - Evidence: \`${finding.evidence}\``);
      lines.push(`  - Remediation: ${finding.remediation}`);
    }
    lines.push('');
  }

  lines.push('## Remediation Suggestions');
  lines.push('');
  for (const rec of report.recommendations) {
    lines.push(`- ${rec}`);
  }
  lines.push('');

  lines.push('## Safe Configuration Recommendations');
  lines.push('');
  lines.push('- Restrict filesystem paths to the smallest project folder needed.');
  lines.push('- Move secrets to environment variables and avoid plaintext tokens in JSON.');
  lines.push('- Pin package versions for MCP servers launched through package runners.');
  lines.push('- Remove unknown servers and document the purpose of every server you keep.');
  lines.push('- Use allowlists for tools, paths, and permissions where your MCP client supports them.');
  lines.push('');

  lines.push('## Privacy');
  lines.push('');
  lines.push('MCP Doctor runs locally and does not send your MCP configuration, API keys, or project files to any external service.');
  lines.push('Secret values are redacted in JSON reports.');
  lines.push('');

  return lines.join('\n');
}

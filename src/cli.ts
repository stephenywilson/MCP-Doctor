import { program } from 'commander';
import fs from 'fs';
import path from 'path';
import { scan } from './scanner/index.js';
import { generateMarkdown } from './reporters/markdownReporter.js';
import { generateHtml } from './reporters/htmlReporter.js';
import { generateJson } from './reporters/jsonReporter.js';
import { detectConfigs } from './scanner/configDetector.js';
import { parseConfigFile } from './scanner/configParser.js';
import { statusLabel } from './scanner/riskScorer.js';
import { ScanOptions } from './types.js';
import { analyzeConfig } from './safe-install/risk-analyzer.js';
import { generateSafeConfig, ClientTarget } from './safe-install/safe-config-generator.js';
import { generateSafeInstallReport } from './safe-install/report-writer.js';

const VERSION = '0.2.0';

function printLine(msg: string): void {
  process.stdout.write(msg + '\n');
}

function printSection(title: string): void {
  printLine('');
  printLine(`  ── ${title} ──`);
}

function colSeverity(s: string): string {
  switch (s) {
    case 'HIGH':   return '\x1b[31mHIGH  \x1b[0m';
    case 'MEDIUM': return '\x1b[33mMEDIUM\x1b[0m';
    case 'LOW':    return '\x1b[34mLOW   \x1b[0m';
    default:       return s;
  }
}

function riskColor(level: string): string {
  switch (level) {
    case 'HIGH':   return '\x1b[31m';
    case 'MEDIUM': return '\x1b[33m';
    default:       return '\x1b[32m';
  }
}

function resetColor(): string { return '\x1b[0m'; }

function loadConfigForPreview(configArg?: string): {
  configPath: string;
  servers: Record<string, import('./types.js').RawServerConfig>;
} | null {
  let configPath: string;

  if (configArg) {
    configPath = path.resolve(configArg);
  } else {
    const detected = detectConfigs().filter((d) => d.exists);
    if (detected.length === 0) {
      printLine('');
      printLine('  \x1b[33m⚠\x1b[0m  No MCP config files detected automatically.');
      printLine('');
      printLine('  Pass a config path explicitly:');
      printLine('    mcp-doctor preview ./path/to/mcp-config.json');
      printLine('');
      printLine('  Common locations:');
      printLine('    ~/Library/Application Support/Claude/claude_desktop_config.json');
      printLine('    .cursor/mcp.json');
      printLine('    .mcp.json');
      return null;
    }
    if (detected.length > 1) {
      printLine('');
      printLine('  Multiple configs found. Pass one explicitly:');
      for (const d of detected) {
        printLine(`    ${d.path}  (${d.clientLabel})`);
      }
      printLine('');
      printLine('  Example: mcp-doctor preview "' + detected[0].path + '"');
      return null;
    }
    configPath = detected[0].path;
  }

  const parsed = parseConfigFile(configPath, 'custom');

  if (parsed.notFound) {
    printLine(`  \x1b[31m✗\x1b[0m  Config file not found: ${configPath}`);
    return null;
  }
  if (parsed.parseError) {
    printLine(`  \x1b[31m✗\x1b[0m  Parse error: ${parsed.parseError}`);
    return null;
  }
  if (!parsed.servers || Object.keys(parsed.servers).length === 0) {
    printLine('  \x1b[33m⚠\x1b[0m  No servers found in config (mcpServers is empty or missing).');
    return null;
  }

  return { configPath, servers: parsed.servers };
}

export function buildCli(): typeof program {
  program
    .name('mcp-doctor')
    .description(
      'Diagnose, inspect, and safely configure MCP servers for Claude Desktop, Cursor, VS Code, and other AI tools',
    )
    .version(VERSION, '-v, --version')
    .helpOption('-h, --help');

  // ── scan (existing) ──────────────────────────────────────────────────────
  program
    .command('scan')
    .description('Scan MCP config files for errors and generate a diagnosis report')
    .option('--config <path>', 'path to a specific MCP config file to scan')
    .option('--out <directory>', 'output directory for reports', '.')
    .option('--json', 'also write a JSON report (mcp-doctor-report.json)')
    .option('--no-html', 'skip HTML report generation')
    .action(async (opts: { config?: string; out: string; json: boolean; html: boolean }) => {
      printLine('');
      printLine('  \x1b[1m\x1b[36mMCP Doctor\x1b[0m \x1b[2mv' + VERSION + '\x1b[0m');
      printLine('  Diagnose and fix broken MCP server configs');
      printLine('');

      const configPaths: string[] = opts.config ? [opts.config] : [];
      const outputDir = path.resolve(opts.out);

      if (configPaths.length === 0) {
        printLine('  Detecting MCP config files...');
        const detected = detectConfigs();
        const found = detected.filter((d) => d.exists);
        if (found.length === 0) {
          printLine('');
          printLine('  \x1b[33m⚠\x1b[0m  No known MCP config files detected.');
          printLine('');
          printLine('  Tip: Use --config <path> to scan a specific file.');
          printLine('  Example: mcp-doctor scan --config ~/.cursor/mcp.json');
          printLine('');
          printLine('  Supported auto-detected locations:');
          for (const d of detected) {
            printLine(`    • ${d.clientLabel}: ${d.path}`);
          }
          printLine('');
          printLine('  Client auto-detection is still expanding.');
          printLine('  You can scan any MCP JSON config with: mcp-doctor scan --config <path>');
          printLine('');
          process.exit(0);
        }
        printLine(`  Found ${found.length} config(s):`);
        for (const f of found) {
          printLine(`    \x1b[32m✓\x1b[0m  ${f.clientLabel}: ${f.path}`);
        }
      } else {
        printLine(`  Scanning: ${configPaths[0]}`);
      }

      printLine('');
      printLine('  Running diagnostics...');

      const options: ScanOptions = {
        configPaths,
        outputDir,
        json: opts.json,
        noHtml: !opts.html,
      };

      const report = await scan(options);

      printSection('Results');
      printLine('');
      printLine(`  Score:   \x1b[1m${report.score}/100\x1b[0m`);
      printLine(`  Status:  \x1b[1m${statusLabel(report.status)}\x1b[0m`);
      printLine(`  Servers: ${report.servers.length}`);
      printLine(`  Findings: ${report.allFindings.length} total`);
      printLine('');

      if (report.allFindings.length > 0) {
        const sorted = [...report.allFindings].sort((a, b) => {
          const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
          return order[a.severity] - order[b.severity];
        });

        for (const f of sorted) {
          const serverTag = f.server ? ` \x1b[2m[${f.server}]\x1b[0m` : '';
          printLine(`  ${colSeverity(f.severity)}  ${f.title}${serverTag}`);
          if (f.suggestedFix) {
            const firstLine = f.suggestedFix.split('\n')[0];
            printLine(`           \x1b[2m↳ ${firstLine}\x1b[0m`);
          }
        }
      } else {
        printLine('  \x1b[32m✅  No issues found!\x1b[0m');
      }

      printSection('Writing Reports');
      printLine('');

      const mdPath = path.join(outputDir, 'MCP_DOCTOR_REPORT.md');
      const mdContent = generateMarkdown(report);
      fs.writeFileSync(mdPath, mdContent, 'utf8');
      printLine(`  \x1b[32m✓\x1b[0m  Markdown: ${mdPath}`);

      if (!options.noHtml) {
        const htmlPath = path.join(outputDir, 'mcp-doctor-report.html');
        const htmlContent = generateHtml(report);
        fs.writeFileSync(htmlPath, htmlContent, 'utf8');
        printLine(`  \x1b[32m✓\x1b[0m  HTML:     ${htmlPath}`);
      }

      if (options.json) {
        const jsonPath = path.join(outputDir, 'mcp-doctor-report.json');
        const jsonContent = generateJson(report);
        fs.writeFileSync(jsonPath, jsonContent, 'utf8');
        printLine(`  \x1b[32m✓\x1b[0m  JSON:     ${jsonPath}`);
      }

      printLine('');
      if (report.status === 'BROKEN') {
        printLine('  \x1b[31m❌  BROKEN — Fix HIGH severity issues to get your MCP servers working.\x1b[0m');
      } else if (report.status === 'RISKY') {
        printLine('  \x1b[33m🔐  RISKY — Review security-sensitive configuration.\x1b[0m');
      } else if (report.status === 'NEEDS_REVIEW') {
        printLine('  \x1b[33m⚠   NEEDS REVIEW — Check the findings above.\x1b[0m');
      } else {
        printLine('  \x1b[32m✅  OK — Your MCP config looks healthy!\x1b[0m');
      }
      printLine('');
    });

  // ── list-configs (existing) ──────────────────────────────────────────────
  program
    .command('list-configs')
    .description('List all auto-detected MCP config locations on this machine')
    .action(() => {
      printLine('');
      printLine('  \x1b[1mKnown MCP config locations:\x1b[0m');
      printLine('');
      const all = detectConfigs();
      for (const d of all) {
        const mark = d.exists ? '\x1b[32m✓\x1b[0m' : '\x1b[2m✗\x1b[0m';
        const status = d.exists ? '\x1b[32mfound\x1b[0m' : '\x1b[2mnot found\x1b[0m';
        printLine(`  ${mark}  ${d.clientLabel}`);
        printLine(`       ${d.path} (${status})`);
        printLine('');
      }
      printLine('  Tip: scan any config with: mcp-doctor scan --config <path>');
      printLine('');
    });

  // ── preview (new) ────────────────────────────────────────────────────────
  program
    .command('preview [configPath]')
    .description('Preview MCP server risks before installing — safe, read-only analysis')
    .action((configArg?: string) => {
      printLine('');
      printLine(`  \x1b[1m\x1b[36mMCP Doctor\x1b[0m \x1b[2mv${VERSION}\x1b[0m  \x1b[1mSafe Install Preview\x1b[0m`);
      printLine('  Read-only analysis. No servers are executed. No secrets are printed.');
      printLine('');

      const loaded = loadConfigForPreview(configArg);
      if (!loaded) { process.exit(1); return; }

      const { configPath, servers } = loaded;
      const report = analyzeConfig(configPath, servers);

      printLine(`  Config:  ${configPath}`);
      printLine(`  Servers: ${report.serverCount}`);
      printLine('');

      for (let i = 0; i < report.servers.length; i++) {
        const srv = report.servers[i];
        const rc = riskColor(srv.riskLevel);
        printLine(`  ${i + 1}. \x1b[1m${srv.name}\x1b[0m`);
        printLine(`     Risk: ${rc}${srv.riskLevel}${resetColor()}`);
        printLine('     Reasons:');
        for (const reason of srv.reasons) {
          printLine(`       \x1b[2m─\x1b[0m ${reason}`);
        }
        if (srv.envKeys.length > 0) {
          printLine(`     Env vars: ${srv.envKeys.join(', ')} \x1b[2m(values not shown)\x1b[0m`);
        }
        if (srv.safePathSuggestion) {
          printLine(`     \x1b[33m⚠\x1b[0m  Safer path: ${srv.safePathSuggestion}`);
        }
        printLine('');
      }

      const rc = riskColor(report.overallRisk);
      printLine(`  Overall: ${rc}\x1b[1m${report.overallRisk}\x1b[0m${resetColor()}`);
      printLine('');
      printLine('  Recommendations:');
      for (const rec of report.recommendations) {
        printLine(`    \x1b[2m•\x1b[0m ${rec}`);
      }
      printLine('');
      printLine('  \x1b[2mNext: mcp-doctor safe-config <config> --client claude\x1b[0m');
      printLine('');
    });

  // ── inspect (new) ────────────────────────────────────────────────────────
  program
    .command('inspect [configPath]')
    .description('Detailed server-by-server inspection with risk analysis and safer suggestions')
    .option('--report', 'write MCP_DOCTOR_SAFE_INSTALL_REPORT.md to current directory')
    .option('--out <directory>', 'output directory for report file', '.')
    .action((configArg?: string, opts?: { report?: boolean; out?: string }) => {
      printLine('');
      printLine(`  \x1b[1m\x1b[36mMCP Doctor\x1b[0m \x1b[2mv${VERSION}\x1b[0m  \x1b[1mDetailed Inspection\x1b[0m`);
      printLine('  Read-only analysis. No servers are executed. No secrets are printed.');
      printLine('');

      const loaded = loadConfigForPreview(configArg);
      if (!loaded) { process.exit(1); return; }

      const { configPath, servers } = loaded;
      const preview = analyzeConfig(configPath, servers);
      const safeResult = generateSafeConfig(servers, preview.servers, 'generic');

      printLine(`  Config:  ${configPath}`);
      printLine(`  Servers: ${preview.serverCount}`);
      const rc = riskColor(preview.overallRisk);
      printLine(`  Overall Risk: ${rc}\x1b[1m${preview.overallRisk}\x1b[0m${resetColor()}`);
      printLine('');

      for (let i = 0; i < preview.servers.length; i++) {
        const srv = preview.servers[i];
        const srvRc = riskColor(srv.riskLevel);
        const divider = '─'.repeat(54);
        printLine(`  ${divider}`);
        printLine(`  ${i + 1}. \x1b[1m${srv.name}\x1b[0m  ${srvRc}${srv.riskLevel}${resetColor()}`);
        printLine(`     Command:  ${srv.command}`);
        if (srv.args.length > 0) {
          printLine(`     Args:     ${srv.args.join(' ')}`);
        }
        if (srv.envKeys.length > 0) {
          printLine(`     Env vars: ${srv.envKeys.map(k => k + '=[REDACTED]').join('  ')}`);
        }
        if (srv.detectedPaths.length > 0) {
          printLine(`     \x1b[31m⚠ Broad paths:\x1b[0m  ${srv.detectedPaths.join(', ')}`);
        }
        if (srv.isFilesystemServer) {
          printLine(`     Type:     Filesystem server`);
        }
        if (srv.isNetworkServer && srv.networkPattern) {
          printLine(`     Type:     Network/API server (${srv.networkPattern})`);
        }
        printLine('');
        printLine('     Risk reasons:');
        for (const r of srv.reasons) {
          printLine(`       \x1b[2m─\x1b[0m ${r}`);
        }
        printLine('');
      }

      printLine(`  ${'─'.repeat(54)}`);
      printLine('');
      printLine('  Recommendations:');
      for (const rec of preview.recommendations) {
        printLine(`    \x1b[2m•\x1b[0m ${rec}`);
      }
      printLine('');

      if (safeResult.transformations.length > 0) {
        printLine('  Suggested safe-config transformations:');
        for (const t of safeResult.transformations) {
          printLine(`    \x1b[33m→\x1b[0m ${t}`);
        }
        printLine('');
      }

      if (opts?.report) {
        const outDir = path.resolve(opts.out ?? '.');
        fs.mkdirSync(outDir, { recursive: true });
        const reportPath = path.join(outDir, 'MCP_DOCTOR_SAFE_INSTALL_REPORT.md');
        const reportContent = generateSafeInstallReport(preview, safeResult);
        fs.writeFileSync(reportPath, reportContent, 'utf8');
        printLine(`  \x1b[32m✓\x1b[0m  Report: ${reportPath}`);
        printLine('');
      } else {
        printLine('  \x1b[2mTip: add --report to write MCP_DOCTOR_SAFE_INSTALL_REPORT.md\x1b[0m');
        printLine('');
      }
    });

  // ── safe-config (new) ────────────────────────────────────────────────────
  program
    .command('safe-config [configPath]')
    .description('Generate a safer MCP config suggestion from an existing config')
    .option('--client <name>', 'target client: claude | cursor | vscode | generic', 'generic')
    .option('--out <directory>', 'output directory for safe config file', '.')
    .option('--no-write', 'print safe config to stdout only, do not write file')
    .action((configArg?: string, opts?: { client?: string; out?: string; write?: boolean }) => {
      printLine('');
      printLine(`  \x1b[1m\x1b[36mMCP Doctor\x1b[0m \x1b[2mv${VERSION}\x1b[0m  \x1b[1mSafe Config Generator\x1b[0m`);
      printLine('  Generates a safer config suggestion. Does not modify your real config.');
      printLine('');

      const loaded = loadConfigForPreview(configArg);
      if (!loaded) { process.exit(1); return; }

      const { configPath, servers } = loaded;
      const preview = analyzeConfig(configPath, servers);

      const validClients = new Set(['claude', 'cursor', 'vscode', 'generic']);
      const client = (validClients.has(opts?.client ?? '') ? opts?.client : 'generic') as ClientTarget;

      const result = generateSafeConfig(servers, preview.servers, client);

      printLine(`  Config:  ${configPath}`);
      printLine(`  Client:  ${client}`);
      printLine('');

      if (result.transformations.length > 0) {
        printLine('  Transformations applied:');
        for (const t of result.transformations) {
          printLine(`    \x1b[33m→\x1b[0m ${t}`);
        }
        printLine('');
      }

      const shouldWrite = opts?.write !== false;

      if (shouldWrite) {
        const outDir = path.resolve(opts?.out ?? '.');
        fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, 'MCP_DOCTOR_SAFE_CONFIG.example.json');
        fs.writeFileSync(outPath, result.json, 'utf8');
        printLine(`  \x1b[32m✓\x1b[0m  Written: ${outPath}`);
        printLine('');
        for (const note of result.notes) {
          printLine(`  \x1b[2m${note}\x1b[0m`);
        }
      } else {
        for (const note of result.notes) {
          printLine(`  \x1b[2m${note}\x1b[0m`);
        }
        printLine('');
        printLine(result.json);
      }

      printLine('');
      printLine('  \x1b[33m⚠\x1b[0m  Review all placeholders before using this config in any AI tool.');
      printLine('  \x1b[2mThis file was not installed anywhere. You must copy it manually.\x1b[0m');
      printLine('');
    });

  return program;
}

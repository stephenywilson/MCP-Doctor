import { program } from 'commander';
import fs from 'fs';
import path from 'path';
import { scan } from './scanner/index.js';
import { generateMarkdown } from './reporters/markdownReporter.js';
import { generateHtml } from './reporters/htmlReporter.js';
import { generateJson } from './reporters/jsonReporter.js';
import { detectConfigs } from './scanner/configDetector.js';
import { statusLabel } from './scanner/riskScorer.js';
import { ScanOptions } from './types.js';

const VERSION = '0.1.0';

function printLine(msg: string): void {
  process.stdout.write(msg + '\n');
}

function printSection(title: string): void {
  printLine('');
  printLine(`  ── ${title} ──`);
}

function severity(s: string): string {
  switch (s) {
    case 'HIGH': return '\x1b[31mHIGH  \x1b[0m';
    case 'MEDIUM': return '\x1b[33mMEDIUM\x1b[0m';
    case 'LOW': return '\x1b[34mLOW   \x1b[0m';
    default: return s;
  }
}

export function buildCli(): typeof program {
  program
    .name('mcp-doctor')
    .description('Diagnose and fix broken MCP server configs for Claude Desktop, Cursor, VS Code, Cline, and other AI tools')
    .version(VERSION, '-v, --version')
    .helpOption('-h, --help');

  program
    .command('scan')
    .description('Scan MCP config files and generate a diagnosis report')
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
          printLine(`  ${severity(f.severity)}  ${f.title}${serverTag}`);
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

  program
    .command('list-configs', { hidden: false })
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

  return program;
}

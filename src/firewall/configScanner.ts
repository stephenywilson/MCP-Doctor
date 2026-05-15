import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectConfigs, DetectedConfig } from '../scanner/configDetector.js';
import { parseConfigFile } from '../scanner/configParser.js';
import { ParsedConfig, RawServerConfig } from '../types.js';
import { isPlaceholderValue, isSensitiveKey, maskSecret } from '../utils.js';

export type ConfigRiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ConfigRiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface FirewallFinding {
  id: string;
  severity: ConfigRiskSeverity;
  server?: string;
  configPath?: string;
  title: string;
  evidence: string;
  remediation: string;
}

export interface FirewallServerSummary {
  name: string;
  configPath: string;
  clientLabel: string;
  command: string;
  args: string[];
  envKeys: string[];
  riskScore: number;
  riskLevel: ConfigRiskLevel;
  findings: FirewallFinding[];
}

export interface FirewallConfigScanReport {
  timestamp: string;
  configs: ParsedConfig[];
  servers: FirewallServerSummary[];
  findings: FirewallFinding[];
  riskScore: number;
  riskLevel: ConfigRiskLevel;
  recommendations: string[];
  outputDir: string;
}

const SHELL_COMMANDS = new Set([
  'bash', 'sh', 'zsh', 'fish', 'dash', 'powershell', 'pwsh', 'cmd', 'cmd.exe',
]);

const PACKAGE_RUNNERS = new Set(['npx', 'npm', 'pnpm', 'yarn', 'bunx', 'uvx']);

const NETWORK_MARKERS = [
  'http://', 'https://', 'github', 'gitlab', 'slack', 'notion', 'linear', 'jira',
  'aws', 'gcp', 'azure', 'google', 'openai', 'anthropic', 'stripe', 'supabase',
  'postgres', 'postgresql', 'mysql', 'mongodb', 'redis', 'browser', 'playwright',
  'puppeteer', 'fetch', 'api', 'webhook',
];

const SUSPICIOUS_COMMAND_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\brm\s+-rf\b/i, label: 'recursive force delete' },
  { re: /\bcurl\b.*\|\s*(bash|sh|zsh)\b/i, label: 'downloaded script piped to shell' },
  { re: /\bwget\b.*\|\s*(bash|sh|zsh)\b/i, label: 'downloaded script piped to shell' },
  { re: /\beval\b/i, label: 'eval execution' },
  { re: /\bchmod\s+\+x\b/i, label: 'runtime executable permission change' },
  { re: /`[^`]+`/, label: 'command substitution' },
  { re: /\$\([^)]+\)/, label: 'command substitution' },
  { re: /[;&|]{1,2}/, label: 'shell control operator' },
];

const SENSITIVE_ENV_REFERENCE_PATTERNS = [
  /TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /PASSWD/i,
  /PRIVATE/i,
  /CREDENTIAL/i,
  /AWS_/i,
  /OPENAI/i,
  /ANTHROPIC/i,
  /GITHUB/i,
  /DATABASE_URL/i,
];

function basename(command: string): string {
  return path.basename(command).toLowerCase();
}

function severityWeight(severity: ConfigRiskSeverity): number {
  switch (severity) {
    case 'CRITICAL': return 90;
    case 'HIGH': return 72;
    case 'MEDIUM': return 45;
    case 'LOW': return 10;
  }
}

function riskLevel(score: number): ConfigRiskLevel {
  if (score >= 85) return 'Critical';
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

function addFinding(
  findings: FirewallFinding[],
  finding: FirewallFinding,
): void {
  const duplicate = findings.some(
    (f) => f.id === finding.id && f.server === finding.server && f.evidence === finding.evidence,
  );
  if (!duplicate) findings.push(finding);
}

function extractArgs(raw: RawServerConfig): string[] {
  if (!Array.isArray(raw.args)) return [];
  return raw.args.filter((arg): arg is string => typeof arg === 'string');
}

function extractEnv(raw: RawServerConfig): Record<string, unknown> {
  if (typeof raw.env !== 'object' || raw.env === null || Array.isArray(raw.env)) return {};
  return raw.env as Record<string, unknown>;
}

function isEnvReference(value: string): boolean {
  return /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(value) || value.startsWith('process.env.');
}

function sanitizeEvidence(value: string, key?: string): string {
  if (key && isSensitiveKey(key)) return `${key}=${maskSecret(key, value)}`;
  if (value.length > 140) return `${value.slice(0, 137)}...`;
  return value;
}

function isHomeOrRootAccess(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  const home = os.homedir().replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized === '/' ||
    normalized === '~' ||
    normalized === '$HOME' ||
    normalized === home ||
    /^\/Users\/?$/.test(normalized) ||
    /^\/home\/?$/.test(normalized) ||
    /^[A-Za-z]:\/?$/.test(normalized);
}

function isBroadFilesystemPath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  const home = os.homedir().replace(/\\/g, '/').replace(/\/+$/, '');
  if (isHomeOrRootAccess(value)) return true;
  return normalized === `${home}/Desktop` ||
    normalized === `${home}/Documents` ||
    normalized === `${home}/Downloads` ||
    /^\/Users\/[^/]+\/(Desktop|Documents|Downloads)$/.test(normalized) ||
    /^\/home\/[^/]+\/(Desktop|Documents|Downloads)$/.test(normalized) ||
    /\/(\.ssh|\.aws|\.gnupg|\.kube)(\/|$)/.test(normalized);
}

function looksLikePath(value: string): boolean {
  return value === '~' ||
    value === '$HOME' ||
    value.startsWith('/') ||
    value.startsWith('~/') ||
    value.startsWith('$HOME') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    /^[A-Za-z]:[\\/]/.test(value);
}

function hasNetworkMarker(serverName: string, command: string, args: string[], envKeys: string[]): string | null {
  const haystack = [serverName, command, ...args, ...envKeys].join(' ').toLowerCase();
  return NETWORK_MARKERS.find((marker) => haystack.includes(marker)) ?? null;
}

function packageArg(args: string[]): string | null {
  return args.find((arg) => {
    if (arg.startsWith('-')) return false;
    if (arg.includes('/')) return true;
    return /^[a-z0-9@][a-z0-9._@/-]+$/i.test(arg);
  }) ?? null;
}

function isPinnedPackage(pkg: string): boolean {
  if (pkg.startsWith('@')) {
    const slash = pkg.indexOf('/');
    if (slash === -1) return false;
    return pkg.slice(slash + 1).includes('@');
  }
  return pkg.includes('@');
}

function hasDescription(raw: RawServerConfig): boolean {
  return typeof raw.description === 'string' && raw.description.trim().length > 0;
}

function isKnownLocalOnly(serverName: string, command: string, args: string[]): boolean {
  const text = [serverName, command, ...args].join(' ').toLowerCase();
  return text.includes('filesystem') ||
    text.includes('memory') ||
    text.includes('sqlite') ||
    text.includes('local');
}

function serverRiskScore(findings: FirewallFinding[]): number {
  if (findings.length === 0) return 0;
  const base = Math.max(...findings.map((finding) => severityWeight(finding.severity)));
  const extras = Math.max(0, findings.length - 1) * 4;
  return Math.min(100, base + extras);
}

function reportRiskScore(servers: FirewallServerSummary[]): number {
  if (servers.length === 0) return 0;
  const max = Math.max(...servers.map((server) => server.riskScore));
  const highCount = servers.filter((server) => server.riskScore >= 70).length;
  return Math.min(100, max + Math.max(0, highCount - 1) * 3);
}

export function findLocalMcpConfigFiles(cwd = process.cwd()): DetectedConfig[] {
  const candidates = [
    path.join(cwd, 'mcp.json'),
    path.join(cwd, 'mcp.config.json'),
    path.join(cwd, '.mcp.json'),
    path.join(cwd, '.cursor', 'mcp.json'),
    path.join(cwd, '.mcp', 'config.json'),
    path.join(cwd, '.mcp', 'mcp.json'),
  ];

  const seen = new Set<string>();
  const results: DetectedConfig[] = [];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    results.push({
      path: resolved,
      clientLabel: 'Local MCP config',
      exists: fs.existsSync(resolved),
    });
  }
  return results;
}

export function locateFirewallConfigFiles(extraPaths: string[] = []): DetectedConfig[] {
  if (extraPaths.length > 0) {
    return extraPaths.map((extraPath) => {
      const resolved = path.resolve(extraPath);
      return {
        path: resolved,
        clientLabel: 'Custom (--config)',
        exists: fs.existsSync(resolved),
      };
    });
  }

  const all = [...detectConfigs(), ...findLocalMcpConfigFiles()];
  const seen = new Map<string, DetectedConfig>();
  for (const cfg of all) {
    const resolved = path.resolve(cfg.path);
    const prior = seen.get(resolved);
    if (!prior || (!prior.exists && cfg.exists)) {
      seen.set(resolved, { ...cfg, path: resolved });
    }
  }
  return [...seen.values()];
}

export function analyzeFirewallServer(
  serverName: string,
  raw: RawServerConfig,
  configPath: string,
  clientLabel: string,
): FirewallServerSummary {
  const command = typeof raw.command === 'string' ? raw.command : '';
  const args = extractArgs(raw);
  const env = extractEnv(raw);
  const envKeys = Object.keys(env);
  const findings: FirewallFinding[] = [];
  const server = serverName;
  const cmdBase = basename(command);
  const joinedCommand = [command, ...args].join(' ');

  if (command && SHELL_COMMANDS.has(cmdBase)) {
    addFinding(findings, {
      id: 'FW-CRIT-SHELL-COMMAND',
      severity: 'CRITICAL',
      server,
      configPath,
      title: 'Server command can execute arbitrary shell',
      evidence: `command=${command}`,
      remediation: 'Avoid launching MCP servers through a shell. Use a direct executable path and fixed argument list.',
    });
  }

  for (const pattern of SUSPICIOUS_COMMAND_PATTERNS) {
    if (pattern.re.test(joinedCommand)) {
      addFinding(findings, {
        id: 'FW-CRIT-SUSPICIOUS-COMMAND',
        severity: 'CRITICAL',
        server,
        configPath,
        title: 'Server config includes suspicious command patterns',
        evidence: `${pattern.label}: ${joinedCommand}`,
        remediation: 'Remove shell control operators and installer-style commands from MCP configuration.',
      });
    }
  }

  if (command.startsWith('./') || command.startsWith('../') || (path.isAbsolute(command) && !PACKAGE_RUNNERS.has(cmdBase))) {
    addFinding(findings, {
      id: 'FW-HIGH-LOCAL-COMMAND',
      severity: 'HIGH',
      server,
      configPath,
      title: 'Server uses local shell command or executable',
      evidence: `command=${command}`,
      remediation: 'Verify the local executable source and document why this server is trusted.',
    });
  }

  if (PACKAGE_RUNNERS.has(cmdBase)) {
    const pkg = packageArg(args);
    if (pkg && !isPinnedPackage(pkg)) {
      addFinding(findings, {
        id: 'FW-HIGH-UNPINNED-PACKAGE',
        severity: 'HIGH',
        server,
        configPath,
        title: 'Server uses package execution without clear version pinning',
        evidence: `${command} ${pkg}`,
        remediation: 'Pin the MCP server package to a reviewed version, for example package@1.2.3.',
      });
    }
  }

  const networkMarker = hasNetworkMarker(serverName, command, args, envKeys);
  if (networkMarker) {
    addFinding(findings, {
      id: 'FW-HIGH-NETWORK-ACCESS',
      severity: 'HIGH',
      server,
      configPath,
      title: 'Server has network or external service access',
      evidence: `matched=${networkMarker}`,
      remediation: 'Use least-privilege API tokens and confirm the server only needs the listed network service.',
    });
  }

  for (const [key, value] of Object.entries(env)) {
    if (!isSensitiveKey(key) && !SENSITIVE_ENV_REFERENCE_PATTERNS.some((pattern) => pattern.test(key))) continue;
    if (typeof value === 'string' && value.trim() !== '' && !isEnvReference(value)) {
      addFinding(findings, {
        id: 'FW-CRIT-PLAINTEXT-SECRET',
        severity: 'CRITICAL',
        server,
        configPath,
        title: 'Config exposes API keys or tokens in plaintext',
        evidence: sanitizeEvidence(value, key),
        remediation: 'Move secrets to environment variables or a secret manager. Keep config values as ${ENV_VAR_NAME} references.',
      });
    } else {
      addFinding(findings, {
        id: 'FW-HIGH-SENSITIVE-ENV',
        severity: 'HIGH',
        server,
        configPath,
        title: 'Config references sensitive environment variables',
        evidence: `env=${key}`,
        remediation: 'Confirm this token is least-privilege and rotate it if it was ever stored in plaintext.',
      });
    }
  }

  for (const arg of args) {
    if (!looksLikePath(arg)) continue;
    if (isHomeOrRootAccess(arg)) {
      addFinding(findings, {
        id: 'FW-CRIT-HOME-ROOT-FS',
        severity: 'CRITICAL',
        server,
        configPath,
        title: 'Filesystem access points to home directory or root directory',
        evidence: `path=${arg}`,
        remediation: 'Restrict filesystem access to the smallest project directory needed by this server.',
      });
    } else if (isBroadFilesystemPath(arg)) {
      addFinding(findings, {
        id: 'FW-HIGH-BROAD-FS',
        severity: 'HIGH',
        server,
        configPath,
        title: 'Server has broad filesystem paths',
        evidence: `path=${arg}`,
        remediation: 'Replace broad user folders with a narrow project-level path allowlist.',
      });
    } else {
      addFinding(findings, {
        id: 'FW-LOW-LIMITED-PATH',
        severity: 'LOW',
        server,
        configPath,
        title: 'Known local-only config with limited path access',
        evidence: `path=${arg}`,
        remediation: 'Keep this path scoped and avoid adding parent directories.',
      });
    }
  }

  if (!hasDescription(raw)) {
    addFinding(findings, {
      id: 'FW-MED-MISSING-DESCRIPTION',
      severity: 'MEDIUM',
      server,
      configPath,
      title: 'Missing server description',
      evidence: 'description field is missing',
      remediation: 'Document the server purpose, owner, expected tools, and why each permission is needed.',
    });
  }

  if (!raw.allowlist && !raw.allowedTools && !raw.permissions) {
    addFinding(findings, {
      id: 'FW-MED-NO-ALLOWLIST',
      severity: 'MEDIUM',
      server,
      configPath,
      title: 'No allowlist policy found',
      evidence: 'no allowlist, allowedTools, or permissions field detected',
      remediation: 'Use allowlists where supported by the MCP client or server wrapper.',
    });
  }

  const unknownSource = command === '' ||
    (!isKnownLocalOnly(serverName, command, args) && !PACKAGE_RUNNERS.has(cmdBase) && !SHELL_COMMANDS.has(cmdBase));
  if (unknownSource) {
    addFinding(findings, {
      id: 'FW-MED-UNKNOWN-SOURCE',
      severity: 'MEDIUM',
      server,
      configPath,
      title: 'Unknown server source',
      evidence: command ? `command=${command}` : 'missing command',
      remediation: 'Remove unknown servers or document and verify their source before enabling them.',
    });
  }

  const hasCriticalOrHigh = findings.some((finding) => finding.severity === 'CRITICAL' || finding.severity === 'HIGH');
  if (!hasCriticalOrHigh && isKnownLocalOnly(serverName, command, args)) {
    addFinding(findings, {
      id: 'FW-LOW-LOCAL-ONLY',
      severity: 'LOW',
      server,
      configPath,
      title: 'Known local-only config',
      evidence: 'local-only server pattern detected',
      remediation: 'Keep the server local and continue reviewing any path changes.',
    });
  }

  const score = serverRiskScore(findings);
  return {
    name: serverName,
    configPath,
    clientLabel,
    command,
    args,
    envKeys,
    riskScore: score,
    riskLevel: riskLevel(score),
    findings,
  };
}

export function scanFirewallConfigs(options: {
  configPaths?: string[];
  outputDir?: string;
  cwd?: string;
} = {}): FirewallConfigScanReport {
  const detected = locateFirewallConfigFiles(options.configPaths ?? []);
  const found = detected.filter((cfg) => cfg.exists);
  const configs = found.map((cfg) => parseConfigFile(cfg.path, cfg.clientLabel));
  const servers: FirewallServerSummary[] = [];

  for (const cfg of configs) {
    if (!cfg.servers) continue;
    for (const [name, raw] of Object.entries(cfg.servers)) {
      servers.push(analyzeFirewallServer(name, raw, cfg.path, cfg.clientLabel));
    }
  }

  const findings = servers.flatMap((server) => server.findings);
  for (const cfg of configs) {
    if (cfg.parseError) {
      findings.push({
        id: 'FW-HIGH-PARSE-ERROR',
        severity: 'HIGH',
        configPath: cfg.path,
        title: 'MCP config could not be parsed',
        evidence: cfg.parseError,
        remediation: 'Fix invalid JSON before trusting this MCP configuration.',
      });
    }
  }

  const score = reportRiskScore(servers);
  return {
    timestamp: new Date().toISOString(),
    configs,
    servers,
    findings,
    riskScore: score,
    riskLevel: riskLevel(score),
    recommendations: firewallRecommendations(findings),
    outputDir: path.resolve(options.outputDir ?? '.'),
  };
}

function firewallRecommendations(findings: FirewallFinding[]): string[] {
  const recs = new Set<string>();
  if (findings.some((finding) => finding.id.includes('FS'))) {
    recs.add('Restrict filesystem paths to specific project directories.');
  }
  if (findings.some((finding) => finding.id === 'FW-CRIT-PLAINTEXT-SECRET')) {
    recs.add('Move secrets to environment variables and rotate any plaintext tokens found in config files.');
  }
  if (findings.some((finding) => finding.id === 'FW-HIGH-UNPINNED-PACKAGE')) {
    recs.add('Pin package-based MCP servers to reviewed versions.');
  }
  if (findings.some((finding) => finding.id === 'FW-HIGH-NETWORK-ACCESS')) {
    recs.add('Use least-privilege credentials for network-connected MCP servers.');
  }
  if (findings.some((finding) => finding.id === 'FW-MED-NO-ALLOWLIST')) {
    recs.add('Use allowlists where possible for tools, paths, and server permissions.');
  }
  if (findings.some((finding) => finding.id === 'FW-MED-MISSING-DESCRIPTION')) {
    recs.add('Document each server purpose, source, and required permissions.');
  }
  if (recs.size === 0) {
    recs.add('No high-risk MCP config signals were detected. Continue reviewing new servers before enabling them.');
  }
  recs.add('Remove unknown servers that are not actively needed.');
  recs.add('Avoid shell wrappers and suspicious command patterns in MCP server entries.');
  return [...recs];
}

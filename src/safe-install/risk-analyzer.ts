import path from 'path';
import os from 'os';
import { RawServerConfig } from '../types.js';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ServerRisk {
  name: string;
  command: string;
  args: string[];
  envKeys: string[];
  riskLevel: RiskLevel;
  reasons: string[];
  detectedPaths: string[];
  isFilesystemServer: boolean;
  isNetworkServer: boolean;
  networkPattern: string | null;
  safePathSuggestion: string | null;
}

export interface PreviewReport {
  configPath: string;
  serverCount: number;
  servers: ServerRisk[];
  overallRisk: RiskLevel;
  recommendations: string[];
}

// Broad/dangerous filesystem paths — HIGH risk
const BROAD_PATH_REGEXES: RegExp[] = [
  /^\/$/,
  /^~$/,
  /^\$HOME$/,
  /^\/Users$/,
  /^\/Users\/[^/]+$/,
  /^\/home$/,
  /^\/home\/[^/]+$/,
  /^[Cc]:\\Users/,
  /^\/?\.ssh(\/|$)/,
  /^\/?\.aws(\/|$)/,
  /^\/?\.gnupg(\/|$)/,
  /^\/?\.kube(\/|$)/,
  /^\/?\.config(\/|$)/,
  /\/Desktop$/,
  /\/Downloads$/,
  /\/Documents$/,
  /Library\/Application Support/,
];

// HIGH risk env var name patterns — never print values
const HIGH_RISK_ENV_REGEXES: RegExp[] = [
  /_TOKEN$/i,
  /_KEY$/i,
  /_SECRET$/i,
  /PASSWORD$/i,
  /PASSWD$/i,
  /^DATABASE_URL$/i,
  /^OPENAI_API_KEY$/i,
  /^ANTHROPIC_API_KEY$/i,
  /^AWS_ACCESS_KEY_ID$/i,
  /^AWS_SECRET_ACCESS_KEY$/i,
  /^STRIPE_SECRET/i,
];

// Shell-like commands that can run arbitrary code or make network requests
const SHELL_COMMANDS = new Set([
  'bash', 'sh', 'zsh', 'fish', 'dash', 'powershell', 'pwsh', 'cmd',
  'curl', 'wget',
]);

// Filesystem server name/arg indicators
const FILESYSTEM_PATTERNS = [
  'filesystem', 'file-system', 'server-filesystem', 'fs-server',
];

// Network/API service patterns for MEDIUM risk detection
const NETWORK_PATTERNS = [
  'github', 'gitlab', 'bitbucket', 'slack', 'notion', 'stripe', 'supabase',
  'firebase', 'aws', 'gcp', 'azure', 'google-cloud', 'openai', 'anthropic',
  'postgres', 'postgresql', 'mysql', 'mongodb', 'redis', 'sqlite', 'database', 'db',
  'browser', 'puppeteer', 'playwright', 'chromium', 'selenium',
  'docker', 'kubernetes', 'k8s',
  'email', 'smtp', 'sendgrid', 'mailgun', 'twilio',
  'discord', 'telegram', 'linear', 'jira', 'asana',
  'fetch', 'http', 'api',
];

// Known safe managed runtimes (not standalone shell commands)
const MANAGED_RUNTIMES = new Set([
  'node', 'npx', 'npm', 'python', 'python3', 'uv', 'uvx', 'docker',
  'bun', 'deno', 'java', 'ruby',
]);

function isBroadPath(p: string): boolean {
  const normalized = p.replace(/\\/g, '/');
  const home = os.homedir().replace(/\\/g, '/');
  if (normalized === home || normalized === home + '/') return true;
  return BROAD_PATH_REGEXES.some((re) => re.test(normalized));
}

function isHighRiskEnvKey(key: string): boolean {
  return HIGH_RISK_ENV_REGEXES.some((re) => re.test(key));
}

function detectNetworkPattern(text: string): string | null {
  const lower = text.toLowerCase();
  return NETWORK_PATTERNS.find((p) => lower.includes(p)) ?? null;
}

function extractArgs(raw: RawServerConfig): string[] {
  if (!Array.isArray(raw.args)) return [];
  return (raw.args as unknown[]).filter((a) => typeof a === 'string') as string[];
}

function extractEnvKeys(raw: RawServerConfig): string[] {
  if (typeof raw.env !== 'object' || raw.env === null || Array.isArray(raw.env)) return [];
  return Object.keys(raw.env as Record<string, unknown>);
}

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const order: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  return order[a] >= order[b] ? a : b;
}

export function analyzeServer(name: string, raw: RawServerConfig): ServerRisk {
  const command = typeof raw.command === 'string' ? raw.command : '';
  const args = extractArgs(raw);
  const envKeys = extractEnvKeys(raw);
  const reasons: string[] = [];
  const detectedPaths: string[] = [];
  let risk: RiskLevel = 'LOW';

  const nameLower = name.toLowerCase();
  const cmdBase = path.basename(command).toLowerCase();

  // Shell/fetch command detection — HIGH
  if (SHELL_COMMANDS.has(cmdBase) || SHELL_COMMANDS.has(command.toLowerCase())) {
    risk = 'HIGH';
    reasons.push(
      `Command "${command}" is a shell or network tool — can execute arbitrary code or make network requests`,
    );
  }

  // Relative path execution — MEDIUM
  if (command.startsWith('./') || command.startsWith('../')) {
    risk = maxRisk(risk, 'MEDIUM');
    reasons.push(`Runs local script with relative path: "${command}" — verify this script is trusted`);
  }

  // Unknown absolute path (not a managed runtime) — MEDIUM
  if (
    path.isAbsolute(command) &&
    !MANAGED_RUNTIMES.has(cmdBase) &&
    !SHELL_COMMANDS.has(cmdBase)
  ) {
    risk = maxRisk(risk, 'MEDIUM');
    reasons.push(`Runs local executable at absolute path: "${command}" — verify this binary is trusted`);
  }

  // Filesystem server detection
  const isFilesystem =
    FILESYSTEM_PATTERNS.some((p) => nameLower.includes(p)) ||
    args.some((a) => FILESYSTEM_PATTERNS.some((p) => a.includes(p)));

  if (isFilesystem) {
    risk = maxRisk(risk, 'MEDIUM');
    reasons.push('Filesystem server detected');
  }

  // Broad path analysis — HIGH
  for (const arg of args) {
    if (isBroadPath(arg)) {
      detectedPaths.push(arg);
      risk = 'HIGH';
      reasons.push(`Grants broad filesystem access: "${arg}"`);

      if (arg === '/' || arg === '/root') {
        reasons.push('Root filesystem access is extremely dangerous — this should never be granted');
      } else if (/\.(ssh|aws|gnupg|kube)/.test(arg)) {
        reasons.push('Access to a credentials or key directory detected');
      } else {
        reasons.push('No project-level boundary detected — replace with a specific project folder');
      }
    }
  }

  // Env var analysis — HIGH for powerful credentials
  const highRiskEnvKeys: string[] = [];
  for (const key of envKeys) {
    if (isHighRiskEnvKey(key)) {
      highRiskEnvKeys.push(key);
      risk = maxRisk(risk, 'HIGH');
      reasons.push(`Requires high-privilege credential env var: ${key}`);
    }
  }

  // Network/API integration — MEDIUM if not already HIGH
  const networkMatch =
    detectNetworkPattern(name) ??
    detectNetworkPattern(args.join(' ')) ??
    detectNetworkPattern(envKeys.join(' '));

  const isNetwork = networkMatch !== null;

  if (isNetwork && risk !== 'HIGH') {
    risk = maxRisk(risk, 'MEDIUM');
    reasons.push(`Network/API integration detected ("${networkMatch}")`);
  }

  if (isNetwork && highRiskEnvKeys.length === 0) {
    const medRiskKeys = envKeys.filter(
      (k) => k.toUpperCase().includes('TOKEN') || k.toUpperCase().includes('KEY'),
    );
    if (medRiskKeys.length > 0) {
      risk = maxRisk(risk, 'MEDIUM');
      reasons.push(`Requires token-like env var: ${medRiskKeys.join(', ')}`);
    }
  }

  // Remote package execution via npx/uvx with no other risk — MEDIUM
  if (
    (cmdBase === 'npx' || cmdBase === 'uvx') &&
    args.length > 0 &&
    risk === 'LOW'
  ) {
    risk = 'MEDIUM';
    reasons.push(`Executes remote package via ${cmdBase} — verify the package source and publisher`);
  }

  if (reasons.length === 0) {
    reasons.push('No obvious high-risk patterns detected');
  }

  return {
    name,
    command,
    args,
    envKeys,
    riskLevel: risk,
    reasons,
    detectedPaths,
    isFilesystemServer: isFilesystem,
    isNetworkServer: isNetwork,
    networkPattern: networkMatch,
    safePathSuggestion: detectedPaths.length > 0 ? '~/projects/YOUR_PROJECT' : null,
  };
}

export function analyzeConfig(
  configPath: string,
  servers: Record<string, RawServerConfig>,
): PreviewReport {
  const serverRisks: ServerRisk[] = [];
  let overall: RiskLevel = 'LOW';

  for (const [name, raw] of Object.entries(servers)) {
    const risk = analyzeServer(name, raw);
    serverRisks.push(risk);
    overall = maxRisk(overall, risk.riskLevel);
  }

  const recommendations: string[] = [];
  const hasFilesystemBroad = serverRisks.some(
    (s) => s.isFilesystemServer && s.detectedPaths.length > 0,
  );
  const hasHighEnv = serverRisks.some(
    (s) => s.riskLevel === 'HIGH' && s.envKeys.length > 0,
  );

  if (hasFilesystemBroad) {
    recommendations.push(
      'Do not grant access to your home directory or any parent of your project folder.',
    );
    recommendations.push(
      'Prefer a project-specific folder: ~/projects/YOUR_PROJECT',
    );
  }
  if (hasHighEnv) {
    recommendations.push(
      'Use least-privilege tokens — create fine-grained tokens with only the required permissions.',
    );
  }
  if (overall === 'HIGH') {
    recommendations.push(
      'Review the generated safe config before installing this MCP config in any AI tool.',
    );
    recommendations.push('Run: mcp-doctor safe-config <config-path> --client claude');
  } else if (overall === 'MEDIUM') {
    recommendations.push(
      'Review each server carefully before adding to Claude Desktop, Cursor, or VS Code.',
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Config appears low-risk. Review individual servers before trusting in an AI tool.',
    );
  }

  return {
    configPath,
    serverCount: serverRisks.length,
    servers: serverRisks,
    overallRisk: overall,
    recommendations,
  };
}

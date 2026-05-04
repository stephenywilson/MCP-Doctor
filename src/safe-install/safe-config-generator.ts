import os from 'os';
import { RawServerConfig } from '../types.js';
import { ServerRisk } from './risk-analyzer.js';

export type ClientTarget = 'claude' | 'cursor' | 'vscode' | 'generic';

export interface SafeConfigResult {
  json: string;
  notes: string[];
  transformations: string[];
}

const CLIENT_NOTES: Record<ClientTarget, string> = {
  claude: 'For Claude Desktop: save to ~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or %APPDATA%\\Claude\\claude_desktop_config.json (Windows)',
  cursor: 'For Cursor: save to .cursor/mcp.json in your project root, or ~/.cursor/mcp.json globally',
  vscode: 'For VS Code: check your MCP extension documentation for the correct config path',
  generic: 'Generic MCP config — check your client documentation for the correct config path',
};

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

function isBroadArg(arg: string): boolean {
  const home = os.homedir().replace(/\\/g, '/');
  const normalized = arg.replace(/\\/g, '/');
  if (normalized === home || normalized === home + '/') return true;
  return BROAD_PATH_REGEXES.some((re) => re.test(normalized));
}

function toSafePath(original: string): string {
  return '~/projects/YOUR_PROJECT';
}

function toEnvPlaceholder(key: string): string {
  return '${' + key + '}';
}

function hasRealValue(val: unknown): boolean {
  return (
    typeof val === 'string' &&
    val.length > 0 &&
    !val.startsWith('${') &&
    !val.startsWith('$ENV{') &&
    !['', 'YOUR_TOKEN_HERE', 'replace-me', 'todo', 'TODO', 'placeholder'].includes(val)
  );
}

export function generateSafeConfig(
  servers: Record<string, RawServerConfig>,
  risks: ServerRisk[],
  client: ClientTarget = 'generic',
): SafeConfigResult {
  const notes: string[] = [CLIENT_NOTES[client]];
  const transformations: string[] = [];
  const safeServers: Record<string, unknown> = {};

  for (const [name, raw] of Object.entries(servers)) {
    const safeServer: Record<string, unknown> = {};

    // Command — copied as-is (we don't execute it)
    safeServer.command = typeof raw.command === 'string' ? raw.command : '';

    // Args — replace broad paths with safe placeholder
    if (Array.isArray(raw.args)) {
      const safeArgs: string[] = [];
      for (const arg of raw.args as unknown[]) {
        if (typeof arg !== 'string') {
          safeArgs.push(String(arg));
          continue;
        }
        if (isBroadArg(arg)) {
          const safe = toSafePath(arg);
          safeArgs.push(safe);
          transformations.push(
            `[${name}] args: "${arg}" → "${safe}"  (replace with your actual project path)`,
          );
        } else {
          safeArgs.push(arg);
        }
      }
      safeServer.args = safeArgs;
    } else {
      safeServer.args = [];
    }

    // Env — redact all real values, keep placeholder/empty values as-is
    if (
      typeof raw.env === 'object' &&
      raw.env !== null &&
      !Array.isArray(raw.env)
    ) {
      const env = raw.env as Record<string, unknown>;
      const safeEnv: Record<string, string> = {};
      for (const [key, val] of Object.entries(env)) {
        if (hasRealValue(val)) {
          safeEnv[key] = toEnvPlaceholder(key);
          transformations.push(
            `[${name}] env: "${key}" value redacted → set via shell env or secrets manager`,
          );
        } else {
          safeEnv[key] = typeof val === 'string' ? val : '';
        }
      }
      safeServer.env = safeEnv;
    }

    safeServers[name] = safeServer;
  }

  if (transformations.length === 0) {
    notes.push(
      'No sensitive values detected. Review the config carefully before installing.',
    );
  } else {
    notes.push(
      `${transformations.length} transformation(s) applied. Replace all placeholders before use.`,
    );
    notes.push(
      'Set env var values in your shell environment or a secrets manager, not directly in the config.',
    );
  }

  return {
    json: JSON.stringify({ mcpServers: safeServers }, null, 2),
    notes,
    transformations,
  };
}

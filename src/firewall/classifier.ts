import path from 'path';
import {
  AuditResult,
  FirewallPolicy,
  PolicyAction,
  ToolCallCategory,
  ToolCallEvent,
  ToolCallSeverity,
} from './types.js';

// ── Tool name → category mapping ─────────────────────────────────────────────

const WRITE_TOOLS = [
  'write_file', 'create_file', 'save_file', 'update_file', 'put_file',
  'append_file', 'write', 'create', 'save', 'overwrite', 'patch_file',
  'edit_file', 'modify_file', 'write_text', 'create_or_update',
];
const READ_TOOLS = [
  'read_file', 'get_file', 'open_file', 'cat_file', 'view_file', 'fetch_file',
  'read', 'get', 'view', 'show', 'cat', 'display', 'read_text', 'read_lines',
  'list_dir', 'list_files', 'list', 'ls', 'find_files', 'search_files', 'glob',
  'stat_file', 'exists',
];
const DELETE_TOOLS = [
  'delete_file', 'remove_file', 'unlink', 'delete', 'remove', 'rm',
  'destroy', 'purge', 'wipe', 'erase',
];
const EXECUTE_TOOLS = [
  'execute', 'run', 'exec', 'shell', 'bash', 'command', 'spawn', 'eval',
  'invoke', 'run_command', 'execute_command', 'run_terminal', 'terminal',
  'run_script', 'execute_script', 'run_bash', 'run_shell',
];
const NETWORK_TOOLS = [
  'fetch', 'http_request', 'get_url', 'post_url', 'api_call', 'request',
  'curl', 'download', 'upload', 'http_get', 'http_post', 'http_put',
  'http_delete', 'send_request', 'web_request', 'network_request',
];
const DATABASE_TOOLS = [
  'query', 'sql', 'execute_sql', 'run_query', 'db_query',
  'insert', 'update', 'delete_record', 'upsert', 'find', 'find_one',
  'select', 'db_read', 'db_write', 'db_execute',
];
const GIT_TOOLS = [
  'git_commit', 'git_push', 'git_pull', 'git_merge', 'git_rebase',
  'git_checkout', 'git_branch', 'git_status', 'git_log', 'git_diff',
  'git_show', 'git_add', 'git_stash', 'git_tag', 'git_reset',
  'commit', 'push', 'pull_request',
];

function toolMatchesList(tool: string, list: string[]): boolean {
  const t = tool.toLowerCase();
  return list.some((p) => t === p || t.includes(p));
}

function getToolCategories(tool: string): ToolCallCategory[] {
  const cats: ToolCallCategory[] = [];
  if (toolMatchesList(tool, WRITE_TOOLS))    cats.push('WRITE');
  if (toolMatchesList(tool, READ_TOOLS))     cats.push('READ');
  if (toolMatchesList(tool, DELETE_TOOLS))   cats.push('DELETE');
  if (toolMatchesList(tool, EXECUTE_TOOLS))  cats.push('EXECUTE');
  if (toolMatchesList(tool, NETWORK_TOOLS))  cats.push('NETWORK');
  if (toolMatchesList(tool, DATABASE_TOOLS)) cats.push('DATABASE');
  if (toolMatchesList(tool, GIT_TOOLS))      cats.push('GIT');
  if (cats.length === 0) cats.push('UNKNOWN');
  return cats;
}

// ── Sensitive path patterns ──────────────────────────────────────────────────

const DEFAULT_SENSITIVE_PATHS = [
  '.env', '.env.*', '**/.ssh/**', '**/id_rsa', '**/id_ed25519',
  '**/secrets/**', '**/credentials/**', '**/private/**',
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
  '.npmrc', '.pypirc', '.git/config', '.github/workflows/**',
  'docker-compose.yml', 'Dockerfile', '.netrc', '.htpasswd',
];

function matchesSensitivePath(filePath: string, patterns: string[]): string | null {
  const normalized = filePath.replace(/\\/g, '/');
  const base = path.basename(normalized);

  for (const pattern of patterns) {
    const p = pattern.replace(/\\/g, '/');

    // ** prefix — match anywhere in path
    if (p.startsWith('**/')) {
      const suffix = p.slice(3);
      if (suffix.endsWith('/**')) {
        const dir = suffix.slice(0, -3);
        if (normalized.includes('/' + dir + '/') || normalized.includes('/' + dir)) {
          return pattern;
        }
      } else if (normalized.includes('/' + suffix) || base === suffix) {
        return pattern;
      }
      continue;
    }

    // Wildcard like .env.*
    if (p.includes('*')) {
      const [before, after] = p.split('*', 2);
      if (base.startsWith(before) && (!after || base.endsWith(after))) {
        return pattern;
      }
      continue;
    }

    // Exact basename or path suffix
    if (base === p || normalized.endsWith('/' + p) || normalized === p) {
      return pattern;
    }
  }
  return null;
}

// ── Sensitive argument keys ──────────────────────────────────────────────────

const SENSITIVE_ARG_KEYS = [
  'token', 'api_key', 'apikey', 'secret', 'password', 'passwd',
  'credential', 'private_key', 'access_key', 'refresh_token',
  'auth', 'authorization', 'bearer', 'jwt', 'session_token',
  'aws_secret', 'client_secret', 'encryption_key',
];

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_ARG_KEYS.some((s) => k.includes(s));
}

// ── Dangerous command patterns ───────────────────────────────────────────────

const CRITICAL_CMD_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bcurl\b.*\|\s*(ba)?sh\b/i,
  /\bwget\b.*\|\s*(ba)?sh\b/i,
  /\beval\b/i,
  /\bchmod\s+777\b/i,
  /\bInvoke-Expression\b/i,
  /\biex\b/i,
];

const HIGH_CMD_PATTERNS = [
  /\bgit\s+(push|commit|rebase|reset)\b/i,
  /\bnpm\s+publish\b/i,
  /\bchown\b/i,
  /\bchmod\b/i,
  /\bpip\s+install\b/i,
];

function checkCommandDanger(cmd: string): 'CRITICAL' | 'HIGH' | null {
  if (CRITICAL_CMD_PATTERNS.some((re) => re.test(cmd))) return 'CRITICAL';
  if (HIGH_CMD_PATTERNS.some((re) => re.test(cmd))) return 'HIGH';
  return null;
}

// ── Severity helpers ─────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<ToolCallSeverity, number> = {
  LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3,
};

function maxSev(a: ToolCallSeverity, b: ToolCallSeverity): ToolCallSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

// ── Path-like argument keys ──────────────────────────────────────────────────

const PATH_ARG_KEYS = new Set([
  'path', 'file', 'filepath', 'file_path', 'filename', 'target', 'destination',
  'dest', 'source', 'src', 'dir', 'directory', 'to', 'from', 'output', 'input',
  'folder', 'location', 'cwd', 'basedir', 'rootdir',
]);

const COMMAND_ARG_KEYS = new Set([
  'command', 'cmd', 'shell', 'script', 'code', 'expression', 'args',
  'arguments', 'exec', 'run', 'entrypoint',
]);

// ── Main classifier ──────────────────────────────────────────────────────────

export function classifyToolCall(
  event: ToolCallEvent,
  policy: FirewallPolicy,
): AuditResult {
  const reasons: string[] = [];
  const catSet = new Set<ToolCallCategory>();
  const sensitivePathsFound: string[] = [];
  const sensitiveKeysFound: string[] = [];
  let severity: ToolCallSeverity = 'LOW';

  // 1. Tool-name based categories
  const toolCats = getToolCategories(event.tool);
  toolCats.forEach((c) => catSet.add(c));

  if (catSet.has('WRITE')) {
    severity = maxSev(severity, 'HIGH');
    reasons.push(`Tool "${event.tool}" writes to the filesystem`);
  }
  if (catSet.has('DELETE')) {
    severity = maxSev(severity, 'HIGH');
    reasons.push(`Tool "${event.tool}" deletes files or data`);
  }
  if (catSet.has('EXECUTE')) {
    severity = maxSev(severity, 'HIGH');
    reasons.push(`Tool "${event.tool}" executes commands or scripts`);
  }
  if (catSet.has('NETWORK')) {
    severity = maxSev(severity, 'MEDIUM');
    reasons.push(`Tool "${event.tool}" makes network requests`);
  }
  if (catSet.has('DATABASE')) {
    severity = maxSev(severity, 'MEDIUM');
    reasons.push(`Tool "${event.tool}" accesses a database`);
  }
  if (catSet.has('GIT')) {
    severity = maxSev(severity, 'MEDIUM');
    reasons.push(`Tool "${event.tool}" performs a Git operation`);
  }
  if (catSet.has('UNKNOWN')) {
    severity = maxSev(severity, 'MEDIUM');
    reasons.push(`Tool "${event.tool}" is unrecognised — treating as MEDIUM risk`);
  }

  // 2. Argument analysis (flat scan, one level deep for nested objects too)
  const argEntries = flattenArgs(event.arguments);

  for (const [key, value] of argEntries) {
    const keyLow = key.toLowerCase();
    const valStr = typeof value === 'string' ? value : String(value);

    // Check for sensitive argument keys
    if (isSensitiveKey(key)) {
      catSet.add('SECRET');
      sensitiveKeysFound.push(key);
      severity = maxSev(severity, 'HIGH');
      reasons.push(`Argument key "${key}" looks like a credential or secret`);
    }

    // Check path-like arguments for sensitive paths
    if (PATH_ARG_KEYS.has(keyLow) && typeof value === 'string') {
      const matched = matchesSensitivePath(value, policy.sensitivePaths);
      if (matched) {
        catSet.add('SECRET');
        sensitivePathsFound.push(value);
        severity = 'CRITICAL';
        reasons.push(`Target path matches sensitive pattern "${matched}": ${value}`);
      } else if (value.includes('/') || value.includes('\\')) {
        // Any file path in a WRITE/DELETE gets closer scrutiny
        if (catSet.has('WRITE') || catSet.has('DELETE')) {
          reasons.push(`Filesystem target: ${value}`);
        }
      }
    }

    // Check command-like arguments for dangerous patterns
    if (COMMAND_ARG_KEYS.has(keyLow) && typeof value === 'string') {
      const danger = checkCommandDanger(value);
      if (danger === 'CRITICAL') {
        severity = 'CRITICAL';
        reasons.push(`Command contains dangerous pattern: ${truncateArg(value)}`);
      } else if (danger === 'HIGH') {
        severity = maxSev(severity, 'HIGH');
        reasons.push(`Command contains elevated-risk pattern: ${truncateArg(value)}`);
      } else if (value.trim()) {
        reasons.push(`Shell command argument: ${truncateArg(value)}`);
      }
    }

    // Content with credential-like assignment patterns (KEY=VALUE)
    if (key.toLowerCase() === 'content' && typeof value === 'string') {
      if (/[A-Z_]{4,}=\S+/.test(value)) {
        catSet.add('SECRET');
        severity = maxSev(severity, 'CRITICAL');
        reasons.push('Content argument contains what looks like credential assignment (KEY=VALUE)');
      }
    }

    // URL arguments with token-like query params or headers
    if ((keyLow === 'url' || keyLow === 'endpoint') && typeof value === 'string') {
      if (/token|api_key|secret|password/i.test(value)) {
        catSet.add('SECRET');
        severity = maxSev(severity, 'HIGH');
        reasons.push('URL argument contains credential-like query parameter');
      }
    }
  }

  // 3. GIT push/commit → escalate to HIGH
  if (catSet.has('GIT')) {
    const t = event.tool.toLowerCase();
    if (t.includes('push') || t.includes('commit') || t.includes('merge') || t.includes('rebase')) {
      severity = maxSev(severity, 'HIGH');
      reasons.push('Git operation modifies repository history or remote');
    }
  }

  // 4. DATABASE write → escalate to HIGH
  if (catSet.has('DATABASE')) {
    const t = event.tool.toLowerCase();
    if (t.includes('insert') || t.includes('update') || t.includes('delete') || t.includes('execute_sql')) {
      severity = maxSev(severity, 'HIGH');
      reasons.push('Database operation mutates data');
    }
  }

  const categories = [...catSet];

  // 5. Apply policy
  const recommendedAction = applyPolicy(categories, severity, event, policy);

  return {
    event,
    categories,
    severity,
    reasons,
    recommendedAction,
    sensitivePathsFound,
    sensitiveKeysFound,
  };
}

function flattenArgs(
  args: Record<string, unknown>,
  prefix = '',
): Array<[string, unknown]> {
  const result: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(args)) {
    const key = prefix ? `${prefix}.${k}` : k;
    result.push([k, v]); // always push the original key too
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      result.push(...flattenArgs(v as Record<string, unknown>, key));
    }
  }
  return result;
}

function truncateArg(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function applyPolicy(
  categories: ToolCallCategory[],
  severity: ToolCallSeverity,
  event: ToolCallEvent,
  policy: FirewallPolicy,
): PolicyAction {
  for (const rule of policy.rules) {
    const m = rule.match;
    const catMatch = m.category ? categories.includes(m.category) : true;
    const sevMatch = m.severity ? severity === m.severity : true;
    const toolMatch = m.tool ? event.tool.toLowerCase().includes(m.tool.toLowerCase()) : true;
    const srvMatch = m.server
      ? (event.server ?? '').toLowerCase().includes(m.server.toLowerCase())
      : true;

    if (catMatch && sevMatch && toolMatch && srvMatch) {
      return rule.action;
    }
  }
  return policy.defaultAction;
}

export function getDefaultSensitivePaths(): string[] {
  return [...DEFAULT_SENSITIVE_PATHS];
}

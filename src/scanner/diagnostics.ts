import path from 'path';
import { Finding, FindingCategory, ParsedConfig, RawServerConfig, Severity } from '../types.js';
import { ExecutableCheckResult } from '../types.js';
import { checkExecutable, MANAGED_EXECUTABLES } from './executableChecker.js';
import {
  containsShellOperator,
  isMacOS,
  isPlaceholderValue,
  isSensitiveKey,
  isRelativePath,
  maskSecret,
  truncate,
} from '../utils.js';

let _findingCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${String(++_findingCounter).padStart(3, '0')}`;
}

function finding(
  prefix: string,
  title: string,
  severity: Severity,
  category: FindingCategory,
  opts: { server?: string; evidence?: string; suggestedFix?: string } = {},
): Finding {
  return {
    id: nextId(prefix),
    title,
    severity,
    category,
    server: opts.server,
    evidence: opts.evidence ? truncate(opts.evidence) : undefined,
    suggestedFix: opts.suggestedFix,
  };
}

const GUI_PATH_COMMANDS = ['npx', 'uv', 'uvx', 'python', 'python3', 'node', 'docker', 'bun', 'deno'];

const FILESYSTEM_SERVER_PATTERNS = ['filesystem', 'file-system', 'server-filesystem', 'fs-server'];
const RISKY_PATH_ARGS = ['/', '/Users', '/home', '~', '/root', '/var', '/etc', '/tmp'];

const NETWORK_SERVER_PATTERNS: Record<string, string> = {
  github: 'GitHub token review recommended — store in env, not args',
  slack: 'Slack token review recommended — store in env, not args',
  notion: 'Notion token review recommended',
  postgres: 'Database credentials review recommended — never embed passwords in args',
  mysql: 'Database credentials review recommended',
  database: 'Database credentials review recommended',
  db: 'Database credentials review recommended',
  browser: 'Browser automation server — can access web, open network connections, read local files',
  puppeteer: 'Puppeteer — headless browser, can access any URL and file system',
  playwright: 'Playwright — headless browser, can access any URL and file system',
  fetch: 'Network fetch server — can reach arbitrary URLs; review allowed domains',
  http: 'Network HTTP server — can reach arbitrary URLs; review allowed domains',
};

export function diagnoseConfig(parsed: ParsedConfig): Finding[] {
  const findings: Finding[] = [];

  if (parsed.notFound) {
    findings.push(
      finding('CFG', 'Config file not found', 'MEDIUM', 'CONFIG_FILE', {
        evidence: parsed.path,
        suggestedFix: `Create the config file at: ${parsed.path}\nSee docs/safe-config-examples.md for a starter template.`,
      }),
    );
    return findings;
  }

  if (parsed.parseError) {
    const isJsonError = parsed.parseError.includes('Invalid JSON');
    findings.push(
      finding(
        'CFG',
        isJsonError ? 'Invalid JSON in config file' : 'Config file parse error',
        'HIGH',
        'CONFIG_FILE',
        {
          evidence: `${parsed.path}: ${parsed.parseError}`,
          suggestedFix: isJsonError
            ? 'Validate your JSON at https://jsonlint.com or run: cat <path> | python3 -m json.tool'
            : parsed.parseError,
        },
      ),
    );
    if (isJsonError) return findings;
  }

  const servers = parsed.servers ?? {};
  const serverCount = Object.keys(servers).length;

  if (!parsed.raw || !('mcpServers' in (parsed.raw ?? {}))) {
    findings.push(
      finding('CFG', 'Missing mcpServers key', 'HIGH', 'CONFIG_FILE', {
        evidence: `No "mcpServers" found in ${path.basename(parsed.path)}`,
        suggestedFix:
          'Add a "mcpServers" object to your config:\n{\n  "mcpServers": {\n    "my-server": {\n      "command": "npx",\n      "args": ["-y", "my-package"]\n    }\n  }\n}',
      }),
    );
    return findings;
  }

  if (serverCount === 0) {
    findings.push(
      finding('CFG', 'mcpServers is empty', 'MEDIUM', 'TOOL_VISIBILITY', {
        evidence: `${path.basename(parsed.path)}: mcpServers = {}`,
        suggestedFix: 'Add at least one server entry inside mcpServers.',
      }),
    );
    return findings;
  }

  const execCache = new Map<string, ExecutableCheckResult>();
  let guiWarningEmitted = false;

  for (const [name, raw] of Object.entries(servers)) {
    const serverFindings = diagnoseServer(name, raw, execCache);
    findings.push(...serverFindings);

    if (!guiWarningEmitted && isMacOS()) {
      const cmd = typeof raw.command === 'string' ? raw.command : '';
      if (GUI_PATH_COMMANDS.includes(cmd)) {
        findings.push(
          finding('GUI', 'GUI app PATH may not include your shell PATH', 'MEDIUM', 'GUI_PATH', {
            server: name,
            evidence: `Server "${name}" uses "${cmd}" which may not be on the GUI app PATH`,
            suggestedFix: `Claude Desktop and Cursor launch without your shell's PATH.
If the server fails in the app but works in Terminal, use an absolute path:
  "command": "/opt/homebrew/bin/${cmd}"   (Apple Silicon)
  "command": "/usr/local/bin/${cmd}"       (Intel)
Run: which ${cmd}  — to find the absolute path.`,
          }),
        );
        guiWarningEmitted = true;
      }
    }
  }

  return findings;
}

function diagnoseServer(
  name: string,
  raw: RawServerConfig,
  execCache: Map<string, ExecutableCheckResult>,
): Finding[] {
  const findings: Finding[] = [];

  if (typeof raw.command !== 'string' || raw.command.trim() === '') {
    findings.push(
      finding('CMD', 'Server missing required "command" field', 'HIGH', 'TOOL_VISIBILITY', {
        server: name,
        evidence: `Server "${name}": command = ${JSON.stringify(raw.command)}`,
        suggestedFix: `Add a "command" field to server "${name}":\n  "command": "npx"`,
      }),
    );
    return findings;
  }

  const cmd = raw.command.trim();

  if (containsShellOperator(cmd)) {
    findings.push(
      finding('CMD', 'Command contains shell operators', 'HIGH', 'COMMAND_PATH', {
        server: name,
        evidence: `command = "${cmd}"`,
        suggestedFix:
          'MCP server "command" must be a single executable, not a shell expression.\nShell operators (&&, |, ;, >, <) are not supported.\nUse "args" to pass arguments.',
      }),
    );
  }

  if (isRelativePath(cmd)) {
    findings.push(
      finding('CMD', 'Command uses relative path', 'MEDIUM', 'COMMAND_PATH', {
        server: name,
        evidence: `command = "${cmd}"`,
        suggestedFix: `Convert to absolute path. Run: realpath ${cmd}`,
      }),
    );
  }

  const isManaged = MANAGED_EXECUTABLES.includes(cmd.split('/').at(-1) ?? cmd);
  const isAbsolute = path.isAbsolute(cmd);

  if (!isAbsolute && !containsShellOperator(cmd)) {
    const cacheKey = cmd.split('/').at(-1) ?? cmd;
    if (!execCache.has(cacheKey)) {
      execCache.set(cacheKey, checkExecutable(cmd));
    }
    const check = execCache.get(cacheKey)!;

    if (!check.found) {
      findings.push(
        finding('EXE', `Executable not found: ${cmd}`, 'HIGH', 'EXECUTABLE', {
          server: name,
          evidence: `"${cmd}" was not found on PATH or common install locations`,
          suggestedFix: getInstallHint(cmd),
        }),
      );
    } else if (check.guiPathOnly) {
      findings.push(
        finding(
          'EXE',
          `Executable only found in GUI-unsafe location: ${check.resolvedPath}`,
          'MEDIUM',
          'GUI_PATH',
          {
            server: name,
            evidence: `"${cmd}" is at ${check.resolvedPath} but may not be on GUI app PATH`,
            suggestedFix: `Use the absolute path in your config:\n  "command": "${check.resolvedPath}"`,
          },
        ),
      );
    }
  }

  if (isAbsolute) {
    const check = checkExecutable(cmd);
    if (!check.found) {
      findings.push(
        finding('EXE', `Absolute path not found or not executable: ${cmd}`, 'HIGH', 'EXECUTABLE', {
          server: name,
          evidence: `Absolute path "${cmd}" does not exist or is not executable`,
          suggestedFix: `Verify the path exists: ls -la "${cmd}"`,
        }),
      );
    }
  }

  if (typeof raw.args !== 'undefined' && !Array.isArray(raw.args)) {
    findings.push(
      finding('ARG', '"args" must be an array', 'HIGH', 'CONFIG_FILE', {
        server: name,
        evidence: `args = ${JSON.stringify(raw.args)}`,
        suggestedFix: 'Change args to an array: "args": ["arg1", "arg2"]',
      }),
    );
  }

  if (Array.isArray(raw.args)) {
    const args = raw.args as unknown[];

    if (cmd === 'npx' && args.length === 0) {
      findings.push(
        finding('ARG', 'npx with no args — no package will be run', 'HIGH', 'TOOL_VISIBILITY', {
          server: name,
          evidence: 'command = "npx", args = []',
          suggestedFix: 'Provide the package name: "args": ["-y", "your-mcp-package"]',
        }),
      );
    }

    if (cmd === 'npx' && args.length > 0) {
      const argStrings = args.filter((a) => typeof a === 'string') as string[];
      const hasPackage = argStrings.some((a) => !a.startsWith('-') || a.includes('/'));
      if (!hasPackage) {
        findings.push(
          finding('ARG', 'npx args appear to be only flags — no package specified', 'HIGH', 'TOOL_VISIBILITY', {
            server: name,
            evidence: `args = ${JSON.stringify(args)}`,
            suggestedFix: 'Add the package name after flags: "args": ["-y", "your-mcp-package"]',
          }),
        );
      }
    }

    if ((cmd === 'uv' || cmd === 'uvx') && args.length === 0) {
      findings.push(
        finding('ARG', `${cmd} with no args — no tool will run`, 'HIGH', 'TOOL_VISIBILITY', {
          server: name,
          evidence: `command = "${cmd}", args = []`,
          suggestedFix: `Provide the tool: "args": ["run", "your-mcp-tool"]`,
        }),
      );
    }

    for (const arg of args) {
      if (typeof arg !== 'string') {
        findings.push(
          finding('ARG', 'Non-string value in args array', 'MEDIUM', 'CONFIG_FILE', {
            server: name,
            evidence: `args contains: ${JSON.stringify(arg)}`,
            suggestedFix: 'All args must be strings.',
          }),
        );
      }
    }
  }

  if (typeof raw.env !== 'undefined') {
    if (typeof raw.env !== 'object' || raw.env === null || Array.isArray(raw.env)) {
      findings.push(
        finding('ENV', '"env" must be an object', 'HIGH', 'CONFIG_FILE', {
          server: name,
          evidence: `env = ${JSON.stringify(raw.env)}`,
          suggestedFix: 'Change env to an object: "env": { "KEY": "value" }',
        }),
      );
    } else {
      const env = raw.env as Record<string, unknown>;
      for (const [key, val] of Object.entries(env)) {
        const valStr = typeof val === 'string' ? val : JSON.stringify(val);

        if (typeof val !== 'string') {
          findings.push(
            finding('ENV', `Env value is not a string: ${key}`, 'MEDIUM', 'ENV_TOKEN', {
              server: name,
              evidence: `${key} = ${truncate(valStr, 60)}`,
              suggestedFix: `All env values must be strings. Wrap the value in quotes.`,
            }),
          );
          continue;
        }

        if (val === '') {
          findings.push(
            finding('ENV', `Empty env value: ${key}`, 'HIGH', 'ENV_TOKEN', {
              server: name,
              evidence: `${key} = ""`,
              suggestedFix: isSensitiveKey(key)
                ? `Set ${key} to your actual token/key value. Never leave it empty.`
                : `Set a value for ${key} or remove it.`,
            }),
          );
        } else if (isPlaceholderValue(val)) {
          findings.push(
            finding('ENV', `Placeholder value detected: ${key}`, 'HIGH', 'ENV_TOKEN', {
              server: name,
              evidence: `${key} = "${maskSecret(key, val)}"`,
              suggestedFix: `Replace the placeholder with your real ${key} value.`,
            }),
          );
        } else if (isSensitiveKey(key)) {
          const masked = maskSecret(key, val);
          findings.push(
            finding('SEC', `Secret embedded in config file: ${key}`, 'MEDIUM', 'SECURITY', {
              server: name,
              evidence: `${key} = "${masked}"`,
              suggestedFix: `Consider using a secrets manager or shell env injection instead of embedding secrets in config files.`,
            }),
          );
        }
      }
    }
  }

  checkFilesystemRisk(name, raw, findings);
  checkNetworkRisk(name, raw, findings);

  return findings;
}

function checkFilesystemRisk(name: string, raw: RawServerConfig, findings: Finding[]): void {
  const serverLower = name.toLowerCase();
  const isFilesystemServer = FILESYSTEM_SERVER_PATTERNS.some((p) => serverLower.includes(p));

  const args: string[] = Array.isArray(raw.args)
    ? (raw.args as unknown[]).filter((a) => typeof a === 'string').map(String)
    : [];

  const riskyArgFound = args.find((a) =>
    RISKY_PATH_ARGS.some((r) => a === r || a.startsWith(r + '/') || a === r),
  );

  if (isFilesystemServer && riskyArgFound) {
    const isRoot = riskyArgFound === '/';
    findings.push(
      finding(
        'FS',
        isRoot ? 'Filesystem server has access to root path "/"' : 'Filesystem server has overly broad access',
        'HIGH',
        'FILESYSTEM_RISK',
        {
          server: name,
          evidence: `Path argument: "${riskyArgFound}"`,
          suggestedFix: `Scope filesystem access to your project directory:
  "args": ["--directory", "/path/to/your/project"]
Avoid granting access to home (~), root (/), or system directories.`,
        },
      ),
    );
  } else if (isFilesystemServer) {
    findings.push(
      finding('FS', 'Filesystem server detected — verify access scope', 'LOW', 'FILESYSTEM_RISK', {
        server: name,
        evidence: `Server name "${name}" suggests filesystem access`,
        suggestedFix: `Ensure the filesystem server is scoped to the minimum required directory.`,
      }),
    );
  }

  for (const arg of args) {
    if (arg === '/' || arg === '/root') {
      findings.push(
        finding('FS', `Argument grants root filesystem access: "${arg}"`, 'HIGH', 'FILESYSTEM_RISK', {
          server: name,
          evidence: `args contains: "${arg}"`,
          suggestedFix: `Replace "${arg}" with a specific project directory path.`,
        }),
      );
    } else if (arg.startsWith('/Users') || arg.startsWith('/home')) {
      findings.push(
        finding('FS', 'Argument grants access to full home directory', 'HIGH', 'FILESYSTEM_RISK', {
          server: name,
          evidence: `args contains: "${arg}"`,
          suggestedFix: `Scope to a specific project directory instead of the entire home folder.`,
        }),
      );
    }
  }
}

function checkNetworkRisk(name: string, raw: RawServerConfig, findings: Finding[]): void {
  const serverLower = name.toLowerCase();
  const args: string[] = Array.isArray(raw.args)
    ? (raw.args as unknown[]).filter((a) => typeof a === 'string').map(String)
    : [];
  const argsLower = args.map((a) => a.toLowerCase()).join(' ');

  for (const [pattern, message] of Object.entries(NETWORK_SERVER_PATTERNS)) {
    if (serverLower.includes(pattern) || argsLower.includes(pattern)) {
      findings.push(
        finding('NET', message, 'MEDIUM', 'NETWORK_RISK', {
          server: name,
          evidence: `Server name or args suggest "${pattern}" access`,
          suggestedFix: `Review required permissions and ensure tokens have minimum required scopes.`,
        }),
      );
      break;
    }
  }
}

function getInstallHint(cmd: string): string {
  switch (cmd) {
    case 'npx':
    case 'npm':
    case 'node':
      return `Install Node.js from https://nodejs.org (includes npm and npx)
  macOS: brew install node
  Or use a version manager: https://github.com/nvm-sh/nvm`;
    case 'uv':
    case 'uvx':
      return `Install uv from https://docs.astral.sh/uv/
  macOS/Linux: curl -LsSf https://astral.sh/uv/install.sh | sh`;
    case 'python':
    case 'python3':
      return `Install Python from https://python.org
  macOS: brew install python3`;
    case 'docker':
      return `Install Docker Desktop from https://docker.com/products/docker-desktop`;
    case 'bun':
      return `Install Bun from https://bun.sh
  curl -fsSL https://bun.sh/install | bash`;
    case 'deno':
      return `Install Deno from https://deno.land
  curl -fsSL https://deno.land/install.sh | sh`;
    default:
      return `"${cmd}" was not found. Ensure it is installed and on your PATH.`;
  }
}

export function diagnoseAllConfigs(configs: ParsedConfig[]): Finding[] {
  _findingCounter = 0;
  const all: Finding[] = [];
  for (const config of configs) {
    all.push(...diagnoseConfig(config));
  }
  return all;
}

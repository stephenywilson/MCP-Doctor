import { execSync } from 'child_process';
import os from 'os';
import path from 'path';

export function expandHome(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

const PLACEHOLDER_PATTERNS = [
  'your_api_key',
  'your-api-key',
  'YOUR_API_KEY',
  'YOUR-API-KEY',
  'your_token',
  'your-token',
  'YOUR_TOKEN',
  'replace-me',
  'replace_me',
  'REPLACE_ME',
  'REPLACE-ME',
  'todo',
  'TODO',
  '<your',
  'INSERT_',
  'change-me',
  'changeme',
  'placeholder',
  'example_key',
  'test_key',
  'dummy',
  'xxxxxxxx',
];

export function isPlaceholderValue(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

const SENSITIVE_KEY_PATTERNS = [
  'TOKEN',
  'API_KEY',
  'APIKEY',
  'SECRET',
  'PASSWORD',
  'PASSWD',
  'AUTH',
  'CREDENTIAL',
  'PRIVATE_KEY',
  'ACCESS_KEY',
];

export function isSensitiveKey(key: string): boolean {
  const upper = key.toUpperCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => upper.includes(p));
}

export function maskSecret(key: string, value: string): string {
  if (!isSensitiveKey(key)) return value;
  if (value.length <= 6) return '****';
  const prefix = value.slice(0, Math.min(6, Math.floor(value.length * 0.3)));
  return `${prefix}****`;
}

export function whichSync(cmd: string): string | null {
  try {
    const result = execSync(`which ${cmd}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function containsShellOperator(cmd: string): boolean {
  return /[&|;<>]/.test(cmd);
}

export function isRelativePath(cmd: string): boolean {
  return (cmd.startsWith('./') || cmd.startsWith('../')) && !path.isAbsolute(cmd);
}

export function isAbsolutePath(cmd: string): boolean {
  return path.isAbsolute(cmd);
}

export function truncate(s: string, max = 120): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

import fs from 'fs';
import path from 'path';
import { ExecutableCheckResult } from '../types.js';
import { whichSync, isMacOS } from '../utils.js';

const GUI_APP_PATHS_MACOS = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/bin',
  '/bin',
  '/opt/local/bin',
  '/usr/local/sbin',
];

const GUI_APP_PATHS_LINUX = [
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/snap/bin',
  '/home/linuxbrew/.linuxbrew/bin',
];

export const MANAGED_EXECUTABLES = [
  'node',
  'npm',
  'npx',
  'python',
  'python3',
  'uv',
  'uvx',
  'docker',
  'bun',
  'deno',
];

function getGuiPaths(): string[] {
  if (isMacOS()) return GUI_APP_PATHS_MACOS;
  return GUI_APP_PATHS_LINUX;
}

function findInDirs(cmd: string, dirs: string[]): string | undefined {
  for (const dir of dirs) {
    const candidate = path.join(dir, cmd);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // not found here
    }
  }
  return undefined;
}

export function checkExecutable(cmd: string): ExecutableCheckResult {
  if (path.isAbsolute(cmd)) {
    const exists = fs.existsSync(cmd);
    let executable = false;
    if (exists) {
      try {
        fs.accessSync(cmd, fs.constants.X_OK);
        executable = true;
      } catch {
        // not executable
      }
    }
    return {
      command: cmd,
      found: exists && executable,
      resolvedPath: exists && executable ? cmd : undefined,
      guiPathOnly: false,
      checkedPaths: [cmd],
    };
  }

  const whichResult = whichSync(cmd);
  if (whichResult) {
    return {
      command: cmd,
      found: true,
      resolvedPath: whichResult,
      guiPathOnly: false,
      checkedPaths: [whichResult],
    };
  }

  const guiPaths = getGuiPaths();
  const guiFound = findInDirs(cmd, guiPaths);

  if (guiFound) {
    return {
      command: cmd,
      found: true,
      resolvedPath: guiFound,
      guiPathOnly: true,
      checkedPaths: guiPaths,
    };
  }

  return {
    command: cmd,
    found: false,
    guiPathOnly: false,
    checkedPaths: guiPaths,
  };
}

export function checkAllManagedExecutables(): Map<string, ExecutableCheckResult> {
  const results = new Map<string, ExecutableCheckResult>();
  for (const cmd of MANAGED_EXECUTABLES) {
    results.set(cmd, checkExecutable(cmd));
  }
  return results;
}

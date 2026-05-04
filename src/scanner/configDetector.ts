import fs from 'fs';
import os from 'os';
import path from 'path';

export interface DetectedConfig {
  path: string;
  clientLabel: string;
  exists: boolean;
}

const HOME = os.homedir();
const CWD = process.cwd();

export const KNOWN_CONFIG_LOCATIONS: DetectedConfig[] = [
  {
    path: path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    clientLabel: 'Claude Desktop (macOS)',
    exists: false,
  },
  {
    path: path.join(HOME, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
    clientLabel: 'Claude Desktop (Windows)',
    exists: false,
  },
  {
    path: path.join(CWD, '.cursor', 'mcp.json'),
    clientLabel: 'Cursor (project)',
    exists: false,
  },
  {
    path: path.join(CWD, '.mcp.json'),
    clientLabel: 'MCP (project root)',
    exists: false,
  },
  {
    path: path.join(HOME, '.cursor', 'mcp.json'),
    clientLabel: 'Cursor (global)',
    exists: false,
  },
  {
    path: path.join(HOME, '.config', 'mcp', 'config.json'),
    clientLabel: 'MCP (XDG config)',
    exists: false,
  },
];

export function detectConfigs(extraPaths: string[] = []): DetectedConfig[] {
  const results: DetectedConfig[] = [];

  for (const known of KNOWN_CONFIG_LOCATIONS) {
    results.push({
      ...known,
      exists: fs.existsSync(known.path),
    });
  }

  for (const extra of extraPaths) {
    const resolved = path.resolve(extra);
    const already = results.find((r) => r.path === resolved);
    if (!already) {
      results.push({
        path: resolved,
        clientLabel: 'Custom (--config)',
        exists: fs.existsSync(resolved),
      });
    } else {
      already.clientLabel = 'Custom (--config)';
    }
  }

  return results;
}

export function getClientLabel(configPath: string): string {
  const known = KNOWN_CONFIG_LOCATIONS.find((k) => k.path === configPath);
  return known?.clientLabel ?? 'Unknown Client';
}

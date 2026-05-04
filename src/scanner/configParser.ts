import fs from 'fs';
import { ParsedConfig, RawServerConfig } from '../types.js';

export function parseConfigFile(filePath: string, clientLabel: string): ParsedConfig {
  if (!fs.existsSync(filePath)) {
    return { path: filePath, clientLabel, notFound: true };
  }

  let rawText: string;
  try {
    rawText = fs.readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    return {
      path: filePath,
      clientLabel,
      parseError: `Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (rawText.trim() === '') {
    return {
      path: filePath,
      clientLabel,
      raw: {},
      servers: {},
      parseError: 'File is empty',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      path: filePath,
      clientLabel,
      parseError: `Invalid JSON: ${msg}`,
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      path: filePath,
      clientLabel,
      raw: {},
      parseError: 'Config root must be a JSON object',
    };
  }

  const root = parsed as Record<string, unknown>;

  if (!('mcpServers' in root)) {
    return {
      path: filePath,
      clientLabel,
      raw: root,
      servers: {},
    };
  }

  const mcpServers = root['mcpServers'];

  if (mcpServers === null || typeof mcpServers !== 'object' || Array.isArray(mcpServers)) {
    return {
      path: filePath,
      clientLabel,
      raw: root,
      servers: {},
      parseError: 'mcpServers must be an object',
    };
  }

  const serversRaw = mcpServers as Record<string, unknown>;
  const servers: Record<string, RawServerConfig> = {};

  for (const [name, cfg] of Object.entries(serversRaw)) {
    if (typeof cfg === 'object' && cfg !== null && !Array.isArray(cfg)) {
      servers[name] = cfg as RawServerConfig;
    } else {
      servers[name] = { _invalid: cfg };
    }
  }

  return {
    path: filePath,
    clientLabel,
    raw: root,
    servers,
  };
}

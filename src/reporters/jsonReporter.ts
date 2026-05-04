import { ParsedConfig, RawServerConfig, ScanReport } from '../types.js';
import { maskSecret } from '../utils.js';

function maskRawServerEnv(raw: RawServerConfig): RawServerConfig {
  if (typeof raw.env !== 'object' || raw.env === null || Array.isArray(raw.env)) {
    return raw;
  }
  const env = raw.env as Record<string, unknown>;
  return {
    ...raw,
    env: Object.fromEntries(
      Object.entries(env).map(([k, v]) => [k, typeof v === 'string' ? maskSecret(k, v) : v]),
    ),
  };
}

function maskParsedConfigSecrets(cfg: ParsedConfig): ParsedConfig {
  const maskedServers = cfg.servers
    ? Object.fromEntries(Object.entries(cfg.servers).map(([n, s]) => [n, maskRawServerEnv(s)]))
    : cfg.servers;

  const maskedRaw = cfg.raw?.mcpServers
    ? {
        ...cfg.raw,
        mcpServers: Object.fromEntries(
          Object.entries(cfg.raw.mcpServers as Record<string, unknown>).map(([n, s]) => [
            n,
            typeof s === 'object' && s !== null ? maskRawServerEnv(s as RawServerConfig) : s,
          ]),
        ),
      }
    : cfg.raw;

  return { ...cfg, servers: maskedServers, raw: maskedRaw };
}

export function generateJson(report: ScanReport): string {
  const safeReport = {
    ...report,
    configs: report.configs.map(maskParsedConfigSecrets),
    servers: report.servers.map((srv) => ({
      ...srv,
      config: {
        ...srv.config,
        raw: maskRawServerEnv(srv.config.raw),
        env: Object.fromEntries(
          Object.entries(srv.config.env).map(([k, v]) => [k, maskSecret(k, v)]),
        ),
      },
    })),
  };

  return JSON.stringify(safeReport, null, 2);
}

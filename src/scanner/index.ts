import fs from 'fs';
import path from 'path';
import { ParsedConfig, ScanOptions, ScanReport } from '../types.js';
import { detectConfigs } from './configDetector.js';
import { parseConfigFile } from './configParser.js';
import { diagnoseAllConfigs } from './diagnostics.js';
import { scoreFindings } from './riskScorer.js';
import { formatTimestamp } from '../utils.js';

export async function scan(options: ScanOptions): Promise<ScanReport> {
  const detected = detectConfigs(options.configPaths);

  const configs: ParsedConfig[] = [];

  if (options.configPaths.length > 0) {
    for (const p of options.configPaths) {
      const det = detected.find((d) => d.path === path.resolve(p));
      const label = det?.clientLabel ?? 'Custom (--config)';
      configs.push(parseConfigFile(path.resolve(p), label));
    }
  } else {
    for (const det of detected) {
      if (det.exists) {
        configs.push(parseConfigFile(det.path, det.clientLabel));
      }
    }
  }

  if (configs.length === 0 && options.configPaths.length === 0) {
    configs.push({
      path: '(none found)',
      clientLabel: 'No config found',
      notFound: true,
    });
  }

  const allFindings = diagnoseAllConfigs(configs);
  const { score, status } = scoreFindings(allFindings);

  const servers: ScanReport['servers'] = [];
  for (const cfg of configs) {
    for (const [name, raw] of Object.entries(cfg.servers ?? {})) {
      const serverFindings = allFindings.filter((f) => f.server === name);
      servers.push({
        name,
        config: {
          command: typeof raw.command === 'string' ? raw.command : '',
          args: Array.isArray(raw.args) ? (raw.args as string[]) : [],
          env: typeof raw.env === 'object' && raw.env !== null && !Array.isArray(raw.env)
            ? (raw.env as Record<string, string>)
            : {},
          raw,
        },
        findings: serverFindings,
      });
    }
  }

  const globalFindings = allFindings.filter((f) => !f.server);

  fs.mkdirSync(options.outputDir, { recursive: true });

  return {
    timestamp: formatTimestamp(),
    configs,
    servers,
    globalFindings,
    allFindings,
    score,
    status,
    outputDir: options.outputDir,
  };
}

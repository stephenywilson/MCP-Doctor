import fs from 'fs';
import path from 'path';
import { FirewallPolicy } from './types.js';
import { getDefaultSensitivePaths } from './classifier.js';

export const POLICY_FILENAME = 'mcp-doctor.firewall.json';

export function defaultPolicy(): FirewallPolicy {
  return {
    version: 1,
    defaultAction: 'ask',
    workspaceRoot: '.',
    sensitivePaths: getDefaultSensitivePaths(),
    rules: [
      {
        name: 'Block critical severity',
        match: { severity: 'CRITICAL' },
        action: 'block',
      },
      {
        name: 'Block secret access',
        match: { category: 'SECRET' },
        action: 'block',
      },
      {
        name: 'Block deletes',
        match: { category: 'DELETE' },
        action: 'block',
      },
      {
        name: 'Ask before shell execution',
        match: { category: 'EXECUTE' },
        action: 'ask',
      },
      {
        name: 'Ask before writes',
        match: { category: 'WRITE' },
        action: 'ask',
      },
      {
        name: 'Ask before network requests',
        match: { category: 'NETWORK' },
        action: 'ask',
      },
      {
        name: 'Allow safe reads',
        match: { category: 'READ' },
        action: 'allow',
      },
    ],
  };
}

export function loadPolicy(policyPath?: string): { policy: FirewallPolicy; source: string } {
  const candidates = [
    policyPath,
    path.join(process.cwd(), POLICY_FILENAME),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as FirewallPolicy;
        return { policy: raw, source: p };
      } catch {
        // fall through to defaults
      }
    }
  }

  return { policy: defaultPolicy(), source: '(built-in defaults)' };
}

export function writeDefaultPolicy(outPath: string): void {
  const policy = defaultPolicy();
  fs.writeFileSync(outPath, JSON.stringify(policy, null, 2) + '\n', 'utf8');
}

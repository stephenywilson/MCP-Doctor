import { Finding, ReportStatus } from '../types.js';

export interface ScoreResult {
  score: number;
  status: ReportStatus;
}

const DEDUCTIONS: Record<string, number> = {
  HIGH: 20,
  MEDIUM: 8,
  LOW: 3,
};

export function scoreFindings(findings: Finding[]): ScoreResult {
  let score = 100;

  const highCount = findings.filter((f) => f.severity === 'HIGH').length;
  const medCount = findings.filter((f) => f.severity === 'MEDIUM').length;
  const lowCount = findings.filter((f) => f.severity === 'LOW').length;

  score -= highCount * DEDUCTIONS.HIGH;
  score -= medCount * DEDUCTIONS.MEDIUM;
  score -= lowCount * DEDUCTIONS.LOW;

  score = Math.max(0, score);

  const hasSecurityFindings = findings.some((f) => f.category === 'SECURITY' || f.category === 'FILESYSTEM_RISK');

  let status: ReportStatus;
  if (highCount > 0) {
    status = 'BROKEN';
  } else if (hasSecurityFindings || medCount > 0) {
    status = medCount > 0 && hasSecurityFindings ? 'RISKY' : medCount > 0 ? 'NEEDS_REVIEW' : 'RISKY';
  } else {
    status = 'OK';
  }

  if (hasSecurityFindings && status === 'NEEDS_REVIEW') {
    status = 'RISKY';
  }

  return { score, status };
}

export function statusLabel(status: ReportStatus): string {
  switch (status) {
    case 'OK':
      return '✅ OK';
    case 'NEEDS_REVIEW':
      return '⚠️  NEEDS REVIEW';
    case 'BROKEN':
      return '❌ BROKEN';
    case 'RISKY':
      return '🔐 RISKY';
  }
}

export function statusEmoji(status: ReportStatus): string {
  switch (status) {
    case 'OK':
      return '✅';
    case 'NEEDS_REVIEW':
      return '⚠️';
    case 'BROKEN':
      return '❌';
    case 'RISKY':
      return '🔐';
  }
}

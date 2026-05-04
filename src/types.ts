export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReportStatus = 'OK' | 'NEEDS_REVIEW' | 'BROKEN' | 'RISKY';

export type FindingCategory =
  | 'CONFIG_FILE'
  | 'COMMAND_PATH'
  | 'EXECUTABLE'
  | 'ENV_TOKEN'
  | 'FILESYSTEM_RISK'
  | 'NETWORK_RISK'
  | 'TOOL_VISIBILITY'
  | 'GUI_PATH'
  | 'SECURITY';

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  category: FindingCategory;
  server?: string;
  evidence?: string;
  suggestedFix?: string;
}

export interface RawServerConfig {
  command?: unknown;
  args?: unknown;
  env?: unknown;
  [key: string]: unknown;
}

export interface ServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  raw: RawServerConfig;
}

export interface ParsedConfig {
  path: string;
  clientLabel: string;
  raw?: Record<string, unknown>;
  servers?: Record<string, RawServerConfig>;
  parseError?: string;
  notFound?: boolean;
}

export interface ServerAnalysis {
  name: string;
  config: ServerConfig;
  findings: Finding[];
}

export interface ScanReport {
  timestamp: string;
  configs: ParsedConfig[];
  servers: ServerAnalysis[];
  globalFindings: Finding[];
  allFindings: Finding[];
  score: number;
  status: ReportStatus;
  outputDir: string;
}

export interface ScanOptions {
  configPaths: string[];
  outputDir: string;
  json: boolean;
  noHtml: boolean;
}

export interface ExecutableCheckResult {
  command: string;
  found: boolean;
  resolvedPath?: string;
  guiPathOnly?: boolean;
  checkedPaths: string[];
}

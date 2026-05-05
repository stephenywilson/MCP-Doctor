export type ToolCallCategory =
  | 'READ'
  | 'WRITE'
  | 'DELETE'
  | 'EXECUTE'
  | 'SECRET'
  | 'NETWORK'
  | 'DATABASE'
  | 'GIT'
  | 'UNKNOWN';

export type ToolCallSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type PolicyAction = 'allow' | 'ask' | 'block';

// Normalised internal event (server + tool + args)
export interface ToolCallEvent {
  server?: string;
  tool: string;
  arguments: Record<string, unknown>;
}

// JSON-RPC 2.0 MCP tool call shape
export interface JsonRpcToolCall {
  jsonrpc?: string;
  id?: number | string;
  method: string;
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

export interface AuditResult {
  event: ToolCallEvent;
  categories: ToolCallCategory[];
  severity: ToolCallSeverity;
  reasons: string[];
  recommendedAction: PolicyAction;
  sensitivePathsFound: string[];
  sensitiveKeysFound: string[];
}

export interface PolicyRuleMatch {
  category?: ToolCallCategory;
  severity?: ToolCallSeverity;
  tool?: string;
  server?: string;
}

export interface PolicyRule {
  name: string;
  match: PolicyRuleMatch;
  action: PolicyAction;
}

export interface FirewallPolicy {
  version: number;
  defaultAction: PolicyAction;
  workspaceRoot: string;
  sensitivePaths: string[];
  rules: PolicyRule[];
}

export interface BatchAuditResult {
  source: string;
  timestamp: string;
  policyFile: string;
  totalCalls: number;
  results: AuditResult[];
  severitySummary: Record<ToolCallSeverity, number>;
  verdict: string;
  overallSeverity: ToolCallSeverity;
}

import { classifyToolCall } from './classifier.js';
import { FirewallPolicy } from './types.js';
import type {
  AuditResult,
  BatchAuditResult,
  JsonRpcToolCall,
  ToolCallEvent,
  ToolCallSeverity,
} from './types.js';

const SEVERITY_ORDER: Record<ToolCallSeverity, number> = {
  LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3,
};

function maxSev(a: ToolCallSeverity, b: ToolCallSeverity): ToolCallSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

// ── Input parsing ─────────────────────────────────────────────────────────────

function isJsonRpc(obj: unknown): obj is JsonRpcToolCall {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'method' in obj &&
    typeof (obj as JsonRpcToolCall).method === 'string' &&
    (obj as JsonRpcToolCall).method === 'tools/call' &&
    'params' in obj
  );
}

function normaliseEvent(raw: unknown): ToolCallEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;

  // JSON-RPC format
  if (isJsonRpc(raw)) {
    const params = raw.params;
    return {
      tool: params.name,
      arguments: params.arguments ?? {},
    };
  }

  // Internal format
  const obj = raw as Record<string, unknown>;
  if (typeof obj.tool === 'string') {
    return {
      server: typeof obj.server === 'string' ? obj.server : undefined,
      tool: obj.tool,
      arguments:
        typeof obj.arguments === 'object' && obj.arguments !== null
          ? (obj.arguments as Record<string, unknown>)
          : {},
    };
  }

  return null;
}

export function parseToolCalls(jsonText: string): ToolCallEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON: ${msg}`);
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];
  const events: ToolCallEvent[] = [];

  for (const item of items) {
    const evt = normaliseEvent(item);
    if (evt) events.push(evt);
  }

  if (events.length === 0) {
    throw new Error(
      'No valid tool call events found. Expected { "tool": "...", "arguments": {...} } or JSON-RPC tools/call format.',
    );
  }

  return events;
}

// ── Batch audit ──────────────────────────────────────────────────────────────

export function auditBatch(
  events: ToolCallEvent[],
  policy: FirewallPolicy,
  source: string,
  policySource: string,
): BatchAuditResult {
  const results: AuditResult[] = events.map((e) => classifyToolCall(e, policy));

  const summary: Record<ToolCallSeverity, number> = {
    LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0,
  };
  let overall: ToolCallSeverity = 'LOW';
  for (const r of results) {
    summary[r.severity]++;
    overall = maxSev(overall, r.severity);
  }

  let verdict: string;
  if (summary.CRITICAL > 0) {
    verdict = `CRITICAL RISK — ${summary.CRITICAL} critical action(s) detected. Review before connecting to any AI tool.`;
  } else if (summary.HIGH > 0) {
    verdict = `HIGH RISK — ${summary.HIGH} high-severity action(s) detected. Review carefully.`;
  } else if (summary.MEDIUM > 0) {
    verdict = `MEDIUM RISK — ${summary.MEDIUM} action(s) require attention.`;
  } else {
    verdict = 'LOW RISK — No high-risk actions detected.';
  }

  return {
    source,
    timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'),
    policyFile: policySource,
    totalCalls: results.length,
    results,
    severitySummary: summary,
    verdict,
    overallSeverity: overall,
  };
}

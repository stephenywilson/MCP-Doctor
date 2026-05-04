import { Finding, ReportStatus, ScanReport, Severity } from '../types.js';
import { maskSecret } from '../utils.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function severityColor(s: Severity): string {
  switch (s) {
    case 'HIGH': return '#f85149';
    case 'MEDIUM': return '#d29922';
    case 'LOW': return '#388bfd';
  }
}

function statusColor(s: ReportStatus): string {
  switch (s) {
    case 'OK': return '#3fb950';
    case 'NEEDS_REVIEW': return '#d29922';
    case 'BROKEN': return '#f85149';
    case 'RISKY': return '#d29922';
  }
}

function statusLabel(s: ReportStatus): string {
  switch (s) {
    case 'OK': return 'OK';
    case 'NEEDS_REVIEW': return 'NEEDS REVIEW';
    case 'BROKEN': return 'BROKEN';
    case 'RISKY': return 'RISKY';
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return '#3fb950';
  if (score >= 50) return '#d29922';
  return '#f85149';
}

function findingCard(f: Finding): string {
  const color = severityColor(f.severity);
  const fixHtml = f.suggestedFix
    ? `<div class="fix-block"><div class="fix-label">Suggested Fix</div><pre class="fix-code">${esc(f.suggestedFix)}</pre></div>`
    : '';
  const evidenceHtml = f.evidence
    ? `<div class="evidence-block"><span class="evidence-label">Evidence:</span> <code>${esc(f.evidence)}</code></div>`
    : '';
  const serverHtml = f.server
    ? `<span class="tag">${esc(f.server)}</span>`
    : '';

  return `
<div class="finding-card" style="border-left: 3px solid ${color}">
  <div class="finding-header">
    <span class="severity-badge" style="background:${color}20;color:${color};border:1px solid ${color}40">${f.severity}</span>
    <span class="finding-title">${esc(f.title)}</span>
    <span class="finding-meta">
      <span class="tag tag-muted">${esc(f.id)}</span>
      <span class="tag tag-muted">${esc(f.category)}</span>
      ${serverHtml}
    </span>
  </div>
  ${evidenceHtml}
  ${fixHtml}
</div>`;
}

function serverCard(srv: ScanReport['servers'][0]): string {
  const hasIssues = srv.findings.length > 0;
  const highCount = srv.findings.filter((f) => f.severity === 'HIGH').length;
  const medCount = srv.findings.filter((f) => f.severity === 'MEDIUM').length;

  let statusIcon = '✅';
  let statusText = 'No issues';
  if (highCount > 0) { statusIcon = '❌'; statusText = `${highCount} HIGH`; }
  else if (medCount > 0) { statusIcon = '⚠️'; statusText = `${medCount} MEDIUM`; }

  const envRows = Object.entries(srv.config.env)
    .map(([k, v]) => `<tr><td class="env-key">${esc(k)}</td><td class="env-val">${esc(maskSecret(k, v))}</td></tr>`)
    .join('');

  const envTable = envRows
    ? `<table class="env-table"><thead><tr><th>Env Key</th><th>Value (masked)</th></tr></thead><tbody>${envRows}</tbody></table>`
    : '';

  return `
<div class="server-card">
  <div class="server-header">
    <span class="server-name">${esc(srv.name)}</span>
    <span class="server-status">${statusIcon} ${esc(statusText)}</span>
  </div>
  <div class="server-body">
    <div class="cmd-line"><span class="cmd-label">command</span> <code>${esc(srv.config.command || '(none)')}</code>
    ${srv.config.args.length > 0 ? `<span class="cmd-label" style="margin-left:8px">args</span> <code>${esc(JSON.stringify(srv.config.args))}</code>` : ''}</div>
    ${envTable}
  </div>
</div>`;
}

export function generateHtml(report: ScanReport): string {
  const scoreCol = scoreColor(report.score);
  const statusCol = statusColor(report.status);
  const highFindings = report.allFindings.filter((f) => f.severity === 'HIGH');
  const medFindings = report.allFindings.filter((f) => f.severity === 'MEDIUM');
  const lowFindings = report.allFindings.filter((f) => f.severity === 'LOW');

  const serverCardsHtml = report.servers.map(serverCard).join('\n');

  const findingsHtml = [
    highFindings.length > 0 ? `<div class="findings-group">
      <div class="findings-group-header" style="color:#f85149">🔴 HIGH — ${highFindings.length} finding${highFindings.length > 1 ? 's' : ''}</div>
      ${highFindings.map(findingCard).join('')}
    </div>` : '',
    medFindings.length > 0 ? `<div class="findings-group">
      <div class="findings-group-header" style="color:#d29922">🟡 MEDIUM — ${medFindings.length} finding${medFindings.length > 1 ? 's' : ''}</div>
      ${medFindings.map(findingCard).join('')}
    </div>` : '',
    lowFindings.length > 0 ? `<div class="findings-group">
      <div class="findings-group-header" style="color:#388bfd">🔵 LOW — ${lowFindings.length} finding${lowFindings.length > 1 ? 's' : ''}</div>
      ${lowFindings.map(findingCard).join('')}
    </div>` : '',
    report.allFindings.length === 0 ? `<div class="no-findings">✅ No issues detected — all scanned configs look good!</div>` : '',
  ].join('');

  const configRows = report.configs.map((cfg) => {
    const status = cfg.notFound
      ? `<span style="color:#d29922">⚠️ Not found</span>`
      : cfg.parseError
      ? `<span style="color:#f85149">❌ ${esc(cfg.parseError)}</span>`
      : `<span style="color:#3fb950">✅ Valid (${Object.keys(cfg.servers ?? {}).length} servers)</span>`;
    return `<tr><td>${esc(cfg.clientLabel)}</td><td class="mono">${esc(cfg.path)}</td><td>${status}</td></tr>`;
  }).join('');

  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (report.score / 100) * circumference;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MCP Doctor Report</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1117;--surface:#161b22;--surface2:#1c2128;--border:#30363d;
  --text:#c9d1d9;--text-muted:#8b949e;--text-dim:#484f58;
  --accent:#58a6ff;--radius:6px;--font-mono:'SF Mono','Fira Code','Cascadia Code',monospace;
}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  font-size:14px;line-height:1.6;min-height:100vh}
a{color:var(--accent);text-decoration:none}
code{font-family:var(--font-mono);font-size:12px;background:#21262d;padding:1px 5px;border-radius:3px;color:#e6edf3}
pre{font-family:var(--font-mono);font-size:12px;overflow-x:auto}
.mono{font-family:var(--font-mono);font-size:12px}

.header{background:linear-gradient(135deg,#161b22 0%,#1c2128 100%);
  border-bottom:1px solid var(--border);padding:32px 40px}
.header-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;gap:16px}
.logo{font-size:28px;font-weight:700;color:#e6edf3;letter-spacing:-0.5px}
.logo span{color:var(--accent)}
.version-badge{font-size:11px;background:#21262d;color:var(--text-muted);
  border:1px solid var(--border);padding:2px 8px;border-radius:20px}
.timestamp{margin-left:auto;font-size:12px;color:var(--text-muted)}

.main{max-width:1100px;margin:32px auto;padding:0 40px}

.score-section{display:grid;grid-template-columns:auto 1fr auto;gap:24px;
  align-items:center;background:var(--surface);border:1px solid var(--border);
  border-radius:var(--radius);padding:28px 32px;margin-bottom:24px}
.score-ring-wrap{display:flex;flex-direction:column;align-items:center;gap:8px}
.score-label{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px}
.score-ring{transform:rotate(-90deg)}
.score-text{font-size:22px;font-weight:700;fill:${scoreCol}}
.score-sub{font-size:10px;fill:var(--text-muted)}

.status-info{padding-left:8px}
.status-badge{display:inline-flex;align-items:center;gap:8px;
  font-size:22px;font-weight:700;color:${statusCol}}
.status-desc{color:var(--text-muted);font-size:13px;margin-top:4px}

.stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.stat-card{background:var(--surface2);border:1px solid var(--border);
  border-radius:var(--radius);padding:14px 16px;text-align:center}
.stat-num{font-size:28px;font-weight:700}
.stat-lbl{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px}

.section{margin-bottom:32px}
.section-title{font-size:16px;font-weight:600;color:#e6edf3;
  padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:16px}

table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 12px;color:var(--text-muted);
  font-size:11px;text-transform:uppercase;letter-spacing:0.5px;
  border-bottom:1px solid var(--border);background:var(--surface2)}
td{padding:10px 12px;border-bottom:1px solid #21262d;vertical-align:top}
tr:last-child td{border-bottom:none}

.server-card{background:var(--surface);border:1px solid var(--border);
  border-radius:var(--radius);margin-bottom:12px;overflow:hidden}
.server-header{display:flex;align-items:center;justify-content:space-between;
  padding:12px 16px;background:var(--surface2);border-bottom:1px solid var(--border)}
.server-name{font-weight:600;color:#e6edf3;font-family:var(--font-mono);font-size:13px}
.server-status{font-size:12px;color:var(--text-muted)}
.server-body{padding:14px 16px}
.cmd-line{margin-bottom:10px;font-size:13px}
.cmd-label{color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-right:4px}
.env-table{font-size:12px;margin-top:8px;border:1px solid var(--border);border-radius:4px}
.env-table th{background:#1c2128}
.env-key{font-family:var(--font-mono);color:var(--accent)}
.env-val{font-family:var(--font-mono);color:var(--text-muted)}

.finding-card{background:var(--surface);border:1px solid var(--border);
  border-radius:var(--radius);margin-bottom:10px;padding:14px 16px;overflow:hidden}
.finding-header{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.severity-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;
  text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap}
.finding-title{font-size:13px;font-weight:500;color:#e6edf3;flex:1}
.finding-meta{display:flex;gap:6px;flex-wrap:wrap}
.tag{font-size:10px;background:#21262d;color:var(--text-muted);
  border:1px solid var(--border);padding:2px 7px;border-radius:20px;white-space:nowrap}
.tag-muted{color:var(--text-dim)}
.evidence-block{font-size:12px;color:var(--text-muted);margin-bottom:8px;
  background:#21262d;border-radius:4px;padding:8px 10px}
.evidence-block code{background:transparent;padding:0;font-size:12px}
.evidence-label{color:var(--text-dim);font-size:11px;font-weight:600}
.fix-block{margin-top:8px}
.fix-label{font-size:11px;color:#3fb950;font-weight:600;margin-bottom:4px;
  text-transform:uppercase;letter-spacing:0.5px}
.fix-code{background:#0d2611;border:1px solid #1a4a25;border-radius:4px;
  padding:10px 12px;color:#7ee787;font-size:12px;white-space:pre-wrap;word-break:break-word}

.findings-group{margin-bottom:20px}
.findings-group-header{font-size:13px;font-weight:600;margin-bottom:10px}
.no-findings{background:var(--surface);border:1px solid #238636;border-radius:var(--radius);
  padding:24px;text-align:center;color:#3fb950;font-size:15px}

.footer{max-width:1100px;margin:0 auto;padding:24px 40px;
  border-top:1px solid var(--border);color:var(--text-muted);font-size:12px;
  display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}

@media(max-width:700px){
  .header{padding:20px},
  .main{padding:0 16px},
  .score-section{grid-template-columns:1fr;text-align:center},
  .stat-grid{grid-template-columns:1fr 1fr},
}
</style>
</head>
<body>

<header class="header">
  <div class="header-inner">
    <div class="logo">MCP <span>Doctor</span></div>
    <span class="version-badge">v0.1.0</span>
    <div class="timestamp">${esc(report.timestamp)}</div>
  </div>
</header>

<main class="main">

  <div class="score-section">
    <div class="score-ring-wrap">
      <div class="score-label">Health Score</div>
      <svg class="score-ring" width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="#21262d" stroke-width="10"/>
        <circle cx="60" cy="60" r="54" fill="none" stroke="${scoreCol}" stroke-width="10"
          stroke-dasharray="${circumference.toFixed(2)}"
          stroke-dashoffset="${offset.toFixed(2)}"
          stroke-linecap="round"/>
        <text x="60" y="58" text-anchor="middle" dominant-baseline="middle"
          class="score-text" font-family="-apple-system,sans-serif" font-weight="700" font-size="22">${report.score}</text>
        <text x="60" y="76" text-anchor="middle" dominant-baseline="middle"
          class="score-sub" font-family="-apple-system,sans-serif" font-size="10" fill="#8b949e">/ 100</text>
      </svg>
    </div>

    <div class="status-info">
      <div class="status-badge">${statusLabel(report.status)}</div>
      <div class="status-desc">
        ${report.status === 'OK' ? 'All scanned MCP configs look healthy.' : ''}
        ${report.status === 'NEEDS_REVIEW' ? 'Some configuration issues may cause problems. Review the findings below.' : ''}
        ${report.status === 'BROKEN' ? 'Critical issues detected. MCP servers are likely not starting. Fix HIGH severity findings first.' : ''}
        ${report.status === 'RISKY' ? 'Security-sensitive configuration detected. Review permissions and token handling.' : ''}
      </div>
      <div style="margin-top:12px;display:flex;gap:16px;font-size:12px;color:var(--text-muted)">
        <span>${report.configs.length} config${report.configs.length !== 1 ? 's' : ''} scanned</span>
        <span>${report.servers.length} server${report.servers.length !== 1 ? 's' : ''} found</span>
        <span>${report.allFindings.length} finding${report.allFindings.length !== 1 ? 's' : ''}</span>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-num" style="color:#f85149">${highFindings.length}</div>
        <div class="stat-lbl">High</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color:#d29922">${medFindings.length}</div>
        <div class="stat-lbl">Medium</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color:#388bfd">${lowFindings.length}</div>
        <div class="stat-lbl">Low</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Scanned Configs</div>
    <table>
      <thead><tr><th>Client</th><th>Path</th><th>Status</th></tr></thead>
      <tbody>${configRows}</tbody>
    </table>
  </div>

  ${report.servers.length > 0 ? `
  <div class="section">
    <div class="section-title">Detected Servers (${report.servers.length})</div>
    ${serverCardsHtml}
  </div>` : ''}

  <div class="section">
    <div class="section-title">Findings</div>
    ${findingsHtml}
  </div>

  <div class="section">
    <div class="section-title">Safe Config Template</div>
    <div class="finding-card" style="border-left:3px solid #3fb950">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Use absolute paths to avoid GUI app PATH issues:</div>
      <pre class="fix-code">${esc(JSON.stringify({
        mcpServers: {
          'your-server': {
            command: '/opt/homebrew/bin/npx',
            args: ['-y', 'your-mcp-package'],
            env: { API_KEY: 'your-actual-api-key' },
          },
        },
      }, null, 2))}</pre>
    </div>
  </div>

</main>

<footer class="footer">
  <span>MCP Doctor v0.1.0 — <a href="https://github.com/stephenywilson/MCP-Doctor">github.com/stephenywilson/MCP-Doctor</a></span>
  <span>⚠️ Secrets are masked. No data is sent to any network.</span>
</footer>

</body>
</html>`;
}

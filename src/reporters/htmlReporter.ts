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

function sevColor(s: Severity): string {
  return s === 'HIGH' ? '#E26A6A' : s === 'MEDIUM' ? '#D8B34B' : '#19D6B0';
}

function scoreColor(n: number): string {
  return n >= 80 ? '#19D6B0' : n >= 50 ? '#D8B34B' : '#E26A6A';
}

function pillClass(s: Severity): string {
  return s === 'HIGH' ? 'pill-danger' : s === 'MEDIUM' ? 'pill-warn' : 'pill-accent';
}

interface StatusMeta { pillClass: string; label: string; title: string; sub: string }
function statusMeta(report: ScanReport): StatusMeta {
  const h = report.allFindings.filter((f) => f.severity === 'HIGH').length;
  const m = report.allFindings.filter((f) => f.severity === 'MEDIUM').length;
  const s = report.servers.length;
  switch (report.status) {
    case 'OK':
      return {
        pillClass: 'pill-accent',
        label: 'OK',
        title: 'All scanned configs look healthy.',
        sub: `No issues found across ${s} configured server${s !== 1 ? 's' : ''}. MCP setup appears correct.`,
      };
    case 'NEEDS_REVIEW':
      return {
        pillClass: 'pill-warn',
        label: 'NEEDS REVIEW',
        title: 'Some configuration issues may cause problems.',
        sub: `${m} medium-severity issue${m !== 1 ? 's' : ''} found. Review recommended before relying on MCP tools.`,
      };
    case 'BROKEN':
      return {
        pillClass: 'pill-danger',
        label: 'BROKEN',
        title: 'MCP servers are likely not starting.',
        sub: `${h} high-severity issue${h !== 1 ? 's' : ''} found across ${s} configured server${s !== 1 ? 's' : ''}. Fix HIGH findings first.`,
      };
    case 'RISKY':
      return {
        pillClass: 'pill-warn',
        label: 'RISKY',
        title: 'Security-sensitive configuration detected.',
        sub: `Review permissions, tokens, and filesystem access across ${s} server${s !== 1 ? 's' : ''}.`,
      };
  }
}

function findingRow(f: Finding): string {
  const c = sevColor(f.severity);
  const pc = pillClass(f.severity);

  const evHtml = f.evidence
    ? `<div class="finding-ev">${esc(f.evidence)}</div>`
    : '';

  const fxHtml = f.suggestedFix
    ? `<div class="finding-fix-label">Suggested fix</div><pre class="finding-fix-pre">${esc(f.suggestedFix)}</pre>`
    : '';

  const chips = [
    `<span class="pill">${esc(f.id)}</span>`,
    `<span class="pill">${esc(f.category)}</span>`,
    f.server ? `<span class="pill pill-muted">${esc(f.server)}</span>` : '',
  ].join('');

  return `<div class="finding-row">
  <div class="finding-title-row">
    <span class="pill ${pc}" style="color:${c};border-color:${c}40;background:${c}10">${f.severity}</span>
    <span class="finding-title">${esc(f.title)}</span>
  </div>
  ${evHtml}
  ${fxHtml}
  <div class="finding-chips">${chips}</div>
</div>`;
}

function fixItem(f: Finding, i: number): string {
  const hint = esc(f.suggestedFix!.split('\n')[0]);
  const srv = f.server ? `<span class="fix-srv">${esc(f.server)}</span>` : '';
  return `<div class="fix-item">
  <span class="fix-num">${i + 1}</span>
  <div class="fix-body">
    <div class="fix-title">${esc(f.title)}${srv}</div>
    <div class="fix-hint">${hint}</div>
  </div>
</div>`;
}

function serverBlock(srv: ScanReport['servers'][0]): string {
  const h = srv.findings.filter((f) => f.severity === 'HIGH').length;
  const m = srv.findings.filter((f) => f.severity === 'MEDIUM').length;
  const [badge, bc] = h > 0 ? [`${h} HIGH`, '#E26A6A']
    : m > 0 ? [`${m} MED`, '#D8B34B']
    : srv.findings.length > 0 ? [`${srv.findings.length} LOW`, '#19D6B0']
    : ['OK', '#19D6B0'];

  const envRows = Object.entries(srv.config.env)
    .map(([k, v]) => `<tr><td class="ev-k">${esc(k)}</td><td class="ev-v">${esc(maskSecret(k, v))}</td></tr>`)
    .join('');
  const envHtml = envRows ? `<table class="ev-tbl"><tbody>${envRows}</tbody></table>` : '';
  const argsHtml = srv.config.args.length > 0
    ? `<div class="sc-row"><span class="sc-lbl">args</span><code>${esc(JSON.stringify(srv.config.args))}</code></div>`
    : '';

  return `<div class="sc">
  <div class="sc-head">
    <code class="sc-name">${esc(srv.name)}</code>
    <span class="sc-badge" style="color:${bc}">${esc(badge)}</span>
  </div>
  <div class="sc-body">
    <div class="sc-row"><span class="sc-lbl">command</span><code>${esc(srv.config.command || '(none)')}</code></div>
    ${argsHtml}${envHtml}
  </div>
</div>`;
}

export function generateHtml(report: ScanReport): string {
  const sm = statusMeta(report);
  const sc = scoreColor(report.score);

  const highs = report.allFindings.filter((f) => f.severity === 'HIGH');
  const meds  = report.allFindings.filter((f) => f.severity === 'MEDIUM');
  const lows  = report.allFindings.filter((f) => f.severity === 'LOW');

  // Top 3 actionable fixes
  const topFixes: Finding[] = [];
  for (const f of [...highs, ...meds]) {
    if (topFixes.length >= 3) break;
    if (f.suggestedFix) topFixes.push(f);
  }

  // Group findings by severity for the findings panel
  const allSorted = [...highs, ...meds, ...lows];
  const findingsHtml = allSorted.length > 0
    ? allSorted.map(findingRow).join('')
    : `<div class="no-findings">No issues found &mdash; all configs look healthy.</div>`;

  const topFixesHtml = topFixes.length > 0
    ? topFixes.map((f, i) => fixItem(f, i)).join('')
    : `<div class="fix-none">No critical fixes needed.</div>`;

  const serversHtml = report.servers.length > 0
    ? report.servers.map(serverBlock).join('')
    : `<div class="empty">No servers detected.</div>`;

  const configRows = report.configs.map((cfg) => {
    const st = cfg.notFound
      ? `<span style="color:#D8B34B">Not found</span>`
      : cfg.parseError
      ? `<span style="color:#E26A6A">${esc(cfg.parseError)}</span>`
      : `<span style="color:#19D6B0">${Object.keys(cfg.servers ?? {}).length} server(s) &mdash; valid JSON</span>`;
    return `<tr>
      <td class="cft-l">${esc(cfg.clientLabel)}</td>
      <td class="cft-p"><code>${esc(cfg.path)}</code></td>
      <td class="cft-s">${st}</td>
    </tr>`;
  }).join('');

  // Status bar pills
  const statusPill = `<span class="pill ${sm.pillClass}">${esc(sm.label)}</span>`;
  const scorePill  = `<span class="pill" style="color:${sc};border-color:${sc}40;background:${sc}10">${report.score}/100</span>`;
  const cfgPill    = `<span class="pill pill-muted">${report.configs.length} config${report.configs.length !== 1 ? 's' : ''}</span>`;
  const srvPill    = `<span class="pill pill-muted">${report.servers.length} server${report.servers.length !== 1 ? 's' : ''}</span>`;
  const highPill   = highs.length > 0 ? `<span class="pill pill-danger">${highs.length} high</span>` : `<span class="pill">0 high</span>`;
  const medPill    = meds.length  > 0 ? `<span class="pill pill-warn">${meds.length} medium</span>` : `<span class="pill">0 medium</span>`;
  const lowPill    = `<span class="pill">${lows.length} low</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCP Doctor &mdash; Diagnostic Report</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{
  background:#05070A;
  color:#A5B4BD;
  font-family:ui-sans-serif,system-ui,-apple-system,Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  font-size:14px;
  line-height:1.6;
  -webkit-font-smoothing:antialiased;
  min-height:100vh;
}
a{color:#19D6B0;text-decoration:none}
a:hover{color:#30E2BF}
code{
  font-family:ui-monospace,'JetBrains Mono','SF Mono',Menlo,monospace;
  font-size:11px;
  background:rgba(126,151,160,0.06);
  border:1px solid rgba(126,151,160,0.12);
  border-radius:3px;
  padding:1px 5px;
  color:#A5B4BD;
}

/* ── Page ── */
.page{max-width:1100px;margin:0 auto;padding:24px 32px 64px;display:flex;flex-direction:column;gap:16px}

/* ── Header ── */
.hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.hdr-label{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.18em;color:#70818C;margin-bottom:6px}
.hdr-title{font-size:22px;font-weight:600;letter-spacing:-0.04em;color:#E8EEF2;line-height:1.1}
.hdr-sub{font-size:13px;color:#A5B4BD;margin-top:4px}
.hdr-meta{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0}
.hdr-ts{font-family:ui-monospace,'JetBrains Mono','SF Mono',Menlo,monospace;font-size:11px;color:#4F5C61;white-space:nowrap}

/* ── Pills ── */
.pill{
  display:inline-flex;align-items:center;gap:5px;
  border-radius:3px;border:1px solid rgba(126,151,160,0.14);
  background:#0A0F14;
  padding:3px 8px;
  font-size:10px;font-weight:500;
  text-transform:uppercase;letter-spacing:0.16em;
  color:#4F5C61;white-space:nowrap;
}
.pill-accent{border-color:rgba(25,214,176,0.30);background:rgba(25,214,176,0.08);color:#19D6B0}
.pill-danger{border-color:rgba(226,106,106,0.35);background:rgba(226,106,106,0.08);color:#E26A6A}
.pill-warn{border-color:rgba(216,179,75,0.35);background:rgba(216,179,75,0.08);color:#D8B34B}
.pill-muted{color:#70818C}

/* ── Status Bar ── */
.status-bar{
  display:flex;flex-wrap:wrap;gap:5px;align-items:center;
  padding:10px 14px;
  background:#0A0F14;
  border:1px solid rgba(126,151,160,0.14);
  border-radius:6px;
}

/* ── Verdict Panel ── */
.verdict-panel{background:#0A0F14;border:1px solid rgba(126,151,160,0.14);border-radius:14px;overflow:hidden}
.verdict-head{
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 18px;
  border-bottom:1px solid rgba(126,151,160,0.14);
}
.verdict-body{display:grid;grid-template-columns:1fr auto;gap:24px;padding:18px 18px 20px;align-items:start}
.verdict-text h2{font-size:18px;font-weight:600;letter-spacing:-0.03em;color:#E8EEF2;margin-bottom:5px}
.verdict-text p{font-size:13px;color:#A5B4BD}
.verdict-stats{display:flex;gap:20px;flex-wrap:wrap;flex-shrink:0}
.vs{display:flex;flex-direction:column;gap:2px;text-align:center;min-width:40px}
.vs-n{font-size:20px;font-weight:600;line-height:1;color:#E8EEF2}
.vs-l{font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;color:#70818C}

/* ── Section label ── */
.sec-lbl{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.18em;color:#70818C}
.sec-count{font-size:11px;color:#4F5C61;font-family:ui-monospace,'SF Mono',Menlo,monospace}

/* ── Main Grid ── */
.main-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:12px;align-items:start}
.right-col{display:flex;flex-direction:column;gap:12px}

/* ── Panel ── */
.panel{background:#0A0F14;border:1px solid rgba(126,151,160,0.14);border-radius:14px;overflow:hidden}
.panel-head{
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 16px;
  border-bottom:1px solid rgba(126,151,160,0.14);
}

/* ── Finding rows ── */
.finding-row{padding:14px 16px;border-bottom:1px solid rgba(126,151,160,0.07)}
.finding-row:last-child{border-bottom:none}
.finding-title-row{display:flex;align-items:baseline;gap:8px;margin-bottom:7px;flex-wrap:wrap}
.finding-title{font-size:13px;font-weight:500;color:#E8EEF2;flex:1;min-width:0;line-height:1.4}
.finding-ev{
  font-family:ui-monospace,'JetBrains Mono','SF Mono',Menlo,monospace;
  font-size:11px;color:#70818C;
  background:rgba(126,151,160,0.05);
  border:1px solid rgba(126,151,160,0.12);
  border-radius:3px;
  padding:6px 10px;
  margin-bottom:7px;
  word-break:break-all;
}
.finding-fix-label{font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;color:rgba(25,214,176,0.7);margin-bottom:5px;font-family:ui-monospace,'SF Mono',Menlo,monospace}
.finding-fix-pre{
  font-family:ui-monospace,'JetBrains Mono','SF Mono',Menlo,monospace;
  font-size:11px;color:#19D6B0;
  background:rgba(25,214,176,0.05);
  border:1px solid rgba(25,214,176,0.14);
  border-radius:3px;
  padding:8px 10px;
  white-space:pre-wrap;word-break:break-word;
  margin-bottom:7px;
}
.finding-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.no-findings{padding:14px 16px;color:#19D6B0;font-size:13px}

/* ── Fix items ── */
.fix-item{
  display:flex;gap:10px;align-items:flex-start;
  padding:10px 16px;
  border-bottom:1px solid rgba(126,151,160,0.07);
}
.fix-item:last-child{border-bottom:none}
.fix-num{
  font-size:11px;font-weight:600;
  font-family:ui-monospace,'SF Mono',Menlo,monospace;
  color:#19D6B0;
  width:14px;flex-shrink:0;padding-top:2px;
}
.fix-title{font-size:13px;font-weight:500;color:#E8EEF2;margin-bottom:3px;line-height:1.4}
.fix-hint{font-size:11px;color:#70818C;line-height:1.5}
.fix-srv{
  font-size:9px;font-family:ui-monospace,'SF Mono',Menlo,monospace;
  border-radius:3px;border:1px solid rgba(126,151,160,0.14);
  background:#0D1319;color:#4F5C61;
  padding:1px 5px;margin-left:4px;vertical-align:middle;
}
.fix-none{padding:12px 16px;font-size:12px;color:#19D6B0}

/* ── Server cards ── */
.sc{background:#0D1319;border:1px solid rgba(126,151,160,0.14);border-radius:6px;margin-bottom:6px;overflow:hidden}
.sc:last-child{margin-bottom:0}
.sc-head{
  display:flex;justify-content:space-between;align-items:center;
  padding:7px 12px;
  border-bottom:1px solid rgba(126,151,160,0.08);
}
.sc-name{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12px;font-weight:600;color:#E8EEF2;background:transparent;border:none;padding:0}
.sc-badge{font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;font-family:ui-monospace,'SF Mono',Menlo,monospace}
.sc-body{padding:10px 12px;display:flex;flex-direction:column;gap:5px}
.sc-row{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;font-size:12px}
.sc-lbl{font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;color:#70818C;font-family:ui-monospace,'SF Mono',Menlo,monospace;min-width:50px;flex-shrink:0}
.ev-tbl{width:100%;border-collapse:collapse;font-size:11px;border:1px solid rgba(126,151,160,0.1);border-radius:3px;overflow:hidden;margin-top:4px}
.ev-tbl td{padding:4px 8px;border-bottom:1px solid rgba(126,151,160,0.07);font-family:ui-monospace,'SF Mono',Menlo,monospace}
.ev-tbl tr:last-child td{border-bottom:none}
.ev-k{color:#19D6B0;width:38%}
.ev-v{color:#4F5C61}
.empty{padding:12px 16px;color:#70818C;font-size:12px}

/* ── Config table ── */
.cft{width:100%;border-collapse:collapse;font-size:12px}
.cft th{
  text-align:left;padding:8px 16px;
  font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;color:#70818C;
  border-bottom:1px solid rgba(126,151,160,0.14);
  font-family:ui-monospace,'SF Mono',Menlo,monospace;
}
.cft td{padding:9px 16px;border-bottom:1px solid rgba(126,151,160,0.07);vertical-align:top}
.cft tr:last-child td{border-bottom:none}
.cft code{word-break:break-all}

/* ── Footer ── */
.footer{
  display:flex;justify-content:space-between;align-items:center;
  flex-wrap:wrap;gap:8px;
  padding-top:14px;
  border-top:1px solid rgba(126,151,160,0.14);
  font-size:11px;font-family:ui-monospace,'SF Mono',Menlo,monospace;
  color:#4F5C61;
}
.footer a{color:#4F5C61}
.footer a:hover{color:#19D6B0}

@media(max-width:700px){
  .main-grid{grid-template-columns:1fr}
  .verdict-body{grid-template-columns:1fr}
  .verdict-stats{gap:12px}
  .page{padding:16px 16px 48px;gap:12px}
  .hdr{flex-direction:column}
  .hdr-meta{align-items:flex-start}
}
</style>
</head>
<body>
<div class="page">

<header class="hdr">
  <div>
    <div class="hdr-label">MCP Diagnostic Console</div>
    <div class="hdr-title">MCP Doctor</div>
    <div class="hdr-sub">Diagnose and fix broken MCP servers.</div>
  </div>
  <div class="hdr-meta">
    <span class="pill">v0.1.3</span>
    <span class="hdr-ts">${esc(report.timestamp)}</span>
  </div>
</header>

<div class="status-bar">
  ${statusPill}
  ${scorePill}
  ${cfgPill}
  ${srvPill}
  ${highPill}
  ${medPill}
  ${lowPill}
</div>

<div class="verdict-panel">
  <div class="verdict-head">
    <span class="sec-lbl">MCP HEALTH VERDICT</span>
    <span class="pill ${sm.pillClass}">${esc(sm.label)}</span>
  </div>
  <div class="verdict-body">
    <div class="verdict-text">
      <h2>${esc(sm.title)}</h2>
      <p>${esc(sm.sub)}</p>
    </div>
    <div class="verdict-stats">
      <div class="vs">
        <span class="vs-n" style="color:${sc}">${report.score}</span>
        <span class="vs-l">score</span>
      </div>
      <div class="vs">
        <span class="vs-n">${report.configs.length}</span>
        <span class="vs-l">configs</span>
      </div>
      <div class="vs">
        <span class="vs-n">${report.servers.length}</span>
        <span class="vs-l">servers</span>
      </div>
      <div class="vs">
        <span class="vs-n" style="color:${highs.length > 0 ? '#E26A6A' : 'inherit'}">${highs.length}</span>
        <span class="vs-l">high</span>
      </div>
      <div class="vs">
        <span class="vs-n" style="color:${meds.length > 0 ? '#D8B34B' : 'inherit'}">${meds.length}</span>
        <span class="vs-l">medium</span>
      </div>
    </div>
  </div>
</div>

<div class="main-grid">
  <div class="panel">
    <div class="panel-head">
      <span class="sec-lbl">Critical Findings</span>
      <span class="sec-count">${report.allFindings.length} finding${report.allFindings.length !== 1 ? 's' : ''}</span>
    </div>
    ${findingsHtml}
  </div>

  <div class="right-col">
    <div class="panel">
      <div class="panel-head">
        <span class="sec-lbl">What to Fix First</span>
      </div>
      ${topFixesHtml}
    </div>

    <div class="panel">
      <div class="panel-head">
        <span class="sec-lbl">Detected Servers</span>
        <span class="sec-count">${report.servers.length}</span>
      </div>
      <div style="padding:12px">
        ${serversHtml}
      </div>
    </div>
  </div>
</div>

<div class="panel">
  <div class="panel-head">
    <span class="sec-lbl">Scanned Configs</span>
    <span class="sec-count">${report.configs.length}</span>
  </div>
  <table class="cft">
    <thead><tr><th>Client</th><th>Path</th><th>Status</th></tr></thead>
    <tbody>${configRows}</tbody>
  </table>
</div>

<footer class="footer">
  <span>MCP Doctor v0.1.3 &mdash; <a href="https://github.com/stephenywilson/MCP-Doctor">github.com/stephenywilson/MCP-Doctor</a></span>
  <span>Secrets masked &middot; No network access</span>
</footer>

</div>
</body>
</html>`;
}

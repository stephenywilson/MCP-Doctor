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
  return s === 'HIGH' ? '#f85149' : s === 'MEDIUM' ? '#d29922' : '#388bfd';
}

function scoreColor(n: number): string {
  return n >= 80 ? '#3fb950' : n >= 50 ? '#d29922' : '#f85149';
}

interface StatusMeta { color: string; label: string; desc: string }
function statusMeta(s: ReportStatus): StatusMeta {
  const M: Record<ReportStatus, StatusMeta> = {
    OK:           { color: '#3fb950', label: 'OK',           desc: 'All scanned configs look healthy.' },
    NEEDS_REVIEW: { color: '#d29922', label: 'NEEDS REVIEW', desc: 'Some issues may cause problems. Review findings below.' },
    BROKEN:       { color: '#f85149', label: 'BROKEN',       desc: 'Critical issues detected. MCP servers are likely not starting. Fix HIGH findings first.' },
    RISKY:        { color: '#d29922', label: 'RISKY',        desc: 'Security-sensitive configuration detected. Review permissions and tokens.' },
  };
  return M[s];
}

function findingCard(f: Finding): string {
  const c = sevColor(f.severity);
  const evHtml = f.evidence
    ? `<div class="fc-ev"><div class="fc-ev-lbl">Evidence</div><code>${esc(f.evidence)}</code></div>`
    : '';
  const fxHtml = f.suggestedFix
    ? `<div class="fc-fx"><div class="fc-fx-lbl">Suggested fix</div><pre class="fc-fx-pre">${esc(f.suggestedFix)}</pre></div>`
    : '';
  const chips = [
    `<span class="chip">${esc(f.id)}</span>`,
    `<span class="chip">${esc(f.category)}</span>`,
    f.server ? `<span class="chip chip-srv">${esc(f.server)}</span>` : '',
  ].join('');

  return `<div class="fc" style="border-left-color:${c}">
  <div class="fc-head">
    <span class="fc-sev" style="color:${c}">${f.severity}</span>
    <span class="fc-title">${esc(f.title)}</span>
  </div>
  ${evHtml}${fxHtml}
  <div class="fc-chips">${chips}</div>
</div>`;
}

function serverCard(srv: ScanReport['servers'][0]): string {
  const h = srv.findings.filter((f) => f.severity === 'HIGH').length;
  const m = srv.findings.filter((f) => f.severity === 'MEDIUM').length;
  const [badge, bc] = h > 0
    ? [`${h} HIGH`, '#f85149']
    : m > 0 ? [`${m} MEDIUM`, '#d29922']
    : srv.findings.length > 0 ? [`${srv.findings.length} LOW`, '#388bfd']
    : ['OK', '#3fb950'];

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
  const sm = statusMeta(report.status);
  const sc = scoreColor(report.score);

  const highs = report.allFindings.filter((f) => f.severity === 'HIGH');
  const meds  = report.allFindings.filter((f) => f.severity === 'MEDIUM');
  const lows  = report.allFindings.filter((f) => f.severity === 'LOW');

  // Top 3 actionable fixes from HIGH then MEDIUM
  const topFixes: Finding[] = [];
  for (const f of [...highs, ...meds]) {
    if (topFixes.length >= 3) break;
    if (f.suggestedFix) topFixes.push(f);
  }

  const topFixesHtml = topFixes.length > 0
    ? topFixes.map((f, i) => {
        const hint = esc(f.suggestedFix!.split('\n')[0]);
        const srv = f.server ? ` <span class="fix-srv">${esc(f.server)}</span>` : '';
        return `<div class="fix-item">
          <span class="fix-num">${i + 1}</span>
          <div class="fix-body">
            <div class="fix-title">${esc(f.title)}${srv}</div>
            <div class="fix-hint">${hint}</div>
          </div>
        </div>`;
      }).join('')
    : `<div class="no-fixes">No critical fixes needed.</div>`;

  const configRows = report.configs.map((cfg) => {
    const st = cfg.notFound
      ? `<span style="color:#d29922">Not found</span>`
      : cfg.parseError
      ? `<span style="color:#f85149">${esc(cfg.parseError)}</span>`
      : `<span style="color:#3fb950">${Object.keys(cfg.servers ?? {}).length} server(s) — valid JSON</span>`;
    return `<tr>
      <td class="cft-l">${esc(cfg.clientLabel)}</td>
      <td class="cft-p"><code>${esc(cfg.path)}</code></td>
      <td class="cft-s">${st}</td>
    </tr>`;
  }).join('');

  const findingsHtml = [
    highs.length ? `<div class="sg"><div class="sg-lbl" style="color:#f85149">HIGH — ${highs.length} finding${highs.length > 1 ? 's' : ''}</div>${highs.map(findingCard).join('')}</div>` : '',
    meds.length  ? `<div class="sg"><div class="sg-lbl" style="color:#d29922">MEDIUM — ${meds.length} finding${meds.length > 1 ? 's' : ''}</div>${meds.map(findingCard).join('')}</div>` : '',
    lows.length  ? `<div class="sg"><div class="sg-lbl" style="color:#388bfd">LOW — ${lows.length} finding${lows.length > 1 ? 's' : ''}</div>${lows.map(findingCard).join('')}</div>` : '',
    !report.allFindings.length ? `<div class="no-findings">No issues found — all scanned configs look healthy.</div>` : '',
  ].join('');

  const serversHtml = report.servers.length
    ? report.servers.map(serverCard).join('')
    : `<div class="empty">No servers found in scanned configs.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCP Doctor Report</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1117;
  --s1:#161b22;
  --s2:#1c2128;
  --s3:#21262d;
  --b1:#30363d;
  --b2:#21262d;
  --t1:#e6edf3;
  --t2:#c9d1d9;
  --t3:#8b949e;
  --t4:#484f58;
  --mono:'SF Mono','Fira Code','Cascadia Code',monospace;
}
body{background:var(--bg);color:var(--t2);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.6;min-height:100vh}
a{color:#58a6ff;text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:var(--mono);font-size:12px;background:var(--s3);padding:2px 5px;border-radius:3px;color:var(--t1)}

.page{max-width:860px;margin:0 auto;padding:36px 24px 64px}

/* Header */
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid var(--b1);margin-bottom:28px}
.hdr-brand{display:flex;flex-direction:column;gap:3px}
.hdr-title{font-size:18px;font-weight:700;color:var(--t1);letter-spacing:-0.2px}
.hdr-sub{font-size:13px;color:var(--t3)}
.hdr-meta{display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.hdr-ver{font-size:11px;background:var(--s3);color:var(--t3);border:1px solid var(--b1);padding:2px 8px;border-radius:10px}
.hdr-ts{font-size:12px;color:var(--t3);font-family:var(--mono);white-space:nowrap}

/* Hero */
.hero{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--b1);border-radius:8px;overflow:hidden;margin-bottom:12px}
.hero-left{padding:28px;background:var(--s1);border-right:1px solid var(--b1);display:flex;flex-direction:column;gap:12px}
.hero-right{padding:28px;background:var(--s2);display:flex;flex-direction:column}
.status-badge{font-size:26px;font-weight:700;letter-spacing:-0.5px;line-height:1}
.score-wrap{display:flex;align-items:baseline;gap:3px}
.score-num{font-size:52px;font-weight:700;letter-spacing:-3px;line-height:1}
.score-denom{font-size:20px;color:var(--t3);font-weight:400}
.score-bar-wrap{height:3px;background:var(--b1);border-radius:2px;overflow:hidden}
.score-bar-fill{height:100%;border-radius:2px}
.status-desc{font-size:13px;color:var(--t3);line-height:1.5}
.fixes-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:14px}
.fix-item{display:flex;gap:11px;padding:10px 0;border-bottom:1px solid var(--b2)}
.fix-item:last-of-type{border-bottom:none}
.fix-num{flex-shrink:0;width:20px;height:20px;background:var(--s3);border:1px solid var(--b1);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:var(--t4);margin-top:1px}
.fix-body{display:flex;flex-direction:column;gap:3px}
.fix-title{font-size:13px;font-weight:500;color:var(--t1);line-height:1.4}
.fix-hint{font-size:12px;color:var(--t3);line-height:1.4}
.fix-srv{font-size:10px;background:var(--s3);color:var(--t4);border:1px solid var(--b1);padding:1px 6px;border-radius:10px;font-family:var(--mono);vertical-align:middle;margin-left:3px}
.no-fixes{font-size:13px;color:#3fb950;padding:12px 0}

/* Stats strip */
.stats{display:flex;align-items:center;background:var(--s1);border:1px solid var(--b1);border-radius:8px;padding:16px 0;margin-bottom:40px}
.stat{display:flex;flex-direction:column;align-items:center;gap:3px;flex:1}
.stat-sep{width:1px;height:30px;background:var(--b1);flex-shrink:0}
.stat-n{font-size:24px;font-weight:700;line-height:1;color:var(--t1)}
.stat-lbl{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--t3)}

/* Section */
.section{margin-bottom:44px}
.sec-title{font-size:14px;font-weight:600;color:var(--t1);padding-bottom:10px;border-bottom:1px solid var(--b1);margin-bottom:18px}

/* Severity group */
.sg{margin-bottom:24px}
.sg-lbl{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}

/* Finding card */
.fc{background:var(--s1);border:1px solid var(--b1);border-left-width:4px;border-radius:0 6px 6px 0;padding:14px 16px;margin-bottom:8px}
.fc-head{display:flex;align-items:baseline;gap:9px;margin-bottom:10px;flex-wrap:wrap}
.fc-sev{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;flex-shrink:0}
.fc-title{font-size:14px;font-weight:500;color:var(--t1);line-height:1.4;flex:1;min-width:0}
.fc-ev{background:var(--s3);border:1px solid var(--b2);border-radius:4px;padding:8px 10px;margin-bottom:9px}
.fc-ev code{background:transparent;padding:0;color:var(--t2);word-break:break-all;font-size:12px}
.fc-ev-lbl{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--t4);margin-bottom:4px}
.fc-fx{margin-bottom:10px}
.fc-fx-lbl{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#3fb950;margin-bottom:5px}
.fc-fx-pre{background:rgba(63,185,80,.06);border:1px solid rgba(63,185,80,.2);border-radius:4px;padding:10px 12px;color:#7ee787;font-family:var(--mono);font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.fc-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.chip{font-size:10px;font-family:var(--mono);background:var(--s3);color:var(--t4);border:1px solid var(--b2);padding:2px 7px;border-radius:10px;white-space:nowrap}
.chip-srv{color:var(--t3);background:var(--s2);border-color:var(--b1)}
.no-findings{padding:18px 20px;background:rgba(63,185,80,.06);border:1px solid rgba(63,185,80,.2);border-radius:6px;color:#3fb950;font-size:13px}

/* Server cards */
.sc{background:var(--s1);border:1px solid var(--b1);border-radius:6px;margin-bottom:10px;overflow:hidden}
.sc-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--s2);border-bottom:1px solid var(--b1)}
.sc-name{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--t1);background:transparent;padding:0}
.sc-badge{font-size:11px;font-weight:600}
.sc-body{padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.sc-row{display:flex;align-items:baseline;gap:8px;font-size:13px;flex-wrap:wrap}
.sc-lbl{font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;min-width:54px;flex-shrink:0}

/* Env table */
.ev-tbl{width:100%;border-collapse:collapse;font-size:12px;border:1px solid var(--b2);border-radius:4px;overflow:hidden;margin-top:2px}
.ev-tbl td{padding:5px 10px;border-bottom:1px solid var(--b2);font-family:var(--mono)}
.ev-tbl tr:last-child td{border-bottom:none}
.ev-k{color:#79c0ff;width:40%}
.ev-v{color:var(--t3)}

/* Config table */
.cft{width:100%;border-collapse:collapse;font-size:13px}
.cft th{text-align:left;padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);border-bottom:1px solid var(--b1)}
.cft td{padding:10px 12px;border-bottom:1px solid var(--b2);vertical-align:top}
.cft tr:last-child td{border-bottom:none}
.cft code{word-break:break-all}

/* Footer */
.footer{padding-top:20px;border-top:1px solid var(--b1);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--t3)}
.footer a{color:var(--t3)}
.footer a:hover{color:#58a6ff}
.empty{color:var(--t3);font-size:13px;padding:12px 0}

@media(max-width:640px){
  .hero{grid-template-columns:1fr}
  .hero-left{border-right:none;border-bottom:1px solid var(--b1)}
  .stats{flex-wrap:wrap;padding:12px 8px}
  .stat{min-width:40%;padding:4px 0}
  .stat-sep{display:none}
  .page{padding:16px 16px 48px}
  .hdr{flex-direction:column;gap:10px}
  .hdr-meta{align-items:flex-start}
}
</style>
</head>
<body>
<div class="page">

<header class="hdr">
  <div class="hdr-brand">
    <div class="hdr-title">MCP Doctor</div>
    <div class="hdr-sub">Diagnose and fix broken MCP servers.</div>
  </div>
  <div class="hdr-meta">
    <span class="hdr-ver">v0.1.0</span>
    <span class="hdr-ts">${esc(report.timestamp)}</span>
  </div>
</header>

<div class="hero">
  <div class="hero-left">
    <div class="status-badge" style="color:${sm.color}">${esc(sm.label)}</div>
    <div class="score-wrap">
      <span class="score-num" style="color:${sc}">${report.score}</span>
      <span class="score-denom">&thinsp;/&thinsp;100</span>
    </div>
    <div class="score-bar-wrap">
      <div class="score-bar-fill" style="width:${report.score}%;background:${sc}"></div>
    </div>
    <div class="status-desc">${esc(sm.desc)}</div>
  </div>
  <div class="hero-right">
    <div class="fixes-label">What to fix first</div>
    ${topFixesHtml}
  </div>
</div>

<div class="stats">
  <div class="stat">
    <span class="stat-n">${report.configs.length}</span>
    <span class="stat-lbl">config${report.configs.length !== 1 ? 's' : ''}</span>
  </div>
  <div class="stat-sep"></div>
  <div class="stat">
    <span class="stat-n">${report.servers.length}</span>
    <span class="stat-lbl">server${report.servers.length !== 1 ? 's' : ''}</span>
  </div>
  <div class="stat-sep"></div>
  <div class="stat">
    <span class="stat-n" style="color:#f85149">${highs.length}</span>
    <span class="stat-lbl">high</span>
  </div>
  <div class="stat-sep"></div>
  <div class="stat">
    <span class="stat-n" style="color:#d29922">${meds.length}</span>
    <span class="stat-lbl">medium</span>
  </div>
  <div class="stat-sep"></div>
  <div class="stat">
    <span class="stat-n" style="color:#388bfd">${lows.length}</span>
    <span class="stat-lbl">low</span>
  </div>
</div>

<section class="section">
  <div class="sec-title">Findings</div>
  ${findingsHtml}
</section>

<section class="section">
  <div class="sec-title">Detected Servers</div>
  ${serversHtml}
</section>

<section class="section">
  <div class="sec-title">Scanned Configs</div>
  <table class="cft">
    <thead><tr><th>Client</th><th>Path</th><th>Status</th></tr></thead>
    <tbody>${configRows}</tbody>
  </table>
</section>

<footer class="footer">
  <span>MCP Doctor v0.1.0 &mdash; <a href="https://github.com/stephenywilson/MCP-Doctor">github.com/stephenywilson/MCP-Doctor</a></span>
  <span>Secrets masked &middot; No network access</span>
</footer>

</div>
</body>
</html>`;
}

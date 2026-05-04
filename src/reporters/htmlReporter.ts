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
  return s === 'HIGH' ? '#e84545' : s === 'MEDIUM' ? '#d4940a' : '#4a9eff';
}

function scoreColor(n: number): string {
  return n >= 80 ? '#3cc49a' : n >= 50 ? '#d4940a' : '#e84545';
}

interface StatusMeta { color: string; label: string; desc: string }
function statusMeta(s: ReportStatus): StatusMeta {
  const M: Record<ReportStatus, StatusMeta> = {
    OK:           { color: '#3cc49a', label: 'OK',           desc: 'All scanned configs look healthy.' },
    NEEDS_REVIEW: { color: '#d4940a', label: 'NEEDS REVIEW', desc: 'Some issues may cause problems. Review findings below.' },
    BROKEN:       { color: '#e84545', label: 'BROKEN',       desc: 'Critical issues detected. MCP servers are likely not starting. Fix HIGH findings first.' },
    RISKY:        { color: '#d4940a', label: 'RISKY',        desc: 'Security-sensitive configuration detected. Review permissions and tokens.' },
  };
  return M[s];
}

function findingCard(f: Finding): string {
  const c = sevColor(f.severity);
  const evHtml = f.evidence ? `
    <div class="fc-ev">
      <div class="blk-lbl">Evidence</div>
      <code class="fc-ev-code">${esc(f.evidence)}</code>
    </div>` : '';
  const fxHtml = f.suggestedFix ? `
    <div class="fc-fx">
      <div class="blk-lbl blk-lbl-g">Suggested fix</div>
      <pre class="fc-fx-pre">${esc(f.suggestedFix)}</pre>
    </div>` : '';
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
  const [badge, bc] = h > 0 ? [`${h} HIGH`, '#e84545']
    : m > 0 ? [`${m} MEDIUM`, '#d4940a']
    : srv.findings.length > 0 ? [`${srv.findings.length} LOW`, '#4a9eff']
    : ['OK', '#3cc49a'];

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
      ? `<span style="color:#d4940a">Not found</span>`
      : cfg.parseError
      ? `<span style="color:#e84545">${esc(cfg.parseError)}</span>`
      : `<span style="color:#3cc49a">${Object.keys(cfg.servers ?? {}).length} server(s) &mdash; valid JSON</span>`;
    return `<tr>
      <td class="cft-l">${esc(cfg.clientLabel)}</td>
      <td class="cft-p"><code>${esc(cfg.path)}</code></td>
      <td class="cft-s">${st}</td>
    </tr>`;
  }).join('');

  const findingsHtml = [
    highs.length ? `<div class="sg"><div class="sg-lbl" style="color:#e84545">HIGH &mdash; ${highs.length} finding${highs.length > 1 ? 's' : ''}</div>${highs.map(findingCard).join('')}</div>` : '',
    meds.length  ? `<div class="sg"><div class="sg-lbl" style="color:#d4940a">MEDIUM &mdash; ${meds.length} finding${meds.length > 1 ? 's' : ''}</div>${meds.map(findingCard).join('')}</div>` : '',
    lows.length  ? `<div class="sg"><div class="sg-lbl" style="color:#4a9eff">LOW &mdash; ${lows.length} finding${lows.length > 1 ? 's' : ''}</div>${lows.map(findingCard).join('')}</div>` : '',
    !report.allFindings.length ? `<div class="no-findings">No issues found &mdash; all scanned configs look healthy.</div>` : '',
  ].join('');

  const serversHtml = report.servers.length
    ? report.servers.map(serverCard).join('')
    : `<div class="empty">No servers found in scanned configs.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCP Doctor &mdash; Diagnostic Report</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:    #07090e;
  --s1:    #0c1219;
  --s2:    #101820;
  --s3:    #141d28;
  --sg:    #0d1e1b;
  --bd-g:  #1b2d28;
  --b1:    rgba(255,255,255,0.08);
  --b2:    rgba(255,255,255,0.05);
  --t1:    #e4ecf5;
  --t2:    #8896a8;
  --t3:    #4c5e72;
  --t4:    #2e3d4f;
  --green: #3cc49a;
  --mono:  'SF Mono','Cascadia Code','Fira Code',monospace;
}

body{
  background-color:var(--bg);
  background-image:
    linear-gradient(rgba(255,255,255,0.022) 1px,transparent 1px),
    linear-gradient(to right,rgba(255,255,255,0.022) 1px,transparent 1px);
  background-size:40px 40px;
  color:var(--t2);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  font-size:14px;
  line-height:1.6;
  min-height:100vh;
  -webkit-font-smoothing:antialiased;
}

a{color:var(--green);text-decoration:none}
a:hover{text-decoration:underline}

code{
  font-family:var(--mono);
  font-size:12px;
  background:var(--s3);
  border:1px solid var(--b2);
  padding:2px 6px;
  border-radius:3px;
  color:var(--t1);
}

/* ── Page ── */
.page{max-width:880px;margin:0 auto;padding:40px 24px 80px}

/* ── Module Header ── */
.hdr{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  padding-bottom:24px;
  border-bottom:1px solid var(--b1);
  margin-bottom:32px;
}
.hdr-brand{}
.hdr-eyebrow{
  font-size:10px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:0.18em;
  color:var(--green);
  margin-bottom:6px;
}
.hdr-title{
  font-size:20px;
  font-weight:700;
  color:var(--t1);
  letter-spacing:-0.04em;
  line-height:1;
}
.hdr-sub{
  font-size:12px;
  color:var(--t3);
  margin-top:5px;
}
.hdr-meta{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.hdr-ver{
  font-size:10px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:0.12em;
  color:var(--t3);
  background:var(--s1);
  border:1px solid var(--b1);
  padding:3px 8px;
  border-radius:3px;
}
.hdr-ts{
  font-family:var(--mono);
  font-size:11px;
  color:var(--t3);
  white-space:nowrap;
}

/* ── Hero Panel ── */
.hero{
  display:grid;
  grid-template-columns:1fr 1fr;
  border:1px solid var(--b1);
  border-radius:4px;
  overflow:hidden;
  margin-bottom:10px;
  background:var(--s1);
}
.hero-left{
  padding:28px 28px 24px;
  border-right:1px solid var(--b1);
  display:flex;
  flex-direction:column;
  gap:10px;
}
.hero-right{
  padding:28px 28px 24px;
  background:var(--s2);
  display:flex;
  flex-direction:column;
}
.status-badge{
  font-size:28px;
  font-weight:700;
  letter-spacing:-0.04em;
  line-height:1;
}
.score-wrap{display:flex;align-items:baseline;gap:4px;margin-top:2px}
.score-num{
  font-size:56px;
  font-weight:700;
  letter-spacing:-0.04em;
  line-height:1;
}
.score-denom{font-size:18px;color:var(--t3);font-weight:400}
.score-bar-wrap{
  height:2px;
  background:var(--b1);
  border-radius:1px;
  overflow:hidden;
  margin-top:2px;
}
.score-bar-fill{height:100%;border-radius:1px}
.status-desc{font-size:12px;color:var(--t3);line-height:1.5;margin-top:4px}

/* top fixes */
.fixes-eyebrow{
  font-size:10px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:0.14em;
  color:var(--t3);
  margin-bottom:16px;
}
.fix-item{
  display:flex;
  gap:12px;
  padding:10px 0;
  border-bottom:1px solid var(--b2);
}
.fix-item:last-of-type{border-bottom:none}
.fix-num{
  flex-shrink:0;
  width:20px;
  height:20px;
  background:#10221e;
  border:1px solid var(--bd-g);
  border-radius:3px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:10px;
  font-weight:700;
  color:var(--green);
  margin-top:2px;
  font-family:var(--mono);
}
.fix-body{display:flex;flex-direction:column;gap:3px;min-width:0}
.fix-title{font-size:13px;font-weight:500;color:var(--t1);line-height:1.4;word-break:break-word}
.fix-hint{font-size:11px;color:var(--t3);line-height:1.4}
.fix-srv{
  font-size:9px;
  font-family:var(--mono);
  background:var(--s3);
  color:var(--t4);
  border:1px solid var(--b1);
  padding:1px 5px;
  border-radius:2px;
  vertical-align:middle;
  margin-left:4px;
}
.no-fixes{font-size:12px;color:var(--green);padding:10px 0}

/* ── Stats Strip ── */
.stats{
  display:flex;
  align-items:center;
  background:var(--s1);
  border:1px solid var(--b1);
  border-radius:4px;
  margin-bottom:40px;
  padding:14px 0;
}
.stat{display:flex;flex-direction:column;align-items:center;gap:2px;flex:1}
.stat-sep{width:1px;height:28px;background:var(--b1);flex-shrink:0}
.stat-n{
  font-size:22px;
  font-weight:700;
  letter-spacing:-0.03em;
  line-height:1;
  color:var(--t1);
}
.stat-lbl{
  font-size:9px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:0.14em;
  color:var(--t3);
}

/* ── Section ── */
.section{margin-bottom:44px}
.sec-title{
  font-size:10px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:0.14em;
  color:var(--t3);
  padding-bottom:10px;
  border-bottom:1px solid var(--b1);
  margin-bottom:16px;
}

/* ── Severity Group ── */
.sg{margin-bottom:20px}
.sg-lbl{
  font-size:10px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:0.12em;
  margin-bottom:8px;
}

/* ── Finding Card ── */
.fc{
  background:var(--s1);
  border:1px solid var(--b1);
  border-left-width:3px;
  border-radius:0 4px 4px 0;
  padding:14px 16px;
  margin-bottom:6px;
}
.fc-head{
  display:flex;
  align-items:baseline;
  gap:10px;
  margin-bottom:10px;
  flex-wrap:wrap;
}
.fc-sev{
  font-size:9px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.12em;
  flex-shrink:0;
  font-family:var(--mono);
}
.fc-title{
  font-size:14px;
  font-weight:500;
  color:var(--t1);
  letter-spacing:-0.01em;
  line-height:1.4;
  flex:1;
  min-width:0;
}

/* Evidence block */
.fc-ev{
  background:var(--s3);
  border:1px solid var(--b2);
  border-radius:3px;
  padding:10px 12px;
  margin-bottom:8px;
}
.fc-ev-code{
  background:transparent;
  border:none;
  padding:0;
  color:var(--t2);
  word-break:break-all;
  font-size:12px;
  display:block;
}

/* Fix block */
.fc-fx{margin-bottom:8px}
.fc-fx-pre{
  background:var(--sg);
  border:1px solid var(--bd-g);
  border-radius:3px;
  padding:10px 12px;
  color:var(--green);
  font-family:var(--mono);
  font-size:12px;
  line-height:1.6;
  white-space:pre-wrap;
  word-break:break-word;
}

/* Block labels */
.blk-lbl{
  font-size:9px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:0.12em;
  color:var(--t3);
  margin-bottom:6px;
  font-family:var(--mono);
}
.blk-lbl-g{color:var(--green)}

/* Chips */
.fc-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.chip{
  font-size:9px;
  font-family:var(--mono);
  background:var(--s3);
  color:var(--t4);
  border:1px solid var(--b2);
  padding:2px 6px;
  border-radius:2px;
  white-space:nowrap;
}
.chip-srv{color:var(--t3);background:var(--s2);border-color:var(--b1)}
.no-findings{
  padding:16px 18px;
  background:var(--sg);
  border:1px solid var(--bd-g);
  border-radius:4px;
  color:var(--green);
  font-size:13px;
}

/* ── Server Cards ── */
.sc{
  background:var(--s1);
  border:1px solid var(--b1);
  border-radius:4px;
  margin-bottom:8px;
  overflow:hidden;
}
.sc-head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:9px 14px;
  background:var(--s2);
  border-bottom:1px solid var(--b1);
}
.sc-name{
  font-family:var(--mono);
  font-size:12px;
  font-weight:600;
  color:var(--t1);
  background:transparent;
  border:none;
  padding:0;
}
.sc-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;font-family:var(--mono)}
.sc-body{padding:12px 14px;display:flex;flex-direction:column;gap:7px}
.sc-row{display:flex;align-items:baseline;gap:10px;font-size:13px;flex-wrap:wrap}
.sc-lbl{
  font-size:9px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:0.12em;
  color:var(--t3);
  min-width:52px;
  flex-shrink:0;
  font-family:var(--mono);
}

/* Env table */
.ev-tbl{
  width:100%;
  border-collapse:collapse;
  font-size:11px;
  border:1px solid var(--b2);
  border-radius:3px;
  overflow:hidden;
  margin-top:4px;
}
.ev-tbl td{
  padding:5px 10px;
  border-bottom:1px solid var(--b2);
  font-family:var(--mono);
}
.ev-tbl tr:last-child td{border-bottom:none}
.ev-k{color:#79c0ff;width:38%}
.ev-v{color:var(--t3)}

/* ── Config Table ── */
.cft{width:100%;border-collapse:collapse;font-size:13px}
.cft th{
  text-align:left;
  padding:7px 12px;
  font-size:9px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:0.14em;
  color:var(--t3);
  border-bottom:1px solid var(--b1);
  font-family:var(--mono);
}
.cft td{padding:10px 12px;border-bottom:1px solid var(--b2);vertical-align:top}
.cft tr:last-child td{border-bottom:none}
.cft code{word-break:break-all}

/* ── Footer ── */
.footer{
  margin-top:12px;
  padding:16px 0;
  border-top:1px solid var(--b1);
  display:flex;
  justify-content:space-between;
  align-items:center;
  flex-wrap:wrap;
  gap:8px;
  font-size:11px;
  font-family:var(--mono);
  color:var(--t3);
}
.footer a{color:var(--t3)}
.footer a:hover{color:var(--green)}
.footer-brand{color:var(--green);font-weight:600}
.empty{color:var(--t3);font-size:13px;padding:12px 0}

@media(max-width:640px){
  .hero{grid-template-columns:1fr}
  .hero-left{border-right:none;border-bottom:1px solid var(--b1)}
  .stats{flex-wrap:wrap;padding:12px 0}
  .stat{min-width:40%;padding:4px 0}
  .stat-sep{display:none}
  .page{padding:20px 16px 60px}
  .hdr{flex-direction:column;gap:12px}
  .hdr-meta{align-items:flex-start}
}
</style>
</head>
<body>
<div class="page">

<header class="hdr">
  <div class="hdr-brand">
    <div class="hdr-eyebrow">Catalayer &middot; Diagnostic Module</div>
    <div class="hdr-title">MCP Doctor</div>
    <div class="hdr-sub">Diagnose and fix broken MCP servers.</div>
  </div>
  <div class="hdr-meta">
    <span class="hdr-ver">v0.1.1</span>
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
    <div class="fixes-eyebrow">What to fix first</div>
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
    <span class="stat-n" style="color:#e84545">${highs.length}</span>
    <span class="stat-lbl">high</span>
  </div>
  <div class="stat-sep"></div>
  <div class="stat">
    <span class="stat-n" style="color:#d4940a">${meds.length}</span>
    <span class="stat-lbl">medium</span>
  </div>
  <div class="stat-sep"></div>
  <div class="stat">
    <span class="stat-n" style="color:#4a9eff">${lows.length}</span>
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
  <span><span class="footer-brand">MCP Doctor</span> &mdash; <a href="https://github.com/stephenywilson/MCP-Doctor">github.com/stephenywilson/MCP-Doctor</a></span>
  <span>Secrets masked &middot; No network access</span>
</footer>

</div>
</body>
</html>`;
}

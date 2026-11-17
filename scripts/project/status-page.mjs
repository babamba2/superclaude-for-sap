// sc4sap:project-dashboard — the one-page weekly status (`build-project-doc.mjs status`).
// Self-contained HTML: header with overall RAG, workstreams, what moved since the last status run, KPI tiles,
// top risks, decisions needed, milestones of the next two weeks, the Q-gate checklist (when a gate is named) and
// the evidence read. A4 portrait in print (at most two pages), light / dark, phone layer. No edit mode: changes
// are made in the dashboard page. No local file links (they do not open on the web).

import { labelsFor, esc } from './project-render.mjs';
import { withResponsive } from '../lib/responsive.mjs';
import { arr, addDays } from './project-model.mjs';

const S = {
  ko: { title: '주간 현황', week: '주 종료', overall: '전체', manual: 'PM 판정', computed: '계산값', ws: '워크스트림', since: '지난 현황 대비', first: '첫 현황이라 비교 기준이 없어요', snapSince: 'KPI는 스냅샷 기준',
    moved: 'WRICEF 단계 이동', done: '완료', late: '새 지연', msChange: '마일스톤 상태', released: '릴리스한 이관요청', risksAdded: '새 리스크', risksClosed: '닫힌 리스크', issuesAdded: '새 이슈', issuesClosed: '해결·종료된 이슈', decAdded: '새 결정 사항', decDone: '결정됨',
    kpis: '핵심 지표', risks: '리스크 (상위 5)', issues: '열린 이슈 (상위 5)', decisions: '결정 필요', next: '다음 2주 마일스톤', gate: 'Q-gate 점검', crit: '기준', value: '값', source: '출처', met: '충족', suggest: '제안 판정',
    sugg: { pass: '통과', conditional: '조건부', fail: '실패', manual: 'PM 판단' }, yes: '예', no: '아니요', unknown: '판단 불가', evidence: '읽은 증빙', notRead: '읽지 못함', comment: 'PM 코멘트',
    suggested: '제안 (대시보드에서 목록에 넣으세요)', impact: '영향', owner: '담당', due: '기한', none: '없음', weeksGap: '주 전 현황과 비교', ev: { uat: 'UAT', ops: '운영 보고서', cts: 'CTS 점검', 'uat-defects': 'UAT 결함 피드', unknown: '알 수 없는 파일' },
    src: { cts: 'CTS 점검', 'sap actuals': 'SAP 실적', uat: 'UAT', 'uat defect feed': 'UAT 결함 피드', ops: '운영 보고서', wbs: 'WBS', manual: 'PM 판단', 'no evidence': '증빙 없음' },
    why: { 'json-unknown': '읽을 수 있는 JSON이 아니에요 (UAT 세트, 결함 피드, CTS·운영 모델만)', 'no-model': '내장 모델이 없는 페이지예요', 'read-error': '파일을 열지 못했어요', 'not-found': 'UAT 세트 파일이 없어요', 'bad-id': 'UAT 세트 ID 형식이 아니에요 (영문·숫자·_·-, 30자 이하)' },
    defects: '결함', dumpsDay: '일별 덤프', blocked: '이관 불가' },
  en: { title: 'Weekly status', week: 'Week ending', overall: 'Overall', manual: 'PM call', computed: 'computed', ws: 'Workstreams', since: 'Since the last status', first: 'First status — nothing to compare with', snapSince: 'KPIs against the snapshot of',
    moved: 'WRICEF stage moves', done: 'Completed', late: 'Newly late', msChange: 'Milestone status', released: 'Requests released', risksAdded: 'New risks', risksClosed: 'Closed risks', issuesAdded: 'New issues', issuesClosed: 'Issues resolved or closed', decAdded: 'New decisions needed', decDone: 'Decided',
    kpis: 'Key figures', risks: 'Risks (top 5)', issues: 'Open issues (top 5)', decisions: 'Decisions needed', next: 'Milestones in the next two weeks', gate: 'Q-gate check', crit: 'Criterion', value: 'Value', source: 'Source', met: 'Met', suggest: 'Suggested',
    sugg: { pass: 'Pass', conditional: 'Conditional', fail: 'Fail', manual: 'PM judges' }, yes: 'yes', no: 'no', unknown: 'cannot tell', evidence: 'Evidence read', notRead: 'not read', comment: 'PM comment',
    suggested: 'Suggested (take them into the lists in the dashboard)', impact: 'Impact', owner: 'Owner', due: 'Due', none: 'none', weeksGap: 'weeks since the status compared with', ev: { uat: 'UAT', ops: 'Operations report', cts: 'CTS check', 'uat-defects': 'UAT defect feed', unknown: 'unknown file' },
    src: { cts: 'CTS check', 'sap actuals': 'SAP actuals', uat: 'UAT', 'uat defect feed': 'UAT defect feed', ops: 'Operations report', wbs: 'WBS', manual: 'PM judges', 'no evidence': 'no evidence' },
    why: { 'json-unknown': 'not a readable JSON (UAT set, defect feed, CTS or operations model only)', 'no-model': 'a page without an embedded model', 'read-error': 'the file could not be opened', 'not-found': 'no UAT set file', 'bad-id': 'not a UAT set id (letters, digits, _ or -, up to 30)' },
    defects: 'defects', dumpsDay: 'dumps / day', blocked: 'blocked' },
};

const STYLE = `:root{--bg:#fff;--fg:#1d2733;--muted:#5a6675;--line:#d3dbe4;--head:#f2f5f8;--red:#c62828;--amber:#b26a00;--green:#2e7d32;--red-bg:#fdecea;--amber-bg:#fff4e0;--green-bg:#e8f5e9;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#11161c;--fg:#e4eaf0;--muted:#98a4b1;--line:#34404c;--head:#19212b;--red:#ef6b6b;--amber:#e0a43a;--green:#5cb85f;--red-bg:#3a1d1d;--amber-bg:#3a2c12;--green-bg:#1b3320;color-scheme:dark}}
:root[data-theme=dark]{--bg:#11161c;--fg:#e4eaf0;--muted:#98a4b1;--line:#34404c;--head:#19212b;--red:#ef6b6b;--amber:#e0a43a;--green:#5cb85f;--red-bg:#3a1d1d;--amber-bg:#3a2c12;--green-bg:#1b3320;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--fg);font:13.5px/1.5 -apple-system,"Segoe UI","Malgun Gothic",sans-serif}main{max-width:900px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:0}h2{font-size:14.5px;margin:16px 0 6px;border-bottom:1px solid var(--line);padding-bottom:3px}.muted{color:var(--muted)}
.rag{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;font-weight:600}.rag-red{background:var(--red-bg);color:var(--red)}.rag-amber{background:var(--amber-bg);color:var(--amber)}.rag-green{background:var(--green-bg);color:var(--green)}
table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid var(--line);padding:4px 7px;text-align:left;vertical-align:top}th{background:var(--head)}.num{text-align:right}
.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 18px}ul{margin:4px 0;padding-left:18px}li{margin:1px 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.tile{border:1px solid var(--line);border-radius:8px;padding:6px 9px}.tile b{font-size:17px;display:block}.up{color:var(--green)}.down{color:var(--red)}
.no{color:var(--red);font-weight:600}.yes{color:var(--green);font-weight:600}
@media (max-width:600px){.cols{grid-template-columns:minmax(0,1fr)}}
@page{size:A4 portrait;margin:11mm}@media print{body{background:#fff;color:#000;font-size:11.5px}main{max-width:none;padding:0}h2{break-after:avoid}table,.tile,li{break-inside:avoid}}`;

const chip = (r, L) => `<span class="rag rag-${esc(r)}">${esc(L.rag[r] || r)}</span>`;
const list = (items, T) => (items.length ? `<ul>${items.join('')}</ul>` : `<p class="muted">${esc(T.none)}</p>`);
const arrow = (from, to) => `${esc(from ?? '—')} → <b>${esc(to ?? '—')}</b>`;

function sinceBlock(d, T, L) {
  if (d.first) return `<p class="muted">${esc(T.first)}${d.since ? ` · ${esc(T.snapSince)} ${esc(d.since)}` : ''}</p>`;
  const li = [];
  if (d.weeks > 1) li.push(`<li class="muted">${d.weeks} ${esc(T.weeksGap)} (${esc(d.since)})</li>`);
  if (d.overall) li.push(`<li>${esc(T.overall)}: ${chip(d.overall.from, L)} → ${chip(d.overall.to, L)}</li>`);
  for (const x of d.moved) li.push(`<li>${esc(T.moved)}: ${esc(x.label)} — ${arrow(L.stage[x.from] || x.from, L.stage[x.to] || x.to)}</li>`);
  if (d.done.length) li.push(`<li>${esc(T.done)}: ${d.done.map((x) => esc(x.label)).join(', ')}</li>`);
  if (d.late.length) li.push(`<li class="no">${esc(T.late)}: ${d.late.map((x) => esc(x.label)).join(', ')}</li>`);
  for (const x of d.ms) li.push(`<li>${esc(T.msChange)}: ${esc(x.label)} — ${arrow(L.msStatus[x.from] || x.from, L.msStatus[x.to] || x.to)}</li>`);
  if (d.released.F || d.released.D) li.push(`<li>${esc(T.released)}: ${esc(L.side.F)} ${d.released.F} · ${esc(L.side.D)} ${d.released.D}</li>`);
  for (const e of d.evidence) {
    if (e.first) continue;
    if (e.kind === 'uat') li.push(`<li>UAT ${esc(e.id)}: ${Object.entries(e.pass).map(([c, x]) => `${esc(c)} ${arrow(x.from == null ? null : `${x.from}%`, x.to == null ? null : `${x.to}%`)}`).join(' · ')} · ${esc(T.defects)} ${arrow(e.defectsOpen.from, e.defectsOpen.to)}</li>`);
    if (e.kind === 'ops') li.push(`<li>${esc(T.ev.ops)}: ${esc(T.dumpsDay)} ${arrow(e.dumpsDay.from, e.dumpsDay.to)}</li>`);
    if (e.kind === 'cts') li.push(`<li>${esc(T.ev.cts)}: ${esc(T.blocked)} ${arrow(e.blocked.from, e.blocked.to)}</li>`);
  }
  if (d.risks.added.length) li.push(`<li>${esc(T.risksAdded)}: ${d.risks.added.map(esc).join(', ')}</li>`);
  if (d.risks.closed.length) li.push(`<li>${esc(T.risksClosed)}: ${d.risks.closed.map(esc).join(', ')}</li>`);
  if (d.issues?.added.length) li.push(`<li>${esc(T.issuesAdded)}: ${d.issues.added.map(esc).join(', ')}</li>`);
  if (d.issues?.closed.length) li.push(`<li>${esc(T.issuesClosed)}: ${d.issues.closed.map(esc).join(', ')}</li>`);
  if (d.decisions.added.length) li.push(`<li>${esc(T.decAdded)}: ${d.decisions.added.map(esc).join(', ')}</li>`);
  if (d.decisions.decided.length) li.push(`<li>${esc(T.decDone)}: ${d.decisions.decided.map(esc).join(', ')}</li>`);
  return list(li, T);
}

function tiles(v, d, L) {
  const diff = new Map(arr(d.kpi).map((x) => [x.id, x]));
  return `<div class="tiles">${v.kpis.filter((k) => k.auto && k.actual != null).slice(0, 8).map((k) => {
    const x = diff.get(k.id), good = x && ((x.diff > 0) === (k.dir !== 'down'));
    return `<div class="tile"><span class="muted">${esc(L.kpiName[k.id] || k.label || k.id)}</span><b>${esc(k.actual)}${esc(k.unit || '')}</b>${x ? `<span class="${good ? 'up' : 'down'}">${x.diff > 0 ? '+' : ''}${esc(x.diff)}</span>` : ''}</div>`;
  }).join('')}</div>`;
}

function gateBlock(g, T) {
  const met = (m) => (m === true ? `<span class="yes">${esc(T.yes)}</span>` : m === false ? `<span class="no">${esc(T.no)}</span>` : `<span class="muted">${esc(T.unknown)}</span>`);
  return `<h2>${esc(T.gate)} — ${esc(g.label)} (${esc(g.date)})</h2>
<table><thead><tr><th>${esc(T.crit)}</th><th>${esc(T.value)}</th><th>${esc(T.source)}</th><th>${esc(T.met)}</th></tr></thead><tbody>
${g.rows.map((r) => `<tr><td>${esc(r.text)}${r.rule ? ` <small class="muted">[${esc(r.rule)}]</small>` : ''}</td><td class="num">${esc(r.value ?? '—')}</td><td>${esc(T.src[r.source] || r.source)}</td><td>${met(r.met)}</td></tr>`).join('')}
</tbody></table><p>${esc(T.suggest)}: <b>${esc(T.sugg[g.suggest])}</b> · ${g.met} / ${g.unmet} / ${g.manual}</p>`;
}

/** The status page of one week. */
export function renderStatusPage({ view: v, entry, delta: d, gate = null, evidence = [], suggestions: sg = { risks: [], decisions: [] }, lang = 'ko' }) {
  const L = labelsFor(lang), T = S[lang === 'en' ? 'en' : 'ko'], p = v.m.project;
  const name = (id) => v.m.team.find((t) => t.id === id)?.name || id || '';
  const manual = entry.overall !== entry.computed;
  const risks = v.m.risks.filter((r) => r.status !== 'closed').sort((a, b) => 'HML'.indexOf(a.impact) - 'HML'.indexOf(b.impact)).slice(0, 5);
  const decs = v.m.decisions.filter((x) => x.status !== 'decided');
  // open issues: overdue first, then priority
  const issues = (v.m.issues || []).filter((x) => x.status !== 'resolved' && x.status !== 'closed')
    .sort((a, b) => ((b.due && b.due < entry.weekEnd) - (a.due && a.due < entry.weekEnd)) || 'HML'.indexOf(a.priority) - 'HML'.indexOf(b.priority)).slice(0, 5);
  const until = addDays(entry.weekEnd, 14);
  const next = v.milestones.filter((x) => !x.actual && x.date > entry.weekEnd && x.date <= until);
  const wsRows = Object.entries(entry.ws).map(([w, r]) => { const c = v.wsRag[w] || { red: 0, amber: 0, total: 0 }; return `<tr><td>${esc(w)}</td><td>${chip(r, L)}</td><td class="num">${c.red} / ${c.amber} / ${c.total}</td></tr>`; }).join('');
  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.code)} ${esc(T.title)} ${esc(entry.weekEnd)}</title><meta name="generator" content="sc4sap project-dashboard status"><style>${STYLE}</style></head><body><main>
<h1>${esc(p.code)} · ${esc(p.name)}</h1>
<p>${esc(T.title)} · ${esc(T.week)} <b>${esc(entry.weekEnd)}</b> · ${esc(T.overall)} ${chip(entry.overall, L)}${manual ? ` <small class="muted">(${esc(T.manual)}; ${esc(T.computed)} ${esc(L.rag[entry.computed])})</small>` : ''} · ${esc(L.kpi.progress)} ${v.progress.actual}% / ${v.progress.planned}% · Go-Live ${esc(p.goLive)}</p>
${entry.comment ? `<p><b>${esc(T.comment)}:</b> ${esc(entry.comment)}</p>` : ''}
<div class="cols"><section><h2>${esc(T.since)}</h2>${sinceBlock(d, T, L)}</section>
<section><h2>${esc(T.ws)}</h2><table><thead><tr><th>${esc(T.ws)}</th><th>RAG</th><th class="num">${esc(L.rag.red)} / ${esc(L.rag.amber)} / Σ</th></tr></thead><tbody>${wsRows}</tbody></table></section></div>
<h2>${esc(T.kpis)}</h2>${tiles(v, d, L)}
<div class="cols"><section><h2>${esc(T.risks)}</h2>${list(risks.map((r) => `<li><b>${esc(r.impact)}</b> ${esc(r.text)}${r.owner ? ` · ${esc(name(r.owner))}` : ''}${r.due ? ` · ${esc(r.due)}` : ''}</li>`), T)}</section>
<section><h2>${esc(T.issues)}</h2>${list(issues.map((x) => `<li><b>${esc(x.priority)}</b> ${esc(x.text)}${x.owner ? ` · ${esc(name(x.owner))}` : ''}${x.due ? ` · ${esc(x.due)}` : ''}</li>`), T)}</section>
<section><h2>${esc(T.decisions)}</h2>${list(decs.map((x) => `<li>${esc(x.text)}${x.owner ? ` · ${esc(name(x.owner))}` : ''}${x.due ? ` · ${esc(x.due)}` : ''}</li>`), T)}</section></div>
${sg.risks.length || sg.decisions.length ? `<h2>${esc(T.suggested)}</h2>${list([...sg.risks.map((r) => `<li><b>${esc(r.impact)}</b> ${esc(r.text)}</li>`), ...sg.decisions.map((x) => `<li>${esc(x.text)}</li>`)], T)}` : ''}
<h2>${esc(T.next)}</h2>${list(next.map((x) => `<li>${esc(x.date)} · ${esc(x.label)} ${chip(x.rag, L)}</li>`), T)}
${gate ? gateBlock(gate, T) : ''}
<h2>${esc(T.evidence)}</h2>${list(evidence.map((e) => `<li>${esc(T.ev[e.kind] || e.kind)}${e.id ? ` · ${esc(e.id)}` : ''}${e.ok ? '' : ` — <span class="no">${esc(T.notRead)}</span>: ${esc(T.why[e.code] || e.reason || '')}`}</li>`), T)}
</main></body></html>`;
  return withResponsive(html);
}

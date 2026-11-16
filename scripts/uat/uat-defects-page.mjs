// sc4sap:uat-scenarios — the defects-and-fixes page (self-contained HTML, read-only) and its chat summary.
// One row per defect issue: the failed step, the fixing requests with their CTS state, the retest cycle and
// its result, and the status (uat-defects.mjs). Proposed links found in request texts are listed apart —
// they are not links until the user accepts them.

import { withResponsive } from '../lib/responsive.mjs';

const T = {
  en: {
    title: 'Defects and fixes', set: 'Set', project: 'Project', at: 'As of', tr: 'CTS check of',
    cols: { issue: 'Issue', step: 'Scenario / step', text: 'Issue', failed: 'Failed in', fix: 'Fix request (CTS)', retest: 'Retest', status: 'Status' },
    status: { 'no-fix': 'No fix request', 'fix-unchecked': 'Fix not checked', 'fix-in-progress': 'Fix in progress', 'fix-ready': 'Ready to move', 'retest-due': 'Retest due', 'retest-pass': 'Retest passed', 'retest-fail': 'Retest failed' },
    cts: { ready: 'ready', released: 'released', check: 'check', blocked: 'blocked', unknown: 'not checked' },
    kpi: { 'uat-defects-open': 'Open defects', 'uat-defects-no-fix': 'Open without a fix request', 'uat-fix-ready': 'Fix ready to move', 'uat-retest-due': 'Retest due', 'uat-retest-pass-rate': 'Retest pass rate' },
    toClose: 'Retest passed — close?', unchecked: 'Retested, fix not CTS-checked (not in the pass rate)', closeList: 'Retest passed but still open — close?',
    notLinked: 'Not linked', notLinkedWhy: '(not a request number)',
    proposed: 'Links found in request texts (not applied — accept them in the set first)', none: 'No defect logged.',
    note: '"Ready to move" means the CTS check found nothing against the request; whether it was imported into QA is not read. Results come from the UAT set; nothing in SAP was changed.',
  },
  ko: {
    title: '결함과 수정', set: '세트', project: '프로젝트', at: '기준일', tr: 'CTS 점검',
    cols: { issue: '이슈', step: '시나리오 / STEP', text: '내용', failed: '실패 차수', fix: '수정 요청 (CTS)', retest: '재테스트', status: '상태' },
    status: { 'no-fix': '수정 요청 없음', 'fix-unchecked': '수정 요청 미점검', 'fix-in-progress': '수정 중', 'fix-ready': '이관 준비됨', 'retest-due': '재테스트 대기', 'retest-pass': '재테스트 통과', 'retest-fail': '재테스트 실패' },
    cts: { ready: '이관 가능', released: '릴리스됨', check: '확인 필요', blocked: '이관 불가', unknown: '미점검' },
    kpi: { 'uat-defects-open': '미결 결함', 'uat-defects-no-fix': '수정 요청 없는 미결', 'uat-fix-ready': '이관 준비된 수정', 'uat-retest-due': '재테스트 대기', 'uat-retest-pass-rate': '재테스트 통과율' },
    toClose: '재테스트 통과 — 종결?', unchecked: '재테스트했지만 수정 요청 CTS 미점검 (통과율 제외)', closeList: '재테스트 통과했지만 아직 미결 — 종결할까요?',
    notLinked: '연결 안 된 값', notLinkedWhy: '(요청 번호 형식이 아니에요)',
    proposed: '요청 텍스트에서 찾은 연결 (아직 반영 안 됨 — 세트에서 먼저 수락하세요)', none: '등록된 결함이 없어요.',
    note: '"이관 준비됨"은 CTS 점검에서 막는 것이 없다는 뜻이에요. QA에 실제로 이관됐는지는 읽지 않아요. 결과는 UAT 세트에서 왔고 SAP에서는 아무것도 바꾸지 않았어요.',
  },
};
export const defectLabels = (lang) => T[lang] || T.en;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const closeAsk = (r) => r.status === 'retest-pass' && (r.state === 'open' || r.state === 'waiting');
const TONE = { 'no-fix': 'red', 'fix-unchecked': 'amber', 'fix-in-progress': 'amber', 'fix-ready': 'blue', 'retest-due': 'blue', 'retest-pass': 'green', 'retest-fail': 'red' };

export function renderDefects({ set, rows, feed, proposals = [], trLabel = '' }, lang = 'en') {
  const t = defectLabels(lang);
  const kpi = Object.entries(feed.kpi).map(([k, v]) => `<div class="tile"><div class="k">${esc(t.kpi[k] || k)}</div><div class="v">${v === null ? '–' : esc(v)}${k === 'uat-retest-pass-rate' && v !== null ? '%' : ''}</div></div>`).join('');
  const body = rows.map((r) => `<tr><td><code>${esc(r.issue)}</code></td><td>${esc(r.scenario)} / ${esc(r.step)}</td><td>${esc(r.text)}</td><td>${esc(r.failed.join(', '))}</td>
<td>${r.transports.map((x) => `<code>${esc(x.trkorr)}</code> <span class="c ${esc(x.state)}">${esc(t.cts[x.state] || x.state)}</span>`).join('<br>') || '–'}${r.notLinked?.length ? `<div class="bad">${esc(t.notLinked)}: ${r.notLinked.map(esc).join(', ')} ${esc(t.notLinkedWhy)}</div>` : ''}</td>
<td>${esc(r.retest || '–')}${r.retestResult ? ` · ${esc(r.retestResult)}` : ''}</td><td><span class="s ${TONE[r.status]}">${esc(closeAsk(r) ? t.toClose : t.status[r.status])}</span></td></tr>`).join('\n');
  const notes = [[t.closeList, feed.notes?.toClose], [t.unchecked, feed.notes?.retestUnchecked]].filter(([, l]) => l?.length)
    .map(([label, l]) => `<p class="meta"><b>${esc(label)}</b>: ${l.map((x) => `<code>${esc(x)}</code>`).join(', ')}</p>`).join('');
  const prop = proposals.length ? `<h2>${esc(t.proposed)}</h2><ul>${proposals.map((p) => `<li><code>${esc(p.issue)}</code> → ${p.value.map((v) => `<code>${esc(v)}</code>`).join(', ')}</li>`).join('')}</ul>` : '';
  return withResponsive(`<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.title)} · ${esc(set.id)}</title>
<style>
:root{--bg:#fff;--fg:#1d2430;--muted:#5d6878;--line:#d9dee6;--head:#f3f5f8;--red:#c0392b;--amber:#b7791f;--green:#2f855a;--blue:#2b5cab;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14181f;--fg:#e4e8ee;--muted:#9aa5b4;--line:#2c3440;--head:#1c222b;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#14181f;--fg:#e4e8ee;--muted:#9aa5b4;--line:#2c3440;--head:#1c222b;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px}.meta,.note{color:var(--muted)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}.tile{border:1px solid var(--line);border-radius:8px;padding:8px 12px}.tile .k{color:var(--muted);font-size:12px}.tile .v{font-size:20px}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid var(--line);padding:4px 7px;text-align:left;vertical-align:top}th{background:var(--head);white-space:nowrap}
.s,.c{font-size:12px;padding:0 7px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}.red,.c.blocked{color:var(--red)}.amber,.c.check,.c.unknown{color:var(--amber)}.green,.c.ready,.c.released{color:var(--green)}.blue{color:var(--blue)}.bad{color:var(--red);font-size:12px}
@page{size:A4 landscape;margin:10mm}@media print{tr{break-inside:avoid}}
</style></head><body><main>
<h1>${esc(t.title)}</h1>
<p class="meta">${esc(t.set)} <b>${esc(set.id)}</b>${set.project ? ` · ${esc(t.project)} ${esc(set.project)}` : ''} · ${esc(t.at)} ${esc(feed.at)}${trLabel ? ` · ${esc(t.tr)} ${esc(trLabel)}` : ''}</p>
<div class="tiles">${kpi}</div>
${notes}
${rows.length ? `<div class="tw"><table><tr>${Object.values(t.cols).map((c) => `<th>${esc(c)}</th>`).join('')}</tr>
${body}</table></div>` : `<p class="meta">${esc(t.none)}</p>`}
${prop}
<p class="note">${esc(t.note)}</p>
</main></body></html>
`);
}

export function renderDefectSummary({ set, rows, feed, proposals = [] }, lang = 'en') {
  const t = defectLabels(lang);
  const k = feed.kpi;
  return [
    `${t.title} · ${set.id} · ${t.kpi['uat-defects-open']} ${k['uat-defects-open']} · ${t.kpi['uat-defects-no-fix']} ${k['uat-defects-no-fix']} · ${t.kpi['uat-fix-ready']} ${k['uat-fix-ready']} · ${t.kpi['uat-retest-due']} ${k['uat-retest-due']} · ${t.kpi['uat-retest-pass-rate']} ${k['uat-retest-pass-rate'] ?? '–'}${k['uat-retest-pass-rate'] === null ? '' : '%'}`,
    ...rows.map((r) => `- ${r.issue} ${r.scenario}/${r.step} · ${closeAsk(r) ? t.toClose : t.status[r.status]}${r.transports.length ? ` · ${r.transports.map((x) => `${x.trkorr} ${t.cts[x.state] || x.state}`).join(', ')}` : ''}`),
    ...(proposals.length ? [`${t.proposed}: ${proposals.map((p) => `${p.issue} → ${p.value.join(', ')}`).join('; ')}`] : []),
  ].join('\n');
}

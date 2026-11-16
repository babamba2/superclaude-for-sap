// sc4sap:project-dashboard — the cutover readiness page (`build-project-doc.mjs cutover`). Read-only and printable
// (A4 landscape), light / dark, phone layer. Edits to the runbook are made in the dashboard's Cutover tab.
// Sections: D-day and window, go / no-go suggestion with each item's evidence, window fit (window / plan /
// rehearsal), critical path, T-minus runbook (phase tables + hour timeline of the window), jobs to suspend,
// import list (release order — never an import order), open risks and decisions.

import { labelsFor, esc } from './project-render.mjs';
import { withResponsive } from '../lib/responsive.mjs';
import { arr } from './project-model.mjs';
import { CUT_PHASES, cutDueOf, cutWindowTimes, cutActualH } from './cutover-model.mjs';

export const CUT_T = {
  ko: { title: '컷오버 준비', window: '작업 시간대', freeze: '동결', code: '개발', config: '설정', gng: 'Go / No-go', suggest: '제안', item: '항목', value: '값', source: '근거', person: '판정',
    sugg: { go: 'Go', conditional: '조건부', nogo: 'No-go', open: '항목 없음' }, st: { open: '미정', go: 'Go', nogo: 'No-go', waived: '면제' }, yes: '충족', no: '미충족', unknown: '판단 불가',
    suggestNote: '제안일 뿐입니다. Go / No-go는 회의에서 사람이 결정합니다.',
    fit: '작업 시간대 적합도', plan: '계획', rehearsal: '리허설', fits: '여유 있음', tight: '빠듯함 (여유 10% 미만)', exceeds: '작업 시간대 초과', unknownFit: '작업 시간대 없음', h: '시간', estimated: '실측 없음 (계획값 사용)',
    path: '임계 경로', runbook: 'T-minus 런북', phase: { pre: '사전', freeze: '동결', window: '작업 시간대', post: '오픈 후' }, when: '일시', task: '작업', ws: '워크스트림', owner: '담당', dur: '시간', actual: '리허설 실측', check: '점검', status: '상태',
    tst: { planned: '예정', done: '완료', skipped: '건너뜀', failed: '실패' }, late: '늦음', lateN: '늦은 작업', jobs: '작업 시간대 동안 정지할 후보 잡', job: '잡', jst: { released: '릴리스', scheduled: '예약' }, next: '다음 실행', prog: '프로그램', period: '주기',
    event: '이벤트', progNotRead: '첫 스텝 프로그램은 읽지 못함 (TBTCP)',
    notRead: '읽지 못함 (SM37에서 확인)', jobsOff: '잡은 읽지 않았어요 (--jobs)', jobsNote: '읽기만 했어요. 잡을 정지하거나 바꾸지 않습니다.', imports: '이관 요청 목록', req: '요청', date: '릴리스일', side: '구분', verdict: 'CTS 판정', warn: '경고',
    fk: { 'other-request': '다른 열린 요청에도 있음', dependency: '미릴리스 요청에 의존', 'dependency-unread': '의존성 조회 못 함' }, open: '미릴리스', ctsOnly: 'CTS 근거에만 있음',
    src: { manual: '사람 판단', 'no evidence': '근거 없음', cts: 'CTS 점검', uat: 'UAT', 'uat defect feed': 'UAT 결함 피드', ops: '운영 보고서', 'sap actuals': 'SAP 실적', wbs: 'WBS', runbook: '런북', 'jobs (TBTCO)': '잡 (TBTCO)', 'jobs not read': '잡 읽지 않음', 'no rehearsal measured': '리허설 실측 없음' },
    risks: '열린 리스크', decisions: '결정 필요', none: '없음', readOnly: '읽기 전용 문서입니다. 런북은 대시보드의 컷오버 탭에서 고쳐요.' },
  en: { title: 'Cutover readiness', window: 'Window', freeze: 'Freeze', code: 'code', config: 'configuration', gng: 'Go / no-go', suggest: 'Suggested', item: 'Item', value: 'Value', source: 'Evidence', person: 'Decision',
    sugg: { go: 'Go', conditional: 'Conditional', nogo: 'No-go', open: 'no items' }, st: { open: 'open', go: 'Go', nogo: 'No-go', waived: 'waived' }, yes: 'met', no: 'not met', unknown: 'cannot tell',
    suggestNote: 'A suggestion only. People decide go / no-go in the meeting.',
    fit: 'Window fit', plan: 'Plan', rehearsal: 'Rehearsal', fits: 'fits', tight: 'tight (less than 10 % spare)', exceeds: 'exceeds the window', unknownFit: 'no window set', h: 'h', estimated: 'no rehearsal time (plan used)',
    path: 'Critical path', runbook: 'T-minus runbook', phase: { pre: 'Before', freeze: 'Freeze', window: 'Window', post: 'After go-live' }, when: 'When', task: 'Task', ws: 'Workstream', owner: 'Owner', dur: 'Hours', actual: 'Rehearsal', check: 'Check', status: 'Status',
    tst: { planned: 'planned', done: 'done', skipped: 'skipped', failed: 'failed' }, late: 'late', lateN: 'Late tasks', jobs: 'Jobs to suspend during the window', job: 'Job', jst: { released: 'released', scheduled: 'scheduled' }, next: 'Next run', prog: 'Program', period: 'Period',
    event: 'event', progNotRead: 'first-step programs not read (TBTCP)',
    notRead: 'not read (check in SM37)', jobsOff: 'Jobs were not read (--jobs)', jobsNote: 'Read only. No job is suspended or changed.', imports: 'Transport request list', req: 'Request', date: 'Released', side: 'Side', verdict: 'CTS verdict', warn: 'Warnings',
    fk: { 'other-request': 'also in another open request', dependency: 'needs an unreleased request', 'dependency-unread': 'dependencies not read' }, open: 'not released', ctsOnly: 'only in the CTS evidence',
    src: { manual: 'people judge', 'no evidence': 'no evidence', cts: 'CTS check', uat: 'UAT', 'uat defect feed': 'UAT defect feed', ops: 'operations report', 'sap actuals': 'SAP actuals', wbs: 'WBS', runbook: 'runbook', 'jobs (TBTCO)': 'jobs (TBTCO)', 'jobs not read': 'jobs not read', 'no rehearsal measured': 'no rehearsal measured' },
    risks: 'Open risks', decisions: 'Decisions needed', none: 'none', readOnly: 'Read-only document. Change the runbook in the dashboard\'s Cutover tab.' },
};
const lk = (lang) => (String(lang).slice(0, 2) === 'en' ? 'en' : 'ko');

const STYLE = `:root{--bg:#fff;--fg:#1d2733;--muted:#5a6675;--line:#d3dbe4;--head:#f2f5f8;--red:#c62828;--amber:#b26a00;--green:#2e7d32;--bar:#5b84b1;--bar2:#2e7d32;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#11161c;--fg:#e4eaf0;--muted:#98a4b1;--line:#34404c;--head:#19212b;--red:#ef6b6b;--amber:#e0a43a;--green:#5cb85f;--bar:#7aa6d6;--bar2:#5cb85f;color-scheme:dark}}
:root[data-theme=dark]{--bg:#11161c;--fg:#e4eaf0;--muted:#98a4b1;--line:#34404c;--head:#19212b;--red:#ef6b6b;--amber:#e0a43a;--green:#5cb85f;--bar:#7aa6d6;--bar2:#5cb85f;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.5 -apple-system,"Segoe UI","Malgun Gothic",sans-serif}main{max-width:1180px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:0}h2{font-size:14.5px;margin:18px 0 6px;border-bottom:1px solid var(--line);padding-bottom:3px}h3{font-size:13px;margin:10px 0 4px}.muted{color:var(--muted)}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid var(--line);padding:3px 6px;text-align:left;vertical-align:top}th{background:var(--head)}.num{text-align:right;font-variant-numeric:tabular-nums}
.big{font-size:26px;font-weight:700}.go{color:var(--green);font-weight:600}.nogo{color:var(--red);font-weight:600}.cond{color:var(--amber);font-weight:600}
.bars{max-width:640px}.bar{display:flex;align-items:center;gap:8px;margin:3px 0}.bar span{width:110px;flex:none}.bar b{white-space:nowrap}.bar em{flex:1;min-width:0}.bar i{display:block;height:12px;background:var(--bar);border-radius:3px;box-sizing:border-box}.bar i.w{background:none;border:2px solid var(--fg)}.bar i.r{background:var(--bar2)}
.tl{position:relative;border-left:1px solid var(--line);margin:6px 0 10px}.tl div{position:relative;height:18px;margin:2px 0}.tl b{position:absolute;height:12px;top:3px;background:var(--bar);border-radius:3px}.tl b.cp{background:var(--red)}
.tl small{position:absolute;top:1px;white-space:nowrap;font-size:11px;color:var(--fg)}.tl .wend{position:absolute;top:0;bottom:0;border-left:2px dashed var(--fg)}
.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 18px}@media (max-width:600px){.cols{grid-template-columns:minmax(0,1fr)}.bar span{width:80px}.tl small{font-size:10px}}
.note{border-left:3px solid var(--amber);padding:4px 8px;margin:4px 0}
@page{size:A4 landscape;margin:10mm}@media print{body{background:#fff;color:#000;font-size:11px}main{max-width:none;padding:0}h2{break-after:avoid}tr,.bar{break-inside:avoid}}`;

const srcText = (t, s) => { const x = String(s || ''); const m = /^no evidence(?: \((.*)\))?$/.exec(x); return m ? `${t.src['no evidence']}${m[1] ? ` (${t.src[m[1]] || m[1]})` : ''}` : t.src[x] || x.replace(/^rehearsal /, `${t.rehearsal} `); };
const dDayText = (d) => (d == null ? '—' : d > 0 ? `D-${d}` : d === 0 ? 'D-day' : `D+${-d}`);

/**
 * view = viewModel(model, today); c = model.cutover; gng = goNoGoView; fit = rehearsalFit; tm = tMinus;
 * jobs = readJobs result or null (not asked); imports = importList; checks = taskChecks.
 */
export function renderCutoverPage({ view: v, cutover: c, gng, fit, tm, jobs = null, imports = null, checks = [], lang = 'ko' }) {
  const t = CUT_T[lk(lang)], L = labelsFor(lang), p = v.m.project;
  const name = (id) => v.m.team.find((x) => x.id === id)?.name || id || '';
  const cls = (s) => (s === 'go' ? 'go' : s === 'nogo' ? 'nogo' : 'cond');
  const met = (m) => (m === true ? `<span class="go">${t.yes}</span>` : m === false ? `<span class="nogo">${t.no}</span>` : `<span class="muted">${t.unknown}</span>`);
  const late = new Set(tm.late.map((x) => x.id));
  const chk = new Map(arr(checks).map((x) => [x.id, x]));
  const rid = fit.rehearsal?.id || '';

  // window fit bars
  const max = Math.max(fit.windowH || 0, fit.plan.totalH, fit.rehearsal?.totalH || 0, 1);
  const bar = (label, h, c2 = '') => `<div class="bar"><span>${esc(label)}</span><em><i class="${c2}" style="width:${Math.round((h || 0) / max * 1000) / 10}%"></i></em><b>${h ?? '—'} ${t.h}</b></div>`;
  const fitWord = (x) => (x === 'unknown' ? t.unknownFit : t[x]);
  const cp = new Set(fit.plan.path); // the planned critical path (the timeline and the tables show the plan)

  // hour timeline of the window (planned schedule; the critical path in red)
  const sch = fit.plan.schedule;
  const win = arr(c.tasks).filter((x) => x.phase === 'window' && sch[x.id]).sort((a, b) => sch[a.id].es - sch[b.id].es || (a.id < b.id ? -1 : 1));
  const span = Math.max(fit.windowH || 0, fit.plan.totalH, 1);
  const times = cutWindowTimes(c, sch);
  const timeline = `<div class="tl">${fit.windowH ? `<span class="wend" style="left:${(fit.windowH / span) * 100}%"></span>` : ''}${win.map((x) => {
    const s = sch[x.id], left = (s.es / span) * 100;
    return `<div><b class="${cp.has(x.id) ? 'cp' : ''}" style="left:${left}%;width:${Math.max(0.6, (s.dur / span) * 100)}%"></b>${left + (s.dur / span) * 100 < 58 ? `<small style="left:${left + (s.dur / span) * 100 + 0.5}%">` : `<small style="right:${100 - left + 0.5}%">`}H+${s.es} ${esc(x.label)}</small></div>`;
  }).join('')}</div>`;

  const phaseTable = (ph) => {
    let rows = arr(c.tasks).filter((x) => x.phase === ph);
    if (!rows.length) return '';
    const whenOf = (x) => (ph === 'window' ? (sch[x.id] ? `H+${sch[x.id].es} · ${(times[x.id]?.start || '').replace('T', ' ')}` : '—') : `${dDayText(-(Number(x.offset) || 0)).replace('D-day', 'D')} · ${cutDueOf(x, c, p.goLive)}`);
    rows = ph === 'window' ? rows.sort((a, b) => (sch[a.id]?.es ?? 1e9) - (sch[b.id]?.es ?? 1e9)) : rows.sort((a, b) => (cutDueOf(a, c, p.goLive) < cutDueOf(b, c, p.goLive) ? -1 : 1));
    return `<h3>${esc(t.phase[ph])}</h3><div class="tw"><table><thead><tr><th>${t.when}</th><th>ID</th><th>${t.task}</th><th>${t.ws}</th><th>${t.owner}</th>${ph === 'window' ? `<th class="num">${t.dur}</th>${rid ? `<th class="num">${t.actual} ${esc(rid)}</th>` : ''}` : ''}<th>${t.check}</th><th>${t.status}</th></tr></thead><tbody>${rows.map((x) => {
      const k = chk.get(x.id);
      return `<tr><td>${esc(whenOf(x))}</td><td>${esc(x.id)}</td><td>${esc(x.label)}${cp.has(x.id) ? ' <span class="nogo">●</span>' : ''}${x.note ? `<br><small class="muted">${esc(x.note)}</small>` : ''}</td><td>${esc(x.ws || '')}</td><td>${esc(name(x.owner))}</td>`
        + (ph === 'window' ? `<td class="num">${esc(x.durationH ?? '')}</td>${rid ? `<td class="num">${esc(cutActualH(x, rid) ?? '—')}</td>` : ''}` : '')
        + `<td>${k ? `${esc(k.text)} ${met(k.met)}${k.value != null ? ` <small class="muted">(${esc(k.value)})</small>` : ''}` : ''}</td>`
        + `<td>${esc(t.tst[x.status] || x.status)}${late.has(x.id) ? ` <span class="nogo">${t.late}</span>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  };

  const risks = v.m.risks.filter((r) => r.status !== 'closed'), decs = v.m.decisions.filter((d) => d.status !== 'decided');
  const jobsHtml = !jobs ? `<p class="muted">${t.jobsOff}</p>` : !jobs.ok ? `<p class="nogo">${t.notRead}: ${esc(jobs.error || '')}</p>`
    : `<p class="muted">${t.jobsNote}${jobs.at ? ` · ${esc(jobs.at)}` : ''}${jobs.system ? ` · ${esc(jobs.system)}` : ''} · ${t.jst.released} ${jobs.rows.filter((j) => j.status === 'released').length} · ${t.jst.scheduled} ${jobs.rows.filter((j) => j.status !== 'released').length}${jobs.stepsRead === false ? ` · <span class="nogo">${t.progNotRead}</span>` : ''}</p>` + (jobs.rows.length ? `<div class="tw"><table><thead><tr><th>${t.job}</th><th>${t.status}</th><th>${t.next}</th><th>${t.prog}</th><th>${t.period}</th></tr></thead><tbody>${jobs.rows.map((j) =>
      `<tr><td>${esc(j.job)}</td><td>${esc(t.jst[j.status] || j.status)}</td><td>${esc(j.next || (j.event ? `${t.event} ${j.event}` : ''))}</td><td>${esc(j.program)}</td><td>${esc(j.period)}</td></tr>`).join('')}</tbody></table></div>` : `<p>${t.none}</p>`);
  const impHtml = `<p class="note">${esc(imports?.warning || '')}</p>` + (imports?.rows.length ? `<div class="tw"><table><thead><tr><th class="num">#</th><th>${t.req}</th><th>${t.date}</th><th>${t.side}</th><th>${t.ws}</th><th>${t.task}</th><th>${t.verdict}</th><th>${t.warn}</th></tr></thead><tbody>${imports.rows.map((r) =>
    `<tr><td class="num">${r.seq}</td><td>${esc(r.trkorr)}</td><td>${esc(r.status === 'released' ? r.date : r.ctsOnly ? t.ctsOnly : t.open)}</td><td>${esc(L.side?.[r.side] || r.side)}</td><td>${esc(r.ws)}</td><td>${esc(r.text)}</td>`
    + `<td class="${r.verdict === 'blocked' ? 'nogo' : r.verdict === 'check' ? 'cond' : ''}">${esc(r.verdict || '—')}</td><td>${r.findings.map((f) => esc(t.fk[f] || f)).join(', ')}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${t.none}</p>`);

  const summary = { project: p.code, dDay: tm.dDay, suggest: gng.suggest, nogo: gng.nogo, open: gng.open, fit: fit.verdict, windowH: fit.windowH, criticalH: (fit.rehearsal || fit.plan).totalH, late: tm.late.length };
  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.code)} ${esc(t.title)}</title><meta name="generator" content="sc4sap project-dashboard cutover"><style>${STYLE}</style></head><body><main>
<h1>${esc(p.code)} · ${esc(p.name)} — ${esc(t.title)}</h1>
<p><span class="big">${dDayText(tm.dDay)}</span> · Go-Live ${esc(p.goLive)} · ${t.window} <b>${esc((c.window?.start || '—').replace('T', ' '))} → ${esc((c.window?.end || '—').replace('T', ' '))}</b> (${fit.windowH ?? '—'} ${t.h})
 · ${t.freeze}: ${t.code} ${esc(c.freeze?.code || '—')}, ${t.config} ${esc(c.freeze?.config || '—')}</p>
<p>${t.gng} ${t.suggest}: <span class="big ${cls(gng.suggest)}">${esc(t.sugg[gng.suggest] || gng.suggest)}</span> <small class="muted">${t.suggestNote}</small>${tm.late.length ? ` · <span class="nogo">${t.lateN} ${tm.late.length}</span>` : ''}</p>
<p class="muted">${t.readOnly}</p>
<div class="cols"><section><h2>${t.gng}</h2><div class="tw"><table><thead><tr><th>${t.item}</th><th class="num">${t.value}</th><th>${t.source}</th><th></th><th>${t.person}</th></tr></thead><tbody>${gng.items.map((g) =>
  `<tr><td>${esc(g.text)}${g.rule ? ` <small class="muted">[${esc(g.rule)}]</small>` : ''}</td><td class="num">${esc(g.value ?? '—')}</td><td>${esc(srcText(t, g.source))}</td><td>${met(g.met)}</td><td class="${cls(g.status)}">${esc(t.st[g.status] || g.status)}${g.human !== 'open' ? ' ✓' : ''}${g.owner ? ` <small class="muted">${esc(name(g.owner))}</small>` : ''}</td></tr>`).join('') || `<tr><td colspan="5" class="muted">${t.none}</td></tr>`}</tbody></table></div></section>
<section><h2>${t.fit}: <span class="${fit.verdict === 'exceeds' ? 'nogo' : fit.verdict === 'tight' ? 'cond' : fit.verdict === 'fits' ? 'go' : 'muted'}">${esc(fitWord(fit.verdict))}</span></h2><div class="bars">${bar(t.window, fit.windowH, 'w')}${bar(t.plan, fit.plan.totalH)}${fit.rehearsal ? bar(`${t.rehearsal} ${fit.rehearsal.id}`, fit.rehearsal.totalH, 'r') : ''}</div>
${fit.rehearsal?.estimated.length ? `<p class="muted" title="${esc(fit.rehearsal.estimated.join(', '))}">${t.estimated}: ${fit.rehearsal.estimated.length} / ${fit.rehearsal.estimated.length + fit.rehearsal.measured}</p>` : ''}
<h3>${t.path} (${(fit.rehearsal || fit.plan).totalH} ${t.h})</h3><p>${(fit.rehearsal || fit.plan).path.map((id) => esc(arr(c.tasks).find((x) => x.id === id)?.label || id)).join(' → ') || t.none}</p></section></div>
<h2>${t.runbook}</h2>${win.length ? `<div class="tw">${timeline}</div>` : ''}${CUT_PHASES.map(phaseTable).join('')}
<h2>${t.jobs}</h2>${jobsHtml}
<h2>${t.imports}</h2>${impHtml}
<div class="cols"><section><h2>${t.risks}</h2>${risks.length ? `<ul>${risks.map((r) => `<li><b>${esc(r.impact)}</b> ${esc(r.text)}${r.owner ? ` · ${esc(name(r.owner))}` : ''}</li>`).join('')}</ul>` : `<p class="muted">${t.none}</p>`}</section>
<section><h2>${t.decisions}</h2>${decs.length ? `<ul>${decs.map((d) => `<li>${esc(d.text)}${d.owner ? ` · ${esc(name(d.owner))}` : ''}${d.due ? ` · ${esc(d.due)}` : ''}</li>`).join('')}</ul>` : `<p class="muted">${t.none}</p>`}</section></div>
</main><script type="application/json" id="cutover-summary">${JSON.stringify(summary).replace(/</g, '\\u003c')}</script></body></html>`;
  return withResponsive(html);
}

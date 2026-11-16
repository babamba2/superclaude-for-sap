// sc4sap:project-dashboard — the dashboard's Cutover tab (runbook editing). Inlined into the page next to
// project-model / project-render / cutover-model (imports and exports stripped), so the edit mode redraws it from
// the edited model. Editable cells use the dashboard's edit mode: data-f="<scope>|<id>|<field>", scopes
//   c = model.cutover.tasks (by id), g = model.cutover.goNoGo (by id), cw = model.cutover.window, cf = model.cutover.freeze.
// Enum lists (cutPhase, cutStatus, gngStatus) are merged into the page labels here.
// Names are prefixed (cutTab…) — they share one scope with the other inlined files.

import { esc } from './project-render.mjs';
import { arr } from './project-model.mjs';
import { CUT_PHASES, criticalPath, rehearsalFit, tMinus, cutDueOf, cutWindowTimes, goNoGoView, cutActualH, cutDT } from './cutover-model.mjs';

export const CUT_TAB_LABELS = {
  ko: { cutTab: '컷오버', cutPhase: { pre: '사전', freeze: '동결', window: '작업 시간대', post: '오픈 후' }, cutStatus: { planned: '예정', done: '완료', skipped: '건너뜀', failed: '실패' },
    gngStatus: { open: '미정', go: 'Go', nogo: 'No-go', waived: '면제' },
    cutT: { none: '컷오버 런북이 아직 없어요. "컷오버 준비"를 실행하면 프로젝트 유형의 일반 런북이 들어가요 (cutover --seed).', dday: 'D-day', window: '작업 시간대', start: '시작', end: '종료', freeze: '동결', code: '개발', config: '설정',
      fit: '작업 시간대 적합도', plan: '계획', rehearsal: '리허설', fits: '여유 있음', tight: '빠듯함', exceeds: '초과', unknown: '작업 시간대 없음', h: '시간', path: '임계 경로', late: '늦은 작업',
      gng: 'Go / No-go', gngNote: '규칙 판정 중 런북·리허설 규칙만 여기서 계산해요. CTS·UAT·잡 근거는 "컷오버 준비" 실행 결과 페이지에 있어요.', item: '항목', owner: '담당', status: '판정', auto: '규칙',
      when: '일시', id: 'ID', task: '작업', ws: '워크스트림', dur: '시간', deps: '선행 작업', check: '점검', note: '메모', actual: '리허설 실측', add: '작업 추가', dtHint: '날짜 형식이 아니에요 (YYYY-MM-DD HH:MM)' } },
  en: { cutTab: 'Cutover', cutPhase: { pre: 'Before', freeze: 'Freeze', window: 'Window', post: 'After go-live' }, cutStatus: { planned: 'planned', done: 'done', skipped: 'skipped', failed: 'failed' },
    gngStatus: { open: 'open', go: 'Go', nogo: 'No-go', waived: 'waived' },
    cutT: { none: 'No cutover runbook yet. Run "Cutover readiness" to add the generic runbook of the project type (cutover --seed).', dday: 'D-day', window: 'Window', start: 'Start', end: 'End', freeze: 'Freeze', code: 'code', config: 'configuration',
      fit: 'Window fit', plan: 'Plan', rehearsal: 'Rehearsal', fits: 'fits', tight: 'tight', exceeds: 'exceeds', unknown: 'no window', h: 'h', path: 'Critical path', late: 'Late tasks',
      gng: 'Go / no-go', gngNote: 'Only the runbook and rehearsal rules are computed here. CTS, UAT and job evidence are on the page of the "Cutover readiness" run.', item: 'Item', owner: 'Owner', status: 'Decision', auto: 'Rule',
      when: 'When', id: 'ID', task: 'Task', ws: 'Workstream', dur: 'Hours', deps: 'Predecessors', check: 'Check', note: 'Note', actual: 'Rehearsal', add: 'Add task', dtHint: 'not a date and time (YYYY-MM-DD HH:MM)' } },
};
const cutTabEd = (scope, id, field, kind, html) => `<span class="ed" data-f="${scope}|${esc(id)}|${field}" data-k="${kind}">${html}</span>`;
// a window time as stored, or the typed text marked when it is not a date-time (the runbook times then stay empty)
const cutTabDT = (v, T) => (!v ? '—' : cutDT(v) ? esc(cutDT(v).replace('T', ' ')) : `<span class="bad">${esc(v)} — ${esc(T.dtHint)}</span>`);
const cutTabDd = (d) => (d == null ? '—' : d > 0 ? `D-${d}` : d === 0 ? 'D-day' : `D+${-d}`);

/** The tab body; L = the page labels (the enum lists are merged in once). */
export function renderCutoverTab(v, L) {
  const lang = String(v.m.lang || 'ko').slice(0, 2) === 'en' ? 'en' : 'ko';
  const X = CUT_TAB_LABELS[lang];
  if (!L.cutStatus) Object.assign(L, { cutPhase: X.cutPhase, cutStatus: X.cutStatus, gngStatus: X.gngStatus });
  const T = X.cutT, c = v.m.cutover;
  if (!c || !arr(c.tasks).length) return `<p class="muted">${esc(T.none)}</p>`;
  const goLive = v.m.project.goLive;
  let fit = null, err = '';
  try { fit = rehearsalFit(c); } catch (e) { err = e.message; }
  const tm = tMinus(v.today, c, goLive);
  const late = new Set(tm.late.map(x => x.id));
  const sch = fit ? fit.plan.schedule : {};
  const times = fit ? cutWindowTimes(c, sch) : {};
  const cp = new Set(fit ? fit.plan.path : []);
  const rid = fit?.rehearsal?.id || '';
  const name = (id) => v.m.team.find(t => t.id === id)?.name || id || '—';
  const tiles = [
    [T.dday, `<b>${cutTabDd(tm.dDay)}</b> <small>${esc(goLive)}</small>`],
    [`${T.window} · ${T.start}`, cutTabEd('cw', 'window', 'start', 'datetime', cutTabDT(c.window?.start, T))],
    [`${T.window} · ${T.end}`, cutTabEd('cw', 'window', 'end', 'datetime', cutTabDT(c.window?.end, T))],
    [`${T.freeze} · ${T.code}`, cutTabEd('cf', 'freeze', 'code', 'date', esc(c.freeze?.code || '—'))],
    [`${T.freeze} · ${T.config}`, cutTabEd('cf', 'freeze', 'config', 'date', esc(c.freeze?.config || '—'))],
    [T.fit, err ? `<span class="bad">${esc(err)}</span>` : `<b>${esc(T[fit.verdict] || fit.verdict)}</b> <small>${T.plan} ${fit.plan.totalH}${fit.rehearsal ? ` · ${T.rehearsal} ${esc(fit.rehearsal.id)} ${fit.rehearsal.totalH}` : ''} / ${fit.windowH ?? '—'} ${T.h}</small>`],
    [T.late, tm.late.length ? `<b class="bad">${tm.late.length}</b>` : '0'],
  ].map(([k, x]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v"><small>${x}</small></div></div>`).join('');
  const g = goNoGoView(c, [], { cutover: c, fit, jobs: null });
  const gng = `<h3>${esc(T.gng)}</h3><p class="muted"><small>${esc(T.gngNote)}</small></p><div class="tw"><table class="rt"><thead><tr><th>${T.id}</th><th>${T.item}</th><th>${T.auto}</th><th>${T.owner}</th><th>${T.status}</th></tr></thead><tbody>${g.items.map(x =>
    `<tr><td data-l="${T.id}">${esc(x.id)}</td><td data-l="${T.item}">${cutTabEd('g', x.id, 'text', 'text', esc(arr(c.goNoGo).find(y => y.id === x.id)?.text || ''))}</td><td data-l="${T.auto}">${x.met === true ? '✓' : x.met === false ? '✗' : '—'}${x.value != null ? ` <small>${esc(x.value)}</small>` : ''}</td>`
    + `<td data-l="${T.owner}">${cutTabEd('g', x.id, 'owner', 'owner', esc(name(arr(c.goNoGo).find(y => y.id === x.id)?.owner)))}</td><td data-l="${T.status}">${cutTabEd('g', x.id, 'status', 'enum:gngStatus', esc(L.gngStatus[x.human] || x.human))}</td></tr>`).join('')}</tbody></table></div>`;
  const phase = (ph) => {
    const rows = arr(c.tasks).filter(t => t.phase === ph).sort((a, b) => (ph === 'window' ? (sch[a.id]?.es ?? 1e9) - (sch[b.id]?.es ?? 1e9) : cutDueOf(a, c, goLive) < cutDueOf(b, c, goLive) ? -1 : 1));
    if (!rows.length) return '';
    const win = ph === 'window';
    const when = (t) => (win ? (sch[t.id] ? `H+${sch[t.id].es}<br><small>${esc((times[t.id]?.start || '').replace('T', ' '))}</small>` : '—') : `${cutTabDd(-(Number(t.offset) || 0)).replace('D-day', 'D')}<br><small>${esc(cutDueOf(t, c, goLive))}</small>`);
    return `<h3>${esc(L.cutPhase[ph])}</h3><div class="tw"><table class="rt"><thead><tr><th>${T.when}</th><th>${T.id}</th><th>${T.task}</th><th>${T.ws}</th><th>${T.owner}</th>${win ? `<th>${T.dur}</th><th>${T.deps}</th>${rid ? `<th>${T.actual} ${esc(rid)}</th>` : ''}` : ''}<th>${T.check}</th><th>${T.status}</th><th>${T.note}</th></tr></thead><tbody>${rows.map(t =>
      `<tr${late.has(t.id) ? ' class="late"' : ''}><td data-l="${T.when}">${when(t)}</td><td data-l="${T.id}">${esc(t.id)}${cp.has(t.id) ? ' <span class="bad">●</span>' : ''}</td><td data-l="${T.task}">${cutTabEd('c', t.id, 'label', 'text', esc(t.label))}</td>`
      + `<td data-l="${T.ws}">${cutTabEd('c', t.id, 'ws', 'text', esc(t.ws || '—'))}</td><td data-l="${T.owner}">${cutTabEd('c', t.id, 'owner', 'owner', esc(name(t.owner)))}</td>`
      + (win ? `<td data-l="${T.dur}" class="num">${cutTabEd('c', t.id, 'durationH', 'num', esc(t.durationH ?? ''))}</td><td data-l="${T.deps}">${cutTabEd('c', t.id, 'deps', 'list', esc(arr(t.deps).join(' · ') || '—'))}</td>${rid ? `<td data-l="${T.actual}" class="num">${esc(cutActualH(t, rid) ?? '—')}</td>` : ''}` : '')
      + `<td data-l="${T.check}">${cutTabEd('c', t.id, 'check', 'text', esc(t.check || '—'))}</td><td data-l="${T.status}">${cutTabEd('c', t.id, 'status', 'enum:cutStatus', esc(L.cutStatus[t.status] || t.status))}${late.has(t.id) ? ` <span class="bad">${esc(T.late)}</span>` : ''}</td>`
      + `<td data-l="${T.note}">${cutTabEd('c', t.id, 'note', 'text', esc(t.note || ''))}</td></tr>`).join('')}</tbody></table></div>`;
  };
  const path = fit && fit.plan.path.length ? `<p><small>${esc(T.path)} (${fit.plan.totalH} ${T.h}): ${fit.plan.path.map(id => esc(arr(c.tasks).find(t => t.id === id)?.label || id)).join(' → ')}</small></p>` : '';
  return `<div class="tiles">${tiles}</div>${path}${gng}${CUT_PHASES.map(phase).join('')}`;
}

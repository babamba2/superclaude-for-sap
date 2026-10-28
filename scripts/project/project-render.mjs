// sc4sap:project-dashboard — the page's sections as HTML strings. Pure functions on the view model
// (project-model.mjs viewModel): no Node APIs, so build-project-doc.mjs inlines this file into the page
// and the edit mode redraws a section in the browser with the same code that built it.

import { viewModel, days, isActive, arr, STAGES, STAGE_SIDE } from './project-model.mjs';

export const LABELS = {
  ko: {
    tabs: { sum: '요약', kpi: 'KPI', ms: '마일스톤', wbs: 'WBS·간트', sap: 'SAP 실적', team: '팀', hist: '이력' },
    kpiGroup: { schedule: '일정', wricef: 'WRICEF', transport: '이관', team: '인력', hypercare: '안정화', quality: '품질·테스트', data: '데이터', ocm: '교육·변화', cost: '비용', other: '기타' },
    kpiName: { spi: '일정 성과 지수 (SPI)', 'ms-ontime': '마일스톤 적기 달성률', late: '지연 작업', 'wricef-done': 'WRICEF 완료율', 'wait-dev': 'FS → 개발 평균 대기', 'wait-fut': '단위 테스트 → FUT 평균 대기', 'tr-week-F': '주간 설정 릴리스 (최근 4주)', 'tr-week-D': '주간 개발 릴리스 (최근 4주)', 'tr-open': '미릴리스 이관요청', orphans: '담당 공백 작업', 'load-max': '1인당 진행 작업 (최대)', 'dumps-day': 'Go-Live 후 일평균 덤프' },
    kpiCols: { kpi: 'KPI', actual: '실적', target: '목표', dir: '방향', trend: '추이', src: '출처' }, dir: { up: '높을수록 좋음', down: '낮을수록 좋음' }, src: { auto: '자동', manual: '입력' }, kpiAlert: '주의·위험 KPI', noValue: '값 없음',
    rag: { red: '위험', amber: '주의', green: '정상' },
    status: { notstarted: '시작 전', inprogress: '진행 중', done: '완료', blocked: '막힘', onhold: '보류' },
    msStatus: { planned: '예정', passed: '통과', conditional: '조건부', failed: '실패' },
    msKind: { qgate: 'Q-gate', golive: 'Go-Live', cutover: '컷오버', signoff: '승인', other: '기타' },
    type: { phase: '단계', deliverable: '산출물', task: '작업', wricef: 'WRICEF' },
    stage: { req: '요건', fs: 'FS', ts: 'TS', build: '개발', ut: '단위 테스트', fut: 'FUT', sit: 'SIT', done: '완료' },
    side: { F: '모듈', D: '개발' },
    wkind: { R: 'R 리포트', I: 'I 인터페이스', C: 'C 변환(이관)', E: 'E 확장(Enhancement)', F: 'F 양식(Form)', W: 'W 워크플로' },
    role: { pm: 'PM', pmo: 'PMO', lead: '리드', module: '모듈 컨설턴트', dev: '개발 컨설턴트', basis: 'Basis', security: '권한', data: '데이터', test: '테스트', ocm: '교육·변화관리', business: '현업', other: '기타' },
    kpi: { overall: '전체 상태', progress: '진척 (실적 / 계획)', golive: 'Go-Live까지', ms: '마일스톤 통과', wricef: 'WRICEF 완료', handoff: '인계 대기' },
    days: '일', dLeft: '일 남음', dAfter: '일 지남', week: '주',
    curve: '진척 S-curve', planned: '계획', actual: '실적', today: '오늘',
    upcoming: '다가오는 마일스톤', late: '지연 작업', heat: '워크스트림 상태', handoff: '인계 대기열',
    toDev: 'FS 완료 → 개발 대기', toFn: '단위 테스트 완료 → FUT 대기', waiting: '대기',
    cols: { deps: '선행', num: '#', label: '항목', type: '구분', ws: '워크스트림', owner: '담당', fn: '모듈', dev: '개발', start: '시작', finish: '종료',
      base: '기준선', forecast: '예측', actual: '실적', slip: '차이', pct: '진척', status: '상태', rag: 'RAG', stage: '단계', kind: '유형',
      approver: '승인자', criteria: '통과 기준', name: '이름', role: '역할', module: '모듈', sapUser: 'SAP ID', open: '진행', items: '항목', since: '단계 완료일' },
    orphans: '담당자 변경 필요 (떠난 사람의 미완료 작업)', leftOn: '종료', active: '투입 중', left: '종료됨', from: '투입 시작', to: '투입 종료',
    none: '없음', noActuals: 'SAP 실적을 아직 읽지 않았습니다 — refresh 로 읽어 옵니다.',
    tr: '이관요청', trWeek: '주별 릴리스 (모듈 설정 = 커스터마이징 요청 / 개발 = 워크벤치 요청)', trWs: '워크스트림별 이관요청', lastMove: '마지막 릴리스',
    evidence: 'WRICEF 시스템 근거', suggest: '근거상 단계', behind: '근거가 앞섬', objects: '객체', authors: '개발자', inactive: '비활성 객체',
    dumps: 'Go-Live 후 일별 덤프', readAt: '읽은 시각', errors: '읽기 오류', workload: '담당 현황', history: '개정 이력', version: '버전', date: '일자', author: '작성자', note: '변경 내용',
  },
  en: {
    tabs: { sum: 'Summary', kpi: 'KPI', ms: 'Milestones', wbs: 'WBS / Gantt', sap: 'SAP actuals', team: 'Team', hist: 'History' },
    kpiGroup: { schedule: 'Schedule', wricef: 'WRICEF', transport: 'Transports', team: 'Team', hypercare: 'Hypercare', quality: 'Quality / test', data: 'Data', ocm: 'Training / change', cost: 'Cost', other: 'Other' },
    kpiName: { spi: 'Schedule performance index (SPI)', 'ms-ontime': 'Milestones on time', late: 'Late items', 'wricef-done': 'WRICEF complete', 'wait-dev': 'FS → development, avg wait', 'wait-fut': 'Unit test → FUT, avg wait', 'tr-week-F': 'Configuration releases / week (last 4)', 'tr-week-D': 'Development releases / week (last 4)', 'tr-open': 'Open transport requests', orphans: 'Items without an owner', 'load-max': 'Open items per person (max)', 'dumps-day': 'Dumps per day after go-live' },
    kpiCols: { kpi: 'KPI', actual: 'Actual', target: 'Target', dir: 'Direction', trend: 'Trend', src: 'Source' }, dir: { up: 'higher is better', down: 'lower is better' }, src: { auto: 'auto', manual: 'entered' }, kpiAlert: 'KPIs to watch', noValue: 'no value',
    rag: { red: 'At risk', amber: 'Watch', green: 'On track' },
    status: { notstarted: 'Not started', inprogress: 'In progress', done: 'Done', blocked: 'Blocked', onhold: 'On hold' },
    msStatus: { planned: 'Planned', passed: 'Passed', conditional: 'Conditional', failed: 'Failed' },
    msKind: { qgate: 'Q-gate', golive: 'Go-live', cutover: 'Cutover', signoff: 'Sign-off', other: 'Other' },
    type: { phase: 'Phase', deliverable: 'Deliverable', task: 'Task', wricef: 'WRICEF' },
    stage: { req: 'Req.', fs: 'FS', ts: 'TS', build: 'Build', ut: 'Unit test', fut: 'FUT', sit: 'SIT', done: 'Done' },
    side: { F: 'Functional', D: 'Development' },
    wkind: { R: 'R Report', I: 'I Interface', C: 'C Conversion', E: 'E Enhancement', F: 'F Form', W: 'W Workflow' },
    role: { pm: 'PM', pmo: 'PMO', lead: 'Lead', module: 'Module consultant', dev: 'Development consultant', basis: 'Basis', security: 'Security', data: 'Data', test: 'Test', ocm: 'Training / OCM', business: 'Business', other: 'Other' },
    kpi: { overall: 'Overall', progress: 'Progress (actual / plan)', golive: 'To go-live', ms: 'Milestones passed', wricef: 'WRICEF done', handoff: 'Hand-offs waiting' },
    days: 'd', dLeft: 'days left', dAfter: 'days after', week: 'wk',
    curve: 'Progress S-curve', planned: 'Plan', actual: 'Actual', today: 'Today',
    upcoming: 'Upcoming milestones', late: 'Late items', heat: 'Workstream status', handoff: 'Hand-off queue',
    toDev: 'FS done → waiting for development', toFn: 'Unit test done → waiting for FUT', waiting: 'Waiting',
    cols: { deps: 'Pred.', num: '#', label: 'Item', type: 'Type', ws: 'Workstream', owner: 'Owner', fn: 'Functional', dev: 'Development', start: 'Start', finish: 'Finish',
      base: 'Baseline', forecast: 'Forecast', actual: 'Actual', slip: 'Slip', pct: '%', status: 'Status', rag: 'RAG', stage: 'Stage', kind: 'Kind',
      approver: 'Approver', criteria: 'Exit criteria', name: 'Name', role: 'Role', module: 'Module', sapUser: 'SAP ID', open: 'Open', items: 'Items', since: 'Stage done' },
    orphans: 'Needs a new owner (open items of members who left)', leftOn: 'Left', active: 'Active', left: 'Left', from: 'From', to: 'To',
    none: 'None', noActuals: 'SAP actuals not read yet — run refresh.',
    tr: 'Transports', trWeek: 'Released per week (functional = customizing requests / development = workbench requests)', trWs: 'Transports per workstream', lastMove: 'Last release',
    evidence: 'WRICEF evidence in the system', suggest: 'Evidence stage', behind: 'evidence ahead', objects: 'Objects', authors: 'Developers', inactive: 'Inactive objects',
    dumps: 'Dumps per day after go-live', readAt: 'Read at', errors: 'Read errors', workload: 'Workload', history: 'Revision history', version: 'Version', date: 'Date', author: 'Author', note: 'Change',
  },
};
export const labelsFor = (lang) => LABELS[String(lang || '').slice(0, 2)] || LABELS.en;

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chip = (r, L) => `<span class="rag rag-${r}">${esc(L.rag[r])}</span>`;
const bar = (p) => `<span class="pbar"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></span><span class="num">${p}%</span>`;
// edit mode: data-f="<w|m|t>|<id>|<field>" marks an editable value; data-k the field kind (text|date|pct|enum:<list>|owner)
const ed = (scope, id, field, kind, html) => `<span class="ed" data-f="${scope}|${esc(id)}|${field}" data-k="${kind}">${html}</span>`;

function name(v, id) { const t = v.m.team.find(x => x.id === id); return t ? t.name : id || ''; }

/** Summary tab. */
export function renderSummary(v, L) {
  const p = v.m.project, toGo = days(v.today, p.goLive);
  const msDone = v.milestones.filter(x => x.status === 'passed' || x.actual).length;
  const tiles = [
    [L.kpi.overall, chip(v.overall, L)],
    [L.kpi.progress, `<b>${v.progress.actual}%</b> / ${v.progress.planned}%`],
    [L.kpi.golive, toGo >= 0 ? `<b>${toGo}</b> ${L.dLeft}` : `<b>${-toGo}</b> ${L.dAfter}`],
    [L.kpi.ms, `<b>${msDone}</b> / ${v.milestones.length}`],
    [L.kpi.wricef, `<b>${v.wricef.done}</b> / ${v.wricef.total}`],
    [L.kpi.handoff, `<b>${v.handoff.toDev.length + v.handoff.toFn.length}</b> <small>(${L.side.D} ${v.handoff.toDev.length} · ${L.side.F} ${v.handoff.toFn.length})</small>`],
  ].map(([k, val]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${val}</div></div>`).join('');
  const up = v.upcoming.length ? table([L.cols.label, L.cols.kind, L.cols.base, L.cols.forecast, L.cols.slip, L.cols.rag],
    v.upcoming.map(x => [esc(x.label), esc(L.msKind[x.kind]), x.base, x.date, slip(x.slip, L), chip(x.rag, L)])) : `<p class="muted">${L.none}</p>`;
  const late = v.late.length ? table([L.cols.num, L.cols.label, L.cols.ws, L.cols.owner, L.cols.finish, L.cols.pct],
    v.late.slice(0, 12).map(r => [r.num, esc(r.label), esc(r.ws || ''), esc(owners(v, r)), r.finish, `${r.pct}%`])) : `<p class="muted">${L.none}</p>`;
  const ws = Object.entries(v.wsRag).sort();
  const heat = table([L.cols.ws, L.rag.red, L.rag.amber, L.rag.green, `WRICEF ${L.side.F}`, `WRICEF ${L.side.D}`],
    ws.map(([w, c]) => [esc(w), heatCell(c.red, 'red'), heatCell(c.amber, 'amber'), heatCell(c.green, 'green'), v.wricef.byWs[w]?.F ?? '', v.wricef.byWs[w]?.D ?? '']));
  const q = (list) => list.length ? table([L.cols.label, L.cols.ws, L.cols.kind, L.cols.fn, L.cols.dev, L.cols.since, L.waiting],
    list.map(x => [esc(x.label), esc(x.ws || ''), x.kind, esc(name(v, x.fnOwner)), esc(name(v, x.devOwner)), x.since || '', x.waiting == null ? '' : `<b>${x.waiting}</b>${L.days}`])) : `<p class="muted">${L.none}</p>`;
  const orph = v.orphans.length ? `<h3 class="bad">${L.orphans}</h3>${table([L.cols.num, L.cols.label, L.cols.ws, L.cols.owner, L.leftOn],
    v.orphans.map(o => [o.num, esc(o.label), esc(o.ws || ''), `${o.side ? `${esc(L.side[o.side])}: ` : ''}${esc(o.name)}`, esc(o.left)]))}` : '';
  const alert = v.kpis.filter(k => k.rag === 'red' || k.rag === 'amber');
  const kp = alert.length ? `<h3>${L.kpiAlert}</h3><div class="tiles">${alert.slice(0, 8).map(k => `<div class="tile"><div class="k">${esc(k.auto ? L.kpiName[k.id] || k.id : k.label)}</div><div class="v">${kpiVal(k, L)} <small>/ ${esc(k.target ?? '')}${esc(k.unit || '')}</small> ${chip(k.rag, L)}</div></div>`).join('')}</div>` : '';
  return `<div class="tiles">${tiles}</div>${kp}${orph}
<div class="grid2"><section><h3>${L.curve}</h3>${sCurveSvg(v, L)}</section><section><h3>${L.upcoming}</h3>${up}</section></div>
<h3>${L.handoff}</h3><div class="grid2"><section><h4>${L.toDev}</h4>${q(v.handoff.toDev)}</section><section><h4>${L.toFn}</h4>${q(v.handoff.toFn)}</section></div>
<div class="grid2"><section><h3>${L.heat}</h3>${heat}</section><section><h3>${L.late}</h3>${late}</section></div>`;
}
const heatCell = (n, r) => (n ? `<span class="heat heat-${r}">${n}</span>` : '');
const slip = (d, L) => (d > 0 ? `<span class="bad">+${d}${L.days}</span>` : d < 0 ? `${d}${L.days}` : '0');
function owners(v, r) { return [r.owner, r.fnOwner, r.devOwner].filter(Boolean).map(id => name(v, id)).join(' / '); }

// Every cell carries its column name (data-l): on a phone the rows become cards with labelled values.
function table(head, rows, cls = '') {
  return `<div class="tw"><table class="rt ${cls}"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td data-l="${esc(head[i] ?? '')}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** S-curve: planned line per week, actual points from the snapshots, today marker. */
export function sCurveSvg(v, L) {
  const W = 560, H = 220, pl = 34, pb = 26, pts = v.curve;
  if (pts.length < 2) return '';
  const t0 = Date.parse(pts[0].date), t1 = Date.parse(pts.at(-1).date) || t0 + 1;
  const x = (d) => pl + ((Date.parse(d) - t0) / (t1 - t0)) * (W - pl - 8), y = (p) => H - pb - (p / 100) * (H - pb - 28);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.planned).toFixed(1)}`).join('');
  const snaps = arr(v.snapshots).filter(s => s.date >= pts[0].date);
  const act = snaps.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.actual).toFixed(1)}`).join('');
  const grid = [0, 25, 50, 75, 100].map(g => `<line x1="${pl}" x2="${W - 8}" y1="${y(g)}" y2="${y(g)}" class="g"/><text x="${pl - 6}" y="${y(g) + 4}" class="ax" text-anchor="end">${g}</text>`).join('');
  const tx = x(v.today);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L.curve)}">${grid}
<path d="${line}" class="pl"/>${act ? `<path d="${act}" class="ac"/>` : ''}${snaps.map(s => `<circle cx="${x(s.date)}" cy="${y(s.actual)}" r="3.5" class="acd"><title>${s.date} ${s.actual}%</title></circle>`).join('')}
${tx >= pl && tx <= W ? `<line x1="${tx}" x2="${tx}" y1="24" y2="${H - pb}" class="td"/><text x="${tx}" y="${H - 6}" class="ax" text-anchor="middle">${esc(L.today)}</text>` : ''}
<text x="${pl}" y="${H - 6}" class="ax">${pts[0].date}</text><text x="${W - 8}" y="${H - 6}" class="ax" text-anchor="end">${pts.at(-1).date}</text>
<g class="lg"><rect x="${W - 150}" y="10" width="10" height="3" class="pl-k"/><text x="${W - 136}" y="15" class="ax">${esc(L.planned)}</text><rect x="${W - 80}" y="10" width="10" height="3" class="ac-k"/><text x="${W - 66}" y="15" class="ax">${esc(L.actual)}</text></g></svg>`;
}

const kpiVal = (k, L) => (k.actual == null || k.actual === '' ? `<span class="muted">${L.noValue}</span>` : `<b>${esc(k.actual)}</b>${esc(k.unit || '')}`);
const ragOrNone = (r, L) => (r === 'none' ? '' : chip(r, L));
/** Tiny trend line of a KPI's history. */
export function spark(hist) {
  const h = arr(hist).filter(p => Number.isFinite(Number(p.value)));
  if (h.length < 2) return '';
  const vs = h.map(p => Number(p.value)), lo = Math.min(...vs), hi = Math.max(...vs), W = 90, H = 24;
  const pts = vs.map((n, i) => `${((i / (vs.length - 1)) * (W - 4) + 2).toFixed(1)},${(H - 3 - ((n - lo) / ((hi - lo) || 1)) * (H - 6)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><polyline points="${pts}"/></svg>`;
}
/** KPI tab: auto KPIs (computed) and manual KPIs (entered), grouped. */
export function renderKpi(v, L) {
  const groups = [...new Set(v.kpis.map(k => k.group || 'other'))];
  return groups.map(g => `<h3>${esc(L.kpiGroup[g] || g)}</h3>` + table([L.kpiCols.kpi, L.kpiCols.actual, L.kpiCols.target, L.kpiCols.dir, L.cols.rag, L.kpiCols.trend, L.kpiCols.src],
    v.kpis.filter(k => (k.group || 'other') === g).map(k => k.auto
      ? [esc(L.kpiName[k.id] || k.id), kpiVal(k, L), k.target == null ? '' : `${esc(k.target)}${esc(k.unit || '')}`, esc(L.dir[k.dir]), ragOrNone(k.rag, L), spark(k.history), esc(L.src.auto)]
      : [ed('k', k.id, 'label', 'text', esc(k.label)), ed('k', k.id, 'actual', 'num', kpiVal(k, L)), ed('k', k.id, 'target', 'num', `${esc(k.target ?? '')}${esc(k.unit || '')}`),
        ed('k', k.id, 'dir', 'enum:dir', esc(L.dir[k.dir])), ragOrNone(k.rag, L), spark(k.history), esc(L.src.manual)]), 'kpi')).join('');
}

/** Milestones tab: timeline + editable table. */
export function renderMilestones(v, L) {
  const s = v.span.start, e = v.span.end, tot = Math.max(1, days(s, e));
  const pos = (d) => Math.max(0, Math.min(100, (days(s, d) / tot) * 100));
  // A label covers ~20% of the axis (right of its diamond, or left of it near the end): a label that would
  // overlap the last label of a lane goes to the next lane.
  const lanes = [], ms = [...v.milestones].sort((a, b) => (a.date < b.date ? -1 : 1)).map(x => {
    const p = pos(x.date), from = p > 85 ? p - 17 : p - 5, to = p > 85 ? p + 3 : p + 15;
    let k = lanes.findIndex(end => from >= end); if (k < 0) { k = lanes.length; lanes.push(to); } else lanes[k] = to;
    return { x, p, k };
  });
  const tl = `<div class="tl-w"><div class="timeline" style="height:${50 + Math.max(1, lanes.length) * 46}px"><div class="tl-axis"></div><div class="tl-today" style="left:${pos(v.today)}%"></div>${ms.map(({ x, p, k }) =>
    `<div class="tl-ms rag-b-${x.rag}${p > 85 ? ' tl-r' : ''}" style="left:${p}%" title="${esc(x.label)} · ${x.date}"><i></i><span style="top:${22 + k * 46}px">${esc(x.label)}<small>${x.date}</small></span></div>`).join('')}</div></div>`;
  const rows = v.milestones.map(x => [
    ed('m', x.id, 'label', 'text', esc(x.label)), esc(L.msKind[x.kind]), ed('m', x.id, 'base', 'date', x.base),
    ed('m', x.id, 'forecast', 'date', x.forecast || ''), ed('m', x.id, 'actual', 'date', x.actual || ''), slip(x.slip, L),
    ed('m', x.id, 'status', 'enum:msStatus', esc(L.msStatus[x.status] || x.status)), ed('m', x.id, 'approver', 'text', esc(x.approver || '')),
    ed('m', x.id, 'criteria', 'list', esc(arr(x.criteria).join(' · '))), chip(x.rag, L),
  ]);
  return tl + table([L.cols.label, L.cols.kind, L.cols.base, L.cols.forecast, L.cols.actual, L.cols.slip, L.cols.status, L.cols.approver, L.cols.criteria, L.cols.rag], rows, 'ms');
}

/** WBS / Gantt tab: one row per WBS item with a bar on the project span. */
export function renderWbs(v, L) {
  const s = v.span.start, e = v.span.end, tot = Math.max(1, days(s, e) + 1);
  const pos = (d) => (days(s, d) / tot) * 100;
  const months = [];
  for (let d = new Date(`${s.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 10) <= e; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    months.push(`<span style="left:${Math.max(0, pos(iso))}%">${iso.slice(2, 7).replace('-', '.')}</span>`);
  }
  const today = pos(v.today);
  const head = `<tr><th>${L.cols.num}</th><th class="lbl">${L.cols.label}</th><th>${L.cols.ws}</th><th>${L.cols.owner}</th><th>${L.cols.start}</th><th>${L.cols.finish}</th><th>${L.cols.deps}</th><th>${L.cols.pct}</th><th>${L.cols.status}</th><th class="gantt-h"><div class="months">${months.join('')}</div></th></tr>`;
  const body = v.rows.map(r => {
    const leaf = r.leaf && r.type !== 'phase';
    const own = r.type === 'wricef' || r.fnOwner || r.devOwner
      ? `<span class="side side-F">${ed('w', r.id, 'fnOwner', 'owner', esc(name(v, r.fnOwner)))}</span><span class="side side-D">${ed('w', r.id, 'devOwner', 'owner', esc(name(v, r.devOwner)))}</span>`
      : ed('w', r.id, 'owner', 'owner', esc(name(v, r.owner)));
    const pct = r.type === 'wricef'
      ? `${ed('w', r.id, 'wricef.stage', 'enum:stage', `<span class="stage stage-${STAGE_SIDE[STAGES[STAGES.indexOf(r.wricef?.stage || 'req') + 1]] || 'X'}">${esc(L.stage[r.wricef?.stage || 'req'])}</span>`)} <span class="num">${r.pct}%</span>`
      : leaf ? ed('w', r.id, 'pct', 'pct', bar(r.pct)) : bar(r.pct);
    // Leaf bars carry data-drag: in edit mode they move (body) or resize (handles); parents roll up.
    // hl / hr resize, hp drags the % (not on WRICEF: the stage sets it), hc starts a dependency link
    const tipText = `${r.num} ${r.label} · ${r.start} → ${r.finish} · ${r.pct}%${owners(v, r) ? ` · ${owners(v, r)}` : ''}`;
    const g = r.start && r.finish ? `<div class="gb gb-${r.type} rag-b-${r.rag}"${leaf ? ` data-drag="${esc(r.id)}"` : ''} title="${esc(tipText)}" style="left:${pos(r.start)}%;width:${Math.max(0.4, pos(r.finish) - pos(r.start) + 100 / tot)}%"><i style="width:${r.pct}%"></i>${leaf ? `<b class="h hl"></b><b class="h hr"></b>${r.type !== 'wricef' ? `<b class="hp" style="left:${r.pct}%"></b>` : ''}<b class="hc"></b>` : ''}</div>` : '';
    const base = r.baseStart && r.baseFinish && (r.baseStart !== r.start || r.baseFinish !== r.finish)
      ? `<div class="gbase" style="left:${pos(r.baseStart)}%;width:${Math.max(0.4, pos(r.baseFinish) - pos(r.baseStart) + 100 / tot)}%"></div>` : '';
    const kind = r.type === 'wricef' ? `<span class="wk">${esc(r.wricef?.kind || '')}</span>` : '';
    return `<tr class="wr wr-${r.type} d${Math.min(r.depth, 4)}" data-id="${esc(r.id)}" data-depth="${r.depth}">
<td class="num">${r.num}</td><td class="lbl" style="padding-left:${8 + r.depth * 16}px">${r.leaf ? '' : '<button class="tg" aria-label="toggle">▾</button>'}${kind}${ed('w', r.id, 'label', 'text', esc(r.label))}<span class="rowtools"></span></td>
<td>${ed('w', r.id, 'ws', 'ws', esc(r.ws || ''))}</td><td class="own">${own}</td>
<td>${leaf ? ed('w', r.id, 'start', 'date', r.start || '') : r.start || ''}</td><td>${leaf ? ed('w', r.id, 'finish', 'date', r.finish || '') : r.finish || ''}</td>
<td class="dp">${leaf ? ed('w', r.id, 'deps', 'deps', esc(arr(r.deps).map(d => v.byId.get(d)?.num || d).join(', '))) : ''}</td>
<td class="pc">${pct}</td><td>${leaf && r.type !== 'wricef' ? ed('w', r.id, 'status', 'enum:status', `<span class="st st-${r.status}">${esc(L.status[r.status])}</span>`) : `<span class="st st-${r.status}">${esc(L.status[r.status])}</span>`}</td>
<td class="gantt">${base}${g}<div class="gtoday" style="left:${today}%"></div></td></tr>`;
  }).join('');
  const msRow = `<tr class="wr wr-ms"><td></td><td class="lbl">${L.tabs.ms}</td><td colspan="7"></td><td class="gantt">${v.milestones.map(x => `<div class="gms rag-b-${x.rag}"${x.actual ? '' : ` data-ms="${esc(x.id)}"`} style="left:${pos(x.date)}%" title="${esc(x.label)} · ${x.date}"></div>`).join('')}<div class="gtoday" style="left:${today}%"></div></td></tr>`;
  return `<div class="tw wbs-w"><table class="wbs" data-span="${s}" data-days="${tot}"><thead>${head}</thead><tbody>${body}${msRow}</tbody></table></div>`;
}

/** SAP actuals tab. */
export function renderSap(v, L) {
  const a = v.m.actuals;
  if (!a) return `<p class="muted">${L.noActuals}</p>`;
  const tp = arr(a.throughput);
  const max = Math.max(1, ...tp.map(w => w.F + w.D));
  const W = 560, H = 180, bw = Math.max(3, Math.min(18, (W - 40) / Math.max(1, tp.length) - 2));
  const bars = tp.map((w, i) => {
    const x = 34 + i * (bw + 2), hF = (w.F / max) * (H - 40), hD = (w.D / max) * (H - 40);
    return `<rect x="${x}" y="${H - 22 - hF}" width="${bw}" height="${hF}" class="bF"><title>${w.week} ${L.side.F} ${w.F}</title></rect><rect x="${x}" y="${H - 22 - hF - hD}" width="${bw}" height="${hD}" class="bD"><title>${w.week} ${L.side.D} ${w.D}</title></rect>`;
  }).join('');
  const chart = tp.length ? `<svg class="chart" viewBox="0 0 ${W} ${H}">${bars}<text x="34" y="${H - 6}" class="ax">${tp[0].week}</text><text x="${W - 8}" y="${H - 6}" class="ax" text-anchor="end">${tp.at(-1).week}</text><text x="30" y="16" class="ax" text-anchor="end">${max}</text>
<g><rect x="${W - 190}" y="8" width="10" height="10" class="bF"/><text x="${W - 176}" y="17" class="ax">${esc(L.side.F)}</text><rect x="${W - 100}" y="8" width="10" height="10" class="bD"/><text x="${W - 86}" y="17" class="ax">${esc(L.side.D)}</text></g></svg>` : `<p class="muted">${L.none}</p>`;
  const wsList = [...new Set([...v.m.workstreams.map(w => w.code), ...arr(a.transports).map(t => t.ws).filter(Boolean)])];
  const lastRel = (ws, side) => { const d = arr(a.transports).filter(t => t.ws === ws && t.side === side && t.status === 'released').map(t => t.date).sort().at(-1); return d ? `${d} (${days(d, v.today)}${L.days})` : ''; };
  const cnt = (ws, side, st) => arr(a.transports).filter(t => (ws === '—' ? !t.ws : t.ws === ws) && t.side === side && t.status === st).length || '';
  const trWs = table([L.cols.ws, `${L.side.F} ${L.cols.open}`, `${L.side.F} ✓`, `${L.side.D} ${L.cols.open}`, `${L.side.D} ✓`, `${L.lastMove} (${L.side.F})`, `${L.lastMove} (${L.side.D})`],
    [...wsList, '—'].map(w => [esc(w), cnt(w, 'F', 'open'), cnt(w, 'F', 'released'), cnt(w, 'D', 'open'), cnt(w, 'D', 'released'), lastRel(w, 'F'), lastRel(w, 'D')]).filter(r => r.slice(1, 5).some(Boolean)));
  const ev = arr(a.evidence).filter(e => e.objects?.length);
  const evT = ev.length ? table([L.cols.label, L.cols.stage, L.suggest, L.objects, L.inactive, L.tr, L.authors],
    ev.map(e => { const r = v.byId.get(e.id); return [esc(r?.label || e.id), esc(L.stage[r?.wricef?.stage || 'req']), e.suggest ? `${esc(L.stage[e.suggest])}${e.behind ? ` <span class="bad">${L.behind}</span>` : ''}` : '', `${e.found}/${e.objects.length}`, esc(arr(e.inactive).join(', ')), esc(arr(e.trs).join(', ')), esc(arr(e.authors).join(', '))]; })) : `<p class="muted">${L.none}</p>`;
  const dumps = arr(a.dumps);
  const dmax = Math.max(1, ...dumps.map(d => d.count));
  const dChart = dumps.length ? `<svg class="chart" viewBox="0 0 560 140">${dumps.map((d, i) => `<rect x="${34 + i * 14}" y="${118 - (d.count / dmax) * 100}" width="11" height="${(d.count / dmax) * 100}" class="bX"><title>${d.date} ${d.count}</title></rect>`).join('')}<text x="34" y="134" class="ax">${dumps[0].date}</text><text x="30" y="20" class="ax" text-anchor="end">${dmax}</text></svg>` : `<p class="muted">${L.none}</p>`;
  return `<p class="muted">${L.readAt}: ${esc(a.readAt)} · ${esc(a.system)} · ${L.objects}: ${a.objects ?? 0}${arr(a.errors).length ? ` · <span class="bad">${L.errors}: ${esc(a.errors.join(' | '))}</span>` : ''}</p>
<div class="grid2"><section><h3>${L.trWeek}</h3>${chart}</section><section><h3>${L.dumps}</h3>${dChart}</section></div>
<h3>${L.trWs}</h3>${trWs}<h3>${L.evidence}</h3>${evT}
<div class="grid2"><section><h3>${L.authors}</h3>${table([L.authors, L.objects], arr(a.objectsByAuthor).slice(0, 15).map(([k, n]) => [esc(k), n]))}</section>
<section><h3>${L.inactive}</h3>${arr(a.inactive).length ? table([L.objects, L.cols.kind, L.authors], a.inactive.slice(0, 30).map(o => [esc(o.name), esc(o.type), esc(o.user)])) : `<p class="muted">${L.none}</p>`}</section></div>`;
}

/** Team tab: roster (editable) and open items per person and side. */
export function renderTeam(v, L) {
  const load = (id) => {
    const open = v.rows.filter(r => r.leaf && r.status !== 'done');
    const fn = open.filter(r => r.fnOwner === id).length, dev = open.filter(r => r.devOwner === id).length, own = open.filter(r => r.owner === id).length;
    const late = open.filter(r => [r.owner, r.fnOwner, r.devOwner].includes(id) && r.rag === 'red').length;
    return [own || '', fn || '', dev || '', late ? `<span class="bad">${late}</span>` : ''];
  };
  const team = v.m.team.slice().sort((a, b) => Number(!isActive(a, v.today)) - Number(!isActive(b, v.today)));
  return table([L.cols.name, L.cols.role, L.cols.module, L.cols.sapUser, L.from, L.to, L.cols.status, L.cols.owner, L.side.F, L.side.D, L.rag.red],
    team.map(t => [ed('t', t.id, 'name', 'text', esc(t.name)), ed('t', t.id, 'role', 'enum:role', esc(L.role[t.role] || t.role)), ed('t', t.id, 'module', 'text', esc(t.module || '')), ed('t', t.id, 'sapUser', 'text', esc(t.sapUser || '')),
      ed('t', t.id, 'from', 'date', t.from || ''), ed('t', t.id, 'to', 'date', t.to || ''), isActive(t, v.today) ? esc(L.active) : `<span class="muted">${esc(L.left)}</span>`, ...load(t.id)]), 'team');
}

/** History tab. */
export function renderHistory(history, L) {
  return table([L.version, L.date, L.author, L.note], arr(history).slice().reverse().map(h => [esc(h.version), esc(h.date), esc(h.author), esc(h.note)]));
}

/** Every tab's inner HTML for a model. */
export function renderAll(model, { history = [], today } = {}) {
  const v = viewModel(model, today);
  const L = labelsFor(v.m.lang);
  return { v, L, sum: renderSummary(v, L), kpi: renderKpi(v, L), ms: renderMilestones(v, L), wbs: renderWbs(v, L), sap: renderSap(v, L), team: renderTeam(v, L), hist: renderHistory(history, L) };
}

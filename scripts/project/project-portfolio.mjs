// sc4sap:project-dashboard — the portfolio weekly status: every project of one scope on one page (pure: no I/O,
// no SAP, no AI). The CLI (`build-project-doc.mjs portfolio-status`) and the web workbench call the same code.
//
//   portfolioStatus(items, { weekEnd, lang, today, people?, prev?, viewSource?, scope?, at? }) → result
//     items: [{ ref, model, view? }]. `view` is the caller's per-project view, so the page shows the caller's own
//     numbers (the web passes its computeView — effort weighting, gate rows —, the CLI the plugin's viewModel).
//     No view → viewModel(model, today). Fields read from a view (fixed; nothing else is used):
//       overall, progress { actual, planned }, milestones [{ id, label, kind, date, rag, status }],
//       late [{ id, label, finish }], wricef { total, done, byKind { <kind>: { <stage>: n } } },
//       handoff { toDev, toFn } (missing → from rows), rows [{ leaf, status, rag, owner, fnOwner, devOwner,
//       effortPlan?, effortActual? }], m (the normalized model; missing → normalizeModel(model)), today,
//       pm (the project manager's name; missing → the team member named by project.pm).
//     people: people on two or more projects, already computed by the caller ([{ name, sapUser, roles,
//       projects [{ code, open, late, remaining }] }] — the web's sharedPeople); missing → peopleAcross(…, merge).
//     prev: last week's result (its `minimal` rows are enough) → RAG ▲▼, progress change, new and gone projects.
//     weekEnd: any day of the week (→ its Friday); this week = Monday … Sunday around it, next week the 7 days after.
//   peopleAcross(entries, today, { merge })   people on two or more projects, matched by SAP user (else name, else
//     id) — the portfolio page's rule (cmdPortfolio). merge: one row per project (the same person twice in a team).
//   renderPortfolioStatusPage(result, lang)   HTML: A4 landscape in print, light / dark, tables as cards under 600px
//   portfolioXlsx(result, lang)               .xlsx Buffer (summary, projects, milestones, risks, decisions, WRICEF, people)
//
// Overload: more than OVERLOAD.open open items, or more remaining effort (man-days) than the working days of the
// OVERLOAD.weeks weeks after the week end. Both limits are printed on the page.

import { arr, iso, days, addDays, isActive, normalizeModel, viewModel, handoffQueue, STAGES } from './project-model.mjs';
import { weekEndOf } from './project-status.mjs';
import { esc, labelsFor } from './project-render.mjs';
import { withResponsive } from '../lib/responsive.mjs';
import { workbook } from '../uat/uat-xlsx.mjs';

export const OVERLOAD = { open: 20, weeks: 2 };
const RAGS = ['red', 'amber', 'green'];
const RANK = { red: 0, amber: 1, green: 2 };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r1 = (n) => Math.round(n * 10) / 10;
const ragOf = (r) => (RAGS.includes(r) ? r : 'green');

/** This week (Monday … Sunday around the Friday `weekEnd`) and next week. */
export function weekWindows(day) {
  const we = weekEndOf(day);
  return { weekEnd: we, thisWeek: { from: addDays(we, -4), to: addDays(we, 2) }, nextWeek: { from: addDays(we, 3), to: addDays(we, 9) } };
}

/** Monday–Friday days in [from, from + n). */
export function workdays(from, n) {
  let c = 0;
  for (let i = 0; i < n; i++) { const wd = new Date(`${addDays(from, i)}T00:00:00Z`).getUTCDay(); if (wd >= 1 && wd <= 5) c++; }
  return c;
}

/** People on two or more projects (the portfolio page's rule). entries: [{ model?, view }]. */
export function peopleAcross(entries, today, { merge = false } = {}) {
  const people = new Map();
  for (const { model, view: v } of arr(entries)) {
    const m = v?.m || normalizeModel(model);
    const code = m.project?.code || '';
    for (const t of arr(m.team)) {
      if (!isActive(t, today)) continue;
      const key = (t.sapUser || t.name || t.id).toUpperCase();
      const open = arr(v?.rows).filter(r => r.leaf && r.status !== 'done' && [r.owner, r.fnOwner, r.devOwner].includes(t.id));
      const x = people.get(key) || { key, name: t.name, sapUser: t.sapUser || '', roles: [], projects: [] };
      if (!x.roles.includes(t.role)) x.roles.push(t.role);
      const row = { code, open: open.length, late: open.filter(r => r.rag === 'red').length,
        remaining: r1(open.reduce((s, r) => s + Math.max(0, num(r.effortPlan) - num(r.effortActual)), 0)) };
      const same = merge ? x.projects.find(p => p.code === code) : null;
      if (same) { same.open += row.open; same.late += row.late; same.remaining = r1(same.remaining + row.remaining); } else x.projects.push(row);
      people.set(key, x);
    }
  }
  return [...people.values()].filter(x => x.projects.length > 1).sort((a, b) => b.projects.length - a.projects.length);
}

const stagesOf = (w) => {
  const out = Object.fromEntries(STAGES.map(s => [s, 0]));
  for (const k of Object.values(w?.byKind || {})) for (const s of STAGES) out[s] += num(k?.[s]);
  return out;
};

/** The portfolio weekly status of `items` (see the header). */
export function portfolioStatus(items, opts = {}) {
  const today = DATE.test(opts.today || '') ? opts.today : iso(Date.now());
  const win = weekWindows(DATE.test(opts.weekEnd || '') ? opts.weekEnd : today);
  const lang = String(opts.lang || 'ko').slice(0, 2) === 'en' ? 'en' : 'ko';
  const prevRows = arr(opts.prev?.minimal || opts.prev?.projects);
  const hasPrev = !!opts.prev;
  const ents = arr(items).filter(x => x && (x.model || x.view)).map((x) => {
    const v = x.view || viewModel(x.model, today);
    const m = v.m || normalizeModel(x.model);
    return { ref: String(x.ref ?? m.project?.code ?? ''), m, v };
  });
  const usedPrev = new Set();
  const prevOf = (ref, code) => {
    const i = prevRows.findIndex((p, j) => !usedPrev.has(j) && p && String(p.ref ?? '') === ref);
    const k = i >= 0 ? i : prevRows.findIndex((p, j) => !usedPrev.has(j) && p && p.ref == null && p.code === code);
    if (k < 0) return null;
    usedPrev.add(k);
    return prevRows[k];
  };
  const inWin = (d, w) => DATE.test(d || '') && d >= w.from && d <= w.to;

  const projects = [], milestones = [], risks = [], issues = [], decisions = [], wricef = [];
  for (const { ref, m, v } of ents) {
    const p = m.project || {}, code = p.code || ref;
    const who = (id) => (id ? arr(m.team).find(t => t.id === id)?.name || id : '');
    const overall = ragOf(v.overall);
    const progress = { actual: num(v.progress?.actual), planned: num(v.progress?.planned) };
    const late = arr(v.late);
    const handoff = v.handoff || handoffQueue(arr(v.rows), v.today || today);
    const before = prevOf(ref, code);
    const cut = String(m.cutover?.window?.start || '').slice(0, 10);
    projects.push({
      ref, code, name: p.name || '', type: p.type || '', overall,
      pm: String(v.pm || arr(m.team).find((t) => t.id === p.pm)?.name || ''),
      prevOverall: before ? ragOf(before.overall) : null,
      move: !before ? (hasPrev ? 'new' : null) : RANK[overall] > RANK[ragOf(before.overall)] ? 'up' : RANK[overall] < RANK[ragOf(before.overall)] ? 'down' : 'same',
      progress, progressDelta: before?.progress ? { actual: progress.actual - num(before.progress.actual), planned: progress.planned - num(before.progress.planned) } : null,
      late: late.length, lateTop: late.slice(0, 3).map(r => r.label || r.id),
      goLive: DATE.test(p.goLive || '') ? p.goLive : '', goLiveD: DATE.test(p.goLive || '') ? days(today, p.goLive) : null,
      cutoverStart: DATE.test(cut) ? cut : '', cutoverD: DATE.test(cut) ? days(today, cut) : null,
      lastStatusWeek: arr(m.statusLog).map(x => x?.weekEnd).filter(x => DATE.test(x || '')).sort().at(-1) || '',
      wricef: { total: num(v.wricef?.total), done: num(v.wricef?.done) }, handoff: arr(handoff.toDev).length + arr(handoff.toFn).length,
    });
    for (const x of arr(v.milestones)) {
      const week = inWin(x.date, win.thisWeek) ? 'this' : inWin(x.date, win.nextWeek) ? 'next' : '';
      if (week) milestones.push({ week, date: x.date, ref, code, id: x.id || '', label: x.label || '', kind: x.kind || 'other', rag: ragOf(x.rag), status: x.status || 'planned' });
    }
    for (const r of arr(m.risks)) if (r.status !== 'closed' && r.impact === 'H') risks.push({ ref, code, id: r.id || '', text: r.text || '', owner: who(r.owner), due: r.due || '', overdue: DATE.test(r.due || '') && r.due < today });
    for (const x of arr(m.issues)) if (x.status !== 'resolved' && x.status !== 'closed' && x.priority === 'H') issues.push({ ref, code, id: x.id || '', text: x.text || '', owner: who(x.owner), due: x.due || '', overdue: DATE.test(x.due || '') && x.due < today });
    for (const d of arr(m.decisions)) if (d.status !== 'decided') decisions.push({ ref, code, id: d.id || '', text: d.text || '', owner: who(d.owner), due: d.due || '', overdue: DATE.test(d.due || '') && d.due < today });
    if (num(v.wricef?.total)) wricef.push({ ref, code, stages: stagesOf(v.wricef), total: num(v.wricef.total), handoff: arr(handoff.toDev).length + arr(handoff.toFn).length });
  }
  projects.sort((a, b) => RANK[a.overall] - RANK[b.overall] || (a.goLive || '9999') .localeCompare(b.goLive || '9999') || a.code.localeCompare(b.code));
  milestones.sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
  const byDue = (a, b) => (b.overdue - a.overdue) || (a.due || '9999').localeCompare(b.due || '9999') || a.code.localeCompare(b.code);
  risks.sort(byDue); issues.sort(byDue); decisions.sort(byDue);
  const gone = prevRows.filter((_, j) => !usedPrev.has(j)).map(p => ({ ref: p?.ref ?? '', code: p?.code || '', overall: ragOf(p?.overall) }));

  const capacity = workdays(win.nextWeek.from, OVERLOAD.weeks * 7);
  const given = Array.isArray(opts.people);
  const raw = given ? opts.people : peopleAcross(ents.map(e => ({ view: e.v })), today, { merge: true });
  const people = raw.map((x) => {
    const ps = arr(x?.projects).map(p => ({ code: String(p?.code || ''), open: num(p?.open), late: num(p?.late), remaining: r1(num(p?.remaining)) }));
    const open = ps.reduce((s, p) => s + p.open, 0), late = ps.reduce((s, p) => s + p.late, 0), remaining = r1(ps.reduce((s, p) => s + p.remaining, 0));
    const why = [...(open > OVERLOAD.open ? ['open'] : []), ...(remaining > capacity ? ['effort'] : [])];
    return { name: String(x?.name || ''), sapUser: String(x?.sapUser || ''), roles: arr(x?.roles).map(String), projects: ps, open, late, remaining, overloaded: why.length > 0, why };
  });
  if (!given) people.sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  const count = (rows) => Object.fromEntries(RAGS.map(r => [r, rows.filter(x => ragOf(x?.overall) === r).length]));
  const rag = count(projects);
  const summary = {
    projects: projects.length, rag, ragDelta: hasPrev ? Object.fromEntries(RAGS.map(r => [r, rag[r] - count(prevRows)[r]])) : null,
    goLive30: projects.filter(p => p.goLiveD != null && p.goLiveD >= 0 && p.goLiveD <= 30).length,
    gatesThisWeek: milestones.filter(x => x.week === 'this' && x.kind === 'qgate').length,
    risksHigh: risks.length, issuesHigh: issues.length, decisionsOpen: decisions.length, overloaded: people.filter(x => x.overloaded).length,
    newProjects: projects.filter(p => p.move === 'new').length, goneProjects: gone.length,
  };
  summary.sentence = sentence(summary, lang);
  return {
    kind: 'portfolio-status', schema: 1, lang, weekEnd: win.weekEnd, today, windows: { thisWeek: win.thisWeek, nextWeek: win.nextWeek },
    thresholds: { open: OVERLOAD.open, weeks: OVERLOAD.weeks, effortDays: capacity },
    source: { view: opts.viewSource || 'plugin', people: given ? 'caller' : 'computed', scope: String(opts.scope || ''), at: String(opts.at || ''), prevWeek: String(opts.prev?.weekEnd || '') },
    summary, projects, gone, milestones, risks, issues, decisions, wricef, people,
    minimal: projects.map(p => ({ ref: p.ref, code: p.code, overall: p.overall, progress: p.progress })),
  };
}

const signed = (n) => (n > 0 ? `+${n}` : String(n));
/** The summary paragraph from fixed sentence frames (the AI may only rephrase it, never add a figure). */
export function sentence(s, lang = 'ko') {
  const d = s.ragDelta, moved = d ? RAGS.filter(r => d[r]) : [];
  if (lang === 'en') {
    const name = { red: 'red', amber: 'amber', green: 'green' };
    return [`${s.projects} projects this week: ${s.rag.red} red, ${s.rag.amber} amber, ${s.rag.green} green.`,
      d ? (moved.length ? `Against last week: ${moved.map(r => `${name[r]} ${signed(d[r])}`).join(', ')}.` : 'Same as last week.') : '',
      `${s.goLive30} go-lives in the next 30 days and ${s.gatesThisWeek} Q-gates this week.`,
      `${s.risksHigh} open high risks, ${s.decisionsOpen} decisions pending and ${s.overloaded} people overloaded.`].filter(Boolean).join(' ');
  }
  const name = { red: '빨강', amber: '노랑', green: '초록' };
  return [`이번 주 프로젝트 ${s.projects}개 중 빨강 ${s.rag.red}개, 노랑 ${s.rag.amber}개, 초록 ${s.rag.green}개예요.`,
    d ? (moved.length ? `지난주 대비 ${moved.map(r => `${name[r]} ${signed(d[r])}`).join(', ')}예요.` : '지난주와 같아요.') : '',
    `30일 안에 go-live가 ${s.goLive30}개, 이번 주 Q-gate가 ${s.gatesThisWeek}개 있어요.`,
    `열린 H 리스크는 ${s.risksHigh}개, 결정 대기는 ${s.decisionsOpen}개, 과부하 인원은 ${s.overloaded}명이에요.`].filter(Boolean).join(' ');
}

const T = {
  ko: { title: '포트폴리오 주간 현황', week: '주 종료', scope: '범위', tiles: { goLive30: '30일 안 go-live', gates: '이번 주 Q-gate', risks: '열린 H 리스크', issues: '열린 H 이슈', decisions: '결정 대기', overloaded: '과부하 인원' },
    vsPrev: '지난주 대비', noPrev: '지난주 출력이 없어 비교하지 않았어요', first: '새 프로젝트', gone: '지난주에 있었고 이번 주에 없는 프로젝트',
    s1: '프로젝트', s2: '이번 주 / 다음 주 마일스톤과 Q-gate', s3: '열린 H 리스크와 결정 대기', s4: 'WRICEF 단계', s5: '팀 부하', s6: '출처',
    pcols: ['상태', '코드', '프로젝트', '담당', '진척 (실적 / 계획)', '변화', '지연 작업', 'Go-Live', '컷오버', '마지막 현황 주'],
    mcols: ['주', '날짜', '프로젝트', '마일스톤', '종류', 'RAG', '상태'], thisWeek: '이번 주', nextWeek: '다음 주',
    risks: '열린 H 리스크', decisions: '결정 대기', rcols: ['프로젝트', 'ID', '내용', '담당', '기한'], overdue: '기한 지남',
    wcols: ['프로젝트', '합계', '인계 대기'], pplcols: ['이름', 'SAP ID', '역할', '프로젝트 (열린 / 지연 / 남은 MD)', '열린 항목', '지연', '남은 공수 (MD)', '과부하'],
    rule: (o, d, w) => `과부하 기준: 열린 항목 ${o}개 초과, 또는 남은 공수가 다음 ${w}주 근무일 ${d}일 초과예요.`, why: { open: '열린 항목', effort: '공수' },
    src: { at: '생성', scope: '범위', projects: '프로젝트 수', view: '사용한 view', people: '사람 표', prev: '비교한 주' }, view: { web: '웹 (/wbs)', plugin: '플러그인' }, ppl: { caller: '웹 계산', computed: '이 페이지 계산' },
    count: (n) => `프로젝트 ${n}개`, none: '없음', dday: (n) => (n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`) },
  en: { title: 'Portfolio weekly status', week: 'Week ending', scope: 'Scope', tiles: { goLive30: 'Go-lives in 30 days', gates: 'Q-gates this week', risks: 'Open high risks', issues: 'Open high issues', decisions: 'Decisions pending', overloaded: 'People overloaded' },
    vsPrev: 'vs last week', noPrev: 'No output of last week — nothing compared', first: 'new project', gone: 'Projects of last week no longer in the scope',
    s1: 'Projects', s2: 'Milestones and Q-gates this week / next week', s3: 'Open high risks and pending decisions', s4: 'WRICEF stages', s5: 'Team load', s6: 'Source',
    pcols: ['Status', 'Code', 'Project', 'Owner', 'Progress (actual / plan)', 'Change', 'Late items', 'Go-live', 'Cutover', 'Last status week'],
    mcols: ['Week', 'Date', 'Project', 'Milestone', 'Kind', 'RAG', 'Status'], thisWeek: 'This week', nextWeek: 'Next week',
    risks: 'Open high risks', decisions: 'Decisions pending', rcols: ['Project', 'ID', 'Text', 'Owner', 'Due'], overdue: 'overdue',
    wcols: ['Project', 'Total', 'Hand-offs'], pplcols: ['Name', 'SAP user', 'Roles', 'Projects (open / late / MD left)', 'Open items', 'Late', 'Effort left (MD)', 'Overloaded'],
    rule: (o, d, w) => `Overloaded: more than ${o} open items, or more effort left than the ${d} working days of the next ${w} weeks.`, why: { open: 'open items', effort: 'effort' },
    src: { at: 'Generated', scope: 'Scope', projects: 'Projects', view: 'View used', people: 'People table', prev: 'Compared with week' }, view: { web: 'web (/wbs)', plugin: 'plugin' }, ppl: { caller: 'web', computed: 'this page' },
    count: (n) => `${n} projects`, none: 'none', dday: (n) => (n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`) },
};

const STYLE = `:root{--bg:#fff;--fg:#1d2733;--muted:#5a6675;--line:#d3dbe4;--head:#f2f5f8;--red:#c62828;--amber:#b26a00;--green:#2e7d32;--red-bg:#fdecea;--amber-bg:#fff4e0;--green-bg:#e8f5e9;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#11161c;--fg:#e4eaf0;--muted:#98a4b1;--line:#34404c;--head:#19212b;--red:#ef6b6b;--amber:#e0a43a;--green:#5cb85f;--red-bg:#3a1d1d;--amber-bg:#3a2c12;--green-bg:#1b3320;color-scheme:dark}}
:root[data-theme=dark]{--bg:#11161c;--fg:#e4eaf0;--muted:#98a4b1;--line:#34404c;--head:#19212b;--red:#ef6b6b;--amber:#e0a43a;--green:#5cb85f;--red-bg:#3a1d1d;--amber-bg:#3a2c12;--green-bg:#1b3320;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--fg);font:13.5px/1.5 -apple-system,"Segoe UI","Malgun Gothic",sans-serif}main{max-width:1400px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:18px 0 6px;border-bottom:1px solid var(--line);padding-bottom:3px}h3{font-size:13.5px;margin:10px 0 4px}.muted,small{color:var(--muted)}
.rag{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap}.rag-red{background:var(--red-bg);color:var(--red)}.rag-amber{background:var(--amber-bg);color:var(--amber)}.rag-green{background:var(--green-bg);color:var(--green)}
table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid var(--line);padding:4px 7px;text-align:left;vertical-align:top}th{background:var(--head)}.num{text-align:right}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:12px 0}.tile{border:1px solid var(--line);border-radius:8px;padding:6px 9px}.tile b{font-size:18px;display:block}
.up{color:var(--green);font-weight:600}.down,.bad{color:var(--red);font-weight:600}.lead{font-size:14px;margin:10px 0}.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 18px}
@media (max-width:600px){.cols{grid-template-columns:minmax(0,1fr)}table.cards,table.cards tbody,table.cards tr,table.cards td{display:block;width:auto}table.cards thead{display:none}
table.cards tr{border:1px solid var(--line);border-radius:8px;margin:0 0 8px;padding:4px 0}table.cards td{border:0;padding:3px 10px;display:grid;grid-template-columns:minmax(6.5em,38%) minmax(0,1fr);gap:8px;overflow-wrap:anywhere}
table.cards td::before{content:attr(data-label);color:var(--muted);font-size:12px}table.cards td.num{text-align:left}}
@page{size:A4 landscape;margin:10mm}@media print{body{background:#fff;color:#000;font-size:11px}main{max-width:none;padding:0}h2{break-after:avoid}tr,.tile{break-inside:avoid}}`;

/** The page of a portfolioStatus result. `result.summaryText` (an accepted rephrasing) replaces the sentence. */
export function renderPortfolioStatusPage(res, lang = res?.lang || 'ko') {
  const S = T[String(lang).slice(0, 2)] || T.en, L = labelsFor(lang);
  const s = res.summary;
  const chip = (r) => `<span class="rag rag-${esc(ragOf(r))}">${esc(L.rag[ragOf(r)])}</span>`;
  const delta = (n) => (n > 0 ? `<span class="up">▲${n}</span>` : n < 0 ? `<span class="down">▼${-n}</span>` : '±0');
  const ragDelta = (r) => (s.ragDelta ? ` <small>${s.ragDelta[r] > 0 ? '+' : ''}${s.ragDelta[r]}</small>` : '');
  const table = (cols, rows, empty) => `<table class="cards"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
    rows.length ? rows.map(r => `<tr>${r.map((c, i) => `<td data-label="${esc(cols[i])}"${c?.num ? ' class="num"' : ''}><span>${c?.html ?? esc(c)}</span></td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="muted" data-label="">${esc(empty)}</td></tr>`}</tbody></table>`;
  const H = (html) => ({ html }), N = (v) => ({ html: esc(v), num: true });
  const day = (d, n) => (d ? `${esc(d)} <small>${esc(S.dday(n))}</small>` : '');
  const tiles = [
    ...RAGS.map(r => `<div class="tile">${chip(r)}<b>${s.rag[r]}${ragDelta(r)}</b></div>`),
    ...[['goLive30', s.goLive30], ['gates', s.gatesThisWeek], ['risks', s.risksHigh], ['issues', s.issuesHigh ?? 0], ['decisions', s.decisionsOpen], ['overloaded', s.overloaded]]
      .map(([k, n]) => `<div class="tile"><span class="muted">${esc(S.tiles[k])}</span><b>${n}</b></div>`),
  ].join('');
  const proj = res.projects.map(p => [
    H(`${chip(p.overall)}${p.move === 'up' ? ' <span class="up">▲</span>' : p.move === 'down' ? ' <span class="down">▼</span>' : p.move === 'new' ? ` <small>${esc(S.first)}</small>` : ''}`),
    p.code, p.name, p.pm, N(`${p.progress.actual}% / ${p.progress.planned}%`),
    H(p.progressDelta ? `${delta(p.progressDelta.actual)} / ${delta(p.progressDelta.planned)}` : ''),
    H(p.late ? `<b class="bad">${p.late}</b> <small>${esc(p.lateTop.join(', '))}${p.late > p.lateTop.length ? ' …' : ''}</small>` : ''),
    H(day(p.goLive, p.goLiveD)), H(day(p.cutoverStart, p.cutoverD)), p.lastStatusWeek,
  ]);
  const ms = res.milestones.map(x => [x.week === 'this' ? S.thisWeek : S.nextWeek, x.date, x.code, x.label, L.msKind?.[x.kind] || x.kind, H(chip(x.rag)), L.msStatus?.[x.status] || x.status]);
  const rd = (x) => [x.code, x.id, x.text, x.owner, H(`${esc(x.due)}${x.overdue ? ` <span class="bad">${esc(S.overdue)}</span>` : ''}`)];
  const wr = res.wricef.map(w => [w.code, ...STAGES.map(st => N(w.stages[st] || '')), N(w.total), N(w.handoff || '')]);
  const ppl = res.people.map(x => [x.name, x.sapUser, x.roles.map(r => L.role?.[r] || r).join(', '),
    H(x.projects.map(p => `${esc(p.code)} <small>(${p.open} / ${p.late ? `<span class="bad">${p.late}</span>` : 0} / ${p.remaining})</small>`).join(' · ')),
    N(x.open), N(x.late || ''), N(x.remaining), H(x.overloaded ? `<span class="bad">${esc(x.why.map(w => S.why[w]).join(', '))}</span>` : '')]);
  const src = res.source || {};
  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(S.title)} ${esc(res.weekEnd)}</title><style>${STYLE}</style></head><body><main>
<header><h1>${esc(S.title)}</h1><p class="muted">${esc(S.week)} ${esc(res.weekEnd)}${src.scope ? ` · ${esc(S.scope)} ${esc(src.scope)}` : ''} · ${esc(S.count(s.projects))}</p></header>
<p class="lead">${esc(res.summaryText || s.sentence)}</p>${s.ragDelta ? '' : `<p class="muted">${esc(S.noPrev)}</p>`}
<div class="tiles">${tiles}</div>
<h2>1. ${esc(S.s1)}</h2>${table(S.pcols, proj, S.none)}${res.gone.length ? `<p class="muted">${esc(S.gone)}: ${esc(res.gone.map(g => g.code || g.ref).join(', '))}</p>` : ''}
<h2>2. ${esc(S.s2)}</h2><p class="muted">${esc(S.thisWeek)} ${esc(res.windows.thisWeek.from)} ~ ${esc(res.windows.thisWeek.to)} · ${esc(S.nextWeek)} ${esc(res.windows.nextWeek.from)} ~ ${esc(res.windows.nextWeek.to)}</p>${table(S.mcols, ms, S.none)}
<h2>3. ${esc(S.s3)}</h2><div class="cols"><div><h3>${esc(S.risks)} (${s.risksHigh})</h3>${table(S.rcols, res.risks.map(rd), S.none)}</div><div><h3>${esc(S.decisions)} (${s.decisionsOpen})</h3>${table(S.rcols, res.decisions.map(rd), S.none)}</div></div>
<h2>4. ${esc(S.s4)}</h2>${table([S.wcols[0], ...STAGES.map(st => L.stage?.[st] || st), S.wcols[1], S.wcols[2]], wr, S.none)}
<h2>5. ${esc(S.s5)}</h2><p class="muted">${esc(S.rule(res.thresholds.open, res.thresholds.effortDays, res.thresholds.weeks))}</p>${table(S.pplcols, ppl, S.none)}
<h2>6. ${esc(S.s6)}</h2><p class="muted">${[[S.src.at, src.at || res.today], [S.src.scope, src.scope], [S.src.projects, s.projects], [S.src.view, S.view[src.view] || src.view], [S.src.people, S.ppl[src.people] || src.people], [S.src.prev, src.prevWeek]]
    .filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ')}</p>
</main></body></html>`;
  return withResponsive(html);
}

const X = {
  ko: { sheets: ['요약', '프로젝트', '마일스톤', 'H 리스크', '결정 대기', 'WRICEF', '팀 부하'], kv: ['항목', '값'],
    sum: { weekEnd: '주 종료', projects: '프로젝트', red: '빨강', amber: '노랑', green: '초록', goLive30: '30일 안 go-live', gates: '이번 주 Q-gate', risks: '열린 H 리스크', decisions: '결정 대기', overloaded: '과부하 인원', sentence: '요약' },
    proj: ['코드', '프로젝트', '담당', '상태', '지난주', '실적(%)', '계획(%)', '실적 변화', '계획 변화', '지연', '지연 상위', 'Go-Live', 'Go-Live D', '컷오버', '컷오버 D', '마지막 현황 주', 'WRICEF 완료', 'WRICEF 합계', '인계 대기'],
    ms: ['주', '날짜', '프로젝트', 'ID', '마일스톤', '종류', 'RAG', '상태'], rd: ['프로젝트', 'ID', '내용', '담당', '기한', '기한 지남'], wr: ['프로젝트', ...STAGES, '합계', '인계 대기'],
    ppl: ['이름', 'SAP ID', '역할', '프로젝트', '열린 항목', '지연', '남은 공수(MD)', '과부하'] },
  en: { sheets: ['Summary', 'Projects', 'Milestones', 'High risks', 'Decisions', 'WRICEF', 'Team load'], kv: ['Item', 'Value'],
    sum: { weekEnd: 'Week ending', projects: 'Projects', red: 'Red', amber: 'Amber', green: 'Green', goLive30: 'Go-lives in 30 days', gates: 'Q-gates this week', risks: 'Open high risks', decisions: 'Decisions pending', overloaded: 'People overloaded', sentence: 'Summary' },
    proj: ['Code', 'Project', 'Owner', 'Status', 'Last week', 'Actual (%)', 'Plan (%)', 'Actual change', 'Plan change', 'Late', 'Late (top)', 'Go-live', 'Go-live D', 'Cutover', 'Cutover D', 'Last status week', 'WRICEF done', 'WRICEF total', 'Hand-offs'],
    ms: ['Week', 'Date', 'Project', 'ID', 'Milestone', 'Kind', 'RAG', 'Status'], rd: ['Project', 'ID', 'Text', 'Owner', 'Due', 'Overdue'], wr: ['Project', ...STAGES, 'Total', 'Hand-offs'],
    ppl: ['Name', 'SAP user', 'Roles', 'Projects', 'Open items', 'Late', 'Effort left (MD)', 'Overloaded'] },
};

/** The result as an .xlsx workbook (Buffer). */
export function portfolioXlsx(res, lang = res?.lang || 'ko') {
  const K = X[String(lang).slice(0, 2)] || X.en;
  const H = (cells) => cells.map(v => ({ v, s: 1 }));
  const s = res.summary, n = (v) => (v == null ? '' : v);
  const sum = [H(K.kv), [K.sum.weekEnd, res.weekEnd], [K.sum.projects, s.projects], ...RAGS.map(r => [K.sum[r], s.rag[r]]),
    [K.sum.goLive30, s.goLive30], [K.sum.gates, s.gatesThisWeek], [K.sum.risks, s.risksHigh], [K.sum.decisions, s.decisionsOpen], [K.sum.overloaded, s.overloaded], [K.sum.sentence, res.summaryText || s.sentence]];
  const proj = [H(K.proj), ...res.projects.map(p => [p.code, p.name, p.pm, p.overall, n(p.prevOverall), p.progress.actual, p.progress.planned, n(p.progressDelta?.actual), n(p.progressDelta?.planned),
    p.late, p.lateTop.join(', '), p.goLive, n(p.goLiveD), p.cutoverStart, n(p.cutoverD), p.lastStatusWeek, p.wricef.done, p.wricef.total, p.handoff])];
  const ms = [H(K.ms), ...res.milestones.map(x => [x.week, x.date, x.code, x.id, x.label, x.kind, x.rag, x.status])];
  const rd = (list) => [H(K.rd), ...list.map(x => [x.code, x.id, x.text, x.owner, x.due, x.overdue ? 'X' : ''])];
  const wr = [H(K.wr), ...res.wricef.map(w => [w.code, ...STAGES.map(st => w.stages[st] || 0), w.total, w.handoff])];
  const ppl = [H(K.ppl), ...res.people.map(x => [x.name, x.sapUser, x.roles.join(', '), x.projects.map(p => `${p.code} (${p.open}/${p.late}/${p.remaining})`).join(', '), x.open, x.late, x.remaining, x.why.join(', ')])];
  return workbook([
    { name: K.sheets[0], rows: sum, widths: [24, 90] },
    { name: K.sheets[1], rows: proj, widths: [14, 30, 18, 8, 9, 9, 9, 10, 10, 7, 40, 11, 9, 11, 9, 12, 10, 10, 9] },
    { name: K.sheets[2], rows: ms, widths: [7, 11, 14, 10, 34, 10, 8, 11] },
    { name: K.sheets[3], rows: rd(res.risks), widths: [14, 8, 50, 16, 11, 9] },
    { name: K.sheets[4], rows: rd(res.decisions), widths: [14, 8, 50, 16, 11, 9] },
    { name: K.sheets[5], rows: wr, widths: [14, ...STAGES.map(() => 7), 8, 9] },
    { name: K.sheets[6], rows: ppl, widths: [18, 12, 24, 50, 9, 7, 12, 14] },
  ]);
}

// sc4sap:project-dashboard — the cutover plan as a document of its own (the web's /cutover workbench).
//
// The runbook logic is cutover-model.mjs's; this file only wraps it in a document that does not need a project:
//
//   blankCutoverDoc({ id, title, goLive, type, lang, seed })   new document; seed → the generic runbook of cutover-tasks.json
//   cutoverDocFromProject(project, { id, lang })               a /wbs project's go-live, team and runbook (seeded when it has none)
//   normalizeCutoverDoc(doc) / checkCutoverDoc(doc)            defaults / { errors, warnings }
//   applyCutoverOps(doc, ops)                                  AI proposals, item by item → { doc, applied, skipped }
//   cutoverDocPage(doc, { embed, lang, today })                the editable page (doc-kit.mjs)
//   cutoverDocFromPage(html)                                   the model a page carries, or null
//   cutoverDocCsv(doc) / cutoverDocXlsx(doc)                   runbook export
//   cutoverSyncPlan(doc, project) / applyCutoverSync(project, plan)   the button-only write back to a /wbs project
//
// Document: { kind: 'cutover', id, title, lang, goLive, type, team: [{ id, name, role }],
//             cutover: { window, freeze, rehearsals, tasks, goNoGo }, source?: { projectId, code, importedAt } }
//
// What an AI proposal may never set (the people's part): a task's owner, status and actuals; a go / no-go item's
// owner and status; the go-live date and the window. It may write texts, add tasks and items (owner and status
// left empty / planned / open), and propose durations, dependencies and offsets.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUT_PHASES, CUT_STATUS, GNG_STATUS, checkCutover, criticalPath, cutDT, goNoGoView, normalizeCutover, rehearsalFit, seedCutover, tMinus } from './cutover-model.mjs';
import { arr, csvOf, esc, optionsOf, renderDocPage, str, modelFromDocPage } from './doc-kit.mjs';
import { workbook } from '../uat/uat-xlsx.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const template = () => JSON.parse(readFileSync(join(here, 'cutover-tasks.json'), 'utf8'));
export const CUTOVER_DOC_ID = /^[A-Za-z0-9_-]{1,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const langOf = (v) => (v === 'en' ? 'en' : 'ko');

const T = {
  ko: {
    title: '컷오버 계획', goLive: 'Go-Live', type: '프로젝트 유형', wStart: '다운타임 시작', wEnd: '다운타임 종료', code: '코드 동결', config: '설정 동결',
    basics: '기본 정보', tasks: '런북', gng: 'Go / No-Go', team: '팀',
    id: 'ID', phase: '단계', label: '작업', ws: '워크스트림', owner: '담당', dur: '시간(h)', deps: '선행', check: '점검', status: '상태', note: '메모', offset: 'D±일',
    gText: '기준', evidence: '증빙', name: '이름', role: '역할',
    phases: { pre: '사전', freeze: '동결', window: '다운타임', post: '사후' },
    statuses: { planned: '계획', done: '완료', skipped: '건너뜀', failed: '실패' },
    gStatuses: { open: '미정', go: 'Go', nogo: 'No-Go', waived: '면제' },
    edit: '편집', done: '편집 끝', save: '파일 저장', addRow: '행 추가', delRow: '행 삭제', empty: '아직 없어요',
    sum: '요약', dday: (n) => (n > 0 ? `D-${n}` : n === 0 ? 'D-Day' : `D+${-n}`), window: '다운타임', planH: '계획 시간', fit: '여유',
    late: '지연 작업', gngSug: 'Go / No-Go 제안', asOf: '마지막 저장 기준 — 편집한 내용은 다시 열면 반영돼요.',
    fits: { fits: '맞음', tight: '빠듯함', exceeds: '초과' }, sug: { go: 'Go', nogo: 'No-Go', conditional: '조건부', open: '미정' },
  },
  en: {
    title: 'Cutover plan', goLive: 'Go-live', type: 'Project type', wStart: 'Downtime start', wEnd: 'Downtime end', code: 'Code freeze', config: 'Config freeze',
    basics: 'Basics', tasks: 'Runbook', gng: 'Go / No-Go', team: 'Team',
    id: 'ID', phase: 'Phase', label: 'Task', ws: 'Workstream', owner: 'Owner', dur: 'Hours', deps: 'Depends on', check: 'Check', status: 'Status', note: 'Note', offset: 'D± days',
    gText: 'Criterion', evidence: 'Evidence', name: 'Name', role: 'Role',
    phases: { pre: 'Before', freeze: 'Freeze', window: 'Downtime', post: 'After' },
    statuses: { planned: 'Planned', done: 'Done', skipped: 'Skipped', failed: 'Failed' },
    gStatuses: { open: 'Open', go: 'Go', nogo: 'No-go', waived: 'Waived' },
    edit: 'Edit', done: 'Done', save: 'Save file', addRow: 'Add row', delRow: 'Delete row', empty: 'None yet',
    sum: 'Summary', dday: (n) => (n > 0 ? `D-${n}` : n === 0 ? 'D-day' : `D+${-n}`), window: 'Downtime', planH: 'Planned hours', fit: 'Slack',
    late: 'Late tasks', gngSug: 'Go / no-go suggestion', asOf: 'As of the last save — edits show when the page is opened again.',
    fits: { fits: 'Fits', tight: 'Tight', exceeds: 'Exceeds' }, sug: { go: 'Go', nogo: 'No-go', conditional: 'Conditional', open: 'Open' },
  },
};

/** The project-shaped object cutover-model.mjs works on. */
const asProject = (d) => ({ project: { goLive: d.goLive, type: d.type || '' }, lang: d.lang, team: arr(d.team), cutover: d.cutover });

export function normalizeCutoverDoc(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const lang = langOf(d.lang);
  const c = normalizeCutover(d.cutover || { window: {}, freeze: {}, rehearsals: [], tasks: [], goNoGo: [] });
  return {
    kind: 'cutover',
    id: str(d.id, 40),
    title: str(d.title, 200) || T[lang].title,
    lang,
    goLive: DAY.test(String(d.goLive || '')) ? d.goLive : '',
    type: str(d.type, 40),
    team: arr(d.team).map((p) => ({ id: str(p?.id, 40), name: str(p?.name, 120), role: str(p?.role, 120) })),
    cutover: {
      ...c,
      tasks: c.tasks.map((t) => ({ ...t, deps: arr(t.deps).map(String) })),
      goNoGo: c.goNoGo.map((g) => ({ ...g, text: str(g.text ?? g.label, 500) })),
    },
    ...(d.source && typeof d.source === 'object' ? { source: { projectId: str(d.source.projectId, 80), code: str(d.source.code, 40), importedAt: str(d.source.importedAt, 30) } } : {}),
  };
}

export function checkCutoverDoc(doc) {
  const d = normalizeCutoverDoc(doc);
  const { errors, warnings } = checkCutover(d.cutover, d.team);
  if (!CUTOVER_DOC_ID.test(d.id)) errors.unshift('id: letters, digits, _ - only, up to 40');
  if (doc?.goLive && !d.goLive) errors.push('goLive must be YYYY-MM-DD');
  return { errors, warnings };
}

export function blankCutoverDoc({ id, title = '', goLive = '', type = '', lang = 'ko', seed = true } = {}) {
  let d = normalizeCutoverDoc({ id, title, goLive, type, lang });
  if (seed && d.goLive) d = normalizeCutoverDoc({ ...d, cutover: seedCutover(asProject(d), template(), { lang: d.lang }).model.cutover });
  return d;
}

/** A /wbs project (its model) → a new cutover document. The document is independent afterwards. */
export function cutoverDocFromProject(project, { id, projectId = '', lang = '', today = '' } = {}) {
  const p = project?.project || {};
  const l = langOf(lang || project?.lang);
  let d = normalizeCutoverDoc({
    id: id || `${p.code || 'PRJ'}-cutover`.slice(0, 40), title: `${p.name || p.code || ''} ${T[l].title}`.trim(), lang: l,
    goLive: p.goLive || '', type: p.type || '',
    team: arr(project?.team).map((x) => ({ id: x.id, name: x.name, role: x.role })),
    cutover: project?.cutover || null,
    source: { projectId, code: p.code || '', importedAt: today },
  });
  if (!arr(d.cutover.tasks).length && d.goLive) d = normalizeCutoverDoc({ ...d, cutover: seedCutover(asProject(d), template(), { lang: l }).model.cutover });
  return d;
}

// ── AI proposals ────────────────────────────────────────────────────────────────────────────────────────────
/** The fields a proposal may set, per target. Owner, status, actuals, go-live and window never. */
export const CUT_OP_FIELDS = {
  task: ['label', 'note', 'ws', 'durationH', 'deps', 'check', 'offset', 'phase'],
  gng: ['text', 'evidence'],
  doc: ['title'],
};

/**
 * ops: { op: 'set-task', id, field, value } | { op: 'add-task', task } | { op: 'set-gng', id, field, value }
 *      | { op: 'add-gng', item } | { op: 'set', field, value }
 * Each is applied or skipped with a reason; nothing an op names outside the lists above is written.
 */
export function applyCutoverOps(doc0, ops) {
  const doc = normalizeCutoverDoc(JSON.parse(JSON.stringify(doc0 || {})));
  const applied = [], skipped = [];
  const value = (field, v) => {
    if (field === 'durationH' || field === 'offset') { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
    if (field === 'deps') return (Array.isArray(v) ? v : String(v ?? '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 30);
    if (field === 'phase') return CUT_PHASES.includes(v) ? v : undefined;
    return str(v, 1000);
  };
  const nextId = (rows, prefix) => `${prefix}${String(rows.reduce((n, r) => Math.max(n, Number(/(\d+)$/.exec(r.id || '')?.[1] || 0)), 0) + 1).padStart(2, '0')}`;
  for (const op of arr(ops)) {
    const why = (reason) => skipped.push({ op, reason });
    if (!op || typeof op !== 'object') { why('not an object'); continue; }
    if (op.op === 'set-task' || op.op === 'set-gng') {
      const list = op.op === 'set-task' ? doc.cutover.tasks : doc.cutover.goNoGo;
      const allowed = op.op === 'set-task' ? CUT_OP_FIELDS.task : CUT_OP_FIELDS.gng;
      const row = list.find((r) => r.id === op.id);
      if (!row) { why(`no ${op.op === 'set-task' ? 'task' : 'go/no-go item'} ${String(op.id).slice(0, 40)}`); continue; }
      if (!allowed.includes(op.field)) { why(`${String(op.field).slice(0, 40)} is not a field a proposal may set`); continue; }
      const v = value(op.field, op.value);
      if (v === undefined) { why(`bad value for ${op.field}`); continue; }
      row[op.field] = v; applied.push(op);
    } else if (op.op === 'add-task') {
      const t = op.task || {};
      const phase = CUT_PHASES.includes(t.phase) ? t.phase : 'pre';
      const row = { id: nextId(doc.cutover.tasks, 'CT.AI.'), phase, label: str(t.label, 500), ws: str(t.ws, 60), owner: '', status: 'planned', deps: value('deps', t.deps), note: str(t.note, 1000) };
      if (!row.label) { why('a task needs a label'); continue; }
      if (phase === 'window') row.durationH = value('durationH', t.durationH) ?? 0; else row.offset = value('offset', t.offset) ?? 0;
      doc.cutover.tasks.push(row); applied.push({ ...op, id: row.id });
    } else if (op.op === 'add-gng') {
      const g = op.item || {};
      const row = { id: nextId(doc.cutover.goNoGo, 'GNG.AI.'), text: str(g.text, 500), owner: '', status: 'open', evidence: str(g.evidence, 500) };
      if (!row.text) { why('an item needs a text'); continue; }
      doc.cutover.goNoGo.push(row); applied.push({ ...op, id: row.id });
    } else if (op.op === 'set') {
      if (!CUT_OP_FIELDS.doc.includes(op.field)) { why(`${String(op.field).slice(0, 40)} is not a field a proposal may set`); continue; }
      doc[op.field] = str(op.value, 200); applied.push(op);
    } else why(`unknown op ${String(op.op).slice(0, 30)}`);
  }
  return { doc: normalizeCutoverDoc(doc), applied, skipped };
}

// ── page ────────────────────────────────────────────────────────────────────────────────────────────────────
function summaryHtml(d, L, today) {
  const c = d.cutover;
  // Each figure on its own: a runbook being typed (a loop in the dependencies, a half-typed time) shows "—", not an error page.
  const safe = (f) => { try { return f(); } catch { return null; } };
  const tm = d.goLive && today ? safe(() => tMinus(today, c, d.goLive)) : null;
  const fit = safe(() => rehearsalFit(c));
  const cp = safe(() => criticalPath(arr(c.tasks).filter((t) => t.phase === 'window')));
  const gv = safe(() => goNoGoView(c, [], { cutover: c, fit }));
  const k = (label, value) => `<div class="kpi"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const win = c.window?.start && c.window?.end ? `${String(c.window.start).replace('T', ' ')} → ${String(c.window.end).replace('T', ' ')}` : '—';
  const late = arr(tm?.late);
  return `<section class="summary"><h2>${esc(L.sum)}</h2><div class="kpis">
${k(L.goLive, d.goLive ? `${d.goLive}${tm?.dDay != null ? ` · ${L.dday(tm.dDay)}` : ''}` : '—')}
${k(L.window, win)}
${k(L.planH, cp?.totalH != null ? `${cp.totalH} h` : '—')}
${k(L.fit, L.fits[fit?.plan?.verdict] || '—')}
${k(L.gngSug, L.sug[gv?.suggest] || '—')}
${k(L.late, String(late.length))}</div>
${late.length ? `<ul>${late.slice(0, 8).map((t) => `<li>${esc(t.id)} ${esc(t.label || '')}</li>`).join('')}</ul>` : ''}
<div class="note">${esc(L.asOf)}</div></section>`;
}

export function cutoverDocSchema(lang) {
  const L = T[langOf(lang)];
  return {
    labels: { edit: L.edit, done: L.done, save: L.save, addRow: L.addRow, delRow: L.delRow, empty: L.empty },
    sections: [
      { type: 'fields', title: L.basics, fields: [
        { path: 'title', label: L.title, type: 'text', wide: true },
        { path: 'goLive', label: L.goLive, type: 'date' },
        { path: 'cutover.window.start', label: L.wStart, type: 'datetime' },
        { path: 'cutover.window.end', label: L.wEnd, type: 'datetime' },
        { path: 'cutover.freeze.code', label: L.code, type: 'date' },
        { path: 'cutover.freeze.config', label: L.config, type: 'date' },
      ] },
      { type: 'table', title: L.tasks, path: 'cutover.tasks', idPrefix: 'CT.U.', columns: [
        { key: 'id', label: L.id, type: 'text' },
        { key: 'phase', label: L.phase, type: 'select', options: optionsOf(CUT_PHASES, L.phases), dflt: 'pre' },
        { key: 'label', label: L.label, type: 'textarea', wide: true },
        { key: 'ws', label: L.ws, type: 'text' },
        { key: 'owner', label: L.owner, type: 'text' },
        { key: 'offset', label: L.offset, type: 'number' },
        { key: 'durationH', label: L.dur, type: 'number' },
        { key: 'deps', label: L.deps, type: 'list' },
        { key: 'status', label: L.status, type: 'select', options: optionsOf(CUT_STATUS, L.statuses), dflt: 'planned' },
        { key: 'note', label: L.note, type: 'textarea' },
      ] },
      { type: 'table', title: L.gng, path: 'cutover.goNoGo', idPrefix: 'GNG.U.', columns: [
        { key: 'id', label: L.id, type: 'text' },
        { key: 'text', label: L.gText, type: 'textarea', wide: true },
        { key: 'owner', label: L.owner, type: 'text' },
        { key: 'status', label: L.status, type: 'select', options: optionsOf(GNG_STATUS, L.gStatuses), dflt: 'open' },
        { key: 'evidence', label: L.evidence, type: 'textarea' },
      ] },
      { type: 'table', title: L.team, path: 'team', columns: [
        { key: 'id', label: L.id, type: 'text' }, { key: 'name', label: L.name, type: 'text' }, { key: 'role', label: L.role, type: 'text' },
      ] },
    ],
  };
}

export function cutoverDocPage(doc, { embed = false, lang = '', today = '' } = {}) {
  const d = normalizeCutoverDoc(doc);
  const l = langOf(lang || d.lang);
  return renderDocPage({
    kind: 'cutover', lang: l, title: d.title, model: d, schema: cutoverDocSchema(l),
    subtitle: d.source?.code ? `${d.source.code}${d.source.importedAt ? ` · ${d.source.importedAt}` : ''}` : '',
    summaryHtml: summaryHtml(d, T[l], today), fileName: `${d.id || 'cutover'}-cutover.html`, embed,
  });
}

export function cutoverDocFromPage(html) {
  const got = modelFromDocPage(html, 'cutover');
  return got ? { model: normalizeCutoverDoc(got.model) } : null;
}

// ── exports ─────────────────────────────────────────────────────────────────────────────────────────────────
const taskColumns = (L) => [
  { key: 'id', label: L.id }, { key: 'phase', label: L.phase }, { key: 'label', label: L.label }, { key: 'ws', label: L.ws }, { key: 'owner', label: L.owner },
  { key: 'offset', label: L.offset }, { key: 'durationH', label: L.dur }, { key: 'deps', label: L.deps }, { key: 'status', label: L.status }, { key: 'note', label: L.note },
];
const gngColumns = (L) => [{ key: 'id', label: L.id }, { key: 'text', label: L.gText }, { key: 'owner', label: L.owner }, { key: 'status', label: L.status }, { key: 'evidence', label: L.evidence }];

export function cutoverDocCsv(doc) {
  const d = normalizeCutoverDoc(doc);
  return csvOf(d.cutover.tasks, taskColumns(T[d.lang]));
}

export function cutoverDocXlsx(doc) {
  const d = normalizeCutoverDoc(doc);
  const L = T[d.lang];
  const rows = (list, cols) => [cols.map((c) => c.label), ...list.map((r) => cols.map((c) => (Array.isArray(r[c.key]) ? r[c.key].join(', ') : r[c.key] ?? '')))];
  return workbook([
    { name: L.tasks, rows: rows(d.cutover.tasks, taskColumns(L)) },
    { name: L.gng, rows: rows(d.cutover.goNoGo, gngColumns(L)) },
  ]);
}

// ── write back to a /wbs project (button only, after a preview) ────────────────────────────────────────────
/**
 * What writing this document into the project would change: per task / item present in both (by id) the fields
 * that differ among status, owner, actual (tasks) and status, owner, evidence (items); tasks and items only in the
 * document (added); the window and freeze when they differ. Nothing in the project that the document lacks is removed.
 */
export function cutoverSyncPlan(doc, project) {
  const d = normalizeCutoverDoc(doc);
  const pc = normalizeCutover(project?.cutover || { tasks: [], goNoGo: [], window: {}, freeze: {} });
  const diff = (a, b, fields) => fields.filter((f) => JSON.stringify(a?.[f] ?? null) !== JSON.stringify(b?.[f] ?? null)).map((f) => ({ field: f, from: b?.[f] ?? null, to: a?.[f] ?? null }));
  const tasks = [], items = [], added = { tasks: [], goNoGo: [] };
  for (const t of d.cutover.tasks) {
    const p = pc.tasks.find((x) => x.id === t.id);
    if (!p) { added.tasks.push(t); continue; }
    const ch = diff(t, p, ['status', 'owner', 'actual']);
    if (ch.length) tasks.push({ id: t.id, changes: ch });
  }
  for (const g of d.cutover.goNoGo) {
    const p = pc.goNoGo.find((x) => x.id === g.id);
    if (!p) { added.goNoGo.push(g); continue; }
    const ch = diff(g, p, ['status', 'owner', 'evidence']);
    if (ch.length) items.push({ id: g.id, changes: ch });
  }
  const window = diff(d.cutover.window, pc.window, ['start', 'end']);
  const freeze = diff(d.cutover.freeze, pc.freeze, ['code', 'config']);
  const empty = !tasks.length && !items.length && !added.tasks.length && !added.goNoGo.length && !window.length && !freeze.length;
  return { tasks, goNoGo: items, added, window, freeze, empty };
}

/** The project model with the plan written in. Applying the same plan twice changes nothing more. */
export function applyCutoverSync(project, plan) {
  const m = JSON.parse(JSON.stringify(project || {}));
  const c = normalizeCutover(m.cutover || { tasks: [], goNoGo: [], window: {}, freeze: {}, rehearsals: [] });
  for (const x of arr(plan?.tasks)) { const t = c.tasks.find((r) => r.id === x.id); if (t) for (const ch of arr(x.changes)) t[ch.field] = ch.to; }
  for (const x of arr(plan?.goNoGo)) { const g = c.goNoGo.find((r) => r.id === x.id); if (g) for (const ch of arr(x.changes)) g[ch.field] = ch.to; }
  for (const t of arr(plan?.added?.tasks)) if (!c.tasks.some((r) => r.id === t.id)) c.tasks.push(t);
  for (const g of arr(plan?.added?.goNoGo)) if (!c.goNoGo.some((r) => r.id === g.id)) c.goNoGo.push(g);
  for (const ch of arr(plan?.window)) { if (ch.to && cutDT(ch.to)) c.window[ch.field] = cutDT(ch.to); }
  for (const ch of arr(plan?.freeze)) c.freeze[ch.field] = ch.to;
  m.cutover = c;
  return m;
}

// sc4sap:project-dashboard — meeting minutes and action items as a document of their own (the web's /meetings).
//
//   blankMeetingDoc({ id, title, date, forum, lang })        new minutes
//   carryOverMeeting(prev, { id, date, title, today })       new minutes from earlier ones: forum, attendees, and
//                                                            every action not done (same origin, so /wbs stays linked)
//   normalizeMeetingDoc(doc) / checkMeetingDoc(doc)
//   openActions(doc, today)                                  the action board's rows: open / in progress, overdue, due this week
//   applyMeetingOps(doc, ops)                                AI proposals, item by item → { doc, applied, skipped }
//   meetingDocPage(doc, { embed, lang, today })              the editable page (doc-kit.mjs)
//   meetingDocFromPage(html)
//   meetingActionsCsv(doc) / meetingDocXlsx(doc)
//   meetingSyncPlan(doc, project) / applyMeetingSync(project, plan)   the button-only write back: actions → /wbs tasks,
//                                                            decisions → the decision log (no issue log in /wbs yet)
//
// Document: { kind: 'meeting', id, title, lang, date, forum, place, attendees: [{ name, role, org }],
//   agenda: [{ no, title, summary }], decisions: [{ id, text, decidedBy, basis, agendaNo }],
//   actions: [{ id, origin, text, owner, suggestedOwner, due, status: open|inprogress|done, module, wbsId, agendaNo, carriedFrom }],
//   notes, transcript, liveSummary, source? }
//   `origin` is "<doc id>:<action id>" where the action was first written; carry-over keeps it. The /wbs task of an
//   action is `MTG.<origin>`, so sending the same action again — from these minutes or later ones — updates it.
//   `transcript` is text the browser recognised (no audio is ever stored); `liveSummary` the rolling summary the
//   web keeps while the meeting runs (written by its summary step, never by an AI proposal).
//
// What an AI proposal may never set: an action's owner or status, a decision's decided-by, the date, the attendees.
// It may write texts, add decisions and actions (owner empty, status open) and put a name from the attendees into
// `suggestedOwner`, which the page shows as a suggestion only.

import { acceptedFlags, arr, csvOf, esc, optionsOf, renderDocPage, str, modelFromDocPage, syncDiff } from './doc-kit.mjs';
import { workbook } from '../uat/uat-xlsx.mjs';

export const MEETING_DOC_ID = /^[A-Za-z0-9_-]{1,40}$/;
export const ACTION_STATUS = ['open', 'inprogress', 'done'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const langOf = (v) => (v === 'en' ? 'en' : 'ko');
const day = (v) => (DAY.test(String(v || '')) ? String(v) : '');
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
const rows = (list, f) => arr(list).map((x) => f(x && typeof x === 'object' ? x : {}));
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

const T = {
  ko: {
    title: '회의록', basics: '회의 정보', date: '일자', forum: '회의체', place: '장소', attendees: '참석자', agenda: '안건', decisions: '결정 사항',
    actions: '할 일', notes: '기타 메모', transcript: '녹취 텍스트', liveSummary: '실시간 요약', name: '이름', role: '역할', org: '소속', no: '번호', aTitle: '안건', summary: '요약',
    id: 'ID', text: '내용', decidedBy: '결정자', basis: '근거', agendaNo: '안건 번호', owner: '담당', minutes: '회의록', suggested: 'AI 제안 담당', due: '기한', status: '상태',
    module: '모듈', wbsId: 'WBS', carried: '이월', statuses: { open: '열림', inprogress: '진행 중', done: '완료' },
    sum: '할 일 현황', open: '아직 끝나지 않은 할 일', overdue: '기한 지남', week: '이번 주 기한', carriedN: '이전 회의에서 이월',
    edit: '편집', done: '편집 끝', save: '파일 저장', addRow: '행 추가', delRow: '행 삭제', empty: '아직 없어요',
    asOf: '마지막 저장 기준 — 편집한 내용은 다시 열면 반영돼요.',
  },
  en: {
    title: 'Meeting minutes', basics: 'Meeting', date: 'Date', forum: 'Forum', place: 'Place', attendees: 'Attendees', agenda: 'Agenda', decisions: 'Decisions',
    actions: 'Action items', notes: 'Other notes', transcript: 'Transcript', liveSummary: 'Live summary', name: 'Name', role: 'Role', org: 'Organisation', no: 'No', aTitle: 'Item', summary: 'Summary',
    id: 'ID', text: 'Text', decidedBy: 'Decided by', basis: 'Basis', agendaNo: 'Agenda no', owner: 'Owner', minutes: 'Minutes', suggested: 'AI suggested owner', due: 'Due', status: 'Status',
    module: 'Module', wbsId: 'WBS', carried: 'Carried', statuses: { open: 'Open', inprogress: 'In progress', done: 'Done' },
    sum: 'Actions', open: 'Open or in progress', overdue: 'Overdue', week: 'Due this week', carriedN: 'Carried from earlier minutes',
    edit: 'Edit', done: 'Done', save: 'Save file', addRow: 'Add row', delRow: 'Delete row', empty: 'None yet',
    asOf: 'As of the last save — edits show when the page is opened again.',
  },
};

export function normalizeMeetingDoc(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const lang = langOf(d.lang);
  const id = str(d.id, 40);
  return {
    kind: 'meeting',
    id,
    title: str(d.title, 200) || T[lang].title,
    lang,
    date: day(d.date),
    forum: str(d.forum, 120),
    place: str(d.place, 120),
    attendees: rows(d.attendees, (a) => ({ name: str(a.name, 80), role: str(a.role, 80), org: str(a.org, 80) })),
    agenda: rows(d.agenda, (a) => ({ no: str(a.no, 10), title: str(a.title, 300), summary: str(a.summary, 4000) })),
    decisions: rows(d.decisions, (x) => ({ id: str(x.id, 40), text: str(x.text, 2000), decidedBy: str(x.decidedBy, 120), basis: str(x.basis, 2000), agendaNo: str(x.agendaNo, 10) })),
    actions: rows(d.actions, (x) => {
      const aid = str(x.id, 40);
      return {
        id: aid,
        origin: str(x.origin, 90) || (id && aid ? `${id}:${aid}` : ''),
        text: str(x.text, 2000),
        owner: str(x.owner, 80),
        suggestedOwner: str(x.suggestedOwner, 80),
        due: day(x.due),
        status: pick(x.status, ACTION_STATUS, 'open'),
        module: str(x.module, 20),
        wbsId: str(x.wbsId, 60),
        agendaNo: str(x.agendaNo, 10),
        carriedFrom: str(x.carriedFrom, 90),
      };
    }),
    notes: str(d.notes, 20000),
    transcript: str(d.transcript, 400000),
    liveSummary: str(d.liveSummary, 8000),
    ...(d.source && typeof d.source === 'object' ? { source: { projectId: str(d.source.projectId, 80), code: str(d.source.code, 40) } } : {}),
  };
}

export function checkMeetingDoc(doc) {
  const d = normalizeMeetingDoc(doc);
  const errors = [], warnings = [];
  if (!MEETING_DOC_ID.test(d.id)) errors.push('id: letters, digits, _ - only, up to 40');
  if (doc?.date && !d.date) errors.push('date must be YYYY-MM-DD');
  const seen = new Set();
  for (const a of d.actions) {
    if (!a.id) errors.push(`action without id ("${a.text.slice(0, 30)}")`);
    else if (seen.has(a.id)) errors.push(`duplicate action id ${a.id}`);
    seen.add(a.id);
    if (a.status !== 'done' && !a.owner) warnings.push(`action ${a.id}: no owner`);
    if (a.status !== 'done' && !a.due) warnings.push(`action ${a.id}: no due date`);
  }
  const ds = new Set();
  for (const x of d.decisions) { if (x.id && ds.has(x.id)) errors.push(`duplicate decision id ${x.id}`); ds.add(x.id); }
  return { errors, warnings };
}

export function blankMeetingDoc({ id, title = '', date = '', forum = '', lang = 'ko' } = {}) {
  return normalizeMeetingDoc({ id, title, date, forum, lang });
}

const nextId = (list, prefix) => `${prefix}${String(list.reduce((n, r) => Math.max(n, Number(/(\d+)$/.exec(r.id || '')?.[1] || 0)), 0) + 1).padStart(2, '0')}`;

/** New minutes from earlier ones: the forum, the attendees and every action not done, re-numbered here, origin kept. */
export function carryOverMeeting(prev0, { id, date = '', title = '' } = {}) {
  const prev = normalizeMeetingDoc(prev0);
  const open = prev.actions.filter((a) => a.status !== 'done');
  const actions = [];
  for (const a of open) actions.push({ ...a, id: nextId(actions, 'A'), carriedFrom: `${prev.id}:${a.id}`, origin: a.origin || `${prev.id}:${a.id}` });
  return normalizeMeetingDoc({ id, title: title || prev.title, date, forum: prev.forum, place: prev.place, lang: prev.lang, attendees: prev.attendees, actions, ...(prev.source ? { source: prev.source } : {}) });
}

/** The action board's rows of one minutes: actions not done, with overdue / due this week against `today`. */
export function openActions(doc, today) {
  const d = normalizeMeetingDoc(doc);
  const week = today ? addDays(today, 7) : '';
  return d.actions.filter((a) => a.status !== 'done').map((a) => ({
    id: a.id, origin: a.origin, text: a.text.slice(0, 200), owner: a.owner, suggestedOwner: a.suggestedOwner, due: a.due, status: a.status, module: a.module,
    overdue: !!(today && a.due && a.due < today), dueThisWeek: !!(today && a.due && a.due >= today && a.due <= week),
  }));
}

// ── AI proposals ────────────────────────────────────────────────────────────────────────────────────────────
/** Per list, the fields a proposal may set; never an owner, a status, decided-by, the date or the attendees. */
export const MEETING_OP_FIELDS = {
  agenda: ['title', 'summary'],
  decisions: ['text', 'basis', 'agendaNo'],
  actions: ['text', 'due', 'suggestedOwner', 'module', 'agendaNo'],
  doc: ['title', 'notes'],
};
const ADD_FIELDS = { agenda: ['no', 'title', 'summary'], decisions: ['text', 'basis', 'agendaNo'], actions: ['text', 'due', 'suggestedOwner', 'module', 'agendaNo'] };

/**
 * ops: { op: 'set', list, index | id, field, value } (list 'doc' takes no index) | { op: 'add', list, row }
 * A suggested owner must be one of the attendees' names; anything else is skipped.
 */
export function applyMeetingOps(doc0, ops) {
  const doc = normalizeMeetingDoc(JSON.parse(JSON.stringify(doc0 || {})));
  const applied = [], skipped = [];
  const names = new Set(doc.attendees.map((a) => a.name).filter(Boolean));
  const value = (field, v) => {
    if (field === 'due') return DAY.test(String(v)) ? String(v) : undefined;
    if (field === 'suggestedOwner') { const s = str(v, 80).trim(); return s === '' || names.has(s) ? s : undefined; }
    return str(v, field === 'notes' || field === 'summary' ? 4000 : 2000);
  };
  for (const op of arr(ops)) {
    const why = (reason) => skipped.push({ op, reason });
    if (!op || typeof op !== 'object') { why('not an object'); continue; }
    const allowed = typeof op.list === 'string' && Object.hasOwn(MEETING_OP_FIELDS, op.list) ? MEETING_OP_FIELDS[op.list] : null;
    if (!allowed) { why(`unknown list ${String(op.list).slice(0, 30)}`); continue; }
    if (op.op === 'set') {
      if (typeof op.field !== 'string' || !allowed.includes(op.field)) { why(`${String(op.field).slice(0, 40)} is not a field a proposal may set`); continue; }
      const v = value(op.field, op.value);
      if (v === undefined) { why(`bad value for ${op.field}`); continue; }
      if (op.list === 'doc') { doc[op.field] = v; applied.push(op); continue; }
      const list = doc[op.list];
      const row = op.id != null ? list.find((r) => r.id === op.id) : list[Number(op.index)];
      if (!row) { why(`no row ${op.id ?? op.index} in ${op.list}`); continue; }
      row[op.field] = v; applied.push(op);
    } else if (op.op === 'add') {
      const fields = Object.hasOwn(ADD_FIELDS, op.list) ? ADD_FIELDS[op.list] : null;
      if (!fields) { why(`rows cannot be added to ${op.list}`); continue; }
      const src = op.row && typeof op.row === 'object' ? op.row : {};
      const row = {};
      for (const f of fields) { if (src[f] == null) continue; const v = value(f, src[f]); if (v !== undefined) row[f] = v; }
      if (!row.text && !row.title) { why('a row needs a text'); continue; }
      if (op.list === 'decisions') Object.assign(row, { id: nextId(doc.decisions, 'D'), decidedBy: '' });
      if (op.list === 'actions') { const aid = nextId(doc.actions, 'A'); Object.assign(row, { id: aid, origin: `${doc.id}:${aid}`, owner: '', status: 'open' }); }
      if (op.list === 'agenda' && !row.no) row.no = String(doc.agenda.length + 1);
      doc[op.list].push(row); applied.push({ ...op, ...(row.id ? { id: row.id } : {}) });
    } else why(`unknown op ${String(op.op).slice(0, 30)}`);
  }
  return { doc: normalizeMeetingDoc(doc), applied, skipped };
}

// ── page ────────────────────────────────────────────────────────────────────────────────────────────────────
function summaryHtml(d, L, today) {
  const open = openActions(d, today);
  const k = (label, value) => `<div class="kpi"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  return `<section class="summary"><h2>${esc(L.sum)}</h2><div class="kpis">
${k(L.open, String(open.length))}${k(L.overdue, String(open.filter((a) => a.overdue).length))}${k(L.week, String(open.filter((a) => a.dueThisWeek).length))}${k(L.carriedN, String(d.actions.filter((a) => a.carriedFrom).length))}</div>
<div class="note">${esc(L.asOf)}</div></section>`;
}

export function meetingDocSchema(lang) {
  const L = T[langOf(lang)];
  return {
    labels: { edit: L.edit, done: L.done, save: L.save, addRow: L.addRow, delRow: L.delRow, empty: L.empty },
    sections: [
      { type: 'fields', title: L.basics, fields: [
        { path: 'title', label: L.title, type: 'text', wide: true },
        { path: 'date', label: L.date, type: 'date' },
        { path: 'forum', label: L.forum, type: 'text' },
        { path: 'place', label: L.place, type: 'text' },
      ] },
      { type: 'table', title: L.attendees, path: 'attendees', columns: [
        { key: 'name', label: L.name, type: 'text' }, { key: 'role', label: L.role, type: 'text' }, { key: 'org', label: L.org, type: 'text' },
      ] },
      { type: 'table', title: L.agenda, path: 'agenda', columns: [
        { key: 'no', label: L.no, type: 'text' }, { key: 'title', label: L.aTitle, type: 'text', wide: true }, { key: 'summary', label: L.summary, type: 'textarea', wide: true },
      ] },
      { type: 'table', title: L.decisions, path: 'decisions', idPrefix: 'D', columns: [
        { key: 'id', label: L.id, type: 'text' }, { key: 'text', label: L.text, type: 'textarea', wide: true },
        { key: 'decidedBy', label: L.decidedBy, type: 'text' }, { key: 'basis', label: L.basis, type: 'textarea' }, { key: 'agendaNo', label: L.agendaNo, type: 'text' },
      ] },
      { type: 'table', title: L.actions, path: 'actions', idPrefix: 'A', columns: [
        { key: 'id', label: L.id, type: 'text' }, { key: 'text', label: L.text, type: 'textarea', wide: true },
        { key: 'owner', label: L.owner, type: 'text' }, { key: 'suggestedOwner', label: L.suggested, type: 'text', ro: true },
        { key: 'due', label: L.due, type: 'date' }, { key: 'status', label: L.status, type: 'select', options: optionsOf(ACTION_STATUS, L.statuses), dflt: 'open' },
        { key: 'module', label: L.module, type: 'text' }, { key: 'wbsId', label: L.wbsId, type: 'text' }, { key: 'carriedFrom', label: L.carried, type: 'text', ro: true },
      ] },
      { type: 'fields', title: L.notes, fields: [
        { path: 'notes', label: L.notes, type: 'textarea', wide: true },
        { path: 'liveSummary', label: L.liveSummary, type: 'textarea', wide: true, ro: true },
        { path: 'transcript', label: L.transcript, type: 'textarea', wide: true },
      ] },
    ],
  };
}

export function meetingDocPage(doc, { embed = false, lang = '', today = '' } = {}) {
  const d = normalizeMeetingDoc(doc);
  const l = langOf(lang || d.lang);
  const sub = [d.date, d.forum].filter(Boolean).join(' · ');
  return renderDocPage({ kind: 'meeting', lang: l, title: d.title, subtitle: sub, model: d, schema: meetingDocSchema(l), summaryHtml: summaryHtml(d, T[l], today), fileName: `${d.id || 'meeting'}-minutes.html`, embed });
}

export function meetingDocFromPage(html) {
  const got = modelFromDocPage(html, 'meeting');
  return got ? { model: normalizeMeetingDoc(got.model) } : null;
}

// ── exports ─────────────────────────────────────────────────────────────────────────────────────────────────
const actionCols = (L) => [
  { key: 'id', label: L.id }, { key: 'text', label: L.text }, { key: 'owner', label: L.owner }, { key: 'due', label: L.due }, { key: 'statusText', label: L.status },
  { key: 'module', label: L.module }, { key: 'wbsId', label: L.wbsId }, { key: 'agendaNo', label: L.agendaNo }, { key: 'carriedFrom', label: L.carried },
];

export function meetingActionsCsv(doc) {
  const d = normalizeMeetingDoc(doc);
  const L = T[d.lang];
  return csvOf(d.actions.map((a) => ({ ...a, statusText: L.statuses[a.status] })), actionCols(L));
}

export function meetingDocXlsx(doc) {
  const d = normalizeMeetingDoc(doc);
  const L = T[d.lang];
  const table = (list, cols) => [cols.map((c) => c.label), ...list.map((r) => cols.map((c) => r[c.key] ?? ''))];
  return workbook([
    { name: L.actions, rows: table(d.actions.map((a) => ({ ...a, statusText: L.statuses[a.status] })), actionCols(L)) },
    { name: L.decisions, rows: table(d.decisions, [{ key: 'id', label: L.id }, { key: 'text', label: L.text }, { key: 'decidedBy', label: L.decidedBy }, { key: 'basis', label: L.basis }, { key: 'agendaNo', label: L.agendaNo }]) },
    { name: L.agenda, rows: table(d.agenda, [{ key: 'no', label: L.no }, { key: 'title', label: L.aTitle }, { key: 'summary', label: L.summary }]) },
  ]);
}

// ── write back to a /wbs project (button only, after a preview) ────────────────────────────────────────────
const TASK_STATUS = { open: 'notstarted', inprogress: 'inprogress', done: 'done' };
const TASK_RANK = { notstarted: 0, inprogress: 1, blocked: 1, onhold: 1, done: 2 };
const DECISION_RANK = { open: 0, decided: 1 };
const SYNC_FIELDS = ['label', 'owner', 'finish', 'status', 'note', 'text', 'decided'];
export const taskIdOf = (origin) => `MTG.${String(origin).replace(/[^A-Za-z0-9_.:-]/g, '_')}`;
export const decisionIdOf = (docId, id) => `MTG.${docId}.${id}`;

/** A person written as a name: the team member's id when the project knows them, else '' (and the name goes into the note). */
function memberOf(project, name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return '';
  const m = arr(project?.team).find((t) => String(t.id || '').toLowerCase() === n || String(t.name || '').toLowerCase() === n);
  return m ? m.id : '';
}

/**
 * What writing these minutes into the project would change: per action with an owner or a due date (and every
 * action that already has its task) the task to add or the fields that differ (label, owner, finish, status, note);
 * per decision with a decided-by, the decision-log row. Nothing in the project these minutes do not name changes.
 * Write-back rules (syncDiff): a blank owner / due keeps the project's value, the minutes' line is appended to the
 * note ("회의록 YYYY-MM-DD: …"), and a status moving backwards is only `flagged` (written when the user ticks it).
 */
export function meetingSyncPlan(doc, project) {
  const d = normalizeMeetingDoc(doc);
  const wbs = arr(project?.wbs), log = arr(project?.decisions);
  const L = T[d.lang];
  const tasks = [], added = { tasks: [], decisions: [] }, decisions = [], flagged = [];
  const head = `${L.minutes} ${d.date || d.id}:`;
  for (const a of d.actions) {
    if (!a.text) continue;
    const id = taskIdOf(a.origin || `${d.id}:${a.id}`);
    const owner = memberOf(project, a.owner);
    const note = [head, [d.forum || d.title, a.owner && !owner ? `${L.owner}: ${a.owner}` : ''].filter(Boolean).join(' · ')].join(' ').trim();
    const want = { label: a.text.slice(0, 200), owner, finish: a.due, status: TASK_STATUS[a.status], note };
    const have = wbs.find((w) => w.id === id);
    if (!have) { if (a.owner || a.due) added.tasks.push({ id, type: 'task', ...want, source: `meeting:${d.id}:${a.id}` }); continue; }
    const r = syncDiff('tasks', id, want, have, ['label', 'owner', 'finish', 'status', 'note'], { append: ['note'], rank: { status: TASK_RANK } });
    if (r.changes.length) tasks.push({ id, changes: r.changes });
    flagged.push(...r.flagged);
  }
  for (const x of d.decisions) {
    if (!x.text || !x.decidedBy) continue;
    const id = decisionIdOf(d.id, x.id);
    const owner = memberOf(project, x.decidedBy);
    const note = [head, [x.basis, !owner ? `${L.decidedBy}: ${x.decidedBy}` : ''].filter(Boolean).join(' · ')].join(' ').trim();
    const want = { text: x.text.slice(0, 500), status: 'decided', owner, decided: d.date, note };
    const have = log.find((row) => row.id === id);
    if (!have) { added.decisions.push({ id, ...want }); continue; }
    const r = syncDiff('decisions', id, want, have, ['text', 'status', 'owner', 'decided', 'note'], { append: ['note'], rank: { status: DECISION_RANK } });
    if (r.changes.length) decisions.push({ id, changes: r.changes });
    flagged.push(...r.flagged);
  }
  const empty = !tasks.length && !decisions.length && !added.tasks.length && !added.decisions.length && !flagged.length;
  return { tasks, decisions, added, flagged, empty };
}

/**
 * The project with the plan written in, plus the flagged changes whose keys are in `accept` (the user's ticks).
 * Applying the same plan twice changes nothing more. The server recomputes the plan; a client plan is never applied.
 */
export function applyMeetingSync(project, plan, accept = []) {
  const m = JSON.parse(JSON.stringify(project || {}));
  m.wbs = arr(m.wbs);
  m.decisions = arr(m.decisions);
  const put = (rows, id, field, to) => { const t = rows.find((w) => w.id === id); if (t && SYNC_FIELDS.includes(field)) t[field] = to; };
  for (const x of arr(plan?.tasks)) for (const ch of arr(x.changes)) put(m.wbs, x.id, ch.field, ch.to);
  for (const x of arr(plan?.decisions)) for (const ch of arr(x.changes)) put(m.decisions, x.id, ch.field, ch.to);
  for (const f of acceptedFlags(plan, 'tasks', accept)) put(m.wbs, f.id, f.field, f.to);
  for (const f of acceptedFlags(plan, 'decisions', accept)) put(m.decisions, f.id, f.field, f.to);
  for (const t of arr(plan?.added?.tasks)) if (!m.wbs.some((w) => w.id === t.id)) m.wbs.push(t);
  for (const r of arr(plan?.added?.decisions)) if (!m.decisions.some((w) => w.id === r.id)) m.decisions.push(r);
  return m;
}

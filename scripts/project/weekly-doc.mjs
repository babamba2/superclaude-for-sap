// sc4sap:project-dashboard — the weekly status as a document of its own (the web's /weekly workbench).
//
//   blankWeeklyDoc({ id, title, weekEnd, lang })               new document (this week's Friday by default)
//   weeklyDocFromProject(project, { id, weekEnd, evidence, lang, today, projectId })
//                                                              a /wbs project's week: RAG, workstreams, what moved since the
//                                                              last status run, milestones, KPIs, open risks and decisions,
//                                                              evidence figures (project-status.mjs — no tokens)
//   normalizeWeeklyDoc(doc) / checkWeeklyDoc(doc)
//   applyWeeklyOps(doc, ops)                                   AI proposals, item by item → { doc, applied, skipped }
//   weeklyDocPage(doc, { embed, lang })                        the editable page (doc-kit.mjs)
//   weeklyDocFromPage(html)
//   weeklyDocCsv(doc) / weeklyDocXlsx(doc)
//   weeklySyncPlan(doc, project) / applyWeeklySync(project, plan)   the button-only write back: the week's comment,
//                                                              overall and workstream RAG into the project's status
//
// Document: { kind: 'weekly', id, title, lang, weekEnd, overall: { rag, summary }, workstreams: [{ name, rag, note }],
//   moved: [{ text }], milestones: [{ id, name, due, status, note }], kpis: [{ label, value, note }],
//   risks: [{ id, text, impact, owner, due, status }], decisions: [{ id, text, owner, decision, due, status }],
//   evidence: [{ name, summary }], next: [{ text, owner, due }], source?: { projectId, code, importedAt } }
//
// What an AI proposal may never set: any RAG (overall or workstream — the PM's call), an owner, a decision, a
// status, the week. It may write texts (summary, notes, risk / decision / next texts, KPI notes), add rows (owner,
// decision and status left empty / open) and propose due dates.

import { arr, csvOf, optionsOf, renderDocPage, str, modelFromDocPage } from './doc-kit.mjs';
import { delta, previousOf, readEvidence, statusEntry, weekEndOf } from './project-status.mjs';
import { normalizeModel, viewModel } from './project-model.mjs';
import { workbook } from '../uat/uat-xlsx.mjs';

export const WEEKLY_DOC_ID = /^[A-Za-z0-9_-]{1,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const RAGS = ['green', 'amber', 'red'];
export const ITEM_STATUS = ['open', 'closed'];
export const DECISION_STATUS = ['open', 'decided'];
export const MS_STATUS = ['planned', 'at-risk', 'passed', 'missed'];
const langOf = (v) => (v === 'en' ? 'en' : 'ko');

const T = {
  ko: {
    title: '주간 현황', weekEnd: '주 종료일', overall: '전체 상태', summary: '이번 주 요약', basics: '기본 정보',
    ws: '워크스트림', moved: '이번 주 변화', ms: '마일스톤', kpis: 'KPI', risks: '리스크', decisions: '결정 필요', evidence: '증빙', next: '다음 주 계획',
    name: '이름', rag: 'RAG', note: '메모', text: '내용', id: 'ID', due: '기한', status: '상태', label: '지표', value: '값', impact: '영향', owner: '담당', decision: '결정',
    rags: { green: '정상', amber: '주의', red: '위험' }, item: { open: '열림', closed: '닫힘' }, dec: { open: '미결', decided: '결정됨' },
    msS: { planned: '예정', 'at-risk': '위험', passed: '통과', missed: '놓침' },
    edit: '편집', done: '편집 끝', save: '파일 저장', addRow: '행 추가', delRow: '행 삭제', empty: '아직 없어요',
    first: '첫 주간 현황이라 비교할 지난주 기록이 없어요.',
  },
  en: {
    title: 'Weekly status', weekEnd: 'Week ending', overall: 'Overall', summary: 'This week', basics: 'Basics',
    ws: 'Workstreams', moved: 'What moved', ms: 'Milestones', kpis: 'KPIs', risks: 'Risks', decisions: 'Decisions needed', evidence: 'Evidence', next: 'Next week',
    name: 'Name', rag: 'RAG', note: 'Note', text: 'Text', id: 'ID', due: 'Due', status: 'Status', label: 'Measure', value: 'Value', impact: 'Impact', owner: 'Owner', decision: 'Decision',
    rags: { green: 'Green', amber: 'Amber', red: 'Red' }, item: { open: 'Open', closed: 'Closed' }, dec: { open: 'Open', decided: 'Decided' },
    msS: { planned: 'Planned', 'at-risk': 'At risk', passed: 'Passed', missed: 'Missed' },
    edit: 'Edit', done: 'Done', save: 'Save file', addRow: 'Add row', delRow: 'Delete row', empty: 'None yet',
    first: 'First status of this project: no earlier week to compare with.',
  },
};

const pick = (v, list, dflt = '') => (list.includes(v) ? v : dflt);
const rows = (list, f) => arr(list).map((x) => f(x && typeof x === 'object' ? x : {}));

export function normalizeWeeklyDoc(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const lang = langOf(d.lang);
  return {
    kind: 'weekly',
    id: str(d.id, 40),
    title: str(d.title, 200) || T[lang].title,
    lang,
    weekEnd: DAY.test(String(d.weekEnd || '')) ? d.weekEnd : '',
    overall: { rag: pick(d.overall?.rag, RAGS), summary: str(d.overall?.summary, 4000) },
    workstreams: rows(d.workstreams, (w) => ({ name: str(w.name, 120), rag: pick(w.rag, RAGS), note: str(w.note, 1000) })),
    moved: rows(d.moved, (m) => ({ text: str(m.text, 500) })),
    milestones: rows(d.milestones, (m) => ({ id: str(m.id, 40), name: str(m.name, 200), due: str(m.due, 10), status: pick(m.status, MS_STATUS, 'planned'), note: str(m.note, 500) })),
    kpis: rows(d.kpis, (k) => ({ label: str(k.label, 120), value: str(k.value, 60), note: str(k.note, 500) })),
    risks: rows(d.risks, (r) => ({ id: str(r.id, 40), text: str(r.text, 1000), impact: pick(r.impact, ['H', 'M', 'L'], 'M'), owner: str(r.owner, 80), due: str(r.due, 10), status: pick(r.status, ITEM_STATUS, 'open') })),
    decisions: rows(d.decisions, (x) => ({ id: str(x.id, 40), text: str(x.text, 1000), owner: str(x.owner, 80), decision: str(x.decision, 1000), due: str(x.due, 10), status: pick(x.status, DECISION_STATUS, 'open') })),
    evidence: rows(d.evidence, (e) => ({ name: str(e.name, 200), summary: str(e.summary, 1000) })),
    next: rows(d.next, (n) => ({ text: str(n.text, 500), owner: str(n.owner, 80), due: str(n.due, 10) })),
    ...(d.source && typeof d.source === 'object' ? { source: { projectId: str(d.source.projectId, 80), code: str(d.source.code, 40), importedAt: str(d.source.importedAt, 30) } } : {}),
  };
}

export function checkWeeklyDoc(doc) {
  const d = normalizeWeeklyDoc(doc);
  const errors = [], warnings = [];
  if (!WEEKLY_DOC_ID.test(d.id)) errors.push('id: letters, digits, _ - only, up to 40');
  if (doc?.weekEnd && !d.weekEnd) errors.push('weekEnd must be YYYY-MM-DD');
  for (const [k, list] of [['milestones', d.milestones], ['risks', d.risks], ['decisions', d.decisions], ['next', d.next]]) {
    for (const r of list) if (r.due && !DAY.test(r.due)) warnings.push(`${k} ${r.id || r.text?.slice(0, 20) || ''}: due should be YYYY-MM-DD`);
  }
  if (!d.overall.rag) warnings.push('overall RAG not set');
  return { errors, warnings };
}

export function blankWeeklyDoc({ id, title = '', weekEnd = '', lang = 'ko', today = '' } = {}) {
  const we = weekEnd || (today ? weekEndOf(today) : '');
  return normalizeWeeklyDoc({ id, title, weekEnd: we, lang });
}

/** A short line of one evidence summary (readEvidence) for the evidence table. */
function evidenceLine(e) {
  if (!e?.ok) return e?.reason || '—';
  if (e.kind === 'uat') return `UAT ${Object.entries(e.cycles || {}).map(([c, x]) => `${c} ${x.passPct}%`).join(', ')} · open defects ${e.defectsOpen ?? '—'}`;
  if (e.kind === 'ops') return `dumps ${e.dumps ?? '—'} (${e.dumpsDay ?? '—'}/day) · ${e.verdict || ''}`;
  if (e.kind === 'cts') return `CTS blocked ${e.summary?.blocked ?? '—'} / ${e.summary?.total ?? '—'}`;
  return Object.entries(e.kpi || {}).map(([k, v]) => `${k} ${v}`).join(', ') || e.kind;
}

/**
 * A /wbs project → this week's document, read from the project as it is (no status run is logged in the project:
 * the document is independent until the PM writes it back). `evidence`: [{ name, text }] pages the core gathered.
 */
export function weeklyDocFromProject(project, { id, weekEnd = '', evidence = [], lang = '', today = '', projectId = '' } = {}) {
  const model = normalizeModel(project || {});
  const p = model.project || {};
  const l = langOf(lang || model.lang);
  const week = weekEnd || weekEndOf(today);
  const view = viewModel(model, week < today ? week : today);
  const ev = arr(evidence).map((e) => ({ name: str(e?.name, 200), r: (() => { try { return readEvidence(e?.text); } catch (x) { return { ok: false, reason: x.message }; } })() }));
  const entry = statusEntry(view, ev.map((e) => e.r), week);
  // An older log entry may lack parts (hand-made or from an early version): compare with what it has.
  const prev0 = previousOf(model.statusLog, week);
  const prev = prev0 ? { items: {}, ms: {}, kpi: {}, evidence: [], risks: [], decisions: [], ...prev0 } : null;
  let d;
  try { d = delta(prev, entry, view); } catch { d = { first: true }; }
  const S = T[l];
  const moved = d.first ? [{ text: S.first }] : [
    ...arr(d.moved).map((x) => ({ text: `${x.label}: ${x.from} → ${x.to}` })),
    ...arr(d.done).map((x) => ({ text: `✔ ${x.label}` })),
    ...arr(d.ms).map((x) => ({ text: `${x.label}: ${x.from} → ${x.to}` })),
    ...arr(d.late).map((x) => ({ text: `⚠ ${x.label}` })),
  ];
  return normalizeWeeklyDoc({
    id: id || `${p.code || 'PRJ'}-${week}`.slice(0, 40), title: `${p.name || p.code || ''} ${S.title}`.trim(), lang: l, weekEnd: week,
    overall: { rag: entry.overall, summary: model.status?.comment || '' },
    workstreams: Object.entries(entry.ws).map(([name, rag]) => ({ name, rag, note: '' })),
    moved,
    milestones: view.milestones.filter((x) => !x.actual).slice(0, 8).map((x) => ({ id: x.id, name: x.label, due: x.date || '', status: x.rag === 'red' ? 'at-risk' : 'planned', note: '' })),
    kpis: arr(view.m.kpis).filter((k) => k.actual != null).map((k) => ({ label: k.label || k.id, value: String(k.actual), note: '' })),
    risks: model.risks.filter((r) => r.status !== 'closed').map((r) => ({ id: r.id, text: r.text || r.label || '', impact: r.impact, owner: r.owner, due: r.due, status: 'open' })),
    decisions: model.decisions.filter((x) => x.status !== 'decided').map((x) => ({ id: x.id, text: x.text || x.label || '', owner: x.owner, decision: '', due: x.due, status: 'open' })),
    evidence: ev.map((e) => ({ name: e.name, summary: evidenceLine(e.r) })),
    next: view.upcoming.slice(0, 5).map((x) => ({ text: x.label, owner: '', due: x.date || '' })),
    source: { projectId, code: p.code || '', importedAt: today },
  });
}

// ── AI proposals ────────────────────────────────────────────────────────────────────────────────────────────
/** Per list, the fields a proposal may set. RAGs, owners, decisions, statuses and the week never. */
export const WEEKLY_OP_FIELDS = {
  overall: ['summary'],
  workstreams: ['note'],
  moved: ['text'],
  milestones: ['note'],
  kpis: ['note'],
  risks: ['text', 'impact', 'due'],
  decisions: ['text', 'due'],
  evidence: ['summary'],
  next: ['text', 'due'],
  doc: ['title'],
};
/** What a row a proposal adds may carry; the rest starts empty / open. */
const ADD_FIELDS = {
  workstreams: ['name', 'note'], moved: ['text'], milestones: ['name', 'due', 'note'], kpis: ['label', 'value', 'note'],
  risks: ['text', 'impact', 'due'], decisions: ['text', 'due'], evidence: ['name', 'summary'], next: ['text', 'due'],
};

/**
 * ops: { op: 'set', list, index | id, field, value } (list 'overall' / 'doc' take no index)
 *      | { op: 'add', list, row }
 */
export function applyWeeklyOps(doc0, ops) {
  const doc = normalizeWeeklyDoc(JSON.parse(JSON.stringify(doc0 || {})));
  const applied = [], skipped = [];
  const value = (field, v) => (field === 'due' ? (DAY.test(String(v)) ? String(v) : undefined) : field === 'impact' ? (['H', 'M', 'L'].includes(v) ? v : undefined) : str(v, 2000));
  const nextId = (list, prefix) => `${prefix}${String(list.reduce((n, r) => Math.max(n, Number(/(\d+)$/.exec(r.id || '')?.[1] || 0)), 0) + 1).padStart(2, '0')}`;
  for (const op of arr(ops)) {
    const why = (reason) => skipped.push({ op, reason });
    if (!op || typeof op !== 'object') { why('not an object'); continue; }
    // Own keys only: a list named __proto__ / constructor / toString is no list.
    const allowed = typeof op.list === 'string' && Object.hasOwn(WEEKLY_OP_FIELDS, op.list) ? WEEKLY_OP_FIELDS[op.list] : null;
    if (!allowed) { why(`unknown list ${String(op.list).slice(0, 30)}`); continue; }
    if (op.op === 'set') {
      if (!allowed.includes(op.field)) { why(`${String(op.field).slice(0, 40)} is not a field a proposal may set`); continue; }
      const v = value(op.field, op.value);
      if (v === undefined) { why(`bad value for ${op.field}`); continue; }
      if (op.list === 'overall') { doc.overall[op.field] = v; applied.push(op); continue; }
      if (op.list === 'doc') { doc[op.field] = str(v, 200); applied.push(op); continue; }
      const list = doc[op.list];
      const row = op.id != null ? list.find((r) => r.id === op.id) : list[Number(op.index)];
      if (!row) { why(`no row ${op.id ?? op.index} in ${op.list}`); continue; }
      row[op.field] = v; applied.push(op);
    } else if (op.op === 'add') {
      const fields = Object.hasOwn(ADD_FIELDS, op.list) ? ADD_FIELDS[op.list] : null;
      if (!fields) { why(`rows cannot be added to ${op.list}`); continue; }
      const src = op.row && typeof op.row === 'object' ? op.row : {};
      const row = {};
      for (const f of fields) { if (src[f] == null) continue; const v = f === 'due' || f === 'impact' ? value(f, src[f]) : str(src[f], 1000); if (v !== undefined) row[f] = v; }
      if (!Object.values(row).some(Boolean)) { why('an empty row'); continue; }
      if (op.list === 'risks') Object.assign(row, { id: nextId(doc.risks, 'R.AI.'), owner: '', status: 'open' });
      if (op.list === 'decisions') Object.assign(row, { id: nextId(doc.decisions, 'D.AI.'), owner: '', decision: '', status: 'open' });
      if (op.list === 'workstreams') row.rag = '';
      if (op.list === 'next') row.owner = '';
      doc[op.list].push(row); applied.push({ ...op, ...(row.id ? { id: row.id } : {}) });
    } else why(`unknown op ${String(op.op).slice(0, 30)}`);
  }
  return { doc: normalizeWeeklyDoc(doc), applied, skipped };
}

// ── page ────────────────────────────────────────────────────────────────────────────────────────────────────
export function weeklyDocSchema(lang) {
  const L = T[langOf(lang)];
  const rag = optionsOf(RAGS, L.rags);
  return {
    labels: { edit: L.edit, done: L.done, save: L.save, addRow: L.addRow, delRow: L.delRow, empty: L.empty },
    sections: [
      { type: 'fields', title: L.basics, fields: [
        { path: 'title', label: L.title, type: 'text', wide: true },
        { path: 'weekEnd', label: L.weekEnd, type: 'date' },
        { path: 'overall.rag', label: L.overall, type: 'rag', options: rag },
        { path: 'overall.summary', label: L.summary, type: 'textarea', wide: true },
      ] },
      { type: 'table', title: L.ws, path: 'workstreams', columns: [
        { key: 'name', label: L.name, type: 'text' }, { key: 'rag', label: L.rag, type: 'rag', options: rag }, { key: 'note', label: L.note, type: 'textarea', wide: true },
      ] },
      { type: 'table', title: L.moved, path: 'moved', columns: [{ key: 'text', label: L.text, type: 'textarea', wide: true }] },
      { type: 'table', title: L.ms, path: 'milestones', columns: [
        { key: 'name', label: L.name, type: 'text', wide: true }, { key: 'due', label: L.due, type: 'date' },
        { key: 'status', label: L.status, type: 'select', options: optionsOf(MS_STATUS, L.msS), dflt: 'planned' }, { key: 'note', label: L.note, type: 'textarea' },
      ] },
      { type: 'table', title: L.kpis, path: 'kpis', columns: [
        { key: 'label', label: L.label, type: 'text' }, { key: 'value', label: L.value, type: 'text' }, { key: 'note', label: L.note, type: 'textarea', wide: true },
      ] },
      { type: 'table', title: L.risks, path: 'risks', idPrefix: 'R.', columns: [
        { key: 'id', label: L.id, type: 'text' }, { key: 'text', label: L.text, type: 'textarea', wide: true },
        { key: 'impact', label: L.impact, type: 'select', options: optionsOf(['H', 'M', 'L']), dflt: 'M' },
        { key: 'owner', label: L.owner, type: 'text' }, { key: 'due', label: L.due, type: 'date' },
        { key: 'status', label: L.status, type: 'select', options: optionsOf(ITEM_STATUS, L.item), dflt: 'open' },
      ] },
      { type: 'table', title: L.decisions, path: 'decisions', idPrefix: 'D.', columns: [
        { key: 'id', label: L.id, type: 'text' }, { key: 'text', label: L.text, type: 'textarea', wide: true },
        { key: 'owner', label: L.owner, type: 'text' }, { key: 'decision', label: L.decision, type: 'textarea' }, { key: 'due', label: L.due, type: 'date' },
        { key: 'status', label: L.status, type: 'select', options: optionsOf(DECISION_STATUS, L.dec), dflt: 'open' },
      ] },
      { type: 'table', title: L.next, path: 'next', columns: [
        { key: 'text', label: L.text, type: 'textarea', wide: true }, { key: 'owner', label: L.owner, type: 'text' }, { key: 'due', label: L.due, type: 'date' },
      ] },
      { type: 'table', title: L.evidence, path: 'evidence', columns: [
        { key: 'name', label: L.name, type: 'text' }, { key: 'summary', label: L.note, type: 'textarea', wide: true },
      ] },
    ],
  };
}

export function weeklyDocPage(doc, { embed = false, lang = '' } = {}) {
  const d = normalizeWeeklyDoc(doc);
  const l = langOf(lang || d.lang);
  const sub = [d.weekEnd, d.source?.code].filter(Boolean).join(' · ');
  return renderDocPage({ kind: 'weekly', lang: l, title: d.title, subtitle: sub, model: d, schema: weeklyDocSchema(l), fileName: `${d.id || 'weekly'}-weekly.html`, embed });
}

export function weeklyDocFromPage(html) {
  const got = modelFromDocPage(html, 'weekly');
  return got ? { model: normalizeWeeklyDoc(got.model) } : null;
}

// ── exports ─────────────────────────────────────────────────────────────────────────────────────────────────
/** CSV: one table of every row that has an owner or a due — risks, decisions, milestones and next week's plan. */
export function weeklyDocCsv(doc) {
  const d = normalizeWeeklyDoc(doc);
  const L = T[d.lang];
  const all = [
    ...d.risks.map((r) => ({ list: L.risks, id: r.id, text: r.text, owner: r.owner, due: r.due, status: L.item[r.status] })),
    ...d.decisions.map((r) => ({ list: L.decisions, id: r.id, text: r.text, owner: r.owner, due: r.due, status: L.dec[r.status], decision: r.decision })),
    ...d.milestones.map((r) => ({ list: L.ms, id: r.id, text: r.name, owner: '', due: r.due, status: L.msS[r.status] })),
    ...d.next.map((r) => ({ list: L.next, id: '', text: r.text, owner: r.owner, due: r.due, status: '' })),
  ];
  return csvOf(all, [{ key: 'list', label: '' }, { key: 'id', label: L.id }, { key: 'text', label: L.text }, { key: 'owner', label: L.owner }, { key: 'due', label: L.due }, { key: 'status', label: L.status }, { key: 'decision', label: L.decision }]);
}

export function weeklyDocXlsx(doc) {
  const d = normalizeWeeklyDoc(doc);
  const L = T[d.lang];
  const sheet = (name, list, cols) => ({ name, rows: [cols.map(([, label]) => label), ...list.map((r) => cols.map(([k]) => r[k] ?? ''))] });
  return workbook([
    { name: L.basics, rows: [[L.title, d.title], [L.weekEnd, d.weekEnd], [L.overall, L.rags[d.overall.rag] || ''], [L.summary, d.overall.summary]] },
    sheet(L.ws, d.workstreams.map((w) => ({ ...w, rag: L.rags[w.rag] || '' })), [['name', L.name], ['rag', L.rag], ['note', L.note]]),
    sheet(L.risks, d.risks, [['id', L.id], ['text', L.text], ['impact', L.impact], ['owner', L.owner], ['due', L.due], ['status', L.status]]),
    sheet(L.decisions, d.decisions, [['id', L.id], ['text', L.text], ['owner', L.owner], ['decision', L.decision], ['due', L.due], ['status', L.status]]),
    sheet(L.ms, d.milestones, [['name', L.name], ['due', L.due], ['status', L.status], ['note', L.note]]),
    sheet(L.next, d.next, [['text', L.text], ['owner', L.owner], ['due', L.due]]),
  ]);
}

// ── write back to a /wbs project (button only, after a preview) ────────────────────────────────────────────
/**
 * The project's status part this document would set: overall RAG, workstream RAGs, the week's comment. A blank RAG or
 * comment keeps the project's value (write-back rules); RAG has no order, so nothing here is a backward move.
 */
export function weeklySyncPlan(doc, project) {
  const d = normalizeWeeklyDoc(doc);
  const st = project?.status || {};
  const changes = [];
  if (d.overall.rag && d.overall.rag !== st.overall) changes.push({ field: 'overall', from: st.overall ?? null, to: d.overall.rag });
  if (d.overall.summary && d.overall.summary !== (st.comment || '')) changes.push({ field: 'comment', from: st.comment ?? null, to: d.overall.summary });
  const ws = {};
  for (const w of d.workstreams) if (w.name && w.rag && st.wsRag?.[w.name] !== w.rag) ws[w.name] = { from: st.wsRag?.[w.name] ?? null, to: w.rag };
  if (Object.keys(ws).length) changes.push({ field: 'wsRag', from: null, to: ws });
  return { weekEnd: d.weekEnd, changes, flagged: [], empty: !changes.length };
}

/** The project model with the plan written in. Applying the same plan twice changes nothing more. */
export function applyWeeklySync(project, plan) {
  const m = JSON.parse(JSON.stringify(project || {}));
  m.status = { ...(m.status || {}) };
  for (const ch of arr(plan?.changes)) {
    if (ch.field === 'overall' && RAGS.includes(ch.to)) m.status.overall = ch.to;
    else if (ch.field === 'comment') m.status.comment = str(ch.to, 4000);
    else if (ch.field === 'wsRag') { m.status.wsRag = { ...(m.status.wsRag || {}) }; for (const [k, v] of Object.entries(ch.to || {})) if (RAGS.includes(v?.to)) m.status.wsRag[k] = v.to; }
  }
  return m;
}

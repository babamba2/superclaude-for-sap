// sc4sap:project-dashboard — data migration as a document of its own (the web's /migration).
//
//   blankMigrationDoc({ id, title, lang })                  new plan: the four runs (mock 1–3, final), nothing else
//   migrationDocFromProject(project, { id, projectId, lang }) objects from the project's conversion (C) WRICEF items
//   normalizeMigrationDoc(doc) / checkMigrationDoc(doc)
//   parseFilter(text) / ruleChecks(doc, objectId)           a rule's filter text → conditions; an object's rules → the
//                                                           backend's reconciliation checks (counts / sums only)
//   applySapCounts(doc, { runId, objectId, system, at, results })  the SAP side of a run into `results`
//   importSourceCsv(doc, runId, csv)                        the source side (legacy counts / sums) from a CSV
//   suggestVerdict(result, rule)                            OK / check / NG from the tolerance — shown, never stored
//   applyMigrationOps(doc, ops)                             AI proposals: texts and drafts only
//   migrationDocPage / migrationDocFromPage / migrationResultsCsv / migrationDocXlsx
//
// Document: { kind: 'migration', id, title, lang,
//   objects: [{ id, module, name, catalog, approach, owner, sequence, status, note }],
//   runs: [{ id: M1|M2|M3|FINAL, label, planStart, planEnd, actualStart, actualEnd, cutoverTask, system }],
//   rules: [{ id, objectId, kind: count|distinct|sum|empty, table, field, filter, groupBy, tolerance, note }],
//   results: [{ id, runId, ruleId, group, source, target, system, readAt, verdict: ''|ok|check|ng, cause, note }],
//   issues: [{ id, objectId, runId, text, cause, owner, due, status: open|closed }], source? }
//
// What an AI proposal may never set: an owner, a status, a verdict, a source or target number, a tolerance, a run
// date or the system. It may write object names / notes, rule notes, delta causes and issue texts, and add objects,
// rules (with a catalog table and field) and issues (owner empty, status open).
// SAP numbers come only from the reconciliation read; the "<5" of a small personal-data group stays "<5".

import { arr, csvOf, esc, optionsOf, renderDocPage, str, modelFromDocPage } from './doc-kit.mjs';
import { workbook } from '../uat/uat-xlsx.mjs';

export const MIGRATION_DOC_ID = /^[A-Za-z0-9_-]{1,40}$/;
export const RUN_IDS = ['M1', 'M2', 'M3', 'FINAL'];
export const RULE_KINDS = ['count', 'distinct', 'sum', 'empty'];
export const VERDICTS = ['', 'ok', 'check', 'ng'];
export const OBJECT_STATUS = ['planned', 'inprogress', 'done'];
export const APPROACHES = ['', 'cockpit', 'lsmw', 'bapi', 'program', 'manual', 'other'];
const ISSUE_STATUS = ['open', 'closed'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const langOf = (v) => (v === 'en' ? 'en' : 'ko');
const day = (v) => (DAY.test(String(v || '')) ? String(v) : '');
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
const rows = (list, f) => arr(list).map((x) => f(x && typeof x === 'object' ? x : {}));
const NAME = /^[A-Z0-9_/]{1,30}$/;
const up = (v, n = 30) => str(v, n).trim().toUpperCase();
/** A number as typed or read ("1,234.5", "<5"), or '' when there is none. */
const numText = (v) => {
  const s = str(v, 40).trim();
  if (s === '<5') return '<5';
  const n = Number(s.replace(/,/g, ''));
  return s !== '' && Number.isFinite(n) ? String(n) : '';
};

const T = {
  ko: {
    title: '데이터 이관', objects: '이관 대상', runs: '회차', rules: '검증 규칙', results: '회차별 결과', issues: '이슈',
    id: 'ID', module: '모듈', name: '이름', catalog: '카탈로그 대상', approach: '방식', owner: '담당', sequence: '순서', status: '상태', note: '메모',
    label: '회차', planStart: '계획 시작', planEnd: '계획 종료', actualStart: '실제 시작', actualEnd: '실제 종료', cutoverTask: '컷오버 작업', system: '시스템',
    objectId: '대상', kind: '종류', table: '테이블', field: '필드', filter: '조건', groupBy: '묶음', tolerance: '허용 오차',
    runId: '회차', ruleId: '규칙', group: '묶음 값', source: '원천 값', target: 'SAP 값', readAt: '읽은 시각', verdict: '판정', cause: '차이 원인', text: '내용', due: '기한',
    kinds: { count: '건수', distinct: '고유 건수', sum: '합계', empty: '필수값 비어 있음' },
    verdicts: { '': '—', ok: 'OK', check: '확인', ng: 'NG' }, statuses: { planned: '계획', inprogress: '진행 중', done: '완료' },
    issueStatuses: { open: '열림', closed: '닫힘' }, runLabels: { M1: '모의 1차', M2: '모의 2차', M3: '모의 3차', FINAL: '본 이관' },
    approaches: { '': '—', cockpit: 'Migration Cockpit', lsmw: 'LSMW', bapi: 'BAPI', program: '이관 프로그램', manual: '수작업', other: '기타' },
    sum: '현황', ng: 'NG 판정', check: '확인 필요', open: '열린 이슈', counts: '결과 행',
    edit: '편집', done: '편집 끝', save: '파일 저장', addRow: '행 추가', delRow: '행 삭제', empty: '아직 없어요',
    asOf: '마지막 저장 기준 — 편집한 내용은 다시 열면 반영돼요.',
  },
  en: {
    title: 'Data migration', objects: 'Migration objects', runs: 'Runs', rules: 'Reconciliation rules', results: 'Results per run', issues: 'Issues',
    id: 'ID', module: 'Module', name: 'Name', catalog: 'Catalog object', approach: 'Approach', owner: 'Owner', sequence: 'Sequence', status: 'Status', note: 'Note',
    label: 'Run', planStart: 'Plan start', planEnd: 'Plan end', actualStart: 'Actual start', actualEnd: 'Actual end', cutoverTask: 'Cutover task', system: 'System',
    objectId: 'Object', kind: 'Kind', table: 'Table', field: 'Field', filter: 'Filter', groupBy: 'Group by', tolerance: 'Tolerance',
    runId: 'Run', ruleId: 'Rule', group: 'Group', source: 'Source value', target: 'SAP value', readAt: 'Read at', verdict: 'Verdict', cause: 'Delta cause', text: 'Text', due: 'Due',
    kinds: { count: 'Count', distinct: 'Distinct count', sum: 'Sum', empty: 'Mandatory empty' },
    verdicts: { '': '—', ok: 'OK', check: 'Check', ng: 'NG' }, statuses: { planned: 'Planned', inprogress: 'In progress', done: 'Done' },
    issueStatuses: { open: 'Open', closed: 'Closed' }, runLabels: { M1: 'Mock 1', M2: 'Mock 2', M3: 'Mock 3', FINAL: 'Final' },
    approaches: { '': '—', cockpit: 'Migration Cockpit', lsmw: 'LSMW', bapi: 'BAPI', program: 'Migration program', manual: 'Manual', other: 'Other' },
    sum: 'Status', ng: 'NG verdicts', check: 'To check', open: 'Open issues', counts: 'Result rows',
    edit: 'Edit', done: 'Done', save: 'Save file', addRow: 'Add row', delRow: 'Delete row', empty: 'None yet',
    asOf: 'As of the last save — edits show when the page is opened again.',
  },
};

export function normalizeMigrationDoc(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const lang = langOf(d.lang);
  const L = T[lang];
  const runsIn = rows(d.runs, (r) => r);
  const runs = RUN_IDS.map((rid) => {
    const r = runsIn.find((x) => x.id === rid) || {};
    return {
      id: rid, label: str(r.label, 60) || L.runLabels[rid],
      planStart: day(r.planStart), planEnd: day(r.planEnd), actualStart: day(r.actualStart), actualEnd: day(r.actualEnd),
      cutoverTask: str(r.cutoverTask, 60), system: str(r.system, 40),
    };
  });
  return {
    kind: 'migration',
    id: str(d.id, 40),
    title: str(d.title, 200) || L.title,
    lang,
    objects: rows(d.objects, (o) => ({
      id: str(o.id, 40), module: up(o.module, 10), name: str(o.name, 200), catalog: str(o.catalog, 40),
      approach: pick(o.approach, APPROACHES, ''), owner: str(o.owner, 80), sequence: str(o.sequence, 10),
      status: pick(o.status, OBJECT_STATUS, 'planned'), note: str(o.note, 2000),
    })),
    runs,
    rules: rows(d.rules, (r) => ({
      id: str(r.id, 40), objectId: str(r.objectId, 40), kind: pick(r.kind, RULE_KINDS, 'count'),
      table: NAME.test(up(r.table)) ? up(r.table) : '', field: NAME.test(up(r.field)) ? up(r.field) : '',
      filter: str(r.filter, 400), groupBy: up(r.groupBy, 120).replace(/\s+/g, ''), tolerance: str(r.tolerance, 20).trim(), note: str(r.note, 2000),
    })),
    results: rows(d.results, (x) => ({
      id: str(x.id, 60), runId: pick(x.runId, RUN_IDS, 'M1'), ruleId: str(x.ruleId, 40), group: str(x.group, 200),
      source: numText(x.source), target: numText(x.target), system: str(x.system, 40), readAt: str(x.readAt, 30),
      verdict: pick(x.verdict, VERDICTS, ''), cause: str(x.cause, 2000), note: str(x.note, 2000),
    })),
    issues: rows(d.issues, (x) => ({
      id: str(x.id, 40), objectId: str(x.objectId, 40), runId: RUN_IDS.includes(x.runId) ? x.runId : '',
      text: str(x.text, 2000), cause: str(x.cause, 2000), owner: str(x.owner, 80), due: day(x.due), status: pick(x.status, ISSUE_STATUS, 'open'),
    })),
    ...(d.source && typeof d.source === 'object' ? { source: { projectId: str(d.source.projectId, 80), code: str(d.source.code, 40) } } : {}),
  };
}

export function blankMigrationDoc({ id, title = '', lang = 'ko' } = {}) {
  return normalizeMigrationDoc({ id, title, lang });
}

/** Objects from the project's conversion items (WRICEF type C); the runs from its mock / cutover milestones by name. */
export function migrationDocFromProject(project, { id, projectId = '', lang = 'ko' } = {}) {
  const p = project && typeof project === 'object' ? project : {};
  const conv = arr(p.wbs).filter((w) => w && w.type === 'wricef' && String(w.wricef?.kind || '').toUpperCase() === 'C');
  const objects = conv.map((w, i) => ({ id: `O${String(i + 1).padStart(2, '0')}`, name: str(w.label, 200), module: up(w.ws, 10), owner: '', note: `WBS ${w.id}` }));
  const ms = arr(p.milestones);
  const find = (re) => ms.find((m) => re.test(String(m.label || '')));
  const at = (m) => day(m?.forecast || m?.base);
  const runs = [
    { id: 'M1', planStart: at(find(/mock\s*1|모의\s*1|1차\s*모의/i)) },
    { id: 'M2', planStart: at(find(/mock\s*2|모의\s*2|2차\s*모의/i)) },
    { id: 'M3', planStart: at(find(/mock\s*3|모의\s*3|3차\s*모의/i)) },
    { id: 'FINAL', planStart: at(find(/cut\s*-?over|go-?live|컷오버|오픈/i)) },
  ];
  return normalizeMigrationDoc({ id, lang, title: `${str(p.project?.code, 40)} ${T[langOf(lang)].title}`.trim(), objects, runs, source: { projectId, code: str(p.project?.code, 40) } });
}

export function checkMigrationDoc(doc) {
  const d = normalizeMigrationDoc(doc);
  const errors = [], warnings = [];
  if (!MIGRATION_DOC_ID.test(d.id)) errors.push('id: letters, digits, _ - only, up to 40');
  const ids = (list, what) => {
    const seen = new Set();
    for (const x of list) {
      if (!x.id) errors.push(`${what} without id`);
      else if (seen.has(x.id)) errors.push(`duplicate ${what} id ${x.id}`);
      seen.add(x.id);
    }
    return seen;
  };
  const objects = ids(d.objects, 'object');
  const rules = ids(d.rules, 'rule');
  ids(d.issues, 'issue');
  for (const r of d.rules) {
    if (!objects.has(r.objectId)) warnings.push(`rule ${r.id}: object ${r.objectId || '—'} not in the list`);
    if (!r.table) warnings.push(`rule ${r.id}: no table`);
    if (r.kind !== 'count' && !r.field) warnings.push(`rule ${r.id}: ${r.kind} needs a field`);
    try { parseFilter(r.filter); } catch (e) { warnings.push(`rule ${r.id}: ${e.message}`); }
  }
  for (const x of d.results) if (!rules.has(x.ruleId)) warnings.push(`result ${x.id}: rule ${x.ruleId} not in the list`);
  for (const o of d.objects) if (o.status !== 'done' && !o.owner) warnings.push(`object ${o.id}: no owner`);
  return { errors, warnings };
}

// ── rules → the backend's checks ─────────────────────────────────────────────────────────────────────────────
const VALUE = /^[A-Za-z0-9 ._\-:/]{0,40}$/;

/**
 * "WERKS in 1000,2000; LVORM = ''; ERDAT between 20260101 and 20261231; BUKRS <> 9999" → conditions.
 * Values are literals only (letters, digits, space . _ - : /); '' is the empty value. Throws on anything else.
 */
export function parseFilter(text) {
  const out = [];
  for (const part0 of String(text || '').split(';')) {
    const part = part0.trim();
    if (!part) continue;
    let m;
    const val = (v) => {
      const s = v.trim().replace(/^'(.*)'$/, '$1');
      if (!VALUE.test(s)) throw new Error(`filter value "${s.slice(0, 20)}": letters, digits, space . _ - : / only`);
      return s;
    };
    if ((m = /^([A-Za-z0-9_]+)\s+in\s+(.+)$/i.exec(part))) out.push({ field: m[1].toUpperCase(), op: 'in', value: m[2].split(',').map(val).slice(0, 20) });
    else if ((m = /^([A-Za-z0-9_]+)\s+between\s+(\S+)\s+and\s+(\S+)$/i.exec(part))) out.push({ field: m[1].toUpperCase(), op: 'between', value: [val(m[2]), val(m[3])] });
    else if ((m = /^([A-Za-z0-9_]+)\s*(=|<>|>=|<=)\s*(.*)$/.exec(part))) out.push({ field: m[1].toUpperCase(), op: m[2], value: val(m[3]) });
    else throw new Error(`filter "${part.slice(0, 40)}": FIELD = value, FIELD in a,b, FIELD between a and b`);
  }
  return out;
}

/** An object's rules as the reconciliation read takes them (its catalog object + checks); rules that cannot run are listed. */
export function ruleChecks(doc, objectId) {
  const d = normalizeMigrationDoc(doc);
  const o = d.objects.find((x) => x.id === objectId);
  if (!o) throw new Error(`object ${objectId} not in the document`);
  if (!o.catalog) throw new Error(`object ${objectId}: pick its catalog object first`);
  const checks = [], ruleIds = [], skipped = [];
  for (const r of d.rules.filter((x) => x.objectId === objectId)) {
    try {
      if (!r.table) throw new Error('no table');
      if (r.kind !== 'count' && !r.field) throw new Error(`${r.kind} needs a field`);
      const groupBy = r.groupBy ? r.groupBy.split(',').filter(Boolean).slice(0, 3) : [];
      checks.push({ kind: r.kind, table: r.table, ...(r.kind === 'count' ? {} : { field: r.field }), where: parseFilter(r.filter), groupBy });
      ruleIds.push(r.id);
    } catch (e) {
      skipped.push({ ruleId: r.id, why: e.message });
    }
  }
  return { object: o.catalog, checks: checks.slice(0, 40), ruleIds: ruleIds.slice(0, 40), skipped };
}

/**
 * The Migration Cockpit's status codes as words (fixed values of the domains on S/4, read by DDIC only):
 * DMC_MIG_IMPORT_STATE 1 / 2 / 3, DMC_FLAG_TESTMODE X = simulation, blank or '-' = real run.
 */
const COCKPIT = {
  ko: { IMPORT_STATE: { 1: '실패', 2: '가져오기 준비', 3: '가져옴', '': '설정 안 됨' }, TESTRUN: { X: '시뮬레이션', '-': '실제 실행', '': '실제 실행' } },
  en: { IMPORT_STATE: { 1: 'Failed', 2: 'Ready to import', 3: 'Imported', '': 'Not set' }, TESTRUN: { X: 'Simulation', '-': 'Real run', '': 'Real run' } },
};
const groupKey = (g, lang = 'ko') => Object.entries(g || {}).map(([k, v]) => {
  const words = Object.hasOwn(COCKPIT[langOf(lang)], k) ? COCKPIT[langOf(lang)][k] : null;
  const word = words && Object.hasOwn(words, String(v ?? '').trim()) ? words[String(v ?? '').trim()] : '';
  return word ? `${k}=${v} (${word})` : `${k}=${v}`;
}).join(', ');

/**
 * The SAP side of one run of one object into `results`: per rule and group, the target value (a count, or the sum
 * for a sum rule; "<5" stays "<5"), the system and the time. Source values, verdicts, causes and notes stay.
 */
export function applySapCounts(doc0, { runId, ruleIds, system = '', at = '', results = [] }) {
  const doc = normalizeMigrationDoc(JSON.parse(JSON.stringify(doc0 || {})));
  if (!RUN_IDS.includes(runId)) throw new Error(`run ${runId}: one of ${RUN_IDS.join(', ')}`);
  let n = 0;
  arr(results).forEach((r, i) => {
    const ruleId = arr(ruleIds)[i];
    const rule = doc.rules.find((x) => x.id === ruleId);
    if (!rule) return;
    for (const row of arr(r?.rows)) {
      const group = groupKey(row.group, doc.lang);
      const value = rule.kind === 'sum' ? (row.count === '<5' ? '<5' : row.amount) : row.count;
      const key = `${runId}:${ruleId}:${group}`;
      let res = doc.results.find((x) => x.runId === runId && x.ruleId === ruleId && x.group === group);
      if (!res) { res = { id: key.slice(0, 60), runId, ruleId, group, source: '', target: '', system: '', readAt: '', verdict: '', cause: '', note: '' }; doc.results.push(res); }
      res.target = numText(value);
      res.system = str(system, 40);
      res.readAt = str(at, 30);
      n++;
    }
  });
  return { doc: normalizeMigrationDoc(doc), rows: n };
}

/** One CSV / TSV line into cells: comma, semicolon or tab; "quoted" cells may hold the separator ("" is a quote). */
function splitCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** The source side from a CSV ("rule,group,value" — a header row is skipped): per run, only the source column changes. */
export function importSourceCsv(doc0, runId, csv) {
  const doc = normalizeMigrationDoc(JSON.parse(JSON.stringify(doc0 || {})));
  if (!RUN_IDS.includes(runId)) throw new Error(`run ${runId}: one of ${RUN_IDS.join(', ')}`);
  const lines = String(csv || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const skipped = [];
  let n = 0;
  for (const [i, line] of lines.entries()) {
    const cells = splitCsvLine(line);
    if (i === 0 && !/\d/.test(cells[2] ?? '')) continue; // header
    const [ruleId, group = '', value = ''] = cells.length >= 3 ? cells : [cells[0], '', cells[1]];
    const rule = doc.rules.find((x) => x.id === ruleId);
    const v = numText(value);
    if (!rule || v === '' || v === '<5') { skipped.push(i + 1); continue; }
    let res = doc.results.find((x) => x.runId === runId && x.ruleId === ruleId && x.group === group);
    if (!res) { res = { id: `${runId}:${ruleId}:${group}`.slice(0, 60), runId, ruleId, group, source: '', target: '', system: '', readAt: '', verdict: '', cause: '', note: '' }; doc.results.push(res); }
    res.source = v;
    n++;
  }
  return { doc: normalizeMigrationDoc(doc), rows: n, skipped };
}

/** OK / check / NG from source, target and the rule's tolerance ("0", "10", "0.5%"): a suggestion for the reader. */
export function suggestVerdict(result, rule) {
  const s = result?.source, t = result?.target;
  if (s === '' || t === '' || s == null || t == null) return '';
  if (s === '<5' || t === '<5') return 'check';
  const a = Number(s), b = Number(t);
  const diff = Math.abs(a - b);
  const tol = String(rule?.tolerance || '0');
  const allowed = tol.endsWith('%') ? (Math.abs(a) * Number(tol.slice(0, -1) || 0)) / 100 : Number(tol) || 0;
  if (diff === 0) return 'ok';
  return diff <= allowed ? 'check' : 'ng';
}

// ── AI proposals ──────────────────────────────────────────────────────────────────────────────────────────────
export const MIGRATION_OP_FIELDS = {
  objects: ['name', 'module', 'approach', 'sequence', 'note'],
  rules: ['note'],
  results: ['cause'],
  issues: ['text', 'cause'],
  doc: ['title'],
};
const ADD_FIELDS = { objects: ['name', 'module', 'approach', 'note'], rules: ['objectId', 'kind', 'table', 'field', 'filter', 'groupBy', 'note'], issues: ['objectId', 'runId', 'text', 'cause'] };
const nextId = (list, prefix) => {
  let n = list.length + 1;
  while (list.some((x) => x.id === `${prefix}${String(n).padStart(2, '0')}`)) n++;
  return `${prefix}${String(n).padStart(2, '0')}`;
};

/** ops: { op: 'set', list, index | id, field, value } (list 'doc' takes no index) | { op: 'add', list, row } */
export function applyMigrationOps(doc0, ops) {
  const doc = normalizeMigrationDoc(JSON.parse(JSON.stringify(doc0 || {})));
  const applied = [], skipped = [];
  for (const op of arr(ops)) {
    const why = (reason) => skipped.push({ op, reason });
    if (!op || typeof op !== 'object') { why('not an object'); continue; }
    const allowed = typeof op.list === 'string' && Object.hasOwn(MIGRATION_OP_FIELDS, op.list) ? MIGRATION_OP_FIELDS[op.list] : null;
    if (!allowed) { why(`unknown list ${String(op.list).slice(0, 30)}`); continue; }
    if (op.op === 'set') {
      if (typeof op.field !== 'string' || !allowed.includes(op.field)) { why(`${String(op.field).slice(0, 40)} is not a field a proposal may set`); continue; }
      if (op.list === 'doc') { doc[op.field] = str(op.value, 200); applied.push(op); continue; }
      const list = doc[op.list];
      const row = op.id != null ? list.find((r) => r.id === op.id) : list[Number(op.index)];
      if (!row) { why(`no row ${op.id ?? op.index} in ${op.list}`); continue; }
      row[op.field] = str(op.value, 2000);
      applied.push(op);
    } else if (op.op === 'add') {
      const fields = Object.hasOwn(ADD_FIELDS, op.list) ? ADD_FIELDS[op.list] : null;
      if (!fields) { why(`rows cannot be added to ${op.list}`); continue; }
      const src = op.row && typeof op.row === 'object' ? op.row : {};
      const row = {};
      for (const f of fields) if (src[f] != null) row[f] = str(src[f], 2000);
      if (!(row.name || row.text || row.table)) { why('a row needs a name, a text or a table'); continue; }
      const prefix = op.list === 'objects' ? 'O' : op.list === 'rules' ? 'R' : 'I';
      Object.assign(row, { id: nextId(doc[op.list], prefix) });
      if (op.list === 'objects') Object.assign(row, { owner: '', status: 'planned' });
      if (op.list === 'issues') Object.assign(row, { owner: '', status: 'open' });
      doc[op.list].push(row);
      applied.push({ ...op, id: row.id });
    } else why(`unknown op ${String(op.op).slice(0, 30)}`);
  }
  return { doc: normalizeMigrationDoc(doc), applied, skipped };
}

// ── page ──────────────────────────────────────────────────────────────────────────────────────────────────────
function summaryHtml(d, L) {
  const k = (label, value) => `<div class="kpi"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  return `<section class="summary"><h2>${esc(L.sum)}</h2><div class="kpis">
${k(L.objects, String(d.objects.length))}${k(L.counts, String(d.results.length))}${k(L.ng, String(d.results.filter((r) => r.verdict === 'ng').length))}${k(L.check, String(d.results.filter((r) => r.verdict === 'check').length))}${k(L.open, String(d.issues.filter((i) => i.status === 'open').length))}</div>
<div class="note">${esc(L.asOf)}</div></section>`;
}

export function migrationDocSchema(lang) {
  const L = T[langOf(lang)];
  return {
    labels: { edit: L.edit, done: L.done, save: L.save, addRow: L.addRow, delRow: L.delRow, empty: L.empty },
    sections: [
      { type: 'fields', title: L.title, fields: [{ path: 'title', label: L.title, type: 'text', wide: true }] },
      { type: 'table', title: L.objects, path: 'objects', idPrefix: 'O', columns: [
        { key: 'id', label: L.id, type: 'text' }, { key: 'module', label: L.module, type: 'text' }, { key: 'name', label: L.name, type: 'text', wide: true },
        { key: 'catalog', label: L.catalog, type: 'text' }, { key: 'approach', label: L.approach, type: 'select', options: optionsOf(APPROACHES, L.approaches), dflt: '' },
        { key: 'owner', label: L.owner, type: 'text' }, { key: 'sequence', label: L.sequence, type: 'text' },
        { key: 'status', label: L.status, type: 'select', options: optionsOf(OBJECT_STATUS, L.statuses), dflt: 'planned' }, { key: 'note', label: L.note, type: 'textarea' },
      ] },
      { type: 'table', title: L.runs, path: 'runs', columns: [
        { key: 'id', label: L.id, type: 'text', ro: true }, { key: 'label', label: L.label, type: 'text' },
        { key: 'planStart', label: L.planStart, type: 'date' }, { key: 'planEnd', label: L.planEnd, type: 'date' },
        { key: 'actualStart', label: L.actualStart, type: 'date' }, { key: 'actualEnd', label: L.actualEnd, type: 'date' },
        { key: 'cutoverTask', label: L.cutoverTask, type: 'text' }, { key: 'system', label: L.system, type: 'text' },
      ] },
      { type: 'table', title: L.rules, path: 'rules', idPrefix: 'R', columns: [
        { key: 'id', label: L.id, type: 'text' }, { key: 'objectId', label: L.objectId, type: 'text' },
        { key: 'kind', label: L.kind, type: 'select', options: optionsOf(RULE_KINDS, L.kinds), dflt: 'count' },
        { key: 'table', label: L.table, type: 'text' }, { key: 'field', label: L.field, type: 'text' },
        { key: 'filter', label: L.filter, type: 'text', wide: true }, { key: 'groupBy', label: L.groupBy, type: 'text' },
        { key: 'tolerance', label: L.tolerance, type: 'text' }, { key: 'note', label: L.note, type: 'textarea' },
      ] },
      { type: 'table', title: L.results, path: 'results', columns: [
        { key: 'runId', label: L.runId, type: 'select', options: optionsOf(RUN_IDS, L.runLabels), dflt: 'M1' }, { key: 'ruleId', label: L.ruleId, type: 'text' },
        { key: 'group', label: L.group, type: 'text' }, { key: 'source', label: L.source, type: 'text' }, { key: 'target', label: L.target, type: 'text', ro: true },
        { key: 'verdict', label: L.verdict, type: 'select', options: optionsOf(VERDICTS, L.verdicts), dflt: '' },
        { key: 'cause', label: L.cause, type: 'textarea' }, { key: 'system', label: L.system, type: 'text', ro: true }, { key: 'readAt', label: L.readAt, type: 'text', ro: true },
      ] },
      { type: 'table', title: L.issues, path: 'issues', idPrefix: 'I', columns: [
        { key: 'id', label: L.id, type: 'text' }, { key: 'objectId', label: L.objectId, type: 'text' }, { key: 'runId', label: L.runId, type: 'text' },
        { key: 'text', label: L.text, type: 'textarea', wide: true }, { key: 'cause', label: L.cause, type: 'textarea' },
        { key: 'owner', label: L.owner, type: 'text' }, { key: 'due', label: L.due, type: 'date' },
        { key: 'status', label: L.status, type: 'select', options: optionsOf(ISSUE_STATUS, L.issueStatuses), dflt: 'open' },
      ] },
    ],
  };
}

export function migrationDocPage(doc, { embed = false, lang = '' } = {}) {
  const d = normalizeMigrationDoc(doc);
  const l = langOf(lang || d.lang);
  return renderDocPage({ kind: 'migration', lang: l, title: d.title, subtitle: d.source?.code || '', model: d, schema: migrationDocSchema(l), summaryHtml: summaryHtml(d, T[l]), fileName: `${d.id || 'migration'}-migration.html`, embed });
}

export function migrationDocFromPage(html) {
  const got = modelFromDocPage(html, 'migration');
  return got ? { model: normalizeMigrationDoc(got.model) } : null;
}

// ── exports ───────────────────────────────────────────────────────────────────────────────────────────────────
const resultCols = (L) => [
  { key: 'runLabel', label: L.runId }, { key: 'objectId', label: L.objectId }, { key: 'ruleId', label: L.ruleId }, { key: 'kindText', label: L.kind },
  { key: 'table', label: L.table }, { key: 'field', label: L.field }, { key: 'group', label: L.group }, { key: 'source', label: L.source },
  { key: 'target', label: L.target }, { key: 'verdictText', label: L.verdict }, { key: 'cause', label: L.cause }, { key: 'system', label: L.system }, { key: 'readAt', label: L.readAt },
];
const resultRows = (d, L) => d.results.map((r) => {
  const rule = d.rules.find((x) => x.id === r.ruleId) || {};
  return { ...r, runLabel: d.runs.find((x) => x.id === r.runId)?.label || r.runId, objectId: rule.objectId || '', kindText: L.kinds[rule.kind] || '', table: rule.table || '', field: rule.field || '', verdictText: L.verdicts[r.verdict] };
});

export function migrationResultsCsv(doc) {
  const d = normalizeMigrationDoc(doc);
  const L = T[d.lang];
  return csvOf(resultRows(d, L), resultCols(L));
}

export function migrationDocXlsx(doc) {
  const d = normalizeMigrationDoc(doc);
  const L = T[d.lang];
  const table = (list, cols) => [cols.map((c) => c.label), ...list.map((r) => cols.map((c) => r[c.key] ?? ''))];
  return workbook([
    { name: L.results, rows: table(resultRows(d, L), resultCols(L)) },
    { name: L.objects, rows: table(d.objects, [{ key: 'id', label: L.id }, { key: 'module', label: L.module }, { key: 'name', label: L.name }, { key: 'catalog', label: L.catalog }, { key: 'approach', label: L.approach }, { key: 'owner', label: L.owner }, { key: 'status', label: L.status }]) },
    { name: L.rules, rows: table(d.rules, [{ key: 'id', label: L.id }, { key: 'objectId', label: L.objectId }, { key: 'kind', label: L.kind }, { key: 'table', label: L.table }, { key: 'field', label: L.field }, { key: 'filter', label: L.filter }, { key: 'groupBy', label: L.groupBy }, { key: 'tolerance', label: L.tolerance }]) },
    { name: L.issues, rows: table(d.issues, [{ key: 'id', label: L.id }, { key: 'objectId', label: L.objectId }, { key: 'runId', label: L.runId }, { key: 'text', label: L.text }, { key: 'owner', label: L.owner }, { key: 'due', label: L.due }, { key: 'status', label: L.status }]) },
  ]);
}

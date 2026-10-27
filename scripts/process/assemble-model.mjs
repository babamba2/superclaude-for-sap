// sc4sap:module-to-process — Step 7: state files → process-model.json, deterministically.
//
//   node assemble-model.mjs --state <STATE_DIR> [--scope <SCOPE_DIR>/scope.json] [--system DEV] [--title "…"] [--out <file>]
//                           [--bph <bph-skeleton.json> [--bph-sheet NAME]]   (bph-import.mjs read output → model.reconcile)
//
// Reads <STATE_DIR>/intake.json, step4.json (approved hierarchy), every step5.part-<k>.json and every
// step6.<M>.json (consultant review, optional) and writes process-model.json (model-schema.md):
//   · rows / lanes / systems from step4; step5 tasks → rows[code].task, row_patch merged; lanes_added /
//     systems_added appended; codes of step4 L4 rows of kind cbo / enh / ext without a sheet get a
//     to-be-confirmed line
//   · step6 patches: labels, owners, lanes_added, conversion (appended, de-duplicated), std_sheets
//     (std / manual tasks), glossary, open_questions — consultant wording wins over step4 labels
//   · scope.json → scope.packages[{name, tcodes, used}] and overview.scopeNote
// No LLM, no SAP call. Prints a one-line JSON summary.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcile } from './bph-import.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const uniq = (a) => [...new Set(a)];

const NOTE = {
  ko: (u, n, c, s) => `사용 실적 기준: 전체 TCode ${n}개 중 ${u}개 사용 (최근 ${c}개월, ${s})`,
  en: (u, n, c, s) => `Usage scope: ${u} of ${n} TCodes used (last ${c} months on ${s})`,
  ja: (u, n, c, s) => `利用実績: TCode ${n} 件中 ${u} 件を利用 (直近 ${c} か月, ${s})`,
};
const MISSING = { ko: 'Task 시트가 생성되지 않았어요', en: 'Task sheet not generated', ja: 'タスクシート未作成' };
const TITLE = { ko: '프로세스 맵', en: 'Process Map', ja: 'プロセスマップ' };

export function assembleModel({ intake, step4, parts = [], reviews = [], scope = null, system = '', title = '' }) {
  const lang = intake.language || intake.lang || 'ko';
  const L = lang.slice(0, 2);
  const lanes = [...arr(step4.lanes)];
  const systems = [...arr(step4.systems)];
  const addLane = (l) => { if (l?.id && !lanes.some(x => x.id === l.id)) lanes.push(l); };
  const addSys = (s) => { if (s?.id && !systems.some(x => x.id === s.id)) systems.push(s); };
  const rows = arr(step4.rows).map(r => ({ ...r }));
  const byCode = new Map(rows.map(r => [r.code, r]));
  const open = [...arr(step4.open_questions)];
  const cross = [...arr(step4.cross_module)];
  const glossary = [];
  const sheeted = new Set();

  for (const p of parts) {
    arr(p.lanes_added).forEach(addLane);
    arr(p.systems_added).forEach(addSys);
    cross.push(...arr(p.cross_module));
    open.push(...arr(p.open_questions));
    for (const t of arr(p.tasks)) {
      const row = byCode.get(t.code);
      if (!row) { open.push(`Task sheet for unknown code ${t.code} ignored`); continue; }
      if (t.row_patch) Object.assign(row, t.row_patch);
      row.task = t.task || {};
      sheeted.add(t.code);
    }
  }
  for (const r of rows) {
    if (r.level === 4 && ['cbo', 'enh', 'ext'].includes(r.kind) && !sheeted.has(r.code)) {
      r.task = { ...(r.task || {}), tbd: [...arr(r.task?.tbd), MISSING[L] || MISSING.en] };
    }
  }
  for (const v of reviews) {
    arr(v.lanes_added).forEach(addLane);
    for (const x of arr(v.labels)) { const r = byCode.get(x.code); if (r) { if (x.label) r.label = x.label; if (x.desc) r.desc = x.desc; } }
    for (const x of arr(v.owners)) { const r = byCode.get(x.code); if (r && x.owner) { r.owner = x.owner; r.ownerEstimated = x.ownerEstimated !== false; } }
    for (const x of arr(v.conversion)) {
      const r = byCode.get(x.code);
      if (r) r.task = { ...(r.task || {}), conversion: uniq([...arr(r.task?.conversion).map(c => (typeof c === 'string' ? c : c.text)), ...arr(x.notes)]) };
    }
    for (const x of arr(v.std_sheets)) {
      const r = byCode.get(x.code);
      if (r && !sheeted.has(x.code)) r.task = { ...(r.task || {}), definition: x.definition, ...(x.output ? { output: x.output } : {}), ...(x.timing ? { timing: x.timing } : {}) };
    }
    glossary.push(...arr(v.glossary));
    open.push(...arr(v.open_questions));
  }

  // Cross-module rows: {from, to, object, desc}. A part may write {from: <task code>, module, note} — map it
  // (from = this module, object = the task code); exact duplicates are dropped.
  const crossModule = [];
  const seenX = new Set();
  for (const c of cross) {
    const x = c.from && !/^\d+(\.\d+)*$/.test(c.from) ? c
      : { from: intake.module, to: c.to || c.module || '', object: c.object || c.from || c.code || '', desc: c.desc || c.note || '' };
    const k = `${x.from}|${x.to}|${x.object}|${x.desc}`;
    if (!seenX.has(k)) { seenX.add(k); crossModule.push({ from: x.from, to: x.to, object: x.object, desc: x.desc }); }
  }

  const pkgs = scope?.perPackage
    ? Object.entries(scope.perPackage).map(([name, c]) => ({ name, tcodes: c.tcodes, used: c.used }))
    : arr(intake.packages).map(name => ({ name }));
  const w = scope?.window || {};
  const scopeNote = scope?.tcodes ? (NOTE[L] || NOTE.en)(scope.tcodes.used, scope.tcodes.inScope, w.coverage ?? w.months ?? '?', w.system || '') : '';
  const l4 = rows.filter(r => r.level === 4);
  const l2 = rows.filter(r => r.level === 2);
  return {
    schema: 1,
    module: intake.module,
    modules: arr(intake.modules).length ? intake.modules : [intake.module],
    lang,
    title: title || `${intake.module} ${TITLE[L] || TITLE.en}`,
    system,
    sapVersion: intake.sapVersion || '',
    changeNote: intake.changeNote || '',
    scope: { packages: pkgs, tcodes: [], systems },
    lanes,
    overview: {
      summary: `${l2.map(r => r.label).join(' · ')} — L4 ${l4.length} (CBO ${l4.filter(r => r.kind === 'cbo').length}, std ${l4.filter(r => r.kind === 'std').length})`,
      ...(scopeNote ? { scopeNote } : {}),
    },
    rows,
    crossModule,
    notEvidenced: arr(step4.not_evidenced),
    openQuestions: uniq(open.map(q => (typeof q === 'string' ? q : q.text))),
    glossary: glossary.filter((g, i) => glossary.findIndex(x => x.term === g.term) === i),
  };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const args = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const st = get('--state');
  if (!st) {
    console.error('Usage: node assemble-model.mjs --state <STATE_DIR> [--scope scope.json] [--system DEV] [--title "…"] [--out file]');
    process.exit(2);
  }
  try {
    const files = readdirSync(st);
    const parts = files.filter(f => /^step5\.part-\d+\.json$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])).map(f => readJson(join(st, f)));
    const reviews = files.filter(f => /^step6\..+\.json$/.test(f)).map(f => readJson(join(st, f)));
    const scopePath = get('--scope');
    const model = assembleModel({
      intake: readJson(join(st, 'intake.json')), step4: readJson(join(st, 'step4.json')), parts, reviews,
      scope: scopePath && existsSync(scopePath) ? readJson(scopePath) : null, system: get('--system') || '', title: get('--title') || '',
    });
    const bphPath = get('--bph');
    if (bphPath && existsSync(bphPath)) {
      const sk = readJson(bphPath);
      const sheet = sk.sheets.find(s => s.name === get('--bph-sheet')) || sk.sheets.find(s => s.name.toUpperCase() === String(model.module).toUpperCase()) || sk.sheets[0];
      if (sheet) model.reconcile = { source: sk.source, ...reconcile(model, sheet) };
    }
    const out = get('--out') || join(st, 'process-model.json');
    writeFileSync(out, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
    const l4 = model.rows.filter(r => r.level === 4);
    console.log(JSON.stringify({ out: resolve(out), parts: parts.length, reviews: reviews.length, rows: model.rows.length, l4: l4.length,
      sheets: l4.filter(r => r.task?.definition).length, openQuestions: model.openQuestions.length }));
  } catch (e) {
    console.error(`assemble-model: ${e.message}`);
    process.exit(1);
  }
}

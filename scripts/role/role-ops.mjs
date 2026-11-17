// sc4sap:role-matrix — document operations without files (the CLI and the web workbench use the same functions).
//
//   modelFromDraft(draft, doc, lang)     a new document from a draft (example-draft.json shape; init --from)
//   addSodRules(model, modules, lang, library?)  the SoD library rules of those modules (skips kinds already there)
//   applyPatch(model, ops)               AI proposals: new rows, and text fields of existing rows only
//   csvSheets(model, lang?)              { sheet: csv } — the page's CSV columns, every row
//   summary(model)                       one list card of the web workbench
//
// applyPatch never touches the users sheet, the change history, approvals, levels / assignments / authorization
// values / org values of existing rows, or the document's author / reviewer: those stay with people in the page.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeModel, deriveView, toCsv, arr, LEVELS, ROLE_TYPES, MODULES, RISK } from './role-model.mjs';
import { labelsFor, sheetsOf, sheetColumns, cellValue } from './role-render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const langOf = (l) => (['en', 'ja'].includes(l) ? l : 'ko');

/** The rules of sod-library.json (read once). */
let LIB = null;
export const sodLibrary = () => (LIB ??= JSON.parse(readFileSync(join(here, 'sod-library.json'), 'utf8')).rules);

/** A new document from a draft: the draft's language wins over `lang`; `doc` fields given (non-empty) win over the draft's. No history row yet. */
export function modelFromDraft(draft = {}, doc = {}, lang = 'ko') {
  const d = draft && typeof draft === 'object' ? draft : {};
  const model = normalizeModel({ ...d, lang: d.lang || lang, doc: { mode: 'new', ...(d.doc || {}), ...Object.fromEntries(Object.entries(doc || {}).filter(([, x]) => x)) } });
  model.revisions = [];
  return model;
}

/** The SoD library rules of `modules` added as open rules; a rule whose kind is already in the document is skipped. */
export function addSodRules(model0, modules, lang = '', library = null) {
  const model = normalizeModel(JSON.parse(JSON.stringify(model0 || {})));
  const l = langOf(lang || model.lang);
  const want = arr(modules).map((m) => String(m).toUpperCase());
  let added = 0;
  for (const r of arr(library || sodLibrary()).filter((x) => want.includes(x.module))) {
    const kind = r.kind[l] || r.kind.en;
    if (model.sod.some((s) => s.kind === kind)) continue;
    model.sod.push({ id: `SOD-${String(model.sod.length + 1).padStart(2, '0')}`, a: '', b: '', kind, risk: r.risk[l] || r.risk.en, level: r.level, mitigation: '', approver: '',
      status: 'open', note: `A: ${r.tcodesA.join(', ')} / B: ${r.tcodesB.join(', ')}`, tcodesA: r.tcodesA, tcodesB: r.tcodesB });
    added++;
  }
  return { model: normalizeModel(model), added };
}

// ---------- AI proposals ----------
// New rows: these fields only (no approval, approver, owner, status — the defaults apply).
export const ADD_FIELDS = {
  broles: ['id', 'name', 'nameEn', 'module', 'desc', 'tasks', 'org', 'troles', 'note'],
  troles: ['id', 'desc', 'type', 'parent', 'module', 'brole', 'orgLevel', 'orgValue', 'children', 'note'],
  tcodes: ['tcode', 'module', 'area', 'text', 'levels', 'note'],
  auths: ['trole', 'object', 'objText', 'field', 'fieldText', 'value', 'note'],
  sod: ['id', 'a', 'b', 'kind', 'risk', 'level', 'mitigation', 'note', 'tcodesA', 'tcodesB'],
};
// Existing rows: text fields only, found by their key (auths: the row index).
export const TEXT_FIELDS = {
  broles: { key: 'id', fields: ['name', 'nameEn', 'desc', 'tasks', 'note'] },
  troles: { key: 'id', fields: ['desc', 'note'] },
  tcodes: { key: 'tcode', fields: ['text', 'note'] },
  auths: { key: '#', fields: ['objText', 'fieldText', 'note'] },
  sod: { key: 'id', fields: ['kind', 'risk', 'mitigation', 'note'] },
};
const MAX_TEXT = 2000;
// An allow-list entry for a key from the input: own keys only ("constructor", "__proto__", "toString" → none).
const own = (map, key) => (typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null);
const text = (v) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : null);

/**
 * ops: { op: 'add-row', sheet, row } | { op: 'set-text', sheet, key, field, value }.
 * Returns { model (a new object), applied, skipped: [{ index, why }] }.
 */
export function applyPatch(model0, ops) {
  const model = normalizeModel(JSON.parse(JSON.stringify(model0 || {})));
  const applied = [], skipped = [];
  arr(ops).forEach((o, index) => {
    const skip = (why) => skipped.push({ index, why });
    if (!o || typeof o !== 'object') return skip('not an op');
    const sheet = o.sheet;
    if (sheet === 'users') return skip('the users sheet is never changed by a proposal');
    if (sheet === 'revisions') return skip('the change history is written by saving a version');
    if (sheet === 'doc' || sheet === 'cover') return skip('document author / reviewer are not proposals');
    if (o.op === 'add-row') {
      const allowed = own(ADD_FIELDS, sheet);
      if (!allowed) return skip(`sheet "${String(sheet).slice(0, 30)}" takes no new rows`);
      const row = o.row && typeof o.row === 'object' && !Array.isArray(o.row) ? o.row : null;
      if (!row) return skip('row must be an object');
      const extra = Object.keys(row).filter((k) => !allowed.includes(k));
      if (extra.length) return skip(`not allowed in a new ${sheet} row: ${extra.join(', ')}`);
      for (const [k, v] of Object.entries(row)) if (typeof v === 'string' && v.length > MAX_TEXT) return skip(`${k} too long`);
      if (sheet === 'tcodes') {
        if (!String(row.tcode || '').trim()) return skip('tcode missing');
        if (model.tcodes.some((t) => t.tcode === String(row.tcode).toUpperCase())) return skip(`T-code ${String(row.tcode).toUpperCase()} is already listed`);
        const lv = row.levels || {};
        if (typeof lv !== 'object' || Array.isArray(lv) || Object.values(lv).some((x) => !LEVELS.includes(String(x).toUpperCase()))) return skip('levels must be F, C or D per business role');
      }
      if (['broles', 'troles', 'sod'].includes(sheet) && row.id && model[sheet].some((x) => x.id.toUpperCase() === String(row.id).toUpperCase())) return skip(`${sheet} ${row.id} already exists`);
      if (sheet === 'broles' && !String(row.id || '').trim()) return skip('business role id missing');
      if (sheet === 'troles' && !String(row.id || '').trim()) return skip('technical role id missing');
      if (sheet === 'troles' && row.type && !ROLE_TYPES.includes(row.type)) return skip('unknown role type');
      if (sheet === 'sod' && row.level && !RISK.includes(String(row.level).toUpperCase())) return skip('SoD level must be H, M or L');
      if ((sheet === 'broles' || sheet === 'troles') && row.module && !MODULES.includes(String(row.module).toUpperCase()) && !/^[A-Z]{2,5}$/.test(String(row.module))) return skip('unknown module');
      model[sheet].push(row);
      applied.push({ index, op: 'add-row', sheet });
      return;
    }
    if (o.op === 'set-text') {
      const t = own(TEXT_FIELDS, sheet);
      if (!t) return skip(`sheet "${String(sheet).slice(0, 30)}" has no text a proposal may change`);
      if (!t.fields.includes(o.field)) return skip(`field "${String(o.field).slice(0, 30)}" of ${sheet} is not text (levels, assignments, values and approvals are changed in the page)`);
      const value = text(o.value);
      if (value === null) return skip('value must be text');
      if (value.length > MAX_TEXT) return skip('text too long');
      const rows = model[sheet];
      const row = t.key === '#' ? (Number.isInteger(o.key) ? rows[o.key] : null) : rows.find((r) => String(r[t.key]).toUpperCase() === String(o.key ?? '').toUpperCase());
      if (!row) return skip(`${sheet} row "${String(o.key).slice(0, 40)}" not found`);
      row[o.field] = value;
      applied.push({ index, op: 'set-text', sheet, key: o.key, field: o.field });
      return;
    }
    return skip(`unknown op "${String(o.op).slice(0, 30)}" (add-row, set-text)`);
  });
  return { model: normalizeModel(model), applied, skipped };
}

/** Every sheet as CSV with the page's columns (header: column title, a role column with the role's name), all rows. */
export function csvSheets(model0, lang = '') {
  const model = normalizeModel(model0 || {});
  const L = labelsFor(lang || model.lang, model.layout), v = deriveView(model);
  const name = (id) => { const b = model.broles.find((x) => x.id === id); return b && b.name ? ` ${b.name}` : ''; };
  const out = {};
  for (const s of sheetsOf(L)) {
    const cs = sheetColumns(s, v, L);
    out[s] = toCsv(cs.map((c) => c.h + (c.role ? name(c.role) : '')), arr(model[s]).map((r) => cs.map((c) => String(cellValue(s, r, c, v, L)))));
  }
  return out;
}

/** List card: code, project, system, module, role / T-code / user / authorization counts, SoD conflicts, version. */
export function summary(model0) {
  const model = normalizeModel(model0 || {});
  const v = deriveView(model);
  return { kind: 'roles', code: model.doc.code, project: model.doc.project, system: model.doc.system, module: model.doc.module, lang: model.lang,
    broles: model.broles.length, troles: model.troles.length, tcodes: model.tcodes.length, users: model.users.length, auths: model.auths.length,
    sod: model.sod.length, sodBroken: v.totals.sodBroken, checks: v.checks.length, errors: v.checks.filter((c) => c.sev === 'err').length,
    version: String(arr(model.revisions).at(-1)?.ver || '').replace(/^v/i, '') };
}

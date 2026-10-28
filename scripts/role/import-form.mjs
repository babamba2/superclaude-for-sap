// sc4sap:role-matrix — takes the content of a company's filled-in role workbook (.xlsx) into a document model.
//
// Where each value sits is told by the company layout (skills/role-matrix/layout.md), one `form` block per sheet:
//   "form": { "sheet": "<workbook sheet name>", "from": 5, "to": 0,
//             "cols": { "A": "module", "B": "id", "C": ["parent", "brole"], "D": "e:lv1" },
//             "roles": { "row": 4, "cols": "H:R" },      matrix sheets: the row holding the role IDs over the marks
//             "set": { "orgLevel": "Sales Org" },      values for every row (when its cell is empty)
//             "fill": ["e:lv1", "e:lv2", "e:lv3"] }      menu levels, top first: a blank level takes the value above it
//                                                       until a higher level changes (the form writes a level once)
// A row with nothing in the mapped cells is skipped. Matrix marks become levels through the layout's codes
// (levelMark / levels) or F / C / D; on the user sheet any mark assigns the role.

import { arr, LEVELS, normalizeModel } from './role-model.mjs';
import { labelsFor, SHEETS } from './role-render.mjs';
import { readXlsx, cellText, colNum } from './xlsx-read.mjs';

const LIST_KEYS = { broles: ['troles'], troles: ['children'] };

function put(rec, key, val, sheet) {
  if (key.startsWith('e:')) { rec.ext = rec.ext || {}; if (val) rec.ext[key.slice(2)] = val; return; }
  if (LIST_KEYS[sheet]?.includes(key)) { rec[key] = [...arr(rec[key]), ...val.split(/[,;\s]+/).filter(Boolean)]; return; }
  if (val && !rec[key]) rec[key] = val;
}

/** Reads the workbook through the layout's `form` blocks → { model (partial), counts, warnings }. */
export function importForm(file, layout, { lang = 'ko' } = {}) {
  const wb = readXlsx(file);
  const L = labelsFor(lang, layout);
  const out = {}, counts = {}, warnings = [];
  for (const sh of arr(layout?.sheets)) {
    const f = sh?.form;
    if (!f || !SHEETS.includes(sh.key)) continue;
    const ws = wb.sheets.find((x) => x.name === f.sheet) || (Number.isInteger(f.sheet) ? wb.sheets[f.sheet - 1] : null);
    if (!ws) { warnings.push(`${sh.key}: sheet "${f.sheet}" not in the workbook (${wb.sheets.map((x) => x.name).join(', ')})`); continue; }
    const cols = Object.entries(f.cols || {}).map(([c, k]) => [colNum(c), [].concat(k).map(String)]);
    let roles = [];
    if (f.roles?.cols) {
      const [a, b = a] = String(f.roles.cols).split(':').map(colNum);
      for (let c = a; c <= b; c++) { const id = cellText(ws, Number(f.roles.row), c).toUpperCase(); if (id) roles.push([c, id]); }
      if (!roles.length) warnings.push(`${sh.key}: no role IDs in row ${f.roles.row}, columns ${f.roles.cols}`);
    }
    const rows = [], fill = arr(f.fill).map(String);
    let odd = 0, prev = {};
    for (let r = Number(f.from) || 1; r <= (Number(f.to) || ws.maxRow); r++) {
      const rec = {};
      let any = false;
      for (const [c, keys] of cols) { const v = cellText(ws, r, c); if (v) any = true; for (const k of keys) put(rec, k, v, sh.key); }
      for (const [c, id] of roles) {
        const v = cellText(ws, r, c); if (!v) continue;
        any = true;
        if (sh.key === 'users') { (rec.roles ||= {})[id] = 'X'; continue; }
        const u = v.toUpperCase();
        let lv = L.lvIn?.[u] || (LEVELS.includes(u) ? u : '');
        if (!lv) { lv = 'F'; odd++; }
        (rec.levels ||= {})[id] = lv;
      }
      if (!any) continue;
      if (fill.length) {
        const get = (k) => (k.startsWith('e:') ? rec.ext?.[k.slice(2)] : rec[k]) || '';
        const top = fill.findIndex((k) => get(k));
        // levels above the first one this row writes come from the row above; below it, from this row
        fill.forEach((k, j) => { const v = top < 0 || j < top ? prev[k] || '' : get(k); if (v) put(rec, k, v, sh.key); prev[k] = v; });
      }
      for (const [k, v] of Object.entries(f.set || {})) if (!rec[k]) rec[k] = v;
      rows.push(rec);
    }
    if (odd) warnings.push(`${sh.key}: ${odd} matrix mark(s) not one of the level codes — taken as ${L.lvOut?.F || 'F'}`);
    out[sh.key] = [...arr(out[sh.key]), ...rows];
    counts[sh.key] = rows.length;
  }
  // a technical role that names itself as master is the master; business roles list their technical roles
  for (const t of arr(out.troles)) if (t.parent && String(t.parent).toUpperCase() === String(t.id || '').toUpperCase()) { t.parent = ''; if (!t.type || t.type === 'Derived') t.type = 'Master'; }
  for (const b of arr(out.broles)) {
    if (arr(b.troles).length) continue;
    b.troles = arr(out.troles).filter((t) => [t.brole, t.parent, t.id].map((x) => String(x || '').toUpperCase()).includes(String(b.id).toUpperCase())).map((t) => t.id);
  }
  if (!Object.keys(counts).length) warnings.push('the layout has no sheet with a `form` block — nothing read');
  return { model: normalizeModel({ lang, ...out }), counts, warnings };
}

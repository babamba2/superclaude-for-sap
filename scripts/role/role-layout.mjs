// sc4sap:role-matrix — company layouts: load one (logo file → data URI), check it against the sheets, and list the
// columns a layout can map to. The layout itself is drawn by role-render.mjs (labelsFor / sheetColumns / sheetsOf).
//
// A layout belongs to the customer: it lives under <artifactBase>/roles/_layouts/, never in the plugin.
// Schema: skills/role-matrix/layout.md.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { arr, LEVELS, normalizeModel, deriveView } from './role-model.mjs';
import { labelsFor, sheetColumns, SHEETS } from './role-render.mjs';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const LOGO_MAX = 300 * 1024;
const COVER_KEYS = ['project', 'system', 'author', 'date', 'version', 'reviewer', 'source'];
const HIDE = ['summary', 'checks', 'sheets', 'legend'];

/** Every column a layout can name, per sheet: key, default header, kind. Role columns are one `@roles` entry. */
export function columnCatalog(lang = 'ko') {
  const L = labelsFor(lang);
  const v = deriveView(normalizeModel({ lang, broles: [{ id: 'R-01' }] }));
  const out = {};
  for (const s of SHEETS) {
    const cols = sheetColumns(s, v, L, true);
    const plain = cols.filter((c) => c.type !== 'level' && c.type !== 'x').map((c) => ({ k: c.k, h: c.h, type: c.type || 'text', ...(c.key ? { key: true } : {}) }));
    if (cols.some((c) => c.type === 'level' || c.type === 'x')) plain.push({ k: '@roles', h: s === 'tcodes' ? 'role columns (F/C/D)' : 'role columns (X)', type: 'roles' });
    out[s] = { title: L.heads[s][0], tab: L.tabs[s], cols: plain };
  }
  return { sheets: out, cover: COVER_KEYS.map((k) => ({ k, h: L.cover.fields[k] })), levels: LEVELS, hide: HIDE };
}

/** Problems a layout has (errors stop the build, warnings are reported). */
export function checkLayout(layout) {
  const errors = [], warnings = [];
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return { errors: ['layout is not a JSON object'], warnings };
  const cat = columnCatalog('ko');
  const seen = new Set();
  for (const sh of arr(layout.sheets)) {
    if (!SHEETS.includes(sh?.key)) { errors.push(`unknown sheet "${sh?.key}" (one of ${SHEETS.join(', ')})`); continue; }
    if (seen.has(sh.key)) warnings.push(`sheet ${sh.key} listed twice — the first one counts`);
    seen.add(sh.key);
    const known = new Set(cat.sheets[sh.key].cols.map((c) => c.k));
    for (const c of arr(sh.cols)) {
      const k = String(c?.k || '');
      if (!known.has(k) && !/^e:\w+$/.test(k)) errors.push(`${sh.key}: unknown column "${k}" — use a listed key, @roles, or e:<name> for a company column`);
    }
    for (const g of arr(sh.groups)) for (const k of arr(g?.cols)) if (k !== '@roles' && !arr(sh.cols).some((c) => c?.k === k)) warnings.push(`${sh.key}: group "${g.h}" names ${k}, which is not one of its columns`);
    if (sh.form) {
      const fm = sh.form;
      if (!fm.sheet && fm.sheet !== 0) errors.push(`${sh.key}.form: sheet (workbook sheet name) is required`);
      for (const [col, ks] of Object.entries(fm.cols || {})) {
        if (!/^[A-Z]{1,3}$/.test(col)) errors.push(`${sh.key}.form: "${col}" is not a column letter`);
        for (const k of [].concat(ks)) if (!known.has(k) && !/^e:\w+$/.test(k)) errors.push(`${sh.key}.form: unknown key "${k}" in column ${col}`);
      }
      if (fm.roles && !(/^[A-Z]{1,3}(:[A-Z]{1,3})?$/.test(String(fm.roles.cols || '')) && Number(fm.roles.row) > 0)) errors.push(`${sh.key}.form.roles: give { row: <n>, cols: "H:R" }`);
      if (fm.roles && sh.key !== 'tcodes' && sh.key !== 'users') warnings.push(`${sh.key}.form.roles: only the tcodes and users sheets have role columns — ignored`);
    }
    const key = cat.sheets[sh.key].cols.find((c) => c.key);
    if (arr(sh.cols).length && key && !arr(sh.cols).some((c) => c.k === key.k)) warnings.push(`${sh.key}: key column ${key.k} not listed — it is shown first`);
  }
  if (arr(layout.sheets).length && !seen.has('revisions')) warnings.push('sheet revisions (change history) is hidden — versions are still recorded in the model');
  const codes = LEVELS.map((k) => String(layout.levels?.[k]?.code || k).toUpperCase());
  if (layout.levelMark != null && !layout.levelMark?.code) errors.push('levelMark needs a code (the one sign the form uses for access)');
  if (layout.levelMark?.code && layout.levels) warnings.push('levelMark is set — levels are ignored (every level shows the one mark)');
  else if (new Set(codes).size !== codes.length) errors.push(`level codes must differ: ${codes.join(' / ')}`);
  for (const k of Object.keys(layout.levels || {})) if (!LEVELS.includes(k)) errors.push(`levels: "${k}" is not one of F, C, D`);
  for (const f of arr(layout.cover?.fields)) if (!COVER_KEYS.includes(f?.k) && !/^e_\w+$/.test(String(f?.k || ''))) errors.push(`cover: unknown field "${f?.k}" — use ${COVER_KEYS.join(', ')} or e_<name>`);
  for (const h of arr(layout.cover?.hide)) if (!HIDE.includes(h)) warnings.push(`cover.hide: "${h}" is not one of ${HIDE.join(', ')}`);
  for (const k of ['accent', 'head', 'headFg', 'line', 'link', 'mxHead']) if (layout.theme?.[k] && !/^#[0-9a-f]{3,8}$/i.test(layout.theme[k])) warnings.push(`theme.${k}: "${layout.theme[k]}" is not a #hex colour — ignored`);
  return { errors, warnings };
}

/** Reads a layout file; a logo given as a file path (relative to the layout) becomes a data URI. */
export function loadLayout(file) {
  const layout = JSON.parse(readFileSync(file, 'utf8'));
  const logo = layout?.theme?.logo;
  if (logo && !/^data:image\//.test(logo)) {
    const p = resolve(dirname(file), logo);
    const mime = MIME[extname(p).toLowerCase()];
    if (!existsSync(p) || !mime) throw new Error(`theme.logo ${logo}: not an image file next to the layout`);
    if (statSync(p).size > LOGO_MAX) throw new Error(`theme.logo ${logo}: larger than ${LOGO_MAX / 1024} KB`);
    layout.theme.logo = `data:${mime};base64,${readFileSync(p).toString('base64')}`;
  }
  return layout;
}

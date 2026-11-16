// sc4sap:role-matrix — the workbook as an .xlsx file (zero-dependency; the UAT writer's workbook()).
//
//   roleXlsx(model, { lang, version, date }) → Buffer
// A cover sheet (document fields, summary, checks) and one sheet per page sheet — business roles, technical roles,
// role × T-code (F / C / D), user × role, authorization objects, SoD, change history — with the page's columns and
// cell values. A company layout (model.layout) names the sheets and orders / hides the columns, as on the page.

import { workbook } from '../uat/uat-xlsx.mjs';
import { normalizeModel, deriveView, arr } from './role-model.mjs';
import { labelsFor, sheetsOf, sheetColumns, cellValue } from './role-render.mjs';

const H = (cells) => cells.map((v) => ({ v, s: 1 }));
const S = (v) => ({ v, s: 3 });

export function roleXlsx(model0, { lang = '', version = '', date = '' } = {}) {
  const model = normalizeModel(model0 || {});
  const L = labelsFor(lang || model.lang, model.layout), v = deriveView(model), d = model.doc, F = L.cover.fields;
  const ver = version || String(arr(model.revisions).at(-1)?.ver || '').replace(/^v/i, '');
  const name = (id) => { const b = model.broles.find((x) => x.id === id); return b && b.name ? ` ${b.name}` : ''; };
  const RO = { date: date || d.date, version: ver ? `v${ver}` : '', source: model.source ? `${L.cover.mode.sap} · ${model.source.system || ''} · ${model.source.readAt || ''}` : L.cover.mode[d.mode] || '' };
  const keys = arr(L.layout?.cover?.fields).map((f) => String(f.k || '')).filter((k) => k in F || /^e_\w+$/.test(k));
  const info = (keys.length ? keys : ['project', 'system', 'author', 'date', 'version', 'reviewer', 'source']).map((k) => [F[k] || k, k in RO ? RO[k] : d[k] ?? '']);
  const cover = [
    [{ v: L.title, s: 2 }], [],
    [S(L.cover.info.replace(/^■\s*/, ''))], ...info,
    [], [S(L.cover.summary.replace(/^■\s*/, ''))], ...Object.entries(L.cover.sum).map(([k, lab]) => [lab, v.totals[k]]),
    [], [S(L.cover.checks.replace(/^■\s*/, ''))], ...(v.checks.length ? v.checks.map((c) => [L.sev[c.sev], `${L.tabs[c.sheet] || c.sheet} · ${c.text}${c.ref ? ` · ${c.ref}` : ''}`]) : [[L.cover.noChecks, '']]),
    [], [S(L.cover.legend.replace(/^■\s*/, ''))], ...L.cover.legendRows.map(([k, t]) => [k, t]),
  ];
  const sheets = sheetsOf(L).map((s) => {
    const cs = sheetColumns(s, v, L);
    return {
      name: String(L.tabs[s] || s),
      rows: [H(cs.map((c) => c.h + (c.role ? name(c.role) : ''))), ...arr(model[s]).map((r) => cs.map((c) => cellValue(s, r, c, v, L)))],
      widths: cs.map((c) => (c.role ? 6 : c.wrap ? 40 : c.w ? Math.round(c.w / 7) : 14)),
    };
  });
  return workbook([{ name: L.tabs.cover || 'Cover', rows: cover, widths: [28, 70] }, ...sheets]);
}

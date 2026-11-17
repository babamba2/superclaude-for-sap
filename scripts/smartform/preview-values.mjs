// sc4sap:smartform-preview — preview values from interface values: the same data a SAP render (RenderSmartForm)
// gets, turned into the "as printed" values the preview takes, so a preview and SAP's print of the same data can be
// compared. No SAP call.
//
//   valuesFromRaw(content, raw, { ddic, dateFormat, decimal, group }) → { values, rows }
//     content  GetSmartFormContent's content.json (loops / tables: data table and work area)
//     raw      interface values: { PARAM: scalar | { FIELD } | [ { FIELD } ] } (globals too, e.g. sums)
//     ddic     { "PARAM-FIELD": { type, length, decimals } } (types decide the printed form)
//     dateFormat  the print user's date format: 'MM/DD/YYYY' (default), 'DD.MM.YYYY', 'YYYY/MM/DD', 'YYYY.MM.DD' …
//
// Output: structures as "PARAM-FIELD", table rows as "WA-FIELD": [row values] for the work area the form loops into
// (and "TABLE-FIELD" too), rows = the longest table. Dates DATS → the date format, times TIMS → HH:MM:SS,
// CURR / DEC / QUAN → grouped with the DDIC decimals (CURR: the currency's decimals when a key field is given),
// NUMC / CHAR / others as given.

const up = (s) => String(s ?? '').trim().toUpperCase();
const CUR_DEC = { JPY: 0, KRW: 0, VND: 0, IDR: 0, CLP: 0, ISK: 0, HUF: 2, KWD: 3, BHD: 3, JOD: 3, OMR: 3, TND: 3 };

function fmtDate(v, f) {
  const s = String(v ?? '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(s) || /^0+$/.test(s)) return String(v ?? '');
  const Y = s.slice(0, 4), M = s.slice(4, 6), D = s.slice(6, 8);
  return f.replace('YYYY', Y).replace('MM', M).replace('DD', D);
}

function fmtTime(v) {
  const s = String(v ?? '').replace(/\D/g, '');
  return /^\d{6}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}` : String(v ?? '');
}

function fmtNum(v, dec, { decimal = '.', group = ',' } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  const [ip, fp] = Math.abs(n).toFixed(dec).split('.');
  const g = ip.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  // SAP writes the minus sign after the number, a positive number keeps that place as a blank (a right-aligned
  // amount ends one character short of the cell: SF_SUBTOTALS / SF_TOTALS on S4-DEV, build-preview R60)
  return `${g}${fp ? decimal + fp : ''}${n < 0 ? '-' : ' '}`;
}

/** Work areas the form's loops and tables use for each data table (TABLE → [WA …]). */
function workAreas(content) {
  const map = {};
  const walk = (list) => {
    for (const n of list || []) {
      const t = up(n.dataTable), wa = up(n.attrs?.TABHEADER);
      if (t && wa) (map[t] ||= new Set()).add(wa);
      walk(n.children);
    }
  };
  for (const p of content?.pages || []) for (const w of p.windows || []) walk(w.content);
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v]]));
}

export function valuesFromRaw(content, raw = {}, { ddic = {}, dateFormat = 'MM/DD/YYYY', decimal = '.', group = ',' } = {}) {
  const dd = {};
  for (const [k, v] of Object.entries(ddic || {})) dd[up(k)] = v;
  const was = workAreas(content);
  const values = {};
  let rows = 0;
  const fmt = (param, field, v, rec) => {
    const t = dd[`${param}-${field}`];
    const type = up(t?.type);
    if (v === null || v === undefined) return '';
    if (type === 'DATS') return fmtDate(v, dateFormat);
    if (type === 'TIMS') return fmtTime(v);
    if (/^(CURR|DEC|QUAN|FLTP|P)$/.test(type)) {
      let dec = Number(t?.decimals ?? 2);
      if (type === 'CURR') {
        // the currency key of the row (a CUKY field of the same structure) decides the decimals
        const key = Object.entries(rec || {}).find(([f]) => up(dd[`${param}-${up(f)}`]?.type) === 'CUKY')?.[1];
        if (key !== undefined && CUR_DEC[up(key)] !== undefined) dec = CUR_DEC[up(key)];
      }
      return fmtNum(v, dec, { decimal, group });
    }
    if (/^(INT1|INT2|INT4|INT8)$/.test(type)) return String(Math.round(Number(v)));
    return String(v);
  };
  for (const [k, v] of Object.entries(raw || {})) {
    const P = up(k);
    if (Array.isArray(v)) {
      rows = Math.max(rows, v.length);
      const fields = [...new Set(v.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r).map(up) : [])))];
      for (const f of fields) {
        const col = v.map((r) => { const e = Object.entries(r || {}).find(([x]) => up(x) === f); return fmt(P, f, e?.[1], r); });
        values[`${P}-${f}`] = col;
        for (const wa of was[P] || []) values[`${wa}-${f}`] = col;
      }
    } else if (v && typeof v === 'object') {
      for (const [f, x] of Object.entries(v)) values[`${P}-${up(f)}`] = fmt(P, up(f), x, v);
    } else values[P] = fmt(P, '', v, null);
  }
  return { values, rows };
}

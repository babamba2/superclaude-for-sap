// sc4sap:smartform-preview — preview values from interface values: the same data a SAP render (RenderSmartForm)
// gets, turned into the "as printed" values the preview takes, so a preview and SAP's print of the same data can be
// compared. No SAP call.
//
//   valuesFromRaw(content, raw, { ddic, dateFormat, decimal, group }) → { values, rows }
//     content  GetSmartFormContent's content.json (loops / tables: data table and work area)
//     raw      interface values: { PARAM: scalar | { FIELD } | [ { FIELD } ] } (globals too, e.g. sums)
//     ddic     { "PARAM-FIELD": { type, length, decimals, signed? } } (types decide the printed form; signed = the
//              domain sign flag, DD01L SIGNFLAG, where it was read: false → no sign place)
//     dateFormat  the print user's date format: 'MM/DD/YYYY' (default), 'DD.MM.YYYY', 'YYYY/MM/DD', 'YYYY.MM.DD' …
//
// Output: structures as "PARAM-FIELD", table rows as "WA-FIELD": [row values] for the work area the form loops into
// (and "TABLE-FIELD" too), rows = the longest table. Dates DATS → the date format, times TIMS → HH:MM:SS,
// CURR / DEC / QUAN → grouped with the DDIC decimals (CURR: the currency's decimals when a key field is given),
// NUMC / CHAR / others as given.

const up = (s) => String(s ?? '').trim().toUpperCase();
// T006 DECAN of units that print without decimals (SAP standard: each, piece)
const UNIT_DEC = { EA: 0, PC: 0, ST: 0 };
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

function fmtNum(v, dec, { decimal = '.', group = ',', signed } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  const [ip, fp] = Math.abs(n).toFixed(dec).split('.');
  const g = ip.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  // SAP writes the minus sign after the number, a positive number keeps that place as a blank (a right-aligned
  // amount ends one character short of the cell: SF_SUBTOTALS / SF_TOTALS on S4-DEV, build-preview R60) — only for a
  // signed type: a domain without the sign flag (signed: false) has no sign place; unknown → the place is kept
  if (signed === false) return `${g}${fp ? decimal + fp : ''}`;
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

export function valuesFromRaw(content, raw = {}, { ddic = {}, dateFormat = 'MM/DD/YYYY', decimal = '.', group = ',', initials = true } = {}) {
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
      if (type === 'QUAN') {
        // WRITE … UNIT: the unit of the row (one UNIT field of the same structure with a value) drops the decimals
        // it does not have when they are zero — S4-DEV LB_BIL_INVOICE prints FKIMG 1.000 EA as "1"
        // the DDIC reference unit field (refField) when it is known, else the one UNIT field of the row with a value
        const ref = t?.refField ? Object.entries(rec || {}).find(([f]) => up(f) === up(t.refField))?.[1] : undefined;
        const units = ref !== undefined ? [up(ref)].filter(Boolean)
          : [...new Set(Object.entries(rec || {}).filter(([f, x]) => up(dd[`${param}-${up(f)}`]?.type) === 'UNIT' && up(x)).map(([, x]) => up(x)))];
        const ud = units.length === 1 ? UNIT_DEC[units[0]] : undefined;
        if (ud !== undefined && ud < dec && Number.isFinite(Number(v)) && Number(Number(v).toFixed(ud)) === Number(v)) dec = ud;
      }
      const s = fmtNum(v, dec, { decimal, group, signed: t?.signed });
      // SAP prints a number right-justified in its output length (digits, group separators, decimal point, sign
      // place) — a left-aligned &GS_HD_KOMK-FKWRT& (CURR 15,2: 21 places) prints "0.00" 16 blanks in (LB_BIL_INVOICE)
      const L = Number(t?.length), d = Number(t?.decimals ?? 0);
      if (/^(CURR|DEC|QUAN)$/.test(type) && L > 0 && d >= 0 && d < L) {
        const out = L + Math.floor((L - d - 1) / 3) + (d ? 1 : 0) + (t?.signed === false ? 0 : 1);
        return s.padStart(out);
      }
      return s;
    }
    if (/^(INT1|INT2|INT4|INT8)$/.test(type)) return String(Math.round(Number(v)));
    return String(v);
  };
  // deep structures are walked: a structure field that is itself a structure or a table becomes "P-F-…" (a deep
  // interface like LB_BIL_INVOICE's IS_BIL_INVOICE: &IS_BIL_INVOICE-HD_GEN-BIL_NUMBER&, a loop over
  // IS_BIL_INVOICE-IT_GEN into GS_IT_GEN); DDIC keys follow the same path
  const put = (P, v) => {
    if (Array.isArray(v)) {
      rows = Math.max(rows, v.length);
      const fields = [...new Set(v.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r).map(up) : [])))];
      for (const f of fields) {
        const col = v.map((r) => { const e = Object.entries(r || {}).find(([x]) => up(x) === f); return e?.[1] !== null && typeof e?.[1] === 'object' ? '' : fmt(P, f, e?.[1], r); });
        values[`${P}-${f}`] = col;
        for (const wa of was[P] || []) values[`${wa}-${f}`] = col;
      }
    } else if (v && typeof v === 'object') {
      for (const [f, x] of Object.entries(v)) {
        if (x !== null && typeof x === 'object') put(`${P}-${up(f)}`, x);
        else values[`${P}-${up(f)}`] = fmt(P, up(f), x, v);
      }
    } else values[P] = fmt(P, '', v, null);
  };
  for (const [k, v] of Object.entries(raw || {})) put(up(k), v);
  // a loop over a table of a given interface parameter that the values leave out has no rows — SAP prints nothing,
  // the preview would draw its default sample rows (S4-DEV LB_BIL_INVOICE without items: LOOP_CONFBATCH over
  // IS_BIL_INVOICE-IT_CONFBATCH). "WA-%ROWS": [] tells build-preview the loop has 0 rows.
  const rawUp = Object.fromEntries(Object.entries(raw || {}).map(([k, v]) => [up(k), v]));
  const at = (path) => path.split('-').reduce((o, seg) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o).find(([k]) => up(k) === seg)?.[1] : undefined), rawUp);
  for (const [t, list] of Object.entries(was)) {
    const root = t.split('-')[0];
    const given = at(t);
    if (!(root in rawUp) || (given !== undefined && !(Array.isArray(given) && !given.length))) continue;
    for (const wa of [t, ...list]) if (!Object.keys(values).some((k) => k.startsWith(`${wa}-`))) values[`${wa}-%ROWS`] = [];
  }
  // a numeric field (CURR / QUAN / DEC) outside any loop that nothing fills prints its initial value — S4-DEV
  // LB_BIL_INVOICE prints &GS_HD_KOMK-FKWRT& (global TYPE KOMK, filled by program lines) as "0.00"
  const loopKeys = new Set(Object.entries(was).flatMap(([t, l]) => [t, ...l]));
  for (const [k, t] of Object.entries(dd)) {
    if (!initials || !/^(CURR|QUAN|DEC)$/.test(up(t?.type)) || k in values) continue;
    const parent = k.split('-').slice(0, -1).join('-');
    if (!parent || loopKeys.has(parent)) continue;
    values[k] = fmt(parent, k.split('-').pop(), 0, null);
  }
  return { values, rows };
}

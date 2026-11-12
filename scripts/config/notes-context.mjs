// config-to-document — what the notes writer needs from the snapshot, computed up
// front into the batch input, so the writer does not load snapshot.json (50–200 MB)
// with ad-hoc `node -e` filters. Measured on HKT-DEV (2026-10): writers spent about a
// quarter of their Bash calls on such filters, each a full agent turn.
//
//   sampleRows(view, domains)   rows for the writer — all of them up to ALL_ROWS
//   profileView(view, domains)  per column: distinct values and the most frequent ones
//   customerTransports(view)    customer transports and how many rows each recorded
//   queryRows(snap, q)          `notes.mjs rows` — one filtered look at a raw table

import { isCustomerTr } from './build-config-doc.mjs';

export const SAMPLE_ROWS = 15;
export const ALL_ROWS = 40;
const TOP = 8;

// Two columns may share a label (plant / plant name): name them by field then.
export function columnNames(v) {
  const seen = v.cols.reduce((m, c) => m.set(c.label, (m.get(c.label) || 0) + 1), new Map());
  return v.cols.map((c) => (seen.get(c.label) > 1 ? `${c.label} [${c.name}]` : c.label));
}

const withText = (c, x, domains) => {
  const tx = c.dom && domains[c.dom]?.[x];
  return tx ? `${x} (${tx})` : x;
};

/** Every row when the view has at most ALL_ROWS, else SAMPLE_ROWS with customer rows first. Customer rows carry `_tr`. */
export function sampleRows(v, domains = {}) {
  const all = v.rows.length <= ALL_ROWS;
  const order = all ? v.rows.map((_, i) => i)
    : [...v.cust, ...v.rows.map((_, i) => i).filter((i) => !v.cust.includes(i))].slice(0, SAMPLE_ROWS);
  const names = columnNames(v);
  return order.map((i) => {
    const row = Object.fromEntries(v.cols.map((c, j) => [names[j], withText(c, v.rows[i][j], domains)]).filter(([, x]) => x !== ''));
    const tr = v.trOf?.[i];
    return tr?.length ? { ...row, _tr: tr.slice(0, 3).join(' ') } : row;
  });
}

/** Value distribution per column over all rows; undefined when the sample already holds every row. */
export function profileView(v, domains = {}) {
  if (v.rows.length <= ALL_ROWS) return undefined;
  const names = columnNames(v);
  const out = {};
  v.cols.forEach((c, j) => {
    const m = new Map();
    for (const r of v.rows) if (r[j] !== '') m.set(r[j], (m.get(r[j]) || 0) + 1);
    const blank = v.rows.length - [...m.values()].reduce((s, n) => s + n, 0);
    if (!m.size) { out[names[j]] = 'all blank'; return; }
    const p = { distinct: m.size, ...(blank ? { blank } : {}) };
    // A column unique per row (a key) has no distribution worth reading.
    if (m.size < v.rows.length) {
      p.top = Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([x, n]) => [withText(c, x, domains), n]));
    }
    out[names[j]] = p;
  });
  return out;
}

/** { <transport>: rows } for the customer rows of a view, most rows first (at most 10). */
export function customerTransports(v) {
  const m = new Map();
  for (const trs of Object.values(v.trOf || {})) for (const t of trs) m.set(t, (m.get(t) || 0) + 1);
  return m.size ? Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).slice(0, 10)) : undefined;
}

/**
 * Customer implementations of an activity's BAdIs with their method code (cut per
 * method) — without it a writer cannot say whether an implementation is active or
 * what it does (b035 pilot, 2026-11-12: three of seven review fixes).
 */
export function badiContext(snap, badis = [], { maxSource = 1500 } = {}) {
  const out = [];
  for (const badi of badis) {
    for (const x of snap.badiImpls?.[badi] || []) {
      const src = snap.badiSources?.[x.class] || { methods: [] };
      out.push({
        badi, impl: x.name, class: x.class, active: x.active, user: x.user, date: x.date,
        ...(src.error ? { sourceError: src.error } : {}),
        // The extractor reads classic implementation classes only; an enhancement implementation
        // can come without one. Its code is unknown, not missing.
        ...(x.class ? {} : { codeNotRead: 'implementing class not in the snapshot — what it does is unknown, not empty' }),
        methods: (src.methods || []).filter((m) => !m.empty).map((m) => ({
          name: m.name, lines: m.lines,
          source: String(m.source || '').length > maxSource ? `${String(m.source).slice(0, maxSource)} … (cut)` : m.source || '',
        })),
        emptyMethods: (src.methods || []).filter((m) => m.empty).map((m) => m.name),
      });
    }
  }
  return out;
}

/**
 * One filtered look at a raw snapshot table.
 * q = { table, where: {F: V}, fields: [..], countBy: F, limit, de }
 * `de` alone returns the F1 text and the fixed values of a data element.
 */
export function queryRows(snap, q) {
  if (q.de) {
    const de = q.de.toUpperCase();
    const field = Object.values(snap.tables || {}).flatMap((t) => t.fields || []).find((f) => f.rollname === de);
    const dom = field?.domname;
    return {
      de, label: snap.labels?.[de] || null, f1: snap.fieldDocs?.[de]?.text || '',
      ...(dom ? { domain: dom, values: snap.domains?.[dom] || {}, valuesEn: snap.domainsEn?.[dom] || {} } : {}),
    };
  }
  const t = snap.tables?.[String(q.table || '').toUpperCase()];
  if (!t) return { error: `table ${q.table} not in the snapshot` };
  if (t.error) return { table: q.table, error: t.error };
  const where = Object.entries(q.where || {});
  const rows = (t.rows || []).filter((r) => where.every(([f, v]) => String(r[f] ?? '').trim() === String(v).trim()));
  const head = { table: q.table.toUpperCase(), rows: t.rows.length, matched: rows.length, ...(t.truncated ? { truncated: true } : {}) };
  if (q.countBy) {
    const m = new Map();
    for (const r of rows) { const k = q.countBy.split('+').map((f) => r[f] ?? '').join('/'); m.set(k, (m.get(k) || 0) + 1); }
    return { ...head, countBy: q.countBy, counts: Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).slice(0, 100)) };
  }
  const pick = (r) => {
    const o = q.fields?.length ? Object.fromEntries(q.fields.map((f) => [f, r[f] ?? ''])) : Object.fromEntries(Object.entries(r).filter(([k, x]) => k !== '_tr' && x !== '' && x != null));
    const tr = (r._tr || []).filter(isCustomerTr);
    return tr.length ? { ...o, _tr: tr.slice(0, 3).join(' ') } : o;
  };
  const limit = Math.min(Number(q.limit) || 50, 200);
  return { ...head, list: rows.slice(0, limit).map(pick), ...(rows.length > limit ? { more: rows.length - limit } : {}) };
}

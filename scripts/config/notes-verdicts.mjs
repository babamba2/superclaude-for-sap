// config-to-document — do the case verdicts of a note rest on the data? (used by notes-lint.mjs; pure, no I/O)
//
// A verdict is a case's `this:` (full notes) or a `CASE n:` line under ## verdicts (system-only notes):
// "yes — <evidence>" / "no — <evidence>".
//   · no evidence after the dash                                   → problem 'no-evidence'
//   · "yes" whose evidence quotes nothing of this activity's data  → problem 'no-data-quoted'
//     (data = sample cell values and their codes, profile values, row counts, customer transports, check
//     values, BAdI implementation names of the batch input item, and — from the lint — every value of the
//     snapshot tables behind its views)
// A "no" may rest on an absence, so only its evidence text is required.

const parse = (s) => {
  const m = /^\s*(yes|no|예|아니요|아니오)\b\s*[—–:-]*\s*([\s\S]*)$/i.exec(String(s || ''));
  if (!m) return null;
  return { value: /^(yes|예)$/i.test(m[1]) ? 'yes' : 'no', evidence: m[2].trim() };
};

/**
 * Every value of the item a verdict may quote. One-character values (X, 1, 0) are left out — they appear in any
 * sentence. A row count also counts when it is short but written as a count ("3 rows", "3건"): `rowCounts`.
 */
export function dataTokens(item, extra = []) {
  const out = new Set();
  out.rowCounts = new Set();
  const keep = (s) => { if (s.length >= 2) out.add(s); };
  const add = (v) => {
    const s = String(v ?? '').trim();
    if (!s || s === 'all blank') return;
    keep(s);
    // "1 (text)", "X · text", "K = text": the code and the text separately
    for (const part of s.split(/\s*(?:\(|\)|·|=|,|\|)\s*/)) if (part) keep(part);
  };
  for (const o of item?.objects || []) {
    for (const row of o.sample || []) for (const [k, v] of Object.entries(row)) if (k !== '_tr') add(v); else String(v).split(/\s+/).forEach(add);
    for (const p of Object.values(o.profile || {})) if (p && typeof p === 'object') for (const v of Object.keys(p.top || {})) add(v);
    for (const n of [o.rows, o.customerRows]) if (Number.isFinite(n)) { keep(String(n)); out.rowCounts.add(String(n)); }
    for (const t of Object.keys(o.customerTransports || {})) add(t);
  }
  for (const c of item?.checks || []) for (const x of c.items || []) add(String(x).split('=').pop());
  for (const i of item?.implementations || []) add(i.name || i.impl || i.implementation);
  // the full tables behind the views (the writer may quote rows outside the 15-row sample, read with `rows`)
  for (const v of extra) add(v);
  return out;
}

const quotes = (text, tokens) => {
  const t = String(text).replace(/(\d),(?=\d{3}\b)/g, '$1'); // 2,500 → 2500
  for (const v of tokens) if (t.includes(v)) return v;
  for (const n of tokens.rowCounts || []) {
    if (new RegExp(`(^|[^\\d])${n}\\s*(rows?|entries|records|lines|건|개|행|줄)`, 'i').test(t)) return n;
  }
  return '';
};

/** Problems of the verdicts of one note against its batch input item → [{ case, value, problem, text }]. */
export function verdictProblems(note, item, extra = []) {
  const list = note?.cases?.list?.length
    ? note.cases.list.map((c, i) => ({ n: i + 1, raw: c.thisSystem }))
    : (note?.verdicts || []).map((v) => ({ n: v.n, raw: v.value }));
  const tokens = dataTokens(item, extra);
  const out = [];
  for (const { n, raw } of list) {
    if (!raw) continue;
    const v = parse(raw);
    if (!v) continue;
    if (!v.evidence) out.push({ case: n, value: v.value, problem: 'no-evidence', text: String(raw).slice(0, 90) });
    else if (v.value === 'yes' && tokens.size && !quotes(v.evidence, tokens)) out.push({ case: n, value: v.value, problem: 'no-data-quoted', text: String(raw).slice(0, 90) });
  }
  return out;
}

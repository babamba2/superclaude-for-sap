// sc4sap:adobe-preview — the data XML a generated form function module would hand ADS, built from the form context
// and invented sample values (no SAP call, no I/O).
//
//   buildRecord(context, sample, { references })  → data tree { name, children, value?, rich? } named "data"
//   contextFields(context)                         → every printed context leaf: { path, field, loop, kind }
//   toXmlValue(v, { currency })                    → a sample value as the data XML carries it (ISO dates, times,
//                                                    numbers with '.', currency amounts shifted by TCURX decimals)
//
// sample = { values: { PARAM: …, GLOBAL: … },          interface parameters and global data (invented)
//            ddic:   { 'PARAM-FIELD': { type, length, decimals } }   DDIC of the printed fields (optional)
//            system: { 'SFPSY-DATE': '2026-01-31' },   system fields (defaults: today, 00:00:00, user SAMPLE)
//            texts:  { SF_ADRS_SENDER: ['line', …] } } text modules / include texts (paragraph strings or
//                                                      { text, style } objects) — unknown texts are reported
// Kinds handled: structure, folder (a data group like a structure), data, loop (+ WHERE, FIRST / LAST line), loop-data, single-record (+ key), text-module,
// text, graphic content / URL (unknown class names keep their field in attrs), conditions on every node.

// ISO 4217 currencies SAP keeps with other than two decimals (TCURX defaults)
const CUR_DECIMALS = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, PYG: 0, UGX: 0, XAF: 0, XOF: 0, XPF: 0, KMF: 0, RWF: 0, GNF: 0, BIF: 0, DJF: 0, VUV: 0,
  KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3, LYD: 3, IQD: 3 };

export const currencyDecimals = (cur) => CUR_DECIMALS[String(cur || '').trim().toUpperCase()] ?? 2;

// SAP language keys → ISO 639 (conversion exit ISOLA), the common ones
const ISOLA = { E: 'EN', D: 'DE', F: 'FR', S: 'ES', I: 'IT', J: 'JA', 1: 'ZH', M: 'ZF', 3: 'KO', P: 'PT', N: 'NL', R: 'RU', K: 'DA',
  V: 'SV', O: 'NO', U: 'FI', L: 'PL', C: 'CS', Q: 'SK', H: 'HU', T: 'TR', G: 'EL', B: 'HE', A: 'AR', 2: 'TH', 0: 'SR', 4: 'RO', 5: 'SL', 6: 'HR', 8: 'UK', 9: 'ET', X: 'LT', Y: 'LV', W: 'BG' };

// ABAP built-in parameter types (TYPE C / N / P …) as DDIC entries with the ABAP default lengths
export const BUILTIN_DDIC = { C: { type: 'CHAR', length: 1 }, N: { type: 'NUMC', length: 1 }, P: { type: 'DEC', length: 8, decimals: 0 },
  D: { type: 'DATS', length: 8 }, T: { type: 'TIMS', length: 6 }, I: { type: 'INT4', length: 10 }, INT8: { type: 'INT8', length: 19 },
  F: { type: 'FLTP', length: 16 }, STRING: { type: 'STRING', length: 0 }, X: { type: 'RAW', length: 1 }, XSTRING: { type: 'RAWSTRING', length: 0 } };

/** Fields of a DDL structure definition as GetStructure answers it (abap.char(20), abap.dec(10,3), data elements). */
export function ddicFromDdl(ddl) {
  const fields = {};
  for (const m of String(ddl || '').matchAll(/^\s*(?:key\s+)?([a-z0-9_/]+)\s*:\s*([a-z0-9_./]+)(?:\(\s*(\d+)\s*(?:,\s*(\d+))?\s*\))?\s*(?:not null)?\s*;/gim)) {
    const name = m[1].toUpperCase();
    if (name === 'INCLUDE') continue;
    const t = m[2].toLowerCase();
    if (t.startsWith('abap.')) fields[name] = { type: t.slice(5).toUpperCase(), length: Number(m[3] || 0), decimals: Number(m[4] || 0) };
    else fields[name] = { element: m[2].toUpperCase() };
  }
  return fields;
}

/** A sample value as the data XML carries it. `currency` = the reference currency of a CURR field; `ddic` =
 *  { type, length, decimals } of the field (NUMC padded, packed numbers with their decimals, LANG as ISO). */
export function toXmlValue(v, { currency, ddic } = {}) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'X' : '';
  const t = String(ddic?.type || '').toUpperCase();
  const dec = ddic?.decimals !== undefined ? Number(ddic.decimals) : undefined;
  const numeric = typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v).trim());
  if (currency !== undefined && numeric) {
    // an amount with d DDIC decimals prints in a currency with c decimals shifted by 10^(d-c)
    const d = dec ?? 2;
    const c = currencyDecimals(currency);
    return (Number(v) * 10 ** (d - c)).toFixed(c);
  }
  // an elementary parameter typed TYPE C / TYPE N without a length has ABAP's default length 1 (FP_TEST_05:
  // MYCHAR 'Sample text' prints 'S', MYNUM 000123 prints '3')
  const len1 = (t === 'CHAR' || t === 'NUMC') && ddic && ddic.length === undefined ? 1 : undefined;
  if (t === 'NUMC' && numeric) {
    const digits = String(v).replace(/\D/g, '');
    const len = len1 ?? (Number(ddic.length) || digits.length);
    return digits.padStart(len, '0').slice(-len);
  }
  if (/^(DEC|QUAN|P|CURR)$/.test(t) && numeric) return Number(v).toFixed(dec ?? 0);
  if (/^(INT1|INT2|INT4|INT8)$/.test(t) && numeric) return String(Math.round(Number(v)));
  if (t === 'LANG') return ISOLA[String(v).trim()] ?? String(v);
  if (t === 'CHAR' && (len1 || ddic.length > 0)) return String(v).slice(0, len1 ?? Number(ddic.length));
  if (numeric && typeof v === 'number') return String(v);
  const s = String(v);
  const d8 = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (d8 && Number(d8[2]) >= 1 && Number(d8[2]) <= 12) return `${d8[1]}-${d8[2]}-${d8[3]}`;
  return s;
}

const up = (s) => String(s || '').trim().toUpperCase();

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The interface's initialization code for the few statements it can run without SAP — LOOP AT … INTO, field
 *  assignments (from a field or a literal), CLEAR, APPEND, COLLECT, ENDLOOP; DATA declarations are skipped. Anything
 *  else stops it: { ok: false, reason }, nothing is set. On success the tables it filled (globals it wrote) are
 *  returned: { ok: true, tables: { NAME: rows } }. COLLECT sums the numeric fields (numbers in the data, or numeric DDIC
 *  types) over equal values of all other fields. Values: the sample values (interface parameters). */
export function runInitCoding(lines, values = {}, ddic = {}) {
  const src = (lines || []).map((l) => String(l)).filter((l) => !/^\s*\*/.test(l)).map((l) => l.replace(/".*$/, '')).join(' ');
  const stmts = src.split('.').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const get = (name) => { const k = Object.keys(values).find((x) => up(x) === up(name)); return k === undefined ? undefined : values[k]; };
  const tables = {};
  const NUM = /^(CURR|QUAN|DEC|INT1|INT2|INT4|INT8|FLTP|P|I|F)$/;
  const numericField = (tab, f, v) => typeof v === 'number' || NUM.test(up(ddic[`${up(tab)}-${up(f)}`]?.type || ''));
  const fail = (reason) => ({ ok: false, reason });
  const exec = (from, to, env) => {
    for (let k = from; k < to; k++) {
      const s = stmts[k];
      let m;
      if (/^DATA\b/i.test(s) || /^TYPES\b/i.test(s)) continue;
      if ((m = /^LOOP AT (\w+) INTO (\w+)$/i.exec(s))) {
        let depth = 1, e = k + 1;
        for (; e < to; e++) { if (/^LOOP AT /i.test(stmts[e])) depth++; else if (/^ENDLOOP$/i.test(stmts[e]) && --depth === 0) break; }
        if (e >= to) return fail('LOOP without ENDLOOP');
        const rows = tables[up(m[1])] ?? get(m[1]);
        if (!Array.isArray(rows)) return fail(`LOOP AT ${up(m[1])}: no table in the values`);
        for (const row of rows) {
          env[up(m[2])] = Object.fromEntries(Object.entries(row || {}).map(([a, b]) => [up(a), b]));
          const r = exec(k + 1, e, env);
          if (r) return r;
        }
        k = e;
        continue;
      }
      if ((m = /^CLEAR (\w+)$/i.exec(s))) { env[up(m[1])] = {}; continue; }
      if ((m = /^(\w+)-(\w+) = (?:(\w+)-(\w+)|'([^']*)'|(-?\d+(?:\.\d+)?))$/i.exec(s))) {
        const tgt = (env[up(m[1])] ||= {});
        tgt[up(m[2])] = m[3] ? (env[up(m[3])] || {})[up(m[4])] : m[5] !== undefined ? m[5] : Number(m[6]);
        continue;
      }
      if ((m = /^(APPEND|COLLECT) (\w+) (?:TO|INTO) (\w+)$/i.exec(s))) {
        const t = (tables[up(m[3])] ||= []);
        const row = { ...(env[up(m[2])] || {}) };
        if (up(m[1]) === 'APPEND') { t.push(row); continue; }
        const keyOf = (r) => JSON.stringify(Object.keys(r).filter((f) => !numericField(m[3], f, r[f])).sort().map((f) => [f, r[f]]));
        const hit = t.find((r) => keyOf(r) === keyOf(row));
        if (!hit) { t.push(row); continue; }
        for (const f of Object.keys(row)) if (numericField(m[3], f, row[f])) hit[f] = Math.round((Number(hit[f] || 0) + Number(row[f] || 0)) * 1e6) / 1e6;
        continue;
      }
      if (/^ENDLOOP$/i.test(s)) continue;
      return fail(`statement not supported: ${s.split(' ').slice(0, 2).join(' ')}`);
    }
    return null;
  };
  const r = exec(0, stmts.length, {});
  return r || { ok: true, tables };
}

/** Scope: names → values; loops push their work area. Lookup "A-B-C" walks structures. */
class Scope {
  constructor(sample) {
    this.frames = [];
    const base = {};
    for (const [k, v] of Object.entries(sample?.values || {})) base[up(k)] = v;
    for (const [k, v] of Object.entries(sample?.globals || {})) base[up(k)] = v;
    const sys = { 'SFPSY-DATE': today(), 'SFPSY-TIME': '00:00:00', 'SFPSY-USERNAME': 'SAMPLE', 'SFPSY-LANGU': 'E', ...(sample?.system || {}) };
    this.system = {};
    for (const [k, v] of Object.entries(sys)) this.system[up(k)] = v;
    this.frames.push(base);
  }
  push(f) { this.frames.push(f); }
  pop() { this.frames.pop(); }
  lookup(path) {
    const p = up(path);
    if (p in this.system) return this.system[p];
    const [head, ...rest] = p.split('-');
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i];
      const key = Object.keys(f).find((k) => up(k) === head);
      if (key === undefined) continue;
      let v = f[key];
      for (const r of rest) {
        if (v === null || v === undefined || typeof v !== 'object') return undefined;
        const kk = Object.keys(v).find((k) => up(k) === r);
        v = kk === undefined ? undefined : v[kk];
      }
      return v;
    }
    return undefined;
  }
}

const isInitial = (v) => v === undefined || v === null || v === '' || v === 0 || v === false
  || (typeof v === 'string' && (/^\s*$/.test(v) || /^0+(\.0+)?$/.test(v.trim()) || v === '0000-00-00' || v === '00:00:00'))
  || (Array.isArray(v) && !v.length);

function operand(op, scope, row) {
  const s = String(op ?? '').trim();
  if (/^INITIAL$/i.test(s)) return { initial: true };
  if (/^'.*'$/.test(s)) return { v: s.slice(1, -1) };
  if (/^-?\d+(\.\d+)?$/.test(s)) return { v: Number(s) };
  if (row && !s.includes('-')) {
    const k = Object.keys(row).find((x) => up(x) === up(s));
    if (k !== undefined) return { v: row[k] };
  }
  return { v: scope.lookup(s) };
}

function compare(a, cop, b) {
  if (b.initial) {
    const ini = isInitial(a.v);
    return up(cop) === 'NE' ? !ini : ini;
  }
  const x = a.v, y = b.v;
  const num = typeof x === 'number' || typeof y === 'number' || (/^-?\d+(\.\d+)?$/.test(String(x)) && /^-?\d+(\.\d+)?$/.test(String(y)));
  const l = num ? Number(x) : String(x ?? '').trimEnd();
  const r = num ? Number(y) : String(y ?? '').trimEnd();
  switch (up(cop)) {
    case 'EQ': case '=': return l === r;
    case 'NE': case '<>': return l !== r;
    case 'LT': case '<': return l < r;
    case 'GT': case '>': return l > r;
    case 'LE': case '<=': return l <= r;
    case 'GE': case '>=': return l >= r;
    case 'CP': return new RegExp(`^${String(r).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i').test(String(l));
    case 'NP': return !new RegExp(`^${String(r).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i').test(String(l));
    default: return true;
  }
}

/** Conditions of a node: AND inside a group, OR between groups (LOPERATOR OR starts a new group). */
export function evalConditions(conds, scope, row) {
  if (!conds?.length) return true;
  const groups = [[]];
  for (const c of conds) {
    if (up(c.lop) === 'OR' && groups[groups.length - 1].length) groups.push([]);
    groups[groups.length - 1].push(c);
  }
  return groups.some((g) => g.every((c) => compare(operand(c.op1, scope, row), c.cop, operand(c.op2, scope, row))));
}

function rowsOf(v) { return Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []; }

/** Reference currency field of a CURR value field ("BOOKINGS-FORCURAM" → "BOOKINGS-FORCURKEY"). */
function referenceOf(field, references) {
  const r = (references || []).find((x) => up(x.value) === up(field) && /CURR/i.test(x.datatype));
  return r ? r.unit : undefined;
}

/** SmartStyle paragraph format → CSS for the rich text ADS gets (size, alignment, bold, italic). */
export function formatCss(f = {}) {
  const css = [];
  if (f.family) css.push(`font-family:${f.family}`);
  if (f.pt) css.push(`font-size:${f.pt}pt`);
  if (f.align) css.push(`text-align:${String(f.align).toLowerCase()}`);
  if (f.bold) css.push('font-weight:bold');
  if (f.italic) css.push('font-style:italic');
  if (f.underline) css.push('text-decoration:underline');
  return css.join(';');
}

/** SAPscript ITF lines ({ f, t }) → paragraphs: a paragraph format starts a paragraph, '/' a new line, '=' joins
 *  without a blank, ' ' (or empty) joins with one. formats: { FT: { pt, align, bold, italic } }, '*' = default. */
export function itfParagraphs(lines, formats = {}) {
  const out = [];
  let cur = null;
  for (const l of lines || []) {
    const f = String(l.f ?? l.TDFORMAT ?? '').trim();
    const t = String(l.t ?? l.TDLINE ?? '');
    if (f === '/*' || f === '/:') continue;
    const newPara = f && f !== '/' && f !== '=' && f !== '/=';
    if (!cur || newPara) {
      cur = { text: t, style: formatCss(formats[newPara ? f : '*'] || formats['*'] || {}) };
      out.push(cur);
      continue;
    }
    if (f === '/') cur.text += `\n${t}`;
    else if (f === '=' || f === '/=') cur.text += t;
    else cur.text += (cur.text ? ' ' : '') + t;
  }
  return out;
}

/** sample.texts from SAP's own tables: text module lines (STXFTXT rows: FORMNAME, LINENR, TDFORMAT, TDLINE) and the
 *  paragraph formats of their SmartStyle (STXSPARA rows: TDPARGRAPH, TDPJUSTIFY, TDHEIGHT, TDBOLD, TDITALIC). */
export function textsFromTables(textRows = [], paraRows = []) {
  const formats = {};
  for (const r of paraRows) {
    const h = Number(String(r.TDHEIGHT || '').trim());
    const fam = { HELVE: 'Helvetica', TIMES: 'Times', COURIER: 'Courier' }[String(r.TDFAMILY || '').trim()];
    formats[String(r.TDPARGRAPH || '').trim()] = { family: fam, pt: h ? h / 10 : undefined, align: String(r.TDPJUSTIFY || '').trim() === 'BLOCK' ? 'justify' : String(r.TDPJUSTIFY || '').trim().toLowerCase() || undefined,
      bold: r.TDBOLD === 'X', italic: r.TDITALIC === 'X', underline: r.TDUNDERLIN === 'X' };
  }
  const by = {};
  for (const r of [...textRows].sort((a, b) => String(a.LINENR).localeCompare(String(b.LINENR)))) {
    const k = String(r.FORMNAME || '').trim();
    (by[k] ||= []).push({ f: r.TDFORMAT ?? '', t: r.TDLINE ?? '' });
  }
  const out = {};
  for (const [k, itf] of Object.entries(by)) out[k] = { itf, formats };
  return out;
}

function textParagraphs(t) {
  if (t === undefined || t === null) return undefined;
  if (!Array.isArray(t) && typeof t === 'object' && Array.isArray(t.itf)) return itfParagraphs(t.itf, t.formats || {});
  const list = Array.isArray(t) ? t : String(t).split(/\r?\n/);
  return list.map((p) => (typeof p === 'object' ? { text: String(p.text ?? ''), style: p.style || '' } : { text: String(p), style: '' }));
}

/** The data tree ("data" root) of a context for the given sample. */
export function buildRecord(context, sample = {}, { references = [] } = {}) {
  const scope = new Scope(sample);
  // DDIC per context field expression ("DATATYPES-NUMC", "MYNUM"); a work area falls back to its table's entries
  const ddicMap = {};
  for (const [k, v] of Object.entries(sample?.ddic || {})) ddicMap[up(k)] = v;
  const ddicOf = (field) => ddicMap[up(field)];
  const missingTexts = new Set();
  const root = { name: 'data', children: [] };
  const walk = (n, parent) => {
    if (!n.active) return;
    if (!evalConditions(n.conditions, scope)) return;
    switch (n.kind) {
      case 'context':
        for (const c of n.children) walk(c, parent);
        return;
      // a folder (migrated SmartForms: windows, texts, rows) is a data group named like the folder; its own
      // condition was checked above
      case 'folder':
      case 'structure': {
        const el = { name: n.name, children: [] };
        parent.children.push(el);
        for (const c of n.children) walk(c, el);
        return;
      }
      case 'data': {
        const raw = scope.lookup(n.field || n.name);
        const ref = referenceOf(n.field, references);
        const cur = ref !== undefined ? scope.lookup(ref) : undefined;
        const dd = ddicOf(n.field || n.name);
        parent.children.push({ name: n.name, value: toXmlValue(raw, { ...(ref !== undefined ? { currency: cur } : {}), ddic: dd }), field: n.field });
        return;
      }
      case 'loop': {
        const el = { name: n.name, children: [] };
        parent.children.push(el);
        let rows = rowsOf(scope.lookup(n.table));
        if (n.from > 0 || n.to > 0) rows = rows.slice(Math.max(0, n.from - 1), n.to > 0 ? n.to : undefined);
        const wa = up(n.workArea || n.table);
        for (const row of rows) {
          if (!evalConditions(n.where, scope, row)) continue;
          scope.push({ [wa]: row });
          for (const c of n.children) walk(c, el);
          scope.pop();
        }
        return;
      }
      case 'loop-data': {
        const el = { name: n.name, children: [] };
        parent.children.push(el);
        for (const c of n.children) walk(c, el);
        return;
      }
      case 'single-record': {
        const rows = rowsOf(scope.lookup(n.table));
        const row = n.line > 0 ? rows[n.line - 1] : rows.find((r) => evalConditions(n.key, scope, r));
        const el = { name: n.name, children: [] };
        parent.children.push(el);
        if (row) {
          scope.push({ [up(n.table)]: row });
          for (const c of n.children) walk(c, el);
          scope.pop();
        }
        return;
      }
      case 'text-module':
      case 'text': {
        const name = n.text?.nameField ? scope.lookup(n.text.nameField) : n.text?.name;
        const key = Object.keys(sample?.texts || {}).find((k) => up(k) === up(name));
        const paras = key !== undefined ? textParagraphs(sample.texts[key]) : undefined;
        if (!paras) missingTexts.add(String(name || n.name));
        parent.children.push({ name: n.name, rich: paras || [], text: String(name || '') });
        return;
      }
      default: {
        // graphics: content (xstring field) or URL (field holding the URL)
        if (/GRAPHIC_CONTENT/.test(n.cls)) {
          const v = scope.lookup(n.attrs?.GRAPHIC_FIELD || '');
          parent.children.push({ name: n.name, value: v === undefined ? '' : String(v), image: true, mime: n.attrs?.MIME || '' });
        } else if (/GRAPHIC_URL/.test(n.cls)) {
          parent.children.push({ name: n.name, value: '', image: true });
        } else {
          parent.children.push({ name: n.name, children: [] });
        }
      }
    }
  };
  walk(context, root);
  return { record: root, missingTexts: [...missingTexts] };
}

/** Every leaf the context prints, with its source field and whether it repeats (for sample values). */
export function contextFields(context) {
  const out = [];
  const walk = (n, path, loop) => {
    if (!n.active) return;
    const here = n.kind === 'context' ? path : [...path, n.name];
    if (n.kind === 'data') out.push({ path: here.join('.'), field: n.field, loop });
    else if (n.kind === 'text-module' || n.kind === 'text') out.push({ path: here.join('.'), text: n.text?.name, kind: 'text', loop });
    for (const c of n.children || []) walk(c, here, loop || n.kind === 'loop');
  };
  if (context) walk(context, [], false);
  return out;
}

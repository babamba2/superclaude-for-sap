// interface-mapping-spec — the SAP side of a mapping, read from the system.
//
// One SAP object per side: a DDIC table / DB view / structure (an ABAP proxy is
// given by its structure), a CDS view (by its SQL view name on ECC-era
// releases) or a function module. Only DDIC metadata and source are read
// (GetTable, GetStructure, GetView, GetDataElement, GetTypeInfo,
// SearchObject, GetFunctionModule) — never table contents.
//
// Result: { object, kind, description, groups: [{ name, section, shape, rows }], unresolved: [] }
//   section  IMPORTING | EXPORTING | CHANGING | TABLES | FIELDS (DDIC object)
//   shape    PARAMETER | STRUCTURE | TABLE
//   rows     [{ table, field, key, type, size, nul, desc, ddic }]

import { ddicToDb } from './if-codes.mjs';

const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };

/** One MCP call → parsed JSON payload, or { error }. Answers are cached per client. */
export async function call(client, name, args) {
  const key = `${name}|${JSON.stringify(args)}`;
  client.ifCache = client.ifCache || new Map();
  if (client.ifCache.has(key)) return client.ifCache.get(key);
  let out;
  try {
    const res = await client.callTool({ name, arguments: args });
    const text = res?.content?.[0]?.text ?? '';
    out = res?.isError ? { error: text.slice(0, 300) } : (parse(text) ?? { text });
  } catch (e) {
    out = { error: String(e?.message ?? e).slice(0, 300) };
  }
  client.ifCache.set(key, out);
  return out;
}

const inner = (o, k) => (o && typeof o[k] === 'string' ? parse(o[k]) : o?.[k]) || null;

/** DDIC definition (GetTable / GetStructure answer) → grid rows. Include markers and nested components are left out. */
export function rowsFromDdic(def, table = '') {
  const rows = [];
  for (const f of def?.fields || []) {
    if (!f.fieldname || f.fieldname.startsWith('.') || !f.datatype) continue;
    const { type, size } = ddicToDb(f.datatype, f.leng);
    rows.push({
      table, field: f.fieldname, key: f.key ? 'Y' : 'N', type, size,
      nul: f.key || f.notnull ? 'N' : 'Y', desc: f.description || '',
      ddic: `${f.datatype} ${Number(f.leng) || ''}`.trim() + (f.rollname ? ` · ${f.rollname}` : ''),
      ...(f.domname ? { dom: f.domname } : {}),
    });
  }
  return rows;
}

async function ddicObject(client, name) {
  const t = await call(client, 'GetTable', { table_name: name });
  const td = inner(t, 'table_data');
  if (td?.fields?.length) return { kind: td.tabclass === 'VIEW' ? 'VIEW' : 'TABLE', def: td };
  const s = await call(client, 'GetStructure', { structure_name: name });
  const sd = inner(s, 'structure_data');
  if (sd?.fields?.length) return { kind: sd.tabclass === 'VIEW' ? 'VIEW' : 'STRUCTURE', def: sd };
  const v = await call(client, 'GetView', { view_name: name });
  const vd = inner(v, 'view_data') || v;
  if (vd?.fields?.length) return { kind: 'VIEW', def: vd };
  return null;
}

// ── Function modules ──────────────────────────────────────────────────────

/** The parameters of the FUNCTION statement (inline signature, as the ADT source shows it). */
export function parseFmSignature(src) {
  const text = String(src || '').replace(/\r/g, '');
  const head = /FUNCTION\s+[\w/]+\s*([\s\S]*?)\.\s*(\n|$)/i.exec(text.replace(/^\s*["*].*$/gm, ''));
  if (!head) return [];
  const out = [];
  let section = null;
  for (const raw of head[1].split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const sec = /^(IMPORTING|EXPORTING|CHANGING|TABLES|EXCEPTIONS|RAISING)\b/i.exec(line);
    if (sec) { section = sec[1].toUpperCase(); continue; }
    if (!section || section === 'EXCEPTIONS' || section === 'RAISING') continue;
    const m = /^(?:VALUE\(|REFERENCE\()?([\w/]+)\)?\s+(TYPE\s+REF\s+TO|TYPE\s+TABLE\s+OF|TYPE|LIKE|STRUCTURE)\s+([\w/\-]+)(.*)$/i.exec(line);
    if (!m) continue;
    out.push({
      section, name: m[1].toUpperCase(), typing: m[2].toUpperCase().replace(/\s+/g, ' '), ref: m[3].toUpperCase(),
      optional: /\bOPTIONAL\b|\bDEFAULT\b/i.test(m[4]),
    });
  }
  return out;
}

const BUILTIN = { STRING: 'STRING', XSTRING: 'RAWSTRING', I: 'INT4', INT8: 'INT8', F: 'FLTP', C: 'CHAR', N: 'NUMC', D: 'DATS', T: 'TIMS', P: 'DEC', X: 'RAW', ABAP_BOOL: 'CHAR' };

async function scalarOf(client, ref) {
  if (BUILTIN[ref]) {
    const dt = BUILTIN[ref];
    const leng = { D: 8, T: 6, ABAP_BOOL: 1 }[ref] ?? '';
    return { datatype: dt, leng, description: '', rollname: '' };
  }
  if (ref.includes('-')) {
    const [tab, fld] = ref.split('-');
    const o = await ddicObject(client, tab);
    const f = o?.def.fields.find((x) => x.fieldname === fld);
    return f ? { datatype: f.datatype, leng: f.leng, description: f.description, rollname: f.rollname, domname: f.domname } : null;
  }
  const de = inner(await call(client, 'GetDataElement', { data_element_name: ref }), 'data_element_data');
  if (de?.datatype) return { datatype: de.datatype, leng: de.leng, description: de.description || de.medium_label || '', rollname: ref, domname: de.domname };
  return null;
}

/** Line structure of a table type: GetTypeInfo when the release answers it, else the naming habit (<STRUCT>_T, _TAB, _TT). */
async function lineTypeOf(client, ref, lines) {
  if (lines[ref]) return lines[ref];
  const ti = await call(client, 'GetTypeInfo', { type_name: ref });
  const find = (o) => {
    if (!o || typeof o !== 'object') return null;
    for (const [k, v] of Object.entries(o)) {
      if (/^(row_?type|line_?type|rowtype)$/i.test(k) && typeof v === 'string' && v) return v.toUpperCase();
      const r = typeof v === 'object' ? find(v) : null;
      if (r) return r;
    }
    return null;
  };
  const found = find(ti);
  if (found) return found;
  for (const cand of [ref.replace(/_(T|TAB|TT|TTY|TABLE)$/, ''), ref.replace(/^(TT|TY)_/, '')]) {
    if (cand !== ref && await ddicObject(client, cand)) return cand;
  }
  return null;
}

async function fmObject(client, name, lines) {
  const s = await call(client, 'SearchObject', { object_name: name, object_type: 'FUGR/FF', include_raw_xml: true });
  const m = /\/groups\/([^/"]+)\/fmodules\//i.exec(s?.rawXML || '');
  if (!m) return null;
  const group = decodeURIComponent(m[1]).toUpperCase();
  const fm = await call(client, 'GetFunctionModule', { function_module_name: name, function_group_name: group });
  const src = fm?.function_module_data || fm?.source || fm?.text || '';
  const params = parseFmSignature(src);
  if (!params.length && !src) return null;
  const groups = [];
  const unresolved = [];
  for (const p of params) {
    if (p.typing === 'TYPE REF TO') { unresolved.push({ param: p.name, ref: p.ref, why: 'reference' }); continue; }
    let struct = null;
    if (p.section === 'TABLES' || p.typing === 'TYPE TABLE OF') struct = p.ref;
    else {
      const sc = await scalarOf(client, p.ref);
      if (sc) {
        const { type, size } = ddicToDb(sc.datatype, sc.leng);
        groups.push({ name: p.name, section: p.section, shape: 'PARAMETER', optional: p.optional, rows: [{
          table: '', field: p.name, key: 'N', type, size, nul: p.optional ? 'Y' : 'N', desc: sc.description,
          ddic: `${sc.datatype} ${Number(sc.leng) || ''}`.trim() + (sc.rollname ? ` · ${sc.rollname}` : ''),
          ...(sc.domname ? { dom: sc.domname } : {}),
        }] });
        continue;
      }
      struct = p.ref;
    }
    let o = await ddicObject(client, struct);
    let shape = p.section === 'TABLES' || p.typing === 'TYPE TABLE OF' ? 'TABLE' : 'STRUCTURE';
    if (!o) {
      const line = await lineTypeOf(client, struct, lines);
      if (line) { o = await ddicObject(client, line); shape = 'TABLE'; }
    }
    if (!o) { unresolved.push({ param: p.name, ref: p.ref, why: 'type not readable — pass --line ' + p.name + '=<structure>' }); continue; }
    groups.push({ name: p.name, section: p.section, shape, optional: p.optional, ddic: o.def.name || struct, rows: rowsFromDdic(o.def, '') });
  }
  return { kind: 'FUNCTION', group, description: '', groups, unresolved };
}

/**
 * Read one SAP object. `kind` (TABLE | STRUCTURE | VIEW | FUNCTION) narrows the
 * lookup; `lines` maps FM parameter or table-type names to line structures.
 */
export async function readSapObject(client, name, { kind = '', lines = {} } = {}) {
  const obj = String(name || '').trim().toUpperCase();
  const k = String(kind || '').toUpperCase();
  if (k !== 'FUNCTION') {
    const o = await ddicObject(client, obj);
    if (o) return { object: obj, kind: o.kind, description: o.def.description || '', groups: [{ name: obj, section: 'FIELDS', shape: o.kind === 'STRUCTURE' ? 'STRUCTURE' : 'TABLE', ddic: obj, rows: rowsFromDdic(o.def, o.kind === 'STRUCTURE' ? '' : obj) }], unresolved: [] };
    if (k) return { object: obj, error: `${k} ${obj} not found` };
  }
  const paramLines = Object.fromEntries(Object.entries(lines).map(([a, b]) => [a.toUpperCase(), b.toUpperCase()]));
  const f = await fmObject(client, obj, paramLines);
  if (f) {
    for (const u of [...f.unresolved]) {
      const line = paramLines[u.param];
      if (!line) continue;
      const o = await ddicObject(client, line);
      if (!o) continue;
      f.groups.push({ name: u.param, section: 'TABLES', shape: 'TABLE', ddic: line, rows: rowsFromDdic(o.def, '') });
      f.unresolved = f.unresolved.filter((x) => x !== u);
    }
    return { object: obj, ...f };
  }
  return { object: obj, error: `${obj} is no table, view, structure or function module this system can read (a CDS view: give its SQL view name)` };
}

// TABLES parameters have no direction in the signature; the usual names tell
// the output ones (O_TAB, OH_TAB, ET_ITEMS, E_LIST, RETURN, T_RETURN, OUT_…).
export const OUT_TABLE_RE = /^(O|OH|OI|OT|E|ET|EX|EXP|OUT|OUTPUT|RET|RETURN|T_RETURN|RESULT|RES)(_|$)|RETURN$/i;

/**
 * Request / response split into carriers — the units the fields travel in:
 * EXPORTING parameters and the TABLES parameters named as outputs go to the
 * response block (the page shows the split; the user moves rows if the naming
 * misled it). Scalar parameters of one direction share one PARAMETER carrier;
 * every structure and table parameter is a carrier of its own.
 * Carrier = { name, kind, card, ddic, optional, rows }.
 */
export function splitGroups(sap) {
  const carriers = (gs) => {
    const out = [];
    const scalars = gs.filter((g) => g.shape === 'PARAMETER');
    if (scalars.length) {
      const optional = scalars.every((g) => g.optional);
      out.push({ name: '', kind: 'PARAMETER', card: optional ? '0:1' : '1:1', optional, rows: scalars.flatMap((g) => g.rows) });
    }
    for (const g of gs.filter((x) => x.shape !== 'PARAMETER')) {
      out.push({ name: g.name, kind: g.shape, card: g.shape === 'TABLE' ? (g.optional ? '0:N' : '1:N') : g.optional ? '0:1' : '1:1', optional: !!g.optional, ...(g.ddic ? { ddic: g.ddic } : {}), rows: g.rows });
    }
    return out;
  };
  const req = [];
  const res = [];
  for (const g of sap.groups || []) (g.section === 'EXPORTING' || (g.section === 'TABLES' && OUT_TABLE_RE.test(g.name)) ? res : req).push(g);
  // A DDIC object is one carrier whose kind the scenario decides (a structure sent as a table, …).
  if (req.length === 1 && req[0].section === 'FIELDS') return { request: { groups: [{ name: req[0].name, kind: '', card: '', fallback: req[0].shape, ddic: req[0].ddic, rows: req[0].rows }] }, response: null };
  return { request: { groups: carriers(req) }, response: res.length ? { groups: carriers(res) } : null };
}

/**
 * New interfaces (decision 19): SAP fields named as TABLE-FIELD or as a data
 * element, read from DDIC. Returns { rows, problems }; a row keeps its
 * reference in `ref` so the caller can match it.
 */
export async function resolveRefs(client, refs) {
  const rows = [];
  const problems = [];
  for (const raw of refs || []) {
    const ref = String(raw || '').trim().toUpperCase();
    if (!ref) continue;
    if (ref.includes('-')) {
      const [tab, fld] = ref.split('-');
      const o = await ddicObject(client, tab);
      const f = o?.def.fields.find((x) => x.fieldname === fld);
      if (f) rows.push({ ...rowsFromDdic({ fields: [f] }, tab)[0], ref });
      else problems.push(o ? `${ref}: ${tab} has no field ${fld}` : `${ref}: ${tab} not found`);
      continue;
    }
    const de = inner(await call(client, 'GetDataElement', { data_element_name: ref }), 'data_element_data');
    if (!de?.datatype) { problems.push(`${ref}: no data element or TABLE-FIELD of that name`); continue; }
    const { type, size } = ddicToDb(de.datatype, de.leng);
    rows.push({ table: '', field: ref, key: 'N', type, size, nul: 'Y', desc: de.description || de.medium_label || '',
      ddic: `${de.datatype} ${Number(de.leng) || ''}`.trim() + ` · ${ref}`, ...(de.domname ? { dom: de.domname } : {}), ref });
  }
  return { rows, problems };
}

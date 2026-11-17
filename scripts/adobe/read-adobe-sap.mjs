// sc4sap:adobe-preview — the SAP reads of the Adobe preview, through an MCP client the caller owns (the web backend's
// connection, or config/sap-reader.mjs `connect`). Read-only: GetAdobeFormContent, GetStructure, GetDataElement,
// GetTypeInfo and one GetSqlQuery on the Smart Forms text tables (STXFTXT text module lines, STXSPARA paragraph
// formats of SAP SmartStyles) — repository content, never business data. Never throws: errors come back in the
// result. The client is left open.
//
//   readAdobeForm(client, form)            → { ok, files: { form, layout, interface }, summary } | { ok: false, code, error }
//   readFormDdic(client, iface)            → { ddic: { 'PARAM-FIELD': { type, length, decimals } }, unknown, errors }
//   readTextModules(client, names, { language, style }) → { texts (sample.texts shape), styles, errors }
//   parseDdl(ddl)                          → { FIELD: { type, length, decimals } | { element } } (GetStructure DDL)
//   parseDataElement(xml)                  → { type, length, decimals } | null

import { BUILTIN_DDIC, textsFromTables } from './adobe-data.mjs';

export const READ_TOOLS = ['GetAdobeFormContent', 'GetStructure', 'GetDataElement', 'GetTypeInfo', 'GetSqlQuery'];
const NAME_RE = /^[A-Z0-9_/]{1,30}$/;
const MAX_TYPES = 60;
const up = (s) => String(s ?? '').trim().toUpperCase();
const short = (e) => String(e?.message ?? e ?? 'error').replace(/\s+/g, ' ').slice(0, 300);

async function call(client, name, args) {
  if (!READ_TOOLS.includes(name)) return { ok: false, error: `${name} is not a read tool here` };
  try {
    const res = await client.callTool({ name, arguments: args });
    const text = (res?.content || []).map((c) => c?.text || '').join('\n');
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    if (res?.isError || json?.success === false) return { ok: false, error: short(json?.error || json?.message || text || 'error') };
    return { ok: true, json, text };
  } catch (e) { return { ok: false, error: short(e) }; }
}

/** GetAdobeFormContent: the files it wrote (form XML, layout XDP, interface XML). */
export async function readAdobeForm(client, form) {
  const name = up(form);
  if (!NAME_RE.test(name)) return { ok: false, code: 'bad-name', error: 'an Adobe form name (letters, digits, _ /, ≤ 30)' };
  const r = await call(client, 'GetAdobeFormContent', { form_name: name });
  if (!r.ok) {
    if (/ZMCP_FP_CONTENT|FP_CONTENT|not installed|dispatcher action|install/i.test(r.error) && !/does not exist/i.test(r.error)) return { ok: false, code: 'no-helper', error: r.error };
    if (/not found|does not exist/i.test(r.error)) return { ok: false, code: 'not-found', error: r.error };
    return { ok: false, code: 'failed', error: r.error };
  }
  const f = r.json?.files || {};
  return { ok: true, files: { form: f.formXml, layout: f.layout, interface: f.interface }, summary: r.json?.summary, header: { interface: r.json?.interface, layoutType: r.json?.layoutType } };
}

/** Fields of a DDL definition (GetStructure answer): statements up to ';', annotations skipped. */
export function parseDdl(ddl) {
  const body = String(ddl || '').replace(/^[\s\S]*?\{/, '').replace(/\}\s*$/, '');
  const fields = {};
  for (const stmt of body.split(';')) {
    const lines = stmt.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('@'));
    const m = /^(?:key\s+)?([a-z0-9_/]+)\s*:\s*([a-z0-9_./]+)(?:\(\s*(\d+)\s*(?:,\s*(\d+))?\s*\))?/i.exec(lines[0] || '');
    if (!m) continue;
    const name = m[1].toUpperCase();
    const t = m[2].toLowerCase();
    if (/^include$/i.test(name) || /^\.include/i.test(name)) continue;
    if (t.startsWith('abap.')) fields[name] = { type: t.slice(5).toUpperCase(), length: Number(m[3] || 0), decimals: Number(m[4] || 0) };
    else fields[name] = { element: m[2].toUpperCase() };
  }
  return fields;
}

/** Type, length and decimals of a data element (GetDataElement ADT XML). */
export function parseDataElement(xml) {
  const g = (tag) => (new RegExp(`<dtel:${tag}>([^<]*)</dtel:${tag}>`).exec(String(xml || '')) || [])[1];
  const type = g('dataType');
  if (!type) return null;
  return { type: up(type), length: Number(g('dataTypeLength') || 0), decimals: Number(g('dataTypeDecimals') || 0) };
}

/** DDIC of every interface parameter / global, keyed the way context data nodes name their field. */
export async function readFormDdic(client, iface) {
  const ddic = {}, unknown = [], errors = [];
  const structCache = new Map(), elemCache = new Map();
  let calls = 0;
  async function element(name) {
    if (elemCache.has(name)) return elemCache.get(name);
    if (++calls > MAX_TYPES * 4) return null;
    const r = await call(client, 'GetDataElement', { data_element_name: name });
    const e = r.ok ? parseDataElement(r.json?.data_element_data) : null;
    elemCache.set(name, e);
    return e;
  }
  async function structure(name) {
    if (structCache.has(name)) return structCache.get(name);
    if (++calls > MAX_TYPES * 4) return null;
    const r = await call(client, 'GetStructure', { structure_name: name });
    const raw = r.ok ? r.json?.structure_data : null;
    const fields = typeof raw === 'string' && /define\s+(structure|table)/i.test(raw) ? parseDdl(raw) : null;
    structCache.set(name, fields);
    return fields;
  }
  async function rowType(name) {
    const r = await call(client, 'GetTypeInfo', { type_name: name });
    const t = r.ok ? (r.text || '') : '';
    const m = /"ttyp:rowType":\{"ttyp:typeKind":"dictionaryType","ttyp:typeName":"([^"]+)"/.exec(t);
    return m ? up(m[1]) : null;
  }
  async function fieldsOf(typeName) {
    let t = up(typeName).replace(/^TABLE\s+OF\s+/, '').replace(/^STANDARD\s+TABLE\s+OF\s+/, '');
    if (!NAME_RE.test(t)) return null;
    let fields = await structure(t);
    if (!fields) { const row = await rowType(t); if (row) fields = await structure(row); }
    return fields;
  }
  const items = [...(iface?.params || []).filter((p) => p.kind !== 'exceptions'), ...(iface?.globals || [])].slice(0, MAX_TYPES);
  for (const p of items) {
    const typeName = up(p.type);
    try {
      if (BUILTIN_DDIC[typeName]) { ddic[up(p.name)] = BUILTIN_DDIC[typeName]; continue; }
      const fields = await fieldsOf(typeName);
      if (fields) {
        for (const [f, d] of Object.entries(fields)) {
          const e = d.element ? await element(d.element) : d;
          if (e) ddic[`${up(p.name)}-${f}`] = e;
        }
        continue;
      }
      const e = NAME_RE.test(typeName) ? await element(typeName) : null;
      if (e) { ddic[up(p.name)] = e; continue; }
      unknown.push(typeName);
    } catch (e) { errors.push({ type: typeName, error: short(e) }); }
  }
  return { ddic, unknown: [...new Set(unknown)], errors };
}

/** Text module lines (STXFTXT) and the paragraph formats of their SmartStyle (STXSPARA, style by name). */
export async function readTextModules(client, names, { language = 'E', style = '' } = {}) {
  const list = [...new Set((names || []).map(up).filter((n) => NAME_RE.test(n)))].slice(0, 20);
  const lang = /^[A-Z0-9]$/.test(up(language)) ? up(language) : 'E';
  const sty = NAME_RE.test(up(style)) ? up(style) : '';
  if (!list.length) return { texts: {}, errors: [] };
  const inList = list.map((n) => `'${n}'`).join(',');
  const t = await call(client, 'GetSqlQuery', { sql_query: `SELECT formname, linenr, tdformat, tdline FROM stxftxt WHERE formname IN (${inList}) AND spras = '${lang}'`, row_number: 2000 });
  // the paragraph formats of the text modules' SmartStyle (its name comes from the caller: the SmartForm text module)
  const s = sty ? await call(client, 'GetSqlQuery', { sql_query: `SELECT tdpargraph, tdpjustify, tdfamily, tdheight, tdbold, tditalic, tdunderlin FROM stxspara WHERE active = 'A' AND stylename = '${sty}'`, row_number: 200 }) : { ok: true, json: { rows: [] } };
  const errors = [];
  if (!t.ok) errors.push({ table: 'STXFTXT', error: t.error });
  if (!s.ok) errors.push({ table: 'STXSPARA', error: s.error });
  const texts = textsFromTables(t.ok ? t.json?.rows || [] : [], s.ok ? s.json?.rows || [] : []);
  return { texts, styles: sty ? { [sty]: s.ok ? (s.json?.rows || []).length : 0 } : {}, errors };
}

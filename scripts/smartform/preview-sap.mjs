// sc4sap:smartform-preview — the SAP reads of the preview workbench, through an MCP client the caller owns
// (the web backend's direct connection, or config/sap-reader.mjs `connect`). Read-only: GetSmartFormContent,
// GetStructure, GetDataElement, GetTypeInfo — never GetTableContents / GetSqlQuery, never a write tool.
// Never throws: errors come back in the result. The client is left open.
//
//   readForm(client, form)          → { ok: true, content, graphics: { NAME: { mime, base64 } }, files }
//                                   | { ok: false, code: 'bad-name' | 'no-helper' | 'not-found' | 'failed', error }
//   readFormDdic(client, content)   → { ddic, unknown: [typeName], errors: [{ type, error }] }
//       ddic in the shape fieldsFrom (preview-workbench.mjs) takes: structure { fields: { COMP: { type, length,
//       decimals, desc } } } (nested structures flattened as SUB-COMP, up to 3 levels), element { type, length,
//       decimals, desc }; a `TABLE-FIELD` reference (LIKE T247-LTX) becomes an element.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { listSymbols } from './build-preview.mjs';

export const READ_TOOLS = ['GetSmartFormContent', 'GetStructure', 'GetDataElement', 'GetTypeInfo'];
const FORM_RE = /^[A-Z0-9_/]{1,30}$/;
const TYPE_RE = /^[A-Z0-9_/]{1,30}(-[A-Z0-9_]{1,30})?$/;
const MAX_TYPES = 80;
// ABAP built-in types need no SAP read
const BUILTIN = { STRING: 'STRING', XSTRING: 'RAWSTRING', I: 'INT4', INT8: 'INT8', F: 'FLTP', D: 'DATS', T: 'TIMS', C: 'CHAR', N: 'NUMC', P: 'DEC', X: 'RAW', DECFLOAT16: 'DF16_DEC', DECFLOAT34: 'DF34_DEC' };

const up = (s) => String(s ?? '').trim().toUpperCase();
const short = (e) => String(e?.message ?? e ?? 'error').replace(/\s+/g, ' ').slice(0, 300);

/** One read-only tool call: { ok, json, error } (text answers parsed when they are JSON). */
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

/** A file the tool wrote, read only when its real path lies inside `dir` (the form's output folder). */
function readInside(dir, file) {
  try {
    const root = realpathSync(dir);
    const real = realpathSync(resolve(root, String(file)));
    const rel = relative(root, real);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
    return readFileSync(real);
  } catch { return null; }
}

/** The form's full content (active version, logon language) and its SE78 graphics as a renderPreview map. */
export async function readForm(client, form) {
  const name = up(form);
  if (!FORM_RE.test(name)) return { ok: false, code: 'bad-name', error: 'a SmartForm name (letters, digits, _ /, ≤ 30)' };
  const r = await call(client, 'GetSmartFormContent', { form_name: name, summary: true });
  if (!r.ok) {
    if (/SSF_CONTENT|ZMCP_SSF|not installed|dispatcher action|install/i.test(r.error)) return { ok: false, code: 'no-helper', error: r.error };
    if (/not found|does not exist|no such|not exist/i.test(r.error)) return { ok: false, code: 'not-found', error: r.error };
    return { ok: false, code: 'failed', error: r.error };
  }
  const file = r.json?.files?.content;
  // the file the tool itself wrote (its MCP output folder); nothing else is opened
  if (!file || !/\.content\.json$/i.test(basename(String(file))) || !existsSync(file)) return { ok: false, code: 'failed', error: 'the tool wrote no content file' };
  let content;
  try { content = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return { ok: false, code: 'failed', error: `content file: ${short(e)}` }; }
  const graphics = {};
  for (const g of content.graphics || []) {
    if (!g?.name || !g.file) continue;
    const buf = readInside(dirname(file), g.file);
    if (buf) graphics[g.name] = { mime: 'image/bmp', base64: buf.toString('base64') };
  }
  return { ok: true, content, graphics, files: { content: file } };
}

const structureOf = (json) => {
  const raw = json?.structure_data ?? json?.table_data;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw || null; } catch { return null; }
};
const elementOf = (json) => {
  const raw = json?.data_element_data;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw || null; } catch { return null; }
};
const fieldEntry = (f) => ({ type: up(f.datatype || f.type), length: Number(f.leng ?? f.length ?? 0) || 0, decimals: Number(f.decimals ?? f.decimal ?? 0) || 0, desc: String(f.description ?? f.desc ?? '') });

/**
 * DDIC of every type behind the form's printed symbols. Per type: GetStructure (also reads tables), else
 * GetDataElement, else GetTypeInfo (a table type → its line type). Unknown types are listed, never guessed.
 */
export async function readFormDdic(client, content) {
  const ddic = {}, errors = [], unknown = [];
  let symbols = [];
  try { symbols = listSymbols(content).symbols; } catch (e) { return { ddic, unknown, errors: [{ type: '', error: `content: ${short(e)}` }] }; }
  const want = [...new Set(symbols.filter((s) => !s.system && s.declaration?.typeName).map((s) => up(s.declaration.typeName)))];
  const cache = new Map();

  async function structure(name, depth) {
    if (cache.has(name)) return cache.get(name);
    const r = await call(client, 'GetStructure', { structure_name: name });
    const s = r.ok ? structureOf(r.json) : null;
    if (!s || !Array.isArray(s.fields)) { cache.set(name, null); return null; }
    const fields = {};
    for (const f of s.fields) {
      const fname = up(f.fieldname);
      if (!fname || fname.startsWith('.')) continue; // .INCLUDE / .APPEND: their fields follow, expanded
      if (f.comptype === 'S' && f.rollname && depth < 3) {
        const sub = await structure(up(f.rollname), depth + 1);
        if (sub) for (const [k, v] of Object.entries(sub.fields)) fields[`${fname}-${k}`] = v;
        continue;
      }
      if (f.datatype || f.type) fields[fname] = fieldEntry(f);
    }
    const out = { fields };
    cache.set(name, out);
    return out;
  }

  async function element(name) {
    const r = await call(client, 'GetDataElement', { data_element_name: name });
    const e = r.ok ? elementOf(r.json) : null;
    return e && (e.datatype || e.type) ? fieldEntry(e) : null;
  }

  for (const type of want.slice(0, MAX_TYPES)) {
    if (!TYPE_RE.test(type)) { unknown.push(type); continue; }
    if (Object.prototype.hasOwnProperty.call(BUILTIN, type)) { ddic[type] = { type: BUILTIN[type], length: 0, decimals: 0, desc: '' }; continue; }
    try {
      if (type.includes('-')) { // LIKE TABLE-FIELD
        const [tab, fld] = type.split('-');
        const s = await structure(tab, 0);
        if (s && s.fields[fld]) { ddic[type] = s.fields[fld]; continue; }
        unknown.push(type); continue;
      }
      const s = await structure(type, 0);
      if (s) { ddic[type] = s; continue; }
      const e = await element(type);
      if (e) { ddic[type] = e; continue; }
      const t = await call(client, 'GetTypeInfo', { type_name: type });
      const line = t.ok ? up(t.json?.rowtype ?? t.json?.row_type ?? t.json?.lineType ?? t.json?.line_type ?? '') : '';
      if (line && TYPE_RE.test(line)) {
        const ls = await structure(line, 0);
        if (ls) { ddic[line] = ls; ddic[type] = { lineType: line }; continue; }
      }
      unknown.push(type);
      if (!t.ok) errors.push({ type, error: t.error });
    } catch (e) { errors.push({ type, error: short(e) }); unknown.push(type); }
  }
  for (const type of want.slice(MAX_TYPES)) unknown.push(type);
  return { ddic, unknown: [...new Set(unknown)], errors };
}

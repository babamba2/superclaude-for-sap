// sc4sap:graph — field-level CRUD of customer tables (P1 of the field map in cbo-relation-map).
// Reads the same ABAP source units as extract-edges.mjs plus the DD03L rows of Step G3a and emits fields.json:
// for every field of a customer table (and every customer append / include field of a standard table) which
// object creates, reads, updates or deletes it, with the source line. SQL statements only — no data-flow
// tracking of work areas — so "changed" means a database write. No LLM, no SAP call.
//
//   C  INSERT (row)   R  SELECT list   F  WHERE / JOIN ON / GROUP BY / HAVING / ORDER BY (read as a condition)
//   U  UPDATE SET f (that field) · UPDATE … FROM wa (row)   D  DELETE (row)   MODIFY = C + U (row)
//   A row-level ref has field "*" (SELECT *, INSERT / MODIFY / UPDATE / DELETE from a work area) and counts for
//   every field of the table.
//
// Structures: a customer structure included or appended into a table (DD03L .INCLUDE / .APPEND, PRECFIELD)
// inherits the CRUD of the table fields it contributes — `structures[S].tables`.
//
// CLI
//   node extract-fields.mjs --prog-dir <dir> [--prog-dir …] --ddic <ddic-reads.json | ddic.json> [--members walk.json] --out fields.json
//   node extract-fields.mjs query <fields.json> <TABLE-FIELD | STRUCTURE-FIELD | TABLE>   (JSON; --md for a table)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lexAbap, statementText } from './abap-lexer.mjs';
import { isCustomName, loadDdicReads } from './ddic-edges.mjs';
import { discoverUnits, normalizeMembers } from './extract-edges.mjs';

export const FIELD_EXTRACTOR = 'extract-fields@1';
const EVIDENCE_CAP = 3;
const OPS = ['C', 'R', 'U', 'D', 'F'];
const up = (s) => String(s ?? '').trim().toUpperCase();
const rowsOf = (x) => (Array.isArray(x) ? x : Array.isArray(x?.rows) ? x.rows : []);
const isCustomStruct = (n) => isCustomName(n) || /^CI_/.test(n);

// ---------------------------------------------------------------- field model

/**
 * DD03L rows → { tables: Map T → { fields: [{ name, pos, key, rollname, struct }], scope }, structs: Map S → Set fields }
 * members: Map name → type (walk.json). A member TABL / VIEW keeps all its fields; any other table (standard)
 * keeps only the fields of its customer .APPEND / .INCLUDE structures.
 */
export function buildFieldModel(fieldRows, members = new Map()) {
  const byTab = new Map();
  for (const r of rowsOf(fieldRows)) {
    const t = up(r.TABNAME);
    if (!t) continue;
    if (!byTab.has(t)) byTab.set(t, []);
    byTab.get(t).push(r);
  }
  for (const rows of byTab.values()) rows.sort((a, b) => Number(a.POSITION || 0) - Number(b.POSITION || 0));
  const structFields = new Map();
  for (const [t, rows] of byTab) structFields.set(t, new Set(rows.map((r) => up(r.FIELDNAME)).filter((f) => f && !f.startsWith('.'))));

  const tables = new Map();
  const structs = new Map();
  for (const [t, rows] of byTab) {
    const type = members.get(t);
    const member = type === 'TABL' || type === 'VIEW';
    if (type && !member) continue; // STRU / TTYP rows only feed structFields
    const incs = rows.filter((r) => /^\.(INCLU|APPEND)/.test(up(r.FIELDNAME)) && up(r.PRECFIELD));
    const customIncs = incs.map((r) => up(r.PRECFIELD)).filter((s) => isCustomStruct(s));
    if (!member && (!customIncs.length || isCustomName(t))) continue; // unknown customer name without walk entry, or no append
    const own = new Map(); // field → struct
    for (const s of customIncs) for (const f of structFields.get(s) || []) if (!own.has(f)) own.set(f, s);
    const fields = [];
    const seen = new Set();
    const add = (name, r, struct) => {
      if (seen.has(name)) return;
      seen.add(name);
      fields.push({ name, pos: fields.length + 1, key: up(r?.KEYFLAG) === 'X', rollname: up(r?.ROLLNAME) || undefined, struct: struct || undefined });
    };
    if (member) {
      for (const r of rows) {
        const f = up(r.FIELDNAME);
        if (f && !f.startsWith('.')) add(f, r, own.get(f));
      }
    } else {
      // standard table: only the fields of its customer appends (from the structures' own DD03L rows)
      const flat = new Map(rows.map((r) => [up(r.FIELDNAME), r]));
      for (const s of customIncs) for (const f of structFields.get(s) || []) add(f, flat.get(f), s);
    }
    if (!fields.length) continue;
    tables.set(t, { type: member ? type : 'TABL', scope: member ? 'member' : 'append', fields });
    for (const s of customIncs) {
      if (!structs.has(s)) structs.set(s, { fields: [...(structFields.get(s) || [])], tables: [] });
      structs.get(s).tables.push(t);
    }
  }
  return { tables, structs };
}

// ---------------------------------------------------------------- SQL parsing

const tokenize = (s) => s.replace(/([(),])/g, ' $1 ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

/** split nested `( SELECT … )` out of a statement: [outer, ...inner] (each starting at SELECT) */
export function sqlSegments(u) {
  const out = [];
  let outer = '';
  for (let i = 0; i < u.length; i++) {
    if (u[i] === '(' && /^\(\s*SELECT\b/.test(u.slice(i))) {
      let depth = 0;
      let j = i;
      for (; j < u.length; j++) {
        if (u[j] === '(') depth++;
        else if (u[j] === ')' && --depth === 0) break;
      }
      out.push(...sqlSegments(u.slice(i + 1, j).trim()));
      outer += ' ( ) ';
      i = j;
    } else outer += u[i];
  }
  return [outer, ...out];
}

const CLAUSE = {
  FROM: 'from', FIELDS: 'fields', WHERE: 'where', HAVING: 'having', INTO: 'into', APPENDING: 'into',
};
const JOIN_HEADS = new Set(['INNER', 'LEFT', 'RIGHT', 'CROSS', 'OUTER', 'JOIN']);
const FROM_SKIP = new Set(['CLIENT', 'SPECIFIED', 'USING', 'BYPASSING', 'BUFFER', 'ALL', 'CLIENTS', 'UP', 'TO', 'ROWS', 'CONNECTION']);

/**
 * one SELECT segment → { tables: [{ name, alias }], cols: [{ q, f, op }] }  (op R = list, F = condition)
 * cols are raw tokens (`a~f`, `f`, `*`, `a~*`); resolution against the field model happens later.
 */
export function parseSelect(seg) {
  const tk = tokenize(seg);
  const tables = [];
  const cols = [];
  let clause = 'list';
  let fromNeedsName = false;
  let dynamic = false;
  for (let i = 1; i < tk.length; i++) {
    const t = tk[i];
    const next = tk[i + 1];
    if (t === 'GROUP' && next === 'BY') { clause = 'cond'; i++; continue; }
    if (t === 'ORDER' && next === 'BY') { clause = 'cond'; i++; continue; }
    if (t === 'FOR' && next === 'ALL') { clause = 'fae'; continue; }
    if (t === 'UP' && next === 'TO') { clause = 'skip'; continue; }
    if (CLAUSE[t]) {
      clause = CLAUSE[t] === 'where' || CLAUSE[t] === 'having' ? 'cond' : CLAUSE[t];
      if (clause === 'from') fromNeedsName = true;
      continue;
    }
    if (clause === 'from') {
      if (JOIN_HEADS.has(t)) { if (t === 'JOIN') fromNeedsName = true; continue; }
      if (t === 'ON') { clause = 'on'; continue; }
      if (t === 'AS' && tables.length) { tables[tables.length - 1].alias = up(next); i++; continue; }
      if (fromNeedsName && t === '(' && tk[i + 2] === ')') { dynamic = true; fromNeedsName = false; i += 2; continue; }
      if (fromNeedsName && /^[A-Z0-9_/]+$/.test(t)) { tables.push({ name: t, alias: t }); fromNeedsName = false; continue; }
      if (FROM_SKIP.has(t)) continue;
      continue;
    }
    if (clause === 'on') {
      if (JOIN_HEADS.has(t)) { clause = 'from'; if (t === 'JOIN') fromNeedsName = true; continue; }
      if (/^[A-Z0-9_/]+~[A-Z0-9_/]+$/.test(t) || /^[A-Z0-9_/]+$/.test(t)) cols.push({ tok: t, op: 'F' });
      continue;
    }
    if (clause === 'into' || clause === 'fae' || clause === 'skip') {
      if (clause === 'fae' && t === 'WHERE') clause = 'cond';
      continue;
    }
    if (clause === 'list' && (t === 'SINGLE' || t === 'DISTINCT')) continue;
    if (t.startsWith('@') || t.includes('-') || t.startsWith("'")) continue;
    if (t === '*' && tk[i - 1] === '(') continue; // COUNT(*)
    if (/^(?:[A-Z0-9_/]+~)?(?:[A-Z0-9_/]+|\*)$/.test(t)) cols.push({ tok: t, op: clause === 'cond' ? 'F' : 'R' });
  }
  return { tables, cols, dynamic };
}

/** write statement → { table, op[], set: [fields], cond: [tokens] } or null */
export function parseWrite(u) {
  const T = '([A-Z0-9_/]+)';
  let m;
  const condOf = (s) => {
    const w = /\bWHERE\b(.*)$/.exec(s);
    return w ? tokenize(w[1]).filter((t) => !t.startsWith('@') && !t.includes('-') && /^[A-Z0-9_/]+(~[A-Z0-9_/]+)?$/.test(t)) : [];
  };
  // cluster tables: the whole row (no field names in the statement)
  if ((m = new RegExp(`^(IMPORT|EXPORT|DELETE)\\b.*\\b(?:FROM|TO) DATABASE\\s+${T}\\(`).exec(u))) {
    return { table: m[2], ops: m[1] === 'IMPORT' ? ['R'] : m[1] === 'EXPORT' ? ['C', 'U'] : ['D'], row: true, cond: [] };
  }
  if (/^INSERT\s+\S+\s+INTO\s+TABLE\b/.test(u) || /^INSERT INTO TABLE\b/.test(u) || /^INSERT LINES\b/.test(u)) return null;
  if ((m = new RegExp(`^INSERT (?:INTO )?${T}(?:\\s+(?:CLIENT SPECIFIED|USING CLIENT \\S+|USING ALL CLIENTS))?(?:\\s+(FROM|VALUES)\\b|$)`).exec(u))) return { table: m[1], ops: ['C'], row: true, cond: [] };
  if ((m = new RegExp(`^UPDATE ${T}\\s+(?:CLIENT SPECIFIED\\s+|USING CLIENT \\S+\\s+)?SET\\b(.*?)(?:\\bWHERE\\b.*)?$`).exec(u))) {
    const tk = tokenize(m[2]);
    const set = [];
    const rhs = [];
    tk.forEach((t, i) => {
      if (!/^[A-Z0-9_/]+(~[A-Z0-9_/]+)?$/.test(t)) return;
      if (tk[i + 1] === '=') set.push(t);
      else if (tk[i - 1] !== undefined) rhs.push(t);
    });
    return { table: m[1], ops: ['U'], row: false, set, rhs, cond: condOf(u) };
  }
  if ((m = new RegExp(`^UPDATE ${T}(?:\\s+FROM\\b|$|\\s+CLIENT\\b|\\s+USING\\b)`).exec(u))) return { table: m[1], ops: ['U'], row: true, cond: [] };
  if ((m = new RegExp(`^MODIFY ${T}(?:\\s+FROM\\b|$|\\s+CLIENT\\b|\\s+USING CLIENT\\b)`).exec(u))) {
    if (/\b(INDEX|TRANSPORTING|USING KEY)\b/.test(u)) return null;
    return { table: m[1], ops: ['C', 'U'], row: true, cond: [] };
  }
  if ((m = new RegExp(`^DELETE FROM ${T}`).exec(u))) return { table: m[1], ops: ['D'], row: true, cond: condOf(u) };
  if ((m = new RegExp(`^DELETE ${T}(?:\\s+FROM\\b|$)`).exec(u))) return { table: m[1], ops: ['D'], row: true, cond: [] };
  return null;
}

// ---------------------------------------------------------------- extraction

class RefBuilder {
  constructor(model) {
    this.model = model;
    this.refs = new Map();
  }
  add(t, f, op, from, ev, confidence) {
    const k = `${t}|${f}|${op}|${from}`;
    let r = this.refs.get(k);
    if (!r) {
      r = { t, f, op, from, count: 0, evidence: [] };
      if (confidence) r.confidence = confidence;
      this.refs.set(k, r);
    } else if (!confidence) delete r.confidence;
    r.count++;
    if (r.evidence.length < EVIDENCE_CAP && !r.evidence.some((e) => e.unit === ev.unit && e.line === ev.line)) r.evidence.push(ev);
  }
  hasField(t, f) {
    return !!this.model.tables.get(t)?.fields.some((x) => x.name === f);
  }
  /** resolve a column token against the statement's tables */
  col(tok, tables, op, from, ev) {
    const [q, f] = tok.includes('~') ? tok.split('~') : [null, tok];
    const cand = q ? tables.filter((x) => x.alias === q || x.name === q) : tables;
    const known = cand.filter((x) => this.model.tables.has(x.name));
    if (f === '*') {
      if (op === 'R') for (const x of known) this.add(x.name, '*', 'R', from, ev);
      return;
    }
    const hits = known.filter((x) => this.hasField(x.name, f));
    for (const x of hits) this.add(x.name, f, op, from, ev, hits.length > 1 ? 'low' : undefined);
  }
}

/** units as in extract-edges ({ file | source, unit, object }) → fields.json */
export function extractFields(units, { fieldRows, members, package: pkg, builtAt } = {}) {
  const mem = normalizeMembers(members);
  const model = buildFieldModel(fieldRows, mem);
  const b = new RefBuilder(model);
  const cov = { units: 0, statements: 0, sql: 0, dynamic: 0 };
  for (const u of units) {
    const source = u.source ?? readFileSync(u.file, 'utf8');
    const unit = up(u.unit);
    const owner = up(u.object || `PROG:${unit}`);
    const { statements, lits } = lexAbap(source);
    cov.units++;
    let from = owner;
    for (const st of statements) {
      cov.statements++;
      const s = st.upper;
      const fm = /^FUNCTION\s+([A-Z0-9_/]+)/.exec(s);
      if (fm && !/^FUNCTION-POOL/.test(s)) { from = `FUNC:${fm[1]}`; continue; }
      if (/^ENDFUNCTION\b/.test(s)) { from = owner; continue; }
      const ev = { unit, line: st.line, text: statementText(st, lits) };
      const w = parseWrite(s);
      if (w) {
        cov.sql++;
        const t = w.table;
        if (!model.tables.has(t)) continue;
        const tabs = [{ name: t, alias: t }];
        if (w.row) for (const op of w.ops) b.add(t, '*', op, from, ev);
        for (const f of w.set || []) b.col(f, tabs, 'U', from, ev);
        for (const f of w.rhs || []) b.col(f, tabs, 'R', from, ev);
        for (const f of w.cond) b.col(f, tabs, 'F', from, ev);
        // subqueries in WHERE
        for (const seg of sqlSegments(s).slice(1)) addSelect(b, seg, from, ev, cov);
        continue;
      }
      const sel = s.search(/(?<![-\w])SELECT(?![-\w])/);
      if (sel < 0 || !/^(SELECT|OPEN CURSOR|WITH)\b/.test(s)) continue;
      cov.sql++;
      for (const seg of sqlSegments(s.slice(sel))) addSelect(b, seg, from, ev, cov);
    }
  }
  const refs = [...b.refs.values()].sort((x, y) => (x.t + x.f + x.op + x.from).localeCompare(y.t + y.f + y.op + y.from));
  return {
    package: pkg || undefined,
    builtAt: builtAt || new Date().toISOString(),
    extractor: FIELD_EXTRACTOR,
    tables: Object.fromEntries([...model.tables].map(([t, v]) => [t, v])),
    structures: Object.fromEntries([...model.structs].map(([s, v]) => [s, v])),
    refs,
    coverage: { ...cov, tables: model.tables.size, structures: model.structs.size, refs: refs.length },
  };
}

function addSelect(b, seg, from, ev, cov) {
  if (!/^SELECT\b/.test(seg)) return;
  const { tables, cols, dynamic } = parseSelect(seg);
  if (dynamic) cov.dynamic++;
  for (const c of cols) b.col(c.tok, tables, c.op, from, ev);
}

// ---------------------------------------------------------------- query

/**
 * fields.json + "T-F" | "S-F" | "T" → usage. A structure field resolves to every table that includes it;
 * row-level refs ("*") count for every field.
 */
export function fieldUsage(fx, target) {
  const name = up(target);
  const [obj, field] = name.includes('-') ? [name.slice(0, name.indexOf('-')), name.slice(name.indexOf('-') + 1)] : [name, null];
  const tables = fx.tables[obj] ? [obj] : fx.structures[obj]?.tables || [];
  if (!tables.length) return { target: name, found: false };
  const fieldsOf = (t) => (fx.structures[obj] && !fx.tables[obj] ? fx.structures[obj].fields : fx.tables[t].fields.map((f) => f.name));
  const out = { target: name, found: true, tables, fields: [] };
  for (const t of tables) {
    for (const f of fieldsOf(t)) {
      if (field && f !== field) continue;
      const refs = fx.refs.filter((r) => r.t === t && (r.f === f || r.f === '*'));
      const ops = Object.fromEntries(OPS.map((o) => [o, refs.filter((r) => r.op === o).map((r) => ({ from: r.from, row: r.f === '*', count: r.count, confidence: r.confidence, evidence: r.evidence }))]));
      out.fields.push({ table: t, field: f, ops });
    }
  }
  return out;
}

export function usageMarkdown(u) {
  if (!u.found) return `${u.target}: not in fields.json`;
  const lines = ['| table | field | C | R | U | D | F |', '|---|---|---|---|---|---|---|'];
  for (const r of u.fields) lines.push(`| ${r.table} | ${r.field} | ${OPS.map((o) => [...new Set(r.ops[o].map((x) => x.from.replace(/^[A-Z]+:/, '') + (x.row ? '*' : '')))].join(', ') || '').join(' | ')} |`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- CLI

function loadFieldRows(path) {
  const j = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(j) && j.some((r) => r.table)) return loadDdicReads(j, (p) => JSON.parse(readFileSync(p, 'utf8'))).ddic?.fields || [];
  return rowsOf(j.fields);
}

function runCli(argv) {
  if (argv[0] === 'query') {
    const fx = JSON.parse(readFileSync(argv[1], 'utf8'));
    const u = fieldUsage(fx, argv[2]);
    return argv.includes('--md') ? usageMarkdown(u) : JSON.stringify(u);
  }
  const a = { progDirs: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--prog-dir') a.progDirs.push(argv[++i]);
    else if (k === '--ddic') a.ddic = argv[++i];
    else if (k === '--members') a.members = argv[++i];
    else if (k === '--out') a.out = argv[++i];
  }
  if (!a.progDirs.length || !a.ddic || !a.out) throw new Error('usage: extract-fields.mjs --prog-dir <dir> --ddic <ddic-reads.json|ddic.json> [--members walk.json] --out fields.json');
  const members = a.members && existsSync(a.members) ? JSON.parse(readFileSync(a.members, 'utf8')) : undefined;
  const fx = extractFields(a.progDirs.flatMap((d) => discoverUnits(d)), { fieldRows: loadFieldRows(a.ddic), members, package: members?.package });
  writeFileSync(a.out, `${JSON.stringify(fx, null, 1)}\n`);
  return JSON.stringify({ out: a.out, ...fx.coverage });
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  try {
    process.stdout.write(`${runCli(process.argv.slice(2))}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}

// sc4sap:graph — deterministic reference-graph extractor (P1 of the CBO
// reference-graph design). Reads ABAP source units already saved on disk
// (GetProgFullCode output:"file" layout) and emits graph.json: nodes, typed
// edges with source-line evidence, unresolved dynamic calls and coverage.
// No LLM, no SAP call — works the same on ECC (where GetWhereUsed is 404) and S/4.
//
// Units: { file | source, unit, object }  — unit = include / main program / class
// name, object = owning node id (PROG:X, FUGR:X, CLAS:X, INTF:X, FUNC:X, INCL:X).
// Statements inside FUNCTION … ENDFUNCTION are attributed to FUNC:<name>
// (node.parent = the FUGR). Everything else is attributed to the owning object;
// `include` edges go from the unit that holds the INCLUDE statement.
//
// CLI
//   node extract-edges.mjs --units <units.json> --out <graph.json> [--members <walk.json | list.json | A,B:TYPE>]
//        [--package P] [--module M] [--system S] [--sap-version ECC|S4] [--tcodes <json>] [--built-at ISO]
//   node extract-edges.mjs --prog-dir <dir> [--prog-dir <dir2> …] --out <graph.json> [same options]
//     --prog-dir accepts a <prog>.prog / <grp>.fugr folder or a folder holding several of them
//     plus loose <x>.clas.abap / .intf.abap / .func.abap / .prog.abap files.
//   --tcodes: [{ "tcode": "ZX01", "program": "ZXR001" }] or { "ZX01": "ZXR001" } → TRAN launches edges.
//   Prints { out, nodes, edges, unresolved, ms } on stdout.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lexAbap, litValue, statementText } from './abap-lexer.mjs';

export const EXTRACTOR = 'extract-edges@1';
export const EDGE_KINDS = ['include', 'calls', 'submits', 'starts', 'launches', 'reads', 'writes', 'uses', 'types', 'dynamic'];
const EVIDENCE_CAP = 5;
const SOURCE_TYPES = new Set(['PROG', 'INCL', 'FUGR', 'FUNC', 'CLAS', 'INTF']);

const NAME = '[A-Z0-9_/][A-Z0-9_/]*';
const BUILTIN = new Set(
  ('C N I P F D T X B S STRING XSTRING DECFLOAT16 DECFLOAT34 INT1 INT2 INT4 INT8 UTCLONG ANY DATA OBJECT SIMPLE CLIKE '
    + 'CSEQUENCE XSEQUENCE NUMERIC DECFLOAT TABLE INDEX STANDARD SORTED HASHED LINE REF RANGE OF TO SY SYST ME SUPER '
    + 'VALUE LENGTH DECIMALS BEGIN END INITIAL SIZE WITH KEY UNIQUE NON-UNIQUE DEFAULT EMPTY OCCURS').split(' '),
);
const CLASS_LIKE = /^(?:\/[A-Z0-9_]+\/)?(?:[ZYL]?(?:CL|CX|IF)_|[ZY](?:CL|CX|IF))/;
const INTF_LIKE = /^(?:\/[A-Z0-9_]+\/)?(?:[ZYL]?IF_|[ZY]IF)/;
const LOCAL_PREFIX = /^[A-Z]{1,3}_/; // LT_, GT_, MT_, IT_, T_, LS_ … (never Z*/Y*/namespace names)
const DECL_HEADS = /^(DATA|CLASS-DATA|STATICS|CONSTANTS|TYPES|FIELD-SYMBOLS|PARAMETERS|PARAMETER|SELECT-OPTIONS|RANGES|METHODS|CLASS-METHODS|FORM|FUNCTION|EVENTS|CLASS-EVENTS|CREATE DATA)\b/;
const SQL_HEADS = /^(SELECT(?![-\w])|OPEN CURSOR|WITH \+|INSERT|UPDATE|MODIFY|DELETE)\b/;

// ---------------------------------------------------------------- helpers

const up = (s) => String(s ?? '').trim().toUpperCase();
const hash = (s) => createHash('sha1').update(String(s).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
const idOf = (type, name) => `${type}:${up(name)}`;
const nameOf = (id) => String(id).slice(String(id).indexOf(':') + 1);
const typeOf = (id) => String(id).slice(0, String(id).indexOf(':'));
const isLocalPrefixed = (n) => LOCAL_PREFIX.test(n) && !/^[ZY]/.test(n) && !/^J_\d/.test(n);
const looksItab = (n) => /->|-|<|\[|\(/.test(n) || isLocalPrefixed(n);
const isCustomName = (n) => /^[ZY]/.test(n) || /^\/(?!SAP|BEV|BA1|BIC|BI0|1BEA|1BS|SCWM|SCMB|SAPAPO|SAPSLL|SAPTRX|IWBEP|UI2|UI5|BOBF|AIF)[A-Z0-9_]+\//.test(n);
const clsType = (n) => (INTF_LIKE.test(n) ? 'INTF' : 'CLAS');

/** first identifier of a string (after optional `BEGIN OF`) */
function firstName(s) {
  const m = new RegExp(`^(?:BEGIN OF\\s+|END OF\\s+)?(<?${NAME}>?)`).exec(s.trim());
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- pass 1: declarations per object

function collectDecls(stmts, lits, decl) {
  for (const st of stmts) {
    const u = st.upper;
    // local types
    if (/^TYPES\b/.test(u)) {
      const body = u.replace(/^TYPES\s*/, '');
      if (/^BEGIN OF\b/.test(body)) {
        if (!/^BEGIN OF (ENUM|MESH)\b/.test(body)) decl.types.add(firstName(body));
        decl.typesDepth++;
      } else if (/^END OF\b/.test(body)) decl.typesDepth = Math.max(0, decl.typesDepth - 1);
      else if (decl.typesDepth === 0) {
        const n = firstName(body);
        if (n) decl.types.add(n);
      }
    }
    // data objects (first token of the declaration body)
    const dm = /^(DATA|CLASS-DATA|STATICS|CONSTANTS|FIELD-SYMBOLS|PARAMETERS|PARAMETER|SELECT-OPTIONS|RANGES)\s+(.*)$/.exec(u);
    if (dm) {
      const body = dm[2];
      const n = firstName(body);
      if (/^BEGIN OF\b/.test(body)) {
        if (decl.dataDepth === 0 && n) decl.data.add(n);
        decl.dataDepth++;
      } else if (/^END OF\b/.test(body)) decl.dataDepth = Math.max(0, decl.dataDepth - 1);
      else if (decl.dataDepth === 0 && n) decl.data.add(n);
      if (dm[1] === 'CONSTANTS') {
        const cv = new RegExp(`^(${NAME})\\b.*\\bVALUE\\s+('§\\d+')`).exec(body);
        if (cv) decl.constants.set(cv[1], up(litValue(cv[2], lits)));
      }
    }
    // inline declarations
    for (const m of u.matchAll(/\b(?:DATA|FINAL)\((<?[A-Z0-9_]+>?)\)|\bFIELD-SYMBOL\((<[A-Z0-9_]+>)\)/g)) decl.data.add(m[1] || m[2]);
    // signature parameters: the identifier before TYPE / LIKE / STRUCTURE
    if (/^(METHODS|CLASS-METHODS|FORM|FUNCTION|EVENTS|CLASS-EVENTS)\b/.test(u)) {
      for (const m of u.matchAll(new RegExp(`(?:VALUE|REFERENCE)\\((${NAME})\\)|(${NAME})\\s+(?:TYPE|LIKE|STRUCTURE)\\b`, 'g'))) {
        decl.data.add(m[1] || m[2]);
      }
      const tb = /^FORM\s+\S+\s+TABLES\s+(.*?)(?:\s+USING\b|\s+CHANGING\b|\s+RAISING\b|$)/.exec(u);
      if (tb) for (const t of tb[1].split(/\s+/)) if (/^[A-Z_][A-Z0-9_]*$/.test(t) && t !== 'STRUCTURE') decl.data.add(t);
    }
    // TABLES work areas (DB / structure names)
    const tm = /^TABLES\s+(.*)$/.exec(u);
    if (tm) for (const t of tm[1].split(/[\s,]+/)) if (/^\*?[A-Z0-9_/]+$/.test(t)) decl.tables.add(t.replace(/^\*/, ''));
    // local classes / interfaces
    const cm = new RegExp(`^(CLASS|INTERFACE)\\s+(${NAME})\\b(.*)$`).exec(u);
    if (cm && !/\bLOAD\b/.test(cm[3]) && !/\bDEFERRED PUBLIC\b/.test(cm[3]) && !/\bPUBLIC\b/.test(cm[3])) {
      if (cm[1] === 'INTERFACE' || /\bDEFINITION\b/.test(cm[3]) || /\bIMPLEMENTATION\b/.test(cm[3])) decl.classes.add(cm[2]);
    }
  }
}

// ---------------------------------------------------------------- graph builder

class GraphBuilder {
  constructor(opts) {
    this.opts = opts;
    this.nodes = new Map();
    this.edges = new Map();
    this.unresolved = new Map();
    this.ddicRank = new Map(); // name → { type, rank }
    this.members = opts.members || new Map(); // name → type
  }

  node(id, extra = {}) {
    let n = this.nodes.get(id);
    if (!n) {
      n = { id, type: typeOf(id), name: nameOf(id) };
      this.nodes.set(id, n);
    }
    Object.assign(n, extra);
    return n;
  }

  ddic(name, type, rank) {
    const cur = this.ddicRank.get(name);
    if (!cur || rank > cur.rank) this.ddicRank.set(name, { type, rank });
    return `DDIC:${name}`; // placeholder id, resolved in finish()
  }

  edge(from, to, kind, ev, attrs = {}) {
    const key = `${from}|${kind}|${to}`;
    let e = this.edges.get(key);
    if (!e) {
      e = { from, to, kind, evidence: [], count: 0 };
      this.edges.set(key, e);
    }
    e.count++;
    if (e.evidence.length < EVIDENCE_CAP) e.evidence.push(ev);
    const { op, confidence, ...rest } = attrs;
    if (op) e.ops = [...new Set([...(e.ops || []), op])].sort();
    if (confidence === 'low') {
      if (!e._high) e.confidence = 'low';
    } else {
      e._high = true;
      delete e.confidence;
    }
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'destination' || k === 'form') e[k] = [...new Set([...(e[k] || []), v])].sort();
      else e[k] = v;
    }
    return e;
  }

  dynamic(from, via, token, ev, attrs = {}) {
    const tok = up(token).replace(/^\(|\)$/g, '') || '?';
    const to = `DYN:${via.toUpperCase()}:${tok}`;
    this.node(to, { scope: 'dynamic' });
    this.edge(from, to, 'dynamic', ev, { via, ...attrs });
    const key = `${from}|${via}|${tok}`;
    let u = this.unresolved.get(key);
    if (!u) {
      u = { from, kind: 'dynamic', via, token: tok, evidence: [], count: 0 };
      this.unresolved.set(key, u);
    }
    u.count++;
    if (u.evidence.length < EVIDENCE_CAP) u.evidence.push(ev);
  }

  finish(meta) {
    const remap = new Map();
    for (const [name, { type }] of this.ddicRank) {
      const memberType = this.members.get(name);
      const t = memberType && !SOURCE_TYPES.has(memberType) ? memberType : type;
      remap.set(`DDIC:${name}`, idOf(t, name));
      const rank = this.ddicRank.get(name).rank;
      this.node(idOf(t, name), rank === 1 && !memberType ? { guess: true } : {});
    }
    const edges = [];
    const merged = new Map();
    for (const e of this.edges.values()) {
      const to = remap.get(e.to) || e.to;
      const key = `${e.from}|${e.kind}|${to}`;
      const prev = merged.get(key);
      if (prev) {
        prev.count += e.count;
        prev.evidence = [...prev.evidence, ...e.evidence].slice(0, EVIDENCE_CAP);
        continue;
      }
      const out = { ...e, to };
      delete out._high;
      merged.set(key, out);
      edges.push(out);
    }
    for (const e of edges) {
      if (!this.nodes.has(e.to)) this.node(e.to);
      if (!this.nodes.has(e.from)) this.node(e.from);
    }
    for (const n of this.nodes.values()) {
      if (n.scope) continue;
      n.scope = this.members.has(n.name) ? 'member' : isCustomName(n.name) ? 'custom' : 'standard';
    }
    const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const edgeOrder = (a, b) => (a.from + a.kind + a.to < b.from + b.kind + b.to ? -1 : 1);
    const nodes = [...this.nodes.values()].sort(byId);
    edges.sort(edgeOrder);
    const unresolved = [...this.unresolved.values()].sort((a, b) => (a.from + a.via + a.token < b.from + b.via + b.token ? -1 : 1));
    return { ...meta, nodes, edges, unresolved };
  }
}

// ---------------------------------------------------------------- pass 2: edges

function extractUnit(g, unit, lexed, decl, ownerId) {
  const { statements, lits } = lexed;
  const unitNode = unit.isMain ? ownerId : idOf('INCL', unit.unit);
  let from = ownerId;
  const knownLocal = (n) => decl.data.has(n) || decl.types.has(n) || decl.classes.has(n);
  const constLit = (tok) => {
    return decl.constants.get(up(tok)) || null;
  };

  for (const st of statements) {
    const u = st.upper;
    const ev = { unit: unit.unit, line: st.line, text: statementText(st, lits) };
    const lit = (tok) => {
      const v = litValue(tok, lits);
      return v == null ? null : up(v);
    };

    // FUNCTION … ENDFUNCTION → attribute to FUNC:<name>
    let m = new RegExp(`^FUNCTION\\s+(${NAME})`).exec(u);
    if (m && !/^FUNCTION-POOL/.test(u)) {
      from = idOf('FUNC', m[1]);
      if (from !== ownerId) g.node(from, { parent: ownerId, unit: unit.unit, line: st.line });
      extractTypes(g, u, ev, from, decl, knownLocal); // inline signature (… TYPE x)
      continue;
    }
    if (/^ENDFUNCTION\b/.test(u)) {
      from = ownerId;
      continue;
    }

    // include
    m = new RegExp(`^INCLUDE\\s+(${NAME})(?:\\s+IF FOUND)?$`).exec(u);
    if (m && !['STRUCTURE', 'TYPE'].includes(m[1])) {
      g.node(idOf('INCL', m[1]));
      g.edge(unitNode, idOf('INCL', m[1]), 'include', ev);
      continue;
    }

    // calls: CALL FUNCTION
    m = /^CALL FUNCTION\s+(\S+)/.exec(u);
    if (m) {
      const attrs = {};
      const d = /\bDESTINATION\s+(IN GROUP\s+\S+|\S+)/.exec(u);
      if (d) attrs.destination = lit(d[1]) ?? (/^IN GROUP/.test(d[1]) ? d[1] : `(${d[1]})`);
      if (/\bIN UPDATE TASK\b/.test(u)) attrs.update = true;
      if (/\bSTARTING NEW TASK\b/.test(u)) attrs.async = true;
      if (/\bIN BACKGROUND (TASK|UNIT)\b/.test(u)) attrs.background = true;
      const name = lit(m[1]) ?? constLit(m[1]);
      if (name) {
        if (/^BAPI_/.test(name)) attrs.bapi = true;
        if (!lit(m[1])) Object.assign(attrs, { confidence: 'low', constant: m[1] });
        g.edge(from, idOf('FUNC', name), 'calls', ev, attrs);
      } else g.dynamic(from, 'calls', m[1], ev, attrs);
      continue;
    }

    // calls: PERFORM … IN PROGRAM x / PERFORM form(prog)
    if (/^PERFORM\b/.test(u)) {
      const ip = /\bIN PROGRAM\s+(\S+)/.exec(u);
      const old = new RegExp(`^PERFORM\\s+(${NAME})\\((${NAME})\\)`).exec(u);
      const form = (/^PERFORM\s+(\S+)/.exec(u) || [])[1]?.replace(/\(.*$/, '');
      const target = ip ? ip[1] : old ? old[2] : null;
      if (target) {
        const name = lit(target) ?? (/^\(/.test(target) ? constLit(target.replace(/[()]/g, '')) : target);
        if (name && !/^\(/.test(name)) g.edge(from, idOf('PROG', name), 'calls', ev, { form: form && !/^\(/.test(form) ? form : undefined });
        else g.dynamic(from, 'calls', target, ev, { form });
      }
      continue;
    }

    // submits
    m = /^SUBMIT\s+(\S+)/.exec(u);
    if (m) {
      const attrs = {
        andReturn: /\bAND RETURN\b/.test(u),
        viaSelectionScreen: /\bVIA SELECTION-SCREEN\b/.test(u),
        job: /\bVIA JOB\b/.test(u),
      };
      let tok = m[1];
      const paren = /^\((\S+?)\)?$/.exec(tok);
      let name = null;
      if (paren) name = lit(paren[1]) ?? constLit(paren[1]);
      else name = tok;
      if (name) g.edge(from, idOf('PROG', name), 'submits', ev, paren && !lit(paren[1]) ? { ...attrs, confidence: 'low', constant: paren[1] } : attrs);
      else g.dynamic(from, 'submits', tok, ev, attrs);
      continue;
    }

    // starts
    m = /^(?:CALL|LEAVE TO) TRANSACTION\s+(\S+)/.exec(u);
    if (m) {
      const attrs = { bdc: /\bUSING\b/.test(u), skipFirstScreen: /\bAND SKIP FIRST SCREEN\b/.test(u) };
      const name = lit(m[1]) ?? constLit(m[1]);
      if (name) g.edge(from, idOf('TRAN', name), 'starts', ev, lit(m[1]) ? attrs : { ...attrs, confidence: 'low', constant: m[1] });
      else g.dynamic(from, 'starts', m[1], ev, attrs);
      continue;
    }

    // cluster tables: IMPORT … FROM DATABASE x(..) / EXPORT … TO DATABASE x(..) / DELETE FROM DATABASE x(..)
    m = new RegExp(`^(IMPORT|EXPORT|DELETE)\\b.*\\b(?:FROM|TO) DATABASE\\s+(${NAME})\\(`).exec(u);
    if (m) {
      const kind = m[1] === 'IMPORT' ? 'reads' : 'writes';
      g.edge(from, g.ddic(m[2], 'TABL', 3), kind, ev, kind === 'writes' ? { op: m[1] === 'DELETE' ? 'DELETE' : 'EXPORT' } : {});
      continue;
    }

    if (SQL_HEADS.test(u)) extractSql(g, u, ev, from, decl, lit);

    extractUses(g, u, ev, from, decl, ownerId);
    if (DECL_HEADS.test(u) || /^TABLES\b/.test(u) || /\bINCLUDE (?:STRUCTURE|TYPE)\b/.test(u)) extractTypes(g, u, ev, from, decl, knownLocal);
  }
}

function extractSql(g, u, ev, from, decl, lit) {
  const isItab = (n) => decl.data.has(n) || looksItab(n);
  const knownDb = (n) => decl.tables.has(n) || g.ddicRank.get(n)?.rank === 3 || ['TABL', 'VIEW'].includes(g.members.get(n));
  // reads: every FROM / JOIN after the first SELECT
  const sel = u.search(/(?<![-\w])SELECT(?![-\w])/);
  if (sel >= 0) {
    const re = /\b(FROM|JOIN)\s+((?:\(\s+)*)(@?)(\()?('§\d+'|[A-Z0-9_/]+)(\))?/g;
    re.lastIndex = sel;
    for (let m; (m = re.exec(u));) {
      if (m[3]) continue; // FROM @itab
      if (m[4] && m[6]) {
        const v = lit(m[5]);
        if (v) g.edge(from, g.ddic(v, 'TABL', 3), 'reads', ev, { confidence: 'low' });
        else g.dynamic(from, 'reads', m[5], ev);
        continue;
      }
      const n = m[5];
      if (/^'/.test(n) || BUILTIN.has(n)) continue;
      g.edge(from, g.ddic(n, 'TABL', 3), 'reads', ev);
    }
  }
  // writes
  const w = (op, name, confidence) => {
    if (/^\(/.test(name)) return g.dynamic(from, 'writes', name, ev, { op });
    if (decl.data.has(name) && !decl.tables.has(name)) return null;
    return g.edge(from, g.ddic(name, 'TABL', 3), 'writes', ev, { op, confidence });
  };
  const T = `(\\(?${NAME}\\)?)`;
  let m;
  if ((m = new RegExp(`^INSERT INTO ${T}\\s+VALUES\\b`).exec(u))) return void w('INSERT', m[1]);
  if (/^INSERT INTO TABLE\b/.test(u)) return;
  if ((m = new RegExp(`^INSERT ${T}(?:\\s+(?:CLIENT SPECIFIED|USING CLIENT \\S+|USING ALL CLIENTS))?\\s+FROM\\b`).exec(u))) {
    if (!['LINES', 'REPORT', 'TEXTPOOL', 'INITIAL', 'VALUE'].includes(m[1])) w('INSERT', m[1], isItab(m[1]) ? 'low' : undefined);
    return;
  }
  if ((m = new RegExp(`^INSERT ${T}$`).exec(u))) {
    if (!isItab(m[1])) w('INSERT', m[1], knownDb(m[1]) ? undefined : 'low');
    return;
  }
  if ((m = new RegExp(`^UPDATE ${T}(?:\\s|$)`).exec(u))) {
    if (!isItab(m[1]) || /^\(/.test(m[1])) w('UPDATE', m[1]);
    return;
  }
  if ((m = new RegExp(`^MODIFY ${T}(?:\\s|$)`).exec(u))) {
    const n = m[1];
    if (['SCREEN', 'LINE', 'CURRENT', 'TABLE'].includes(n)) return;
    if (/\b(INDEX|TRANSPORTING|USING KEY)\b/.test(u)) return;
    if (/^\(/.test(n)) return void w('MODIFY', n);
    if (/\bFROM TABLE\b/.test(u)) return void w('MODIFY', n, isItab(n) ? 'low' : undefined);
    if (isItab(n)) return;
    w('MODIFY', n, knownDb(n) ? undefined : 'low');
    return;
  }
  if (/^DELETE\b/.test(u)) {
    if ((m = new RegExp(`^DELETE FROM ${T}`).exec(u))) {
      if (!['MEMORY', 'SHARED', 'DATABASE', 'DATASET'].includes(m[1])) w('DELETE', m[1]);
      return;
    }
    if ((m = new RegExp(`^DELETE ${T}(?:\\s+(.*))?$`).exec(u))) {
      const n = m[1];
      const rest = m[2] || '';
      if (['ADJACENT', 'TABLE', 'DATASET', 'REPORT', 'TEXTPOOL', 'DYNPRO'].includes(n)) return;
      if (/^(WHERE|INDEX|USING KEY)\b/.test(rest) || /\bWHERE\b/.test(rest) && !/^FROM\b/.test(rest)) return;
      if (/^\(/.test(n)) return void w('DELETE', n);
      if (/^FROM TABLE\b/.test(rest)) return void w('DELETE', n, isItab(n) ? 'low' : undefined);
      if (isItab(n)) return;
      if (/^FROM\b/.test(rest) || !rest) w('DELETE', n, knownDb(n) ? undefined : 'low');
    }
  }
}

function extractUses(g, u, ev, from, decl, ownerId) {
  const own = nameOf(ownerId);
  const add = (n, attrs = {}) => {
    if (!n || n === own || decl.classes.has(n) || BUILTIN.has(n) || n === '#') return;
    if (decl.types.has(n) || decl.data.has(n)) return;
    g.edge(from, idOf(clsType(n), n), 'uses', ev, attrs);
  };
  for (const m of u.matchAll(new RegExp(`(?<![-\\w>=/])(${NAME})=>`, 'g'))) add(m[1]);
  for (const m of u.matchAll(new RegExp(`\\b(?:NEW|CAST)\\s+(${NAME})\\(`, 'g'))) if (CLASS_LIKE.test(m[1])) add(m[1]);
  for (const m of u.matchAll(/\bTYPE\s+(?:(?:STANDARD |SORTED |HASHED |ANY |INDEX )?TABLE OF\s+)?REF TO\s+([A-Z0-9_/]+)/g)) {
    if (m[1] === 'DATA' || m[1] === 'OBJECT') continue;
    if (decl.types.has(m[1])) continue;
    add(m[1], CLASS_LIKE.test(m[1]) ? {} : { confidence: 'low' });
  }
  let m = new RegExp(`^CREATE OBJECT\\s+\\S+\\s+TYPE\\s+(\\(?${NAME}\\)?)`).exec(u);
  if (m) {
    if (/^\(/.test(m[1])) g.dynamic(from, 'uses', m[1], ev);
    else add(m[1]);
  }
  m = new RegExp(`\\bINHERITING FROM\\s+(${NAME})`).exec(u);
  if (m) add(m[1], { inherits: true });
  m = new RegExp(`^INTERFACES\\s+(${NAME})`).exec(u);
  if (m) {
    if (!decl.classes.has(m[1]) && m[1] !== own) g.edge(from, idOf('INTF', m[1]), 'uses', ev, { implements: true });
  }
  m = /^CATCH\s+(?:BEFORE UNWIND\s+)?(.*?)(?:\s+INTO\s+.*)?$/.exec(u);
  if (m) for (const t of m[1].split(/\s+/)) if (/^(?:\/[A-Z0-9_]+\/)?[ZYL]?CX_|^[ZY]CX/.test(t)) add(t);
  m = /\bRAISING\s+(.*?)(?:\s+(?:EXCEPTIONS|DEFAULT|FOR|IMPORTING|EXPORTING|CHANGING|RETURNING)\b.*)?$/.exec(u);
  if (m && /^(METHODS|CLASS-METHODS|FORM)\b/.test(u)) {
    for (const t of m[1].split(/\s+/)) {
      const n = t.replace(/^RESUMABLE\(|\)$/g, '');
      if (/^(?:\/[A-Z0-9_]+\/)?[ZYL]?CX_|^[ZY]CX/.test(n)) add(n);
    }
  }
}

function extractTypes(g, u, ev, from, decl, knownLocal) {
  const ref = (n, rank, viaLike = false) => {
    if (!n || BUILTIN.has(n) || /^ABAP_/.test(n) || /^'/.test(n)) return;
    if (knownLocal(n) && !decl.tables.has(n)) return;
    if (viaLike && isLocalPrefixed(n)) return;
    if (!new RegExp(`^${NAME}$`).test(n)) return;
    g.edge(from, g.ddic(n, rank >= 2 ? 'STRU' : 'DTEL', rank), 'types', ev);
  };
  // TABLES x → work area of a DDIC table / structure
  const tm = /^TABLES\s+(.*)$/.exec(u);
  if (tm) {
    for (const t of tm[1].split(/[\s,]+/)) if (/^\*?[A-Z0-9_/]+$/.test(t)) ref(t.replace(/^\*/, ''), 2);
    return;
  }
  for (const m of u.matchAll(new RegExp(`\\bINCLUDE (?:STRUCTURE|TYPE)\\s+(${NAME})`, 'g'))) ref(m[1], 2);
  // TYPE …
  const typeRe = new RegExp(
    `(?<![-\\w])(TYPE|LIKE)\\s+((?:(?:STANDARD |SORTED |HASHED |ANY |INDEX )?TABLE OF\\s+|RANGE OF\\s+|LINE OF\\s+)?)(REF TO\\s+)?(${NAME})(=>|-[A-Z0-9_]+)?`,
    'g',
  );
  for (const m of u.matchAll(typeRe)) {
    if (m[3]) continue; // REF TO → uses
    const n = m[4];
    if (m[5] === '=>') continue; // class type → uses
    if (/^(INCLUDE)$/.test(n)) continue;
    const comp = !!m[5];
    const tableOf = /TABLE OF|LINE OF/.test(m[2]);
    if (m[1] === 'LIKE') {
      if (decl.tables.has(n)) ref(n, 2);
      else if (comp && !decl.data.has(n) && !isLocalPrefixed(n) && !n.startsWith('<')) ref(n, 2, true);
      continue;
    }
    ref(n, comp || tableOf ? 2 : 1);
  }
  // SELECT-OPTIONS / RANGES … FOR x-f
  if (/^(SELECT-OPTIONS|RANGES)\b/.test(u)) {
    const fm = new RegExp(`\\bFOR\\s+(${NAME})(-[A-Z0-9_]+)?`).exec(u);
    if (fm && (decl.tables.has(fm[1]) || (fm[2] && !decl.data.has(fm[1]) && !isLocalPrefixed(fm[1])))) ref(fm[1], 2);
  }
}

// ---------------------------------------------------------------- public API

/**
 * @param units  [{ file?, source?, unit, object, isMain? }]
 * @param opts   { members?: Map|array, package, module, system, sapVersion, tcodes?, builtAt? }
 */
export function extractGraph(units, opts = {}) {
  const t0 = Date.now();
  const members = normalizeMembers(opts.members);
  const g = new GraphBuilder({ members });
  // group by owner; lex everything first, collect declarations per owner
  const owners = new Map();
  for (const u of units) {
    const source = u.source ?? readFileSync(u.file, 'utf8');
    const unit = up(u.unit || unitNameFromFile(u.file));
    const object = up(u.object || `PROG:${unit}`);
    const lexed = lexAbap(source);
    if (!owners.has(object)) {
      owners.set(object, {
        units: [],
        decl: { types: new Set(), data: new Set(), classes: new Set(), tables: new Set(), constants: new Map(), typesDepth: 0, dataDepth: 0 },
      });
    }
    const isMain = u.isMain ?? unit === nameOf(object);
    owners.get(object).units.push({ unit, file: u.file, isMain, lexed, srcHash: hash(source), lines: lexed.lines });
  }
  for (const [, o] of owners) for (const un of o.units) collectDecls(un.lexed.statements, un.lexed.lits, o.decl);

  // owners first: scope of parsed units inherits the owner's membership unless members list includes
  const memberHasIncl = [...members.values()].some((t) => t === 'INCL');
  const noMembers = members.size === 0;
  for (const [ownerId, o] of owners) {
    const ownerName = nameOf(ownerId);
    const ownerScope = noMembers || members.has(ownerName) ? 'member' : isCustomName(ownerName) ? 'custom' : 'standard';
    const totalLines = o.units.reduce((s, x) => s + x.lines, 0);
    g.node(ownerId, {
      scope: ownerScope,
      lines: totalLines,
      srcHash: hash(o.units.map((x) => x.srcHash).sort().join('')),
      units: o.units.map((x) => x.unit).sort(),
    });
    if (noMembers) members.set(ownerName, typeOf(ownerId));
    for (const un of o.units) {
      if (un.isMain) continue;
      const scope = memberHasIncl ? (members.has(un.unit) ? 'member' : isCustomName(un.unit) ? 'custom' : 'standard') : ownerScope;
      g.node(idOf('INCL', un.unit), { scope, lines: un.lines, srcHash: un.srcHash, parent: ownerId });
    }
  }
  // known DB names from every SQL read first (so MODIFY / DELETE classification can use them)
  for (const [ownerId, o] of owners) {
    for (const un of o.units) {
      for (const st of un.lexed.statements) {
        if (!/^(SELECT(?![-\w])|OPEN CURSOR|WITH \+)/.test(st.upper)) continue;
        for (const m of st.upper.matchAll(/\b(?:FROM|JOIN)\s+(?:\(\s+)*([A-Z][A-Z0-9_/]*)/g)) g.ddic(m[1], 'TABL', 3);
      }
    }
    void ownerId;
  }
  for (const [ownerId, o] of owners) for (const un of o.units) extractUnit(g, un, un.lexed, o.decl, ownerId);

  // FUNC nodes inside a parsed FUGR inherit its scope
  for (const n of g.nodes.values()) if (n.parent && !n.scope) n.scope = g.nodes.get(n.parent)?.scope;

  // TCode entry points
  for (const { tcode, program } of normalizeTcodes(opts.tcodes)) {
    g.node(idOf('TRAN', tcode), { scope: members.has(up(tcode)) || members.has(up(program)) ? 'member' : undefined });
    g.edge(idOf('TRAN', tcode), idOf('PROG', program), 'launches', { unit: 'TSTC', line: 0, text: `TCODE ${up(tcode)} → ${up(program)}` });
  }

  const sapVersion = opts.sapVersion ? up(opts.sapVersion) : null;
  const srcMembers = [...members.entries()].filter(([, t]) => ['PROG', 'FUGR', 'CLAS', 'INTF', 'FUNC'].includes(t));
  const parsedNames = new Set([...owners.keys()].map(nameOf));
  const graph = g.finish({
    package: opts.package || null,
    module: opts.module || null,
    system: opts.system || null,
    sapVersion,
    builtAt: opts.builtAt || new Date().toISOString(),
    extractor: EXTRACTOR,
  });
  const unitCount = [...owners.values()].reduce((s, o) => s + o.units.length, 0);
  const stmtCount = [...owners.values()].reduce((s, o) => s + o.units.reduce((a, x) => a + x.lexed.statements.length, 0), 0);
  graph.coverage = {
    members: members.size,
    parsed: parsedNames.size,
    units: unitCount,
    statements: stmtCount,
    skipped: srcMembers.filter(([n]) => !parsedNames.has(n)).map(([n, t]) => `${t}:${n}`).sort(),
    whereUsed: sapVersion === 'ECC' ? 'unavailable (ECC 404)' : 'not collected (extractor reads source only)',
    ms: Date.now() - t0,
  };
  return graph;
}

export function normalizeMembers(input) {
  const out = new Map();
  if (!input) return out;
  if (input instanceof Map) return new Map([...input].map(([k, v]) => [up(k), up(v)]));
  let list = input;
  if (!Array.isArray(list) && typeof list === 'object') list = list.objects || list.members || [];
  if (typeof list === 'string') list = list.split(',');
  for (const it of list) {
    if (!it) continue;
    if (typeof it === 'string') {
      const [n, t] = it.split(':');
      out.set(up(n), up((t || '').split('/')[0]));
    } else if (it.name) out.set(up(it.name), up(String(it.type || '').split('/')[0]));
  }
  return out;
}

function normalizeTcodes(t) {
  if (!t) return [];
  if (Array.isArray(t)) return t.filter((x) => x && x.tcode && x.program).map((x) => ({ tcode: up(x.tcode), program: up(x.program) }));
  return Object.entries(t).map(([tcode, program]) => ({ tcode: up(tcode), program: up(program) }));
}

function unitNameFromFile(file) {
  return basename(String(file)).replace(/\.(prog|incl|fugr|clas|intf|func)\.abap$/i, '').replace(/\.abap$/i, '');
}

/** discover units from GetProgFullCode output:"file" folders */
export function discoverUnits(dir) {
  const units = [];
  const abs = resolve(dir);
  const walkOwnerDir = (d, ownerType) => {
    const ownerName = up(basename(d).replace(/\.(prog|fugr)$/i, ''));
    const ownerId = idOf(ownerType, ownerName);
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (!statSync(p).isFile()) continue;
      const m = /^(.+)\.(prog|incl|fugr|func|clas|intf)\.abap$/i.exec(f);
      if (!m) continue;
      const kind = m[2].toLowerCase();
      const unit = up(m[1]);
      units.push({ file: p, unit, object: ownerId, isMain: kind === 'prog' || kind === 'fugr' || unit === ownerName });
    }
  };
  const ownerOfDir = (d) => (/\.fugr$/i.test(d) ? 'FUGR' : /\.prog$/i.test(d) ? 'PROG' : null);
  if (ownerOfDir(abs)) {
    walkOwnerDir(abs, ownerOfDir(abs));
    return units;
  }
  for (const f of readdirSync(abs).sort()) {
    const p = join(abs, f);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (ownerOfDir(f)) walkOwnerDir(p, ownerOfDir(f));
      continue;
    }
    const m = /^(.+)\.(prog|incl|fugr|func|clas|intf)\.abap$/i.exec(f);
    if (!m) continue;
    const kind = m[2].toUpperCase();
    const unit = up(m[1]);
    units.push({ file: p, unit, object: idOf(kind, unit), isMain: true });
  }
  return units;
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const a = { progDirs: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--units') a.units = v();
    else if (k === '--prog-dir') a.progDirs.push(v());
    else if (k === '--members') a.members = v();
    else if (k === '--out') a.out = v();
    else if (k === '--package') a.package = v();
    else if (k === '--module') a.module = v();
    else if (k === '--system') a.system = v();
    else if (k === '--sap-version') a.sapVersion = v();
    else if (k === '--tcodes') a.tcodes = v();
    else if (k === '--built-at') a.builtAt = v();
    else throw new Error(`unknown argument: ${k}`);
  }
  return a;
}

function readMembers(arg) {
  if (!arg) return { members: null };
  if (existsSync(arg)) {
    const j = JSON.parse(readFileSync(arg, 'utf8'));
    return { members: j, package: Array.isArray(j) ? null : j.package, module: Array.isArray(j) ? null : j.module };
  }
  return { members: arg };
}

export function runCli(argv) {
  const a = parseArgs(argv);
  if (!a.out || (!a.units && !a.progDirs.length)) {
    throw new Error('usage: extract-edges.mjs (--units <units.json> | --prog-dir <dir>…) --out <graph.json> [--members …] [--package P] [--system S] [--sap-version ECC|S4] [--tcodes J]');
  }
  let units = [];
  if (a.units) {
    const base = dirname(resolve(a.units));
    const j = JSON.parse(readFileSync(a.units, 'utf8'));
    units = (Array.isArray(j) ? j : j.units || []).map((x) => ({ ...x, file: x.file ? resolve(base, x.file) : undefined }));
  }
  for (const d of a.progDirs) units.push(...discoverUnits(d));
  const mem = readMembers(a.members);
  const graph = extractGraph(units, {
    members: mem.members,
    package: a.package || mem.package,
    module: a.module || mem.module,
    system: a.system,
    sapVersion: a.sapVersion,
    tcodes: a.tcodes ? JSON.parse(readFileSync(a.tcodes, 'utf8')) : null,
    builtAt: a.builtAt,
  });
  mkdirSync(dirname(resolve(a.out)), { recursive: true });
  writeFileSync(a.out, `${JSON.stringify(graph, null, 1)}\n`);
  return { out: resolve(a.out), nodes: graph.nodes.length, edges: graph.edges.length, unresolved: graph.unresolved.length, ms: graph.coverage.ms };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  try {
    process.stdout.write(`${JSON.stringify(runCli(process.argv.slice(2)))}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}

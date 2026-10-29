// sc4sap:s4-conversion-readiness — what the conversion to S/4HANA touches, worked out from what sc4sap already
// holds about the system. Deterministic: no LLM, no SAP call.
//
//   graphs        CBO reference graphs (scripts/graph) — reads / writes / calls / starts edges with source lines
//   source        saved ABAP units (GetProgFullCode output) — code patterns the graph does not carry
//   customizations  enhancements.json / extensions.json per module (extract-customizations.mjs)
//   usage         measured T-code usage (ST03N) — standard T-codes users run, Z T-codes in use
//   facts         system facts read by build-readiness-doc.mjs facts (components, warehouses, ML …)
// against the knowledge base configs/conversion/simplification.json.
//
// Severity: blocker > functional > performance > check > info (see the knowledge base header).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lexAbap, statementText } from '../graph/abap-lexer.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const KB_FILE = join(here, '..', '..', 'configs', 'conversion', 'simplification.json');
export const SEVS = ['blocker', 'functional', 'performance', 'check', 'info'];
export const sevRank = (s) => SEVS.indexOf(s) < 0 ? 9 : SEVS.indexOf(s);
const arr = (v) => (Array.isArray(v) ? v : []);
const nameOf = (id) => String(id).split(':').slice(1).join(':');
const isCustom = (n) => /^[ZY]/i.test(n) || /^\/[A-Z0-9_]+\//i.test(n);

export const loadKb = (file = KB_FILE) => JSON.parse(readFileSync(file, 'utf8'));

/** Lookup maps of the knowledge base: table, table prefix, T-code, T-code prefix, function module, exit prefix. */
export function kbIndex(kb) {
  const ix = { table: new Map(), tprefix: [], tcode: new Map(), cprefix: [], fm: new Map(), exit: [], append: new Map(), item: new Map(), cls: [], objpat: [] };
  for (const it of arr(kb.items)) {
    ix.item.set(it.id, it);
    for (const c of arr(it.classPrefixes)) ix.cls.push({ it, rule: c });
    for (const p of arr(it.objectPatterns)) ix.objpat.push({ it, rule: { re: new RegExp(p, 'i'), note: p } });
    for (const t of arr(it.tables)) ix.table.set(t.name, { it, rule: t });
    for (const t of arr(it.tablePrefixes)) ix.tprefix.push({ it, rule: t });
    for (const t of arr(it.tcodes)) ix.tcode.set(t.name, { it, rule: t });
    for (const t of arr(it.tcodePrefixes)) ix.cprefix.push({ it, rule: t });
    for (const f of arr(it.fms)) ix.fm.set(f.name, { it, rule: f });
    for (const x of arr(it.exits)) ix.exit.push({ it, rule: x });
    for (const a of arr(it.appends)) ix.append.set(a.table, { it, rule: a });
  }
  return ix;
}
const tableHit = (ix, name) => ix.table.get(name) || ix.tprefix.find((p) => name.startsWith(p.rule.prefix));
const tcodeHit = (ix, name) => ix.tcode.get(name) || ix.cprefix.find((p) => name.startsWith(p.rule.prefix));

/** Graph files under <base>/cbo: the used-only graphs of a module first, every other graph of it after. */
export function findGraphs(base) {
  const root = join(base, 'cbo');
  if (!existsSync(root)) return [];
  const out = [];
  for (const mod of readdirSync(root)) {
    const dir = join(root, mod);
    if (!statSync(dir).isDirectory()) continue;
    const subs = readdirSync(dir).filter((s) => !s.startsWith('_prev') && existsSync(join(dir, s, 'graph.json')));
    const used = subs.filter((s) => s.startsWith('_USED'));
    for (const s of used.length ? used : subs) out.push(join(dir, s, 'graph.json'));
  }
  return out;
}

/**
 * Findings from the graph edges: reads / writes of changed tables, transactions started (batch input or
 * CALL TRANSACTION) and function modules called that the knowledge base names. One finding per object, item and
 * target; evidence ≤ 3 source lines. Also returns the member objects with their facts (lines, ALV, BDC, RFC …).
 */
export function scanGraphs(graphFiles, kb) {
  const ix = kbIndex(kb), seen = new Set(), findings = [], objects = new Map();
  for (const f of graphFiles) {
    const g = JSON.parse(readFileSync(f, 'utf8'));
    const module = g.module || '';
    for (const n of arr(g.nodes)) {
      if (n.scope !== 'member' || objects.has(n.id)) continue;
      objects.set(n.id, { id: n.id, type: n.type, name: n.name, module, lines: n.lines || 0, units: arr(n.units), graph: f,
        alv: false, bdc: false, rfc: false, writesStd: false, readsStd: false, writesZ: false, dynpro: false });
    }
    for (const e of arr(g.edges)) {
      const o = objects.get(e.from); if (!o || o.graph !== f) continue;
      const to = nameOf(e.to), ev = arr(e.evidence).slice(0, 3);
      if (e.kind === 'calls' && /^REUSE_ALV/.test(to)) o.alv = true;
      if (e.kind === 'uses' && /^(CL_SALV_TABLE|CL_GUI_ALV_GRID|CL_SALV_HIERSEQ_TABLE)$/.test(to)) o.alv = true;
      if (e.kind === 'calls' && arr(e.destination).length) o.rfc = true;
      if (e.kind === 'starts' && e.bdc) o.bdc = true;
      if (e.kind === 'writes') { if (isCustom(to)) o.writesZ = true; else o.writesStd = true; }
      if (e.kind === 'reads' && !isCustom(to)) o.readsStd = true;
      let hit = null, sev = '', kind = '';
      if (e.kind === 'reads' || e.kind === 'writes') {
        hit = tableHit(ix, to); sev = hit?.rule[e.kind === 'reads' ? 'read' : 'write'] || ''; kind = e.kind === 'reads' ? 'table-read' : 'table-write';
      } else if (e.kind === 'starts') {
        hit = tcodeHit(ix, to); kind = 'tcode';
        sev = hit ? (e.bdc ? 'blocker' : hit.it.id === 'BP-CVI' ? 'check' : hit.it.sev) : '';
      } else if (e.kind === 'calls') {
        hit = ix.fm.get(to); sev = hit ? hit.it.sev : ''; kind = 'fm';
      } else if (e.kind === 'uses' && /^(CLAS|INTF):/.test(e.to)) {
        hit = ix.cls.find((c) => to.startsWith(c.rule.prefix)); sev = hit ? hit.it.sev : ''; kind = 'class';
      }
      if (!hit || !sev) continue;
      const key = `${o.id}|${hit.it.id}|${kind}|${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ item: hit.it.id, area: hit.it.area, kind, object: o.id, module, target: to, to: hit.rule.to || '', sev, count: e.count || ev.length || 1,
        bdc: !!e.bdc, evidence: ev.map((x) => ({ unit: x.unit, line: x.line, text: String(x.text || '').slice(0, 160) })) });
    }
    // member objects that are themselves an interface piece (customer IDoc function modules); proxies are found by
    // their use of the proxy runtime, not by name — a Z name prefix collides with module naming conventions
    for (const o of objects.values()) {
      if (o.graph !== f) continue;
      const hit = ix.objpat.find((p) => p.rule.re.test(o.name));
      const key = hit && `${o.id}|${hit.it.id}|object|${o.name}`;
      if (!hit || seen.has(key)) continue;
      seen.add(key);
      findings.push({ item: hit.it.id, area: hit.it.area, kind: 'object', object: o.id, module, target: o.name, to: hit.rule.note || '', sev: hit.it.sev, count: 1, bdc: false, evidence: [] });
    }
    // owners: a function module belongs to its function group, an include to the program that includes it
    for (const n of arr(g.nodes)) if (n.parent && objects.has(n.id) && objects.has(n.parent)) objects.get(n.id).owner ||= n.parent;
    for (const e of arr(g.edges)) if (e.kind === 'include' && objects.has(e.from) && objects.has(e.to) && e.from !== e.to && /^(PROG|FUGR|CLAS):/.test(e.from)) objects.get(e.to).owner ||= e.from;
  }
  return foldOwners(findings, objects);
}

const MAIN = /^(PROG|FUGR|CLAS|INTF)$/;
/** Function modules and includes fold into their owner: one row per program / function group / class. */
function foldOwners(findings, objects) {
  const top = (id) => { let o = objects.get(id), n = 0; while (o?.owner && objects.has(o.owner) && n++ < 10) o = objects.get(o.owner); return o; };
  for (const o of objects.values()) {
    const t = top(o.id); if (!t || t === o) continue;
    for (const k of ['alv', 'bdc', 'rfc', 'writesStd', 'readsStd', 'writesZ']) t[k] ||= o[k];
    t.units = [...new Set([...t.units, ...o.units])];
  }
  const seen = new Set(), out = [];
  for (const f of findings) {
    const t = top(f.object), id = t ? t.id : f.object, key = `${id}|${f.item}|${f.kind}|${f.target}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push({ ...f, object: id });
  }
  // code objects only: TCodes, maintenance views and tables are members of a walk, not code to adapt
  const kept = [...objects.values()].filter((o) => top(o.id) === o && (MAIN.test(o.type) || /^(INCL|FUNC)$/.test(o.type)));
  return { findings: out, objects: kept };
}

// ---------- code patterns (source) ----------

/** Index of saved source files: unit name (lower case, `#` as `/`) → path. */
export function sourceIndex(srcDir) {
  const ix = new Map();
  if (!srcDir || !existsSync(srcDir)) return ix;
  const walk = (d, depth) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      const st = statSync(p);
      if (st.isDirectory()) { if (depth < 2) walk(p, depth + 1); continue; }
      const m = /^(.+?)\.(prog|incl|fugr|func|clas|intf)\.abap$/i.exec(f);
      if (m) ix.set(m[1].toLowerCase().replace(/#/g, '/'), p);
    }
  };
  walk(srcDir, 0);
  return ix;
}

// an offset past the first character depends on the 18-character internal format (a prefix check +0(n) does not)
const MATNR_OFF = /\b[\w-]*MATNR\w*\+0*[1-9]\d*(\(\d+\))?/;
const MATNR_DECL = /^(DATA|TYPES|CONSTANTS|FIELD-SYMBOLS|PARAMETERS)\b.*\b\w*MATNR\w*(\(18\)|\s+TYPE\s+C\s+LENGTH\s+18\b)/;

/** Code patterns of one unit: native SQL / DB hints, sorted order assumed after a SELECT without ORDER BY, MATNR 18. */
export function scanUnit(src) {
  const { statements, lits } = lexAbap(src);
  const hits = [];
  const filled = new Map(); // itab → line of a SELECT … INTO TABLE without ORDER BY (until SORT)
  for (const st of statements) {
    const u = st.upper.trim();
    const line = st.line, text = () => statementText(st, lits, 160);
    if (/^EXEC\s+SQL\b/.test(u) || /\bCL_SQL_STATEMENT\b/.test(u)) hits.push({ id: 'NATIVE_SQL', line, text: text() });
    // hints for another database are ignored on HANA — not an error, but the tuning they carried is gone
    else if (/%_HINTS\s+(ORACLE|DB6|DB2|MSSQLNT|ADABAS|INFORMIX|ASE)\b/.test(u)) hits.push({ id: 'DB_HINTS', line, text: text() });
    const sel = /^SELECT\b(?![\s\S]*\bORDER\s+BY\b)[\s\S]*\bINTO\s+(?:CORRESPONDING\s+FIELDS\s+OF\s+)?TABLE\s+(@?[\w\->]+)/.exec(u);
    if (sel && !/\bSELECT\s+SINGLE\b/.test(u)) filled.set(sel[1].replace(/^@/, ''), line);
    const srt = /^SORT\s+([\w\->]+)/.exec(u); if (srt) filled.delete(srt[1]);
    const rd = /^READ\s+TABLE\s+([\w\->]+)\b[\s\S]*\bBINARY\s+SEARCH\b/.exec(u) || /^DELETE\s+ADJACENT\s+DUPLICATES\s+FROM\s+([\w\->]+)/.exec(u);
    if (rd && filled.has(rd[1])) { hits.push({ id: 'SELECT_ORDER', line, text: text(), from: filled.get(rd[1]) }); filled.delete(rd[1]); }
    if (MATNR_OFF.test(u) || MATNR_DECL.test(u)) hits.push({ id: 'MATNR18', line, text: text() });
  }
  return hits;
}

/** Pattern findings for the member objects whose units are saved on disk. */
export function scanPatterns(objects, srcDir, kb) {
  const ix = sourceIndex(srcDir), pat = new Map(arr(kb.patterns).map((p) => [p.id, p]));
  const findings = [], done = new Set();
  let scanned = 0;
  // a unit belongs to its program / function group / class first; an include member only adds units no one owns
  const order = { PROG: 0, FUGR: 0, CLAS: 0, INTF: 0, FUNC: 1, INCL: 2 };
  for (const o of [...objects].filter((x) => x.type in order).sort((a, b) => order[a.type] - order[b.type])) {
    const per = new Map();
    for (const unit of o.units.length ? o.units : [o.name]) {
      const p = ix.get(String(unit).toLowerCase()); if (!p || done.has(p)) continue;
      done.add(p);
      scanned++;
      for (const h of scanUnit(readFileSync(p, 'utf8'))) {
        const k = h.id, x = per.get(k) || { item: k, area: pat.get(k)?.area || 'CROSS', kind: 'pattern', object: o.id, module: o.module, target: k, to: '', sev: pat.get(k)?.sev || 'check', count: 0, evidence: [] };
        x.count++; if (x.evidence.length < 3) x.evidence.push({ unit, line: h.line, text: h.text });
        per.set(k, x);
      }
    }
    findings.push(...per.values());
  }
  return { findings, scanned };
}

// ---------- enhancements and appends ----------

/** Customer exits, BAdI implementations, VOFM routines and appends per module, with what S/4 does to them. */
export function scanCustomizations(custDir, kb) {
  const ix = kbIndex(kb), exits = [], appends = [];
  if (!custDir || !existsSync(custDir)) return { exits, appends };
  for (const mod of readdirSync(custDir)) {
    const enh = join(custDir, mod, 'enhancements.json'), ext = join(custDir, mod, 'extensions.json');
    if (existsSync(enh)) {
      const e = JSON.parse(readFileSync(enh, 'utf8'));
      const add = (kind, std, desc, customs) => {
        const k = ix.exit.find((x) => String(std).startsWith(x.rule.prefix));
        exits.push({ module: mod, kind, standard: std, desc: desc || '', customs: arr(customs).map((c) => c.name || c.include || c.routine || String(c)).filter(Boolean),
          item: k?.it.id || '', note: k?.rule.note || null, sev: k ? 'functional' : 'info' });
      };
      for (const x of arr(e.smodExits)) add('SMOD', x.standardName, x.description, x.customs);
      for (const x of arr(e.badiImplementations)) add('BAdI', x.standardName, x.description, x.customs);
      for (const x of arr(e.formBasedExits)) add('FORM', x.standardName || x.include || x.name, x.description, x.customs || [x]);
      for (const x of arr(e.bteImplementations)) add('BTE', x.standardName || x.event || x.name, x.description, x.customs);
      for (const x of arr(e.vofmRoutines)) add('VOFM', `${x.group || x.grpze || ''} ${x.number || x.routine || ''}`.trim(), x.description || x.text, [x.include || x.name].filter(Boolean));
    }
    if (existsSync(ext)) {
      const e = JSON.parse(readFileSync(ext, 'utf8'));
      for (const a of arr(e.appendStructures)) {
        const fields = arr(a.customFields);
        if (!fields.length && !arr(a.appendStructures).length) continue;
        const k = ix.append.get(a.baseTable);
        appends.push({ module: mod, table: a.baseTable, structures: arr(a.appendStructures).map((s) => s.name || s), fields, item: k?.it.id || '', to: k?.rule.to || '',
          action: k?.it.appendAction || null, cds: arr(kb.cds?.[a.baseTable]), sev: k ? (k.it.id === 'BP-CVI' ? 'check' : 'functional') : 'info' });
      }
    }
  }
  return { exits, appends };
}

// ---------- usage ----------

/** Standard T-codes users run that the knowledge base names (the business itself uses a changed function). */
export function scanUsage(usedTcodes, kb) {
  const ix = kbIndex(kb), out = [];
  for (const t of new Set(arr(usedTcodes).map((x) => String(x).toUpperCase()))) {
    const h = tcodeHit(ix, t); if (!h) continue;
    out.push({ tcode: t, item: h.it.id, area: h.it.area, to: h.rule.to || '', sev: h.it.sev === 'blocker' ? 'functional' : h.it.sev });
  }
  return out.sort((a, b) => a.item.localeCompare(b.item) || a.tcode.localeCompare(b.tcode));
}

/** Reads a usage file (tcode-usage JSON or a plain list) → upper-case T-codes. */
export function readUsage(file) {
  if (!file || !existsSync(file)) return [];
  const t = readFileSync(file, 'utf8');
  try { const j = JSON.parse(t); return arr(j.used || j.measured || j).map((x) => String(x.tcode || x).toUpperCase()); }
  catch { return t.split(/[\s,;]+/).filter(Boolean).map((x) => x.toUpperCase()); }
}

export const _private = { basename };

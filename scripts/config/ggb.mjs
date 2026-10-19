// config-to-document — validations (GGB0) and substitutions (GGB1) behind the IMG activities
// that assign them (FI: OB28 / OBBH → T001D / T001Q, CO: OKC7 / OKC9 → TKAZE).
//
// The assignment views name the rules; the rules themselves live in tables no IMG activity
// lists, so they are read here:
//   GB93 / GB931  — validation header (message class) and steps (prerequisite, check, message)
//   GB92 / GB921 / GB922 — substitution header, step prerequisite, substituted fields / exits
//   GB901         — Boolean expressions of prerequisites and checks (one row per line)
//   GB31          — callup points (application area → Boolean class) for the module's own rules
//   T100          — the validation messages
//   T80D          — the form pools with the customer exits (GBLR rules, GBLS substitutions);
//                   their FORM routines are read from the program and its includes.
// Rules in scope: every rule the module's assignment tables name, plus customer rules (created
// or last changed by someone other than SAP) of the module's application areas.

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { readTable, readIn } from './sap-reader.mjs';

export const GGB_AREAS = { FI: ['GL', 'FI'], CO: ['CO'] };
// Assignment table → kind and the column naming the rule.
const ASSIGN = {
  T001D: [{ kind: 'VAL', col: 'VALID' }],
  T001Q: [{ kind: 'SUB', col: 'SUBST' }],
  TKAZE: [{ kind: 'VAL', col: 'VALID' }, { kind: 'SUB', col: 'SUBSTID' }],
};
// Activity objects (assignment views) → kinds shown on the activity.
const VIEW_KINDS = { V_T001D: ['VAL'], V_T001Q: ['SUB'], V_TKAZE: ['VAL'], V_TKAZES: ['SUB'] };
const SRC_CAP = 400;

const s = (v) => String(v ?? '').trim();
const notSap = (u) => s(u) !== '' && s(u).toUpperCase() !== 'SAP';

/** Exit names used in Boolean expression text: the registered names (U100, C101, E200 …), else U + 3 digits. */
export function exitRefs(text, names = null) {
  const toks = [...String(text || '').matchAll(/(?<![A-Z0-9_$<'-])([A-Z][A-Z0-9_]{1,4})(?![A-Z0-9_>'-])/g)].map((m) => m[1]);
  return [...new Set(toks.filter((t) => (names ? names.has(t) : /^U\d{3}$/.test(t))))];
}

/** Exits a form pool registers in GET_EXIT_TITLES (EXITS-NAME = 'U100'. … EXITS-TITLE = '…' / TEXT-100 "comment). */
export function exitTitles(src) {
  const out = {};
  let cur = null;
  for (const line of String(src || '').split(/\r?\n/)) {
    if (/^\s*\*/.test(line)) continue;
    const n = /exits-name\s*=\s*'([^']+)'/i.exec(line);
    if (n) { cur = n[1].toUpperCase(); out[cur] = ''; continue; }
    const t = /exits-title\s*=\s*(?:'([^']*)'|\S+?)\s*\.?\s*(?:"\s*(.*))?$/i.exec(line);
    if (t && cur) out[cur] = (t[1] ?? t[2] ?? '').trim();
  }
  return out;
}

/** FORM routines of ABAP source → { NAME: source }. */
export function splitForms(src) {
  const out = {};
  for (const m of String(src || '').matchAll(/^[ \t]*form[ \t]+([\w/]+)\b[\s\S]*?^[ \t]*endform[ \t]*\./gim)) {
    out[m[1].toUpperCase()] = m[0];
  }
  return out;
}

/** Joins the GB901 lines of each Boolean ID into one expression. */
export function booleanTexts(rows) {
  const by = {};
  for (const r of [...rows].sort((a, b) => s(a.BOOLID).localeCompare(s(b.BOOLID)) || Number(a.SEQNR) - Number(b.SEQNR))) {
    by[s(r.BOOLID)] = `${by[s(r.BOOLID)] ? `${by[s(r.BOOLID)]} ` : ''}${s(r.BOOLEXP)}`.replace(/\s+/g, ' ').trim();
  }
  return by;
}

/** Activities whose assignment view names validations / substitutions → kinds. */
export function ggbKinds(activity) {
  return [...new Set(activity.objects.flatMap((ob) => VIEW_KINDS[ob.name] || []))];
}

async function readProgramSource(c, name) {
  try {
    const r = await c.callTool({ name: 'GetProgram', arguments: { program_name: name } });
    const t = r.content?.[0]?.text || '';
    let src = '';
    try { const j = JSON.parse(t); src = j.program_data || j.source_code || ''; } catch { src = r.isError ? '' : t; }
    return src ? { src } : { error: t.slice(0, 200) };
  } catch (e) {
    return { error: String(e.message || e).slice(0, 200) };
  }
}

async function readIncludeSource(c, name) {
  try {
    const r = await c.callTool({ name: 'GetInclude', arguments: { include_name: name } });
    const t = r.content?.[0]?.text || '';
    let src = '';
    try { src = JSON.parse(t).source_code || ''; } catch { src = r.isError ? '' : t; }
    return src ? { src } : { error: t.slice(0, 200) };
  } catch (e) {
    return { error: String(e.message || e).slice(0, 200) };
  }
}

// Customer form pool → its FORM routines (from the program and its Z/Y includes).
async function readFormPool(c, pool) {
  const main = await readProgramSource(c, pool);
  if (main.error) return { error: main.error, forms: {} };
  const forms = {};
  const titles = {};
  const add = (src, where) => {
    Object.assign(titles, exitTitles(src));
    for (const [n, code] of Object.entries(splitForms(src))) {
      const lines = code.split(/\r?\n/);
      forms[n] = { include: where, lines: lines.filter((l) => l.trim() && !/^\s*\*/.test(l) && !/^\s*"/.test(l)).length, source: lines.slice(0, SRC_CAP).join('\n'), truncated: lines.length > SRC_CAP };
    }
  };
  add(main.src, pool);
  const incs = [...new Set([...main.src.matchAll(/^\s*include\s+([zy][\w/]*)/gim)].map((m) => m[1].toUpperCase()))];
  const errors = {};
  for (const n of incs) {
    const r = await readIncludeSource(c, n);
    if (r.error) errors[n] = r.error;
    else add(r.src, n);
  }
  return { forms, titles, includes: incs, ...(Object.keys(errors).length ? { errors } : {}) };
}

/**
 * Reads the rules for one module. `tables` are the snapshot tables (assignment rows already read).
 * Returns { kinds, rules: { VAL: {...}, SUB: {...} }, booleans, messages, exits, errors }.
 */
export async function readGgb(c, module, tables, langs = ['3', 'E']) {
  const errors = {};
  const named = { VAL: new Set(), SUB: new Set() };
  for (const [t, specs] of Object.entries(ASSIGN)) for (const sp of specs) for (const r of tables[t]?.rows || []) if (s(r[sp.col])) named[sp.kind].add(s(r[sp.col]));
  // Customer rules of the module's application areas (Boolean class of a callup point there).
  const areas = GGB_AREAS[module] || [];
  const gb31 = await readTable(c, 'GB31', {});
  if (!gb31.ok) errors.GB31 = String(gb31.error || '').slice(0, 200);
  const classes = new Set(gb31.rows.filter((r) => areas.includes(s(r.VALUSER).toUpperCase())).map((r) => s(r.RCLASS)).filter(Boolean));
  const head = {};
  for (const [kind, table, id] of [['VAL', 'GB93', 'VALID'], ['SUB', 'GB92', 'SUBSTID']]) {
    const res = await readTable(c, table, {});
    if (!res.ok) errors[table] = String(res.error || '').slice(0, 200);
    head[kind] = Object.fromEntries(res.rows
      .filter((r) => named[kind].has(s(r[id])) || (classes.has(s(r.BOOLCLASS)) && (notSap(r.GBOPCREATE) || notSap(r.GBOPCHANGE))))
      .map((r) => [s(r[id]), r]));
  }
  const valIds = Object.keys(head.VAL);
  const subIds = Object.keys(head.SUB);
  const readAll = async (table, field, ids) => {
    if (!ids.length) return [];
    const res = await readIn(c, table, field, ids);
    if (!res.ok) errors[table] = String(res.errors?.[0] || '').slice(0, 200);
    return res.rows;
  };
  const gb931 = await readAll('GB931', 'VALID', valIds);
  const gb921 = await readAll('GB921', 'SUBSTID', subIds);
  const gb922 = await readAll('GB922', 'SUBSTID', subIds);
  const txtV = await readAll('GB93T', 'VALID', valIds);
  const txtS = await readAll('GB92T', 'SUBSID', subIds);
  const boolIds = [...new Set([...gb931.flatMap((r) => [s(r.CONDID), s(r.CHECKID)]), ...gb921.map((r) => s(r.CONDID))].filter(Boolean))];
  const booleans = booleanTexts(await readAll('GB901', 'BOOLID', boolIds));
  const pickText = (rows, idCol, id, txtCol) => {
    const own = rows.filter((r) => s(r[idCol]) === id);
    for (const l of langs) { const x = own.find((r) => s(r.LANGU || r.SPRAS) === l); if (x && s(x[txtCol])) return s(x[txtCol]); }
    return '';
  };
  // Messages of the validation steps (message class of the validation + step message number).
  const msgKeys = [...new Set(gb931.map((r) => `${s(head.VAL[s(r.VALID)]?.MSGID)}|${s(r.VALMSG)}`).filter((k) => !k.startsWith('|') && !k.endsWith('|')))];
  const messages = {};
  const classesOfMsg = [...new Set(msgKeys.map((k) => k.split('|')[0]))];
  if (classesOfMsg.length) {
    const res = await readIn(c, 'T100', 'ARBGB', classesOfMsg, { extra: { SPRSL: langs } });
    if (!res.ok) errors.T100 = String(res.errors?.[0] || '').slice(0, 200);
    for (const k of msgKeys) {
      const [cls, no] = k.split('|');
      const own = res.rows.filter((r) => s(r.ARBGB) === cls && s(r.MSGNR).padStart(3, '0') === no.padStart(3, '0'));
      const hit = langs.map((l) => own.find((r) => s(r.SPRSL) === l)).find(Boolean);
      if (hit) messages[k] = s(hit.TEXT);
    }
  }
  const rules = { VAL: {}, SUB: {} };
  for (const id of valIds) {
    const h = head.VAL[id];
    rules.VAL[id] = {
      id, text: pickText(txtV, 'VALID', id, 'VALTEXT'), boolClass: s(h.BOOLCLASS), msgClass: s(h.MSGID), assigned: named.VAL.has(id),
      created: [s(h.GBOPCREATE), s(h.GBDTCREATE)], changed: [s(h.GBOPCHANGE), s(h.GBDTCHANGE)],
      steps: gb931.filter((r) => s(r.VALID) === id).sort((a, b) => Number(a.VALSEQNR) - Number(b.VALSEQNR)).map((r) => ({
        seq: s(r.VALSEQNR), cond: s(r.CONDID), check: s(r.CHECKID), severity: s(r.VALSEVERE), msg: s(r.VALMSG),
        msgText: messages[`${s(h.MSGID)}|${s(r.VALMSG)}`] || '',
        msgVars: [1, 2, 3, 4].map((n) => (s(r[`MSGTAB${n}`]) ? `${s(r[`MSGTAB${n}`])}-${s(r[`MSGFIELD${n}`])}` : '')).filter(Boolean),
      })),
    };
  }
  for (const id of subIds) {
    const h = head.SUB[id];
    const conds = Object.fromEntries(gb921.filter((r) => s(r.SUBSTID) === id).map((r) => [s(r.SUBSEQNR), s(r.CONDID)]));
    const seqs = [...new Set([...Object.keys(conds), ...gb922.filter((r) => s(r.SUBSTID) === id).map((r) => s(r.SUBSEQNR))])].sort();
    rules.SUB[id] = {
      id, text: pickText(txtS, 'SUBSID', id, 'SUBSTEXT'), boolClass: s(h.BOOLCLASS), exitPool: s(h.EXIT), assigned: named.SUB.has(id),
      created: [s(h.GBOPCREATE), s(h.GBDTCREATE)], changed: [s(h.GBOPCHANGE), s(h.GBDTCHANGE)],
      steps: seqs.map((seq) => ({
        seq, cond: conds[seq] || '',
        sets: gb922.filter((r) => s(r.SUBSTID) === id && s(r.SUBSEQNR) === seq).sort((a, b) => Number(a.CONSEQNR) - Number(b.CONSEQNR)).map((r) => ({
          field: `${s(r.SUBSTAB)}-${s(r.SUBSFIELD)}`.replace(/^-$/, ''), value: s(r.SUBSVAL), exit: s(r.EXITSUBST), fromField: s(r.TABSUBST) ? `${s(r.TABSUBST)}-${s(r.FILEDSUB)}` : '', expr: s(r.MANIPEXP),
        })),
      })),
    };
  }
  // Customer exits: form pools in T80D (GBLR rules / prerequisites and checks, GBLS substitutions).
  // An exit is a FORM the pool registers in GET_EXIT_TITLES (U100, C101, E200 … — regional
  // prefixes are common); rules call it by that name in a Boolean expression or a substitution step.
  const t80d = await readTable(c, 'T80D', { where: "ARBGB IN ('GBLR','GBLS')" });
  if (!t80d.ok) errors.T80D = String(t80d.error || '').slice(0, 200);
  const exits = {};
  const pools = {};
  for (const r of t80d.rows) {
    const pool = s(r.FORMPOOL).toUpperCase();
    if (!/^[ZY]/.test(pool)) continue;
    const kind = s(r.ARBGB) === 'GBLR' ? 'rule' : 'substitution';
    const p = await readFormPool(c, pool);
    pools[pool] = { area: s(r.ARBGB), includes: p.includes || [], registered: Object.keys(p.titles || {}).length, ...(p.error ? { error: p.error } : {}), ...(p.errors ? { includeErrors: p.errors } : {}) };
    const names = new Set(Object.keys(p.titles || {}));
    const used = kind === 'rule'
      ? new Set(Object.values(booleans).flatMap((b) => exitRefs(b, names.size ? names : null)))
      : new Set(Object.values(rules.SUB).flatMap((x) => x.steps.flatMap((st) => st.sets.map((y) => y.exit.toUpperCase()))).filter(Boolean));
    for (const [n, f] of Object.entries(p.forms)) {
      if (names.has(n) || used.has(n)) exits[`${pool}:${n}`] = { pool, name: n, kind, title: p.titles?.[n] || '', registered: names.has(n), used: used.has(n), ...f };
    }
    for (const n of used) if (!p.forms[n]) exits[`${pool}:${n}`] = { pool, name: n, kind, title: p.titles?.[n] || '', registered: names.has(n), used: true, missing: true, include: '', lines: 0, source: '' };
  }
  return { areas, rules, booleans, exits, pools, errors };
}

/**
 * Plain-language meaning of each step and exit, written by the code-reading agent and reviewed:
 * <moduleDir>/ggb/*.json = { steps: { "<RULE>|<SEQ>": text }, exits: { "<EXIT>" | "<POOL>:<EXIT>": text } }.
 */
export function loadGgbNotes(moduleDir) {
  const dir = join(moduleDir, 'ggb');
  const out = { steps: {}, exits: {} };
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    try {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      Object.assign(out.steps, j.steps || {});
      Object.assign(out.exits, j.exits || {});
    } catch { /* a broken file leaves its meanings out */ }
  }
  return out;
}

// Reviewed region reports (<moduleDir>/ggb/<REGION>.md) shown on the assignment activities.
const REGION = { HQ: '본사', US: '미주', EU: '구주', AP: '아태', CN: '중국', MS: '모델솔루션', OTHER: '기타', CO: 'CO' };
export function loadGgbReports(moduleDir) {
  const dir = join(moduleDir, 'ggb');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const id = f.replace(/\.md$/, '');
    return { id, name: REGION[id] || id, html: mdLite(readFileSync(join(dir, f), 'utf8')) };
  });
}

/** Small Markdown subset → HTML (headings, tables, lists, paragraphs, **bold**, `code`); text is escaped first. */
export function mdLite(md) {
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inl = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const out = [];
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { close(); out.push(`<h${Math.min(6, h[1].length + 3)}>${inl(h[2])}</h${Math.min(6, h[1].length + 3)}>`); continue; }
    if (/^\s*\|/.test(l)) {
      close();
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !cells(r).every((c) => /^:?-{2,}:?$/.test(c)));
      out.push(`<table class="mdt">${body.map((r, n) => `<tr>${cells(r).map((c) => (n ? `<td>${inl(c)}</td>` : `<th>${inl(c)}</th>`)).join('')}</tr>`).join('')}</table>`);
      continue;
    }
    const li = /^\s*(?:[-*]|(\d+)\.)\s+(.*)$/.exec(l);
    if (li) {
      const kind = li[1] ? 'ol' : 'ul';
      if (list !== kind) { close(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inl(li[2])}</li>`);
      continue;
    }
    if (!l.trim()) { close(); continue; }
    close();
    out.push(`<p>${inl(l)}</p>`);
  }
  close();
  return out.join('');
}

/** Objects one FORM uses: function modules, tables read / written, other FORMs (comments left out). */
export function codeRefs(src) {
  const code = String(src || '').split(/\r?\n/).filter((l) => !/^\s*\*/.test(l)).map((l) => l.replace(/".*$/, '')).join('\n');
  const all = (re) => [...new Set([...code.matchAll(re)].map((m) => m[1].toUpperCase()))];
  return {
    fms: all(/call\s+function\s+'([^']+)'/gi),
    reads: all(/\bfrom\s+([a-z][a-z0-9_/]*)/gi).filter((t) => !/^(TABLE|MEMORY|DATABASE|SHARED)$/.test(t)),
    writes: all(/\b(?:update|modify|insert|delete)\s+(?:from\s+)?([zy][a-z0-9_]+)/gi),
    performs: all(/\bperform\s+([a-z][\w/]*)/gi),
  };
}

/** Builder side: synthetic views for an activity's kinds (labels in the document language). */
const COLS = {
  ko: {
    VAL: ['검증', '내역', '단계', '전제조건', '점검', '유형', '메시지', '변경'],
    SUB: ['대체', '내역', '단계', '전제조건', '대체 대상', '값 / exit', '변경'],
    EXIT: ['Exit', '내역', '구분', '폼풀', 'Include', '코드 줄'],
    meaning: '해설',
    title: { VAL: '검증 규칙 (GGB0)', SUB: '대체 규칙 (GGB1)', EXIT: '규칙이 호출하는 사용자 exit' },
  },
  en: {
    VAL: ['Validation', 'Text', 'Step', 'Prerequisite', 'Check', 'Type', 'Message', 'Changed'],
    SUB: ['Substitution', 'Text', 'Step', 'Prerequisite', 'Substituted', 'Value / exit', 'Changed'],
    EXIT: ['Exit', 'Title', 'Kind', 'Form pool', 'Include', 'Code lines'],
    meaning: 'Meaning',
    title: { VAL: 'Validation rules (GGB0)', SUB: 'Substitution rules (GGB1)', EXIT: 'User exits the rules call' },
  },
};

export function ggbViews(ggb, kinds, lang, notes = null) {
  const C = COLS[lang] || COLS.en;
  const out = {};
  const by = (rule) => (rule.changed[0] && rule.changed[0] !== 'SAP' ? `${rule.changed[0]} ${rule.changed[1]}` : rule.created[0] && rule.created[0] !== 'SAP' ? `${rule.created[0]} ${rule.created[1]}` : '').trim();
  // With meanings, a "Meaning" column follows the step (exit) so it is read before the raw expressions.
  const has = (o) => !!(o && Object.keys(o).length);
  // Columns carry the field they come from (shown under the label); the meaning column has none.
  const FIELDS = {
    VAL: ['VALID', 'VALTEXT', 'VALSEQNR', 'CONDID', 'CHECKID', 'VALSEVERE', 'VALMSG', 'GBOPCHANGE'],
    SUB: ['SUBSTID', 'SUBSTEXT', 'SUBSEQNR', 'CONDID', 'SUBSFIELD', 'SUBSVAL', 'GBOPCHANGE'],
    EXIT: ['FORM', 'EXITS-TITLE', 'ARBGB', 'FORMPOOL', 'INCLUDE', ''],
  };
  const withM = (kind, at, on) => {
    const pairs = C[kind].map((l, i) => [l, FIELDS[kind][i]]);
    return on ? [...pairs.slice(0, at), [C.meaning, ''], ...pairs.slice(at)] : pairs;
  };
  const put = (row, at, on, text) => (on ? [...row.slice(0, at), text || '', ...row.slice(at)] : row);
  const col = (pairs) => pairs.map(([l, f], i) => ({ name: f, label: l, key: i < 3, dom: '' }));
  const B = (id) => (id ? `${id}: ${ggb.booleans[id] || ''}`.trim() : '');
  for (const kind of kinds) {
    const rows = [];
    const cust = [];
    for (const r of Object.values(ggb.rules[kind] || {}).sort((a, b) => a.id.localeCompare(b.id))) {
      const custom = !!by(r);
      const on = has(notes?.steps);
      for (const st of r.steps.length ? r.steps : [null]) {
        if (custom) cust.push(rows.length);
        const m = st ? notes?.steps?.[`${r.id}|${st.seq}`] : '';
        if (kind === 'VAL') rows.push(put([r.id, r.text, st?.seq || '', B(st?.cond), B(st?.check), st?.severity || '', st ? `${r.msgClass} ${st.msg} ${st.msgText}`.trim() : '', by(r)], 3, on, m));
        else {
          const sets = st?.sets || [];
          rows.push(put([r.id, r.text, st?.seq || '', B(st?.cond), sets.map((x) => x.field).filter(Boolean).join(', '),
            sets.map((x) => x.exit ? `exit ${x.exit}` : x.fromField ? `← ${x.fromField}` : x.expr || x.value).filter(Boolean).join(', '), by(r)], 3, on, m));
        }
      }
    }
    out[`GGB:${kind}`] = { key: `GGB:${kind}`, title: C.title[kind], root: kind === 'VAL' ? 'GB931' : 'GB922', tableTitle: kind === 'VAL' ? 'GB93 / GB931 / GB901' : 'GB92 / GB921 / GB922 / GB901', cols: col(withM(kind, 3, has(notes?.steps))), rows, cust, trOf: {}, truncated: false, error: '', history: [], ggb: true };
  }
  // Only the exits the module's rules call (a form pool is shared by every application area):
  // rule exits (prerequisites, checks) with the validations, substitution exits with the substitutions.
  for (const kind of kinds) {
    const ex = Object.values(ggb.exits || {}).filter((x) => x.used && x.kind === (kind === 'VAL' ? 'rule' : 'substitution'))
      .sort((a, b) => a.name.localeCompare(b.name) || a.pool.localeCompare(b.pool));
    if (!ex.length) continue;
    out[`GGB:EXIT:${kind}`] = {
      key: `GGB:EXIT:${kind}`, title: C.title.EXIT, root: 'T80D', tableTitle: 'T80D', cols: col(withM('EXIT', 2, has(notes?.exits))), trOf: {}, truncated: false, error: '', history: [], ggb: true,
      rows: ex.map((x) => put([x.name, x.title || '', x.kind, x.pool, x.include, String(x.lines)], 2, has(notes?.exits), notes?.exits?.[`${x.pool}:${x.name}`] || notes?.exits?.[x.name])),
      cust: ex.map((_, i) => i),
      // The FORM's code under its row, like a BAdI implementation's methods: objects it uses and the source.
      src: Object.fromEntries(ex.map((x, i) => [i, { include: x.include, lines: x.lines, refs: codeRefs(x.source), source: x.source || '', truncated: !!x.truncated }])),
    };
  }
  return out;
}

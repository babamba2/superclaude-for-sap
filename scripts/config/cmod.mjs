// config-to-document — SAP enhancements (SMOD) and customer projects (CMOD) behind the
// "Develop enhancements …" IMG activities (object L CMOD).
//
// The activity names no enhancement; its SAP documentation does ("COOMKS01 Cost Center: …",
// "EXIT_SAPLKMA1_001"). Tokens of that text count when MODSAP knows them as an enhancement name or
// as a component. Per enhancement:
//   MODSAP  — components (E function exit, S screen, C menu, T table / CI include)
//   MODSAPT — text
//   MODACT / MODATTR — customer projects that contain it, their status (A = active), user, date
// Function exits of enhancements in a project: the exit function module (its group from the ADT
// object URI) names the customer include ZX…; the include's source is read. A table component
// counts as implemented when the customer include (CI_…) exists.

import { readIn, readTable, tableDefinition } from './sap-reader.mjs';

const SRC_CAP = 2000;
const s = (v) => String(v ?? '').trim();

/** Activities of type "Develop enhancements" (object L CMOD). */
export function isCmodActivity(a) {
  return a.objects.some((ob) => ob.type === 'L' && /^CMOD$/i.test(s(ob.name) || s(ob.tcode)));
}

/** Candidate enhancement names / exit function modules in an IMG documentation text. */
export function docTokens(text) {
  const t = String(text || '');
  return {
    names: [...new Set(t.match(/\b[A-Z][A-Z0-9_]{3,7}\b/g) || [])],
    exits: [...new Set(t.match(/\bEXIT_[A-Z0-9_]{3,26}\b/g) || [])],
  };
}

/** Executable lines of ABAP source (comments, blank lines left out). */
export function codeLines(src) {
  return String(src || '').split(/\r?\n/).filter((l) => l.trim() && !/^\s*\*/.test(l) && !/^\s*"/.test(l)).length;
}

const text = (r) => {
  const t = r.content?.[0]?.text || '';
  return { t, err: !!r.isError };
};

async function fmGroup(c, fm) {
  try {
    const { t, err } = text(await c.callTool({ name: 'SearchObject', arguments: { object_name: fm, include_raw_xml: true } }));
    if (err) return '';
    const m = /\/functions\/groups\/([^/"]+)\/fmodules\//i.exec(t);
    return m ? decodeURIComponent(m[1]).toUpperCase() : '';
  } catch {
    return '';
  }
}

async function fmSource(c, fm, group) {
  try {
    const { t, err } = text(await c.callTool({ name: 'GetFunctionModule', arguments: { function_module_name: fm, function_group_name: group } }));
    if (err) return { error: t.slice(0, 200) };
    try { return { src: JSON.parse(t).function_module_data || '' }; } catch { return { src: t }; }
  } catch (e) {
    return { error: String(e.message || e).slice(0, 200) };
  }
}

async function includeSource(c, name) {
  try {
    const { t, err } = text(await c.callTool({ name: 'GetInclude', arguments: { include_name: name } }));
    if (err) return { missing: true, error: t.slice(0, 200) };
    let src = t;
    try { src = JSON.parse(t).source_code ?? t; } catch { /* plain text */ }
    return { src };
  } catch (e) {
    return { missing: true, error: String(e.message || e).slice(0, 200) };
  }
}

async function objectExists(c, name, type) {
  try {
    const { t, err } = text(await c.callTool({ name: 'SearchObject', arguments: { object_name: name, object_type: type } }));
    if (err) return null;
    return new RegExp(`"name"\\s*:\\s*"${name.replace(/[/]/g, '.')}"`, 'i').test(t);
  } catch {
    return null;
  }
}

/** Customer function modules called (CALL FUNCTION 'Z…'), comments left out. */
export function zFunctionCalls(src) {
  const code = String(src || '').split(/\r?\n/).filter((l) => !/^\s*\*/.test(l)).map((l) => l.replace(/".*$/, '')).join('\n');
  return [...new Set([...code.matchAll(/call\s+function\s+'([zy][\w/]*)'/gi)].map((m) => m[1].toUpperCase()))];
}

/** Customer includes named by INCLUDE statements (comments left out). */
export function includeNames(src) {
  const code = String(src || '').split(/\r?\n/).filter((l) => !/^\s*\*/.test(l)).join('\n');
  return [...new Set([...code.matchAll(/^\s*include\s+([zy][\w/]*)\s*\./gim)].map((m) => m[1].toUpperCase()))];
}

// Z sub-includes, three levels deep, each read once per run (shared includes appear under the first exit that uses them).
async function readSubIncludes(c, names, out, seen, depth = 0) {
  for (const n of names) {
    if (out[n] || seen.has(n) || seen.size >= 400) continue;
    seen.add(n);
    const r = await includeSource(c, n);
    if (r.missing) { out[n] = { exists: false }; continue; }
    const lines = String(r.src).split(/\r?\n/);
    out[n] = { exists: true, lines: codeLines(r.src), source: lines.slice(0, SRC_CAP).join('\n'), truncated: lines.length > SRC_CAP };
    if (depth < 2) await readSubIncludes(c, includeNames(r.src), out, seen, depth + 1);
  }
}

/**
 * Reads the enhancements of the module's CMOD activities.
 * Returns { byActivity: { id: [ENH] }, enh: { ENH: { text, projects, comps } }, errors }.
 */
export async function readCmod(c, activities, docs, langs = ['3', 'E'], module = '', projects = '') {
  const errors = {};
  // Customer projects of the module (by project name): every enhancement they hold is shown on one
  // extra activity, also those no IMG documentation names (SD: V54B0001, V56…, ATP00001).
  const projRe = projectPattern(module, projects);
  let moduleProjects = [];
  if (projRe) {
    const allAttr = await readTable(c, 'MODATTR', {});
    if (!allAttr.ok) errors.MODATTR = String(allAttr.error || '').slice(0, 200);
    moduleProjects = allAttr.rows.map((r) => s(r.NAME)).filter((n) => projRe.test(n)).sort();
  }
  const projMembers = moduleProjects.length ? await readIn(c, 'MODACT', 'NAME', moduleProjects) : { ok: true, rows: [] };
  const projEnh = [...new Set(projMembers.rows.map((r) => s(r.MEMBER)).filter(Boolean))];
  const acts = Object.entries(activities).filter(([, a]) => isCmodActivity(a));
  const tok = {};
  for (const [id, a] of acts) tok[id] = docTokens((docs[a.docuId]?.blocks || []).map((b) => b.text).join(' '));
  const err = (k, r) => { if (!r.ok) errors[k] = String(r.errors?.[0] || '').slice(0, 200); };
  const byName = await readIn(c, 'MODSAP', 'NAME', [...new Set(Object.values(tok).flatMap((x) => x.names))]);
  err('MODSAP', byName);
  const byMember = await readIn(c, 'MODSAP', 'MEMBER', [...new Set(Object.values(tok).flatMap((x) => x.exits))]);
  err('MODSAP', byMember);
  const known = new Set(byName.rows.map((r) => s(r.NAME)));
  const enhOfExit = {};
  for (const r of byMember.rows) (enhOfExit[s(r.MEMBER)] ??= new Set()).add(s(r.NAME));
  const byActivity = {};
  for (const [id] of acts) {
    const list = [...new Set([...tok[id].names.filter((n) => known.has(n)), ...tok[id].exits.flatMap((x) => [...(enhOfExit[x] || [])])])];
    byActivity[id] = list;
  }
  if (moduleProjects.length) byActivity[CMOD_PROJECTS_ID] = projEnh;
  const all = [...new Set(Object.values(byActivity).flat())];
  const comps = await readIn(c, 'MODSAP', 'NAME', all);
  err('MODSAP', comps);
  const texts = await readIn(c, 'MODSAPT', 'NAME', all, { extra: { SPRSL: langs } });
  err('MODSAPT', texts);
  const inProj = await readIn(c, 'MODACT', 'MEMBER', all);
  err('MODACT', inProj);
  const projNames = [...new Set(inProj.rows.map((r) => s(r.NAME)))];
  const attr = await readIn(c, 'MODATTR', 'NAME', projNames);
  err('MODATTR', attr);
  const enh = {};
  const seen = new Set();
  for (const name of all) {
    const tx = langs.map((l) => texts.rows.find((r) => s(r.NAME) === name && s(r.SPRSL) === l)).find(Boolean);
    const projects = inProj.rows.filter((r) => s(r.MEMBER) === name).map((r) => {
      const at = attr.rows.find((x) => s(x.NAME) === s(r.NAME)) || {};
      return { name: s(r.NAME), active: s(at.STATUS) === 'A', user: s(at.UNAM || at.CNAM), date: s(at.UDAT || at.CDAT) };
    });
    const list = [];
    for (const r of comps.rows.filter((x) => s(x.NAME) === name && s(x.MEMBER))) {
      const comp = { typ: s(r.TYP), member: s(r.MEMBER) };
      // Code is read only where a customer project contains the enhancement.
      if (projects.length && comp.typ === 'E') {
        const group = await fmGroup(c, comp.member);
        const fm = group ? await fmSource(c, comp.member, group) : { error: 'function group not found' };
        const inc = (/^\s*include\s+(z[\w/]*)/im.exec(fm.src || '') || [])[1]?.toUpperCase() || '';
        comp.group = group;
        comp.include = inc;
        if (fm.error) comp.error = fm.error;
        if (inc) {
          const r2 = await includeSource(c, inc);
          if (r2.missing) comp.exists = false;
          else {
            const lines = String(r2.src).split(/\r?\n/);
            comp.exists = true;
            comp.lines = codeLines(r2.src);
            comp.source = lines.slice(0, SRC_CAP).join('\n');
            comp.truncated = lines.length > SRC_CAP;
            // Customer includes often only route by company code to Z sub-includes, where the code is.
            const subs = {};
            await readSubIncludes(c, includeNames(r2.src), subs, seen);
            if (Object.keys(subs).length) comp.subIncludes = subs;
            // …or call a Z function module per region: its code is read too (one level).
            const fms = {};
            for (const f of zFunctionCalls([r2.src, ...Object.values(subs).map((x) => x.source || '')].join('\n'))) {
              if (seen.has(`FM:${f}`) || seen.size >= 400) continue;
              seen.add(`FM:${f}`);
              const g = await fmGroup(c, f);
              const r3 = g ? await fmSource(c, f, g) : { error: 'function group not found' };
              if (r3.error) { fms[f] = { group: g, error: r3.error }; continue; }
              const l3 = String(r3.src).split(/\r?\n/);
              const inc3 = {};
              await readSubIncludes(c, includeNames(r3.src), inc3, seen, 1);
              fms[f] = { group: g, lines: codeLines(r3.src), source: l3.slice(0, SRC_CAP).join('\n'), truncated: l3.length > SRC_CAP, ...(Object.keys(inc3).length ? { subIncludes: inc3 } : {}) };
            }
            if (Object.keys(fms).length) comp.calledFms = fms;
          }
        }
      } else if (projects.length && comp.typ === 'T') {
        comp.exists = await objectExists(c, comp.member, 'TABL');
      }
      list.push(comp);
    }
    enh[name] = { text: tx ? s(tx.MODTEXT) : '', projects, comps: list };
  }
  return { byActivity, enh, errors, ...(moduleProjects.length ? { moduleProjects } : {}), ...(projects ? { projectsPattern: projects } : {}) };
}

// Dynamic calls: an exit include asks a customer function module for a function name kept in a
// customer table (per program and organisational unit) and runs CALL FUNCTION <variable>. The table
// is found from the code and the DDIC — no table name is fixed here:
//   1. the exit code (include + sub-includes) has CALL FUNCTION with a variable;
//   2. a customer table is read by SELECT in that code or in a Z function module it calls;
//   3. the table has a program-name field and a function-module-name field (by domain / data element).
// Its rows are attached to every exit whose program key it holds (comp.dispatch), and the function
// modules they name are read like statically called ones (comp.calledFms[…].dispatch = true).

const PROG_TYPES = new Set(['PROGRAMM', 'PROGNAME', 'PROGRAM_ID', 'SYREPID', 'REPID']);
const FM_TYPES = new Set(['FUNCNAME', 'RS38L_FNAM', 'FUNCTION']);
// Organisational fields a dispatch table may split by (first key field of these, in order).
const ORG_TYPES = ['BUKRS', 'VKORG', 'WERKS', 'EKORG', 'LGNUM', 'KOKRS', 'LAND1'];

const codeOnly = (src) => String(src || '').split(/\r?\n/).filter((l) => !/^\s*\*/.test(l)).map((l) => l.replace(/".*$/, '')).join('\n');

/** CALL FUNCTION with a variable (not a quoted name). */
export function hasDynamicCall(src) {
  return /call\s+function\s+(?!')[a-z_][\w-]*/i.test(codeOnly(src));
}

/** Customer tables named after FROM in the code. */
export function selectTables(src) {
  return [...new Set([...codeOnly(src).matchAll(/\bfrom\s+([zy][\w/]*)/gi)].map((m) => m[1].toUpperCase()))];
}

/** Dispatch fields of a table definition ({ fields: [{ fieldname, key, rollname, domname, description }] }), or null. */
export function dispatchFields(def) {
  const fl = (def?.fields || []).filter((f) => f.fieldname && !f.fieldname.startsWith('.'));
  const is = (f, set) => set.has(String(f.domname || '').toUpperCase()) || set.has(String(f.rollname || '').toUpperCase());
  const prog = fl.find((f) => is(f, PROG_TYPES));
  const fname = fl.find((f) => is(f, FM_TYPES) && f !== prog);
  if (!prog || !fname) return null;
  const org = ORG_TYPES.map((t) => fl.find((f) => f.key && is(f, new Set([t])))).find(Boolean);
  return { prog: prog.fieldname, fname: fname.fieldname, org: org?.fieldname || '', orgText: org?.description || '', text: def.description || '' };
}

const exitSources = (comp) => [comp.source, ...Object.values(comp.subIncludes || {}).map((x) => x.source)];

/** Finds the dispatch tables of the exits in cmod: [{ table, prog, org, orgText, fname, text }]. */
export async function detectDispatchTables(c, cmod) {
  const cand = new Set();
  for (const e of Object.values(cmod.enh)) {
    for (const comp of e.comps) {
      if (comp.typ !== 'E' || !comp.source || !hasDynamicCall(exitSources(comp).join('\n'))) continue;
      for (const t of selectTables(exitSources(comp).join('\n'))) cand.add(t);
      for (const fm of Object.values(comp.calledFms || {})) for (const t of selectTables([fm.source, ...Object.values(fm.subIncludes || {}).map((x) => x.source)].join('\n'))) cand.add(t);
    }
  }
  const out = [];
  for (const table of [...cand].slice(0, 20)) {
    const f = dispatchFields(await tableDefinition(c, table));
    if (f) out.push({ table, ...f });
  }
  return out;
}

/** Program keys an exit passes to the lookup: its include names and quoted Z names next to the program field. */
export function dispatchKeys(names, sources, progField) {
  const keys = new Set(names);
  const re = new RegExp(`\\b(?:i_)?${progField}\\s*=\\s*'([zy][\\w/]*)'`, 'gi');
  for (const src of sources) for (const m of String(src || '').matchAll(re)) keys.add(m[1].toUpperCase());
  return [...keys];
}

/** Parses "--dispatch TABLE:PROGRAM_FIELD:ORG_FIELD:FUNCTION_FIELD" (when detection misses a table). */
export function parseDispatchSpec(v) {
  const [table, prog, org, fname] = String(v || '').toUpperCase().split(':').map((x) => x.trim());
  if (!table || !prog || !fname) throw new Error('--dispatch needs TABLE:PROGRAM_FIELD:ORG_FIELD:FUNCTION_FIELD');
  return { table, prog, org: org || '', orgText: '', fname, text: '' };
}

/**
 * Attaches dispatch rows (comp.dispatch = [{ table, prog, org, fname }], [] = looks up but not
 * registered) and reads the function modules they name. specs: given ones, else detected ones.
 */
export async function addCmodDispatch(c, cmod, specs = null) {
  const list = specs?.length ? specs : await detectDispatchTables(c, cmod);
  cmod.dispatch = [];
  const byKey = {};
  for (const sp of list) {
    const r = await readTable(c, sp.table, { maxRows: 5000 });
    if (!r.ok) { cmod.errors = { ...cmod.errors, [sp.table]: String(r.error || '').slice(0, 200) }; continue; }
    cmod.dispatch.push({ ...sp, rows: r.rows.length });
    for (const row of r.rows) {
      const prog = s(row[sp.prog]).toUpperCase();
      (byKey[`${sp.table}|${prog}`] ??= []).push({ table: sp.table, prog, org: sp.org ? s(row[sp.org]) : '', fname: s(row[sp.fname]).toUpperCase() });
    }
  }
  const read = {};
  for (const e of Object.values(cmod.enh)) {
    for (const comp of e.comps) {
      delete comp.dispatch;
      if (comp.typ !== 'E' || !comp.include || comp.exists === false || !comp.source) continue;
      const srcs = exitSources(comp);
      if (!hasDynamicCall(srcs.join('\n'))) continue;
      const names = [comp.include, ...Object.keys(comp.subIncludes || {})];
      const rows = cmod.dispatch.flatMap((sp) => dispatchKeys(names, srcs, sp.prog).flatMap((k) => byKey[`${sp.table}|${k}`] || []));
      if (!rows.length) {
        // Looks the table up (program field passed) but no row names it: nothing is called.
        if (cmod.dispatch.some((sp) => new RegExp(`\\b(?:i_)?${sp.prog}\\s*=`, 'i').test(srcs.join('\n')))) comp.dispatch = [];
        continue;
      }
      comp.dispatch = rows.sort((a, b) => a.prog.localeCompare(b.prog) || a.org.localeCompare(b.org));
      const fms = comp.calledFms || {};
      for (const f of [...new Set(rows.map((x) => x.fname))]) {
        if (fms[f] && !fms[f].error) { fms[f].dispatch = true; continue; }
        if (!read[f]) {
          const g = await fmGroup(c, f);
          const r3 = g ? await fmSource(c, f, g) : { error: 'function group not found' };
          if (r3.error) read[f] = { group: g, error: r3.error };
          else {
            const l3 = String(r3.src).split(/\r?\n/);
            const inc3 = {};
            await readSubIncludes(c, includeNames(r3.src), inc3, new Set(), 1);
            read[f] = { group: g, lines: codeLines(r3.src), source: l3.slice(0, SRC_CAP).join('\n'), truncated: l3.length > SRC_CAP, ...(Object.keys(inc3).length ? { subIncludes: inc3 } : {}) };
          }
        }
        fms[f] = { ...read[f], dispatch: true };
      }
      comp.calledFms = fms;
    }
  }
  return cmod;
}

// Customer projects of a module: by default the names starting with Z/Y + module (ZSD00001, YFI01).
// Systems with other naming pass --cmod-projects "<regex>". The extra activity lists every
// enhancement of these projects.
export function projectPattern(module, custom = '') {
  if (custom) return new RegExp(custom, 'i');
  return module ? new RegExp(`^[ZY]${module}`, 'i') : null;
}
export const CMOD_PROJECTS_ID = 'ZZ_CMOD_PROJECTS';

/** Adds the "customer enhancement projects" activity and its tree node to a snapshot. */
export function addCmodProjectsActivity(snap, lang = 'ko') {
  if (!snap.cmod?.byActivity?.[CMOD_PROJECTS_ID]) return;
  const ko = String(lang).startsWith('ko');
  snap.activities[CMOD_PROJECTS_ID] = {
    id: CMOD_PROJECTS_ID, custActivity: CMOD_PROJECTS_ID, tcode: 'CMOD', docuId: '',
    title: ko ? `고객 확장 프로젝트 (CMOD): ${snap.cmod.moduleProjects.join(', ')}` : `Customer enhancement projects (CMOD): ${snap.cmod.moduleProjects.join(', ')}`,
    titleEn: `Customer enhancement projects (CMOD): ${snap.cmod.moduleProjects.join(', ')}`,
    objects: [{ type: 'L', name: 'CMOD', tcode: 'CMOD', sub: '' }],
  };
  const node = { id: CMOD_PROJECTS_ID, kind: 'folder', text: ko ? '고객 확장 (CMOD 프로젝트)' : 'Customer enhancements (CMOD projects)', textEn: 'Customer enhancements (CMOD projects)', children: [{ kind: 'activity', activity: CMOD_PROJECTS_ID, text: snap.activities[CMOD_PROJECTS_ID].title }] };
  snap.tree = [...snap.tree.filter((n) => n.id !== CMOD_PROJECTS_ID), node];
}

/** Implemented = in an active project with a function exit that has code, or an existing CI include. */
export function cmodImplemented(e) {
  return e.projects.some((p) => p.active) && e.comps.some((x) => (x.typ === 'E' && x.exists && x.lines > 0) || (x.typ === 'T' && x.exists));
}

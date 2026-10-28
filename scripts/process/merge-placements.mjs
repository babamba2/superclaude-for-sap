// sc4sap:module-to-process — Step 4 for large scopes: merge parallel placement parts into one BPH.
//
//   node merge-placements.mjs summary --state <STATE_DIR> --plugin-root <PLUGIN_ROOT> --modules SD[,LE]
//        → <STATE_DIR>/step4-merge-input.json (input of the Opus consolidation pass)
//   node merge-placements.mjs build   --state <STATE_DIR> --plugin-root <PLUGIN_ROOT> --modules SD[,LE] [--std-usage <usage.json>]
//        → <STATE_DIR>/step4.json (approved: false) + <STATE_DIR>/step4-ext.json
//
// Inputs in <STATE_DIR>: step4.part-<k>.json (placements of one part, see workflow-scale.md),
// attach.json (entry → program), and for build step4-consolidate.json:
//   { taskMap, l3Map, tasks: {key: {parent, label, desc}}, l3: {key: {parent, label, desc?}}, l2: {key: {label, desc?}},
//     lanes, ownerMap: {ownerLabel: laneId}, systems, systemMap: {"<part>:<id>" | "<id>": finalId}, variantMap: {"<task> | <label>": label | ""} }
// Rows follow the backbone order; new L2 / L3 / L4 come after the backbone nodes of their parent.
// A backbone L3 without any placed entry goes to not_evidenced; a kept L3 keeps all its backbone L4s (kind std).

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const uniq = (a) => [...new Set(a.filter(Boolean))];
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const count = (m, k, by = 1) => { m[k] = (m[k] || 0) + by; };
const majority = (xs) => { const m = {}; xs.forEach(x => x && count(m, x)); return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0]; };
const vid = (i) => (i < 26 ? String.fromCharCode(97 + i) : `v${i}`);

/** Backbone nodes of the modules, keyed by id: { ...node, depth (1 = L1), parent }. */
export function backboneIndex(trees, lang = 'ko') {
  const nodes = {}, roots = [];
  const lab = (n) => (n.label && (n.label[lang] || n.label.en)) || n.id;
  const walk = (n, depth, parent) => { nodes[n.id] = { ...n, depth, parent, text: lab(n) }; (n.children || []).forEach(c => walk(c, depth + 1, n.id)); };
  for (const t of trees) for (const root of arr(t.tree)) { roots.push(root.id); walk(root, 1, null); }
  return { nodes, roots };
}

// external systems of a placement: `ext` / `ext_systems`, and `system` itself when it is not SAP
const partSystems = (part, pl) => [pl.ext, pl.ext_systems, pl.system && pl.system !== 'sap' ? pl.system : null].flat().filter(Boolean).map(String);

export function summarize(parts, bb) {
  const tasks = {}, l3 = {}, l2 = {}, owners = {}, systems = [], variants = {}, placed = {};
  for (const p of parts) {
    for (const t of arr(p.new_tasks)) (tasks[t.key] ||= []).push({ part: p.part, parent: t.parent, label: t.label, desc: t.desc });
    for (const t of arr(p.new_l3)) (l3[t.key] ||= []).push({ part: p.part, parent: t.parent, label: t.label });
    for (const t of arr(p.new_l2)) (l2[t.key] ||= []).push({ part: p.part, label: t.label });
    for (const s of arr(p.systems)) systems.push({ part: p.part, ...s });
    for (const pl of arr(p.placements)) {
      count(owners, pl.owner || '-'); count(placed, pl.task);
      if (pl.variant) count(variants, `${pl.task} | ${pl.variant}`);
      for (const id of partSystems(p, pl)) if (!systems.some(s => s.part === p.part && s.id === id)) systems.push({ part: p.part, id, kind: '?', label: id });
    }
  }
  const withCount = Object.fromEntries(Object.entries(tasks).map(([k, defs]) => [k, { entries: placed[k] || 0, defs }]));
  const at = (d) => Object.values(bb.nodes).filter(n => n.depth === d).map(n => `${n.id} ${n.text}`);
  return { backboneL2: at(2), backboneL3: at(3), newTasks: withCount, newL3: l3, newL2: l2, owners, systems, variants,
    backbonePlacements: Object.fromEntries(Object.entries(placed).filter(([k]) => bb.nodes[k])) };
}

export function buildHierarchy({ parts, bb, C, programOf = {}, stdUsed = new Set() }) {
  const sm = (part, id) => C.systemMap?.[`${part}:${id}`] || C.systemMap?.[id] || id;
  const l3Of = (k) => C.l3Map?.[k] || k;
  const placements = parts.flatMap(p => arr(p.placements).map(pl => ({ ...pl,
    task: C.taskMap?.[pl.task] || pl.task, system: sm(p.part, pl.system || 'sap'), ext: uniq(partSystems(p, pl).map(x => sm(p.part, x))) })));
  const byTask = {};
  for (const pl of placements) (byTask[pl.task] ||= []).push(pl);
  const children = {};
  const add = (parent, key) => { const c = (children[parent] ||= []); if (!c.includes(key)) c.push(key); };
  Object.values(bb.nodes).filter(n => n.parent).forEach(n => add(n.parent, n.id));
  const firstRoot = bb.roots[0];
  for (const k of Object.keys(C.l2 || {})) add(C.l2[k].parent || firstRoot, k);
  for (const [k, v] of Object.entries(C.l3 || {})) if (l3Of(k) === k) add(v.parent, k);
  for (const [k, v] of Object.entries(C.tasks || {})) add(l3Of(v.parent), k);
  const def = (k) => C.tasks?.[k] || C.l3?.[k] || C.l2?.[k] || {};
  const label = (k) => bb.nodes[k]?.text || def(k).label || k;
  const hasCbo = (k) => arr(byTask[k]).length > 0;
  const keepL3 = (k) => arr(children[k]).some(hasCbo);
  const keepL2 = (k) => arr(children[k]).some(keepL3);
  const rows = [], notEv = [], ext = {};
  const l4 = (code, k) => {
    const pls = arr(byTask[k]), n = bb.nodes[k];
    const row = { code, level: 4, label: label(k), ...(def(k).desc ? { desc: def(k).desc } : {}), ...(n ? { backbone: k } : {}) };
    if (!pls.length) return Object.assign(row, { kind: 'std', system: 'sap', tcodes: arr(n?.tcodes), usage: arr(n?.tcodes).some(t => stdUsed.has(t)) ? 'used' : 'unknown' });
    const owner = majority(pls.map(p => C.ownerMap?.[p.owner]));
    Object.assign(row, { kind: majority(pls.map(p => p.kind)) || 'cbo', system: majority(pls.map(p => p.system)) || 'sap',
      tcodes: uniq([...arr(n?.tcodes).filter(t => stdUsed.has(t)), ...pls.map(p => p.entry)]), objects: uniq(pls.map(p => programOf[p.entry])), usage: 'used',
      ...(owner ? { owner, ownerEstimated: true } : {}) });
    const vg = {};
    for (const p of pls) if (p.variant) { const m = C.variantMap?.[`${k} | ${p.variant}`]; const v = m === undefined ? p.variant : m; if (v) (vg[v] ||= []).push(p); }
    const vl = Object.entries(vg);
    if (vl.length) row.variants = vl.map(([v, ps], i) => ({ id: vid(i), label: v, kind: majority(ps.map(p => p.kind)) || 'cbo',
      tcodes: uniq(ps.map(p => p.entry)), objects: uniq(ps.map(p => programOf[p.entry])), system: majority(ps.map(p => p.system)) || 'sap', usage: 'used' }));
    const ex = uniq(pls.flatMap(p => p.ext));
    if (ex.length) ext[code] = { task: k, systems: ex, entries: uniq(pls.filter(p => p.ext.length).map(p => p.entry)) };
    return row;
  };
  bb.roots.forEach((root, i1) => {
    const c1 = String(i1 + 1); rows.push({ code: c1, level: 1, label: label(root) });
    let i2 = 0;
    for (const k2 of arr(children[root])) {
      if (!keepL2(k2)) { arr(children[k2]).forEach(k3 => bb.nodes[k3] && notEv.push({ backbone: k3, label: label(k3), reason: 'no used CBO entry point in this L3' })); continue; }
      const c2 = `${c1}.${++i2}`; rows.push({ code: c2, level: 2, label: label(k2), ...(def(k2).desc ? { desc: def(k2).desc } : {}) });
      let i3 = 0;
      for (const k3 of arr(children[k2])) {
        if (!keepL3(k3)) { if (bb.nodes[k3]) notEv.push({ backbone: k3, label: label(k3), reason: 'no used CBO entry point in this L3' }); continue; }
        const c3 = `${c2}.${++i3}`; rows.push({ code: c3, level: 3, label: label(k3), ...(def(k3).desc ? { desc: def(k3).desc } : {}) });
        let i4 = 0;
        for (const k4 of arr(children[k3])) rows.push(l4(`${c3}.${++i4}`, k4));
      }
    }
  });
  const placedEntries = new Set(rows.flatMap(r => arr(r.tcodes)));
  const lost = placements.filter(p => !placedEntries.has(p.entry)).map(p => ({ entry: p.entry, reason: `task ${p.task} not in tree` }));
  const step4 = { schema: 1, saved_at: new Date().toISOString(), approved: false, lanes: arr(C.lanes), systems: arr(C.systems), rows, not_evidenced: notEv,
    unplaced: [...parts.flatMap(p => arr(p.unplaced)), ...lost], cross_module: parts.flatMap(p => arr(p.cross_module)),
    open_questions: uniq(parts.flatMap(p => arr(p.open_questions))) };
  return { step4, ext, lost };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [cmd, ...args] = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  try {
    const st = get('--state'), root = get('--plugin-root');
    const modules = String(get('--modules') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!st || !root || !modules.length || !['summary', 'build'].includes(cmd)) throw new Error('usage: merge-placements.mjs summary|build --state <dir> --plugin-root <dir> --modules M1[,M2] [--std-usage <file>] [--lang ko]');
    const files = readdirSync(st).filter(f => /^step4\.part-\d+\.json$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    if (!files.length) throw new Error(`no step4.part-<k>.json in ${st}`);
    const parts = files.map(f => readJson(join(st, f)));
    const bb = backboneIndex(modules.map(m => join(root, 'configs', m, 'process-backbone.json')).filter(existsSync).map(readJson), get('--lang') || 'ko');
    if (cmd === 'summary') {
      const out = summarize(parts, bb);
      writeFileSync(join(st, 'step4-merge-input.json'), `${JSON.stringify(out, null, 1)}\n`, 'utf8');
      console.log(JSON.stringify({ parts: parts.length, placements: parts.reduce((n, p) => n + arr(p.placements).length, 0), newTasks: Object.keys(out.newTasks).length,
        newL3: Object.keys(out.newL3).length, newL2: Object.keys(out.newL2).length, owners: Object.keys(out.owners).length, variants: Object.keys(out.variants).length }));
    } else {
      const C = readJson(join(st, 'step4-consolidate.json'));
      const attach = existsSync(join(st, 'attach.json')) ? readJson(join(st, 'attach.json')) : { entries: [] };
      const programOf = Object.fromEntries(arr(attach.entries).map(e => [e.name, e.program]));
      const stdUsed = new Set(get('--std-usage') ? arr(readJson(get('--std-usage')).used) : []);
      const { step4, ext, lost } = buildHierarchy({ parts, bb, C, programOf, stdUsed });
      writeFileSync(join(st, 'step4.json'), `${JSON.stringify(step4, null, 1)}\n`, 'utf8');
      writeFileSync(join(st, 'step4-ext.json'), `${JSON.stringify(ext, null, 1)}\n`, 'utf8');
      console.log(JSON.stringify({ rows: step4.rows.length, l4: step4.rows.filter(r => r.level === 4).length, notEvidenced: step4.not_evidenced.length, unplaced: step4.unplaced.length, lost: lost.length }));
    }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}

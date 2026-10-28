// sc4sap:project-dashboard — a first project model from a template (templates.json) and the interview.
//
// answers: { code, name, type, lang?, start, goLive, modules: ['SD', 'MM'], packages?: [], system?, sponsor?,
//            pm?, pmo?, trPattern?, team?: [{ id, name, role, module?, sapUser? }] }
// Phase dates are worked back from goLive (weights share start..goLive; afterWeeks phases follow go-live),
// item dates are the item's span of its phase. Baseline = the generated dates.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, days, normalizeModel, TYPES, WRICEF_KINDS, STAGES } from './project-model.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const here = dirname(fileURLToPath(import.meta.url));
export const loadTemplates = () => JSON.parse(readFileSync(join(here, 'templates.json'), 'utf8'));
const text = (t, lang) => (t && typeof t === 'object' ? t[lang] || t.en || t.ko || '' : String(t || ''));

/** Team member for one side of an item: module consultant / developer of that module, else the first of the role. */
function ownerFor(team, side, module) {
  const role = side === 'dev' ? 'dev' : 'module';
  return (team.find(t => t.role === role && t.module === module) || team.find(t => t.role === role && !t.module)
    || (side === 'dev' ? team.find(t => t.role === 'dev') : null))?.id || '';
}
const pmoOwner = (team) => (team.find(t => t.role === 'pmo') || team.find(t => t.role === 'pm'))?.id || '';

export function instantiate(answers, templates = loadTemplates()) {
  const a = { lang: 'ko', modules: [], packages: [], team: [], ...answers };
  if (!TYPES.includes(a.type)) throw new Error(`type must be one of ${TYPES.join(', ')}`);
  const tpl = templates.types[a.type];
  const lang = a.lang;
  const team = arr(a.team);
  const span = days(a.start, a.goLive);
  if (!(span > 0)) throw new Error('goLive must be after start');
  const pre = tpl.phases.filter(p => !p.afterWeeks), post = tpl.phases.filter(p => p.afterWeeks);
  const W = pre.reduce((s, p) => s + p.weight, 0);
  const wbs = [], milestones = [];
  const gate = (id, g, date, phase) => milestones.push({ id, label: text(g.label, lang), kind: g.kind, phase, base: date, forecast: date, status: 'planned', criteria: [] });

  const place = (p, ps, pf) => {
    wbs.push({ id: p.key, label: text(p.label, lang), type: 'phase', start: ps, finish: pf });
    const len = days(ps, pf);
    for (const it of p.items) {
      const mods = it.ws === '{module}' ? (a.modules.length ? a.modules : ['—']) : [null];
      for (const mod of mods) {
        const s = addDays(ps, Math.round(len * it.span[0])), f = addDays(ps, Math.max(Math.round(len * it.span[0]), Math.round(len * it.span[1])));
        const row = {
          id: mod ? `${p.key}.${it.key}.${mod}` : `${p.key}.${it.key}`, parent: p.key,
          label: text(it.label, lang).replace('{module}', mod || ''), type: 'deliverable', ws: mod || it.ws, start: s, finish: f,
        };
        if (it.owner === 'fn') row.fnOwner = ownerFor(team, 'fn', mod);
        else if (it.owner === 'dev') row.devOwner = ownerFor(team, 'dev', mod);
        else row.owner = it.ws === 'PMO' ? pmoOwner(team) : '';
        if (it.wricef) row.wricefContainer = true;
        wbs.push(row);
        if (it.gate) gate(`MS.${row.id}`, it.gate, f, p.key);
      }
    }
    if (p.gate) gate(`MS.${p.key}`, p.gate, p.gate.kind === 'golive' ? a.goLive : pf, p.key);
  };
  let cum = 0;
  pre.forEach((p, i) => {
    const ps = addDays(a.start, Math.round((cum / W) * span));
    cum += p.weight;
    const pf = i === pre.length - 1 ? a.goLive : addDays(a.start, Math.round((cum / W) * span) - 1);
    place(p, ps, pf);
  });
  let after = addDays(a.goLive, 1);
  for (const p of post) { const pf = addDays(after, p.afterWeeks * 7 - 1); place(p, after, pf); after = addDays(pf, 1); }

  for (const w of wbs) { w.baseStart = w.start; w.baseFinish = w.finish; }
  const workstreams = [
    ...a.modules.map(code => ({ code, label: code, kind: 'module' })),
    ...templates.workstreams.map(w => ({ code: w.code, label: text(w.label, lang), kind: 'cross' })),
  ];
  const end = wbs.map(w => w.finish).sort().at(-1);
  const kpis = [...arr(templates.kpis?.common), ...arr(templates.kpis?.[a.type])].map(k => ({
    id: `K.${k.key}`, label: text(k.label, lang), group: k.group, unit: k.unit || '', target: k.target ?? '', dir: k.dir || 'up', actual: '', history: [],
  }));
  return normalizeModel({
    kpis,
    lang, title: a.name,
    project: { code: a.code, name: a.name, type: a.type, sponsor: a.sponsor || '', pm: a.pm || '', pmo: a.pmo || '', start: a.start, goLive: a.goLive, end,
      system: a.system || '', modules: a.modules, packages: a.packages, ...(a.trPattern ? { trPattern: a.trPattern } : {}) },
    team, workstreams, wbs, milestones,
  });
}

/** WRICEF items into the development deliverable of their module (wricefContainer), dated like it.
 *  items: [{ id?, label, kind, module, fnOwner?, devOwner?, stage?, objects?: [name] }] */
export function addWricef(model, items) {
  const m = normalizeModel(model);
  const ids = new Set(m.wbs.map(w => w.id));
  const containers = m.wbs.filter(w => w.wricefContainer);
  const added = [], skipped = [];
  for (const it of arr(items)) {
    const c = containers.find(w => w.ws === it.module) || containers.find(w => w.ws === '—');
    if (!c) { skipped.push({ item: it.label, reason: `no WRICEF development deliverable for module ${it.module}` }); continue; }
    if (!WRICEF_KINDS.includes(it.kind)) { skipped.push({ item: it.label, reason: `kind must be one of ${WRICEF_KINDS.join('')}` }); continue; }
    let id = it.id || `${c.id}.${it.kind}${String(m.wbs.filter(w => w.parent === c.id).length + 1).padStart(3, '0')}`;
    while (ids.has(id)) id += '_';
    ids.add(id);
    const team = m.team;
    m.wbs.push({
      id, parent: c.id, label: it.label, type: 'wricef', ws: it.module, start: c.start, finish: c.finish, baseStart: c.start, baseFinish: c.finish,
      fnOwner: it.fnOwner || ownerFor(team, 'fn', it.module), devOwner: it.devOwner || ownerFor(team, 'dev', it.module),
      status: 'notstarted', pct: 0, deps: [],
      wricef: { kind: it.kind, stage: STAGES.includes(it.stage) ? it.stage : 'req', stageDates: {}, objects: arr(it.objects), trs: [] },
    });
    added.push(id);
  }
  return { model: normalizeModel(m), added, skipped };
}

// sc4sap:module-to-process — process-model.json helpers shared by the build and the checks.
//
// The model is one JSON file written by the writer agent (shape in
// skills/module-to-process/model-schema.md). Rows are a flat BPH list ordered as in the
// document; the code carries the hierarchy ("1", "1.2", "1.2.3", "1.2.3.4"), `level` must
// match the number of segments. L4 rows carry the task sheet (`task`).

const arr = (v) => (Array.isArray(v) ? v : []);

export const KINDS = ['std', 'cbo', 'enh', 'manual', 'ext'];
export const USAGE = ['used', 'unused', 'unknown'];
export const SYSTEM_KINDS = ['sap', 'legacy', 'manual', 'external'];
const DEFAULT_SYSTEMS = [
  { id: 'sap', kind: 'sap', label: 'SAP' },
  { id: 'manual', kind: 'manual', label: 'Manual' },
];

const segs = (code) => String(code ?? '').split('.').filter(Boolean);
export const parentCode = (code) => segs(code).slice(0, -1).join('.');
export const anchorId = (code) => `p-${String(code).replace(/[^A-Za-z0-9]+/g, '-')}`;

/** Fills defaults so the renderer never checks for missing arrays. Returns a new object. */
export function normalizeModel(model) {
  const m = { ...model };
  m.lang = m.lang || 'ko';
  m.modules = arr(m.modules).length ? m.modules : [m.module].filter(Boolean);
  m.scope = { packages: [], tcodes: [], ...(m.scope || {}) };
  const systems = arr(m.scope.systems);
  m.scope.systems = [...systems, ...DEFAULT_SYSTEMS.filter(d => !systems.some(s => s.id === d.id))];
  m.lanes = arr(m.lanes);
  m.rows = arr(m.rows).map(r => ({
    ...r,
    code: String(r.code ?? ''),
    level: Number(r.level) || segs(r.code).length,
    tcodes: arr(r.tcodes), objects: arr(r.objects), variants: arr(r.variants),
  }));
  m.crossModule = arr(m.crossModule);
  m.openQuestions = arr(m.openQuestions);
  m.glossary = arr(m.glossary);
  m.notEvidenced = arr(m.notEvidenced);
  return m;
}

export const systemOf = (m, id) => m.scope.systems.find(s => s.id === id) || null;
export const laneOf = (m, id) => m.lanes.find(l => l.id === id) || null;

/** Children of a row (direct only), in document order. */
export function childrenOf(m, code) {
  return m.rows.filter(r => parentCode(r.code) === code);
}

/** Totals for the overview cards: per L1 / L2 the number of L4 tasks and of CBO objects. */
export function rollup(m, code) {
  const under = m.rows.filter(r => r.code === code || r.code.startsWith(`${code}.`));
  const tasks = under.filter(r => r.level === 4);
  const objs = new Set(tasks.flatMap(t => [...t.objects, ...t.variants.flatMap(v => arr(v.objects))]));
  const ztc = new Set(tasks.flatMap(t => [...t.tcodes, ...t.variants.flatMap(v => arr(v.tcodes))]).filter(c => /^[ZY]/.test(c)));
  return {
    tasks: tasks.length,
    cbo: objs.size,
    ztcodes: ztc.size,
    std: tasks.filter(t => t.kind === 'std').length,
    unused: tasks.filter(t => t.usage === 'unused').length,
    tbd: tasks.filter(t => t.ownerEstimated || arr(t.task?.tbd).length).length,
  };
}

/** Interface rows gathered from every task (appendix index). */
export function interfaceIndex(m) {
  return m.rows.flatMap(r => arr(r.task?.interfaces).map(i => ({ ...i, code: r.code, task: r.label })));
}

/** Conversion notes gathered from every task (appendix list). */
export function conversionIndex(m) {
  return m.rows.flatMap(r => arr(r.task?.conversion).map(c => (typeof c === 'string' ? { text: c } : c)).map(c => ({ ...c, code: r.code, task: r.label })));
}

/**
 * Structural checks. Returns { errors, warnings } — errors stop the build.
 *   · code unique, segments numeric-or-word, level = segments, parent present before child
 *   · L4 rows carry a task; kind / usage / system / owner values known
 *   · a business rule cites a source or is marked estimated
 *   · task links point at an existing row
 */
export function checkModel(model) {
  const m = normalizeModel(model);
  const errors = [], warnings = [];
  if (!m.module) errors.push('model.module missing');
  if (!m.rows.length) errors.push('model.rows is empty');
  const seen = new Set();
  for (const [i, r] of m.rows.entries()) {
    const at = `rows[${i}] ${r.code || '?'}`;
    if (!r.code) { errors.push(`${at}: code missing`); continue; }
    if (seen.has(r.code)) errors.push(`${at}: duplicate code`);
    if (r.level !== segs(r.code).length) errors.push(`${at}: level ${r.level} ≠ ${segs(r.code).length} segments`);
    if (r.level < 1 || r.level > 4) errors.push(`${at}: level must be 1–4`);
    const p = parentCode(r.code);
    if (p && !seen.has(p)) errors.push(`${at}: parent ${p} must come before it`);
    seen.add(r.code);
    if (!r.label) errors.push(`${at}: label missing`);
    if (r.kind && !KINDS.includes(r.kind)) errors.push(`${at}: kind "${r.kind}" not in ${KINDS.join('/')}`);
    if (r.usage && !USAGE.includes(r.usage)) errors.push(`${at}: usage "${r.usage}" not in ${USAGE.join('/')}`);
    if (r.system && !systemOf(m, r.system)) errors.push(`${at}: system "${r.system}" not in scope.systems`);
    if (r.owner && !laneOf(m, r.owner)) errors.push(`${at}: owner "${r.owner}" not in lanes`);
    if (r.level === 4) {
      if (!r.kind) warnings.push(`${at}: kind missing (std / cbo / enh / manual / ext)`);
      if (!r.task) { warnings.push(`${at}: L4 without task sheet`); continue; }
      for (const [k, rule] of arr(r.task.rules).entries()) {
        const rr = typeof rule === 'string' ? { text: rule } : rule;
        if (!rr.source && !rr.estimated) warnings.push(`${at}: rules[${k}] has no source — add {object, unit, line} or mark estimated`);
      }
      for (const s of arr(r.task.steps)) {
        if (s.system && !systemOf(m, s.system)) errors.push(`${at}: step "${s.name}" system "${s.system}" not in scope.systems`);
        if (s.owner && !laneOf(m, s.owner)) errors.push(`${at}: step "${s.name}" owner "${s.owner}" not in lanes`);
      }
    } else if (r.task) warnings.push(`${at}: task sheet on an L${r.level} row is ignored`);
  }
  const codes = new Set(m.rows.map(r => r.code));
  for (const r of m.rows) for (const l of arr(r.task?.links)) {
    const to = typeof l === 'string' ? l : l?.code;
    if (to && !codes.has(to)) warnings.push(`${r.code}: link to unknown row ${to}`);
  }
  for (const s of m.scope.systems) if (s.kind && !SYSTEM_KINDS.includes(s.kind)) errors.push(`scope.systems ${s.id}: kind "${s.kind}" not in ${SYSTEM_KINDS.join('/')}`);
  return { errors, warnings };
}

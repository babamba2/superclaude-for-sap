// sc4sap:transport-readiness (cab mode) — change notes for the change advisory board. Pure: no I/O.
//
// One card per request: what changed (objects + a business text written later by sap-writer and checked by
// lintNote), what it affects (reverse reach over the CBO graph — the relmap page's impact rule: first step over
// every relation, then code relations only, up to 6 steps), scheduled jobs that run an affected program
// (TBTCO / TBTCP from `collect --cab`), test evidence (cab-evidence.mjs), a risk level and fact-only rollback notes.
//
// Never claims more than was read: no graph for a package → impact `not-collected` (not "none"); target not read
// → rollback `target-unread` (never "can be rolled back"); no jobs read → jobs `null`.

import { keepNode } from '../relmap/relmap-model.mjs';
import { verdictOf, findingsFor, objectsOf } from './tr-model.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const up = (s) => String(s ?? '').trim().toUpperCase();

/** The relmap page's code relations (relmap-client.js CODE_KINDS): steps 2… of the impact walk follow only these. */
export const CODE_KINDS = ['include', 'calls', 'submits', 'starts', 'launches', 'reads', 'writes', 'uses'];
export const MAX_DEPTH = 6;
export const MANY_TCODES = 10;
const PROGRAM_TYPES = new Set(['PROG', 'FUNC', 'FUGR', 'CLAS', 'INTF']);
const DDIC_DATA = new Set(['TABL', 'DOMA', 'DTEL']);
/** Table contents in a request (customizing or customer table rows) — no version history. */
export const CONTENT_TYPES = new Set(['TABU', 'VDAT', 'CDAT', 'TDAT']);

/** E071 entry → graph node ids to try, in order. LIMU parts map to their owner object. */
export function graphIdsOf(o) {
  const type = up(o.object);
  const raw = String(o.name ?? '');
  const first = up(raw.split(/\s+/)[0]);
  const name = up(raw);
  switch (type) {
    case 'PROG': case 'REPS': case 'REPT': case 'REPO': return [`PROG:${name}`, `INCL:${name}`];
    case 'DYNP': case 'CUAD': case 'VARX': return [`PROG:${first}`];
    case 'FUGR': case 'FUGT': return [`FUGR:${name}`];
    case 'FUNC': return [`FUNC:${name}`];
    case 'CLAS': case 'CLSD': case 'CPUB': case 'CPRO': case 'CPRI': case 'METH': return [`CLAS:${raw.length > 30 ? up(raw.slice(0, 30)) : first}`];
    case 'CINC': return [`CLAS:${up(raw.split('=')[0])}`];
    case 'INTF': return [`INTF:${first}`];
    case 'TABL': case 'TABD': case 'TABT': case 'TABU': return [`TABL:${first}`, `STRU:${first}`, `VIEW:${first}`];
    case 'DTEL': case 'DTED': return [`DTEL:${name}`];
    case 'DOMA': case 'DOMD': return [`DOMA:${name}`];
    case 'TTYP': case 'TTYD': return [`TTYP:${name}`];
    case 'VIEW': case 'VIED': case 'VDAT': case 'CDAT': return [`VIEW:${first}`, `TABL:${first}`];
    case 'SHLP': case 'SHLD': return [`SHLP:${name}`];
    case 'TRAN': return [`TRAN:${name}`];
    case 'MSAG': case 'MESS': return [`MSAG:${first}`];
    case 'ENQU': case 'ENQD': return [`ENQU:${name}`];
    default: return [];
  }
}

/** LIMU ADIR entries carry the object directory key in the name (`R3TRPROGZFOO…`): read it as that object. */
export function readableEntry(o) {
  if (up(o.object) !== 'ADIR') return o;
  const n = String(o.name ?? '');
  return { ...o, pgmid: n.slice(0, 4).trim() || 'R3TR', object: n.slice(4, 8).trim(), name: n.slice(8).trim() };
}

/** Display type of an E071 entry (LIMU parts shown as their owner's type). */
export function typeOf(o) {
  const t = up(o.object);
  if (CONTENT_TYPES.has(t)) return 'CONTENT';
  const id = graphIdsOf(o)[0];
  return id ? id.split(':')[0] : t;
}

/** Index of one graph.json: customer nodes only (as the relmap page), incoming edges per node. */
export function indexGraph(graph, packages = null) {
  const nodes = new Map(arr(graph?.nodes).filter(keepNode).map((n) => [n.id, n]));
  const inc = new Map();
  for (const e of arr(graph?.edges)) {
    if (e.kind === 'dynamic' || !nodes.has(e.from) || !nodes.has(e.to)) continue;
    if (!inc.has(e.to)) inc.set(e.to, []);
    inc.get(e.to).push(e);
  }
  return { nodes, inc, packages: new Set((packages || [graph?.package, ...arr(graph?.packages)]).filter(Boolean).map(up)) };
}

/** Reverse reach from `ids` (relmap impactOf): step 1 over every relation, steps 2…6 over code relations. */
export function impactOf(G, ids) {
  const depth = new Map(ids.map((i) => [i, 0]));
  let q = [...ids];
  const code = new Set(CODE_KINDS);
  for (let d = 1; d <= MAX_DEPTH && q.length; d += 1) {
    const next = [];
    for (const x of q) for (const e of G.inc.get(x) || []) {
      if (d > 1 && !code.has(e.kind)) continue;
      if (!depth.has(e.from)) { depth.set(e.from, d); next.push(e.from); }
    }
    q = next;
  }
  const nodes = [...depth.keys()].filter((x) => !ids.includes(x));
  const typeOfId = (x) => G.nodes.get(x)?.type || x.split(':')[0];
  return { nodes, tcodes: nodes.filter((x) => typeOfId(x) === 'TRAN'), progs: nodes.filter((x) => PROGRAM_TYPES.has(typeOfId(x))) };
}

/**
 * Impact of one request over every graph. `graphs` = [{ G (indexGraph), info: { desc, usage, jobs } }],
 * `packageOf` = Map 'TYPE NAME' → package (TADIR). An object whose package has no graph is `not-collected`.
 */
export function requestImpact(objs, graphs, packageOf = new Map()) {
  const covered = new Set(graphs.flatMap((g) => [...g.G.packages]));
  const byKey = new Map();
  const tcodes = new Map(), progs = new Set(), usageJobs = new Set();
  const RANK = { found: 2, 'not-in-graph': 1, 'not-collected': 0 };
  for (const raw of objs) {
    const o = readableEntry(raw);
    const cands = graphIdsOf(o);
    // TADIR holds R3TR objects: a LIMU part or table contents look up their owner (REPS → PROG, TABU → TABL …)
    const pkg = up(packageOf.get(`${up(o.object)} ${up(o.name)}`) || cands.map((c) => packageOf.get(c.replace(':', ' '))).find(Boolean) || '');
    let found = null;
    for (const g of graphs) {
      const id = cands.find((c) => g.G.nodes.has(c));
      if (!id) continue;
      found = id;
      const im = impactOf(g.G, [id]);
      for (const t of [...im.tcodes, ...(id.startsWith('TRAN:') ? [id] : [])]) {
        if (!tcodes.has(t)) tcodes.set(t, { name: t.slice(5), text: g.info?.desc?.get(t) || '', usage: g.info?.usage?.get(t) || '' });
      }
      for (const p of [...im.progs, ...(PROGRAM_TYPES.has(id.split(':')[0]) ? [id] : [])]) {
        progs.add(p);
        if (g.info?.jobs?.has(p)) usageJobs.add(p.split(':')[1]);
      }
    }
    // `not-in-graph` only when the object's package is known and has a graph; an unknown package is `not-collected`
    const graph = found ? 'found' : cands.length && pkg && covered.has(pkg) ? 'not-in-graph' : 'not-collected';
    // one line per object: a program's REPS / REPT / DYNP parts, a class's methods … fold into their owner
    const owner = cands[0] && !CONTENT_TYPES.has(up(o.object)) ? cands[0] : '';
    const key = owner || `${up(o.object)} ${up(o.name)}`;
    const row = { pgmid: up(o.pgmid), object: up(o.object), name: owner ? owner.split(':')[1] : String(o.name ?? '').trim(), type: typeOf(o), package: pkg, graph };
    if (owner && o.pgmid === 'LIMU') row.object = owner.split(':')[0];
    const had = byKey.get(key);
    if (!had) byKey.set(key, row);
    else {
      if (had.pgmid !== 'R3TR' && row.pgmid === 'R3TR') Object.assign(had, { pgmid: 'R3TR', object: row.object });
      if (RANK[row.graph] > RANK[had.graph]) had.graph = row.graph;
      if (!had.package) had.package = row.package;
    }
  }
  const objects = [...byKey.values()];
  const status = !graphs.length || objects.every((x) => x.graph === 'not-collected') ? 'not-collected'
    : objects.some((x) => x.graph === 'not-collected') ? 'partial' : 'ok';
  return {
    objects,
    impact: {
      status,
      tcodes: [...tcodes.values()].sort((a, b) => a.name.localeCompare(b.name)),
      programs: [...progs].map((p) => p.split(':')[1]).sort(),
      usageJobs: [...usageJobs].sort(),
      missingPackages: [...new Set(objects.filter((x) => x.graph === 'not-collected').map((x) => x.package).filter(Boolean))].sort(),
    },
  };
}

/** Scheduled / released jobs (collect --cab) whose steps run an affected or changed program. null = not read. */
export function affectedJobs(jobsRead, programs) {
  if (!jobsRead || !jobsRead.ok) return null;
  const want = new Set(programs.map(up));
  const seen = new Map();
  for (const r of arr(jobsRead.rows)) if (want.has(up(r.program)) && !seen.has(`${r.job}|${r.program}`)) seen.set(`${r.job}|${r.program}`, { job: r.job, program: up(r.program), status: r.status || '' });
  return [...seen.values()].sort((a, b) => a.job.localeCompare(b.job));
}

/** Risk H / M / L with the reasons that set it (build spec P8 §1). */
export function riskOf(r) {
  const high = [], mid = [];
  const n = r.impact.tcodes.length;
  if (r.verdict === 'blocked') high.push({ code: 'blocked' });
  const ddic = r.objects.filter((o) => DDIC_DATA.has(o.type));
  if (ddic.length) high.push({ code: 'ddic', n: new Set(ddic.map((o) => o.name)).size });
  if (n >= MANY_TCODES) high.push({ code: 'tcodes-many', n });
  const direct = r.impact.tcodes.filter((t) => t.usage === 'direct').map((t) => t.name);
  if (direct.length) high.push({ code: 'direct-tcode', names: direct.slice(0, 5), n: direct.length });
  if (r.jobs?.length) high.push({ code: 'job', n: r.jobs.length });
  // a job list cut at the read limit may miss the jobs of this request's programs
  if (r.jobsTruncated && (r.impact.programs.length || r.objects.some((o) => PROGRAM_TYPES.has(o.type)))) high.push({ code: 'jobs-truncated' });
  if (r.verdict === 'check') mid.push({ code: 'check' });
  if (r.kind === 'customizing') mid.push({ code: 'customizing' });
  if (n > 0 && n < MANY_TCODES) mid.push({ code: 'tcodes-some', n });
  if (!r.evidence.length) mid.push({ code: 'no-evidence' });
  return high.length ? { level: 'H', reasons: [...high, ...mid] } : mid.length ? { level: 'M', reasons: mid } : { level: 'L', reasons: [] };
}

/**
 * Rollback facts. Always starts with `no-auto`. Target read → per object `prev-version` (VRSD, the request that
 * made the target's version) or `new-object` (not in the target). DDIC data objects add `ddic-data`, table
 * contents / customizing `customizing`. Target not read → `target-unread` and nothing that says it can be undone.
 */
export function rollbackOf(r, target) {
  const lines = [{ code: 'no-auto' }];
  const content = r.objects.filter((o) => CONTENT_TYPES.has(o.object));
  if (r.kind === 'customizing' || content.length) lines.push({ code: 'customizing', n: content.length });
  const ddic = [...new Set(r.objects.filter((o) => DDIC_DATA.has(o.type) && !CONTENT_TYPES.has(o.object)).map((o) => o.name))];
  for (const name of ddic.slice(0, 10)) lines.push({ code: 'ddic-data', obj: name });
  if (ddic.length > 10) lines.push({ code: 'more', n: ddic.length - 10 });
  if (!target || !target.ok) { lines.push({ code: 'target-unread' }); return lines; }
  const inTarget = new Set(arr(target.tadir).map((x) => `${up(x.object)} ${up(x.name)}`));
  const versions = arr(target.versions);
  const code = r.objects.filter((x) => !CONTENT_TYPES.has(x.object));
  for (const o of code.slice(0, 20)) {
    const v = versions.find((x) => up(x.objname) === up(o.name) || up(String(x.objname).split(/\s+/)[0]) === up(o.name));
    if (v?.korrnum && v.korrnum !== r.trkorr) lines.push({ code: 'prev-version', obj: `${o.object} ${o.name}`, korrnum: v.korrnum });
    else if (o.pgmid === 'R3TR' && !inTarget.has(`${o.object} ${up(o.name)}`)) lines.push({ code: 'new-object', obj: `${o.object} ${o.name}` });
  }
  if (code.length > 20) lines.push({ code: 'more', n: code.length - 20 });
  return lines;
}

/** The compact facts the writer gets for one request (≤ ~1000 chars): nothing else may appear in its text. */
export function writerInput(r) {
  const objs = r.objects.slice(0, 12).map((o) => `${o.type} ${o.name}${o.text ? ` (${o.text})` : ''}`);
  const input = {
    request: r.trkorr, kind: r.kind, title: r.text, objects: objs, objectCount: r.objects.length,
    tcodes: r.impact.tcodes.slice(0, 10).map((t) => `${t.name}${t.text ? ` ${t.text}` : ''}`), tcodeCount: r.impact.tcodes.length,
    jobs: (r.jobs || []).slice(0, 5).map((j) => j.job), impact: r.impact.status,
  };
  let s = JSON.stringify(input);
  while (s.length > 1000 && input.objects.length > 3) { input.objects.pop(); s = JSON.stringify(input); }
  while (s.length > 1000 && input.tcodes.length > 3) { input.tcodes.pop(); s = JSON.stringify(input); }
  return input;
}

/** The card model of every request: tr-model verdict, objects, impact, jobs, evidence, risk, rollback. */
export function buildCabModel(c, { graphs = [], evidenceOf = () => [], cabDate = '', descOf = new Map() } = {}) {
  const packageOf = new Map(arr(c.tadir?.rows).map((t) => [`${up(t.object)} ${up(t.name)}`, t.package]));
  const requests = arr(c.requests).map((req) => {
    const findings = findingsFor(req, c);
    const objs = objectsOf(c.objects, req.trkorr);
    const { objects, impact } = requestImpact(objs, graphs, packageOf);
    for (const o of objects) o.text = descOf.get(`${o.type}:${up(o.name)}`) || graphs.map((g) => g.info?.desc?.get(`${o.type}:${up(o.name)}`)).find(Boolean) || '';
    const programs = [...impact.programs, ...objects.filter((o) => o.type === 'PROG').map((o) => up(o.name))];
    const read = affectedJobs(c.jobs, programs);
    const jobs = read === null ? (impact.usageJobs.length ? impact.usageJobs.map((p) => ({ job: '', program: p, status: 'usage' })) : null)
      : [...read, ...impact.usageJobs.filter((p) => !read.some((j) => j.program === p)).map((p) => ({ job: '', program: p, status: 'usage' }))];
    const r = { trkorr: req.trkorr, kind: req.kind, status: req.status, owner: req.owner, text: req.text, verdict: verdictOf(findings),
      findings: findings.map((f) => f.kind), objects, impact, jobs, jobsRead: !!c.jobs?.ok, jobsTruncated: !!(c.jobs?.ok && c.jobs.truncated), jobsScope: impact.status === 'not-collected' ? 'own' : impact.status === 'partial' ? 'partial' : 'impact' };
    r.evidence = evidenceOf(r);
    r.risk = riskOf(r);
    r.rollback = rollbackOf(r, c.targetSystem);
    r.writer = writerInput(r);
    r.note = { text: '', source: '' };
    r.decision = '';
    r.comment = '';
    return r;
  });
  const count = (l) => requests.filter((r) => r.risk.level === l).length;
  return { schema: 1, system: c.system || '', target: c.target || '', readAt: c.readAt || '', cabDate,
    targetRead: !!c.targetSystem?.ok, requests, summary: { total: requests.length, H: count('H'), M: count('M'), L: count('L') } };
}

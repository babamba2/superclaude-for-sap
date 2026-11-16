// sc4sap:transport-readiness — the verdict on transport requests before they move on. Pure: no I/O.
//
// Input (collect.json, see build-tr-check.mjs collect):
//   { system, target, readAt,
//     requests:  [{ trkorr, kind, status, owner, date, text }],              — the requests checked
//     tasks:     [{ trkorr, parent, status, owner }],
//     objects:   [{ trkorr (request), pgmid, object, name }],                 — E071, tasks folded in
//     others:    { ok, rows: [{ trkorr, status, owner, object, name }] },     — the same objects in OTHER open requests
//     inactive:  { ok, scope: 'all' | 'own', rows: [{ object, name, user }] },
//     tadir:     { ok, rows: [{ object, name, package }] },
//     deps:      { ok, rows: [{ trkorr, object, name, needs: 'TABL ZX', in: 'K900123', status }] } }
//
// Findings per request, each with a severity:
//   block — open task, inactive object, object in a local package ($…), needs a DDIC object of an unreleased request
//   warn  — object also in another open request (order of import), released already, inactive list partial

const arr = (v) => (Array.isArray(v) ? v : []);
const up = (s) => String(s ?? '').trim().toUpperCase();
const key = (o, n) => `${up(o)} ${up(n)}`;

/** Objects whose version travels with the request (R3TR whole objects and LIMU parts). */
export function objectsOf(objects, trkorr) {
  return arr(objects).filter((o) => o.trkorr === trkorr && ['R3TR', 'LIMU'].includes(up(o.pgmid)));
}

export function findingsFor(req, c) {
  const out = [];
  const add = (level, kind, text, objects = []) => out.push({ level, kind, text, objects });
  if (req.status === 'released') add('warn', 'released', 'already released — re-check only the import order');

  const open = arr(c.tasks).filter((t) => t.parent === req.trkorr && t.status === 'open');
  if (open.length) add('block', 'open-task', `${open.length} task(s) not released`, open.map((t) => `${t.trkorr} (${t.owner || '?'})`));

  const objs = objectsOf(c.objects, req.trkorr);
  const mine = new Set(objs.map((o) => key(o.object, o.name)));

  const inactive = arr(c.inactive?.rows).filter((i) => mine.has(key(i.object, i.name)) || objs.some((o) => up(o.name) === up(i.name)));
  if (inactive.length) add('block', 'inactive', `${inactive.length} object(s) not activated`, inactive.map((i) => key(i.object, i.name)));
  if (c.inactive && !c.inactive.ok) add('warn', 'inactive-unread', 'inactive objects could not be read — check SE80 / Inactive objects');
  else if (c.inactive?.scope === 'own') add('warn', 'inactive-partial', 'inactive objects read for the connection user only');

  const local = arr(c.tadir?.rows).filter((t) => mine.has(key(t.object, t.name)) && String(t.package).startsWith('$'));
  if (local.length) add('block', 'local-package', `${local.length} object(s) in a local package`, local.map((t) => `${key(t.object, t.name)} (${t.package})`));

  const elsewhere = new Map();
  for (const r of arr(c.others?.rows)) {
    if (r.trkorr === req.trkorr || !mine.has(key(r.object, r.name))) continue;
    const k = key(r.object, r.name);
    elsewhere.set(k, [...(elsewhere.get(k) || []), `${r.trkorr} (${r.owner || '?'})`]);
  }
  if (elsewhere.size) {
    add('warn', 'other-request', `${elsewhere.size} object(s) also in another open request — import order matters`,
      [...elsewhere].map(([k, rs]) => `${k} ← ${[...new Set(rs)].join(', ')}`));
  }

  const deps = arr(c.deps?.rows).filter((d) => d.trkorr === req.trkorr);
  if (deps.length) add('block', 'dependency', `${deps.length} object(s) need DDIC objects of an unreleased request`, deps.map((d) => `${key(d.object, d.name)} → ${d.needs} in ${d.in}`));
  if (c.deps && !c.deps.ok) add('warn', 'dependency-unread', 'dependencies on other requests could not be checked');

  if (!objs.length && !open.length) add('warn', 'empty', 'no objects in the request or its tasks');
  return out;
}

/** `ready` (nothing), `check` (warnings only), `blocked` (any block). */
export const verdictOf = (findings) => (findings.some((f) => f.level === 'block') ? 'blocked' : findings.length ? 'check' : 'ready');

export function buildModel(c) {
  const requests = arr(c.requests).map((r) => {
    const findings = findingsFor(r, c);
    return { ...r, objects: objectsOf(c.objects, r.trkorr).length, findings, verdict: verdictOf(findings) };
  });
  const count = (v) => requests.filter((r) => r.verdict === v).length;
  return {
    system: c.system || '', target: c.target || '', readAt: c.readAt || '',
    requests, summary: { total: requests.length, ready: count('ready'), check: count('check'), blocked: count('blocked') },
  };
}

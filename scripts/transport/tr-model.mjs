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
//     deps:      { ok, rows: [{ trkorr, object, name, needs: 'TABL ZX', in: 'K900123', status }] },
//     targetSystem (optional, tr-target.mjs): { label, dest, ok, error, checked, truncated, vrsdOk, needsOk,
//       tadir: [{ object, name, package }],
//       versions: [{ objtype, objname, korrnum, date, inSource, sourceDate }],   — latest target version per part
//       needs: [{ trkorr, object, name, by, inTarget, releasedIn }] } }          — customer DDIC the code uses
//
// Findings per request, each with a severity:
//   block — open task, inactive object, object in a local package ($…), needs a DDIC object of an unreleased request
//   warn  — object also in another open request (order of import), released already, inactive list partial
// Target merge (with targetSystem):
//   block — target-diverged: the target's latest version came from a request the source does not know
//           (changed in the target directly or by another route — the import would overwrite it)
//   block — missing-in-target: a customer DDIC object the code uses is neither in the target, in this
//           request, nor in a released request (warn when only a released request holds it: import that first)
//   warn  — older-than-target: the target's latest version came from a later source request (roll-back)
//   warn  — target-unread: the destination did not answer — nothing is claimed about the target

const arr = (v) => (Array.isArray(v) ? v : []);
const up = (s) => String(s ?? '').trim().toUpperCase();
const key = (o, n) => `${up(o)} ${up(n)}`;

/** Objects whose version travels with the request (R3TR whole objects and LIMU parts). */
export function objectsOf(objects, trkorr) {
  return arr(objects).filter((o) => o.trkorr === trkorr && ['R3TR', 'LIMU'].includes(up(o.pgmid)));
}

export function findingsFor(req, c) {
  const out = [];
  // `text` is the English sentence; the page writes ko / ja from kind + n (+ target / dest / error)
  const add = (level, kind, text, objects = [], x = {}) => out.push({ level, kind, text, objects, ...x });
  if (req.status === 'released') add('warn', 'released', 'already released — re-check only the import order');

  const open = arr(c.tasks).filter((t) => t.parent === req.trkorr && t.status === 'open');
  if (open.length) add('block', 'open-task', `${open.length} task(s) not released`, open.map((t) => `${t.trkorr} (${t.owner || '?'})`), { n: open.length });

  const objs = objectsOf(c.objects, req.trkorr);
  const mine = new Set(objs.map((o) => key(o.object, o.name)));

  const inactive = arr(c.inactive?.rows).filter((i) => mine.has(key(i.object, i.name)) || objs.some((o) => up(o.name) === up(i.name)));
  if (inactive.length) add('block', 'inactive', `${inactive.length} object(s) not activated`, inactive.map((i) => key(i.object, i.name)), { n: inactive.length });
  if (c.inactive && !c.inactive.ok) add('warn', 'inactive-unread', 'inactive objects could not be read — check SE80 / Inactive objects');
  else if (c.inactive?.scope === 'own') add('warn', 'inactive-partial', 'inactive objects read for the connection user only');

  const local = arr(c.tadir?.rows).filter((t) => mine.has(key(t.object, t.name)) && String(t.package).startsWith('$'));
  if (local.length) add('block', 'local-package', `${local.length} object(s) in a local package`, local.map((t) => `${key(t.object, t.name)} (${t.package})`), { n: local.length });

  const elsewhere = new Map();
  for (const r of arr(c.others?.rows)) {
    if (r.trkorr === req.trkorr || !mine.has(key(r.object, r.name))) continue;
    const k = key(r.object, r.name);
    elsewhere.set(k, [...(elsewhere.get(k) || []), `${r.trkorr} (${r.owner || '?'})`]);
  }
  if (elsewhere.size) {
    add('warn', 'other-request', `${elsewhere.size} object(s) also in another open request — import order matters`,
      [...elsewhere].map(([k, rs]) => `${k} ← ${[...new Set(rs)].join(', ')}`), { n: elsewhere.size });
  }

  const deps = arr(c.deps?.rows).filter((d) => d.trkorr === req.trkorr);
  if (deps.length) add('block', 'dependency', `${deps.length} object(s) need DDIC objects of an unreleased request`, deps.map((d) => `${key(d.object, d.name)} → ${d.needs} in ${d.in}`), { n: deps.length });
  if (c.deps && !c.deps.ok) add('warn', 'dependency-unread', 'dependencies on other requests could not be checked');

  if (!objs.length && !open.length) add('warn', 'empty', 'no objects in the request or its tasks');
  if (c.targetSystem) targetFindings(req, objs, c.targetSystem, add);
  return out;
}

/** Target merge check of one request: what the import would do to the target system. */
export function targetMerge(req, objs, t) {
  const names = new Set(objs.map((o) => String(o.name ?? '').trimEnd()));
  const reqStamp = `${String(req.date ?? '').replace(/\D/g, '')}${String(req.time ?? '').replace(/\D/g, '')}`;
  const parts = arr(t.versions).filter((v) => names.has(v.objname) || names.has(String(v.objname).split(/\s+/)[0]));
  const diverged = parts.filter((v) => v.korrnum && v.korrnum !== req.trkorr && v.inSource === false);
  const older = parts.filter((v) => v.korrnum && v.korrnum !== req.trkorr && v.inSource && v.sourceDate && reqStamp && v.sourceDate.slice(0, reqStamp.length) > reqStamp);
  const needs = arr(t.needs).filter((n) => n.trkorr === req.trkorr && n.inTarget === false);
  const inTarget = new Set(arr(t.tadir).map((x) => key(x.object, x.name)));
  return {
    label: t.label || '', dest: t.dest || '', ok: !!t.ok, error: t.error || '',
    checked: new Set(objs.map((o) => key(o.object, o.name))).size, existing: new Set(objs.filter((o) => up(o.pgmid) === 'R3TR' && inTarget.has(key(o.object, o.name))).map((o) => key(o.object, o.name))).size,
    diverged: diverged.map((v) => `${v.objtype} ${v.objname} ← ${v.korrnum}${v.targetText ? ` "${v.targetText}"` : ''} (${v.date || '?'})`),
    older: older.map((v) => `${v.objtype} ${v.objname} ← ${v.korrnum}`),
    missing: needs.filter((n) => !n.releasedIn).map((n) => `${n.object} ${n.name} ← ${n.by}`),
    pending: needs.filter((n) => n.releasedIn).map((n) => `${n.object} ${n.name} → ${n.releasedIn}`),
  };
}

function targetFindings(req, objs, t, add) {
  if (!t.ok) { add('warn', 'target-unread', `target ${t.label || t.dest} could not be read through ${t.dest}${t.error ? ` — ${t.error}` : ''}`, [], { target: t.label || t.dest || '', dest: t.dest || '', error: t.error || '' }); return; }
  const m = targetMerge(req, objs, t);
  if (m.diverged.length) add('block', 'target-diverged', `${m.diverged.length} object(s) were changed in the target by a request the source does not know — the import would overwrite them`, m.diverged, { n: m.diverged.length });
  if (m.missing.length) add('block', 'missing-in-target', `${m.missing.length} customer DDIC object(s) the code uses are not in the target and not in a released request`, m.missing, { n: m.missing.length });
  if (m.pending.length) add('warn', 'missing-in-target', `${m.pending.length} customer DDIC object(s) the code uses reach the target only with another released request — import it first`, m.pending, { n: m.pending.length });
  if (m.older.length) add('warn', 'older-than-target', `${m.older.length} object(s) have a later version in the target — the import would roll it back`, m.older, { n: m.older.length });
  if (t.vrsdOk === false || t.needsOk === false || t.truncated) add('warn', 'target-partial', 'target merge check partial (version directory or used objects not fully read)');
}

/** `ready` (nothing), `check` (warnings only), `blocked` (any block). */
export const verdictOf = (findings) => (findings.some((f) => f.level === 'block') ? 'blocked' : findings.length ? 'check' : 'ready');

export function buildModel(c) {
  const requests = arr(c.requests).map((r) => {
    const findings = findingsFor(r, c);
    const objs = objectsOf(c.objects, r.trkorr);
    const merge = c.targetSystem ? targetMerge(r, objs, c.targetSystem) : null;
    return { ...r, objects: objs.length, findings, verdict: verdictOf(findings), ...(merge ? { merge } : {}) };
  });
  const count = (v) => requests.filter((r) => r.verdict === v).length;
  return {
    system: c.system || '', target: c.target || '', readAt: c.readAt || '',
    requests, summary: { total: requests.length, ready: count('ready'), check: count('check'), blocked: count('blocked') },
  };
}

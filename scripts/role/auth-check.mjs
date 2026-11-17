// sc4sap:role-matrix triage — pure authorization-check logic (no I/O, no SAP). Fed by auth-triage.mjs collect.
//
// Verdicts per failed check:
//   A missing            — no role of the user (valid today) gives the object / values
//   B held, not in effect — a role valid today gives them (profile not generated, user comparison not run, …)
//   C not valid today     — only a role whose assignment period excludes today gives them (period expired | future)
//   D unclear            — no object / values to check (message only) or a needed table could not be read
//
// PFCG semantics: a check is granted only when ONE authorization instance (AGR_NAME + OBJECT + AUTH) satisfies
// every checked field. Values spread over two instances do not add up.

export const arr = (v) => (Array.isArray(v) ? v : []);
export const VERDICTS = ['A', 'B', 'C', 'D'];
// DUMMY = the field is not checked. An empty needed value is a real check for "blank" (granted by `*` or the PFCG
// blank value ' ', stored as the three characters ' ' in AGR_1251).
const NOT_CHECKED = new Set(['DUMMY']);
const BLANK = "' '";
const sapDate = (s) => String(s || '').replace(/-/g, '');

/**
 * One granted value (AGR_1251 LOW / HIGH) against one needed value.
 * `*` all · LOW..HIGH range · trailing `*` prefix · nothing maintained = not granted · a blank needed value is granted
 * by `*` or the PFCG blank `' '` only · `$VAR` → org-level values (AGR_1252) of the role.
 * vars: Map<VARBL, [{ low, high }]> of that role.
 */
export function valueMatches(granted, needed, vars = new Map(), depth = 0) {
  const low = String(granted?.low ?? granted?.LOW ?? '').trim();
  const high = String(granted?.high ?? granted?.HIGH ?? '').trim();
  const want = String(needed ?? '').trim();
  if (!low) return false;
  if (!want) return low === '*' || low === BLANK;
  if (low.startsWith('$')) {
    if (depth > 2) return false;
    return arr(vars.get(low)).some((v) => valueMatches(v, want, vars, depth + 1));
  }
  if (low === '*') return true;
  if (high) {
    // interval; a trailing * on either end stands for every continuation (B* to DA*: B… up to DA…)
    const lo = low.endsWith('*') ? low.slice(0, -1) : low;
    if (want < lo) return false;
    if (high.endsWith('*')) { const hp = high.slice(0, -1); return want.slice(0, hp.length) <= hp; }
    return want <= high;
  }
  if (low.endsWith('*')) return want.startsWith(low.slice(0, -1));
  return low === want;
}

/** AGR_1252 rows → Map<role, Map<VARBL, [{ low, high }]>>. */
export function varsByRole(rows) {
  const out = new Map();
  for (const r of arr(rows)) {
    const m = out.get(r.AGR_NAME) || new Map();
    m.set(r.VARBL, [...(m.get(r.VARBL) || []), { low: r.LOW, high: r.HIGH }]);
    out.set(r.AGR_NAME, m);
  }
  return out;
}

/** AGR_1251 rows of one object → instances { role, auth, fields: Map<FIELD, [{low, high}]> } (DELETED rows dropped). */
export function instancesOf(rows, object) {
  const by = new Map();
  for (const r of arr(rows)) {
    if (r.OBJECT !== object || String(r.DELETED || '').trim()) continue;
    const k = `${r.AGR_NAME}|${r.AUTH}`;
    const x = by.get(k) || { role: r.AGR_NAME, auth: r.AUTH, fields: new Map() };
    x.fields.set(r.FIELD, [...(x.fields.get(r.FIELD) || []), { low: r.LOW, high: r.HIGH }]);
    by.set(k, x);
  }
  return [...by.values()];
}

/**
 * Does one instance among the rows grant the check? check: { object, fields: { FIELD: value } }.
 * Returns { granted, role, auth } or the nearest instance { granted:false, nearest:{ role, auth, gaps:[{field, wanted, held}] } }.
 */
export function instanceGrants(rows, check, varMap = new Map(), roles = null) {
  const want = Object.entries(check.fields || {}).filter(([, v]) => !NOT_CHECKED.has(String(v).trim().toUpperCase()));
  let best = null;
  for (const inst of instancesOf(rows, check.object)) {
    if (roles && !roles.has(inst.role)) continue;
    const vars = varMap.get(inst.role) || new Map();
    const gaps = [];
    let wild = 0;
    for (const [f, v] of want) {
      const held = inst.fields.get(f) || [];
      const hit = held.find((g) => valueMatches(g, v, vars));
      if (!hit) gaps.push({ field: f, wanted: String(v), held: held.map((g) => (g.high ? `${g.low}-${g.high}` : g.low)).filter(Boolean).join(', ') });
      else if (isWide(hit)) wild++;
    }
    if (!gaps.length) return { granted: true, role: inst.role, auth: inst.auth, wild };
    if (!best || gaps.length < best.gaps.length) best = { role: inst.role, auth: inst.auth, gaps };
  }
  return { granted: false, nearest: best };
}

/** A granted value wider than one value: `*`, a prefix pattern or a range. */
const isWide = (g) => { const l = String(g.low ?? '').trim(); return l === '*' || (l.endsWith('*') && !l.startsWith('$')) || !!String(g.high ?? '').trim(); };

/** AGR_USERS rows (+ AGR_AGRS composite children) → assignments [{ role, from, to, via, valid }]. */
export function assignmentsOf(users, agrs, today) {
  const t = sapDate(today);
  const kids = new Map();
  for (const a of arr(agrs)) kids.set(a.AGR_NAME, [...(kids.get(a.AGR_NAME) || []), a.CHILD_AGR]);
  const out = [];
  const add = (role, from, to, via) => {
    const f = sapDate(from), e = sapDate(to);
    const started = !f || f === '00000000' || f <= t;
    const valid = started && (!e || e === '00000000' || e >= t);
    out.push({ role, from: f, to: e, via, valid, period: valid ? 'valid' : started ? 'expired' : 'future' });
  };
  for (const u of arr(users)) {
    add(u.AGR_NAME, u.FROM_DAT, u.TO_DAT, '');
    for (const c of kids.get(u.AGR_NAME) || []) add(c, u.FROM_DAT, u.TO_DAT, u.AGR_NAME);
  }
  return out;
}

/** The checks a T-code start always runs: S_TCODE TCD = tcode, plus the TSTCA object of the T-code. */
export function startChecks(tcode, tstca) {
  const checks = [{ object: 'S_TCODE', fields: { TCD: tcode }, source: 'start' }];
  const by = new Map();
  // a TSTCA field without a value is not part of the start check
  for (const r of arr(tstca)) if (r.OBJCT) by.set(r.OBJCT, { ...(by.get(r.OBJCT) || {}), [r.FIELD]: String(r.VALUE ?? '').trim() || 'DUMMY' });
  for (const [object, fields] of by) checks.push({ object, fields, source: 'start' });
  return checks;
}

/** SU24 proposals (USOBT_C) of the T-code → checks, one per object, first proposed value per field. */
export function su24Checks(usobt) {
  const by = new Map();
  for (const r of arr(usobt)) {
    if (!r.OBJECT || r.OBJECT === 'S_TCODE') continue;
    const x = by.get(r.OBJECT) || {};
    if (!(r.FIELD in x) && r.LOW) x[r.FIELD] = r.LOW;
    by.set(r.OBJECT, x);
  }
  return [...by.entries()].map(([object, fields]) => ({ object, fields, source: 'su24' }));
}

/** One check → verdict with evidence. notRead names tables that could not be read — never a guessed "missing". */
export function classifyCheck(check, { auth, vars, assignments, notRead = [], partial = [] }) {
  const varMap = varsByRole(vars);
  const validRoles = new Set(assignments.filter((a) => a.valid).map((a) => a.role));
  const otherRoles = new Set(assignments.filter((a) => !a.valid).map((a) => a.role));
  const now = instanceGrants(auth, check, varMap, validRoles);
  if (now.granted) return { check, verdict: 'B', role: now.role, auth: now.auth };
  const old = instanceGrants(auth, check, varMap, otherRoles);
  if (old.granted) {
    const assignment = assignments.find((a) => a.role === old.role && !a.valid);
    return { check, verdict: 'C', role: old.role, auth: old.auth, assignment, period: assignment?.period || 'expired' };
  }
  const user = (t) => /^(AGR_USERS|AGR_1251|AGR_AGRS|AGR_1252)$/.test(t);
  if (notRead.some(user)) return { check, verdict: 'D', reason: 'notRead', nearest: now.nearest };
  if (partial.some(user)) return { check, verdict: 'D', reason: 'partial', nearest: now.nearest };
  return { check, verdict: 'A', nearest: now.nearest };
}

/**
 * The whole verdict. With checks from SU53 every check failed in SAP: held → B. Without them, the T-code start
 * checks are evaluated (they always run): a failing one is A / C; all passing → D with the SU24 objects not held
 * listed as an estimate.
 */
export function classify(c) {
  const assignments = assignmentsOf(c.users, c.agrs, c.today);
  const ctx = { auth: c.auth, vars: c.vars, assignments, notRead: arr(c.notRead), partial: arr(c.partial) };
  const given = arr(c.checks).filter((k) => k && k.object);
  if (given.length) {
    const results = given.map((k) => classifyCheck(k, ctx));
    return { mode: 'su53', assignments, results, verdict: overall(results), estimates: [] };
  }
  const start = startChecks(c.tcode, c.tstca).map((k) => classifyCheck(k, ctx));
  const failing = start.filter((r) => r.verdict !== 'B');
  if (failing.length) return { mode: 'start', assignments, results: failing, verdict: overall(failing), estimates: [] };
  const estimates = su24Checks(c.usobt).map((k) => classifyCheck(k, ctx)).filter((r) => r.verdict !== 'B');
  return { mode: 'estimate', assignments, results: [], verdict: 'D', reason: arr(c.notRead).length ? 'notRead' : arr(c.partial).length ? 'partial' : estimates.length ? 'noCheck' : 'startOk', estimates };
}

function overall(results) {
  for (const v of ['A', 'C', 'D', 'B']) if (results.some((r) => r.verdict === v)) return v;
  return 'D';
}

/**
 * Candidate roles for the checks that are missing (A, or C — a role valid today is still the better answer).
 * Rank: covers more missing checks > already gives the T-code > fewer wide values (`*`, `V*`, ranges) in the granting
 * authorizations > fewer T-codes (least privilege; a role whose T-codes were not read sorts after the rest) > name.
 * At most `max`; `total` = every role in the rows that fixes at least one check.
 */
export function candidates({ missing, rows, vars, roleTcodes = {}, tcode, held = [], max = 5 }) {
  const varMap = varsByRole(vars);
  const heldSet = new Set(held);
  const roles = [...new Set(arr(rows).map((r) => r.AGR_NAME))].filter((r) => !heldSet.has(r));
  const out = [];
  for (const role of roles) {
    const one = new Set([role]);
    const grants = missing.map((k) => ({ k, g: instanceGrants(rows, k, varMap, one) })).filter((x) => x.g.granted);
    if (!grants.length) continue;
    const covers = grants.map((x) => x.k.object);
    const wild = grants.reduce((n, x) => n + x.g.wild, 0);
    const tcs = role in roleTcodes ? arr(roleTcodes[role]) : null;
    const givesTcode = (tcs || []).includes(tcode) || instanceGrants(rows, { object: 'S_TCODE', fields: { TCD: tcode } }, varMap, one).granted;
    out.push({ role, covers, all: covers.length === missing.length, givesTcode, wild, tcodes: tcs ? tcs.length : null });
  }
  const tn = (x) => (x.tcodes == null ? Infinity : x.tcodes);
  out.sort((a, b) => b.covers.length - a.covers.length || Number(b.givesTcode) - Number(a.givesTcode) || a.wild - b.wild || tn(a) - tn(b) || (a.role < b.role ? -1 : 1));
  return { list: out.slice(0, max), total: out.length };
}

/** T-code level SoD: rules the candidate's T-codes would newly break for this user (already broken ones listed apart). */
export function sodImpact(userTcodes, candidateTcodes, library, lang = 'en') {
  const now = new Set(userTcodes), after = new Set([...userTcodes, ...candidateTcodes]);
  const both = (S, r) => r.tcodesA.some((t) => S.has(t)) && r.tcodesB.some((t) => S.has(t));
  const name = (x) => (typeof x === 'object' && x ? x[lang] || x.en || '' : String(x || ''));
  const existing = [], added = [];
  for (const r of arr(library)) {
    const row = { module: r.module, kind: name(r.kind), risk: name(r.risk), level: r.level,
      a: r.tcodesA.filter((t) => after.has(t)), b: r.tcodesB.filter((t) => after.has(t)) };
    if (both(now, r)) existing.push(row);
    else if (both(after, r)) added.push(row);
  }
  return { added, existing };
}

/** Prefixes of a T-code that an S_TCODE value can grant it with (VA02 → *, V*, VA*, VA0*, VA02). */
export function tcodeGrantValues(tcode) {
  const t = String(tcode);
  return ['*', ...[...t].map((_, i) => (i + 1 < t.length ? `${t.slice(0, i + 1)}*` : t))];
}

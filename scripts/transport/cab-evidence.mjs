// sc4sap:transport-readiness (cab mode) — test evidence per request and the writer-text lint. Pure: no I/O.
//
// Evidence sources (files the user hands over, read by build-cab-notes.mjs):
//   project dashboard (page or model JSON) — WRICEF items: request in `wricef.trs` (direct) or an object in
//     `wricef.objects` (objects) → the item's stage
//   UAT scenario set (page or set JSON) — issues that name the request (`issue.transports` / `issue.trkorr`,
//     the P9 link: direct) and steps whose T-code the request affects (heuristic — labelled as such on the page)
// The writer's business text may only name what its input holds: Z / Y / namespace names, T-codes and numbers
// that are not in the input are refused by lintNote.

const arr = (v) => (Array.isArray(v) ? v : []);
const up = (s) => String(s ?? '').trim().toUpperCase();

/** One evidence file → { kind: 'project', model } | { kind: 'uat', set } | null. HTML pages carry their model. */
export function parseEvidence(text) {
  const s = String(text ?? '');
  const embedded = (id) => {
    const m = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(s);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  };
  let j = embedded('project-model');
  if (j) return { kind: 'project', model: j.model || j };
  j = embedded('uat-model');
  if (j) return { kind: 'uat', set: j };
  try { j = JSON.parse(s); } catch { return null; }
  if (Array.isArray(j?.wbs)) return { kind: 'project', model: j };
  if (j?.model && Array.isArray(j.model.wbs)) return { kind: 'project', model: j.model };
  if (Array.isArray(j?.scenarios)) return { kind: 'uat', set: j };
  return null;
}

/** A UAT set id (uat-scenarios rule). Checked before an id becomes part of a path ("../x" never does). */
export const UAT_ID = /^[A-Za-z0-9_-]{1,30}$/;
/** UAT set ids a project dashboard names (`project.uatSets`: ids or { id }), as given — check with UAT_ID. */
export const uatSetsOf = (model) => arr(model?.project?.uatSets).map((x) => String(typeof x === 'string' ? x : x?.id || '').trim()).filter(Boolean);

const issueRequests = (i) => [...arr(i?.transports), i?.trkorr].map(up).filter(Boolean);

/** The latest cycle of a step that has a result, or null. */
function lastResult(set, step) {
  const cycles = arr(set.cycles).length ? set.cycles : Object.keys(step.results || {});
  for (const c of [...cycles].reverse()) if (step.results?.[c]) return { cycle: c, result: step.results[c] };
  return null;
}

/**
 * Evidence rows of one request card `r` ({ trkorr, objects: [{ name }], impact: { tcodes: [{ name }] } }).
 * Rows: { source: 'wricef' | 'issue' | 'uat', how: 'direct' | 'objects' | 'heuristic', ref, text, result? }.
 */
export function evidenceFor(r, sources) {
  const out = [];
  const names = new Set(arr(r.objects).map((o) => up(o.name).split(/\s+/)[0]));
  const tcodes = new Set([...arr(r.impact?.tcodes).map((t) => up(t.name)), ...arr(r.objects).filter((o) => o.type === 'TRAN').map((o) => up(o.name))]);
  for (const s of arr(sources)) {
    if (s.kind === 'project') {
      for (const w of arr(s.model?.wbs)) {
        if (!w.wricef) continue;
        const direct = arr(w.wricef.trs).map(up).includes(up(r.trkorr));
        const overlap = !direct && arr(w.wricef.objects).some((n) => names.has(up(n)));
        if (direct || overlap) out.push({ source: 'wricef', how: direct ? 'direct' : 'objects', ref: `${s.model?.project?.code || 'PROJECT'}/${w.id}`, text: w.label || '', result: w.wricef.stage || '' });
      }
    } else if (s.kind === 'uat') {
      const set = s.set || {};
      const sid = set.id || 'UAT';
      const linked = new Set();
      for (const i of arr(set.issues)) {
        if (!issueRequests(i).includes(up(r.trkorr))) continue;
        linked.add(`${i.scenario}/${i.step}`);
        const sc = arr(set.scenarios).find((x) => x.id === i.scenario);
        const st = arr(sc?.steps).find((x) => x.id === i.step);
        const last = st ? lastResult(set, st) : null;
        out.push({ source: 'issue', how: 'direct', ref: `${sid}/${i.id}`, text: i.text || '', result: last ? `${last.cycle} ${last.result}` : i.state || '' });
      }
      for (const sc of arr(set.scenarios)) for (const st of arr(sc.steps)) {
        if (!st.tcode || !tcodes.has(up(st.tcode)) || linked.has(`${sc.id}/${st.id}`)) continue;
        const last = lastResult(set, st);
        out.push({ source: 'uat', how: 'heuristic', ref: `${sid}/${sc.id}/${st.id}`, text: `${up(st.tcode)} ${st.activity || ''}`.trim(), result: last ? `${last.cycle} ${last.result}` : 'open' });
      }
    }
  }
  return out;
}

/** The writer's answer: blocks headed `@@ <request>` → Map request → text (2–3 sentences). */
export function parseWriter(text) {
  const out = new Map();
  let cur = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const h = /^@@\s*([A-Z0-9]{3}K[A-Z0-9]{6})\s*$/.exec(line.trim());
    if (h) { cur = h[1]; out.set(cur, []); continue; }
    if (cur && line.trim()) out.get(cur).push(line.trim());
  }
  return new Map([...out].map(([k, v]) => [k, v.join(' ')]));
}

// Customer names: upper case Z / Y words, plus any-case words with an underscore or a digit (zfoo_x, yrep1) —
// plain words such as "your" or "zero" are not names. Compared upper case.
const NAME_RE = /(?:\/[A-Za-z0-9]+\/[A-Za-z0-9_]+|\b[ZY][A-Z0-9_]{2,}\b|\b[zZyY][A-Za-z0-9]*[_\d][A-Za-z0-9_]*\b)/g;
const TCODE_RE = /\b[A-Z]{2,4}\d{1,3}[A-Z]?\b/g;
const NUMBER_RE = /(?<![A-Za-z0-9_./-])\d+(?:[.,]\d+)?(?![A-Za-z0-9_])/g;

/**
 * Refuse a business text that names what its input does not hold. `input` = the writer input of the request
 * (writerInput in cab-model.mjs). Returns { ok, problems: [{ kind: 'name' | 'tcode' | 'number', token }] }.
 */
export function lintNote(text, input) {
  const src = JSON.stringify(input ?? {});
  // whole tokens only: ZFOO is not "in the input" because ZFOO_NO is
  const tokens = new Set(up(src).match(/[A-Z0-9_/]+/g) || []);
  const numbers = new Set(src.match(NUMBER_RE) || []);
  const problems = [];
  const seen = new Set();
  const flag = (kind, token) => { const k = `${kind}:${token}`; if (!seen.has(k)) { seen.add(k); problems.push({ kind, token }); } };
  const t = String(text ?? '');
  for (const n of t.match(NAME_RE) || []) if (!tokens.has(n.toUpperCase())) flag('name', n);
  for (const c of t.match(TCODE_RE) || []) if (!tokens.has(c)) flag('tcode', c);
  for (const n of t.match(NUMBER_RE) || []) if (!numbers.has(n)) flag('number', n);
  if (!t.trim()) problems.push({ kind: 'empty', token: '' });
  return { ok: !problems.length, problems };
}

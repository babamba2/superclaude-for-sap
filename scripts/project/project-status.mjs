// sc4sap:project-dashboard — weekly status and Q-gate pack (pure functions, no I/O, no SAP).
//
//   readEvidence(text)            a UAT page / set JSON / UAT defect feed, an operations report page / model,
//                                 a CTS page (tr-summary) / model.json → a short summary, or { ok: false, reason }
//   statusEntry(view, ev, week)   one statusLog entry: overall and workstream RAG, every leaf's stage / status,
//                                 milestones, auto KPIs, evidence figures, open risks and decisions
//   logStatus(log, entry)         statusLog with the entry in (same week replaced, 26 weeks kept); a log whose last
//                                 week is later than the entry's → Error (an older dashboard page was uploaded)
//   delta(prev, cur, view)        what moved since the last status run ({ first: true } without one)
//   gateCheck(milestone, cur, v)  per criterion: rule, value, met (true / false / null), source; and a suggestion
//   suggestions(view, gate)       risks and decisions the PM may take into the lists (late, orphans, unmet gates)
//
// A criterion carries an optional rule tag at its end — "… [cts-blocked<=0]". Rules: cts-blocked<=N, tr-open<=N,
// uat-pass:<cycle>>=N (%), defects-open<=N, dumps-day<=N, wricef>=<stage>:N (% of WRICEF at that stage or later).
// No tag or an unknown one → manual (the PM judges). Suggestions never overwrite a value the PM set.

import { normalize as normalizeUat, progress } from '../uat/uat-model.mjs';
import { arr, days, STAGES } from './project-model.mjs';

export const LOG_WEEKS = 26;

/** Friday of the week of a date (Saturday / Sunday → the Friday before). */
export function weekEndOf(day) {
  const t = Date.parse(`${day}T00:00:00Z`), wd = new Date(t).getUTCDay();
  const shift = wd === 6 ? -1 : wd === 0 ? -2 : 5 - wd;
  return new Date(t + shift * 86400000).toISOString().slice(0, 10);
}

const embedded = (text, id) => {
  const m = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(String(text));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

function uatOf(raw) {
  const set = normalizeUat(raw), p = progress(set);
  const cycles = Object.fromEntries(Object.entries(p.byCycle).map(([c, x]) => [c, { ...x, passPct: pct(x.pass, x.pass + x.fail + x.blocked + x.open) }]));
  const defectsOpen = set.issues.filter((i) => i.type === 'defect' && ['open', 'waiting'].includes(i.state)).length;
  return { ok: true, kind: 'uat', id: set.id, cycles, defectsOpen, issues: p.issues };
}
function opsOf(m) {
  const n = days(m.from, m.to) + 1;
  return { ok: true, kind: 'ops', id: `${m.from}…${m.to}`, period: { from: m.from, to: m.to }, verdict: m.verdict,
    dumps: m.dumps?.ok ? m.dumps.total : null, dumpsDay: m.dumps?.ok && n > 0 ? Math.round((m.dumps.total / n) * 10) / 10 : null,
    groups: m.dumps?.groups?.length ?? null, jobs: m.jobs?.ok ? m.jobs.total : null, updates: m.updates?.ok ? m.updates.total : null, idocs: m.idocs?.ok ? m.idocs.total : null };
}
const ctsOf = (m) => ({ ok: true, kind: 'cts', id: m.readAt || '', system: m.system || '', target: m.target || '', summary: m.summary });

/** Summary of one evidence file's text. Never 0 or "none" for what could not be read. */
export function readEvidence(text) {
  let j = null;
  try { j = JSON.parse(text); } catch { /* a page */ }
  if (j && typeof j === 'object') {
    if (j.kind === 'uat-defect-feed') return { ok: true, kind: 'uat-defects', id: j.set || '', at: j.at || '', kpi: j.kpi || {} };
    if (Array.isArray(j.scenarios)) return uatOf(j);
    if (j.summary && Array.isArray(j.requests)) return ctsOf(j);
    if (j.dumps && j.verdict) return opsOf(j);
    return { ok: false, kind: 'unknown', reason: 'JSON is not a UAT set, a UAT defect feed, a CTS model or an operations model' };
  }
  const uat = embedded(text, 'uat-model');
  if (uat) return uatOf(uat);
  const ops = embedded(text, 'ops-model');
  if (ops) return opsOf(ops);
  const tr = embedded(text, 'tr-summary');
  if (tr) return ctsOf(tr);
  return { ok: false, kind: 'unknown', reason: 'no embedded model (uat-model, ops-model or tr-summary) — not a page this command reads' };
}

const stateOf = (r) => (r.type === 'wricef' ? r.wricef?.stage || 'req' : r.status);
const RAGS = ['red', 'amber', 'green'];
function wsRagOf(v) {
  const out = {};
  for (const [ws, c] of Object.entries(v.wsRag)) out[ws] = c.red ? 'red' : c.amber ? 'amber' : 'green';
  for (const [ws, r] of Object.entries(v.m.status?.wsRag || {})) if (RAGS.includes(r)) out[ws] = r;
  return out;
}

/** Compact figures of the evidence, kept in the log for next week's comparison. */
const evFigures = (e) => (!e.ok ? { kind: e.kind, ok: false }
  : e.kind === 'uat' ? { kind: 'uat', ok: true, id: e.id, pass: Object.fromEntries(Object.entries(e.cycles).map(([c, x]) => [c, x.passPct])), defectsOpen: e.defectsOpen }
    : e.kind === 'ops' ? { kind: 'ops', ok: true, id: e.id, dumps: e.dumps, dumpsDay: e.dumpsDay, verdict: e.verdict }
      : e.kind === 'cts' ? { kind: 'cts', ok: true, id: e.id, blocked: e.summary?.blocked ?? null, total: e.summary?.total ?? null }
        : { kind: e.kind, ok: true, id: e.id, kpi: e.kpi });

export function statusEntry(v, evidence, weekEnd) {
  const m = v.m;
  return {
    weekEnd, overall: RAGS.includes(m.status?.overall) ? m.status.overall : v.overall, computed: v.overall, ws: wsRagOf(v),
    items: Object.fromEntries(v.rows.filter((r) => r.leaf).map((r) => [r.id, [stateOf(r), r.pct, r.rag]])),
    ms: Object.fromEntries(v.milestones.map((x) => [x.id, x.status])),
    kpi: Object.fromEntries(v.kpis.filter((k) => k.actual != null).map((k) => [k.id, k.actual])),
    evidence: arr(evidence).map(evFigures),
    risks: m.risks.filter((r) => r.status !== 'closed').map((r) => r.id),
    decisions: m.decisions.filter((d) => d.status !== 'decided').map((d) => d.id),
    comment: m.status?.comment || '',
  };
}

/** statusLog with `entry` in. Throws on a log that is ahead of the entry (stale dashboard page). */
export function logStatus(log, entry, weeks = LOG_WEEKS) {
  const last = arr(log).map((x) => x.weekEnd).sort().at(-1);
  if (last && last > entry.weekEnd) throw new Error(`stale dashboard — its last status is week ${last}, later than the requested week ${entry.weekEnd}; upload the newest dashboard page`);
  const out = arr(log).filter((x) => x.weekEnd !== entry.weekEnd);
  out.push(entry);
  out.sort((a, b) => (a.weekEnd < b.weekEnd ? -1 : 1));
  return out.slice(-weeks);
}

/** The entry to compare with: the latest status run before this week. */
export const previousOf = (log, weekEnd) => arr(log).filter((x) => x.weekEnd < weekEnd).sort((a, b) => (a.weekEnd < b.weekEnd ? -1 : 1)).at(-1) || null;

export function delta(prev, cur, v) {
  const label = (id) => v.byId.get(id)?.label || v.milestones.find((x) => x.id === id)?.label || id;
  const kpi = (base) => Object.entries(cur.kpi).filter(([k]) => base?.[k] != null).map(([k, x]) => ({ id: k, from: base[k], to: x, diff: Math.round((x - base[k]) * 10) / 10 })).filter((x) => x.diff);
  if (!prev) {
    // no status run yet: KPI changes against the last snapshot at least 7 days old
    const snap = arr(v.m.snapshots).filter((s) => days(s.date, cur.weekEnd) >= 7).at(-1);
    return { first: true, since: snap?.date || null, kpi: snap ? kpi(snap.kpi) : [] };
  }
  const moved = [], done = [], late = [];
  for (const [id, [st, , rag]] of Object.entries(cur.items)) {
    const [pst, , prag] = prev.items[id] || [];
    const r = v.byId.get(id);
    if (r?.type === 'wricef' && pst && pst !== st) moved.push({ id, label: label(id), from: pst, to: st });
    if ((st === 'done') && pst && pst !== 'done') done.push({ id, label: label(id) });
    if (rag === 'red' && prag !== 'red') late.push({ id, label: label(id) });
  }
  const ms = Object.entries(cur.ms).filter(([id, s]) => prev.ms[id] && prev.ms[id] !== s).map(([id, s]) => ({ id, label: label(id), from: prev.ms[id], to: s }));
  const rel = { F: 0, D: 0 };
  for (const t of arr(v.m.actuals?.transports)) if (t.status === 'released' && t.date > prev.weekEnd && t.date <= cur.weekEnd && rel[t.side] != null) rel[t.side]++;
  const evDiff = cur.evidence.filter((e) => e.ok).map((e) => {
    const p = prev.evidence.find((x) => x.ok && x.kind === e.kind && x.id === e.id) || prev.evidence.find((x) => x.ok && x.kind === e.kind);
    if (!p) return { kind: e.kind, id: e.id, first: true };
    if (e.kind === 'uat') return { kind: 'uat', id: e.id, pass: Object.fromEntries(Object.entries(e.pass).map(([c, x]) => [c, { from: p.pass?.[c] ?? null, to: x }])), defectsOpen: { from: p.defectsOpen, to: e.defectsOpen } };
    if (e.kind === 'ops') return { kind: 'ops', id: e.id, dumpsDay: { from: p.dumpsDay, to: e.dumpsDay } };
    if (e.kind === 'cts') return { kind: 'cts', id: e.id, blocked: { from: p.blocked, to: e.blocked } };
    return { kind: e.kind, id: e.id, kpi: Object.fromEntries(Object.entries(e.kpi || {}).map(([k, x]) => [k, { from: p.kpi?.[k] ?? null, to: x }])) };
  });
  const added = (a, b) => a.filter((x) => !b.includes(x));
  return {
    first: false, since: prev.weekEnd, weeks: Math.round(days(prev.weekEnd, cur.weekEnd) / 7),
    overall: prev.overall !== cur.overall ? { from: prev.overall, to: cur.overall } : null,
    moved, done, late, ms, released: rel, kpi: kpi(prev.kpi), evidence: evDiff,
    risks: { added: added(cur.risks, prev.risks || []), closed: added(prev.risks || [], cur.risks) },
    decisions: { added: added(cur.decisions, prev.decisions || []), decided: added(prev.decisions || [], cur.decisions) },
  };
}

// [name<=N], [name:arg>=N] or [name>=arg:N] (wricef>=ut:60)
const RULE = /\[\s*([a-z-]+)(?::([^\]<>=]+))?\s*(<=|>=)\s*(?:([a-z]+):)?(\d+(?:\.\d+)?)\s*\]\s*$/i;
const sum = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) : null);

function ruleValue(name, arg, cur, v) {
  const ev = (k) => cur.evidence.filter((e) => e.ok && e.kind === k);
  switch (name) {
    case 'cts-blocked': return { value: sum(ev('cts').map((e) => e.blocked).filter((x) => x != null)), source: 'cts' };
    case 'tr-open': return { value: cur.kpi['tr-open'] ?? null, source: 'sap actuals' };
    case 'uat-pass': { const x = ev('uat').map((e) => e.pass?.[arg]).find((p) => p != null); return { value: x ?? null, source: 'uat' }; }
    case 'defects-open': {
      const feed = ev('uat-defects').map((e) => e.kpi?.['uat-defects-open']).filter((x) => x != null);
      return feed.length ? { value: sum(feed), source: 'uat defect feed' } : { value: sum(ev('uat').map((e) => e.defectsOpen)), source: 'uat' };
    }
    case 'dumps-day': { const x = ev('ops').map((e) => e.dumpsDay).find((p) => p != null); return x != null ? { value: x, source: 'ops' } : { value: cur.kpi['dumps-day'] ?? null, source: 'sap actuals' }; }
    case 'wricef': {
      const at = STAGES.indexOf(arg);
      const rows = v.rows.filter((r) => r.type === 'wricef');
      if (at < 0 || !rows.length) return { value: null, source: 'wbs' };
      return { value: pct(rows.filter((r) => STAGES.indexOf(r.wricef?.stage || 'req') >= at).length, rows.length), source: 'wbs' };
    }
    default: return null;
  }
}

/** Criteria of one gate with their figures, and a suggestion — the milestone's own status stays the PM's. */
export function gateCheck(ms, cur, v) {
  const rows = arr(ms?.criteria).map((c) => {
    const text = typeof c === 'string' ? c : c?.text || '';
    const m = RULE.exec(text);
    const rv = m ? ruleValue(m[1].toLowerCase(), (m[2] || m[4] || '').trim(), cur, v) : null;
    if (!m || !rv) return { text, rule: m ? m[0].trim() : '', value: null, met: null, source: 'manual' };
    const limit = Number(m[5]);
    const met = rv.value == null ? null : m[3] === '<=' ? rv.value <= limit : rv.value >= limit;
    return { text: text.replace(RULE, '').trim(), rule: m[0].trim().slice(1, -1), value: rv.value, met, source: rv.value == null ? 'no evidence' : rv.source };
  });
  const met = rows.filter((r) => r.met === true).length, unmet = rows.filter((r) => r.met === false).length, open = rows.length - met - unmet;
  const suggest = !met && !unmet ? 'manual' : unmet >= 2 || (unmet && !met) ? 'fail' : unmet || open ? 'conditional' : 'pass';
  return { id: ms.id, label: ms.label, date: ms.forecast || ms.base, status: ms.status, rows, met, unmet, manual: open, suggest };
}

/** Risks and decisions the PM may take into the lists — never written into the model by the command. */
export function suggestions(v, gate) {
  const risks = [];
  for (const r of v.late.slice(0, 5)) risks.push({ text: `${r.label} — finish ${r.finish} passed`, impact: r.type === 'wricef' || r.depth <= 1 ? 'H' : 'M', from: 'late' });
  if (v.orphans.length) risks.push({ text: `${v.orphans.length} open item(s) without an active owner`, impact: 'M', from: 'orphans' });
  for (const x of v.milestones.filter((m) => m.rag === 'red' && !m.actual)) risks.push({ text: `${x.label} at risk (${x.date})`, impact: 'H', from: 'milestone' });
  const decisions = gate && ['fail', 'conditional'].includes(gate.suggest)
    ? [{ text: `${gate.label}: decide pass with conditions, re-plan or hold (${gate.unmet} unmet, ${gate.manual} to judge)`, from: 'gate' }] : [];
  return { risks, decisions };
}

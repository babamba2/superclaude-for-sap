// sc4sap:uat-scenarios — check a scenario set against the connected SAP system, read-only.
//
// Three stages (skills/uat-scenarios/check.md):
//   1. plan    — a model lists, per step, the concrete values the step names (a T-code, company code 1000,
//                plant 1100, order type ZOR …) as targets; a value the step only describes ("a vendor with a
//                release strategy") is listed as vague, never turned into a guess.       → planPrompt / validatePlan
//   2. read    — every target is looked up by its key in a fixed table, one row at most, key columns only;
//                T-code usage from ST03N where the system has it. No model.             → runChecks (any reader)
//   3. judge   — a model gives each step OK / check / mismatch with its reason and may propose step changes;
//                the rule verdict from the reads is a floor the judge can never raise.  → judgePrompt / mergeJudge
// The result is kept on the set as `lastCheck` (applyCheck); the page shows a badge per step.
//
// Reader interface (CLI: sap-reader.mjs over the plugin's MCP client; web: the backend's direct client):
//   readIn(table, field, values, { fields, extra }) → { ok, rows, errors }
//   readTable(table, { where, fields, maxRows })     → { ok, rows, error }
//   tcodeUsage(tcodes, months)                       → { ok, used: { TCODE: boolean }, coverage } | null
// Pure apart from the reader: no file, no network, no SAP write.

/**
 * The reader interface over an MCP client: sap-reader.mjs's readIn / readTable (passed in, so this file imports
 * nothing that talks to SAP) and GetTcodeUsage (ST03N; ECC with the bridge FM — elsewhere it fails and usage
 * is simply not known).
 */
export function readerOver(client, { readIn, readTable }) {
  return {
    readIn: (table, field, values, o = {}) => readIn(client, table, field, values, o),
    readTable: (table, o = {}) => readTable(client, table, o),
    async tcodeUsage(tcodes, months) {
      const res = await client.callTool({ name: 'GetTcodeUsage', arguments: { tcodes, months } });
      if (res?.isError) return null;
      const data = JSON.parse(res?.content?.[0]?.text ?? '{}');
      const used = {};
      for (const x of arr(data.results ?? data.tcodes ?? [])) if (x?.tcode) used[str(x.tcode).toUpperCase()] = !!x.used;
      if (Array.isArray(data.used)) for (const t of tcodes) used[t] = data.used.map((x) => str(x).toUpperCase()).includes(t);
      return { ok: true, used, coverage: Number(data.coverage) || months };
    },
  };
}

/** What a step can name and where it is looked up. `pii`: never read (the PII blocklist covers the table). */
export const CHECK_KINDS = {
  tcode: { table: 'TSTC', keys: ['TCODE'], re: /^[A-Z0-9_/]{2,20}$/ },
  bukrs: { table: 'T001', keys: ['BUKRS'], re: /^[A-Z0-9]{1,4}$/ },
  werks: { table: 'T001W', keys: ['WERKS'], re: /^[A-Z0-9]{1,4}$/ },
  lgort: { table: 'T001L', keys: ['WERKS', 'LGORT'], re: /^[A-Z0-9]{1,4}$/ },
  vkorg: { table: 'TVKO', keys: ['VKORG'], re: /^[A-Z0-9]{1,4}$/ },
  vtweg: { table: 'TVTW', keys: ['VTWEG'], re: /^[A-Z0-9]{1,2}$/ },
  spart: { table: 'TSPA', keys: ['SPART'], re: /^[A-Z0-9]{1,2}$/ },
  salesArea: { table: 'TVTA', keys: ['VKORG', 'VTWEG', 'SPART'], re: /^[A-Z0-9]{1,4}$/ },
  ekorg: { table: 'T024E', keys: ['EKORG'], re: /^[A-Z0-9]{1,4}$/ },
  ekgrp: { table: 'T024', keys: ['EKGRP'], re: /^[A-Z0-9]{1,3}$/ },
  vstel: { table: 'TVST', keys: ['VSTEL'], re: /^[A-Z0-9]{1,4}$/ },
  matnr: { table: 'MARA', keys: ['MATNR'], re: /^[A-Z0-9_./-]{1,40}$/ },
  matnrPlant: { table: 'MARC', keys: ['MATNR', 'WERKS'], re: /^[A-Z0-9_./-]{1,40}$/ },
  auart: { table: 'TVAK', keys: ['AUART'], re: /^[A-Z0-9]{1,4}$/ },
  bsart: { table: 'T161', keys: ['BSART'], re: /^[A-Z0-9]{1,4}$/ },
  bwart: { table: 'T156', keys: ['BWART'], re: /^[A-Z0-9]{3}$/ },
  blart: { table: 'T003', keys: ['BLART'], re: /^[A-Z0-9]{2}$/ },
  lfart: { table: 'TVLK', keys: ['LFART'], re: /^[A-Z0-9]{1,4}$/ },
  fkart: { table: 'TVFK', keys: ['FKART'], re: /^[A-Z0-9]{1,4}$/ },
  kschl: { table: 'T685A', keys: ['KSCHL'], re: /^[A-Z0-9]{1,4}$/ },
  kunnr: { table: 'KNA1', keys: ['KUNNR'], re: /^[A-Z0-9]{1,10}$/, pii: true },
  lifnr: { table: 'LFA1', keys: ['LIFNR'], re: /^[A-Z0-9]{1,10}$/, pii: true },
};

export const MAX_TARGETS = 300;
export const VERDICTS = ['ok', 'check', 'mismatch'];
const RANK = { ok: 0, check: 1, mismatch: 2 };
const worst = (a, b) => (RANK[b] > RANK[a] ? b : a);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x) => (x == null ? '' : String(x)).trim();

/** A step's fingerprint (kept in uat-model.mjs, which the page inlines). */
export { stepFingerprint } from './uat-model.mjs';

/** A target's key as `KIND:F1=V1,F2=V2` — its id in the evidence. */
export const targetId = (t) => `${t.kind}:${Object.entries(t.key).map(([f, v]) => `${f}=${v}`).join(',')}`;

/**
 * The model's plan, checked against the set and the catalog: steps that exist, kinds that exist, every key field
 * present and well-formed. Returns { steps: [{ scenario, step, targets, vague }], dropped: [why…] } with at most
 * MAX_TARGETS targets in all.
 */
export function validatePlan(raw, set) {
  const dropped = [];
  const steps = [];
  let total = 0;
  for (const p of arr(raw?.steps)) {
    const sc = set.scenarios.find((s) => s.id === p?.scenario);
    const st = sc?.steps.find((x) => x.id === p?.step);
    if (!st) { dropped.push(`step ${str(p?.scenario)}/${str(p?.step)} not in the set`); continue; }
    const seen = new Set();
    const targets = [];
    for (const t of arr(p.targets)) {
      const def = CHECK_KINDS[t?.kind];
      if (!def) { dropped.push(`${sc.id}/${st.id}: unknown kind ${str(t?.kind).slice(0, 20)}`); continue; }
      const key = {};
      let ok = true;
      for (const f of def.keys) {
        const v = str(t?.key?.[f]).toUpperCase();
        const re = f === 'WERKS' || f === 'VKORG' || f === 'EKORG' ? /^[A-Z0-9]{1,4}$/ : f === 'VTWEG' || f === 'SPART' ? /^[A-Z0-9]{1,2}$/ : def.re;
        if (!re.test(v)) ok = false;
        key[f] = v;
      }
      if (!ok) { dropped.push(`${sc.id}/${st.id}: ${t.kind} key not well-formed`); continue; }
      const tg = { kind: t.kind, key };
      const id = targetId(tg);
      if (seen.has(id)) continue;
      if (total >= MAX_TARGETS) { dropped.push(`over ${MAX_TARGETS} targets: ${id}`); continue; }
      seen.add(id);
      targets.push(tg);
      total += 1;
    }
    // The step's own T-code is always checked, whatever the plan says.
    if (st.tcode && CHECK_KINDS.tcode.re.test(st.tcode) && !targets.some((t) => t.kind === 'tcode' && t.key.TCODE === st.tcode) && total < MAX_TARGETS) {
      targets.unshift({ kind: 'tcode', key: { TCODE: st.tcode } });
      total += 1;
    }
    steps.push({ scenario: sc.id, step: st.id, targets, vague: arr(p.vague).map(str).filter(Boolean).slice(0, 10).map((v) => v.slice(0, 200)) });
  }
  return { steps, dropped };
}

/** Material numbers: as written, and with the leading zeros of an internal number (18 on ECC, 40 on S/4). */
const matnrForms = (v) => (/^\d+$/.test(v) ? [...new Set([v, v.padStart(18, '0'), v.padStart(40, '0')])] : [v]);
const where = (key) => Object.entries(key).map(([f, v]) => `${f} = '${String(v).replace(/'/g, "''")}'`).join(' AND ');

/**
 * Every target looked up. Returns evidence: { [targetId]: { kind, key, table, where, found: true | false | null,
 * note, extra } } — found null when the table was not read (PII, error). Follow-ups: an order type's number
 * range (TVAK.NUMKI → NRIV RV_BELEG), a condition type's records valid today (KONH), T-code usage (ST03N).
 */
export async function runChecks(plan, reader, { months = 3, today = new Date().toISOString().slice(0, 10) } = {}) {
  const ev = {};
  const all = plan.steps.flatMap((s) => s.targets);
  const byKind = new Map();
  for (const t of all) {
    const id = targetId(t);
    if (ev[id]) continue;
    const def = CHECK_KINDS[t.kind];
    ev[id] = { kind: t.kind, key: t.key, table: def.table, where: where(t.key), found: null, note: '', extra: {} };
    if (def.pii) { ev[id].note = 'pii'; continue; }
    if (!byKind.has(t.kind)) byKind.set(t.kind, []);
    byKind.get(t.kind).push(t);
  }
  for (const [kind, targets] of byKind) {
    const def = CHECK_KINDS[kind];
    if (def.keys.length === 1) {
      const f = def.keys[0];
      const values = targets.flatMap((t) => (kind === 'matnr' ? matnrForms(t.key[f]) : [t.key[f]]));
      const fields = kind === 'auart' ? ['AUART', 'NUMKI'] : [f];
      const r = await reader.readIn(def.table, f, values, { fields });
      for (const t of targets) {
        const e = ev[targetId(t)];
        if (!r.ok && !arr(r.rows).length) { e.note = `read failed: ${str(arr(r.errors)[0] || r.error).slice(0, 120)}`; continue; }
        const forms = kind === 'matnr' ? matnrForms(t.key[f]) : [t.key[f]];
        const row = arr(r.rows).find((x) => forms.includes(str(x[f])));
        e.found = !!row;
        if (row && kind === 'auart') e.extra.numki = str(row.NUMKI);
      }
    } else {
      for (const t of targets) {
        const e = ev[targetId(t)];
        const key = kind === 'matnrPlant' && /^\d+$/.test(t.key.MATNR) ? null : t.key;
        const conds = key ? [where(key)] : matnrForms(t.key.MATNR).map((m) => where({ MATNR: m, WERKS: t.key.WERKS }));
        let found = false;
        let failed = '';
        for (const c of conds) {
          const r = await reader.readTable(def.table, { where: c, fields: def.keys, maxRows: 1 });
          if (!r.ok) { failed = str(r.error).slice(0, 120); continue; }
          if (arr(r.rows).length) { found = true; break; }
        }
        if (found || !failed) e.found = found;
        else e.note = `read failed: ${failed}`;
      }
    }
  }
  // Follow-ups on what was found.
  for (const e of Object.values(ev)) {
    if (e.kind === 'auart' && e.found && e.extra.numki) {
      const r = await reader.readTable('NRIV', { where: `OBJECT = 'RV_BELEG' AND NRRANGENR = '${e.extra.numki.replace(/'/g, "''")}'`, fields: ['OBJECT', 'NRRANGENR'], maxRows: 1 });
      e.extra.numberRange = r.ok ? arr(r.rows).length > 0 : null;
    }
    if (e.kind === 'kschl' && e.found) {
      const d = today.replace(/-/g, '');
      const r = await reader.readTable('KONH', { where: `KSCHL = '${e.key.KSCHL}' AND DATAB <= '${d}' AND DATBI >= '${d}'`, fields: ['KNUMH', 'KSCHL'], maxRows: 1 });
      e.extra.conditionRecord = r.ok ? arr(r.rows).length > 0 : null;
    }
  }
  const tcodes = Object.values(ev).filter((e) => e.kind === 'tcode' && e.found).map((e) => e.key.TCODE);
  if (tcodes.length && reader.tcodeUsage) {
    const u = await reader.tcodeUsage(tcodes, months).catch(() => null);
    for (const e of Object.values(ev)) {
      if (e.kind !== 'tcode' || !e.found) continue;
      e.extra.usage = u?.ok && u.used && e.key.TCODE in u.used ? { used: !!u.used[e.key.TCODE], months: Number(u.coverage) || months } : null;
    }
  }
  return ev;
}

/** The verdict the reads alone give a step, with its reasons (codes the page and the judge turn into words). */
export function ruleVerdict(planStep, ev) {
  let verdict = 'ok';
  const reasons = [];
  for (const t of planStep.targets) {
    const e = ev[targetId(t)];
    if (!e) continue;
    const id = targetId(t);
    if (e.found === false) { verdict = 'mismatch'; reasons.push({ code: 'not-found', target: id }); continue; }
    if (e.found === null) { verdict = worst(verdict, 'check'); reasons.push({ code: e.note === 'pii' ? 'pii' : 'unread', target: id }); continue; }
    if (e.extra.numberRange === false) { verdict = 'mismatch'; reasons.push({ code: 'no-number-range', target: id }); }
    if (e.extra.conditionRecord === false) { verdict = worst(verdict, 'check'); reasons.push({ code: 'no-condition-record', target: id }); }
    if (e.extra.usage && e.extra.usage.used === false) { verdict = worst(verdict, 'check'); reasons.push({ code: 'unused', target: id, months: e.extra.usage.months }); }
  }
  if (planStep.vague.length) { verdict = worst(verdict, 'check'); reasons.push({ code: 'vague', items: planStep.vague }); }
  if (!planStep.targets.length) { verdict = worst(verdict, 'check'); reasons.push({ code: 'nothing-to-check' }); }
  return { verdict, reasons };
}

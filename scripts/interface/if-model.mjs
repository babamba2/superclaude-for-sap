// interface-mapping-spec — the document model and the operations on it.
//
// model.json (one per interface and language, next to the pages):
// {
//   schema: 2, ifId, lang, version, created,
//   header:   { name, summary, detail, transfer, trigger, cycle, cycleCount, perRun, recordSize,
//               relation, targetLogic, author, writtenAt },
//   sap:      { side: 'source' | 'target' | 'both', system, readAt,
//               source: { object, kind, lines }, target: { … } }      — what --refresh reads again
//   request:  { source: Side, target: Side, groups: Group[], rows: Row[] }
//   response: null | { source: { object }, target: { object }, groups: Group[], rows: Row[] }
//   rules:    [{ id: 'R1', text, kind?, proposed? }], extract: [string], remarks, etc,
//   revisions:[{ seq, version, date, text, author, approver }]
// }
// Side  = { system, module, region, owner, adapter, object }
// Group = { id, s: Carrier, t: Carrier } — the unit the fields travel in, per side:
//         Carrier = { name, kind: PARAMETER | STRUCTURE | TABLE, card: 0:1 | 0:N | 1:1 | 1:N, ddic? }
//         (the side's Structure / occurrence in the header is the summary of its groups)
// Row   = { no, g, s: Cell, r, t: Cell, map, proposed?, sync?: 'added' | 'changed' | 'removed', was? }
// Cell  = { table (source DDIC table), field, key, type, size, nul, desc, ddic?, dom? }

import { proposeDbType, PRESETS, ruleKind, ruleText } from './if-codes.mjs';

export const emptyCell = () => ({ table: '', field: '', key: '', type: '', size: '', nul: '', desc: '' });
const ddicType = (c) => String(c?.ddic || '').split(' ')[0];
const ddicLen = (c) => String(c?.ddic || '').split(' · ')[0].split(' ')[1] || c?.size || '';

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function nextVersion(v, major = false) {
  const [a, b] = String(v || '0.0').split('.').map((n) => Number(n) || 0);
  return major ? `${a + 1}.0` : `${a}.${b + 1}`;
}

/** A01, A02 … (B… for the response); renumbering carries every MAPPING along. */
export function renumber(rows, prefix) {
  const map = new Map();
  rows.forEach((r, i) => {
    const no = prefix + String(i + 1).padStart(2, '0');
    if (r.no) map.set(String(r.no).toUpperCase(), no);
    r.no = no;
  });
  for (const r of rows) if (r.map && map.has(String(r.map).toUpperCase())) r.map = map.get(String(r.map).toUpperCase());
  return rows;
}

/** Rows kept together per group, in group order (stable); a row without a known group joins the first. Page-embedded. */
export function orderRows(b) {
  const gs = b.groups || [];
  const at = new Map(gs.map((g, i) => [g.id, i]));
  for (const r of b.rows) if (!at.has(r.g) && gs.length) r.g = gs[0].id;
  b.rows = b.rows.map((r, i) => [r, i]).sort((x, y) => (at.get(x[0].g) ?? 0) - (at.get(y[0].g) ?? 0) || x[1] - y[1]).map((x) => x[0]);
  return b;
}

/** Next free group id of a block. Page-embedded. */
export function newGroupId(b) {
  return 'g' + (Math.max(0, ...(b.groups || []).map((g) => Number(String(g.id).replace(/\D/g, '')) || 0)) + 1);
}

/** Default occurrence of a carrier kind. */
export const defaultCard = (kind, optional = false) => (kind === 'TABLE' ? (optional ? '0:N' : '1:N') : optional ? '0:1' : '1:1');

/** The non-SAP side proposed from a SAP cell (decision 12): same name, DB type, same key / null / text. */
export function proposeCell(c) {
  const { type, size } = proposeDbType(ddicType(c) || c.type, ddicLen(c));
  return { table: '', field: c.field, key: c.key, type, size, nul: c.nul, desc: c.desc };
}

const carrier = (name, kind, card, ddic) => ({ name: name || '', kind: kind || '', card: card || '', ...(ddic ? { ddic } : {}) });

/**
 * Groups and rows of one block from the SAP groups read for one or both sides.
 * SAP group = { name, kind, card, ddic, optional?, rows } (splitGroups of sap-fields.mjs).
 * dflt = { kind, card, source: { name }, target: { name } } fills what SAP does not say
 * (a field list has no carrier; the counterpart's carrier is named after its object).
 * One SAP side: the other side is proposed and mapped 1:1. Both: groups pair by position,
 * rows by field name.
 */
export function blockFromSap({ source = null, target = null }, prefix, dflt = {}) {
  const b = { groups: [], rows: [] };
  const sapSd = source && !target ? 's' : target && !source ? 't' : null;
  const fill = (G) => { const kind = G.kind || dflt.kind || G.fallback || 'TABLE'; return { kind, card: G.card || dflt.card || defaultCard(kind, G.optional) }; };
  if (sapSd) {
    const gs = sapSd === 's' ? source : target;
    const od = sapSd === 's' ? 't' : 's';
    const odName = (dflt[od === 's' ? 'source' : 'target'] || {}).name || '';
    const sdName = (dflt[sapSd === 's' ? 'source' : 'target'] || {}).name || '';
    for (const G of gs) {
      const { kind, card } = fill(G);
      const id = newGroupId(b);
      b.groups.push({ id, [sapSd]: carrier(G.name || (gs.length === 1 && kind !== 'PARAMETER' ? sdName : ''), kind, card, G.ddic), [od]: carrier(kind === 'PARAMETER' ? '' : gs.length === 1 ? odName : G.name, kind, card) });
      for (const c of G.rows) b.rows.push({ g: id, [sapSd]: { ...c }, r: '', [od]: proposeCell(c), map: '', proposed: true });
    }
  } else if (source || target) {
    const n = Math.max(source?.length || 0, target?.length || 0);
    for (let i = 0; i < n; i++) {
      const S = source?.[i];
      const T = target?.[i];
      const id = newGroupId(b);
      const fs = S ? fill(S) : null;
      const ft = T ? fill(T) : null;
      b.groups.push({ id, s: S ? carrier(S.name, fs.kind, fs.card, S.ddic) : carrier('', '', ''), t: T ? carrier(T.name, ft.kind, ft.card, T.ddic) : carrier('', '', '') });
      const rows = (S?.rows || []).map((c) => ({ g: id, s: { ...c }, r: '', t: emptyCell(), map: '' }));
      for (const c of T?.rows || []) {
        const hit = rows.find((r) => r.s.field === c.field && !r.t.field);
        if (hit) { hit.t = { ...c }; hit.proposed = true; } else rows.push({ g: id, s: emptyCell(), r: '', t: { ...c }, map: '' });
      }
      b.rows.push(...rows);
    }
  }
  if (!b.groups.length) {
    const kind = dflt.kind || 'TABLE';
    b.groups.push({ id: 'g1', s: carrier(dflt.source?.name, kind, dflt.card || defaultCard(kind)), t: carrier(dflt.target?.name, kind, dflt.card || defaultCard(kind)) });
  }
  renumber(b.rows, prefix);
  for (const r of b.rows) if (r.s.field && r.t.field) r.map = r.no;
  return b;
}

const RESPONSE_PROPOSAL = {
  ko: [['XSTAT', '1', '처리 결과 — S: 성공, E: 실패'], ['XMSGS', '100', '처리 메시지']],
  en: [['XSTAT', '1', 'Result — S: success, E: error'], ['XMSGS', '100', 'Message']],
};

/** Response block proposal for a synchronous interface without function-module exports. */
export function proposedResponse(lang) {
  const cells = (RESPONSE_PROPOSAL[lang] || RESPONSE_PROPOSAL.en).map(([field, size, desc]) => ({ table: '', field, key: 'N', type: 'VARCHAR2', size, nul: 'N', desc }));
  const rows = cells.map((c) => ({ g: 'g1', s: { ...c }, r: '', t: { ...c }, map: '', proposed: true }));
  renumber(rows, 'B');
  for (const r of rows) r.map = r.no;
  return { source: { object: '' }, target: { object: '' }, groups: [{ id: 'g1', s: carrier('', 'PARAMETER', '1:1'), t: carrier('', 'PARAMETER', '1:1') }], rows };
}

const emptySide = () => ({ system: '', module: '', region: '', owner: '', adapter: '', object: '' });

/**
 * A new model from the interview answers and the SAP read.
 * input = { ifId, lang, header, sides: { source, target }, sapSide, system, preset?,
 *           sap: { source?: SplitResult, target?: SplitResult }, objects: { source?, target? }, response?: bool }
 * SplitResult = splitGroups() of sap-fields.mjs ({ request: { groups }, response: { groups } | null }).
 */
export function newModel(input) {
  const preset = PRESETS[input.preset] || null;
  const { ifId, lang = 'ko', sides = {}, sap = {}, objects = {}, system = '' } = input;
  const sapSide = input.sapSide || preset?.sapSide || 'source';
  const header = { ...(preset?.header || {}), ...(input.header || {}) };
  const side = (k) => {
    const { structure, cardinality, ...rest } = sides[k] || {};
    return { ...emptySide(), ...(preset?.adapter?.[k] ? { adapter: preset.adapter[k] } : {}), ...rest };
  };
  const m = {
    schema: 2, ifId: String(ifId).trim(), lang, version: '0.1', created: today(), ...(input.preset ? { preset: input.preset } : {}),
    header: { name: '', summary: '', detail: '', transfer: '', trigger: '', cycle: '', cycleCount: '', perRun: '', recordSize: '', relation: '', targetLogic: '', author: '', writtenAt: today(), ...header },
    sap: { side: sapSide, system, readAt: new Date().toISOString(), source: objects.source || null, target: objects.target || null },
    request: { source: side('source'), target: side('target'), groups: [], rows: [] },
    response: null, rules: [], extract: [], remarks: '', etc: '', revisions: [],
  };
  for (const k of ['source', 'target']) m.request[k].object ||= objects[k]?.object || '';
  const given = sides.source?.structure || sides.target?.structure;
  const dflt = {
    kind: given || preset?.side?.structure || '', card: sides.source?.cardinality || sides.target?.cardinality || preset?.side?.cardinality || '',
    source: { name: m.request.source.object }, target: { name: m.request.target.object },
  };
  Object.assign(m.request, blockFromSap({ source: sap.source?.request?.groups, target: sap.target?.request?.groups }, 'A', dflt));
  const res = { source: sap.source?.response?.groups, target: sap.target?.response?.groups };
  if (res.source || res.target) {
    const objOf = (k) => (sap[k]?.response ? m.request[k].object : '');
    m.response = { source: { object: objOf('source') }, target: { object: objOf('target') }, ...blockFromSap(res, 'B', { source: { name: '' }, target: { name: '' } }) };
  } else if (input.response ?? (preset ? preset.response : header.transfer === 'SYNC')) m.response = proposedResponse(lang);
  proposeRules(m);
  m.revisions.push({ seq: 1, version: '0.1', date: today(), text: lang === 'ko' ? '최초 작성' : 'First version', author: header.author || '', approver: '' });
  return m;
}

/**
 * Conversion rules proposed from the SAP field types (decision 20): one rule
 * per kind (date, time, leading zeros, currency, quantity), linked from every
 * proposed row that needs it. Rules the user already has are reused by kind.
 */
export function proposeRules(m) {
  const sapSide = m.sap?.side;
  if (!sapSide || sapSide === 'both') return 0;
  const sd = sapSide === 'source' ? 's' : 't';
  const byKind = new Map((m.rules || []).filter((r) => r.kind).map((r) => [r.kind, r]));
  let added = 0;
  for (const [bk, out] of [['request', sapSide === 'source'], ['response', sapSide !== 'source']]) {
    for (const r of m[bk]?.rows || []) {
      if (!r.proposed || r.r) continue;
      const kind = ruleKind(r[sd], out);
      if (!kind) continue;
      let rule = byKind.get(kind);
      if (!rule) {
        const n = Math.max(0, ...(m.rules || []).map((x) => Number(String(x.id).replace(/\D/g, '')) || 0)) + 1;
        rule = { id: `R${n}`, text: ruleText(kind, m.lang), kind, proposed: true };
        (m.rules ||= []).push(rule);
        byKind.set(kind, rule);
        added++;
      }
      r.r = rule.id;
    }
  }
  return added;
}

const refOf = (c) => {
  const f = String(c.field || '').trim().toUpperCase();
  if (f.includes('-')) return f;
  return c.table ? `${String(c.table).trim().toUpperCase()}-${f}` : f;
};

/** SAP-side cells typed by hand (TABLE-FIELD or a data element) that DDIC has not filled yet. */
export function pendingRefs(m) {
  const sides = m.sap?.side === 'both' ? ['s', 't'] : [m.sap?.side === 'target' ? 't' : 's'];
  const out = new Set();
  for (const bk of ['request', 'response']) for (const r of m[bk]?.rows || []) for (const sd of sides) {
    const c = r[sd];
    if (c?.field && !c.ddic) out.add(refOf(c));
  }
  return [...out];
}

/**
 * Fill those cells from the DDIC rows read for them (resolveRefs of sap-fields.mjs):
 * type, size and the DDIC note; key, null and a description the user wrote stay.
 * An empty other side gets the usual proposal. Returns the number of cells filled.
 */
export function resolveModel(m, resolved) {
  const byRef = new Map((resolved || []).map((c) => [c.ref, c]));
  const sides = m.sap?.side === 'both' ? ['s', 't'] : [m.sap?.side === 'target' ? 't' : 's'];
  let n = 0;
  for (const bk of ['request', 'response']) for (const r of m[bk]?.rows || []) for (const sd of sides) {
    const c = r[sd];
    if (!c?.field || c.ddic) continue;
    const hit = byRef.get(refOf(c));
    if (!hit) continue;
    const { ref, ...cell } = hit;
    r[sd] = { ...cell, desc: c.desc || cell.desc, key: c.key || cell.key, nul: c.nul || cell.nul };
    n++;
    const o = sd === 's' ? 't' : 's';
    if (!sides.includes(o) && !r[o]?.field) { r[o] = proposeCell(r[sd]); r.map ||= r.no; r.proposed = true; }
  }
  proposeRules(m);
  return n;
}

// What SAP decides about a field. Key, null and description stay as the user left them.
const SAP_KEYS = ['type', 'size', 'ddic'];

/**
 * --refresh: the SAP side read again (decision 14). User content stays; SAP
 * cells are updated, new fields appended to their group (a new carrier becomes
 * a new group; a proposal when the other side is not SAP), fields gone from SAP
 * marked. Only cells that came from SAP (`ddic` set) are compared. A field
 * already marked removed is not counted again, so an unchanged system gives
 * all-zero counts. Fields of a field-list interface (kind FIELDS) match by
 * table and field alone, whatever group the user moved them to.
 * fresh = { source?: SplitResult & { kind }, target?: … }. Returns counts.
 */
export function refreshModel(m, fresh) {
  const counts = { added: 0, changed: 0, removed: 0 };
  const both = m.sap?.side === 'both';
  for (const [bk, prefix] of [['request', 'A'], ['response', 'B']]) {
    const sides = [['source', 's', 't'], ['target', 't', 's']].filter(([side]) => fresh[side]?.[bk]?.groups);
    if (!sides.length) continue;
    if (!m[bk]) m[bk] = { source: { object: '' }, target: { object: '' }, groups: [], rows: [] };
    const b = m[bk];
    b.groups ||= [];
    const wasRemoved = new Map();
    for (const r of b.rows) { if (r.sync) wasRemoved.set(r, r.sync); delete r.sync; delete r.was; }
    for (const [side, sd, other] of sides) {
      const byField = fresh[side].kind === 'FIELDS';
      const gName = (id) => (b.groups.find((g) => g.id === id)?.[sd]?.name || '').toUpperCase();
      const id = (gname, c) => `${byField ? '' : gname}|${c.table}|${c.field}`.toUpperCase();
      const freshById = new Map();
      for (const G of fresh[side][bk].groups) for (const c of G.rows) freshById.set(id(G.name, c), { c, G });
      const seen = new Set();
      for (const r of b.rows) {
        const c = r[sd];
        if (!c?.field || !c.ddic || r.sync === 'added') continue;
        const k = id(gName(r.g), c);
        const hit = freshById.get(k);
        if (!hit) { r.sync = 'removed'; if (wasRemoved.get(r) !== 'removed') counts.removed++; continue; }
        seen.add(k);
        const n = hit.c;
        const diff = SAP_KEYS.filter((x) => String(c[x] ?? '') !== String(n[x] ?? ''));
        if (diff.length) {
          r.was = Object.fromEntries(diff.map((x) => [x, c[x] ?? '']));
          r[sd] = { ...c, type: n.type, size: n.size, ddic: n.ddic, ...(n.dom ? { dom: n.dom } : {}) };
          r.sync = 'changed';
          counts.changed++;
        }
      }
      for (const [k, { c: n, G }] of freshById) {
        if (seen.has(k)) continue;
        let g = byField ? b.groups[0] : b.groups.find((x) => (x[sd]?.name || '').toUpperCase() === String(G.name || '').toUpperCase());
        if (!g) {
          const kind = G.kind || 'TABLE';
          const card = G.card || defaultCard(kind, G.optional);
          g = { id: newGroupId(b), [sd]: carrier(G.name, kind, card, G.ddic), [other]: both ? carrier('', '', '') : carrier(G.name, kind, card) };
          b.groups.push(g);
        }
        b.rows.push({ g: g.id, [sd]: { ...n }, r: '', [other]: both ? emptyCell() : proposeCell(n), map: '', sync: 'added', ...(both ? {} : { proposed: true }) });
        counts.added++;
      }
    }
    orderRows(b);
    renumber(b.rows, prefix);
    if (!both) for (const r of b.rows) if (r.sync === 'added' && !r.map) r.map = r.no;
  }
  proposeRules(m);
  return counts;
}

// ── English companion: the free texts out and back in ─────────────────────

const getAt = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
const setAt = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; };

/** Paths of every translatable text with its value (names, codes, SQL and objects stay). */
export function textsOf(m) {
  const paths = ['header.name', 'header.summary', 'header.detail', 'header.targetLogic', 'header.recordSize', 'remarks', 'etc'];
  for (const bk of ['request', 'response']) (m[bk]?.rows || []).forEach((r, i) => { for (const sd of ['s', 't']) paths.push(`${bk}.rows.${i}.${sd}.desc`); });
  (m.rules || []).forEach((_, i) => paths.push(`rules.${i}.text`));
  (m.revisions || []).forEach((_, i) => paths.push(`revisions.${i}.text`));
  const out = {};
  for (const p of paths) { const v = getAt(m, p); if (typeof v === 'string' && v.trim()) out[p] = v; }
  return out;
}

/** The companion model: a copy of `m` with the translated texts; paths it does not know are ignored. */
export function withTexts(m, lang, texts) {
  const c = structuredClone(m);
  c.lang = lang;
  c.companionOf = m.lang;
  for (const [p, v] of Object.entries(texts || {})) if (typeof v === 'string' && getAt(c, p) !== undefined) setAt(c, p, v);
  return c;
}

// config-to-document — keep the notes knowledge base system-independent.
//
// The KB (~/.sc4sap/kb/config/<M>/<lang>/<activity>.json) holds the general part of reviewed notes and is
// reused on other systems (and, scrubbed, as a shared seed). Nothing in it may describe one system:
//   · "this system" rows of a compare table, "this system" sentences anywhere      → removed
//   · the system id, organisational keys of a snapshot (company codes, plants,
//     sales / purchasing organisations, controlling areas …) and customer object
//     names (Z / Y names with "_" or a digit, customer codes from customer rows,
//     BAdI / CMOD implementation names)                                            → sentence / row removed
//   · other Z / Y-looking words (may be standard: ZTERM, ZLSCH …)                   → only counted as flags
//
//   node scripts/config/notes.mjs kb-scrub [--kb <dir>] [--snapshots <file,file>] [--decisions <file>] [--apply] [--default-sap-version ECC]
// --decisions: the reviewed flag decisions (readDecisions) — kept words stop being flagged, listed edits are applied.
// --default-sap-version stamps entries written before the version meta with the release they came from.
// --apply refuses a directory inside the read-only seed (SC4SAP_KB_SEED).
// Dry run by default: prints counts per field (removed rows / sentences, flags) and never a value.
// --apply writes the scrubbed entries back. Back the tree up first — this command does not.

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { atomicWriteFileSync } from '../lib/atomic-write.mjs';

const THIS_SYSTEM = /이\s*시스템|현\s*시스템|본\s*시스템|당\s*시스템|이\s*클라이언트|this\s+(?:system|client)|この\s*システム|当システム|本システム/i;
const ORG_FIELDS = ['BUKRS', 'WERKS', 'VKORG', 'EKORG', 'KOKRS', 'VSTEL', 'BWKEY', 'LGNUM', 'VKBUR', 'VKGRP', 'EKGRP', 'GSBER', 'LGORT', 'TPLST', 'IWERK', 'SWERK', 'PRCTR', 'FIKRS', 'RLDNR'];
const Z_STRONG = /\b[ZY][A-Z0-9]*[_0-9][A-Z0-9_]*\b/g;   // Z/Y name with "_" or a digit: a customer object
const Z_WEAK = /\b[ZY][A-Z][A-Z]{2,}\b/g;                // ZTERM, ZLSCH … may be standard: flag only

const isOrgKey = (v) => typeof v === 'string' && v.trim().length >= 3 && !/^0+\d{0,2}$/.test(v.trim()) && (/[A-Z]/i.test(v) || v.trim().length >= 4);

/** System facts to scrub, from one or more config snapshots. */
export function contextFromSnapshots(snaps) {
  const systems = new Set(), org = new Set(), custom = new Set();
  for (const snap of snaps) {
    if (snap?.meta?.system) systems.add(String(snap.meta.system).toUpperCase());
    for (const t of Object.values(snap?.tables || {})) {
      const keys = (t.fields || []).filter((f) => f.key).map((f) => f.name);
      for (const r of t.rows || []) {
        for (const f of ORG_FIELDS) if (keys.includes(f) && isOrgKey(r[f])) org.add(String(r[f]).trim());
        if (r._tr) for (const k of keys) { const v = String(r[k] ?? '').trim(); if (/^[ZY][A-Z0-9_]{2,}$/.test(v)) custom.add(v); }
      }
    }
    const walk = (x) => {
      if (typeof x === 'string') { if (/^[ZY][A-Z0-9_]{2,}$/.test(x)) custom.add(x); return; }
      if (x && typeof x === 'object') for (const v of Object.values(x)) walk(v);
    };
    walk(snap?.badiImpls); walk(snap?.cmod);
  }
  return scrubContext({ systems: [...systems], orgKeys: [...org], customNames: [...custom] });
}

// A numeric key that reads like an SAP release or a year (1511, 1909, 2023 …) is only flagged: generic text
// names releases and years far more often than a plant.
const RELEASE_LIKE = /^(1[5-9]\d\d|20[0-3]\d)$/;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
function tokenRe(list) {
  const l = [...new Set(list)].filter(Boolean).sort((a, b) => b.length - a.length);
  return l.length ? new RegExp(`(?<![A-Za-z0-9_])(?:${l.map(esc).join('|')})(?![A-Za-z0-9_])`) : null;
}

export function scrubContext({ systems = [], orgKeys = [], customNames = [] } = {}) {
  const strong = orgKeys.filter((k) => !RELEASE_LIKE.test(k)), weak = orgKeys.filter((k) => RELEASE_LIKE.test(k));
  return { system: tokenRe(systems), org: tokenRe(strong), orgWeak: tokenRe(weak), custom: tokenRe(customNames), counts: { systems: systems.length, orgKeys: orgKeys.length, customNames: customNames.length } };
}

/** Why a text is system-specific ('' = it is general). */
export function systemHit(text, ctx = {}) {
  const t = String(text || '');
  if (!t) return '';
  if (THIS_SYSTEM.test(t)) return 'thisSystem';
  if (ctx.system && ctx.system.test(t)) return 'systemId';
  if (ctx.org && ctx.org.test(t)) return 'orgKey';
  if (ctx.custom && ctx.custom.test(t)) return 'customName';
  Z_STRONG.lastIndex = 0;
  if (Z_STRONG.test(t)) return 'customName';
  return '';
}

const sentences = (t) => String(t).split(/(?<=[.!?。])\s+/).filter((s) => s.trim());

/** Text with every system-specific sentence removed; `removed` counts them. */
export function scrubText(text, ctx, tally) {
  if (!text) return text;
  const keep = [];
  let cut = 0;
  for (const s of sentences(text)) {
    const why = systemHit(s, ctx);
    if (why) { cut++; tally.sentences++; tally.why[why] = (tally.why[why] || 0) + 1; } else keep.push(s);
  }
  return cut ? keep.join(' ') : text;
}

let weakCtx = null;
function flagWeak(text, tally) {
  Z_WEAK.lastIndex = 0;
  const t = String(text || '');
  const keep = weakCtx?.keep;
  const left = (list) => list.filter((w) => !(keep && keep.has(w))).length;
  const org = weakCtx?.orgWeak ? t.match(new RegExp(weakCtx.orgWeak.source, 'g')) || [] : [];
  tally.flags += left(t.match(Z_WEAK) || []) + left(org);
}

/**
 * Reviewed decisions on the flagged words (local file, never committed): { keep: [word], edits: [{ file, find, replace }] }.
 * keep: standard names, releases, years — no longer flagged. edits: per KB file (path relative to the tree, "/"),
 * `find` replaced by `replace` in every text of the entry; `replace: null` drops each sentence holding `find`.
 */
export function readDecisions(json) {
  const d = json || {};
  return { keep: new Set((d.keep || []).map(String)), edits: (d.edits || []).filter((e) => e && e.file && e.find) };
}

const META_KEYS = new Set(['activity', 'module', 'lang', 'savedAt', 'sapVersion']);

function applyEdits(entry, edits, hit) {
  const edit = (s) => {
    let t = s;
    for (const e of edits) {
      if (!t.includes(e.find)) continue;
      hit.add(e);
      t = e.replace === null ? sentences(t).filter((x) => !x.includes(e.find)).join(' ') : t.split(e.find).join(e.replace);
    }
    return t;
  };
  const walk = (v) => {
    if (typeof v === 'string') return edit(v);
    if (Array.isArray(v)) return v.map(walk).filter((x) => typeof x !== 'string' || x.trim());
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  // metadata (activity id, module, language, dates, release) is never text to edit
  return Object.fromEntries(Object.entries(entry).map(([k, x]) => [k, META_KEYS.has(k) ? x : walk(x)]));
}

/** Any value of a field the scrubber has no rule for: every string at any depth (arrays, nested objects). */
function deepScrub(v, ctx, tally) {
  if (typeof v === 'string') return scrubText(v, ctx, tally);
  if (Array.isArray(v)) return v.map((x) => deepScrub(x, ctx, tally)).filter((x) => typeof x !== 'string' || x.trim());
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepScrub(x, ctx, tally)]));
  return v;
}

// fields of a note that describe one system: dropped from a KB entry
const SYSTEM_ONLY = ['impact', 'cautions', 'verdicts', 'verifiedAgainst', 'kbFlag', 'thisSystem', 'review', 'issues'];
// fields scrubbed field by field above, or metadata that is not text about a system
const HANDLED = new Set(['purpose', 'sapdoc', 'mix', 'compare', 'checklist', 'criteria', 'cases', 'sources', 'activity', 'module', 'lang', 'savedAt', 'sapVersion']);

const newTally = () => ({ rows: 0, sentences: 0, items: 0, flags: 0, why: {} });

/** The general part of one note / KB entry with everything system-specific taken out. */
export function scrubEntry(entry, ctx = {}) {
  weakCtx = ctx;
  const tally = {};
  const t = (k) => (tally[k] ??= newTally());
  const out = { ...entry };
  for (const k of ['purpose', 'sapdoc', 'mix']) if (typeof out[k] === 'string') { out[k] = scrubText(out[k], ctx, t(k)); flagWeak(out[k], t(k)); }
  if (Array.isArray(out.compare)) {
    // header row stays; a row naming this system or one of its keys goes; other cells are scrubbed
    out.compare = out.compare.filter((row, i) => {
      if (i === 0) return true;
      const why = systemHit(row[0], ctx) || systemHit(row.join(' '), ctx);
      if (why) { t('compare').rows++; t('compare').why[why] = (t('compare').why[why] || 0) + 1; return false; }
      row.forEach((c) => flagWeak(c, t('compare')));
      return true;
    });
    if (out.compare.length === 1) out.compare = [];
  }
  if (Array.isArray(out.checklist)) {
    out.checklist = out.checklist.map((c) => scrubText(c, ctx, t('checklist'))).filter((c) => c.trim());
    out.checklist.forEach((c) => flagWeak(c, t('checklist')));
  }
  if (out.criteria && typeof out.criteria === 'object') {
    const c = {};
    for (const [k, v] of Object.entries(out.criteria)) {
      const s = scrubText(v, ctx, t('criteria'));
      if (s.trim()) { c[k] = s; flagWeak(s, t('criteria')); } else t('criteria').items++;
    }
    out.criteria = c;
  }
  if (out.cases?.list) {
    out.cases = {
      title: scrubText(out.cases.title, ctx, t('cases')),
      // every text of a case (title, name, desc, when, any later field) and every flow step
      list: out.cases.list.map(({ thisSystem, svg, ...c }) => {
        const x = {};
        for (const [k, v] of Object.entries(c)) {
          if (typeof v === 'string') { x[k] = scrubText(v, ctx, t('cases')); flagWeak(x[k], t('cases')); }
          else if (Array.isArray(v) && v.every((s) => typeof s === 'string')) x[k] = v.filter((step) => { const why = systemHit(step, ctx); if (why) t('cases').items++; return !why; });
          else x[k] = deepScrub(v, ctx, t('cases'));
        }
        return x;
      }),
    };
  }
  if (Array.isArray(out.sources)) {
    out.sources = out.sources.map((s) => ({ ...s, title: scrubText(s.title, ctx, t('sources')), summary: scrubText(s.summary, ctx, t('sources')) }));
  }
  // system-only parts never belong in a KB entry; any other text field is scrubbed like the rest
  for (const k of SYSTEM_ONLY) if (k in out) { delete out[k]; t('systemOnly').items++; }
  for (const [k, v] of Object.entries(out)) {
    if (HANDLED.has(k)) continue;
    out[k] = deepScrub(v, ctx, t(k));
  }
  return { entry: out, tally };
}

/** Every KB entry under `dir` (activity JSON files; sources-*.json and _flags.json skipped). */
export function kbFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.json') && !/^sources-|^_/.test(f)) out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/** Scrub a KB tree: { files, changed, totals per field }. Writes only with apply. */
export function scrubTree(dir, ctx, { apply = false, defaultSapVersion = '', decisions = null } = {}) {
  const totals = {};
  let files = 0, changed = 0, versionSet = 0;
  const dec = decisions || { keep: new Set(), edits: [] };
  const hit = new Set();
  ctx = { ...ctx, keep: dec.keep };
  for (const f of kbFiles(dir)) {
    const raw = readFileSync(f, 'utf8');
    let entry;
    try { entry = JSON.parse(raw); } catch { continue; }
    files++;
    const rel = f.slice(dir.length + 1).replace(/\\/g, '/');
    const mine = dec.edits.filter((e) => e.file === rel);
    const { entry: out, tally } = scrubEntry(mine.length ? applyEdits(entry, mine, hit) : entry, ctx);
    // entries from before the version meta: the release they were written on (S/4 IMG differs from ECC)
    if (defaultSapVersion && !out.sapVersion) { out.sapVersion = defaultSapVersion; versionSet++; }
    for (const [k, v] of Object.entries(tally)) {
      const T = (totals[k] ??= newTally());
      T.rows += v.rows; T.sentences += v.sentences; T.items += v.items; T.flags += v.flags;
      for (const [w, n] of Object.entries(v.why)) T.why[w] = (T.why[w] || 0) + n;
    }
    const next = JSON.stringify(out, null, 1);
    if (next !== JSON.stringify(entry, null, 1)) {
      changed++;
      if (apply) atomicWriteFileSync(f, next);
    }
  }
  const edits = dec.edits.length ? { edits: { listed: dec.edits.length, applied: hit.size, notFound: dec.edits.length - hit.size }, keep: dec.keep.size } : {};
  return { dir, apply, files, changed, ...(defaultSapVersion ? { versionSet } : {}), ...edits, totals };
}

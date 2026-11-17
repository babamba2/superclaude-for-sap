#!/usr/bin/env node
// config-to-document — consultant notes (written by the module consultant agent,
// reviewed by a second agent) for the IMG activities of a snapshot.
//
//   node scripts/config/notes.mjs scopes --module MM [--size 12]
//        → activities and batches per scope (custom | values | all), reviewed ones left out
//   node scripts/config/notes.mjs batches --module MM [--scope custom|values|all] [--size 12] [--redo]
//        → notes/_in/bNNN.json per batch (activity context for the writer) + manifest on stdout
//   node scripts/config/notes.mjs batches --module FI --ids SIMG_CFMENUORFBOB28,SIMG_CFMENUORFBOBBH
//        → one new batch of exactly these activities, reviewed or not (after new data for them)
//   node scripts/config/notes.mjs save --module MM --batch b001 --kind draft|review|revised  < text
//        → notes/b001.<kind>.json (text in the marker format below, parsed and validated)
//   node scripts/config/notes.mjs terms --module MM
//        → terms/_in/tNNN.json: names without a document-language text (150 per batch);
//          save with --batch tNNN --kind draft|review, lines `tNNN-NNN = <translation>`
//   node scripts/config/notes.mjs status --module MM
//   node scripts/config/notes.mjs kb --module MM [--redo]
//        → general part of reviewed notes into ~/.sc4sap/kb/config (system rows / names scrubbed; flagged ones redone)
//   node scripts/config/notes.mjs kb-scrub [--kb <dir>] [--snapshots <a.json,b.json>] [--decisions <file>] [--apply] [--default-sap-version ECC]
//        → dry run: counts of system rows / sentences / flags in a KB tree; --apply writes (back it up first)
// Knowledge base lookup: own KB (~/.sc4sap/kb/config) first, then a read-only seed
// (SC4SAP_KB_SEED=<dir holding config/<M>/<lang>/…>). Seed entries carry no SAP documentation summary —
// the batch then hands the activity's own sapDoc to the writer.
//   node scripts/config/notes.mjs sources --module MM
//        → seeds the verified-source cache (notes-sources.mjs) from every reviewed batch
//   node scripts/config/notes.mjs rows --module MM --table T001W [--where WERKS=1000,LAND1=KR]
//        [--fields WERKS,NAME1] [--count-by BWKEY|F1+F2] [--limit 50]   |   rows --module MM --de MATNR
//        → one filtered look at a raw snapshot table, or a data element's F1 text and fixed values
//
// Marker format (draft / revised):        Marker format (review):
//   @@ <IMG activity id>                    @@ <IMG activity id>
//   ## purpose                              verdict: ok | fix
//   <one or two sentences>                  - <what is wrong, what the data says>
//   ## impact
//   - <bullet>            (also: ## cautions, ## refs)

import { readFileSync, existsSync, readdirSync, realpathSync } from 'fs';
import { join, resolve, dirname, basename, sep } from 'path';
import { fileURLToPath } from 'url';
import { resolveArtifactBase, sc4sapHome } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync, ensureDirSync } from '../lib/atomic-write.mjs';
import { buildModel } from './build-config-doc.mjs';
import { loadRules, runChecks, attachActivities } from './config-checks.mjs';
import { readSources, recordSources, sourceHints } from './notes-sources.mjs';
import { ALL_ROWS, sampleRows, profileView, customerTransports, queryRows, badiContext } from './notes-context.mjs';
import { contextFromSnapshots, scrubEntry, scrubTree, readDecisions } from './kb-scrub.mjs';
import { createHash } from 'crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function opts(argv) {
  const o = { cmd: argv[0], module: '', kbDir: '', snapshots: [], apply: false, scope: 'custom', size: 12, batch: '', kind: '', redo: false, file: '', ids: [], table: '', where: [], fields: [], countBy: '', limit: 50, de: '' };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--module') o.module = String(argv[++i]).toUpperCase();
    else if (a === '--scope') o.scope = argv[++i];
    else if (a === '--size') o.size = Math.max(1, Number(argv[++i]) || 12);
    else if (a === '--batch') o.batch = argv[++i];
    else if (a === '--kind') o.kind = argv[++i];
    else if (a === '--redo') o.redo = true;
    else if (a === '--file') o.file = argv[++i];
    else if (a === '--ids') o.ids = String(argv[++i]).split(',').map((x) => x.trim()).filter(Boolean);
    else if (a === '--table') o.table = String(argv[++i]);
    else if (a === '--where') o.where = String(argv[++i]).split(',').map((x) => x.trim()).filter(Boolean);
    else if (a === '--fields') o.fields = String(argv[++i]).split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
    else if (a === '--count-by') o.countBy = String(argv[++i]).toUpperCase();
    else if (a === '--limit') o.limit = Number(argv[++i]) || 50;
    else if (a === '--de') o.de = String(argv[++i]);
    else if (a === '--kb') o.kbDir = String(argv[++i]);
    else if (a === '--snapshots') o.snapshots = String(argv[++i]).split(',').map((x) => x.trim()).filter(Boolean);
    else if (a === '--apply') o.apply = true;
    else if (a === '--decisions') o.decisions = String(argv[++i]);
    else if (a === '--default-sap-version') o.defaultSapVersion = String(argv[++i]);
  }
  if (!o.module && o.cmd !== 'kb-scrub') throw new Error('--module is required');
  return o;
}

const dirOf = (module) => join(resolveArtifactBase(process.cwd()), 'config-docs', module);

// Sources of the reference panel: official SAP documentation only — SAP Help
// Portal, SAP Notes / KBAs, SAP Learning. Anything else is refused on save and
// dropped by the builder.
const OFFICIAL_HOSTS = ['help.sap.com', 'me.sap.com', 'launchpad.support.sap.com', 'userapps.support.sap.com', 'support.sap.com', 'learning.sap.com'];
export function isOfficialSource(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && OFFICIAL_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const bullet = (l) => l.replace(/^\s*[-*]\s+/, '').trim();
const kv = (l) => /^\s*([a-z0-9]+)\s*:\s*(.*)$/i.exec(l);

/** One activity's note: the notes card (purpose … refs) and the reference panel (sapdoc … sources). */
function parseNote(body) {
  const note = { purpose: '', impact: [], cautions: [], refs: [], sapdoc: '', cases: null, mix: '', compare: [], checklist: [], criteria: {}, sources: [], verdicts: [] };
  let sec = null;
  let kase = null;
  for (const raw of body.split('\n')) {
    const line = raw.trimEnd();
    const sub = /^###\s*case\b\s*(.*)$/i.exec(line);
    if (sub && sec === 'cases') { kase = { title: sub[1].trim(), flow: [], desc: '', when: '', thisSystem: '' }; note.cases.list.push(kase); continue; }
    const h = /^##\s*(\w+)\s*(.*)$/.exec(line);
    if (h) {
      sec = h[1].toLowerCase();
      kase = null;
      if (sec === 'cases') note.cases = { title: h[2].trim(), list: [] };
      continue;
    }
    if (!sec || !line.trim()) continue;
    if (sec === 'purpose' || sec === 'sapdoc' || sec === 'mix') note[sec] = `${note[sec]} ${line.trim()}`.trim();
    else if (['impact', 'cautions', 'refs', 'checklist'].includes(sec)) note[sec].push(bullet(line));
    else if (sec === 'cases' && kase) {
      const m = kv(line);
      if (m && m[1].toLowerCase() === 'flow') kase.flow = m[2].split('>').map((s) => s.trim()).filter(Boolean);
      else if (m && ['desc', 'when'].includes(m[1].toLowerCase())) kase[m[1].toLowerCase()] = m[2].trim();
      else if (m && m[1].toLowerCase() === 'this') kase.thisSystem = m[2].trim();
      else kase.desc = `${kase.desc} ${line.trim()}`.trim();
    } else if (sec === 'compare' && line.includes('|')) {
      const cells = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((s) => s.trim());
      if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) note.compare.push(cells);
    } else if (sec === 'criteria') {
      const m = kv(line);
      if (m) note.criteria[m[1].toLowerCase()] = m[2].trim();
    } else if (sec === 'verdicts') {
      // System-only notes (general part from the knowledge base): `CASE 2: yes — <evidence>`.
      const m = /^\s*-?\s*CASE\s*(\d+)\s*:\s*(.+)$/i.exec(line);
      if (m) note.verdicts.push({ n: Number(m[1]), value: m[2].trim() });
    } else if (sec === 'sources') {
      const [title = '', source = '', url = '', summary = ''] = bullet(line).split('|').map((s) => s.trim());
      if (title) note.sources.push({ title, source, url, summary });
    }
  }
  return note;
}

/** Parse the marker text; returns { items: {id: {...}}, errors: [] }. */
export function parseNotes(text, kind) {
  const items = {};
  const errors = [];
  for (const chunk of String(text).replace(/\r\n/g, '\n').split(/^@@\s*/m).slice(1)) {
    const [head, ...rest] = chunk.split('\n');
    const id = head.trim();
    if (!id) continue;
    const body = rest.join('\n');
    if (kind === 'review') {
      const verdict = /^verdict:\s*(ok|fix)\b/im.exec(body)?.[1]?.toLowerCase();
      if (!verdict) errors.push(`${id}: no "verdict: ok|fix" line`);
      // kbFlag: the general part from the knowledge base does not fit this system → the KB entry is redone
      const kbFlag = /^kbFlag:\s*(.+)$/im.exec(body)?.[1]?.trim() || '';
      items[id] = { verdict: verdict || 'fix', issues: body.split('\n').filter((l) => /^\s*-\s+/.test(l)).map((l) => l.replace(/^\s*-\s+/, '').trim()), ...(kbFlag ? { kbFlag } : {}) };
      continue;
    }
    items[id] = parseNote(body);
    if (!items[id].purpose) errors.push(`${id}: empty purpose`);
    for (const s of items[id].sources.filter((x) => !isOfficialSource(x.url))) errors.push(`${id}: source not official SAP documentation (${s.url || s.title}) — use help.sap.com, SAP Notes/KBAs or learning.sap.com`);
  }
  return { items, errors };
}

/** `rows`: one filtered look at a raw snapshot table (or a data element's F1 text and values). */
function rows(o) {
  const snap = JSON.parse(readFileSync(join(dirOf(o.module), 'snapshot.json'), 'utf8'));
  const where = Object.fromEntries(o.where.map((w) => w.split('=')).filter((p) => p.length === 2).map(([f, v]) => [f.trim().toUpperCase(), v]));
  const res = queryRows(snap, { table: o.table, where, fields: o.fields, countBy: o.countBy, limit: o.limit, de: o.de });
  process.stdout.write(JSON.stringify(res) + '\n');
}

function batches(o) {
  const dir = dirOf(o.module);
  const snap = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
  const lang = hashLang(snap);
  snap.__theme = undefined;
  const { views, acts } = buildModel(snap, lang, { drawScreens: false });
  const rules = loadRules(join(ROOT, 'configs', o.module, 'config-checks.json'));
  const checks = attachActivities(runChecks(snap, rules, (a) => (acts[a.id] ? acts[a.id].viewKeys.map((k) => ({ tables: [views[k].root] })) : []), lang), rules, acts)
    .filter((c) => c.items.length);
  const paths = {};
  const order = [];
  const walk = (nodes, path) => nodes.forEach((n) => (n.kind === 'activity' ? (paths[n.activity] = path, order.push(n.activity)) : walk(n.children || [], n.text ? [...path, n.text] : path)));
  walk(snap.tree, []);
  const SCOPES = { custom: ['custom'], values: ['custom', 'standard', 'empty'], all: null };
  // Activities that already have reviewed notes are skipped unless --redo — but not when their rows
  // changed since the note was verified (valueHash), nor when a reviewer flagged the KB part (kbFlag).
  const hashes = activityHashes({ views, acts });
  const hashOf = (id) => hashes[id];
  const notes = loadNotes(dir);
  const flags = kbFlags(o.module, lang);
  const newFlags = Object.entries(notes).filter(([id, n]) => n.kbFlag && !flags[id]);
  for (const [id, n] of newFlags) flags[id] = { reason: n.kbFlag, system: snap.meta.system || '', at: new Date().toISOString().slice(0, 10) };
  if (newFlags.length) writeFlags(o.module, lang, flags);
  const stale = (id, n) => acts[id] && n.verifiedAgainst?.valueHash && n.verifiedAgainst.valueHash !== hashOf(id);
  const done = new Set(Object.entries(notes).filter(([id, n]) => !o.redo && ['ok', 'revised'].includes(n.review) && !stale(id, n) && !(flags[id] && !n.cases?.list?.length)).map(([id]) => id));
  const pick = (scope) => [...new Set(order)].filter((id) => acts[id] && !done.has(id) && (!SCOPES[scope] || SCOPES[scope].includes(acts[id].status)));
  if (o.cmd === 'scopes') {
    const out = Object.fromEntries(Object.keys(SCOPES).map((s) => [s, { activities: pick(s).length, batches: Math.ceil(pick(s).length / o.size) }]));
    process.stdout.write(JSON.stringify({ size: o.size, alreadyReviewed: done.size, ...out }, null, 1) + '\n');
    return;
  }
  if (!(o.scope in SCOPES)) throw new Error('--scope custom | values | all');
  // Activities already in a batch input (written, under review or waiting) are not batched again.
  const batched = new Set(existsSync(join(dir, 'notes', '_in')) ? readdirSync(join(dir, 'notes', '_in')).filter((f) => /^b\d{3}\.json$/.test(f))
    .flatMap((f) => JSON.parse(readFileSync(join(dir, 'notes', '_in', f), 'utf8')).items.map((x) => x.id)) : []);
  const unknown = o.ids.filter((id) => !acts[id]);
  if (unknown.length) throw new Error(`unknown activities: ${unknown.join(', ')}`);
  const ids = o.ids.length ? [...new Set(o.ids)] : pick(o.scope).filter((id) => o.redo || !batched.has(id));
  // 1000 characters cut 40% of the IMG docs (PP: Heijunka missing from the TSPP0 doc); 6000 covers 99%.
  const docText = (id) => {
    const t = (snap.docs[acts[id].docuId]?.blocks || []).map((b) => b.text).join(' ');
    return t.length > 6000 ? `${t.slice(0, 6000)} … (cut; full text in snapshot.docs)` : t;
  };
  // Activities whose general part (purpose, SAP documentation, cases, criteria,
  // sources) is already in the knowledge base get only the system part written.
  const kb = (id) => (flags[id] ? null : kbRead(o.module, lang, id));
  const family = (v) => (/^s\/?4/i.test(String(v || '')) ? 'S4' : v ? 'ECC' : '');
  const kbVersionDiffers = (e) => family(e?.sapVersion) !== family(snap.meta.sapVersion);
  // Full items carry the sources earlier reviews accepted for the same activity or tables.
  const cache = readSources(o.module, lang);
  const inDir = join(dir, 'notes', '_in');
  ensureDirSync(inDir);
  const manifest = [];
  // New batches are numbered after every existing batch input, so no batch — written,
  // in progress or waiting — is ever overwritten.
  const first = Math.max(0, ...readdirSync(inDir).map((f) => Number(/^b(\d{3})\.json$/.exec(f)?.[1] || 0)));
  for (let i = 0; i < ids.length; i += o.size) {
    const name = `b${String(first + i / o.size + 1).padStart(3, '0')}`;
    const items = ids.slice(i, i + o.size).map((id) => {
      const a = acts[id];
      const known = kb(id) ? [] : sourceHints(cache, id, a.viewKeys.map((k) => views[k].root));
      return {
        id, path: paths[id], title: a.title, titleEn: a.titleEn, tcode: a.tcode, status: a.status,
        // Counts of a truncated read are partial; a view whose condition is not applied, or whose
        // subset field SM30 asks for, shows rows of every value (all countries, all applications).
        objects: a.viewKeys.map((k) => ({ key: k, title: views[k].title, table: views[k].root, rows: views[k].rows.length, customerRows: views[k].cust.length,
          ...(views[k].truncated ? { truncated: true } : {}), ...(views[k].conditionNotApplied ? { conditionNotApplied: views[k].conditionNotApplied } : {}), ...(views[k].subset ? { subset: views[k].subset } : {}),
          columns: views[k].cols.map((c) => `${c.label} [${c.name}]`),
          ...(views[k].rows.length <= ALL_ROWS ? { sampleIsAll: true } : {}),
          sample: sampleRows(views[k], snap.domains || {}),
          ...(profileView(views[k], snap.domains || {}) ? { profile: profileView(views[k], snap.domains || {}) } : {}),
          ...(customerTransports(views[k]) ? { customerTransports: customerTransports(views[k]) } : {}) })),
        checks: checks.filter((c) => c.activities.includes(id)).map((c) => ({ severity: c.severity, title: c.title, items: c.items.slice(0, 10) })),
        ...(a.badis ? { badis: a.badis, implementations: badiContext(snap, a.badis) } : {}),
        valueHash: hashOf(id),
        ...(kb(id)
          ? { mode: 'system', kb: { purpose: kb(id).purpose, cases: (kb(id).cases?.list || []).map((c, n) => `CASE ${n + 1}: ${c.title} — ${c.desc}`) },
            // the general part was written on another release (ECC vs S/4): the reviewer checks the cases against this one
            ...(kbVersionDiffers(kb(id)) ? { kbSapVersion: kb(id).sapVersion || 'unknown' } : {}),
            // a seed entry carries no SAP documentation summary: written from this system's documentation
            ...(kb(id).sapdoc ? {} : { sapDoc: docText(id) }) }
          : { mode: 'full', sapDoc: docText(id), ...(flags[id] ? { kbFlag: flags[id].reason } : {}), ...(known.length ? { knownSources: known } : {}) }),
      };
    });
    atomicWriteFileSync(join(inDir, `${name}.json`), JSON.stringify({ module: o.module, system: snap.meta.system, snapshotDate: snap.meta.extractedAt || '', lang, items }, null, 1));
    manifest.push({ batch: name, file: join(inDir, `${name}.json`), activities: items.length });
  }
  // system- vs full-mode counts: on another release (S/4 IMG ids differ) fewer activities find their KB part
  const modes = { system: 0, full: 0, kbSapVersionDiffers: 0, fromSeed: 0 };
  for (const id of ids) {
    const e = kb(id);
    if (!e) { modes.full++; continue; }
    modes.system++;
    if (kbVersionDiffers(e)) modes.kbSapVersionDiffers++;
    if (e.fromSeed) modes.fromSeed++;
  }
  process.stdout.write(JSON.stringify({ scope: o.scope, activities: ids.length, modes, batches: manifest }, null, 1) + '\n');
}

function saveTerms(o) {
  if (!['draft', 'review'].includes(o.kind)) throw new Error('term batches take --kind draft|review');
  const dir = join(dirOf(o.module), 'terms');
  const input = JSON.parse(readFileSync(join(dir, '_in', `${o.batch}.json`), 'utf8'));
  const known = new Set(input.items.map((x) => x.id));
  const items = parseTerms(readFileSync(o.file || 0, 'utf8'));
  const errors = Object.keys(items).filter((id) => !known.has(id)).map((id) => `${id}: not in batch ${o.batch}`);
  for (const id of Object.keys(items)) if (!known.has(id)) delete items[id];
  if (o.kind === 'draft') for (const id of known) if (!items[id]) errors.push(`${id}: missing`);
  atomicWriteFileSync(join(dir, `${o.batch}.${o.kind}.json`), JSON.stringify({ batch: o.batch, kind: o.kind, savedAt: new Date().toISOString(), items }, null, 1));
  process.stdout.write(JSON.stringify({ ok: errors.length === 0, saved: Object.keys(items).length, errors }) + '\n');
}

function save(o) {
  if (/^t\d{3}$/.test(o.batch)) return saveTerms(o);
  if (!/^b\d{3}$/.test(o.batch) || !['draft', 'review', 'revised'].includes(o.kind)) throw new Error('--batch bNNN and --kind draft|review|revised are required');
  const dir = join(dirOf(o.module), 'notes');
  const input = JSON.parse(readFileSync(join(dir, '_in', `${o.batch}.json`), 'utf8'));
  const known = new Set(input.items.map((x) => x.id));
  const parsed = parseNotes(readFileSync(o.file || 0, 'utf8'), o.kind);
  const { items } = parsed;
  // System-only items (general part in the knowledge base) need no purpose, but a verdict per KB case.
  const systemOnly = new Map(input.items.filter((x) => x.mode === 'system').map((x) => [x.id, x.kb.cases.length]));
  const errors = parsed.errors.filter((e) => !(systemOnly.has(e.split(':')[0]) && /empty purpose/.test(e)));
  if (o.kind !== 'review') {
    for (const [id, n] of systemOnly) if (items[id] && items[id].verdicts.length < n && !items[id].cases) errors.push(`${id}: needs a "## verdicts" line for each of its ${n} cases`);
  }
  for (const id of Object.keys(items)) if (!known.has(id)) { errors.push(`${id}: not in batch ${o.batch}`); delete items[id]; }
  if (o.kind !== 'revised') for (const id of known) if (!items[id]) errors.push(`${id}: missing`);
  // Revisions accumulate: a later follow-up revision replaces only the items it carries.
  const out = join(dir, `${o.batch}.${o.kind}.json`);
  const kept = o.kind === 'revised' && existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')).items : {};
  atomicWriteFileSync(out, JSON.stringify({ batch: o.batch, kind: o.kind, savedAt: new Date().toISOString(), items: { ...kept, ...items } }, null, 1));
  const fix = o.kind === 'review' ? Object.entries(items).filter(([, r]) => r.verdict === 'fix').map(([id]) => id) : [];
  // Sources of the notes the reviewer passed are verified for later batches.
  if (o.kind === 'review') acceptSources(o.module, input, dir, o.batch, new Set(Object.keys(items).filter((id) => items[id].verdict === 'ok')));
  process.stdout.write(JSON.stringify({ ok: errors.length === 0, saved: Object.keys(items).length, errors, ...(o.kind === 'review' ? { fix } : {}) }) + '\n');
}

function acceptSources(module, input, dir, batch, okIds) {
  const f = join(dir, `${batch}.draft.json`);
  if (!okIds.size || !existsSync(f)) return { added: 0 };
  const draft = JSON.parse(readFileSync(f, 'utf8')).items;
  const entries = input.items.filter((x) => okIds.has(x.id) && draft[x.id])
    .map((x) => ({ id: x.id, tables: x.objects.map((ob) => ob.table), sources: (draft[x.id].sources || []).filter((s) => isOfficialSource(s.url)) }));
  return recordSources(module, input.lang || 'ko', entries, `${batch} review`);
}

/** Seed the source cache from every batch already reviewed. */
function seedSources(o) {
  const dir = join(dirOf(o.module), 'notes');
  let added = 0, urls = 0;
  for (const b of readdirSync(join(dir, '_in')).filter((f) => /^b\d{3}\.json$/.test(f)).map((f) => f.slice(0, 4))) {
    if (!existsSync(join(dir, `${b}.review.json`))) continue;
    const review = JSON.parse(readFileSync(join(dir, `${b}.review.json`), 'utf8')).items;
    const input = JSON.parse(readFileSync(join(dir, '_in', `${b}.json`), 'utf8'));
    const r = acceptSources(o.module, input, dir, b, new Set(Object.keys(review).filter((id) => review[id].verdict === 'ok')));
    added += r.added || 0;
    urls = r.urls || urls;
  }
  process.stdout.write(JSON.stringify({ added, urls }) + '\n');
}

// ── terms: names SAP has no document-language text for (IMG folders, activity
// titles, field labels), translated by the consultant agent and corrected by the
// reviewer. Marker format: one line per term, `t0001 = <translation>`; the review
// lists corrections only: `t0001 = <corrected> | <reason>`.
const hasKo = (t) => /[가-힣]/.test(String(t || ''));

function termSources(snap) {
  const out = [];
  // Labels carry their data element and long text, so an abbreviation is not guessed.
  const add = (kind, en, ctx = {}) => { if (en && !hasKo(en) && /[A-Za-z]/.test(en)) out.push({ kind, en, ...ctx }); };
  const walk = (nodes) => nodes.forEach((n) => (n.kind === 'folder' ? (add('folder', n.text || n.textEn), walk(n.children || [])) : null));
  walk(snap.tree);
  for (const a of Object.values(snap.activities)) add('activity', a.title || a.titleEn);
  const used = new Set(Object.values(snap.tables).flatMap((t) => (t.fields || []).map((f) => f.rollname)));
  for (const [r, l] of Object.entries(snap.labels)) if (used.has(r)) add('label', l.m || l.s || l.l || l.h || l.d, { dataElement: r, longText: l.d || l.l || '' });
  const seen = new Set();
  return out.filter((x) => !seen.has(`${x.kind}|${x.en}`) && seen.add(`${x.kind}|${x.en}`));
}

function terms(o) {
  const dir = dirOf(o.module);
  const snap = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
  const known = loadTerms(dir);
  const todo = termSources(snap).filter((x) => !known[x.kind]?.[x.en]);
  const tdir = join(dir, 'terms', '_in');
  ensureDirSync(tdir);
  const first = Math.max(0, ...readdirSync(tdir).map((f) => Number(/^t(\d{3})\.json$/.exec(f)?.[1] || 0)));
  const size = 150;
  const manifest = [];
  for (let i = 0; i < todo.length; i += size) {
    const name = `t${String(first + i / size + 1).padStart(3, '0')}`;
    const items = todo.slice(i, i + size).map((x, j) => ({ id: `${name}-${String(j + 1).padStart(3, '0')}`, ...x }));
    atomicWriteFileSync(join(tdir, `${name}.json`), JSON.stringify({ module: o.module, lang: snap.meta.lang || 'ko', items }, null, 1));
    manifest.push({ batch: name, file: join(tdir, `${name}.json`), terms: items.length });
  }
  process.stdout.write(JSON.stringify({ terms: todo.length, batches: manifest }, null, 1) + '\n');
}

export function parseTerms(text) {
  const out = {};
  for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
    const m = /^\s*(t\d{3}-\d{3})\s*=\s*(.+?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].split('|')[0].trim();
  }
  return out;
}

/** { folder: {en: ko}, activity: {…}, label: {…} } — reviewer corrections win over drafts. */
export function loadTerms(dir) {
  const tdir = join(dir, 'terms');
  const out = { folder: {}, activity: {}, label: {} };
  if (!existsSync(join(tdir, '_in'))) return out;
  for (const f of readdirSync(join(tdir, '_in')).filter((x) => /^t\d{3}\.json$/.test(x))) {
    const b = f.slice(0, 4);
    const read = (k) => (existsSync(join(tdir, `${b}.${k}.json`)) ? JSON.parse(readFileSync(join(tdir, `${b}.${k}.json`), 'utf8')).items : {});
    const draft = read('draft'), review = read('review');
    for (const it of JSON.parse(readFileSync(join(tdir, '_in', f), 'utf8')).items) {
      const ko = review[it.id] || draft[it.id];
      if (ko) out[it.kind][it.en] = ko; // also terms kept in English, so they are not asked again
    }
  }
  return out;
}

// ── knowledge base: the system-independent part of reviewed notes, per module,
// language and IMG activity, under ~/.sc4sap/kb/config/ — reused by every later
// run and every other system, so only the system part is written again. Nothing
// system-specific may enter it (kb-scrub.mjs): no "this system" rows or sentences,
// no system id, organisational key or customer object name.
const GENERAL = ['purpose', 'sapdoc', 'mix', 'compare', 'checklist', 'criteria'];
const kbRoot = () => join(sc4sapHome(), 'kb', 'config');
const kbDir = (module, lang, root = kbRoot()) => join(root, module, lang);
const safeId = (id) => id.replace(/[^A-Za-z0-9_-]/g, '_');
const kbFile = (module, lang, id, root) => join(kbDir(module, lang, root), `${safeId(id)}.json`);
const readJson = (f) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch { return null; } };
/** The read-only seed (SC4SAP_KB_SEED): a directory holding config/<M>/<lang>/<activity>.json. */
const seedRoot = () => (process.env.SC4SAP_KB_SEED ? join(process.env.SC4SAP_KB_SEED, 'config') : '');
/** Own knowledge base only. */
export function kbReadOwn(module, lang, id) { return readJson(kbFile(module, lang, id)); }
/** Own knowledge base first, then the read-only seed (marked fromSeed). */
export function kbRead(module, lang, id) {
  const own = kbReadOwn(module, lang, id);
  if (own) return own;
  const root = seedRoot();
  const seed = root ? readJson(kbFile(module, lang, id, root)) : null;
  return seed ? { ...seed, fromSeed: true } : null;
}

/** KB entries a reviewer flagged as not fitting a system (kbFlag): redone as full notes. */
const flagsFile = (module, lang) => join(kbDir(module, lang), '_flags.json');
export function kbFlags(module, lang) { return readJson(flagsFile(module, lang)) || {}; }
function writeFlags(module, lang, flags) { ensureDirSync(ownKbPath(kbDir(module, lang))); atomicWriteFileSync(ownKbPath(flagsFile(module, lang)), JSON.stringify(flags, null, 1)); }

/** Every KB write goes through here: never into the read-only seed (SC4SAP_KB_SEED), whatever an entry's origin. */
export function ownKbPath(p) {
  if (!process.env.SC4SAP_KB_SEED) return p;
  // compare real locations: a junction or symlink from the own KB into the seed must not pass
  const seed = realLocation(process.env.SC4SAP_KB_SEED).toLowerCase();
  const t = realLocation(p).toLowerCase();
  const inside = t === seed || t.startsWith(`${seed}${sep}`) || t.startsWith(`${seed}/`);
  if (inside) throw new Error(`refusing to write into the read-only KB seed (${p})`);
  return p;
}

/** Real path of p; for a path that does not exist yet, the real path of its nearest existing parent + the rest. */
export function realLocation(p) {
  let cur = resolve(p);
  const rest = [];
  for (;;) {
    try { return join(realpathSync.native(cur), ...rest); } catch { /* not there yet */ }
    const up = dirname(cur);
    if (up === cur) return join(cur, ...rest);
    rest.unshift(basename(cur));
    cur = up;
  }
}

/** Hash of the rows behind one activity: a change re-queues its reviewed note. */
/** The language system rows are hashed in: the snapshot's own. Batches here and every page build (any language) agree on it. */
export const hashLang = (snap) => snap.meta.lang || 'ko';

/** Row hash per activity of a model built in hashLang(snap) — the value a review stores as verifiedAgainst.valueHash. */
export function activityHashes({ views, acts }) {
  return Object.fromEntries(Object.keys(acts).map((id) => [id, valueHash(acts[id].viewKeys.map((k) => views[k].rows))]));
}

export function valueHash(rowsList) {
  return createHash('sha1').update(JSON.stringify(rowsList)).digest('hex').slice(0, 16);
}

/** General part of one reviewed note: verdicts and everything system-specific left out. */
export function generalPart(note, ctx = {}) {
  const out = Object.fromEntries(GENERAL.map((k) => [k, note[k]]));
  out.cases = note.cases ? { title: note.cases.title, list: note.cases.list.map(({ thisSystem, svg, ...c }) => c) } : null;
  out.sources = (note.sources || []).filter((s) => isOfficialSource(s.url));
  return scrubEntry(out, ctx).entry;
}

/** Note + knowledge base: general fields filled from the KB, verdicts applied to its cases. */
export function withKb(note, entry) {
  if (!entry) return note;
  const out = { ...note };
  for (const k of GENERAL) if (!out[k] || (Array.isArray(out[k]) && !out[k].length) || (typeof out[k] === 'object' && !Array.isArray(out[k]) && !Object.keys(out[k]).length)) out[k] = entry[k];
  if (!out.sources?.length) out.sources = (entry.sources || []).map((s) => ({ ...s, fromKb: true }));
  if (!out.cases && entry.cases) {
    out.cases = { title: entry.cases.title, list: entry.cases.list.map((c, n) => ({ ...c, thisSystem: (note.verdicts || []).find((v) => v.n === n + 1)?.value || '' })) };
  }
  if (entry.fromSeed) out.kbFromSeed = true;
  return out;
}

function kbPromote(o) {
  const dir = dirOf(o.module);
  const snap = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
  const lang = snap.meta.lang || 'ko';
  const ctx = contextFromSnapshots([snap]);
  ensureDirSync(kbDir(o.module, lang));
  const flags = kbFlags(o.module, lang);
  let saved = 0, kept = 0, redone = 0;
  for (const [id, n] of Object.entries(loadNotes(dir))) {
    if (!['ok', 'revised'].includes(n.review) || !n.cases || n.fromKb) continue;
    const flagged = !!flags[id];
    if (!o.redo && !flagged && kbReadOwn(o.module, lang, id)) { kept++; continue; }
    atomicWriteFileSync(ownKbPath(kbFile(o.module, lang, id)), JSON.stringify({ activity: id, module: o.module, lang, savedAt: new Date().toISOString(), sapVersion: snap.meta.sapVersion || '', ...generalPart(n, ctx) }, null, 1));
    if (flagged) { delete flags[id]; redone++; }
    saved++;
  }
  if (redone) writeFlags(o.module, lang, flags);
  process.stdout.write(JSON.stringify({ kb: kbDir(o.module, lang), saved, kept, redone, flagsOpen: Object.keys(flags).length }) + '\n');
}

/** kb-scrub: dry run (counts) or --apply over a KB tree, with the system facts of the snapshots. */
function kbScrub(o) {
  const dir = o.kbDir || kbRoot();
  if (o.apply) ownKbPath(dir);
  let files = o.snapshots;
  if (!files.length) {
    const work = join(process.cwd(), '.sc4sap', 'work');
    const bases = [join(process.cwd(), '.sc4sap'), ...(existsSync(work) ? readdirSync(work).map((a) => join(work, a)) : [])];
    files = bases.flatMap((b) => {
      const cd = join(b, 'config-docs');
      return existsSync(cd) ? readdirSync(cd).map((m) => join(cd, m, 'snapshot.json')).filter((f) => existsSync(f)) : [];
    });
  }
  const ctx = contextFromSnapshots(files.map((f) => JSON.parse(readFileSync(f, 'utf8'))));
  const decisions = o.decisions ? readDecisions(JSON.parse(readFileSync(o.decisions, 'utf8'))) : null;
  const r = scrubTree(dir, ctx, { apply: o.apply, defaultSapVersion: o.defaultSapVersion, decisions });
  process.stdout.write(JSON.stringify({ ...r, snapshots: files.length, facts: ctx.counts }, null, 1) + '\n');
}

/** Merge drafts, reviews and revisions: { id: { ...note, review: 'ok'|'revised'|'open'|'none', issues } }. */
export function loadNotes(dir, { module = '', lang = 'ko' } = {}) {
  const ndir = join(dir, 'notes');
  if (!existsSync(ndir)) return {};
  const read = (f) => (existsSync(join(ndir, f)) ? JSON.parse(readFileSync(join(ndir, f), 'utf8')).items : {});
  const input = (b) => readJson(join(ndir, '_in', `${b}.json`)) || {};
  const out = {};
  for (const b of readdirSync(ndir).filter((f) => /^b\d{3}\.draft\.json$/.test(f)).map((f) => f.slice(0, 4))) {
    const draft = read(`${b}.draft.json`), review = read(`${b}.review.json`), revised = read(`${b}.revised.json`);
    const inp = input(b);
    const hashes = Object.fromEntries((inp.items || []).map((x) => [x.id, x.valueHash]));
    for (const [id, note] of Object.entries(draft)) {
      const r = review[id];
      const fixed = revised[id];
      const n = fixed || note;
      const m = module ? withKb(n, kbRead(module, lang, id)) : n;
      const state = fixed ? 'revised' : r ? (r.verdict === 'ok' ? 'ok' : 'open') : 'none';
      // a passed review verifies the system part against this snapshot's rows
      const verified = ['ok', 'revised'].includes(state) && hashes[id] ? { verifiedAgainst: { system: inp.system || '', snapshotDate: inp.snapshotDate || '', valueHash: hashes[id] } } : {};
      out[id] = { ...m, sources: (m.sources || []).filter((s) => isOfficialSource(s.url)), review: state, issues: fixed ? [] : r?.issues || [], ...verified, ...(r?.kbFlag ? { kbFlag: r.kbFlag } : {}) };
    }
  }
  return out;
}

function status(o) {
  const ndir = join(dirOf(o.module), 'notes');
  const ins = existsSync(join(ndir, '_in')) ? readdirSync(join(ndir, '_in')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, 4)) : [];
  const has = (b, k) => existsSync(join(ndir, `${b}.${k}.json`));
  process.stdout.write(JSON.stringify(ins.map((b) => ({ batch: b, draft: has(b, 'draft'), review: has(b, 'review'), revised: has(b, 'revised') })), null, 1) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = opts(process.argv.slice(2));
    const run = { batches, scopes: batches, terms, kb: kbPromote, 'kb-scrub': kbScrub, sources: seedSources, save, status, rows }[o.cmd];
    if (!run) throw new Error('command: scopes | batches | terms | kb | kb-scrub | sources | save | status | rows');
    run(o);
  } catch (e) {
    process.stderr.write(`[notes] ${e.message}\n`);
    process.exit(1);
  }
}

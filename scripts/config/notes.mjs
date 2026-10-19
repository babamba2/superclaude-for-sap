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
//   node scripts/config/notes.mjs sources --module MM
//        → seeds the verified-source cache (notes-sources.mjs) from every reviewed batch
//
// Marker format (draft / revised):        Marker format (review):
//   @@ <IMG activity id>                    @@ <IMG activity id>
//   ## purpose                              verdict: ok | fix
//   <one or two sentences>                  - <what is wrong, what the data says>
//   ## impact
//   - <bullet>            (also: ## cautions, ## refs)

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveArtifactBase, sc4sapHome } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync, ensureDirSync } from '../lib/atomic-write.mjs';
import { buildModel } from './build-config-doc.mjs';
import { loadRules, runChecks, attachActivities } from './config-checks.mjs';
import { readSources, recordSources, sourceHints } from './notes-sources.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTEXT_ROWS = 15;

function opts(argv) {
  const o = { cmd: argv[0], module: '', scope: 'custom', size: 12, batch: '', kind: '', redo: false, file: '', ids: [] };
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
  }
  if (!o.module) throw new Error('--module is required');
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
      items[id] = { verdict: verdict || 'fix', issues: body.split('\n').filter((l) => /^\s*-\s+/.test(l)).map((l) => l.replace(/^\s*-\s+/, '').trim()) };
      continue;
    }
    items[id] = parseNote(body);
    if (!items[id].purpose) errors.push(`${id}: empty purpose`);
    for (const s of items[id].sources.filter((x) => !isOfficialSource(x.url))) errors.push(`${id}: source not official SAP documentation (${s.url || s.title}) — use help.sap.com, SAP Notes/KBAs or learning.sap.com`);
  }
  return { items, errors };
}

// Sample rows for the writer: customer rows first, codes with their fixed-value text.
function rowsFor(v, domains) {
  const order = [...v.cust, ...v.rows.map((_, i) => i).filter((i) => !v.cust.includes(i))].slice(0, CONTEXT_ROWS);
  // Two columns may share a label (plant / plant name): name them by field then.
  const seen = v.cols.reduce((m, c) => m.set(c.label, (m.get(c.label) || 0) + 1), new Map());
  const names = v.cols.map((c) => (seen.get(c.label) > 1 ? `${c.label} [${c.name}]` : c.label));
  return order.map((i) => Object.fromEntries(v.cols.map((c, j) => {
    const x = v.rows[i][j];
    const tx = c.dom && domains[c.dom]?.[x];
    return [names[j], tx ? `${x} (${tx})` : x];
  }).filter(([, x]) => x !== '')));
}

function batches(o) {
  const dir = dirOf(o.module);
  const snap = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
  const lang = snap.meta.lang || 'ko';
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
  // Activities that already have reviewed notes are skipped unless --redo.
  const done = new Set(Object.entries(loadNotes(dir)).filter(([, n]) => !o.redo && ['ok', 'revised'].includes(n.review)).map(([id]) => id));
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
  const kb = (id) => kbRead(o.module, lang, id);
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
          columns: views[k].cols.map((c) => `${c.label} [${c.name}]`), sample: rowsFor(views[k], snap.domains || {}) })),
        checks: checks.filter((c) => c.activities.includes(id)).map((c) => ({ severity: c.severity, title: c.title, items: c.items.slice(0, 10) })),
        ...(kb(id)
          ? { mode: 'system', kb: { purpose: kb(id).purpose, cases: (kb(id).cases?.list || []).map((c, n) => `CASE ${n + 1}: ${c.title} — ${c.desc}`) } }
          : { mode: 'full', sapDoc: docText(id), ...(known.length ? { knownSources: known } : {}) }),
      };
    });
    atomicWriteFileSync(join(inDir, `${name}.json`), JSON.stringify({ module: o.module, system: snap.meta.system, lang, items }, null, 1));
    manifest.push({ batch: name, file: join(inDir, `${name}.json`), activities: items.length });
  }
  process.stdout.write(JSON.stringify({ scope: o.scope, activities: ids.length, batches: manifest }, null, 1) + '\n');
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
// run and every other system, so only the system part is written again.
const GENERAL = ['purpose', 'sapdoc', 'mix', 'compare', 'checklist', 'criteria'];
const kbDir = (module, lang) => join(sc4sapHome(), 'kb', 'config', module, lang);
const kbFile = (module, lang, id) => join(kbDir(module, lang), `${id.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
export function kbRead(module, lang, id) {
  const f = kbFile(module, lang, id);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

/** General part of one reviewed note (case verdicts are system-specific and left out). */
export function generalPart(note) {
  const out = Object.fromEntries(GENERAL.map((k) => [k, note[k]]));
  out.cases = note.cases ? { title: note.cases.title, list: note.cases.list.map(({ thisSystem, svg, ...c }) => c) } : null;
  out.sources = (note.sources || []).filter((s) => isOfficialSource(s.url));
  return out;
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
  return out;
}

function kbPromote(o) {
  const dir = dirOf(o.module);
  const lang = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8')).meta.lang || 'ko';
  ensureDirSync(kbDir(o.module, lang));
  let saved = 0, kept = 0;
  for (const [id, n] of Object.entries(loadNotes(dir))) {
    if (!['ok', 'revised'].includes(n.review) || !n.cases || n.fromKb) continue;
    if (!o.redo && kbRead(o.module, lang, id)) { kept++; continue; }
    atomicWriteFileSync(kbFile(o.module, lang, id), JSON.stringify({ activity: id, module: o.module, lang, savedAt: new Date().toISOString(), ...generalPart(n) }, null, 1));
    saved++;
  }
  process.stdout.write(JSON.stringify({ kb: kbDir(o.module, lang), saved, kept }) + '\n');
}

/** Merge drafts, reviews and revisions: { id: { ...note, review: 'ok'|'revised'|'open'|'none', issues } }. */
export function loadNotes(dir, { module = '', lang = 'ko' } = {}) {
  const ndir = join(dir, 'notes');
  if (!existsSync(ndir)) return {};
  const read = (f) => (existsSync(join(ndir, f)) ? JSON.parse(readFileSync(join(ndir, f), 'utf8')).items : {});
  const out = {};
  for (const b of readdirSync(ndir).filter((f) => /^b\d{3}\.draft\.json$/.test(f)).map((f) => f.slice(0, 4))) {
    const draft = read(`${b}.draft.json`), review = read(`${b}.review.json`), revised = read(`${b}.revised.json`);
    for (const [id, note] of Object.entries(draft)) {
      const r = review[id];
      const fixed = revised[id];
      const n = fixed || note;
      const m = module ? withKb(n, kbRead(module, lang, id)) : n;
      out[id] = { ...m, sources: (m.sources || []).filter((s) => isOfficialSource(s.url)), review: fixed ? 'revised' : r ? (r.verdict === 'ok' ? 'ok' : 'open') : 'none', issues: fixed ? [] : r?.issues || [] };
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
    const run = { batches, scopes: batches, terms, kb: kbPromote, sources: seedSources, save, status }[o.cmd];
    if (!run) throw new Error('command: scopes | batches | terms | kb | sources | save | status');
    run(o);
  } catch (e) {
    process.stderr.write(`[notes] ${e.message}\n`);
    process.exit(1);
  }
}

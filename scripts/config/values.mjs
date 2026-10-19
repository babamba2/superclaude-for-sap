#!/usr/bin/env node
// config-to-document — business meaning of each fixed value of a domain (BSTAR 1 / 2 / 3 …):
// written by the module consultant agent from SAP's value texts (document language and English)
// and F1 documentation, checked by a reviewer, kept in a knowledge base shared by every module
// and system (domains are not module-bound).
//
//   node scripts/config/values.mjs batches --module SD [--size 40]
//        → values/_in/vNNN.json: domains with two or more fixed values behind the columns that
//          show values and not yet in the knowledge base (texts, data elements, F1, row counts)
//   node scripts/config/values.mjs save --module SD --batch v001 --kind draft|review --file <file>
//        draft: one line per value `DOMAIN:VALUE = <meaning>` (blank value: `DOMAIN: = …`; with blanks: `DOMAIN:" 0" = …`)
//        review: corrections only, `DOMAIN:VALUE = <corrected meaning> | <reason>` (no lines = all ok)
//   node scripts/config/values.mjs status --module SD
//   node scripts/config/values.mjs kb --module SD
//        → reviewed meanings into ~/.sc4sap/kb/values/<lang>.json (every later run skips them)

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveArtifactBase, sc4sapHome } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync, ensureDirSync } from '../lib/atomic-write.mjs';
import { buildModel } from './build-config-doc.mjs';
import { f1Text } from './fields.mjs';

const VALUE_CAP = 60;

function opts(argv) {
  const o = { cmd: argv[0], module: '', size: 40, batch: '', kind: '', file: '' };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--module') o.module = String(argv[++i]).toUpperCase();
    else if (a === '--size') o.size = Math.max(1, Number(argv[++i]) || 40);
    else if (a === '--batch') o.batch = argv[++i];
    else if (a === '--kind') o.kind = argv[++i];
    else if (a === '--file') o.file = argv[++i];
  }
  if (!o.module) throw new Error('--module is required');
  return o;
}

const dirOf = (module) => join(resolveArtifactBase(process.cwd()), 'config-docs', module);
const kbFile = (lang) => join(sc4sapHome(), 'kb', 'values', `${lang}.json`);
export const kbValues = (lang) => (existsSync(kbFile(lang)) ? JSON.parse(readFileSync(kbFile(lang), 'utf8')) : {});
const batchIds = (vdir) => (existsSync(join(vdir, '_in')) ? readdirSync(join(vdir, '_in')).filter((f) => /^v\d{3}\.json$/.test(f)).map((f) => f.slice(0, 4)) : []);
const readItems = (f) => JSON.parse(readFileSync(f, 'utf8')).items;

/** Reviewed value meanings of this run (review corrections over drafts), over the knowledge base: { DOMAIN: { VALUE: meaning } }. */
export function loadValueMeanings(dir, lang) {
  const out = Object.fromEntries(Object.entries(kbValues(lang)).map(([d, e]) => [d, { ...e.meanings }]));
  const vdir = join(dir, 'values');
  for (const b of batchIds(vdir)) {
    if (!existsSync(join(vdir, `${b}.review.json`)) || !existsSync(join(vdir, `${b}.draft.json`))) continue;
    const draft = readItems(join(vdir, `${b}.draft.json`)), review = readItems(join(vdir, `${b}.review.json`));
    for (const [d, vals] of Object.entries(draft)) out[d] = { ...out[d], ...vals, ...(review[d] || {}) };
  }
  return out;
}

export function parseValues(text) {
  const out = {};
  for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
    // A value with blanks is written in double quotes: `VCTCENTRY:" 0" = …`.
    const m = /^\s*([A-Z0-9_/]+):("([^"]*)"|\S*)\s*=\s*(.+?)\s*$/.exec(line);
    if (m) (out[m[1]] ??= {})[m[3] ?? m[2]] = m[4].split(' | ')[0].trim();
  }
  return out;
}

// A flag domain (X / blank) says what its label says; its values need no meaning.
const isFlag = (vals) => vals.every((v) => v === '' || v === 'X');

function batches(o) {
  const dir = dirOf(o.module);
  const snap = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
  const lang = snap.meta.lang || 'ko';
  if (!snap.domainsEn && lang !== 'en') throw new Error('snapshot has no English domain texts (domainsEn): extract again first');
  const { views } = buildModel(snap, lang, { drawScreens: false });
  const vdir = join(dir, 'values');
  ensureDirSync(join(vdir, '_in'));
  const known = loadValueMeanings(dir, lang);
  // Domains are shared: one queued by another module's run is not queued again.
  const root = dirname(dir);
  const queued = new Set(readdirSync(root).map((m) => join(root, m, 'values')).flatMap((d) => batchIds(d).map((b) => join(d, '_in', `${b}.json`)))
    .flatMap((f) => readItems(f).map((x) => x.domain)));
  const by = new Map();
  for (const v of Object.values(views)) {
    if (!v.rows.length) continue;
    v.cols.forEach((c, i) => {
      const fixed = c.dom && snap.domains?.[c.dom];
      if (!fixed || Object.keys(fixed).length < 2 || isFlag(Object.keys(fixed)) || known[c.dom] || queued.has(c.dom)) return;
      const e = by.get(c.dom) || { domain: c.dom, des: new Map(), usedIn: [], counts: {} };
      if (!e.des.has(c.de) && e.des.size < 4) e.des.set(c.de, c.label);
      if (e.usedIn.length < 4) e.usedIn.push(`${v.root}-${c.name} (${v.title || v.tableTitle || v.key})`);
      for (const r of v.rows) { const k = String(r[i] ?? '').trim(); e.counts[k] = (e.counts[k] || 0) + 1; }
      by.set(c.dom, e);
    });
  }
  const items = [...by.values()].sort((a, b) => a.domain.localeCompare(b.domain)).map((e) => {
    const t = snap.domains[e.domain], en = snap.domainsEn?.[e.domain] || {};
    const de = [...e.des.keys()].find((d) => snap.fieldDocs?.[d]?.text);
    return {
      domain: e.domain,
      dataElements: [...e.des].map(([d, label]) => `${d} (${label})`),
      values: Object.keys(t).slice(0, VALUE_CAP).map((k) => ({ v: k, text: t[k], en: en[k] || '', rowsHere: e.counts[k] || 0 })),
      f1: de ? `${de}: ${f1Text(snap.fieldDocs[de])}` : '',
      usedIn: e.usedIn,
    };
  });
  const first = Math.max(0, ...batchIds(vdir).map((b) => Number(b.slice(1))));
  const manifest = [];
  for (let i = 0; i < items.length; i += o.size) {
    const name = `v${String(first + i / o.size + 1).padStart(3, '0')}`;
    const part = items.slice(i, i + o.size);
    atomicWriteFileSync(join(vdir, '_in', `${name}.json`), JSON.stringify({ module: o.module, lang, items: part }, null, 1));
    manifest.push({ batch: name, domains: part.length, values: part.reduce((n, x) => n + x.values.length, 0) });
  }
  process.stdout.write(JSON.stringify({ known: Object.keys(known).length, todo: items.length, batches: manifest }, null, 1) + '\n');
}

function save(o) {
  if (!/^v\d{3}$/.test(o.batch) || !['draft', 'review'].includes(o.kind)) throw new Error('--batch vNNN and --kind draft|review are required');
  const vdir = join(dirOf(o.module), 'values');
  const input = readItems(join(vdir, '_in', `${o.batch}.json`));
  const want = Object.fromEntries(input.map((x) => [x.domain, new Set(x.values.map((v) => v.v))]));
  const items = parseValues(readFileSync(o.file || 0, 'utf8'));
  const errors = [];
  for (const [d, vals] of Object.entries(items)) {
    for (const v of Object.keys(vals)) if (!want[d]?.has(v)) { errors.push(`${d}:${v}: not in batch ${o.batch}`); delete vals[v]; }
    if (!Object.keys(vals).length) delete items[d];
  }
  if (o.kind === 'draft') for (const [d, vals] of Object.entries(want)) for (const v of vals) if (!items[d]?.[v]) errors.push(`${d}:${v}: missing`);
  atomicWriteFileSync(join(vdir, `${o.batch}.${o.kind}.json`), JSON.stringify({ batch: o.batch, kind: o.kind, savedAt: new Date().toISOString(), items }, null, 1));
  process.stdout.write(JSON.stringify({ ok: errors.length === 0, saved: Object.values(items).reduce((n, x) => n + Object.keys(x).length, 0), errors }) + '\n');
}

function status(o) {
  const vdir = join(dirOf(o.module), 'values');
  const has = (b, k) => existsSync(join(vdir, `${b}.${k}.json`));
  process.stdout.write(JSON.stringify(batchIds(vdir).map((b) => ({ batch: b, draft: has(b, 'draft'), review: has(b, 'review') })), null, 1) + '\n');
}

function kbPromote(o) {
  const dir = dirOf(o.module);
  const lang = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8')).meta.lang || 'ko';
  const kb = kbValues(lang);
  const vdir = join(dir, 'values');
  let saved = 0;
  for (const b of batchIds(vdir)) {
    if (!existsSync(join(vdir, `${b}.review.json`)) || !existsSync(join(vdir, `${b}.draft.json`))) continue;
    const draft = readItems(join(vdir, `${b}.draft.json`)), review = readItems(join(vdir, `${b}.review.json`));
    for (const [d, vals] of Object.entries(draft)) {
      if (kb[d]) continue;
      kb[d] = { meanings: { ...vals, ...(review[d] || {}) }, module: o.module, savedAt: new Date().toISOString() };
      saved++;
    }
  }
  ensureDirSync(dirname(kbFile(lang)));
  atomicWriteFileSync(kbFile(lang), JSON.stringify(kb, null, 1));
  process.stdout.write(JSON.stringify({ kb: kbFile(lang), saved, total: Object.keys(kb).length }) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = opts(process.argv.slice(2));
    const run = { batches, save, status, kb: kbPromote }[o.cmd];
    if (!run) throw new Error('command: batches | save | status | kb');
    run(o);
  } catch (e) {
    process.stderr.write(`[values] ${e.message}\n`);
    process.exit(1);
  }
}

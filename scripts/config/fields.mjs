#!/usr/bin/env node
// config-to-document — business meaning of the value-table columns, per data element:
// written by the module consultant agent from SAP's F1 documentation, checked by a
// reviewer, kept in a knowledge base shared by every module and system.
//
//   node scripts/config/fields.mjs batches --module SD [--size 100]
//        → fields/_in/fNNN.json: data elements of the columns that show values and have
//          no meaning in the knowledge base yet (label, domain values, F1 text, where used, samples)
//   node scripts/config/fields.mjs save --module SD --batch f001 --kind draft|review --file <file>
//        draft: one line per data element `ROLLNAME = <meaning>`
//        review: corrections only, `ROLLNAME = <corrected meaning> | <reason>` (no lines = all ok)
//   node scripts/config/fields.mjs status --module SD
//   node scripts/config/fields.mjs kb --module SD
//        → reviewed meanings into ~/.sc4sap/kb/fields/<lang>.json (every later run skips them)

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveArtifactBase, sc4sapHome } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync, ensureDirSync } from '../lib/atomic-write.mjs';
import { buildModel } from './build-config-doc.mjs';

// F1 text per data element: 900 characters cut key sentences (KZRBWB lost its "new Asset
// Accounting" paragraph); 6000, as for the IMG documentation in the notes input, fits nearly all.
const F1_CHARS = 6000;
// Domain fixed values listed per data element (12 dropped the rest of longer domains silently).
const VALUE_CAP = 60;

function opts(argv) {
  const o = { cmd: argv[0], module: '', size: 100, batch: '', kind: '', file: '' };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--module') o.module = String(argv[++i]).toUpperCase();
    else if (a === '--size') o.size = Math.max(1, Number(argv[++i]) || 100);
    else if (a === '--batch') o.batch = argv[++i];
    else if (a === '--kind') o.kind = argv[++i];
    else if (a === '--file') o.file = argv[++i];
  }
  if (!o.module) throw new Error('--module is required');
  return o;
}

const dirOf = (module) => join(resolveArtifactBase(process.cwd()), 'config-docs', module);
const kbFile = (lang) => join(sc4sapHome(), 'kb', 'fields', `${lang}.json`);
export const kbFields = (lang) => (existsSync(kbFile(lang)) ? JSON.parse(readFileSync(kbFile(lang), 'utf8')) : {});

/** Meanings of this run: reviewed batches (review corrections over drafts), over the knowledge base. */
export function loadFieldMeanings(dir, lang) {
  const out = Object.fromEntries(Object.entries(kbFields(lang)).map(([de, e]) => [de, e.meaning]));
  const fdir = join(dir, 'fields');
  if (!existsSync(join(fdir, '_in'))) return out;
  for (const b of readdirSync(join(fdir, '_in')).filter((f) => /^f\d{3}\.json$/.test(f)).map((f) => f.slice(0, 4))) {
    if (!existsSync(join(fdir, `${b}.review.json`)) || !existsSync(join(fdir, `${b}.draft.json`))) continue;
    const draft = JSON.parse(readFileSync(join(fdir, `${b}.draft.json`), 'utf8')).items;
    const review = JSON.parse(readFileSync(join(fdir, `${b}.review.json`), 'utf8')).items;
    for (const [de, m] of Object.entries(draft)) out[de] = review[de] || m;
  }
  return out;
}

export function parseFields(text) {
  const out = {};
  for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
    const m = /^\s*([A-Z0-9_/]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].split(' | ')[0].trim();
  }
  return out;
}

/**
 * F1 text of a data element for a batch input, up to `cap` characters. A cut text says so:
 * cut here (the snapshot has the rest) or already cut when it was extracted (snapshots read
 * before the extraction cap was raised stop at 1500 characters, without the `cut` flag).
 */
export const F1_EXTRACT_CAP_OLD = 1500;
export function f1Text(doc, cap = F1_CHARS) {
  const t = String(doc?.text || '');
  if (t.length > cap) return `${t.slice(0, cap)} … (cut; full text in snapshot.fieldDocs)`;
  if (doc?.cut || t.length === F1_EXTRACT_CAP_OLD) return `${t} … (cut when extracted; extract-config --field-docs reads it in full)`;
  return t;
}

/**
 * Fixed values of a domain as `value=text`, up to `cap` of them; `more` counts the ones left
 * out, so the writer knows the list is not complete.
 */
export function domainValues(dv = {}, cap = VALUE_CAP) {
  const all = Object.entries(dv || {});
  return { values: all.slice(0, cap).map(([k, t]) => `${k}=${t}`), more: Math.max(0, all.length - cap) };
}

function batches(o) {
  const dir = dirOf(o.module);
  const snap = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
  const lang = snap.meta.lang || 'ko';
  const { views } = buildModel(snap, lang, { drawScreens: false });
  const fdir = join(dir, 'fields', '_in');
  ensureDirSync(fdir);
  const known = loadFieldMeanings(dir, lang);
  const queued = new Set(readdirSync(fdir).filter((f) => /^f\d{3}\.json$/.test(f))
    .flatMap((f) => JSON.parse(readFileSync(join(fdir, f), 'utf8')).items.map((x) => x.de)));
  // Columns that show values: data element → label, domain, where used, sample values.
  const by = new Map();
  for (const v of Object.values(views)) {
    if (!v.rows.length) continue;
    v.cols.forEach((c, i) => {
      if (!c.de || known[c.de] || queued.has(c.de)) return;
      const e = by.get(c.de) || { de: c.de, label: c.label, domain: c.dom || '', usedIn: [], samples: new Set() };
      if (e.usedIn.length < 4) e.usedIn.push(`${v.root}-${c.name} (${v.title || v.tableTitle || v.key})`);
      for (const r of v.rows) { if (e.samples.size >= 6) break; if (r[i] !== '') e.samples.add(r[i]); }
      by.set(c.de, e);
    });
  }
  const items = [...by.values()].sort((a, b) => a.de.localeCompare(b.de)).map((e) => {
    const { values, more } = domainValues(snap.domains?.[e.domain]);
    return { de: e.de, label: e.label, domain: e.domain, values, ...(more ? { more } : {}), f1: f1Text(snap.fieldDocs?.[e.de]), usedIn: e.usedIn, samples: [...e.samples] };
  });
  const first = Math.max(0, ...readdirSync(fdir).map((f) => Number(/^f(\d{3})\.json$/.exec(f)?.[1] || 0)));
  const manifest = [];
  for (let i = 0; i < items.length; i += o.size) {
    const name = `f${String(first + i / o.size + 1).padStart(3, '0')}`;
    atomicWriteFileSync(join(fdir, `${name}.json`), JSON.stringify({ module: o.module, lang, items: items.slice(i, i + o.size) }, null, 1));
    manifest.push({ batch: name, fields: Math.min(o.size, items.length - i) });
  }
  process.stdout.write(JSON.stringify({ known: Object.keys(known).length, todo: items.length, batches: manifest }, null, 1) + '\n');
}

function save(o) {
  if (!/^f\d{3}$/.test(o.batch) || !['draft', 'review'].includes(o.kind)) throw new Error('--batch fNNN and --kind draft|review are required');
  const fdir = join(dirOf(o.module), 'fields');
  const input = JSON.parse(readFileSync(join(fdir, '_in', `${o.batch}.json`), 'utf8'));
  const ids = new Set(input.items.map((x) => x.de));
  const items = parseFields(readFileSync(o.file || 0, 'utf8'));
  const errors = Object.keys(items).filter((de) => !ids.has(de)).map((de) => `${de}: not in batch ${o.batch}`);
  for (const de of Object.keys(items)) if (!ids.has(de)) delete items[de];
  if (o.kind === 'draft') for (const de of ids) if (!items[de]) errors.push(`${de}: missing`);
  atomicWriteFileSync(join(fdir, `${o.batch}.${o.kind}.json`), JSON.stringify({ batch: o.batch, kind: o.kind, savedAt: new Date().toISOString(), items }, null, 1));
  process.stdout.write(JSON.stringify({ ok: errors.length === 0, saved: Object.keys(items).length, errors }) + '\n');
}

function status(o) {
  const fdir = join(dirOf(o.module), 'fields');
  const ins = existsSync(join(fdir, '_in')) ? readdirSync(join(fdir, '_in')).filter((f) => /^f\d{3}\.json$/.test(f)).map((f) => f.slice(0, 4)) : [];
  const has = (b, k) => existsSync(join(fdir, `${b}.${k}.json`));
  process.stdout.write(JSON.stringify(ins.map((b) => ({ batch: b, draft: has(b, 'draft'), review: has(b, 'review') })), null, 1) + '\n');
}

function kbPromote(o) {
  const dir = dirOf(o.module);
  const lang = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8')).meta.lang || 'ko';
  const kb = kbFields(lang);
  const fdir = join(dir, 'fields');
  let saved = 0;
  for (const b of existsSync(join(fdir, '_in')) ? readdirSync(join(fdir, '_in')).filter((f) => /^f\d{3}\.json$/.test(f)).map((f) => f.slice(0, 4)) : []) {
    if (!existsSync(join(fdir, `${b}.review.json`)) || !existsSync(join(fdir, `${b}.draft.json`))) continue;
    const draft = JSON.parse(readFileSync(join(fdir, `${b}.draft.json`), 'utf8')).items;
    const review = JSON.parse(readFileSync(join(fdir, `${b}.review.json`), 'utf8')).items;
    for (const [de, m] of Object.entries(draft)) {
      if (kb[de]) continue;
      kb[de] = { meaning: review[de] || m, module: o.module, savedAt: new Date().toISOString() };
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
    process.stderr.write(`[fields] ${e.message}\n`);
    process.exit(1);
  }
}

#!/usr/bin/env node
// config-to-document — what the customer BAdI implementations of this system do, read from
// the implementing class source: written by the module consultant agent, checked against the
// source by a reviewer, revised once. System-specific, so never copied to a knowledge base.
//
//   node scripts/config/badi-notes.mjs batch --module MM
//        → badi/_in.json: per customer implementation the BAdI, the IMG activities that name
//          it, its SAP documentation, and every method with code (source, size, called objects)
//   node scripts/config/badi-notes.mjs save --module MM --kind draft|review|revised --file <file>
//        draft / revised:  @@ <implementation>  /  summary: <text>  /  - <METHOD>: <text>
//        review:           @@ <implementation>  /  verdict: ok|fix  /  - <problem>
//   node scripts/config/badi-notes.mjs status --module MM

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { resolveArtifactBase } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync, ensureDirSync } from '../lib/atomic-write.mjs';

function opts(argv) {
  const o = { cmd: argv[0], module: '', kind: '', file: '' };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--module') o.module = String(argv[++i]).toUpperCase();
    else if (a === '--kind') o.kind = argv[++i];
    else if (a === '--file') o.file = argv[++i];
    else throw new Error(`unknown option ${a}`);
  }
  if (!o.module) throw new Error('--module is required');
  return o;
}

const dirOf = (module) => join(resolveArtifactBase(process.cwd()), 'config-docs', module);
const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
// "IF_EX_INVOICE_UPDATE~CHANGE_AT_SAVE" and "CHANGE_AT_SAVE" name the same method.
export const methodKey = (name) => String(name).trim().toUpperCase().split('~').pop();

// Z includes the methods branch into, with the includes those include in turn.
function includesOf(src) {
  const inc = src.includes || {};
  const out = {};
  const walk = (names) => { for (const n of names || []) if (inc[n] && !out[n]) { out[n] = inc[n]; walk(inc[n].refs?.includes); } };
  walk(src.methods.flatMap((m) => m.refs?.includes || []));
  return out;
}

function batch(o) {
  const dir = dirOf(o.module);
  const snap = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
  const items = [];
  for (const [badi, list] of Object.entries(snap.badiImpls || {})) {
    const acts = Object.values(snap.activities).filter((a) => (a.badis || []).includes(badi));
    for (const x of list) {
      const src = snap.badiSources?.[x.class] || { methods: [] };
      items.push({
        impl: x.name, badi, kind: x.kind, class: x.class, active: x.active, user: x.user, date: x.date,
        activities: acts.map((a) => ({ id: a.id, title: a.title, titleEn: a.titleEn })),
        sapDoc: acts.map((a) => snap.docs?.[a.docuId]?.blocks?.map((b) => b.text).join('\n') || '').find(Boolean)?.slice(0, 2500) || '',
        sourceError: src.error || '',
        methods: src.methods.filter((m) => !m.empty).map((m) => ({ name: m.name, lines: m.lines, refs: m.refs, truncated: m.truncated, source: m.source })),
        emptyMethods: src.methods.filter((m) => m.empty).map((m) => m.name),
        includes: includesOf(src),
      });
    }
  }
  ensureDirSync(join(dir, 'badi'));
  const file = join(dir, 'badi', '_in.json');
  atomicWriteFileSync(file, JSON.stringify({ module: o.module, items }, null, 1));
  return { ok: true, file, implementations: items.length, methodsWithCode: items.reduce((n, i) => n + i.methods.length, 0) };
}

export function parseMarkers(text, kind) {
  const out = {};
  const errors = [];
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const at = /^@@\s*(\S+)/.exec(line);
    if (at) { cur = out[at[1].toUpperCase()] = kind === 'review' ? { verdict: '', problems: [] } : { summary: '', methods: {} }; continue; }
    if (!cur) { errors.push(`text before the first @@: ${line.slice(0, 60)}`); continue; }
    if (kind === 'review') {
      const v = /^verdict:\s*(ok|fix)\b/i.exec(line);
      if (v) cur.verdict = v[1].toLowerCase();
      else if (line.startsWith('-')) cur.problems.push(line.slice(1).trim());
      continue;
    }
    const s = /^summary:\s*(.+)$/i.exec(line);
    if (s) { cur.summary = s[1].trim(); continue; }
    const m = /^-\s*([\w~/]+)\s*:\s*(.+)$/.exec(line);
    if (m) cur.methods[methodKey(m[1])] = m[2].trim();
    else if (cur.summary) cur.summary += ' ' + line;
  }
  return { items: out, errors };
}

function save(o) {
  if (!['draft', 'review', 'revised'].includes(o.kind)) throw new Error('--kind draft|review|revised');
  const dir = join(dirOf(o.module), 'badi');
  const input = readJson(join(dir, '_in.json'), null);
  if (!input) throw new Error('run batch first');
  const text = o.file ? readFileSync(o.file, 'utf8') : readFileSync(0, 'utf8');
  const { items, errors } = parseMarkers(text, o.kind);
  const known = new Map(input.items.map((i) => [i.impl.toUpperCase(), i]));
  for (const [impl, v] of Object.entries(items)) {
    const inp = known.get(impl);
    if (!inp) { errors.push(`${impl}: not in badi/_in.json`); continue; }
    if (o.kind === 'review') { if (!v.verdict) errors.push(`${impl}: verdict missing`); continue; }
    if (!v.summary) errors.push(`${impl}: summary missing`);
    const names = new Set(inp.methods.map((m) => methodKey(m.name)));
    for (const k of Object.keys(v.methods)) if (!names.has(k)) errors.push(`${impl}: ${k} is not a method with code`);
    if (o.kind === 'draft') for (const k of names) if (!v.methods[k]) errors.push(`${impl}: ${k} not described`);
  }
  if (o.kind === 'draft') for (const impl of known.keys()) if (!items[impl]) errors.push(`${impl}: missing`);
  if (errors.length) return { ok: false, errors };
  const file = join(dir, `${o.kind}.json`);
  // A revision replaces only the implementations it names.
  const prev = o.kind === 'revised' ? readJson(file, { items: {} }).items : {};
  atomicWriteFileSync(file, JSON.stringify({ kind: o.kind, savedAt: new Date().toISOString(), items: { ...prev, ...items } }, null, 1));
  const fix = o.kind === 'review' ? Object.entries(items).filter(([, v]) => v.verdict === 'fix').map(([k]) => k) : undefined;
  return { ok: true, saved: Object.keys(items).length, errors: [], ...(fix ? { fix } : {}) };
}

// Draft overlaid by the revision; the state says how far the review got.
export function loadBadiNotes(moduleDir) {
  const dir = join(moduleDir, 'badi');
  const draft = readJson(join(dir, 'draft.json'), { items: {} }).items;
  const review = readJson(join(dir, 'review.json'), { items: {} }).items;
  const revised = readJson(join(dir, 'revised.json'), { items: {} }).items;
  const out = {};
  for (const [impl, d] of Object.entries(draft)) {
    const r = revised[impl];
    const v = review[impl];
    out[impl] = {
      summary: r?.summary || d.summary, methods: { ...d.methods, ...(r?.methods || {}) },
      state: r ? 'revised' : v?.verdict === 'ok' ? 'ok' : v?.verdict === 'fix' ? 'fix' : 'draft',
      problems: !r && v?.verdict === 'fix' ? v.problems : [],
    };
  }
  return out;
}

function status(o) {
  const dir = join(dirOf(o.module), 'badi');
  const n = (f) => Object.keys(readJson(join(dir, f), { items: {} }).items || {}).length;
  return { implementations: (readJson(join(dir, '_in.json'), { items: [] }).items || []).length, draft: n('draft.json'), review: n('review.json'), revised: n('revised.json') };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('badi-notes.mjs')) {
  const o = opts(process.argv.slice(2));
  const run = { batch, save, status }[o.cmd];
  if (!run) throw new Error('command: batch | save | status');
  process.stdout.write(JSON.stringify(run(o)) + '\n');
}

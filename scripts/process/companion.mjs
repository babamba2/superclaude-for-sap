// sc4sap:module-to-process — the companion (other-language) page of a process map.
//
//   node companion.mjs texts <process-model.json> --out <texts.json> [--chunks N]   (N files <texts>.<k>.json for parallel translators)
//   node companion.mjs apply <process-model.json> <translated.json> [<translated.2.json> …] --lang en --out <process-model.en.json>
//
// texts: every prose string of the model, de-duplicated, as
//   { from: "ko", to: "", items: [{ i, text }], paths: { "<i>": ["row:1.2|label", "m|glossary.0.term", …] } }
// The translator fills `to` and returns { items: [{ i, text }] } with the same i — nothing else changes.
// apply: writes each translated text back at all its paths and sets lang. SAP identifiers, codes,
// TCodes, object names, ids and numbers are not prose and are never extracted.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arr = (v) => (Array.isArray(v) ? v : []);
const isProse = (s) => typeof s === 'string' && /\p{L}/u.test(s) && !/^[A-Z0-9_/.:=-]+$/.test(s.trim());

/** [path, text] for every prose field; paths use the edit-mode syntax ("row:<code>|…" / "m|…"). */
export function prosePaths(model) {
  const out = [];
  const add = (p, v) => { if (isProse(v)) out.push([p, v]); };
  const list = (base, xs, keys) => arr(xs).forEach((x, i) => {
    if (typeof x === 'string') add(`${base}.${i}`, x);
    else for (const k of keys) add(`${base}.${i}.${k}`, x?.[k]);
  });
  add('m|title', model.title);
  add('m|changeNote', model.changeNote);
  add('m|overview.summary', model.overview?.summary);
  add('m|overview.scopeNote', model.overview?.scopeNote);
  list('m|lanes', model.lanes, ['label']);
  list('m|scope.systems', model.scope?.systems, ['label']);
  list('m|overview.handoffs', model.overview?.handoffs, ['via']);
  for (const r of arr(model.rows)) {
    const R = (p) => `row:${r.code}|${p}`;
    add(R('label'), r.label); add(R('desc'), r.desc); add(R('remark'), r.remark);
    list(R('variants'), r.variants, ['label', 'desc', 'remark']);
    const t = r.task; if (!t) continue;
    for (const k of ['definition', 'output', 'timing']) add(R(`task.${k}`), t[k]);
    list(R('task.rules'), t.rules, ['text']);
    list(R('task.steps'), t.steps, ['name', 'method', 'timing']);
    list(R('task.objects'), t.objects, ['desc']);
    list(R('task.interfaces'), t.interfaces, ['desc']);
    list(R('task.links'), t.links, ['note']);
    list(R('task.conversion'), t.conversion, ['text']);
    list(R('task.tbd'), t.tbd, ['text']);
    if (t.flow) { list(R('task.flow.nodes'), t.flow.nodes, ['label']); list(R('task.flow.edges'), t.flow.edges, ['label']); }
  }
  list('m|crossModule', model.crossModule, ['desc']);
  list('m|notEvidenced', model.notEvidenced, ['label', 'reason']);
  list('m|openQuestions', model.openQuestions, ['text']);
  list('m|glossary', model.glossary, ['term', 'description']);
  return out;
}

export function extractTexts(model) {
  const idx = new Map(); const items = []; const paths = {};
  for (const [p, text] of prosePaths(model)) {
    if (!idx.has(text)) { idx.set(text, items.length); items.push({ i: items.length, text }); }
    (paths[idx.get(text)] ||= []).push(p);
  }
  return { from: model.lang || 'ko', to: '', items, paths };
}

function setPath(model, p, v) {
  const bar = p.indexOf('|');
  const head = p.slice(0, bar), keys = p.slice(bar + 1).split('.');
  let o = head === 'm' ? model : arr(model.rows).find(r => r.code === head.slice(4));
  if (!o) return false;
  for (let k = 0; k < keys.length - 1; k++) { o = o[keys[k]]; if (o == null) return false; }
  o[keys.at(-1)] = v;
  return true;
}

/** Translated items back into a copy of the model; returns { model, missing } (untranslated ids). */
export function applyTexts(model, texts, translated, lang) {
  const out = JSON.parse(JSON.stringify(model));
  const byI = new Map(arr(translated.items).map(x => [Number(x.i), x.text]));
  const missing = [];
  for (const it of texts.items) {
    const v = byI.get(it.i);
    if (typeof v !== 'string' || !v.trim()) { missing.push(it.i); continue; }
    for (const p of texts.paths[it.i] || []) setPath(out, p, v);
  }
  out.lang = lang;
  return { model: out, missing };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [cmd, a, b, ...rest] = process.argv.slice(2);
  const args = [a, b, ...rest];
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  try {
    const model = JSON.parse(readFileSync(a, 'utf8'));
    if (cmd === 'texts') {
      const t = extractTexts(model);
      const n = Math.max(1, Number(get('--chunks') || 1));
      const out = get('--out');
      const files = [];
      if (n === 1) { writeFileSync(out, `${JSON.stringify(t, null, 1)}\n`, 'utf8'); files.push(out); }
      else {
        const size = Math.ceil(t.items.length / n);
        for (let k = 0; k < n; k++) {
          const f = `${out.replace(/\.json$/i, '')}.${k + 1}.json`;
          writeFileSync(f, `${JSON.stringify({ from: t.from, to: '', items: t.items.slice(k * size, (k + 1) * size) }, null, 1)}\n`, 'utf8');
          files.push(f);
        }
      }
      console.log(JSON.stringify({ files: files.map(f => resolve(f)), items: t.items.length, chars: t.items.reduce((m, x) => m + x.text.length, 0) }));
    } else if (cmd === 'apply') {
      const texts = extractTexts(model);
      const inputs = args.filter((x, i) => x && !x.startsWith('--') && !['--lang', '--out'].includes(args[i - 1]));
      const merged = { items: inputs.flatMap(f => arr(JSON.parse(readFileSync(f, 'utf8')).items)) };
      const { model: m, missing } = applyTexts(model, texts, merged, get('--lang') || 'en');
      writeFileSync(get('--out'), `${JSON.stringify(m, null, 2)}\n`, 'utf8');
      console.log(JSON.stringify({ out: resolve(get('--out')), lang: m.lang, missing: missing.length }));
      if (missing.length) process.exitCode = 3;
    } else {
      console.error('Usage: node companion.mjs texts <model> --out <texts.json> | apply <model> <translated.json> --lang en --out <model.en.json>');
      process.exit(2);
    }
  } catch (e) {
    console.error(`companion: ${e.message}`);
    process.exit(1);
  }
}

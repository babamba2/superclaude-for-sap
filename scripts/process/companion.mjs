// sc4sap:module-to-process — the companion (other-language) page of a process map.
//
//   node companion.mjs texts <process-model.json> --out <texts.json> [--chunks N]   (N files <texts>.<k>.json for parallel translators)
//   node companion.mjs apply <process-model.json> <translated.json> [<translated.2.json> …] --lang en --out <process-model.en.json>
//   node companion.mjs apply <process-model.json> <humanized.json> --lang ko --partial --out <process-model.json>   (same-language rewrite of some items)
//
// texts: every prose string of the model, de-duplicated, as
//   { from: "ko", to: "", items: [{ i, text }], paths: { "<i>": ["row:1.2|label", "m|glossary.0.term", …] } }
// The translator fills `to` and returns { items: [{ i, text }] } with the same i — nothing else changes.
// apply: writes each translated text back at all its paths and sets lang. A translated chunk whose
// source chunk sits next to it (<texts>.<k>.json + <texts>.<k>.en.json) is matched by source text, so
// chunks translated before a model edit still apply after it. SAP identifiers, codes,
// TCodes, object names, ids and numbers are not prose and are never extracted.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
    list(R('task.steps'), t.steps, ['name', 'method', 'timing', 'where', 'action']);
    arr(t.steps).forEach((st, i) => list(R(`task.steps.${i}.alts`), st?.alts, ['when', 'label', 'method', 'where', 'action']));
    list(R('task.objects'), t.objects, ['name', 'desc']);
    list(R('task.exits'), t.exits, ['name', 'desc']);
    list(R('task.interfaces'), t.interfaces, ['object', 'desc']);
    list(R('task.links'), t.links, ['note']);
    list(R('task.conversion'), t.conversion, ['text']);
    list(R('task.tbd'), t.tbd, ['text']);
    if (t.flow) { list(R('task.flow.nodes'), t.flow.nodes, ['label', 'where', 'action']); list(R('task.flow.edges'), t.flow.edges, ['label']); }
  }
  list('m|crossModule', model.crossModule, ['object', 'desc']);
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

/** Source text → translation from chunk pairs [{ source: {items}, translated: {items} }]. Keyed by text,
 *  so a translation stays valid when the model changed and the ids of a new extraction shifted. */
export function translationsByText(pairs) {
  const m = new Map();
  for (const { source, translated } of arr(pairs)) {
    const byI = new Map(arr(translated?.items).map(x => [Number(x.i), x.text]));
    for (const it of arr(source?.items)) { const v = byI.get(Number(it.i)); if (typeof v === 'string' && v.trim()) m.set(it.text, v); }
  }
  return m;
}

/** Translated items back into a copy of the model; returns { model, missing } (untranslated ids).
 *  `byText` (from translationsByText) wins over the id match of `translated`. */
export function applyTexts(model, texts, translated, lang, byText) {
  const out = JSON.parse(JSON.stringify(model));
  const byI = new Map(arr(translated?.items).map(x => [Number(x.i), x.text]));
  const missing = [];
  for (const it of texts.items) {
    const v = byText?.get(it.text) ?? byI.get(it.i);
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
      // <chunk>.en.json next to its source <chunk>.json → match by source text (ids may have shifted
      // since the chunks were extracted); a translated file without its source falls back to the ids.
      const pairs = [], loose = [];
      for (const f of inputs) {
        const translated = JSON.parse(readFileSync(f, 'utf8'));
        const src = f.replace(/\.[a-z]{2}\.json$/i, '.json');
        if (src !== f && existsSync(src)) pairs.push({ source: JSON.parse(readFileSync(src, 'utf8')), translated });
        else loose.push(...arr(translated.items));
      }
      const { model: m, missing } = applyTexts(model, texts, { items: loose }, get('--lang') || 'en', translationsByText(pairs));
      writeFileSync(get('--out'), `${JSON.stringify(m, null, 2)}\n`, 'utf8');
      // --partial: a same-language rewrite of some items (humanize) — the others keep their text, not an error.
      const partial = args.includes('--partial');
      console.log(JSON.stringify({ out: resolve(get('--out')), lang: m.lang, missing: missing.length, ...(partial ? { applied: texts.items.length - missing.length } : {}) }));
      if (missing.length && !partial) process.exitCode = 3;
    } else {
      console.error('Usage: node companion.mjs texts <model> --out <texts.json> | apply <model> <translated.json> --lang en --out <model.en.json>');
      process.exit(2);
    }
  } catch (e) {
    console.error(`companion: ${e.message}`);
    process.exit(1);
  }
}

// sc4sap — Korean prose polish through the humanize-korean plugin (epoko77-ai/im-not-ai), when it is installed.
//
//   node humanize.mjs locate                                        → { available, version, quickRules, agent }
//   node humanize.mjs fix <texts.json> --out <fixed.json>           → mechanical fixes, no model (always runs)
//   node humanize.mjs detect <texts.json> [--fixed <fixed.json>] --out <flagged.json>  → items with a tell left for the model
//   node humanize.mjs pack <flagged.json> --out-dir <dir> [--max 4500]  → <dir>/chunk-<k>/01_input.txt (diagnosis header + lines)
//   node humanize.mjs unpack <dir> [--base <fixed.json>] --out <humanized.json>  → { items: [{ i, text }] } to apply
//
// For skills without their own prose extraction:
//   node humanize.mjs texts-json <a.json> [<b.json> …] --out <texts.json> [--skip k1,k2]   string values with ≥ 20 Hangul
//   node humanize.mjs apply-json <texts.json> <humanized.json>      → writes the rewrites back into those JSON files
//   node humanize.mjs texts-md <a.md> --out <texts.json>            paragraph / list / quote lines (no code, tables, headings)
//   node humanize.mjs apply-md <texts.json> <humanized.json>        → writes the rewrites back into that .md
//
// texts.json is the { items: [{ i, text }] } shape the skills already extract for their English companion.
// fix removes connective commas (quick-rules C-11) in code: the monolith agent leaves them in dense chunks.
// Only items flagged by detect go to the humanize-monolith agent, with their pattern IDs in a diagnosis header
// (the plugin treats diagnosed IDs as prescribed). unpack keeps an item's fixed / original text when its marker
// is lost, a protected token (identifier, code, number, region tag, backtick span, bold marker) changed, the
// change rate is over 50 %, or connective commas increased.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arr = (v) => (Array.isArray(v) ? v : []);
const hangul = (s) => (s.match(/[가-힣]/g) || []).length;

/** Installed humanize-korean plugin: install path from installed_plugins.json, quick-rules + agent present. */
export function locate(home = homedir()) {
  const reg = join(home, '.claude', 'plugins', 'installed_plugins.json');
  if (!existsSync(reg)) return { available: false, reason: 'no installed_plugins.json' };
  const plugins = JSON.parse(readFileSync(reg, 'utf8')).plugins || {};
  const key = Object.keys(plugins).find(k => k.startsWith('humanize-korean@'));
  const entry = key && arr(plugins[key])[0];
  if (!entry?.installPath) return { available: false, reason: 'humanize-korean not installed' };
  const quickRules = join(entry.installPath, 'skills', 'humanize-korean', 'references', 'quick-rules.md');
  const agent = join(entry.installPath, 'agents', 'humanize-monolith.md');
  if (!existsSync(quickRules) || !existsSync(agent)) return { available: false, reason: 'quick-rules or humanize-monolith missing', installPath: entry.installPath };
  return { available: true, plugin: key, version: entry.version, installPath: entry.installPath, quickRules: quickRules.replace(/\\/g, '/'), agent: 'humanize-korean:humanize-monolith' };
}

// Connective ending + comma (quick-rules C-11). Only verb stems: "입고, 출고, 재고," are nouns in SAP prose.
const C11 = /(?:하|되|않|있|없|받|보내|만들|넣|빼|읽|쓰|찾|고르|두|주|바꾸|막|열|닫|남기|돌리|올리|내리|나누|묶|맞추|거치)고,|[가-힣](?:며|지만|면서|아서|어서|여서|해서),/g;
const C11_FIX = new RegExp(`(${C11.source.replace(/,(\||$)/g, '$1')}),(?=\\s)`, 'g');

/** Mechanical fixes that need no model: connective comma after a verb stem (C-11) → removed. */
export function fixMechanical(s) {
  return s.replace(C11_FIX, '$1');
}

/** Items whose text the mechanical fixes change → { items: [{ i, text }], commas }. */
export function fix(texts) {
  const items = []; let commas = 0;
  for (const it of arr(texts?.items)) {
    if (typeof it.text !== 'string' || !hangul(it.text)) continue;
    const t = fixMechanical(it.text);
    if (t !== it.text) { items.push({ i: it.i, text: t }); commas += (it.text.match(C11) || []).length; }
  }
  return { items, commas };
}

// Tells left for the model (C-11 is fixed in code). LONG is sc4sap's own: one fact per sentence.
const RULES = [
  ['A-1', (s) => (s.match(/에 대해/g) || []).length >= 2],
  ['A-3', (s) => /에 있어(서)?\s/.test(s)],
  ['A-7', (s) => /[을를] 가지고 있/.test(s)],
  ['A-8', (s) => /되어지|되어진|지게 되/.test(s)],
  ['A-9', (s) => /에 의해/.test(s)],
  ['A-5', (s) => /[와과] 관련(하여|된|해)/.test(s)],
  ['A-6', (s) => /에 기반(하여|해)|[을를] 바탕으로/.test(s)],
  ['A-19', (s) => /(에서의|에로의|으로의|에의|으로부터의)/.test(s)],
  ['D-1', (s) => /(^|\.\s)(결론적으로|따라서|요약하면|정리하자면|그러므로)|이를 통해/.test(s)],
  ['D-2', (s) => /시사하는 바|주목할 만하|매우 중요하/.test(s)],
  ['D-3', (s) => /다음과 같(은|이)|크게 [두세네] 가지/.test(s)],
  ['I-2', (s) => /주목할 점은|라는 점에 있/.test(s)],
  ['I-3', (s) => /다는 (것이다|뜻이다)/.test(s)],
  ['G-2', (s) => /[ㄹ을] 수 있을 수|보여질 수|가능성이 있을 수/.test(s)],
  ['J-1', (s) => (s.match(/\*\*/g) || []).length >= 6],
  // Emoji only — arrows such as ↔ → are Extended_Pictographic too and are fine in process prose.
  ['C-5', (s) => /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)],
  ['LONG', (s) => s.split(/(?<=[.?!])\s+/).some(x => x.length > 120 && hangul(x) >= 40)],
];

/** Items with at least one tell → { items: [{ i, text, tells }] }; items with < 20 Hangul are skipped.
 *  `fixed` ({ items } from fix) replaces an item's text first, so the model starts from the fixed text. */
export function detect(texts, fixed) {
  const byI = new Map(arr(fixed?.items).map(x => [Number(x.i), x.text]));
  const items = [];
  for (const it of arr(texts?.items)) {
    const text = byI.get(Number(it.i)) ?? it.text;
    if (typeof text !== 'string' || hangul(text) < 20 || /\n/.test(text)) continue;
    const tells = RULES.filter(([, f]) => f(text)).map(([id]) => id);
    if (tells.length) items.push({ i: it.i, text, tells });
  }
  return { items };
}

const TELL_NOTE = { LONG: 'LONG (120자 넘는 문장 — 한 문장에 사실 하나로 나눔, A-18 처방)' };
/** Flagged items → chunks of ≤ max characters: a diagnosis header naming each item's pattern IDs, then
 *  one "⟦i⟧ text" line per item. The header lines do not start with ⟦, so parseMarked ignores them. */
export function pack(flagged, max = 4500) {
  const groups = []; let cur = [], size = 0;
  for (const it of arr(flagged?.items)) {
    const len = it.text.length + 12;
    if (cur.length && size + len > max) { groups.push(cur); cur = []; size = 0; }
    cur.push(it); size += len;
  }
  if (cur.length) groups.push(cur);
  return groups.map(g => [
    '[진단] 아래 항목별로 지목한 패턴만 처방한다 (본진 ID). 지목되지 않은 항목·구간은 건드리지 않는다.',
    ...g.map(it => `- 항목 ${it.i}: ${arr(it.tells).map(t => TELL_NOTE[t] || t).join(', ')}`),
    '[/진단]',
    '',
    ...g.map(it => `⟦${it.i}⟧ ${it.text}`),
  ].join('\n'));
}

const MARK = /^⟦(\d+)⟧ ?(.*)$/;
/** "⟦i⟧ text" lines of an input / final.md → Map(i → text); the HUMANIZE-SUMMARY comment is ignored. */
export function parseMarked(txt) {
  const m = new Map();
  for (const line of String(txt).replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) { const x = MARK.exec(line.trim()); if (x) m.set(Number(x[1]), x[2].trim()); }
  return m;
}

/** Tokens a rewrite must keep verbatim: backtick spans, region tags, Latin identifiers / codes, numbers, bold markers. */
export function protectedTokens(s) {
  return [
    ...(s.match(/`[^`]+`/g) || []),
    ...(s.match(/\[[A-Z]{2,}\]/g) || []),
    ...(s.match(/[A-Za-z_/][A-Za-z0-9_/\-+.()]*[A-Za-z0-9_)]|[A-Za-z]/g) || []),
    ...(s.match(/\d+/g) || []),
    ...(s.match(/\*\*/g) || []),
  ].sort();
}

/** Character change rate 0..1 (1 − LCS / longer length). */
export function changeRate(a, b) {
  if (a === b) return 0;
  const n = a.length, m = b.length; let prev = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    const cur = [0];
    for (let j = 1; j <= m; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return 1 - prev[m] / Math.max(n, m);
}

/** Why a rewrite is refused, or null when it is accepted. */
export function rejectReason(a, b) {
  if (b === undefined) return 'marker lost';
  if (!b.trim()) return 'empty';
  const pa = protectedTokens(a), pb = protectedTokens(b);
  if (pa.length !== pb.length || pa.some((x, k) => x !== pb[k])) return 'protected token changed';
  if (changeRate(a, b) > 0.5) return 'change over 50%';
  if ((b.match(C11) || []).length > (a.match(C11) || []).length) return 'connective commas increased';
  return null;
}

/** Chunk dirs (01_input.txt + final.md) → accepted rewrites and the count of each refusal reason.
 *  `base` ({ items } from fix): items the model did not rewrite keep their fixed text in the result. */
export function unpack(dir, base) {
  const items = [], refused = {}; let unchanged = 0, chunks = 0, noOutput = 0;
  const done = new Set();
  for (const d of readdirSync(dir).filter(x => /^chunk-\d+$/.test(x)).sort()) {
    chunks++;
    const src = parseMarked(readFileSync(join(dir, d, '01_input.txt'), 'utf8'));
    const fin = join(dir, d, 'final.md');
    if (!existsSync(fin)) { noOutput++; continue; }
    const out = parseMarked(readFileSync(fin, 'utf8'));
    for (const [i, a] of src) {
      const b = out.get(i);
      const why = rejectReason(a, b);
      if (why) { refused[why] = (refused[why] || 0) + 1; continue; }
      if (a === b) { unchanged++; continue; }
      items.push({ i, text: b }); done.add(i);
    }
  }
  const rewritten = items.length;
  for (const x of arr(base?.items)) if (!done.has(Number(x.i))) items.push({ i: Number(x.i), text: x.text });
  return { items, stats: { chunks, noOutput, rewritten, fixed: items.length - rewritten, unchanged, refused } };
}

// Keys whose values are never prose (codes, ids, links) — skipped by texts-json.
const SKIP_KEYS = new Set(['id', 'ids', 'code', 'key', 'tcode', 'tcodes', 'program', 'programs', 'table', 'tables', 'field', 'fields', 'object', 'objects', 'url', 'href', 'src', 'path', 'file', 'lang', 'anchor', 'type', 'kind']);

/** Prose string values (≥ `min` Hangul, default 20, one line) of several JSON documents → { items, paths, files }.
 *  A path is "<file index>|key.key.0.key"; the same text in two places is one item with two paths. */
export function jsonTexts(docs, skip = [], min = 20) {
  const skipKeys = new Set([...SKIP_KEYS, ...skip]);
  const byText = new Map(), items = [], paths = {};
  const walk = (v, p, f) => {
    if (typeof v === 'string') {
      if (hangul(v) < min || /\n/.test(v)) return;
      let i = byText.get(v);
      if (i === undefined) { i = items.length + 1; byText.set(v, i); items.push({ i, text: v }); paths[i] = []; }
      paths[i].push(`${f}|${p.join('.')}`);
    } else if (Array.isArray(v)) v.forEach((x, k) => walk(x, [...p, k], f));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!skipKeys.has(k)) walk(x, [...p, k], f);
  };
  docs.forEach((d, f) => walk(d, [], f));
  return { from: 'ko', items, paths };
}

/** Rewrites ({ items: [{ i, text }] }) into copies of the documents at every path of their item. */
export function jsonApply(docs, texts, rewritten) {
  const out = docs.map(d => JSON.parse(JSON.stringify(d)));
  let applied = 0;
  for (const { i, text } of arr(rewritten?.items)) {
    for (const p of texts.paths[i] || []) {
      const [f, rest] = p.split('|'); const keys = rest.split('.');
      let o = out[Number(f)];
      for (const k of keys.slice(0, -1)) o = o?.[k];
      if (o && typeof o[keys.at(-1)] === 'string') { o[keys.at(-1)] = text; applied++; }
    }
  }
  return { docs: out, applied };
}

// A Markdown line that holds prose: optional list / quote prefix, then the text.
const MD_PREFIX = /^(\s*(?:[-*+]\s+|\d+[.)]\s+|>\s*)*)(.*)$/;
/** Prose lines of a Markdown document (outside code fences, front matter, tables, headings, HTML, images). */
export function mdTexts(md) {
  const lines = md.split(/\r?\n/); const items = [], paths = {};
  let fence = false, front = lines[0]?.trim() === '---';
  lines.forEach((line, n) => {
    const t = line.trim();
    if (front) { if (n > 0 && t === '---') front = false; return; }
    if (/^(```|~~~)/.test(t)) { fence = !fence; return; }
    if (fence || !t || /^(#|\||<|!\[|\[\^|---|\*\*\*)/.test(t)) return;
    const [, prefix, body] = MD_PREFIX.exec(line);
    if (hangul(body) < 20) return;
    const i = items.length + 1; items.push({ i, text: body }); paths[i] = [`${n}|${prefix.length}`];
  });
  return { from: 'ko', items, paths };
}

/** Rewrites into the Markdown lines they came from; the list / quote prefix stays as it was. */
export function mdApply(md, texts, rewritten) {
  const eol = /\r\n/.test(md) ? '\r\n' : '\n';
  const lines = md.split(/\r?\n/); let applied = 0;
  for (const { i, text } of arr(rewritten?.items)) {
    for (const p of texts.paths[i] || []) {
      const [n, len] = p.split('|').map(Number);
      if (lines[n] === undefined) continue;
      lines[n] = lines[n].slice(0, len) + text; applied++;
    }
  }
  return { md: lines.join(eol), applied };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [cmd, a, ...rest] = process.argv.slice(2);
  const get = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    const readJson = (f) => (f ? JSON.parse(readFileSync(f, 'utf8')) : undefined);
    if (cmd === 'locate') console.log(JSON.stringify(locate()));
    else if (cmd === 'fix') {
      const f = fix(readJson(a));
      writeFileSync(get('--out'), `${JSON.stringify({ items: f.items }, null, 1)}\n`, 'utf8');
      console.log(JSON.stringify({ out: resolve(get('--out')), fixed: f.items.length, commas: f.commas }));
    } else if (cmd === 'detect') {
      const f = detect(readJson(a), readJson(get('--fixed')));
      writeFileSync(get('--out'), `${JSON.stringify(f, null, 1)}\n`, 'utf8');
      const by = {}; for (const it of f.items) for (const t of it.tells) by[t] = (by[t] || 0) + 1;
      console.log(JSON.stringify({ out: resolve(get('--out')), flagged: f.items.length, chars: f.items.reduce((m, x) => m + x.text.length, 0), tells: by }));
    } else if (cmd === 'pack') {
      const dir = get('--out-dir');
      const chunks = pack(JSON.parse(readFileSync(a, 'utf8')), Number(get('--max') || 4500));
      const inputs = chunks.map((body, k) => {
        const d = join(dir, `chunk-${k + 1}`); mkdirSync(d, { recursive: true });
        const f = join(d, '01_input.txt'); writeFileSync(f, `${body}\n`, 'utf8'); return resolve(f).replace(/\\/g, '/');
      });
      console.log(JSON.stringify({ chunks: inputs.length, inputs }));
    } else if (cmd === 'texts-json') {
      const files = [a, ...rest.filter((x, k) => x && !x.startsWith('--') && !['--out', '--skip'].includes(rest[k - 1]))].map(f => resolve(f));
      const t = jsonTexts(files.map(f => JSON.parse(readFileSync(f, 'utf8'))), (get('--skip') || '').split(',').filter(Boolean));
      writeFileSync(get('--out'), `${JSON.stringify({ ...t, files }, null, 1)}\n`, 'utf8');
      console.log(JSON.stringify({ out: resolve(get('--out')), files: files.length, items: t.items.length }));
    } else if (cmd === 'apply-json') {
      const texts = readJson(a); const files = arr(texts.files);
      const r = jsonApply(files.map(f => JSON.parse(readFileSync(f, 'utf8'))), texts, readJson(rest[0]));
      r.docs.forEach((d, k) => writeFileSync(files[k], `${JSON.stringify(d, null, 2)}\n`, 'utf8'));
      console.log(JSON.stringify({ files: files.length, applied: r.applied }));
    } else if (cmd === 'texts-md') {
      const t = mdTexts(readFileSync(a, 'utf8'));
      writeFileSync(get('--out'), `${JSON.stringify({ ...t, file: resolve(a) }, null, 1)}\n`, 'utf8');
      console.log(JSON.stringify({ out: resolve(get('--out')), items: t.items.length }));
    } else if (cmd === 'apply-md') {
      const texts = readJson(a);
      const r = mdApply(readFileSync(texts.file, 'utf8'), texts, readJson(rest[0]));
      writeFileSync(texts.file, r.md, 'utf8');
      console.log(JSON.stringify({ file: texts.file, applied: r.applied }));
    } else if (cmd === 'unpack') {
      const r = unpack(a, readJson(get('--base')));
      writeFileSync(get('--out'), `${JSON.stringify({ items: r.items }, null, 1)}\n`, 'utf8');
      console.log(JSON.stringify({ out: resolve(get('--out')), ...r.stats }));
    } else {
      console.error('Usage: node humanize.mjs locate | fix | detect | pack | unpack | texts-json | apply-json | texts-md | apply-md (see the header)');
      process.exit(2);
    }
  } catch (e) {
    console.error(`humanize: ${e.message}`);
    process.exit(1);
  }
}

// sc4sap:program-to-spec — versioned spec pages, their revision history, and
// the import of a page the reader edited. Same model as the manual
// (scripts/manual/build-manual.mjs):
//
//   <dir>/<OBJECT>-v<major.minor>-<lang>.md      the source of that version
//   <dir>/<OBJECT>-v<major.minor>-<lang>.html    the editable page built from it
//   <dir>/<OBJECT>-<lang>.history.json           { object, lang, versions: [{ version, date, author, note, source? }] }
//
// First version 1.0. A build adds +0.1 (default), +1.0 (--major) or keeps the
// latest version (--same-version, the review loop); --version V sets it (the
// English companion mirrors the first language's version). A build that makes
// a new version from an older .md copies it to the new version's name first,
// so every version keeps its own source.
//
// An edited page (spec-editor.mjs Save → <OBJECT>-v<ver>-<lang>-edited.html)
// carries the revision the reader entered (version +0.1, date, author, note).
// --import converts the page back to Markdown (html-to-md.mjs) and writes it
// as that version's .md (the old file kept as .bak), writes replaced images
// next to it, imports changed flows into the image-spec (flow-editor.mjs), and
// adds the revision to history.json (source: "edit"). Rebuild with
// --same-version to publish exactly that version.
//
// CLI (through md-to-html.mjs, which hands these flags to runCli below)
//   node md-to-html.mjs <in.md> [out.html] --editable [--version V | --same-version | --major]
//        [--history H | --no-history] [--author A] [--note N] [--out-dir D]
//     out.html omitted → <out-dir or the .md's folder>/<OBJECT>-v<ver>-<lang>.html (+ the .md under
//     that version's name). Prints { html, md, version, history, warnings }.
//   node md-to-html.mjs --next-version --history H [--major]
//     prints the version the next build gets (1.0 when there is no history yet)
//   node md-to-html.mjs --import <edited.html> <spec.md> [--image-spec J] [--history H]
//     prints { md, backup, changed, assets, flows, revisions, sourceChanged, rebuild }

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { mdToHtml } from './md-to-html.mjs';
import { htmlToMd } from './html-to-md.mjs';
import { editedFlows, importEditedFlows } from './flow-editor.mjs';

const arr = (x) => (Array.isArray(x) ? x.filter((v) => v != null) : []);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const versionKey = (v) => String(v).split('.').map((n) => Number(n) || 0);
const byVersion = (a, b) => { const [x, y] = [versionKey(a.version), versionKey(b.version)]; return x[0] - y[0] || x[1] - y[1]; };

/** `ZSDR01-v1.2-ko.md` → { object, version: '1.2', lang }; `ZSDR01-20261012-ko.md` → { object, date, lang }. */
export function parseSpecName(file) {
  const base = basename(String(file)).replace(/\.(md|markdown|html?)$/i, '').replace(/-edited$/i, '');
  let m = /^(.+?)-v(\d+\.\d+)-([a-z]{2})$/i.exec(base);
  if (m) return { object: m[1], version: m[2], lang: m[3].toLowerCase() };
  m = /^(.+?)-(\d{8})-([a-z]{2})$/i.exec(base);
  if (m) return { object: m[1], date: m[2], lang: m[3].toLowerCase() };
  m = /^(.+?)-([a-z]{2})$/i.exec(base);
  return m ? { object: m[1], lang: m[2].toLowerCase() } : null;
}

export const specFileName = (object, version, lang, ext) => `${object}-v${version}-${lang}.${ext}`;
export const historyFileName = (object, lang) => `${object}-${lang}.history.json`;

export function readHistory(path, object, lang) {
  if (path && existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  return { object, lang, versions: [] };
}

export function nextVersion(history, { sameVersion = false, major = false } = {}) {
  const last = arr(history?.versions).at(-1)?.version;
  if (!last) return '1.0';
  if (sameVersion) return last;
  const [ma, mi] = String(last).split('.').map((n) => Number(n) || 0);
  return major ? `${ma + 1}.0` : `${ma}.${mi + 1}`;
}

/**
 * Puts `version` into history.versions: a new entry, or — rebuilding the latest
 * version — that entry, keeping its author / note (a page edit keeps its date
 * too) unless new ones are given. Returns the entry.
 */
export function recordVersion(history, version, { author = '', note = '', defaultAuthor = '' } = {}) {
  const versions = arr(history.versions);
  const i = versions.findIndex((v) => v.version === version);
  const old = i >= 0 ? versions[i] : null;
  const entry = old
    ? { ...old, date: old.source === 'edit' ? old.date : today(), author: author || old.author || defaultAuthor, note: note || old.note || '' }
    : { version, date: today(), author: author || defaultAuthor, note };
  if (i >= 0) versions[i] = entry;
  else versions.push(entry);
  history.versions = versions.sort(byVersion);
  return entry;
}

/** Builds the editable, versioned page of one spec .md. */
export function buildSpecHtml({
  mdPath, outPath, outDir, version, sameVersion = false, major = false,
  historyPath, noHistory = false, author = '', note = '', defaultAuthor = '',
}) {
  const src = resolve(mdPath);
  const name = parseSpecName(src) || {};
  const lang = name.lang || 'en';
  const object = name.object || basename(src).replace(/\.(md|markdown)$/i, '');
  const dir = resolve(outDir || (outPath ? dirname(outPath) : dirname(src)));
  mkdirSync(dir, { recursive: true });
  const warnings = [];

  const hp = noHistory ? null : resolve(historyPath || join(dir, historyFileName(object, lang)));
  const history = readHistory(hp, object, lang);
  const ver = version || nextVersion(history, { sameVersion, major });
  if (!/^\d+\.\d+$/.test(ver)) throw new Error(`version "${ver}" is not <major>.<minor>`);
  if (hp) {
    const entry = recordVersion(history, ver, { author, note, defaultAuthor });
    const previous = history.versions[history.versions.indexOf(entry) - 1];
    if (entry.note && previous?.note === entry.note) warnings.push(`note "${entry.note}" repeats v${previous.version}'s — describe what changed in v${ver}`);
    writeFileSync(hp, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  }

  // Every version keeps its own source: an older .md built as a new version is copied first.
  let md = src;
  if (!outPath) {
    const target = join(dir, specFileName(object, ver, lang, 'md'));
    if (resolve(target) !== src) {
      if (existsSync(target)) copyFileSync(target, `${target}.bak`);
      copyFileSync(src, target);
      md = target;
      if (dirname(target) !== dirname(src) && /!\[[^\]]*\]\((?!https?:|data:|\/)/.test(readFileSync(src, 'utf8'))) {
        warnings.push(`${basename(target)} is in another folder than ${basename(src)} — its relative image links no longer resolve there`);
      }
    }
  }
  const html = mdToHtml(readFileSync(src, 'utf8'), {
    baseDir: dirname(src), lang, editable: true, version: ver, history: hp ? history.versions : [], object,
  });
  const htmlPath = resolve(outPath || join(dir, specFileName(object, ver, lang, 'html')));
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, html, 'utf8');
  return { html: htmlPath, md, version: ver, history: hp, warnings };
}

/** The newest `_img/<OBJECT>-<YYYYMMDD>[-en].image-spec.json` next to the spec, or null. */
export function findImageSpec(mdDir, object, lang) {
  const dir = join(mdDir, '_img');
  if (!existsSync(dir)) return null;
  const re = new RegExp(`^${object.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{8}${lang === 'en' ? '-en' : ''}\\.image-spec\\.json$`);
  const hits = readdirSync(dir).filter((f) => re.test(f)).map((f) => join(dir, f));
  hits.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return hits[0] || null;
}

/**
 * Imports a page the reader edited and saved. `mdPath` is the .md the page was
 * built from; the result goes to the .md of the page's newest revision when
 * the name is versioned (ZX-v1.0-ko.md + revision 1.1 → ZX-v1.1-ko.md), else
 * back to `mdPath`.
 */
export function importEditedSpec(htmlPath, mdPath, { imageSpec, historyPath } = {}) {
  const html = readFileSync(htmlPath, 'utf8');
  const base = resolve(mdPath);
  const mdDir = dirname(base);
  const name = parseSpecName(base) || {};
  const res = htmlToMd(html, {
    exists: (rel) => existsSync(join(mdDir, rel)),
    mdStem: basename(base).replace(/\.(md|markdown)$/i, ''),
  });
  const S = res.source;
  if (!S || typeof S.md !== 'string') throw new Error(`${htmlPath} has no embedded spec source — was the page built with --editable?`);
  const object = name.object || S.object;
  const lang = name.lang || S.lang;

  const revisions = arr(S.revisions).slice().sort(byVersion);
  const latest = revisions.at(-1)?.version;
  const out = latest && name.version && latest !== name.version ? join(mdDir, specFileName(object, latest, lang, 'md')) : base;

  // Line endings and BOM as the file on disk has them.
  const onDisk = existsSync(base) ? readFileSync(base, 'utf8') : null;
  let text = res.md;
  if (onDisk && /\r\n/.test(onDisk)) text = text.replace(/\r?\n/g, '\r\n');
  if (S.bom) text = `﻿${text}`;
  const sourceChanged = onDisk != null && onDisk.replace(/^﻿/, '').replace(/\r\n?/g, '\n') !== S.md;

  const backup = existsSync(out) ? `${out}.bak` : null;
  if (backup) copyFileSync(out, backup);
  for (const a of res.assets) {
    const fp = join(mdDir, a.path);
    mkdirSync(dirname(fp), { recursive: true });
    writeFileSync(fp, a.data);
  }
  writeFileSync(out, text, 'utf8');

  // Flows changed in the page go into the image-spec (re-render the images afterwards).
  const flowKeys = editedFlows(html).map((f) => f.key);
  let flows = null;
  if (flowKeys.length) {
    const spec = imageSpec ? resolve(imageSpec) : findImageSpec(mdDir, object, lang);
    flows = spec && existsSync(spec)
      ? { imageSpec: spec, ...importEditedFlows(htmlPath, spec) }
      : { imageSpec: null, edited: flowKeys, note: 'no image-spec found — pass --image-spec to import the edited flows' };
  }

  let history = null;
  if (revisions.length) {
    const hp = resolve(historyPath || join(mdDir, historyFileName(object, lang)));
    const h = readHistory(hp, object, lang);
    const kept = arr(h.versions).filter((v) => !revisions.some((r) => r.version === v.version));
    h.versions = [...kept, ...revisions.map((r) => ({ ...r, source: 'edit' }))].sort(byVersion);
    writeFileSync(hp, `${JSON.stringify(h, null, 2)}\n`, 'utf8');
    history = { history: hp, added: revisions.map((r) => r.version) };
  }

  return {
    md: out, base, backup, version: latest || name.version || S.version || null,
    changed: res.changed, missing: res.missing, assets: res.assets.map((a) => a.path),
    flows, revisions: history, sourceChanged,
    rebuild: `node scripts/spec/md-to-html.mjs "${out}" --editable --same-version`,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const VALUE_FLAGS = new Set(['--version', '--history', '--author', '--note', '--out-dir', '--image-spec']);

function parseArgs(args) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const eq = a.indexOf('=');
    const key = eq > 0 ? a.slice(0, eq) : a;
    if (VALUE_FLAGS.has(key)) {
      const v = eq > 0 ? a.slice(eq + 1) : args[++i];
      if (v == null || v.startsWith('--')) throw new Error(`${key} needs a value`);
      opts[key.slice(2)] = v;
    } else if (a.startsWith('--')) opts[a.slice(2)] = true;
    else pos.push(a);
  }
  return { opts, pos };
}

async function configAuthor() {
  try {
    const { readManualConfig } = await import('../manual/manual-config.mjs');
    return readManualConfig(process.cwd())?.manual?.author || '';
  } catch { return ''; }
}

export async function runCli(args) {
  const { opts, pos } = parseArgs(args);
  if (opts.import) {
    const [htmlPath, mdPath] = pos;
    if (!htmlPath || !mdPath) throw new Error('Usage: node md-to-html.mjs --import <edited.html> <spec.md> [--image-spec J] [--history H]');
    const res = importEditedSpec(resolve(htmlPath), resolve(mdPath), { imageSpec: opts['image-spec'], historyPath: opts.history });
    console.log(JSON.stringify(res, null, 2));
    return res;
  }
  if (opts['next-version']) {
    if (!opts.history) throw new Error('Usage: node md-to-html.mjs --next-version --history <history.json> [--major]');
    const v = nextVersion(readHistory(resolve(opts.history)), { major: !!opts.major });
    console.log(v);
    return v;
  }
  const [inPath, outPath] = pos;
  if (!inPath) throw new Error('Usage: node md-to-html.mjs <in.md> [out.html] --editable [--version V | --same-version | --major] [--history H | --no-history]');
  if (!opts.editable) throw new Error('--version / --history / --same-version / --major need --editable');
  const res = buildSpecHtml({
    mdPath: inPath, outPath, outDir: opts['out-dir'], version: opts.version,
    sameVersion: !!opts['same-version'], major: !!opts.major,
    historyPath: opts.history, noHistory: !!opts['no-history'],
    author: opts.author || '', note: opts.note || '', defaultAuthor: await configAuthor(),
  });
  for (const w of res.warnings) console.log(`⚠ md-to-html: ${w}`);
  console.log(JSON.stringify(res, null, 2));
  return res;
}

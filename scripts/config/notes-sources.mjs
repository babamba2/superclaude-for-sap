// config-to-document — official SAP sources a reviewer opened and accepted, per
// module and language, under ~/.sc4sap/kb/config/<M>/sources-<lang>.json.
// A writer may cite a verified source with its cached summary without opening
// it again; the reviewer opens only sources that are new or changed.

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { sc4sapHome } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync, ensureDirSync } from '../lib/atomic-write.mjs';

const fileOf = (module, lang) => join(sc4sapHome(), 'kb', 'config', module, `sources-${lang}.json`);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** { url: { title, source, summaries: [{ text, activity, origin, at }], activities, tables } } */
export function readSources(module, lang) {
  const f = fileOf(module, lang);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}

/** 'verified' (URL and summary accepted before), 'changed' (URL accepted, other summary) or 'new'. */
export function sourceStatus(cache, s) {
  const e = cache[s.url];
  if (!e) return 'new';
  return e.summaries.some((x) => norm(x.text) === norm(s.summary)) ? 'verified' : 'changed';
}

/** Record accepted sources: entries [{ id, tables, sources }], already filtered to official URLs. */
export function recordSources(module, lang, entries, origin) {
  const cache = readSources(module, lang);
  let added = 0;
  for (const { id, tables = [], sources = [] } of entries) {
    for (const s of sources) {
      if (!s.url) continue;
      const e = (cache[s.url] ||= { title: s.title, source: s.source, summaries: [], activities: [], tables: [] });
      if (!e.summaries.some((x) => norm(x.text) === norm(s.summary))) {
        e.summaries.push({ text: s.summary, activity: id, origin, at: new Date().toISOString() });
        added++;
      }
      if (!e.activities.includes(id)) e.activities.push(id);
      for (const t of tables) if (!e.tables.includes(t)) e.tables.push(t);
    }
  }
  const f = fileOf(module, lang);
  ensureDirSync(dirname(f));
  atomicWriteFileSync(f, JSON.stringify(cache, null, 1));
  return { added, urls: Object.keys(cache).length };
}

/** Verified sources for one activity: its own first, then by shared tables; at most `max`. */
export function sourceHints(cache, id, tables, max = 6) {
  const own = new Set(tables);
  return Object.entries(cache)
    .map(([url, e]) => ({ url, e, own: e.activities.includes(id), shared: e.tables.filter((t) => own.has(t)).length }))
    .filter((x) => x.own || x.shared)
    .sort((a, b) => b.own - a.own || b.shared - a.shared)
    .slice(0, max)
    .map(({ url, e, own: mine }) => {
      const s = e.summaries.find((x) => x.activity === id) || e.summaries[0];
      return { title: e.title, source: e.source, url, summary: s.text, citedFor: mine ? 'this activity' : e.activities.slice(0, 3).join(', ') };
    });
}

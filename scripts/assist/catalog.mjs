#!/usr/bin/env node
// Runtime view of the business-action catalogs (configs/<MODULE>/actions.json)
// for /sc4sap:assist. The skill never hardcodes the action list: it asks this
// script, so a new action in a catalog is usable without touching the skill.
//
// Usage:
//   node scripts/assist/catalog.mjs list   [--family ECC|S4] [--module MM]
//   node scripts/assist/catalog.mjs match  "<user text>" [--family ECC|S4] [--top 5]
//   node scripts/assist/catalog.mjs show   <ACTION.ID>
//   node scripts/assist/catalog.mjs triggers [--lang en|ko]
//
// --family defaults to the sapVersion in .sc4sap/config.json (S4* → S4, else ECC).
// Actions without a verified_on entry for the family are hidden (list / match).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIGS = join(ROOT, 'configs');

/** Loads every configs/<M>/actions.json → [{module, notes, actions}] */
export function loadCatalogs(dir = CONFIGS) {
  const out = [];
  for (const m of readdirSync(dir)) {
    const f = join(dir, m, 'actions.json');
    if (!existsSync(f)) continue;
    const cat = JSON.parse(readFileSync(f, 'utf-8'));
    out.push({ module: cat.module ?? m, notes: cat.notes ?? [], actions: cat.actions ?? [] });
  }
  return out;
}

/** ECC | S4 from a sapVersion string ("S4", "S4 On-Prem", "ECC", …). */
export function familyOf(sapVersion) {
  return /^s\/?4/i.test(String(sapVersion ?? '').trim()) ? 'S4' : 'ECC';
}

function defaultFamily(cwd = process.cwd()) {
  for (const p of [join(cwd, '.sc4sap', 'config.json')]) {
    if (existsSync(p)) {
      try {
        return familyOf(JSON.parse(readFileSync(p, 'utf-8')).sapVersion);
      } catch {
        /* fall through */
      }
    }
  }
  return 'ECC';
}

/** True when the action is verified on the given family (ECC / S4). */
export function isVerified(action, family) {
  const v = Array.isArray(action.verified_on) ? action.verified_on : [];
  return v.some((e) => (typeof e === 'string' ? e.toUpperCase().includes(family) : e?.family === family));
}

export function allActions(catalogs, family) {
  return catalogs.flatMap((c) => c.actions.map((a) => ({ ...a, module: c.module }))).filter((a) => !family || isVerified(a, family));
}

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Scores actions against free text: an intent phrase found in the text scores
 * its length (longer phrase = more specific); an ambiguity term found adds the
 * action as a candidate and returns the clarifying question.
 */
export function matchText(text, actions, top = 5) {
  const t = norm(text);
  const scored = [];
  const ambiguities = new Map();
  for (const a of actions) {
    let score = 0;
    const hits = [];
    for (const p of [...(a.intents?.en ?? []), ...(a.intents?.ko ?? [])]) {
      const n = norm(p);
      if (n && t.includes(n)) {
        score += n.length;
        hits.push(p);
      }
    }
    const amb = a.ambiguity;
    if (amb) {
      const terms = [amb.term?.en, amb.term?.ko].filter(Boolean).map(norm);
      if (terms.some((x) => t.includes(x))) {
        ambiguities.set(amb.candidates?.join('|') ?? a.id, { term: amb.term, candidates: amb.candidates ?? [a.id], ask: amb.ask });
        if (score === 0) score = 1;
      }
    }
    if (score > 0) scored.push({ id: a.id, kind: a.kind, risk: a.risk, title: a.title, score, hits });
  }
  scored.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
  return { candidates: scored.slice(0, top), ambiguities: [...ambiguities.values()] };
}

export function triggerWords(catalogs, lang) {
  const set = new Set();
  for (const c of catalogs) for (const a of c.actions) for (const w of a.intents?.[lang] ?? []) set.add(w);
  return [...set];
}

function arg(argv, name, dflt) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}

function main(argv) {
  const [cmd, first] = argv;
  const catalogs = loadCatalogs();
  const family = arg(argv, '--family', defaultFamily()).toUpperCase();
  if (cmd === 'list') {
    const mod = arg(argv, '--module', '');
    const rows = allActions(catalogs, family).filter((a) => !mod || a.module === mod.toUpperCase());
    for (const a of rows) console.log(`${a.id}\t${a.kind}\t${a.risk}\t${a.title ?? ''}`);
    console.error(`${rows.length} actions verified on ${family}`);
    return 0;
  }
  if (cmd === 'match' && first) {
    const res = matchText(first, allActions(catalogs, family), Number(arg(argv, '--top', '5')));
    console.log(JSON.stringify({ family, ...res }, null, 2));
    return 0;
  }
  if (cmd === 'show' && first) {
    const a = allActions(catalogs, null).find((x) => x.id === first.toUpperCase());
    if (!a) {
      console.error(`unknown action ${first}`);
      return 1;
    }
    console.log(JSON.stringify({ ...a, verified_for_family: isVerified(a, family) }, null, 2));
    return 0;
  }
  if (cmd === 'triggers') {
    console.log(triggerWords(catalogs, arg(argv, '--lang', 'ko')).join(', '));
    return 0;
  }
  console.error('usage: catalog.mjs list|match "<text>"|show <ID>|triggers [--family ECC|S4] [--module M] [--lang en|ko]');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}

// sc4sap form fidelity harness — SmartForm → Adobe conversion: SAP's print of each SmartForm against SAP's print of its
// migrated Adobe form(s), same interface values. Both prints are rendered by the operator beforehand (RenderSmartForm /
// RenderAdobeForm); this script only scores. No SAP call.
//
//   node conversion.mjs --pairs <pairs.json> --out <dir>
//     pairs.json: { "ID": { "ref": "<SmartForm print>.pdf", "candidates": { "corrected": "<pdf>", "plain": "<pdf>" },
//                           "fallback": true|false } }   (paths relative to pairs.json; fallback = the SmartForm print
//                           used a device font fallback, reported apart)
//     --out: report.json (per ID and kind: percent, textPercent, pagesMismatch, counts) + averages: delivered (corrected,
//            else plain) and plain, all and without the fallback entries
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scoreFidelity } from '../score-fidelity.mjs';
import { existsSync, join, mkdirSync, parseArgs, readFileSync, readJson, writeFileSync } from './common.mjs';

const avg = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100 : null);

/** Scores the pairs → { rows, summary }. read: a path → Buffer (tests pass their own). */
export function scorePairs(pairs, read) {
  const rows = [];
  for (const [id, p] of Object.entries(pairs)) {
    const ref = read(p.ref);
    const row = { id, fallback: !!p.fallback };
    for (const [kind, file] of Object.entries(p.candidates || {})) {
      if (!file) { row[kind] = null; continue; }
      const s = scoreFidelity(ref, read(file));
      row[kind] = { percent: s.percent, textPercent: s.textPercent, pagesMismatch: s.pagesMismatch, counts: s.counts };
    }
    rows.push(row);
  }
  const delivered = (r) => (r.corrected ? r.corrected.percent : r.plain?.percent);
  const part = (rs) => ({ n: rs.length, delivered: avg(rs.map(delivered).filter((x) => x !== undefined)), plain: avg(rs.filter((r) => r.plain).map((r) => r.plain.percent)) });
  return { rows, summary: { all: part(rows), withoutFallback: part(rows.filter((r) => !r.fallback)), passed98: rows.filter((r) => delivered(r) >= 98).map((r) => r.id) } };
}

async function main() {
  const a = parseArgs(process.argv.slice(2), ['pairs', 'out']);
  const base = dirname(a.pairs);
  const read = (f) => { const p = existsSync(f) ? f : join(base, f); return readFileSync(p); };
  const r = scorePairs(readJson(a.pairs), read);
  mkdirSync(a.out, { recursive: true });
  writeFileSync(join(a.out, 'report.json'), JSON.stringify(r, null, 1));
  for (const row of r.rows) console.log(row.id, row.fallback ? '(fallback)' : '', Object.entries(row).filter(([k]) => !['id', 'fallback'].includes(k)).map(([k, v]) => `${k} ${v ? `${v.percent}${v.pagesMismatch ? ' PAGES' : ''}` : '—'}`).join(' | '));
  console.log('SUMMARY', JSON.stringify(r.summary));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

// sc4sap form fidelity harness — shared helpers: arguments, one preview build, scoring, the corpus summary.
// No SAP call here: the harnesses build previews locally and score them against SAP's PDFs the operator rendered.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreCorpus, scoreFidelity } from '../score-fidelity.mjs';

export const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** --key value arguments; flags without a value are true. Unknown keys are kept. */
export function parseArgs(argv, required = []) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) o[k] = true;
    else { o[k] = v; i++; }
  }
  const missing = required.filter((k) => o[k] === undefined || o[k] === true);
  if (missing.length) throw new Error(`missing argument(s): ${missing.map((k) => `--${k} <…>`).join(' ')}`);
  if (o.only && o.only !== true) o.only = new Set(String(o.only).split(','));
  return o;
}

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Runs a preview builder (scripts/<rel>) and returns the layout JSON it wrote into od. */
export function buildLayout(rel, args, od, timeout = 180000) {
  mkdirSync(od, { recursive: true });
  execFileSync(process.execPath, [join(SCRIPTS, rel), ...args], { stdio: ['ignore', 'pipe', 'pipe'], timeout });
  const lay = readdirSync(od).find((x) => x.endsWith('-preview.layout.json'));
  if (!lay) throw new Error('no layout.json');
  return readJson(join(od, lay));
}

/** Scores a print (layout JSON or PDF buffer) against SAP's PDF, writes fidelity.json, logs one line. */
export function scoreOne(name, refPdf, cand, od, results, log = console.log) {
  const r = scoreFidelity(refPdf, cand);
  if (od) writeFileSync(join(od, 'fidelity.json'), JSON.stringify(r, null, 1));
  results.push({ name, ...r });
  log(name, r.percent, 'text', r.textPercent, r.pagesMismatch ? `PAGES ${r.counts.refPages}/${r.counts.candPages}` : '', JSON.stringify(r.counts));
  return r;
}

export function failOne(name, err, results, log = console.log) {
  results.push({ name, score: null, error: String(err?.message || err).slice(0, 300) });
  log(name, 'ERROR', String(err?.message || err).slice(0, 160));
}

/** Writes <out>/corpus.json (summary + per form) and logs the CORPUS line. */
export function writeCorpus(out, results, log = console.log) {
  const c = scoreCorpus(results);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'corpus.json'), JSON.stringify({ ...c, details: results.map((r) => ({ name: r.name, percent: r.percent, textPercent: r.textPercent, pagesMismatch: r.pagesMismatch, counts: r.counts, error: r.error })) }, null, 1));
  log('CORPUS', c.averagePercent, 'text', c.textAveragePercent, 'measured', c.measured, 'of', c.forms.length, 'pagesMismatch', c.pagesMismatch.length);
  return c;
}

export { existsSync, join, mkdirSync, readFileSync, writeFileSync };

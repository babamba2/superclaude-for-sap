/**
 * CSV injection (OWASP): every CSV writer of the plugin gives a cell that starts with = + - @, a tab or a CR a
 * leading apostrophe, so a spreadsheet shows it as text, never runs it as a formula. One rule
 * (scripts/lib/csv-safe.mjs, the same as project/doc-kit.mjs csvOf), six writers:
 *   doc-kit csvOf (cutover / meeting / migration / weekly), role-model toCsv (role export + CLI),
 *   the role page's in-browser toCsv (inlined), gap page csv(), project dashboard exportCsv(), relation map CSVs.
 * The page scripts cannot import: their copy of the rule is read out of the source and run here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { CSV_FORMULA_START, csvSafe } from '../../scripts/lib/csv-safe.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { csvOf } from '../../scripts/project/doc-kit.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { toCsv } from '../../scripts/role/role-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderPage } from '../../scripts/role/role-page.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { csvSheets } from '../../scripts/role/role-ops.mjs';

const SCRIPTS = join(__dirname, '..', '..', 'scripts');
const src = (f: string) => readFileSync(join(SCRIPTS, f), 'utf8').replace(/\r\n/g, '\n');

// [cell text, what a spreadsheet must get (before CSV quoting)]
const CASES: [string, string][] = [
  ['=1+2', "'=1+2"],
  ['=HYPERLINK("http://x","y")', '\'=HYPERLINK("http://x","y")'],
  ['+SUM(A1:A9)', "'+SUM(A1:A9)"],
  ['-12.5', "'-12.5"], // the same as doc-kit: numbers are not special-cased
  ['@cmd', "'@cmd"],
  ['\tx', "'\tx"],
  ['\rx', "'\rx"],
  ['a-b', 'a-b'],
  ['A=B', 'A=B'],
  ['plain', 'plain'],
  ['', ''],
  ["'=already", "'=already"],
];
/** One CSV cell back to its text (RFC 4180). */
const unquote = (c: string) => (c.startsWith('"') && c.endsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c);
/** The cells of a one-line body after a header line. */
const bodyCells = (csv: string) => {
  const body = csv.replace(/^﻿/, '').split('\r\n')[1] ?? '';
  // cells here never contain a comma outside quotes except as separators: split on commas outside quotes
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const ch of body) {
    if (ch === '"') q = !q;
    if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map(unquote);
};
/** A page script's cell function, taken out of its source and run (the copy is what the browser runs). */
function cellFrom(file: string, pattern: RegExp, name: string): (s: unknown) => string {
  const m = pattern.exec(src(file));
  expect(m, `${file}: cell function not found`).not.toBeNull();
  const fn = new Function(`${m![0]}; return ${name};`)() as (s: unknown) => string;
  return fn;
}

describe('CSV injection — one rule', () => {
  it('lib/csv-safe.mjs is the doc-kit rule', () => {
    expect(CSV_FORMULA_START.source).toBe('^[=+\\-@\\t\\r]');
    expect(src('project/doc-kit.mjs')).toContain(`/${CSV_FORMULA_START.source}/.test(s) ? \`'\${s}\` : s`);
    for (const [input, want] of CASES) expect(csvSafe(input)).toBe(want);
  });

  it('every page-script copy is the same rule (source comment points to lib/csv-safe.mjs)', () => {
    for (const f of ['process/gap-page.mjs', 'project/project-client.js', 'relmap/relmap-client.js']) {
      const s = src(f);
      expect(s, f).toContain(`/${CSV_FORMULA_START.source}/.test(`);
      expect(s, f).toContain('scripts/lib/csv-safe.mjs');
    }
  });
});

describe('CSV injection — the six writers', () => {
  it('doc-kit csvOf (cutover, meeting, migration, weekly exports)', () => {
    for (const [input, want] of CASES) expect(bodyCells(csvOf([{ a: input, b: 'z' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]))).toEqual([want, 'z']);
  });

  it('role-model toCsv (the role workbook CSV export, server and CLI)', () => {
    for (const [input, want] of CASES) expect(bodyCells(toCsv(['A', 'B'], [[input, 'z']]))).toEqual([want, 'z']);
    // through the export itself: a SoD rule typed (or imported) as a formula
    const sod = csvSheets({ lang: 'en', doc: { code: 'T' }, sod: [{ id: 'SOD-01', a: '=cmd|"/c calc"!A1', b: '@B', kind: '+k', risk: '-r', level: 'H', status: 'open' }] }, 'en').sod;
    expect(bodyCells(sod).slice(0, 5)).toEqual(['SOD-01', '\'=cmd|"/c calc"!A1', "'@B", "'+k", "'-r"]);
  });

  it("the role page's in-browser toCsv (lib/csv-safe.mjs inlined in front of role-model.mjs)", () => {
    const html: string = renderPage({ lang: 'en', doc: { code: 'T' } }, { version: '0.1', date: '2026-11-18' });
    const start = html.indexOf('(function(){\n');
    const end = html.indexOf('\nvar E=', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const prelude = html.slice(start + '(function(){\n'.length, end);
    expect(prelude.indexOf('const CSV_FORMULA_START')).toBeGreaterThan(-1);
    expect(prelude.indexOf('const CSV_FORMULA_START')).toBeLessThan(prelude.indexOf('function toCsv'));
    // the inlined code is the browser's: run it and use its toCsv
    const pageToCsv = new Function(`${prelude}\nreturn toCsv;`)() as (h: string[], r: string[][]) => string;
    for (const [input, want] of CASES) expect(bodyCells(pageToCsv(['A', 'B'], [[input, 'z']]))).toEqual([want, 'z']);
  });

  it('gap page csv() cell', () => {
    const cell = cellFrom('process/gap-page.mjs', /var cell = function\(x\)\{[^\n]*\};/, 'cell');
    for (const [input, want] of CASES) expect(unquote(cell(input))).toBe(want);
    expect(cell(null)).toBe('');
  });

  it('project dashboard exportCsv() cell', () => {
    const q = cellFrom('project/project-client.js', /var q = function \(s\) \{[^\n]*\};/, 'q');
    for (const [input, want] of CASES) expect(unquote(q(input))).toBe(want);
  });

  it('relation map exportCsv() / fxCsv() cell (every cell quoted)', () => {
    const s = src('relmap/relmap-client.js');
    expect(s).toMatch(/const q = csvCell;\n\s+const rows = \[\['from_type'/);
    expect(s).toMatch(/const q = csvCell, \[name, , , fields\]/);
    const cell = cellFrom('relmap/relmap-client.js', /function csvCell\(s\) \{[^\n]*\}/, 'csvCell');
    for (const [input, want] of CASES) {
      const out = cell(input);
      expect(out.startsWith('"') && out.endsWith('"')).toBe(true);
      expect(unquote(out)).toBe(want);
    }
  });
});

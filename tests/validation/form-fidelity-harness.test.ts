import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { condOk, programValues, sampleValues } from '../../scripts/forms-common/fidelity/sf-samples.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { parseArgs, writeCorpus } from '../../scripts/forms-common/fidelity/common.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { scorePairs } from '../../scripts/forms-common/fidelity/conversion.mjs';

// A small synthetic SmartForm (invented names and values): a loop over flights with a sort event on CARRID whose
// sort-begin code clears a subtotal table and whose body collects into it; the subtotal loop prints in the sort-end event.
const code = (name: string, lines: string[]) => `<sf:CODE><NAME><INAME>${name}</INAME></NAME>${lines.map((l) => `<item>${l}</item>`).join('')}</sf:CODE>`;
const xml = `<x>${code('INIT', ['refresh gt_sub.'])}${code('CALC', ['gs_sub-curr = gs_fl-curr.', 'gs_sub-price = gs_fl-price.', 'collect gs_sub into gt_sub.'])}</x>`;
const content = { pages: [{ windows: [{ name: 'MAIN', type: 'MAIN', content: [{
  kind: 'section-C', name: 'T', dataTable: 'T_FL', attrs: { TABHEADER: 'GS_FL' }, children: [
    { kind: 'event', name: '%E1', attrs: { EVTYPE: 'S', SFIELD: 'CARRID' }, children: [{ kind: 'code', name: 'INIT', children: [] }] },
    { kind: 'code', name: 'CALC', children: [] },
    { kind: 'event', name: '%E2', attrs: { EVTYPE: 'E', SFIELD: 'CARRID' }, children: [
      { kind: 'loop', name: 'L', dataTable: 'GT_SUB', attrs: { TABHEADER: 'GS_SUB' }, children: [] },
    ] },
  ],
}] }] }] };
const raw = { T_FL: [
  { CARRID: 'ZZ', PRICE: 250, CURR: 'EUR' }, { CARRID: 'ZZ', PRICE: 980.5, CURR: 'EUR' },
  { CARRID: 'ZY', PRICE: 120, CURR: 'USD' }, { CARRID: 'ZY', PRICE: 75.25, CURR: 'USD' },
] };
const ddic = { 'T_FL-PRICE': { type: 'CURR', decimals: 2 }, 'T_FL-CURR': { type: 'CUKY' }, 'T_FL-CARRID': { type: 'CHAR', length: 3 } };

describe('form fidelity harness: SmartForm sample values (synthetic set)', () => {
  it('runs the program lines per sort group, sorted as the preview sorts, and keeps the subtotal table per group', () => {
    const r = programValues(content, xml, raw, ddic);
    expect(r.notes).toEqual([]);
    expect(r.perGroup.GT_SUB.map((g: any[]) => g.map((x) => `${x.CURR} ${x.PRICE}`))).toEqual([['USD 195.25'], ['EUR 1230.5']]);
    const v = sampleValues(content, xml, raw, ddic, '2026-11-18T00:00:00Z').values;
    expect(v['GS_SUB-PRICE']).toEqual([['195.25 '], ['1,230.50 ']]);
    expect(v['SY-DATUM']).toBe('11/18/2026');
  });
  it('is deterministic: the same inputs give the same values, and the inputs are not changed', () => {
    const before = JSON.stringify(raw);
    const a = JSON.stringify(sampleValues(content, xml, raw, ddic, '2026-11-18'));
    const b = JSON.stringify(sampleValues(content, xml, raw, ddic, '2026-11-18'));
    expect(a).toBe(b);
    expect(JSON.stringify(raw)).toBe(before);
  });
  it('decides only EQ / NE against a scalar interface value; anything else runs', () => {
    const n = (COP: string, OP1: string, OP2: string) => ({ condition: { COND: [{ COP, OP1, OP2 }] } });
    const iv = { NEW_TABLE_TYPE: 'X' };
    expect(condOk(n('EQ', 'NEW_TABLE_TYPE', "'X'"), iv)).toBe(true);
    expect(condOk(n('NE', 'NEW_TABLE_TYPE', "'X'"), iv)).toBe(false);
    expect(condOk(n('EQ', 'WA-FIELD', "'X'"), iv)).toBe(true);        // not an interface value: undecidable
    expect(condOk(n('EQ', 'NEW_TABLE_TYPE', 'INITIAL'), iv)).toBe(true); // INITIAL: undecidable
    expect(condOk(n('GT', 'NEW_TABLE_TYPE', "'A'"), iv)).toBe(true);
  });
});

describe('form fidelity harness: arguments and summaries', () => {
  it('reads --key value pairs, flags and --only lists; names a missing argument', () => {
    const a = parseArgs(['--set', 'S', '--only', 'A,B', '--dry'], ['set']);
    expect(a.set).toBe('S');
    expect([...a.only]).toEqual(['A', 'B']);
    expect(a.dry).toBe(true);
    expect(() => parseArgs(['--set'], ['set', 'out'])).toThrow(/--set <…> --out <…>/);
  });
  it('writes the same corpus.json for the same results', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fid-'));
    try {
      const res = [{ name: 'A', score: 0.9, percent: 90, textPercent: 88, pagesMismatch: false, counts: {} }, { name: 'B', score: null, error: 'x' }];
      writeCorpus(dir, res, () => {});
      const one = readFileSync(join(dir, 'corpus.json'), 'utf8');
      writeCorpus(dir, res, () => {});
      expect(readFileSync(join(dir, 'corpus.json'), 'utf8')).toBe(one);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('conversion averages delivered (corrected, else plain) and plain, with and without fallback entries', () => {
    // scoring itself is score-fidelity's; here every candidate is the reference (a layout JSON) → 100 %
    const fake = { A: { ref: 'r', candidates: { corrected: 'r', plain: null }, fallback: false }, B: { ref: 'r', candidates: { plain: 'r' }, fallback: true } };
    const layout = { pages: [{ w: 210, h: 297, texts: [{ x: 10, y: 10, w: 20, text: 'Hello', pt: 10 }], lines: [] }] };
    const r = scorePairs(fake, () => layout);
    expect(r.summary.all).toEqual({ n: 2, delivered: 100, plain: 100 });
    expect(r.summary.withoutFallback).toEqual({ n: 1, delivered: 100, plain: null });
    expect(r.summary.passed98).toEqual(['A', 'B']);
  });
});

describe('form fidelity harness: program-line globals and statements the runner skips', () => {
  it('passes the globals the code filled into the values (not loop work areas) and counts what it skipped', () => {
    const x = `<x>${code('READ_HD', ['CLEAR GS_HD.', 'GS_HD = IS_X-HD.', 'SELECT * FROM NAST INTO TABLE LT.'])}</x>`;
    const c = { pages: [{ windows: [{ name: 'MAIN', type: 'MAIN', content: [{ kind: 'code', name: 'READ_HD', children: [] },
      { kind: 'loop', name: 'L', dataTable: 'IS_X-IT', attrs: { TABHEADER: 'GS_IT' }, children: [] }] }] }] };
    const r = sampleValues(c, x, { IS_X: { HD: { NUMBER: 'ZZ1' }, IT: [{ ITM: '10' }] } }, {}, '');
    expect(r.values['GS_HD-NUMBER']).toBe('ZZ1');
    expect(r.values['GS_IT-ITM']).toEqual(['10']);
    expect(r.notes.join(' ')).toMatch(/1 program-line statement\(s\) not run/);
  });
});

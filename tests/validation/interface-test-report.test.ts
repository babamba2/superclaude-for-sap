import { describe, it, expect } from 'vitest';
import { fromResult, outputCheck, caseVerdict, reportHtml } from '../../scripts/interface/if-test-report.mjs';

// "인터페이스 테스트" report (2026-11-18): an IF.TEST.CALL answer → output, messages, document numbers; the output
// against the spec's response mapping; pass / fail; one HTML page. Pure functions, no SAP.

type Args = Record<string, any>;

const result = (over: Args = {}) => ({
  failed: false,
  messages: [{ type: 'S', id: 'ZIF', number: '001', message: 'Order 4500001234 created' }],
  rows: [
    { row: 1, name: 'sig.I.IV_ID', value: 'CHAR10' },
    { row: 2, name: 'fm_result', value: JSON.stringify({ EV_ORDER: '4500001234', ES_HEAD: { STATUS: 'A', NOTE: 'ok' }, ET_ITEMS: [{ POSNR: '000010', QTY: '5' }] }) },
    { row: 3, name: 'doc_no.EV_ORDER', value: '4500001234' },
    { row: 4, name: 'committed', value: 'true' },
    { row: 5, name: 'posting.limit', value: 'A COMMIT inside a module this one calls is not detected: on DEV this can post data' },
  ],
  ...over,
});

const cell = (field: string, type: string, size: string, extra: Args = {}) => ({ table: '', field, type, size, ...extra });
const spec = (rows: Args[]) => ({
  ifId: 'IF-T', version: '1.0', header: { name: 'Order <in>' },
  sap: { side: 'source' },
  request: { rows: [] },
  response: {
    groups: [
      { id: 'g1', s: { name: 'EV_ORDER' }, t: { name: 'ORDER_NO' } },
      { id: 'g2', s: { name: 'ES_HEAD' }, t: { name: 'HEAD' } },
      { id: 'g3', s: { name: 'ET_ITEMS' }, t: { name: 'ITEMS' } },
    ],
    rows,
  },
});

describe('interface test report', () => {
  it('reads an IF.TEST.CALL answer', () => {
    const r = fromResult(result());
    expect(r.output.EV_ORDER).toBe('4500001234');
    expect(r.docNos).toEqual([{ name: 'EV_ORDER', value: '4500001234' }]);
    expect(r.committed).toBe('true');
    expect(r.posting[0].name).toBe('limit');
    expect(fromResult({ rows: [{ name: 'fm_result', value: '{broken' }] }).output).toBeNull();
  });

  it('checks the output against the response mapping: scalar, structure, table; missing / too long / wrong type', () => {
    const m = spec([
      { no: 'B001', g: 'g1', s: cell('EV_ORDER', 'CHAR', '10', { ddic: 'CHAR 10' }), t: cell('ORDER_NO', 'VARCHAR2', '10') },
      { no: 'B002', g: 'g2', s: cell('STATUS', 'CHAR', '1', { ddic: 'CHAR 1' }), t: cell('ST', 'VARCHAR2', '1') },
      { no: 'B003', g: 'g2', s: cell('NOTE', 'CHAR', '1', { ddic: 'CHAR 1' }), t: cell('N', 'VARCHAR2', '1') },
      { no: 'B004', g: 'g3', s: cell('QTY', 'NUMBER', '13', { ddic: 'QUAN 13' }), t: cell('Q', 'NUMBER', '13') },
      { no: 'B005', g: 'g3', s: cell('MATNR', 'CHAR', '18', { ddic: 'CHAR 18' }), t: cell('M', 'VARCHAR2', '18') },
    ]);
    const c = outputCheck(m, fromResult(result()).output);
    expect(c.map((x: Args) => [x.no, x.status])).toEqual([['B001', 'ok'], ['B002', 'ok'], ['B003', 'long'], ['B004', 'ok'], ['B005', 'missing']]);
    const bad = outputCheck(m, { ET_ITEMS: [{ QTY: 'five' }] });
    expect(bad.find((x: Args) => x.no === 'B004').status).toBe('type');
    expect(outputCheck({ response: null }, {})).toEqual([]);
  });

  it('a case passes only without failure, without E / A messages and with every mapped field in place', () => {
    const ok = caseVerdict(fromResult(result()), [{ no: 'B001', param: 'EV_ORDER', field: 'EV_ORDER', status: 'ok' }]);
    expect(ok).toEqual({ pass: true, reasons: [] });
    const e = caseVerdict(fromResult(result({ messages: [{ type: 'E', message: 'Plant 9999 does not exist' }] })), []);
    expect(e.pass).toBe(false);
    expect(e.reasons[0]).toBe('E: Plant 9999 does not exist');
    expect(caseVerdict(fromResult(result({ failed: true })), []).reasons).toContain('call failed');
    expect(caseVerdict(fromResult(result()), [{ no: 'B5', param: 'P', field: 'F', status: 'missing' }]).reasons).toEqual(['B5 P-F: missing']);
  });

  it('writes one escaped HTML page with the verdicts and document numbers', () => {
    const m = spec([{ no: 'B001', g: 'g1', s: cell('EV_ORDER', 'CHAR', '10'), t: cell('ORDER_NO', 'VARCHAR2', '10') }]);
    const html = reportHtml({ model: m, system: 'HKDERPD1-300', user: 'TESTER', at: '2026-11-18T10:00:00Z', fm: 'Z_IF_ORDER', lang: 'ko',
      cases: [{ name: 'normal <case>', input: { IV_ID: '<script>' }, result: result() }, { name: 'error', input: {}, result: result({ messages: [{ type: 'E', message: 'bad' }] }) }] });
    expect(html).toContain('<title>인터페이스 테스트 보고서 · IF-T</title>');
    expect(html).toContain('1 / 2 통과');
    expect(html).toContain('<b>4500001234</b>');
    expect(html).toContain('normal &lt;case&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Order &lt;in&gt;');
    expect(reportHtml({ model: m, cases: [], lang: 'en' })).toContain('Interface test report');
  });
});

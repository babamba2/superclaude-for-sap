import { describe, it, expect } from 'vitest';
import { fromResult, outputCheck, caseVerdict, caseOutcome, formatAt, reportHtml, runIsStale, statusFlags } from '../../scripts/interface/if-test-report.mjs';

// "인터페이스 테스트" report (2026-11-18): an IF.TEST.CALL answer → output, messages, document numbers; the output
// against the spec's response mapping; pass / fail; one HTML page. Pure functions, no SAP.

type Args = Record<string, any>;

const result = (over: Args = {}) => ({
  failed: false,
  messages: [{ type: 'S', id: 'ZIF', number: '001', message: 'Order 4500001234 created' }],
  rows: [
    { row: 1, name: 'sig.I.IV_ID', value: 'CHAR10' },
    { row: 2, name: 'fm_result', value: JSON.stringify({ EV_ORDER: '4500001234', ES_HEAD: { STATUS: 'S', NOTE: 'ok' }, ET_ITEMS: [{ POSNR: '000010', QTY: '5' }] }) },
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
    expect(ok).toEqual({ pass: true, outcome: 'pass', reasons: [], review: [] });
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
    // phone cards and headers are labelled in the report's language (verifier-mobile note 3)
    expect(html).toContain('<th>유형</th><th>ID</th><th>번호</th><th>메시지</th>');
    expect(html).toContain('<td data-l="메시지">');
    expect(html).toContain('<th>번호</th><th>파라미터</th><th>필드</th><th>정의서 형식</th><th>값</th><th>판정</th>');
    expect(html).toContain('<td data-l="판정">');
    expect(html).not.toMatch(/data-l="(Type|Message|Param|Field|Value)"/);
    expect(html).toContain('<time datetime="2026-11-18T10:00:00Z">2026-11-18 19:00 KST</time>');
    expect(html).toContain('<b>4500001234</b>');
    expect(html).toContain('normal &lt;case&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Order &lt;in&gt;');
    expect(reportHtml({ model: m, cases: [], lang: 'en' })).toContain('Interface test report');
  });
  it('marks runs made against another spec version or function module', () => {
    const m = spec([{ no: 'B001', g: 'g1', s: cell('EV_ORDER', 'CHAR', '10'), t: cell('ORDER_NO', 'VARCHAR2', '10') }]);
    expect(runIsStale({ specVersion: '1.0', fm: 'z_if_order' }, m, 'Z_IF_ORDER')).toBe(false);
    expect(runIsStale({ specVersion: '0.9', fm: 'Z_IF_ORDER' }, m, 'Z_IF_ORDER')).toBe(true);
    expect(runIsStale({ specVersion: '1.0', fm: 'Z_IF_OLD' }, m, 'Z_IF_ORDER')).toBe(true);
    expect(runIsStale({}, m, 'Z_IF_ORDER')).toBe(false);
    expect(runIsStale({ specVersion: '0.9' }, { ...m, version: '' }, '')).toBe(false);
    const html = reportHtml({ model: m, fm: 'Z_IF_ORDER', lang: 'ko', cases: [
      { name: 'now', input: {}, result: result(), specVersion: '1.0', fm: 'Z_IF_ORDER' },
      { name: 'old', input: {}, result: result(), specVersion: '0.9', fm: 'Z_IF_ORDER' },
    ] });
    expect(html).toContain('실행 기준: v1.0 · Z_IF_ORDER');
    expect(html).toContain('<p class="runof stale">실행 기준: v0.9 · Z_IF_ORDER</p>');
    expect(html).toContain('실행 1건은 지금 정의서와 다른 버전이나 함수 모듈로 실행했어요.');
    expect(html.match(/chip stale/g)?.length).toBe(1);
    const en = reportHtml({ model: m, fm: 'Z_IF_ORDER', lang: 'en', cases: [{ name: 'a', input: {}, result: result(), specVersion: '1.0', fm: 'Z_IF_ORDER' }] });
    expect(en).toContain('Run against: v1.0 · Z_IF_ORDER');
    expect(en).toContain('<td data-l="Message">');
    expect(en).not.toContain('<p class="warn"');
    expect(reportHtml({ model: m, cases: [{ name: 'a', input: {}, result: result() }] })).not.toContain('<p class="runof');
  });

  it('a status field reporting E / A makes a case "review" (확인 필요), never "pass" (user decision 2026-11-18)', () => {
    const z = (out: Args, messages: Args[] = []) => result({ messages, rows: [{ row: 1, name: 'fm_result', value: JSON.stringify(out) }, { row: 2, name: 'committed', value: 'false (rolled back)' }] });
    // a customer module without BAPIRET: XSTAT = 'E' and no message
    const xstat = fromResult(z({ XSTAT: 'E', XMSGS: 'No Data', O_TAB: [] }));
    expect(statusFlags(xstat.output)).toEqual([{ path: 'XSTAT', value: 'E' }]);
    const v = caseVerdict(xstat, []);
    expect(v).toMatchObject({ pass: false, outcome: 'review', reasons: [], review: ['XSTAT = E'] });
    // nested and in tables; lower case and blanks; other status values and non-status keys are not flags
    expect(statusFlags({ ES_RESULT: { EV_STATUS: ' a ' }, ET_LOG: [{ ITEM_STATUS: 'S' }, { ITEM_STATUS: 'E' }], TYPE: 'E', EV_STAT: 'E', E_STATE: 'E' }))
      .toEqual([{ path: 'ES_RESULT.EV_STATUS', value: 'A' }, { path: 'ET_LOG[1].ITEM_STATUS', value: 'E' }, { path: 'EV_STAT', value: 'E' }, { path: 'E_STATE', value: 'E' }]);
    expect(statusFlags(null)).toEqual([]);
    expect(statusFlags({ STATUS: 'S', XSTAT: '' })).toEqual([]);
    // a failure stays a failure
    expect(caseVerdict(fromResult(z({ XSTAT: 'E' }, [{ type: 'E', message: 'bad' }])), []).outcome).toBe('fail');
    const m = spec([]);
    expect(caseOutcome(m, z({ XSTAT: 'E' }))).toBe('review');
    expect(caseOutcome(m, z({ XSTAT: 'S' }))).toBe('pass');
    expect(caseOutcome(m, { ...z({}), failed: true })).toBe('fail');
    const html = reportHtml({ model: m, lang: 'ko', cases: [{ name: 'z', input: {}, result: z({ XSTAT: 'E' }) }, { name: 'ok', input: {}, result: z({ XSTAT: 'S' }) }] });
    expect(html).toContain('<section class="case review">');
    expect(html).toContain('<span class="chip">확인 필요</span>');
    expect(html).toContain('출력의 상태 필드가 오류를 알려요. 메시지가 없어도 실패일 수 있어요: XSTAT = E');
    expect(html).toContain('1 / 2 통과 · 1 확인 필요');
    const en = reportHtml({ model: m, lang: 'en', cases: [{ name: 'z', input: {}, result: z({ XSTAT: 'E' }) }] });
    expect(en).toContain('<span class="chip">Check</span>');
    expect(en).toContain('0 / 1 Pass · 1 Check');
  });

  it('shows the run time in Korea time (ko) or UTC (en), the text as given when it is no date', () => {
    expect(formatAt('2026-11-18T02:45:10.123Z', 'ko')).toBe('2026-11-18 11:45 KST');
    expect(formatAt('2026-11-18T20:05:00Z', 'ko')).toBe('2026-11-19 05:05 KST');
    expect(formatAt('2026-11-18T02:45:10Z', 'en')).toBe('2026-11-18 02:45 UTC');
    expect(formatAt('yesterday', 'ko')).toBe('yesterday');
    expect(reportHtml({ model: spec([]), at: 'x<y', cases: [] })).toContain('<time datetime="x&lt;y">x&lt;y</time>');
  });

  it('each case shows the time its call ran; the header time is when the report was saved', () => {
    const html = reportHtml({ model: spec([]), at: '2026-11-18T03:37:40Z', lang: 'ko', cases: [{ name: 'a', input: {}, result: result(), at: '2026-11-18T03:35:04Z' }] });
    expect(html).toContain('<dt>보고서 저장 시각</dt><dd><time datetime="2026-11-18T03:37:40Z">2026-11-18 12:37 KST</time></dd>');
    expect(html).toContain('<p class="runof">실행 시각: <time datetime="2026-11-18T03:35:04Z">2026-11-18 12:35 KST</time></p>');
    const en = reportHtml({ model: spec([]), at: '2026-11-18T03:37:40Z', lang: 'en', cases: [{ name: 'a', input: {}, result: result(), at: '2026-11-18T03:35:04Z' }] });
    expect(en).toContain('<dt>Report saved</dt>');
    expect(en).toContain('Run at: <time datetime="2026-11-18T03:35:04Z">2026-11-18 03:35 UTC</time>');
    expect(reportHtml({ model: spec([]), cases: [{ name: 'a', input: {}, result: result() }] })).not.toContain('실행 시각:');
  });

  it('a run with no handler result (SAP refused before the module ran) is a failed case, never a pass', () => {
    expect(fromResult(null).failed).toBe(true);
    expect(caseOutcome(spec([]), null)).toBe('fail');
    expect(caseOutcome(spec([]), { failed: true, rows: [], messages: [{ type: 'E', message: 'The parameters differ from the preview: run PREVIEW again' }] })).toBe('fail');
    const html = reportHtml({ model: spec([]), lang: 'ko', cases: [{ name: 'tamper', input: {}, result: null }] });
    expect(html).toContain('<section class="case fail">');
    expect(html).toContain('0 / 1 통과');
  });

  it('a BAPIRETURN message (class and number in CODE) gets its id and number from the output (live C2b, 2026-11-18)', () => {
    const r = { failed: false, messages: [{ type: 'W', message: 'Address data not found for company code 0001' }],
      rows: [{ row: 1, name: 'fm_result', value: JSON.stringify({ RETURN: { TYPE: 'W', CODE: 'FN021', MESSAGE: 'Address data not found for company code 0001', MESSAGE_V1: '0001' } }) }] };
    expect(fromResult(r).messages[0]).toEqual({ type: 'W', id: 'FN', number: '021', message: 'Address data not found for company code 0001' });
    // a table RETURN, an odd CODE, a message without a RETURN line, and ids SAP sent stay as they are
    const t = (ret: unknown, msg: Args) => fromResult({ messages: [msg], rows: [{ name: 'fm_result', value: JSON.stringify({ RETURN: ret }) }] }).messages[0];
    expect(t([{ CODE: 'X1', MESSAGE: 'm' }], { type: 'E', message: 'm' })).toMatchObject({ id: 'X1', number: '' });
    expect(t([{ CODE: 'FN021', MESSAGE: 'other' }], { type: 'E', message: 'm' })).toMatchObject({ id: '', number: '' });
    expect(t({ CODE: 'FN021', MESSAGE: 'm' }, { type: 'E', id: 'ZZ', number: '001', message: 'm' })).toMatchObject({ id: 'ZZ', number: '001' });
  });
});

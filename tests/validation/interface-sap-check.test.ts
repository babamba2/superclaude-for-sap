import { describe, it, expect } from 'vitest';
import { sapCheck, checkText } from '../../scripts/interface/if-sap-check.mjs';

// "SAP 오브젝트 점검" (2026-11-18): the spec against fake SAP reads — each finding once, the settled cases silent.

type Args = Record<string, any>;
const ok = (o: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(o) }] });
const err = (t: string) => ({ isError: true, content: [{ type: 'text', text: t }] });
const f = (fieldname: string, datatype: string, leng: number, extra: Args = {}) => ({ fieldname, datatype, leng, decimals: 0, description: fieldname, ...extra });

const TABLE = {
  tabclass: 'TRANSP',
  fields: [
    f('MANDT', 'CLNT', 3, { key: true }),
    f('ORDNO', 'NUMC', 10, { key: true, domname: 'ZORDNO' }),
    f('ORDDT', 'DATS', 8),
    f('AMOUNT', 'CURR', 13, { decimals: 2 }),
    f('WAERS', 'CUKY', 5),
    f('MATNR', 'CHAR', 18, { domname: 'MATNR' }),
    f('STATUS', 'CHAR', 1, { domname: 'ZSTAT' }),
    f('NOTE', 'CHAR', 40),
    f('KEYF', 'CHAR', 2, { notnull: true }),
    f('REQFLD', 'CHAR', 4, { notnull: true }),
  ],
};

function client(opts: { fmode?: string } = {}) {
  const calls: string[] = [];
  return {
    calls,
    async callTool({ name, arguments: a }: { name: string; arguments: Args }) {
      calls.push(name);
      if (name === 'GetTable') return a.table_name === 'ZIF_ORDER' ? ok({ table_data: JSON.stringify(TABLE) }) : err('not found');
      if (name === 'GetStructure') return err('not found');
      if (name === 'GetSqlQuery') {
        if (/FROM DD03L/.test(a.sql_query)) return ok({ rows: [{ FIELDNAME: 'AMOUNT', REFTABLE: 'ZIF_ORDER', REFFIELD: 'WAERS' }] });
        if (/FROM TFDIR/.test(a.sql_query)) return ok({ rows: opts.fmode === undefined ? [] : [{ FMODE: opts.fmode }] });
      }
      if (name === 'GetDomain') {
        const d = a.domain_name === 'MATNR' ? { convexit: 'ALPHA', fixed_values: [] } : a.domain_name === 'ZSTAT' ? { convexit: '', fixed_values: [{ low: 'A' }, { low: 'B' }] } : { convexit: '', fixed_values: [] };
        return ok({ domain_data: JSON.stringify(d) });
      }
      if (name === 'SearchObject') return a.object_name === 'ZIF_FM' ? ok({ rawXML: '<x href="/sap/bc/adt/functions/groups/ZFG/fmodules/ZIF_FM"/>' }) : ok({ rawXML: '' });
      if (name === 'GetFunctionModule') return ok({ function_module_data: 'FUNCTION ZIF_FM\n  IMPORTING\n    VALUE(IV_ID) TYPE C\n  .\nENDFUNCTION.' });
      return err(`unexpected ${name}`);
    },
  };
}

const cell = (field: string, type: string, size: string, extra: Args = {}) => ({ table: '', field, key: 'N', type, size, nul: 'Y', desc: '', ...extra });
const sapCell = (field: string, ddic: string, extra: Args = {}) => ({ ...cell(field, 'CHAR', ddic.split(' ')[1] || '', extra), ddic });
const row = (no: string, s: Args, t: Args, map = no, r = '') => ({ no, g: 'g1', s, t, map, r });

function spec() {
  return {
    lang: 'ko',
    sap: { side: 'target', system: 'DEV', target: { object: 'ZIF_ORDER', kind: 'TABLE' } },
    request: {
      source: { object: 'EXT_ORDER' },
      target: { object: 'ZIF_ORDER' },
      groups: [{ id: 'g1', s: { name: 'EXT_ORDER' }, t: { name: 'ZIF_ORDER' } }],
      rows: [
        row('A001', cell('ORDER_NO', 'VARCHAR2', '12'), sapCell('ORDNO', 'NUMC 10', { dom: 'ZORDNO' })),
        row('A002', cell('ORDER_DATE', 'VARCHAR2', '10'), sapCell('ORDDT', 'DATS 8'), 'A002', 'R1'),
        row('A003', cell('AMT', 'NUMBER', '15,1'), sapCell('AMOUNT', 'CURR 13')),
        row('A004', cell('MAT', 'VARCHAR2', '18'), sapCell('MATNR', 'CHAR 18', { dom: 'MATNR' })),
        row('A005', cell('ST', 'VARCHAR2', '1'), sapCell('STATUS', 'CHAR 1', { dom: 'ZSTAT' }), 'A005', 'R2'),
        row('A006', cell('OLD', 'VARCHAR2', '5'), sapCell('OLDF', 'CHAR 5')),
        row('A007', cell('NOTE', 'VARCHAR2', '30'), sapCell('NOTE', 'CHAR 30')),
        row('A008', cell('', '', ''), sapCell('KEYF', 'CHAR 2'), ''),
      ],
    },
    response: null,
    rules: [{ id: 'R1', kind: 'date-in', text: 'YYYY-MM-DD → YYYYMMDD' }, { id: 'R2', text: '상태 코드 매핑표 참조' }],
  };
}

const codes = (r: Args) => r.items.map((x: Args) => x.code).sort();

describe('interface spec — SAP object check', () => {
  it('table side: each finding once, the ruled date silent, statuses and proposals', async () => {
    const res = await sapCheck(client(), spec());
    const by = Object.fromEntries(res.rows.map((r: Args) => [r.no, r]));
    expect(codes(by.A001)).toEqual(['NUMC_FROM_TEXT', 'TRUNC']);
    expect(by.A001.status).toBe('check');
    expect(by.A001.proposals).toEqual([{ kind: 'add-rule', ruleKind: 'alpha-in', path: 'request.rows.0.r' }]);
    expect(by.A002.status).toBe('ok'); // date-in rule settles DATE_FORMAT
    expect(codes(by.A003)).toEqual(['DEC_PRECISION', 'REF_UNMAPPED']);
    expect(by.A003.items.find((x: Args) => x.code === 'REF_UNMAPPED').args.ref).toBe('ZIF_ORDER-WAERS');
    expect(codes(by.A004)).toEqual(['ALPHA_EXIT']);
    expect(codes(by.A005)).toEqual(['FIXED_VALUES']);
    expect(by.A005.needsJudge).toBe(true); // a free-text rule might settle it — the judge decides
    expect(by.A005.proposals).toEqual([]);
    expect(by.A006.status).toBe('mismatch');
    expect(codes(by.A006)).toEqual(['FIELD_MISSING']);
    expect(codes(by.A007)).toEqual(['TYPE_CHANGED']);
    expect(by.A007.proposals[0]).toEqual({ kind: 'set-cell', path: 'request.rows.6.t', value: { type: 'CHAR', size: '40', ddic: 'CHAR 40' } });
    expect(codes(by.A008)).toEqual(['MANDATORY_UNMAPPED']);
    const target = res.objects.find((o: Args) => o.side === 'target');
    expect(target.items.map((x: Args) => x.args.field)).toEqual(['REQFLD']); // KEYF has a row; MANDT is the client
    expect(target.status).toBe('mismatch');
    expect(res.counts).toEqual({ ok: 1, check: 4, mismatch: 3 });
  });

  it('a clean spec: no findings', async () => {
    const m = spec();
    m.request.rows = [row('A001', cell('ORDER_DATE', 'DATE', ''), sapCell('ORDDT', 'DATS 8'))];
    const res = await sapCheck(client(), m);
    expect(res.rows).toEqual([{ block: 'request', i: 0, no: 'A001', status: 'ok', items: [], proposals: [], needsJudge: false }]);
  });

  it('function module: not RFC-enabled is a mismatch; RFC-enabled is reported ok', async () => {
    const m = { lang: 'ko', sap: { side: 'source', target: null, source: { object: 'ZIF_FM', kind: 'FUNCTION' } }, request: { source: { object: 'ZIF_FM' }, target: { object: '' }, groups: [], rows: [] }, response: null, rules: [] };
    const no = await sapCheck(client({ fmode: ' ' }), m);
    expect(no.objects[0].items.map((x: Args) => x.code)).toContain('FM_NOT_RFC');
    expect(no.objects[0].status).toBe('mismatch');
    const yes = await sapCheck(client({ fmode: 'R' }), m);
    expect(yes.objects[0].items.map((x: Args) => x.code)).toContain('FM_RFC');
    expect(yes.objects[0].status).toBe('ok');
  });

  it('a missing object is a mismatch with the reader\'s reason', async () => {
    const m = spec();
    m.sap.target.object = 'ZNOPE';
    m.request.target.object = 'ZNOPE';
    const res = await sapCheck(client(), m);
    expect(res.objects[0].items[0].code).toBe('OBJ_MISSING');
    expect(res.rows).toEqual([]);
  });

  it('reads only: no write tool is ever called', async () => {
    const c = client();
    await sapCheck(c, spec());
    expect(c.calls.every((n) => /^(Get|Search)/.test(n))).toBe(true);
  });

  it('response block: the source column receives (synchronous reply) — checks and rule direction follow it', async () => {
    // SAP on the source side; the response block flows back target → source, so SAP's source cells receive
    const m = {
      lang: 'ko',
      sap: { side: 'source', system: 'DEV', source: { object: 'ZIF_ORDER', kind: 'TABLE' } },
      request: { source: { object: 'ZIF_ORDER' }, target: { object: 'EXT' }, groups: [{ id: 'g1', s: { name: 'ZIF_ORDER' }, t: { name: 'EXT' } }], rows: [] },
      response: {
        source: { object: 'ZIF_ORDER' }, target: { object: '' },
        groups: [{ id: 'g1', s: { name: 'ZIF_ORDER' }, t: { name: 'EXT' } }],
        rows: [
          { no: 'B001', g: 'g1', s: sapCell('ORDNO', 'NUMC 10'), t: cell('ORDER_NO', 'VARCHAR2', '12'), map: 'B001', r: '' },
          { no: 'B002', g: 'g1', s: sapCell('KEYF', 'CHAR 2'), t: cell('', '', ''), map: '', r: '' },
          { no: 'B003', g: 'g1', s: sapCell('NOTE', 'CHAR 40'), t: cell('NOTE', 'VARCHAR2', '20'), map: 'B003', r: '' },
        ],
      },
      rules: [],
    };
    const res = await sapCheck(client(), m);
    const by = Object.fromEntries(res.rows.map((r: Args) => [r.no, r]));
    expect(codes(by.B001)).toEqual(['NUMC_FROM_TEXT', 'TRUNC']); // SAP's NUMC 10 receives a text of 12
    expect(by.B001.proposals[0]).toEqual({ kind: 'add-rule', ruleKind: 'alpha-in', path: 'response.rows.0.r' });
    expect(codes(by.B002)).toEqual(['MANDATORY_UNMAPPED']);
    expect(codes(by.B003)).toEqual([]); // SAP sends 40 into 20 — the other side's concern, not SAP's receiving field
  });

  it('a field mapped only in the response does not supply a mandatory request field', async () => {
    const m = spec();
    m.request.rows = m.request.rows.filter((r: Args) => r.t.field !== 'KEYF');
    (m as Args).response = { source: { object: '' }, target: { object: 'ZIF_ORDER' }, groups: [{ id: 'g1', s: { name: 'EXT' }, t: { name: 'ZIF_ORDER' } }], rows: [{ no: 'B001', g: 'g1', s: cell('K', 'VARCHAR2', '2'), t: sapCell('KEYF', 'CHAR 2'), map: 'B001', r: '' }] };
    const res = await sapCheck(client(), m);
    const target = res.objects.find((o: Args) => o.side === 'target');
    expect(target.items.map((x: Args) => x.args.field).sort()).toEqual(['KEYF', 'REQFLD']);
  });

  it('the Korean lines never carry the reader\'s English reason; English keeps it', () => {
    const miss = { code: 'OBJ_MISSING', args: { object: 'ZNOPE', error: 'ZNOPE is no table, view, structure or function module this system can read' } };
    expect(checkText(miss, 'ko')).toBe('ZNOPE: SAP에서 찾을 수 없어요 — 테이블·뷰·구조·함수 모듈로 읽히지 않아요');
    expect(checkText(miss, 'en')).toContain('is no table, view, structure');
    const par = { code: 'PARAM_UNREAD', args: { param: 'IT_X', why: 'type not readable — pass --line IT_X=<structure>' } };
    expect(checkText(par, 'ko')).not.toMatch(/[A-Za-z]{4,}.*readable|--line/);
    expect(checkText(par, 'en')).toContain('--line');
  });

  it('texts in both languages', () => {
    expect(checkText({ code: 'FIXED_VALUES', args: { field: 'STATUS', domain: 'ZSTAT', values: ['A', 'B'], more: 0 } }, 'ko')).toBe('STATUS: 도메인 ZSTAT 고정값만 받아요 — A, B');
    expect(checkText({ code: 'TRUNC', args: { field: 'X', from: 12, to: 10 } }, 'en')).toBe('X: length 12 → 10 — may be cut');
  });
});

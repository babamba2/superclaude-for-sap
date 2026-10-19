import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { readNumberRangeObject, readBadiImpls, viewConds, readByFirstKey } from '../../scripts/config/extract-config.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { buildModel, viewCondition } from '../../scripts/config/build-config-doc.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { domainValues, f1Text } from '../../scripts/config/fields.mjs';

type Row = Record<string, string>;

/**
 * GetSqlQuery stand-in: SELECT * with the WHERE forms the reader builds (=, >, <, IN, LIKE,
 * NOT LIKE joined by AND), rows in the order given, capped at row_number. Tables not in
 * `tables` answer like the dispatcher's allow list; `fail` makes matching queries fail.
 */
function fakeSap(tables: Record<string, Row[]>, fail?: RegExp) {
  const sqls: string[] = [];
  const cond = (c: string) => {
    let m = /^(\w+) IN \((.*)\)$/.exec(c);
    if (m) { const [, f, list] = m; const vals = [...list.matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1]); return (r: Row) => vals.includes(String(r[f] ?? '')); }
    m = /^(\w+) (NOT LIKE|LIKE) '(.*)'$/.exec(c);
    if (m) { const [, f, op, p] = m; const re = new RegExp(`^${p.replace(/%/g, '.*').replace(/_/g, '.')}$`); return (r: Row) => re.test(String(r[f] ?? '')) !== (op === 'NOT LIKE'); }
    m = /^(\w+) (=|>|<) '(.*)'$/.exec(c);
    if (m) { const [, f, op, v] = m; return (r: Row) => { const x = String(r[f] ?? ''); return op === '=' ? x === v : op === '>' ? x > v : x < v; }; }
    throw new Error(`fake SQL cannot parse ${c}`);
  };
  const client = {
    sqls,
    callTool: async ({ arguments: a }: { arguments: { sql_query: string; row_number: number } }) => {
      sqls.push(a.sql_query);
      const m = /^SELECT \* FROM (\S+)(?: WHERE (.*))?$/.exec(a.sql_query)!;
      if (!tables[m[1]] || fail?.test(a.sql_query)) return { isError: true, content: [{ text: `${m[1]} cannot be read` }] };
      const tests = m[2] ? m[2].split(' AND ').map(cond) : [];
      const rows = tables[m[1]].filter((r) => tests.every((t) => t(r)));
      return { content: [{ text: JSON.stringify({ rows: rows.slice(0, a.row_number), truncated: rows.length > a.row_number }) }] };
    },
  };
  return client;
}

// Intervals in key order: subobject × range × year.
function intervals(obj: string, subs: string[], ranges: number, years: number): Row[] {
  const out: Row[] = [];
  for (const s of subs) for (let n = 0; n < ranges; n++) for (let y = 0; y < years; y++) {
    out.push({ CLIENT: '200', OBJECT: obj, SUBOBJECT: s, NRRANGENR: String(n).padStart(2, '0'), TOYEAR: String(2000 + y), FROMNUMBER: '1', TONUMBER: '9' });
  }
  return out;
}

describe('config-to-document — number ranges past the read cap', () => {
  const nriv = [...intervals('EINKBELEG', [''], 3, 1), ...intervals('RF_BELEG', ['1000', '2000', '3000'], 100, 20)];

  it('reads one object at a time', async () => {
    const c = fakeSap({ NRIV: nriv });
    const r = await readNumberRangeObject(c, 'EINKBELEG');
    expect(r).toMatchObject({ ok: true, truncated: false });
    expect(r.rows).toHaveLength(3);
    expect(c.sqls).toEqual(["SELECT * FROM NRIV WHERE OBJECT = 'EINKBELEG'"]);
  });

  it('reads an object over the cap again by subobject and reads every interval', async () => {
    const c = fakeSap({ NRIV: nriv });
    const r = await readNumberRangeObject(c, 'RF_BELEG');
    expect(r.truncated).toBe(false);
    expect(r.rows).toHaveLength(6000);
    expect(new Set(r.rows.map((x: Row) => `${x.SUBOBJECT}|${x.NRRANGENR}|${x.TOYEAR}`)).size).toBe(6000);
    expect(c.sqls).toContain("SELECT * FROM NRIV WHERE OBJECT = 'RF_BELEG' AND SUBOBJECT = '3000'");
  });

  it('marks the object truncated only when a slice cannot be read in full', async () => {
    const c = fakeSap({ NRIV: nriv }, /SUBOBJECT = '3000'/);
    const r = await readNumberRangeObject(c, 'RF_BELEG');
    expect(r.truncated).toBe(true);
  });

  it('carries the truncated flag to the SNUM screen', () => {
    const snap = {
      meta: { module: 'FI', lang: 'en' }, tree: [], clusters: {}, clusterTitles: {}, labels: {}, domains: {}, docs: {}, transports: {}, views: {}, tables: {},
      activities: { A: { title: 'Document number ranges', objects: [], numberRanges: ['RF_BELEG'] } },
      numberRanges: { RF_BELEG: { object: 'RF_BELEG', title: 'Accounting document', rows: nriv.slice(0, 2), transports: [], truncated: true } },
    };
    expect(buildModel(snap, 'en', { drawScreens: false }).views['NR:RF_BELEG'].truncated).toBe(true);
  });
});

describe('config-to-document — partition past the read cap without fixed values', () => {
  // TZONE: country (check table T005) × zone (no fixed values, no check table); one country passes the cap.
  const fields = [
    { name: 'MANDT', key: true, type: 'CLNT', domname: 'MANDT', checktable: 'T000' },
    { name: 'LAND1', key: true, type: 'CHAR', domname: 'LAND1', checktable: 'T005' },
    { name: 'ZONE1', key: true, type: 'CHAR', domname: 'ZONE', checktable: '' },
  ];
  const zones = (land: string, n: number): Row[] =>
    Array.from({ length: n }, (_, i) => ({ MANDT: '200', LAND1: land, ZONE1: `Z${String(i).padStart(5, '0')}` }));
  const tzone = [...zones('DE', 10), ...zones('KR', 7000)];
  const tables = { TZONE: tzone, T005: [{ LAND1: 'DE' }, { LAND1: 'KR' }], DD07L: [] };

  it('pages through the capped partition instead of splitting by the keys seen in it', async () => {
    const c = fakeSap(tables);
    const first = { ok: true, rows: tzone.slice(0, 5000), truncated: true };
    const r = await readByFirstKey(c, 'TZONE', fields, first);
    expect(r.truncated).toBe(false);
    expect(r.rows.filter((x: Row) => x.LAND1 === 'KR')).toHaveLength(7000);
    expect(new Set(r.rows.map((x: Row) => `${x.LAND1}|${x.ZONE1}`)).size).toBe(7010);
    expect(c.sqls.some((s) => /LAND1 = 'KR' AND ZONE1 > /.test(s))).toBe(true);
  });
});

describe('config-to-document — enhancement BAdI implementing class', () => {
  const base = {
    SXC_EXIT: [{ IMP_NAME: 'ZSD_CUST_ADD_DATA_CS', EXIT_NAME: 'CUSTOMER_ADD_DATA_CS', FLT_VAL: 'Z1' }],
    SXC_ATTR: [{ IMP_NAME: 'ZSD_CUST_ADD_DATA_CS', ACTIVE: 'X', UNAME: 'U1', UDATE: '2015-02-06', MIG_ENHNAME: 'ZSD_CUSTOMER_ADD_DAT' }],
    SXC_CLASS: [{ IMP_NAME: 'ZSD_CUST_ADD_DATA_CS', IMP_CLASS: 'ZCL_IM_SD_CUSTOMER_ADD_DAT' }],
    BADIIMPL_ENH: [
      { ENHNAME: 'ZSD_CUSTOMER_ADD_DAT', BADI_IMPL: 'ZSD_CUST_ADD_DATA_CS', BADI_NAME: 'CUSTOMER_ADD_DATA_CS', ACTIVE: 'X' },
      { ENHNAME: 'ZMM_ME_BAPI_PO_CUST', BADI_IMPL: 'ZMM_ME_BAPI_PO_CUST', BADI_NAME: 'ME_BAPI_PO_CUST', ACTIVE: 'X' },
      { ENHNAME: 'ZFI_NO_CLASS', BADI_IMPL: 'ZFI_NO_CLASS', BADI_NAME: 'FI_X', ACTIVE: '' },
    ],
    E071: [
      { TRKORR: 'DEVK900001', PGMID: 'R3TR', OBJECT: 'ENHO', OBJ_NAME: 'ZMM_ME_BAPI_PO_CUST' },
      { TRKORR: 'DEVK900001', PGMID: 'R3TR', OBJECT: 'CLAS', OBJ_NAME: 'ZCL_MM_PO_CUST_TR' },
    ],
    E070: [{ TRKORR: 'DEVK900001', STRKORR: '', AS4USER: 'U2', AS4DATE: '2015-04-16' }],
  };
  const names = ['CUSTOMER_ADD_DATA_CS', 'ME_BAPI_PO_CUST', 'FI_X'];

  it('keeps a migrated classic implementation once, with its class', async () => {
    const { impls } = await readBadiImpls(fakeSap({ ...base, ENHOBJ: [] }), names);
    expect(impls.CUSTOMER_ADD_DATA_CS).toEqual([expect.objectContaining({ name: 'ZSD_CUST_ADD_DATA_CS', kind: 'classic', class: 'ZCL_IM_SD_CUSTOMER_ADD_DAT', enh: 'ZSD_CUSTOMER_ADD_DAT' })]);
  });

  it('takes the class from the enhancement object list first', async () => {
    const ENHOBJ = [
      { ENHNAME: 'ZMM_ME_BAPI_PO_CUST', VERSION: 'A', OBJ_TYPE: 'ENHS', OBJ_NAME: 'ES_BADI_ME_BAPI' },
      { ENHNAME: 'ZMM_ME_BAPI_PO_CUST', VERSION: 'A', OBJ_TYPE: 'CLAS', OBJ_NAME: 'ZCL_MM_PO_CUST' },
    ];
    const { impls } = await readBadiImpls(fakeSap({ ...base, ENHOBJ }), names);
    expect(impls.ME_BAPI_PO_CUST[0]).toMatchObject({ name: 'ZMM_ME_BAPI_PO_CUST', kind: 'enh', class: 'ZCL_MM_PO_CUST', user: 'U2', date: '20150416' });
  });

  it('falls back to the transport when the object list cannot be read', async () => {
    const { impls, errors } = await readBadiImpls(fakeSap(base), names);
    expect(errors.enhobj).toContain('ENHOBJ');
    expect(impls.ME_BAPI_PO_CUST[0].class).toBe('ZCL_MM_PO_CUST_TR');
  });

  it('keeps an implementation whose class is not found, with class null and the reason', async () => {
    const { impls } = await readBadiImpls(fakeSap({ ...base, ENHOBJ: [] }), names);
    expect(impls.FI_X).toEqual([expect.objectContaining({ name: 'ZFI_NO_CLASS', kind: 'enh', class: null, active: false })]);
    expect(impls.FI_X[0].reason).toMatch(/no class in ENHOBJ; no transport/);
  });
});

describe('config-to-document — view selection conditions', () => {
  it('keeps operators, negation, OR links and references from DD28S, without join lines', () => {
    const conds = viewConds([
      { POSITION: 3, TABNAME: 'T001F', FIELDNAME: 'KOART', OPERATOR: 'EQ', CONSTANTS: "' '", NEGATION: '', AND_OR: '' },
      { POSITION: 1, TABNAME: 'T001F', FIELDNAME: 'PROGRAMM', OPERATOR: 'LK', CONSTANTS: "'RFKORD%'", NEGATION: '', AND_OR: 'OR' },
      { POSITION: 2, TABNAME: 'T001F', FIELDNAME: 'PROGRAMM', OPERATOR: 'EQ', CONSTANTS: "'SAPF130D'", NEGATION: '', AND_OR: 'AND' },
      { POSITION: 4, TABNAME: 'ARCH_OBJ', FIELDNAME: 'OBJECT', OPERATOR: 'EQ', CONSTANTS: '', NEGATION: 'JL', AND_OR: 'AND' },
      { POSITION: 5, TABNAME: 'T685T', FIELDNAME: 'SPRAS', OPERATOR: 'EQ', CONSTANTS: 'SY-LANGU', NEGATION: 'NOT', AND_OR: '' },
    ]);
    expect(conds).toEqual([
      { table: 'T001F', field: 'PROGRAMM', op: 'LK', value: 'RFKORD%', or: true },
      { table: 'T001F', field: 'PROGRAMM', op: 'EQ', value: 'SAPF130D' },
      { table: 'T001F', field: 'KOART', op: 'EQ', value: ' ' },
      { table: 'T685T', field: 'SPRAS', op: 'EQ', ref: 'SY-LANGU', not: true },
    ]);
  });

  const rows = [
    { LAND1: 'AR', PROGRAMM: 'RFKORD10', KOART: '' }, { LAND1: 'AR', PROGRAMM: 'SAPF130D', KOART: 'D' },
    { LAND1: 'CO', PROGRAMM: 'ZFI_PRINT', KOART: '' }, { LAND1: 'MX', PROGRAMM: 'SAPF130D', KOART: '' },
  ];
  const pass = (conds: object[]) => { const { test, notApplied } = viewCondition(conds, 'T'); return { rows: rows.filter(test).map((r) => `${r.LAND1}/${r.PROGRAMM}`), notApplied }; };

  it('applies an OR group on one field AND-ed with the other conditions', () => {
    expect(pass([
      { table: 'T', field: 'PROGRAMM', op: 'LK', value: 'RFKORD%', or: true },
      { table: 'T', field: 'PROGRAMM', op: 'EQ', value: 'SAPF130D', or: true },
      { table: 'T', field: 'PROGRAMM', op: 'LK', value: 'Z%' },
      { table: 'T', field: 'KOART', op: 'EQ', value: ' ' },
    ])).toEqual({ rows: ['AR/RFKORD10', 'CO/ZFI_PRINT', 'MX/SAPF130D'], notApplied: [] });
  });

  it('evaluates NE, NOT LIKE and ranges', () => {
    expect(pass([{ table: 'T', field: 'LAND1', op: 'NE', value: 'AR' }, { table: 'T', field: 'PROGRAMM', op: 'LK', value: 'Z%', not: true }]).rows).toEqual(['MX/SAPF130D']);
    expect(pass([{ table: 'T', field: 'LAND1', op: 'GE', value: 'B' }, { table: 'T', field: 'LAND1', op: 'LE', value: 'CZ' }]).rows).toEqual(['CO/ZFI_PRINT']);
  });

  it('leaves a group it cannot evaluate unapplied and says so, never half of an OR group', () => {
    const r = pass([
      { table: 'T', field: 'LAND1', op: 'EQ', value: 'AR', or: true },
      { table: 'T', field: 'LAND1', op: 'EQ', ref: 'T001-LAND1' },
      { table: 'T685T', field: 'SPRAS', op: 'EQ', ref: 'SY-LANGU' },
      { table: 'T', field: 'KOART', op: 'EQ', value: '' },
    ]);
    expect(r.rows).toEqual(['AR/RFKORD10', 'CO/ZFI_PRINT', 'MX/SAPF130D']);
    expect(r.notApplied).toEqual(["T-LAND1 EQ 'AR' OR T-LAND1 EQ T001-LAND1"]);
  });

  it('restricts rows, counts and samples of the view, and names subset fields SM30 asks for', () => {
    const snap = {
      meta: { module: 'FI', lang: 'en' }, tree: [], clusters: {}, clusterTitles: {}, labels: {}, domains: {}, docs: {}, transports: {},
      activities: { A: { title: 'Withholding tax keys', objects: [{ type: 'V', name: 'V_X_AR' }, { type: 'V', name: 'V_X' }] } },
      views: {
        V_X_AR: { name: 'V_X_AR', root: 'T', conds: [{ table: 'T', field: 'LAND1', op: 'EQ', value: 'AR' }], fields: [{ field: 'LAND1', table: 'T', tabField: 'LAND1', key: true, rdonly: 'S' }, { field: 'PROGRAMM', table: 'T', tabField: 'PROGRAMM', key: false }] },
        V_X: { name: 'V_X', root: 'T', conds: [], fields: [{ field: 'LAND1', table: 'T', tabField: 'LAND1', key: true, rdonly: 'S' }, { field: 'PROGRAMM', table: 'T', tabField: 'PROGRAMM', key: false }] },
      },
      tables: { T: { fields: [{ name: 'LAND1', key: true, type: 'CHAR', leng: 3 }, { name: 'PROGRAMM', key: false, type: 'CHAR', leng: 40 }], transports: [], rows: rows.map((r) => ({ ...r, ...(r.LAND1 === 'CO' ? { _tr: ['DEVK900002'] } : {}) })) } },
    };
    const { views, acts } = buildModel(snap, 'en', { drawScreens: false });
    expect(views.V_X_AR.rows).toEqual([['AR', 'RFKORD10'], ['AR', 'SAPF130D']]);
    expect(views.V_X_AR.cust).toEqual([]);
    expect(views.V_X_AR).not.toHaveProperty('subset');
    expect(views.V_X.subset).toEqual(['LAND1']);
    expect(acts.A.rows).toBe(6);
  });
});

describe('config-to-document — conditions on a joined table', () => {
  const view = { name: 'V_T609PP', root: 'T609PP', conds: [{ table: 'T685', field: 'KAPPL', op: 'EQ', value: 'V3' }], fields: [{ field: 'KSCHL', table: 'T609PP', tabField: 'KSCHL', key: true }] };
  const snap = (withT685: boolean) => ({
    meta: { module: 'SD', lang: 'en' }, tree: [], clusters: {}, clusterTitles: {}, labels: {}, domains: {}, docs: {}, transports: {},
    activities: { A: { title: 'Output', objects: [{ type: 'V', name: 'V_T609PP' }] } },
    views: { V_T609PP: view },
    tables: {
      T609PP: { fields: [{ name: 'KAPPL', key: true, type: 'CHAR', leng: 2 }, { name: 'KSCHL', key: true, type: 'CHAR', leng: 4 }], transports: [],
        rows: [{ KAPPL: 'V3', KSCHL: 'RD00' }, { KAPPL: 'V1', KSCHL: 'BA00' }, { KAPPL: 'V3', KSCHL: 'ZZZZ' }] },
      ...(withT685 ? { T685: { fields: [{ name: 'KAPPL', key: true, type: 'CHAR', leng: 2 }, { name: 'KSCHL', key: true, type: 'CHAR', leng: 4 }], transports: [],
        rows: [{ KAPPL: 'V3', KSCHL: 'RD00' }, { KAPPL: 'V1', KSCHL: 'BA00' }] } } : {}),
    },
  });

  it('reads the condition on the joined row; a root row without one drops out', () => {
    const v = buildModel(snap(true), 'en', { drawScreens: false }).views.V_T609PP;
    expect(v.rows).toEqual([['RD00']]);
    expect(v).not.toHaveProperty('conditionNotApplied');
  });

  it('marks the view when the joined table is not in the snapshot', () => {
    const v = buildModel(snap(false), 'en', { drawScreens: false }).views.V_T609PP;
    expect(v.rows).toHaveLength(3);
    expect(v.conditionNotApplied).toEqual(["T685-KAPPL EQ 'V3'"]);
  });
});

describe('config-to-document — domain values in the field-meaning input', () => {
  it('lists every fixed value up to the cap and counts the rest', () => {
    const many = Object.fromEntries(Array.from({ length: 75 }, (_, i) => [String(i), `text ${i}`]));
    const r = domainValues(many);
    expect(r.values).toHaveLength(60);
    expect(r.values[59]).toBe('59=text 59');
    expect(r.more).toBe(15);
    expect(domainValues({ A: 'a', B: 'b' })).toEqual({ values: ['A=a', 'B=b'], more: 0 });
    expect(domainValues(undefined)).toEqual({ values: [], more: 0 });
  });
});

describe('config-to-document — F1 text in the field-meaning input', () => {
  it('keeps the whole text in the common case and marks a cut one', () => {
    const long = 'x'.repeat(2500) + ' new Asset Accounting.';
    expect(f1Text({ text: long })).toBe(long);
    expect(f1Text({ text: 'y'.repeat(7000) })).toBe(`${'y'.repeat(6000)} … (cut; full text in snapshot.fieldDocs)`);
    expect(f1Text({ text: 'z'.repeat(1500) })).toContain('(cut when extracted;');
    expect(f1Text({ text: 'short', cut: true }).startsWith('short … (cut when extracted;')).toBe(true);
    expect(f1Text(undefined)).toBe('');
  });
});

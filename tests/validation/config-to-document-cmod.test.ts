import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { readCmod, isCmodActivity, docTokens, codeLines, cmodImplemented, includeNames, zFunctionCalls, addCmodProjectsActivity, CMOD_PROJECTS_ID, addCmodDispatch, hasDynamicCall, selectTables, dispatchFields } from '../../scripts/config/cmod.mjs';

type Row = Record<string, string>;

/** GetSqlQuery (WHERE f IN (…) [AND g IN (…)]) plus SearchObject / GetFunctionModule / GetInclude. */
function fakeSap(tables: Record<string, Row[]>, objects: { groups: Record<string, string>; fms: Record<string, string>; includes: Record<string, string>; tabl: string[] }) {
  const cond = (c: string) => {
    const m = /^(\w+) IN \((.*)\)$/.exec(c)!;
    const vals = [...m[2].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1]);
    return (r: Row) => vals.includes(String(r[m[1]] ?? ''));
  };
  return {
    callTool: async ({ name, arguments: a }: { name: string; arguments: Record<string, string> }) => {
      if (name === 'SearchObject') {
        if (a.object_type === 'TABL') return { content: [{ text: JSON.stringify({ results: objects.tabl.includes(a.object_name) ? [{ name: a.object_name, type: 'TABL/DT' }] : [] }) }] };
        const g = objects.groups[a.object_name];
        return { content: [{ text: JSON.stringify({ results: g ? [{ name: a.object_name }] : [], rawXML: g ? `<adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/${g.toLowerCase()}/fmodules/${a.object_name.toLowerCase()}"/>` : '' }) }] };
      }
      if (name === 'GetFunctionModule') return { content: [{ text: JSON.stringify({ function_module_data: objects.fms[a.function_module_name] }) }] };
      if (name === 'GetInclude') return objects.includes[a.include_name] != null ? { content: [{ text: objects.includes[a.include_name] }] } : { isError: true, content: [{ text: '404 not found' }] };
      const m = /^SELECT \* FROM (\S+)(?: WHERE (.*))?$/.exec(a.sql_query)!;
      const tests = m[2] ? m[2].split(' AND ').map(cond) : [];
      return { content: [{ text: JSON.stringify({ rows: (tables[m[1]] || []).filter((r) => tests.every((t) => t(r))) }) }] };
    },
  };
}

const TABLES: Record<string, Row[]> = {
  MODSAP: [
    { NAME: 'COOMKS01', TYP: '', MEMBER: '' },
    { NAME: 'COOMKS01', TYP: 'E', MEMBER: 'EXIT_SAPLKMA1_001' },
    { NAME: 'COOMKS01', TYP: 'S', MEMBER: 'SAPLKMA1+0399' },
    { NAME: 'COOMKS01', TYP: 'T', MEMBER: 'CI_CSKS' },
    { NAME: 'COPA0002', TYP: 'E', MEMBER: 'EXIT_SAPLKEAB_001' },
    { NAME: 'FYTX0002', TYP: 'E', MEMBER: 'EXIT_SAPLFYTX_USER_001' },
  ],
  MODSAPT: [{ SPRSL: '3', NAME: 'COOMKS01', MODTEXT: '코스트센터 추가 필드' }, { SPRSL: 'E', NAME: 'COPA0002', MODTEXT: 'CO-PA valuation' }],
  MODACT: [{ NAME: 'ZCO00001', MEMBER: '' }, { NAME: 'ZCO00001', MEMBER: 'COOMKS01' }, { NAME: 'ZCO00002', MEMBER: 'COPA0002' }],
  MODATTR: [{ NAME: 'ZCO00001', STATUS: 'A', UNAM: 'KIM', UDAT: '2015-01-02' }, { NAME: 'ZCO00002', STATUS: '', UNAM: 'LEE', UDAT: '2016-03-04' }],
};
const OBJECTS = {
  groups: { EXIT_SAPLKMA1_001: 'XKM1', EXIT_SAPLKEAB_001: 'XKKE', ZCO_EXIT_CN: 'ZCO_EXITS' },
  fms: {
    EXIT_SAPLKMA1_001: 'FUNCTION exit_saplkma1_001.\n  INCLUDE zxkm1u01.\nENDFUNCTION.',
    EXIT_SAPLKEAB_001: 'FUNCTION exit_saplkeab_001.\n  INCLUDE ZXKKEU03.\nENDFUNCTION.',
    ZCO_EXIT_CN: 'FUNCTION zco_exit_cn.\n  INCLUDE zco_exit_cn_inc.\nENDFUNCTION.',
  },
  includes: {
    ZXKM1U01: "* customer code\nIF csks-bukrs = '6100'.\n  SELECT SINGLE * FROM zcot06150.\nENDIF.\nINCLUDE zxkm1u01_cn.\n* INCLUDE zxkm1u01_old.\nCALL FUNCTION 'ZCO_EXIT_CN'.",
    ZXKM1U01_CN: "WRITE 'CN'.",
    ZCO_EXIT_CN_INC: 'WRITE 1.',
  },
  tabl: ['CI_CSKS'],
};
const acts = {
  A_CCA: { id: 'A_CCA', docuId: 'D1', objects: [{ type: 'L', name: 'CMOD', tcode: 'CMOD', sub: 'CO_CCA1' }] },
  A_COPA: { id: 'A_COPA', docuId: 'D2', objects: [{ type: 'L', name: 'CMOD', tcode: 'CMOD', sub: '' }] },
  A_TAX: { id: 'A_TAX', docuId: 'D3', objects: [{ type: 'L', name: 'CMOD', tcode: 'CMOD', sub: '' }] },
  A_NONE: { id: 'A_NONE', docuId: 'D4', objects: [{ type: 'L', name: 'CMOD', tcode: 'CMOD', sub: '' }] },
  A_VIEW: { id: 'A_VIEW', docuId: 'D5', objects: [{ type: 'V', name: 'V_T001', tcode: 'SM30' }] },
};
const docs = {
  D1: { blocks: [{ text: 'The following SAP enhancement is available: COOMKS01 Cost Center: customer-specific fields' }] },
  D2: { blocks: [{ text: 'Use the function module EXIT_SAPLKEAB_001 of the enhancement.' }] },
  D3: { blocks: [{ text: 'Enhancement FYTX0002 calls an external system.' }] },
  D4: { blocks: [] },
};

describe('config-to-document — SAP enhancements (SMOD) and customer projects (CMOD)', () => {
  it('finds CMOD activities and the enhancement candidates of their documentation', () => {
    expect(isCmodActivity(acts.A_CCA)).toBe(true);
    expect(isCmodActivity(acts.A_VIEW)).toBe(false);
    expect(docTokens('COOMKS01 and EXIT_SAPLKMA1_001, see SMOD').names).toEqual(['COOMKS01', 'SMOD']);
    expect(docTokens('COOMKS01 and EXIT_SAPLKMA1_001').exits).toEqual(['EXIT_SAPLKMA1_001']);
    expect(codeLines('* c\n\n  " d\nWRITE x.\n')).toBe(1);
  });

  it('reads enhancements, projects and the customer include code', async () => {
    const m = await readCmod(fakeSap(TABLES, OBJECTS), acts, docs);
    expect(m.byActivity).toEqual({ A_CCA: ['COOMKS01'], A_COPA: ['COPA0002'], A_TAX: ['FYTX0002'], A_NONE: [] });
    const cca = m.enh.COOMKS01;
    expect(cca.text).toBe('코스트센터 추가 필드');
    expect(cca.projects).toEqual([{ name: 'ZCO00001', active: true, user: 'KIM', date: '2015-01-02' }]);
    expect(cca.comps.find((x: Row) => x.typ === 'E')).toMatchObject({ member: 'EXIT_SAPLKMA1_001', group: 'XKM1', include: 'ZXKM1U01', exists: true, lines: 5 });
    const ex = cca.comps.find((x: Row) => x.typ === 'E');
    // Z sub-includes (a commented INCLUDE left out) and called Z function modules with their includes.
    expect(Object.keys(ex.subIncludes)).toEqual(['ZXKM1U01_CN']);
    expect(ex.calledFms.ZCO_EXIT_CN).toMatchObject({ group: 'ZCO_EXITS', lines: 3 });
    expect(Object.keys(ex.calledFms.ZCO_EXIT_CN.subIncludes)).toEqual(['ZCO_EXIT_CN_INC']);
    expect(includeNames("INCLUDE zx01.\n* INCLUDE zx02.\n  include ZX03 .")).toEqual(['ZX01', 'ZX03']);
    expect(zFunctionCalls("CALL FUNCTION 'ZA'.\n* CALL FUNCTION 'ZB'.\nCALL FUNCTION 'BAPI_X'.")).toEqual(['ZA']);
    expect(cca.comps.find((x: Row) => x.typ === 'T')).toMatchObject({ member: 'CI_CSKS', exists: true });
    expect(cca.comps.find((x: Row) => x.typ === 'S')).toEqual({ typ: 'S', member: 'SAPLKMA1+0399' });
    expect(cmodImplemented(cca)).toBe(true);
    // In an inactive project and the include was never created.
    const copa = m.enh.COPA0002;
    expect(copa.projects[0]).toMatchObject({ name: 'ZCO00002', active: false });
    expect(copa.comps[0]).toMatchObject({ include: 'ZXKKEU03', exists: false });
    expect(cmodImplemented(copa)).toBe(false);
    // No customer project: components listed, no code read.
    expect(m.enh.FYTX0002).toMatchObject({ projects: [], comps: [{ typ: 'E', member: 'EXIT_SAPLFYTX_USER_001' }] });
    expect(m.errors).toEqual({});
    expect(m.moduleProjects).toBeUndefined();
  });

  it('finds a dispatch table from the code and the DDIC and attaches its rows to the exits', async () => {
    expect(hasDynamicCall("CALL FUNCTION l_fname.\n* CALL FUNCTION lv_x.")).toBe(true);
    expect(hasDynamicCall("CALL FUNCTION 'ZA'.")).toBe(false);
    expect(selectTables("SELECT SINGLE fname FROM zdisp WHERE x = 1.\n* SELECT * FROM zold.\nSELECT * FROM mara.")).toEqual(['ZDISP']);
    const def = { description: 'Define exit', fields: [
      { fieldname: 'PROGRAMM', key: true, rollname: 'PROGRAMM', domname: 'PROGRAMM' },
      { fieldname: 'BUKRS', key: true, rollname: 'BUKRS', domname: 'BUKRS', description: 'Company Code' },
      { fieldname: 'FNAME', rollname: 'RS38L_FNAM', domname: 'FUNCNAME' },
    ] };
    expect(dispatchFields(def)).toEqual({ prog: 'PROGRAMM', fname: 'FNAME', org: 'BUKRS', orgText: 'Company Code', text: 'Define exit' });
    expect(dispatchFields({ fields: [{ fieldname: 'A', domname: 'PROGRAMM' }] })).toBeNull();
    const lookup = "FUNCTION zget_exit.\n  SELECT SINGLE fname INTO l_fname FROM zdisp WHERE programm = i_programm.\nENDFUNCTION.";
    const mk = (inc: string, src: string) => ({ typ: 'E', member: `EXIT_${inc}`, include: inc, exists: true, lines: 3, source: src, calledFms: { ZGET_EXIT: { group: 'ZG', lines: 2, source: lookup } } });
    const cmod = { enh: { E1: { projects: [], comps: [
      mk('ZXA01', "CALL FUNCTION 'ZGET_EXIT' EXPORTING i_programm = 'ZXA01' i_bukrs = bukrs IMPORTING o_fname = l_fname.\nCALL FUNCTION l_fname."),
      mk('ZXA02', "CALL FUNCTION 'ZGET_EXIT' EXPORTING i_programm = 'ZXA02' IMPORTING o_fname = l_fname.\nCALL FUNCTION l_fname."),
      { typ: 'E', member: 'EXIT_X', include: 'ZXA03', exists: true, lines: 1, source: "WRITE 1." },
    ] } }, errors: {} };
    const sap = {
      callTool: async ({ name, arguments: a }: { name: string; arguments: Record<string, string> }) => {
        if (name === 'GetTable') return { content: [{ text: JSON.stringify({ table_data: JSON.stringify({ name: a.table_name, ...def }) }) }] };
        if (name === 'SearchObject') return { content: [{ text: JSON.stringify({ results: [{}], rawXML: '/sap/bc/adt/functions/groups/zg/fmodules/x' }) }] };
        if (name === 'GetFunctionModule') return { content: [{ text: JSON.stringify({ function_module_data: `FUNCTION ${a.function_module_name}.\n  WRITE 1.\nENDFUNCTION.` }) }] };
        if (name === 'GetInclude') return { isError: true, content: [{ text: '404' }] };
        return { content: [{ text: JSON.stringify({ rows: [
          { PROGRAMM: 'ZXA01', BUKRS: '', FNAME: 'ZEXIT_ALL' }, { PROGRAMM: 'ZXA01', BUKRS: '2*', FNAME: 'ZEXIT_2' }, { PROGRAMM: 'ZOTHER', BUKRS: '', FNAME: 'ZEXIT_O' },
        ] }) }] };
      },
    };
    await addCmodDispatch(sap, cmod);
    const [c1, c2, c3] = cmod.enh.E1.comps as Array<Record<string, any>>;
    expect(cmod).toMatchObject({ dispatch: [{ table: 'ZDISP', prog: 'PROGRAMM', org: 'BUKRS', fname: 'FNAME', rows: 3 }] });
    expect(c1.dispatch).toEqual([{ table: 'ZDISP', prog: 'ZXA01', org: '', fname: 'ZEXIT_ALL' }, { table: 'ZDISP', prog: 'ZXA01', org: '2*', fname: 'ZEXIT_2' }]);
    expect(c1.calledFms.ZEXIT_2).toMatchObject({ group: 'ZG', dispatch: true, lines: 3 });
    expect(c2.dispatch).toEqual([]);
    expect(c3.dispatch).toBeUndefined();
  });

  it('lists every enhancement of the module projects on one extra activity, named or not by the IMG', async () => {
    const tables = { ...TABLES, MODSAP: [...TABLES.MODSAP, { NAME: 'COOMKS99', TYP: 'E', MEMBER: 'EXIT_X' }], MODACT: [...TABLES.MODACT, { NAME: 'ZCO00001', MEMBER: 'COOMKS99' }, { NAME: 'ZSD00001', MEMBER: 'V54B0001' }], MODATTR: [...TABLES.MODATTR, { NAME: 'ZSD00001', STATUS: 'A' }] };
    const m = await readCmod(fakeSap(tables, OBJECTS), acts, docs, ['3', 'E'], 'CO');
    expect(m.moduleProjects).toEqual(['ZCO00001', 'ZCO00002']);
    expect(m.byActivity[CMOD_PROJECTS_ID].sort()).toEqual(['COOMKS01', 'COOMKS99', 'COPA0002']);
    expect(m.enh.COOMKS99.projects[0]).toMatchObject({ name: 'ZCO00001', active: true });
    const snap = { activities: {}, tree: [{ id: 'X', kind: 'folder', children: [] }], cmod: m };
    addCmodProjectsActivity(snap, 'ko');
    expect(snap.activities[CMOD_PROJECTS_ID].title).toBe('고객 확장 프로젝트 (CMOD): ZCO00001, ZCO00002');
    expect(snap.tree.map((n: { id: string }) => n.id)).toEqual(['X', CMOD_PROJECTS_ID]);
    expect(isCmodActivity(snap.activities[CMOD_PROJECTS_ID])).toBe(true);
  });
});

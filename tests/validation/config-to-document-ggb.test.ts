import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { readGgb, ggbViews, ggbKinds, exitRefs, exitTitles, splitForms, booleanTexts, codeRefs, mdLite } from '../../scripts/config/ggb.mjs';

type Row = Record<string, string | number>;

/** GetSqlQuery (SELECT * … WHERE f IN (…) / f = '…' joined by AND) plus GetProgram / GetInclude. */
function fakeSap(tables: Record<string, Row[]>, programs: Record<string, string>) {
  const cond = (c: string) => {
    let m = /^(\w+) IN \((.*)\)$/.exec(c);
    if (m) { const [, f, list] = m; const vals = [...list.matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1]); return (r: Row) => vals.includes(String(r[f] ?? '')); }
    m = /^(\w+) = '(.*)'$/.exec(c);
    if (m) { const [, f, v] = m; return (r: Row) => String(r[f] ?? '') === v; }
    throw new Error(`fake SQL cannot parse ${c}`);
  };
  return {
    callTool: async ({ name, arguments: a }: { name: string; arguments: Record<string, string> }) => {
      if (name === 'GetProgram' || name === 'GetInclude') {
        const src = programs[a.program_name || a.include_name];
        return src ? { content: [{ text: name === 'GetProgram' ? JSON.stringify({ program_data: src }) : src }] } : { isError: true, content: [{ text: 'not found' }] };
      }
      const m = /^SELECT \* FROM (\S+)(?: WHERE (.*))?$/.exec(a.sql_query)!;
      if (!tables[m[1]]) return { isError: true, content: [{ text: `${m[1]} cannot be read` }] };
      const tests = m[2] ? m[2].split(' AND ').map(cond) : [];
      return { content: [{ text: JSON.stringify({ rows: tables[m[1]].filter((r) => tests.every((t) => t(r))) }) }] };
    },
  };
}

const TABLES: Record<string, Row[]> = {
  GB31: [{ VALUSER: 'GL', VALEVENT: 2, RCLASS: '009' }, { VALUSER: 'CO', VALEVENT: 1, RCLASS: '001' }],
  GB93: [
    { VALID: 'LVAL001', BOOLCLASS: '009', MSGID: 'ZF', GBOPCREATE: 'KIM', GBDTCREATE: '2015-03-01', GBOPCHANGE: 'KIM', GBDTCHANGE: '2016-01-02' },
    { VALID: 'ZOTHER', BOOLCLASS: '009', MSGID: 'ZF', GBOPCREATE: 'LEE', GBOPCHANGE: 'LEE' },
    { VALID: '01-CS01', BOOLCLASS: '043', MSGID: 'Z0', GBOPCREATE: 'SAP', GBOPCHANGE: 'SAP' },
    { VALID: '0_CO_1', BOOLCLASS: '001', MSGID: 'ZCO01', GBOPCREATE: 'SAP', GBOPCHANGE: 'ITSCN002' },
  ],
  GB931: [
    { VALID: 'LVAL001', VALSEQNR: '002', CONDID: '2LVAL001#002', CHECKID: '3LVAL001#002', VALSEVERE: 'E', VALMSG: '010' },
    { VALID: 'LVAL001', VALSEQNR: '001', CONDID: '2LVAL001#001', CHECKID: '3LVAL001#001', VALSEVERE: 'W', VALMSG: '011', MSGTAB1: 'BSEG', MSGFIELD1: 'HKONT' },
  ],
  GB92: [{ SUBSTID: 'LSUB002', BOOLCLASS: '009', SUBSCLASS: '009', EXIT: 'ZGGBS000', GBOPCREATE: 'KIM', GBOPCHANGE: 'KIM' }],
  GB921: [{ SUBSTID: 'LSUB002', SUBSEQNR: '001', CONDID: '1LSUB002#001' }],
  GB922: [
    { SUBSTID: 'LSUB002', SUBSEQNR: '001', CONSEQNR: '01', SUBSTAB: 'BSEG', SUBSFIELD: 'ZUONR', EXITSUBST: 'U120' },
    { SUBSTID: 'LSUB002', SUBSEQNR: '001', CONSEQNR: '02', SUBSTAB: 'BSEG', SUBSFIELD: 'FKBER', SUBSVAL: '0100' },
  ],
  GB93T: [{ LANGU: 'E', VALID: 'LVAL001', VALTEXT: 'Line item check' }, { LANGU: '3', VALID: 'LVAL001', VALTEXT: '라인 점검' }],
  GB92T: [{ LANGU: 'E', SUBSID: 'LSUB002', SUBSTEXT: 'Line item substitution' }],
  GB901: [
    { BOOLID: '2LVAL001#001', SEQNR: '01', BOOLEXP: "<BSEG> HKONT = '0041100000'" },
    { BOOLID: '3LVAL001#001', SEQNR: '01', BOOLEXP: '<BSEG> KOSTL <> \' \'' },
    { BOOLID: '3LVAL001#001', SEQNR: '02', BOOLEXP: 'AND U101' },
    { BOOLID: '2LVAL001#002', SEQNR: '01', BOOLEXP: "<BKPF> BLART = 'SA'" },
    { BOOLID: '3LVAL001#002', SEQNR: '01', BOOLEXP: 'C102' },
    { BOOLID: '1LSUB002#001', SEQNR: '01', BOOLEXP: "<BKPF> BUKRS = '1000'" },
  ],
  T100: [
    { SPRSL: 'E', ARBGB: 'ZF', MSGNR: '010', TEXT: 'Document type not allowed' },
    { SPRSL: '3', ARBGB: 'ZF', MSGNR: '011', TEXT: '코스트센터 필수' },
  ],
  T80D: [{ ARBGB: 'GBLR', FORMPOOL: 'ZGGBR000' }, { ARBGB: 'GBLS', FORMPOOL: 'ZGGBS000' }, { ARBGB: 'GBRU', FORMPOOL: 'RGLVU000' }],
};
const PROGRAMS = {
  ZGGBR000: "PROGRAM zggbr000.\nINCLUDE zggbr000_hq_f01.\nFORM u101 USING b_result.\n  b_result = 'T'.\nENDFORM.",
  ZGGBR000_HQ_F01: [
    '* HQ rules', 'FORM set_exits_hq TABLES exits.',
    "  exits-name  = 'U101'.", '  exits-param = c_exit_param_none.', '  exits-title = text-101.  "Cost center check', '  APPEND exits.',
    "  exits-name  = 'C102'.", "  exits-title = 'China doc type'.", '  APPEND exits.',
    "*  exits-name  = 'U300'.", 'ENDFORM.',
    "FORM c102 USING b_result.\n  IF bkpf-bukrs = '1000'.\n    b_result = 'F'.\n  ENDIF.\nENDFORM.",
    'FORM u199 USING b_result.\nENDFORM.',
  ].join('\n'),
  ZGGBS000: "PROGRAM zggbs000.\nFORM get_exit_titles TABLES etab.\n  exits-name = 'U120'.\n  exits-title = 'Assignment from reference'.\nENDFORM.\nFORM u120.\n  bseg-zuonr = bkpf-xblnr.\nENDFORM.",
};

describe('config-to-document — validations and substitutions (GGB0 / GGB1)', () => {
  it('parses exit references, the exit registry, FORM routines and multi-line Boolean expressions', () => {
    expect(exitRefs("<BSEG> KOSTL <> ' ' AND U101 OR U102")).toEqual(['U101', 'U102']);
    expect(exitRefs('$U101 XU101')).toEqual([]);
    expect(exitRefs("<BKPF> BLART = 'C102' AND C102", new Set(['C102']))).toEqual(['C102']);
    expect(exitTitles(PROGRAMS.ZGGBR000_HQ_F01)).toEqual({ U101: 'Cost center check', C102: 'China doc type' });
    expect(Object.keys(splitForms(PROGRAMS.ZGGBR000_HQ_F01))).toEqual(['SET_EXITS_HQ', 'C102', 'U199']);
    expect(booleanTexts(TABLES.GB901 as Row[])['3LVAL001#001']).toBe("<BSEG> KOSTL <> ' ' AND U101");
  });

  it('reads the assigned and the customer rules of the module, with steps, messages and exits', async () => {
    const c = fakeSap(TABLES, PROGRAMS);
    const snapTables = { T001D: { rows: [{ BUKRS: '1000', EVENT: 2, VALID: 'LVAL001' }] }, T001Q: { rows: [{ BUKRS: '1000', EVENT: 2, SUBST: 'LSUB002' }] } };
    const g = await readGgb(c, 'FI', snapTables);
    // LVAL001 assigned; ZOTHER customer rule of a GL class; 01-CS01 SAP-only and 0_CO_1 a CO class.
    expect(Object.keys(g.rules.VAL).sort()).toEqual(['LVAL001', 'ZOTHER']);
    const v = g.rules.VAL.LVAL001;
    expect(v).toMatchObject({ text: '라인 점검', assigned: true, msgClass: 'ZF' });
    expect(v.steps.map((s: { seq: string }) => s.seq)).toEqual(['001', '002']);
    expect(v.steps[0]).toMatchObject({ severity: 'W', msg: '011', msgText: '코스트센터 필수', msgVars: ['BSEG-HKONT'] });
    expect(v.steps[1].msgText).toBe('Document type not allowed');
    const s = g.rules.SUB.LSUB002;
    expect(s).toMatchObject({ assigned: true, exitPool: 'ZGGBS000', text: 'Line item substitution' });
    expect(s.steps[0]).toMatchObject({ cond: '1LSUB002#001' });
    expect(s.steps[0].sets).toEqual([
      expect.objectContaining({ field: 'BSEG-ZUONR', exit: 'U120' }),
      expect.objectContaining({ field: 'BSEG-FKBER', value: '0100' }),
    ]);
    // Exits: the FORMs the pools register (program + Z include); U199 not registered, RGLVU000 (SAP) skipped.
    expect(Object.keys(g.exits).sort()).toEqual(['ZGGBR000:C102', 'ZGGBR000:U101', 'ZGGBS000:U120']);
    expect(g.exits['ZGGBR000:C102']).toMatchObject({ include: 'ZGGBR000_HQ_F01', kind: 'rule', title: 'China doc type', used: true });
    expect(g.exits['ZGGBR000:U101']).toMatchObject({ include: 'ZGGBR000', title: 'Cost center check', used: true });
    expect(g.exits['ZGGBS000:U120']).toMatchObject({ kind: 'substitution', title: 'Assignment from reference', used: true });
    expect(g.pools.ZGGBR000).toMatchObject({ registered: 2, includes: ['ZGGBR000_HQ_F01'] });
    expect(g.errors).toEqual({});
  });

  it('takes CO rules from the controlling-area assignment (TKAZE) and CO classes', async () => {
    const c = fakeSap(TABLES, PROGRAMS);
    const g = await readGgb(c, 'CO', { TKAZE: { rows: [{ KOKRS: '1000', VALID: '', SUBSTID: 'LSUB002' }] } });
    expect(Object.keys(g.rules.VAL)).toEqual(['0_CO_1']);
    expect(Object.keys(g.rules.SUB)).toEqual(['LSUB002']);
  });

  it('reports a table it cannot read instead of an empty result', async () => {
    const { GB931: _gone, ...rest } = TABLES;
    const g = await readGgb(fakeSap(rest, PROGRAMS), 'FI', { T001D: { rows: [{ VALID: 'LVAL001' }] } });
    expect(g.errors.GB931).toMatch(/cannot be read/);
  });

  it('builds the rule and exit views for the assignment activities', async () => {
    const g = await readGgb(fakeSap(TABLES, PROGRAMS), 'FI', { T001D: { rows: [{ VALID: 'LVAL001' }] }, T001Q: { rows: [{ SUBST: 'LSUB002' }] } });
    expect(ggbKinds({ objects: [{ type: 'V', name: 'V_T001D' }] })).toEqual(['VAL']);
    expect(ggbKinds({ objects: [{ type: 'V', name: 'V_TKAZE' }] })).toEqual(['VAL']);
    expect(ggbKinds({ objects: [{ type: 'V', name: 'V_T001W' }] })).toEqual([]);
    const views = ggbViews(g, ['VAL'], 'ko');
    expect(Object.keys(views)).toEqual(['GGB:VAL', 'GGB:EXIT:VAL']);
    expect(views['GGB:EXIT:VAL'].rows.map((r: string[]) => r[0])).toEqual(['C102', 'U101']);
    expect(ggbViews(g, ['SUB'], 'ko')['GGB:EXIT:SUB'].rows).toEqual([['U120', 'Assignment from reference', 'substitution', 'ZGGBS000', 'ZGGBS000', '3']]);
    const val = views['GGB:VAL'];
    expect(val.cols.map((x: { label: string }) => x.label)).toEqual(['검증', '내역', '단계', '전제조건', '점검', '유형', '메시지', '변경']);
    expect(val.rows[0]).toEqual(['LVAL001', '라인 점검', '001', "2LVAL001#001: <BSEG> HKONT = '0041100000'", "3LVAL001#001: <BSEG> KOSTL <> ' ' AND U101", 'W', 'ZF 011 코스트센터 필수', 'KIM 2016-01-02']);
    expect(val.cust).toContain(0);
    // Reviewed meanings add a column after the step / the exit name.
    const withNotes = ggbViews(g, ['VAL'], 'ko', { steps: { 'LVAL001|001': '계정 41100000이면 코스트센터 필수' }, exits: { 'ZGGBR000:U101': '항상 참' } });
    expect(withNotes['GGB:VAL'].cols.map((x: { label: string }) => x.label).slice(0, 5)).toEqual(['검증', '내역', '단계', '해설', '전제조건']);
    expect(withNotes['GGB:VAL'].rows[0][3]).toBe('계정 41100000이면 코스트센터 필수');
    expect(withNotes['GGB:VAL'].rows[1][3]).toBe('');
    expect(withNotes['GGB:EXIT:VAL'].rows.find((r: string[]) => r[0] === 'U101')).toEqual(['U101', 'Cost center check', '항상 참', 'rule', 'ZGGBR000', 'ZGGBR000', '3']);
    // Each exit row carries its FORM's code and the objects it uses, shown under the row.
    const exitView = withNotes['GGB:EXIT:VAL'];
    const c102 = exitView.rows.findIndex((r: string[]) => r[0] === 'C102');
    expect(exitView.src[c102]).toMatchObject({ include: 'ZGGBR000_HQ_F01', lines: 5 });
    expect(exitView.src[c102].source).toMatch(/^FORM c102/);
    expect(codeRefs("* SELECT x FROM old\nSELECT SINGLE * FROM zfit10050 WHERE a = b. \"from comment\nCALL FUNCTION 'ZFI_CHECK_USERID'.\nUPDATE zfit1 SET a = 1.\nPERFORM set_x.")).toEqual({
      fms: ['ZFI_CHECK_USERID'], reads: ['ZFIT10050'], writes: ['ZFIT1'], performs: ['SET_X'],
    });
    expect(mdLite('## 개요\n| 단계 | 의미 |\n|---|---|\n| 001 | **E** `<BSEG>` |\n- a\n- b\n\n텍스트')).toBe(
      '<h5>개요</h5><table class="mdt"><tr><th>단계</th><th>의미</th></tr><tr><td>001</td><td><b>E</b> <code>&lt;BSEG&gt;</code></td></tr></table><ul><li>a</li><li>b</li></ul><p>텍스트</p>');
    const sub = ggbViews(g, ['SUB'], 'en')['GGB:SUB'];
    expect(sub.rows[0]).toEqual(['LSUB002', 'Line item substitution', '001', "1LSUB002#001: <BKPF> BUKRS = '1000'", 'BSEG-ZUONR, BSEG-FKBER', 'exit U120, 0100', 'KIM']);
  });
});

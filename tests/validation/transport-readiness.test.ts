import { describe, expect, it } from 'vitest';
import { buildModel, findingsFor, verdictOf } from '../../scripts/transport/tr-model.mjs';
import { renderHtml, renderSummary } from '../../scripts/transport/tr-page.mjs';
import { referenceNames } from '../../scripts/transport/build-tr-check.mjs';

const base = () => ({
  system: 'DEV', target: 'QAS',
  requests: [
    { trkorr: 'DEVK900001', kind: 'workbench', status: 'open', owner: 'DEV01', text: '[SD] Pricing report' },
    { trkorr: 'DEVK900002', kind: 'workbench', status: 'open', owner: 'DEV02', text: '[SD] Clean request' },
  ],
  tasks: [
    { trkorr: 'DEVK900011', parent: 'DEVK900001', status: 'open', owner: 'DEV01' },
    { trkorr: 'DEVK900021', parent: 'DEVK900002', status: 'released', owner: 'DEV02' },
  ],
  objects: [
    { trkorr: 'DEVK900001', pgmid: 'R3TR', object: 'PROG', name: 'ZSD_PRICING' },
    { trkorr: 'DEVK900001', pgmid: 'R3TR', object: 'PROG', name: 'ZSD_LOCAL_TEST' },
    { trkorr: 'DEVK900002', pgmid: 'R3TR', object: 'PROG', name: 'ZSD_CLEAN' },
    { trkorr: 'DEVK900002', pgmid: 'CORR', object: 'RELE', name: 'DEVK900021' },
  ],
  others: { ok: true, rows: [{ trkorr: 'DEVK900099', status: 'open', owner: 'DEV09', object: 'PROG', name: 'ZSD_PRICING' }] },
  inactive: { ok: true, scope: 'all', rows: [{ object: 'REPS', name: 'ZSD_PRICING', user: 'DEV01' }] },
  tadir: { ok: true, rows: [{ object: 'PROG', name: 'ZSD_LOCAL_TEST', package: '$TMP' }, { object: 'PROG', name: 'ZSD_CLEAN', package: 'ZSD' }] },
  deps: { ok: true, rows: [{ trkorr: 'DEVK900001', object: 'CODE', name: 'ZSD_PRICING', needs: 'TABL ZSD_PRICE_LOG', in: 'DEVK900077', status: 'open' }] },
});

describe('transport-readiness model', () => {
  it('blocks on open tasks, inactive objects, local packages and unreleased dependencies; warns on shared objects', () => {
    const c = base();
    const kinds = findingsFor(c.requests[0], c).map((f) => `${f.level}:${f.kind}`);
    expect(kinds).toEqual(expect.arrayContaining(['block:open-task', 'block:inactive', 'block:local-package', 'warn:other-request', 'block:dependency']));
    expect(verdictOf(findingsFor(c.requests[0], c))).toBe('blocked');
  });

  it('a request whose tasks are released and whose objects are clean is ready; CORR entries are not objects', () => {
    const m = buildModel(base());
    const clean = m.requests.find((r) => r.trkorr === 'DEVK900002')!;
    expect(clean).toMatchObject({ verdict: 'ready', objects: 1, findings: [] });
    expect(m.summary).toEqual({ total: 2, ready: 1, check: 0, blocked: 1 });
  });

  it('says when the inactive list was partial or not read, instead of claiming none', () => {
    const own = { ...base(), inactive: { ok: true, scope: 'own', rows: [] } };
    expect(findingsFor(own.requests[1], own).map((f) => f.kind)).toEqual(['inactive-partial']);
    expect(verdictOf(findingsFor(own.requests[1], own))).toBe('check');
    const none = { ...base(), inactive: { ok: false, scope: 'none', rows: [] } };
    expect(findingsFor(none.requests[1], none).map((f) => f.kind)).toEqual(['inactive-unread']);
  });

  it('renders ko / en and escapes request texts', () => {
    const c = base();
    c.requests[1].text = '<b>x</b>';
    const m = buildModel(c);
    expect(renderHtml(m, 'ko')).toContain('이관 불가');
    expect(renderHtml(m, 'en')).not.toContain('<b>x</b>');
    expect(renderSummary(m, 'en')).toMatch(/^Transport check \(CTS\) · DEV → QAS · Ready 1 · Check 0 · Blocked 1/);
  });

  it('writes the finding sentences, request type and status in the page language; en keeps the model text', () => {
    const m = buildModel(base());
    const ko = renderHtml(m, 'ko'), ja = renderHtml(m, 'ja'), en = renderHtml(m, 'en');
    expect(ko).toContain('릴리스하지 않은 작업이 1개 있어요.');
    expect(ko).toContain('오브젝트 1개가 다른 열린 요청에도 있어요. 이관 순서를 맞춰 주세요.');
    expect(ko).toContain('유형 워크벤치 · 상태 미릴리스');
    expect(ko).not.toContain('task(s) not released');
    expect(ja).toContain('未リリースのタスクが 1 件あります。');
    expect(ja).toContain('種別 ワークベンチ · ステータス 未リリース');
    expect(en).toContain('1 task(s) not released');
    expect(en).toContain('Type workbench · Status open');
    // an older model without `n` keeps its own text
    const old = { ...m, requests: m.requests.map((r) => ({ ...r, findings: r.findings.map((f) => ({ ...f, n: undefined })) })) };
    expect(renderHtml(old, 'ko')).toContain('1 task(s) not released');
    // a stored target-unread finding without target / dest keeps its text too (never "undefined")
    const tu = { ...m, requests: [{ ...m.requests[1], findings: [{ level: 'warn', kind: 'target-unread', text: 'target PRD could not be read through PRDCLNT100', objects: [] }] }] };
    const tuKo = renderHtml(tu, 'ko');
    expect(tuKo).toContain('target PRD could not be read through PRDCLNT100');
    expect(tuKo).not.toContain('undefined');
  });

  it('reads reference names from a where-used answer', () => {
    expect(referenceNames({ references: [{ name: 'zsd_pricing' }, { objectName: 'ZCL_X' }] })).toEqual(['ZSD_PRICING', 'ZCL_X']);
    expect(referenceNames({})).toEqual([]);
  });
});

describe('transport-readiness target merge', () => {
  const target = (over = {}) => ({
    label: 'QAS', dest: 'QASCLNT100', ok: true, checked: 2, vrsdOk: true, needsOk: true,
    tadir: [{ object: 'PROG', name: 'ZSD_PRICING', package: 'ZSD' }],
    versions: [
      { objtype: 'REPS', objname: 'ZSD_PRICING', korrnum: 'QASK900005', date: '20261101', inSource: false, sourceDate: '', targetText: 'repair in QAS' },
      { objtype: 'REPS', objname: 'ZSD_CLEAN', korrnum: 'DEVK900050', date: '20261110', inSource: true, sourceDate: '20261109120000' },
    ],
    needs: [
      { trkorr: 'DEVK900001', object: 'TABL', name: 'ZSD_NEW_TAB', by: 'PROG ZSD_PRICING', inTarget: false, releasedIn: '' },
      { trkorr: 'DEVK900001', object: 'TABL', name: 'ZSD_OLD_TAB', by: 'PROG ZSD_PRICING', inTarget: true, releasedIn: '' },
      { trkorr: 'DEVK900002', object: 'DTEL', name: 'ZSD_DE', by: 'PROG ZSD_CLEAN', inTarget: false, releasedIn: 'DEVK900040' },
    ],
    ...over,
  });
  const withTarget = (t: object) => {
    const c: any = base();
    c.requests[0].date = '2026-11-12'; c.requests[0].time = '10:00:00';
    c.requests[1].date = '2026-11-05'; c.requests[1].time = '09:00:00';
    return { ...c, targetSystem: t };
  };

  it('blocks a target-only change and a used DDIC object missing in the target', () => {
    const c = withTarget(target());
    const f = findingsFor(c.requests[0], c);
    expect(f.filter((x) => x.kind === 'target-diverged')).toMatchObject([{ level: 'block', objects: ['REPS ZSD_PRICING ← QASK900005 "repair in QAS" (20261101)'] }]);
    expect(f.filter((x) => x.kind === 'missing-in-target')).toMatchObject([{ level: 'block', objects: ['TABL ZSD_NEW_TAB ← PROG ZSD_PRICING'] }]);
  });

  it('warns on a roll-back (target has a later source version) and on a DDIC object that only a released request carries', () => {
    const c = withTarget(target());
    const f = findingsFor(c.requests[1], c).map((x) => `${x.level}:${x.kind}`);
    expect(f).toEqual(['warn:missing-in-target', 'warn:older-than-target']);
    const m = buildModel(c);
    const clean = m.requests.find((r: any) => r.trkorr === 'DEVK900002')!;
    expect(clean.verdict).toBe('check');
    expect(clean.merge).toMatchObject({ dest: 'QASCLNT100', checked: 1, older: ['REPS ZSD_CLEAN ← DEVK900050'], pending: ['DTEL ZSD_DE → DEVK900040'] });
  });

  it('a version of the request itself, or an older source request, is no finding', () => {
    const t = target({ versions: [{ objtype: 'REPS', objname: 'ZSD_CLEAN', korrnum: 'DEVK900030', date: '20261101', inSource: true, sourceDate: '20261101080000' }], needs: [] });
    expect(findingsFor(withTarget(t).requests[1], withTarget(t))).toEqual([]);
  });

  it('a destination that did not answer is a warning, never "fine"', () => {
    const c = withTarget({ label: 'PRD', dest: 'PRDCLNT100', ok: false, error: 'REMOTE_READ: destination PRDCLNT100 is not defined in SM59' });
    const f = findingsFor(c.requests[1], c);
    expect(f.map((x) => `${x.level}:${x.kind}`)).toEqual(['warn:target-unread']);
    const html = renderHtml(buildModel(c), 'ko');
    expect(html).toContain('대상 시스템이 응답하지 않았어요');
    expect(html).not.toContain('대상 시스템과 충돌 없음');
  });

  it('renders the merge section and the CTS titles in ko / en / ja', () => {
    const m = buildModel(withTarget(target()));
    const ko = renderHtml(m, 'ko');
    expect(ko).toContain('<title>CTS 점검');
    expect(ko).toContain('대상 시스템 병합');
    expect(ko).toContain('대상에서 바뀜');
    expect(renderHtml(m, 'en')).toContain('Transport check (CTS)');
    expect(renderHtml(m, 'en')).toContain('Target merge · QAS');
    expect(renderHtml(m, 'ja')).toContain('CTS チェック');
    expect(renderSummary(m, 'ko')).toMatch(/^CTS 점검 · DEV → QAS/);
  });
});

describe('transport-readiness target reads (pure helpers)', () => {
  it('maps request entries to version-directory parts and main programs', async () => {
    const { vrsdKeysOf, masterOf, sourceSidOf, cleanError } = await import('../../scripts/transport/tr-target.mjs');
    expect(vrsdKeysOf({ pgmid: 'R3TR', object: 'CLAS', name: 'ZCL_X' })).toEqual([{ objtype: 'CLSD', objname: 'ZCL_X' }, { objtype: 'CPUB', objname: 'ZCL_X' }]);
    expect(vrsdKeysOf({ pgmid: 'LIMU', object: 'METH', name: 'ZCL_X                         RUN' })).toEqual([{ objtype: 'METH', objname: 'ZCL_X                         RUN' }]);
    expect(vrsdKeysOf({ pgmid: 'CORR', object: 'RELE', name: 'X' })).toEqual([]);
    expect(masterOf({ object: 'CLAS', name: 'ZCL_X' })).toBe('ZCL_X=========================CP');
    expect(masterOf({ object: 'FUGR', name: 'ZFG' })).toBe('SAPLZFG');
    expect(sourceSidOf([{ trkorr: 'DEVK900001' }, { trkorr: 'DEVK900002' }])).toBe('DEV');
    expect(cleanError('MCP error -32603: ADT error: Error: REMOTE_READ: destination X is not defined in SM59')).toBe('REMOTE_READ: destination X is not defined in SM59');
  });

  it('passes over target-side transports of copies and does not trust a reused request number', async () => {
    const { currentChanges } = await import('../../scripts/transport/tr-target.mjs');
    const rows = [
      { OBJTYPE: 'REPS', OBJNAME: 'ZP1', VERSNO: '00000', KORRNUM: 'QASK900136', DATUM: '20220614' },
      { OBJTYPE: 'REPS', OBJNAME: 'ZP1', VERSNO: '00002', KORRNUM: 'QASK900132', DATUM: '20210215' },
      { OBJTYPE: 'REPS', OBJNAME: 'ZP1', VERSNO: '00001', KORRNUM: 'DEVK900010', DATUM: '20201223' },
      { OBJTYPE: 'REPS', OBJNAME: 'ZP2', VERSNO: '00000', KORRNUM: 'QASK900140', DATUM: '20230101' },
    ];
    const source = new Map([
      ['DEVK900010', { TRKORR: 'DEVK900010', AS4DATE: '2020-12-17', AS4TIME: '10:00:00', AS4USER: 'DEV01' }],
      ['QASK900132', { TRKORR: 'QASK900132', AS4DATE: '2016-09-27', AS4USER: 'OTHER' }], // same number, another request
    ]);
    const target = new Map([
      ['QASK900136', { kind: 'T', owner: 'BASIS', date: '20220614', text: 'package copy' }],
      ['QASK900132', { kind: 'T', owner: 'BASIS', date: '20210215' }],
      ['QASK900140', { kind: 'K', owner: 'BASIS', date: '20230101', text: 'repair' }],
    ]);
    const out = currentChanges(rows, source, target, true, 'DEV');
    expect(out.find((v: any) => v.objname === 'ZP1')).toMatchObject({ korrnum: 'DEVK900010', inSource: true, sourceDate: '20201217100000', copiesSkipped: 2 });
    expect(out.find((v: any) => v.objname === 'ZP2')).toMatchObject({ korrnum: 'QASK900140', inSource: false, targetText: 'repair' });
  });
});

describe('sap-reader environment', () => {
  it('passes the sc4sap settings (the account home) to the MCP child', async () => {
    const { sc4sapEnv } = await import('../../scripts/config/sap-reader.mjs');
    expect(sc4sapEnv({ SC4SAP_HOME_DIR: '/acct/home', SC4SAP_MCP_BRIDGE: 'b.cjs', PATH: '/bin', ANTHROPIC_API_KEY: 'x' })).toEqual({ SC4SAP_HOME_DIR: '/acct/home', SC4SAP_MCP_BRIDGE: 'b.cjs' });
  });
});

describe('interface sap-fields on S/4HANA answers', () => {
  it('reads fields from DDL source past annotations, and data elements from ADT XML', async () => {
    const { parseDdlFields, parseDdlIncludes, dtelFromXml } = await import('../../scripts/interface/sap-fields.mjs');
    const ddl = `@EndUserText.label : 'Delivery item'
define table lips {
  key mandt : mandt not null
    with foreign key [0..*,1] t000 where mandt = lips.mandt;
  @AbapCatalog.foreignKey.screenCheck : true
  key vbeln : vbeln_vl not null;
  @AbapCatalog.foreignKey.keyType : #NON_KEY
  matnr : matnr
    with foreign key [0..*,0..1] mara where matnr = lips.matnr;
  lfimg : lfimg;
  brgew : abap.quan(15,3);
  node_data : include tds_node;
}`;
    expect(parseDdlFields(ddl).map((f) => `${f.fieldname}:${f.type}${f.key ? ':K' : ''}`)).toEqual(['MANDT:mandt:K', 'VBELN:vbeln_vl:K', 'MATNR:matnr', 'LFIMG:lfimg', 'BRGEW:abap.quan(15,3)']);
    expect(parseDdlIncludes(ddl)).toEqual(['TDS_NODE']);
    const xml = '<blue:wbobj adtcore:description="Delivery"><dtel:typeKind>domain</dtel:typeKind><dtel:typeName>VBELN</dtel:typeName><dtel:dataType>CHAR</dtel:dataType><dtel:dataTypeLength>000010</dtel:dataTypeLength><dtel:mediumFieldLabel>Delivery</dtel:mediumFieldLabel></blue:wbobj>';
    expect(dtelFromXml(xml)).toMatchObject({ datatype: 'CHAR', leng: '10', description: 'Delivery', domname: 'VBELN' });
  });
});

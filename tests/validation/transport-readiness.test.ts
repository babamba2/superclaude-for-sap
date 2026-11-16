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
    expect(renderSummary(m, 'en')).toMatch(/^Transport readiness · DEV → QAS · Ready 1 · Check 0 · Blocked 1/);
  });

  it('reads reference names from a where-used answer', () => {
    expect(referenceNames({ references: [{ name: 'zsd_pricing' }, { objectName: 'ZCL_X' }] })).toEqual(['ZSD_PRICING', 'ZCL_X']);
    expect(referenceNames({})).toEqual([]);
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

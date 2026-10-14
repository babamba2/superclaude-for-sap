import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'zlib';
// @ts-expect-error — plain .mjs script, no type declarations
import { readIn } from '../../scripts/config/sap-reader.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { itfToBlocks, itfInline } from '../../scripts/config/itf.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { keyString, orderSiblings } from '../../scripts/config/extract-config.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { runChecks } from '../../scripts/config/config-checks.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { buildModel, applyTerms } from '../../scripts/config/build-config-doc.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { pageHtml } from '../../scripts/config/config-doc-page.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { parseNotes, parseTerms, isOfficialSource } from '../../scripts/config/notes.mjs';

describe('config-to-document — SAP documentation (ITF)', () => {
  it('joins continuation lines, drops commands and keeps lists and headings', () => {
    const rows = [
      { LINE: 1, DOKFORMAT: 'AS', DOKTEXT: 'The SAP system manages <DS:GLOS.3526C0>' },
      { LINE: 2, DOKFORMAT: '=', DOKTEXT: 'purchase orders</> as documents.' },
      { LINE: 3, DOKFORMAT: 'B1', DOKTEXT: 'Create new document types' },
      { LINE: 4, DOKFORMAT: '/:', DOKTEXT: 'INCLUDE SIMG_XXRECOMM9 OBJECT DSYS ID CHAP' },
      { LINE: 5, DOKFORMAT: 'UT', DOKTEXT: 'Activities' },
      { LINE: 6, DOKFORMAT: 'N1', DOKTEXT: 'Check the defined document types' },
      { LINE: 7, DOKFORMAT: '', DOKTEXT: 'and number ranges.' },
      { LINE: 8, DOKFORMAT: 'LZ', DOKTEXT: '' },
    ];
    expect(itfToBlocks(rows)).toEqual([
      { t: 'p', text: 'The SAP system manages purchase orders as documents.' },
      { t: 'li', level: 1, text: 'Create new document types' },
      { t: 'h', text: 'Activities' },
      { t: 'ol', level: 1, text: 'Check the defined document types and number ranges.' },
    ]);
    expect(itfInline('a &[SWITCH]X& <ZH>b</> c')).toBe('a b c');
  });
});

describe('config-to-document — transport keys and IMG order', () => {
  it('builds the E071K key the way SAP pads it (client left out)', () => {
    const keys = [
      { name: 'BSTYP', type: 'CHAR', leng: 1 },
      { name: 'BSART', type: 'CHAR', leng: 4 },
      { name: 'POSNR', type: 'NUMC', leng: 5 },
    ];
    expect(keyString({ BSTYP: 'F', BSART: 'NB', POSNR: 10 }, keys)).toBe('FNB  00010');
    expect(keyString({ D: '2026-10-14' }, [{ name: 'D', type: 'DATS', leng: 8 }])).toBe('20261014');
    expect(keyString({ X: true }, [{ name: 'X', type: 'CHAR', leng: 1 }])).toBe('X');
  });

  it('orders IMG siblings along BROTHER_ID (previous sibling) and keeps orphans', () => {
    const list = [
      { NODE_ID: 'C', BROTHER_ID: 'B' },
      { NODE_ID: 'A', BROTHER_ID: '' },
      { NODE_ID: 'X', BROTHER_ID: 'Q' },
      { NODE_ID: 'B', BROTHER_ID: 'A' },
    ];
    expect(orderSiblings(list).map((n: { NODE_ID: string }) => n.NODE_ID)).toEqual(['A', 'B', 'C', 'X']);
  });
});

describe('config-to-document — checks', () => {
  const snapshot = {
    activities: {},
    tables: {
      T161: { rows: [{ BSTYP: 'F', BSART: 'NB', NUMKI: '45' }, { BSTYP: 'F', BSART: 'ZNB', NUMKI: '99' }, { BSTYP: 'B', BSART: 'NB', NUMKI: '01' }] },
      NRIV: { rows: [{ OBJECT: 'EINKBELEG', NRRANGENR: '45' }, { OBJECT: 'BANF', NRRANGENR: '01' }] },
      T024E: { rows: [{ EKORG: '1000' }, { EKORG: '9000' }] },
      T024W: { rows: [{ WERKS: '1000', EKORG: '1000' }] },
      T156: { rows: [{ BWART: '101' }, { BWART: '901' }, { BWART: 'Z01' }] },
    },
  };
  const rules = {
    reads: [],
    rules: [
      { id: 'E', severity: 'error', title: { en: 'nr' }, type: 'exists', from: { table: 'T161', where: { BSTYP: 'F' }, fields: ['NUMKI'] }, to: { table: 'NRIV', where: { OBJECT: 'EINKBELEG' }, fields: ['NRRANGENR'] }, show: ['BSART'] },
      { id: 'A', severity: 'warn', title: { en: 'porg' }, type: 'assigned', from: { table: 'T024E', fields: ['EKORG'] }, to: { table: 'T024W', fields: ['EKORG'] } },
      { id: 'C', severity: 'info', title: { en: 'mvt' }, type: 'custom-keys', table: 'T156', field: 'BWART', pattern: '^(9..|[XYZ].*)$' },
      { id: 'S', severity: 'warn', title: { en: 'skip' }, type: 'exists', from: { table: 'NOPE', fields: ['X'] }, to: { table: 'NRIV', fields: ['X'] } },
    ],
  };
  it('reports exists / assigned / custom-keys findings and skips rules on unread tables', () => {
    const out = runChecks(snapshot, rules, () => [], 'en');
    const by = Object.fromEntries(out.map((c: { id: string }) => [c.id, c]));
    expect(by.E.items).toEqual(['BSART=ZNB, NUMKI=99']);
    expect(by.A.items).toEqual(['EKORG=9000']);
    expect(by.C.items).toEqual(['BWART=901', 'BWART=Z01']);
    expect(by.S.skipped).toMatch(/NOPE/);
  });
});

describe('config-to-document — model and page', () => {
  const snap = {
    meta: { module: 'MM', system: 'DEV', client: '100', sapVersion: 'ECC', extractedAt: '2026-10-14T00:00:00Z', maxRows: 1000, lang: 'ko' },
    tree: [{ kind: 'folder', text: '구매', textEn: 'Purchasing', children: [{ kind: 'activity', activity: 'ACT1' }] }],
    activities: { ACT1: { title: '문서 유형', titleEn: 'Document types', tcode: 'OMEC', docuId: '', objects: [{ type: 'V', name: 'V_T161' }] } },
    views: { V_T161: { name: 'V_T161', root: 'T161', title: '', fields: [
      { field: 'MANDT', table: 'T161', tabField: 'MANDT', key: true, rollname: 'MANDT' },
      { field: 'BSART', table: 'T161', tabField: 'BSART', key: true, rollname: 'ESART' },
      { field: 'BATXT', table: 'T161T', tabField: 'BATXT', key: false, rollname: 'BATXT' },
    ] } },
    clusters: {}, clusterTitles: {},
    tables: {
      T161: { rows: [{ MANDT: '100', BSART: 'NB', _tr: ['DEVK900001'] }, { MANDT: '100', BSART: 'FO' }], fields: [
        { name: 'MANDT', key: true, type: 'CLNT', leng: 3 }, { name: 'BSART', key: true, type: 'CHAR', leng: 4, rollname: 'ESART' }], transports: ['DEVK900001'] },
      T161T: { rows: [{ SPRAS: 'E', BSART: 'NB', BATXT: 'Standard PO' }, { SPRAS: '3', BSART: 'NB', BATXT: '표준 구매오더' }], fields: [
        { name: 'MANDT', key: true, type: 'CLNT', leng: 3 }, { name: 'SPRAS', key: true, type: 'LANG', leng: 1 }, { name: 'BSART', key: true, type: 'CHAR', leng: 4 }, { name: 'BATXT', type: 'CHAR', leng: 20, rollname: 'BATXT' }], transports: [] },
    },
    transports: { DEVK900001: { trkorr: 'DEVK900001', request: 'DEVK900001', date: '2026-01-02', user: 'U', text: 'doc types </script>' } },
    labels: { ESART: { m: '문서 유형' }, BATXT: { m: '내역' } }, domains: {}, docs: {},
  };

  it('joins the text table in the document language, marks customer rows and draws the screen', () => {
    const { views, acts, svgs } = buildModel(snap, 'ko');
    expect(views.V_T161.cols.map((c: { label: string }) => c.label)).toEqual(['문서 유형', '내역']);
    expect(views.V_T161.rows).toEqual([['NB', '표준 구매오더'], ['FO', '']]);
    expect(views.V_T161.cust).toEqual([0]);
    expect(acts.ACT1.status).toBe('custom');
    expect(svgs.V_T161).toMatch(/<svg[^>]*viewBox/);
    expect(svgs.V_T161).toContain('표준 구매오더');
  });

  it('embeds the data gzip-packed, so nothing in it can close the script tag', () => {
    const { views, acts, svgs } = buildModel(snap, 'ko');
    const html = pageHtml({ meta: snap.meta, lang: 'ko', tree: snap.tree, acts, views, checks: [], transports: snap.transports, domains: {}, docs: {} }, svgs);
    expect(html).not.toMatch(/doc types <\/script>/);
    expect(html).toContain('SAP MM 설정 문서');
    const b64 = /id="data">([^<]*)<\/script>/.exec(html)![1];
    const data = JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));
    expect(data.transports.DEVK900001.text).toBe('doc types </script>');
    expect(data.views.V_T161.rows[0]).toEqual(['NB', '표준 구매오더']);
  });
});

describe('config-to-document — view variants and consultant notes', () => {
  it('follows a variant to its base table and applies the selection condition', () => {
    const snap = {
      meta: { module: 'MM', lang: 'ko' }, tree: [], clusters: {}, clusterTitles: {}, labels: {}, domains: {}, docs: {}, transports: {},
      activities: { A: { title: 'PO 유형', objects: [{ type: 'V', name: 'VV_T161_VF' }] } },
      views: {
        VV_T161_VF: { name: 'VV_T161_VF', root: 'V_T161', conds: [{ table: 'T161', field: 'BSTYP', value: 'F' }], fields: [{ field: 'BSART', table: 'T161', tabField: 'BSART', key: true }] },
        V_T161: { name: 'V_T161', root: 'T161', conds: [], fields: [] },
      },
      tables: { T161: { fields: [{ name: 'BSTYP', key: true, type: 'CHAR', leng: 1 }, { name: 'BSART', key: true, type: 'CHAR', leng: 4 }], transports: [],
        rows: [{ BSTYP: 'B', BSART: 'NB' }, { BSTYP: 'F', BSART: 'NB', _tr: ['K1'] }, { BSTYP: 'F', BSART: 'FO' }] } },
    };
    const { views, acts } = buildModel(snap, 'ko', { drawScreens: false });
    expect(views.VV_T161_VF.root).toBe('T161');
    expect(views.VV_T161_VF.rows).toEqual([['NB'], ['FO']]);
    expect(views.VV_T161_VF.cust).toEqual([0]);
    expect(acts.A.tables).toEqual(['T161']);
  });

  it('parses the consultant and reviewer marker text', () => {
    const draft = parseNotes('@@ ACT1\n## purpose\nControls the block.\n## impact\n- Late block (2).\n- Wait 10 s.\n## cautions\n- Check MB_LOCK.\n@@ ACT2\n## impact\n- x\n', 'draft');
    expect(draft.items.ACT1).toMatchObject({ purpose: 'Controls the block.', impact: ['Late block (2).', 'Wait 10 s.'], cautions: ['Check MB_LOCK.'], refs: [] });
    expect(draft.errors).toEqual(['ACT2: empty purpose']);
    const review = parseNotes('@@ ACT1\nverdict: ok\n@@ ACT2\nverdict: fix\n- value 3 is not in the sample\n', 'review');
    expect(review.items.ACT2).toEqual({ verdict: 'fix', issues: ['value 3 is not in the sample'] });
  });
});

describe('config-to-document — reference panel notes', () => {
  it('parses cases, comparison, checklist, criteria and sources', () => {
    const text = [
      '@@ ACT1', '## purpose', 'Sets the block type.', '## sapdoc', 'SAP 문서 요약입니다.',
      '## cases 어떤 잠금을 쓸 것인가',
      '### case CASE 1 — Exclusive block', 'flow: 입력 > ? 재고 충분 > ! 전기', 'desc: 입력 시점에 잠급니다.', 'when: 동시 처리가 적을 때', 'this: no — 값이 2',
      '### case CASE 2 — Late block', 'flow: 입력 > 전기 시 잠금', 'desc: 전기 시점에만 잠급니다.', 'this: yes — 자재보류 = 2',
      '## mix', '대부분 Late block을 씁니다.',
      '## compare', '| 항목 | CASE 1 | CASE 2 |', '|---|---|---|', '| 잠금 시점 | 입력 | 전기 |',
      '## checklist', '- 동시 입력이 많은가', '## criteria', 'rev: 쉬움', 'rec: Late block',
      '## sources', '- Material block | SAP Help | https://help.sap.com/x | 잠금 방식 설명', '',
    ].join('\n');
    const n = parseNotes(text, 'draft').items.ACT1;
    expect(n.sapdoc).toBe('SAP 문서 요약입니다.');
    expect(n.cases.title).toBe('어떤 잠금을 쓸 것인가');
    expect(n.cases.list).toHaveLength(2);
    expect(n.cases.list[0]).toEqual({ title: 'CASE 1 — Exclusive block', flow: ['입력', '? 재고 충분', '! 전기'], desc: '입력 시점에 잠급니다.', when: '동시 처리가 적을 때', thisSystem: 'no — 값이 2' });
    expect(n.compare).toEqual([['항목', 'CASE 1', 'CASE 2'], ['잠금 시점', '입력', '전기']]);
    expect(n.checklist).toEqual(['동시 입력이 많은가']);
    expect(n.criteria).toEqual({ rev: '쉬움', rec: 'Late block' });
    expect(n.sources).toEqual([{ title: 'Material block', source: 'SAP Help', url: 'https://help.sap.com/x', summary: '잠금 방식 설명' }]);
  });
});

describe('config-to-document — glossary for names without a Korean text', () => {
  it('parses term lines and applies them to folders, activity titles and labels', () => {
    expect(parseTerms('t001-001 = 소요량 우선순위 활성화\nnoise\nt001-002 = 배치 | 제품 용어 유지')).toEqual({ 't001-001': '소요량 우선순위 활성화', 't001-002': '배치' });
    const snap = {
      tree: [{ kind: 'folder', text: 'Requirement Prioritization', children: [{ kind: 'folder', text: '구매', children: [] }] }],
      activities: { A: { title: 'Activate Requirement Prioritization' }, B: { title: '문서 유형' } },
      labels: { PACT: { m: 'Active' }, ESART: { m: '문서 유형' } },
    };
    applyTerms(snap, { folder: { 'Requirement Prioritization': '소요량 우선순위' }, activity: { 'Activate Requirement Prioritization': '소요량 우선순위 활성화' }, label: { Active: '활성' } });
    expect(snap.tree[0]).toMatchObject({ text: '소요량 우선순위', textEn: 'Requirement Prioritization' });
    expect(snap.activities.A).toEqual({ title: '소요량 우선순위 활성화', titleEn: 'Activate Requirement Prioritization' });
    expect(snap.activities.B.title).toBe('문서 유형');
    expect(snap.labels.PACT.m).toBe('활성');
  });
});

describe('config-to-document — reader', () => {
  it('reads values containing SELECT / JOIN / FROM one by one so the dispatcher guard cannot reject a chunk', async () => {
    const sqls: string[] = [];
    const client = {
      callTool: async ({ arguments: a }: { arguments: { sql_query: string } }) => {
        sqls.push(a.sql_query);
        if (/SELECT .* WHERE .*(SELECT|JOIN| FROM )/i.test(a.sql_query.replace(/^SELECT \* FROM \w+/, ''))) return { isError: true, content: [{ text: 'sub-queries are not allowed' }] };
        const rows = a.sql_query.includes('LIKE') ? [{ ROLLNAME: 'MD_SELECTION' }, { ROLLNAME: 'MD_SELECXION' }] : [{ ROLLNAME: 'MATNR' }];
        return { content: [{ text: JSON.stringify({ rows }) }] };
      },
    };
    const r = await readIn(client, 'DD04T', 'ROLLNAME', ['MATNR', 'MD_SELECTION']);
    expect(r.ok).toBe(true);
    expect(r.rows.map((x: { ROLLNAME: string }) => x.ROLLNAME).sort()).toEqual(['MATNR', 'MD_SELECTION']);
    expect(sqls.some((s) => /ROLLNAME LIKE 'MD_SELEC_ION'/.test(s))).toBe(true);
    expect(sqls.every((s) => !/WHERE .*SELECT/.test(s))).toBe(true);
  });
});

describe('config-to-document — official SAP sources only', () => {
  it('accepts SAP Help, Notes / KBAs and Learning and refuses everything else', () => {
    expect(isOfficialSource('https://help.sap.com/docs/x')).toBe(true);
    expect(isOfficialSource('https://me.sap.com/notes/1523750')).toBe(true);
    expect(isOfficialSource('https://userapps.support.sap.com/sap/support/knowledge/en/1970502')).toBe(true);
    expect(isOfficialSource('https://learning.sap.com/learning-journeys/x')).toBe(true);
    expect(isOfficialSource('https://community.sap.com/t5/x')).toBe(false);
    expect(isOfficialSource('https://www.sapdatasheet.org/abap/x')).toBe(false);
    expect(isOfficialSource('https://help.sap.com.evil.example/x')).toBe(false);
    expect(isOfficialSource('http://help.sap.com/x')).toBe(false);
    const r = parseNotes('@@ A\n## purpose\nx\n## sources\n- t | SAP Help | https://help.sap.com/a | s\n- t2 | Blog | https://blogs.example.com/b | s\n', 'draft');
    expect(r.errors).toEqual([expect.stringContaining('not official SAP documentation (https://blogs.example.com/b)')]);
  });
});

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
// @ts-expect-error — plain .mjs script, no type declarations
import { parseFmSignature, rowsFromDdic, splitGroups, OUT_TABLE_RE } from '../../scripts/interface/sap-fields.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { ddicToDb, proposeDbType, ruleKind, codeLists } from '../../scripts/interface/if-codes.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { newModel, renumber, orderRows, refreshModel, pendingRefs, resolveModel, textsOf, withTexts, nextVersion } from '../../scripts/interface/if-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { ifValidate, VALIDATE_SRC } from '../../scripts/interface/if-validate.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { pageHtml, modelFromPage } from '../../scripts/interface/if-spec-page.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { cmdInit, cmdImport, cmdRefresh, cmdNextId, cmdTexts, cmdCompanion, cmdFields, versionsOf } from '../../scripts/interface/build-if-spec.mjs';

const FM_SRC = `FUNCTION Z_RFC_DEMO\r
  IMPORTING\r
    VALUE(I_WERKS) TYPE WERKS_D\r
    VALUE(I_DATE) LIKE SY-DATUM OPTIONAL\r
  EXPORTING\r
    VALUE(E_SUBRC) TYPE SYSUBRC\r
  TABLES\r
    IT_ITEMS STRUCTURE ZDEMO_ITEM\r
    ET_RETURN STRUCTURE BAPIRET2 OPTIONAL\r
  EXCEPTIONS\r
    NOT_FOUND.\r
\r
  " body\r
  SELECT * FROM mara INTO TABLE @DATA(x).\r
ENDFUNCTION.`;

const cell = (field: string, ddic: string, extra: Record<string, string> = {}) => {
  const [dt, len] = ddic.split(' ');
  const { type, size } = ddicToDb(dt, len);
  return { table: 'ZT', field, key: 'N', type, size, nul: 'Y', desc: field.toLowerCase(), ddic: `${ddic} · ${field}`, ...extra };
};

describe('interface-mapping-spec — SAP side', () => {
  it('parses the inline FUNCTION signature and skips exceptions', () => {
    const p = parseFmSignature(FM_SRC);
    expect(p.map((x: any) => `${x.section} ${x.name} ${x.typing} ${x.ref}${x.optional ? ' ?' : ''}`)).toEqual([
      'IMPORTING I_WERKS TYPE WERKS_D', 'IMPORTING I_DATE LIKE SY-DATUM ?', 'EXPORTING E_SUBRC TYPE SYSUBRC',
      'TABLES IT_ITEMS STRUCTURE ZDEMO_ITEM', 'TABLES ET_RETURN STRUCTURE BAPIRET2 ?',
    ]);
  });

  it('turns DDIC fields into grid rows with DB types, key / null and drops include markers', () => {
    const rows = rowsFromDdic({ fields: [
      { fieldname: 'MANDT', key: true, datatype: 'CLNT', leng: 3, description: 'Client' },
      { fieldname: '.INCLUDE', comptype: 'S' },
      { fieldname: 'ORGEH', datatype: 'NUMC', leng: 8, rollname: 'ORGEH', domname: 'ORGEH', description: 'Org unit' },
      { fieldname: 'BUDAT', datatype: 'DATS', leng: 8, notnull: true, description: 'Date' },
    ] }, 'ZT');
    expect(rows.map((r: any) => [r.field, r.key, r.type, r.size, r.nul, r.ddic])).toEqual([
      ['MANDT', 'Y', 'CHAR', '3', 'N', 'CLNT 3'], ['ORGEH', 'N', 'NUMBER', '8', 'Y', 'NUMC 8 · ORGEH'], ['BUDAT', 'N', 'DATE', '', 'N', 'DATS 8'],
    ]);
  });

  it('sends EXPORTING and output-named TABLES parameters to the response block', () => {
    expect(['OH_TAB', 'ET_ITEMS', 'RETURN', 'T_RETURN'].every((x) => OUT_TABLE_RE.test(x))).toBe(true);
    expect(['I_TAB', 'ITEMS', 'ORDERS'].some((x) => OUT_TABLE_RE.test(x))).toBe(false);
    const s = splitGroups({ groups: [
      { name: 'I_WERKS', section: 'IMPORTING', shape: 'PARAMETER', rows: [cell('I_WERKS', 'CHAR 4')] },
      { name: 'IT_ITEMS', section: 'TABLES', shape: 'TABLE', rows: [cell('MATNR', 'CHAR 18')] },
      { name: 'ET_RETURN', section: 'TABLES', shape: 'TABLE', rows: [cell('TYPE', 'CHAR 1')] },
      { name: 'E_SUBRC', section: 'EXPORTING', shape: 'PARAMETER', rows: [cell('E_SUBRC', 'INT4 10')] },
    ] });
    expect(s.request.groups.map((g: any) => [g.name, g.kind, g.card, g.rows.map((r: any) => r.field).join()])).toEqual([
      ['', 'PARAMETER', '1:1', 'I_WERKS'], ['IT_ITEMS', 'TABLE', '1:N', 'MATNR'],
    ]);
    expect(s.response.groups.map((g: any) => [g.name, g.kind, g.rows.map((r: any) => r.field).join()])).toEqual([
      ['', 'PARAMETER', 'E_SUBRC'], ['ET_RETURN', 'TABLE', 'TYPE'],
    ]);
    // a DDIC object is one carrier whose kind the scenario decides
    const one = splitGroups({ groups: [{ name: 'ZT', section: 'FIELDS', shape: 'STRUCTURE', ddic: 'ZT', rows: [cell('A', 'CHAR 1')] }] });
    expect(one.request.groups[0]).toMatchObject({ name: 'ZT', kind: '', fallback: 'STRUCTURE' });
  });

  it('proposes DB types for the counterpart and conversion-rule kinds by DDIC type and domain', () => {
    expect(proposeDbType('NUMC', 8)).toEqual({ type: 'VARCHAR2', size: '8' });
    expect(proposeDbType('DATS', 8)).toEqual({ type: 'DATE', size: '' });
    expect(ruleKind({ ddic: 'DATS 8' }, true)).toBe('date-out');
    expect(ruleKind({ ddic: 'CHAR 18 · MATNR', dom: 'MATNR' }, false)).toBe('alpha-in');
    expect(ruleKind({ ddic: 'UNIT 3' }, true)).toBe('quan-out');
    expect(ruleKind({ ddic: 'CHAR 4' }, true)).toBeNull();
    expect(codeLists({ region: ['A', 'B'] }).region).toEqual(['A', 'B']);
  });
});

const grp = (rows: any[], name = '') => ({ request: { groups: [{ name, kind: '', card: '', rows }] }, response: null });
const sapSource = (rows: any[]) => ({ source: grp(rows) });

describe('interface-mapping-spec — model and checks', () => {
  it('builds v0.1 from a preset: proposed target side, MAPPING 1:1, rules linked once per kind', () => {
    const m = newModel({ ifId: 'IF1', lang: 'en', preset: 'master-out', header: { name: 'Plants' },
      sap: sapSource([cell('WERKS', 'CHAR 4', { key: 'Y', nul: 'N' }), cell('ERDAT', 'DATS 8'), cell('AEDAT', 'DATS 8')]) });
    expect(m.header).toMatchObject({ transfer: 'ASYNC', trigger: 'PUSH', cycle: 'DAY', targetLogic: 'INSERT, UPDATE' });
    expect(m.response).toBeNull();
    expect(m.request.rows.map((r: any) => [r.no, r.map, r.r, r.t.type, r.proposed])).toEqual([
      ['A01', 'A01', '', 'VARCHAR2', true], ['A02', 'A02', 'R1', 'DATE', true], ['A03', 'A03', 'R1', 'DATE', true],
    ]);
    expect(m.rules).toEqual([expect.objectContaining({ id: 'R1', kind: 'date-out', proposed: true })]);
    expect(m.request.groups).toEqual([{ id: 'g1', s: { name: '', kind: 'TABLE', card: '0:N' }, t: { name: '', kind: 'TABLE', card: '0:N' } }]);
    expect(m.request.rows.every((r: any) => r.g === 'g1')).toBe(true);
    expect(m.request.source).not.toHaveProperty('structure');
    expect(m.revisions[0]).toMatchObject({ version: '0.1', text: 'First version' });
  });

  it('flags the mistakes of a hand-written mapping', () => {
    const m = newModel({ ifId: 'IF2', lang: 'en', sap: sapSource([
      cell('FIKRS', 'CHAR 4', { key: 'Y', nul: 'N' }), cell('FICTR', 'CHAR 16'), cell('ORGEH', 'NUMC 8')]) });
    const rows = m.request.rows;
    rows[0].t.key = 'N';                       // key lands on a non-key field
    rows[1].t.size = '8';                      // 16 → 8 without a rule
    rows[2].r = ''; rows[2].t.type = 'DATE';   // text / number → date without a rule
    rows.push({ no: 'A04', s: { table: '', field: '', key: '', type: '', size: '', nul: '', desc: '' }, r: 'R9', t: { table: '', field: 'EAI_DATE', key: 'N', type: 'DATE', size: '', nul: 'N', desc: 'Received' }, map: '' });
    rows.push({ no: 'A05', s: { table: '', field: '', key: '', type: '', size: '', nul: '', desc: '' }, r: '', t: { table: '', field: 'X', key: 'N', type: 'CHAR', size: '1', nul: 'Y', desc: 'x' }, map: 'A09' });
    const codes = ifValidate(m).filter((f: any) => f.sev !== 'info').map((f: any) => f.code);
    for (const c of ['KEY_MISMATCH', 'TRUNC', 'TYPE_MISMATCH', 'RULE_MISSING', 'MAP_MISSING', 'REQ']) expect(codes).toContain(c);
    m.rules = [{ id: 'R9', text: 'SYSDATE' }];
    expect(ifValidate(m).some((f: any) => f.code === 'RULE_MISSING')).toBe(false);
    rows[3].r = '';
    expect(ifValidate(m).some((f: any) => f.code === 'UNMAPPED' && f.args.no === 'A04')).toBe(true);
  });

  it('checks carriers and adds a new SAP carrier at refresh as its own group', () => {
    const m = newModel({ ifId: 'IF8', lang: 'en', sap: { source: { request: { groups: [{ name: '', kind: 'PARAMETER', card: '1:1', rows: [cell('P1', 'CHAR 4')] }] }, response: null } } });
    m.request.groups[0].t.card = '';
    expect(ifValidate(m).some((f: any) => f.path === 'request.groups.0.t.card')).toBe(true);
    const c = refreshModel(m, { source: { request: { groups: [
      { name: '', kind: 'PARAMETER', card: '1:1', rows: [cell('P1', 'CHAR 4')] },
      { name: 'IT_X', kind: 'TABLE', card: '0:N', ddic: 'ZX', rows: [cell('F1', 'CHAR 2'), cell('F2', 'CHAR 2')] },
    ] }, response: null } });
    expect(c).toEqual({ added: 2, changed: 0, removed: 0 });
    expect(m.request.groups[1]).toMatchObject({ s: { name: 'IT_X', kind: 'TABLE', card: '0:N', ddic: 'ZX' }, t: { name: 'IT_X', kind: 'TABLE' } });
    expect(m.request.rows.map((r: any) => r.no + r.g)).toEqual(['A01g1', 'A02g2', 'A03g2']);
    const o = { groups: [{ id: 'g1' }, { id: 'g2' }], rows: [{ g: 'g2', n: 1 }, { g: 'g1', n: 2 }, { g: 'gx', n: 3 }, { g: 'g2', n: 4 }] };
    expect(orderRows(o).rows.map((r: any) => r.n)).toEqual([2, 3, 1, 4]);
  });

  it('renumbers rows and carries MAPPING along', () => {
    const rows = [{ no: 'A01', map: '' }, { no: 'A03', map: '' }, { no: 'A02', map: 'A03' }];
    renumber(rows, 'A');
    expect(rows.map((r) => `${r.no}>${r.map}`)).toEqual(['A01>', 'A02>', 'A03>A02']);
    expect(nextVersion('0.9')).toBe('0.10');
  });

  it('refresh keeps user content and marks added / changed / removed SAP fields', () => {
    const m = newModel({ ifId: 'IF3', lang: 'en', sap: sapSource([cell('A', 'CHAR 4'), cell('B', 'CHAR 10'), cell('C', 'CHAR 2')]) });
    m.request.rows[0].t.field = 'A_EXT';
    const c = refreshModel(m, sapSource([cell('A', 'CHAR 4'), cell('B', 'CHAR 20'), cell('D', 'DATS 8')]));
    expect(c).toEqual({ added: 1, changed: 1, removed: 1 });
    const by = Object.fromEntries(m.request.rows.map((r: any) => [r.s.field, r]));
    expect(by.A.t.field).toBe('A_EXT');
    expect(by.B).toMatchObject({ sync: 'changed', was: { size: '10' } });
    expect(by.C.sync).toBe('removed');
    expect(by.D).toMatchObject({ sync: 'added', proposed: true, r: expect.stringMatching(/^R\d$/) });
  });

  it('refresh with SAP on both sides keeps marks of both passes and does not propose', () => {
    const tgt = (f: string) => cell(f, 'CHAR 4', { table: 'TGT' });
    const m = newModel({ ifId: 'IF3B', lang: 'en', sapSide: 'both', sap: { ...sapSource([cell('A', 'CHAR 4'), cell('B', 'CHAR 4')]), target: grp([tgt('A'), tgt('B')]) } });
    const c = refreshModel(m, { ...sapSource([cell('A', 'CHAR 4'), cell('C', 'CHAR 4')]), target: grp([tgt('A'), tgt('B')]) });
    expect(c).toEqual({ added: 1, changed: 0, removed: 1 });
    const by = Object.fromEntries(m.request.rows.map((r: any) => [r.s.field || r.t.field, r]));
    expect(by.B.sync).toBe('removed');
    expect(by.C).toMatchObject({ sync: 'added', t: { field: '' } });
    expect(by.C.proposed).toBeUndefined();
  });

  it('refresh keeps the user\'s description / key and counts a removed field once', () => {
    const m = newModel({ ifId: 'IF3C', lang: 'en', sap: sapSource([cell('A', 'CHAR 4'), cell('B', 'CHAR 4')]) });
    m.request.rows[0].s.desc = 'Edited by the consultant';
    m.request.rows[0].s.key = 'Y';
    const fresh = sapSource([cell('A', 'CHAR 4')]);
    expect(refreshModel(m, fresh)).toEqual({ added: 0, changed: 0, removed: 1 });
    expect(m.request.rows[0].s).toMatchObject({ desc: 'Edited by the consultant', key: 'Y' });
    expect(refreshModel(m, fresh)).toEqual({ added: 0, changed: 0, removed: 0 });
    expect(m.request.rows[1].sync).toBe('removed');
  });

  it('fills hand-typed SAP fields (TABLE-FIELD) and proposes the other side', () => {
    const m = newModel({ ifId: 'IF4', lang: 'en', sap: sapSource([]) });
    m.request.rows.push({ no: 'A01', s: { table: '', field: 'LIPS-MATNR', key: '', type: '', size: '', nul: '', desc: 'My text' }, r: '', t: { table: '', field: '', key: '', type: '', size: '', nul: '', desc: '' }, map: '' });
    expect(pendingRefs(m)).toEqual(['LIPS-MATNR']);
    expect(ifValidate(m).map((f: any) => f.code)).toContain('NEEDS_RESOLVE');
    expect(resolveModel(m, [{ ...cell('MATNR', 'CHAR 18', { table: 'LIPS', dom: 'MATNR' }), ref: 'LIPS-MATNR' }])).toBe(1);
    expect(m.request.rows[0]).toMatchObject({ s: { field: 'MATNR', type: 'CHAR', desc: 'My text' }, t: { field: 'MATNR', type: 'VARCHAR2' }, map: 'A01', r: 'R1' });
  });

  it('companion texts round-trip and mark the model as a companion', () => {
    const m = newModel({ ifId: 'IF5', lang: 'ko', header: { name: '이름' }, sap: sapSource([cell('A', 'CHAR 4')]) });
    const t = textsOf(m);
    expect(t['header.name']).toBe('이름');
    const en = withTexts(m, 'en', { 'header.name': 'Name', 'bogus.path': 'x' });
    expect(en).toMatchObject({ lang: 'en', companionOf: 'ko', header: { name: 'Name' } });
  });
});

describe('interface-mapping-spec — page', () => {
  it('embeds the model, runs the same checks in the page and parses as script', () => {
    const m = newModel({ ifId: 'IF6', lang: 'ko', header: { name: '</script><b>x' }, sap: sapSource([cell('A', 'CHAR 4')]) });
    const html = pageHtml({ model: m, project: { title: 'T', docNo: 'D-IF6' }, companion: 'IF6-v0.1-en.html' });
    expect(html).not.toContain('</script><b>x');
    expect(modelFromPage(html)).toEqual(m);
    expect(html).toContain(VALIDATE_SRC.slice(0, 60));
    const script = html.split('<script>\n')[1].split('</script>')[0];
    expect(() => new Function(script)).not.toThrow();
  });

  it('keeps a forged sync value and language out of the markup', () => {
    const m = newModel({ ifId: 'IF7', lang: 'en', sap: sapSource([cell('A', 'CHAR 4')]) });
    m.request.rows[0].sync = '"><img src=x onerror=alert(1)>';
    m.lang = 'en" onload="x';
    const html = pageHtml({ model: m });
    expect(html).toContain('<html lang="ko">');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain("['added','changed','removed'].includes(r.sync)");
  });
});

describe('interface-mapping-spec — CLI flow (SAP stubbed)', () => {
  const root = mkdtempSync(join(tmpdir(), 'ifspec-'));
  const read = async (objects: any, _l: any, fields: any) => ({
    sap: fields?.source ? sapSource(fields.source.map((f: string) => cell(f.split('-').pop()!, f.endsWith('DAT') ? 'DATS 8' : f.endsWith('POSNR') ? 'NUMC 6' : 'CHAR 10', { table: f.split('-')[0] }))) : sapSource([cell('A', 'CHAR 4')]),
    problems: [],
  });

  it('numbers, builds, imports and refreshes', async () => {
    writeFileSync(join(root, 'project.json'), JSON.stringify({ idPattern: '{module}{seq:5}', title: { ko: '정의서', en: 'Spec' } }));
    mkdirSync(join(root, 'SD00007'));
    expect(cmdNextId(root, 'sd').ifId).toBe('SD00008');
    const out = await cmdInit(root, { module: 'SD', lang: 'ko', preset: 'txn-out', header: { name: 'n', author: 'a' }, fields: { source: ['LIKP-VBELN', 'LIKP-ERDAT'] } }, { read });
    expect(out).toMatchObject({ version: '0.1' });
    expect(existsSync(join(root, 'SD00008', 'SD00008-v0.1-ko.html'))).toBe(true);
    await expect(cmdInit(root, { ifId: 'SD00008', lang: 'ko' }, { read })).rejects.toThrow(/already/);

    // a page saved in edit mode: version raised, revision added, base recorded
    const m = modelFromPage(readFileSync(out.html, 'utf8'));
    m.baseVersion = m.version; m.version = '0.2';
    m.request.rows.push({ no: 'A03', s: { table: '', field: 'LIPS-POSNR', key: '', type: '', size: '', nul: '', desc: '' }, r: '', t: { table: '', field: '', key: '', type: '', size: '', nul: '', desc: '' }, map: '' });
    const edited = join(root, 'edited.html');
    writeFileSync(edited, pageHtml({ model: m }));
    const resolve = async (refs: string[]) => ({ rows: refs.map((r) => ({ ...cell('POSNR', 'NUMC 6', { table: 'LIPS' }), ref: r })), problems: [] });
    const imp = await cmdImport(root, edited, { resolve });
    expect(imp).toMatchObject({ version: '0.2', from: '0.1', resolved: 1 });
    await expect(cmdImport(root, edited, { resolve })).rejects.toThrow(/already exists/);
    expect(versionsOf(join(root, 'SD00008'), 'SD00008', 'ko')).toEqual(['0.1', '0.2']);

    const ref = await cmdRefresh(root, 'SD00008', { read });
    expect(ref).toMatchObject({ unchanged: true });
    expect(cmdFields(root, 'SD00008').request.map((g: any) => [g.kind, g.occurrence, g.fields.map((f: any) => f.field).join()])).toEqual([['TABLE', '1:N', 'VBELN,ERDAT,POSNR']]);

    // pages changed outside edit mode, or the companion, are refused
    const bad = modelFromPage(readFileSync(imp.html, 'utf8'));
    bad.version = '0.1/../../x'; bad.baseVersion = '0.2';
    writeFileSync(edited, pageHtml({ model: bad }));
    await expect(cmdImport(root, edited, { resolve })).rejects.toThrow(/not valid/);

    // next-id spells literal parts as the folder names do
    writeFileSync(join(root, 'project.json'), JSON.stringify({ idPattern: 'IF#{seq:3}' }));
    mkdirSync(join(root, 'IF_004'));
    expect(cmdNextId(root).ifId).toBe('IF_005');
    writeFileSync(join(root, 'project.json'), JSON.stringify({ idPattern: '{module}{seq:5}', title: { ko: '정의서', en: 'Spec' } }));

    const t = cmdTexts(root, 'SD00008', 'en');
    writeFileSync(t.outFile, JSON.stringify(Object.fromEntries(Object.keys(JSON.parse(readFileSync(t.todoFile, 'utf8'))).map((k) => [k, 'EN']))));
    const c = cmdCompanion(root, 'SD00008', 'en');
    expect(c).toMatchObject({ lang: 'en', version: '0.2', missing: [] });
    expect(readFileSync(c.primary, 'utf8')).toContain('href="SD00008-v0.2-en.html"');
    const comp = modelFromPage(readFileSync(c.html, 'utf8'));
    comp.baseVersion = comp.version; comp.version = '0.3';
    writeFileSync(edited, pageHtml({ model: comp }));
    await expect(cmdImport(root, edited, { resolve })).rejects.toThrow(/companion/);
  });
});

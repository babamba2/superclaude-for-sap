import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { READ_TOOLS, readForm, readFormDdic } from '../../scripts/smartform/preview-sap.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { fieldsFrom } from '../../scripts/smartform/preview-workbench.mjs';

// A fake MCP client answering like the sc4sap server (invented objects only); every call is recorded.
type Answer = { text: string; isError?: boolean } | Error;
function fakeClient(answers: Record<string, (args: any) => Answer>) {
  const calls: { name: string; args: any }[] = [];
  return {
    calls,
    callTool: async ({ name, arguments: args }: { name: string; arguments: any }) => {
      calls.push({ name, args });
      const a = (answers[name] ?? (() => ({ text: `MCP error -32603: ${name} not stubbed`, isError: true })))(args);
      if (a instanceof Error) throw a;
      return { content: [{ type: 'text', text: a.text }], isError: !!a.isError };
    },
  };
}
const ok = (o: unknown) => ({ text: JSON.stringify(o) });
const err = (m: string) => ({ text: m, isError: true });
const stru = (name: string, fields: unknown[]) => ok({ success: true, structure_name: name, structure_data: JSON.stringify({ name, fields }) });
const dtel = (name: string, o: unknown) => ok({ success: true, data_element_name: name, data_element_data: JSON.stringify({ name, ...(o as object) }) });

const dir = mkdtempSync(join(tmpdir(), 'sf-sap-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const CONTENT = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'smartform', 'form-b.content.json'), 'utf8'));

describe('preview-sap — readForm', () => {
  const out = join(dir, 'smartforms', 'ztest_form_b');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(dir, 'secret.txt'), 'TOP-SECRET');
  writeFileSync(join(out, 'logo.bmp'), 'BMPDATA');
  const withGfx = { ...CONTENT, graphics: [
    { object: 'GRAPHICS', name: 'ZTEST_LOGO', id: 'BMAP', btype: 'BCOL', file: join(out, 'logo.bmp') },
    { object: 'GRAPHICS', name: 'ZTEST_SIGN', id: 'BMAP', btype: 'BCOL', file: join(dir, 'secret.txt') },
  ] };
  writeFileSync(join(out, 'ztest_form_b.content.json'), JSON.stringify(withGfx));
  const summary = (file: string) => ok({ form: 'ZTEST_FORM_B', files: { content: file } });

  it('reads the content and the graphics inside the form folder only', async () => {
    const c = fakeClient({ GetSmartFormContent: () => summary(join(out, 'ztest_form_b.content.json')) });
    const r = await readForm(c, 'ztest_form_b');
    expect(r.ok).toBe(true);
    expect(r.content.form).toBe('ZTEST_FORM_B');
    expect(r.graphics).toEqual({ ZTEST_LOGO: { mime: 'image/bmp', base64: Buffer.from('BMPDATA').toString('base64') } });
    expect(c.calls).toEqual([{ name: 'GetSmartFormContent', args: { form_name: 'ZTEST_FORM_B', summary: true } }]);
  });

  it('maps the helper / not-found answers, refuses bad names and odd files, never throws', async () => {
    const no = fakeClient({ GetSmartFormContent: () => err('MCP error -32603: Error: The SAP side of GetSmartFormContent is not installed on this system: it needs FM ZMCP_SSF_CONTENT') });
    expect(await readForm(no, 'ZTEST_FORM_B')).toMatchObject({ ok: false, code: 'no-helper' });
    const nf = fakeClient({ GetSmartFormContent: () => err('MCP error -32603: Error: Form or text ZNOPE does not exist') });
    expect(await readForm(nf, 'ZNOPE')).toMatchObject({ ok: false, code: 'not-found' });
    const boom = fakeClient({ GetSmartFormContent: () => new Error('socket hang up') });
    expect(await readForm(boom, 'ZTEST_FORM_B')).toMatchObject({ ok: false, code: 'failed', error: 'socket hang up' });
    const odd = fakeClient({ GetSmartFormContent: () => summary(join(dir, 'secret.txt')) });
    expect(await readForm(odd, 'ZTEST_FORM_B')).toMatchObject({ ok: false, code: 'failed' });
    const none = fakeClient({});
    for (const bad of ['', "Z'; DROP", '../X', 'A'.repeat(31)]) {
      expect(await readForm(none, bad)).toMatchObject({ ok: false, code: 'bad-name' });
    }
    expect(none.calls).toEqual([]);
  });
});

describe('preview-sap — readFormDdic', () => {
  const content = { ...CONTENT, data: [...CONTENT.data, { name: 'GV_LTX', scope: 'global', typing: 'LIKE', typeName: 'ZTEST_T247-LTX' }, { name: 'GV_S', scope: 'global', typing: 'TYPE', typeName: 'STRING' }, { name: 'GV_NOPE', scope: 'global', typing: 'TYPE', typeName: 'ZNOPE' }] };
  content.pages = structuredClone(CONTENT.pages);
  content.pages[0].windows[1].content.push({ kind: 'text', name: '%TEXT90', caption: 'x', children: [], lines: [{ format: 'AA', text: '&GV_LTX& &GV_S& &GV_NOPE& &GS_HEAD-ADR-CITY1& &GT_POS-ARKTX&' }] });

  const client = fakeClient({
    GetStructure: ({ structure_name: n }: any) => ({
      ZTEST_S_HEADB: stru(n, [
        { fieldname: 'NAME1', datatype: 'CHAR', leng: 35, description: 'Name 1', comptype: 'E' },
        { fieldname: '.INCLUDE', comptype: 'S', precfield: 'ZTEST_INC' },
        { fieldname: 'VBELN', datatype: 'CHAR', leng: 10, comptype: 'E' },
        { fieldname: 'FKDAT', datatype: 'DATS', leng: 8, comptype: 'E' },
        { fieldname: 'KDGRP', datatype: 'CHAR', leng: 2, comptype: 'E' },
        { fieldname: 'ADR', comptype: 'S', rollname: 'ZTEST_S_ADR' },
      ]),
      ZTEST_S_ADR: stru(n, [{ fieldname: 'CITY1', datatype: 'CHAR', leng: 40, comptype: 'E' }]),
      ZTEST_S_POS: stru(n, [{ fieldname: 'POSNR', datatype: 'NUMC', leng: 6 }, { fieldname: 'ARKTX', datatype: 'CHAR', leng: 40 }, { fieldname: 'NETWR', datatype: 'CURR', leng: 15, decimals: 2 }]),
      ZTEST_T247: stru(n, [{ fieldname: 'LTX', datatype: 'CHAR', leng: 15, description: 'Month' }]),
    } as Record<string, Answer>)[n] ?? err(`MCP error -32603: Error: ZMCP_ADT_DDIC_TABL_READ subrc=4: Table/structure ${n} not in DD02L`),
    GetDataElement: ({ data_element_name: n }: any) => (n === 'WRBTR' ? dtel(n, { datatype: 'CURR', leng: 13, decimals: 2, description: 'Amount' }) : err(`MCP error -32603: ${n} not found`)),
    GetTypeInfo: ({ type_name: n }: any) => (n === 'ZTEST_T_POS' ? ok({ name: n, kind: 'TTYP', rowtype: 'ZTEST_S_POS' }) : err(`MCP error -32603: Type ${n} was not found`)),
  });

  it('reads structures (nested flattened, includes skipped), elements, table types, TABLE-FIELD and built-ins', async () => {
    const r = await readFormDdic(client, content);
    expect(r.ddic.ZTEST_S_HEADB.fields).toMatchObject({ NAME1: { type: 'CHAR', length: 35, decimals: 0, desc: 'Name 1' }, 'ADR-CITY1': { type: 'CHAR', length: 40 } });
    expect(Object.keys(r.ddic.ZTEST_S_HEADB.fields)).not.toContain('.INCLUDE');
    expect(r.ddic.WRBTR).toEqual({ type: 'CURR', length: 13, decimals: 2, desc: 'Amount' });
    expect(r.ddic.ZTEST_T_POS).toEqual({ lineType: 'ZTEST_S_POS' });
    expect(r.ddic['ZTEST_T247-LTX']).toEqual({ type: 'CHAR', length: 15, decimals: 0, desc: 'Month' });
    expect(r.ddic.STRING).toMatchObject({ type: 'STRING' });
    expect(r.unknown).toEqual(['ZNOPE']);
    // only read tools, one GetStructure per type
    expect(new Set(client.calls.map((c) => c.name))).toEqual(new Set(['GetStructure', 'GetDataElement', 'GetTypeInfo']));
    for (const c of client.calls) expect(READ_TOOLS).toContain(c.name);
    const structs = client.calls.filter((c) => c.name === 'GetStructure').map((c) => c.args.structure_name);
    expect(structs.length).toBe(new Set(structs).size);
    // the shape fieldsFrom takes
    const fields = fieldsFrom(content, r.ddic);
    expect(fields['GS_POS-NETWR']).toMatchObject({ type: 'CURR', length: 15, decimals: 2, inLoop: true });
    expect(fields['GS_HEAD-ADR-CITY1']).toMatchObject({ type: 'CHAR', length: 40 });
    expect(fields.GV_LTX).toMatchObject({ type: 'CHAR', length: 15, desc: 'Month' });
    expect(fields.GV_TOTAL).toMatchObject({ type: 'CURR', length: 13 });
    expect(fields.GV_NOPE.type).toBe('');
    expect(fields['GT_POS-ARKTX']).toMatchObject({ type: 'CHAR', length: 40 }); // table type → its line type
  });

  it('never throws: a broken client gives errors and unknown types', async () => {
    const broken = { callTool: async () => { throw new Error('connection closed'); } };
    const r = await readFormDdic(broken, content);
    expect(r.ddic).toMatchObject({ STRING: { type: 'STRING' } });
    expect(r.unknown).toContain('ZTEST_S_HEADB');
    expect(await readFormDdic(broken, null)).toMatchObject({ ddic: {}, unknown: [] });
  });
});

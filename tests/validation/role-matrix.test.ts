import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { normalizeModel, deriveView, renameBrole, renameTrole, nextVersion, toCsv } from '../../scripts/role/role-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { mapRoles, levelFromActvt, moduleOf, likeOf, readRoleNames } from '../../scripts/role/sap-roles.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderPage } from '../../scripts/role/role-page.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderSheet, renderCover, sheetRows, sheetColumns, shownColumns, pageSize, labelsFor, sheetsOf, cellValue, columnValues } from '../../scripts/role/role-render.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { cmdInit, cmdImport, cmdSod, buildDoc, cmdLayout, cmdImportForm } from '../../scripts/role/build-role-doc.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { checkLayout, columnCatalog } from '../../scripts/role/role-layout.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { readTemplate } from '../../scripts/role/read-template.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { zipFiles } from '../../scripts/spec/xlsx-zip.mjs';

const EXAMPLE = join(__dirname, '..', '..', 'scripts', 'role', 'example-draft.json');
const draft = () => JSON.parse(readFileSync(EXAMPLE, 'utf8'));

describe('role-matrix model', () => {
  it('derives counts, SoD conflicts per user and inside a role, and checks', () => {
    const m = normalizeModel(draft());
    m.users.push({ uid: 'BOTH', roles: { 'PM-02': 'X', 'PM-04': 'X' } });
    m.sod.push({ id: 'SOD-09', kind: 'lib', level: 'H', tcodesA: ['IW31'], tcodesB: ['IW32'] });
    const v = deriveView(m);
    expect(v.tcCount['PM-01']).toMatchObject({ all: 6, F: 6 });
    expect(v.userCount['PM-02']).toBe(2);
    expect(v.hitById.get('SOD-01').users).toEqual(['BOTH']);
    expect(v.hitById.get('SOD-09').inherent).toEqual(['PM-02']); // IW31 F and IW32 C in the same business role
    expect(v.checks.some((c) => c.text === 'sodUsers' && c.sev === 'err')).toBe(true);
  });

  it('renames a business role in every sheet and a technical role in the mapping', () => {
    const m = renameBrole(normalizeModel(draft()), 'PM-04', 'PM-SUP');
    expect(m.tcodes.find((c) => c.tcode === 'IW32').levels).toHaveProperty('PM-SUP', 'C');
    expect(m.users.find((u) => u.uid === 'PM_LEE').roles).toHaveProperty('PM-SUP');
    expect(m.sod.find((s) => s.id === 'SOD-01').b).toBe('PM-SUP');
    expect(m.troles.find((t) => t.id === 'Z_PM_SUPV_1000').brole).toBe('PM-SUP');
    const n = renameTrole(m, 'Z_PM_PLANNER_1000', 'Z_PM_PLAN_1000');
    expect(n.broles.find((b) => b.id === 'PM-02').troles).toContain('Z_PM_PLAN_1000');
    expect(n.auths.filter((a) => a.trole === 'Z_PM_PLAN_1000').length).toBeGreaterThan(0);
  });

  it('versions in 0.1 steps and writes Excel-safe CSV', () => {
    expect(nextVersion('')).toBe('0.1');
    expect(nextVersion('0.9')).toBe('0.10');
    expect(nextVersion('0.3', { major: true })).toBe('1.0');
    expect(toCsv(['a', 'b'], [['x,y', 'q"']])).toBe('﻿a,b\r\n"x,y","q"""\r\n');
  });
});

describe('role-matrix SAP mapping', () => {
  it('maps PFCG rows to business roles, levels, auths and assignments', () => {
    const rows = {
      define: [{ AGR_NAME: 'Z_MM_BUYER' }, { AGR_NAME: 'Z_MM_BUYER_1000', PARENT_AGR: 'Z_MM_BUYER' }, { AGR_NAME: 'Z_MM_DISP' }, { AGR_NAME: 'Z_C_MM' }],
      texts: [{ AGR_NAME: 'Z_MM_BUYER', LINE: '00000', TEXT: 'Buyer' }],
      flags: [{ AGR_NAME: 'Z_C_MM', FLAG_TYPE: 'COLL_AGR', FLAG_VALUE: 'X' }],
      agrs: [{ AGR_NAME: 'Z_C_MM', CHILD_AGR: 'Z_MM_DISP' }],
      tcodes: [{ AGR_NAME: 'Z_MM_BUYER', TYPE: 'TR', TCODE: 'ME21N' }, { AGR_NAME: 'Z_MM_BUYER', TYPE: 'TR', TCODE: 'ME23N' }, { AGR_NAME: 'Z_MM_DISP', TYPE: 'TR', TCODE: 'MMBE' }],
      auth: [{ AGR_NAME: 'Z_MM_BUYER', OBJECT: 'M_BEST_BSA', FIELD: 'ACTVT', LOW: '01' }, { AGR_NAME: 'Z_MM_BUYER', OBJECT: 'M_BEST_BSA', FIELD: 'ACTVT', LOW: '02' },
        { AGR_NAME: 'Z_MM_DISP', OBJECT: 'M_MSEG_WMB', FIELD: 'ACTVT', LOW: '03' }, { AGR_NAME: 'Z_MM_BUYER_1000', OBJECT: 'M_BEST_EKO', FIELD: 'EKORG', LOW: '1000' }],
      org: [{ AGR_NAME: 'Z_MM_BUYER_1000', VARBL: '$EKORG', LOW: '1000' }],
      usorg: [{ VARBL: '$EKORG', FIELD: 'EKORG' }],
      users: [{ AGR_NAME: 'Z_MM_BUYER_1000', UNAME: 'U1', FROM_DAT: '20260101', TO_DAT: '99991231' }, { AGR_NAME: 'Z_MM_DISP', UNAME: 'U2', FROM_DAT: '20200101', TO_DAT: '20210101' },
        { AGR_NAME: 'Z_C_MM', UNAME: 'U3', FROM_DAT: '20260101', TO_DAT: '99991231' }],
      tstct: [{ TCODE: 'ME23N', TTEXT: 'Display Purchase Order' }, { TCODE: 'ME21N', TTEXT: 'Create Purchase Order' }],
      tobjt: [{ OBJECT: 'M_BEST_BSA', TTEXT: 'Document Type in PO' }],
    };
    const r = mapRoles(rows, { today: '2026-10-28' });
    const buyer = r.broles.find((b) => b.troles.includes('Z_MM_BUYER'));
    expect(buyer.id).toBe('MM-01');
    expect(buyer.troles).toEqual(['Z_MM_BUYER', 'Z_MM_BUYER_1000']);
    expect(r.troles.find((t) => t.id === 'Z_MM_BUYER_1000')).toMatchObject({ type: 'Derived', orgLevel: 'Purchasing Org', orgValue: '1000' });
    expect(r.troles.find((t) => t.id === 'Z_MM_BUYER').type).toBe('Master');
    expect(r.troles.find((t) => t.id === 'Z_C_MM')).toMatchObject({ type: 'Composite', children: ['Z_MM_DISP'] });
    const me21n = r.tcodes.find((t) => t.tcode === 'ME21N'), me23n = r.tcodes.find((t) => t.tcode === 'ME23N');
    expect(me21n.levels[buyer.id]).toBe('F');
    expect(me23n.levels[buyer.id]).toBe('D');
    const comp = r.broles.find((b) => b.troles.includes('Z_C_MM'));
    expect(r.tcodes.find((t) => t.tcode === 'MMBE').levels[comp.id]).toBe('D');
    expect(r.auths.some((a) => a.trole === 'Z_MM_BUYER_1000')).toBe(false); // derived: org values only
    expect(r.auths.find((a) => a.object === 'M_BEST_BSA').value).toBe('01, 02');
    expect(r.users.map((u) => u.uid)).toEqual(['U1', 'U3']); // U2 expired
    expect(r.users[0].roles).toEqual({ [buyer.id]: 'X' });
    expect(r.users[0]).not.toHaveProperty('name');
  });

  it('reads more roles than one read returns by splitting the name range', async () => {
    const names = ['Z', ...Array.from({ length: 30 }, (_, i) => `ZA${String(i).padStart(2, '0')}`), ...Array.from({ length: 12 }, (_, i) => `ZB_${i}`), 'Z_X'];
    // fake GetSqlQuery: LIKE 'Z%' plus >= / < / = on AGR_NAME, at most row_number rows
    const client = { callTool: async ({ arguments: a }: any) => {
      const w = a.sql_query.split(' WHERE ')[1];
      const ge = /AGR_NAME >= '([^']*)'/.exec(w)?.[1], lt = /AGR_NAME < '([^']*)'/.exec(w)?.[1], eq = /AGR_NAME = '([^']*)'/.exec(w)?.[1];
      const hit = names.filter((n) => n.startsWith('Z') && (ge == null || n >= ge) && (lt == null || n < lt) && (eq == null || n === eq));
      const rows = hit.slice(0, a.row_number).map((n) => ({ AGR_NAME: n, PARENT_AGR: '' }));
      return { content: [{ type: 'text', text: JSON.stringify({ rows, ...(hit.length > a.row_number ? { truncated: true } : {}) }) }] };
    } };
    const r = await readRoleNames(client, 'Z*', 10);
    expect(r.ok).toBe(true);
    expect(r.rows.map((x: any) => x.AGR_NAME).sort()).toEqual([...names].sort());
  });

  it('helpers', () => {
    expect(levelFromActvt(['03'])).toBe('D');
    expect(levelFromActvt(['02', '03'])).toBe('C');
    expect(levelFromActvt(['*'])).toBe('F');
    expect(moduleOf('ZSD_ORDER_ENTRY', 'X')).toBe('X');
    expect(moduleOf('Z_SD_ORDER')).toBe('SD');
    expect(likeOf('z_pm*')).toBe('Z_PM%');
  });
});

describe('role-matrix page and files', () => {
  it('renders every sheet with the model embedded', () => {
    const html = renderPage(normalizeModel(draft()), { version: '0.1', date: '2026-10-28' });
    for (const s of ['cover', 'broles', 'troles', 'tcodes', 'users', 'auths', 'sod', 'revisions']) expect(html).toContain(`id="tab-${s}"`);
    expect(html).toContain('id="role-model"');
    expect(html).toContain('data-c="L:PM-01"');
  });

  it('pages a large matrix and searches every page', () => {
    const m = normalizeModel(draft());
    for (let i = 0; i < 400; i++) m.broles.push({ id: `R-${i}`, name: '', troles: [] });
    for (let i = 0; i < 1000; i++) m.tcodes.push({ tcode: `ZT${String(i).padStart(4, '0')}`, text: i === 999 ? 'last one' : '', levels: { 'R-1': 'D' } });
    const v = deriveView(m), L = labelsFor('ko'), sc = shownColumns('tcodes', v, L), size = pageSize(sc.cols);
    const first = renderSheet('tcodes', v, L);
    expect(sheetColumns('tcodes', v, L).length).toBeGreaterThan(400);
    expect(sc.cpages).toBe(9); // 405 role columns, 50 per page
    expect((first.match(/<th data-c="L:[^"]*" class="mx/g) || []).length).toBe(50);
    expect((first.match(/<tr data-i=/g) || []).length).toBe(size);
    expect(first).toContain('class="pager"');
    expect(first).toContain('data-cpg="1"');
    expect(renderSheet('tcodes', v, L, { cpage: 8 })).toContain('data-c="L:R-399"');
    expect(sheetRows('tcodes', v, L, 'last one')).toEqual([m.tcodes.length - 1]);
    const hit = renderSheet('tcodes', v, L, { q: 'last one' });
    expect(hit).toContain(`data-i="${m.tcodes.length - 1}"`);
    expect((hit.match(/<tr data-i=/g) || []).length).toBe(1);
    expect(renderPage(m, { version: '0.1', date: '2026-10-28' }).length).toBeLessThan(6e6);
  });

  it('init → sod → import round trip keeps the saved version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rm-'));
    try {
      const a = cmdInit({ root: dir, code: 'T1', from: EXAMPLE, doc: { author: 'A' } });
      expect(a.version).toBe('0.1');
      const s = cmdSod({ root: dir, code: 'T1', modules: ['PM'] });
      expect(s.added).toBeGreaterThan(0);
      const page = readFileSync(a.html, 'utf8');
      const json = JSON.parse(/<script type="application\/json" id="role-model">([\s\S]*?)<\/script>/.exec(page)![1]);
      json.model.revisions.push({ ver: 'v0.2', date: '2026-10-29', author: 'B', change: 'edited' });
      json.model.users.push({ uid: 'NEW', roles: { 'PM-05': 'X' } });
      const saved = join(dir, 'saved.html');
      writeFileSync(saved, page.replace(/(<script type="application\/json" id="role-model">)[\s\S]*?(<\/script>)/, (_, x, y) => x + JSON.stringify(json).replace(/</g, '\\u003c') + y));
      const r = cmdImport({ html: saved, root: dir });
      expect(r.version).toBe('0.2');
      expect(r.totals.users).toBe(6);
      const b = buildDoc({ root: dir, code: 'T1', major: true });
      expect(b.version).toBe('1.0');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const LAYOUT = {
  name: 'form-a', title: 'Role form', theme: { accent: '#1f3864', head: '#1f3864', headFg: '#ffffff', font: 'Arial' },
  levels: { F: { code: '●', text: 'create / change' }, C: { code: '◐' }, D: { code: '○', text: 'display' } }, mark: 'O',
  cover: { fields: [{ k: 'e_docNo', h: 'Doc no.' }, { k: 'project', h: 'Project' }, { k: 'version', h: 'Ver' }], hide: ['sheets'] },
  sheets: [
    { key: 'broles', tab: 'Roles', cols: [{ k: 'id', h: 'Role code' }, { k: 'name', h: 'Role name' }, { k: 'e:approver', h: 'Approver' }] },
    { key: 'tcodes', tab: 'Matrix', cols: [{ k: 'tcode' }, { k: 'text', h: 'Name' }, { k: '@roles' }, { k: 'e:remark', h: 'Remark' }] },
    { key: 'users', cols: [{ k: 'name' }, { k: 'e:reason', h: 'Reason' }] },
    { key: 'revisions' },
  ],
};

describe('role-matrix company layout', () => {
  it('draws the layout: sheets, columns, own columns, level codes, cover', () => {
    const m = normalizeModel({ ...draft(), layout: LAYOUT });
    m.broles[0].ext = { approver: 'Lead' };
    const v = deriveView(m), L = labelsFor('ko', m.layout);
    expect(sheetsOf(L)).toEqual(['broles', 'tcodes', 'users', 'revisions']);
    expect(sheetColumns('broles', v, L).map((c: any) => c.k)).toEqual(['id', 'name', 'e:approver']);
    const tc = sheetColumns('tcodes', v, L).map((c: any) => c.k);
    expect(tc.slice(0, 2)).toEqual(['tcode', 'text']);
    expect(tc.at(-1)).toBe('e:remark');
    expect(tc.filter((k: string) => k.startsWith('L:')).length).toBe(m.broles.length);
    expect(sheetColumns('users', v, L)[0].k).toBe('uid'); // the key column always stays
    const row = m.tcodes.find((c: any) => c.levels['PM-01'] === 'F');
    expect(cellValue('tcodes', row, { k: 'L:PM-01', role: 'PM-01', type: 'level' }, v, L)).toBe('●');
    expect(cellValue('broles', m.broles[0], { k: 'e:approver' }, v, L)).toBe('Lead');
    expect(renderSheet('tcodes', v, L)).toMatch(/class="lv lv-F">●</);
    const cover = renderCover(v, L, { version: '0.1' });
    expect(cover).toContain('Doc no.');
    expect(cover).toContain('data-d="e_docNo"');
    expect(cover).not.toContain('data-go="troles"');
    const html = renderPage(m, { version: '0.1', date: '2026-10-29' });
    expect(html).not.toContain('id="tab-troles"');
    expect(html).toContain('--head:#1f3864');
    expect(html).toContain('data-v="●"');
    expect(html).toContain('●(F)');
    expect(normalizeModel(JSON.parse(JSON.stringify(m))).broles[0].ext).toEqual({ approver: 'Lead' });
  });

  it('checks a layout and lists the columns it can name', () => {
    const cat = columnCatalog('ko');
    expect(cat.sheets.tcodes.cols.map((c: any) => c.k)).toContain('@roles');
    expect(checkLayout(LAYOUT).errors).toEqual([]);
    const bad = checkLayout({ sheets: [{ key: 'nope' }, { key: 'broles', cols: [{ k: 'wrong' }] }], levels: { F: { code: 'D' } }, cover: { fields: [{ k: 'x' }] } });
    expect(bad.errors.length).toBe(4);
  });

  it('puts a layout on a document and takes it off', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rm-'));
    try {
      cmdInit({ root: dir, code: 'T2', from: EXAMPLE });
      const lf = join(dir, 'layout.json');
      writeFileSync(lf, JSON.stringify(LAYOUT));
      const r = cmdLayout({ root: dir, code: 'T2', file: lf });
      expect(r.layout).toBe('form-a');
      expect(readFileSync(r.html, 'utf8')).toContain('Role code');
      writeFileSync(lf, JSON.stringify({ sheets: [{ key: 'zz' }] }));
      expect(() => cmdLayout({ root: dir, code: 'T2', file: lf })).toThrow(/unknown sheet/);
      const off = cmdLayout({ root: dir, code: 'T2', file: 'none' });
      expect(readFileSync(off.html, 'utf8')).toContain('id="tab-troles"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads a company form from HTML and from Word', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rm-'));
    try {
      const h = join(dir, 'form.html');
      writeFileSync(h, '<html><head><title>Form</title><style>.hd{background:#1F3864;color:#fff}</style></head><body><h2>1. Roles</h2>'
        + '<table><tr><td class="hd">Code</td><td class="hd" colspan="2">Name</td></tr><tr><td>R1</td><td>A</td><td>B</td></tr></table></body></html>');
      const a = readTemplate(h);
      const t = a.blocks.find((b: any) => b.type === 'table');
      expect(t.before).toBe('1. Roles');
      expect(t.cols).toBe(3);
      expect(t.head[0][0]).toMatchObject({ t: 'Code', bg: '#1f3864', color: '#ffffff' });
      expect(a.colors[0].v).toBe('#1f3864');
      const w = (x: string) => '<?xml version="1.0"?><w:document xmlns:w="w"><w:body>' + x + '</w:body></w:document>';
      const cell = (t: string, fill = '') => '<w:tc><w:tcPr>' + (fill ? '<w:shd w:val="clear" w:fill="' + fill + '"/>' : '') + '</w:tcPr><w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Gulim"/></w:rPr><w:t>' + t + '</w:t></w:r></w:p></w:tc>';
      const doc = w('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Role matrix</w:t></w:r></w:p><w:tbl><w:tr>' + cell('T-Code', 'DBE5F1') + cell('Role A', 'DBE5F1') + '</w:tr><w:tr>' + cell('ME21N') + cell('X') + '</w:tr></w:tbl>');
      const d = join(dir, 'form.docx');
      writeFileSync(d, zipFiles([{ name: 'word/document.xml', data: Buffer.from(doc) }, { name: 'word/header1.xml', data: Buffer.from(w('<w:p><w:r><w:t>DOC-01</w:t></w:r></w:p>')) },
        { name: 'word/_rels/header1.xml.rels', data: Buffer.from('<Relationships><Relationship Target="media/image1.png"/></Relationships>') }, { name: 'word/media/image1.png', data: Buffer.from([137, 80, 78, 71]) }]));
      const b = readTemplate(d, { out: join(dir, 'media') });
      expect(b.blocks[0]).toMatchObject({ type: 'heading', text: 'Role matrix' });
      expect(b.blocks[1].head[0][0]).toMatchObject({ t: 'T-Code', bg: '#dbe5f1' });
      expect(b.header[0].text).toBe('DOC-01');
      expect(b.images[0]).toMatchObject({ name: 'image1.png', inHeader: true });
      expect(b.fonts.map((f: any) => f.v)).toContain('Gulim');
      expect(() => readTemplate(join(dir, 'x.pdf'))).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// A small workbook in the shape of a company form: a role sheet (two-row header) and a T-code matrix marked with ●.
function formXlsx(dir: string): string {
  const c = (r: string, t: string) => `<c r="${r}" t="inlineStr"><is><t>${t}</t></is></c>`;
  const row = (n: number, cells: string[]) => `<row r="${n}">${cells.join('')}</row>`;
  const sheet = (rows: string[], merges: string[] = []) => `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData>${merges.length ? `<mergeCells>${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}</worksheet>`;
  const s1 = sheet([row(1, [c('A1', 'Roles')]), row(3, [c('A3', 'Module'), c('B3', 'ID'), c('C3', 'Name'), c('D3', 'Scope')]), row(4, [c('D4', 'Local')]),
    row(5, [c('A5', 'MM'), c('B5', 'Z_MM_10'), c('C5', 'Material'), c('D5', 'O')]), row(6, [c('A6', 'MM'), c('B6', 'Z_MM_20'), c('C6', 'Purchasing')])], ['A3:A4', 'B3:B4']);
  // menu levels in E / F are written once, on the first row of their block
  const s2 = sheet([row(4, [c('C4', 'Z_MM_10'), c('D4', 'Z_MM_20')]), row(5, [c('A5', 'T-code'), c('B5', 'Text')]),
    row(6, [c('A6', 'MM01'), c('B6', 'Create material'), c('C6', '●'), c('E6', 'Master'), c('F6', 'Material')]), row(7, [c('A7', 'ME21N'), c('B7', 'Create PO'), c('C7', '●'), c('D7', '●'), c('F7', 'Vendor')]),
    row(8, [c('A8', 'MM03'), c('B8', 'Display'), c('D8', 'C'), c('E8', 'Purchasing')])]);
  const files = [
    { name: '[Content_Types].xml', data: Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>') },
    { name: 'xl/workbook.xml', data: Buffer.from('<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="1. Roles" sheetId="1" r:id="rId1"/><sheet name="2. Matrix" sheetId="2" r:id="rId2"/></sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from('<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(s1) },
    { name: 'xl/worksheets/sheet2.xml', data: Buffer.from(s2) },
  ];
  const f = join(dir, 'form.xlsx');
  writeFileSync(f, zipFiles(files));
  return f;
}

const FORM_LAYOUT = {
  name: 'form-x',
  levelMark: { code: '●', text: 'access' },
  sheets: [
    { key: 'broles', cols: [{ k: 'module' }, { k: 'id' }, { k: 'name' }, { k: 'e:local', h: 'Local' }], groups: [{ h: 'Scope', cols: ['e:local'] }],
      form: { sheet: '1. Roles', from: 5, cols: { A: 'module', B: 'id', C: 'name', D: 'e:local' } } },
    { key: 'tcodes', cols: [{ k: 'tcode' }, { k: 'text' }, { k: '@roles' }], groups: [{ h: 'Roles', cols: ['@roles'] }],
      form: { sheet: '2. Matrix', from: 6, cols: { A: 'tcode', B: 'text', E: 'e:lv1', F: 'e:lv2' }, roles: { row: 4, cols: 'C:D' }, set: { module: 'MM' }, fill: ['e:lv1', 'e:lv2'] } },
    { key: 'revisions' },
  ],
};

describe('role-matrix company workbook', () => {
  it('reads an .xlsx form: sheets, row numbers, column letters, merges', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rm-xlsx-'));
    try {
      const t = readTemplate(formXlsx(dir));
      expect(t.kind).toBe('xlsx');
      expect(t.tables).toBe(2);
      const roles = t.blocks.find((b: any) => b.type === 'table' && b.sheet === '1. Roles');
      const head = roles.head.find((r: any) => r.r === 3);
      expect(head.cells.map((x: any) => x.c)).toEqual(['A', 'B', 'C', 'D']);
      expect(head.cells[0].rows).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('takes the content of a filled-in workbook into a document in the company layout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rm-imp-'));
    try {
      const form = formXlsx(dir);
      const lf = join(dir, 'layout.json');
      writeFileSync(lf, JSON.stringify(FORM_LAYOUT));
      const r = await cmdImportForm({ root: dir, code: 'FX', file: form, layoutFile: lf, doc: { project: 'P' } });
      expect(r.read).toEqual({ broles: 2, tcodes: 3 });
      const m = JSON.parse(readFileSync(join(dir, 'FX', 'FX-roles.json'), 'utf8'));
      expect(m.broles[0]).toMatchObject({ id: 'Z_MM_10', name: 'Material', module: 'MM', ext: { local: 'O' } });
      expect(m.tcodes.find((x: any) => x.tcode === 'ME21N').levels).toEqual({ Z_MM_10: 'F', Z_MM_20: 'F' });
      expect(m.tcodes.find((x: any) => x.tcode === 'MM03').levels).toEqual({ Z_MM_20: 'C' });
      expect(m.tcodes[0].module).toBe('MM');
      // a blank level takes the value above it until a higher level changes
      expect(m.tcodes.map((x: any) => [x.ext.lv1, x.ext.lv2])).toEqual([['Master', 'Material'], ['Master', 'Vendor'], ['Purchasing', undefined]]);
      await expect(cmdImportForm({ root: dir, code: 'FX', file: form, layoutFile: lf })).rejects.toThrow(/exists/);
      // one mark for every level, group header row, one totals line
      const v = deriveView(m), L = labelsFor('ko', m.layout);
      expect(L.single).toBe('●');
      expect(cellValue('tcodes', m.tcodes[2], { k: 'L:Z_MM_20', role: 'Z_MM_20', type: 'level' }, v, L)).toBe('●');
      expect(L.cover.legendRows.filter((x: any) => x[2] === 'F' || x[2] === 'C' || x[2] === 'D').length).toBe(1);
      const sheet = renderSheet('tcodes', v, L);
      expect(sheet).toMatch(/<tr class="grp"><th colspan="3" class="g0"><\/th><th colspan="2" class="g">Roles<\/th><\/tr>/);
      expect((sheet.match(/class="ft"/g) || []).length).toBe(1);
      expect(renderSheet('broles', v, L)).toContain('class="g">Scope<');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('checks the form mapping of a layout', () => {
    expect(checkLayout({ sheets: [{ key: 'tcodes', form: { sheet: 'S', cols: { a1: 'tcode', B: 'nope' }, roles: { row: 0, cols: 'x' } } }] }).errors.length).toBe(3);
    expect(checkLayout({ levelMark: {} }).errors[0]).toMatch(/levelMark/);
    expect(checkLayout({ levelMark: { code: '●' }, levels: { F: { code: '●' }, C: { code: '●' } } }).errors).toEqual([]);
  });
});

describe('role-matrix filters and shared IDs', () => {
  it('filters rows by the values a column shows or a text it contains', () => {
    const v = deriveView(normalizeModel(draft())), L = labelsFor('ko');
    const vals = columnValues('tcodes', v, L, 'area');
    expect(vals.length).toBeGreaterThan(0);
    const [val, n] = vals.find((x: any) => x[0]) as [string, number];
    expect(sheetRows('tcodes', v, L, '', { area: { vals: [val] } }).length).toBe(n);
    const code = v.m.tcodes[0].tcode;
    expect(sheetRows('tcodes', v, L, '', { tcode: { q: code.toLowerCase() } }).every((i: number) => v.m.tcodes[i].tcode.includes(code))).toBe(true);
    expect(sheetRows('tcodes', v, L, '', { area: { vals: [] } })).toEqual([]);
    const row0 = v.m.tcodes.findIndex((x: any) => Object.keys(x.levels).length);
    const role = Object.keys(v.m.tcodes[row0].levels)[0];
    expect(sheetRows('tcodes', v, L, '', { [`L:${role}`]: { has: true } })).toContain(row0);
    expect(sheetRows('tcodes', v, L, '', { [`L:${role}`]: { has: false } })).not.toContain(row0);
    const html = renderSheet('tcodes', v, L, { f: { area: { vals: [val] } } });
    expect(html).toContain('<tr class="frow">');
    expect(html).toContain(`<select class="fin" data-f="L:${role}"`);
    expect(html).toContain('class="flt on" data-f="area"');
    expect(html).toContain('data-fclear="tcodes"');
  });

  it('flags a shared user ID as a warning, not an error', () => {
    const v = deriveView(normalizeModel({ users: [{ uid: 'TEAM01', name: 'A' }, { uid: 'TEAM01', name: 'B' }] }));
    expect(v.checks.find((c: any) => c.text === 'dupUser')).toMatchObject({ sev: 'warn', ref: 'TEAM01' });
  });
});

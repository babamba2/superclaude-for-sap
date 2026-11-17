import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { normalizeModel, addRevision, nextVersion, deriveView } from '../../scripts/role/role-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderPage, modelFromPage } from '../../scripts/role/role-page.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { modelFromDraft, addSodRules, applyPatch, csvSheets, summary, sodLibrary } from '../../scripts/role/role-ops.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { roleXlsx } from '../../scripts/role/role-xlsx.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { labelsFor, sheetsOf, sheetColumns } from '../../scripts/role/role-render.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { unzipEntries } from '../../scripts/spec/xlsx-zip.mjs';

// fictitious names only (Z_TEST_*): no customer roles, systems or users
const draft = () => ({
  doc: { project: 'Demo', system: 'DEV / MM', module: 'MM' },
  broles: [{ id: 'Z_TEST_BUYER', name: 'Buyer', module: 'MM', desc: 'Creates POs', troles: ['Z_TEST_MM_PO'] }, { id: 'Z_TEST_AP', name: 'AP clerk', module: 'FI' }],
  troles: [{ id: 'Z_TEST_MM_PO', desc: 'PO maintenance', type: 'Single', module: 'MM', brole: 'Z_TEST_BUYER' }],
  tcodes: [{ tcode: 'ME21N', module: 'MM', text: 'Create PO', levels: { Z_TEST_BUYER: 'F' } }, { tcode: 'F110', module: 'FI', text: 'Payment run', levels: { Z_TEST_AP: 'F' } }],
  users: [{ uid: 'Z_TEST_U1', name: 'User one', dept: 'Purchasing', roles: { Z_TEST_BUYER: 'X', Z_TEST_AP: 'X' } }],
  auths: [{ trole: 'Z_TEST_MM_PO', object: 'M_BEST_BSA', field: 'ACTVT', value: '01, 02' }],
  sod: [],
});
const page = (m: any, extra = {}) => renderPage(normalizeModel(m), { version: '0.1', date: '2026-11-16', ...extra });

describe('role workbench — page contract', () => {
  it('embed drops Save, the dialog and the draft banner; without embed it is the CLI page', () => {
    const m = modelFromDraft(draft(), { code: 'Z_TEST_RM' }, 'ko');
    const cli = page(m);
    expect(page(m, { embed: false })).toBe(cli);
    for (const x of ['<button id="save"', '<dialog id="save-dlg"', '<div class="banner" id="draft"']) expect(cli).toContain(x);
    const web = page(m, { embed: true });
    for (const x of ['<button id="save"', '<dialog id="save-dlg"', '<div class="banner" id="draft"']) expect(web).not.toContain(x);
    expect(web).toContain('<button id="undo"');
    const strip = (h: string) => h.replace(/<button id="save"[\s\S]*?<\/button>|<dialog id="save-dlg">[\s\S]*?<\/dialog>\n|<div class="banner" id="draft">[\s\S]*?<\/div>\n|,"embed":true/g, '');
    expect(strip(web)).toBe(strip(cli));
    const client = readFileSync(join(__dirname, '..', '..', 'scripts', 'role', 'role-client.js'), 'utf8');
    expect(client).toContain("window.SC4SAP_PAGE = { kind: 'roles', model: function () { return model; }, edit: function (on) { if (!!on !== editing) setEditing(!!on); }, editing: function () { return editing; } };");
    expect(client).toMatch(/function store\(k, v\) \{ if \(EMBED && k === DRAFT\) return;/);
    expect(client).toMatch(/if \(dirty && !EMBED\)/);
    // the page's Save writes the version through addRevision
    expect(client).toMatch(/r = addRevision\(model, \{ author: author, note: note, version: version, date: d \}\)/);
  });

  it('modelFromPage round trip; addRevision = the page Save (history row, date, next version)', () => {
    const m = modelFromDraft(draft(), { code: 'Z_TEST_RM' }, 'en');
    const got = modelFromPage(page(m));
    expect(normalizeModel(got.model)).toEqual(normalizeModel(m));
    expect(got.version).toBe('0.1');
    expect(() => modelFromPage('<p>no</p>')).toThrow(/no embedded role model/);
    const r = addRevision(m, { author: 'A', note: 'changed levels', version: '0.1', date: '2026-11-17' });
    expect(r.version).toBe(nextVersion('0.1'));
    expect(r.model.revisions.at(-1)).toMatchObject({ ver: 'v0.2', date: '2026-11-17', author: 'A', change: 'changed levels', approver: '', note: '' });
    expect(r.model.doc.date).toBe('2026-11-17');
    expect(addRevision(r.model, { author: 'B', major: true, date: '2026-11-18' }).version).toBe('1.0');
    expect(m.revisions).toEqual([]); // input untouched
  });
});

describe('role workbench — operations', () => {
  it('modelFromDraft = init --from; addSodRules adds library rules once', () => {
    const m = modelFromDraft({ ...draft(), lang: 'en' }, { code: 'Z_TEST_RM', author: 'A', reviewer: '' }, 'ko');
    expect(m).toMatchObject({ lang: 'en', doc: { code: 'Z_TEST_RM', author: 'A', mode: 'new', project: 'Demo' }, revisions: [] });
    const a = addSodRules(m, ['MM'], 'en');
    const mm = sodLibrary().filter((r: any) => r.module === 'MM').length;
    expect(a.added).toBe(mm);
    const b = addSodRules(a.model, ['MM', 'FI'], 'en');
    expect(b.added).toBe(sodLibrary().filter((r: any) => r.module === 'FI').length); // MM rules skipped
    expect(b.model.sod.map((s: any) => s.id)).toEqual(b.model.sod.map((_: any, i: number) => `SOD-${String(i + 1).padStart(2, '0')}`));
    expect(addSodRules(m, ['MM'], 'ja').model.sod[0].kind).toBe(sodLibrary().find((r: any) => r.module === 'MM').kind.ja);
  });

  it('applyPatch: new rows and text of existing rows; users, history, approvals, levels and values are refused', () => {
    const m = modelFromDraft(draft(), { code: 'Z_TEST_RM' }, 'ko');
    const ok: any[] = [
      { op: 'add-row', sheet: 'broles', row: { id: 'Z_TEST_GR', name: 'Goods receipt', module: 'MM' } },
      { op: 'add-row', sheet: 'tcodes', row: { tcode: 'MIGO', text: 'Goods movement', levels: { Z_TEST_GR: 'f' } } },
      { op: 'add-row', sheet: 'auths', row: { trole: 'Z_TEST_MM_PO', object: 'M_BEST_EKG', field: 'ACTVT', value: '03' } },
      { op: 'add-row', sheet: 'sod', row: { kind: 'PO vs GR', risk: 'Receive own orders', level: 'H' } },
      { op: 'set-text', sheet: 'broles', key: 'z_test_buyer', field: 'desc', value: 'Creates and changes POs' },
      { op: 'set-text', sheet: 'tcodes', key: 'ME21N', field: 'note', value: 'Main entry' },
      { op: 'set-text', sheet: 'auths', key: 0, field: 'note', value: 'From SU24' },
    ];
    const r = applyPatch(m, ok);
    expect(r.skipped).toEqual([]);
    expect(r.model.tcodes.find((t: any) => t.tcode === 'MIGO').levels).toEqual({ Z_TEST_GR: 'F' });
    expect(r.model.broles[0].desc).toBe('Creates and changes POs');
    expect(r.model.auths[0].note).toBe('From SU24');
    const bad: any[] = [
      { op: 'add-row', sheet: 'users', row: { uid: 'X' } },
      { op: 'set-text', sheet: 'users', key: 'Z_TEST_U1', field: 'name', value: 'x' },
      { op: 'add-row', sheet: 'revisions', row: { ver: 'v9' } },
      { op: 'set-text', sheet: 'doc', field: 'author', value: 'x' },
      { op: 'set-text', sheet: 'tcodes', key: 'ME21N', field: 'levels', value: 'D' },
      { op: 'set-level', brole: 'Z_TEST_BUYER', tcode: 'ME21N', level: 'D' },
      { op: 'set-text', sheet: 'auths', key: 0, field: 'value', value: '*' },
      { op: 'set-text', sheet: 'troles', key: 'Z_TEST_MM_PO', field: 'orgValue', value: '1000' },
      { op: 'set-text', sheet: 'sod', key: 'SOD-01', field: 'approver', value: 'x' },
      { op: 'add-row', sheet: 'sod', row: { kind: 'x', approver: 'Boss', status: 'accepted' } },
      { op: 'add-row', sheet: 'tcodes', row: { tcode: 'ME21N' } },
      { op: 'add-row', sheet: 'tcodes', row: { tcode: 'ME22N', levels: { Z_TEST_BUYER: 'X' } } },
      { op: 'add-row', sheet: 'broles', row: { id: 'Z_TEST_BUYER' } },
      { op: 'remove-row', sheet: 'broles', key: 'Z_TEST_AP' },
      { op: 'set-text', sheet: 'broles', key: 'NOPE', field: 'name', value: 'x' },
      null,
    ];
    const s = applyPatch(m, bad);
    expect(s.applied).toEqual([]);
    expect(s.skipped.map((x: any) => x.index)).toEqual(bad.map((_, i) => i));
    expect(s.model).toEqual(normalizeModel(m));
  });

  it('csvSheets has the page columns for every sheet; summary counts', () => {
    const m = addSodRules(modelFromDraft(draft(), { code: 'Z_TEST_RM' }, 'ko'), ['MM'], 'ko').model;
    const L = labelsFor('ko'), csv = csvSheets(m);
    expect(Object.keys(csv)).toEqual(sheetsOf(L));
    const head = csv.tcodes.replace(/^﻿/, '').split('\r\n')[0];
    expect(head.split(',').length).toBe(sheetColumns('tcodes', deriveView(normalizeModel(m)), L).length);
    expect(head).toContain('Z_TEST_BUYER');
    expect(csv.broles).toContain('Z_TEST_BUYER');
    const s = summary(m);
    expect(s).toMatchObject({ kind: 'roles', code: 'Z_TEST_RM', broles: 2, troles: 1, tcodes: 2, users: 1, auths: 1 });
    expect(s.sod).toBeGreaterThan(0);
    expect(typeof s.sodBroken).toBe('number');
  });
});

describe('role workbench — Excel export', () => {
  const sheetNames = (buf: Buffer) => [...Buffer.from(unzipEntries(buf).find((e: any) => e.name === 'xl/workbook.xml').data).toString('utf8').matchAll(/<sheet name="([^"]+)"/g)].map((x) => x[1]);
  it('cover + seven sheets in the page language (ko / ja); a company layout names and orders the sheets', () => {
    const m = modelFromDraft(draft(), { code: 'Z_TEST_RM' }, 'ko');
    const ko = sheetNames(roleXlsx(m));
    expect(ko).toEqual(['표지', '1.업무역할', '2.기술역할', '3.역할-TCode', '4.사용자-역할', '5.권한객체', '6.SoD점검', '7.변경이력']);
    expect(sheetNames(roleXlsx({ ...m, lang: 'ja' }))).toEqual(['表紙', '1.業務ロール', '2.技術ロール', '3.ロール×Tコード', '4.ユーザー×ロール', '5.権限オブジェクト', '6.職務分掌', '7.変更履歴']);
    const layout = { name: 'form-a', sheets: [{ key: 'broles', tab: 'Roles', cols: [{ k: 'name', h: 'Role name' }, { k: 'id', h: 'Role code' }] }, { key: 'tcodes', tab: 'Matrix' }] };
    const withLayout = roleXlsx({ ...m, layout });
    const names = sheetNames(withLayout);
    expect(names).toContain('Roles');
    expect(names).toContain('Matrix');
    const s2 = Buffer.from(unzipEntries(withLayout).find((e: any) => e.name === 'xl/worksheets/sheet2.xml').data).toString('utf8');
    expect(s2.indexOf('Role name')).toBeLessThan(s2.indexOf('Role code'));
  });
});

describe('role workbench — prototype keys never reach the allow-lists', () => {
  it('a sheet named constructor / __proto__ / toString is skipped, the rest of the batch applies', () => {
    const m = modelFromDraft(draft(), { code: 'Z_TEST_RM' }, 'ko');
    const ops: any[] = [];
    for (const s of ['constructor', '__proto__', 'toString']) {
      ops.push({ op: 'add-row', sheet: s, row: { id: 'X' } });
      ops.push({ op: 'set-text', sheet: s, key: 'X', field: 'name', value: 'x' });
    }
    ops.push({ op: 'set-text', sheet: 'broles', key: 'Z_TEST_BUYER', field: '__proto__', value: 'x' });
    ops.push(JSON.parse('{"op":"add-row","sheet":"broles","row":{"id":"Z_TEST_X","__proto__":{"approval":"approved"}}}'));
    ops.push({ op: 'set-text', sheet: 'broles', key: 'Z_TEST_BUYER', field: 'note', value: 'still applied' });
    const r = applyPatch(m, ops);
    expect(r.skipped.map((s: any) => s.index)).toEqual(ops.slice(0, -1).map((_, i) => i));
    expect(r.applied).toHaveLength(1);
    expect(r.model.broles[0].note).toBe('still applied');
  });
});

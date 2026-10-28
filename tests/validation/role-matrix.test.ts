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
import { renderSheet, sheetRows, sheetColumns, shownColumns, pageSize, labelsFor } from '../../scripts/role/role-render.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { cmdInit, cmdImport, cmdSod, buildDoc } from '../../scripts/role/build-role-doc.mjs';

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
    expect((first.match(/<th data-c="L:/g) || []).length).toBe(50);
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

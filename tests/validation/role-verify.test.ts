import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyVerify, compareRoles, docRoleNames, withCheck } from '../../scripts/role/role-verify.mjs';
import { deriveView, normalizeModel } from '../../scripts/role/role-model.mjs';
import { cmdInit, cmdVerify, cmdVerifyApply } from '../../scripts/role/build-role-doc.mjs';

/** The document: two business roles, four technical roles (one derived, one composite, one not in SAP). */
const doc = () => normalizeModel({
  doc: { code: 'MM-ROLES' },
  broles: [
    { id: 'MM-01', name: 'Buyer', troles: ['Z_MM_BUYER', 'Z_MM_BUYER_1000'] },
    { id: 'MM-02', name: 'Warehouse', troles: ['Z_C_MM_WH', 'Z_MM_GONE'] },
  ],
  troles: [
    { id: 'Z_MM_BUYER', brole: 'MM-01', type: 'Master' },
    { id: 'Z_MM_BUYER_1000', brole: 'MM-01', type: 'Derived', parent: 'Z_MM_BUYER', orgLevel: 'Plant', orgValue: '1000' },
    { id: 'Z_C_MM_WH', brole: 'MM-02', type: 'Composite', children: ['Z_MM_GR'] },
    { id: 'Z_MM_GONE', brole: 'MM-02' },
  ],
  tcodes: [
    { tcode: 'ME21N', levels: { 'MM-01': 'F' } },
    { tcode: 'ME23N', levels: { 'MM-01': 'C' } }, // SAP says D (display)
    { tcode: 'ME29N', levels: { 'MM-01': 'F' } }, // not in SAP
    { tcode: 'MIGO', levels: { 'MM-02': 'F' } },
  ],
  auths: [
    { trole: 'Z_MM_BUYER', object: 'M_BEST_BSA', field: 'ACTVT', value: '01, 02, 03' },
    { trole: 'Z_MM_BUYER', object: 'M_BEST_BSA', field: 'BSART', value: 'NB' },
    { trole: 'Z_MM_BUYER', object: 'M_BEST_EKO', field: 'EKORG', value: '1000' },
  ],
  users: [
    { uid: 'BUYER01', roles: { 'MM-01': 'X' } },
    { uid: 'BUYER02', roles: { 'MM-01': 'X' } },
    { uid: 'WH01', roles: { 'MM-02': 'X' } },
  ],
});

const rows = () => ({
  define: [{ AGR_NAME: 'Z_MM_BUYER' }, { AGR_NAME: 'Z_MM_BUYER_1000', PARENT_AGR: 'Z_MM_BUYER' }, { AGR_NAME: 'Z_C_MM_WH' }, { AGR_NAME: 'Z_MM_GR' }],
  agrs: [{ AGR_NAME: 'Z_C_MM_WH', CHILD_AGR: 'Z_MM_GR' }],
  tcodes: [
    { AGR_NAME: 'Z_MM_BUYER', TCODE: 'ME21N', TYPE: 'TR' }, { AGR_NAME: 'Z_MM_BUYER', TCODE: 'ME23N', TYPE: 'TR' },
    { AGR_NAME: 'Z_MM_BUYER', TCODE: 'ME2L', TYPE: 'TR' }, { AGR_NAME: 'Z_MM_GR', TCODE: 'MIGO', TYPE: 'TR' },
  ],
  auth: [
    { AGR_NAME: 'Z_MM_BUYER', OBJECT: 'M_BEST_BSA', FIELD: 'ACTVT', LOW: '01' }, { AGR_NAME: 'Z_MM_BUYER', OBJECT: 'M_BEST_BSA', FIELD: 'ACTVT', LOW: '02' },
    { AGR_NAME: 'Z_MM_BUYER', OBJECT: 'M_BEST_BSA', FIELD: 'ACTVT', LOW: '03' },
    { AGR_NAME: 'Z_MM_BUYER', OBJECT: 'M_BEST_BSA', FIELD: 'BSART', LOW: 'NB' }, { AGR_NAME: 'Z_MM_BUYER', OBJECT: 'M_BEST_BSA', FIELD: 'BSART', LOW: 'FO' },
    { AGR_NAME: 'Z_MM_BUYER', OBJECT: 'M_BEST_WRK', FIELD: 'WERKS', LOW: '*' },
    { AGR_NAME: 'Z_MM_BUYER', OBJECT: 'M_BEST_OLD', FIELD: 'X', LOW: 'Y', DELETED: 'X' },
    { AGR_NAME: 'Z_MM_BUYER_1000', OBJECT: 'M_BEST_WRK', FIELD: 'WERKS', LOW: '1000' },
    { AGR_NAME: 'Z_MM_GR', OBJECT: 'M_MSEG_BWA', FIELD: 'ACTVT', LOW: '01' },
  ],
  org: [{ AGR_NAME: 'Z_MM_BUYER_1000', VARBL: '$WERKS', LOW: '1000' }, { AGR_NAME: 'Z_MM_BUYER_1000', VARBL: '$WERKS', LOW: '1100' }],
  tstct: [{ TCODE: 'ME23N', TTEXT: 'Display Purchase Order' }, { TCODE: 'ME2L', TTEXT: 'List of purchasing documents per vendor' }],
  users: [
    { AGR_NAME: 'Z_MM_BUYER_1000', UNAME: 'BUYER01', FROM_DAT: '20260101', TO_DAT: '99991231' },
    { AGR_NAME: 'Z_MM_BUYER_1000', UNAME: 'BUYER02', FROM_DAT: '20250101', TO_DAT: '20251231' }, // expired
    { AGR_NAME: 'Z_C_MM_WH', UNAME: 'WH01', FROM_DAT: '20260101', TO_DAT: '99991231' },
    { AGR_NAME: 'Z_C_MM_WH', UNAME: 'WH02', FROM_DAT: '20260101', TO_DAT: '99991231' },
    { AGR_NAME: 'Z_OTHER', UNAME: 'X99', FROM_DAT: '20260101', TO_DAT: '99991231' }, // a role not in the document
  ],
});

const kinds = (r: { diffs: { kind: string; key: string; counted: boolean }[] }) => r.diffs.map((d) => `${d.kind} ${d.key}`).sort();

describe('role-verify: compare', () => {
  it('reads exactly the document roles', () => {
    expect(docRoleNames(doc())).toEqual(['Z_MM_BUYER', 'Z_MM_BUYER_1000', 'Z_C_MM_WH', 'Z_MM_GONE']);
  });
  it('finds every kind of difference; the level is reference only; roles only in SAP are left out', () => {
    const r = compareRoles(doc(), rows(), { withUsers: true, today: '2026-11-18' });
    expect(kinds(r)).toEqual([
      'auth-diff M_BEST_BSA · BSART', 'auth-doc M_BEST_EKO · EKORG', 'auth-sap M_BEST_WRK · WERKS',
      'level ME23N', 'org Plant', 'tcode-doc ME29N', 'tcode-sap ME2L', 'user-doc BUYER02', 'user-sap WH02',
    ]);
    expect(r.diffs.find((d) => d.kind === 'level')).toMatchObject({ doc: 'C', sap: 'D', counted: false });
    expect(r.diffs.find((d) => d.kind === 'auth-diff')).toMatchObject({ doc: 'NB', sap: 'FO, NB', roles: ['Z_MM_BUYER'] });
    expect(r.diffs.find((d) => d.kind === 'org')).toMatchObject({ doc: '1000', sap: '1000, 1100', roles: ['Z_MM_BUYER_1000'] });
    expect(r.diffs.find((d) => d.kind === 'tcode-sap')).toMatchObject({ brole: 'MM-01', level: 'D', text: 'List of purchasing documents per vendor' });
    // the composite's child brings MIGO: no difference for MM-02's T-codes
    expect(r.diffs.some((d) => d.key === 'MIGO')).toBe(false);
    // deleted authorization rows and derived roles' own values are not compared
    expect(r.diffs.some((d) => /M_BEST_OLD/.test(d.key))).toBe(false);
    expect(r.diffs.some((d) => d.kind.startsWith('user') && d.key === 'X99')).toBe(false);
    expect(r.roles).toEqual([
      { id: 'Z_MM_BUYER', status: 'diff' }, { id: 'Z_MM_BUYER_1000', status: 'diff' }, { id: 'Z_C_MM_WH', status: 'diff' }, { id: 'Z_MM_GONE', status: 'missing' },
    ]);
    expect(r.counts).toEqual({ ok: 0, diff: 3, missing: 1 });
  });
  it('without users no assignment is compared; a role whose only difference is the level reads as in SAP', () => {
    const r = compareRoles(doc(), rows(), { withUsers: false, today: '2026-11-18' });
    expect(r.diffs.some((d) => d.kind.startsWith('user'))).toBe(false);
    const d = doc();
    d.tcodes = d.tcodes.filter((c) => c.tcode !== 'ME29N');
    d.tcodes.push({ tcode: 'ME2L', module: '', area: '', text: '', levels: { 'MM-01': 'D' }, note: '', guess: false, ext: {} });
    d.auths = [];
    d.troles[1].orgValue = '1000, 1100';
    const r2 = compareRoles(d, rows(), { withUsers: false, today: '2026-11-18' });
    expect(r2.diffs.map((x) => x.kind)).toEqual(['level']);
    expect(r2.roles.find((x) => x.id === 'Z_MM_BUYER')?.status).toBe('ok');
  });
});

describe('role-verify: the check on the document, apply, cover', () => {
  it('keeps the check through normalize, shows it on the cover, applies SAP\'s side row by row', () => {
    const result = compareRoles(doc(), rows(), { withUsers: true, today: '2026-11-18' });
    const checked = withCheck(doc(), result, { date: '2026-11-18', system: 'HKT-DEV', tier: 'DEV', withUsers: true });
    const again = normalizeModel(JSON.parse(JSON.stringify(checked)));
    expect(again.sapCheck.counts).toEqual({ ok: 0, diff: 3, missing: 1 });
    expect(deriveView(again).checks.find((c) => c.text === 'sapVerify')).toMatchObject({ sev: 'warn', ref: '2026-11-18 · HKT-DEV · 0 / 3 / 1' });
    expect(deriveView(doc()).checks.find((c) => c.text === 'sapVerifyNone')).toBeTruthy();
    expect(normalizeModel(doc())).not.toHaveProperty('sapCheck');

    const ids = (k: string) => again.sapCheck.diffs.filter((d) => d.kind === k).map((d) => d.id);
    const { model, applied, skipped } = applyVerify(again, [...ids('tcode-doc'), ...ids('tcode-sap'), ...ids('auth-diff'), ...ids('auth-doc'), ...ids('auth-sap'), ...ids('org'), ...ids('user-doc'), ...ids('user-sap'), ...ids('level'), 'nope']);
    expect(applied).toHaveLength(8);
    expect(skipped.map((s) => s.why).sort()).toEqual(['not a difference of the last check', 'reference only']);
    expect(model.tcodes.find((c) => c.tcode === 'ME29N')?.levels).toEqual({});
    expect(model.tcodes.find((c) => c.tcode === 'ME2L')?.levels).toEqual({ 'MM-01': 'D' });
    expect(model.auths.find((a) => a.field === 'BSART')?.value).toBe('FO, NB');
    expect(model.auths.some((a) => a.object === 'M_BEST_EKO')).toBe(false);
    expect(model.auths.find((a) => a.object === 'M_BEST_WRK')?.value).toBe('*');
    expect(model.troles.find((t) => t.id === 'Z_MM_BUYER_1000')?.orgValue).toBe('1000, 1100');
    expect(model.users.find((u) => u.uid === 'BUYER02')?.roles).toEqual({});
    expect(model.users.find((u) => u.uid === 'WH02')).toMatchObject({ roles: { 'MM-02': 'X' }, approval: 'approved' });
    expect(model.sapCheck.applied).toHaveLength(8);
    // after apply, the same comparison finds only the level and the missing role
    const r2 = compareRoles(model, rows(), { withUsers: true, today: '2026-11-18' });
    expect(r2.diffs.map((d) => d.kind)).toEqual(['level']);
    expect(applyVerify(model, [ids('org')[0]]).skipped[0].why).toBe('already applied');
  });

  it('CLI: verify keeps the check in the current version; verify-apply makes a new version and stays current', async () => {
    const root = mkdtempSync(join(tmpdir(), 'role-verify-'));
    try {
      cmdInit({ root, code: 'MM-ROLES', from: undefined, doc: {}, lang: 'ko' });
      // the document as above
      const f = join(root, 'MM-ROLES', 'MM-ROLES-roles.json');
      const { writeFileSync } = await import('node:fs');
      writeFileSync(f, JSON.stringify({ ...doc(), revisions: JSON.parse(readFileSync(f, 'utf8')).revisions }));
      const calls: unknown[] = [];
      const read = async (o: unknown) => { calls.push(o); return { rows: rows(), errors: [] }; };
      const v = await cmdVerify({ root, code: 'MM-ROLES', withUsers: true, read });
      expect(calls[0]).toMatchObject({ names: ['Z_MM_BUYER', 'Z_MM_BUYER_1000', 'Z_C_MM_WH', 'Z_MM_GONE'], withUsers: true });
      expect(v).toMatchObject({ counts: { ok: 0, diff: 3, missing: 1 }, differences: 8, reference: 1, version: '0.1' });
      let m = normalizeModel(JSON.parse(readFileSync(f, 'utf8')));
      expect(m.sapCheck.version).toBe('v0.1');
      expect(deriveView(m).checks.some((c) => c.text === 'sapVerifyStale')).toBe(false);
      const a = await cmdVerifyApply({ root, code: 'MM-ROLES', ids: 'all' });
      expect(a).toMatchObject({ applied: 8, version: '0.2' });
      m = normalizeModel(JSON.parse(readFileSync(f, 'utf8')));
      expect(m.revisions.at(-1)).toMatchObject({ ver: 'v0.2', change: 'SAP 반영 확인 결과 8건 반영 (-, ' + m.sapCheck.date + ')' });
      expect(m.sapCheck.version).toBe('v0.2');
      expect(deriveView(m).checks.some((c) => c.text === 'sapVerifyStale')).toBe(false);
      expect(readFileSync(a.html, 'utf8')).toContain('sapCheck');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

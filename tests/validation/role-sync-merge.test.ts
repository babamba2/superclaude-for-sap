import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { mergeSync, ROLE_READ_TABLES, ROLE_TABLES, TCODE_LEN, USER_TABLES, readRoles } from '../../scripts/role/sap-roles.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { cmdSync } from '../../scripts/role/build-role-doc.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { normalizeModel } from '../../scripts/role/role-model.mjs';

// fictitious roles and users only (Z_TEST_*, U*)
const rows = () => ({
  define: [{ AGR_NAME: 'Z_TEST_BUYER' }, { AGR_NAME: 'Z_TEST_DISP' }],
  texts: [{ AGR_NAME: 'Z_TEST_BUYER', LINE: '00000', TEXT: 'Buyer (SAP text)' }],
  flags: [], agrs: [],
  tcodes: [{ AGR_NAME: 'Z_TEST_BUYER', TYPE: 'TR', TCODE: 'ME21N' }, { AGR_NAME: 'Z_TEST_DISP', TYPE: 'TR', TCODE: 'MMBE' }],
  auth: [{ AGR_NAME: 'Z_TEST_BUYER', OBJECT: 'M_BEST_BSA', FIELD: 'ACTVT', LOW: '01' }],
  org: [], usorg: [],
  users: [{ AGR_NAME: 'Z_TEST_BUYER', UNAME: 'U1', FROM_DAT: '20260101', TO_DAT: '99991231' }],
  tstct: [{ TCODE: 'ME21N', TTEXT: 'Create Purchase Order' }], tobjt: [],
});

describe('role sync — one merge for the CLI and the web (mergeSync)', () => {
  it('the CLI sync writes exactly what mergeSync returns for the same rows (a fake reader, no SAP)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rsync-'));
    try {
      mkdirSync(join(root, 'Z_TEST_RM'), { recursive: true });
      writeFileSync(join(root, 'Z_TEST_RM', 'Z_TEST_RM-roles.json'), JSON.stringify({ lang: 'en', doc: { code: 'Z_TEST_RM' } }));
      const first = await cmdSync({ root, code: 'Z_TEST_RM', patterns: ['Z_TEST*'], module: 'MM', lang: 'en', read: async () => ({ rows: rows(), errors: [] }) });
      expect(first).toMatchObject({ roles: 2, readErrors: [] });
      // people write into the document between two reads
      const f = join(root, 'Z_TEST_RM', 'Z_TEST_RM-roles.json');
      const edited = JSON.parse(readFileSync(f, 'utf8'));
      edited.broles[0].name = 'Purchasing clerk (written by a person)';
      edited.users[0].name = 'User One'; edited.users[0].dept = 'Purchasing';
      edited.users.push({ ...edited.users[0], name: 'Second person on the shared ID' });
      edited.auths[0].note = 'checked with security';
      edited.sod = [{ id: 'SOD-01', kind: 'PO vs GR', risk: 'r', level: 'H' }];
      writeFileSync(f, JSON.stringify(edited));
      const before = JSON.parse(readFileSync(f, 'utf8'));
      const second = await cmdSync({ root, code: 'Z_TEST_RM', patterns: ['Z_TEST*'], module: 'MM', lang: 'en', read: async () => ({ rows: rows(), errors: ['X: note'] }) });
      expect(second.readErrors).toEqual(['X: note']);
      const cli = JSON.parse(readFileSync(f, 'utf8'));
      const web = mergeSync(before, rows(), { module: 'MM', patterns: ['Z_TEST*'], withUsers: true, system: process.env.SAP_SID || '', today: cli.source.readAt, code: 'Z_TEST_RM' });
      // the CLI adds its history row and document date when it builds the page; everything else is the merge
      const strip = (m: any) => ({ ...m, revisions: [], doc: { ...m.doc, date: '' } });
      expect(strip(normalizeModel(cli))).toEqual(strip(web));
      // what people wrote stayed; SAP decided the rest
      expect(web.broles[0].name).toBe('Purchasing clerk (written by a person)');
      expect(web.users.map((u: any) => [u.uid, u.name, u.dept])).toEqual([['U1', 'User One', 'Purchasing'], ['U1', 'Second person on the shared ID', 'Purchasing']]);
      expect(web.auths[0].note).toBe('checked with security');
      expect(web.sod).toHaveLength(1);
      expect(web.doc.mode).toBe('sap');
      expect(before.broles[0].name).toBe('Purchasing clerk (written by a person)'); // the old model is not changed
      // replace: SAP's view only
      const fresh = mergeSync(before, rows(), { module: 'MM', replace: true, today: '2026-11-17', code: 'Z_TEST_RM' });
      expect(fresh.broles[0].name).not.toBe('Purchasing clerk (written by a person)');
      expect(fresh.auths[0].note).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the fixed table list a caller hands its own connection; readRoles uses a given client and leaves it open', async () => {
    expect(ROLE_READ_TABLES(true)).toEqual([...ROLE_TABLES, ...USER_TABLES, 'TSTCT', 'TOBJT', 'AUTHX', 'DD04T', 'USORG']);
    expect(ROLE_READ_TABLES(false)).not.toContain('AGR_USERS');
    expect(ROLE_READ_TABLES(true).some((t: string) => /^USR/.test(t))).toBe(false);
    const asked: string[] = [];
    let closed = false;
    const client = {
      cache: new Map(),
      async callTool({ arguments: a }: any) { asked.push(/FROM (\w+)/.exec(a.sql_query)![1]); return { content: [{ text: JSON.stringify({ rows: [], truncated: false }) }] }; },
      async close() { closed = true; },
    };
    const r = await readRoles({ patterns: ['Z_TEST*'], withUsers: false, lang: 'en', client });
    expect(r.rows.define).toEqual([]);
    expect(closed).toBe(false);
    expect(asked.every((t) => ROLE_READ_TABLES(false).includes(t))).toBe(true);
  });

  it("T-code texts are read for the menu's T-codes only: a Web Dynpro / URL entry (longer than TSTCT.TCODE) is not sent and does not sink its chunk", async () => {
    const wda = 'R3TRWDYA/PLMU/WDA_AUTH_ACC_OIF';
    const tcodes = [
      ...Array.from({ length: 45 }, (_, i) => ({ AGR_NAME: 'Z_R1', TYPE: 'TR', TCODE: `ZT${String(i).padStart(3, '0')}` })),
      { AGR_NAME: 'Z_R1', TYPE: 'OT', TCODE: wda },
      { AGR_NAME: 'Z_R1', TYPE: 'TR', TCODE: 'ZEXCL', EXCLUDE: 'X' },
    ];
    const sent: string[] = [];
    const client = {
      cache: new Map(),
      async callTool({ arguments: a }: any) {
        const table = /FROM (\w+)/.exec(a.sql_query)![1];
        const rows = table === 'AGR_DEFINE' ? [{ AGR_NAME: 'Z_R1', PARENT_AGR: '' }]
          : table === 'AGR_TCODES' ? tcodes
          : table === 'TSTCT' ? [...a.sql_query.matchAll(/'(ZT\d{3})'/g)].map((m: RegExpMatchArray) => ({ TCODE: m[1], SPRSL: 'E', TTEXT: `text ${m[1]}` }))
          : [];
        if (table === 'TSTCT') {
          sent.push(a.sql_query);
          // S/4 data preview: a key value longer than the field is a 400 for the whole statement
          if ([...a.sql_query.matchAll(/'([^']*)'/g)].some((m: RegExpMatchArray) => m[1].length > TCODE_LEN)) return { isError: true, content: [{ text: 'ADT error: Request failed with status code 400' }] };
        }
        return { content: [{ text: JSON.stringify({ rows, truncated: false }) }] };
      },
      async close() {},
    };
    const r = await readRoles({ names: ['Z_R1'], withUsers: false, lang: 'en', client });
    expect(r.errors.filter((e: string) => e.startsWith('TSTCT'))).toEqual([]);
    expect(r.rows.tstct.map((t: any) => t.TCODE).sort()).toEqual(tcodes.slice(0, 45).map((t) => t.TCODE));
    expect(sent.join(' ')).not.toContain(wda);
    expect(sent.join(' ')).not.toContain('ZEXCL');
  });
});

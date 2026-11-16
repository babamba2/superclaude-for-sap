import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { valueMatches, varsByRole, instanceGrants, assignmentsOf, startChecks, su24Checks, classify, candidates, sodImpact, tcodeGrantValues } from '../../scripts/role/auth-check.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { triage, build, normalizeChecks, ALLOW_TABLES, prdGuard, PRD_CONFIRM, rangeWhere, localDate } from '../../scripts/role/auth-triage.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderTriagePage, renderTriageMd } from '../../scripts/role/auth-triage-page.mjs';

const ROOT = join(__dirname, '..', '..');
type Row = Record<string, string>;
const a1251 = (role: string, auth: string, object: string, field: string, low: string, high = '', deleted = ''): Row => ({ AGR_NAME: role, AUTH: auth, OBJECT: object, FIELD: field, LOW: low, HIGH: high, DELETED: deleted });
const CHECK = { object: 'V_VBAK_AAT', fields: { ACTVT: '02', AUART: 'ZTOR' } };

/** One fake user: Z_TEST_SD_CLERK valid today, Z_TEST_SD_OLD expired, composite Z_TEST_COMP with a child. */
function fixture(over: Record<string, unknown> = {}) {
  return {
    user: 'TESTUSER01', tcode: 'VA02', lang: 'en', today: '2026-11-16', system: 'TST', patterns: ['Z_TEST*'], checks: [],
    users: [
      { AGR_NAME: 'Z_TEST_SD_CLERK', FROM_DAT: '20250101', TO_DAT: '99991231' },
      { AGR_NAME: 'Z_TEST_SD_OLD', FROM_DAT: '20240101', TO_DAT: '20251231' },
      { AGR_NAME: 'Z_TEST_COMP', FROM_DAT: '20250101', TO_DAT: '99991231' },
    ],
    agrs: [{ AGR_NAME: 'Z_TEST_COMP', CHILD_AGR: 'Z_TEST_CHILD' }],
    roleTcodes: [{ AGR_NAME: 'Z_TEST_SD_CLERK', TCODE: 'VA02' }, { AGR_NAME: 'Z_TEST_SD_CLERK', TCODE: 'VA03' }, { AGR_NAME: 'Z_TEST_CHILD', TCODE: 'VK11' }],
    tstca: [{ TCODE: 'VA02', OBJCT: 'V_VBAK_VKO', FIELD: 'ACTVT', VALUE: '02' }],
    usobt: [{ NAME: 'VA02', TYPE: 'TR', OBJECT: 'V_VBAK_AAT', FIELD: 'ACTVT', LOW: '02' }, { NAME: 'VA02', TYPE: 'TR', OBJECT: 'V_VBAK_AAT', FIELD: 'AUART', LOW: 'ZTOR' }],
    auth: [
      a1251('Z_TEST_SD_CLERK', 'T1', 'S_TCODE', 'TCD', 'VA0*'),
      a1251('Z_TEST_SD_CLERK', 'T2', 'V_VBAK_VKO', 'ACTVT', '*'),
      // split over two instances: ACTVT 02 only with AUART ZTEST, AUART ZTOR only with ACTVT 03
      a1251('Z_TEST_SD_CLERK', 'A1', 'V_VBAK_AAT', 'ACTVT', '02'), a1251('Z_TEST_SD_CLERK', 'A1', 'V_VBAK_AAT', 'AUART', 'ZTEST'),
      a1251('Z_TEST_SD_CLERK', 'A2', 'V_VBAK_AAT', 'ACTVT', '03'), a1251('Z_TEST_SD_CLERK', 'A2', 'V_VBAK_AAT', 'AUART', 'ZTOR'),
    ],
    vars: [],
    cand: {
      rows: [
        a1251('Z_TEST_SD_WIDE', 'W1', 'V_VBAK_AAT', 'ACTVT', '*'), a1251('Z_TEST_SD_WIDE', 'W1', 'V_VBAK_AAT', 'AUART', '*'),
        a1251('Z_TEST_SD_NARROW', 'N1', 'V_VBAK_AAT', 'ACTVT', '01', '03'), a1251('Z_TEST_SD_NARROW', 'N1', 'V_VBAK_AAT', 'AUART', 'ZT*'),
        a1251('Z_TEST_SD_NOTVA', 'X1', 'V_VBAK_AAT', 'ACTVT', '02'), a1251('Z_TEST_SD_NOTVA', 'X1', 'V_VBAK_AAT', 'AUART', 'ZTOR'),
        a1251('Z_TEST_SD_DEL', 'D1', 'V_VBAK_AAT', 'ACTVT', '02', '', 'X'), a1251('Z_TEST_SD_DEL', 'D1', 'V_VBAK_AAT', 'AUART', 'ZTOR', '', 'X'),
      ],
      vars: [],
      tcodes: [
        ...['VA01', 'VA02', 'VA03', 'VK11', 'VK12', 'F-28'].map((t) => ({ AGR_NAME: 'Z_TEST_SD_WIDE', TCODE: t })),
        ...['VA02', 'VA03'].map((t) => ({ AGR_NAME: 'Z_TEST_SD_NARROW', TCODE: t })),
        { AGR_NAME: 'Z_TEST_SD_NOTVA', TCODE: 'VA05' },
      ],
      truncated: [],
    },
    texts: { tcode: 'Change Sales Order', objects: { V_VBAK_AAT: 'Sales document type' }, fields: { AUART: 'Sales Doc. Type' } },
    notRead: [], readErrors: [], truncated: [],
    ...over,
  };
}

describe('auth-triage value matching', () => {
  it('handles *, ranges, trailing-* prefix, empty and $ org variables', () => {
    expect(valueMatches({ low: '*' }, 'ZTOR')).toBe(true);
    expect(valueMatches({ low: '01', high: '03' }, '02')).toBe(true);
    expect(valueMatches({ low: '01', high: '03' }, '06')).toBe(false);
    // pattern intervals as PFCG keeps them for S_TCODE: B* to DA*, USMN* to Z*
    expect(valueMatches({ low: 'B*', high: 'DA*' }, 'B')).toBe(true);
    expect(valueMatches({ low: 'B*', high: 'DA*' }, 'DA99')).toBe(true);
    expect(valueMatches({ low: 'B*', high: 'DA*' }, 'DB01')).toBe(false);
    expect(valueMatches({ low: 'USMN*', high: 'Z*' }, 'VA02')).toBe(true);
    expect(valueMatches({ low: 'SU13', high: 'SU55' }, 'SU56')).toBe(false);
    expect(valueMatches({ low: 'ZT*' }, 'ZTOR')).toBe(true);
    expect(valueMatches({ low: 'ZT*' }, 'YTOR')).toBe(false);
    expect(valueMatches({ low: '' }, '')).toBe(false);
    // a blank needed value: only * or the PFCG blank ' ' grant it
    expect(valueMatches({ low: "' '" }, '')).toBe(true);
    expect(valueMatches({ low: '*' }, '')).toBe(true);
    expect(valueMatches({ low: 'ZT*' }, '')).toBe(false);
    expect(valueMatches({ low: "' '" }, 'ZTOR')).toBe(false);
    expect(valueMatches({ low: 'ZTOR' }, 'ZTOR')).toBe(true);
    const vars = varsByRole([{ AGR_NAME: 'R', VARBL: '$VKORG', LOW: '1000', HIGH: '' }]).get('R');
    expect(valueMatches({ low: '$VKORG' }, '1000', vars)).toBe(true);
    expect(valueMatches({ low: '$VKORG' }, '2000', vars)).toBe(false);
    expect(valueMatches({ low: '$VKORG' }, '1000')).toBe(false); // unresolved variable grants nothing
  });
});

describe('auth-triage same-instance rule', () => {
  const rows = fixture().auth;
  it('grants when one instance satisfies every field', () => {
    const r = instanceGrants(rows, { object: 'V_VBAK_AAT', fields: { ACTVT: '02', AUART: 'ZTEST' } });
    expect(r).toMatchObject({ granted: true, role: 'Z_TEST_SD_CLERK', auth: 'A1' });
  });
  it('does NOT grant when the values sit in two different instances', () => {
    const r = instanceGrants(rows, CHECK);
    expect(r.granted).toBe(false);
    expect(r.nearest.gaps).toHaveLength(1);
  });
  it('ignores DELETED rows and DUMMY (not checked) fields', () => {
    const del = fixture().cand.rows.filter((x: Row) => x.AGR_NAME === 'Z_TEST_SD_DEL');
    expect(instanceGrants(del, CHECK).granted).toBe(false);
    expect(instanceGrants(rows, { object: 'V_VBAK_AAT', fields: { ACTVT: '02', AUART: 'DUMMY' } }).granted).toBe(true);
    // an empty SU53 value is a real check for blank, not "not checked"
    expect(instanceGrants(rows, { object: 'V_VBAK_AAT', fields: { ACTVT: '02', AUART: '' } }).granted).toBe(false);
  });
});

describe('auth-triage classify', () => {
  it('A: SU53 check no valid role gives (split instances)', () => {
    const v = classify(fixture({ checks: [CHECK] }));
    expect(v.mode).toBe('su53');
    expect(v.verdict).toBe('A');
  });
  it('B: a valid role gives the values', () => {
    const v = classify(fixture({ checks: [{ object: 'V_VBAK_AAT', fields: { ACTVT: '02', AUART: 'ZTEST' } }] }));
    expect(v.verdict).toBe('B');
    expect(v.results[0].role).toBe('Z_TEST_SD_CLERK');
  });
  it('C: only an expired assignment gives the values', () => {
    const f = fixture({ checks: [CHECK] });
    f.auth.push(a1251('Z_TEST_SD_OLD', 'O1', 'V_VBAK_AAT', 'ACTVT', '*'), a1251('Z_TEST_SD_OLD', 'O1', 'V_VBAK_AAT', 'AUART', 'ZTOR'));
    const v = classify(f);
    expect(v.verdict).toBe('C');
    expect(v.results[0].assignment).toMatchObject({ role: 'Z_TEST_SD_OLD', to: '20251231' });
    expect(v.results[0].period).toBe('expired');
  });
  it('C: a future assignment is "not started yet", not "expired"', () => {
    const f = fixture({ checks: [CHECK] });
    f.users.push({ AGR_NAME: 'Z_TEST_SD_NEXT', FROM_DAT: '20270101', TO_DAT: '99991231' });
    f.auth.push(a1251('Z_TEST_SD_NEXT', 'N1', 'V_VBAK_AAT', 'ACTVT', '*'), a1251('Z_TEST_SD_NEXT', 'N1', 'V_VBAK_AAT', 'AUART', 'ZTOR'));
    const v = classify(f);
    expect(v.results[0]).toMatchObject({ verdict: 'C', period: 'future', role: 'Z_TEST_SD_NEXT' });
    expect(renderTriagePage(triage(f))).toContain('not started yet');
  });
  it('D: no check given, start checks pass → SU24 estimate; notRead never yields A', () => {
    const v = classify(fixture());
    expect(v.mode).toBe('estimate');
    expect(v.verdict).toBe('D');
    expect(v.estimates.map((r: { check: { object: string } }) => r.check.object)).toEqual(['V_VBAK_AAT']);
    const ok = fixture();
    ok.auth.push(a1251('Z_TEST_SD_CLERK', 'A3', 'V_VBAK_AAT', 'ACTVT', '02'), a1251('Z_TEST_SD_CLERK', 'A3', 'V_VBAK_AAT', 'AUART', 'ZTOR'));
    expect(classify(ok)).toMatchObject({ verdict: 'D', reason: 'startOk', estimates: [] });
    expect(renderTriagePage(triage(ok))).toContain('passes the T-code start checks');
    const nr = classify(fixture({ checks: [CHECK], notRead: ['AGR_1251'] }));
    expect(nr.verdict).toBe('D');
    expect(nr.results[0].reason).toBe('notRead');
    // the user's own role values partly read (5000-row limit) → never A either
    const pr = classify(fixture({ checks: [CHECK], partial: ['AGR_1251'] }));
    expect(pr.verdict).toBe('D');
    expect(pr.results[0].reason).toBe('partial');
    expect(renderTriagePage(triage(fixture({ checks: [CHECK], partial: ['AGR_1251'] })))).toContain('partly read');
  });
  it('start checks: missing S_TCODE is A without SU53', () => {
    const v = classify(fixture({ tcode: 'VF01' }));
    expect(v.mode).toBe('start');
    expect(v.verdict).toBe('A');
    expect(v.results[0].check).toMatchObject({ object: 'S_TCODE', fields: { TCD: 'VF01' } });
  });
  it('expands composite roles to their children with the parent validity', () => {
    const as = assignmentsOf(fixture().users, fixture().agrs, '2026-11-16');
    expect(as.find((a: { role: string }) => a.role === 'Z_TEST_CHILD')).toMatchObject({ via: 'Z_TEST_COMP', valid: true });
    expect(as.find((a: { role: string }) => a.role === 'Z_TEST_SD_OLD').valid).toBe(false);
  });
  it('start and SU24 checks are built from TSTCA / USOBT_C', () => {
    // a TSTCA field without a value is not checked at start
    expect(startChecks('SE38', [{ TCODE: 'SE38', OBJCT: 'S_DEVELOP', FIELD: 'ACTVT', VALUE: '03' }, { TCODE: 'SE38', OBJCT: 'S_DEVELOP', FIELD: 'DEVCLASS', VALUE: '' }])[1].fields).toEqual({ ACTVT: '03', DEVCLASS: 'DUMMY' });
    expect(startChecks('VA02', fixture().tstca)).toEqual([{ object: 'S_TCODE', fields: { TCD: 'VA02' }, source: 'start' }, { object: 'V_VBAK_VKO', fields: { ACTVT: '02' }, source: 'start' }]);
    expect(su24Checks(fixture().usobt)).toEqual([{ object: 'V_VBAK_AAT', fields: { ACTVT: '02', AUART: 'ZTOR' }, source: 'su24' }]);
    expect(tcodeGrantValues('VA02')).toEqual(['*', 'V*', 'VA*', 'VA0*', 'VA02']);
  });
});

describe('auth-triage candidates and SoD', () => {
  it('ranks least privilege first, skips deleted rows, caps at 5 and reports the total', () => {
    const f = fixture();
    const tc: Record<string, string[]> = {};
    for (const r of f.cand.tcodes) (tc[r.AGR_NAME] ||= []).push(r.TCODE);
    const c = candidates({ missing: [CHECK], rows: f.cand.rows, vars: [], roleTcodes: tc, tcode: 'VA02' });
    expect(c.list.map((x: { role: string }) => x.role)).toEqual(['Z_TEST_SD_NARROW', 'Z_TEST_SD_WIDE', 'Z_TEST_SD_NOTVA']);
    const many = Array.from({ length: 8 }, (_, i) => [a1251(`Z_TEST_R${i}`, 'X', 'V_VBAK_AAT', 'ACTVT', '*'), a1251(`Z_TEST_R${i}`, 'X', 'V_VBAK_AAT', 'AUART', '*')]).flat();
    const capped = candidates({ missing: [CHECK], rows: many, vars: [], tcode: 'VA02' });
    expect(capped.list).toHaveLength(5);
    expect(capped.total).toBe(8);
    expect(candidates({ missing: [CHECK], rows: many, vars: [], tcode: 'VA02', held: ['Z_TEST_R0'] }).total).toBe(7);
  });
  it('prefers exact values over * / ranges and puts roles with unread T-codes last', () => {
    const rows = [a1251('Z_TEST_STAR', 'S', 'V_VBAK_AAT', 'ACTVT', '*'), a1251('Z_TEST_STAR', 'S', 'V_VBAK_AAT', 'AUART', '*'),
      a1251('Z_TEST_EXACT', 'E', 'V_VBAK_AAT', 'ACTVT', '02'), a1251('Z_TEST_EXACT', 'E', 'V_VBAK_AAT', 'AUART', 'ZTOR'),
      a1251('Z_TEST_UNREAD', 'U', 'V_VBAK_AAT', 'ACTVT', '02'), a1251('Z_TEST_UNREAD', 'U', 'V_VBAK_AAT', 'AUART', 'ZTOR')];
    const c = candidates({ missing: [CHECK], rows, vars: [], roleTcodes: { Z_TEST_STAR: ['VA02'], Z_TEST_EXACT: ['VA02'] }, tcode: 'VA02' });
    expect(c.list.map((x: { role: string }) => x.role)).toEqual(['Z_TEST_EXACT', 'Z_TEST_STAR', 'Z_TEST_UNREAD']);
    expect(c.list[2].tcodes).toBeNull();
  });
  it('S_TCODE range rows are read with one short condition per chunk', () => {
    const w = rangeWhere({ roles: ['Z_TEST_A', "Z_TEST_O'B"] });
    expect(w).toBe("AGR_NAME IN ('Z_TEST_A',\n'Z_TEST_O''B') AND OBJECT = 'S_TCODE' AND FIELD = 'TCD' AND HIGH <> ' '");
    expect(rangeWhere({ like: 'Z%' })).toContain("AGR_NAME LIKE 'Z%'");
    const range = [a1251('Z_TEST_RANGE', 'R', 'S_TCODE', 'TCD', 'VA01', 'VA03')];
    expect(instanceGrants(range, { object: 'S_TCODE', fields: { TCD: 'VA02' } }).granted).toBe(true);
    const c = candidates({ missing: [{ object: 'S_TCODE', fields: { TCD: 'VA02' } }], rows: range, vars: [], tcode: 'VA02' });
    expect(c.list.map((x: { role: string }) => x.role)).toEqual(['Z_TEST_RANGE']);
    expect(localDate(new Date(2026, 0, 2, 0, 30))).toBe('2026-01-02');
  });
  it('reports only the SoD conflicts a candidate newly adds', () => {
    const lib = JSON.parse(readFileSync(join(ROOT, 'scripts', 'role', 'sod-library.json'), 'utf8')).rules;
    const r = sodImpact(['VA02', 'VK11'], ['F-28', 'VA02'], lib, 'en');
    expect(r.existing.map((s: { kind: string }) => s.kind)).toContain('Pricing conditions vs sales orders');
    expect(r.added.map((s: { kind: string }) => s.kind)).not.toContain('Pricing conditions vs sales orders');
    expect(sodImpact(['VA02'], ['VK11'], lib, 'en').added.map((s: { kind: string }) => s.kind)).toContain('Pricing conditions vs sales orders');
  });
  it('triage marks a truncated candidate read', () => {
    const f = fixture({ checks: [CHECK] });
    f.cand.truncated = ['V_VBAK_AAT'];
    const m = triage(f);
    expect(m.candidateTruncated).toEqual(['V_VBAK_AAT']);
    expect(renderTriagePage(m)).toContain('exceeded 5000');
  });
});

describe('auth-triage output', () => {
  it('builds HTML + MD + model with no user ID in file names or the title', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'auth-triage-'));
    try {
      const input = join(dir, 'collect.json');
      writeFileSync(input, JSON.stringify(fixture({ checks: normalizeChecks({ object: 'v_vbak_aat', fields: { actvt: '02', auart: 'ZTOR' } }) })));
      const r = await build({ input, outDir: dir, now: new Date(2026, 10, 16, 9, 30) });
      expect(r.verdict).toBe('A');
      expect(r.candidates[0]).toMatch(/^Z_TEST_SD_NARROW/);
      for (const f of readdirSync(dir)) expect(f).not.toContain('TESTUSER01');
      expect(r.html).toMatch(/auth-triage-VA02-20261116-0930-en\.html$/);
      const html = readFileSync(r.html, 'utf8');
      expect(/<title>([^<]*)<\/title>/.exec(html)![1]).not.toContain('TESTUSER01');
      expect(html).toContain('TESTUSER01'); // body only
      expect(html).toContain('data-sc4sap-responsive');
      expect(html).toContain('A missing');
      const md = readFileSync(r.md, 'utf8');
      expect(md).toContain('Z_TEST_SD_NARROW');
      expect(renderTriageMd(triage({ ...fixture({ checks: [CHECK] }), lang: 'ko' }))).toContain('A 미보유');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('auth-triage PRD guard', () => {
  it('stops collect on PRD unless confirmed; DEV / QA run', () => {
    expect(prdGuard({ tier: 'PRD', confirmed: false })).toContain(PRD_CONFIRM.en);
    expect(prdGuard({ tier: 'PRD', confirmed: true })).toBe('');
    expect(prdGuard({ tier: 'DEV', confirmed: false })).toBe('');
  });
});

describe('auth-triage read scope (static)', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'role', 'auth-triage.mjs'), 'utf8');
  it('allows exactly the spec tables — never USR*, UST*, AGR_1016', () => {
    expect(ALLOW_TABLES).toEqual(['AGR_USERS', 'AGR_AGRS', 'AGR_TCODES', 'AGR_1251', 'AGR_1252', 'TSTCA', 'USOBT_C', 'TSTCT', 'TOBJT', 'AUTHX', 'DD04T']);
    expect(src).not.toMatch(/'(USR\w*|UST\w*|AGR_1016)'/);
  });
  it('reads AGR_USERS only for UNAME = the one user', () => {
    const reads = src.split('\n').filter((l: string) => /(readTable|readIn)\(client, 'AGR_USERS'/.test(l));
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatch(/readTable\(client, 'AGR_USERS', \{ where: \{ UNAME: user \}/);
  });
});

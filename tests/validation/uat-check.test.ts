import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPatch, checkOf, normalize } from '../../scripts/uat/uat-model.mjs';
import { CHECK_KINDS, MAX_TARGETS, readerOver, ruleVerdict, runChecks, targetId, validatePlan } from '../../scripts/uat/uat-check.mjs';
import { applyCheck, jsonOf, judgePrompt, mergeJudge, planPrompt, ruleRows, stepsForPrompt } from '../../scripts/uat/uat-check-ai.mjs';
import { pageHtml } from '../../scripts/uat/uat-page.mjs';

const set = () => normalize({
  id: 'SD-UAT', module: 'SD', cycles: ['1st'],
  scenarios: [{
    id: 'SD01', company: '1000', title: 'Order to cash',
    steps: [
      { activity: 'Create sales order ZOR for sales org 1000', tcode: 'VA01', inputs: ['Customer 100001', 'Material 4711', 'Plant 1100'], outputs: ['Order number'], user: 'SDTEST01', tester: 'Kim' },
      { activity: 'Post goods issue', tcode: 'VL02N', checks: ['Movement type 601'] },
      { activity: 'Hand-off to the warehouse system', system: 'WMS' },
    ],
  }],
});

/** A reader over tables in memory: { TABLE: [rows] }; `fail` tables answer an error. */
function fakeReader(db: Record<string, Record<string, string>[]>, { fail = [] as string[], usage = null as null | Record<string, boolean> } = {}) {
  const calls: string[] = [];
  const match = (row: Record<string, string>, cond: string) =>
    cond.split(' AND ').every((c) => {
      const m = /^(\w+) (=|<=|>=) '(.*)'$/.exec(c.trim());
      if (!m) return false;
      const v = String(row[m[1]] ?? '');
      return m[2] === '=' ? v === m[3] : m[2] === '<=' ? v <= m[3] : v >= m[3];
    });
  return {
    calls,
    async readIn(table: string, field: string, values: string[]) {
      calls.push(`in ${table}`);
      if (fail.includes(table)) return { ok: false, rows: [], errors: ['blocked'] };
      return { ok: true, rows: (db[table] ?? []).filter((r) => values.includes(r[field])), errors: [] };
    },
    async readTable(table: string, { where, maxRows }: { where: string; maxRows?: number }) {
      calls.push(`table ${table} ${where}`);
      if (fail.includes(table)) return { ok: false, rows: [], error: 'blocked' };
      return { ok: true, rows: (db[table] ?? []).filter((r) => match(r, where)).slice(0, maxRows ?? 1) };
    },
    async tcodeUsage(tcodes: string[]) {
      return usage ? { ok: true, used: Object.fromEntries(tcodes.map((t) => [t, !!usage[t]])), coverage: 3 } : null;
    },
  };
}

const DB = {
  TSTC: [{ TCODE: 'VA01' }, { TCODE: 'VL02N' }],
  TVKO: [{ VKORG: '1000' }],
  T001W: [{ WERKS: '1100' }],
  MARA: [{ MATNR: '000000000000004711' }],
  TVAK: [{ AUART: 'ZOR', NUMKI: '01' }],
  NRIV: [{ OBJECT: 'RV_BELEG', NRRANGENR: '01' }],
  T156: [{ BWART: '601' }],
};

const plan = (s = set()) => validatePlan({
  steps: [
    { scenario: 'SD01', step: 'STEP-001', targets: [
      { kind: 'vkorg', key: { VKORG: '1000' } }, { kind: 'auart', key: { AUART: 'zor' } }, { kind: 'kunnr', key: { KUNNR: '100001' } },
      { kind: 'matnr', key: { MATNR: '4711' } }, { kind: 'werks', key: { WERKS: '1100' } }, { kind: 'werks', key: { WERKS: '1100' } },
    ], vague: [] },
    { scenario: 'SD01', step: 'STEP-002', targets: [{ kind: 'bwart', key: { BWART: '601' } }, { kind: 'bogus', key: {} }, { kind: 'werks', key: { WERKS: "1'00; DROP" } }], vague: ['a delivery with picking done'] },
    { scenario: 'SD01', step: 'STEP-009', targets: [] },
  ],
}, s);

describe('uat-check: plan', () => {
  it('keeps only steps, kinds and keys that exist and are well-formed; adds the step T-code; dedupes', () => {
    const p = plan();
    expect(p.steps.map((x) => `${x.scenario}/${x.step}`)).toEqual(['SD01/STEP-001', 'SD01/STEP-002']);
    expect(p.steps[0].targets.map(targetId)).toEqual(['tcode:TCODE=VA01', 'vkorg:VKORG=1000', 'auart:AUART=ZOR', 'kunnr:KUNNR=100001', 'matnr:MATNR=4711', 'werks:WERKS=1100']);
    expect(p.steps[1].targets.map(targetId)).toEqual(['tcode:TCODE=VL02N', 'bwart:BWART=601']);
    expect(p.steps[1].vague).toEqual(['a delivery with picking done']);
    expect(p.dropped).toEqual(['SD01/STEP-002: unknown kind bogus', 'SD01/STEP-002: werks key not well-formed', 'step SD01/STEP-009 not in the set']);
  });
  it('caps the targets of a run', () => {
    const many = Array.from({ length: MAX_TARGETS + 20 }, (_, i) => ({ kind: 'bwart', key: { BWART: String(100 + i).slice(-3) } }));
    const p = validatePlan({ steps: [{ scenario: 'SD01', step: 'STEP-001', targets: many }] }, set());
    expect(p.steps[0].targets.length).toBeLessThanOrEqual(MAX_TARGETS);
  });
  it('the prompts fence the steps as data and leave out test users and testers', () => {
    const pp = planPrompt(set());
    expect(pp).toMatch(/Never invent, complete or guess a value/);
    expect(pp).toMatch(/never followed/);
    expect(pp).not.toMatch(/SDTEST01|Kim/);
    expect(stepsForPrompt(set()).map((x) => x.step)).toEqual(['STEP-001', 'STEP-002']); // the WMS step is not an SAP step
    for (const k of Object.keys(CHECK_KINDS)) expect(pp).toContain(`- ${k}:`);
    expect(jsonOf('noise {"steps":[]} tail')).toEqual({ steps: [] });
    expect(jsonOf('no json')).toBeNull();
  });
});

describe('uat-check: reads and rule verdicts', () => {
  it('a profile that allows the customer table: the key is read, with its leading zeros', async () => {
    const r = fakeReader({ ...DB, KNA1: [{ KUNNR: '0000100001' }] });
    const ev = await runChecks(plan(), r);
    expect(ev['kunnr:KUNNR=100001']).toMatchObject({ found: true, note: '' });
    const missing = await runChecks(plan(), fakeReader({ ...DB, KNA1: [] }));
    expect(missing['kunnr:KUNNR=100001']).toMatchObject({ found: false });
  });
  it('finds, misses, pads material numbers, a refused customer read is the privacy reason, follows number ranges and usage', async () => {
    const r = fakeReader(DB, { usage: { VA01: true, VL02N: false }, fail: ['KNA1'] });
    const ev = await runChecks(plan(), r, { today: '2026-11-18' });
    expect(ev['vkorg:VKORG=1000'].found).toBe(true);
    expect(ev['matnr:MATNR=4711'].found).toBe(true);
    expect(ev['kunnr:KUNNR=100001']).toMatchObject({ found: null, note: 'pii' });
    expect(r.calls.filter((c) => /KNA1/.test(c))).toEqual(['in KNA1']); // tried once, key only — refused by the blocklist
    expect(ev['auart:AUART=ZOR'].extra).toMatchObject({ numki: '01', numberRange: true });
    expect(ev['tcode:TCODE=VL02N'].extra.usage).toEqual({ used: false, months: 3 });
    const rows = ruleRows(plan(), ev);
    expect(rows[0].rule).toBe('check'); // customer not read
    expect(rows[0].reasons.map((x) => x.code)).toEqual(['pii']);
    expect(rows[1].rule).toBe('check');
    expect(rows[1].reasons.map((x) => x.code).sort()).toEqual(['unused', 'vague']);
  });
  it('mismatch for a value not in the system or an order type without number range; check for a failed read', async () => {
    const db = { ...DB, TVKO: [], NRIV: [] };
    const ev = await runChecks(plan(), fakeReader(db, { fail: ['T001W', 'KNA1'] }));
    const rows = ruleRows(plan(), ev);
    expect(rows[0].rule).toBe('mismatch');
    expect(rows[0].reasons.map((x) => x.code)).toEqual(expect.arrayContaining(['not-found', 'no-number-range', 'unread', 'pii']));
    expect(ev['werks:WERKS=1100']).toMatchObject({ found: null });
    expect(ev['werks:WERKS=1100'].note).toMatch(/read failed/);
  });
  it('composite keys and pricing: a plant material, a condition type with or without a record valid today', async () => {
    const p = validatePlan({ steps: [{ scenario: 'SD01', step: 'STEP-001', targets: [{ kind: 'matnrPlant', key: { MATNR: '4711', WERKS: '1100' } }, { kind: 'kschl', key: { KSCHL: 'PR00' } }] }] }, set());
    const db = { ...DB, MARC: [{ MATNR: '000000000000004711', WERKS: '1100' }], T685A: [{ KSCHL: 'PR00' }], KONH: [{ KNUMH: '1', KSCHL: 'PR00', DATAB: '20260101', DATBI: '20261231' }] };
    const ev = await runChecks(p, fakeReader(db), { today: '2026-11-18' });
    expect(ev['matnrPlant:MATNR=4711,WERKS=1100'].found).toBe(true);
    expect(ev['kschl:KSCHL=PR00'].extra.conditionRecord).toBe(true);
    const ev2 = await runChecks(p, fakeReader(db), { today: '2027-02-01' });
    expect(ev2['kschl:KSCHL=PR00'].extra.conditionRecord).toBe(false);
    expect(ruleVerdict(p.steps[0], ev2).reasons.map((x) => x.code)).toContain('no-condition-record');
  });
  it('readerOver reads GetTcodeUsage answers ({ used, unused, coverage }) and treats an error as unknown', async () => {
    const client = (res: unknown) => ({ callTool: async () => res });
    const ok = readerOver(client({ content: [{ text: JSON.stringify({ used: ['VA01'], unused: ['VL02N'], coverage: 2 }) }] }), { readIn: async () => ({}), readTable: async () => ({}) } as never);
    expect(await ok.tcodeUsage(['VA01', 'VL02N'], 3)).toEqual({ ok: true, used: { VA01: true, VL02N: false }, coverage: 2 });
    const bad = readerOver(client({ isError: true, content: [{ text: 'no FM' }] }), { readIn: async () => ({}), readTable: async () => ({}) } as never);
    expect(await bad.tcodeUsage(['VA01'], 3)).toBeNull();
  });
});

const rows = async () => ruleRows(plan(), await runChecks(plan(), fakeReader({ ...DB, TVKO: [] })));

describe('uat-check: judge, result, page', () => {
  it('the judge can make a verdict stricter, never milder; proposals need an allowed field and evidence of their own step', async () => {
    const r = await rows();
    expect(r.map((x) => x.rule)).toEqual(['mismatch', 'check']);
    const merged = mergeJudge(r, {
      steps: [
        { scenario: 'SD01', step: 'STEP-001', verdict: 'ok', reason: 'fine', proposals: [
          { field: 'inputs', value: ['Sales org 1010'], why: 'x', evidence: ['vkorg:VKORG=1000'] },
          { field: 'user', value: 'X', evidence: ['vkorg:VKORG=1000'] },
          { field: 'tcode', value: 'VA01N', evidence: ['bwart:BWART=601'] },
          { field: 'activity', value: 'guess', evidence: [] },
        ] },
        { scenario: 'SD01', step: 'STEP-002', verdict: 'check', plausible: false, reason: 'GI does not print the order number' },
      ],
    });
    expect(merged.map((x) => x.verdict)).toEqual(['mismatch', 'check']);
    expect(merged[0].proposals).toEqual([{ op: 'set-step', scenario: 'SD01', step: 'STEP-001', field: 'inputs', value: ['Sales org 1010'], why: 'x', evidence: ['vkorg:VKORG=1000'] }]);
    expect(mergeJudge([{ ...r[1], rule: 'ok' }], { steps: [{ scenario: 'SD01', step: 'STEP-002', plausible: false }] })[0].verdict).toBe('check');
    expect(judgePrompt(set(), r)).toMatch(/never milder/);
  });
  it('lastCheck is kept on the set, survives normalize, and a step edited afterwards reads as stale', async () => {
    const merged = mergeJudge(await rows(), { steps: [] });
    const checked = applyCheck(set(), merged, { at: '2026-11-18T09:30:00Z', system: 'HKT-DEV', models: { plan: 'claude-haiku-5-5', judge: 'claude-sonnet-5-5' } });
    expect(checked.lastCheck.counts).toEqual({ ok: 0, check: 1, mismatch: 1 });
    const again = normalize(JSON.parse(JSON.stringify(checked)));
    expect(again.lastCheck.steps).toHaveLength(2);
    const sc = again.scenarios[0];
    expect(checkOf(again, sc, sc.steps[0])).toMatchObject({ verdict: 'mismatch', stale: false });
    const { set: edited } = applyPatch(again, [{ op: 'set-step', scenario: 'SD01', step: 'STEP-001', field: 'tcode', value: 'VA02' }]);
    expect(checkOf(edited, edited.scenarios[0], edited.scenarios[0].steps[0]).stale).toBe(true);
    expect(normalize(set())).not.toHaveProperty('lastCheck');
  });
  it('the page shows the check column and line only for a checked set', async () => {
    const plain = pageHtml(set(), 'ko');
    expect(plain).toContain('function cbadge');
    const checked = applyCheck(set(), mergeJudge(await rows(), { steps: [] }), { system: 'HKT-DEV' });
    const html = pageHtml(checked, 'ko');
    expect(html).toMatch(/"lastCheck":\{/);
    expect(html).toContain('AI 시나리오 점검 {at}');
    expect(plain).not.toMatch(/"lastCheck":\{/);
  });
});

describe('uat-check: CLI check-save', () => {
  it('merges a judge answer into the set, rewrites the page and writes the proposals as a patch file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uat-check-'));
    try {
      const B = join(process.cwd(), 'scripts/uat/build-uat.mjs');
      writeFileSync(join(dir, 'a.json'), JSON.stringify(set()));
      execFileSync('node', [B, 'init', '--answers', join(dir, 'a.json'), '--dir', dir, '--no-xlsx']);
      mkdirSync(join(dir, 'SD-UAT', '_check'), { recursive: true });
      writeFileSync(join(dir, 'SD-UAT', '_check', 'evidence.json'), JSON.stringify({ months: 3, dropped: [], rows: await rows() }));
      writeFileSync(join(dir, 'judge.json'), JSON.stringify({ steps: [{ scenario: 'SD01', step: 'STEP-001', reason: 'sales org 1000 is not in the system', proposals: [{ field: 'inputs', value: ['Sales org 1010'], evidence: ['vkorg:VKORG=1000'] }] }] }));
      const out = JSON.parse(execFileSync('node', [B, 'check-save', '--dir', dir, '--id', 'SD-UAT', '--judge', join(dir, 'judge.json'), '--system', 'HKT-DEV', '--no-xlsx'], { encoding: 'utf8' }));
      expect(out).toMatchObject({ ok: true, counts: { ok: 0, check: 1, mismatch: 1 }, proposals: 1 });
      const saved = JSON.parse(readFileSync(join(dir, 'SD-UAT', 'SD-UAT-uat.json'), 'utf8'));
      expect(saved.lastCheck.system).toBe('HKT-DEV');
      expect(saved.lastCheck.steps[0].reason).toBe('sales org 1000 is not in the system');
      expect(JSON.parse(readFileSync(join(dir, '_patch', 'SD-UAT-check.json'), 'utf8'))[0]).toMatchObject({ op: 'set-step', field: 'inputs' });
      expect(readFileSync(join(dir, 'SD-UAT', 'SD-UAT-uat.html'), 'utf8')).toMatch(/"lastCheck":\{/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('uat-check: a master table the system refuses by delivery class (ECC TABLE_READ)', () => {
  const REFUSED = 'MCP error -32603: ADT error: Error: ZMCP_ADT_DISPATCH error (action=TABLE_READ, subrc=4): TABLE_READ: table MARA is not allowed — table reads on this SAP release (BASIS < 7.50) go through ZMCP_ADT_DISPATCH TABLE_READ, which reads customizing / system tables only (delivery class C, G, E, S, W)';
  const reader = (refuse: Record<string, string>) => {
    const base = fakeReader(DB);
    return {
      ...base,
      async readIn(table: string, field: string, values: string[], o: any) {
        if (refuse[table]) return { ok: false, rows: [], errors: [refuse[table]] };
        return base.readIn(table, field, values, o);
      },
      async readTable(table: string, o: any) {
        if (refuse[table]) return { ok: false, rows: [], error: refuse[table] };
        return base.readTable(table, o);
      },
    };
  };
  const matPlan = () => validatePlan({
    steps: [{ scenario: 'SD01', step: 'STEP-001', targets: [
      { kind: 'matnr', key: { MATNR: '4711' } }, { kind: 'matnrPlant', key: { MATNR: 'AB-1', WERKS: '1100' } }, { kind: 'werks', key: { WERKS: '1100' } },
    ], vague: [] }],
  }, set());

  it('material kinds: "no-material-read", never "unread" or "not-found"; the step stays "check"', async () => {
    const ev = await runChecks(matPlan(), reader({ MARA: REFUSED, MARC: REFUSED.replace('MARA', 'MARC') }));
    const rows = ruleRows(matPlan(), ev);
    expect(rows[0].rule).toBe('check');
    const codes = rows[0].reasons.map((r: any) => `${r.code} ${r.target}`);
    expect(codes).toContain('no-material-read matnr:MATNR=4711');
    expect(codes).toContain('no-material-read matnrPlant:MATNR=AB-1,WERKS=1100');
    expect(codes.some((c: string) => c.startsWith('unread') || c.startsWith('not-found'))).toBe(false);
    expect(ev['matnr:MATNR=4711'].note).toBe('class');
  });

  it('any other read error stays "unread" with its text; a refusal of a non-material table is "unread" too', async () => {
    const ev = await runChecks(matPlan(), reader({ MARA: 'ADT error: Request failed with status code 500', T001W: REFUSED.replace('MARA', 'T001W') }));
    const rows = ruleRows(matPlan(), ev);
    const codes = rows[0].reasons.map((r: any) => `${r.code} ${r.target}`);
    expect(codes).toContain('unread matnr:MATNR=4711');
    expect(codes).toContain('unread werks:WERKS=1100');
    expect(ev['matnr:MATNR=4711'].note).toMatch(/^read failed: ADT error/);
  });

  it('the page and the judge say it in words', () => {
    const page = readFileSync(new URL('../../scripts/uat/uat-page.mjs', import.meta.url), 'utf8');
    expect(page).toContain("'no-material-read': '자재 마스터는 이 시스템에서 읽을 수 없음'");
    expect(page).toContain("'no-material-read': 'material master not readable on this system'");
    expect(judgePrompt(set(), [], { lang: 'ko' })).toContain('note class =');
  });
});

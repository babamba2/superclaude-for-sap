import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { jobRuns, failureOf, lastOkBefore, concurrentAborts, dumpsInWindow, jobSuspects, jobFacts, idocFacts, idocVolume, buildFacts, minutesOf, objectNamesOf } from '../../scripts/ops/incident-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { FIELDS, fieldSql, interfacesFor, _collect, _build } from '../../scripts/ops/incident.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderIncidentPage } from '../../scripts/ops/incident-page.mjs';

type Row = Record<string, string>;
const run = (count: string, status: string, sd: string, st: string, ed: string, et: string, job = 'Z_TEST_JOB'): Row => ({ JOBNAME: job, JOBCOUNT: count, STATUS: status, STRTDATE: sd, STRTTIME: st, ENDDATE: ed, ENDTIME: et, PERIODIC: 'X', PRDDAYS: '1' });
const RUNS = [
  run('00000001', 'F', '20261110', '020000', '20261110', '021000'),
  run('00000002', 'F', '20261111', '020000', '20261111', '021000'),
  run('00000003', 'A', '20261112', '020000', '20261112', '020500'),
  run('00000004', 'A', '20261113', '020000', '20261113', '020400'),
];
const STEPS = [{ JOBNAME: 'Z_TEST_JOB', JOBCOUNT: '00000004', STEPCOUNT: '1', PROGNAME: 'Z_TEST_REPORT', VARIANT: 'Z_VAR1', XPGPROG: '', STATUS: 'A' }];
const jobCollect = (over: Record<string, unknown> = {}) => ({
  kind: 'job', job: 'Z_TEST_JOB', lang: 'en', system: 'TST',
  runs: { ok: true, rows: RUNS }, steps: { ok: true, rows: STEPS },
  others: { ok: true, rows: [run('00000009', 'A', '20261113', '015000', '20261113', '021500', 'Z_TEST_OTHER'), run('00000010', 'A', '20261113', '010000', '20261113', '010000', 'Z_TEST_FAR')] },
  dumps: { ok: true, rows: [{ id: 'd1', date: '2026-11-13', time: '02:03:00', error: 'TEST_ERROR', program: 'Z_TEST_REPORT', include: '' }, { id: 'd2', date: '2026-11-13', time: '02:20:00', error: 'LATE', program: 'Z_TEST_REPORT', include: '' }] },
  transports: { ok: true, rows: [{ trkorr: 'TSTK900001', kind: 'workbench', status: 'released', date: '2026-11-12', text: 'test change' }, { trkorr: 'TSTK900002', kind: 'workbench', status: 'released', date: '2026-11-01', text: 'old change' }] },
  objects: { ok: true, rows: [{ trkorr: 'TSTK900001', object: 'PROG', name: 'Z_TEST_REPORT' }, { trkorr: 'TSTK900002', object: 'REPS', name: 'Z_TEST_REPORT' }] },
  ...over,
});

describe('incident — job history and signals', () => {
  it('finds the failed run and the last good run before it', () => {
    const runs = jobRuns(RUNS);
    const f = failureOf(runs);
    expect(f).toMatchObject({ count: '00000004', endDate: '2026-11-13', minutes: 4 });
    expect(lastOkBefore(runs, f)).toMatchObject({ count: '00000002' });
    expect(failureOf(runs, '2026-11-12')).toMatchObject({ count: '00000003' });
    const facts = jobFacts(jobCollect());
    expect(facts.history).toMatchObject({ runs: 4, aborted: 2, finished: 2, abortedInRow: 2, periodic: true, period: '1 days' });
  });

  it('counts other jobs aborted within ±30 min only', () => {
    const f = failureOf(jobRuns(RUNS));
    const c = concurrentAborts(jobCollect().others.rows, f, 'Z_TEST_JOB');
    expect(c.map((r: { job: string }) => r.job)).toEqual(['Z_TEST_OTHER']);
  });

  it('keeps dumps from start − 10 min to end + 10 min, marks step programs, drops users', () => {
    const f = failureOf(jobRuns(RUNS)); // 02:00 → 02:04
    const rows = [
      { date: '2026-11-13', time: '01:50:00', program: 'Z_TEST_REPORT', user: 'SOMEONE' }, // edge −10 → in
      { date: '2026-11-13', time: '01:49:00', program: 'Z_TEST_REPORT' }, // out
      { date: '2026-11-13', time: '02:14:00', program: 'Z_OTHER' }, // edge +10 → in, not matched
      { date: '2026-11-13', time: '02:15:00', program: 'Z_TEST_REPORT' }, // out
    ];
    const d = dumpsInWindow(rows, f, ['Z_TEST_REPORT']);
    expect(d.map((x: { time: string; matched: boolean }) => [x.time, x.matched])).toEqual([['01:50:00', true], ['02:14:00', false]]);
    expect(d[0]).not.toHaveProperty('user');
  });

  it('flags a request only when it falls between the last good run and the failure', () => {
    const runs = jobRuns(RUNS);
    const f = failureOf(runs);
    const s = jobSuspects(['Z_TEST_REPORT'], jobCollect().transports.rows, jobCollect().objects.rows, f, lastOkBefore(runs, f));
    expect(s.map((x: { trkorr: string; betweenRuns: boolean }) => [x.trkorr, x.betweenRuns])).toEqual([['TSTK900001', true], ['TSTK900002', false]]);
    expect(objectNamesOf(['SAPLZ_TEST_FG'])).toContain('Z_TEST_FG');
  });

  it('sets the four signals; data / variant only when nothing else shows', () => {
    expect(jobFacts(jobCollect()).flags).toEqual({ codeChange: true, dump: true, system: true, dataOrVariant: false });
    const quiet = jobFacts(jobCollect({ others: { ok: true, rows: [] }, dumps: { ok: true, rows: [] }, transports: { ok: true, rows: [] }, objects: { ok: true, rows: [] } }));
    expect(quiet.flags).toEqual({ codeChange: false, dump: false, system: false, dataOrVariant: true });
    expect(minutesOf('20261113', '020400')! - minutesOf('20261113', '020000')!).toBe(4);
  });
});

const idoc = (doc: string, status: string, cre: string, partner = 'TESTPART', mestyp = 'ZTEST_MSG'): Row => ({ DOCNUM: doc.padStart(16, '0'), STATUS: status, MESTYP: mestyp, IDOCTP: 'ZTEST01', CIMTYP: '', DIRECT: '2', SNDPOR: 'TESTPORT', SNDPRT: 'LS', SNDPRN: partner, RCVPOR: '', RCVPRT: '', RCVPRN: '', CREDAT: cre, CRETIM: '100000', UPDDAT: cre, UPDTIM: '100500' });

describe('incident — IDoc facts', () => {
  it('reads the IDoc, its status text and the volume of its type and partner', () => {
    const vol = [...Array.from({ length: 6 }, (_, i) => idoc(String(100 + i), '51', '20261113')), idoc('200', '53', '20261112'), idoc('300', '51', '20261113', 'OTHERPART')];
    const f = idocFacts({ idoc: '101', idocs: { ok: true, rows: [idoc('101', '51', '20261113')] }, volume: { ok: true, rows: vol }, statusTexts: { ok: true, rows: [] } });
    expect(f.focus).toMatchObject({ docnum: '101', status: '51', statusText: 'Application document not posted', direction: 'in', partner: 'TESTPART', error: true });
    expect(f.volume).toMatchObject({ total: 7, sameStatus: 6, anyError: 6 });
    expect(f.flags).toEqual({ error: true, mass: true, single: false });
    expect(idocVolume([idoc('1', '51', '20261113')], f.focus).sameStatus).toBe(1);
  });
  it('without an IDoc number picks the newest IDoc in error of the message type', () => {
    const f = idocFacts({ mestyp: 'ZTEST_MSG', idocs: { ok: true, rows: [idoc('1', '53', '20261113'), idoc('2', '51', '20261112'), idoc('3', '51', '20261111')] }, volume: { ok: true, rows: [] } });
    expect(f.focus.docnum).toBe('2');
  });
  it('a table the dispatcher refuses is "not read", never empty', () => {
    const f = buildFacts({ kind: 'job', job: 'Z_TEST_JOB', runs: { ok: false, rows: [], error: 'TABLE_READ: table TBTCO is not allowed' }, steps: { ok: false, rows: [] } });
    expect(f.notRead.map((n: { section: string }) => n.section)).toEqual(['runs', 'steps']);
    expect(f.dispatcherClosed).toBe(true);
    expect(renderIncidentPage(f)).toContain('does not allow job / IDoc reads');
  });
  it('links interface specs whose IDoc message type matches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'if-'));
    try {
      mkdirSync(join(dir, 'IF_TEST_01'));
      writeFileSync(join(dir, 'IF_TEST_01', 'IF_TEST_01.json'), JSON.stringify({ ifId: 'IF_TEST_01', header: { name: 'Test inbound', idoc: { mestyp: 'ZTEST_MSG' } } }));
      mkdirSync(join(dir, 'IF_TEST_02'));
      writeFileSync(join(dir, 'IF_TEST_02', 'IF_TEST_02.json'), JSON.stringify({ ifId: 'IF_TEST_02', header: { name: 'Other' } }));
      expect(interfacesFor(dir, 'ZTEST_MSG').map((x: { ifId: string }) => x.ifId)).toEqual(['IF_TEST_01']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('incident — read scope', () => {
  it('field lists never name step users, job owners or IDoc status users', () => {
    const all = Object.values(FIELDS).flat() as string[];
    for (const bad of ['AUTHCKNAM', 'SDLUNAME', 'LASTCHNAME', 'RELUNAME', 'UNAME', 'STAPA1', 'USRKEY', 'AS4USER']) expect(all).not.toContain(bad);
    expect(fieldSql('TBTCP', FIELDS.TBTCP, "JOBNAME = 'X'")).toBe("SELECT JOBNAME, JOBCOUNT, STEPCOUNT, PROGNAME, VARIANT, XPGPROG, STATUS FROM TBTCP WHERE JOBNAME = 'X'");
  });

  it('collect (fake MCP) sends explicit field lists only and writes facts without user names', async () => {
    const sqls: string[] = [];
    const tables: Record<string, Row[]> = { TBTCP: STEPS, E071: [{ TRKORR: 'TSTK900001', OBJECT: 'PROG', OBJ_NAME: 'Z_TEST_REPORT' }], E070: [{ TRKORR: 'TSTK900001', STRKORR: '', TRFUNCTION: 'K', TRSTATUS: 'R', AS4DATE: '20261112' }], E07T: [{ TRKORR: 'TSTK900001', AS4TEXT: 'test change' }] };
    const client = {
      callTool: async ({ name, arguments: a }: { name: string; arguments: { sql_query?: string } }) => {
        if (name === 'RuntimeListDumps') return { content: [{ text: JSON.stringify({ dumps: [], paging: { reached: true } }) }] };
        const sql = a.sql_query || '';
        sqls.push(sql);
        const t = /FROM (\w+)/.exec(sql)![1];
        const rows = t === 'TBTCO' ? (/STATUS = 'A'/.test(sql) ? [] : RUNS) : tables[t] || [];
        return { content: [{ text: JSON.stringify({ rows }) }] };
      },
    };
    const dir = mkdtempSync(join(tmpdir(), 'incident-'));
    try {
      const r = await _collect({ job: 'Z_TEST_JOB', date: '2026-11-13', 'out-dir': dir }, { client });
      expect(r.failure).toBe('2026-11-13 02:04');
      expect(r.flags.codeChange).toBe(true);
      for (const s of sqls) { expect(s).not.toMatch(/SELECT \*/); expect(s).not.toMatch(/AUTHCKNAM|SDLUNAME|AS4USER/); }
      expect(sqls.some((s) => s.startsWith('SELECT JOBNAME, JOBCOUNT, STEPCOUNT, PROGNAME'))).toBe(true);
      const b = await _build({ in: join(dir, 'collect.json'), 'out-dir': dir, lang: 'ko' });
      expect(readdirSync(dir).some((f) => /^incident-job-Z_TEST_JOB-\d{8}-\d{4}-ko\.html$/.test(f))).toBe(true);
      const facts = JSON.parse(readFileSync(b.facts, 'utf8'));
      expect(facts.flags.codeChange).toBe(true);
      const html = readFileSync(b.html, 'utf8');
      expect(html).toContain('data-sc4sap-responsive');
      expect(html).toContain('잡 로그는 읽지 않아요');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('ops report — prefill marks for job / IDoc next steps', () => {
  it('marks job and IDoc issues with the analyze-symptom form values only', async () => {
    // @ts-expect-error — plain .mjs script, no type declarations
    const { buildModel, incidentNext } = await import('../../scripts/ops/ops-model.mjs');
    // @ts-expect-error — plain .mjs script, no type declarations
    const { renderHtml } = await import('../../scripts/ops/ops-page.mjs');
    expect(incidentNext('job', { job: 'Z_TEST_JOB', last: '2026-11-13 02:04' })).toEqual({ skill: 'analyze-symptom', fill: { 'Incident type': 'Background job', 'Job name': 'Z_TEST_JOB', 'Incident date': '2026-11-13' } });
    expect(incidentNext('idoc', { mestyp: 'ZTEST_MSG', partners: ['TESTPART'], last: '2026-11-13' }).fill).toEqual({ 'Incident type': 'IDoc', 'Message type': 'ZTEST_MSG', Partner: 'TESTPART', 'Incident date': '2026-11-13' });
    expect(incidentNext('idoc', { mestyp: 'ZTEST_MSG', partners: ['A', 'B'], last: '' }).fill).toEqual({ 'Incident type': 'IDoc', 'Message type': 'ZTEST_MSG' });
    const ok = (rows: unknown[]) => ({ ok: true, rows, prevRows: [] });
    const m = buildModel({
      system: 'TST', from: '2026-11-10', to: '2026-11-16', prevFrom: '2026-11-03', prevTo: '2026-11-09',
      dumps: ok([]), prevDumps: ok([]), transports: ok([]), objects: ok([]), updates: ok([]),
      jobs: ok([{ job: 'Z_TEST_JOB', program: 'Z_TEST_REPORT', endDate: '2026-11-13', endTime: '02:04' }]),
      idocs: ok([{ docnum: '1', status: '51', mestyp: 'ZTEST_MSG', direct: '2', partner: 'TESTPART', date: '2026-11-13' }]),
    });
    expect(m.next.find((n: { kind: string }) => n.kind === 'job').action).toBe('/sc4sap:analyze-symptom job Z_TEST_JOB (or SM37 → job log)');
    const html = renderHtml(m, 'en', { file: 'x' });
    const marks = [...html.matchAll(/data-sc4sap-next="([^"]*)"/g)].map((x) => JSON.parse(x[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')));
    expect(marks).toEqual([
      { skill: 'analyze-symptom', fill: { 'Incident type': 'Background job', 'Job name': 'Z_TEST_JOB', 'Incident date': '2026-11-13' } },
      { skill: 'analyze-symptom', fill: { 'Incident type': 'IDoc', 'Message type': 'ZTEST_MSG', Partner: 'TESTPART', 'Incident date': '2026-11-13' } },
    ]);
  });
});

describe('incident — not read is never "none found"', () => {
  const refused = { ok: false, rows: [], error: 'TABLE_READ: table TBTCO is not allowed' };
  const skip = { ok: null, skipped: true, rows: [] };
  it('job: runs refused → flags unknown, sections say not read / not checked', () => {
    const f = buildFacts({ kind: 'job', job: 'Z_TEST_JOB', lang: 'ko', runs: refused, steps: skip, others: skip, dumps: skip, transports: skip, objects: skip });
    expect(f.flags).toEqual({ codeChange: null, dump: null, system: null, dataOrVariant: null });
    expect(f.state).toEqual({ runs: 'notRead', steps: 'skipped', others: 'skipped', dumps: 'skipped', changes: 'skipped' });
    expect(f.skipped).toEqual(['steps', 'others', 'dumps', 'changes']);
    const html = renderIncidentPage(f);
    expect(html).toContain('읽지 못함');
    expect(html).toContain('확인 못 함');
    expect(html).not.toContain('<b>아니오</b>');
    expect(html).toContain('<b>알 수 없음</b>');
    expect(html).not.toContain('찾지 못함');
    expect(html).not.toMatch(/0 실행/);
  });
  it('job: one section refused makes only its signal unknown; no good run → code change unknown', () => {
    const f = jobFacts(jobCollect({ dumps: { ok: false, rows: [], error: 'feed failed' } }));
    expect(f.flags).toEqual({ codeChange: true, dump: null, system: true, dataOrVariant: false });
    const noGood = jobFacts(jobCollect({ runs: { ok: true, rows: RUNS.filter((r) => r.STATUS === 'A') }, others: { ok: true, rows: [] }, dumps: { ok: true, rows: [] } }));
    expect(noGood.flags).toEqual({ codeChange: null, dump: false, system: false, dataOrVariant: null });
  });
  it('IDoc: header refused → flags unknown and the page says not read, not "no IDoc found"', () => {
    const f = buildFacts({ kind: 'idoc', idoc: '101', lang: 'ko', idocs: { ok: false, rows: [], error: 'TABLE_READ: table EDIDC is not allowed' }, volume: skip, statusTexts: skip });
    expect(f.flags).toEqual({ error: null, mass: null, single: null });
    const html = renderIncidentPage(f);
    expect(html).toContain('읽지 못함');
    expect(html).not.toContain('입력에 맞는 오류 IDoc을 찾지 못했어요');
  });
});

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { buildModel, daysOf, groupDumps, groupIdocs, objectKeysOf, suspectsFor, verdictOf } from '../../scripts/ops/ops-model.mjs';
import { editsFromPage, renderHtml, renderSummary, summarySentences } from '../../scripts/ops/ops-page.mjs';
import { dumpsOf, readDumpRange } from '../../scripts/ops/build-ops-check.mjs';

const dump = (error: string, program: string, date: string, time: string, user = 'PERSON1', include = '') =>
  ({ id: `${date.replace(/-/g, '')}${time.replace(/:/g, '')}host_SID_00   ${user}   10001`, date, time, error, program, include, user });

const collect = () => ({
  system: 'DEV', sapVersion: 'ECC6', from: '2026-11-15', to: '2026-11-16', prevFrom: '2026-11-13', prevTo: '2026-11-14',
  dumps: {
    ok: true,
    rows: [
      ...Array.from({ length: 6 }, (_, i) => dump('MESSAGE_TYPE_X', 'ZSD_REPORT', '2026-11-16', `09:0${i}:00`, `PERSON${i}`)),
      dump('GETWA_NOT_ASSIGNED', 'SAPLZSD_FG', '2026-11-15', '10:00:00', 'PERSON1', 'LZSD_FGU01'),
      dump('MEMORY_NO_MORE_PAGING', 'SAPLSEUT', '2026-11-15', '11:00:00'),
    ],
  },
  prevDumps: { ok: true, rows: [dump('MEMORY_NO_MORE_PAGING', 'SAPLSEUT', '2026-11-13', '08:00:00')] },
  transports: {
    ok: true,
    rows: [
      { trkorr: 'DEVK900100', kind: 'workbench', status: 'released', date: '2026-11-15', text: '[SD] Change report' },
      { trkorr: 'DEVK900101', kind: 'workbench', status: 'released', date: '2026-11-14', text: '[SD] FG fix' },
      { trkorr: 'DEVK900200', kind: 'workbench', status: 'released', date: '2026-11-17', text: '[SD] Later fix' },
    ],
  },
  objects: {
    ok: true,
    rows: [
      { trkorr: 'DEVK900100', object: 'PROG', name: 'ZSD_REPORT' },
      { trkorr: 'DEVK900101', object: 'FUGR', name: 'ZSD_FG' },
      { trkorr: 'DEVK900200', object: 'PROG', name: 'ZSD_REPORT' },
    ],
  },
  jobs: { ok: false, rows: [], error: 'TABLE_READ: table TBTCO is not allowed' },
  updates: { ok: true, rows: [] },
  idocs: {
    ok: true,
    rows: [
      { docnum: '1', status: '51', mestyp: 'ORDERS', direct: '2', partner: 'CUST01', date: '2026-11-16' },
      { docnum: '2', status: '51', mestyp: 'ORDERS', direct: '2', partner: 'CUST02', date: '2026-11-16' },
      { docnum: '3', status: '53', mestyp: 'ORDERS', direct: '2', partner: 'CUST02', date: '2026-11-16' },
    ],
  },
});

describe('ops-health-check model', () => {
  it('maps a dumping program to the repository objects a transport names', () => {
    expect([...objectKeysOf('SAPLZSD_FG', 'LZSD_FGU01')]).toContain('FUGR:ZSD_FG');
    expect([...objectKeysOf('ZCL_SD_PRICE=================CP')]).toContain('CLAS:ZCL_SD_PRICE');
    expect([...objectKeysOf('ZSD_REPORT')]).toEqual(expect.arrayContaining(['PROG:ZSD_REPORT', 'REPS:ZSD_REPORT']));
    expect([...objectKeysOf('/ABC/SAPLFG1')]).not.toContain('FUGR:');
  });

  it('groups dumps, counts users without naming them, and marks new groups against the previous period', () => {
    const c = collect();
    const groups = groupDumps(c.dumps.rows, c.prevDumps.rows);
    const top = groups[0];
    expect(top).toMatchObject({ error: 'MESSAGE_TYPE_X', program: 'ZSD_REPORT', count: 6, users: 6, isNew: true, previous: 0 });
    expect(groups.find((g) => g.error === 'MEMORY_NO_MORE_PAGING')).toMatchObject({ isNew: false, previous: 1 });
    expect(JSON.stringify(groups)).not.toMatch(/PERSON\d/);
  });

  it('links a dump group only to requests dated on or before its last dump', () => {
    const c = collect();
    const [top] = groupDumps(c.dumps.rows, []);
    const hits = suspectsFor(top, c.transports.rows, c.objects.rows);
    expect(hits.map((h) => h.trkorr)).toEqual(['DEVK900100']);
    const fg = groupDumps(c.dumps.rows, []).find((g) => g.program === 'SAPLZSD_FG')!;
    expect(suspectsFor(fg, c.transports.rows, c.objects.rows).map((h) => h.trkorr)).toEqual(['DEVK900101']);
  });

  it('keeps only IDocs in an error status, grouped by message type, status and direction', () => {
    const groups = groupIdocs(collect().idocs.rows);
    expect(groups).toEqual([expect.objectContaining({ mestyp: 'ORDERS', status: '51', direction: 'in', count: 2 })]);
  });

  it('turns red for a dump group with a matching request, and says what was not readable', () => {
    const m = buildModel(collect());
    expect(m.verdict).toBe('red');
    expect(m.jobs.ok).toBe(false);
    expect(m.next.some((n: { action: string }) => n.action === 'SM37')).toBe(true);
    expect(m.next[0].action).toMatch(/^\/sc4sap:analyze-symptom MESSAGE_TYPE_X in ZSD_REPORT at 2026-11-16/);
  });

  it('is amber when nothing is found but a section could not be read, green when everything was read', () => {
    const empty = { ...collect(), dumps: { ok: true, rows: [] }, idocs: { ok: true, rows: [] } };
    expect(buildModel(empty).verdict).toBe('amber');
    expect(buildModel({ ...empty, jobs: { ok: true, rows: [] } }).verdict).toBe('green');
    expect(verdictOf(buildModel({ ...empty, jobs: { ok: true, rows: [] }, updates: { ok: true, rows: [{ tcode: 'VA01', report: 'SAPMV45A', date: '2026-11-16' }] } }))).toBe('red');
  });
});

describe('ops-health-check report model', () => {
  it('counts dumps per day over both periods, with zero days', () => {
    const m = buildModel(collect());
    expect(daysOf('2026-11-15', '2026-11-16')).toEqual(['2026-11-15', '2026-11-16']);
    expect(m.dumps.byDay).toEqual([{ date: '2026-11-15', count: 2 }, { date: '2026-11-16', count: 6 }]);
    expect(m.dumps.prevByDay).toEqual([{ date: '2026-11-13', count: 1 }, { date: '2026-11-14', count: 0 }]);
    expect(buildModel({ ...collect(), prevDumps: { ok: false, rows: [], error: 'x' } }).dumps.prevByDay).toBeNull();
  });

  it('builds KPI tiles with the change, and no change for a figure whose previous period was not read', () => {
    const c = collect();
    const m = buildModel({ ...c, idocs: { ...c.idocs, prevRows: [{ docnum: '9', status: '51', mestyp: 'ORDERS', direct: '2', date: '2026-11-13' }] } });
    const k = Object.fromEntries(m.kpis.map((x: { key: string }) => [x.key, x]));
    expect(k.dumps).toMatchObject({ value: 8, previous: 1, delta: 7 });
    expect(k.dumpGroups).toMatchObject({ value: 3, previous: 1, delta: 2 });
    expect(k.newGroups).toMatchObject({ value: 2, delta: null });
    expect(k.jobs).toMatchObject({ ok: false, value: null });
    expect(k.updates).toMatchObject({ value: 0, previous: null, delta: null });
    expect(k.idocs).toMatchObject({ value: 2, previous: 1, delta: 1 });
  });

  it('lists issues most severe first, with the worst area and the unread areas', () => {
    const m = buildModel(collect());
    expect(m.issues[0]).toMatchObject({ area: 'dumps', kind: 'dumpChanged', severity: 'high', trkorr: ['DEVK900100'] });
    expect(m.issues.some((i: { kind: string; section?: string }) => i.kind === 'unread' && i.section === 'jobs')).toBe(true);
    expect(m.issues.some((i: { kind: string }) => i.kind === 'idoc')).toBe(true);
    expect(m.worst).toBe('dumps');
    expect(JSON.stringify(m)).not.toMatch(/PERSON\d|host_SID/);
  });
});

describe('ops-health-check page', () => {
  it('renders the sections, the unreadable fallback and no user names, in ko and en', () => {
    const m = buildModel(collect());
    const ko = renderHtml(m, 'ko');
    expect(ko).toContain('운영 보고서');
    expect(ko).toContain('DEVK900100');
    expect(ko).toContain('SM37');
    expect(ko).toContain('prefers-color-scheme:dark');
    expect(ko).not.toMatch(/PERSON\d/);
    expect(renderSummary(m, 'en')).toMatch(/^Operations report · DEV · 2026-11-15 – 2026-11-16 · Action required/);
  });

  it('is a report: cover, sections 1–7, KPI tiles, trend chart, editable cells, theme button, scripts that parse', () => {
    const c = collect();
    const m = buildModel({ ...c, updates: { ok: true, rows: [], prevRows: [{ tcode: 'VA01', report: 'SAPMV45A', date: '2026-11-13' }] } });
    for (const lang of ['ko', 'en', 'ja']) {
      const html = renderHtml(m, lang);
      for (const id of ['s1', 's2', 's3', 's4', 's5', 's6', 's7']) expect(html).toContain(`<section id="${id}">`);
      expect(html).toContain('id="theme-btn"');
      expect(html).toContain('<svg viewBox');
      expect(html.match(/class="kpi[ "]/g)).toHaveLength(6);
      for (const k of ['author', 'owner-1', 'due-1', 'comments']) expect(html).toContain(`data-e="${k}"`);
      expect(html).toContain('<script type="application/json" id="ops-model">');
      expect(editsFromPage(html)).toEqual({});
      for (const s of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(s[1])).not.toThrow();
      expect(html).not.toMatch(/PERSON\d/);
      expect(html).not.toContain('host_SID');
      expect(html).toContain('@page{size:A4');
    }
    const ko = renderHtml(m, 'ko');
    expect(ko).toContain('운영 보고서');
    expect(ko).toContain('이슈 및 조치 사항');
    // Unread jobs → section 6 names the T-code.
    expect(ko).toMatch(/<section id="s6">[\s\S]*SM37[\s\S]*<\/section>/);
    expect(renderHtml(m, 'ja')).toContain('運用レポート');
  });

  it('writes 3–5 summary sentences with the change against the previous period', () => {
    const m = buildModel(collect());
    const ko = summarySentences(m, 'ko');
    expect(ko.length).toBeGreaterThanOrEqual(3);
    expect(ko.length).toBeLessThanOrEqual(5);
    expect(ko[0]).toContain('조치 필요');
    expect(ko[1]).toContain('이전 기간 1건 대비 7건 증가');
    const en = summarySentences(m, 'en');
    expect(en.join(' ')).toContain('aborted jobs not read');
    expect(en.join(' ')).toMatch(/most attention is short dumps/);
  });

  it('escapes SAP texts', () => {
    const c = collect();
    c.transports.rows[0].text = '<script>x</script>';
    c.transports.rows[0].date = '2026-11-16';
    expect(renderHtml(buildModel(c), 'en')).not.toContain('<script>x');
  });
});

describe('ops-health-check collect parsing', () => {
  it('merges the ST22 list and the ADT feed once, with local time from the dump key', () => {
    const key = '20261116105611host_SID_10                 USER01    30023';
    const rows = dumpsOf({
      st22: { dumps: [{ dump_id: key, date: '2026-11-16', time: '10:56:11', runtime_error: 'CALL_FUNCTION_NOT_REMOTE', program: 'SAPLSIFP', include: 'LSIFPU01', user: 'USER01' }] },
      payload: {
        'atom:feed': {
          'atom:entry': [
            {
              'atom:id': `/sap/bc/adt/vit/runtime/dumps/${encodeURIComponent(key)}`,
              'atom:category': [{ term: 'CALL_FUNCTION_NOT_REMOTE', label: 'ABAP runtime error' }, { term: 'SAPLSIFP', label: 'Terminated ABAP program' }],
              'atom:published': '2026-11-16T01:56:11Z', 'atom:author': { 'atom:name': 'USER01' },
            },
            {
              'atom:id': `/sap/bc/adt/vit/runtime/dumps/${encodeURIComponent('20261116111500host_SID_10   USER02   30001')}`,
              'atom:category': [{ term: 'DBSQL_DUPLICATE_KEY_ERROR', label: 'ABAP runtime error' }, { term: 'ZMM_POST', label: 'Terminated ABAP program' }],
              'atom:published': '2026-11-16T02:15:00Z', 'atom:author': { 'atom:name': 'USER02' },
            },
          ],
        },
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ date: '2026-11-16', time: '11:15:00', error: 'DBSQL_DUPLICATE_KEY_ERROR', program: 'ZMM_POST' });
  });

  it('builds the files offline from collect.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ops-'));
    try {
      writeFileSync(join(dir, 'collect.json'), JSON.stringify(collect()));
      const out = execFileSync(process.execPath, [join(__dirname, '..', '..', 'scripts', 'ops', 'build-ops-check.mjs'), 'build', '--in', join(dir, 'collect.json'), '--out-dir', dir, '--lang', 'en'], { encoding: 'utf8' });
      const result = JSON.parse(out);
      expect(result).toMatchObject({ ok: true, verdict: 'red' });
      expect(readFileSync(join(dir, 'ops-report-2026-11-16-en.html'), 'utf8')).toContain('<!doctype html>');
      expect(readFileSync(join(dir, 'ops-report-2026-11-16-en.md'), 'utf8')).toContain('Short dumps (ST22): 8');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('ops-health-check unreadable reasons', () => {
  it('says the release limit in plain words instead of the raw MCP error', () => {
    const c = collect();
    c.jobs.error = 'MCP error -32603: ADT error: Error: ZMCP_ADT_DISPATCH error (action=TABLE_READ, subrc=4): TABLE_READ: table TBTCO is not allowed — table reads on this SAP release (BASIS < 7.50) go through ZMCP_ADT_DISPATCH TABLE_READ';
    const html = renderHtml(buildModel(c), 'ko');
    expect(html).toContain('BASIS 7.50 미만');
    expect(html).not.toContain('MCP error -32603');
  });
});

describe('ops-health-check dump range', () => {
  const entry = (key: string, error: string) => ({
    'atom:id': `/sap/bc/adt/runtime/dumps/${encodeURIComponent(key)}`,
    'atom:category': [{ term: error, label: 'ABAP runtime error' }, { term: 'ZPROG', label: 'Terminated ABAP program' }],
    'atom:published': '2026-11-16T00:00:00Z',
  });
  const day = (d: string, n: number) => `${d.replace(/-/g, '')}0900${String(n).padStart(2, '0')}host_SID_00   PERSON1   10001`;
  const client = (json: unknown) => ({ callTool: async () => ({ content: [{ text: JSON.stringify(json) }] }) });
  const feed = (entries: unknown[], paging?: unknown) => ({ payload: { 'atom:feed': { 'atom:entry': entries } }, ...(paging ? { paging } : {}) });

  it('takes the period from a feed the server paged back, and trusts paging.complete', async () => {
    const r = await readDumpRange(client(feed([entry(day('2026-11-16', 1), 'TIME_OUT'), entry(day('2026-11-12', 2), 'TIME_OUT'), entry(day('2026-11-08', 3), 'OLD')], { pages: 3, complete: true, reached: true })), '2026-11-10', '2026-11-16');
    expect(r).toMatchObject({ ok: true, complete: true });
    expect(r.rows.map((d: { date: string }) => d.date)).toEqual(['2026-11-16', '2026-11-12']);
  });

  it('is incomplete when the server did not reach date_from, and the model then calls nothing new', async () => {
    const r = await readDumpRange(client(feed([entry(day('2026-11-16', 1), 'TIME_OUT')], { pages: 20, complete: false, reached: false })), '2026-11-01', '2026-11-16');
    expect(r.complete).toBe(false);
    // An older server without paging: complete only when the page already reaches past the start.
    expect((await readDumpRange(client(feed([entry(day('2026-11-16', 1), 'TIME_OUT')])), '2026-11-10', '2026-11-16')).complete).toBe(false);
    const m = buildModel({ ...collect(), prevDumps: { ok: false, rows: [], error: 'not reached' } });
    expect(m.dumps.groups.every((g: { isNew: boolean | null }) => g.isNew === null)).toBe(true);
    expect(renderSummary(m, 'en')).toContain('no comparison');
  });
});

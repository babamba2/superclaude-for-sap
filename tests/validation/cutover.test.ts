import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { seedCutover, criticalPath, rehearsalFit, goNoGoView, importList, tMinus, parseActuals, applyActuals, checkCutover, cutDueOf, cutEvalRule, CUT_WARN } from '../../scripts/project/cutover-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { cmdCutover, parseWindow, ctsRequests, prdStop, loadCutoverTemplate } from '../../scripts/project/cutover-cli.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { readJobs, JOBS_WHERE } from '../../scripts/project/cutover-jobs.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderCutoverTab } from '../../scripts/project/cutover-tab.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { instantiate } from '../../scripts/project/project-template.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { viewModel, normalizeModel } from '../../scripts/project/project-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { labelsFor } from '../../scripts/project/project-render.mjs';

const ROOT = resolve(__dirname, '../..');
const TPL = loadCutoverTemplate();
type Task = { id: string; phase: string; deps: string[]; durationH?: number; offset?: number; status: string; actual?: Record<string, { start: string; end: string }> };
const TEAM = [{ id: 'PM1', name: 'PM', role: 'pm' }, { id: 'MM1', name: 'MM con', role: 'module', module: 'MM' }];
const project = (type = 'implementation', lang = 'ko') => instantiate({ code: 'P2X', name: 'Cutover test', type, start: '2026-06-01', goLive: '2027-01-04', modules: ['MM'], team: TEAM, lang });
const seeded = (type = 'implementation') => seedCutover(project(type), TPL).model;
const win = (id: string, durationH: number, deps: string[] = [], extra = {}) => ({ id, phase: 'window', durationH, deps, status: 'planned', ...extra });

describe('cutover — seed', () => {
  it('is idempotent and computes dates from go-live', () => {
    const a = seedCutover(project(), TPL);
    const b = seedCutover(a.model, TPL);
    expect(a.added.length).toBeGreaterThan(30);
    expect(b.added).toEqual([]);
    expect(b.model.cutover.tasks.length).toBe(a.model.cutover.tasks.length);
    const c = a.model.cutover;
    expect(c.window).toEqual({ start: '2027-01-02T18:00', end: '2027-01-04T06:00' });
    expect(c.freeze).toEqual({ code: '2026-12-21', config: '2026-12-25' });
    const pre01 = c.tasks.find((t: Task) => t.id === 'CT.PRE.01');
    expect(cutDueOf(pre01, c, '2027-01-04')).toBe('2026-12-05'); // D-30
    expect(cutDueOf(c.tasks.find((t: Task) => t.id === 'CT.FRZ.02'), c, '2027-01-04')).toBe('2026-12-25'); // anchored on the config freeze
    expect(cutDueOf(c.tasks.find((t: Task) => t.id === 'CT.PST.05'), c, '2027-01-04')).toBe('2027-02-03'); // D+30
  });
  it('keeps a task people changed and the ids people added', () => {
    const m = seeded();
    m.cutover.tasks.find((t: Task) => t.id === 'CT.WIN.05').durationH = 9;
    m.cutover.tasks.push(win('CT.N1', 2, ['CT.WIN.05']));
    const again = seedCutover(m, TPL).model.cutover;
    expect(again.tasks.find((t: Task) => t.id === 'CT.WIN.05').durationH).toBe(9);
    expect(again.tasks.some((t: Task) => t.id === 'CT.N1')).toBe(true);
  });
  it('conversion: skips the loads, adds the technical conversion, longer window; skipped deps pass theirs on', () => {
    const c = seeded('conversion').cutover;
    const ids = c.tasks.map((t: Task) => t.id);
    for (const s of ['CT.WIN.07', 'CT.WIN.08', 'CT.WIN.09', 'CT.WIN.07A', 'CT.PRE.05', 'CT.PRE.09']) expect(ids).not.toContain(s);
    expect(ids).toEqual(expect.arrayContaining(['CT.CNV.01', 'CT.CNV.02', 'CT.CNV.03', 'CT.CNV.04']));
    expect(c.tasks.find((t: Task) => t.id === 'CT.WIN.05').deps).toEqual(['CT.CNV.03']);
    expect(c.window.start).toBe('2027-01-01T18:00');
    const small = seedCutover(project('ams'), TPL).model.cutover;
    expect(small.tasks.find((t: Task) => t.id === 'CT.WIN.12').deps).toEqual(['CT.WIN.06']); // WIN.11 → loads → WIN.06 / WIN.10, both resolved
  });
  it('no window task starts before a prerequisite ends (every project type)', () => {
    for (const type of ['implementation', 'conversion', 'rollout', 'ams', 'task']) {
      const c = seeded(type).cutover;
      const { schedule } = criticalPath(c.tasks);
      for (const t of c.tasks.filter((x: Task) => x.phase === 'window')) for (const d of t.deps) {
        if (schedule[d]) expect(schedule[t.id].es, `${type} ${t.id} after ${d}`).toBeGreaterThanOrEqual(schedule[d].ef);
      }
      expect(checkCutover(c, TEAM).errors).toEqual([]);
    }
  });
  it('the template holds no customer, system or Z object names', () => {
    const text = readFileSync(join(ROOT, 'scripts/project/cutover-tasks.json'), 'utf8');
    expect(text).not.toMatch(/\b[ZY][A-Z0-9_]{3,}\b/);
    expect(text).not.toMatch(/HKT|BXD|ES-DEV|S4-DEV|HKD|PRD\d/);
    expect(text).not.toMatch(/작업 창/); // the reviewed wording is 작업 시간대
  });
});

describe('cutover — critical path and window fit', () => {
  it('takes the longest of parallel paths', () => {
    const r = criticalPath([win('A', 1), win('B', 5, ['A']), win('C', 2, ['A']), win('D', 1, ['B', 'C'])]);
    expect(r.totalH).toBe(7);
    expect(r.path).toEqual(['A', 'B', 'D']);
    expect(r.schedule.D).toMatchObject({ es: 6, ef: 7 });
  });
  it('a loop is an error; an empty window is zero', () => {
    expect(() => criticalPath([win('A', 1, ['B']), win('B', 1, ['A'])])).toThrow(/loop/);
    expect(criticalPath([{ id: 'P', phase: 'pre', status: 'planned' }])).toMatchObject({ totalH: 0, path: [] });
    expect(checkCutover({ tasks: [win('A', 1, ['B']), win('B', 1, ['A'])] }).errors.join(' ')).toMatch(/loop/);
  });
  const fitOf = (durations: number[], rehearsal?: number[]) => {
    const tasks = durations.map((d, i) => win(`T${i}`, d, i ? [`T${i - 1}`] : [], rehearsal && rehearsal[i] != null ? { actual: { R1: { start: '2027-01-02T00:00', end: `2027-01-02T${String(rehearsal[i]).padStart(2, '0')}:00` } } } : {}));
    return rehearsalFit({ window: { start: '2027-01-02T00:00', end: '2027-01-02T10:00' }, rehearsals: [{ id: 'R1' }], tasks });
  };
  it('fits / tight / exceeds at the boundaries (window 10 h, tight below 10 % spare)', () => {
    expect(fitOf([9]).verdict).toBe('fits');       // 10 % spare
    expect(fitOf([9.5]).verdict).toBe('tight');    // 5 %
    expect(fitOf([10]).verdict).toBe('tight');     // 0 %
    expect(fitOf([10.5]).verdict).toBe('exceeds');
  });
  it('uses rehearsal actuals and marks the tasks without one as estimated', () => {
    const f = fitOf([4, 4], [6]);
    expect(f.basis).toBe('rehearsal');
    expect(f.rehearsal).toMatchObject({ id: 'R1', totalH: 10, estimated: ['T1'], measured: 1 });
    expect(f.plan.totalH).toBe(8);
    expect(f.verdict).toBe('tight');
  });
  it('reads rehearsal actuals from CSV or JSON', () => {
    const csv = parseActuals('task id,start,end\nCT.WIN.01,2027-01-02 18:00,2027-01-02 18:40\nBAD,2027-01-02 19:00,2027-01-02 18:00\n');
    expect(csv.rows).toEqual([{ id: 'CT.WIN.01', start: '2027-01-02T18:00', end: '2027-01-02T18:40' }]);
    expect(csv.errors).toHaveLength(1);
    expect(parseActuals('[{"id":"A","start":"2027-01-02T18:00","end":"2027-01-02T19:00"}]').rows).toHaveLength(1);
    const r = applyActuals({ tasks: [win('A', 1)], rehearsals: [] }, 'R2', [{ id: 'A', start: '2027-01-02T18:00', end: '2027-01-02T19:30' }, { id: 'X', start: '2027-01-02T18:00', end: '2027-01-02T19:00' }]);
    expect(r.applied).toBe(1);
    expect(r.unknown).toEqual(['X']);
    expect(r.cutover.rehearsals).toEqual([{ id: 'R2', date: '2027-01-02', note: '' }]);
  });
});

describe('cutover — go / no-go', () => {
  const c = { tasks: [{ id: 'P1', phase: 'pre', status: 'planned', offset: -10 }, { id: 'P2', phase: 'pre', status: 'done', offset: -10 }],
    goNoGo: [{ id: 'G1', text: 'Pre done [tasks-open:pre<=0]', status: 'open' }, { id: 'G2', text: 'Jobs stopped [jobs-released<=0]', status: 'open' },
      { id: 'G3', text: 'Fallback agreed', status: 'open' }, { id: 'G4', text: 'Rehearsal fits [rehearsal-fit>=0]', status: 'open' }] };
  const ctx = { cutover: c, fit: { rehearsal: { id: 'R1', slackPct: 12 } }, jobs: { ok: true, rows: [{ status: 'released' }, { status: 'scheduled' }] } };
  it('rule met / not met / manual; no-go suggested while a rule fails', () => {
    const g = goNoGoView(c, [], ctx);
    expect(g.items.map((x: { met: boolean | null }) => x.met)).toEqual([false, false, null, true]);
    expect(g.items[1].value).toBe(1); // released jobs only
    expect(g.suggest).toBe('nogo');
  });
  it('the human status wins; waived counts as settled', () => {
    const c2 = { ...c, goNoGo: c.goNoGo.map((x) => ({ ...x, status: x.id === 'G1' ? 'waived' : x.id === 'G2' ? 'go' : x.id === 'G3' ? 'go' : 'open' })) };
    const g = goNoGoView(c2, [], ctx);
    expect(g.items.map((x: { status: string }) => x.status)).toEqual(['waived', 'go', 'go', 'go']);
    expect(g.suggest).toBe('go');
    const c3 = { ...c, goNoGo: [{ id: 'G3', text: 'Fallback agreed', status: 'open' }] };
    expect(goNoGoView(c3, [], ctx).suggest).toBe('conditional');
  });
  it('jobs not read → no evidence, never zero', () => {
    const r = cutEvalRule('Jobs stopped [jobs-released<=0]', { cutover: c, jobs: { ok: false, rows: [] } });
    expect(r).toMatchObject({ value: null, met: null });
    expect(r.source).toMatch(/no evidence/);
  });
  it('a gateCheck result for P1 rules is taken as is', () => {
    const g = goNoGoView({ goNoGo: [{ id: 'G1', text: 'CTS [cts-blocked<=0]', status: 'open' }] }, [{ text: 'CTS', rule: 'cts-blocked<=0', value: 2, met: false, source: 'cts' }], ctx);
    expect(g.items[0]).toMatchObject({ met: false, source: 'cts', status: 'nogo' });
  });
});

describe('cutover — import list, T-minus', () => {
  it('lists requests in release order and always carries the warning', () => {
    const r = importList([{ trkorr: 'DEVK900003', status: 'released', date: '2026-12-10' }, { trkorr: 'DEVK900001', status: 'released', date: '2026-12-01' }, { trkorr: 'DEVK900009', status: 'open', date: '2026-12-20' }],
      [{ requests: [{ trkorr: 'DEVK900003', verdict: 'blocked', findings: [{ kind: 'dependency' }] }, { trkorr: 'DEVK900777', verdict: 'ready' }] }], 'ko');
    expect(r.rows.map((x: { trkorr: string }) => x.trkorr)).toEqual(['DEVK900001', 'DEVK900003', 'DEVK900009', 'DEVK900777']);
    expect(r.rows[1]).toMatchObject({ verdict: 'blocked', findings: ['dependency'] });
    expect(r.warning).toBe(CUT_WARN.ko);
    expect(importList([], [], 'en').warning).toBe(CUT_WARN.en);
  });
  it('counts D-day and the late tasks', () => {
    const c = seeded().cutover;
    const t = tMinus('2026-12-20', c, '2027-01-04');
    expect(t.dDay).toBe(15);
    expect(t.late.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining(['CT.PRE.01', 'CT.PRE.02']));
    expect(t.late.every((x: { due: string }) => x.due < '2026-12-20')).toBe(true);
  });
});

describe('cutover — jobs read (TBTCO / TBTCP only)', () => {
  it('reads released and scheduled jobs with their first program', async () => {
    const calls: { table: string; where: string }[] = [];
    const readTable = async (_c: unknown, table: string, o: { where: string }) => {
      calls.push({ table, where: o.where });
      if (table === 'TBTCO') return { ok: true, rows: [{ JOBNAME: 'ZPT_NIGHT', JOBCOUNT: '001', STATUS: 'S', SDLSTRTDT: '20270103', SDLSTRTTM: '010000', PERIODIC: 'X', PRDDAYS: '1' }, { JOBNAME: 'ZPT_ONCE', JOBCOUNT: '002', STATUS: 'P', SDLSTRTDT: '2027-01-05', SDLSTRTTM: '08:30:00' }] };
      return { ok: true, rows: [{ JOBNAME: 'ZPT_NIGHT', JOBCOUNT: '001', PROGNAME: 'ZPT_PROG' }] };
    };
    const readIn = async (_c: unknown, table: string, field: string, values: string[]) => {
      calls.push({ table, where: `${field} IN ${values.join(',')}` });
      return { ok: true, rows: [{ JOBNAME: 'ZPT_NIGHT', JOBCOUNT: '001', STEPCOUNT: '2', PROGNAME: 'ZPT_SECOND' }, { JOBNAME: 'ZPT_NIGHT', JOBCOUNT: '001', STEPCOUNT: '1', PROGNAME: 'ZPT_PROG' }], errors: [] };
    };
    const r = await readJobs({}, { readTable, readIn });
    expect(calls.map((x) => x.table)).toEqual(['TBTCO', 'TBTCP']);
    expect(calls[1].where).toBe('JOBCOUNT IN 001,002'); // by job count, the first step kept
    expect(calls[0].where).toBe(JOBS_WHERE);
    expect(JOBS_WHERE).toBe("STATUS IN ('S', 'P')");
    expect(r.rows).toEqual([
      { job: 'ZPT_NIGHT', count: '001', status: 'released', next: '2027-01-03 01:00', event: '', program: 'ZPT_PROG', period: '1d' },
      { job: 'ZPT_ONCE', count: '002', status: 'scheduled', next: '2027-01-05 08:30', event: '', program: '', period: '' },
    ]);
    expect(r.released).toBe(1);
    expect(r.stepsRead).toBe(true);
  });
  it('a failed read is "not read", and PRD needs a confirmation', async () => {
    const r = await readJobs({}, { readTable: async () => ({ ok: false, error: 'TBTCO not allowed' }), readIn: async () => ({ ok: true, rows: [] }) });
    expect(r).toMatchObject({ ok: false, rows: [], error: 'TBTCO not allowed' });
    expect(prdStop({ tier: 'PRD', confirmed: false })).toMatch(/--confirm-prd/);
    expect(prdStop({ tier: 'PRD', confirmed: true })).toBe('');
    expect(prdStop({ tier: 'DEV', confirmed: false })).toBe('');
  });
  it('no SAP write tool or other table appears in the cutover code', () => {
    for (const f of ['cutover-jobs.mjs', 'cutover-cli.mjs', 'cutover-model.mjs']) {
      const src = readFileSync(join(ROOT, 'scripts/project', f), 'utf8');
      expect(src).not.toMatch(/\b(Create|Update|Delete|Activate|Execute)[A-Z]\w+/);
      expect([...src.matchAll(/read(?:Table|In)\([^,]+,\s*'([A-Z0-9_]+)'/g)].map((m) => m[1]).every((t) => ['TBTCO', 'TBTCP'].includes(t))).toBe(true);
    }
  });
});

describe('cutover command (offline, fake project)', () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'cut-'));
    const m = project();
    m.actuals = { transports: [{ trkorr: 'DEVK900001', side: 'F', status: 'released', date: '2026-12-01', text: '[MM] cfg', ws: 'MM' }] };
    mkdirSync(join(root, 'P2X'), { recursive: true });
    writeFileSync(join(root, 'P2X', 'P2X-project.json'), JSON.stringify(m));
    return root;
  };
  it('seeds, applies a rehearsal, evaluates and writes the page; jobs read is kept in the model', async () => {
    const root = setup();
    try {
      const act = join(root, 'r1.csv');
      writeFileSync(act, 'task id,start,end\nCT.WIN.07,2027-01-03 01:00,2027-01-03 10:00\n');
      const cts = join(root, 'cts.json');
      writeFileSync(cts, JSON.stringify({ summary: { total: 1, blocked: 1 }, requests: [{ trkorr: 'DEVK900001', verdict: 'blocked', findings: [] }] }));
      const r = await cmdCutover({ code: 'P2X', root, rehearsal: 'R1', actuals: act, evidence: [cts], jobs: true, tier: 'DEV', today: '2026-12-20', lang: 'ko',
        readJobsFn: async () => ({ ok: true, rows: [{ job: 'ZPT_NIGHT', status: 'released', next: '', program: 'ZPT_PROG', period: '1d' }] }) });
      expect(r).toMatchObject({ dDay: 15, suggest: 'nogo', fit: 'fits', windowH: 36, criticalH: 29.5, jobs: { ok: true, n: 1, released: 1 }, seeded: { type: 'implementation' }, applied: { rows: 1 } });
      const html = readFileSync(r.html, 'utf8');
      expect(html).toContain(CUT_WARN.ko);
      expect(html).toContain('ZPT_NIGHT');
      expect(html).toContain('m-scroll'); // responsive layer
      const model = JSON.parse(readFileSync(join(root, 'P2X', 'P2X-project.json'), 'utf8'));
      expect(model.cutover.jobsRead).toMatchObject({ ok: true });
      expect(model.cutover.tasks.find((t: Task) => t.id === 'CT.WIN.07').actual.R1).toEqual({ start: '2027-01-03T01:00', end: '2027-01-03T10:00' });
      // a second run: idempotent seed, jobs not asked → the last read is shown
      const r2 = await cmdCutover({ code: 'P2X', root, seed: true, today: '2026-12-21' });
      expect(r2.seeded.tasks).toBe(0);
      expect(r2.jobs).toMatchObject({ ok: true, n: 1 });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('a failed jobs read shows "not read"; PRD without confirmation stops before reading', async () => {
    const root = setup();
    try {
      let called = false;
      await expect(cmdCutover({ code: 'P2X', root, jobs: true, tier: 'PRD', readJobsFn: async () => { called = true; return { ok: true, rows: [] }; } })).rejects.toThrow(/PRD/);
      expect(called).toBe(false);
      const r = await cmdCutover({ code: 'P2X', root, jobs: true, tier: 'DEV', today: '2026-12-20', readJobsFn: async () => ({ ok: false, rows: [], error: 'not allowed' }) });
      expect(r.jobs).toMatchObject({ ok: false, n: 0 });
      expect(readFileSync(r.html, 'utf8')).toContain('SM37');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('a dashboard without a cutover still builds; window / CTS helpers', async () => {
    expect(parseWindow('2027-01-02 18:00/2027-01-04T06:00')).toEqual({ start: '2027-01-02T18:00', end: '2027-01-04T06:00' });
    expect(() => parseWindow('2027-01-04T06:00/2027-01-02T18:00')).toThrow();
    expect(ctsRequests('<script type="application/json" id="tr-summary">{"requests":[{"trkorr":"DEVK1","verdict":"ready"}]}</script>')).toEqual({ requests: [{ trkorr: 'DEVK1', verdict: 'ready' }] });
    expect(ctsRequests('<p>nothing</p>')).toBeNull();
    const v = viewModel(normalizeModel(project()), '2026-12-20');
    expect(renderCutoverTab(v, { ...labelsFor('ko') })).toMatch(/cutover --seed/);
    expect(existsSync(join(ROOT, 'scripts/project/cutover-tab.mjs'))).toBe(true);
  });
});

describe('cutover tab (inlined into the dashboard page)', () => {
  it('the inlined files parse together with the page code (no name clashes)', () => {
    const inline = (f: string) => readFileSync(join(ROOT, 'scripts/project', f), 'utf8').replace(/^import .*$/gm, '').replace(/^export (const|function|let|async function)/gm, '$1');
    const src = ['project-model.mjs', 'cutover-model.mjs', 'cutover-tab.mjs', 'project-render.mjs'].map(inline).join('\n');
    expect(() => new Function(`${src}\nreturn typeof renderCutoverTab;`)).not.toThrow();
    expect(new Function(`${src}\nreturn typeof renderCutoverTab;`)()).toBe('function');
  });
  it('the dashboard page has the Cutover tab and its client script parses', async () => {
    // @ts-expect-error — plain .mjs script, no type declarations
    const { renderPage } = await import('../../scripts/project/project-page.mjs');
    const html = renderPage(normalizeModel(seeded()), { version: '1.0', date: '2026-12-20', today: '2026-12-20' });
    expect(html).toContain('id="tab-cut"');
    expect(html).toContain('id="add-ct"');
    expect(html).toContain('data-t="cut"');
    expect(html).toContain('data-f="c|CT.WIN.01|label"');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    for (const s of scripts) expect(() => new Function(s)).not.toThrow();
    const plain = renderPage(normalizeModel(project()), { version: '1.0', date: '2026-12-20', today: '2026-12-20' });
    expect(plain).toContain('cutover --seed'); // a dashboard without a runbook still builds, the tab says how to start
  });
  it('renders editable cells for tasks, go / no-go items, window and freeze', () => {
    const m = normalizeModel(seeded());
    const v = viewModel(m, '2026-12-20');
    const L = { ...labelsFor('ko') };
    const html = renderCutoverTab(v, L);
    expect(html).toContain('data-f="c|CT.WIN.05|durationH" data-k="num"');
    expect(html).toContain('data-f="g|GN.01|status" data-k="enum:gngStatus"');
    expect(html).toContain('data-f="cw|window|start"');
    expect(html).toContain('data-f="cf|freeze|code" data-k="date"');
    expect(L.cutStatus).toMatchObject({ planned: '예정', done: '완료' });
  });
});

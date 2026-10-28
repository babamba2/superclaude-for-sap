import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { checkModel, viewModel, reassign, kpiRag, withSnapshot, STAGE_PCT } from '../../scripts/project/project-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { instantiate, addWricef } from '../../scripts/project/project-template.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { mapTransports, throughput, wricefEvidence, weekOf } from '../../scripts/project/sap-actuals.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderPage } from '../../scripts/project/project-page.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { cmdInit, cmdImport, cmdPortfolio } from '../../scripts/project/build-project-doc.mjs';

const TEAM = [
  { id: 'PM1', name: 'PM', role: 'pm' }, { id: 'SD1', name: 'SD con', role: 'module', module: 'SD', sapUser: 'SDCON' },
  { id: 'MM1', name: 'MM con', role: 'module', module: 'MM', to: '2026-05-31' }, { id: 'MM2', name: 'MM new', role: 'module', module: 'MM', from: '2026-06-01' },
  { id: 'DEV1', name: 'Dev SD', role: 'dev', module: 'SD', sapUser: 'DEV01' }, { id: 'DEV2', name: 'Dev', role: 'dev' },
];
const base = () => instantiate({ code: 'P1', name: 'Test', type: 'implementation', start: '2026-01-05', goLive: '2026-10-01', modules: ['SD', 'MM'], team: TEAM });

describe('project-dashboard — template', () => {
  it('works phase dates back from go-live, expands modules, assigns both consultant sides', () => {
    const m = base();
    expect(checkModel(m).errors).toEqual([]);
    const ph = m.wbs.filter((w: { type: string }) => w.type === 'phase').map((w: { id: string }) => w.id);
    expect(ph).toEqual(['PRE', 'EXP', 'REA', 'DEP', 'RUN']);
    expect(m.wbs.find((w: { id: string }) => w.id === 'EXP.FTS.SD').fnOwner).toBe('SD1');
    expect(m.wbs.find((w: { id: string }) => w.id === 'REA.DEV.SD').devOwner).toBe('DEV1');
    expect(m.wbs.find((w: { id: string }) => w.id === 'REA.DEV.MM').devOwner).toBe('DEV2');
    expect(m.milestones.find((x: { kind: string }) => x.kind === 'golive').base).toBe('2026-10-01');
    expect(m.wbs.find((w: { id: string }) => w.id === 'RUN').start > '2026-10-01').toBe(true);
    expect(m.kpis.map((k: { id: string }) => k.id)).toContain('K.TESTPASS');
    for (const t of ['conversion', 'rollout', 'ams', 'task'])
      expect(checkModel(instantiate({ code: 'X', name: 'x', type: t, start: '2026-01-05', goLive: '2026-06-01', modules: ['FI'], team: TEAM })).errors).toEqual([]);
  });

  it('adds WRICEF items under the module development deliverable; stage drives %', () => {
    const r = addWricef(base(), [{ label: 'Upload', kind: 'C', module: 'SD', stage: 'build' }, { label: 'x', kind: 'Z', module: 'SD' }, { label: 'y', kind: 'R', module: 'PP' }]);
    expect(r.added).toHaveLength(1);
    expect(r.skipped).toHaveLength(2);
    const w = r.model.wbs.find((x: { id: string }) => x.id === r.added[0]);
    expect(w.parent).toBe('REA.DEV.SD');
    expect(w.pct).toBe(STAGE_PCT.build);
    expect(w.status).toBe('inprogress');
  });
});

describe('project-dashboard — figures', () => {
  it('rolls up, flags late rows, builds the hand-off queue and finds orphans', () => {
    let m = addWricef(base(), [{ label: 'A', kind: 'C', module: 'SD', stage: 'fs' }, { label: 'B', kind: 'R', module: 'MM', stage: 'ut' }]).model;
    m.wbs.find((w: { label: string }) => w.label === 'A').wricef.stageDates = { fs: '2026-06-01' };
    const v = viewModel(m, '2026-06-15');
    expect(v.progress.planned).toBeGreaterThan(v.progress.actual);
    expect(v.late.length).toBeGreaterThan(0);
    expect(v.handoff.toDev).toMatchObject([{ label: 'A', waiting: 14 }]);
    expect(v.handoff.toFn.map((x: { label: string }) => x.label)).toEqual(['B']);
    expect(v.orphans.some((o: { owner: string }) => o.owner === 'MM1')).toBe(true);
    expect(v.overall).toBe('red');
    const r = reassign(m, 'MM1', 'MM2', { today: '2026-06-15' });
    expect(r.moved.length).toBeGreaterThan(0);
    expect(viewModel(r.model, '2026-06-15').orphans.filter((o: { owner: string }) => o.owner === 'MM1')).toEqual([]);
    expect(() => reassign(m, 'MM1', 'NOPE')).toThrow();
  });

  it('computes KPI RAG by direction and trends auto KPIs through snapshots', () => {
    expect(kpiRag({ actual: 96, target: 95, dir: 'up' })).toBe('green');
    expect(kpiRag({ actual: 90, target: 95, dir: 'up' })).toBe('amber');
    expect(kpiRag({ actual: 5, target: 0, dir: 'down' })).toBe('red');
    expect(kpiRag({ actual: '', target: 1 })).toBe('none');
    let m = withSnapshot(base(), '2026-03-01');
    m = withSnapshot(m, '2026-03-08');
    const late = viewModel(m, '2026-03-08').kpis.find((k: { id: string }) => k.id === 'late');
    expect(late.history).toHaveLength(2);
    expect(m.snapshots[1].kpi.spi).toBeDefined();
  });
});

describe('project-dashboard — SAP actuals mapping', () => {
  it('splits customizing / workbench requests, maps workstreams, counts releases per week', () => {
    const e070 = [
      { TRKORR: 'DEVK1', TRFUNCTION: 'W', TRSTATUS: 'R', AS4USER: 'SDCON', AS4DATE: '20260302', STRKORR: '' },
      { TRKORR: 'DEVK2', TRFUNCTION: 'K', TRSTATUS: 'D', AS4USER: 'DEV01', AS4DATE: '2026-03-03', STRKORR: '' },
      { TRKORR: 'DEVK3', TRFUNCTION: 'K', TRSTATUS: 'R', AS4USER: 'DEV01', AS4DATE: '20260304', STRKORR: '' },
      { TRKORR: 'DEVK4', TRFUNCTION: 'S', TRSTATUS: 'R', AS4USER: 'X', AS4DATE: '20260304', STRKORR: 'DEVK3' },
    ];
    const e07t = [{ TRKORR: 'DEVK1', AS4TEXT: '[SD] Pricing procedure' }, { TRKORR: 'DEVK2', AS4TEXT: '[MM] PO report' }, { TRKORR: 'DEVK3', AS4TEXT: '[BW] extractor' }];
    const t = mapTransports(e070, e07t, { workstreams: [{ code: 'SD' }, { code: 'MM' }] });
    expect(t.map((x: { trkorr: string; side: string; ws: string }) => `${x.trkorr}:${x.side}:${x.ws}`)).toEqual(['DEVK1:F:SD', 'DEVK2:D:MM', 'DEVK3:D:']);
    expect(throughput(t)).toEqual([{ week: '2026-03-02', F: 1, D: 1 }]);
    expect(weekOf('2026-03-08')).toBe('2026-03-02');
  });

  it('suggests a WRICEF stage from the system, never below the PM stage silently', () => {
    const m = addWricef(base(), [{ label: 'A', kind: 'R', module: 'SD', stage: 'fs', objects: ['ZSDR001'] }]).model;
    const ev = wricefEvidence(m, { objects: [{ name: 'ZSDR001', author: 'DEV01' }], objectTrs: [{ name: 'ZSDR001', trkorr: 'DEVK3', status: 'released' }] });
    expect(ev[0]).toMatchObject({ found: 1, suggest: 'ut', behind: true, authors: ['DEV01'] });
  });
});

describe('project-dashboard — page, import, portfolio', () => {
  it('renders every tab and an inline client script that parses', () => {
    const html = renderPage(base(), { version: '1.0', date: '2026-03-01', history: [], today: '2026-03-01' });
    for (const t of ['tab-sum', 'tab-kpi', 'tab-ms', 'tab-wbs', 'tab-sap', 'tab-team', 'tab-hist']) expect(html).toContain(`id="${t}"`);
    const js = html.split('<script>')[1].split('</script>')[0];
    expect(() => new Function(js)).not.toThrow();
    expect(html).not.toMatch(/<\/script>[^<]*<\/script>/);
  });

  it('init → edited page → import makes the next version; a second import is refused; portfolio finds shared people', () => {
    const root = mkdtempSync(join(tmpdir(), 'pd-'));
    try {
      const ans = (code: string, team: object[]) => { const f = join(root, `${code}.json`); writeFileSync(f, JSON.stringify({ code, name: code, type: 'task', start: '2026-01-05', goLive: '2026-04-01', modules: ['SD'], team })); return f; };
      const r = cmdInit({ answers: ans('A1', TEAM), root });
      expect(r.version).toBe('1.0');
      cmdInit({ answers: ans('B2', [{ id: 'X', name: 'SD con', role: 'module', module: 'SD', sapUser: 'SDCON' }]), root });
      const html = readFileSync(r.html, 'utf8');
      const m = /<script type="application\/json" id="project-model">([\s\S]*?)<\/script>/.exec(html)!;
      const d = JSON.parse(m[1]);
      d.model.wbs[1].label = 'Edited label';
      d.history.push({ version: '1.1', date: '2026-01-10', author: 'PMO', note: 'edit' });
      const edited = join(root, 'edited.html');
      writeFileSync(edited, html.replace(m[1], JSON.stringify(d)));
      const imp = cmdImport({ html: edited, root });
      expect(imp.version).toBe('1.1');
      expect(JSON.parse(readFileSync(join(root, 'A1', 'A1-project.json'), 'utf8')).wbs[1].label).toBe('Edited label');
      expect(() => cmdImport({ html: edited, root })).toThrow(/already imported/);
      const pf = cmdPortfolio({ root, today: '2026-02-01' });
      expect(pf.projects).toBe(2);
      expect(pf.sharedPeople).toBe(1);
      expect(existsSync(pf.html)).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

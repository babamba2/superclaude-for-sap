import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { checkModel, normalizeModel, viewModel } from '../../scripts/project/project-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { instantiate, addWricef } from '../../scripts/project/project-template.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { readEvidence, statusEntry, logStatus, previousOf, delta, gateCheck, suggestions, weekEndOf, LOG_WEEKS, computeStatus } from '../../scripts/project/project-status.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderPage } from '../../scripts/project/project-page.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { cmdInit, cmdImport, cmdStatus } from '../../scripts/project/build-project-doc.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { normalize as uatNormalize } from '../../scripts/uat/uat-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { pageHtml as uatPage } from '../../scripts/uat/uat-page.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderHtml as trPage } from '../../scripts/transport/tr-page.mjs';

// a fictitious project only: no customer names, systems or Z objects
const TEAM = [{ id: 'PM1', name: 'PM', role: 'pm' }, { id: 'SD1', name: 'SD consultant', role: 'module', module: 'SD' }, { id: 'DEV1', name: 'Developer', role: 'dev', module: 'SD' }];
const model = () => addWricef(instantiate({ code: 'DEMO1', name: 'Demo', type: 'implementation', start: '2027-01-04', goLive: '2027-06-01', modules: ['SD'], team: TEAM }),
  [{ label: 'Upload', kind: 'C', module: 'SD' }, { label: 'Exit', kind: 'E', module: 'SD' }, { label: 'Form', kind: 'F', module: 'SD' }]).model;
const wricefIds = (m: any) => m.wbs.filter((w: any) => w.type === 'wricef').map((w: any) => w.id);
const UAT = () => {
  const s = uatNormalize({ id: 'DEMO-UAT', module: 'SD', cycles: ['1st', '2nd'], scenarios: [{ id: 'S1', title: 'O2C', steps: [{ activity: 'a', tcode: 'VA01' }, { activity: 'b', tcode: 'VL01N' }, { activity: 'c', tcode: 'VF01' }] }],
    issues: [{ type: 'defect', text: 'd1', state: 'open' }, { type: 'defect', text: 'd2', state: 'waiting' }, { type: 'question', text: 'q', state: 'open' }, { type: 'defect', text: 'd3', state: 'done' }] });
  s.scenarios[0].steps[0].results = { '1st': 'pass' }; s.scenarios[0].steps[1].results = { '1st': 'fail' };
  return s;
};
const CTS = { system: 'DEV', target: 'QAS', readAt: '2027-03-05', requests: [{ trkorr: 'DEVK900001', verdict: 'ready', findings: [] }, { trkorr: 'DEVK900002', verdict: 'blocked', findings: [] }], summary: { total: 2, ready: 1, check: 0, blocked: 1 } };
const OPS = { system: 'DEV', from: '2027-03-01', to: '2027-03-05', verdict: 'amber', dumps: { ok: true, total: 10, groups: [{ count: 10 }] }, jobs: { ok: true, total: 1 }, updates: { ok: false, error: 'x' }, idocs: { ok: true, total: 0 } };

describe('weekly status — model fields stay optional', () => {
  it('risks, decisions, status and statusLog are checked, and an older model still passes', () => {
    expect(checkModel(normalizeModel(model())).errors).toEqual([]);
    const m = normalizeModel({ ...model(), risks: [{ id: 'RK1', text: 'r', impact: 'X' }, { id: 'RK1', text: 'dup' }], decisions: [{ id: 'DC1', text: 'd', status: 'maybe', owner: 'NOBODY' }], status: { overall: 'purple' } });
    const r = checkModel(m);
    expect(r.errors.join('\n')).toMatch(/risk RK1: impact must be H, M or L/);
    expect(r.errors.join('\n')).toMatch(/duplicate risk id RK1/);
    expect(r.errors.join('\n')).toMatch(/decision DC1: unknown status "maybe"/);
    expect(r.errors.join('\n')).toMatch(/status.overall must be red, amber or green/);
    expect(r.warnings.join('\n')).toMatch(/decision DC1: owner NOBODY is not in the team/);
    expect(normalizeModel(model()).risks).toEqual([]);
  });

  it('a dashboard page without the new fields imports and keeps its criteria strings', () => {
    const root = mkdtempSync(join(tmpdir(), 'pst-old-'));
    try {
      const m = model();
      m.milestones[0].criteria = ['Charter signed', 'Team on board'];
      const old = JSON.parse(JSON.stringify(m));
      delete old.risks; delete old.decisions; delete old.statusLog; delete old.status;
      const html = renderPage(old, { version: '1.0', date: '2027-01-04', history: [{ version: '1.0', date: '2027-01-04' }, { version: '1.1', date: '2027-01-05', note: 'edit' }], today: '2027-01-05' })
        .replace(/"version":"1.0","history"/, '"version":"1.0","history"');
      writeFileSync(join(root, 'old.html'), html);
      const r = cmdImport({ html: join(root, 'old.html'), root });
      expect(r.added).toEqual(['1.1']);
      const back = JSON.parse(readFileSync(join(root, 'DEMO1', 'DEMO1-project.json'), 'utf8'));
      expect(back.milestones[0].criteria).toEqual(['Charter signed', 'Team on board']);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('weekly status — evidence', () => {
  it('reads a UAT page and a UAT set JSON the same way (pass % per cycle, open defects)', () => {
    const page = readEvidence(uatPage(UAT(), 'en'));
    const json = readEvidence(JSON.stringify(UAT()));
    for (const e of [page, json]) {
      expect(e).toMatchObject({ ok: true, kind: 'uat', id: 'DEMO-UAT', defectsOpen: 2 });
      expect(e.cycles['1st'].passPct).toBe(33);
    }
  });
  it('reads an operations report page and a CTS model / page (tr-summary)', () => {
    const ops = readEvidence(`<html><script type="application/json" id="ops-model">${JSON.stringify(OPS)}</script></html>`);
    expect(ops).toMatchObject({ ok: true, kind: 'ops', dumps: 10, dumpsDay: 2, updates: null, verdict: 'amber' });
    expect(readEvidence(JSON.stringify(CTS))).toMatchObject({ ok: true, kind: 'cts', summary: { blocked: 1 } });
    const page = trPage(CTS, 'en');
    expect(page).toMatch(/id="tr-summary"/);
    expect(page.match(/id="tr-summary">([^<]*)</)![1]).not.toMatch(/objects|findings/);
    expect(readEvidence(page)).toMatchObject({ ok: true, kind: 'cts', target: 'QAS', summary: { total: 2, blocked: 1 } });
  });
  it('a UAT defect feed is read; anything else is not read — never zero', () => {
    expect(readEvidence(JSON.stringify({ kind: 'uat-defect-feed', set: 'DEMO-UAT', at: '2027-03-05', kpi: { 'uat-defects-open': 4 } }))).toMatchObject({ ok: true, kind: 'uat-defects', kpi: { 'uat-defects-open': 4 } });
    const no = readEvidence('<html><body>a page without a model</body></html>');
    expect(no).toMatchObject({ ok: false, kind: 'unknown' });
    expect(no.reason).toMatch(/no embedded model/);
    expect(readEvidence('{"a":1}')).toMatchObject({ ok: false });
  });
});

describe('weekly status — log, delta, gate', () => {
  const evW1 = [readEvidence(uatPage(UAT(), 'en')), readEvidence(JSON.stringify(CTS))];

  it('week end is the Friday of the week (weekend → the Friday before)', () => {
    expect([weekEndOf('2027-03-01'), weekEndOf('2027-03-05'), weekEndOf('2027-03-06'), weekEndOf('2027-03-07')]).toEqual(['2027-03-05', '2027-03-05', '2027-03-05', '2027-03-05']);
  });

  it('first week: no comparison; second week: stage moves, done, newly late, milestones, risks and decisions', () => {
    const m1 = normalizeModel({ ...model(), risks: [{ id: 'RK1', text: 'r1', impact: 'H' }] });
    const v1 = viewModel(m1, '2027-03-05');
    const e1 = statusEntry(v1, evW1, '2027-03-05');
    expect(delta(null, e1, v1)).toMatchObject({ first: true });

    const m2 = JSON.parse(JSON.stringify(m1));
    const [a, b] = wricefIds(m2);
    m2.wbs.find((w: any) => w.id === a).wricef.stage = 'ut';
    m2.wbs.find((w: any) => w.id === b).wricef.stage = 'done';
    m2.milestones[0].status = 'passed';
    m2.risks[0].status = 'closed';
    m2.decisions = [{ id: 'DC1', text: 'd' }];
    const v2 = viewModel(normalizeModel(m2), '2027-03-12');
    const e2 = statusEntry(v2, [readEvidence(JSON.stringify({ ...CTS, summary: { ...CTS.summary, blocked: 0 } }))], '2027-03-12');
    const d = delta(e1, e2, v2);
    expect(d.first).toBe(false);
    expect(d.moved.map((x: any) => [x.id, x.from, x.to])).toEqual([[a, 'req', 'ut'], [b, 'req', 'done']]);
    expect(d.done.map((x: any) => x.id)).toContain(b);
    expect(d.ms).toEqual([expect.objectContaining({ id: m2.milestones[0].id, to: 'passed' })]);
    expect(d.late.every((x: any) => e1.items[x.id][2] !== 'red')).toBe(true);
    expect(d.risks).toEqual({ added: [], closed: ['RK1'] });
    expect(d.decisions).toEqual({ added: ['DC1'], decided: [] });
    expect(d.evidence.find((x: any) => x.kind === 'cts').blocked).toEqual({ from: 1, to: 0 });
  });

  it('same week replaces, 26 weeks kept, an older week than the log stops (stale page)', () => {
    let log: any[] = [];
    const e = (w: string) => ({ weekEnd: w, items: {}, ms: {}, kpi: {}, evidence: [], risks: [], decisions: [] });
    log = logStatus(log, e('2027-03-05'));
    log = logStatus(log, { ...e('2027-03-05'), comment: 'again' });
    expect(log).toHaveLength(1);
    expect(log[0].comment).toBe('again');
    for (let i = 1; i <= 30; i++) log = logStatus(log, e(new Date(Date.parse('2027-03-05') + i * 7 * 86400000).toISOString().slice(0, 10)));
    expect(log).toHaveLength(LOG_WEEKS);
    expect(() => logStatus(log, e('2027-03-12'))).toThrow(/stale dashboard — its last status is week .* later than the requested week 2027-03-12/);
    expect(previousOf(log, log.at(-1).weekEnd).weekEnd).toBe(log.at(-2).weekEnd);
  });

  it('gate rules: met / unmet per tag, null without evidence, untagged = manual, and the suggestion', () => {
    const m = normalizeModel(model());
    const [a] = wricefIds(m);
    m.wbs.find((w: any) => w.id === a).wricef.stage = 'ut';
    const v = viewModel(m, '2027-03-05');
    const cur = statusEntry(v, evW1, '2027-03-05');
    const ms = { id: 'G', label: 'Gate', base: '2027-03-10', criteria: ['CTS clean [cts-blocked<=0]', 'UAT [uat-pass:1st>=30]', 'Defects [defects-open<=2]', 'Build [wricef>=ut:30]', 'Dumps [dumps-day<=5]', 'Sign-off', 'Odd [unknown-rule<=1]'] };
    const g = gateCheck(ms, cur, v);
    const by = Object.fromEntries(g.rows.map((r: any) => [r.text, r]));
    expect(by['CTS clean']).toMatchObject({ value: 1, met: false, source: 'cts' });
    expect(by['UAT']).toMatchObject({ value: 33, met: true });
    expect(by['Defects']).toMatchObject({ value: 2, met: true });
    expect(by['Build']).toMatchObject({ value: 33, met: true });
    expect(by['Dumps']).toMatchObject({ value: null, met: null, source: 'no evidence' });
    expect(by['Sign-off']).toMatchObject({ met: null, source: 'manual' });
    expect(g.rows.find((r: any) => /Odd/.test(r.text))).toMatchObject({ met: null, source: 'manual' });
    expect(g).toMatchObject({ met: 3, unmet: 1, manual: 3, suggest: 'conditional' });
    expect(gateCheck({ ...ms, criteria: ['Sign-off'] }, cur, v).suggest).toBe('manual');
    expect(gateCheck({ ...ms, criteria: ['UAT [uat-pass:1st>=30]'] }, cur, v).suggest).toBe('pass');
    expect(gateCheck({ ...ms, criteria: ['a [cts-blocked<=0]', 'b [uat-pass:1st>=90]'] }, cur, v).suggest).toBe('fail');
    expect(suggestions(v, g).decisions).toHaveLength(1);
  });
});

describe('weekly status — command (two weeks on a fictitious project)', () => {
  const root = mkdtempSync(join(tmpdir(), 'pst-cmd-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('writes the status page and the log; week 2 shows only the intended changes; a stale page stops', async () => {
    writeFileSync(join(root, 'a.json'), JSON.stringify({ code: 'DEMO1', name: 'Demo', type: 'implementation', start: '2027-01-04', goLive: '2027-06-01', modules: ['SD'], team: TEAM, wricef: [{ label: 'Upload', kind: 'C', module: 'SD' }] }));
    cmdInit({ answers: join(root, 'a.json'), root });
    const mf = join(root, 'DEMO1', 'DEMO1-project.json');
    writeFileSync(join(root, 'cts.json'), JSON.stringify(CTS));
    const w1 = await cmdStatus({ code: 'DEMO1', root, weekEnd: '2027-03-05', evidence: [join(root, 'cts.json'), join(root, 'a.json')], today: '2027-03-05' });
    expect(w1).toMatchObject({ weekEnd: '2027-03-05', first: true, evidence: [{ kind: 'cts', ok: true }, { kind: 'unknown', ok: false }] });
    expect(readFileSync(w1.html, 'utf8')).toMatch(/data-sc4sap-responsive/);
    const m = JSON.parse(readFileSync(mf, 'utf8'));
    m.wbs.find((w: any) => w.type === 'wricef').wricef.stage = 'build';
    writeFileSync(mf, JSON.stringify(m));
    const w2 = await cmdStatus({ code: 'DEMO1', root, weekEnd: '2027-03-12', gate: m.milestones.find((x: any) => x.kind === 'qgate').label, today: '2027-03-12' });
    expect(w2).toMatchObject({ first: false, moved: 1 });
    expect(w2.gate).toBeTruthy();
    const again = await cmdStatus({ code: 'DEMO1', root, weekEnd: '2027-03-12', today: '2027-03-12' });
    expect(again.weekEnd).toBe('2027-03-12');
    expect(JSON.parse(readFileSync(mf, 'utf8')).statusLog.map((x: any) => x.weekEnd)).toEqual(['2027-03-05', '2027-03-12']);
    await expect(cmdStatus({ code: 'DEMO1', root, weekEnd: '2027-03-05', today: '2027-03-12' })).rejects.toThrow(/stale dashboard/);
    await expect(cmdStatus({ code: 'DEMO1', root, weekEnd: '2027-03-12', gate: 'NO-SUCH-GATE', today: '2027-03-12' })).rejects.toThrow(/gate "NO-SUCH-GATE" not found/);
  });

  it('Korean page: no English fragment from suggestions, gate sources, evidence reasons or the "since" list', async () => {
    const r2 = mkdtempSync(join(tmpdir(), 'pst-ko-'));
    try {
      writeFileSync(join(r2, 'a.json'), JSON.stringify({ code: 'DEMO2', name: '데모', type: 'implementation', start: '2027-01-04', goLive: '2027-06-01', modules: ['SD'], team: TEAM, lang: 'ko' }));
      cmdInit({ answers: join(r2, 'a.json'), root: r2 });
      const mf = join(r2, 'DEMO2', 'DEMO2-project.json');
      const m = JSON.parse(readFileSync(mf, 'utf8'));
      const gate = m.milestones.find((x: any) => x.kind === 'qgate');
      gate.criteria = ['이관 [cts-blocked<=0]', '덤프 [dumps-day<=1]', '승인'];
      writeFileSync(mf, JSON.stringify(m));
      writeFileSync(join(r2, 'cts.json'), JSON.stringify(CTS));
      writeFileSync(join(r2, 'ops.html'), `<script type="application/json" id="ops-model">${JSON.stringify(OPS)}</script>`);
      writeFileSync(join(r2, 'x.html'), '<html>no model</html>');
      await cmdStatus({ code: 'DEMO2', root: r2, weekEnd: '2027-03-05', evidence: [join(r2, 'cts.json'), join(r2, 'ops.html')], today: '2027-03-05' });
      const w2 = await cmdStatus({ code: 'DEMO2', root: r2, weekEnd: '2027-03-12', gate: gate.id, evidence: [join(r2, 'cts.json'), join(r2, 'ops.html'), join(r2, 'x.html'), join(r2, 'missing.json')], lang: 'ko', today: '2027-03-12' });
      const page = readFileSync(w2.html, 'utf8').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '')
        .replace(/\[[a-z:-]+(&lt;=|&gt;=|<=|>=)[^\]]*\]/gi, ''); // the PM's own rule tags ([cts-blocked<=0]) are criteria text, not page wording
      for (const en of ['passed', 'at risk', 'decide pass', 'no evidence', 'manual', 'without an active owner', 'defects', 'dumps/day', 'blocked', 'no embedded model', 'not a page', 'ENOENT', 'JSON is not'])
        expect(page, en).not.toContain(en);
      expect(page).toMatch(/증빙 없음|PM 판단/);
      expect(page).toMatch(/내장 모델이 없는 페이지예요/);
      expect(page).toMatch(/파일을 열지 못했어요/);
    } finally { rmSync(r2, { recursive: true, force: true }); }
  });

  it('project.uatSets (strings or { id }) are read as evidence from the UAT folder; --uat overrides; a missing set is listed, never zero', async () => {
    const r3 = mkdtempSync(join(tmpdir(), 'pst-uat-'));
    try {
      expect(normalizeModel({ ...model(), project: { ...model().project, uatSets: ['A-UAT', { id: 'B-UAT' }, null] } }).project.uatSets).toEqual(['A-UAT', 'B-UAT']);
      writeFileSync(join(r3, 'a.json'), JSON.stringify({ code: 'DEMO3', name: 'Demo', type: 'implementation', start: '2027-01-04', goLive: '2027-06-01', modules: ['SD'], team: TEAM }));
      cmdInit({ answers: join(r3, 'a.json'), root: r3 });
      const mf = join(r3, 'DEMO3', 'DEMO3-project.json');
      const m = JSON.parse(readFileSync(mf, 'utf8'));
      m.project.uatSets = ['DEMO-UAT', { id: 'GONE-UAT' }];
      writeFileSync(mf, JSON.stringify(m));
      const ud = join(r3, 'uat', 'DEMO-UAT');
      mkdirSync(ud, { recursive: true });
      writeFileSync(join(ud, 'DEMO-UAT-uat.json'), JSON.stringify(UAT()));
      writeFileSync(join(ud, 'DEMO-UAT-defects.json'), JSON.stringify({ kind: 'uat-defect-feed', set: 'DEMO-UAT', at: '2027-03-05', kpi: { 'uat-defects-open': 2 } }));
      const r = await cmdStatus({ code: 'DEMO3', root: r3, weekEnd: '2027-03-05', uatDir: join(r3, 'uat'), today: '2027-03-05' });
      expect(r.evidence).toEqual([{ kind: 'uat', ok: true }, { kind: 'uat-defects', ok: true }, { kind: 'uat', ok: false }]);
      const only = await cmdStatus({ code: 'DEMO3', root: r3, weekEnd: '2027-03-05', uat: ['DEMO-UAT'], uatDir: join(r3, 'uat'), today: '2027-03-05' });
      expect(only.evidence).toEqual([{ kind: 'uat', ok: true }, { kind: 'uat-defects', ok: true }]);
      // a set id is never a path: "../OTHER" next to the UAT folder is not read, from the model or from --uat
      writeFileSync(join(r3, 'OTHER-uat.json'), JSON.stringify(UAT()));
      const bad = await cmdStatus({ code: 'DEMO3', root: r3, weekEnd: '2027-03-05', uat: ['../OTHER', 'a/b', 'DEMO-UAT'], uatDir: join(r3, 'uat'), today: '2027-03-05', lang: 'ko' });
      expect(bad.evidence).toEqual([{ kind: 'uat', ok: false }, { kind: 'uat', ok: false }, { kind: 'uat', ok: true }, { kind: 'uat-defects', ok: true }]);
      expect(readFileSync(bad.html, 'utf8')).toMatch(/UAT 세트 ID 형식이 아니에요/);
      const m2 = JSON.parse(readFileSync(mf, 'utf8'));
      m2.project.uatSets = ['../OTHER'];
      writeFileSync(mf, JSON.stringify(m2));
      const fromModel = await cmdStatus({ code: 'DEMO3', root: r3, weekEnd: '2027-03-05', uatDir: join(r3, 'uat'), today: '2027-03-05' });
      expect(fromModel.evidence).toEqual([]); // dropped by normalizeModel: never a path, never read
      expect(normalizeModel(m2).project.uatSets).toEqual([]);
      expect(normalizeModel({ ...m2, project: { ...m2.project, uatSets: [' A-1 ', { id: 'B_2' }, 'a/b', '..', 'x'.repeat(31)] } }).project.uatSets).toEqual(['A-1', 'B_2']);
    } finally { rmSync(r3, { recursive: true, force: true }); }
  });

  it('add-wricef keeps the source and note and skips an item already imported from the same document', () => {
    const src = { doc: 'gap', module: 'SD', code: '1.2.3', version: '1.0' };
    const r1 = addWricef(model(), [{ label: 'From gap', kind: 'R', module: 'SD', note: 'Gap 1.2.3', source: src }]);
    const row = r1.model.wbs.find((w: any) => w.label === 'From gap');
    expect(row).toMatchObject({ note: 'Gap 1.2.3', wricef: { source: src } });
    const r2 = addWricef(r1.model, [{ label: 'From gap v2', kind: 'R', module: 'SD', source: { ...src, version: '1.1' } }, { label: 'Other', kind: 'R', module: 'SD' }]);
    expect(r2.skipped).toEqual([{ item: 'From gap v2', reason: 'already imported' }]);
    expect(r2.added).toHaveLength(1);
  });
});

describe('weekly status — computeStatus is the CLI run without files (web workbench parity)', () => {
  it('same model, page and summary as build-project-doc status for the same inputs; stale week and unknown gate stop', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pst-par-'));
    try {
      writeFileSync(join(root, 'a.json'), JSON.stringify({ code: 'DEMO1', name: 'Demo', type: 'implementation', start: '2027-01-04', goLive: '2027-06-01', modules: ['SD'], team: TEAM }));
      cmdInit({ answers: join(root, 'a.json'), root });
      const mf = join(root, 'DEMO1', 'DEMO1-project.json');
      const before = JSON.parse(readFileSync(mf, 'utf8'));
      writeFileSync(join(root, 'cts.json'), JSON.stringify(CTS));
      const uatDir = join(root, 'uat'); mkdirSync(join(uatDir, 'DEMO-UAT'), { recursive: true });
      writeFileSync(join(uatDir, 'DEMO-UAT', 'DEMO-UAT-uat.json'), JSON.stringify(UAT()));
      const gate = before.milestones.find((x: any) => x.kind === 'qgate').id;
      const cli = await cmdStatus({ code: 'DEMO1', root, weekEnd: '2027-03-05', gate, evidence: [join(root, 'cts.json'), join(root, 'missing.json')], uat: ['DEMO-UAT', '../x'], uatDir, today: '2027-03-06' });
      const web = computeStatus(before, { weekEnd: '2027-03-05', gateId: gate, today: '2027-03-06', evidence: [
        { name: 'cts.json', text: JSON.stringify(CTS) }, { name: 'missing.json', result: { ok: false, kind: 'unknown', code: 'read-error', reason: 'x' } },
        { name: 'DEMO-UAT', text: JSON.stringify(UAT()) }, { name: '../x', result: { ok: false, kind: 'uat', id: '../x', code: 'bad-id', reason: 'not a UAT set id' } }] });
      const { html, dashboard, warnings, ...cliSummary } = cli;
      expect(web.summary).toEqual(cliSummary);
      expect(web.model).toEqual(JSON.parse(readFileSync(mf, 'utf8')));
      // the page differs only in the reason text of the unreadable file (a file path on the CLI)
      expect(web.html.replace(/read-error[^<]*/g, '')).toBe(readFileSync(html, 'utf8').replace(/read-error[^<]*/g, ''));
      expect(() => computeStatus(web.model, { weekEnd: '2027-02-26', today: '2027-03-06' })).toThrow(/stale dashboard/);
      expect(() => computeStatus(web.model, { weekEnd: '2027-03-12', gateId: 'NO-SUCH', today: '2027-03-12' })).toThrow(/gate "NO-SUCH" not found/);
      expect(before.statusLog || []).toEqual([]); // the input model is not changed
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

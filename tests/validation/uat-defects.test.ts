import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyPatch, normalize, requestsOf, TRKORR_RE, validate } from '../../scripts/uat/uat-model.mjs';
import { ctsOf, defectRows, kpiFeed, proposeLinks, retestCycleOf, statusOf } from '../../scripts/uat/uat-defects.mjs';
import { renderDefects, renderDefectSummary } from '../../scripts/uat/uat-defects-page.mjs';
import { pageHtml, setFromPage } from '../../scripts/uat/uat-page.mjs';
import { layoutA } from '../../scripts/uat/uat-xlsx.mjs';
import { progress } from '../../scripts/uat/uat-model.mjs';

const step = (n: number, results: Record<string, string>) => ({ activity: `Step ${n}`, tcode: 'ZFOO1', results });
const raw = () => ({
  id: 'SD-OTC', project: 'P1', module: 'SD', cycles: ['1st', '2nd', '3rd'],
  scenarios: [{ id: 'SD01', title: 'Order', steps: [
    step(1, { '1st': 'fail' }), step(2, { '1st': 'fail', '2nd': 'pass' }), step(3, { '1st': 'fail', '2nd': 'fail' }),
    step(4, { '1st': 'fail' }), step(5, { '1st': 'fail' }), step(6, { '1st': 'pass' })] }],
  issues: [
    { scenario: 'SD01', step: 'STEP-001', type: 'defect', text: 'No fix yet', state: 'open' },
    { scenario: 'SD01', step: 'STEP-002', type: 'defect', text: 'Fixed and passed', state: 'done', transports: 'S4XK900012' },
    { scenario: 'SD01', step: 'STEP-003', type: 'defect', text: 'Fixed, retest failed', state: 'open', transports: ['PRDK901234'], retest: '2nd' },
    { scenario: 'SD01', step: 'STEP-004', type: 'defect', text: 'Fix ready', state: 'waiting', transports: 's4xk900012, QASK900007' },
    { scenario: 'SD01', step: 'STEP-005', type: 'defect', text: 'Fix blocked', state: 'open', transports: ['DEVK900003'] },
    { scenario: 'SD01', step: 'STEP-006', type: 'question', text: 'Not a defect', state: 'open' },
  ],
});
const tr = {
  system: 'S4H', readAt: '2026-11-16 10:00',
  requests: [
    { trkorr: 'S4XK900012', status: 'released', verdict: 'check', text: '[SD] SD-OTC/ISS-0001 pricing', findings: [{ kind: 'released' }] },
    { trkorr: 'QASK900007', status: 'open', verdict: 'ready', text: '[SD] Fix ISS-0004 and OTHER-SET/ISS-0006', findings: [] },
    { trkorr: 'DEVK900003', status: 'open', verdict: 'blocked', text: '[SD] ISS-0005 output', findings: [{ kind: 'open-task' }] },
    { trkorr: 'PRDK901234', status: 'released', verdict: 'check', text: 'no issue here', findings: [{ kind: 'released' }, { kind: 'other-request' }] },
  ],
};

describe('UAT defects — model fields', () => {
  it('request numbers of any system: <SID>K<6>', () => {
    for (const t of ['S4XK900012', 'PRDK901234', 'QASK900007', 'DEVK900003']) expect(TRKORR_RE.test(t)).toBe(true);
    for (const t of ['K900001', 'S4XK90001', 'S4XX900012', 'ISS-0001']) expect(TRKORR_RE.test(t)).toBe(false);
    expect(requestsOf('s4xk900012, QASK900007 / s4xk900012')).toEqual(['S4XK900012', 'QASK900007']);
    // a list element holding several numbers (typed on one line of the page's field) is split too
    expect(requestsOf(['devk900002 DEVK900001', 'qask900007,PRDK901234;S4XK900012'])).toEqual(['DEVK900002', 'DEVK900001', 'QASK900007', 'PRDK901234', 'S4XK900012']);
    const typed = normalize({ ...raw(), issues: [{ scenario: 'SD01', step: 'STEP-001', type: 'defect', text: 'x', state: 'open', transports: ['devk900002 DEVK900001'] }] });
    expect(typed.issues[0].transports).toEqual(['DEVK900002', 'DEVK900001']);
    expect(validate(typed).filter((v) => /not a transport request number/.test(v.text))).toEqual([]);
    expect(defectRows(typed, null)[0].transports.map((t: { trkorr: string }) => t.trkorr)).toEqual(['DEVK900002', 'DEVK900001']);
  });

  it('normalize keeps transports as a list and retest; validate flags bad numbers, closed defects without a fix, unknown cycles', () => {
    const set = normalize(raw());
    expect(set.issues[3].transports).toEqual(['S4XK900012', 'QASK900007']);
    const bad = normalize({ ...raw(), issues: [{ scenario: 'SD01', step: 'STEP-001', type: 'defect', text: 'x', state: 'done', followUp: 'y', transports: 'K12345', retest: '9th' }] });
    const texts = validate(bad).filter((v) => v.path.startsWith('issue:')).map((v) => v.text);
    // K12345 is not linked, so the closed defect has no fixing request either
    expect(texts).toEqual(['K12345 is not a transport request number (not linked)', 'defect closed without a fixing request', 'retest cycle 9th is not a cycle of the set']);
    expect(bad.issues[0]).toMatchObject({ transports: [], transportsBad: ['K12345'] });
    const noFix = normalize({ ...raw(), issues: [{ scenario: 'SD01', step: 'STEP-001', type: 'defect', text: 'x', state: 'done', followUp: 'y' }] });
    expect(validate(noFix).map((v) => v.text)).toContain('defect closed without a fixing request');
  });

  it('only request numbers are linked; set-issue refuses anything else with the reason', () => {
    const s = normalize({ ...raw(), issues: [{ scenario: 'SD01', step: 'STEP-001', type: 'defect', text: 'x', state: 'open', transports: 'devk900200, DEVK90000, see mail' }] });
    expect(s.issues[0]).toMatchObject({ transports: ['DEVK900200'], transportsBad: ['DEVK90000', 'SEE', 'MAIL'] });
    const r = applyPatch(s, [{ op: 'set-issue', issue: 'ISS-0001', field: 'transports', value: ['DEVK900200', 'K1'] }]);
    expect(r.skipped).toEqual([{ index: 0, op: 'set-issue', why: 'not a transport request number: K1' }]);
    expect(r.set.issues[0].transports).toEqual(['DEVK900200']);
    // an accepted patch replaces the list and clears what was refused before
    const ok = applyPatch(s, [{ op: 'set-issue', issue: 'ISS-0001', field: 'transports', value: 'devk900200 qask900007' }]).set.issues[0];
    expect(ok).toMatchObject({ transports: ['DEVK900200', 'QASK900007'], transportsBad: [] });
  });

  it('a text-found link is proposed as the union with the requests already linked', () => {
    const s = normalize({ ...raw(), issues: [{ scenario: 'SD01', step: 'STEP-001', type: 'defect', text: 'x', state: 'open', transports: ['DEVK900200'] }] });
    const p = proposeLinks(s, { requests: [{ trkorr: 'QASK900007', text: 'SD-OTC/ISS-0001 fix', verdict: 'ready', findings: [] }, { trkorr: 'PRDK901234', text: 'also ISS-0001', verdict: 'ready', findings: [] }] });
    expect(p).toEqual([{ op: 'set-issue', issue: 'ISS-0001', field: 'transports', value: ['DEVK900200', 'QASK900007', 'PRDK901234'] }]);
    expect(applyPatch(s, p).set.issues[0].transports).toEqual(['DEVK900200', 'QASK900007', 'PRDK901234']);
  });

  it('set-issue patches the fixing requests', () => {
    const { set } = applyPatch(normalize(raw()), [{ op: 'set-issue', issue: 'ISS-0001', field: 'transports', value: ['prdk901235'] }, { op: 'set-issue', issue: 'ISS-0001', field: 'retest', value: '2nd' }]);
    expect(set.issues[0]).toMatchObject({ transports: ['PRDK901235'], retest: '2nd' });
  });

  it('page and workbook carry the new columns; the page round-trips them', () => {
    const set = normalize(raw());
    const html = pageHtml(set);
    expect(html).toContain("'transports','retest'");
    expect(normalize(setFromPage(html)).issues[3].transports).toEqual(['S4XK900012', 'QASK900007']);
    expect(layoutA(set, progress(set)).length).toBeGreaterThan(1000);
  });
});

describe('UAT defects — rows and status', () => {
  const set = normalize(raw());
  const rows = defectRows(set, tr);
  const by = Object.fromEntries(rows.map((r) => [r.issue, r]));

  it('one row per defect; status from fix, CTS state and retest result', () => {
    expect(rows.map((r) => r.issue)).toEqual(['ISS-0001', 'ISS-0002', 'ISS-0003', 'ISS-0004', 'ISS-0005']);
    expect(by['ISS-0001'].status).toBe('no-fix');
    expect(by['ISS-0002']).toMatchObject({ status: 'retest-pass', retest: '2nd', retestResult: 'pass' });
    expect(by['ISS-0003']).toMatchObject({ status: 'retest-fail', retest: '2nd', retestResult: 'fail' });
    expect(by['ISS-0004']).toMatchObject({ status: 'retest-due', retest: '2nd' });
    expect(by['ISS-0004'].transports.map((t: { state: string }) => t.state)).toEqual(['released', 'ready']);
    expect(by['ISS-0005'].status).toBe('fix-in-progress');
  });

  it('a released request with other warnings stays "check"; an unknown request is "fix not checked"', () => {
    expect(ctsOf('PRDK901234', tr).state).toBe('check');
    expect(ctsOf('S4XK900012', tr).state).toBe('released');
    expect(defectRows(set, null).find((r) => r.issue === 'ISS-0004')!.status).toBe('fix-unchecked');
  });

  it('retest cycle: the issue\'s own, else the cycle after the last failure', () => {
    expect(retestCycleOf({ retest: '3rd' }, null, set.cycles)).toBe('3rd');
    expect(retestCycleOf({}, { results: { '1st': 'fail', '2nd': 'fail' } }, set.cycles)).toBe('3rd');
    expect(retestCycleOf({}, { results: { '3rd': 'fail' } }, set.cycles)).toBe('');
    expect(statusOf({ transports: [{ state: 'ready' }], retest: '', retestResult: '' })).toBe('fix-ready');
  });

  it('links found in request texts come back as a proposal, never applied; another set is skipped', () => {
    const p = proposeLinks(set, tr);
    expect(p).toEqual([{ op: 'set-issue', issue: 'ISS-0001', field: 'transports', value: ['S4XK900012'] }]);
    expect(defectRows(set, tr).find((r) => r.issue === 'ISS-0001')!.transports).toEqual([]);
  });

  it('KPI feed: ids fixed for the dashboard', () => {
    const feed = kpiFeed(set, rows, '2026-11-16');
    expect(feed).toMatchObject({ kind: 'uat-defect-feed', set: 'SD-OTC', project: 'P1', at: '2026-11-16' });
    expect(feed.kpi).toEqual({ 'uat-defects-open': 4, 'uat-defects-no-fix': 1, 'uat-fix-ready': 0, 'uat-retest-due': 1, 'uat-retest-pass-rate': 50 });
    expect(kpiFeed(set, [], '2026-11-16').kpi['uat-retest-pass-rate']).toBeNull();
    expect(feed.notes).toEqual({ toClose: [], retestUnchecked: [] });
  });

  it('a passed retest on an open defect is "close?", not open; unchecked fixes stay out of the pass rate', () => {
    const s2 = normalize({ ...raw(), issues: raw().issues.map((i) => (i.step === 'STEP-002' ? { ...i, state: 'open' } : i)) });
    const f2 = kpiFeed(s2, defectRows(s2, tr), '2026-11-16');
    expect(f2.kpi['uat-defects-open']).toBe(4);
    expect(f2.notes.toClose).toEqual(['ISS-0002']);
    const view = { set: s2, rows: defectRows(s2, tr), feed: f2, proposals: [] };
    expect(renderDefects(view, 'ko')).toContain('재테스트 통과 — 종결?');
    expect(renderDefectSummary(view, 'en')).toContain('ISS-0002 SD01/STEP-002 · Retest passed — close?');
    // no CTS check given: every fix is unchecked → no pass rate, the retested issues are listed apart
    const f3 = kpiFeed(s2, defectRows(s2, null), '2026-11-16');
    expect(f3.kpi['uat-retest-pass-rate']).toBeNull();
    expect(f3.notes.retestUnchecked).toEqual(['ISS-0002', 'ISS-0003']);
    expect(renderDefects({ ...view, feed: f3, rows: defectRows(s2, null) }, 'ko')).toContain('통과율 제외');
  });

  it('page: "이관 준비됨" wording, escaped text, summary', () => {
    const s2 = normalize({ ...raw(), issues: [{ scenario: 'SD01', step: 'STEP-006', type: 'defect', text: '<b>x</b>', state: 'open', transports: ['QASK900007'] }] });
    const r2 = defectRows(s2, tr);
    expect(r2[0].status).toBe('fix-ready');
    const view = { set: s2, rows: r2, feed: kpiFeed(s2, r2, '2026-11-16'), proposals: [] };
    const ko = renderDefects(view, 'ko');
    expect(ko).toContain('이관 준비됨');
    expect(ko).not.toContain('<b>x</b>');
    expect(renderDefectSummary(view, 'en')).toMatch(/^Defects and fixes · SD-OTC · Open defects 1/);
  });
});

describe('UAT defects — CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uatdef-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  it('defects writes the page, the feed and the proposed patch', async () => {
    mkdirSync(join(dir, 'SD-OTC'), { recursive: true });
    writeFileSync(join(dir, 'SD-OTC', 'SD-OTC-uat.json'), JSON.stringify(normalize(raw())));
    writeFileSync(join(dir, 'model.json'), JSON.stringify(tr));
    const { execFileSync } = await import('node:child_process');
    const out = JSON.parse(execFileSync(process.execPath, [join(__dirname, '..', '..', 'scripts', 'uat', 'build-uat.mjs'), 'defects', '--dir', dir, '--id', 'SD-OTC', '--tr', join(dir, 'model.json'), '--lang', 'ko', '--at', '2026-11-16'], { encoding: 'utf8' }));
    expect(out.ok).toBe(true);
    expect(existsSync(out.page)).toBe(true);
    expect(JSON.parse(readFileSync(out.feed, 'utf8')).kind).toBe('uat-defect-feed');
    expect(JSON.parse(readFileSync(out.patch, 'utf8'))).toHaveLength(1);
    expect(out.kpi['uat-retest-pass-rate']).toBe(50);
  });
  it('refuses a set file whose own id differs from --id (no path from a poisoned id)', async () => {
    const { spawnSync } = await import('node:child_process');
    mkdirSync(join(dir, 'OK'), { recursive: true });
    writeFileSync(join(dir, 'OK', 'OK-uat.json'), JSON.stringify({ ...raw(), id: '../POISON' }));
    for (const verb of ['defects', 'page', 'check']) {
      const r = spawnSync(process.execPath, [join(__dirname, '..', '..', 'scripts', 'uat', 'build-uat.mjs'), verb, '--dir', dir, '--id', 'OK'], { encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(JSON.parse(r.stdout).error).toMatch(/holds set id/);
    }
    expect(existsSync(join(dir, '..', 'POISON-defects.json'))).toBe(false);
    expect(existsSync(join(dir, 'POISON'))).toBe(false);
  });
  it('refuses an --id that is not a set id before it becomes a path', async () => {
    const { spawnSync } = await import('node:child_process');
    for (const id of ['../SD-OTC', '..\\x', 'a/b']) {
      const r = spawnSync(process.execPath, [join(__dirname, '..', '..', 'scripts', 'uat', 'build-uat.mjs'), 'defects', '--dir', dir, '--id', id], { encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(JSON.parse(r.stdout)).toMatchObject({ ok: false });
    }
  });
});

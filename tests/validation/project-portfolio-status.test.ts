import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { portfolioStatus, peopleAcross, weekWindows, workdays, renderPortfolioStatusPage, portfolioXlsx, OVERLOAD } from '../../scripts/project/project-portfolio.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { cmdPortfolio, cmdPortfolioStatus } from '../../scripts/project/build-project-doc.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { viewModel } from '../../scripts/project/project-model.mjs';

// Fictitious projects only (DEMO-A / B / C). The goldens were written by cmdPortfolio before it moved its people
// rule into project-portfolio.mjs, so the portfolio page must stay byte-identical.
const FIX = join(__dirname, '..', 'fixtures', 'project');
const MODELS = JSON.parse(readFileSync(join(FIX, 'portfolio-models.json'), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(MODELS));
const TODAY = '2027-03-03'; // Wednesday; week end Friday 2027-03-05
const items = (ms = clone()) => Object.entries(ms).map(([ref, model]) => ({ ref, model }));
// The phone layer's script is a function's source text, which the test runner re-prints (adds ';'), so the
// comparison leaves that one script out; outside the runner the whole file is identical (checked with node).
const lf = (s: string) => s.replace(/\r\n/g, '\n').replace(/<script data-sc4sap-responsive>[\s\S]*?<\/script>/, '');

function folder(ms = clone()) {
  const root = mkdtempSync(join(tmpdir(), 'pfs-'));
  for (const [code, m] of Object.entries(ms)) {
    mkdirSync(join(root, code), { recursive: true });
    writeFileSync(join(root, code, `${code}-project.json`), JSON.stringify(m));
  }
  writeFileSync(join(root, 'DEMO-A', 'DEMO-A-ko.history.json'), JSON.stringify({ versions: [{ version: '1.2' }] }));
  return root;
}

describe('portfolio weekly status — plugin part', () => {
  it('the portfolio page (cmdPortfolio) is byte-identical to the golden, ko and en', () => {
    const root = folder();
    try {
      for (const lang of ['ko', 'en']) {
        const r = cmdPortfolio({ root, lang, today: TODAY });
        expect(lf(readFileSync(r.html, 'utf8'))).toBe(lf(readFileSync(join(FIX, `portfolio-golden-${lang}.html`), 'utf8')));
        expect(r.sharedPeople).toBe(2);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('week windows run Monday … Sunday; two weeks hold 10 working days', () => {
    expect(weekWindows('2027-03-03')).toEqual({ weekEnd: '2027-03-05', thisWeek: { from: '2027-03-01', to: '2027-03-07' }, nextWeek: { from: '2027-03-08', to: '2027-03-14' } });
    expect(weekWindows('2027-03-07').weekEnd).toBe('2027-03-05'); // Sunday → the Friday before
    expect(workdays('2027-03-08', 14)).toBe(10);
  });

  it('counts by RAG, milestones of this / next week on the window edges, D-days, risks and decisions', () => {
    const r = portfolioStatus(items(), { today: TODAY, weekEnd: '2027-03-05', lang: 'ko' });
    expect(r.summary.projects).toBe(3);
    expect(r.summary.rag.red + r.summary.rag.amber + r.summary.rag.green).toBe(3);
    const ms = r.milestones.map((x: any) => `${x.week}:${x.code}:${x.id}:${x.date}`);
    expect(ms).toEqual(['this:DEMO-B:MB1:2027-03-04', 'this:DEMO-C:MC1:2027-03-05', 'this:DEMO-C:MC2:2027-03-07', 'next:DEMO-B:MB2:2027-03-12']); // MC3 (03-15) is out
    expect(r.summary.gatesThisWeek).toBe(2); // MC1 + MC2 (Sunday still this week); MB1 is a sign-off
    const a = r.projects.find((p: any) => p.code === 'DEMO-A');
    expect(a.goLiveD).toBe(47); // 2027-03-03 → 2027-04-19
    expect(a.cutoverStart).toBe('2027-04-16');
    expect(a.cutoverD).toBe(44);
    expect(a.lastStatusWeek).toBe('2027-02-26');
    expect(r.projects.find((p: any) => p.code === 'DEMO-C').goLiveD).toBe(17);
    expect(r.summary.goLive30).toBe(1);
    expect(r.risks.map((x: any) => [x.code, x.id, x.overdue])).toEqual([['DEMO-A', 'R1', true], ['DEMO-A', 'R2', false]]); // L and closed left out
    expect(r.risks[0].owner).toBe('Park PM');
    expect(r.decisions.map((x: any) => [x.code, x.id])).toEqual([['DEMO-A', 'D1'], ['DEMO-C', 'D1']]);
    const w = r.wricef.find((x: any) => x.code === 'DEMO-A');
    expect(w.stages).toMatchObject({ fs: 1, build: 1, ut: 1, done: 1 });
    expect(w.handoff).toBe(2); // fs → dev, ut → functional
    expect(r.summary.ragDelta).toBeNull();
    expect(r.summary.sentence).toMatch(/^이번 주 프로젝트 3개 중 /);
  });

  it('uses the view the caller passes (web numbers), never recomputes it', () => {
    const ms = clone();
    const its = items(ms).map((x: any) => ({ ...x, view: viewModel(x.model, TODAY) }));
    const b = its.find((x: any) => x.ref === 'DEMO-B');
    b.view = { ...b.view, overall: 'red', progress: { actual: 41, planned: 77 }, late: [{ id: 'W1', label: 'Weighted late', finish: '2027-03-01' }], handoff: { toDev: [1, 2, 3], toFn: [] } };
    const r = portfolioStatus(its, { today: TODAY, viewSource: 'web' });
    const p = r.projects.find((x: any) => x.code === 'DEMO-B');
    expect([p.overall, p.progress.actual, p.progress.planned, p.late, p.lateTop[0], p.handoff]).toEqual(['red', 41, 77, 1, 'Weighted late', 3]);
    expect(r.projects.slice(0, r.summary.rag.red).map((x: any) => x.code)).toContain('DEMO-B'); // red first
    expect(r.source.view).toBe('web');
    expect(renderPortfolioStatusPage(r, 'ko')).toContain('웹 (/wbs)');
  });

  it('owner (PM): the view\'s pm when given, else the team member named by project.pm; in the page and the workbook', () => {
    const ms = clone();
    ms['DEMO-A'].project.pm = 'PM1'; // a team member id
    const its = items(ms).map((x: any) => ({ ...x, view: viewModel(x.model, TODAY) }));
    its.find((x: any) => x.ref === 'DEMO-B').view.pm = 'Web PM';
    const r = portfolioStatus(its, { today: TODAY });
    const pm = (c: string) => r.projects.find((x: any) => x.code === c).pm;
    expect(pm('DEMO-B')).toBe('Web PM');
    expect(pm('DEMO-A')).toBe('Park PM');
    expect(pm('DEMO-C')).toBe(''); // no pm in the model, none in the view
    const html = renderPortfolioStatusPage(r, 'en');
    expect(html).toContain('<th>Owner</th>');
    expect(html).toContain('data-label="Owner"><span>Web PM</span>');
    expect(r.minimal[0]).not.toHaveProperty('pm');
    expect(portfolioXlsx(r, 'ko').subarray(0, 2).toString()).toBe('PK');
  });

  it('overload limits: open items > 20 or effort left > working days of the next two weeks (boundary not overloaded)', () => {
    const P = (open: number, remaining: number) => ({ name: `P${open}-${remaining}`, sapUser: '', roles: ['dev'], projects: [{ code: 'DEMO-A', open, late: 0, remaining }, { code: 'DEMO-B', open: 0, late: 0, remaining: 0 }] });
    const r = portfolioStatus(items(), { today: TODAY, people: [P(20, 10), P(21, 0), P(0, 10.5)] });
    expect(OVERLOAD).toEqual({ open: 20, weeks: 2 });
    expect(r.thresholds.effortDays).toBe(10);
    expect(r.people.map((x: any) => [x.name, x.overloaded, x.why])).toEqual([['P20-10', false, []], ['P21-0', true, ['open']], ['P0-10.5', true, ['effort']]]);
    expect(r.summary.overloaded).toBe(2);
    expect(r.source.people).toBe('caller');
    expect(renderPortfolioStatusPage(r, 'en')).toContain('more than 20 open items, or more effort left than the 10 working days of the next 2 weeks');
  });

  it('people computed without a caller list: same key rule as the portfolio page, one row per project, remaining effort', () => {
    const r = portfolioStatus(items(), { today: TODAY });
    const kim = r.people.find((x: any) => x.sapUser === 'DEMOSD');
    expect(kim.projects.map((p: any) => p.code).sort()).toEqual(['DEMO-A', 'DEMO-B', 'DEMO-C']);
    const lee = r.people.find((x: any) => x.sapUser === 'DEMODEV');
    expect(lee.projects.map((p: any) => p.code).sort()).toEqual(['DEMO-A', 'DEMO-B']);
    const views = Object.values(clone()).map((m: any) => ({ view: viewModel(m, TODAY) }));
    expect(peopleAcross(views, TODAY).length).toBe(2);
    // the same person twice in one team: two rows on the portfolio page rule, one with merge
    const ms = clone();
    ms['DEMO-C'].team.push({ id: 'Y2', name: 'Kim SD', role: 'test', sapUser: 'DEMOSD' });
    const v2 = Object.values(ms).map((m: any) => ({ view: viewModel(m, TODAY) }));
    expect(peopleAcross(v2, TODAY).find((x: any) => x.key === 'DEMOSD').projects).toHaveLength(4);
    expect(peopleAcross(v2, TODAY, { merge: true }).find((x: any) => x.key === 'DEMOSD').projects).toHaveLength(3);
    expect(r.people.every((x: any) => typeof x.remaining === 'number')).toBe(true);
  });

  it('prev: RAG ▲▼ and progress change; new and gone projects; same week → no change', () => {
    const r0 = portfolioStatus(items(), { today: TODAY });
    const same = portfolioStatus(items(), { today: TODAY, prev: r0 });
    expect(same.summary.ragDelta).toEqual({ red: 0, amber: 0, green: 0 });
    expect(same.projects.every((p: any) => p.move === 'same' && p.progressDelta.actual === 0)).toBe(true);
    expect(same.summary.sentence).toContain('지난주와 같아요');
    const prev = { weekEnd: '2027-02-26', minimal: [
      { ref: 'DEMO-A', code: 'DEMO-A', overall: 'red', progress: { actual: 0, planned: 0 } },
      { ref: 'DEMO-B', code: 'DEMO-B', overall: 'green', progress: { actual: 0, planned: 0 } },
      { ref: 'OLD-1', code: 'DEMO-OLD', overall: 'amber', progress: { actual: 50, planned: 50 } }] };
    const ms = clone(); delete ms['DEMO-C'];
    const its = items(ms).map((x: any) => ({ ...x, view: { ...viewModel(x.model, TODAY), overall: 'amber' } }));
    its.push({ ref: 'NEW-1', model: { ...clone()['DEMO-C'], project: { ...clone()['DEMO-C'].project, code: 'DEMO-NEW' } } } as any);
    const r = portfolioStatus(its, { today: TODAY, prev });
    const by = (c: string) => r.projects.find((p: any) => p.code === c);
    expect(by('DEMO-A').move).toBe('up');
    expect(by('DEMO-B').move).toBe('down');
    expect(by('DEMO-NEW').move).toBe('new');
    expect(r.gone).toEqual([{ ref: 'OLD-1', code: 'DEMO-OLD', overall: 'amber' }]);
    expect(r.summary.newProjects).toBe(1);
    expect(r.source.prevWeek).toBe('2027-02-26');
    const n = r.summary.rag;
    expect(r.summary.ragDelta).toEqual({ red: n.red - 1, amber: n.amber - 1, green: n.green - 1 });
    expect(by('DEMO-A').progressDelta.actual).toBe(by('DEMO-A').progress.actual);
    const html = renderPortfolioStatusPage(r, 'ko');
    expect(html).toContain('DEMO-OLD');
    expect(html).toContain('▲');
    expect(r.minimal.map((x: any) => x.ref).sort()).toEqual(['DEMO-A', 'DEMO-B', 'NEW-1']);
  });

  it('page: A4 landscape, cards under 600px, light / dark, escaped text; xlsx is a zip; summaryText replaces the sentence', () => {
    const ms = clone();
    ms['DEMO-A'].risks[0].text = '<img src=x onerror=alert(1)>';
    const r = portfolioStatus(items(ms), { today: TODAY, scope: 'Demo org' });
    const html = renderPortfolioStatusPage({ ...r, summaryText: 'Accepted paragraph.' }, 'ko');
    expect(html).toContain('size:A4 landscape');
    expect(html).toContain('table.cards td::before{content:attr(data-label)');
    expect(html).toContain('prefers-color-scheme:dark');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Accepted paragraph.');
    expect(html).toContain('data-sc4sap-responsive');
    const x = portfolioXlsx(r, 'en');
    expect(x.subarray(0, 2).toString()).toBe('PK');
  });

  it('CLI portfolio-status writes html / json / xlsx and takes the earlier week as prev', () => {
    const root = folder();
    try {
      const w1 = cmdPortfolioStatus({ root, lang: 'ko', weekEnd: '2027-02-26', today: TODAY });
      expect(w1.prev).toBe('');
      for (const f of [w1.html, w1.json, w1.xlsx]) expect(existsSync(f)).toBe(true);
      const w2 = cmdPortfolioStatus({ root, lang: 'ko', today: TODAY });
      expect(w2.weekEnd).toBe('2027-03-05');
      expect(w2.prev).toBe(w1.json);
      expect(JSON.parse(readFileSync(w2.json, 'utf8')).summary.ragDelta).toEqual({ red: 0, amber: 0, green: 0 });
      const again = cmdPortfolioStatus({ root, lang: 'ko', today: TODAY }); // same week again → same file, prev still the earlier week
      expect(again.json).toBe(w2.json);
      expect(again.prev).toBe(w1.json);
      expect(cmdPortfolioStatus({ root, lang: '../x', today: TODAY }).html).toMatch(/portfolio-status-2027-03-05-ko\.html$/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

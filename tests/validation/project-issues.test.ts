/**
 * The /wbs issue log (project.issues: what already went wrong — a risk is what might): model and checks, the page's
 * issues table, the workbook sheet, the AI text rules, and /migration's issues written in by its "WBS에 반영".
 */
import { describe, it, expect } from 'vitest';
import { ISSUE_STATUS, checkModel, normalizeModel } from '../../scripts/project/project-model.mjs';
import { renderRisks, LABELS } from '../../scripts/project/project-render.mjs';
import { applyPatch } from '../../scripts/project/project-patch.mjs';
import { projectWorkbook } from '../../scripts/project/project-xlsx.mjs';
import { applyMigrationSync, migrationIssueId, migrationSyncPlan } from '../../scripts/project/migration-wbs.mjs';
import { viewModel } from '../../scripts/project/project-model.mjs';

const base = {
  schema: 1, lang: 'ko', title: 'P', project: { code: 'P1', name: 'P', type: 'implementation', start: '2027-01-01', goLive: '2027-06-01', modules: [], packages: [] },
  team: [{ id: 'kim', name: 'Kim', role: 'PM' }],
  wbs: [{ id: 'W1', type: 'phase', label: 'Realize' }],
  milestones: [],
};

describe('issue log model', () => {
  it('normalizes defaults (priority M, status open); older models open unchanged', () => {
    const m = normalizeModel({ ...base, issues: [{ id: 'IS1', text: 'GR posting fails' }] });
    expect(m.issues[0]).toMatchObject({ priority: 'M', status: 'open' });
    expect(normalizeModel(base).issues).toEqual([]);
    expect(ISSUE_STATUS).toEqual(['open', 'inprogress', 'resolved', 'closed']);
  });
  it('checks: duplicate id, unknown status / priority, bad dates are errors; unknown owner and WBS row are warnings', () => {
    const c = checkModel({ ...base, issues: [
      { id: 'IS1', text: 'a', status: 'done', priority: 'X', due: '2027/01/01' },
      { id: 'IS1', text: 'b', owner: 'lee', rowIds: ['W9'] },
    ] });
    expect(c.errors).toEqual(expect.arrayContaining(['duplicate issue id IS1', 'issue IS1: unknown status "done"', 'issue IS1: priority must be H, M or L', 'issue IS1: due must be YYYY-MM-DD']));
    expect(c.warnings).toEqual(expect.arrayContaining(['issue IS1: owner lee is not in the team', 'issue IS1: WBS row W9 not found']));
  });
});

describe('page, workbook, AI', () => {
  const m = normalizeModel({ ...base, issues: [
    { id: 'IS1', text: '낮은 것', priority: 'L', status: 'open' },
    { id: 'IS2', text: '해결됨', priority: 'H', status: 'resolved', resolution: '패치 적용' },
    { id: 'IS3', text: '높은 것', priority: 'H', status: 'inprogress', owner: 'kim' },
  ] });
  it('the page lists issues between risks and decisions: open first, then by priority; editable cells', () => {
    const html = renderRisks(viewModel(m, '2027-02-01'), LABELS.ko);
    expect(html.indexOf('<h3>이슈</h3>')).toBeGreaterThan(html.indexOf('<h3>리스크</h3>'));
    expect(html.indexOf('<h3>결정 필요 사항</h3>')).toBeGreaterThan(html.indexOf('<h3>이슈</h3>'));
    const order = ['IS3', 'IS1', 'IS2'].map((id) => html.indexOf(`data-f="i|${id}|text"`));
    expect(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1]!))).toBe(true);
    expect(html).toContain('처리 중');
    expect(LABELS.ko.tabs.risk).toBe('리스크·이슈·결정');
  });
  it('the workbook has an Issues sheet after Risks', () => {
    expect(projectWorkbook(m, { today: '2027-02-01', lang: 'en' }).byteLength).toBeGreaterThan(2000);
  });
  it('AI: may add an issue (text, priority) and draft text / note / resolution; never owner, status or dates', () => {
    const r = applyPatch(m, [
      { op: 'add-issue', text: 'Interface IF01 drops lines', priority: 'H' },
      { op: 'set-text', target: 'issue', id: 'IS1', field: 'resolution', value: 'Retry the job' },
      { op: 'add-issue', text: 'x', owner: 'kim' },
      { op: 'set-text', target: 'issue', id: 'IS1', field: 'status', value: 'closed' },
      { op: 'add-issue', text: 'y', priority: 'Z' },
    ], { today: '2027-02-01' });
    expect(r.applied.map((a: { op: string }) => a.op)).toEqual(['add-issue', 'set-text']);
    expect(r.skipped.length).toBe(3);
    const added = r.model.issues.find((x: { text: string }) => x.text === 'Interface IF01 drops lines');
    expect(added).toMatchObject({ id: 'IS4', priority: 'H', status: 'open', raised: '2027-02-01' });
    expect(added.owner).toBeUndefined();
    expect(r.model.issues.find((x: { id: string }) => x.id === 'IS1').resolution).toBe('Retry the job');
  });
});

describe('/migration issues → the issue log', () => {
  const doc = {
    id: 'MIG-1', lang: 'ko', objects: [{ id: 'O1', name: 'BP' }], runs: [{ id: 'M1', label: '모의 1차' }],
    issues: [
      { id: 'I01', objectId: 'O1', runId: 'M1', text: '주소 형식 오류 120건', owner: 'Kim', due: '2027-01-20', status: 'open' },
      { id: 'I02', text: '이미 닫힌 것', status: 'closed' },
      { id: 'I03', text: '' },
    ],
  };
  it('adds open issues with text (owner only for team members), never closed or empty ones', () => {
    const p = migrationSyncPlan(doc, base);
    expect(p.added.issues).toEqual([{ id: 'MIG.MIG-1.I01', text: '주소 형식 오류 120건', owner: 'kim', due: '2027-01-20', status: 'open', note: '/migration MIG-1: I01 · O1 · 모의 1차', priority: 'M', source: 'migration:MIG-1:I01' }]);
    const next = applyMigrationSync(base, p);
    expect(checkModel(next).errors.filter((e: string) => /issue/.test(e))).toEqual([]);
    expect(migrationSyncPlan(doc, next).empty).toBe(true);
  });
  it('later: closing it in /migration closes it in /wbs; a reopen is only flagged; the PM\'s fields stay', () => {
    const once = applyMigrationSync(base, migrationSyncPlan(doc, base));
    const id = migrationIssueId('MIG-1', 'I01');
    const pm = once.issues.find((x: { id: string }) => x.id === id);
    Object.assign(pm, { priority: 'H', resolution: '데이터 정제 후 재적재' });
    const closed = { ...doc, issues: [{ ...doc.issues[0], status: 'closed' }] };
    const p = migrationSyncPlan(closed, once);
    expect(p.issues).toEqual([{ id, changes: [{ field: 'status', from: 'open', to: 'closed' }] }]);
    const after = applyMigrationSync(once, p);
    expect(after.issues.find((x: { id: string }) => x.id === id)).toMatchObject({ status: 'closed', priority: 'H', resolution: '데이터 정제 후 재적재' });
    const reopened = migrationSyncPlan(doc, after);
    expect(reopened.flagged).toEqual([{ key: `issues:${id}:status`, list: 'issues', id, field: 'status', from: 'closed', to: 'open' }]);
    expect(applyMigrationSync(after, reopened).issues.find((x: { id: string }) => x.id === id).status).toBe('closed');
  });
});

describe('open-issue counts: weekly status, list card, portfolio', () => {
  const withIssues = (issues: object[]) => normalizeModel({ ...base, issues });
  it('the weekly status logs the open issues, says which were added or resolved since, and counts them', async () => {
    const { statusEntry, delta, computeStatus } = await import('../../scripts/project/project-status.mjs');
    const m1 = withIssues([{ id: 'IS1', text: 'a', status: 'open' }, { id: 'IS2', text: 'b', status: 'inprogress' }, { id: 'IS3', text: 'c', status: 'resolved' }]);
    const e1 = statusEntry(viewModel(m1, '2027-02-05'), [], '2027-02-05');
    expect(e1.issues).toEqual(['IS1', 'IS2']);
    const m2 = withIssues([{ id: 'IS1', text: 'a', status: 'closed' }, { id: 'IS2', text: 'b', status: 'inprogress' }, { id: 'IS4', text: 'd', status: 'open' }]);
    const v2 = viewModel(m2, '2027-02-12');
    const d = delta(e1, statusEntry(v2, [], '2027-02-12'), v2);
    expect(d.issues).toEqual({ added: ['IS4'], closed: ['IS1'], deleted: [] });
    // an issue deleted from the log is told apart from one resolved or closed
    const m3 = withIssues([{ id: 'IS2', text: 'b', status: 'inprogress' }]);
    const v3 = viewModel(m3, '2027-02-12');
    expect(delta(e1, statusEntry(v3, [], '2027-02-12'), v3).issues).toEqual({ added: [], closed: [], deleted: ['IS1'] });
    const page = computeStatus({ ...m3, statusLog: [e1] }, { weekEnd: '2027-02-12', today: '2027-02-12', lang: 'ko' }).html;
    expect(page).toContain('삭제된 이슈: IS1');
    // a log entry from before the issue log: nothing is reported as added or closed
    expect(delta({ ...e1, issues: undefined }, statusEntry(v2, [], '2027-02-12'), v2).issues).toEqual({ added: [], closed: [], deleted: [] });
    const r = computeStatus(m2, { weekEnd: '2027-02-12', today: '2027-02-12', lang: 'ko' });
    expect(r.summary.issuesOpen).toBe(2);
    expect(r.html).toContain('열린 이슈 (상위 5)');
  });
  it('the list card counts open issues (resolved and closed are done)', async () => {
    const { summary } = await import('../../scripts/project/project-model.mjs');
    expect(summary(withIssues([{ id: 'IS1', text: 'a' }, { id: 'IS2', text: 'b', status: 'resolved' }, { id: 'IS3', text: 'c', status: 'closed' }]), '2027-02-01').issuesOpen).toBe(1);
  });
  it('the portfolio status counts open high issues across projects and shows the tile', async () => {
    const { portfolioStatus, renderPortfolioStatusPage } = await import('../../scripts/project/project-portfolio.mjs');
    const a = withIssues([{ id: 'IS1', text: 'a', priority: 'H' }, { id: 'IS2', text: 'b', priority: 'H', status: 'resolved' }, { id: 'IS3', text: 'c', priority: 'M' }]);
    const b = normalizeModel({ ...base, project: { ...base.project, code: 'P2' }, issues: [{ id: 'IS1', text: 'x', priority: 'H', due: '2027-01-01' }] });
    const r = portfolioStatus([{ ref: 'a', model: a }, { ref: 'b', model: b }], { today: '2027-02-01', lang: 'ko' });
    expect(r.summary.issuesHigh).toBe(2);
    expect(r.issues.map((x: { code: string; overdue: boolean }) => [x.code, x.overdue])).toEqual([['P2', true], ['P1', false]]);
    expect(renderPortfolioStatusPage(r, 'ko')).toContain('열린 H 이슈');
  });
});

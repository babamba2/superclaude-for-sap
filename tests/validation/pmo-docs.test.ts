// The standalone PMO documents of the web workbenches (cutover plan, weekly status, program manual):
// models, pages, the AI proposal allow-lists, exports and the button-only write back to a project.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { csvOf, embedJson, modelFromDocPage, renderDocPage } from '../../scripts/project/doc-kit.mjs';
import {
  applyCutoverOps, applyCutoverSync, blankCutoverDoc, checkCutoverDoc, cutoverDocCsv, cutoverDocFromPage, cutoverDocFromProject,
  cutoverDocPage, cutoverDocXlsx, cutoverSyncPlan,
} from '../../scripts/project/cutover-doc.mjs';
import {
  applyWeeklyOps, applyWeeklySync, blankWeeklyDoc, checkWeeklyDoc, weeklyDocCsv, weeklyDocFromPage, weeklyDocFromProject, weeklyDocPage,
  weeklyDocXlsx, weeklySyncPlan,
} from '../../scripts/project/weekly-doc.mjs';
import { applyManualOps, checkManualDoc, manualDocFromPage, manualDocId, manualDocPage, normalizeManualDoc } from '../../scripts/manual/manual-doc.mjs';

const ROOT = resolve(__dirname, '../..');
const models = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/project/portfolio-models.json'), 'utf8'));
const project = (Array.isArray(models) ? models[0] : Object.values(models)[0]) as any;
const example = JSON.parse(readFileSync(join(ROOT, 'skills/program-to-manual/example-manual.json'), 'utf8'));
const scriptOf = (html: string) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

describe('doc-kit', () => {
  it('embeds JSON that cannot close its script element', () => {
    const s = embedJson({ a: '</script><script>alert(1)</script>' });
    expect(s).not.toContain('</script>');
    expect(JSON.parse(s).a).toBe('</script><script>alert(1)</script>');
  });
  it('keeps a formula out of a CSV cell and quotes what needs it', () => {
    const csv = csvOf([{ a: '=HYPERLINK("x")', b: 'x,y', c: ['p', 'q'] }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"p, q"');
    // OWASP: a leading tab or carriage return is also a formula opener (verifier R1 note 2)
    const ws = csvOf([{ a: '\t=1+1' }, { a: '\r=1+1' }], [{ key: 'a', label: 'A' }]);
    expect(ws).toContain(`'\t=1+1`);
    expect(ws).toContain(`"'\r=1+1"`);
  });
  it('a page round-trips its model and carries the page contract; the script parses', () => {
    const html = renderDocPage({ kind: 'k', title: 't</title>', model: { kind: 'k', x: '</script>' }, schema: { sections: [], labels: {} } });
    expect(modelFromDocPage(html, 'k')?.model.x).toBe('</script>');
    expect(modelFromDocPage(html, 'other')).toBeNull();
    expect(html).toContain('window.SC4SAP_PAGE');
    expect(html).not.toContain('<title>t</title></title>');
    for (const s of scriptOf(html)) expect(() => new Function(s)).not.toThrow();
  });
  it('the embed page has no file save button (the workbench saves)', () => {
    const page = (embed: boolean) => renderDocPage({ kind: 'k', title: 't', model: { kind: 'k' }, schema: { sections: [], labels: {} }, embed });
    expect(page(true)).not.toContain('id="doc-save"');
    expect(page(false)).toContain('id="doc-save"');
  });
});

describe('cutover document', () => {
  const doc = blankCutoverDoc({ id: 'PRJ-cutover', goLive: '2027-05-03', lang: 'ko' });
  it('a blank document with a go-live gets the generic runbook, and checks clean', () => {
    expect(doc.cutover.tasks.length).toBeGreaterThan(10);
    expect(doc.cutover.goNoGo.length).toBeGreaterThan(3);
    expect(doc.cutover.window.start).toBe('2027-05-01T18:00');
    expect(checkCutoverDoc(doc).errors).toEqual([]);
    expect(blankCutoverDoc({ id: 'X' }).cutover.tasks).toEqual([]);
    expect(checkCutoverDoc({ ...doc, id: '../x' }).errors[0]).toMatch(/^id:/);
  });
  it('from a project: go-live, team, its runbook (seeded when it has none), the source', () => {
    const d = cutoverDocFromProject(project, { projectId: 'p1', today: '2027-03-10' });
    expect(d.goLive).toBe(project.project.goLive);
    expect(d.team.length).toBe(project.team.length);
    expect(d.cutover.tasks.length).toBeGreaterThan(0);
    expect(d.source).toEqual({ projectId: 'p1', code: project.project.code, importedAt: '2027-03-10' });
  });
  it('the page: summary from the runbook, page contract, round trip', () => {
    const html = cutoverDocPage(doc, { today: '2027-04-20', embed: true });
    expect(html).toContain('D-13');
    expect(html).toContain('window.SC4SAP_PAGE');
    expect(cutoverDocFromPage(html)?.model.cutover.tasks.length).toBe(doc.cutover.tasks.length);
    expect(cutoverDocFromPage(weeklyDocPage(blankWeeklyDoc({ id: 'W' })))).toBeNull();
  });
  it('AI proposals never set an owner, a status, actuals, the go-live or the window', () => {
    const t = doc.cutover.tasks[0].id, g = doc.cutover.goNoGo[0].id;
    const r = applyCutoverOps(doc, [
      { op: 'set-task', id: t, field: 'label', value: 'new text' },
      { op: 'set-task', id: t, field: 'owner', value: 'kim' },
      { op: 'set-task', id: t, field: 'status', value: 'done' },
      { op: 'set-task', id: t, field: 'actual', value: { R1: {} } },
      { op: 'set-gng', id: g, field: 'status', value: 'go' },
      { op: 'set-gng', id: g, field: 'owner', value: 'kim' },
      { op: 'set', field: 'goLive', value: '2030-01-01' },
      { op: 'set', field: 'cutover', value: {} },
      { op: 'add-task', task: { label: 'AI task', phase: 'window', durationH: 2, owner: 'lee', status: 'done' } },
      { op: 'add-gng', item: { text: 'AI item', status: 'go', owner: 'lee' } },
    ]);
    expect(r.applied.length).toBe(3);
    expect(r.skipped.length).toBe(7);
    expect(r.doc.cutover.tasks[0].label).toBe('new text');
    expect(r.doc.cutover.tasks[0].owner).toBe(doc.cutover.tasks[0].owner);
    expect(r.doc.goLive).toBe('2027-05-03');
    const added = r.doc.cutover.tasks.at(-1)!;
    expect([added.owner, added.status, added.durationH]).toEqual(['', 'planned', 2]);
    const item = r.doc.cutover.goNoGo.at(-1)!;
    expect([item.owner, item.status]).toEqual(['', 'open']);
  });
  it('exports: CSV header in the document language, an xlsx workbook', () => {
    expect(cutoverDocCsv(doc).split('\r\n')[0]).toBe('﻿ID,단계,작업,워크스트림,담당,D±일,시간(h),선행,상태,메모');
    const x = cutoverDocXlsx(doc);
    expect(x.subarray(0, 2).toString()).toBe('PK');
  });
  it('write back: a preview of what changes, applied once, idempotent, nothing removed', () => {
    const proj = { project: { code: 'P' }, cutover: { ...JSON.parse(JSON.stringify(doc.cutover)), tasks: [...doc.cutover.tasks.slice(1), { id: 'ONLY.IN.PROJECT', phase: 'pre', label: 'x' }] } };
    const edited = JSON.parse(JSON.stringify(doc));
    edited.cutover.tasks[1].status = 'done';
    edited.cutover.tasks[1].owner = 'kim';
    const plan = cutoverSyncPlan(edited, proj);
    expect(plan.tasks).toEqual([{ id: edited.cutover.tasks[1].id, changes: [{ field: 'status', from: 'planned', to: 'done' }, { field: 'owner', from: '', to: 'kim' }] }]);
    expect(plan.added.tasks.map((t: any) => t.id)).toEqual([doc.cutover.tasks[0].id]);
    const after = applyCutoverSync(proj, plan);
    expect(cutoverSyncPlan(edited, after).empty).toBe(true);
    expect(after.cutover.tasks.some((t: any) => t.id === 'ONLY.IN.PROJECT')).toBe(true);
    expect(applyCutoverSync(after, plan)).toEqual(after);
  });
});

describe('weekly status document', () => {
  const doc = weeklyDocFromProject(project, { today: '2027-03-10', projectId: 'p1' });
  it('from a project: week, RAG, workstreams, open risks and decisions only', () => {
    expect(doc.weekEnd).toBe('2027-03-12');
    expect(['green', 'amber', 'red']).toContain(doc.overall.rag);
    expect(doc.workstreams.length).toBeGreaterThan(0);
    expect(doc.risks.length).toBe(project.risks.filter((r: any) => r.status !== 'closed').length);
    expect(doc.decisions.every((d: any) => d.decision === '' && d.status === 'open')).toBe(true);
    expect(checkWeeklyDoc(doc).errors).toEqual([]);
  });
  it('a blank document: this week\'s Friday', () => {
    expect(blankWeeklyDoc({ id: 'W1', today: '2027-03-10' }).weekEnd).toBe('2027-03-12');
  });
  it('the page round-trips', () => {
    expect(weeklyDocFromPage(weeklyDocPage(doc))?.model).toEqual(doc);
  });
  it('AI proposals never set a RAG, an owner, a decision, a status or the week', () => {
    const r = applyWeeklyOps(doc, [
      { op: 'set', list: 'overall', field: 'summary', value: 'AI summary' },
      { op: 'set', list: 'overall', field: 'rag', value: 'green' },
      { op: 'set', list: 'workstreams', index: 0, field: 'rag', value: 'green' },
      { op: 'set', list: 'risks', index: 0, field: 'owner', value: 'kim' },
      { op: 'set', list: 'decisions', index: 0, field: 'decision', value: 'approve' },
      { op: 'set', list: 'decisions', index: 0, field: 'status', value: 'decided' },
      { op: 'set', list: 'doc', field: 'weekEnd', value: '2030-01-04' },
      { op: 'set', list: 'risks', index: 0, field: 'due', value: 'tomorrow' },
      { op: 'add', list: 'risks', row: { text: 'AI risk', owner: 'kim', status: 'closed', due: '2027-04-01' } },
      { op: 'add', list: 'decisions', row: { text: 'AI decision', decision: 'yes', owner: 'kim' } },
    ]);
    expect(r.applied.length).toBe(3);
    expect(r.doc.overall).toEqual({ rag: doc.overall.rag, summary: 'AI summary' });
    expect(r.doc.workstreams[0].rag).toBe(doc.workstreams[0].rag);
    expect(r.doc.weekEnd).toBe(doc.weekEnd);
    expect(r.doc.risks.at(-1)).toMatchObject({ text: 'AI risk', owner: '', status: 'open', due: '2027-04-01' });
    expect(r.doc.decisions.at(-1)).toMatchObject({ text: 'AI decision', owner: '', decision: '', status: 'open' });
  });
  it('a list named like an Object prototype key is refused, not a crash (verifier R1 note 1)', () => {
    const r = applyWeeklyOps(doc, [
      { op: 'set', list: '__proto__', field: 'x', value: 'y' },
      { op: 'set', list: 'constructor', field: 'name', value: 'y' },
      { op: 'add', list: 'toString', row: { text: 'x' } },
      { op: 'add', list: 'hasOwnProperty', row: { text: 'x' } },
      { op: 'set', list: 'overall', field: '__proto__', value: 'x' },
      { op: 'set', list: 'overall', field: 'summary', value: 'still applied' },
    ]);
    expect(r.applied.length).toBe(1);
    expect(r.skipped.length).toBe(5);
    expect(r.doc.overall.summary).toBe('still applied');
    expect(({} as any).x).toBeUndefined();
  });
  it('exports and the write back (overall, comment, workstream RAG — once)', () => {
    expect(weeklyDocCsv(doc).startsWith('﻿')).toBe(true);
    expect(weeklyDocXlsx(doc).subarray(0, 2).toString()).toBe('PK');
    const edited = { ...doc, overall: { rag: 'amber', summary: 'note' } };
    const plan = weeklySyncPlan(edited, project);
    expect(plan.changes.map((c: any) => c.field)).toContain('comment');
    const after = applyWeeklySync(project, plan);
    expect(after.status.overall).toBe('amber');
    expect(after.status.comment).toBe('note');
    expect(weeklySyncPlan(edited, after).empty).toBe(true);
    expect(after.risks).toEqual(project.risks);
  });
});

describe('manual document', () => {
  const doc = normalizeManualDoc({ manual: example, version: '1.2', history: [{ version: '1.0', date: '2027-01-01', author: 'a', note: 'first' }] });
  it('the page is the manual page, with the page contract; it reads back', () => {
    const html = manualDocPage(doc);
    expect(html).toContain('id="manual-source"');
    expect(html).toContain('window.SC4SAP_PAGE');
    const back = manualDocFromPage(html)!;
    expect(back.manual.program).toBe(example.program);
    expect(back.version).toBe('1.2');
    // the stored revisions ride in the page, so a save through the page contract keeps them
    expect(back.history.map((h) => h.version)).toEqual(['1.0']);
    expect(html.match(/id="manual-source"/g)?.length).toBe(1);
    expect(manualDocFromPage('<html></html>')).toBeNull();
    expect(manualDocId(example)).toBe(`${example.program}-${example.lang || 'ko'}`);
    expect(checkManualDoc(doc).errors).toEqual([]);
  });
  it('the stored revision history is kept when a page comes back with only its new revisions', () => {
    const merged = normalizeManualDoc({ manual: example, version: '1.3', history: [{ version: '1.3', date: '2027-03-01', author: 'c', note: 'edit', source: 'edit' }] }, doc);
    expect(merged.history.map((h) => h.version)).toEqual(['1.0', '1.3']);
  });
  it('AI proposals: prose only — never a screen, an anchor, the program or the version', () => {
    const r = applyManualOps(doc, [
      { op: 'set', path: 'scenarios[0].steps[0].title', value: 'AI title' },
      { op: 'set', path: 'scenarios[0].steps[0].callouts[0].anchor', value: 'X' },
      { op: 'set', path: 'scenarios[0].steps[0].screen', value: 'X' },
      { op: 'set', path: 'program', value: 'ZEVIL' },
      { op: 'set', path: 'tcode', value: 'SE38' },
      { op: 'set', path: 'scenarios[0]', value: 'x' },
      { op: 'set', path: 'scenarios[99].title', value: 'x' },
      { op: 'add', list: 'screens', text: 'x' },
      { op: 'add', list: 'glossary', term: 'ZZ-NEW', description: 'new' },
      // callouts belong to the screens: neither their text nor their details (user decision)
      { op: 'set', path: 'scenarios[0].steps[0].callouts[0].text', value: 'x' },
      { op: 'set', path: 'scenarios[0].steps[0].callouts[0].details[0]', value: 'x' },
      // prototype keys are no list (verifier R1 note 1)
      { op: 'add', list: 'toString', text: 'x', scenario: 0 },
      { op: 'add', list: '__proto__', text: 'x', scenario: 0 },
      { op: 'add', list: 'constructor', text: 'x', scenario: 0 },
    ]);
    expect(r.applied.length).toBe(2);
    expect(r.doc.manual.scenarios[0].checkpoints).toEqual(example.scenarios[0].checkpoints);
    expect(r.doc.manual.scenarios[0].steps[0].title).toBe('AI title');
    expect(r.doc.manual.program).toBe(example.program);
    expect(r.doc.manual.scenarios[0].steps[0].callouts?.[0]?.anchor).toEqual(example.scenarios[0].steps[0].callouts?.[0]?.anchor);
    expect(r.doc.version).toBe('1.2');
  });
});

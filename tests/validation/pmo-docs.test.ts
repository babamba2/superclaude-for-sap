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
import {
  applyMeetingOps, applyMeetingSync, blankMeetingDoc, carryOverMeeting, checkMeetingDoc, meetingActionsCsv, meetingDocFromPage, meetingDocPage,
  meetingDocXlsx, meetingSyncPlan, normalizeMeetingDoc, openActions, taskIdOf,
} from '../../scripts/project/meeting-doc.mjs';
import { checkModel, normalizeModel } from '../../scripts/project/project-model.mjs';

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
  it('write back never wipes /wbs values: blank owner / evidence / window keep, actuals merge, a backward status is only flagged', () => {
    const proj = JSON.parse(JSON.stringify({ project: { code: 'P' }, cutover: doc.cutover }));
    const t0 = proj.cutover.tasks[0], g0 = proj.cutover.goNoGo[0];
    Object.assign(t0, { owner: 'lee', status: 'done', actual: { R1: { start: '2027-04-01T08:00', end: '2027-04-01T09:00' } } });
    Object.assign(g0, { owner: 'park', status: 'go', evidence: 'signed' });
    proj.cutover.window = { start: '2027-05-01T18:00', end: '2027-05-03T06:00' };
    const edited = JSON.parse(JSON.stringify(doc));
    Object.assign(edited.cutover.tasks[0], { owner: '', status: 'planned', actual: { live: { start: '2027-05-01T20:00', end: '2027-05-01T21:00' } } });
    Object.assign(edited.cutover.goNoGo[0], { owner: '', status: 'open', evidence: '' });
    edited.cutover.window = { start: '', end: '' };
    const plan = cutoverSyncPlan(edited, proj);
    expect(plan.window).toEqual([]);
    expect(plan.goNoGo).toEqual([]);
    expect(plan.tasks).toEqual([{ id: t0.id, changes: [{ field: 'actual', from: t0.actual, to: { ...t0.actual, ...edited.cutover.tasks[0].actual } }] }]);
    expect(plan.flagged.map((f: any) => f.key)).toEqual([`tasks:${t0.id}:status`, `goNoGo:${g0.id}:status`]);
    const after = applyCutoverSync(proj, plan);
    expect([after.cutover.tasks[0].owner, after.cutover.tasks[0].status, Object.keys(after.cutover.tasks[0].actual).sort()]).toEqual(['lee', 'done', ['R1', 'live']]);
    expect([after.cutover.goNoGo[0].owner, after.cutover.goNoGo[0].status, after.cutover.goNoGo[0].evidence]).toEqual(['park', 'go', 'signed']);
    expect(after.cutover.window.start).toBe('2027-05-01T18:00');
    const ticked = applyCutoverSync(proj, plan, [`goNoGo:${g0.id}:status`]);
    expect([ticked.cutover.tasks[0].status, ticked.cutover.goNoGo[0].status]).toEqual(['done', 'open']);
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
  it('write back: a blank comment or RAG keeps the project value', () => {
    const proj = { ...project, status: { ...(project as any).status, overall: 'green', comment: 'PM comment' } };
    const plan = weeklySyncPlan({ ...doc, overall: { rag: '', summary: '' } }, proj);
    expect(plan.changes.map((c: any) => c.field)).not.toContain('comment');
    expect(plan.changes.map((c: any) => c.field)).not.toContain('overall');
    expect(applyWeeklySync(proj, plan).status.comment).toBe('PM comment');
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

describe('meeting minutes document', () => {
  const pm = project.team[0];
  const base = normalizeMeetingDoc({
    id: 'MTG-01', date: '2027-03-08', forum: 'PMO weekly', lang: 'en',
    attendees: [{ name: pm.name, role: 'PM' }, { name: 'Kim', role: 'MM' }],
    agenda: [{ no: '1', title: 'Cutover', summary: '' }],
    decisions: [{ id: 'D01', text: 'Freeze the runbook', decidedBy: pm.name, basis: 'Rehearsal 1' }, { id: 'D02', text: 'No decider yet' }],
    actions: [
      { id: 'A01', text: 'Clean material masters', owner: pm.name, due: '2027-03-09', status: 'open' },
      { id: 'A02', text: 'Done already', owner: 'Kim', due: '2027-03-01', status: 'done' },
      { id: 'A03', text: 'Late one', owner: 'Kim', due: '2027-03-01', status: 'inprogress' },
      { id: 'A04', text: 'No owner, no due', status: 'open' },
    ],
  });
  it('every action gets its origin; checks name what is missing', () => {
    expect(base.actions.map((a) => a.origin)).toEqual(['MTG-01:A01', 'MTG-01:A02', 'MTG-01:A03', 'MTG-01:A04']);
    expect(checkMeetingDoc(base).errors).toEqual([]);
    expect(checkMeetingDoc(base).warnings.join(' ')).toMatch(/action A04: no owner/);
    expect(blankMeetingDoc({ id: 'M' }).actions).toEqual([]);
  });
  it('the action board: open and in-progress only, overdue and due this week', () => {
    expect(openActions(base, '2027-03-08').map((a) => [a.id, a.overdue, a.dueThisWeek])).toEqual([['A01', false, true], ['A03', true, false], ['A04', false, false]]);
  });
  it('carry-over: forum, attendees and every action not done, renumbered, origin kept', () => {
    const next = carryOverMeeting(base, { id: 'MTG-02', date: '2027-03-15' });
    expect(next.forum).toBe('PMO weekly');
    expect(next.attendees.length).toBe(2);
    expect(next.actions.map((a) => [a.id, a.origin, a.carriedFrom])).toEqual([
      ['A01', 'MTG-01:A01', 'MTG-01:A01'], ['A02', 'MTG-01:A03', 'MTG-01:A03'], ['A03', 'MTG-01:A04', 'MTG-01:A04'],
    ]);
    expect(next.decisions).toEqual([]);
  });
  it('AI proposals never set an owner, a status, decided-by or the date; a suggested owner must be an attendee', () => {
    const r = applyMeetingOps(base, [
      { op: 'set', list: 'agenda', index: 0, field: 'summary', value: 'AI summary' },
      { op: 'set', list: 'actions', id: 'A01', field: 'owner', value: 'x' },
      { op: 'set', list: 'actions', id: 'A01', field: 'status', value: 'done' },
      { op: 'set', list: 'decisions', id: 'D01', field: 'decidedBy', value: 'x' },
      { op: 'set', list: 'doc', field: 'date', value: '2030-01-01' },
      { op: 'set', list: 'actions', id: 'A04', field: 'suggestedOwner', value: 'Kim' },
      { op: 'set', list: 'actions', id: 'A04', field: 'suggestedOwner', value: 'Outsider' },
      { op: 'add', list: 'actions', row: { text: 'AI action', owner: 'x', status: 'done', due: '2027-03-20', suggestedOwner: 'Kim' } },
      { op: 'add', list: 'decisions', row: { text: 'AI decision', decidedBy: 'x', basis: 'b' } },
      { op: 'set', list: '__proto__', field: 'x' },
      { op: 'add', list: 'attendees', row: { name: 'x' } },
    ]);
    expect(r.applied.length).toBe(4);
    expect(r.doc.agenda[0].summary).toBe('AI summary');
    expect(r.doc.actions.find((a) => a.id === 'A04')!.suggestedOwner).toBe('Kim');
    expect(r.doc.actions.at(-1)).toMatchObject({ text: 'AI action', owner: '', status: 'open', suggestedOwner: 'Kim', origin: `MTG-01:${r.doc.actions.at(-1)!.id}` });
    expect(r.doc.decisions.at(-1)).toMatchObject({ text: 'AI decision', decidedBy: '' });
    expect(r.doc.date).toBe('2027-03-08');
    expect(r.doc.attendees.length).toBe(2);
  });
  it('transcript and live summary ride in the document; an AI proposal cannot write either', () => {
    const d = normalizeMeetingDoc({ ...base, transcript: 'spoken text', liveSummary: 'so far' });
    expect([d.transcript, d.liveSummary]).toEqual(['spoken text', 'so far']);
    const r = applyMeetingOps(d, [{ op: 'set', list: 'doc', field: 'liveSummary', value: 'x' }, { op: 'set', list: 'doc', field: 'transcript', value: 'x' }]);
    expect(r.applied).toEqual([]);
    expect([r.doc.transcript, r.doc.liveSummary]).toEqual(['spoken text', 'so far']);
    expect(meetingDocFromPage(meetingDocPage(d))?.model.liveSummary).toBe('so far');
  });
  it('the page round-trips; exports', () => {
    const html = meetingDocPage(base, { today: '2027-03-08', embed: true });
    expect(html).toContain('window.SC4SAP_PAGE');
    expect(meetingDocFromPage(html)?.model).toEqual(base);
    expect(meetingActionsCsv(base).split('\r\n')[0]).toBe('﻿ID,Text,Owner,Due,Status,Module,WBS,Agenda no,Carried');
    expect(meetingDocXlsx(base).subarray(0, 2).toString()).toBe('PK');
  });
  it('write back to /wbs: tasks for actions with an owner or a due, decisions with a decider; idempotent; carried actions keep their task', () => {
    const plan = meetingSyncPlan(base, project);
    expect(plan.added.tasks.map((t: any) => t.id)).toEqual([taskIdOf('MTG-01:A01'), taskIdOf('MTG-01:A02'), taskIdOf('MTG-01:A03')]);
    expect(plan.added.tasks[0]).toMatchObject({ type: 'task', owner: pm.id, finish: '2027-03-09', status: 'notstarted' });
    expect((plan.added.tasks[1] as any).note).toBe('Minutes 2027-03-08: PMO weekly · Owner: Kim');
    expect(plan.added.decisions.map((x: any) => x.id)).toEqual(['MTG.MTG-01.D01']);
    const after = applyMeetingSync(project, plan);
    expect(checkModel(normalizeModel(after)).errors).toEqual([]);
    expect(meetingSyncPlan(base, after).empty).toBe(true);
    expect(after.risks).toEqual(project.risks);
    expect(after.wbs.length).toBe(project.wbs.length + 3);
    // the next minutes carry A01 / A03 / A04: the same tasks, so changes only, no new task for what was sent
    const next = carryOverMeeting(base, { id: 'MTG-02', date: '2027-03-15' });
    next.actions[0].status = 'done';
    const p2 = meetingSyncPlan(next, after);
    expect(p2.added.tasks).toEqual([]);
    expect(p2.tasks.find((x: any) => x.id === taskIdOf('MTG-01:A01'))?.changes.map((c: any) => c.field)).toContain('status');
  });
  it('write back never wipes /wbs values: blank keeps, notes append once, a backward status is only flagged', () => {
    const id = taskIdOf('MTG-01:A01');
    const proj = { ...project, wbs: [...project.wbs, { id, parent: project.wbs[0].id, label: 'Old label', type: 'task', owner: pm.id, finish: '2026-12-01', status: 'inprogress', note: 'PM note' }],
      decisions: [{ id: 'MTG.MTG-01.D01', text: 'Old', status: 'decided', owner: '', due: '', decided: '2027-03-01', note: 'PMO basis' }] };
    const doc = normalizeMeetingDoc({ ...base, actions: base.actions.map((a: any, i: number) => (i === 0 ? { ...a, owner: '', due: '', status: 'open' } : a)) });
    const plan = meetingSyncPlan(doc, proj);
    const ch = plan.tasks.find((x: any) => x.id === id)!.changes;
    expect(ch.map((c: any) => c.field).sort()).toEqual(['label', 'note']);
    expect(ch.find((c: any) => c.field === 'note').to).toBe('PM note\nMinutes 2027-03-08: PMO weekly');
    expect(plan.flagged).toEqual([{ key: `tasks:${id}:status`, list: 'tasks', id, field: 'status', from: 'inprogress', to: 'notstarted' }]);
    expect(plan.decisions[0].changes.find((c: any) => c.field === 'note').to).toMatch(/^PMO basis\nMinutes 2027-03-08: /);
    const after = applyMeetingSync(proj, plan);
    const t = after.wbs.find((w: any) => w.id === id);
    expect([t.owner, t.finish, t.status]).toEqual([pm.id, '2026-12-01', 'inprogress']);
    expect(after.decisions[0].note.startsWith('PMO basis\n')).toBe(true);
    // pressing again: the line is in the note already → nothing but the flag
    const again = meetingSyncPlan(doc, after);
    expect([again.tasks, again.decisions, again.added.tasks, again.added.decisions]).toEqual([[], [], [], []]);
    expect(again.flagged.length).toBe(1);
    // the user ticks the flag → written; a key not in the plan does nothing
    const ticked = applyMeetingSync(after, again, [`tasks:${id}:status`, 'tasks:other:status']);
    expect(ticked.wbs.find((w: any) => w.id === id).status).toBe('notstarted');
    expect(applyMeetingSync(after, again, []).wbs.find((w: any) => w.id === id).status).toBe('inprogress');
  });
});

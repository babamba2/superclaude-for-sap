/**
 * Data migration document (the web's /migration, B2): model, the rules → the reconciliation read's checks,
 * SAP counts and source values into results, the verdict suggestion, AI proposals and exports.
 */
import { describe, it, expect } from 'vitest';
import {
  applyMigrationOps, applySapCounts, blankMigrationDoc, checkMigrationDoc, importSourceCsv, migrationDocFromPage, migrationDocFromProject,
  migrationDocPage, migrationDocXlsx, migrationResultsCsv, normalizeMigrationDoc, parseFilter, ruleChecks, suggestVerdict, RUN_IDS,
} from '../../scripts/project/migration-doc.mjs';

const base = normalizeMigrationDoc({
  id: 'MIG-01', lang: 'en',
  objects: [{ id: 'O01', module: 'mm', name: 'Material master', catalog: 'material', owner: 'Kim', status: 'inprogress' }, { id: 'O02', name: 'Customers', catalog: 'customer' }],
  rules: [
    { id: 'R01', objectId: 'O01', kind: 'count', table: 'mara', filter: "LVORM = ''" },
    { id: 'R02', objectId: 'O01', kind: 'sum', table: 'MARD', field: 'labst', filter: 'WERKS in 1000,2000', groupBy: 'werks', tolerance: '0.5%' },
    { id: 'R03', objectId: 'O02', kind: 'count', table: 'KNA1', groupBy: 'KTOKD' },
    { id: 'R04', objectId: 'O01', kind: 'empty', table: 'MARA', field: '' },
  ],
});

describe('migration document', () => {
  it('normalizes: four runs always, upper-case names, unknown values back to defaults', () => {
    expect(base.runs.map((r) => r.id)).toEqual(RUN_IDS);
    expect(base.runs[0]!.label).toBe('Mock 1');
    expect(base.objects[0]!.module).toBe('MM');
    expect([base.rules[1]!.table, base.rules[1]!.field, base.rules[1]!.groupBy]).toEqual(['MARD', 'LABST', 'WERKS']);
    const odd = normalizeMigrationDoc({ objects: [{ status: 'x', approach: 'y' }], rules: [{ kind: 'max', table: "KNA1'; --" }], results: [{ runId: 'M9', verdict: 'great', target: 'abc' }] });
    expect([odd.objects[0]!.status, odd.objects[0]!.approach, odd.rules[0]!.kind, odd.rules[0]!.table]).toEqual(['planned', '', 'count', '']);
    expect([odd.results[0]!.runId, odd.results[0]!.verdict, odd.results[0]!.target]).toEqual(['M1', '', '']);
    expect(blankMigrationDoc({ id: 'X', lang: 'ko' }).title).toBe('데이터 이관');
  });
  it('checks: duplicate ids are errors; a rule without a table or field and a bad filter are warnings', () => {
    const c = checkMigrationDoc({ ...base, rules: [...base.rules, { id: 'R01', objectId: 'O9', kind: 'count', table: 'MARA', filter: 'NAME1 like x' }] });
    expect(c.errors).toContain('duplicate rule id R01');
    expect(c.warnings.some((w: string) => w.includes('R04: empty needs a field'))).toBe(true);
    expect(c.warnings.some((w: string) => w.includes('object O9 not in the list'))).toBe(true);
    expect(c.warnings.some((w: string) => w.includes('filter'))).toBe(true);
  });
  it('filters: literals only; = <> >= <= in between', () => {
    expect(parseFilter("LVORM = ''; WERKS in 1000, 2000; ERSDA between 20260101 and 20261231; MTART <> HAWA")).toEqual([
      { field: 'LVORM', op: '=', value: '' },
      { field: 'WERKS', op: 'in', value: ['1000', '2000'] },
      { field: 'ERSDA', op: 'between', value: ['20260101', '20261231'] },
      { field: 'MTART', op: '<>', value: 'HAWA' },
    ]);
    expect(() => parseFilter("MTART = 'X' OR 'A'='A'")).toThrow();
    expect(() => parseFilter('NAME1 like K%')).toThrow();
  });
  it("an object's rules become the read's checks; one that cannot run is listed, not sent", () => {
    const r = ruleChecks(base, 'O01');
    expect(r.object).toBe('material');
    expect(r.ruleIds).toEqual(['R01', 'R02']);
    expect(r.checks).toEqual([
      { kind: 'count', table: 'MARA', where: [{ field: 'LVORM', op: '=', value: '' }], groupBy: [] },
      { kind: 'sum', table: 'MARD', field: 'LABST', where: [{ field: 'WERKS', op: 'in', value: ['1000', '2000'] }], groupBy: ['WERKS'] },
    ]);
    expect(r.skipped).toEqual([{ ruleId: 'R04', why: 'empty needs a field' }]);
    expect(() => ruleChecks({ ...base, objects: [{ id: 'O01', name: 'x' }] }, 'O01')).toThrow(/catalog/);
  });
  it('SAP counts go into the run, per rule and group; "<5" stays; source, verdict and cause are kept', () => {
    const first = applySapCounts(base, {
      runId: 'M1', ruleIds: ['R01', 'R02'], system: 'S4-DEV', at: '2026-11-17T12:00',
      results: [{ rows: [{ group: {}, count: 12000 }] }, { rows: [{ group: { WERKS: '1000' }, count: 10, amount: 55.5 }, { group: { WERKS: '2000' }, count: '<5', amount: null }] }],
    });
    expect(first.rows).toBe(3);
    const rs = first.doc.results;
    expect(rs.map((r: any) => [r.ruleId, r.group, r.target])).toEqual([['R01', '', '12000'], ['R02', 'WERKS=1000', '55.5'], ['R02', 'WERKS=2000', '<5']]);
    const edited = normalizeMigrationDoc({ ...first.doc, results: first.doc.results.map((r: any) => ({ ...r, source: '12010', verdict: 'check', cause: 'deleted ones' })) });
    const again = applySapCounts(edited, { runId: 'M1', ruleIds: ['R01'], system: 'S4-DEV', at: 't2', results: [{ rows: [{ group: {}, count: 12005 }] }] });
    const r1 = again.doc.results.find((r: any) => r.ruleId === 'R01');
    expect([r1.target, r1.source, r1.verdict, r1.cause, r1.readAt]).toEqual(['12005', '12010', 'check', 'deleted ones', 't2']);
    expect(again.doc.results.length).toBe(3);
  });
  it('source values from CSV per run; header and bad lines skipped; SAP values untouched', () => {
    const csv = 'rule,group,value\nR01,,12010\nR02,WERKS=1000,"1,000.5"\nR99,,1\nR01,,abc\n';
    const r = importSourceCsv(base, 'M2', csv);
    expect(r.rows).toBe(2);
    expect(r.skipped).toEqual([4, 5]);
    expect(r.doc.results.map((x: any) => [x.runId, x.ruleId, x.group, x.source, x.target])).toEqual([['M2', 'R01', '', '12010', ''], ['M2', 'R02', 'WERKS=1000', '1000.5', '']]);
  });
  it('verdict suggestion from the tolerance; never stored', () => {
    expect(suggestVerdict({ source: '100', target: '100' }, {})).toBe('ok');
    expect(suggestVerdict({ source: '1000', target: '996' }, { tolerance: '0.5%' })).toBe('check');
    expect(suggestVerdict({ source: '1000', target: '990' }, { tolerance: '0.5%' })).toBe('ng');
    expect(suggestVerdict({ source: '10', target: '<5' }, {})).toBe('check');
    expect(suggestVerdict({ source: '', target: '5' }, {})).toBe('');
  });
  it('AI proposals: texts and drafts only — never an owner, status, verdict, number, tolerance, run or system', () => {
    const r = applyMigrationOps(base, [
      { op: 'set', list: 'objects', id: 'O01', field: 'note', value: 'ok' },
      { op: 'add', list: 'rules', row: { objectId: 'O01', kind: 'count', table: 'MARC' } },
      { op: 'add', list: 'issues', row: { text: 'Units missing', owner: 'Lee', status: 'closed' } },
      { op: 'set', list: 'results', index: 0, field: 'cause', value: 'x' },
      { op: 'set', list: 'objects', id: 'O01', field: 'owner', value: 'Lee' },
      { op: 'set', list: 'objects', id: 'O01', field: 'status', value: 'done' },
      { op: 'set', list: 'results', index: 0, field: 'verdict', value: 'ok' },
      { op: 'set', list: 'results', index: 0, field: 'target', value: '1' },
      { op: 'set', list: 'rules', id: 'R01', field: 'tolerance', value: '99%' },
      { op: 'set', list: 'runs', index: 0, field: 'system', value: 'PRD' },
      { op: 'set', list: '__proto__', field: 'x', value: 1 },
    ]);
    expect(r.applied.length).toBe(3);
    expect(r.skipped.length).toBe(8);
    expect(r.doc.objects[0]!.owner).toBe('Kim');
    const issue = r.doc.issues.at(-1)!;
    expect([issue.owner, issue.status]).toEqual(['', 'open']);
    expect(r.doc.rules.at(-1)!.id).toBe('R05');
    expect(({} as any).x).toBeUndefined();
  });
  it('from a project: conversion WRICEF items become objects, mock milestones the run dates', () => {
    const project = {
      project: { code: 'P1' },
      wbs: [{ id: 'C1', type: 'wricef', label: 'Customer conversion', ws: 'sd', wricef: { kind: 'C', stage: 'req' } }, { id: 'R1', type: 'wricef', label: 'Report', wricef: { kind: 'R' } }],
      milestones: [{ id: 'm', label: 'Mock 2 load', base: '2027-02-01' }, { id: 'g', label: 'Go-live', base: '2027-04-01' }],
    };
    const d = migrationDocFromProject(project, { id: 'MIG-P1', projectId: 'p', lang: 'en' });
    expect(d.objects.map((o: any) => [o.name, o.module])).toEqual([['Customer conversion', 'SD']]);
    expect(d.runs.map((r: any) => r.planStart)).toEqual(['', '2027-02-01', '', '2027-04-01']);
    expect(d.source).toEqual({ projectId: 'p', code: 'P1' });
  });
  it('the page round-trips; CSV with BOM; xlsx', () => {
    const html = migrationDocPage(base, { embed: true });
    expect(migrationDocFromPage(html)?.model).toEqual(base);
    const filled = applySapCounts(base, { runId: 'M1', ruleIds: ['R01'], results: [{ rows: [{ group: {}, count: 3 }] }] }).doc;
    expect(migrationResultsCsv(filled).split('\r\n')[0]).toBe('\uFEFFRun,Object,Rule,Kind,Table,Field,Group,Source value,SAP value,Verdict,Delta cause,System,Read at');
    expect(Buffer.from(migrationDocXlsx(filled)).subarray(0, 2).toString()).toBe('PK');
  });
});

describe('migration cockpit status words', () => {
  it('import states and test mode are shown with their meaning; other groups stay as read', () => {
    const doc = normalizeMigrationDoc({ id: 'M', lang: 'en', objects: [{ id: 'O1', catalog: 'cockpit' }], rules: [{ id: 'R1', objectId: 'O1', kind: 'count', table: 'DMC_MIGINST', groupBy: 'IMPORT_STATE' }, { id: 'R2', objectId: 'O1', kind: 'count', table: 'DMC_MIGEXEC', groupBy: 'TESTRUN' }] });
    const out = applySapCounts(doc, {
      runId: 'M1', ruleIds: ['R1', 'R2'],
      results: [{ rows: [{ group: { IMPORT_STATE: '3' }, count: 120 }, { group: { IMPORT_STATE: '1' }, count: 4 }, { group: { IMPORT_STATE: '' }, count: 9 }] }, { rows: [{ group: { TESTRUN: 'X' }, count: 2 }, { group: { TESTRUN: '' }, count: 1 }] }],
    }).doc;
    expect(out.results.map((r: any) => r.group)).toEqual(['IMPORT_STATE=3 (Imported)', 'IMPORT_STATE=1 (Failed)', 'IMPORT_STATE= (Not set)', 'TESTRUN=X (Simulation)', 'TESTRUN= (Real run)']);
    const ko = applySapCounts({ ...doc, lang: 'ko' }, { runId: 'M1', ruleIds: ['R1'], results: [{ rows: [{ group: { IMPORT_STATE: '2' }, count: 1 }] }] }).doc;
    expect(ko.results[0]!.group).toBe('IMPORT_STATE=2 (가져오기 준비)');
    const plain = applySapCounts(base, { runId: 'M1', ruleIds: ['R02'], results: [{ rows: [{ group: { WERKS: '1000' }, count: 3, amount: 1 }] }] }).doc;
    expect(plain.results[0]!.group).toBe('WERKS=1000');
  });
});

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { affectedJobs, buildCabModel, graphIdsOf, impactOf, indexGraph, requestImpact, riskOf, rollbackOf, writerInput, CODE_KINDS } from '../../scripts/transport/cab-model.mjs';
import { evidenceFor, lintNote, parseEvidence, parseWriter } from '../../scripts/transport/cab-evidence.mjs';
import { applyEdits, fromPage, renderHtml, renderSummary } from '../../scripts/transport/cab-page.mjs';
import { build, importPage, prepare, save } from '../../scripts/transport/build-cab-notes.mjs';
import { buildModel as relmapModel } from '../../scripts/relmap/relmap-model.mjs';

const E = (from: string, to: string, kind: string) => ({ from, to, kind, count: 1, evidence: [{ unit: 'X', line: 1, text: '' }] });
const graph = {
  package: 'ZFOO', module: 'SD', system: 'DEV',
  nodes: [
    { id: 'TRAN:ZFOO1', type: 'TRAN', name: 'ZFOO1', scope: 'member' },
    { id: 'TRAN:ZFOO2', type: 'TRAN', name: 'ZFOO2', scope: 'member' },
    { id: 'PROG:ZFOO_REPORT', type: 'PROG', name: 'ZFOO_REPORT', scope: 'member' },
    { id: 'INCL:ZFOO_REPORT_F01', type: 'INCL', name: 'ZFOO_REPORT_F01', scope: 'member', parent: 'PROG:ZFOO_REPORT' },
    { id: 'PROG:ZFOO_BATCH', type: 'PROG', name: 'ZFOO_BATCH', scope: 'member' },
    { id: 'TABL:ZFOO_HEAD', type: 'TABL', name: 'ZFOO_HEAD', scope: 'member' },
    { id: 'TABL:ZFOO_ITEM', type: 'TABL', name: 'ZFOO_ITEM', scope: 'member' },
    { id: 'DTEL:ZFOO_NO', type: 'DTEL', name: 'ZFOO_NO', scope: 'member' },
    { id: 'FUGR:ZFOO_FG', type: 'FUGR', name: 'ZFOO_FG', scope: 'member' },
    { id: 'FUNC:ZFOO_GET', type: 'FUNC', name: 'ZFOO_GET', scope: 'member', parent: 'FUGR:ZFOO_FG' },
    { id: 'CLAS:ZCL_FOO', type: 'CLAS', name: 'ZCL_FOO', scope: 'member' },
    { id: 'TABL:MARA', type: 'TABL', name: 'MARA', scope: 'standard' },
  ],
  edges: [
    E('TRAN:ZFOO1', 'PROG:ZFOO_REPORT', 'launches'), E('PROG:ZFOO_REPORT', 'INCL:ZFOO_REPORT_F01', 'include'),
    E('INCL:ZFOO_REPORT_F01', 'TABL:ZFOO_HEAD', 'reads'), E('TABL:ZFOO_HEAD', 'DTEL:ZFOO_NO', 'types'),
    E('TABL:ZFOO_ITEM', 'DTEL:ZFOO_NO', 'types'), E('TABL:ZFOO_ITEM', 'TABL:ZFOO_HEAD', 'checks'),
    E('PROG:ZFOO_BATCH', 'TABL:ZFOO_ITEM', 'writes'), E('TRAN:ZFOO2', 'PROG:ZFOO_BATCH', 'launches'),
    E('PROG:ZFOO_REPORT', 'FUNC:ZFOO_GET', 'calls'), E('PROG:ZFOO_BATCH', 'CLAS:ZCL_FOO', 'uses'), E('PROG:ZFOO_REPORT', 'TABL:MARA', 'reads'),
  ],
};
const info = { desc: new Map([['TRAN:ZFOO1', 'Display foo'], ['TRAN:ZFOO2', 'Foo batch']]), usage: new Map([['TRAN:ZFOO1', 'direct'], ['TRAN:ZFOO2', 'unused']]), jobs: new Set(['PROG:ZFOO_BATCH']) };
const G = indexGraph(graph);

const collect = () => ({
  system: 'DEV', target: 'QAS', readAt: '2026-11-16 10:00',
  requests: [
    { trkorr: 'DEVK900001', kind: 'workbench', status: 'open', owner: 'DEV01', text: '[SD] Foo number length' },
    { trkorr: 'DEVK900002', kind: 'customizing', status: 'open', owner: 'DEV02', text: '[SD] Foo settings' },
  ],
  tasks: [{ trkorr: 'DEVK900011', parent: 'DEVK900001', status: 'released', owner: 'DEV01' }],
  objects: [
    { trkorr: 'DEVK900001', pgmid: 'LIMU', object: 'REPS', name: 'ZFOO_REPORT' },
    { trkorr: 'DEVK900001', pgmid: 'R3TR', object: 'DTEL', name: 'ZFOO_NO' },
    { trkorr: 'DEVK900002', pgmid: 'R3TR', object: 'TABU', name: 'ZFOO_CONFIG' },
    { trkorr: 'DEVK900002', pgmid: 'R3TR', object: 'PROG', name: 'ZBAR_TOOL' },
  ],
  others: { ok: true, rows: [] }, inactive: { ok: true, scope: 'all', rows: [] }, deps: { ok: true, rows: [] },
  tadir: { ok: true, rows: [{ object: 'PROG', name: 'ZFOO_REPORT', package: 'ZFOO' }, { object: 'DTEL', name: 'ZFOO_NO', package: 'ZFOO' }, { object: 'PROG', name: 'ZBAR_TOOL', package: 'ZBAR' }] },
  jobs: { ok: true, rows: [{ job: 'Z_FOO_NIGHTLY', program: 'ZFOO_BATCH', status: 'S' }, { job: 'Z_OTHER', program: 'ZOTHER', status: 'P' }] },
});
const card = (over: Record<string, unknown> = {}) => ({ trkorr: 'DEVK900009', kind: 'workbench', verdict: 'ready', objects: [{ type: 'PROG', name: 'ZFOO_X', object: 'PROG', pgmid: 'R3TR' }],
  impact: { status: 'ok', tcodes: [] as { name: string; usage: string }[], programs: [], usageJobs: [], missingPackages: [] }, jobs: [], evidence: [{ source: 'uat' }], ...over });
const tcodes = (n: number, usage = 'indirect') => Array.from({ length: n }, (_, i) => ({ name: `ZT${i}`, text: '', usage }));

describe('CAB notes — E071 → graph ids', () => {
  it('maps whole objects and LIMU parts to their owner', () => {
    const ids = (object: string, name: string, pgmid = 'LIMU') => graphIdsOf({ pgmid, object, name })[0];
    expect(ids('REPS', 'ZFOO_REPORT')).toBe('PROG:ZFOO_REPORT');
    expect(ids('PROG', 'ZFOO_REPORT', 'R3TR')).toBe('PROG:ZFOO_REPORT');
    expect(ids('FUNC', 'ZFOO_GET')).toBe('FUNC:ZFOO_GET');
    expect(ids('METH', `${'ZCL_FOO'.padEnd(30)}GET_DATA`)).toBe('CLAS:ZCL_FOO');
    expect(ids('CINC', 'ZCL_FOO=======CCIMP')).toBe('CLAS:ZCL_FOO');
    expect(ids('CPRI', 'ZCL_FOO')).toBe('CLAS:ZCL_FOO');
    expect(ids('TABD', 'ZFOO_HEAD')).toBe('TABL:ZFOO_HEAD');
    expect(ids('DYNP', 'ZFOO_REPORT                             0100')).toBe('PROG:ZFOO_REPORT');
    expect(ids('DTED', 'ZFOO_NO')).toBe('DTEL:ZFOO_NO');
    expect(graphIdsOf({ pgmid: 'R3TR', object: 'NROB', name: 'ZFOO' })).toEqual([]);
  });
});

describe('CAB notes — impact', () => {
  it('walks like the relmap page: first step over every relation, then code relations only', () => {
    const im = impactOf(G, ['DTEL:ZFOO_NO']);
    expect(im.tcodes.sort()).toEqual(['TRAN:ZFOO1', 'TRAN:ZFOO2']);
    expect(im.nodes).not.toContain('TABL:MARA');
    // the check-table relation counts only on the first step
    expect(impactOf(G, ['TABL:ZFOO_HEAD']).nodes).toContain('TABL:ZFOO_ITEM');
    expect(impactOf(G, ['DTEL:ZFOO_NO']).nodes.filter((x) => x.startsWith('TABL:'))).toEqual(['TABL:ZFOO_HEAD', 'TABL:ZFOO_ITEM']);
  });

  it('reaches the same TCodes as the relmap page model for every node', () => {
    const M = relmapModel(graph, { fold: false });
    const name = (i: number) => `${M.types[M.nodes[i][1]]}:${M.nodes[i][0]}`;
    const inn: number[][] = M.nodes.map(() => []);
    M.edges.forEach((e: number[], k: number) => inn[e[1]].push(k));
    const code = new Set(CODE_KINDS.map((k) => M.kinds.indexOf(k)).filter((i) => i >= 0));
    const pageImpact = (i: number) => {
      const depth = new Map([[i, 0]]); let q = [i];
      for (let d = 1; d <= 6 && q.length; d++) {
        const next: number[] = [];
        for (const x of q) for (const k of inn[x]) { const e = M.edges[k]; if (d > 1 && !code.has(e[2])) continue; if (!depth.has(e[0])) { depth.set(e[0], d); next.push(e[0]); } }
        q = next;
      }
      return [...depth.keys()].filter((x) => x !== i && M.types[M.nodes[x][1]] === 'TRAN').map(name).sort();
    };
    M.nodes.forEach((_: unknown, i: number) => expect(impactOf(G, [name(i)]).tcodes.sort()).toEqual(pageImpact(i)));
  });

  it('says "not collected" without a graph, "partial" when a package has none — never "none"', () => {
    const objs = collect().objects;
    const pkg = new Map([['PROG ZBAR_TOOL', 'ZBAR'], ['PROG ZFOO_REPORT', 'ZFOO']]);
    expect(requestImpact(objs.slice(0, 2), [], pkg).impact.status).toBe('not-collected');
    const part = requestImpact(objs, [{ G, info }], pkg);
    expect(part.impact.status).toBe('partial');
    expect(part.impact.missingPackages).toEqual(['ZBAR']);
    expect(part.objects.find((o) => o.name === 'ZBAR_TOOL')!.graph).toBe('not-collected');
    expect(part.impact.tcodes.find((t) => t.name === 'ZFOO1')).toMatchObject({ text: 'Display foo', usage: 'direct' });
    expect(part.impact.usageJobs).toEqual(['ZFOO_BATCH']);
    // an object whose package is unknown (no TADIR row) is not collected — not "not in graph"
    const unknown = requestImpact([{ pgmid: 'R3TR', object: 'PROG', name: 'ZQUX_NEW' }], [{ G, info }], new Map());
    expect(unknown.objects[0].graph).toBe('not-collected');
    expect(requestImpact([{ pgmid: 'R3TR', object: 'PROG', name: 'ZFOO_GONE' }], [{ G, info }], new Map([['PROG ZFOO_GONE', 'ZFOO']])).objects[0].graph).toBe('not-in-graph');
    // a LIMU part takes the package of its owner's TADIR row
    expect(requestImpact([{ pgmid: 'LIMU', object: 'REPS', name: 'ZFOO_GONE' }], [{ G, info }], new Map([['PROG ZFOO_GONE', 'ZFOO']])).objects[0]).toMatchObject({ package: 'ZFOO', graph: 'not-in-graph' });
  });

  it('a truncated job read raises the job risk and says so on the page', () => {
    const c = collect();
    (c.jobs as Record<string, unknown>).truncated = true;
    c.jobs.rows = [];
    const m = buildCabModel(c, { graphs: [{ G, info: { ...info, jobs: new Set() } }] });
    expect(m.requests[0].risk.reasons.map((x: { code: string }) => x.code)).toContain('jobs-truncated');
    expect(m.requests[0].risk.level).toBe('H');
    expect(renderHtml(m, 'en')).toContain('truncated — list incomplete');
  });

  it('one line per object: program parts fold into the program, ADIR entries read as their object', () => {
    const objs = [
      { pgmid: 'R3TR', object: 'PROG', name: 'ZFOO_REPORT' }, { pgmid: 'LIMU', object: 'REPS', name: 'ZFOO_REPORT' },
      { pgmid: 'LIMU', object: 'REPT', name: 'ZFOO_REPORT' }, { pgmid: 'LIMU', object: 'METH', name: `${'ZCL_FOO'.padEnd(30)}GET` },
      { pgmid: 'LIMU', object: 'ADIR', name: 'R3TRPROGZFOO_BATCH' },
    ];
    const r = requestImpact(objs, [{ G, info }], new Map());
    expect(r.objects.map((o) => `${o.pgmid} ${o.object} ${o.name} ${o.graph}`)).toEqual(['R3TR PROG ZFOO_REPORT found', 'LIMU CLAS ZCL_FOO found', 'R3TR PROG ZFOO_BATCH found']);
  });

  it('jobs on a request without impact: "not collected", never a bare 0', () => {
    const c = collect();
    const m = buildCabModel(c, {});
    expect(m.requests[0]).toMatchObject({ jobsScope: 'own', jobs: [] });
    const html = renderHtml(m, 'en');
    expect(html).toContain('not collected — only the programs in the request were checked');
    expect(html).not.toMatch(/Scheduled jobs<\/b>: 0/);
    expect(renderHtml(m, 'ko')).toContain('미수집 — 요청 자체 프로그램만 확인했어요');
    // partial impact and no job found: say it is partly not collected, not a bare 0
    const p = buildCabModel({ ...collect(), jobs: { ok: true, rows: [] } }, { graphs: [{ G, info: { ...info, jobs: new Set() } }] });
    const part = p.requests.find((r: { trkorr: string }) => r.trkorr === 'DEVK900002')!;
    expect(part.impact.status).toBe('not-collected');
    const one = buildCabModel({ ...collect(), jobs: { ok: true, rows: [] }, objects: [...collect().objects, { trkorr: 'DEVK900002', pgmid: 'R3TR', object: 'PROG', name: 'ZFOO_REPORT' }] }, { graphs: [{ G, info: { ...info, jobs: new Set() } }] });
    const r2 = one.requests.find((r: { trkorr: string }) => r.trkorr === 'DEVK900002')!;
    expect(r2).toMatchObject({ jobsScope: 'partial', jobs: [] });
    expect(renderHtml(one, 'en')).toContain('none found — checked for 2 program(s) only (part of the impact not collected)');
    expect(renderHtml(one, 'ko')).toContain('일부만 확인 (2개 프로그램)');
    // only the fully collected card (DEVK900001) may say 0
    expect((renderHtml(one, 'ko').match(/예약 잡<\/b>: 0/g) || []).length).toBe(1);
  });

  it('jobs: scheduled jobs that run an affected program; null when not read', () => {
    expect(affectedJobs(collect().jobs, ['ZFOO_BATCH'])).toEqual([{ job: 'Z_FOO_NIGHTLY', program: 'ZFOO_BATCH', status: 'S' }]);
    expect(affectedJobs({ ok: false, rows: [] }, ['ZFOO_BATCH'])).toBeNull();
    expect(affectedJobs(undefined, ['ZFOO_BATCH'])).toBeNull();
  });
});

describe('CAB notes — risk', () => {
  const level = (o: Record<string, unknown>) => riskOf(card(o) as never).level;
  it('H on blocked, DDIC data objects, ≥ 10 TCodes, a used TCode, a scheduled job', () => {
    expect(level({ verdict: 'blocked' })).toBe('H');
    expect(level({ objects: [{ type: 'DTEL', name: 'ZFOO_NO', object: 'DTEL', pgmid: 'R3TR' }] })).toBe('H');
    expect(level({ impact: { status: 'ok', tcodes: tcodes(10), programs: [], usageJobs: [], missingPackages: [] } })).toBe('H');
    expect(level({ impact: { status: 'ok', tcodes: tcodes(1, 'direct'), programs: [], usageJobs: [], missingPackages: [] } })).toBe('H');
    expect(level({ jobs: [{ job: 'Z_J', program: 'ZFOO_X', status: 'S' }] })).toBe('H');
  });
  it('M on CTS check, customizing, 1–9 TCodes, no evidence; L otherwise', () => {
    expect(level({ verdict: 'check' })).toBe('M');
    expect(level({ kind: 'customizing' })).toBe('M');
    expect(level({ impact: { status: 'ok', tcodes: tcodes(9), programs: [], usageJobs: [], missingPackages: [] } })).toBe('M');
    expect(level({ evidence: [] })).toBe('M');
    expect(level({})).toBe('L');
  });
});

describe('CAB notes — rollback facts', () => {
  const r = { trkorr: 'DEVK900001', kind: 'workbench', objects: [
    { pgmid: 'R3TR', object: 'PROG', name: 'ZFOO_REPORT', type: 'PROG' }, { pgmid: 'R3TR', object: 'PROG', name: 'ZFOO_NEW', type: 'PROG' },
    { pgmid: 'R3TR', object: 'TABL', name: 'ZFOO_HEAD', type: 'TABL' }] };
  it('target read: previous version from VRSD, new object, DDIC data — after "no automatic rollback"', () => {
    const lines = rollbackOf(r, { ok: true, tadir: [{ object: 'PROG', name: 'ZFOO_REPORT' }], versions: [{ objtype: 'REPS', objname: 'ZFOO_REPORT', korrnum: 'DEVK900000' }] });
    expect(lines[0].code).toBe('no-auto');
    expect(lines).toEqual(expect.arrayContaining([{ code: 'prev-version', obj: 'PROG ZFOO_REPORT', korrnum: 'DEVK900000' }, { code: 'new-object', obj: 'PROG ZFOO_NEW' }, { code: 'ddic-data', obj: 'ZFOO_HEAD' }]));
  });
  it('previous version: restore from version management into a new request — never "re-import the old request"', () => {
    const c = { ...collect(), targetSystem: { ok: true, tadir: [{ object: 'DTEL', name: 'ZFOO_NO' }], versions: [{ objtype: 'REPS', objname: 'ZFOO_REPORT', korrnum: 'QASK900005' }] } };
    const m = buildCabModel(c, {});
    const en = renderHtml(m, 'en'), ko = renderHtml(m, 'ko');
    expect(en).toContain('restore that version from version management and move it with a new request; do not import the old request again');
    expect(ko).toContain('이전 버전 (QASK900005)을 버전 관리에서 복원해 새 요청으로 이관 — 예전 요청 재이관 금지');
    expect(en).not.toMatch(/re-?import (the )?previous/i);
    expect(en).not.toMatch(/undo with a new request built from/i);
  });
  it('target not read: "target unchecked" and nothing that says it can be undone', () => {
    const lines = rollbackOf(r, { ok: false });
    expect(lines.map((x) => x.code)).toEqual(['no-auto', 'ddic-data', 'target-unread']);
    const m = buildCabModel({ ...collect(), targetSystem: undefined }, {});
    const html = renderHtml(m, 'ko') + renderHtml(m, 'en');
    expect(html).toContain('대상 미확인');
    expect(html).not.toMatch(/되돌리기 가능|can be rolled back|rollback possible/i);
  });
  it('says "+N more" when the object list is cut at 20', () => {
    const many = { trkorr: 'DEVK900003', kind: 'workbench', objects: Array.from({ length: 23 }, (_, i) => ({ pgmid: 'R3TR', object: 'PROG', name: `ZFOO_P${i}`, type: 'PROG' })) };
    const lines = rollbackOf(many, { ok: true, tadir: [], versions: [] });
    expect(lines.filter((x) => x.code === 'new-object')).toHaveLength(20);
    expect(lines.at(-1)).toEqual({ code: 'more', n: 3 });
  });
  it('customizing: a new request with the previous values', () => {
    expect(rollbackOf({ trkorr: 'DEVK900002', kind: 'customizing', objects: [{ pgmid: 'R3TR', object: 'TABU', name: 'ZFOO_CONFIG', type: 'CONTENT' }] }, null).map((x) => x.code))
      .toEqual(['no-auto', 'customizing', 'target-unread']);
  });
  it('ko writes the request type and the evidence results in Korean; cycle names and en stay as they are', () => {
    const m = buildCabModel({ ...collect(), targetSystem: undefined }, {});
    m.requests[0].evidence = [
      { source: 'wricef', how: 'direct', ref: 'P/W1', text: 'Foo report', result: 'sit' },
      { source: 'issue', how: 'direct', ref: 'S/I1', text: 'Price wrong', result: 'waiting' },
      { source: 'uat', how: 'heuristic', ref: 'S/SC/ST', text: 'ZFOO1', result: '2nd fail' },
      { source: 'uat', how: 'heuristic', ref: 'S/SC/ST2', text: 'ZFOO2', result: 'open' },
    ];
    const ko = renderHtml(m, 'ko'), en = renderHtml(m, 'en');
    expect(ko).toContain('Foo report — SIT');
    expect(ko).toContain('Price wrong — 대기');
    expect(ko).toContain('ZFOO1 — 2nd 실패');
    expect(ko).toContain('ZFOO2 — 미실행');
    expect(ko).toContain(' · 워크벤치 · ');
    expect(en).toContain('ZFOO1 — 2nd fail');
    expect(en).toContain(' · workbench · ');
  });
});

describe('CAB notes — evidence', () => {
  const r = { trkorr: 'DEVK900001', objects: [{ name: 'ZFOO_REPORT', type: 'PROG' }], impact: { tcodes: [{ name: 'ZFOO1' }] } };
  const project = { kind: 'project', model: { wbs: [
    { id: 'W1', label: 'Foo report', wricef: { stage: 'fut', trs: ['DEVK900001'], objects: [] } },
    { id: 'W2', label: 'Foo batch', wricef: { stage: 'sit', trs: [], objects: ['ZFOO_REPORT'] } },
    { id: 'W3', label: 'Other', wricef: { stage: 'done', trs: ['DEVK900077'], objects: ['ZOTHER'] } }] } };
  const uat = { kind: 'uat', set: { id: 'SD-OTC', cycles: ['1st', '2nd'], scenarios: [{ id: 'SD01', steps: [
    { id: 'STEP-001', tcode: 'ZFOO1', activity: 'Display foo', results: { '1st': 'fail', '2nd': 'pass' } },
    { id: 'STEP-002', tcode: 'VA01', activity: 'Create order', results: { '1st': 'pass' } }] }],
    issues: [{ id: 'ISS-0001', scenario: 'SD01', step: 'STEP-001', text: 'Wrong length', state: 'done', transports: ['DEVK900001'] }] } };
  it('WRICEF by request and by objects; UAT issue linked directly (P9); T-code steps as heuristic', () => {
    const ev = evidenceFor(r, [project, uat]);
    expect(ev.map((e) => `${e.source}:${e.how}:${e.ref}`)).toEqual(['wricef:direct:PROJECT/W1', 'wricef:objects:PROJECT/W2', 'issue:direct:SD-OTC/ISS-0001']);
    expect(ev[2].result).toBe('2nd pass');
    const noLink = { kind: 'uat', set: { ...uat.set, issues: [] } };
    expect(evidenceFor(r, [noLink])).toEqual([{ source: 'uat', how: 'heuristic', ref: 'SD-OTC/SD01/STEP-001', text: 'ZFOO1 Display foo', result: '2nd pass' }]);
    const trkorrField = { kind: 'uat', set: { ...uat.set, issues: [{ ...uat.set.issues[0], transports: undefined, trkorr: 'DEVK900001' }] } };
    expect(evidenceFor(r, [trkorrField])[0].how).toBe('direct');
    expect(evidenceFor(r, [])).toEqual([]);
  });
  it('reads evidence from pages and JSON', () => {
    expect(parseEvidence(`<script type="application/json" id="uat-model">${JSON.stringify(uat.set)}</script>`)?.kind).toBe('uat');
    expect(parseEvidence(`<script type="application/json" id="project-model">${JSON.stringify({ model: project.model })}</script>`)?.kind).toBe('project');
    expect(parseEvidence(JSON.stringify(project.model))?.kind).toBe('project');
    expect(parseEvidence('nothing')).toBeNull();
  });
});

describe('CAB notes — writer lint', () => {
  const input = writerInput({ trkorr: 'DEVK900001', kind: 'workbench', text: '[SD] Foo number length', objects: [{ type: 'DTEL', name: 'ZFOO_NO', text: 'Foo number' }],
    impact: { status: 'ok', tcodes: [{ name: 'ZFOO1', text: 'Display foo' }, { name: 'ZFOO2', text: '' }] }, jobs: [] } as never);
  it('accepts a text built from the input', () => {
    expect(lintNote('The foo number gets longer. It affects 2 transactions, ZFOO1 and ZFOO2 (data element ZFOO_NO).', input)).toEqual({ ok: true, problems: [] });
  });
  it('refuses names, T-codes and numbers that are not in the input', () => {
    const l = lintNote('Changes ZBAR_TABLE, used in VA01; 12 reports change.', input);
    expect(l.ok).toBe(false);
    expect(l.problems).toEqual([{ kind: 'name', token: 'ZBAR_TABLE' }, { kind: 'tcode', token: 'VA01' }, { kind: 'number', token: '12' }]);
  });
  it('matches whole names, not substrings of a longer name', () => {
    expect(lintNote('The field ZFOO changes.', input).problems).toEqual([{ kind: 'name', token: 'ZFOO' }]);
    expect(lintNote('ZFOO_NO changes in ZFOO1.', input).ok).toBe(true);
    expect(lintNote('Runs in ZFOO.', input).ok).toBe(false);
  });
  it('catches customer names in any case, but not plain words', () => {
    expect(lintNote('Changes zfoo_x and yrep1.', input).problems).toEqual([{ kind: 'name', token: 'zfoo_x' }, { kind: 'name', token: 'yrep1' }]);
    expect(lintNote('Your zero-touch change: zfoo_no in ZFOO1.', input).ok).toBe(true);
  });
  it('parses @@ blocks', () => {
    expect([...parseWriter('@@ DEVK900001\nLine one.\nLine two.\n@@ DEVK900002\nOther.')]).toEqual([['DEVK900001', 'Line one. Line two.'], ['DEVK900002', 'Other.']]);
  });
});

describe('CAB notes — CLI round trip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cab-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  it('prepare → save (lint) → build → edit → import keeps the edits', () => {
    const inv = join(dir, 'cbo', 'SD', 'ZFOO');
    mkdirSync(inv, { recursive: true });
    writeFileSync(join(inv, 'graph.json'), JSON.stringify(graph));
    writeFileSync(join(dir, 'collect.json'), JSON.stringify(collect()));
    const out = join(dir, 'out');
    const p = prepare({ in: join(dir, 'collect.json'), 'out-dir': out, 'graph-base': [join(dir, 'cbo')], 'cab-date': '2026-11-20' });
    expect(p).toMatchObject({ requests: 2, graphs: 1, jobsRead: true, impact: { DEVK900001: 'ok', DEVK900002: 'not-collected' } });
    const input = join(out, 'cab-input.json');
    writeFileSync(join(dir, 'w.txt'), '@@ DEVK900001\nThe foo number changes in ZFOO1.\n@@ DEVK900002\nAlso changes VA01.\n');
    const s = save({ in: input, file: join(dir, 'w.txt') });
    expect(s.saved).toBe(1);
    expect(s.refused).toEqual([{ trkorr: 'DEVK900002', problems: [{ kind: 'tcode', token: 'VA01' }] }]);
    const b = build({ in: input, 'out-dir': out, lang: 'ko' });
    const html = readFileSync(b.html, 'utf8');
    expect(b.html).toMatch(/cab-notes-2026-11-20-ko\.html$/);
    expect(html).toContain('AI 초안');
    expect(html).toContain('Z_FOO_NIGHTLY');
    const saved = html.replace('<script type="application/json" id="cab-edits">{}</script>',
      `<script type="application/json" id="cab-edits">${JSON.stringify({ 'note-DEVK900001': 'Foo numbers get two more digits.', 'decision-DEVK900001': 'approve', 'comment-DEVK900002': 'Retest first' })}</script>`);
    writeFileSync(join(dir, 'edited.html'), saved);
    const im = importPage({ _: ['import', join(dir, 'edited.html')], 'out-dir': out });
    expect(im).toMatchObject({ edited: 1, decided: 1 });
    const m = JSON.parse(readFileSync(input, 'utf8'));
    expect(m.requests[0]).toMatchObject({ note: { text: 'Foo numbers get two more digits.', source: 'human' }, decision: 'approve' });
    expect(m.requests[1].comment).toBe('Retest first');
    // a person's text is never overwritten by a later writer answer
    writeFileSync(join(dir, 'w2.txt'), '@@ DEVK900001\nThe foo number changes.\n');
    expect(save({ in: input, file: join(dir, 'w2.txt') }).keptHuman).toEqual(['DEVK900001']);
    expect(readFileSync(im.html, 'utf8')).toContain('수정됨');
  });
  it('evidence only from named files and the UAT sets the dashboard lists; packages with %', () => {
    const base = join(dir, 'ev');
    mkdirSync(join(base, 'cbo', 'ZFOO'), { recursive: true });
    writeFileSync(join(base, 'cbo', 'ZFOO', 'graph.json'), JSON.stringify(graph));
    writeFileSync(join(base, 'collect.json'), JSON.stringify(collect()));
    const set = (id: string) => ({ id, cycles: ['1st'], scenarios: [{ id: 'S1', steps: [{ id: 'STEP-001', tcode: 'ZFOO1', activity: 'Display', results: { '1st': 'pass' } }] }], issues: [] });
    for (const id of ['P1-UAT', 'OTHER-UAT']) { mkdirSync(join(base, 'uat', id), { recursive: true }); writeFileSync(join(base, 'uat', id, `${id}-uat.json`), JSON.stringify(set(id))); }
    // nothing named → no evidence, even with sets on disk
    const none = prepare({ in: join(base, 'collect.json'), 'out-dir': join(base, 'o1'), 'graph-base': [join(base, 'cbo')], packages: 'ZF%', 'uat-base': join(base, 'uat') });
    expect(none).toMatchObject({ graphs: 1, evidence: [] });
    expect(JSON.parse(readFileSync(join(base, 'o1', 'cab-input.json'), 'utf8')).requests[0].evidence).toEqual([]);
    // a dashboard naming P1-UAT (and a missing set) → only P1-UAT, labelled with its set id
    writeFileSync(join(base, 'dash.json'), JSON.stringify({ project: { code: 'P1', uatSets: ['P1-UAT', { id: 'GONE' }] }, wbs: [] }));
    const one = prepare({ in: join(base, 'collect.json'), 'out-dir': join(base, 'o2'), 'graph-base': [join(base, 'cbo')], evidence: [join(base, 'dash.json')], 'uat-base': join(base, 'uat') });
    expect(one.uatSetsMissing).toEqual(['GONE']);
    const refs = JSON.parse(readFileSync(join(base, 'o2', 'cab-input.json'), 'utf8')).requests[0].evidence.map((e: { ref: string }) => e.ref);
    expect(refs).toEqual(['P1-UAT/S1/STEP-001']);
    // ids from the dashboard become paths only when they pass the UAT id rule: "../x" never reads outside --uat-base
    mkdirSync(join(base, 'x'), { recursive: true });
    writeFileSync(join(base, 'x', 'x-uat.json'), JSON.stringify(set('x')));
    writeFileSync(join(base, 'dash2.json'), JSON.stringify({ project: { code: 'P1', uatSets: ['../x', '..\\x', 'a/b'] }, wbs: [] }));
    const bad = prepare({ in: join(base, 'collect.json'), 'out-dir': join(base, 'o3'), evidence: [join(base, 'dash2.json')], 'uat-base': join(base, 'uat') });
    expect(bad.uatSetsInvalid).toEqual(['../x', '..\\x', 'a/b']);
    expect(bad.evidence.filter((e: { kind: string }) => e.kind === 'uat')).toEqual([]);
    const m3 = JSON.parse(readFileSync(join(base, 'o3', 'cab-input.json'), 'utf8'));
    expect(m3.requests.every((r: { evidence: unknown[] }) => r.evidence.length === 0)).toBe(true);
    expect(renderHtml(m3, 'ko')).toContain('../x (잘못된 ID)');
  });
  it('escapes texts and renders en summary', () => {
    const c = collect();
    c.requests[0].text = '<img src=x onerror=alert(1)>';
    const m = buildCabModel(c, { graphs: [{ G, info }] });
    expect(renderHtml(m, 'en')).not.toContain('<img src=x');
    expect(renderSummary(m, 'en')).toMatch(/^Change notes for the CAB · DEV → QAS · High \d · Medium \d · Low \d/);
    expect(fromPage(renderHtml(m, 'en'))?.model.requests).toHaveLength(2);
    expect(applyEdits(m, {}).requests[0].note.source).toBe('');
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lookup, parseArgs, toMarkdown } from '../../scripts/graph/cbo-lookup.mjs';

const ev = (unit: string, line = 1) => [{ unit, line, text: `stmt in ${unit}` }];
const n = (type: string, name: string, scope = 'member') => ({ id: `${type}:${name}`, type, name, scope });
const e = (from: string, kind: string, to: string, ops?: string[]) => ({ from, to, kind, count: 1, evidence: ev(from.split(':')[1]), ...(ops ? { ops } : {}) });
const NOW = Date.parse('2026-11-27T00:00:00Z');

// package A: TCode ZA1 runs ZA1 (same name), ZA1 calls FM ZA_UPD, which updates ZTAB; ZA1 reads ZTAB
const gA = {
  package: 'ZPKA', module: 'SD', system: 'DEV1', sapVersion: 'ECC', builtAt: '2026-11-20T00:00:00Z', coverage: { parsed: 2 },
  nodes: [n('TRAN', 'ZA1'), n('PROG', 'ZA1'), n('FUNC', 'ZA_UPD'), n('TABL', 'ZTAB'), n('TABL', 'VBAK', 'standard')],
  edges: [e('TRAN:ZA1', 'launches', 'PROG:ZA1'), e('PROG:ZA1', 'calls', 'FUNC:ZA_UPD'), e('FUNC:ZA_UPD', 'writes', 'TABL:ZTAB', ['UPDATE']),
    e('PROG:ZA1', 'reads', 'TABL:ZTAB'), e('PROG:ZA1', 'reads', 'TABL:VBAK')],
};
// package B (another package, same system, old): ZB1 inserts into ZTAB of package A and updates VBAK; job program
const gB = {
  package: 'ZPKB', module: 'SD', system: 'DEV1', sapVersion: 'ECC', builtAt: '2026-09-01T00:00:00Z', coverage: { parsed: 1 },
  nodes: [n('TRAN', 'ZB1'), n('PROG', 'ZB1'), n('TABL', 'ZTAB', 'custom'), n('TABL', 'VBAK', 'standard')],
  edges: [e('TRAN:ZB1', 'launches', 'PROG:ZB1'), e('PROG:ZB1', 'writes', 'TABL:ZTAB', ['INSERT']), e('PROG:ZB1', 'writes', 'TABL:VBAK', ['UPDATE'])],
};
// the same package on another system: never merged
const gX = { ...gA, system: 'QAS', builtAt: '2026-11-26T00:00:00Z', edges: [...gA.edges, e('PROG:ZA1', 'writes', 'TABL:ZTAB', ['DELETE'])] };
const fieldsA = { tables: { ZTAB: { type: 'TABL', scope: 'member', fields: [{ name: 'STATUS' }, { name: 'KEY1' }] } }, structures: {},
  refs: [{ t: 'ZTAB', f: 'STATUS', op: 'U', from: 'FUNC:ZA_UPD', count: 1, evidence: ev('LZAU01', 5) }] };
const fieldsB = { tables: { ZTAB: { type: 'TABL', scope: 'custom', fields: [{ name: 'STATUS' }, { name: 'KEY1' }] } }, structures: {},
  refs: [{ t: 'ZTAB', f: '*', op: 'C', from: 'PROG:ZB1', count: 1, evidence: ev('ZB1', 9) }] };

const base = mkdtempSync(join(tmpdir(), 'cbo-lookup-'));
const put = (rel: string, file: string, data: unknown) => { mkdirSync(join(base, rel), { recursive: true }); writeFileSync(join(base, rel, file), JSON.stringify(data)); };
put('cbo/SD/ZPKA', 'graph.json', gA); put('cbo/SD/ZPKA', 'fields.json', fieldsA);
put('cbo/SD/ZPKB', 'graph.json', gB); put('cbo/SD/ZPKB', 'fields.json', fieldsB);
put('cbo/SD/ZPKB', 'usage-result.json', { objects: [{ id: 'PROG:ZB1', status: 'direct', reasons: ['job step'] }, { id: 'TRAN:ZB1', status: 'direct' }] });
put('other/cbo/SD/ZPKA', 'graph.json', gX);
put('cbo/SD/ZPKA/_prev-20261001', 'graph.json', { ...gA, edges: [] });
afterAll(() => rmSync(base, { recursive: true, force: true }));

const run = (command: string, refs: string[], bases = [join(base, 'cbo')], system = 'DEV1') => lookup({ bases, system, command, refs, now: NOW });

describe('cbo-lookup', () => {
  it('a bare name is the program, not the TCode of the same name; TCode reached and table changes listed', () => {
    const r: any = run('object', ['ZA1']);
    expect(r.searched).toBe(2); // _prev-* skipped
    const h = r.answers[0].hits[0];
    expect(h.id).toBe('PROG:ZA1');
    expect(h.callers.list.map((c: any) => c.id)).toEqual(['TRAN:ZA1']);
    expect(h.calls.list.map((c: any) => c.id)).toEqual(['FUNC:ZA_UPD']);
    expect(h.reads.list.map((c: any) => c.id)).toEqual(['TABL:ZTAB', 'TABL:VBAK']);
    expect(h.tcodes.list.map((t: any) => t.name)).toEqual(['ZA1']);
    expect(run('object', ['TRAN:ZA1']).answers[0].hits[0].id).toBe('TRAN:ZA1');
  });

  it('table: writers and readers merged over every graph of this system, with the TCodes and jobs that reach them', () => {
    const r: any = run('table', ['ZTAB']);
    const h = r.answers[0].hits[0];
    expect(r.graphs[h.graph].package).toBe('ZPKA'); // the member graph answers
    expect(h.alsoIn.map((i: number) => r.graphs[i].package)).toEqual(['ZPKB']);
    expect(h.writers.list.map((w: any) => `${w.id}:${w.ops.join('/')}:${w.tcodes.join(',')}`)).toEqual(['PROG:ZB1:INSERT:ZB1', 'FUNC:ZA_UPD:UPDATE:ZA1']); // programs first, then FMs
    expect(h.writers.list.find((w: any) => w.id === 'PROG:ZB1').jobs).toEqual(['ZB1']);
    expect(h.readers.list.map((w: any) => w.id)).toEqual(['PROG:ZA1']);
    // a standard table: only its customer readers and writers, from both packages
    const v: any = run('table', ['VBAK']).answers[0].hits[0];
    expect(v.scope).toBe('standard');
    expect(v.writers.list.map((w: any) => w.id)).toEqual(['PROG:ZB1']);
    expect(v.readers.list.map((w: any) => w.id)).toEqual(['PROG:ZA1']);
  });

  it('TABLE-FIELD: C R U D F per field merged from both fields.json; * = whole-row statement', () => {
    const f: any = run('table', ['ZTAB-STATUS']).answers[0].hits[0].field;
    expect(f.found).toBe(true);
    expect(f.fields).toHaveLength(1);
    expect(f.fields[0].ops.U.map((x: any) => x.from)).toEqual(['FUNC:ZA_UPD']);
    expect(f.fields[0].ops.C.map((x: any) => `${x.from}${x.row ? '*' : ''}`)).toEqual(['PROG:ZB1*']);
    expect(run('table', ['ZTAB-NOPE']).answers[0].hits[0].field.found).toBe(false);
  });

  it('impact: TCodes and programs a table change reaches, over both packages', () => {
    const h: any = run('impact', ['ZTAB']).answers[0].hits[0];
    expect(h.tcodes.list.map((t: any) => t.name)).toEqual(['ZA1', 'ZB1']);
    expect(h.programs.list).toEqual(['FUNC:ZA_UPD', 'PROG:ZA1', 'PROG:ZB1']);
    expect(h.jobs).toEqual(['ZB1']);
  });

  it('another system: marked, ranked last and never merged', () => {
    const r: any = run('table', ['ZTAB'], [join(base, 'cbo'), join(base, 'other', 'cbo')]);
    const h = r.answers[0].hits[0];
    expect(r.graphs[h.graph].otherSystem).toBe(false);
    expect(h.alsoIn.some((i: number) => r.graphs[i].otherSystem)).toBe(true);
    expect(h.writers.list.some((w: any) => w.ops.includes('DELETE'))).toBe(false);
    // alias and SID both accepted
    expect(run('table', ['ZTAB'], [join(base, 'other', 'cbo')], 'DEV-ALIAS,QAS').answers[0].hits[0].id).toBe('TABL:ZTAB');
  });

  it('notes: stale graph, not in any graph, nothing collected — never "unused"', () => {
    const r: any = run('table', ['ZTAB']);
    expect(r.answers[0].notes.join('\n')).toContain('ZPKB: graph built 2026-09-01');
    const miss: any = run('object', ['ZNOWHERE']);
    expect(miss.answers[0].hits).toEqual([]);
    expect(miss.answers[0].notes[0]).toContain('not in any of 2 stocked graph(s)');
    const none: any = run('object', ['ZA1'], [join(base, 'nothing')]);
    expect(none.searched).toBe(0);
    expect(none.answers[0].notes[0]).toContain('not collected');
  });

  it('markdown answer and CLI arguments', () => {
    const md = toMarkdown(run('table', ['ZTAB-STATUS']) as any);
    expect(md).toContain('**TABL:ZTAB**');
    expect(md).toContain('written by: PROG:ZB1 INSERT ← ZB1, FUNC:ZA_UPD UPDATE ← ZA1');
    expect(md).toContain('ZTAB-STATUS: C PROG:ZB1 (row)');
    expect(parseArgs(['--base', 'x', '--system', 'A,B', 'object', 'ZA', 'ZB', '--md'])).toMatchObject({ bases: ['x'], system: 'A,B', command: 'object', refs: ['ZA', 'ZB'], md: true });
    expect(() => parseArgs(['object', 'ZA'])).toThrow(/usage/);
    expect(() => parseArgs(['--base', '--md', 'object', 'ZA'])).toThrow(/needs a value/);
    expect(() => parseArgs(['--base', 'x', '--deep', 'object', 'ZA'])).toThrow(/unknown option/);
  });

  it('odd graph files do not break the lookup; two other systems are never merged with each other', () => {
    const b2 = mkdtempSync(join(tmpdir(), 'cbo-lookup-odd-'));
    try {
      const put2 = (rel: string, data: unknown) => { mkdirSync(join(b2, rel), { recursive: true }); writeFileSync(join(b2, rel, 'graph.json'), JSON.stringify(data)); };
      put2('SD/ZNOEDGE', { package: 'ZNOEDGE', system: 'DEV1', nodes: [n('PROG', 'ZA1')] });
      put2('SD/ZS1', { ...gB, package: 'ZS1', system: 'SYS1' });
      put2('SD/ZS2', { ...gB, package: 'ZS2', system: 'SYS2', edges: [...gB.edges, e('PROG:ZB1', 'writes', 'TABL:ZTAB', ['DELETE'])] });
      const r: any = lookup({ bases: [b2], system: 'DEV1', command: 'table', refs: ['ZTAB'], now: NOW });
      expect(r.searched).toBe(3);
      const h = r.answers[0].hits[0];
      expect(h.writers.list).toHaveLength(1);
      expect(h.writers.list[0].ops.length).toBe(1); // INSERT or DELETE from one system, never both
      expect(lookup({ bases: [b2], command: 'object', refs: ['ZA1'], now: NOW }).answers[0].hits[0].id).toBe('PROG:ZA1');
    } finally { rmSync(b2, { recursive: true, force: true }); }
  });

  it('the active system is one pool whether a graph carries the alias, the SID or no tag; null edges are skipped', () => {
    const b4 = mkdtempSync(join(tmpdir(), 'cbo-lookup-sys-'));
    try {
      const put4 = (rel: string, data: unknown) => { mkdirSync(join(b4, rel), { recursive: true }); writeFileSync(join(b4, rel, 'graph.json'), JSON.stringify(data)); };
      const g = (pkg: string, system: string | undefined, prog: string, op: string) => ({
        package: pkg, ...(system ? { system } : {}), coverage: { parsed: 1 }, nodes: [n('PROG', prog), n('TABL', 'ZT', pkg === 'ZA' ? 'member' : 'custom')],
        edges: [e(`PROG:${prog}`, 'writes', 'TABL:ZT', [op]), null],
      });
      put4('SD/ZA', g('ZA', 'DEV-ALIAS', 'ZPA', 'INSERT'));
      put4('SD/ZB', g('ZB', 'DSID', 'ZPB', 'UPDATE'));
      put4('SD/ZC', g('ZC', undefined, 'ZPC', 'DELETE'));
      put4('SD/ZQ', g('ZQ', 'QSID', 'ZPQ', 'MODIFY'));
      const r: any = lookup({ bases: [b4], system: 'DEV-ALIAS,DSID', command: 'table', refs: ['ZT'], now: NOW });
      expect(r.searched).toBe(4);
      expect(r.answers[0].hits[0].writers.list.map((w: any) => w.id)).toEqual(['PROG:ZPA', 'PROG:ZPB', 'PROG:ZPC']);
      expect(r.answers[0].notes).toContain('ZC: graph has no system tag — taken as the active system');
      // another system holding the code object must not take a bare name away from this system's TCode
      put4('SD/ZX', { package: 'ZX', system: 'QSID', nodes: [n('PROG', 'ZONLY')], edges: [] });
      put4('SD/ZY', { package: 'ZY', system: 'DSID', nodes: [n('TRAN', 'ZONLY')], edges: [] });
      expect(lookup({ bases: [b4], system: 'DEV-ALIAS,DSID', command: 'object', refs: ['ZONLY'], now: NOW }).answers[0].hits[0].id).toBe('TRAN:ZONLY');
    } finally { rmSync(b4, { recursive: true, force: true }); }
  });

  it('function groups: a group-level reader gets the TCodes of its FMs; an FM card shows its group code; no self callers', () => {
    const b3 = mkdtempSync(join(tmpdir(), 'cbo-lookup-fugr-'));
    try {
      const fg = {
        package: 'ZFG', system: 'DEV1', builtAt: '2026-11-25T00:00:00Z', coverage: { parsed: 1 },
        nodes: [n('TRAN', 'ZT1'), n('PROG', 'ZP1'), n('FUGR', 'ZGRP'), { ...n('FUNC', 'ZGRP_GET'), parent: 'FUGR:ZGRP' }, n('TABL', 'ZTAB')],
        edges: [e('TRAN:ZT1', 'launches', 'PROG:ZP1'), e('PROG:ZP1', 'calls', 'FUNC:ZGRP_GET'), e('FUGR:ZGRP', 'reads', 'TABL:ZTAB'),
          e('FUNC:ZGRP_GET', 'reads', 'TABL:ZTAB'), e('PROG:ZP1', 'submits', 'PROG:ZP1')],
      };
      mkdirSync(join(b3, 'SD', 'ZFG'), { recursive: true });
      writeFileSync(join(b3, 'SD', 'ZFG', 'graph.json'), JSON.stringify(fg));
      const run3 = (c: string, refs: string[]) => lookup({ bases: [b3], system: 'DEV1', command: c, refs, now: NOW }) as any;
      const reader = run3('table', ['ZTAB']).answers[0].hits[0].readers.list.find((x: any) => x.id === 'FUGR:ZGRP');
      expect(reader.tcodes).toEqual(['ZT1']);
      expect(run3('object', ['ZP1']).answers[0].hits[0].calls.list.map((x: any) => x.id)).toEqual(['FUNC:ZGRP_GET']); // no self edge
      expect(run3('object', ['ZGRP_GET']).answers[0].hits[0].reads.list.map((x: any) => x.id)).toEqual(['TABL:ZTAB']);
      expect(run3('object', ['ZP1']).answers[0].hits[0].callers.list.map((x: any) => x.id)).toEqual(['TRAN:ZT1']);
    } finally { rmSync(b3, { recursive: true, force: true }); }
  });
});

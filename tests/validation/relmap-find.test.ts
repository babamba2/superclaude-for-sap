import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { describeGraph, findGraphs, packagePatterns, packagesOf } from '../../scripts/relmap/relmap-find.mjs';
import { buildToFile, snippetReader } from '../../scripts/relmap/build-relation-map.mjs';

const ROOT = join(__dirname, '..', '..');
const CLI = join(ROOT, 'scripts', 'relmap', 'build-relation-map.mjs');
const NOW = Date.parse('2026-11-16T00:00:00Z');

const ev = (unit: string, line: number) => [{ unit, line, text: 'SELECT * FROM zt_head' }];
const graphOf = (pkg: string, extra: Record<string, unknown> = {}) => ({
  package: pkg, module: 'SD', system: 'DEV', sapVersion: 'ECC', builtAt: '2026-11-10T00:00:00Z', coverage: { parsed: 1 },
  nodes: [
    { id: 'TABL:ZT_HEAD', type: 'TABL', name: 'ZT_HEAD', scope: 'member' },
    { id: 'PROG:ZT_REPORT', type: 'PROG', name: 'ZT_REPORT', scope: 'member' },
    { id: 'DTEL:ZT_NO', type: 'DTEL', name: 'ZT_NO', scope: 'member' },
  ],
  edges: [
    { from: 'PROG:ZT_REPORT', to: 'TABL:ZT_HEAD', kind: 'reads', evidence: ev('ZT_REPORT', 12), count: 1 },
    { from: 'TABL:ZT_HEAD', to: 'DTEL:ZT_NO', kind: 'types', evidence: [{ unit: 'DD03L', line: 0, text: 'ZT_HEAD-NO' }], count: 1 },
    { from: 'TABL:ZT_HEAD', to: 'TABL:ZT_HEAD', kind: 'checks', evidence: [{ unit: 'DD08L', line: 0, text: 'x' }], count: 1 },
  ],
  ...extra,
});

const tmp = mkdtempSync(join(tmpdir(), 'relmap-find-'));
const put = (rel: string, g: unknown) => { mkdirSync(join(tmp, rel), { recursive: true }); writeFileSync(join(tmp, rel, 'graph.json'), JSON.stringify(g)); };
// plugin layout + web kb layout side by side
put('cbo/SD/ZTEST_SD', graphOf('ZTEST_SD'));
put('cbo/SD/ZTEST_SD-sample', graphOf('ZTEST_SD', { coverage: { parsed: 0 } }));
put('cbo/SD/ZTEST_SD.used', graphOf('ZTEST_SD'));
put('cbo/SD/ZTEST_SD/_prev-20261001', graphOf('ZTEST_SD'));
put('cbo/SD/_USED', graphOf('_USED', { packages: ['ZTEST_SD', 'ZTEST_SD2', '$TMP'] }));
put('kb/cbo/MM/ZMM_A+ZMM_B', graphOf('ZMM_A+ZMM_B'));
put('kb/cbo/MM/ZMM_OLD', graphOf('ZMM_OLD', { builtAt: '2026-09-01T00:00:00Z' }));
put('kb/cbo/FI/ZDUP', graphOf('ZDUP', { module: 'FI' }));
put('kb/cbo/CO/ZDUP', graphOf('ZDUP', { module: 'CO' }));

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('relmap find', () => {
  it('package patterns with * prefixes', () => {
    const p = packagePatterns('zmm*, ZSD_CBO');
    expect(p.map((x) => x.text)).toEqual(['ZMM*', 'ZSD_CBO']);
    expect(p[0].re.test('ZMM_A')).toBe(true);
    expect(p[1].re.test('ZSD_CBOX')).toBe(false);
  });

  it('% is the same prefix wildcard as * (web command lines refuse *)', () => {
    const [p] = packagePatterns('ZMM%');
    expect(p.re.test('ZMM_A')).toBe(true);
    expect(p.re.test('XZMM_A')).toBe(false);
    const r: any = findGraphs({ bases: [join(tmp, 'kb')], packages: 'ZMM%', now: NOW });
    expect(r.dirs).toHaveLength(2);
    expect(r.missing).toEqual([]);
    const cli = spawnSync(process.execPath, [CLI, 'find', '--base', join(tmp, 'kb'), '--packages', 'ZMM%,ZNONE%'], { encoding: 'utf8' });
    expect(cli.status).toBe(0);
    expect(JSON.parse(cli.stdout).missing).toEqual(['ZNONE%']);
  });

  it('package names: graph first, then the folder (_USED_<PKG>, A+B); $TMP and _USED dropped', () => {
    expect(packagesOf(join(tmp, 'x'), { package: '_USED', packages: ['ZA', '$TMP'] })).toEqual(['ZA']);
    expect(packagesOf(join(tmp, '_USED_ZTEST_MM'), { package: '_USED' })).toEqual(['ZTEST_MM']);
    expect(packagesOf(join(tmp, 'ZA+ZB'), {})).toEqual(['ZA', 'ZB']);
  });

  it('scope, notes and module-wide flag per graph', () => {
    const used = describeGraph(join(tmp, 'cbo/SD/ZTEST_SD.used/graph.json'), NOW)!;
    expect(used.scope).toBe('used');
    expect(used.moduleWide).toBe(false);
    const wide = describeGraph(join(tmp, 'cbo/SD/_USED/graph.json'), NOW)!;
    expect(wide).toMatchObject({ scope: 'used', moduleWide: true, packages: ['ZTEST_SD', 'ZTEST_SD2'] });
    const plus = describeGraph(join(tmp, 'kb/cbo/MM/ZMM_A+ZMM_B/graph.json'), NOW)!;
    expect(plus).toMatchObject({ scope: 'used', moduleWide: false, packages: ['ZMM_A', 'ZMM_B'] });
    const old = describeGraph(join(tmp, 'kb/cbo/MM/ZMM_OLD/graph.json'), NOW)!;
    expect(old.notes.join(' ')).toMatch(/older than 30 days/);
    expect(old.notes.join(' ')).toMatch(/no fields\.json/);
    expect(describeGraph(join(tmp, 'cbo/SD/ZTEST_SD-sample/graph.json'), NOW)!.notes[0]).toMatch(/DDIC relations only/);
  });

  it('picks one folder per package and scope over several bases; _prev-* skipped', () => {
    const r: any = findGraphs({ bases: [join(tmp, 'cbo'), join(tmp, 'kb', 'cbo')], packages: 'ZTEST_SD, ZMM*, ZNONE*', now: NOW });
    expect(r.ok).toBe(true);
    expect(r.graphs.some((g: any) => g.dir.includes('_prev'))).toBe(false);
    const rel = r.dirs.map((d: string) => d.slice(tmp.length + 1).replace(/\\/g, '/'));
    expect(rel).toEqual(['cbo/SD/ZTEST_SD', 'cbo/SD/ZTEST_SD.used', 'kb/cbo/MM/ZMM_A+ZMM_B', 'kb/cbo/MM/ZMM_OLD']);
    expect(r.missing).toEqual(['ZNONE*']);
    expect(r.ambiguous).toEqual([]);
  });

  it('a module-wide used graph serves only a package without a graph of its own', () => {
    const r: any = findGraphs({ bases: [join(tmp, 'cbo')], packages: 'ZTEST_SD2', now: NOW });
    expect(r.dirs).toHaveLength(1);
    expect(r.dirs[0].endsWith('_USED')).toBe(true);
    const own: any = findGraphs({ bases: [join(tmp, 'cbo')], packages: 'ZTEST_SD', now: NOW });
    expect(own.dirs.some((d: string) => d.endsWith('_USED'))).toBe(false);
  });

  it('the same package in two modules is ambiguous and stays out of dirs', () => {
    const r: any = findGraphs({ bases: [join(tmp, 'kb')], packages: 'ZDUP', now: NOW });
    expect(r.dirs).toEqual([]);
    expect(r.ambiguous).toHaveLength(1);
    expect(r.ambiguous[0]).toMatchObject({ package: 'ZDUP', scope: 'package' });
    expect(r.ambiguous[0].modules.sort()).toEqual(['CO', 'FI']);
  });

  it('CLI: find prints one JSON line; bad args → ok:false, exit 1', () => {
    const ok = spawnSync(process.execPath, [CLI, 'find', '--base', join(tmp, 'kb'), '--packages', 'ZMM*'], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout).dirs).toHaveLength(2);
    const bad = spawnSync(process.execPath, [CLI, 'find', '--base', join(tmp, 'kb')], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(JSON.parse(bad.stdout).ok).toBe(false);
  });
});

describe('relmap build for a hosted run', () => {
  const src1 = join(tmp, 'src1'), src2 = join(tmp, 'src2');
  mkdirSync(src1, { recursive: true });
  mkdirSync(src2, { recursive: true });
  const body = Array.from({ length: 30 }, (_, i) => `* line ${i + 1}`).join('\n');
  writeFileSync(join(src2, 'ZT_REPORT.abap'), body);               // web kb: <UNIT>.abap, upper case
  writeFileSync(join(src2, 'zt_other.prog.abap'), body);           // MCP output: <name>.<kind>.abap
  writeFileSync(join(src1, 'zt_other.prog.abap'), 'first wins');

  it('snippet reader: several folders, upper-case <UNIT>.abap, first folder wins', () => {
    const read = snippetReader([src1, src2]);
    expect(read('ZT_REPORT', 12)).toMatchObject({ start: 2 });
    expect(read('ZT_OTHER', 1)!.text).toBe('first wins');
  });

  it('graph.json alone builds; --sid names the system; --out is honoured', () => {
    const out = join(tmp, 'run', 'relation-map-en.html');
    const r: any = buildToFile({ graphs: [graphOf('ZTEST_SD')], dirs: [join(tmp, 'kb/cbo/MM/ZMM_OLD')], out, lang: 'en', snippets: true, src: [src2], sid: 'QAS' });
    expect(r.page).toBe(out);
    expect(existsSync(out)).toBe(true);
    expect(r.snippets).toBeGreaterThan(0);
    expect(readFileSync(out, 'utf8')).toContain('QAS');
    expect(r.html).toBeUndefined();
  });

  it('--max-bytes: rebuilt without snippets (reason size); still too big → not written', () => {
    const base: any = { graphs: [graphOf('ZTEST_SD')], lang: 'en', snippets: true, src: [src2] };
    const full: any = buildToFile({ ...base, out: join(tmp, 'run', 'a.html') });
    const bare: any = buildToFile({ ...base, snippets: false, out: join(tmp, 'run', 'b.html') });
    expect(full.bytes).toBeGreaterThan(bare.bytes);
    const fit: any = buildToFile({ ...base, maxBytes: bare.bytes, out: join(tmp, 'run', 'c.html') });
    expect(fit).toMatchObject({ snippets: false, reason: 'size', bytes: bare.bytes });
    expect(existsSync(join(tmp, 'run', 'c.html'))).toBe(true);
    const big: any = buildToFile({ ...base, maxBytes: 100, out: join(tmp, 'run', 'd.html') });
    expect(big).toMatchObject({ tooBig: true, page: null });
    expect(existsSync(join(tmp, 'run', 'd.html'))).toBe(false);
  });

  it('CLI: exit 3 when the page is still over --max-bytes', () => {
    const r = spawnSync(process.execPath, [CLI, '--dir', join(tmp, 'kb/cbo/MM/ZMM_OLD'), '--lang', 'en', '--max-bytes', '100', '--sid', 'QAS', '--out', join(tmp, 'run', 'e.html')], { encoding: 'utf8' });
    expect(r.status).toBe(3);
    expect(JSON.parse(r.stdout).tooBig).toBe(true);
    expect(existsSync(join(tmp, 'run', 'e.html'))).toBe(false);
  });
});

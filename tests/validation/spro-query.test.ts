import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const CLI = join(ROOT, 'scripts', 'spro-query.mjs');

let project: string;

const run = (args: string[]) =>
  spawnSync(process.execPath, [CLI, ...args], { cwd: project, encoding: 'utf8' });

beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), 'sc4sap-spro-query-'));
  const base = join(project, '.sc4sap', 'work', 'DEV1');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(project, '.sc4sap', 'active-profile.txt'), 'DEV1');
  writeFileSync(join(base, 'spro-config-SD.json'), JSON.stringify({
    timestamp: '2026-11-01T00:00:00Z',
    modules: {
      SD: {
        TVAK: {
          description: 'Sales document types',
          total_rows: 3,
          data: [
            { MANDT: '100', AUART: 'OR', VBTYP: 'C', KALVG: '1' },
            { MANDT: '100', AUART: 'RE', VBTYP: 'H', KALVG: 'A' },
            { MANDT: '100', AUART: 'RK', VBTYP: 'K', KALVG: 'A' },
          ],
        },
        T683V: { description: 'Procedure determination', total_rows: 1, data: [{ VKORG: '1000', KALSM: 'ZPR001' }] },
      },
    },
  }));
});

afterAll(() => rmSync(project, { recursive: true, force: true }));

describe('spro-query', () => {
  it('lists the cached tables of a module', () => {
    const r = run(['--module', 'sd']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('TVAK\t3\tSales document types');
    expect(r.stdout).toContain('T683V\t1');
  });

  it('filters rows with = (any of), != and ~ and drops MANDT by default', () => {
    const r = run(['--module', 'SD', '--table', 'TVAK', '--where', 'VBTYP=H|K,AUART!=RK']);
    expect(r.stdout).toContain('1 of 3 rows match');
    expect(r.stdout).toContain('AUART\tVBTYP\tKALVG');
    expect(r.stdout).toContain('RE\tH\tA');
    expect(r.stdout).not.toContain('MANDT');
    const c = run(['--module', 'SD', '--table', 'TVAK', '--where', 'AUART~r', '--fields', 'AUART']);
    expect(c.stdout).toContain('3 of 3 rows match');
  });

  it('finds the tables that carry a field', () => {
    const r = run(['--module', 'SD', '--find', 'kalsm']);
    expect(r.stdout).toContain('T683V\t1');
    expect(r.stdout).not.toContain('TVAK\t');
  });

  it('caps output with --limit', () => {
    const r = run(['--module', 'SD', '--table', 'TVAK', '--limit', '1']);
    expect(r.stdout).toContain('first 1 shown');
  });

  it('reports cache status per module with exact paths', () => {
    mkdirSync(join(project, '.sc4sap', 'work', 'DEV1', 'customizations', 'SD'), { recursive: true });
    const r = run(['--status', 'sd,MM']);
    expect(r.status).toBe(0);
    expect(r.stdout.split(/\r?\n/)[0]).toMatch(/^profile=DEV1\tconfig=\S+\tenv=\S+/);
    expect(r.stdout).toMatch(/SD\tspro=.*spro-config-SD\.json \(snapshot 2026-11-01T00:00:00Z\)\tcustomizations=.*customizations[\\/]SD/);
    expect(r.stdout).toContain('MM\tspro=none\tcustomizations=none');
  });

  it('exits 2 when the module has no cache', () => {
    const r = run(['--module', 'MM']);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('NO_CACHE module=MM');
  });
});

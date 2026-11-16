import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findValue, inMcpSqlDir, loadValueTables, mergeValues, parseValueTables, planValue, rowProblems } from '../../scripts/assist/values.mjs';
import { loadCatalogs } from '../../scripts/assist/catalog.mjs';

const ROOT = join(__dirname, '..', '..');
const CLI = join(ROOT, 'scripts', 'assist', 'values.mjs');

const MD = [
  '## Basic Functions',
  '| Config Name | Table/View | Description |',
  '|---|---|---|',
  '| Define Something | V_TXX1 | not a value table |',
  '',
  '## Value tables (assistant choices)',
  'Intro line.',
  '',
  '| Value | System | Table/View | Key field | Filter | Text table | Text field | Text filter | Class | Used by | Description |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  "| XX_BLOCK | ECC, S4 | TXBL | BLOCK | | TXBLT | VTEXT | | C / C | XX.DOC.SET_BLOCK.reason | Block reasons |",
  "| XX_COND | ECC, S4 | TXCO | KSCHL | KVEWE = 'A' AND KAPPL = 'V' | TXCOT | VTEXT | KVEWE = 'A' AND KAPPL = 'V' | C / C | XX.DOC.CHANGE.cond_type | Condition types |",
  "| XX_SHIP | ECC | TXSH | SHTYP | | TXSHT | BEZEI | | G / G | XX.SHP.CREATE.shtyp | ECC only |",
  '',
  '## Next section',
  '| Config Name | Table/View | Description |',
  '| Later | V_TYY | outside the section |',
].join('\r\n');

describe('assist value tables — map', () => {
  const rows = parseValueTables(MD, 'XX');

  it('reads only the value-table section (CRLF too)', () => {
    expect(rows.map((r) => r.value)).toEqual(['XX_BLOCK', 'XX_COND', 'XX_SHIP']);
    expect(rows[1]).toMatchObject({ table: 'TXCO', key: 'KSCHL', filter: "KVEWE = 'A' AND KAPPL = 'V'", textTable: 'TXCOT', textField: 'VTEXT', class: 'C / C', usedBy: ['XX.DOC.CHANGE.cond_type'] });
    expect(rows.every((r) => rowProblems(r).length === 0)).toBe(true);
  });

  it('refuses tables that are not customizing (delivery class C / G only) and free-form filters', () => {
    expect(rowProblems({ ...rows[0], class: 'A / C' }).join()).toMatch(/only customizing/);
    expect(rowProblems({ ...rows[0], class: '' }).join()).toMatch(/only customizing/);
    expect(rowProblems({ ...rows[1], filter: "KVEWE = 'A' OR 1 = 1" }).join()).toMatch(/filter/);
    expect(rowProblems({ ...rows[1], textFilter: "KAPPL IN (SELECT X FROM Y)" }).join()).toMatch(/text filter/);
    expect(() => planValue({ ...rows[0], class: 'A / A' }, 'KO')).toThrow(/customizing/);
  });

  it('finds a set by value id or by ACTION.ID.param, per system family', () => {
    expect(findValue(rows, 'xx_block', 'ECC')?.value).toBe('XX_BLOCK');
    expect(findValue(rows, 'XX.DOC.CHANGE.cond_type', 'S4')?.value).toBe('XX_COND');
    expect(findValue(rows, 'XX_SHIP', 'S4')).toBeNull();
  });

  it('plan: two single-table SELECTs, texts in the logon language and English', () => {
    const p = planValue(rows[1], 'KO');
    expect(p.statements).toEqual([
      { role: 'keys', table: 'TXCO', sql: "SELECT KSCHL FROM TXCO WHERE KVEWE = 'A' AND KAPPL = 'V'" },
      { role: 'texts', table: 'TXCOT', sql: "SELECT SPRAS, KSCHL, VTEXT FROM TXCOT WHERE SPRAS IN ('3','E') AND KVEWE = 'A' AND KAPPL = 'V'" },
    ]);
    expect(planValue(rows[0], 'E').statements[1].sql).toBe("SELECT SPRAS, BLOCK, VTEXT FROM TXBLT WHERE SPRAS IN ('E')");
  });
});

describe('assist value tables — merge', () => {
  const r = parseValueTables(MD, 'XX')[0];
  const keys = [{ BLOCK: '01' }, { BLOCK: '02' }, { BLOCK: '03' }, { BLOCK: '' }, { BLOCK: '01' }];
  const texts = [
    { SPRAS: '3', BLOCK: '01', VTEXT: '여신 한도' }, { SPRAS: 'E', BLOCK: '01', VTEXT: 'Credit limit' },
    { SPRAS: 'E', BLOCK: '02', VTEXT: 'Political reasons' },
    { SPRAS: '3', BLOCK: '09', VTEXT: 'no key' },
  ];

  it('logon text first, English beside it when different, English alone as fallback, keys without text kept', () => {
    const m = mergeValues(r, keys, texts, { lang: 'KO' });
    expect(m.total).toBe(3);
    expect(m.choices).toEqual([
      { n: 1, key: '01', text: '여신 한도', textEn: 'Credit limit' },
      { n: 2, key: '02', text: 'Political reasons', textEn: '' },
      { n: 3, key: '03', text: '', textEn: '' },
    ]);
  });

  it('--find narrows by code or words; --max caps the list', () => {
    expect(mergeValues(r, keys, texts, { lang: 'KO', find: 'credit' }).choices.map((c) => c.key)).toEqual(['01']);
    const capped = mergeValues(r, keys, texts, { lang: 'KO', max: 2 });
    expect(capped).toMatchObject({ total: 3, shown: 2 });
  });
});

describe('assist value tables — shipped map', () => {
  const rows = loadValueTables();
  const actions = new Map(loadCatalogs().flatMap((c) => c.actions.map((a: any) => [a.id, a])));

  it('every row is valid and customizing only', () => {
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const r of rows) expect(rowProblems(r), r.value).toEqual([]);
    expect(new Set(rows.map((r) => r.value)).size).toBe(rows.length);
  });

  it('every Used by points at a clarify entry that names the set (and back)', () => {
    for (const r of rows) for (const u of r.usedBy) {
      const [mod, obj, act, param] = u.split('.');
      const a: any = actions.get(`${mod}.${obj}.${act}`);
      expect(a, u).toBeTruthy();
      expect((a.clarify || []).find((c: any) => c.param === param)?.values, u).toBe(r.value);
    }
    for (const a of actions.values() as any) for (const c of a.clarify || []) if (c.values) {
      expect(rows.find((r) => r.value === c.values)?.usedBy, `${a.id}.${c.param}`).toContain(`${a.id}.${c.param}`);
    }
  });
});

describe('assist value tables — CLI', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'assist-values-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('plan by action param; merge from GetSqlQuery result files; unknown → exit 1', () => {
    const plan = spawnSync(process.execPath, [CLI, 'plan', 'SD.SO.SET_DELIVERY_BLOCK.reason', '--lang', 'KO'], { encoding: 'utf8' });
    expect(plan.status).toBe(0);
    const p = JSON.parse(plan.stdout);
    expect(p.statements.map((s: any) => s.table)).toEqual(['TVLS', 'TVLST']);
    writeFileSync(join(tmp, 'k.json'), JSON.stringify({ output: 'file', rows: [{ LIFSP: 'Z1' }] }));
    writeFileSync(join(tmp, 't.json'), JSON.stringify({ rows: [{ SPRAS: 'E', LIFSP: 'Z1', VTEXT: 'Test block' }] }));
    const merge = spawnSync(process.execPath, [CLI, 'merge', 'SD_DELIVERY_BLOCK', '--keys', join(tmp, 'k.json'), '--texts', join(tmp, 't.json'), '--lang', 'KO'], { encoding: 'utf8' });
    expect(JSON.parse(merge.stdout).choices).toEqual([{ n: 1, key: 'Z1', text: 'Test block', textEn: '' }]);
    expect(spawnSync(process.execPath, [CLI, 'plan', 'NO.SUCH.ACTION.x'], { encoding: 'utf8' }).status).toBe(1);
  });

  it('user words come from --find-file only; an inline --find is refused (no user text on a shell line)', () => {
    writeFileSync(join(tmp, 'k2.json'), JSON.stringify({ rows: [{ LIFSP: 'Z1' }, { LIFSP: 'Z2' }] }));
    writeFileSync(join(tmp, 't2.json'), JSON.stringify({ rows: [{ SPRAS: 'E', LIFSP: 'Z1', VTEXT: 'Credit $(whoami) check' }, { SPRAS: 'E', LIFSP: 'Z2', VTEXT: 'Date check' }] }));
    const sql = join(tmp, '.sc4sap', 'work', 'DEV', 'mcp-output', 'sql');
    mkdirSync(sql, { recursive: true });
    writeFileSync(join(sql, 'find.txt'), '$(whoami) credit');
    const base = [CLI, 'merge', 'SD_DELIVERY_BLOCK', '--keys', join(tmp, 'k2.json'), '--texts', join(tmp, 't2.json'), '--lang', 'EN'];
    const ok = spawnSync(process.execPath, [...base, '--find-file', join(sql, 'find.txt')], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout).choices.map((c: any) => c.key)).toEqual(['Z1']);
    const inline = spawnSync(process.execPath, [...base, '--find', 'credit'], { encoding: 'utf8' });
    expect(inline.status).toBe(2);
    expect(inline.stderr).toMatch(/--find-file/);
  });

  it('--find-file only from an MCP output sql folder; --max only 1–3 digits (else exit 2)', () => {
    const sql = join(tmp, '.sc4sap', 'work', 'DEV', 'mcp-output', 'sql');
    mkdirSync(sql, { recursive: true });
    writeFileSync(join(tmp, 'outside.txt'), 'credit');
    expect(inMcpSqlDir(join(sql, 'find.txt'))).toBe(true);
    expect(inMcpSqlDir(join(tmp, 'outside.txt'))).toBe(false);
    expect(inMcpSqlDir(join(sql, '..', '..', 'find.txt'))).toBe(false);
    expect(inMcpSqlDir(join(sql, 'sub', 'find.txt'))).toBe(false);
    const base = [CLI, 'merge', 'SD_DELIVERY_BLOCK', '--keys', join(tmp, 'k2.json'), '--texts', join(tmp, 't2.json'), '--lang', 'EN'];
    const outside = spawnSync(process.execPath, [...base, '--find-file', join(tmp, 'outside.txt')], { encoding: 'utf8' });
    expect(outside.status).toBe(2);
    expect(outside.stderr).toMatch(/mcp-output/);
    for (const bad of ['1000', '-1', '3e2', '30;ls', '']) {
      expect(spawnSync(process.execPath, [...base, '--max', bad], { encoding: 'utf8' }).status, bad).toBe(2);
    }
    const ok = spawnSync(process.execPath, [...base, '--max', '1'], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({ total: 2, shown: 1 });
  });
});

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { contextFromSnapshots, scrubContext, scrubEntry, scrubTree, systemHit } from '../../scripts/config/kb-scrub.mjs';
import { generalPart, kbRead, loadNotes, parseNotes, valueHash, withKb } from '../../scripts/config/notes.mjs';

const ROOT = join(__dirname, '..', '..');
const NOTES = join(ROOT, 'scripts', 'config', 'notes.mjs');

// generic test facts only: system TST, company code AB12, plant PL01, customer objects ZX_* / YX_*
const SNAP = {
  meta: { system: 'TST', lang: 'ko' },
  tables: {
    T001: { fields: [{ name: 'BUKRS', key: true }], rows: [{ BUKRS: 'AB12' }, { BUKRS: '0001' }] },
    T001W: { fields: [{ name: 'WERKS', key: true }], rows: [{ WERKS: 'PL01' }] },
    TVAK: { fields: [{ name: 'AUART', key: true }], rows: [{ AUART: 'ZXOR', _tr: 'TSTK900001' }, { AUART: 'OR' }] },
  },
  badiImpls: { BADI_X: [{ impl: 'ZX_IMPL_ONE' }] },
};
const ctx = contextFromSnapshots([SNAP]);

const note = () => parseNotes([
  '@@ A', '## purpose', 'Defines the order type. In this system company code AB12 uses it.', '## impact', '- AB12 has 3 rows.',
  '## sapdoc', 'Order types control the sales document.',
  '## cases Which control?', '### case CASE 1 — Standard', 'flow: Create > Save', 'desc: Standard flow. Plant PL01 runs it.', 'when: Always.', 'this: yes — AB12',
  '## mix', 'Most companies use both.',
  '## compare', '| Aspect | CASE 1 | CASE 2 |', '|---|---|---|', '| Setup effort | Low | High |', '| This system | yes | no |', '| Used by AB12 | yes | no |',
  '## checklist', '- Is the type needed?', '- Does ZXOR replace OR?', '- Is YX_PROG_A still used?',
  '## criteria', 'rev: Reversible.', 'rec: Use the standard. This system uses ZX_IMPL_ONE.', 'risk: TST shows gaps.',
  '## sources', '- Order types | SAP Help Portal | https://help.sap.com/x | General summary.', '',
].join('\n'), 'draft').items.A;

describe('notes KB — system-specific parts stay out', () => {
  it('collects the system facts from a snapshot (no short or all-zero keys)', () => {
    expect(ctx.counts).toEqual({ systems: 1, orgKeys: 2, customNames: 2 });
    expect(systemHit('company code AB12', ctx)).toBe('orgKey');
    expect(systemHit('order type 0001', ctx)).toBe('');
    expect(systemHit('이 시스템은 사용함', ctx)).toBe('thisSystem');
    expect(systemHit('uses YX_PROG_A', ctx)).toBe('customName');
    expect(systemHit('field ZTERM', ctx)).toBe('');
  });

  it('generalPart drops this-system rows and sentences from compare, checklist, criteria and the texts', () => {
    const g = generalPart(note(), ctx);
    expect(g.compare).toEqual([['Aspect', 'CASE 1', 'CASE 2'], ['Setup effort', 'Low', 'High']]);
    expect(g.checklist).toEqual(['Is the type needed?']);
    expect(g.criteria).toEqual({ rev: 'Reversible.', rec: 'Use the standard.' });
    expect(g.purpose).toBe('Defines the order type.');
    expect(g.cases.list[0]).toMatchObject({ desc: 'Standard flow.', when: 'Always.' });
    expect(g.cases.list[0]).not.toHaveProperty('thisSystem');
    expect(g).not.toHaveProperty('impact');
    expect(JSON.stringify(g)).not.toMatch(/AB12|PL01|ZXOR|ZX_|YX_|TST|this system/i);
  });

  it('every text of a case and any other field is scrubbed; system-only fields are dropped', () => {
    const { entry, tally } = scrubEntry({
      activity: 'A', sapVersion: 'ECC',
      cases: { title: 'q', list: [{ title: 'CASE 1 — Standard', name: 'Used by plant PL01.', desc: 'General.', flow: ['Create', 'Post in AB12'], extra: 'Uses ZX_IMPL_ONE.' }] },
      refs: ['VOV8', 'See YX_PROG_A.'], note: 'This system differs.', impact: ['AB12 rows'], verdicts: [{ n: 1, value: 'yes' }], verifiedAgainst: { system: 'TST' },
    }, ctx);
    expect(entry.cases.list[0]).toEqual({ title: 'CASE 1 — Standard', name: '', desc: 'General.', flow: ['Create'], extra: '' });
    expect(entry.refs).toEqual(['VOV8']);
    expect(entry.note).toBe('');
    expect(entry).not.toHaveProperty('impact');
    expect(entry).not.toHaveProperty('verdicts');
    expect(entry).not.toHaveProperty('verifiedAgainst');
    expect(entry).toMatchObject({ activity: 'A', sapVersion: 'ECC' });
    expect(tally.systemOnly.items).toBe(3);
    expect(JSON.stringify(entry)).not.toMatch(/AB12|PL01|ZX_|YX_|TST|this system/i);
  });

  it('walks every string of an entry: none of them keeps a system fact after the scrub', () => {
    // every field a KB entry can hold (notes.mjs parseNote + generalPart + metadata), each carrying a system fact
    const bad = 'Plant PL01 in this system.';
    const fixture = {
      activity: 'A', module: 'SD', lang: 'ko', savedAt: '2026-11-16', sapVersion: 'ECC',
      purpose: bad, sapdoc: bad, mix: bad, refs: [bad, 'VOV8'], note: bad,
      compare: [['Aspect', 'CASE 1'], [bad, 'x'], ['Effort', bad]],
      checklist: [bad, 'General?'], criteria: { rev: bad, rec: 'Keep.' },
      cases: { title: bad, list: [{ title: bad, name: bad, desc: bad, when: bad, flow: [bad, 'Step'], thisSystem: bad, svg: bad, extra: bad, steps: [{ t: bad }], meta: { z: bad } }] },
      extraObj: { x: bad, deeper: { y: [bad] } }, extraArr: [{ y: bad }, bad],
      sources: [{ title: bad, source: 'SAP Help Portal', url: 'https://help.sap.com/x', summary: bad }],
      impact: [bad], cautions: [bad], verdicts: [{ n: 1, value: bad }], kbFlag: bad, verifiedAgainst: { system: bad },
    };
    const { entry } = scrubEntry(JSON.parse(JSON.stringify(fixture)), ctx);
    const strings: string[] = [];
    const walk = (x: unknown) => { if (typeof x === 'string') strings.push(x); else if (x && typeof x === 'object') Object.values(x).forEach(walk); };
    walk(entry);
    expect(strings.length).toBeGreaterThan(5);
    expect(strings.filter((s) => /PL01|this system/i.test(s))).toEqual([]);
    // unknown nested shapes are walked too; metadata stays as it was
    expect(entry.extraObj).toEqual({ x: '', deeper: { y: [] } });
    expect(entry.extraArr).toEqual([{ y: '' }]);
    expect(entry.cases.list[0].steps).toEqual([{ t: '' }]);
    expect(entry.cases.list[0].meta).toEqual({ z: '' });
    expect(entry).toMatchObject({ activity: 'A', module: 'SD', lang: 'ko', savedAt: '2026-11-16', sapVersion: 'ECC' });
    expect(entry.compare.some((r: string[]) => r[0] === 'Effort')).toBe(false); // a row with the fact in any cell goes
    expect(entry.checklist).toEqual(['General?']);
    expect(entry.criteria).toEqual({ rec: 'Keep.' });
  });

  it('a this-system row is dropped even without known facts', () => {
    const { entry, tally } = scrubEntry({ compare: [['Aspect', 'A'], ['이 시스템', 'yes'], ['Effort', 'low']] }, scrubContext());
    expect(entry.compare).toEqual([['Aspect', 'A'], ['Effort', 'low']]);
    expect(tally.compare.rows).toBe(1);
  });
});

describe('kb-scrub over a KB tree', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'kb-scrub-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const kb = join(tmp, 'kb', 'config', 'SD', 'ko');
  mkdirSync(kb, { recursive: true });
  const dirty = { activity: 'A', purpose: 'Defines it. In this system AB12 uses it.', compare: [['Aspect', 'CASE 1'], ['This system', 'yes'], ['Effort', 'low']], checklist: ['Need it?', 'Is ZX_IMPL_ONE active?'], criteria: { rev: 'Yes.', rec: 'Keep ZXOR.' } };
  writeFileSync(join(kb, 'A.json'), JSON.stringify(dirty));
  writeFileSync(join(kb, 'B.json'), JSON.stringify({ activity: 'B', purpose: 'Clean text.', compare: [], checklist: [], criteria: {} }));
  writeFileSync(join(kb, 'sources-ko.json'), JSON.stringify({ any: 'AB12' }));
  const snapFile = join(tmp, 'snapshot.json');
  writeFileSync(snapFile, JSON.stringify(SNAP));

  it('dry run counts and writes nothing; --apply writes; a second run finds nothing', () => {
    const dry = scrubTree(join(tmp, 'kb', 'config'), ctx);
    expect(dry).toMatchObject({ files: 2, changed: 1, apply: false });
    expect(dry.totals.compare.rows).toBe(1);
    expect(dry.totals.checklist.sentences).toBe(1);
    expect(readFileSync(join(kb, 'A.json'), 'utf8')).toBe(JSON.stringify(dirty));

    const cli = spawnSync(process.execPath, [NOTES, 'kb-scrub', '--kb', join(tmp, 'kb', 'config'), '--snapshots', snapFile, '--apply'], { encoding: 'utf8' });
    expect(cli.status).toBe(0);
    const out = JSON.parse(cli.stdout);
    expect(out).toMatchObject({ files: 2, changed: 1, apply: true, snapshots: 1 });
    expect(cli.stdout).not.toMatch(/AB12|ZXOR|ZX_IMPL/);
    const after = JSON.parse(readFileSync(join(kb, 'A.json'), 'utf8'));
    expect(JSON.stringify(after)).not.toMatch(/AB12|ZXOR|ZX_IMPL|this system/i);
    expect(after.criteria).toEqual({ rev: 'Yes.' });
    expect(readFileSync(join(kb, 'sources-ko.json'), 'utf8')).toMatch(/AB12/); // not a KB entry: untouched
    expect(scrubTree(join(tmp, 'kb', 'config'), ctx).changed).toBe(0);
  });
});

describe('KB seed, verification and re-queue', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'kb-seed-'));
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); delete process.env.SC4SAP_KB_SEED; delete process.env.SC4SAP_HOME_DIR; });

  it('reads the own KB first, then the read-only seed (marked fromSeed)', () => {
    process.env.SC4SAP_HOME_DIR = join(tmp, 'home');
    process.env.SC4SAP_KB_SEED = join(tmp, 'seed');
    mkdirSync(join(tmp, 'seed', 'config', 'PP', 'ko'), { recursive: true });
    mkdirSync(join(tmp, 'home', 'kb', 'config', 'PP', 'ko'), { recursive: true });
    writeFileSync(join(tmp, 'seed', 'config', 'PP', 'ko', 'A.json'), JSON.stringify({ activity: 'A', purpose: 'seed', cases: { title: 'q', list: [{ title: 'CASE 1 — S' }] } }));
    writeFileSync(join(tmp, 'seed', 'config', 'PP', 'ko', 'B.json'), JSON.stringify({ activity: 'B', purpose: 'seed B' }));
    writeFileSync(join(tmp, 'home', 'kb', 'config', 'PP', 'ko', 'B.json'), JSON.stringify({ activity: 'B', purpose: 'own B' }));
    expect(kbRead('PP', 'ko', 'A')).toMatchObject({ purpose: 'seed', fromSeed: true });
    expect(kbRead('PP', 'ko', 'B')).toEqual({ activity: 'B', purpose: 'own B' });
    expect(kbRead('PP', 'ko', 'C')).toBeNull();
    const merged = withKb({ impact: ['x'], verdicts: [{ n: 1, value: 'yes — 2' }] }, kbRead('PP', 'ko', 'A'));
    expect(merged).toMatchObject({ purpose: 'seed', kbFromSeed: true });
    expect(merged.cases.list[0].thisSystem).toBe('yes — 2');
  });

  it('KB writes never go into the seed, whatever the entry came from', async () => {
    const { ownKbPath } = await import('../../scripts/config/notes.mjs');
    expect(() => ownKbPath(join(tmp, 'seed', 'config', 'PP', 'ko', 'A.json'))).toThrow(/read-only KB seed/);
    expect(() => ownKbPath(join(tmp, 'seed'))).toThrow(/read-only KB seed/);
    expect(ownKbPath(join(tmp, 'home', 'kb', 'config', 'PP', 'ko', 'A.json'))).toMatch(/home/);
    expect(ownKbPath(join(tmp, 'seed-other', 'x.json'))).toMatch(/seed-other/);
    const r = spawnSync(process.execPath, [NOTES, 'kb-scrub', '--kb', join(tmp, 'seed', 'config'), '--snapshots', join(tmp, 'none.json'), '--apply'], { encoding: 'utf8', env: { ...process.env } });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/read-only KB seed/);
  });

  it('a junction / symlink from the own KB into the seed is refused too (real paths compared)', async () => {
    const { ownKbPath, realLocation } = await import('../../scripts/config/notes.mjs');
    const { symlinkSync } = await import('node:fs');
    mkdirSync(join(tmp, 'home', 'kb', 'config'), { recursive: true });
    const link = join(tmp, 'home', 'kb', 'config', 'LINKED');
    // a junction on Windows (no admin right needed), a directory symlink elsewhere
    symlinkSync(join(tmp, 'seed', 'config', 'PP'), link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(realLocation(join(link, 'ko', 'A.json')).toLowerCase()).toContain(join('seed', 'config', 'PP').toLowerCase());
    expect(() => ownKbPath(join(link, 'ko', 'A.json'))).toThrow(/read-only KB seed/);       // existing file behind the link
    expect(() => ownKbPath(join(link, 'ko', 'NEW', 'B.json'))).toThrow(/read-only KB seed/); // not there yet: nearest parent resolved
    expect(() => ownKbPath(link)).toThrow(/read-only KB seed/);
    expect(ownKbPath(join(tmp, 'home', 'kb', 'config', 'PP', 'ko', 'A.json'))).toMatch(/home/);
    const { unlinkSync, rmdirSync, existsSync: exists } = await import('node:fs');
    try { unlinkSync(link); } catch { rmdirSync(link); } // removes the link only, never what it points to
    expect(exists(link)).toBe(false);
    expect(exists(join(tmp, 'seed', 'config', 'PP', 'ko', 'A.json'))).toBe(true);
  });

  it('entries from before the version meta get the release they came from', () => {
    const dir = join(tmp, 'ver', 'config', 'PP', 'ko');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'A.json'), JSON.stringify({ activity: 'A', purpose: 'p' }));
    writeFileSync(join(dir, 'B.json'), JSON.stringify({ activity: 'B', purpose: 'p', sapVersion: 'S4' }));
    const r = scrubTree(join(tmp, 'ver', 'config'), scrubContext(), { apply: true, defaultSapVersion: 'ECC' });
    expect(r).toMatchObject({ files: 2, changed: 1, versionSet: 1 });
    expect(JSON.parse(readFileSync(join(dir, 'A.json'), 'utf8')).sapVersion).toBe('ECC');
    expect(JSON.parse(readFileSync(join(dir, 'B.json'), 'utf8')).sapVersion).toBe('S4');
  });

  it('a passed review carries verifiedAgainst from the batch input; a reviewer kbFlag is kept', () => {
    const nd = join(tmp, 'doc', 'notes');
    mkdirSync(join(nd, '_in'), { recursive: true });
    writeFileSync(join(nd, '_in', 'b001.json'), JSON.stringify({ module: 'PP', system: 'TST', snapshotDate: '2026-11-16', items: [{ id: 'A', valueHash: valueHash([[['x']]]) }, { id: 'B', valueHash: 'h2' }] }));
    writeFileSync(join(nd, 'b001.draft.json'), JSON.stringify({ items: { A: { purpose: 'p', impact: [] }, B: { purpose: 'p', impact: [] } } }));
    const review = parseNotes('@@ A\nverdict: ok\n@@ B\nverdict: ok\nkbFlag: case 2 cannot exist on this release\n', 'review');
    expect(review.items.B.kbFlag).toBe('case 2 cannot exist on this release');
    writeFileSync(join(nd, 'b001.review.json'), JSON.stringify({ items: review.items }));
    const n = loadNotes(join(tmp, 'doc'));
    expect(n.A.verifiedAgainst).toEqual({ system: 'TST', snapshotDate: '2026-11-16', valueHash: valueHash([[['x']]]) });
    expect(n.B).toMatchObject({ kbFlag: 'case 2 cannot exist on this release', verifiedAgainst: { valueHash: 'h2' } });
    expect(valueHash([[['x']]])).not.toBe(valueHash([[['y']]]));
  });
});

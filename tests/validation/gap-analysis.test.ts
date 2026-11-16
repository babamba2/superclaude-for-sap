import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { deriveGap, checkGap, wricefItems, wricefKind, defaultDisposition, fitOf, gapStats, graphTypes, applyPatch } from '../../scripts/process/gap-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderGapHtml, buildGapDoc, readGap } from '../../scripts/process/build-gap-doc.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { importEditedHtml } from '../../scripts/process/build-process-doc.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { instantiate, addWricef } from '../../scripts/project/project-template.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { EDITOR_SCRIPT } from '../../scripts/process/process-editor.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { GAP_SCRIPT, GAP_LABELS } from '../../scripts/process/gap-page.mjs';

const ROOT = resolve(__dirname, '../..');
const FIX = join(ROOT, 'tests/fixtures/process/model-gap-mm.json');
const PM = JSON.parse(readFileSync(FIX, 'utf8'));
type Row = { code: string; level: number; fit: string; usage: string; disposition: string; wricef: { on: boolean; kind: string; reason: string }; coverage: { name: string; type?: string }[]; statement: string; note: string };
const row = (g: { rows: Row[] }, code: string) => g.rows.find(r => r.code === code) as Row;

describe('gap model — fit, disposition, WRICEF', () => {
  const g = deriveGap(PM, { scope: 'conversion' });
  it('maps the process kind to fit / partial / gap / manual / external', () => {
    expect(['std', 'enh', 'cbo', 'manual', 'ext'].map(fitOf)).toEqual(['fit', 'partial', 'gap', 'manual', 'external']);
    expect(row(g, '1.1.1.1').fit).toBe('fit');
    expect(row(g, '1.2.1.1').fit).toBe('partial');
    expect(row(g, '1.2.1.2').fit).toBe('external');
    expect(row(g, '1.2.2.1').fit).toBe('manual');
  });
  it('turns variants into their own rows under the task', () => {
    const v = row(g, '1.1.1.2a') as Row & { parent: string };
    expect(v.level).toBe(5);
    expect(v.parent).toBe('1.1.1.2');
    expect(v.usage).toBe('unused');
    expect(v.coverage.map(o => o.name)).toEqual(['ZPT_PR_UPLOAD_P100']);
  });
  it('defaults the disposition by scope and usage', () => {
    expect(defaultDisposition('conversion', 'gap', 'used')).toBe('retrofit');
    expect(defaultDisposition('conversion', 'gap', 'unused')).toBe('retire');
    expect(defaultDisposition('conversion', 'fit', 'used')).toBe('keep');
    expect(defaultDisposition('new', 'gap', 'used')).toBe('rebuild');
    expect(defaultDisposition('new', 'fit', 'unknown')).toBe('adopt');
    expect(defaultDisposition('new', 'gap', 'unknown')).toBe('review');
    expect(defaultDisposition('conversion', 'external', 'used', { interfaces: 1 })).toBe('retrofit');
    expect(defaultDisposition('conversion', 'manual', 'used')).toBe('review');
  });
  it('switches WRICEF on only for retrofit / rebuild gaps', () => {
    expect(g.rows.filter((r: Row) => r.wricef?.on).map((r: Row) => r.code)).toEqual(['1.1.1.2', '1.2.1.1', '1.2.1.2', '1.3.1.2']);
    expect(row(g, '1.1.1.1').wricef.on).toBe(false);
  });
  it('picks the WRICEF kind with a reason (I / E / F / C / R; graph types win)', () => {
    expect(row(g, '1.2.1.2').wricef.kind).toBe('I');
    expect(row(g, '1.2.1.1').wricef.kind).toBe('E');
    expect(row(g, '1.2.1.3').wricef.kind).toBe('F');
    expect(row(g, '1.1.1.2').wricef).toMatchObject({ kind: 'R', reason: 'program' }); // a daily upload program is not data migration
    expect(wricefKind({ label: 'Open item migration', objects: ['ZPT_MIG_OI'] }).kind).toBe('C');
    const typeOf = graphTypes({ nodes: [{ id: 'SSFO:ZPT_GR_FORM' }, { id: 'PROG:ZPT_X' }] });
    expect(wricefKind({ label: 'Label', objects: ['ZPT_GR_FORM'] }, typeOf).kind).toBe('F');
    expect(typeOf('ZPT_X')).toBe('PROG');
  });
  it('lists only customer objects (and exits) as the coverage of a gap', () => {
    expect(row(g, '1.1.1.2').coverage.map(o => o.name)).toEqual(['ZPT_PR_UPLOAD', 'ZPT01']);
    expect(row(g, '1.2.1.1').coverage).toEqual([expect.objectContaining({ name: 'MM06E005', type: 'EXIT' })]);
    expect(row(g, '1.1.1.1').coverage).toEqual([]);
  });
  it('takes the gap statement and evidence from the task sheet', () => {
    const r = row(g, '1.1.1.2') as Row & { why: { source?: { line: number } }[]; conversion: string[]; tbd: string[] };
    expect(r.statement).toMatch(/엑셀/);
    expect(r.why[0].source?.line).toBe(88);
    expect(r.conversion).toHaveLength(1);
    expect(r.tbd).toHaveLength(1);
  });
  it('checks the model', () => {
    expect(checkGap(g).errors).toEqual([]);
    const bad = JSON.parse(JSON.stringify(g));
    row(bad, '1.1.1.2').disposition = 'later';
    row(bad, '1.1.1.2').wricef.kind = 'Z';
    expect(checkGap(bad).errors.join(' ')).toMatch(/disposition "later".*WRICEF kind "Z"/);
    expect(() => deriveGap(PM, { scope: 'rollout' })).toThrow(/scope/);
  });
  it('counts per fit, usage and WRICEF kind', () => {
    const s = gapStats(g);
    expect(s.tasks).toBe(10);
    expect(s.byFit).toEqual({ fit: 2, gap: 5, partial: 1, external: 1, manual: 1 });
    expect(s.wricef).toBe(4);
    expect(s.l2.map((x: { code: string }) => x.code)).toEqual(['1.1', '1.2', '1.3']);
  });
});

describe('gap model — usage evidence', () => {
  const noBasis = { ...PM, overview: {} };
  it('reads the basis from the process model: destination set = productive ST03N, reliable', () => {
    const b = deriveGap(PM).usageBasis;
    expect(b).toMatchObject({ system: 'PRD', tier: 'prd', months: 12, coverage: 6, reliable: true, reason: '', tierBy: 'auto' });
    expect(row(deriveGap(PM), '1.1.1.2a').disposition).toBe('retire');
  });
  it('unknown source: "unused" becomes unknown and nothing is proposed for retirement', () => {
    const g = deriveGap(noBasis, { scope: 'conversion' });
    expect(g.usageBasis).toMatchObject({ tier: 'unknown', reliable: false, reason: 'unknown' });
    const v = row(g, '1.1.1.2a') as Row & { usageRaw: string };
    expect(v.usage).toBe('unknown');
    expect(v.usageRaw).toBe('unused');
    expect(v.disposition).toBe('review');
    expect(v.coverage[0]).not.toMatchObject({ usage: 'unused' });
    expect(g.rows.some((r: Row) => r.disposition === 'retire')).toBe(false);
    expect(deriveGap(noBasis, { scope: 'new' }).rows.some((r: Row) => r.disposition === 'retire')).toBe(false);
  });
  it('a non-productive system or a short window is not evidence either', () => {
    const np = deriveGap(PM, { usageTier: 'non-prd' });
    expect(np.usageBasis).toMatchObject({ tier: 'non-prd', reliable: false, reason: 'nonprd', tierBy: 'user' });
    expect(row(np, '1.1.1.2a').usage).toBe('unknown');
    const short = deriveGap(PM, { usage: { system: 'PRD', tcodes: { months: 12, coverage: 2, source: { system: 'PRD', destination: 'USAGE_PRD' } } } });
    expect(short.usageBasis).toMatchObject({ tier: 'prd', reliable: false, reason: 'short' });
    expect(row(short, '1.1.1.2a').disposition).toBe('review');
    expect(() => deriveGap(PM, { usageTier: 'qas' })).toThrow(/tier/);
  });
  it('a program that runs as a background job step counts as used', () => {
    const usage = { system: 'PRD', tcodes: { months: 12, source: { system: 'PRD', destination: 'USAGE_PRD' } }, jobs: { result: { ZPT_PR_UPLOAD_P100: true }, months: 12 } };
    const v = row(deriveGap(PM, { usage }), '1.1.1.2a') as Row & { usageWhy: string; usageRaw: string };
    expect(v).toMatchObject({ usage: 'used', usageWhy: 'job', usageRaw: 'unused', disposition: 'retrofit', wricef: { on: true } });
    expect(v.coverage[0]).toMatchObject({ name: 'ZPT_PR_UPLOAD_P100', usage: 'used' });
  });
  it('interface, form, enhancement and external rows stay "to be decided" when unused', () => {
    const unusedPm = JSON.parse(JSON.stringify(PM));
    for (const r of unusedPm.rows) if (['1.2.1.1', '1.2.1.2', '1.2.1.3'].includes(r.code)) r.usage = 'unused';
    unusedPm.rows.push({ code: '1.3.1.3', level: 4, label: 'Send GR to WMS', kind: 'cbo', usage: 'unused', objects: ['ZPT_GR_SEND'],
      task: { interfaces: [{ system: 'portal', direction: 'out', object: 'ZPT_GR_SEND' }] } });
    const g = deriveGap(unusedPm, { scope: 'conversion' });
    expect(row(g, '1.2.1.1')).toMatchObject({ fit: 'partial', disposition: 'review' });              // E — exit / BAdI
    expect(row(g, '1.2.1.2')).toMatchObject({ fit: 'external', disposition: 'review' });             // ext
    expect(row(g, '1.2.1.3')).toMatchObject({ disposition: 'review', wricef: { kind: 'F' } });     // form, output conditions
    expect(row(g, '1.3.1.3')).toMatchObject({ fit: 'gap', disposition: 'review', wricef: { kind: 'I' } }); // RFC / interface
    expect(defaultDisposition('new', 'gap', 'unused', { wricefKind: 'R' })).toBe('retire');
  });
  it('shows the basis on the cover and warns when it is not evidence', () => {
    const ok = renderGapHtml(deriveGap(PM), { version: '1.0', date: 'd' });
    expect(ok).toContain(`${GAP_LABELS.ko.tier_prd} (${GAP_LABELS.ko.tierGuess}) · ${GAP_LABELS.ko.destination} USAGE_PRD`); // destination-based tier is an estimate
    const userTier = renderGapHtml(deriveGap(PM, { usageTier: "prd" }), { version: "1.0", date: "d" });
    expect(userTier.slice(0, userTier.indexOf("</main>"))).not.toContain(GAP_LABELS.ko.tierGuess); // labels JSON after </main> holds every label
    expect(ok).not.toContain('class="ubwarn"');
    expect(ok).toContain(GAP_LABELS.ko.limits);
    expect(ok).toContain(GAP_LABELS.ko.standardHint.replace(/"/g, "&quot;"));
    const bad = renderGapHtml(deriveGap(noBasis), { version: '1.0', date: 'd' });
    expect(bad).toContain(`<p class="ubwarn">${GAP_LABELS.ko.ubWarn_unknown.replace(/"/g, "&quot;")}</p>`);
  });
});

describe('gap model — consultant edits survive', () => {
  it('carries edited fields by code from the previous version and marks them', () => {
    const prev = deriveGap(PM, { scope: 'conversion' });
    Object.assign(row(prev, '1.2.2.2'), { disposition: 'rebuild', note: 'Fiori app', statement: 'Own text' });
    row(prev, '1.2.2.2').wricef = { on: true, kind: 'R', reason: 'program' };
    const g = deriveGap(PM, { scope: 'conversion', prev });
    expect(row(g, '1.2.2.2')).toMatchObject({ disposition: 'rebuild', note: 'Fiori app', statement: 'Own text', wricef: { on: true } });
    expect(g.edited['1.2.2.2']).toEqual(expect.arrayContaining(['disposition', 'note', 'statement', 'wricef.on']));
    expect(g.edited['1.1.1.2']).toBeUndefined();
  });
  it('a companion (other language) takes only the decisions, not the free text', () => {
    const prev = deriveGap(PM, { scope: 'new' });
    Object.assign(row(prev, '1.2.2.2'), { disposition: 'rebuild', note: '메모' });
    const en = deriveGap({ ...PM, lang: 'en' }, { prev });
    expect(row(en, '1.2.2.2').disposition).toBe('rebuild');
    expect(row(en, '1.2.2.2').note).toBe('');
    expect(en.lang).toBe('en');
  });
  it('merges a consultant review patch and reports unknown codes', () => {
    const g = applyPatch(deriveGap(PM, { scope: 'new' }), { '1.2.1.3': { disposition: 'standard', note: 'Use output management' }, '1.3.1.2': { wricefKind: 'F' }, '9.9': { note: 'x' } });
    expect(row(g, '1.2.1.3')).toMatchObject({ disposition: 'standard', wricef: { on: false } });
    expect(row(g, '1.3.1.2').wricef).toMatchObject({ kind: 'F', reason: 'review' });
    expect(g.patchUnknown).toEqual(['9.9']);
  });
});

describe('gap → project dashboard WRICEF list', () => {
  it('exports the addWricef input and imports into a project model', () => {
    const items = wricefItems(deriveGap(PM, { scope: 'conversion' }), '1.0');
    expect(items[0]).toEqual({ label: '구매요청 일괄 등록', kind: 'R', module: 'MM', objects: ['ZPT_PR_UPLOAD', 'ZPT01'],
      note: 'Gap 1.1.1.2 · CBO 이관 · 사용', source: { doc: 'gap', module: 'MM', code: '1.1.1.2', version: '1.0' } });
    const team = [{ id: 'PM1', name: 'PM', role: 'pm' }, { id: 'MM1', name: 'MM con', role: 'module', module: 'MM' }];
    const proj = instantiate({ code: 'P1', name: 'Test', type: 'conversion', start: '2026-01-05', goLive: '2026-10-01', modules: ['MM'], team });
    const r = addWricef(proj, items);
    expect(r.added).toHaveLength(4);
    expect(r.skipped).toEqual([]);
    // notes in the model's language, never the raw word "unknown"; the version comes from the model when not given
    const g = deriveGap({ ...PM, overview: {} });
    row(g, '1.2.2.2').wricef.on = true; row(g, '1.2.2.2').disposition = 'rebuild';
    g.version = '1.3';
    const it = wricefItems(g).find((x: { source: { code: string } }) => x.source.code === '1.2.2.2');
    expect(it.note).toBe('Gap 1.2.2.2 · 재개발 · 실적 없음');
    expect(it.source.version).toBe('1.3');
    expect(wricefItems({ ...g, lang: 'en' }).find((x: { source: { code: string } }) => x.source.code === '1.2.2.2').note).toBe('Gap 1.2.2.2 · rebuild · no data');
    expect(wricefItems({ ...g, lang: 'ja' }).find((x: { source: { code: string } }) => x.source.code === '1.2.2.2').note).toBe('Gap 1.2.2.2 · 再開発 · 実績なし');
    // a second import of the same gap version adds nothing (source = gap + module + code)
    const again = addWricef(r.model, items);
    expect(again.added).toEqual([]);
    expect(again.skipped.map((x: { reason: string }) => x.reason)).toEqual(Array(4).fill('already imported'));
  });
});

describe('gap page', () => {
  const g = deriveGap(PM, { scope: 'conversion' });
  const html = renderGapHtml(g, { version: '1.0', date: '2026-11-16', history: [{ version: '1.0', date: '2026-11-16', note: 'x' }] });
  it('has the sections, selects bound to the model and the responsive layer', () => {
    for (const id of ['summary', 'matrix', 'register', 'wricef', 'appendix']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('data-p="row:1.1.1.2|disposition"');
    expect(html).toContain('data-p="row:1.1.1.2|wricef.kind"');
    expect(html).toMatch(/data-p="row:1\.1\.1\.2\|wricef\.on" data-f="won" disabled checked/);
    expect(html).not.toContain('data-p="row:1.1.1.1|wricef.on"'); // no WRICEF switch on a fit
    expect(html).toContain('m-scroll'); // RESPONSIVE_CSS
    expect(html).toContain('id="g-json"');
    expect(html).toContain(GAP_LABELS.ko.edHint);
  });
  it('every data-p path resolves in the embedded model', () => {
    const m = JSON.parse(/<script type="application\/json" id="process-model">([\s\S]*?)<\/script>/.exec(html)![1]).model;
    const body = html.slice(html.indexOf("<main>"), html.indexOf("</main>"));
    const paths = [...body.matchAll(/data-p="([^"]+)"/g)].map(x => x[1].replace(/&amp;/g, '&'));
    for (const p of paths) {
      const [head, rest] = p.split('|');
      const base = head === 'm' ? m : m.rows.find((r: Row) => r.code === head.slice(4));
      expect(base, p).toBeTruthy();
      const parent = rest.split('.').slice(0, -1).reduce((o: Record<string, unknown>, k: string) => (o as Record<string, Record<string, unknown>>)[k], base);
      expect(parent, p).toBeTruthy();
    }
  });
  it('embedded scripts parse; the editor handles selects and exposes the model', () => {
    expect(() => new Function(EDITOR_SCRIPT)).not.toThrow();
    expect(() => new Function(GAP_SCRIPT)).not.toThrow();
    expect(EDITOR_SCRIPT).toContain("closest('select[data-p],input[data-p]')");
    expect(EDITOR_SCRIPT).toContain('sc4sapEditModel');
  });
  it('labels exist for ko / en / ja with the same keys', () => {
    const keys = Object.keys(GAP_LABELS.en).sort();
    expect(Object.keys(GAP_LABELS.ko).sort()).toEqual(keys);
    expect(Object.keys(GAP_LABELS.ja).sort()).toEqual(keys);
  });
});

describe('build-gap-doc — versioned build, import, carry', () => {
  it('builds v1.0, imports the edited page, rebuilds and carries edits into the next derivation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gap-'));
    try {
      const r1 = buildGapDoc({ input: FIX, scope: 'conversion', outDir: dir });
      expect(r1.version).toBe('1.0');
      for (const f of [r1.html, r1.source, r1.history, r1.wricef]) expect(existsSync(f)).toBe(true);
      expect(JSON.parse(readFileSync(r1.wricef, 'utf8'))).toHaveLength(4);
      // the consultant edits in the browser: simulate the saved page
      const html = readFileSync(r1.html, 'utf8');
      const mm = /(<script type="application\/json" id="process-model">)([\s\S]*?)(<\/script>)/.exec(html)!;
      const data = JSON.parse(mm[2]);
      Object.assign(data.model.rows.find((r: Row) => r.code === '1.2.2.2'), { disposition: 'rebuild', wricef: { on: true, kind: 'R', reason: 'program' } });
      data.history.push({ version: '1.1', date: '2026-11-17', author: 'Tester', note: 'decisions' });
      const edited = join(dir, 'MM-gap-v1.0-ko-edited.html');
      writeFileSync(edited, html.replace(mm[0], mm[1] + JSON.stringify(data) + mm[3]));
      expect(readGap(edited).gap.rows.find((r: Row) => r.code === '1.2.2.2').disposition).toBe('rebuild');
      const gapJson = join(dir, 'gap.json');
      const imp = importEditedHtml(edited, gapJson, r1.history);
      expect(imp.added).toEqual(['1.1']);
      const r2 = buildGapDoc({ input: gapJson, outDir: dir, sameVersion: true });
      expect(r2.version).toBe('1.1');
      expect(r2.wricefItems).toBe(5);
      const rg = readGap(gapJson);
      expect(rg.version).toBe('1.0'); // the model carries the version it was built as (the page was built as v1.0)
      expect(wricefItems(rg.gap, rg.version).every((x: { source: { version: string } }) => x.source.version === '1.0')).toBe(true);
      expect(JSON.parse(readFileSync(r2.wricef, 'utf8')).every((x: { source: { version: string } }) => x.source.version === '1.1')).toBe(true);
      // a new process map version: the latest gap source (v1.1) is carried automatically
      const r3 = buildGapDoc({ input: FIX, outDir: dir });
      expect(r3.version).toBe('1.2');
      expect(r3.carried).toBeGreaterThan(0);
      const g3 = JSON.parse(readFileSync(r3.source, 'utf8'));
      expect(row(g3, '1.2.2.2').disposition).toBe('rebuild');
      expect(g3.scope).toBe('conversion');
      expect(buildGapDoc({ input: FIX, outDir: dir, check: true }).errors).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

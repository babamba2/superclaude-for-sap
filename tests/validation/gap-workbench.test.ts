import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { deriveGap, checkGap, blankGap, addRow, removeRow, applyOps, modelFromPage, wricefItems, nextGapCode } from '../../scripts/process/gap-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderGapHtml, readGap, safeMapHref } from '../../scripts/process/build-gap-doc.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { gapXlsx } from '../../scripts/process/gap-xlsx.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { WB_LABELS } from '../../scripts/process/gap-page.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { unzipEntries } from '../../scripts/spec/xlsx-zip.mjs';

const ROOT = resolve(__dirname, '../..');
const PM = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/process/model-gap-mm.json'), 'utf8'));
type Row = { code: string; level: number; label: string; manual?: boolean; parent?: string; req?: { id: string; text: string; source: string; priority: string }; effortMd?: number | string; owner?: string; decision?: { by: string; at: string }; wbs?: { ownerRef: string; projectId: string; rowId: string }; wbsStatus?: { stage: string }; renamedFrom?: string; fit: string; disposition: string; wricef: { on: boolean; kind: string }; why?: { text: string }[]; tbd?: string[] };
const row = (g: { rows: Row[] }, code: string) => g.rows.find((r) => r.code === code) as Row;
const blank = () => {
  let g = blankGap({ module: 'MM', scope: 'new', lang: 'ko', title: 'Blank' });
  for (const [parent, label, level] of [['', 'Procure', 0], ['1', 'Requisition', 0], ['1.1', 'Create requisition', 0], ['1.1.1', 'Mass upload', 0], ['1.1.1.1', 'Plant P100', 5]] as [string, string, number][]) g = addRow(g, { parent, label, level }).gap;
  return g;
};
const render = (g: unknown, embed = false) => renderGapHtml(g, { version: '1.0', date: '2026-11-17', history: [{ version: '1.0', date: '2026-11-17', note: 'x' }], embed });

describe('gap workbench — blank document and rows', () => {
  it('starts without a process map and takes L1–L4 rows and variants with automatic codes', () => {
    const g = blank();
    expect(g.rows.map((r: Row) => `${r.code}/${r.level}`)).toEqual(['1/1', '1.1/2', '1.1.1/3', '1.1.1.1/4', '1.1.1.1a/5']);
    expect(row(g, '1.1.1.1')).toMatchObject({ manual: true, kind: 'manual-req', usage: 'unknown', fit: 'gap', disposition: 'review', wricef: { on: false } });
    expect(row(g, '1.1.1.1a')).toMatchObject({ parent: '1.1.1.1', variant: 'a' });
    expect(checkGap(g)).toEqual({ errors: [], warnings: ['row 1.1.1.1: disposition to be decided', 'row 1.1.1.1a: disposition to be decided'] });
    const g2 = addRow(g, { parent: '1', label: 'Order' }).gap;
    expect(g2.rows.map((r: Row) => r.code)).toEqual(['1', '1.1', '1.1.1', '1.1.1.1', '1.1.1.1a', '1.2']); // after the parent's last row
    expect(nextGapCode(g2, '', 1)).toBe('2');
    expect(nextGapCode(g2, '1.1.1.1', 5)).toBe('1.1.1.1b');
  });
  it('refuses rows in the wrong place and removes a row with everything under it', () => {
    const g = blank();
    expect(() => addRow(g, { parent: '1.1.1.1a', label: 'x' })).toThrow();
    expect(() => addRow(g, { parent: '1', level: 3, label: 'x' })).toThrow(/level 3/);
    expect(() => addRow(g, { parent: '9', label: 'x' })).toThrow(/not found/);
    expect(() => addRow(g, { parent: '1', label: '  ' })).toThrow(/label/);
    const r = removeRow(g, '1.1');
    expect(r.removed).toEqual(['1.1', '1.1.1', '1.1.1.1', '1.1.1.1a']);
    expect(r.gap.rows.map((x: Row) => x.code)).toEqual(['1']);
    expect(g.rows).toHaveLength(5); // input untouched
  });
});

describe('gap workbench — new row fields survive a new derivation', () => {
  it('keeps manual rows and req / effortMd / owner / decision / wbs by code; renames a manual code a new derivation uses', () => {
    let prev = deriveGap(PM, { scope: 'conversion' });
    Object.assign(row(prev, '1.1.1.2'), { req: { id: 'REQ-1', text: 'Bulk upload', source: 'WS1', priority: 'H' }, effortMd: 5, owner: 'A. Kim', decision: { by: 'PMO', at: '2026-11-17' },
      wbs: { ownerRef: 'u1', projectId: 'P1', rowId: 'W1' }, wbsStatus: { stage: 'fs' } });
    prev = addRow(prev, { parent: '1.1.1', label: 'Manual check', req: { id: 'REQ-2', text: 'Two-step check' } }).gap; // → 1.1.1.3
    prev = addRow(prev, { parent: '', label: 'New area' }).gap; // → 2
    const pm2 = JSON.parse(JSON.stringify(PM));
    pm2.rows.splice(4, 0, { code: '1.1.1.3', level: 4, label: 'Derived now', kind: 'std', usage: 'used', tcodes: ['ME51N'], task: { definition: 'x' } });
    const g = deriveGap(pm2, { scope: 'conversion', prev });
    expect(row(g, '1.1.1.2')).toMatchObject({ req: { id: 'REQ-1', priority: 'H' }, effortMd: 5, owner: 'A. Kim', decision: { by: 'PMO' }, wbs: { rowId: 'W1' }, wbsStatus: { stage: 'fs' } });
    expect(row(g, '1.1.1.3').label).toBe('Derived now'); // the derivation keeps its code
    const moved = g.rows.find((r: Row) => r.renamedFrom === '1.1.1.3') as Row;
    expect(moved).toMatchObject({ code: '1.1.1.4', label: 'Manual check', manual: true, req: { id: 'REQ-2' } });
    expect(row(g, '2')).toMatchObject({ label: 'New area', manual: true });
    expect(checkGap(g).errors).toEqual([]);
    // a second derivation from the same map is stable (no duplicates)
    const g3 = deriveGap(pm2, { scope: 'conversion', prev: g });
    expect(g3.rows.map((r: Row) => r.code)).toEqual(g.rows.map((r: Row) => r.code));
  });
  it('a companion takes the requirement id, source and priority but keeps its own text', () => {
    const prev = deriveGap(PM, { scope: 'new' });
    row(prev, '1.1.1.2').req = { id: 'REQ-1', text: '대량 업로드', source: 'WS1', priority: 'H' };
    const en = deriveGap({ ...PM, lang: 'en' }, { prev });
    expect(row(en, '1.1.1.2').req).toEqual({ id: 'REQ-1', text: '', source: 'WS1', priority: 'H' });
  });
});

describe('gap workbench — AI suggestions (applyOps)', () => {
  it('sets the allowed fields with checks and refuses owner / decision / wbs / usage / coverage / objects / codes', () => {
    const g = blank();
    const r = applyOps(g, [
      { op: 'set', code: '1.1.1.1', field: 'statement', value: 'The standard has no mass upload.' },
      { op: 'set', code: '1.1.1.1', field: 'req.text', value: 'Upload 100+ requisitions' },
      { op: 'set', code: '1.1.1.1', field: 'req.priority', value: 'H' },
      { op: 'set', code: '1.1.1.1', field: 'fit', value: 'gap' },
      { op: 'set', code: '1.1.1.1', field: 'disposition', value: 'rebuild' },
      { op: 'set', code: '1.1.1.1', field: 'wricef.on', value: true },
      { op: 'set', code: '1.1.1.1', field: 'wricef.kind', value: 'C' },
      { op: 'set', code: '1.1.1.1', field: 'effortMd', value: '7.25' },
      { op: 'set', code: '1.1.1.1', field: 'why', value: ['No mass function'] },
      { op: 'set', code: '1.1.1.1', field: 'tbd', value: '확인 필요' },
      { op: 'set', code: '1.1.1.1', field: 'note', value: 'n' },
      { op: 'add-row', parent: '1.1.1', label: 'Approval' },
      ...['owner', 'decision', 'wbs', 'usage', 'usageBasis', 'coverage', 'objects', 'code'].map((field) => ({ op: 'set', code: '1.1.1.1', field, value: 'x' })),
      { op: 'set', code: '1.1.1.1', field: 'fit', value: 'perfect' },
      { op: 'set', code: '1.1.1.1', field: 'effortMd', value: -1 },
      { op: 'set', code: '1', field: 'statement', value: 'group' },
      { op: 'set', code: '__proto__', field: 'note', value: 'x' },
      { op: 'set', code: '1.9.9.9', field: 'note', value: 'x' },
      { op: 'delete', code: '1' },
    ]);
    expect(r.applied).toHaveLength(12);
    const x = row(r.gap, '1.1.1.1');
    expect(x).toMatchObject({ statement: 'The standard has no mass upload.', req: { text: 'Upload 100+ requisitions', priority: 'H' }, disposition: 'rebuild', wricef: { on: true, kind: 'C' }, effortMd: 7.3, tbd: ['확인 필요'], note: 'n' });
    expect(x.why).toEqual([{ text: 'No mass function', estimated: true }]);
    expect(row(r.gap, '1.1.1.2')).toMatchObject({ label: 'Approval', manual: true });
    expect(r.skipped.map((s: { why: string }) => s.why)).toEqual([
      ...['owner', 'decision', 'wbs', 'usage', 'usageBasis', 'coverage', 'objects', 'code'].map((f) => `field "${f}" is not changed by suggestions`),
      'fit must be fit / partial / gap / manual / external', 'effortMd must be a number of man-days (0–10000)', 'row 1 is a group row',
      'code must look like 1.2.3.4 (or 1.2.3.4a)', 'row 1.9.9.9 not found', 'unknown op "delete"']);
    expect(({} as Record<string, unknown>).note).toBeUndefined(); // no prototype write
    expect(row(g, '1.1.1.1').statement).toBe(''); // input untouched
  });
});

describe('gap workbench — page, WRICEF, workbook', () => {
  const derived = () => { const g = deriveGap(PM, { scope: 'conversion' }); g.version = '1.0'; return g; };
  it('without embed and without workbench fields the page has no workbench parts (the CLI page as before)', () => {
    const html = render(derived());
    for (const s of ['SC4SAP_PAGE', 'wb-labels', 'wb-add', 'wb-del', WB_LABELS.ko.req, '"embed":true', 'data-wb-level']) expect(html).not.toContain(s);
    expect(html).toContain('id="ed-save"');
    expect(html).toContain('colspan="8"');
  });
  it('embed: the page contract, no Save / leave warning / drafts, row tools and the workbench columns', () => {
    const html = render(blank(), true);
    expect(html).toContain("kind: 'gap'");
    expect(html).toContain('#ed-save{display:none!important}');
    expect(html).toContain("if (t === 'beforeunload') return;");
    expect(html).toContain('"embed":true');
    expect(html).toContain('data-p="row:1.1.1.1|req.text"');
    expect(html).toContain('data-p="row:1.1.1.1|effortMd"');
    expect(html).toContain('data-p="row:1.1.1.1|owner"');
    expect(html).toContain('class="edx wb-del" data-code="1.1.1.1"');
    expect(html).toContain('<template data-wb-level="4">');
    expect(html).toContain('colspan="11"');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    for (const s of scripts) expect(() => new Function(s)).not.toThrow();
    // a blank document's CLI page has the row tools too, but keeps Save and drafts
    const cli = render(blank());
    expect(cli).toContain('wb-add');
    expect(cli).not.toContain('#ed-save{display:none!important}');
    expect(cli).not.toContain("if (t === 'beforeunload') return;");
  });
  it('the process-map link is a plain relative .html path only; anything else gives no link', () => {
    for (const bad of ['/\\evil.com/a.html', '\\/host', '%5C%5Chost', 'javascript:alert(1)', '../x.html', 'a/../x.html', '//evil.com/a.html', 'C:\\x.html', 'x.html#\\', 'a%2Fb.html', 'https://e.com/a.html', 'x.htm', '']) {
      expect(safeMapHref(bad), bad).toBe('');
      const html = renderGapHtml(derived(), { version: '1.0', date: '2026-11-17', mapHref: bad });
      expect(html).not.toMatch(/<a href="[^"#]/); // no link but the in-page anchors
    }
    for (const ok of ['MM-process-v1.0-ko.html', 'sub/MM_process.v2-en.html']) {
      expect(safeMapHref(ok)).toBe(ok);
      expect(renderGapHtml(derived(), { version: '1.0', date: '2026-11-17', mapHref: ok })).toContain(`<a href="${ok}">${ok}</a>`);
    }
  });
  it('modelFromPage reads the model back (also through readGap); garbage gives null', () => {
    const g = blank();
    const html = render(g, true);
    expect(modelFromPage(html)).toMatchObject({ version: '1.0' });
    expect(modelFromPage(html).model).toEqual(JSON.parse(JSON.stringify(g)));
    expect(modelFromPage('<p>x</p>')).toBeNull();
    expect(modelFromPage('<script type="application/json" id="process-model">{"model":{"kind":"process"}}</script>')).toBeNull();
    expect(typeof readGap).toBe('function');
  });
  it('WRICEF items carry the requirement and the effort; rows without them give the earlier item', () => {
    const g = derived();
    const before = JSON.stringify(wricefItems(g));
    Object.assign(row(g, '1.1.1.2'), { req: { id: 'REQ-1', text: 'Bulk upload', source: '', priority: 'H' }, effortMd: '5' });
    const it = wricefItems(g).find((x: { source: { code: string } }) => x.source.code === '1.1.1.2');
    expect(it.note).toBe('Gap 1.1.1.2 · CBO 이관 · 사용 · REQ-1: Bulk upload · 공수 5 MD');
    expect(it.source).toMatchObject({ reqId: 'REQ-1', effortMd: 5 });
    const other = wricefItems(g).filter((x: { source: { code: string } }) => x.source.code !== '1.1.1.2');
    expect(JSON.stringify(other)).toBe(JSON.stringify(JSON.parse(before).filter((x: { source: { code: string } }) => x.source.code !== '1.1.1.2')));
  });
  it('the workbook has the six sheets and the workbench columns', () => {
    const g = blank();
    row(g, '1.1.1.1').req = { id: 'REQ-9', text: 'Upload', source: '', priority: 'H' };
    const files = unzipEntries(gapXlsx(g, 'ko'));
    const wb = Buffer.from(files.find((e: { name: string }) => e.name === 'xl/workbook.xml').data).toString('utf8');
    expect([...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1])).toEqual(['요약', 'Fit-Gap 매트릭스', 'Gap 상세', 'WRICEF 후보', '미사용 표준', '확인 필요']);
    const m = Buffer.from(files.find((e: { name: string }) => e.name === 'xl/worksheets/sheet2.xml').data).toString('utf8');
    expect(m).toContain('REQ-9');
    expect(m).toContain(WB_LABELS.ko.effort);
    expect(files.map((e: { name: string }) => e.name)).toContain('xl/worksheets/sheet6.xml');
  });
});

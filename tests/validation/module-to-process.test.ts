import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { mergeGraphs, crossPackageEdges } from '../../scripts/process/merge-graphs.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { loadBackbone, flattenBackbone, candidates, scoreTask } from '../../scripts/process/backbone.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { usageScope, usageExport } from '../../scripts/process/usage-scope.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { drawSwimlane, l3Map, stepLanes } from '../../scripts/process/swimlane.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { assembleModel } from '../../scripts/process/assemble-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { readXlsx, parseBph, fixId, reconcile, similarity } from '../../scripts/process/bph-import.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { extractTexts, applyTexts } from '../../scripts/process/companion.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { zipFiles } from '../../scripts/spec/xlsx-zip.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { checkModel, normalizeModel, rollup, interfaceIndex, conversionIndex } from '../../scripts/process/process-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderProcessHtml, buildProcessDoc, nextVersion, importEditedHtml } from '../../scripts/process/build-process-doc.mjs';

const ROOT = resolve(__dirname, '../..');
const MODEL = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/process/model-mm.json'), 'utf8'));

const node = (id: string, scope = 'member', extra = {}) => ({ id, type: id.split(':')[0], name: id.split(':')[1], scope, ...extra });
const edge = (from: string, kind: string, to: string, extra = {}) => ({ from, kind, to, count: 1, evidence: [{ unit: from.split(':')[1], line: 1, text: '' }], ...extra });

const GA = {
  package: 'ZPT_MM_A', module: 'MM', system: 'DEV', sapVersion: 'ECC',
  nodes: [node('TRAN:ZPT01'), node('PROG:ZPT_PR_BATCH'), node('FUNC:BAPI_PR_CREATE', 'standard'), node('TABL:EBAN', 'standard'),
    node('TABL:ZPT_LOG', 'custom'), node('PROG:ZPT_PO_SEND', 'custom')],
  edges: [edge('TRAN:ZPT01', 'launches', 'PROG:ZPT_PR_BATCH'), edge('PROG:ZPT_PR_BATCH', 'calls', 'FUNC:BAPI_PR_CREATE', { bapi: true }),
    edge('PROG:ZPT_PR_BATCH', 'reads', 'TABL:EBAN'), edge('PROG:ZPT_PR_BATCH', 'submits', 'PROG:ZPT_PO_SEND')],
  unresolved: [], coverage: { members: 2 },
};
const GB = {
  package: 'ZPT_MM_B', module: 'MM', system: 'DEV', sapVersion: 'ECC',
  nodes: [node('PROG:ZPT_PO_SEND'), node('TABL:ZPT_LOG'), node('TABL:EKKO', 'standard'), node('TRAN:ME21N', 'standard')],
  edges: [edge('PROG:ZPT_PO_SEND', 'starts', 'TRAN:ME21N'), edge('PROG:ZPT_PO_SEND', 'writes', 'TABL:EKKO'), edge('PROG:ZPT_PO_SEND', 'writes', 'TABL:ZPT_LOG')],
  unresolved: [{ from: 'PROG:ZPT_PO_SEND', kind: 'dynamic', token: 'LV' }], coverage: { members: 2 },
};

describe('merge-graphs', () => {
  const g = mergeGraphs([GA, GB], { module: 'MM', builtAt: 'T' });
  it('upgrades a custom leaf to member and records its package', () => {
    const n = g.nodes.find((x: any) => x.id === 'PROG:ZPT_PO_SEND');
    expect(n.scope).toBe('member');
    expect(n.packages).toEqual(['ZPT_MM_B']);
  });
  it('flags edges between members of different packages', () => {
    expect(crossPackageEdges(g).map((e: any) => `${e.from}>${e.to}`)).toEqual(['PROG:ZPT_PR_BATCH>PROG:ZPT_PO_SEND']);
  });
  it('keeps unresolved with their package and coverage per package', () => {
    expect(g.unresolved[0].package).toBe('ZPT_MM_B');
    expect(Object.keys(g.coverage)).toEqual(['ZPT_MM_A', 'ZPT_MM_B']);
  });
  it('rejects the same package twice', () => {
    expect(() => mergeGraphs([GA, GA])).toThrow(/twice/);
  });
});

describe('backbone', () => {
  const { trees, missing } = loadBackbone(ROOT, ['MM', 'SD', 'XX']);
  it('loads MM and SD and reports missing modules', () => {
    expect(trees.map((t: any) => t.module)).toEqual(['MM', 'SD']);
    expect(missing).toEqual(['XX']);
  });
  it('every node id nests under its parent and L4 tasks carry anchors', () => {
    const flat = flattenBackbone(trees, 'ko');
    const ids = new Set(flat.map((n: any) => n.id));
    expect(ids.size).toBe(flat.length);
    for (const n of flat) {
      expect(n.level).toBe(n.id.split('.').length);
      if (n.level > 1) expect(ids.has(n.id.split('.').slice(0, -1).join('.'))).toBe(true);
      if (n.level === 4) expect(n.tcodes.length + n.bapis.length + n.tables.length).toBeGreaterThan(0);
      expect(n.label).toBeTruthy();
    }
  });
  it('ranks the PR task first for a program calling BAPI_PR_CREATE', () => {
    const g = mergeGraphs([GA, GB], { module: 'MM' });
    const res = candidates(g, trees.filter((t: any) => t.module === 'MM'), { lang: 'en' });
    const e = res.entries.find((x: any) => x.id === 'TRAN:ZPT01');
    expect(e.program).toBe('ZPT_PR_BATCH');
    expect(e.candidates[0].task).toBe('MM.2.1.1');
    expect(e.candidates[0].why).toContain('calls BAPI_PR_CREATE');
    // reached program starts ME21N and writes EKKO → PO task proposed too (indirect weight)
    expect(e.candidates.map((c: any) => c.task)).toContain('MM.2.3.1');
  });
  it('caps read-only evidence', () => {
    const f = { tcodes: new Map(), bapis: new Map(), writes: new Map(), reads: new Map([['A', 1], ['B', 1], ['C', 1], ['D', 1], ['E', 1]]) };
    expect(scoreTask({ tcodes: [], bapis: [], tables: ['A', 'B', 'C', 'D', 'E'] }, f).score).toBe(2);
  });
});

describe('usage-scope', () => {
  const all = [{ name: 'ZPT01', packageName: 'ZPT_A' }, { name: 'ZPT02', packageName: 'ZPT_A' }, { name: 'ZPT03', packageName: 'ZPT_B' },
    { name: 'ZPT04', packageName: 'ZPT_B' }, { name: 'ZPT05', packageName: 'ZPT_B' }, { name: 'ZPT09', packageName: 'ZOTHER' }];
  const tran = { transactions: [{ tcode: 'ZPT03', kind: 'program', program: 'ZPT_SHARED' }, { tcode: 'ZPT04', kind: 'program', program: 'ZPT_SHARED' },
    { tcode: 'ZPT05', kind: 'parameter', parameters: { VIEWNAME: 'ZPT_V1' } }] };
  const res = usageScope({ all, used: ['zpt01', 'ZPT03', 'ZPT04', 'ZPT05', 'ZPT09'], tran, packages: ['ZPT_A', 'ZPT_B'], module: 'MM', months: 12, coverage: 3, system: 'PRD', destination: 'RFC1', jobs: ['ZPT_JOB'] });
  it('keeps only used TCodes of the given packages', () => {
    const t = res.walk.objects.filter((o: any) => o.type === 'TRAN').map((o: any) => o.name);
    expect(t).toEqual(['ZPT01', 'ZPT03', 'ZPT04', 'ZPT05']);
    expect(res.scope.tcodes).toEqual({ inScope: 5, used: 4, unused: 1 });
    expect(res.scope.unused).toEqual([{ name: 'ZPT02', package: 'ZPT_A' }]);
  });
  it('dedupes programs, separates SM30 views, assumes program = TCode when unmapped, adds job programs', () => {
    const progs = res.walk.objects.filter((o: any) => o.type === 'PROG');
    expect(progs.map((o: any) => o.name)).toEqual(['ZPT01', 'ZPT_SHARED', 'ZPT_JOB']);
    expect(progs[1].tcodes).toEqual(['ZPT03', 'ZPT04']);
    expect(res.walk.objects.find((o: any) => o.type === 'VIEW').name).toBe('ZPT_V1');
    expect(res.scope.assumed).toEqual(['ZPT01']);
  });
  it('writes the usage file in the G4 shape with the window', () => {
    expect(res.usage.tcodes.result).toMatchObject({ ZPT01: true, ZPT02: false });
    expect(res.usage.tcodes).toMatchObject({ months: 12, coverage: 3, complete: false, source: { system: 'PRD', destination: 'RFC1', kind: 'rfc' } });
    expect(res.usage.jobs.result).toEqual({ ZPT_JOB: true });
  });
  it('exports the measured usage for reuse', () => {
    const x = usageExport(res);
    expect(x).toMatchObject({ kind: 'tcode-usage', system: 'PRD', destination: 'RFC1', months: 12, coverage: 3 });
    expect(x.used).toEqual(['ZPT01', 'ZPT03', 'ZPT04', 'ZPT05']);
    expect(x.measured).toHaveLength(5);
  });
  it('drops non-custom target programs to external', () => {
    const r = usageScope({ all: [{ name: 'ZPT07', packageName: 'ZPT_A' }], used: ['ZPT07'], tran: [{ tcode: 'ZPT07', kind: 'program', program: 'AQZZQUERY' }], packages: ['ZPT_A'] });
    expect(r.scope.external).toEqual([{ tcode: 'ZPT07', program: 'AQZZQUERY' }]);
    expect(r.walk.objects.filter((o: any) => o.type === 'PROG')).toEqual([]);
  });
});

describe('assemble-model', () => {
  const step4 = {
    lanes: [{ id: 'buyer', label: 'Buyer', estimated: true }], systems: [{ id: 'sap', kind: 'sap', label: 'SAP' }],
    rows: [{ code: '1', level: 1, label: 'L1' }, { code: '1.1', level: 2, label: 'L2' }, { code: '1.1.1', level: 3, label: 'L3' },
      { code: '1.1.1.1', level: 4, label: 'A', kind: 'cbo', system: 'sap' }, { code: '1.1.1.2', level: 4, label: 'B', kind: 'cbo' },
      { code: '1.1.1.3', level: 4, label: 'C', kind: 'std' }],
    not_evidenced: [{ backbone: 'MM.3.4', label: 'PI', reason: 'none' }], cross_module: [], open_questions: ['q1'],
  };
  const parts = [{ tasks: [{ code: '1.1.1.1', task: { definition: 'd', rules: [{ text: 'r', estimated: true }] }, row_patch: { owner: 'whs' } }],
    lanes_added: [{ id: 'whs', label: 'Warehouse', estimated: true }], systems_added: [{ id: 'wms', kind: 'external', label: 'WMS' }], open_questions: ['q1', 'q2'] }];
  const reviews = [{ labels: [{ code: '1.1', label: 'Purchasing' }], conversion: [{ code: '1.1.1.1', notes: ['MATDOC'] }],
    std_sheets: [{ code: '1.1.1.3', definition: 'std d' }], glossary: [{ term: 'PR', description: 'x' }] }];
  const scope = { perPackage: { ZPT_A: { tcodes: 10, used: 4 } }, tcodes: { inScope: 10, used: 4 }, window: { months: 12, coverage: 3, system: 'PRD' } };
  const m = assembleModel({ intake: { module: 'MM', language: 'en', sapVersion: 'ECC' }, step4, parts, reviews, scope, system: 'DEV' });
  it('merges sheets, patches, added lanes and systems, reviews', () => {
    const a = m.rows.find((r: any) => r.code === '1.1.1.1');
    expect(a.owner).toBe('whs');
    expect(a.task.conversion).toEqual(['MATDOC']);
    expect(m.lanes.map((l: any) => l.id)).toEqual(['buyer', 'whs']);
    expect(m.scope.systems.map((s: any) => s.id)).toEqual(['sap', 'wms']);
    expect(m.rows.find((r: any) => r.code === '1.1').label).toBe('Purchasing');
    expect(m.rows.find((r: any) => r.code === '1.1.1.3').task.definition).toBe('std d');
    expect(m.openQuestions).toEqual(['q1', 'q2']);
  });
  it('flags CBO tasks without a sheet and carries scope + notEvidenced', () => {
    expect(m.rows.find((r: any) => r.code === '1.1.1.2').task.tbd).toEqual(['Task sheet not generated']);
    expect(m.scope.packages).toEqual([{ name: 'ZPT_A', tcodes: 10, used: 4 }]);
    expect(m.overview.scopeNote).toBe('Usage scope: 4 of 10 TCodes used (last 3 months on PRD)');
    expect(m.notEvidenced).toHaveLength(1);
  });
  it('maps cross-module rows written with a task code and drops duplicates', () => {
    const x = assembleModel({ intake: { module: 'MM', language: 'en' }, step4: { ...step4, cross_module: [{ from: 'MM', to: 'FI', object: 'O', desc: 'd' }] },
      parts: [{ tasks: [], cross_module: [{ from: '1.1.1.1', module: 'PM', note: 'n' }, { from: 'MM', to: 'FI', object: 'O', desc: 'd' }] }] });
    expect(x.crossModule).toEqual([{ from: 'MM', to: 'FI', object: 'O', desc: 'd' }, { from: 'MM', to: 'PM', object: '1.1.1.1', desc: 'n' }]);
  });
  it('produces a model the checker accepts', () => {
    expect(checkModel(m).errors).toEqual([]);
  });
});

/** Minimal xlsx: one sheet, inline strings, given rows (array of arrays). */
function xlsx(name: string, rows: string[][]) {
  const col = (i: number) => String.fromCharCode(65 + i);
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, i) =>
    `<row r="${i + 1}">${r.map((c, j) => (c === '' ? '' : `<c r="${col(j)}${i + 1}" t="inlineStr"><is><t>${esc(c)}</t></is></c>`)).join('')}</row>`).join('')}</sheetData></worksheet>`;
  return zipFiles([
    { name: 'xl/workbook.xml', data: Buffer.from(`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from('<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) },
  ]);
}

describe('bph-import', () => {
  const rows = [
    ['Invented BPH'], ['L1 ID', 'L1 Desc.(KO)', 'L2 ID', 'L2 Desc.(KO)', 'L3 ID', 'L3 Desc.(KO)', 'L4 ID', 'L4 Desc.(KO)', 'L4 Desc.(EN)', 'To-Be System', 'Variant ID', 'Variant Desc'],
    ['5', '구매', '5.1', '조달', '5.1.1', '구매요청', '5.1.1.1', '구매요청 생성', 'Create PR', 'SAP', '', ''],
    ['', '', '', '', '', '', '5.1.1.2', '구매요청 일괄 생성', 'Mass PR', 'SAP', '5.1.1.2a', '회사 A'],
    ['', '', '', '', '', '', '', '', '', '', '5.1.1.2b', '회사 B'],
    ['', '', '5.1999999999999993', '재고', '5.2.1', '입고', '5.2.1.1', '외주 가공 입고', 'Subcon GR', 'N', '', ''],
  ];
  const sheets = readXlsx(xlsx('MM', rows));
  const bph = parseBph(sheets[0]);
  it('finds the header, forward-fills the hierarchy and fixes float IDs', () => {
    expect(bph.rows.map((r: any) => `${r.level}:${r.id}`)).toEqual(['1:5', '2:5.1', '3:5.1.1', '4:5.1.1.1', '4:5.1.1.2', '2:5.2', '3:5.2.1', '4:5.2.1.1']);
    expect(bph.rows.find((r: any) => r.id === '5.1.1.2').variants.map((v: any) => v.id)).toEqual(['5.1.1.2a', '5.1.1.2b']);
    expect(bph.rows.find((r: any) => r.id === '5.1.1.1')).toMatchObject({ label: '구매요청 생성', labelAlt: 'Create PR', system: 'SAP' });
    expect(fixId('8.3000000000000007')).toBe('8.3');
    expect(fixId('8.1.2.2')).toBe('8.1.2.2');
  });
  it('ignores action words when comparing labels', () => {
    expect(similarity('계약 생성/변경', '자재마스터 생성/변경')).toBeLessThan(0.2);
    expect(similarity('구매요청 일괄 생성', '구매요청 일괄 생성')).toBe(1);
  });
  it('reconciles model L4 tasks with BPH L4 rows', () => {
    const rc = reconcile(normalizeModel(MODEL), bph);
    expect(rc.matched.map((x: any) => `${x.code}=${x.bph}`)).toEqual(['1.1.1.1=5.1.1.1', '1.1.1.2=5.1.1.2']);
    expect(rc.bphOnly.map((x: any) => x.bph)).toEqual(['5.2.1.1']);
    expect(rc.modelOnly.map((x: any) => x.code)).toEqual(['1.1.2.1']);
    const html = renderProcessHtml({ ...MODEL, reconcile: { source: 'bph.xlsx', ...rc } }, { version: '1.0', date: 'd' });
    expect(html).toContain('id="bphrc"');
    expect(html).toContain('BPH에만 있음');
  });
});

describe('companion', () => {
  it('extracts prose once, never codes or identifiers, and writes translations to every path', () => {
    const t = extractTexts(MODEL);
    const texts = t.items.map((x: any) => x.text);
    expect(texts).toContain('구매요청 일괄 생성');
    expect(texts).not.toContain('ZPT_PR_BATCH');
    expect(texts).not.toContain('1.1.1.2');
    expect(new Set(texts).size).toBe(texts.length);
    const same = t.items.find((x: any) => x.text === '구매요청 번호');
    expect(t.paths[same.i].length).toBeGreaterThan(1); // used as output of two tasks
    const tr = { items: t.items.map((x: any) => ({ i: x.i, text: `EN:${x.text}` })) };
    const { model: en, missing } = applyTexts(MODEL, t, tr, 'en');
    expect(missing).toEqual([]);
    expect(en.lang).toBe('en');
    const r = en.rows.find((x: any) => x.code === '1.1.1.2');
    expect(r.label).toBe('EN:구매요청 일괄 생성');
    expect(r.task.rules[0].text).toBe('EN:플랜트가 없으면 건너뛴다.');
    expect(r.task.rules[0].source.object).toBe('ZPT_PR_BATCH');
    expect(r.task.steps[0].owner).toBe('batch');
    expect(en.glossary[0].term).toBe('PR');            // an identifier-like term stays
    expect(MODEL.rows.find((x: any) => x.code === '1.1.1.2').label).toBe('구매요청 일괄 생성'); // input untouched
  });
  it('reports untranslated items', () => {
    const t = extractTexts(MODEL);
    expect(applyTexts(MODEL, t, { items: [] }, 'en').missing).toHaveLength(t.items.length);
  });
});

describe('swimlane', () => {
  it('draws lanes, boxes, arrows and wraps after 5 columns into bands', () => {
    const svg = drawSwimlane({ lanes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      nodes: Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, label: `T${i}`, lane: i % 2 ? 'b' : 'a', col: i, system: 'sap', kind: 'cbo' })),
      edges: [{ from: 'n0', to: 'n1' }] });
    expect(svg.match(/<path d=/g)).toHaveLength(2); // marker + 1 edge
    expect(svg).toContain('stroke="#B3541E"');
    const h = Number(/height="(\d+)"/.exec(svg)[1]);
    expect(h).toBe(34 + 2 * 2 * 84 + 16); // 2 bands × 2 lanes
  });
  it('maps an L3: owner lanes, links inside as arrows, links outside as notes, variant badge', () => {
    const m = normalizeModel(MODEL);
    const svg = l3Map(m, '1.1.1', { variantWord: 'Variant' });
    expect(svg).toContain('현업 부서');
    expect(svg).toContain('Variant 2');
    expect(svg).toContain('→ 1.1.2.1');
    expect(svg).toContain('href="#p-1-1-1-2"');
  });
  it('draws the steps of a task in order and skips tasks with fewer than 2 steps', () => {
    const m = normalizeModel(MODEL);
    const svg = stepLanes(m, m.rows.find((r: any) => r.code === '1.1.1.2'));
    expect(svg).toContain('배치');
    expect(svg).toContain('구매담당');
    expect(stepLanes(m, m.rows.find((r: any) => r.code === '1.1.1.1'))).toBe('');
  });
});

describe('process model', () => {
  it('accepts the fixture', () => {
    const { errors, warnings } = checkModel(MODEL);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
  it('reports level, parent order, unknown owner and missing rule source', () => {
    const bad = JSON.parse(JSON.stringify(MODEL));
    bad.rows.splice(1, 0, { code: '2.1', level: 3, label: 'x' });
    bad.rows.find((r: any) => r.code === '1.1.2.1').owner = 'nobody';
    bad.rows.find((r: any) => r.code === '1.1.2.1').task.rules = ['no source'];
    const { errors, warnings } = checkModel(bad);
    expect(errors.join('\n')).toMatch(/2\.1: level 3/);
    expect(errors.join('\n')).toMatch(/parent 2 must come before/);
    expect(errors.join('\n')).toMatch(/owner "nobody"/);
    expect(warnings.join('\n')).toMatch(/rules\[0\] has no source/);
  });
  it('rolls up tasks and objects per L2 and gathers appendix lists', () => {
    const m = normalizeModel(MODEL);
    expect(rollup(m, '1.1')).toMatchObject({ tasks: 3, cbo: 1, std: 2 });
    expect(interfaceIndex(m)).toHaveLength(1);
    expect(conversionIndex(m)[0].code).toBe('1.1.1.2');
  });
});

describe('build-process-doc', () => {
  it('renders every section, badges, variants and the embedded model', () => {
    const html = renderProcessHtml(MODEL, { version: '1.0', date: '2026-10-27', history: [{ version: '1.0', date: '2026-10-27', note: '최초 작성' }] });
    for (const id of ['revision', 'overview', 'bph', 'details', 'appendix', 'p-1-1-1-2']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('class="flowfig swim scenario"');
    expect(html).toContain('Variant 매트릭스');
    expect(html).toContain('class="badge k-cbo"');
    expect(html).toContain('Variant: 회사 2000');
    expect(html).toContain('[근거 <code>ZPT_PR_BATCH ZPT_PR_BATCH_F01 :120</code>]');
    expect(html).toContain('class="sys sys-external"');
    expect(html).toContain('<svg');
    expect(html).toContain('id="process-model"');
    expect(html).not.toMatch(/<\/script>\s*<\/script>/);
    expect(html).toContain('href="#p-1-1-2-1"');
    expect(html).toContain('<code>ZPT_MM_A</code> <span class="est">4/10</span>');
    expect(html).toContain('최근 3개월 사용 TCode 4/10');
  });
  it('escapes model text', () => {
    const m = JSON.parse(JSON.stringify(MODEL));
    m.rows[0].label = '<img src=x onerror=1>';
    const html = renderProcessHtml(m, { version: '1.0', date: 'd' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('\\u003cimg');
  });
  it('writes page, source and history and bumps the version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mtp-'));
    try {
      const modelPath = join(ROOT, 'tests/fixtures/process/model-mm.json');
      const a = buildProcessDoc({ modelPath, outDir: dir });
      expect(a.version).toBe('1.0');
      expect(existsSync(join(dir, 'MM-process-v1.0-ko.html'))).toBe(true);
      const b = buildProcessDoc({ modelPath, outDir: dir });
      expect(b.version).toBe('1.1');
      expect(buildProcessDoc({ modelPath, outDir: dir, sameVersion: true }).version).toBe('1.1');
      expect(buildProcessDoc({ modelPath, outDir: dir, asVersion: '3.2' }).version).toBe('3.2'); // companion built as its primary's version
      expect(JSON.parse(readFileSync(join(dir, 'MM-process-ko.history.json'), 'utf8')).versions.map((v: any) => v.version)).toEqual(['1.0', '1.1', '3.2']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('marks editable fields and lists for the edit mode', () => {
    const html = renderProcessHtml(MODEL, { version: '1.0', date: 'd' });
    expect(html).toContain('data-p="row:1.1.1.2|task.definition"');
    expect(html).toContain('data-p="row:1.1.1.2|task.rules.0.text"');
    expect(html).toContain('data-list="row:1.1.1.2|task.steps" data-shape="step"');
    expect(html).toContain('data-add="m|glossary"');
    expect(html).toContain('id="editor-labels"');
    expect(html).toContain('id="ed-edit"');
    // the page's own script and the editor parse
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(m[1])).not.toThrow();
  });
  it('imports a page saved from the edit mode, adding only its new revisions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mtp-imp-'));
    try {
      const edited = JSON.parse(JSON.stringify(MODEL));
      edited.rows.find((r: any) => r.code === '1.1.1.2').label = '편집됨';
      const hist = [{ version: '1.0', date: 'd', note: 'n' }, { version: '1.1', date: 'd2', author: 'kim', note: 'edit' }];
      const page = renderProcessHtml(edited, { version: '1.0', date: 'd', history: hist });
      writeFileSync(join(dir, 'p-edited.html'), page);
      writeFileSync(join(dir, 'MM-process-ko.history.json'), JSON.stringify({ versions: [{ version: '1.0', date: 'd', note: 'n' }] }));
      const res = importEditedHtml(join(dir, 'p-edited.html'), join(dir, 'm.json'), join(dir, 'MM-process-ko.history.json'));
      expect(res.added).toEqual(['1.1']);
      expect(JSON.parse(readFileSync(join(dir, 'm.json'), 'utf8')).rows.find((r: any) => r.code === '1.1.1.2').label).toBe('편집됨');
      const h = JSON.parse(readFileSync(join(dir, 'MM-process-ko.history.json'), 'utf8')).versions;
      expect(h.map((v: any) => `${v.version}:${v.source || ''}`)).toEqual(['1.0:', '1.1:edit']);
      // rebuilding the imported version keeps the author and note recorded in the page
      const b = buildProcessDoc({ modelPath: join(dir, 'm.json'), outDir: dir, sameVersion: true });
      expect(b.version).toBe('1.1');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('nextVersion', () => {
    expect(nextVersion({ versions: [{ version: '1.4' }] }, { major: true })).toBe('2.0');
  });
});

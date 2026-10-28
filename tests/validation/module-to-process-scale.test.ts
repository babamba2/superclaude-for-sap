import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { backboneIndex, summarize, buildHierarchy } from '../../scripts/process/merge-placements.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { applyRowPatch } from '../../scripts/process/assemble-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { extractTexts, applyTexts, translationsByText } from '../../scripts/process/companion.mjs';

const ROOT = resolve(__dirname, '../..');
const backbone = (m: string) => JSON.parse(readFileSync(join(ROOT, 'configs', m, 'process-backbone.json'), 'utf8'));

describe('merge-placements', () => {
  const bb = backboneIndex([backbone('SD')], 'en');
  const parts = [
    { part: 1, placements: [
      { entry: 'ZXX_SO1', task: 'SD.3.1.1', kind: 'cbo', owner: 'Sales rep', system: 'sap', variant: 'Export' },
      { entry: 'ZXX_SO2', task: 'SD.3.1.1', kind: 'cbo', owner: 'Sales rep', system: 'sap', ext: 'wms' },
      { entry: 'ZXX_REP', task: 'new:sales-report', kind: 'cbo', owner: 'Sales admin', system: 'sap' }],
      new_tasks: [{ key: 'new:sales-report', parent: 'new3:analysis', label: 'Sales report' }],
      new_l3: [{ key: 'new3:analysis', parent: 'SD.3', label: 'Analysis' }],
      systems: [{ id: 'wms', kind: 'external', label: 'WMS' }], unplaced: [{ entry: 'ZXX_MENU', reason: 'menu' }] },
    { part: 2, placements: [{ entry: 'ZXX_REP2', task: 'new:report', kind: 'cbo', owner: 'Admin', system: 'sap' }],
      new_tasks: [{ key: 'new:report', parent: 'SD.3.1', label: 'Report' }] },
  ];

  it('summarizes keys from all parts, including string ext ids', () => {
    const s = summarize(parts, bb);
    expect(Object.keys(s.newTasks).sort()).toEqual(['new:report', 'new:sales-report']);
    expect(s.owners).toEqual({ 'Sales rep': 2, 'Sales admin': 1, Admin: 1 });
    expect(s.variants).toEqual({ 'SD.3.1.1 | Export': 1 });
    expect(s.backboneL3.length).toBeGreaterThan(5);
  });

  it('builds rows in backbone order with merged keys, variants, ext systems and not_evidenced', () => {
    const C = {
      taskMap: { 'new:report': 'new:sales-report' },
      tasks: { 'new:sales-report': { parent: 'new3:analysis', label: 'Sales report', desc: 'Reports.' } },
      l3: { 'new3:analysis': { parent: 'SD.3', label: 'Analysis' } },
      lanes: [{ id: 'sales', label: 'Sales', estimated: true }, { id: 'admin', label: 'Admin', estimated: true }],
      ownerMap: { 'Sales rep': 'sales', 'Sales admin': 'admin', Admin: 'admin' },
      systems: [{ id: 'sap', kind: 'sap', label: 'SAP' }, { id: 'wms-x', kind: 'external', label: 'WMS' }],
      systemMap: { '1:wms': 'wms-x' },
    };
    const { step4, ext, lost } = buildHierarchy({ parts, bb, C, programOf: { ZXX_SO1: 'ZXXR_SO1' }, stdUsed: new Set(['VA01']) });
    expect(lost).toEqual([]);
    const l4 = step4.rows.filter((r: any) => r.level === 4);
    const so = l4.find((r: any) => r.backbone === 'SD.3.1.1');
    expect(so.tcodes).toEqual(['VA01', 'ZXX_SO1', 'ZXX_SO2']);
    expect(so.objects).toEqual(['ZXXR_SO1']);
    expect(so.owner).toBe('sales');
    expect(so.variants).toEqual([expect.objectContaining({ id: 'a', label: 'Export', tcodes: ['ZXX_SO1'] })]);
    expect(Object.values(ext)).toEqual([expect.objectContaining({ systems: ['wms-x'], entries: ['ZXX_SO2'] })]);
    const rep = l4.find((r: any) => r.label === 'Sales report');
    expect(rep.tcodes).toEqual(['ZXX_REP', 'ZXX_REP2']);
    const repL3 = step4.rows.find((r: any) => r.code === rep.code.split('.').slice(0, 3).join('.'));
    expect(repL3.label).toBe('Analysis');
    // a kept L3 keeps its other backbone L4s as std; an L3 without entries goes to not_evidenced
    expect(l4.some((r: any) => r.kind === 'std' && r.code.startsWith(so.code.split('.').slice(0, 3).join('.')))).toBe(true);
    expect(step4.not_evidenced.some((n: any) => n.backbone === 'SD.1.1')).toBe(true);
    expect(step4.unplaced).toEqual([{ entry: 'ZXX_MENU', reason: 'menu' }]);
    // codes: unique, parent before child
    const codes = step4.rows.map((r: any) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const r of step4.rows) if (r.level > 1) expect(codes.indexOf(r.code.split('.').slice(0, -1).join('.'))).toBeLessThan(codes.indexOf(r.code));
  });

  it('treats a non-SAP placement system as an external link', () => {
    const p = [{ part: 1, placements: [{ entry: 'ZXX_IF', task: 'SD.3.1.1', kind: 'ext', owner: 'x', system: 'edi' }] }];
    const { ext } = buildHierarchy({ parts: p, bb, C: {} });
    expect(Object.values(ext)).toEqual([expect.objectContaining({ systems: ['edi'], entries: ['ZXX_IF'] })]);
  });

  it('drops a variant mapped to an empty label', () => {
    const { step4 } = buildHierarchy({ parts, bb, C: { variantMap: { 'SD.3.1.1 | Export': '' }, tasks: { 'new:sales-report': { parent: 'SD.3.1', label: 'R' }, 'new:report': { parent: 'SD.3.1', label: 'R2' } } } });
    expect(step4.rows.find((r: any) => r.backbone === 'SD.3.1.1').variants).toBeUndefined();
  });
});

describe('assemble-model row_patch', () => {
  it('replaces known fields, merges _add / _remove lists into row and variants, ignores unknown keys', () => {
    const row: any = { code: '1.1.1.1', tcodes: ['A', 'B'], objects: ['PA', 'PB'], variants: [{ id: 'a', tcodes: ['B'], objects: ['PB'] }] };
    const open: string[] = [];
    applyRowPatch(row, { tcodes_remove: ['B'], objects_remove: ['PB'], tcodes_add: ['C'], owner: 'billing', reason: 'x', foo: 1 }, open);
    expect(row.tcodes).toEqual(['A', 'C']);
    expect(row.objects).toEqual(['PA']);
    expect(row.variants[0].tcodes).toEqual([]);
    expect(row.owner).toBe('billing');
    expect(row.foo).toBeUndefined();
    expect(open).toEqual(['row_patch 1.1.1.1: field "foo" ignored']);
    const row2: any = { code: '1.1.1.2', tcodes: ['A', 'B'], variants: [{ id: 'a', label: 'x', tcodes: ['A', 'B'] }] };
    applyRowPatch(row2, { variants: { a: { tcodes_remove: ['B'], label: 'y' }, z: { label: 'q' } }, note: 'n' }, open);
    expect(row2.variants[0]).toEqual({ id: 'a', label: 'y', tcodes: ['A'] });
    expect(open.at(-1)).toBe('row_patch 1.1.1.2: variant "z" not found');
    applyRowPatch(row, { variants: [] });
    expect(row.variants).toBeUndefined();
  });
});

describe('companion text-keyed apply', () => {
  it('keeps translations valid after the model changed and ids shifted', () => {
    const model: any = { lang: 'ko', title: '맵', rows: [{ code: '1', level: 1, label: '영업' }, { code: '1.1', level: 2, label: '청구' }] };
    const before = extractTexts(model);
    const translated = { items: before.items.map((x: any) => ({ i: x.i, text: ({ 맵: 'Map', 영업: 'Sales', 청구: 'Billing' } as any)[x.text] })) };
    model.rows.splice(1, 0, { code: '1.0', level: 2, label: '신규' }); // shifts the id of 청구
    const now = extractTexts(model);
    const byText = translationsByText([{ source: before, translated }]);
    const { model: en, missing } = applyTexts(model, now, { items: [] }, 'en', byText);
    expect(en.rows.find((r: any) => r.code === '1.1').label).toBe('Billing');
    expect(missing).toEqual([now.items.find((x: any) => x.text === '신규').i]);
    // id-only fallback would have put the wrong text on 1.1
    const { model: byId } = applyTexts(model, now, translated, 'en');
    expect(byId.rows.find((r: any) => r.code === '1.1').label).not.toBe('Billing');
  });
});

describe('process backbones', () => {
  for (const m of ['MM', 'SD', 'FI', 'CO']) {
    it(`${m}: unique hierarchical ids, ko/en/ja labels, anchors on every L4`, () => {
      const bb = backboneIndex([backbone(m)], 'en');
      const nodes = Object.values(bb.nodes) as any[];
      expect(nodes.length).toBeGreaterThan(20);
      for (const n of nodes) {
        if (n.parent) expect(n.id.startsWith(`${n.parent}.`)).toBe(true);
        for (const l of ['en', 'ko', 'ja']) expect(n.label?.[l]).toBeTruthy();
        if (n.depth === 4) expect((n.tcodes || []).length + (n.bapis || []).length + (n.tables || []).length).toBeGreaterThan(0);
      }
    });
  }
});

describe('swimlane steps', () => {
  it('enters the first box of the next band vertically and shows where a step runs', async () => {
    // @ts-expect-error — plain .mjs script, no type declarations
    const { drawSwimlane, stepLanes } = await import('../../scripts/process/swimlane.mjs');
    const svg = drawSwimlane({ lanes: [{ id: 'a', label: 'A' }], nodes: [0, 1, 2, 3, 4, 5].map(i => ({ id: `s${i}`, label: 'x', lane: 'a', col: i })), edges: [{ from: 's4', to: 's5' }] });
    const d = (svg.match(/<path d="(M[^"]+)"/g) || []).at(-1)!.replace(/^<path d="|"$/g, '');
    const pts = d.slice(1).split(' L').map(p => p.split(',').map(Number));
    expect(pts.length).toBe(4);
    expect(pts[2][0]).toBe(pts[3][0]); // last segment vertical
    expect(pts[3][1]).toBeGreaterThan(pts[2][1]); // pointing down into the box
    const m = { lanes: [{ id: 'o', label: 'Owner' }], scope: { systems: [] } };
    const lanes = stepLanes(m, { owner: 'o', kind: 'cbo', task: { steps: [{ name: 'Create order', where: 'ZXX_SO01', owner: 'o' }, { name: 'Release', owner: 'o' }] } });
    expect(lanes).toContain('1 · ZXX_SO01');
  });
});

describe("program frames", () => {
  it("frames consecutive steps of one program in the step swimlane", async () => {
    const { stepLanes } = await import("../../scripts/process/swimlane.mjs");
    const m = { lanes: [{ id: "o", label: "Owner" }], scope: { systems: [] } };
    const steps = [{ name: "Check", where: "ZXX_P01", owner: "o" }, { name: "Post", where: "ZXX_P01", owner: "o" }, { name: "Print", where: "ZXX_P02", owner: "o" }];
    const svg = stepLanes(m, { owner: "o", kind: "cbo", task: { steps } });
    expect(svg.match(/stroke-dasharray="5 3"/g)?.length).toBe(1);
    expect(svg).toContain(">ZXX_P01</text>");
  });
  it("frames flow nodes by program, never by the table of an io node", async () => {
    const { flowGroupFrames } = await import("../../scripts/spec/screen-image-renderer.mjs");
    const pos = { a: { x: 100, yTop: 0, w: 120, h: 40 }, b: { x: 100, yTop: 60, w: 120, h: 40 }, c: { x: 100, yTop: 120, w: 120, h: 40 } };
    const L = { width: 300, pos, nodes: [{ id: "a", type: "process", where: "ZXX_P01" }, { id: "b", type: "process", where: "ZXX_P01 · F8" }, { id: "c", type: "io", where: "ZXX_T01" }] };
    const G = flowGroupFrames(L);
    expect(G.tabs).toContain(">ZXX_P01</text>");
    expect(G.svg + G.tabs).not.toContain("ZXX_T01");
    expect(G.svg.match(/rx="8"/g)?.length).toBe(1);
  });
});

describe("flow frames and shared ports", () => {
  it("puts every node in a frame, inheriting the program of the node before", async () => {
    const { flowGroupFrames } = await import("../../scripts/spec/screen-image-renderer.mjs");
    const pos = { s: { x: 100, yTop: 0, w: 120, h: 40 }, d: { x: 100, yTop: 60, w: 120, h: 40 }, e1: { x: 100, yTop: 120, w: 120, h: 40 }, p: { x: 100, yTop: 180, w: 120, h: 40 } };
    const L = { width: 300, pos, nodes: [{ id: "s", type: "start" }, { id: "d", type: "decision" }, { id: "e1", type: "end" }, { id: "p", type: "process", where: "ZXX_P01" }],
      edges: [{ from: "s", to: "d" }, { from: "d", to: "e1" }, { from: "d", to: "p" }] };
    const G = flowGroupFrames(L);
    expect(G.svg.match(/rx="8"/g)?.length).toBe(1);
    expect(G.tabs).toContain(">ZXX_P01</text>");
  });
  it("splits arrows that share a node point onto their own rows with a diagonal stub", async () => {
    const { fanSharedPorts } = await import("../../scripts/spec/screen-image-renderer.mjs");
    const routes = [
      { pts: [{ x: 50, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 100 }, { x: 100, y: 100 }] },
      { pts: [{ x: 100, y: 100 }, { x: 10, y: 100 }, { x: 10, y: 300 }, { x: 60, y: 300 }] },
    ];
    fanSharedPorts(routes);
    const inEnd = routes[0].pts.slice(-2), outStart = routes[1].pts.slice(0, 2);
    expect(inEnd[1]).toEqual({ x: 100, y: 100 });
    expect(outStart[0]).toEqual({ x: 100, y: 100 });
    expect(inEnd[0].y).not.toBe(outStart[1].y);
    expect(inEnd[0].x).not.toBe(100);
  });
});

describe("cross-module touchpoints", () => {
  const model = (rows: any[]) => ({ rows, crossModule: [] });
  it("owns objects by customer prefix and by the module configs", async () => {
    const { ownerOf, moduleCodes, standardOwners } = await import("../../scripts/process/cross-module.mjs");
    const codes = moduleCodes(ROOT), std = standardOwners(ROOT, codes);
    expect(ownerOf("ZSDT00001", codes, std)).toBe("SD");
    expect(ownerOf("ZMM_GET_X", codes, std)).toBe("MM");
    expect(ownerOf("EKKO", codes, std)).toBe("MM");
    expect(ownerOf("ZCMT00001", codes, std)).toBe("");
  });
  it("pairs a writer of one module with the reader of the other and keeps stubs for unmapped modules", async () => {
    const { buildTouchpoints } = await import("../../scripts/process/cross-module.mjs");
    const sd = { module: "SD", state: "", model: model([{ code: "1.1.1.1", level: 4, tcodes: ["ZSDA01"], objects: ["ZSDA01"] }]),
      graph: { nodes: [{ id: "TRAN:ZSDA01", type: "TRAN", name: "ZSDA01", scope: "member" }, { id: "PROG:ZSDA01", type: "PROG", name: "ZSDA01", scope: "member" },
        { id: "TABL:ZMMT00001", type: "TABL", name: "ZMMT00001", scope: "custom" }, { id: "TABL:ZFIT00001", type: "TABL", name: "ZFIT00001", scope: "custom" }],
        edges: [{ from: "TRAN:ZSDA01", to: "PROG:ZSDA01", kind: "starts" }, { from: "PROG:ZSDA01", to: "TABL:ZMMT00001", kind: "writes", evidence: [{ unit: "ZSDA01F01", line: 10 }] },
          { from: "PROG:ZSDA01", to: "TABL:ZFIT00001", kind: "reads" }] } };
    const mm = { module: "MM", state: "", model: model([{ code: "1.2.1.1", level: 4, tcodes: ["ZMMA01"], objects: ["ZMMA01"] }]),
      graph: { nodes: [{ id: "PROG:ZMMA01", type: "PROG", name: "ZMMA01", scope: "member" }, { id: "TABL:ZMMT00001", type: "TABL", name: "ZMMT00001", scope: "custom" }],
        edges: [{ from: "PROG:ZMMA01", to: "TABL:ZMMT00001", kind: "reads" }] } };
    const r = buildTouchpoints([sd, mm], { pluginRoot: ROOT });
    const w = r.touchpoints.find((t: any) => t.object === "ZMMT00001");
    expect(w.from).toEqual({ module: "SD", code: "1.1.1.1" });
    expect(w.to).toEqual([{ module: "MM", code: "1.2.1.1", role: "reads", program: "ZMMA01" }]);
    expect(r.programs["MM|1.2.1.1"].ZMMT00001).toBe("ZMMA01");
    expect(w.evidence.line).toBe(10);
    expect(r.stubs.FI).toBe(1);
  });
  it("shortens step actions in the page language", async () => {
    const { shortAction } = await import("../../scripts/process/swimlane.mjs");
    expect(shortAction("실행(F8)하면 확인 없이 바로 처리")).toBe("실행(F8)");
    expect(shortAction("Run (F8); no confirmation", "en")).toBe("Run (F8)");
    expect(shortAction("'Save' button (SAVE)", "en")).toBe("'Save' button");
  });
});

describe("integration view on a module page", () => {
  it("lists the steps before and after a task and its pair notes", async () => {
    const { taskLinks, stepWhere } = await import("../../scripts/process/integration-view.mjs");
    const m = { module: "SD", rows: [{ code: "1.1.1.1", level: 4, label: "Order", tcodes: ["ZSDA01"], objects: ["ZSDA01"] }] };
    const tp = { modules: ["SD", "MM"], programs: { "SD|1.1.1.1": { ZMMT00001: "ZSDA01" } }, touchpoints: [], stubs: {} };
    const scen = { scenarios: [{ title: "S", steps: [{ module: "MM", code: "1.2.1.1", via: "ZMMT00001" }, { module: "SD", code: "1.1.1.1", via: "VBAK" }, { module: "MM", code: "1.3.1.1" }] }],
      pair_notes: [{ a: { module: "SD", code: "1.1.1.1" }, b: { module: "MM", code: "1.2.1.1" }, desc: "hands over" }] };
    const views = [{ name: "SD-MM", tp, scen, models: { MM: { rows: [{ code: "1.2.1.1", label: "PO" }, { code: "1.3.1.1", label: "GR" }] } }, pages: { MM: "" }, intPage: "", pageDir: "." }];
    const T = { xLinks: "Links", xStepOf: "Scenario {n} · step {k}" };
    const html = taskLinks(views, m, "1.1.1.1", T);
    expect(html).toContain("Scenario 1 · step 2");
    expect(html).toContain("← <span class=\"xmod\">MM</span> <code>1.2.1.1</code> PO");
    expect(html).toContain("hands over");
    const rowOf = (mod: string, code: string) => (mod === "SD" ? m.rows : views[0].models.MM.rows).find((r: any) => r.code === code);
    expect(stepWhere(tp, rowOf, scen.scenarios[0].steps, 1)).toBe("ZSDA01");
  });
});

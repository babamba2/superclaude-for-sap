import { describe, it, expect } from 'vitest';
import {
  renderAlvScreenSVG,
  renderAlvLayoutSVG,
  renderMultipaneAlvSVG,
  multipaneAlvMetrics,
  alvLayoutMetrics,
  buttonSchemaWarnings,
  buildFlowIndex,
  renderFlowchartSVG,
  // @ts-expect-error — plain .mjs script, no type declarations
} from '../../scripts/spec/screen-image-renderer.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { buttonFlowFile } from '../../scripts/spec/render-md-images.mjs';

const GRID = {
  columns: [{ name: 'VBELN', header: 'Order', width: 120, hotspot: true }, { name: 'NETWR', header: 'Value', width: 120, align: 'end' }],
  sampleRows: [{ VBELN: '0001', NETWR: '10.00' }, { VBELN: '0002', NETWR: '20.00' }],
  maxRows: 2,
};

const size = (svg: string) => {
  const m = svg.match(/<svg[^>]*\swidth="(\d+)"[^>]*\sheight="(\d+)"/)!;
  return { width: Number(m[1]), height: Number(m[2]) };
};

describe('ALV screen buttons', () => {
  it('leaves a spec without buttons exactly as the plain grid renders it', () => {
    expect(renderAlvScreenSVG(GRID, { lang: 'en' })).toBe(renderAlvLayoutSVG({ ...GRID, lang: 'en' }));
  });

  it('draws the GUI status title, the PAI bar and the ALV toolbar with flow badges', () => {
    const flowIndex = new Map([['alv:CREATE', 1], ['alv:POST', 2]]);
    const svg: string = renderAlvScreenSVG({
      ...GRID,
      screen: { title: 'Order monitor', status: 'S0100', buttons: [{ code: 'BACK', label: 'Back', icon: 'back', flow: false }] },
      standardToolbar: true,
      toolbar: [{ code: 'CREATE', label: 'Create order', icon: 'create' }, '|', { code: 'POST', icon: 'execute' }],
    }, { lang: 'en', flowIndex });
    for (const text of ['Order monitor', 'S0100', '>PAI<', '>ALV<', 'Back', 'Create order', '▶', 'Numbered buttons have their own process flow']) {
      expect(svg).toContain(text);
    }
    expect(svg).toMatch(/fill="#D9730D"[^>]*\/><text[^>]*>1<\/text>/);
    expect(svg).toMatch(/fill="#D9730D"[^>]*\/><text[^>]*>2<\/text>/);
    // Declared pixel size = viewBox × 1.15, so the rasterizer viewport fits.
    const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
    expect(size(svg)).toEqual({ width: Math.round(Number(vb[1]) * 1.15), height: Math.round(Number(vb[2]) * 1.15) });
  });

  it('keeps multi-pane metrics equal to the rendered size, with and without pane toolbars', () => {
    const plain = { panes: [{ title: 'Header', ...GRID }, { title: 'Items', ...GRID }] };
    const withBars = { panes: [{ title: 'Header', ...GRID, standardToolbar: true, toolbar: [{ code: 'A', label: 'Action A' }] }, { title: 'Items', ...GRID }] };
    for (const spec of [plain, withBars]) {
      expect(size(renderMultipaneAlvSVG(spec))).toEqual(multipaneAlvMetrics(spec));
      const side = { ...spec, layout: 'split-vertical' };
      expect(size(renderMultipaneAlvSVG(side))).toEqual(multipaneAlvMetrics(side));
    }
    // A pane toolbar adds exactly one bar row to the stacked height.
    expect(multipaneAlvMetrics(withBars).height).toBeGreaterThan(multipaneAlvMetrics(plain).height);
    // A pane is laid out in viewBox units, not in already-scaled pixels.
    const one = alvLayoutMetrics(GRID);
    expect(multipaneAlvMetrics({ panes: [{ title: 'Only', ...GRID }] }).height).toBeLessThan(Math.round((one.height + 60) * 1.15));
  });

  it('warns when a business button has no flow, and not for flow:false', () => {
    const warns: string[] = buttonSchemaWarnings({
      alv: {
        screen: { buttons: [{ code: 'EXIT', label: 'Exit', flow: false }, { code: 'SAVE', label: 'Save' }] },
        toolbar: [{ code: 'CREATE', label: 'Create' }],
      },
      buttonFlows: [{ code: 'CREATE', flow: { nodes: [{ id: 'S', type: 'start', label: 'x' }], edges: [] } }, { code: 'GHOST', flow: { nodes: [] } }],
    });
    expect(warns.some((w) => w.includes('"SAVE" has no usable buttonFlows entry'))).toBe(true);
    expect(warns.some((w) => w.includes('"GHOST" (source "alv") has no matching button'))).toBe(true);
    expect(warns.some((w) => w.includes('"EXIT"'))).toBe(false);
    expect(warns.some((w) => w.includes('"CREATE" has no'))).toBe(false);
  });

  describe('review regressions', () => {
    const FLOW = { nodes: [{ id: 'S', type: 'start', label: 'x' }], edges: [] };

    it('numbers flows by array position and keys them by source, so badges match files', () => {
      const index = buildFlowIndex([
        { code: 'SAVE', source: 'pai', flow: FLOW },
        { code: 'DEL', flow: { nodes: [] } },
        { code: 'NOFLOW' },
        { code: 'SAVE', source: 'alv', flow: FLOW },
      ]);
      expect([...index]).toEqual([['pai:SAVE', 1], ['alv:SAVE', 4]]);
      const svg: string = renderAlvScreenSVG({
        ...GRID,
        screen: { buttons: [{ code: 'SAVE', label: 'Save' }] },
        toolbar: [{ code: 'SAVE', label: 'Save row' }],
      }, { lang: 'en', flowIndex: index });
      expect(svg).toMatch(/fill="#D9730D"[^>]*\/><text[^>]*>1<\/text>/);
      expect(svg).toMatch(/fill="#D9730D"[^>]*\/><text[^>]*>4<\/text>/);
    });

    it('warns on empty, missing and duplicate flows but not on the string shorthand', () => {
      const warns: string[] = buttonSchemaWarnings({
        alv: { screen: { buttons: ['BACK', { code: 'SAVE', label: 'Save' }] }, toolbar: [{ code: 'DEL', label: 'Del' }, { code: 'DEL', label: 'Del again' }] },
        buttonFlows: [{ code: 'DEL', flow: { nodes: [] } }, { code: 'SAVE', source: 'pai' }, { code: 'SAVE', source: 'pai', flow: FLOW }],
      });
      const has = (s: string) => warns.some((w) => w.includes(s));
      expect(has('#1 "DEL" has no drawable flow')).toBe(true);
      expect(has('#2 "SAVE" has no drawable flow')).toBe(true);
      expect(has('#3 "SAVE" repeats an earlier PAI flow')).toBe(true);
      expect(has('ALV button "DEL" appears twice in the same toolbar')).toBe(true);
      // The same code on two grids is normal.
      const panes: string[] = buttonSchemaWarnings({
        alv: { panes: [{ toolbar: [{ code: 'REFRESH', label: 'R', flow: false }] }, { toolbar: [{ code: 'REFRESH', label: 'R', flow: false }] }] },
      });
      expect(panes).toEqual([]);
      expect(has('ALV button "DEL" has no usable buttonFlows entry')).toBe(true);
      expect(has('"BACK"')).toBe(false);
    });

    it('lets one stage flow badge its batch and cancel buttons through codes[]', () => {
      const flows = [
        { code: 'ZPOB', source: 'pai', codes: ['ZPOB_BA', 'ZPOB_BA_C'], flow: FLOW },
        { code: 'ZPORT_BA', source: 'pai', codes: [{ code: 'ZUPPO', source: 'alv' }], flow: FLOW },
      ];
      expect([...buildFlowIndex(flows)]).toEqual([
        ['pai:ZPOB', 1], ['pai:ZPOB_BA', 1], ['pai:ZPOB_BA_C', 1], ['pai:ZPORT_BA', 2], ['alv:ZUPPO', 2],
      ]);
      const alv = {
        ...GRID,
        screen: { buttons: [{ code: 'ZPOB', label: 'I/R' }, { code: 'ZPOB_BA', label: 'I/R' }, { code: 'ZPOB_BA_C', label: 'Cancel' }, { code: 'ZPORT_BA', label: 'Port' }] },
        toolbar: [{ code: 'ZUPPO', label: 'Port update' }],
      };
      expect(buttonSchemaWarnings({ alv, buttonFlows: flows })).toEqual([]);
      const svg: string = renderAlvScreenSVG(alv, { lang: 'en', flowIndex: buildFlowIndex(flows) });
      expect([...svg.matchAll(/fill="#D9730D"[^>]*\/><text[^>]*>1<\/text>/g)].length).toBe(3);
      expect([...svg.matchAll(/fill="#D9730D"[^>]*\/><text[^>]*>2<\/text>/g)].length).toBe(2);
    });

    it('warns when a linked code has no button, is claimed twice, or is malformed', () => {
      const warns: string[] = buttonSchemaWarnings({
        alv: { screen: { buttons: [{ code: 'A', label: 'A' }, { code: 'B', label: 'B' }] } },
        buttonFlows: [
          { code: 'A', source: 'pai', codes: ['B', 'GHOST', { label: 'no code' }], flow: FLOW },
          { code: 'B', source: 'pai', flow: FLOW },
          { code: 'X', source: 'pai', codes: 'B', flow: FLOW },
        ],
      });
      const has = (s: string) => warns.some((w) => w.includes(s));
      expect(has('#1 links "GHOST", which (source "pai") has no matching button')).toBe(true);
      expect(has('#1 "A" has a "codes" entry without a code')).toBe(true);
      expect(has('#2 "B" repeats an earlier PAI flow')).toBe(true);
      expect(has('#3 "X" has a "codes" that is not an array')).toBe(true);
    });

    it('keeps a long label inside a narrow side-by-side pane', () => {
      const spec = {
        layout: 'split-vertical', splitRatio: [20, 80],
        panes: [
          { title: 'L', ...GRID, toolbar: [{ code: 'X', label: 'A very long button label that cannot fit in a narrow pane' }] },
          { title: 'R', ...GRID, toolbar: [{ code: 'Y', label: 'Right' }] },
        ],
      };
      const svg: string = renderMultipaneAlvSVG(spec);
      const leftW = Math.round(1400 * 0.2);
      // Buttons that start in the left pane must also end inside it.
      const leftButtons = [...svg.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="22" rx="4"/g)]
        .map((m) => ({ x: Number(m[1]), right: Number(m[1]) + Number(m[2]) }))
        .filter((b) => b.x < leftW);
      expect(leftButtons.length).toBe(1);
      expect(leftButtons[0].right).toBeLessThanOrEqual(leftW);
      expect(svg).toContain('…</text>');
    });

    it('draws tree panes in stacked and right-hand side-by-side layouts', () => {
      const tree = { title: 'Tree', treeRows: [{ level: 0, label: 'Root node' }, { level: 1, label: 'Child node' }] };
      expect(renderMultipaneAlvSVG({ panes: [tree, { title: 'G', ...GRID }] })).toContain('Child node');
      expect(renderMultipaneAlvSVG({ layout: 'split-vertical', panes: [{ title: 'G', ...GRID }, tree] })).toContain('Child node');
    });
  });

  describe('flowchart routing (ZSDM21500 run)', () => {
    // The shape the analyst returned: "no selection → end" skips every node.
    const graph = {
      nodes: [
        { id: 'S', type: 'start', label: 'Click' },
        { id: 'D1', type: 'decision', label: 'Rows selected?' },
        { id: 'D2', type: 'decision', label: 'Checks pass?' },
        { id: 'M1', type: 'io', label: 'E04', lane: 'right' },
        { id: 'D3', type: 'decision', label: 'Document created?' },
        { id: 'M2', type: 'io', label: 'ROLLBACK', lane: 'right' },
        { id: 'E', type: 'end', label: 'Refresh' },
      ],
      edges: [
        { from: 'S', to: 'D1' }, { from: 'D1', to: 'D2', label: 'Yes' }, { from: 'D1', to: 'E', label: 'No' },
        { from: 'D2', to: 'D3', label: 'Yes' }, { from: 'D2', to: 'M1', label: 'No' }, { from: 'M1', to: 'E' },
        { from: 'D3', to: 'E', label: 'Yes' }, { from: 'D3', to: 'M2', label: 'No' }, { from: 'M2', to: 'E' },
      ],
    };
    const svg: string = renderFlowchartSVG(graph, { lang: 'en' });
    const lines = [...svg.matchAll(/<polyline points="([^"]+)"/g)].map((m) => m[1].split(' ').map((p) => p.split(',').map(Number)));

    it('sends a shortcut edge down a left lane instead of through the nodes it skips', () => {
      const leftLane = lines.filter((pts) => pts.some(([x]) => x < 100));
      expect(leftLane.length).toBe(1); // D1 → E only; D3 → E is adjacent
      expect(new Set(leftLane[0].slice(1, 3).map(([x]) => x)).size).toBe(1);
    });

    it('keeps the Yes and No chips of one decision apart', () => {
      const chips = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="[\d.]+" height="16" rx="3"[^>]*\/><text[^>]*>(Yes|No)</g)]
        .map((m) => `${Math.round(Number(m[1]))},${Math.round(Number(m[2]))}`);
      expect(new Set(chips).size).toBe(chips.length);
    });

    it('routes a side exit around the side node below it', () => {
      const outer = lines.filter((pts) => pts.some(([x]) => x > 780));
      expect(outer.length).toBe(1); // M1 → E passes M2's column; M2 → E does not
    });
  });

  describe('three-way decision (ZSDM00181 flow ①)', () => {
    // "Which button?" → online (adjacent) + batch + cancel (both skip nodes).
    const graph = {
      nodes: [
        { id: 'S', type: 'start', label: 'Click' },
        { id: 'D0', type: 'decision', label: 'Which button?' },
        { id: 'P1', type: 'process', label: 'Online' },
        { id: 'P2', type: 'process', label: 'Batch' },
        { id: 'P3', type: 'process', label: 'Cancel' },
        { id: 'E', type: 'end', label: 'Done' },
      ],
      edges: [
        { from: 'S', to: 'D0' }, { from: 'D0', to: 'P1', label: 'ONLINE' },
        { from: 'D0', to: 'P2', label: 'BATCH' }, { from: 'D0', to: 'P3', label: 'CANCEL' },
        { from: 'P1', to: 'E' }, { from: 'P2', to: 'E' }, { from: 'P3', to: 'E' },
      ],
    };
    const svg: string = renderFlowchartSVG(graph, { lang: 'en' });
    const chip = (t: string) => {
      const m = svg.match(new RegExp(`<rect x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="16" rx="3"[^>]*/><text[^>]*>${t}<`))!;
      return { x: Number(m[1]), y: Number(m[2]), right: Number(m[1]) + Number(m[3]) };
    };

    it('draws every branch label, each on its own row', () => {
      const batch = chip('BATCH'), cancel = chip('CANCEL');
      // Chips 16 px high must not overlap.
      expect(Math.abs(batch.y - cancel.y)).toBeGreaterThanOrEqual(16);
      expect(chip('ONLINE')).toBeTruthy();
    });

    it('gives the second left-lane edge its own horizontal row', () => {
      const rows = [...svg.matchAll(/<polyline points="([^"]+)"/g)]
        .map((m) => m[1].split(' ').map((p) => p.split(',').map(Number)))
        .filter((pts) => pts.length === 6);
      expect(rows.length).toBe(1);
      const [w0, jog, down] = rows[0];
      expect(jog[1]).toBe(w0[1]);
      expect(down[1] - w0[1]).toBe(20);
    });
  });

  it('names button flow files by number and a file-safe code', () => {
    expect(buttonFlowFile(3, 'PCREATE')).toBe('flow-3-PCREATE.png');
    expect(buttonFlowFile(1, '/NS/ACT ONE')).toBe('flow-1-_NS_ACT_ONE.png');
  });
});

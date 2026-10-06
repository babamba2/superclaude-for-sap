import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Script } from 'vm';
// @ts-expect-error — plain .mjs script, no type declarations
import { drawFreeFlow, isFreeGraph, flowKit } from '../../scripts/spec/flow-draw.mjs';
import {
  renderFlowchartSVG,
  flowchartMetrics,
  toFreeFlow,
  freeFlowOptions,
  // @ts-expect-error — plain .mjs script, no type declarations
} from '../../scripts/spec/screen-image-renderer.mjs';
import {
  FLOW_EDITOR_SCRIPT,
  FLOW_PAGE_SCRIPT,
  editedFlows,
  importEditedFlows,
  // @ts-expect-error — plain .mjs script, no type declarations
} from '../../scripts/spec/flow-editor.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { mdToHtml } from '../../scripts/spec/md-to-html.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderManualHtml } from '../../scripts/manual/build-manual.mjs';

const AUTO = {
  nodes: [
    { id: 'S', type: 'start', label: 'Start' },
    { id: 'D', type: 'decision', label: 'Valid?' },
    { id: 'M', type: 'io', label: 'E01 (Invalid)', lane: 'right' },
    { id: 'P', type: 'process', label: 'Post document' },
    { id: 'E', type: 'end', label: 'End' },
  ],
  edges: [
    { from: 'S', to: 'D' }, { from: 'D', to: 'P', label: 'Yes' }, { from: 'D', to: 'M', label: 'No' },
    { from: 'M', to: 'E' }, { from: 'P', to: 'E' },
  ],
};

describe('free-layout flowchart', () => {
  it('converts a linear flow and an auto-laid-out graph to positioned nodes', () => {
    const lin = toFreeFlow(['Upload', '?Errors', '!Done']);
    expect(isFreeGraph(lin)).toBe(true);
    expect(lin.nodes.map((n: { type: string }) => n.type)).toEqual(['process', 'decision', 'end']);
    expect(lin.nodes[1].x).toBeGreaterThan(lin.nodes[0].x);
    expect(lin.edges).toHaveLength(2);

    const free = toFreeFlow(AUTO);
    expect(free.nodes).toHaveLength(5);
    expect(free.nodes.every((n: { x: number; y: number }) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    // the side node sits right of the spine; its exit keeps the layout's routing
    const m = free.nodes.find((n: { id: string }) => n.id === 'M');
    expect(m.x).toBeGreaterThan(free.nodes[0].x);
    expect(free.edges.find((e: { from: string }) => e.from === 'M')).toMatchObject({ fromSide: 'S', toSide: 'E' });
    expect(toFreeFlow(free)).toBe(free);
    expect(toFreeFlow([])).toBeNull();
  });

  it('renderFlowchartSVG draws a free graph from its positions', () => {
    const free = toFreeFlow(AUTO);
    const svg: string = renderFlowchartSVG(free, { lang: 'en', heading: 'My flow' });
    expect(svg).toContain('My flow');
    expect(svg).toContain('Post document');
    expect((svg.match(/class="fn"/g) || []).length).toBe(5);
    expect(svg).not.toContain('class="fp"'); // no edit handles in a static picture
    const moved = { ...free, nodes: free.nodes.map((n: { id: string; x: number }) => (n.id === 'M' ? { ...n, x: n.x + 400 } : n)) };
    expect(flowchartMetrics(moved).width).toBeGreaterThan(flowchartMetrics(free).width);
  });

  it('routes right-angle arrows and keeps them apart from close boxes', () => {
    const g = { layout: 'free', nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }, { id: 'b', label: 'B', x: 0, y: 70 }], edges: [{ from: 'a', to: 'b' }] };
    const svg: string = drawFreeFlow(g, {}).svg;
    const pts = /<polyline points="([^"]+)"[^>]*marker-end/.exec(svg)![1].split(' ');
    expect(pts).toHaveLength(2); // straight down, no detour
    const edit: string = drawFreeFlow(g, { edit: { sel: { kind: 'node', id: 'a' } } }).svg;
    expect((edit.match(/class="fp"/g) || []).length).toBe(8);
    expect(edit).toContain('stroke-dasharray="5 3"');
  });

  it('the page scripts parse and inline the same drawing kit', () => {
    expect(() => new Script(FLOW_EDITOR_SCRIPT)).not.toThrow();
    expect(() => new Script(FLOW_PAGE_SCRIPT)).not.toThrow();
    expect(FLOW_EDITOR_SCRIPT).toContain(flowKit.toString());
  });
});

describe('manual flow editing', () => {
  it('the manual page carries an editable flow figure and its starting graph', () => {
    const manual = JSON.parse(readFileSync(join(__dirname, '..', '..', 'skills', 'program-to-manual', 'example-manual.json'), 'utf-8'));
    const html: string = renderManualHtml(manual, { version: '1.0', date: '2026-10-06' });
    expect(html).toContain('<figure class="screen flow-fig" data-flow="processFlow">');
    const seed = JSON.parse(/id="flow-seed">([\s\S]*?)<\/script>/.exec(html)![1]);
    expect(isFreeGraph(seed.graph)).toBe(true);
    expect(seed.graph.nodes).toHaveLength(manual.processFlow.length);
    expect(html).toContain('window.sc4sapFlowKit=');
    // an edited (free) processFlow is drawn from its positions and is its own seed
    const edited = { ...manual, processFlow: seed.graph };
    const again: string = renderManualHtml(edited, { version: '1.1', date: '2026-10-06' });
    expect(JSON.parse(/id="flow-seed">([\s\S]*?)<\/script>/.exec(again)![1]).graph).toEqual(seed.graph);
  });
});

describe('spec page flow editing', () => {
  it('md-to-html turns a flow PNG with a graph.json into an editable figure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc4sap-flow-'));
    try {
      writeFileSync(join(dir, 'flow.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
      writeFileSync(join(dir, 'flow.graph.json'), JSON.stringify({ key: 'processFlow', graph: toFreeFlow(AUTO), opts: freeFlowOptions('en') }));
      writeFileSync(join(dir, 'alv.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
      const html: string = mdToHtml('# Spec\n\n![Flow](flow.png)\n\n![ALV](alv.png)\n', { baseDir: dir, lang: 'en' });
      expect((html.match(/<figure class="flow-fig">/g) || []).length).toBe(1);
      expect(html).toContain('class="flow-graph"');
      expect(html).toContain('id="flow-editor-labels"');
      const plain: string = mdToHtml('# Spec\n\n![ALV](alv.png)\n', { baseDir: dir, lang: 'en' });
      expect(plain).not.toContain('flow-editor-labels');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--import writes only the flows the user changed into image-spec.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc4sap-flow-'));
    try {
      const graph = toFreeFlow(AUTO);
      const block = (d: object) => `<script type="application/json" class="flow-graph">${JSON.stringify(d)}</script>`;
      const html = block({ key: 'processFlow', graph, edited: true })
        + block({ key: 'buttonFlow:SEND', graph, edited: true })
        + block({ key: 'buttonFlow:BACK', graph })
        + block({ key: 'buttonFlow:NOPE', graph, edited: true });
      expect(editedFlows(html).map((f: { key: string }) => f.key)).toEqual(['processFlow', 'buttonFlow:SEND', 'buttonFlow:NOPE']);
      const htmlPath = join(dir, 'spec-edited.html'), specPath = join(dir, 'image-spec.json');
      writeFileSync(htmlPath, html);
      writeFileSync(specPath, JSON.stringify({ processFlow: ['a', 'b'], buttonFlows: [{ code: 'SEND', flow: AUTO }, { code: 'BACK', flow: AUTO }] }));
      const res = importEditedFlows(htmlPath, specPath);
      expect(res.written).toEqual(['processFlow', 'buttonFlow:SEND']);
      expect(res.missing).toEqual(['buttonFlow:NOPE']);
      const spec = JSON.parse(readFileSync(specPath, 'utf-8'));
      expect(spec.processFlow.layout).toBe('free');
      expect(spec.buttonFlows[0].flow.layout).toBe('free');
      expect(spec.buttonFlows[1].flow).toEqual(AUTO);
      expect(readFileSync(`${specPath}.bak`, 'utf-8')).toContain('"a"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

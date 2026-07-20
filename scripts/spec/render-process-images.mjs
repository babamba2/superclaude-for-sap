// sc4sap:package-to-process — Process-diagram image renderer.
//
// package-to-process used to embed Mermaid (`flowchart LR` macro + per-process
// `sequenceDiagram`) text blocks whose quality depends entirely on the viewer.
// This helper renders the SAME diagrams as high-quality PNGs (v13 renderers)
// to a per-package asset folder so the .md embeds Excel-grade imagery instead.
//
// Input spec JSON:
//   {
//     "lang": "ko",
//     "macro":      { "nodes":[{id,num,label}], "edges":[{from,to}] },
//     "macroTitle": "…",
//     "processes": [
//       { "slug":"1-pr-approval", "title":"…",
//         "seq": { "actors":[{id,label,kind}], "items":[…] } }
//     ]
//   }
//
// CLI:  node render-process-images.mjs <spec.json> <out-dir>
//   Writes macro.png + seq-<slug>.png for each process. Prints a JSON manifest.
//   Graceful degrade: a null PNG (no headless browser) is reported as null so
//   the writer keeps the Mermaid fallback for that diagram.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderProcessMapSVG, processMapMetrics,
  renderSequenceDiagramSVG, sequenceDiagramMetrics,
  rasterizeSvgToPng,
} from './screen-image-renderer.mjs';

export async function renderProcessImages({ specPath, outDir, verbose = true }) {
  if (!specPath || !existsSync(specPath)) throw new Error(`render-process-images: spec not found at ${specPath}`);
  if (!outDir) throw new Error('render-process-images: outDir is required');
  mkdirSync(outDir, { recursive: true });
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const lang = spec.lang || 'ko';
  const manifest = { macro: null, processes: {} };

  const write = async (svg, metrics, fname) => {
    const png = await rasterizeSvgToPng(svg, metrics);
    if (!png) return null;
    writeFileSync(join(outDir, fname), png);
    if (verbose) console.log(`render-process-images: ${fname} ${metrics.width}x${metrics.height} (${png.length} B)`);
    return { file: fname, width: metrics.width, height: metrics.height, bytes: png.length };
  };

  if (spec.macro && Array.isArray(spec.macro.nodes) && spec.macro.nodes.length) {
    const svg = renderProcessMapSVG(spec.macro, { lang, title: spec.macroTitle });
    manifest.macro = await write(svg, processMapMetrics(spec.macro), 'macro.png');
  }
  for (const pr of (spec.processes || [])) {
    if (!pr?.seq?.actors?.length) { manifest.processes[pr?.slug] = null; continue; }
    const svg = renderSequenceDiagramSVG(pr.seq, { lang, title: pr.title });
    manifest.processes[pr.slug] = await write(svg, sequenceDiagramMetrics(pr.seq), `seq-${pr.slug}.png`);
  }
  return manifest;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [specPath, outDir] = process.argv.slice(2);
  if (!specPath || !outDir) {
    console.error('Usage: node render-process-images.mjs <spec.json> <out-dir>');
    process.exit(2);
  }
  try {
    const manifest = await renderProcessImages({ specPath: resolve(specPath), outDir: resolve(outDir) });
    console.log(JSON.stringify(manifest, null, 2));
  } catch (e) {
    console.error(`render-process-images: ${e.message}`);
    process.exit(1);
  }
}

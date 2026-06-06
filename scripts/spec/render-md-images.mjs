// sc4sap:program-to-spec — Markdown image renderer.
//
// The xlsx path (build-spec.mjs) clones a template and SWAPS PNGs into it.
// Markdown has no template — it references images by relative path. This
// helper renders the SAME program-specific PNGs (Selection / ALV / Process
// Flow) that the xlsx embeds, but writes them to a per-spec asset folder so
// the .md can embed them with `![](…)`. Result: MD specs get the identical
// high-quality v12 imagery (branching flowchart, etc.) the xlsx ships with —
// no more ASCII-wireframe / Mermaid-text quality gap.
//
// CLI
//   node render-md-images.mjs <image-spec.json> <out-dir>
//     Writes selection.png / alv.png / flow.png for whichever slots the
//     image-spec populates. Prints a JSON manifest { slot: relPath|null }.
//
// Graceful degrade: if no headless browser is on PATH, renderScreenImages
// returns null per slot → that PNG is skipped and the manifest marks it null
// (the MD writer then keeps the ASCII wireframe / Mermaid fallback for it).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderScreenImages } from './screen-image-renderer.mjs';

export async function renderMdImages({ imageSpecPath, outDir, verbose = true }) {
  if (!imageSpecPath || !existsSync(imageSpecPath)) {
    throw new Error(`render-md-images: image-spec.json not found at ${imageSpecPath}`);
  }
  if (!outDir) throw new Error('render-md-images: outDir is required');
  mkdirSync(outDir, { recursive: true });

  const spec = JSON.parse(readFileSync(imageSpecPath, 'utf8'));
  const rendered = await renderScreenImages(spec);

  const manifest = { selection: null, alv: null, flow: null };
  const slots = [
    ['selection', rendered.selection, 'selection.png'],
    ['alv',       rendered.alv,       'alv.png'],
    ['flow',      rendered.processFlow, 'flow.png'],
  ];
  for (const [key, res, fname] of slots) {
    if (res?.pngBuffer) {
      const fp = join(outDir, fname);
      writeFileSync(fp, res.pngBuffer);
      manifest[key] = { file: fname, width: res.width, height: res.height, bytes: res.pngBuffer.length };
      if (verbose) console.log(`render-md-images: ${fname} ${res.width}x${res.height} (${res.pngBuffer.length} B)`);
    } else if (verbose) {
      console.log(`render-md-images: ${key} → null (no PNG; MD keeps text fallback)`);
    }
  }
  return manifest;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [imageSpecPath, outDir] = process.argv.slice(2);
  if (!imageSpecPath || !outDir) {
    console.error('Usage: node render-md-images.mjs <image-spec.json> <out-dir>');
    process.exit(2);
  }
  try {
    const manifest = await renderMdImages({ imageSpecPath: resolve(imageSpecPath), outDir: resolve(outDir) });
    console.log(JSON.stringify(manifest, null, 2));
  } catch (e) {
    console.error(`render-md-images: ${e.message}`);
    process.exit(1);
  }
}

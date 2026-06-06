// sc4sap:program-to-spec — Single entry point that builds a complete spec xlsx.
//
// PIPELINE (always-on — no trigger keywords required)
//   1. cloneTemplate(tr) → out.xlsx with sharedStrings translated
//   2. renderScreenImages(imageSpec) → {selection,alv,processFlow} PNG buffers
//   3. swapImages(out.xlsx, ...png buffers) → final xlsx with program-specific
//      Selection + ALV mockups (Sheet 3) and horizontal Process Flow (Sheet 4)
//
// WHY ALWAYS-ON
//   The previous opt-in design was based on a misread of the drift problem.
//   Drift = template_base.xlsx geometry regressing (the old throwaway-driver
//   issue). Image swap only updates xl/drawings/drawingN.xml `<xdr:ext>`
//   values and PNG bytes — geometry, styles, column widths, fonts all stay
//   bound to template_base. So running image swap on every spec is safe and
//   produces a more accurate document. Each program needs its own selection
//   screen / ALV layout / flow chart anyway.
//
//   Graceful degrade: if no headless browser is on PATH, renderScreenImages
//   returns nulls per slot and swapImages skips them — the xlsx ends with
//   the template's generic mockups (Sheet 3) and a blank Sheet 4 drawing.
//
// SAP-WRITER OUTPUT CONTRACT
//   The agent produces TWO JSON files alongside the xlsx target:
//     · {OBJECT}-{YYYYMMDD}.tr.json          translation map (English → KO)
//     · {OBJECT}-{YYYYMMDD}.image-spec.json  renderScreenImages() argument
//   Persist them under .sc4sap/specs/_tr/ and _img/ for traceability.
//
// CLI
//   node build-spec.mjs <tr.json> <image-spec.json|-> <out.xlsx>
//     Pass "-" for image-spec.json to skip image rendering entirely
//     (text-only spec with template's generic mockups).

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloneTemplate } from './template-clone.mjs';
import { swapImages } from './image-swap.mjs';
import { renderScreenImages } from './screen-image-renderer.mjs';

// ──────────────────────────────────────────────────────────────
// Language-mixing guard
//
// The xlsx spec is assembled from an ENGLISH template (translated via the TR
// map) plus writer-supplied PNG content (selection / ALV / process-flow). When
// the target lang is ko/ja, any English prose that slipped through — either an
// untranslated TR string or an English label/step in the image-spec — produces
// the "한국어 영어 혼용" the user reported. This guard surfaces every such leak
// in one report so it gets fixed before the spec ships. It is a WARNING gate
// (non-fatal) so a graceful-degrade build still completes.
// ──────────────────────────────────────────────────────────────
function hasHangulOrKana(s) { return /[가-힯぀-ヿ]/.test(String(s)); }

// Prose = human-readable phrase that MUST be translated. Excludes bare SAP
// identifiers (VBAK, S_VKORG, ZMMR00140) which legitimately stay as-is.
function looksLikeEnglishProse(s) {
  const v = String(s);
  if (hasHangulOrKana(v)) return false;            // already localized
  if (!/[A-Za-z]/.test(v)) return false;            // pure symbols/numbers
  if (/\s/.test(v) && /[a-z]{2,}/.test(v)) return true;  // multi-word phrase
  // single-token but clearly a word, not an identifier (no _ / digit / dot / slash)
  if (/^[A-Za-z]{4,}$/.test(v) && !/^[A-Z]+$/.test(v)) return true;
  return false;
}

// Walk image-spec prose-bearing fields (skip identifier `name` keys + data rows).
function scanImageSpecLang(spec, lang) {
  if (!spec || (lang !== 'ko' && lang !== 'ja')) return [];
  const hits = [];
  const flag = (path, val) => { if (val != null && val !== '' && looksLikeEnglishProse(val)) hits.push({ path, value: String(val).slice(0, 80) }); };
  const sel = spec.selection || {};
  flag('selection.blockLabel', sel.blockLabel);
  flag('selection.optionBlockLabel', sel.optionBlockLabel);
  for (const f of [...(sel.fields || []), ...(sel.optionFields || [])]) {
    flag('selection.field.label', f?.label); flag('selection.field.note', f?.note);
  }
  const cols = (alv) => (alv?.columns || []).forEach(c => flag('alv.column.header', c?.header));
  cols(spec.alv);
  for (const p of (spec.alv?.panes || [])) { flag('alv.pane.title', p?.title); flag('alv.pane.interaction', p?.interaction); cols(p); }
  flag('alv.interaction', spec.alv?.interaction);
  // processFlow: string[] (linear) OR { nodes, edges } (branching flowchart v12)
  const pf = spec.processFlow;
  if (Array.isArray(pf)) {
    for (const step of pf) flag('processFlow', String(step).replace(/^[?!]\s*/, ''));
  } else if (pf && Array.isArray(pf.nodes)) {
    for (const n of pf.nodes) flag('processFlow.node.label', String(n?.label ?? '').replace(/\n/g, ' '));
    for (const e of (pf.edges || [])) flag('processFlow.edge.label', e?.label);
  }
  return hits;
}

function reportLanguageMix({ missing, imageSpec, lang, verbose }) {
  if (!verbose) return;
  const trProse = (lang === 'ko' || lang === 'ja') ? (missing || []).filter(looksLikeEnglishProse) : [];
  const imgHits = scanImageSpecLang(imageSpec, lang);
  if (!trProse.length && !imgHits.length) {
    if (lang === 'ko' || lang === 'ja') console.log(`build-spec: language check OK — no English prose leaked into the ${lang} spec.`);
    return;
  }
  console.log(`\n⚠ build-spec: LANGUAGE MIX detected (target lang=${lang}). Translate these and re-run:`);
  if (trProse.length) {
    console.log(`  TR map — ${trProse.length} untranslated English string(s) (still English in the xlsx cells):`);
    for (const s of trProse.slice(0, 25)) console.log(`    · ${JSON.stringify(s)}`);
    if (trProse.length > 25) console.log(`    · … (${trProse.length - 25} more)`);
  }
  if (imgHits.length) {
    console.log(`  image-spec — ${imgHits.length} English label(s) baked into the mockup PNGs:`);
    for (const h of imgHits.slice(0, 25)) console.log(`    · ${h.path}: ${JSON.stringify(h.value)}`);
    if (imgHits.length > 25) console.log(`    · … (${imgHits.length - 25} more)`);
  }
  console.log('');
}

export async function buildSpec({ trPath, imageSpecPath = null, outPath, verbose = true }) {
  if (!trPath || !existsSync(trPath)) throw new Error(`build-spec: tr.json not found at ${trPath}`);
  if (!outPath) throw new Error('build-spec: outPath is required');

  const tr = JSON.parse(readFileSync(trPath, 'utf8'));
  const cloneResult = cloneTemplate({ outPath, tr, verbose });

  if (!imageSpecPath || imageSpecPath === '-') {
    if (verbose) console.log('build-spec: no image-spec provided → text-only xlsx (template mockups intact)');
    reportLanguageMix({ missing: cloneResult.missing, imageSpec: null, lang: tr.__lang || 'en', verbose });
    return { outPath, bytes: cloneResult.bytes, imageSwapped: { selection: false, alv: false, processFlow: false } };
  }
  if (!existsSync(imageSpecPath)) throw new Error(`build-spec: image-spec.json not found at ${imageSpecPath}`);

  const imageSpec = JSON.parse(readFileSync(imageSpecPath, 'utf8'));
  reportLanguageMix({ missing: cloneResult.missing, imageSpec, lang: imageSpec.lang || tr.__lang || 'en', verbose });
  const rendered = await renderScreenImages(imageSpec);
  if (verbose) {
    const ok = (s) => s ? `OK ${s.width}x${s.height}` : 'NULL';
    console.log(`build-spec: rendered selection=${ok(rendered.selection)} alv=${ok(rendered.alv)} processFlow=${ok(rendered.processFlow)}`);
  }
  const anyRendered = rendered.selection || rendered.alv || rendered.processFlow;
  if (!anyRendered) {
    if (verbose) console.log('build-spec: no PNGs rendered (likely missing headless browser) → keeping template mockups');
    return { outPath, bytes: cloneResult.bytes, imageSwapped: { selection: false, alv: false, processFlow: false } };
  }

  const swapResult = swapImages({
    xlsxPath: outPath,
    selectionPng:   rendered.selection?.pngBuffer,
    alvPng:         rendered.alv?.pngBuffer,
    processFlowPng: rendered.processFlow?.pngBuffer,
    verbose,
  });
  return { outPath, bytes: swapResult.bytes, imageSwapped: swapResult.swapped };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [trPath, imageSpecPath, outPath] = process.argv.slice(2);
  if (!trPath || !outPath) {
    console.error('Usage: node build-spec.mjs <tr.json> <image-spec.json|-> <out.xlsx>');
    process.exit(2);
  }
  try {
    await buildSpec({
      trPath: resolve(trPath),
      imageSpecPath: (imageSpecPath && imageSpecPath !== '-') ? resolve(imageSpecPath) : null,
      outPath: resolve(outPath),
    });
  } catch (e) {
    console.error(`build-spec: ${e.message}`);
    process.exit(1);
  }
}

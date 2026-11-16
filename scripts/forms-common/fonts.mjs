// Shared by the form renderers: glyph and blank widths SAP's converters use per device type.
// Moved unchanged from scripts/smartform/build-preview.mjs; the width tables stay in scripts/smartform/.

import { readFileSync } from 'node:fs';

/** Blank widths (twips) SAP's OTF sent per device type, keyed "FAMILY|size×10|B" (bold) or
 *  "FAMILY|size×10|" — the widths of the device type's font metrics, which a browser font
 *  does not round alike (collected from the SW records of the learning-loop OTFs). */
/** Glyph widths (1/1000 em, index = code − 32, WinAnsi) SAP's PDF converter uses per device type
 *  and SAP family / bold, keyed "FAMILY|B" or "FAMILY|" — read from SAP's own PDFs
 *  (glyph-widths.json). Only device types whose widths do not depend on the size (PDFUC,
 *  SAPWIN); KPPDF stores per-size widths and is left to the browser. */
let GLYPH_WIDTHS = null;
export function glyphWidths(deviceType) {
  if (!GLYPH_WIDTHS) {
    try { GLYPH_WIDTHS = JSON.parse(readFileSync(new URL('../smartform/glyph-widths.json', import.meta.url), 'utf8')).widths || {}; } catch { GLYPH_WIDTHS = {}; }
  }
  const dev = `${String(deviceType || '').trim().toUpperCase()}|`;
  const out = {};
  for (const [k, v] of Object.entries(GLYPH_WIDTHS)) if (k.startsWith(dev)) out[k.slice(dev.length)] = v;
  return out;
}

let BLANK_WIDTHS = null;
export function blankWidths(deviceType) {
  if (!BLANK_WIDTHS) {
    try { BLANK_WIDTHS = JSON.parse(readFileSync(new URL('../smartform/blank-widths.json', import.meta.url), 'utf8')); } catch { BLANK_WIDTHS = {}; }
  }
  const dev = `${String(deviceType || '').trim().toUpperCase()}|`;
  const out = {};
  for (const [k, v] of Object.entries(BLANK_WIDTHS)) if (k.startsWith(dev)) out[k.slice(dev.length)] = v;
  return out;
}

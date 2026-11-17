// sc4sap:program-to-spec — Template-clone xlsx renderer.
//
// Strategy (양식 보존 / format-preserving):
//   1. Read asset/template_base.xlsx (canonical reference workbook —
//      English-source ZMMR_DEMO_SPEC spec with all styles, borders, fonts, column
//      widths, row heights, drawings, images intact).
//   2. Re-zip every entry byte-for-byte EXCEPT xl/sharedStrings.xml.
//   3. For xl/sharedStrings.xml, replace each <t>…</t> content using the
//      user-supplied translation map TR { "English key": "한국어 값" }.
//   4. Write the resulting xlsx to outPath.
//
// Why this exists:
//   The previous workflow built xlsx geometry from JSON (SHEETS_DATA + custom
//   styles), which silently drifted from the agreed reference format. By
//   cloning the template and only swapping text payload, the output is GUARANTEED
//   to match the reference layout exactly — styles, borders, image anchors,
//   row heights, column widths all preserved.
//
// Slot semantics (must be honoured by the TR map producer — sap-writer):
//   · Sheet 1 (Program Overview): 17 Field/Value rows
//   · Sheet 2 (Data Model):       4 table rows (slots: VBAK → MARA-style, VBAP →
//                                 MARC-style, KNA1 → MAKT-style, MAKT → 4th) +
//                                 CDS Views / BAPIs / BAdIs trailer rows
//   · Sheet 3 (Inputs & Screens): 5 parameter slots (S_VKORG..S_VBELN) + 5
//                                 warning rows. Repurpose unused slots with
//                                 "— (해당 없음)" placeholders to keep row count.
//   · Sheet 4 (Processing Logic): 12 step slots. Use "—" for unused.
//   · Sheet 5 (Output):           10 ALV column slots. Use "—" for unused.
//   · Sheet 6 (Authorizations):   5 rows.
//   · Sheet 7 (Exceptions):       3 rows.
//
// SAP standard identifiers (table names, field names, parameter names) that
// happen to match the source spec (ZMMR_DEMO_SPEC / VBAK / VBELN / S_VKORG …)
// MUST be present as TR keys to swap them for the target program's identifiers.
// Identifiers absent from TR remain in the cloned file unchanged.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipEntries, zipFiles } from './xlsx-zip.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// =============================================================
// sharedStrings.xml translation
// =============================================================
function translateSharedStrings(xml, tr, { warnUntranslated = true } = {}) {
  const missing = [];
  const out = xml.replace(/<t([^>]*)>([\s\S]*?)<\/t>/g, (m, attrs, body) => {
    const decoded = body
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
    const translated = tr[decoded];
    if (translated == null) {
      // English-looking strings that lack a mapping are likely bugs in the TR map.
      // Pure-ASCII single tokens (table names, field codes) are intentionally
      // unmapped when the target program shares the identifier.
      if (warnUntranslated && /[A-Za-z]/.test(decoded) && decoded.length > 1) {
        missing.push(decoded.slice(0, 80));
      }
      return m;
    }
    const enc = translated
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const needsSpace = /^\s|\s$|\n/.test(translated);
    const newAttrs = needsSpace && !/xml:space/.test(attrs)
      ? ' xml:space="preserve"' + attrs : attrs;
    return `<t${newAttrs}>${enc}</t>`;
  });
  return { xml: out, missing };
}

// =============================================================
// Public API
// =============================================================
export function cloneTemplate({ outPath, tr, templatePath, verbose = true }) {
  // Default: <repo-root>/asset/template_base.xlsx (two levels up from scripts/spec/).
  const tplPath = templatePath
    || resolve(__dirname, '..', '..', 'asset', 'template_base.xlsx');
  if (!existsSync(tplPath)) {
    throw new Error(`template-clone: template not found at ${tplPath}`);
  }
  const src = readFileSync(tplPath);
  const entries = unzipEntries(src);
  let foundSS = false;
  let missing = [];
  for (const e of entries) {
    if (e.name === 'xl/sharedStrings.xml') {
      foundSS = true;
      const result = translateSharedStrings(e.data.toString('utf8'), tr);
      e.data = Buffer.from(result.xml, 'utf8');
      missing = result.missing;
    }
  }
  if (!foundSS) throw new Error('template-clone: xl/sharedStrings.xml missing from template');
  const out = zipFiles(entries);
  writeFileSync(outPath, out);
  if (verbose) {
    console.log(`template-clone: wrote ${outPath} (${out.length} bytes)`);
    if (missing.length > 0) {
      console.log(`template-clone: ${missing.length} English string(s) had no TR mapping:`);
      for (const s of missing.slice(0, 20)) console.log(`  · ${JSON.stringify(s)}`);
      if (missing.length > 20) console.log(`  · … (${missing.length - 20} more)`);
    }
  }
  return { outPath, bytes: out.length, missing };
}

// CLI usage:  node template-clone.mjs <tr-json-path> <out-xlsx-path>
// Run unconditionally when invoked as the entrypoint script (process.argv[1]
// equals this file). On Windows, fileURLToPath round-trip handles drive-letter
// + backslash mismatches that broke the older `file://` comparison.
const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [trPath, outPath] = process.argv.slice(2);
  if (!trPath || !outPath) {
    console.error('Usage: node template-clone.mjs <tr-json-path> <out-xlsx-path>');
    process.exit(2);
  }
  const tr = JSON.parse(readFileSync(trPath, 'utf8'));
  cloneTemplate({ outPath, tr });
}

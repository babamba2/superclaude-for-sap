// sc4sap form fidelity harness — Adobe form previews of a sample set against SAP's own prints (ADS).
// For every Adobe entry (kind "fp") of the set's manifest: the interface values SAP rendered with, the include / text
// module texts and the form's DDIC → a preview (build-adobe-preview.mjs --layout-json) → score-fidelity against SAP's
// PDF. No SAP call.
//
//   node adobe-previews.mjs --set <dir> --forms <dir> --out <dir> [--meta <dir>] [--only ID,ID] [--skip ID,ID]
//     --set    manifest.json { ID: { kind: 'fp', form, values: 'values/ID.values.json', at, files: { pdf: { file } } } },
//              the values files and SAP's PDFs (a tuning set or a held-out set)
//     --forms  GetAdobeFormContent output: <form lower case>/ (form XML, layout XDP, interface)
//     --meta   form metadata, the same for every set: texts/<ID>.texts.json, styles/<SmartStyle>.json (STXSPARA /
//              STXSHEAD / STXSTAB / STXSCHAR rows), ddic/<ID>.ddic.json (default: --set)
//     --out    per ID: values.json, the preview, fidelity.json; corpus.json for the set
import { pathToFileURL } from 'node:url';
import { buildLayout, existsSync, failOne, join, mkdirSync, parseArgs, readFileSync, readJson, scoreOne, writeCorpus, writeFileSync } from './common.mjs';
import { styleFormats } from '../../adobe/adobe-data.mjs';

/** The preview's sample for one entry: values, texts (ITF rows + the SmartStyle's formats), DDIC, system date. */
export function adobeSample(e, values, metaDir, id) {
  const styleOf = (n) => {
    const p = join(metaDir, 'styles', `${n}.json`);
    if (!n || !existsSync(p)) return null;
    const j = readJson(p);
    return styleFormats(j.STXSPARA, (j.STXSHEAD || [])[0] || null, j.STXSTAB || [], j.STXSCHAR || []);
  };
  const tf = join(metaDir, 'texts', `${id}.texts.json`), df = join(metaDir, 'ddic', `${id}.ddic.json`);
  const rawT = existsSync(tf) ? readJson(tf).texts || {} : {};
  const texts = Object.fromEntries(Object.entries(rawT).map(([k, v]) => [k, {
    itf: (v.itf || []).map((l) => ({ TDFORMAT: l.format, TDLINE: l.line })),
    formats: styleOf(v.styleName) || { ...(v.paraFormats || {}), ...(v.style?.defaultParagraph && v.paraFormats?.[v.style.defaultParagraph] ? { '*': v.paraFormats[v.style.defaultParagraph] } : {}) },
  }]));
  const ddic = existsSync(df) ? readJson(df).ddic || {} : {};
  const date = String(e.at || '').slice(0, 10);
  return { values, texts, ddic, system: { 'SFPSY-DATE': date, 'SY-DATUM': date }, locale: 'en_US' };
}

async function main() {
  const a = parseArgs(process.argv.slice(2), ['set', 'forms', 'out']);
  const meta = a.meta && a.meta !== true ? a.meta : a.set;
  const skip = a.skip && a.skip !== true ? new Set(String(a.skip).split(',')) : new Set();
  const m = readJson(join(a.set, 'manifest.json'));
  const results = [];
  for (const [id, e] of Object.entries(m)) {
    if (e.kind !== 'fp' || (a.only && !a.only.has(id)) || skip.has(id)) continue;
    const dir = join(a.forms, String(e.form).toLowerCase());
    if (!existsSync(dir)) { console.log(id, 'no form folder'); continue; }
    const od = join(a.out, id);
    mkdirSync(od, { recursive: true });
    writeFileSync(join(od, 'values.json'), JSON.stringify(adobeSample(e, readJson(join(a.set, e.values)), meta, id), null, 1));
    try {
      const lay = buildLayout('adobe/build-adobe-preview.mjs', ['build', dir, '--values', join(od, 'values.json'), '--out-dir', od, '--layout-json'], od);
      scoreOne(id, readFileSync(join(a.set, e.files.pdf.file)), lay, od, results);
    } catch (err) { failOne(id, err, results); }
  }
  writeCorpus(a.out, results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

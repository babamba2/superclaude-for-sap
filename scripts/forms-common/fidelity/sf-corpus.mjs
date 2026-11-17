// sc4sap form fidelity harness — SmartForm previews of a form corpus (one folder per form with the values the preview
// takes) against SAP's own prints. No SAP call.
//
//   node sf-corpus.mjs --forms <dir> --content <dir> --out <dir> [--override <dir>] [--only FORM,FORM] [--limit N]
//     --forms     <FORM>/values.json (the preview's values, as printed)
//     --content   GetSmartFormContent output: <form lower case>/<form>.content.json and SAP's print <form>.sap.pdf
//     --override  optional content files that win: <form lower case>/<form>.content.json
//     --out       per form: the preview, fidelity.json; corpus.json for the corpus
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildLayout, existsSync, failOne, join, parseArgs, readFileSync, scoreOne, writeCorpus } from './common.mjs';

async function main() {
  const a = parseArgs(process.argv.slice(2), ['forms', 'content', 'out']);
  const limit = Number(a.limit && a.limit !== true ? a.limit : 1e9);
  const results = [];
  let n = 0;
  for (const F of readdirSync(a.forms).sort()) {
    if (a.only && !a.only.has(F)) continue;
    const f = F.toLowerCase();
    const ovr = a.override && a.override !== true ? join(a.override, f, `${f}.content.json`) : null;
    const values = join(a.forms, F, 'values.json');
    const content = ovr && existsSync(ovr) ? ovr : join(a.content, f, `${f}.content.json`);
    const ref = join(a.content, f, `${f}.sap.pdf`);
    if (!existsSync(values) || !existsSync(content) || !existsSync(ref)) continue;
    if (n++ >= limit) break;
    const od = join(a.out, F);
    try {
      const lay = buildLayout('smartform/build-preview.mjs', ['build', content, '--values', values, '--out-dir', od, '--no-jpg', '--layout-json'], od, 120000);
      scoreOne(F, readFileSync(ref), lay, od, results);
    } catch (err) { failOne(F, err, results); }
  }
  writeCorpus(a.out, results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

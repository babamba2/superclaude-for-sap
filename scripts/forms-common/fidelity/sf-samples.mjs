// sc4sap form fidelity harness — SmartForm previews of a sample set against SAP's own prints.
// For every SmartForm entry (kind "sf") of the set's manifest: the interface values SAP was rendered with → the preview's
// "as printed" values (preview-values.mjs) plus what the form's program lines compute (programValues below) → a preview
// (build-preview.mjs --layout-json) → score-fidelity against SAP's PDF. No SAP call.
//
//   node sf-samples.mjs --set <dir> --content <dir> --out <dir> [--ddic <dir>] [--only ID,ID]
//     --set      manifest.json { ID: { kind: 'sf', form, values: 'values/ID.values.json', at, files: { pdf: { file } } } },
//                the values files and SAP's PDFs
//     --content  GetSmartFormContent output: <ID or another ID of the same form>/<form>.content.json (+ <form>.xml for
//                the program lines, + graphics)
//     --ddic     <ID>.ddic.json { ddic: { 'PARAM-FIELD': { type, length, decimals } } } (default: <set>/ddic)
//     --out      per ID: values.json, the preview, fidelity.json; corpus.json for the set
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildLayout, existsSync, failOne, join, mkdirSync, parseArgs, readFileSync, readJson, scoreOne, writeCorpus, writeFileSync } from './common.mjs';
import { valuesFromRaw } from '../../smartform/preview-values.mjs';
import { runInitCoding } from '../../adobe/adobe-data.mjs';

/** Program-line code nodes of the form XML: INAME → source lines. */
export function codeOf(xml) {
  const code = {};
  for (const mm of String(xml || '').matchAll(/<sf:CODE>[\s\S]*?<\/sf:CODE>/g)) {
    const name = (/<INAME>([^<]+)<\/INAME>/.exec(mm[0]) || [])[1];
    code[name] = [...mm[0].matchAll(/<item>([^<]*)<\/item>/g)].map((x) => x[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  }
  return code;
}

/** A node's simple conditions (EQ / NE against a scalar interface value): false only when every operand is decided
 *  and one comparison fails — an OP1 that is no interface value, or OP2 INITIAL, is undecidable here and runs. */
export function condOk(n, raw) {
  return (n.condition?.COND || []).every((c) => {
    if (c.COP !== 'EQ' && c.COP !== 'NE') return true;
    const k = String(c.OP1 || '').toUpperCase();
    const v = raw[k] ?? raw[c.OP1];
    if (v === undefined || (v !== null && typeof v === 'object')) return true;
    const b = String(c.OP2 ?? '').trim();
    if (/^INITIAL$/i.test(b)) return true;
    const a = String(v ?? '').trim(), lit = b.replace(/^'|'$/g, '').trim();
    return c.COP === 'EQ' ? a === lit : a !== lit;
  });
}

/** What the form's program lines compute, in processing order: a loop / table runs its header events once, its body per
 *  row (simple statements, runInitCoding), its footer events once with the last row in the work area; a loop with sort
 *  events runs per group — sort-begin code at the group start, the body over the group's rows, sort-end code at its end
 *  — and a table printed in the sort-end event is kept per group. Rows are sorted as build-preview sorts them (a new
 *  table / loop by the sort field, an old 4.6 table in the given order). Nodes whose decided condition fails run no code.
 *  Statements the runner cannot run (SELECT, CALL FUNCTION …) are skipped (runInitCoding lenient) and counted in notes;
 *  the globals the code filled (not loop work areas) join the values.
 *  → { raw (with the computed tables), ddic (+ types of the computed tables' fields), perGroup, notes } */
export function programValues(content, xml, raw0, ddic0) {
  const raw = { ...raw0 }, ddic = { ...ddic0 };
  const notes = [];
  const perGroup = {};
  const code = codeOf(xml);
  if (!Object.keys(code).length) return { raw, ddic, perGroup, notes };
  // globals start at their default value (ABAP VALUE): SF_TOTALS G_ADDFLAG 'X' lets NLAST_ADDITION add the last row
  const vars0 = {};
  for (const d of content?.data || []) {
    if (d.scope !== 'global' || d.defaultValue === undefined) continue;
    const s = String(d.defaultValue).trim();
    const q = /^'(.*)'$/.exec(s), bq = /^`(.*)`$/.exec(s);
    if (q) vars0[String(d.name).toUpperCase()] = q[1].replace(/''/g, "'");
    else if (bq) vars0[String(d.name).toUpperCase()] = bq[1].replace(/``/g, '`');
    else if (/^-?\d+(\.\d+)?$/.test(s)) vars0[String(d.name).toUpperCase()] = Number(s);
  }
  let state = { tables: {}, vars: vars0 };
  let skipped = 0;
  const run = (n) => {
    const r = runInitCoding([...code[n.name]], { ...raw, ...state.tables }, ddic, state, { lenient: true });
    if (r.ok) { state = { tables: r.tables, vars: r.vars }; skipped += r.skipped.length; } else notes.push(`${n.name}: ${r.reason}`);
  };
  const codes = (list) => { const o = []; const w = (l) => { for (const n of l || []) { if (n.kind === 'code' && code[n.name]) o.push(n); w(n.children); } }; w(list); return o; };
  const asWa = (r) => Object.fromEntries(Object.entries(r).map(([a, b]) => [a.toUpperCase(), b]));
  const rowsOf = (t) => ((Array.isArray(raw[t]) ? raw[t] : state.tables[String(t).toUpperCase()]) || []);
  const walk = (list) => {
    for (const n of list || []) {
      if (!condOk(n, raw)) continue;
      if (!(n.dataTable && n.attrs?.TABHEADER)) {
        if (n.kind === 'code' && code[n.name]) run(n);
        walk(n.children);
        continue;
      }
      const ev = (t) => (n.children || []).filter((c) => c.kind === 'event' && c.attrs?.EVTYPE === t);
      for (const e of ev('H')) for (const c of codes(e.children)) run(c);
      const bodyCodes = codes((n.children || []).filter((c) => c.kind !== 'event' || c.attrs?.EVTYPE === 'B'));
      const wa = String(n.attrs.TABHEADER).toUpperCase();
      const sortS = ev('S').filter((e) => e.attrs?.SFIELD), sortE = ev('E').filter((e) => e.attrs?.SFIELD);
      if (sortS.length || sortE.length) {
        const sf = String((sortS[0] || sortE[0]).attrs.SFIELD).toUpperCase();
        const val = (r) => String(Object.entries(r).find(([k]) => k.toUpperCase() === sf)?.[1] ?? '');
        let rows = rowsOf(n.dataTable).slice();
        if (n.kind !== 'table46') rows = rows.map((r, i) => [r, i]).sort((a, b) => val(a[0]).localeCompare(val(b[0])) || a[1] - b[1]).map((x) => x[0]);
        const groups = [];
        for (const r of rows) { const g = groups[groups.length - 1]; if (g && val(g[0]) === val(r)) g.push(r); else groups.push([r]); }
        const printedInE = [];
        const wE = (l) => { for (const x of l || []) { if (x.dataTable && !printedInE.includes(String(x.dataTable).toUpperCase())) printedInE.push(String(x.dataTable).toUpperCase()); wE(x.children); } };
        for (const e of sortE) wE(e.children);
        for (const g of groups) {
          state.vars[wa] = asWa(g[0]);
          for (const e of sortS) for (const c of codes(e.children)) run(c);
          if (bodyCodes.length) {
            const tmp = '__GROUP_ROWS';
            const lines = [`loop at ${tmp} into ${n.attrs.TABHEADER}.`, ...bodyCodes.flatMap((c) => code[c.name]), 'endloop.'];
            const r = runInitCoding(lines, { ...raw, ...state.tables, [tmp]: g }, ddic, state, { lenient: true });
            if (r.ok) { delete r.tables[tmp]; delete r.tables[tmp.toUpperCase()]; state = { tables: r.tables, vars: r.vars }; } else notes.push(`${bodyCodes.map((c) => c.name).join('+')}: ${r.reason}`);
          }
          state.vars[wa] = asWa(g[g.length - 1]);
          for (const e of sortE) for (const c of codes(e.children)) run(c);
          for (const t of printedInE) (perGroup[t] ||= []).push((state.tables[t] || []).map((x) => ({ ...x })));
        }
        for (const e of ev('F')) for (const c of codes(e.children)) run(c);
        continue;
      }
      const rows = rowsOf(n.dataTable);
      if (bodyCodes.length) {
        const lines = [`loop at ${n.dataTable} into ${n.attrs.TABHEADER}.`, ...bodyCodes.flatMap((c) => code[c.name]), 'endloop.'];
        const r = runInitCoding(lines, { ...raw, ...state.tables }, ddic, state, { lenient: true });
        if (r.ok) state = { tables: r.tables, vars: r.vars }; else notes.push(`${bodyCodes.map((c) => c.name).join('+')}: ${r.reason}`);
      }
      const last = rows[rows.length - 1];
      if (last) state.vars[wa] = asWa(last);
      for (const e of ev('F')) for (const c of codes(e.children)) run(c);
    }
  };
  for (const p of content.pages || []) for (const w of p.windows || []) walk(w.content);
  // globals the program lines filled (LB_BIL_INVOICE: GS_HD_GEN = IS_BIL_INVOICE-HD_GEN) print as structures / fields; a
  // loop's work area takes its values from the loop's rows instead
  const loopWa = new Set();
  const wl = (l) => { for (const x of l || []) { if (x.attrs?.TABHEADER) loopWa.add(String(x.attrs.TABHEADER).toUpperCase()); wl(x.children); } };
  for (const p of content.pages || []) for (const w of p.windows || []) wl(w.content);
  for (const [k, v] of Object.entries(state.vars)) if (!loopWa.has(k) && raw[k] === undefined) raw[k] = v;
  if (skipped) notes.push(`${skipped} program-line statement(s) not run`);
  for (const [t, rows] of Object.entries(state.tables)) {
    raw[t] = rows;
    for (const fld of Object.keys(rows[0] || {})) {
      const k = Object.keys(ddic).find((x) => x.toUpperCase().endsWith(`-${fld}`));
      if (k && !ddic[`${t}-${fld}`]) ddic[`${t}-${fld}`] = ddic[k];
    }
  }
  return { raw, ddic, perGroup, notes };
}

/** The preview values for one sample: interface values + program-line results, tables of a sort-end event per group,
 *  SY-DATUM / SFSY-DATE = the render day (MM/DD/YYYY). → { values, rows, notes } */
export function sampleValues(content, xml, raw0, ddic0, at) {
  const { raw, ddic, perGroup, notes } = programValues(content, xml, raw0, ddic0);
  const { values, rows } = valuesFromRaw(content, raw, { ddic });
  for (const [t, groups] of Object.entries(perGroup)) {
    const per = groups.map((g) => valuesFromRaw(content, { [t]: g }, { ddic, initials: false }).values);
    for (const k of new Set(per.flatMap((v) => Object.keys(v)))) values[k] = per.map((v) => v[k] || []);
  }
  const day = String(at || '').slice(0, 10).split('-');
  if (day.length === 3) values['SY-DATUM'] = values['SFSY-DATE'] = `${day[1]}/${day[2]}/${day[0]}`;
  return { values, rows: rows || 1, notes };
}

async function main() {
  const a = parseArgs(process.argv.slice(2), ['set', 'content', 'out']);
  const ddicDir = a.ddic && a.ddic !== true ? a.ddic : join(a.set, 'ddic');
  const m = readJson(join(a.set, 'manifest.json'));
  const results = [];
  for (const [id, e] of Object.entries(m)) {
    if (e.kind !== 'sf' || (a.only && !a.only.has(id))) continue;
    const pick = existsSync(join(a.content, id)) ? id : Object.keys(m).find((k) => m[k].form === e.form && existsSync(join(a.content, k))) || id;
    const cdir = join(a.content, pick);
    const f = String(e.form).toLowerCase();
    const contentF = join(cdir, `${f}.content.json`), xmlF = join(cdir, `${f}.xml`);
    if (!existsSync(contentF)) { console.log(id, 'no content'); continue; }
    const content = readJson(contentF);
    const ddicF = join(ddicDir, `${id}.ddic.json`);
    const ddic = existsSync(ddicF) ? readJson(ddicF).ddic || {} : {};
    const { values, rows, notes } = sampleValues(content, existsSync(xmlF) ? readFileSync(xmlF, 'utf8') : '', readJson(join(a.set, e.values)), ddic, e.at);
    const od = join(a.out, id), cd = join(od, 'content');
    mkdirSync(cd, { recursive: true });
    // the content with its graphics next to it
    for (const g of content.graphics || []) if (g.file) { const b = g.file.split(/[\\/]/).pop(); if (existsSync(join(cdir, b))) { writeFileSync(join(cd, b), readFileSync(join(cdir, b))); g.file = resolve(cd, b); } }
    writeFileSync(join(cd, `${f}.content.json`), JSON.stringify(content));
    // unvalued 'blank': a field the data leaves out is initial and prints as nothing, as in SAP's print
    writeFileSync(join(od, 'values.json'), JSON.stringify({ values, rows, unvalued: 'blank' }, null, 1));
    try {
      const lay = buildLayout('smartform/build-preview.mjs', ['build', join(cd, `${f}.content.json`), '--values', join(od, 'values.json'), '--out-dir', od, '--no-jpg', '--layout-json'], od);
      scoreOne(id, readFileSync(join(a.set, e.files.pdf.file)), lay, od, results, (...x) => console.log(...x, notes.join('; ')));
    } catch (err) { failOne(id, err, results); }
  }
  writeCorpus(a.out, results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

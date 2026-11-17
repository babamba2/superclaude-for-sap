// sc4sap:adobe-preview — draws the expected print of an Adobe form (SFP) from what GetAdobeFormContent wrote and
// invented sample values: every page as an A4 SVG in mm (texts on their baselines, rules, boxes, images).
//
// INPUT  the MCP output folder of the form (mcp-output/adobe/<form>/): <form>.form.xml, <interface>.interface.xml,
//        <form>.layout.xdp — plus values.json with invented sample values (never business data):
//        { "values": { PARAM: … }, "globals": { … }, "system": { "SFPSY-DATE": "2026-01-31" },
//          "texts": { TEXT_MODULE: […] | { itf, formats } }, "ddic": { "PARAM-FIELD": { type, length, decimals } },
//          "locale": "en_US" }
// OUTPUT <FORM>-preview.html, <FORM>-preview.model.json (items per page with roles for score-forms.mjs), and with a
//        local Chrome / Edge: <FORM>-preview.pdf (--pdf), <FORM>-preview.jpg (--jpg) and <FORM>-preview.layout.json
//        (--layout-json, implies --pdf: the printed PDF's texts and rules in mm for score-fidelity.mjs); a JSON report on stdout.
//
//   buildModel({ formXml, interfaceXml, layoutXdp }, sample)  → { form, pages, report, missingTexts }
//   renderHtml(model, { inspect })                             → HTML (one <section class="page"> per page)
//
// CLI
//   node build-adobe-preview.mjs build <form-dir> --values <values.json> --out-dir <dir> [--pdf] [--jpg] [--layout-json] [--inspect]
//   node build-adobe-preview.mjs fields <form-dir>   → the printed context leaves (for the sample values)
//
// inspect: data-som (SOM path), data-bind (context field), data-role on every text, and a
// <script type="application/json" id="sf-index"> with the elements per page (kind, mm box, binding, font).

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { readContext, readInterface, readXdp, parseXml, kids } from './read-adobe.mjs';
import { buildRecord, contextFields, runInitCoding } from './adobe-data.mjs';
import { layoutForm } from './adobe-layout.mjs';
import { findBrowser, runBrowser } from '../forms-common/browser.mjs';
import { layoutOf } from '../forms-common/score-fidelity.mjs';
import { textWidthMm } from '../forms-common/metrics.mjs';

/** The browser clips what lies past the page edge; ADS writes it into the PDF anyway (a SmartForm MAIN window
 *  migrated without a width grows off the page). The layout model's own texts and rules stand in for the
 *  clipped ones, flagged offPage (no scorer leniency: not wEst). Only the browser pieces that spell the start of
 *  the model text go; another text of ours at the edge stays. */
export function withOffPage(layout, model) {
  const bare = (s) => String(s).replace(/\s+/g, '');
  layout.pages.forEach((lp, i) => {
    const mp = model.pages[i];
    if (!mp) return;
    const W = mp.w, H = mp.h;
    for (const it of mp.items) {
      if (it.type === 'text') {
        const w = textWidthMm(it.text, it.pt, { bold: it.bold, face: it.font });
        if (it.x + w <= W + 0.01 && it.y <= H + 0.01) continue;
        const clipped = lp.texts.filter((t) => Math.abs(t.y - it.y) < 0.3 && t.x >= it.x - 0.3 && t.x < it.x + w + 0.3).sort((a, b) => a.x - b.x);
        const seen = bare(clipped.map((t) => t.text).join(''));
        if (clipped.length && bare(it.text).startsWith(seen)) lp.texts = lp.texts.filter((t) => !clipped.includes(t));
        lp.texts.push({ x: +it.x.toFixed(2), y: +it.y.toFixed(2), w: +w.toFixed(2), text: it.text, pt: it.pt, font: it.font, bold: !!it.bold, italic: !!it.italic, offPage: true });
      } else if (it.type === 'line' && Math.max(it.x1, it.x2) > W + 0.01) {
        lp.lines.push({ x1: it.x1, y1: it.y1, x2: it.x2, y2: it.y2, th: it.th });
      } else if (it.type === 'rect' && it.x + it.w > W + 0.01) {
        lp.rects.push({ x: it.x, y: it.y, w: it.w, h: it.h, ...(it.fill ? { fill: it.fill } : {}), ...(it.stroke ? { stroke: it.stroke, th: it.th } : {}) });
      }
    }
  });
  return layout;
}

const PT = 25.4 / 72;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (v) => Math.round(v * 1000) / 1000;
const FAMILY = (face) => (/courier/i.test(face) ? "'Courier New', Courier, monospace" : /times/i.test(face) ? "'Times New Roman', Times, serif" : 'Arial, Helvetica, sans-serif');

/** The layout model of a form for a sample. */
export function buildModel({ formXml, interfaceXml, layoutXdp }, sample0 = {}) {
  let sample = sample0;
  const { context, interface: ifName } = readContext(formXml);
  const iface = interfaceXml ? readInterface(interfaceXml) : { references: [] };
  const { template } = readXdp(layoutXdp);
  // the interface's initialization code fills globals (sums per currency …): run what can run without SAP, unless
  // the sample gives those globals itself; what cannot run is reported
  const initNotes = [];
  const outs = (iface.coding?.output || []).filter((n) => n && !Object.keys(sample.globals || {}).some((k) => k.toUpperCase() === n.toUpperCase()));
  if (iface.coding?.init?.some((l) => String(l).trim() && !/^\s*\*/.test(l)) && outs.length) {
    const r = runInitCoding(iface.coding.init, { ...(sample.globals || {}), ...(sample.values || {}) }, sample.ddic || {});
    if (r.ok) {
      sample = { ...sample, globals: { ...(sample.globals || {}), ...r.tables } };
      initNotes.push(`initialization code run here (${Object.keys(r.tables).join(', ') || 'nothing filled'}) — simple statements only`);
    } else initNotes.push(`initialization code not run (${r.reason}): ${outs.join(', ')} stay as in the sample`);
  }
  const { record, missingTexts } = buildRecord(context, sample, { references: iface.references });
  const out = layoutForm(template, record, { locale: sample.locale || 'en_US', today: sample.system?.['SFPSY-DATE'] });
  out.report.approximations.push(...initNotes);
  // system fields the preview filled: the date is the caller's input (or today), never the SAP server's
  const usesSystem = JSON.stringify(context || {}).match(/"field":"SFPSY-[A-Z]+"/g) || [];
  const system = {};
  for (const m of new Set(usesSystem)) {
    const k = m.slice(9, -1);
    const given = Object.keys(sample.system || {}).find((x) => x.toUpperCase() === k);
    system[k] = given !== undefined ? { value: sample.system[given], source: 'values.json' } : { value: k === 'SFPSY-DATE' ? todayIso() : '', source: 'default' };
  }
  return { interface: ifName, pages: out.pages, report: out.report, missingTexts, system };
}

/** The data record of an XFA data XML (the root element under xdp / xfa:datasets / xfa:data, or the document
 *  element): an element with child elements is a group, else a value. Attributes are ignored. */
export function recordFromXml(xml) {
  const doc = parseXml(xml);
  const elems = (e) => kids(e).filter((k) => k.tag !== '#text' && !String(k.tag).startsWith('?') && !String(k.tag).startsWith('!'));
  let el = elems(doc)[0];
  for (let i = 0; el && i < 3 && /(^|:)(xdp|datasets|data)$/.test(el.tag); i++) el = elems(el)[0];
  const conv = (e) => {
    const ch = elems(e);
    const name = String(e.tag).replace(/^.*:/, '');
    if (!ch.length) return { name, value: (e.children || []).filter((k) => k.tag === '#text').map((k) => k.text).join('') };
    return { name, children: ch.map(conv) };
  };
  return el ? conv(el) : { name: 'data', children: [] };
}

/** The layout model of a designer template (XDP) with its data XML — no SAP form object, no interface. */
export function buildModelXdp({ layoutXdp, dataXml }, { locale = 'en_US', today } = {}) {
  const { template } = readXdp(layoutXdp);
  const out = layoutForm(template, recordFromXml(dataXml), { locale, today });
  return { interface: '', pages: out.pages, report: out.report, missingTexts: [], system: {} };
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function itemSvg(it, inspect) {
  if (it.type === 'text') {
    const a = [`x="${r2(it.x)}"`, `y="${r2(it.y)}"`, `font-size="${r2(it.pt * PT)}"`, `font-family="${FAMILY(it.font)}"`];
    if (it.bold) a.push('font-weight="bold"');
    if (it.italic) a.push('font-style="italic"');
    if (it.color && it.color !== '#000000') a.push(`fill="${esc(it.color)}"`);
    if (inspect) { a.push(`data-som="${esc(it.som || '')}"`, `data-role="${it.role || ''}"`); if (it.bind) a.push(`data-bind="${esc(it.bind)}"`); }
    // no kerning: ADS sets the standard fonts without kerning pairs
    return `<text ${a.join(' ')} style="font-kerning:none" xml:space="preserve">${esc(it.text)}</text>`;
  }
  if (it.type === 'line') return `<line x1="${r2(it.x1)}" y1="${r2(it.y1)}" x2="${r2(it.x2)}" y2="${r2(it.y2)}" stroke="${esc(it.color || '#000')}" stroke-width="${r2(it.th)}"/>`;
  if (it.type === 'rect') {
    const rr = it.r ? ` rx="${r2(it.r)}" ry="${r2(it.r)}"` : '';
    if (it.fill) return `<rect x="${r2(it.x)}" y="${r2(it.y)}" width="${r2(it.w)}" height="${r2(it.h)}"${rr} fill="${esc(it.fill)}"/>`;
    return `<rect x="${r2(it.x)}" y="${r2(it.y)}" width="${r2(it.w)}" height="${r2(it.h)}"${rr} fill="none" stroke="${esc(it.stroke || '#000')}" stroke-width="${r2(it.th || 0.2)}"/>`;
  }
  if (it.type === 'image' && it.data) {
    const mime = it.mime || (it.data.startsWith('/9j/') ? 'image/jpeg' : it.data.startsWith('iVBOR') ? 'image/png' : it.data.startsWith('Qk') ? 'image/bmp' : 'image/gif');
    return `<image x="${r2(it.x)}" y="${r2(it.y)}" width="${r2(it.w)}" height="${r2(it.h)}" preserveAspectRatio="none" href="data:${esc(mime)};base64,${esc(it.data)}"${inspect ? ` data-som="${esc(it.som || '')}"` : ''}/>`;
  }
  return '';
}

/** One HTML page per form page, printable at A4 with no margins. */
export function renderHtml(model, { inspect = false, title = 'Adobe form preview' } = {}) {
  const w0 = model.pages[0]?.w || 210, h0 = model.pages[0]?.h || 297;
  const pages = model.pages.map((p, i) => `<section class="page" style="width:${r2(p.w)}mm;height:${r2(p.h)}mm" data-page="${i + 1}">` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(p.w)}mm" height="${r2(p.h)}mm" viewBox="0 0 ${r2(p.w)} ${r2(p.h)}">` +
    p.items.map((it) => itemSvg(it, inspect)).join('') + '</svg></section>').join('\n');
  const index = inspect ? `<script type="application/json" id="sf-index">${JSON.stringify(model.pages.map((p) => p.items.filter((t) => t.type === 'text').map((t) => ({
    som: t.som, role: t.role, bind: t.bind, x: r2(t.x), y: r2(t.y), pt: t.pt, bold: !!t.bold, text: t.text }))))
    .replace(/</g, '\\u003c')}</script>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: ${r2(w0)}mm ${r2(h0)}mm; margin: 0 }
html, body { margin: 0; padding: 0; background: #fff }
.page { position: relative; overflow: hidden; page-break-after: always; break-after: page }
.page:last-child { page-break-after: auto; break-after: auto }
svg { display: block }
@media screen { body { background: #e8e8e8 } .page { margin: 8mm auto; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25) } }
</style></head><body>
${pages}
${index}</body></html>`;
}

function filesOf(dir) {
  const list = readdirSync(dir);
  const pick = (re) => list.find((f) => re.test(f));
  const form = pick(/\.form\.xml$/i), layout = pick(/\.layout\.xdp$/i), iface = pick(/\.interface\.xml$/i);
  if (!form || !layout) throw new Error(`${dir}: <form>.form.xml and <form>.layout.xdp expected (GetAdobeFormContent output)`);
  return { form: join(dir, form), layout: join(dir, layout), iface: iface ? join(dir, iface) : null, name: form.replace(/\.form\.xml$/i, '').toUpperCase() };
}

function arg(argv, name, dflt) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; }

function main(argv) {
  const [cmd, dir] = argv;
  if (!cmd || !dir || !existsSync(dir) || (cmd === 'xdp' && !(arg(argv, '--data') && existsSync(arg(argv, '--data'))))) {
    console.error('usage: node build-adobe-preview.mjs build <form-dir> --values <values.json> --out-dir <dir> [--pdf] [--jpg] [--layout-json] [--inspect]\n       node build-adobe-preview.mjs xdp <template.xdp> --data <data.xml> --out-dir <dir> [--locale en_US] [--today YYYY-MM-DD] [--pdf] [--jpg] [--layout-json]\n       node build-adobe-preview.mjs fields <form-dir>');
    process.exit(2);
  }
  const f = cmd === 'xdp' ? { name: basename(dir).replace(/\.xdp$/i, '').toUpperCase() } : filesOf(dir);
  if (cmd === 'fields') {
    const { context } = readContext(readFileSync(f.form, 'utf8'));
    console.log(JSON.stringify(contextFields(context), null, 1));
    return;
  }
  const sample = arg(argv, '--values') ? JSON.parse(readFileSync(arg(argv, '--values'), 'utf8')) : {};
  const outDir = resolve(arg(argv, '--out-dir', '.'));
  mkdirSync(outDir, { recursive: true });
  const model = cmd === 'xdp'
    ? buildModelXdp({ layoutXdp: readFileSync(dir, 'utf8'), dataXml: readFileSync(arg(argv, '--data'), 'utf8') }, { locale: arg(argv, '--locale', 'en_US'), today: arg(argv, '--today') })
    : buildModel({ formXml: readFileSync(f.form, 'utf8'), interfaceXml: f.iface ? readFileSync(f.iface, 'utf8') : '', layoutXdp: readFileSync(f.layout, 'utf8') }, sample);
  const base = join(outDir, `${f.name}-preview`);
  writeFileSync(`${base}.html`, renderHtml(model, { inspect: argv.includes('--inspect'), title: `${f.name} preview` }));
  writeFileSync(`${base}.model.json`, JSON.stringify({ form: f.name, interface: model.interface, pages: model.pages.map((p) => ({ w: p.w, h: p.h, name: p.name, items: p.items.map((it) => (it.type === 'image' ? { ...it, data: it.data ? `[${it.data.length} base64]` : '' } : it)) })) }, null, 1));
  const report = { html: `${base}.html`, model: `${base}.model.json`, pages: model.pages.length, missingTexts: model.missingTexts,
    approximations: [...new Set(model.report.approximations)], unbound: [...new Set(model.report.unbound)], overflow: model.report.overflow,
    system: model.system };
  if (model.system['SFPSY-DATE']) report.notes = [`SFPSY-DATE = ${model.system['SFPSY-DATE'].value} (${model.system['SFPSY-DATE'].source}): the date is your input — SAP prints its own server date; give the same date in values.json "system" to compare with SAP's PDF`];
  const wantPdf = argv.includes('--pdf') || argv.includes('--layout-json');
  if (wantPdf || argv.includes('--jpg')) {
    const browser = findBrowser();
    if (!browser) report.browser = 'no Chrome / Edge / Chromium found (set SC4SAP_CHROME): HTML only';
    else {
      const profile = join(tmpdir(), `sc4sap-adobe-preview-chrome-${process.pid}`);
      const url = pathToFileURL(`${base}.html`).href;
      if (wantPdf) {
        runBrowser(browser, ['--no-pdf-header-footer', `--print-to-pdf=${base}.pdf`, url], profile);
        if (existsSync(`${base}.pdf`)) report.pdf = `${base}.pdf`;
        if (report.pdf && argv.includes('--layout-json')) {
          writeFileSync(`${base}.layout.json`, `${JSON.stringify(withOffPage(layoutOf(readFileSync(report.pdf)), model), null, 1)}\n`);
          report.layout = `${base}.layout.json`;
        }
      }
      if (argv.includes('--jpg')) {
        const p = model.pages[0] || { w: 210, h: 297 };
        runBrowser(browser, [`--window-size=${Math.round(p.w / 25.4 * 96)},${Math.round(p.h / 25.4 * 96)}`, `--screenshot=${base}.jpg`, url], profile);
        if (existsSync(`${base}.jpg`)) report.jpg = `${base}.jpg`;
      }
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* the profile is a temp folder */ }
    }
  }
  console.log(JSON.stringify(report, null, 1));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));

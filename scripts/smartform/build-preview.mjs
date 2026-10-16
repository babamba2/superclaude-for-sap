// sc4sap:smartform-preview — draws the expected print of a SmartForm.
//
// INPUT  <form>.content.json written by the MCP tool GetSmartFormContent
//        (pages → windows → content tree, SmartStyle CSS, SE78 graphics as BMP)
//        + values.json with invented sample values for the &symbols&
// OUTPUT <FORM>-preview.html (A4 page in mm) and <FORM>-preview.jpg (headless
//        Chrome / Edge / Chromium), plus a JSON report on stdout.
//
// CLI
//   node build-preview.mjs symbols <content.json>
//     → every printed &symbol& with where it prints (window, node, cell width,
//       font size, inside a loop or not) and the form's data declarations,
//       so the sample values can follow the field types and the space.
//   node build-preview.mjs build <content.json> --values <values.json>
//        --out-dir <dir> [--rows N] [--no-jpg] [--mark]
//     → { html, jpg, rows, filled, unfilled, overflow, approximations, defaultParagraph }
//
// values.json
//   { "defaultParagraph": "AA",        // paragraph for '*' lines (the style's
//                                      // standard paragraph is not in the content)
//     "rows": 3,                       // sample rows per loop / table
//     "values": { "HEADER-NAME1": "…",               // as printed, already formatted
//                 "GS_ITEM-MATNR": ["…", "…", "…"] } } // array = one value per row
//
// Sample values are invented by the skill — never business data.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const PT_MM = 0.3528;
const SYS_DEFAULTS = { 'SFSY-PAGE': '1', 'SFSY-FORMPAGES': '1', 'SFSY-JOBPAGES': '1' };
const SYMBOL_RE = /&([^&\s][^&]*?)&/g;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const baseSymbol = (raw) => raw.replace(/\(.*\)$/, '').trim();
const styleClass = (name) => String(name || '').replace(/_/g, '-');

// ── style: paragraph font sizes (for the symbol list and line heights) ──────────
function paragraphFonts(styles) {
  const out = {};
  for (const s of styles || []) {
    for (const m of String(s.css || '').matchAll(/div#([A-Z0-9*]{1,2})\.par\{([^}]*)\}/g)) {
      const pt = /font-size\s*:\s*([\d.]+)pt/.exec(m[2]);
      if (pt && !out[m[1]]) out[m[1]] = Number(pt[1]);
    }
  }
  return out;
}

// ── symbols ─────────────────────────────────────────────────────────────────────
function listSymbols(content) {
  const fonts = paragraphFonts(content.styles);
  const found = new Map();
  const walk = (nodes, ctx) => {
    for (const n of nodes || []) {
      const inLoop = ctx.inLoop || n.kind === 'loop' || n.kind === 'table46';
      let widthMm = ctx.widthMm;
      if (n.tableCell && ctx.cells) {
        const c = ctx.cells.find((x) => x.column === n.tableCell.cell && x.line === ctx.lineName(n.tableCell.line));
        if (c) widthMm = c.widthMm;
      }
      let para = '*';
      for (const l of n.lines || []) {
        if (l.format && l.format !== '=' && l.format !== '/') para = l.format;
        for (const m of l.text.matchAll(SYMBOL_RE)) {
          const name = baseSymbol(m[1]);
          if (!found.has(name)) found.set(name, { name, occurrences: [] });
          found.get(name).occurrences.push({
            window: ctx.window, node: n.name, caption: n.caption, paragraph: para,
            fontPt: fonts[para] ?? null, cellWidthMm: widthMm ?? null, inLoop,
          });
        }
      }
      const child = { ...ctx, inLoop };
      if (n.templateLines && n.cells) {
        child.cells = n.cells;
        child.lineName = (nr) => n.templateLines.find((t) => nr >= t.from && nr <= t.to)?.name;
      } else if (n.lineTypes && n.cells) {
        child.cells = n.cells;
        child.lineName = (name) => name;
      }
      walk(n.children, child);
    }
  };
  for (const p of content.pages || [])
    for (const w of p.windows) walk(w.content, { window: w.name, widthMm: w.widthMm, inLoop: false });
  const decls = content.data || [];
  const symbols = [...found.values()].sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
    const head = s.name.split('-')[0];
    const decl = decls.find((d) => d.name === head);
    return { ...s, declaration: decl ?? null, system: head === 'SFSY' };
  });
  return { form: content.form, data: decls, symbols };
}

// ── rendering ───────────────────────────────────────────────────────────────────
class Renderer {
  constructor(content, values) {
    this.c = content;
    this.values = values.values || {};
    this.rows = Number(values.rows ?? 3);
    this.defaultPara = values.defaultParagraph || null;
    this.mark = Boolean(values.mark);
    this.row = 0;
    this.filled = new Set();
    this.unfilled = new Set();
    this.approx = [];
    this.defaultParaUsed = false;
    this.fonts = paragraphFonts(content.styles);
    this.graphics = new Map((content.graphics || []).map((g) => [`${g.object}|${g.name}|${g.id}|${g.btype}`, g]));
    this.texts = new Map((content.includeTexts || []).map((t) => [`${t.object}|${t.name}|${t.id}`, t]));
  }

  symbol(raw) {
    const name = baseSymbol(raw);
    let v = this.values[name] ?? this.values[raw];
    if (Array.isArray(v)) v = v.length ? v[this.row % v.length] : undefined;
    if (v === undefined && SYS_DEFAULTS[name] !== undefined) v = SYS_DEFAULTS[name];
    if (v === undefined || v === null) {
      this.unfilled.add(name);
      return `<span class="sym" title="${esc(name)}">&amp;${esc(name)}&amp;</span>`;
    }
    this.filled.add(name);
    return this.mark ? `<span class="val" title="${esc(name)}">${esc(v)}</span>` : esc(v);
  }

  inline(text) {
    let out = '';
    let open = 0;
    let last = 0;
    const re = /<([A-Z0-9]{1,2})>|<\/>|&([^&\s][^&]*?)&/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      out += esc(text.slice(last, m.index));
      if (m[1]) { out += `<span id="${m[1]}" class="char">`; open++; }
      else if (m[0] === '</>') { if (open) { out += '</span>'; open--; } }
      else out += this.symbol(m[2]);
      last = re.lastIndex;
    }
    out += esc(text.slice(last));
    while (open-- > 0) out += '</span>';
    return out;
  }

  /** '' / '=' continue the paragraph, '/' breaks the line in it, '*' = standard paragraph. */
  paragraphs(lines, style, node) {
    const paras = [];
    for (const l of lines || []) {
      let f = l.format;
      const last = paras[paras.length - 1];
      if ((f === '' || f === '=') && last) { last.html += (f === '' ? ' ' : '') + this.inline(l.text); continue; }
      if (f === '/' && last) { last.html += `<br>${this.inline(l.text)}`; continue; }
      if (!f || f === '*' || f === '/' || f === '=') {
        this.defaultParaUsed = true;
        f = this.defaultPara || '*';
      }
      paras.push({ f, html: this.inline(l.text) });
    }
    const cls = styleClass(style || this.c.stdStyles?.[0]);
    return paras.map((p) => `<div class="${cls}"><div id="${esc(p.f)}" class="par" data-node="${esc(node)}">${p.html || '&nbsp;'}</div></div>`).join('');
  }

  text(n) {
    if (n.include) {
      const t = this.texts.get(`${n.include.object}|${n.include.name}|${n.include.id}`);
      if (t?.lines) return this.paragraphs(t.lines, n.style, n.name);
      this.approx.push(`${n.name}: include text ${n.include.name} not available — shown as its key`);
      return this.paragraphs([{ format: '*', text: `[${n.include.object} ${n.include.name} ${n.include.id}]` }], n.style, n.name);
    }
    return this.paragraphs(n.lines, n.style, n.name);
  }

  graphic(n) {
    const g = n.graphic && this.graphics.get(`${n.graphic.object}|${n.graphic.name}|${n.graphic.id}|${n.graphic.btype}`);
    if (!g?.file || !existsSync(g.file)) {
      this.approx.push(`${n.name}: graphic ${n.graphic?.name || '?'} ${n.graphic?.dynamic ? '(key set at print time)' : 'not available'} — drawn as a box`);
      return `<div class="missing" title="${esc(n.graphic?.name || '')}">${esc(n.graphic?.name || 'graphic')}</div>`;
    }
    const b64 = readFileSync(g.file).toString('base64');
    return `<img src="data:image/bmp;base64,${b64}" style="width:${g.widthMm}mm;height:${g.heightMm}mm" alt="${esc(g.name)}">`;
  }

  grid(n, rows) {
    const at = {};
    for (const ch of n.children || []) {
      if (!ch.tableCell) continue;
      const k = `${ch.tableCell.line}/${ch.tableCell.cell}`;
      (at[k] = at[k] || []).push(ch);
    }
    let html = `<div class="tpl" data-node="${esc(n.name)}" style="width:${n.width?.mm ?? 0}mm">`;
    for (const r of rows) {
      html += `<div class="row" style="${r.h ? `height:${r.h}mm` : ''}">`;
      for (const c of r.cells) {
        const b = c.borders || {};
        const bs = ['top', 'right', 'bottom', 'left'].map((s) => (b[s] ? `border-${s}:${b[s]}mm solid #000;` : '')).join('');
        const inner = (at[`${r.key}/${c.column}`] || []).map((x) => this.node(x)).join('');
        html += `<div class="cell" style="width:${c.widthMm}mm;${c.fill ? `background:${c.fill};` : ''}${bs}">${inner}</div>`;
      }
      html += '</div>';
    }
    return `${html}</div>`;
  }

  template(n) {
    const byLine = {};
    for (const c of n.cells || []) (byLine[c.line] = byLine[c.line] || []).push(c);
    const rows = [];
    for (const tl of n.templateLines || [])
      for (let nr = tl.from; nr <= tl.to; nr++)
        rows.push({ key: nr, h: tl.heightMm, cells: (byLine[tl.name] || []).sort((a, b) => a.column - b.column) });
    return this.grid(n, rows);
  }

  /** Table node: one row per line type its texts use, in the order they appear. */
  tableBody(n, children) {
    const byLine = {};
    for (const c of n.cells || []) (byLine[c.line] = byLine[c.line] || []).push(c);
    const order = [];
    for (const ch of children) if (ch.tableCell?.line && !order.includes(ch.tableCell.line)) order.push(ch.tableCell.line);
    const rows = order.map((lt) => ({ key: lt, h: n.lineTypes?.find((t) => t.name === lt)?.heightMm, cells: (byLine[lt] || []).sort((a, b) => a.column - b.column) }));
    return this.grid({ ...n, children }, rows);
  }

  repeat(n) {
    const kids = n.children || [];
    const ev = (t) => kids.filter((c) => c.kind === 'event' && c.attrs?.EVTYPE === t);
    const body = kids.filter((c) => c.kind !== 'event');
    const part = (list) => (n.kind === 'table46' && list.some((c) => c.tableCell) ? this.tableBody(n, list) : this.nodes(list));
    let html = ev('H').map((e) => part(e.children || [])).join('');
    for (let i = 0; i < this.rows; i++) { this.row = i; html += part(body); }
    this.row = 0;
    return html + ev('F').map((e) => part(e.children || [])).join('');
  }

  node(n) {
    if (n.condition && Object.keys(n.condition).some((k) => k !== 'firstPage' && k !== 'lastPage'))
      this.approx.push(`${n.name || n.kind}: printed only under a field condition — shown`);
    switch (n.kind) {
      case 'text': return this.text(n);
      case 'graphic': return this.graphic(n);
      case 'template': return this.template(n);
      case 'loop': case 'table46': return this.repeat(n);
      case 'condition': {
        this.approx.push(`${n.name}: alternative — first branch shown`);
        return n.children?.length ? this.node(n.children[0]) : '';
      }
      case 'address':
        this.approx.push(`${n.name}: address node — drawn as a box`);
        return `<div class="missing">address ${esc(n.caption || n.name)}</div>`;
      case 'code': case 'command': return '';
      default: return this.nodes(n.children);
    }
  }

  nodes(list) { return (list || []).map((n) => this.node(n)).join(''); }

  page() {
    const p = this.c.pages[0];
    if (this.c.pages.length > 1) this.approx.push(`form has ${this.c.pages.length} pages — first page drawn (${p.name})`);
    const landscape = p.orientation === 'landscape';
    const [w, h] = landscape ? [297, 210] : [210, 297];
    if (p.format && p.format !== 'DINA4') this.approx.push(`page format ${p.format} drawn as A4`);
    const body = p.windows.map((win) => `<div class="win${win.type === 'MAIN' ? ' main' : ''}" data-win="${esc(win.name)}" style="left:${win.leftMm}mm;top:${win.topMm}mm;width:${win.widthMm}mm;height:${win.heightMm}mm">${this.nodes(win.content)}</div>`).join('');
    let css = (this.c.styles || []).map((s) => s.css || '').join('\n');
    // a paragraph whose font is taller than its line spacing still needs room for the glyphs
    css = css.replace(/font-size : ([\d.]+)pt ;([^}]*?)line-height : ([\d.]+)mm/g, (m, pt, mid, lh) => {
      const need = Number(pt) * PT_MM * 1.15;
      return need > Number(lh) ? `font-size : ${pt}pt ;${mid}line-height : ${need.toFixed(2)}mm` : m;
    });
    return { w, h, html: `<!doctype html><html><head><meta charset="utf-8"><title>${esc(this.c.form)} preview</title><style>
@page{size:${w}mm ${h}mm;margin:0}
html,body{margin:0;background:#fff}
.sheet{position:relative;width:${w}mm;height:${h}mm;background:#fff;overflow:hidden}
.win{position:absolute;box-sizing:border-box}
.win img{display:block}
.row{display:flex;overflow:hidden}
.cell{box-sizing:border-box;overflow:hidden;flex:none}
.cell .par{white-space:nowrap;overflow:hidden}
.sym{color:#1a4f9c;background:#e8f0fb}
.val{background:#fff6c8}
.missing{font:8pt Arial,Helvetica,sans-serif;color:#b00;border:0.2mm dashed #b00;height:100%;box-sizing:border-box;padding:1mm}
${css}
</style></head><body><div class="sheet">${body}</div>
<script>(function(){var o=[];
document.querySelectorAll('.cell .par').forEach(function(p){if(p.scrollWidth>p.clientWidth+1)o.push({kind:'cell',node:p.dataset.node,text:p.textContent.trim()});});
document.querySelectorAll('.win').forEach(function(w){if(w.scrollHeight>w.clientHeight+2)o.push({kind:'window',node:w.dataset.win,text:'content '+Math.round(w.scrollHeight/w.clientHeight*100)+'% of the window height'});});
var e=document.createElement('script');e.type='application/json';e.id='sf-overflow';e.textContent=JSON.stringify(o);document.body.appendChild(e);})();</script>
</body></html>` };
  }
}

// ── browser ─────────────────────────────────────────────────────────────────────
function findBrowser() {
  const env = process.env.SC4SAP_CHROME || process.env.CHROME_PATH;
  const list = env ? [env] : process.platform === 'win32' ? [
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ] : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return list.find((p) => p && existsSync(p)) || null;
}

function runBrowser(browser, args, profileDir) {
  return spawnSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--user-data-dir=${profileDir}`, ...args], { encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024 });
}

// ── CLI ─────────────────────────────────────────────────────────────────────────
function arg(argv, name, dflt) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
}

function main(argv) {
  const [cmd, contentFile] = argv;
  if (!cmd || !contentFile || !existsSync(contentFile)) {
    console.error('usage: build-preview.mjs symbols <content.json> | build <content.json> --values <values.json> --out-dir <dir> [--rows N] [--no-jpg] [--mark]');
    process.exit(2);
  }
  const content = JSON.parse(readFileSync(contentFile, 'utf8'));
  if (cmd === 'symbols') { console.log(JSON.stringify(listSymbols(content), null, 1)); return; }
  if (cmd !== 'build') { console.error(`unknown command ${cmd}`); process.exit(2); }

  const valuesFile = arg(argv, '--values');
  const values = valuesFile ? JSON.parse(readFileSync(valuesFile, 'utf8')) : {};
  if (arg(argv, '--rows')) values.rows = Number(arg(argv, '--rows'));
  if (argv.includes('--mark')) values.mark = true;
  const outDir = resolve(arg(argv, '--out-dir', '.'));
  mkdirSync(outDir, { recursive: true });

  const r = new Renderer(content, values);
  const page = r.page();
  const base = join(outDir, `${content.form}-preview`);
  writeFileSync(`${base}.html`, page.html);

  const report = {
    html: `${base}.html`, jpg: null, rows: r.rows,
    filled: [...r.filled].sort(), unfilled: [...r.unfilled].sort(),
    overflow: [], approximations: [...new Set(r.approx)],
    defaultParagraph: r.defaultParaUsed ? (r.defaultPara || 'not set — browser default font') : 'not used',
  };
  const browser = findBrowser();
  if (!browser) {
    report.approximations.push('no Chrome / Edge / Chromium found (set SC4SAP_CHROME) — HTML only');
  } else {
    const profile = join(tmpdir(), 'sc4sap-smartform-preview-chrome');
    const url = pathToFileURL(`${base}.html`).href;
    const px = (mm) => Math.round((mm / 25.4) * 96);
    const size = `--window-size=${px(page.w)},${px(page.h)}`;
    const dom = runBrowser(browser, [size, '--dump-dom', url], profile);
    const m = /<script type="application\/json" id="sf-overflow">([\s\S]*?)<\/script>/.exec(dom.stdout || '');
    if (m) report.overflow = JSON.parse(m[1]);
    if (!argv.includes('--no-jpg')) {
      runBrowser(browser, [size, '--force-device-scale-factor=2', `--screenshot=${base}.jpg`, url], profile);
      if (existsSync(`${base}.jpg`)) report.jpg = `${base}.jpg`;
      else report.approximations.push('the browser wrote no JPG');
    }
  }
  console.log(JSON.stringify(report, null, 1));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));

export { listSymbols, Renderer, paragraphFonts };

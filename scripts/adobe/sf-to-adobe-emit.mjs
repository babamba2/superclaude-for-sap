// sc4sap:smartform-to-adobe — the predicted Adobe form of a SmartForm: the interface, context and layout (XDP) that
// CL_SSF_MIGRATION would write with every option on (`full`), so the adobe-preview renderer can draw it and the
// draw can be scored against the SmartForm's own SAP print. Read-only, no SAP call, no I/O in the functions.
//
//   emitMigration({ model, content, plan }) → { formXml, interfaceXml, layoutXdp, texts, notes }
//     model    loadSmartForm(<form>.xml)          plan  planMigration(model, { options: 'full' })
//     content  <form>.content.json (GetSmartFormContent): window boxes in mm, texts with their lines, SmartStyles,
//              table line types / cells, graphics (BMP files), include texts
//     images   { <graphic name>: base64 } the SE78 BMPs GetSmartFormContent wrote (the CLI reads them)
//     fieldTypes { 'WA_BOOKING-FLDATE': 'D', … } ABAP type kind per printed field (CL_FP_HELPER=>GET_PARAMETER_FROM_FIELD
//              answers it in SAP; here from the DDIC: DATS → D, TIMS → T, …) — '' / missing = not resolvable
//     texts    { <text module or include name>: [{ text, style }] } for the renderer's sample `texts`
//
// What follows SAP (sources read on ECC and S/4 DEV, identical):
// - texts: CL_SSF_XFA_XHTML — one <div> per paragraph with the CL_SSF_CSS paragraph CSS ("prop : value ;"), tab stops
//   as `tab-stop`, every ",," as <span style="xfa-tab-count : 1 ;"/>, character formats as <span> with their CSS,
//   every &field& as <span xfa:embed="PART.PART"/> to hidden fields (subform per leading part) bound with dataRef
// - windows: the main window flows into the content area of each page; the other windows are position subforms on
//   their page (pageArea), named <PAGE>_<WINDOW>; pages and their order from CONVERT_SF2XFT_PAGELIST
// - context: folder per window / text with bound fields, data nodes per field part, loops with their WHERE, loop data
//   named after the work area, folders with the data conditions
// Approximations (said in `notes`): table rows are one table per row with that line type's column widths; a loop's
// row subforms repeat through the loop data; templates use their line / cell grid; addresses print empty.

import { encodeName, pageList } from './sf-to-adobe-plan.mjs';

const FAMILY = { COURIER: 'Courier New', HELVE: 'Arial', TIMES: 'Times New Roman', LETGOTH: 'Letter Gothic', LNPRINT: 'Line Printer' };
const xesc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r3 = (v) => Math.round(v * 1000) / 1000;
const mm = (v) => `${r3(v)}mm`;

/** A SmartStyle measure ("1.00 LN", "12.00 PT", "2.00 CM", "3.00 MM", "1.00 CH", "0.50 IN") in mm. */
export function measureMm(text, { cpi = 10, lpi = 6 } = {}) {
  const m = /^\s*(-?[\d.]+)\s*([A-Z]*)\s*$/i.exec(String(text ?? ''));
  if (!m) return 0;
  const v = Number(m[1]);
  switch ((m[2] || 'CM').toUpperCase()) {
    case 'MM': return v;
    case 'CM': return v * 10;
    case 'IN': return v * 25.4;
    case 'PT': return v * 25.4 / 72;
    case 'TW': return v * 25.4 / 1440;
    case 'LN': return v * 25.4 / (Number(lpi) || 6);
    case 'CH': return v * 25.4 / (Number(cpi) || 10);
    default: return v * 10;
  }
}

/** CL_SSF_CSS=>DECL_PARAGRAPH (+ the tab stops of INT_DECL_TABSTOPS) as SAP renders it. */
export function paragraphCss(p, style = {}) {
  const d = [];
  const cpi = style.cpi, lpi = style.lpi;
  if (p.family) d.push(['font-family', `'${FAMILY[p.family] || p.family}'`]);
  if (p.size) d.push(['font-size', `${Number(p.size) / 10}pt`]);
  if (p.bold === 'X') d.push(['font-weight', 'bold']); else if (p.bold === '') d.push(['font-weight', 'normal']);
  if (p.italic === 'X') d.push(['font-style', 'italic']); else if (p.italic === '') d.push(['font-style', 'normal']);
  if (p.lineSpacing) d.push(['line-height', `${r3(measureMm(p.lineSpacing, { cpi, lpi }))}mm`]);
  if (p.underline === 'X') d.push(['text-decoration', 'underline']);
  d.push(['text-align', { RIGHT: 'right', CENTER: 'center', BLOCK: 'justify' }[p.align] || 'left']);
  for (const [k, prop] of [['left', 'margin-left'], ['right', 'margin-right'], ['before', 'margin-top'], ['after', 'margin-bottom']]) {
    const v = measureMm(p[k], { cpi, lpi });
    if (v) d.push([prop, `${r3(v)}mm`]);
  }
  d.push(['clear', 'both']);
  const tabs = (p.tabs || []).map(([pos, just]) => `${{ CENTER: 'center', DECIMAL: 'decimal', RIGHT: 'right', SIGN: 'right' }[just] || 'left'} ${String(r3(measureMm(pos, { cpi, lpi }) / 10)).replace(/\.0+$/, '')}cm`);
  if (tabs.length) d.push(['tab-stop', tabs.join(' ')]);
  return d.map(([k, v]) => `${k} : ${v} ;`).join(' ');
}

/** CL_SSF_CSS=>DECL_CHARFORMAT. */
export function charCss(s) {
  const d = [];
  if (s.family) d.push(['font-family', `'${FAMILY[s.family] || s.family}'`]);
  if (s.size) d.push(['font-size', `${s.size / 10}pt`]);
  if (s.bold === 'X') d.push(['font-weight', 'bold']); else if (s.bold === '') d.push(['font-weight', 'normal']);
  if (s.italic === 'X') d.push(['font-style', 'italic']); else if (s.italic === '') d.push(['font-style', 'normal']);
  if (s.underline === 'X') d.push(['text-decoration', 'underline']);
  return d.map(([k, v]) => `${k} : ${v} ;`).join(' ');
}

/**
 * ITF lines → XHTML <div>s and the fields they embed. `*` = the style's first paragraph, a paragraph tag = a new
 * paragraph, `/` = a new line in the same paragraph, `=` / blank format = continued text, `/*` = comment.
 */
export function itfToXhtml(lines, style) {
  const paras = style?.paragraphs || [];
  const strings = style?.strings || [];
  const firstPar = style?.firstParagraph || paras[0]?.tag || '';
  const fields = [];
  const out = [];
  let cur = null;
  const open = (tag) => {
    const p = paras.find((x) => x.tag === tag) || paras.find((x) => x.tag === firstPar) || {};
    cur = { css: paragraphCss(p, style || {}), html: '' };
    out.push(cur);
  };
  const inline = (text) => {
    let h = '';
    let depth = 0;
    const t = String(text ?? '');
    const re = /<\(>([\s\S]*?)<\)>|<\/>|<([A-Z0-9*]{1,2})>|,,|&(?:'([^']*)')?([^&'\s(]+)(?:\(([^)]*)\))?(?:'([^']*)')?&|([^<,&]+|[<,&])/g;
    let m;
    while ((m = re.exec(t))) {
      if (m[1] !== undefined) h += xesc(m[1]);
      else if (m[0] === '</>') { if (depth) { h += '</span>'; depth--; } }
      else if (m[2] !== undefined) { const s = strings.find((x) => x.tag === m[2]) || {}; h += `<span style="${xesc(charCss(s))}">`; depth++; }
      else if (m[0] === ',,') h += '<span style="xfa-tab-count : 1 ;"/>';
      else if (m[4] !== undefined) {
        const name = m[4].replace(/\+\d+$/, '').toUpperCase();
        if (m[3]) h += xesc(m[3]);
        const embed = name.replace(/^<(.*)>$/, 'X3C_$1').replace(/-/g, '.');
        h += `<span xfa:embed="${xesc(embed)}"/>`;
        if (!fields.some((f) => f.itf === name)) fields.push({ itf: name, embed, options: m[5] || '' });
        if (m[6]) h += xesc(m[6]);
      } else h += xesc(m[7]);
    }
    while (depth-- > 0) h += '</span>';
    return h;
  };
  for (const l of lines || []) {
    const f = l.format ?? '';
    if (f === '/*' || f === '/:') continue;
    if (f === '/') { if (!cur) open(firstPar); cur.html += `<br/>${inline(l.text)}`; continue; }
    if (f === '=' || f === '') { if (!cur) open(firstPar); cur.html += (f === '' && cur.html ? ' ' : '') + inline(l.text); continue; }
    open(f === '*' ? firstPar : f);
    cur.html += inline(l.text);
  }
  const html = out.map((p) => `<div style="${xesc(p.css)}">${p.html}</div>`).join('');
  return { html, fields };
}

// ── small XML writers ─────────────────────────────────────────────────────────────
class Heap {
  constructor() { this.objs = []; this.n = 0; }
  id() { return `o${++this.n}`; }
}

/** The predicted migration of one form (see the header). */
export function emitMigration({ model, content, plan, images = {}, fieldTypes = {}, texts: textsGiven = {} }) {
  const notes = new Set();
  const texts = {};
  const style0 = (name) => (content.styles || []).find((s) => s.name === name) || (content.styles || []).find((s) => (content.stdStyles || []).includes(s.name)) || content.styles?.[0];

  // ── context tree (CL_FP_* nodes) ──
  const ctxRoot = { cls: 'CL_FP_CONTEXT', name: 'CONTEXT', children: [] };
  const cnode = (parent, cls, name, extra = {}) => { const n = { cls, name, children: [], ...extra }; parent.children.push(n); return n; };
  const pathOf = (n) => { const p = []; for (let x = n; x && x !== ctxRoot; x = x.parent) p.unshift(x.cls === 'CL_FP_LOOP_DATA' && x !== n ? `${x.name}[*]` : x.name); return p; };
  const cnodeP = (parent, cls, name, extra) => { const n = cnode(parent, cls, name, extra); n.parent = parent; return n; };

  // ── layout writer ──
  const W = (s) => s;
  const condRows = (cond) => (cond?.COND || []).map((c) => ({ lop: c.LOP || '', op1: c.OP1 || '', cop: c.COP || '', op2: c.OP2 || '' }));

  const loops = []; // active loops: { wa, ctx (loop-data), path }
  const bindOf = (field, holder) => {
    const up = field.toUpperCase();
    const parts = up.split('-');
    const lp = loops.find((l) => parts[0] === l.wa);
    if (lp) {
      // a field of the loop's work area: bound through the loop data, one instance per row
      if (!lp.ctx.children.some((c) => c.name === encodeName(parts[parts.length - 1]))) cnodeP(lp.ctx, 'CL_FP_DATA', encodeName(parts[parts.length - 1]), { field: up });
      return `$record.${[...pathOf(lp.loop), ...parts.map((x) => (x === lp.wa ? `${lp.dataName}[*]` : encodeName(x)))].join('.')}`;
    }
    // folders for the leading parts, data for the last one, under the text's folder
    let p = holder;
    for (const part of parts.slice(0, -1)) p = p.children.find((c) => c.name === part && c.cls === 'CL_FP_FOLDER') || cnodeP(p, 'CL_FP_FOLDER', part);
    const leaf = encodeName(parts[parts.length - 1]);
    if (!p.children.some((c) => c.name === leaf)) cnodeP(p, 'CL_FP_DATA', leaf, { field: up });
    return `$record.${[...pathOf(p), leaf].join('.')}`;
  };

  // GET_XFT_FIELD_TYPE: system fields get their own type; an interface field its ABAP type kind
  const SYSTEM = { 'SFSY-DATE': 'date', 'SY-DATUM': 'date', 'SFSY-TIME': 'time', 'SY-UZEIT': 'time', 'SFSY-PAGE': 'page', 'SFSY-FORMPAGES': 'pages', SPACE: 'space' };
  const typeOf = (itf) => SYSTEM[itf] || fieldTypes[itf] || '';
  // a field without a type: SAP still binds the hidden field (bind ref from the first loop), but creates no context data
  const refOnly = (itf, holder) => {
    const parts = itf.split('-');
    const lp = loops.find((l) => parts[0] === l.wa);
    if (lp) return `$record.${[...pathOf(lp.loop), ...parts.map((x) => (x === lp.wa ? `${lp.dataName}[*]` : encodeName(x)))].join('.')}`;
    notes.add(`field ${itf}: type not known (no DDIC answer) — no context data, prints empty`);
    return `$record.${[...pathOf(holder), ...parts.map(encodeName)].join('.')}`;
  };
  // SET_XFT_FIELD_PROPERTIES: date / time pictures by initialize script, current date / time / page numbers by script
  const hiddenField = (name, v) => {
    const t = typeOf(v.itf);
    const bind = v.leaf ? `<bind match="dataRef" ref="${xesc(v.leaf)}"/>` : '<bind match="none"/>';
    const init = (lines) => `<event activity="initialize"><script contentType="application/x-formcalc">${xesc(lines.join('\n'))}</script></event>`;
    const ready = (js) => `<event activity="ready" ref="$layout"><script contentType="application/x-javascript">${xesc(js)}</script></event>`;
    let ev = '';
    if (t === 'D') ev = init(['$.format.picture = DateFmt(1, $.locale);', '$.ui.picture = DateFmt(2, $.locale);', '$.assist.toolTip.oneOfChild.value = LocalDateFmt(2, $.locale);']);
    else if (t === 'date') ev = init(['$.format.picture = DateFmt(2, $.locale);', '$.ui.picture = DateFmt(2, $.locale);', '$.assist.toolTip.oneOfChild.value = LocalDateFmt(2, $.locale);', '$ = Num2Date( date(), $.format.picture );']);
    else if (t === 'T') ev = init(['$.format.picture = TimeFmt(2, $.locale);', '$.ui.picture = TimeFmt(2, $.locale);', '$.assist.toolTip.oneOfChild.value = LocalTimeFmt(2, $.locale);']);
    else if (t === 'time') ev = init(['$.format.picture = TimeFmt(2, $.locale);', '$.ui.picture = TimeFmt(2, $.locale);', '$.assist.toolTip.oneOfChild.value = LocalTimeFmt(2, $.locale);', '$ = Num2time( time(), $.format.picture );']);
    else if (t === 'page') ev = ready('this.rawValue = xfa.layout.page(this)');
    else if (t === 'pages') ev = ready('this.rawValue = xfa.layout.pageCount()');
    return `<field name="${xesc(name)}" presence="hidden"><ui><textEdit/></ui>${bind}${ev}</field>`;
  };

  // hidden field declarations next to a draw: subform per leading part, field for the last part
  const fieldDecls = (fields, holder) => {
    const tree = {};
    for (const f of fields) {
      const parts = f.embed.split('.');
      let t = tree;
      parts.forEach((p, i) => { if (i === parts.length - 1) t[p] = { leaf: SYSTEM[f.itf] ? '' : (typeOf(f.itf) ? bindOf(f.itf, holder) : refOnly(f.itf, holder)), itf: f.itf }; else t = (t[p] ||= {}); });
    }
    const w = (t) => Object.entries(t).map(([k, v]) => (v.leaf !== undefined
      ? hiddenField(k, v)
      : `<subform name="${xesc(k)}">${w(v)}</subform>`)).join('');
    return w(tree);
  };

  const textDraw = (n, cParent, widthMm, styleName) => {
    const st = style0(n.style || styleName);
    const { html, fields } = itfToXhtml(n.lines || [], st);
    const name = encodeName(n.name);
    let holder = cParent;
    if (fields.length) holder = cnodeP(cParent, 'CL_FP_FOLDER', name);
    const decl = fields.length ? fieldDecls(fields, holder) : '';
    const draw = `<draw name="${xesc(name)}" w="${mm(widthMm)}" minH="0mm"><ui><textEdit/></ui><value><exData contentType="text/html"><body xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">${html}</body></exData></value><margin topInset="0mm" bottomInset="0mm" leftInset="0mm" rightInset="0mm"/></draw>`;
    return `<subform name="${xesc(name)}" w="${mm(widthMm)}" layout="tb">${decl}${draw}</subform>`;
  };

  const refText = (n, cParent, widthMm) => {
    // text module / include text: a context text node, a field bound to it
    const name = encodeName(n.name);
    const key = (n.textType === 'reference' ? n.attrs?.REF_NAME : '') || n.include?.name || n.attrs?.REF_NAME || n.name;
    const cls = n.textType === 'include' ? 'CL_FP_INCLUDE_TEXT' : 'CL_FP_TEXT_MODULE';
    cnodeP(cParent, cls, name, { textName: key, style: n.style || '' });
    const inc = (content.includeTexts || []).find((t) => t.name === key && Array.isArray(t.lines));
    if (inc && !texts[key]) { const st = style0(n.style); texts[key] = { itf: inc.lines, formats: Object.fromEntries((st?.paragraphs || []).map((p) => [p.tag, p])) }; }
    if (!inc && !textsGiven[key]) notes.add(`text ${key}: no lines in the content (text module or a text that was not read) — prints empty`);
    return `<field name="${xesc(name)}" w="${mm(widthMm)}" minH="0mm"><ui><textEdit/></ui><margin topInset="0mm" bottomInset="0mm" leftInset="0mm" rightInset="0mm"/><bind match="dataRef" ref="$record.${xesc([...pathOf(cParent), name].join('.'))}"/></field>`;
  };

  const graphicOf = (n) => (content.graphics || []).find((g) => g.name === n.graphic?.name);

  // the content of one window / container, flowing top to bottom
  const flow = (nodes, cParent, widthMm, ctxStyle, section) => nodes.map((n) => node(n, cParent, widthMm, ctxStyle, section)).join('');

  const node = (n, cParent, widthMm, styleName, section) => {
    const k = n.kind;
    if (k === 'code') return '';
    if (k === 'text') {
      if (n.textType === 'inline' || !n.textType) return textDraw(n, cParent, widthMm, styleName);
      return refText(n, cParent, widthMm);
    }
    if (k === 'graphic') {
      const g = graphicOf(n);
      cnodeP(cParent, 'CL_FP_GRAPHIC_URL', encodeName(n.name));
      if (!g?.file) { notes.add(`graphic ${n.name}: no fixed key / file — empty`); return ''; }
      notes.add(`graphic ${n.name}: drawn from the SE78 BMP (SAP links the MIME copy of the BDS graphic)`);
      const b64 = images[g.name];
      if (!b64) { notes.add(`graphic ${n.name}: image data not given — empty box`); return `<draw name="${xesc(encodeName(n.name))}" w="${mm(g.widthMm)}" h="${mm(g.heightMm)}"/>`; }
      return `<draw name="${xesc(encodeName(n.name))}" w="${mm(g.widthMm)}" h="${mm(g.heightMm)}"><value><image contentType="image/bmp" aspect="none">${b64}</image></value></draw>`;
    }
    if (k === 'address') { cnodeP(cParent, 'CL_FP_ADDRESS', encodeName(n.name)); notes.add(`address ${n.name}: prints empty (no address data in a preview)`); return ''; }
    if (k === 'event') {
      const ev = n.attrs?.EVTYPE;
      const inner = flow(n.children || [], cParent, widthMm, styleName, section);
      if (ev === 'H' && section) section.header.push(inner);
      else if (ev === 'F' && section) section.footer.push(inner);
      else if (ev === 'B' && section) section.body.push(inner);
      else if (section) section.body.push(inner); // sort begin / end: flattened into the body (MIGRATE: WHEN OTHERS)
      else return inner;
      return '';
    }
    if (k === 'loop' || k === 'table46' || k === 'section-C' || k === 'section-T') {
      const wa = String(n.attrs?.TABHEADER || n.workArea || '').toUpperCase() || `${n.name}_WA`;
      const loop = cnodeP(cParent, 'CL_FP_LOOP', encodeName(n.name), { table: n.dataTable || '', workArea: wa, where: condRows({ COND: n.where || [] }) });
      const dataName = encodeName(wa);
      const ld = cnodeP(loop, 'CL_FP_LOOP_DATA', dataName);
      loops.unshift({ wa, ctx: ld, loop, dataName });
      const sec = { header: [], body: [], footer: [], lineTypes: n.lineTypes?.length ? n.lineTypes : (section?.lineTypes || []), cells: n.cells?.length ? n.cells : (section?.cells || []) };
      const own = flow(n.children || [], ld, widthMm, styleName, sec);
      loops.shift();
      const rows = `<subform name="${xesc(dataName)}" layout="tb" w="${mm(widthMm)}"><occur min="0" max="-1"/><bind match="dataRef" ref="$record.${xesc([...pathOf(loop), dataName].join('.'))}[*]"/>${sec.body.join('')}${own}</subform>`;
      const lead = sec.header.length ? `<subform name="${xesc(encodeName(n.name))}-header" layout="tb" w="${mm(widthMm)}">${sec.header.join('')}</subform>` : '';
      const trail = sec.footer.length ? `<subform name="${xesc(encodeName(n.name))}-footer" layout="tb" w="${mm(widthMm)}">${sec.footer.join('')}</subform>` : '';
      if (k !== 'loop') notes.add(`table ${n.name}: rows as one table per row with the line type's column widths`);
      return `<subform name="${xesc(encodeName(n.name))}" layout="tb" w="${mm(widthMm)}">${lead}${rows}${trail}</subform>`;
    }
    if (k === 'section-R') {
      const lt = n.output?.T_LINETYPE || '';
      const cells = (section?.cells || []).filter((c) => c.line === lt);
      const folder = n.condition ? cnodeP(cParent, 'CL_FP_FOLDER', encodeName(n.name), { conditions: condRows(n.condition) }) : null;
      const cellNodes = (n.children || []).filter((c) => c.kind === 'section-E');
      const html = cellNodes.map((c, i) => {
        const cw = cells[i]?.widthMm ?? widthMm / Math.max(1, cellNodes.length);
        const b = cells[i]?.borders || {};
        const edges = ['top', 'right', 'bottom', 'left'].map((e) => (b[e] ? `<edge thickness="${mm(b[e])}"/>` : '<edge presence="hidden"/>')).join('');
        const fill = cells[i]?.fill ? `<fill><color value="${hexRgb(cells[i].fill)}"/></fill>` : '';
        return `<subform name="${xesc(encodeName(c.name))}" layout="tb" w="${mm(cw)}"><border>${edges}${fill}</border>${flow(c.children || [], folder || cParent, cw, styleName, null)}</subform>`;
      }).join('');
      const cols = cellNodes.map((c, i) => mm(cells[i]?.widthMm ?? widthMm / Math.max(1, cellNodes.length))).join(' ');
      const occ = folder ? `<bind match="dataRef" ref="$record.${xesc(pathOf(folder).join('.'))}"/><occur min="0" max="1"/>` : '';
      return `<subform name="${xesc(encodeName(n.name))}" layout="table" columnWidths="${cols}" w="${mm(widthMm)}">${occ}<subform layout="row" name="${xesc(encodeName(n.name))}_R">${html}</subform></subform>`;
    }
    if (k === 'section-E') return flow(n.children || [], cParent, widthMm, styleName, null);
    if (k === 'section-F' || k === 'folder' || k === 'section-S' || k === 'template' || k === 'alternative' || k === 'condition') {
      const folder = cnodeP(cParent, 'CL_FP_FOLDER', encodeName(n.name), n.condition ? { conditions: condRows(n.condition) } : {});
      if (k === 'section-S' || k === 'template') notes.add(`template ${n.name}: content in flow, without the cell grid`);
      if (k === 'alternative' || k === 'condition') notes.add(`alternative ${n.name}: both branches in flow`);
      return `<subform name="${xesc(encodeName(n.name))}" layout="tb" w="${mm(widthMm)}">${flow(n.children || [], folder, widthMm, styleName, section)}</subform>`;
    }
    notes.add(`node kind ${k} (${n.name}) not drawn`);
    return '';
  };

  // ── pages and windows ──
  const pages = content.pages || [];
  const list = pageList(model.pages.map((p) => ({ name: p.name, next: p.next })));
  const mainBox = (p) => p.windows.find((w) => w.typeCode === 'M' || w.type === 'MAIN') || pages.flatMap((x) => x.windows).find((w) => w.typeCode === 'M');
  const mainDef = pages.flatMap((p) => p.windows).find((w) => (w.typeCode === 'M' || w.type === 'MAIN') && (w.content || []).length);
  // a window drawn again on a later page has no name / content in content.json: take the first page's window at the same box
  const resolveWin = (w) => {
    if (w.name) return w;
    return pages.flatMap((p) => p.windows).find((x) => x.name && x.leftMm === w.leftMm && x.topMm === w.topMm && (x.content || []).length) || w;
  };
  const winCtx = {};
  const pageXml = (p) => {
    const m = mainBox(p);
    const ca = m ? `<contentArea name="${xesc(encodeName(m.name || 'MAIN'))}" x="${mm(m.leftMm)}" y="${mm(m.topMm)}" w="${mm(m.widthMm)}" h="${mm(m.heightMm)}"/>` : '<contentArea x="0mm" y="0mm" w="1mm" h="1mm"/>';
    const others = p.windows.filter((w) => !(w.typeCode === 'M' || w.type === 'MAIN') && !(w.type === 'WINDOW' && resolveWin(w) === w && !w.name)).map((w0) => {
      const w = resolveWin(w0);
      if (w.typeCode === 'M' || w.type === 'MAIN') return '';
      const name = `${encodeName(p.name)}_${encodeName(w.name)}`;
      const folder = cnodeP(ctxRoot, 'CL_FP_FOLDER', name, w.condition ? { conditions: condRows(w.condition) } : {});
      winCtx[name] = folder;
      const width = w.widthMm ?? (graphicOf((w.content || [])[0] || {})?.widthMm || 50);
      const body = flow(w.content || [], folder, width, p.stdStyle || content.stdStyles?.[0], null);
      return `<subform name="${xesc(name)}" x="${mm(w0.leftMm)}" y="${mm(w0.topMm)}" w="${mm(width)}"${w0.heightMm ? ` h="${mm(w0.heightMm)}"` : ''} layout="tb">${body}</subform>`;
    }).join('');
    const stock = { DINA4: 'a4', DINA3: 'a3', DINA5: 'a5', LETTER: 'letter', LEGAL: 'legal' }[p.format] || 'a4';
    const [s, l] = stock === 'letter' ? [215.9, 279.4] : stock === 'legal' ? [215.9, 355.6] : stock === 'a3' ? [297, 420] : stock === 'a5' ? [148, 210] : [210, 297];
    return { ca, others, medium: `<medium stock="${stock}" short="${s}mm" long="${l}mm"${p.orientation === 'landscape' ? ' orientation="landscape"' : ''}/>` };
  };
  let pageSet = '';
  const stack = [];
  for (const e of list) {
    if (e.el === 'pageSet') { pageSet += `<pageSet><occur min="${e.min}" max="${e.max}"/>`; stack.push(1); }
    else if (e.el === '/pageSet') { pageSet += '</pageSet>'; stack.pop(); }
    else {
      const p = pages.find((x) => encodeName(x.name) === e.name);
      if (!p) continue;
      const x = pageXml(p);
      pageSet += `<pageArea name="${xesc(e.name)}" id="${xesc(e.name)}"><occur min="${e.min}" max="${e.max}"/>${x.ca}${x.medium}${x.others}</pageArea>`;
    }
  }
  const mainFolder = mainDef ? cnodeP(ctxRoot, 'CL_FP_FOLDER', encodeName(mainDef.name)) : null;
  const mainFlow = mainDef ? `<subform name="${xesc(encodeName(mainDef.name))}" layout="tb" w="${mm(mainDef.widthMm)}">${flow(mainDef.content || [], mainFolder, mainDef.widthMm, content.stdStyles?.[0], null)}</subform>` : '';
  const layoutXdp = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Predicted layout of the SAP migration of ${xesc(model.form)} (sc4sap smartform-to-adobe, not SAP's own output). -->
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/"><subform name="${xesc(encodeName(model.form))}" layout="tb">${pageSet}${mainFlow}</subform></template></xdp:xdp>
`;

  // ── context (asx:abap heap of the SFP form download) ──
  const heap = [];
  let seq = 0;
  const ids = new Map();
  const assign = (n) => { ids.set(n, `o${++seq}`); for (const c of n.children) assign(c); };
  assign(ctxRoot);
  const cond = (n) => {
    if (!n.conditions?.length) return '<CONDITION/>';
    const cid = `c${ids.get(n).slice(1)}`;
    heap.push(`<cls:CL_FP_CONDITION id="${cid}"><CL_FP_CONDITION><NODE href="#${ids.get(n)}"/><CONDITIONS>${n.conditions.map((c) => `<SFPCONDITION><LOPERATOR>${xesc(c.lop)}</LOPERATOR><OPERAND1>${xesc(c.op1)}</OPERAND1><COPERATOR>${xesc(c.cop)}</COPERATOR><OPERAND2>${xesc(c.op2)}</OPERAND2></SFPCONDITION>`).join('')}</CONDITIONS></CL_FP_CONDITION></cls:CL_FP_CONDITION>`);
    return `<CONDITION href="#${cid}"/>`;
  };
  const write = (n, parent, next) => {
    const id = ids.get(n);
    const head = `<CL_FP_NODE><NAME>${xesc(n.name)}</NAME><STATE>A</STATE>${cond(n)}${parent ? `<PARENT href="#${ids.get(parent)}"/>` : '<PARENT/>'}${next ? `<SUCCESSOR href="#${ids.get(next)}"/>` : '<SUCCESSOR/>'}${n.children[0] ? `<CHILD href="#${ids.get(n.children[0])}"/>` : '<CHILD/>'}</CL_FP_NODE>`;
    let own = `<${n.cls}/>`;
    if (n.cls === 'CL_FP_DATA') own = `<CL_FP_DATA><FIELD>${xesc(n.field)}</FIELD></CL_FP_DATA>`;
    if (n.cls === 'CL_FP_LOOP') {
      let w = '<WHERE_CONDITION/>';
      if (n.where?.length) { const wid = `w${id.slice(1)}`; heap.push(`<cls:CL_FP_CONDITION id="${wid}"><CL_FP_CONDITION><NODE href="#${id}"/><CONDITIONS>${n.where.map((c) => `<SFPCONDITION><LOPERATOR>${xesc(c.lop)}</LOPERATOR><OPERAND1>${xesc(c.op1)}</OPERAND1><COPERATOR>${xesc(c.cop)}</COPERATOR><OPERAND2>${xesc(c.op2)}</OPERAND2></SFPCONDITION>`).join('')}</CONDITIONS></CL_FP_CONDITION></cls:CL_FP_CONDITION>`); w = `<WHERE_CONDITION href="#${wid}"/>`; }
      own = `<CL_FP_LOOP><TABLE_NAME>${xesc(n.table)}</TABLE_NAME><LOOP_INTO>X</LOOP_INTO><WORK_AREA>${xesc(n.workArea)}</WORK_AREA><FIRST_LINE>0000000000</FIRST_LINE><LAST_LINE>0000000000</LAST_LINE>${w}</CL_FP_LOOP>`;
    }
    if (n.cls === 'CL_FP_TEXT_MODULE' || n.cls === 'CL_FP_INCLUDE_TEXT') own = `<CL_FP_TEXT><APPEND_MODE>P</APPEND_MODE></CL_FP_TEXT><${n.cls}><STYLE_NAME>${xesc(n.style)}</STYLE_NAME><TEXT_NAME><NAME>${xesc(n.textName)}</NAME><NAMEFIELD/></TEXT_NAME><TEXT_STYLE>X</TEXT_STYLE></${n.cls}>`;
    heap.push(`<cls:${n.cls} id="${id}">${head}${own}</cls:${n.cls}>`);
    n.children.forEach((c, i) => write(c, n, n.children[i + 1]));
  };
  write(ctxRoot, null, null);
  const formXml = `<?xml version="1.0" encoding="utf-8"?><!-- Predicted context of the SAP migration of ${xesc(model.form)} (sc4sap, not SAP's own output). --><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><VERSION>1</VERSION><INTERFACE>${xesc(plan.names.interface)}</INTERFACE><CONTEXT href="#o1"/></asx:values><asx:heap xmlns:cls="http://www.sap.com/abapxml/classes/global">
${heap.join('\n')}
</asx:heap></asx:abap>
`;

  // ── interface (SFP interface download) ──
  const par = (p) => `<SFPIOPAR><NAME>${xesc(p.name)}</NAME><TYPING>${xesc(p.typing || 'TYPE')}</TYPING><TYPENAME>${xesc(p.type)}</TYPENAME>${p.optional ? '<OPTIONAL>X</OPTIONAL>' : ''}</SFPIOPAR>`;
  const I = model.interface;
  const interfaceXml = `<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><VERSION>1</VERSION><INTERFACE href="#o1"/></asx:values><asx:heap xmlns:cls="http://www.sap.com/abapxml/classes/global">
<cls:CL_FP_INTERFACE_DATA id="o1"><CL_FP_INTERFACE_DATA><PARAMETERS href="#o2"/><GLOBAL_DEFINITIONS href="#o3"/></CL_FP_INTERFACE_DATA></cls:CL_FP_INTERFACE_DATA>
<cls:CL_FP_PARAMETERS id="o2"><CL_FP_PARAMETERS><IMPORT_PARAMETERS>${I.import.map(par).join('')}</IMPORT_PARAMETERS><EXPORT_PARAMETERS>${I.export.map(par).join('')}</EXPORT_PARAMETERS><TABLE_PARAMETERS>${I.tables.map(par).join('')}</TABLE_PARAMETERS></CL_FP_PARAMETERS></cls:CL_FP_PARAMETERS>
<cls:CL_FP_GLOBAL_DEFINITIONS id="o3"><CL_FP_GLOBAL_DEFINITIONS><GLOBAL_DATA>${model.globals.data.map((d) => `<SFPGDATA><NAME>${xesc(d.name)}</NAME><TYPING>${xesc(d.typing || 'TYPE')}</TYPING><TYPENAME>${xesc(d.type)}</TYPENAME></SFPGDATA>`).join('')}</GLOBAL_DATA></CL_FP_GLOBAL_DEFINITIONS></cls:CL_FP_GLOBAL_DEFINITIONS>
</asx:heap></asx:abap>
`;
  return { formXml, interfaceXml, layoutXdp, texts, notes: [...notes] };
}

const hexRgb = (hex) => { const h = String(hex).replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(','); };

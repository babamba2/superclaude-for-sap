// sc4sap:smartform-to-adobe — inventory of a SmartForm: every node of the form, counted by kind (read-only, no SAP
// call, no I/O in the functions).
//
// INPUT  the SmartForm XML that GetSmartFormContent writes next to <form>.content.json (smartforms/<form>/<form>.xml;
//        the Form Builder's own XML, the same structure CL_SSF_FB_SMART_FORM loads before a migration). The XML
//        holds what content.json leaves out: code nodes, calculations / sort of tables, commands, output options.
//
//   parseXml(text)            → element tree { tag, attrs, children, text } (the subset the SmartForm XML uses)
//   loadSmartForm(xmlText)    → { form, formType, caption, interface, globals, pageFormat, cpi, lpi, style, pages,
//                                 root, nodes, byId } — root: the page tree; nodes: every node object once, in tree
//                                 order; a window that a later page shows again (IDREF) is one node with `pages`
//   inventory(model)          → { form, formType, counts { <kind>: n }, nodes: [{ id, kind, name, path, … }],
//                                 interface { import, export, tables, exceptions }, symbols, pages }
//
// Node kinds follow the SmartForm node types (RSTXSFCDEF): page-root, page, window-<main|secondary|graphic|address|
// copies|final>, control-root, text-element, text-include, text-module, text-dynamic, text-other, graphic, address,
// command, code, alternative, folder, loop, table46, template, ctable, row, cell, section-complex, event-<header|body|
// footer|true|false|sort-begin|sort-end|other>, reference, unknown.
//
// CLI  node sf-inventory.mjs <form.xml>   → the inventory as JSON on stdout

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unent = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
  : ENT[e] ?? m));

/** A small XML reader: elements, attributes, text, self-closing tags; declarations, comments and CDATA. */
export function parseXml(text) {
  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) {
      if (top.tag !== m[2]) throw new Error(`XML: </${m[2]}> closes <${top.tag}>`);
      stack.pop();
    } else if (m[3]) {
      const attrs = {};
      for (const a of (m[4] || '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unent(a[2] ?? a[3]);
      const el = { tag: m[3], attrs, children: [], text: '' };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.text += unent(m[6]);
  }
  if (stack.length !== 1) throw new Error(`XML: <${stack[stack.length - 1].tag}> is not closed`);
  return root;
}

const kids = (el, tag) => (el?.children || []).filter((c) => c.tag === tag);
const kid = (el, tag) => (el?.children || []).find((c) => c.tag === tag);
const val = (el, tag) => (kid(el, tag)?.text ?? '').trim();
const items = (el, tag) => kids(kid(el, tag), 'item').concat(kids(kid(el, tag), 'sf:item'));
const rec = (el) => Object.fromEntries((el?.children || []).filter((c) => !c.children.length).map((c) => [c.tag, c.text.trim()]));

const WTYPE = { M: 'main', T: 'secondary', G: 'graphic', A: 'address', C: 'copies', L: 'final' };
const SECT = { F: 'folder', L: 'loop', T: 'table46', S: 'template', C: 'ctable', R: 'row', E: 'cell', '': 'section-complex' };
const TTYPE = { '': 'text-element', I: 'text-include', R: 'text-module', D: 'text-dynamic' };
const EVT = { H: 'event-header', B: 'event-body', F: 'event-footer', '+': 'event-true', '-': 'event-false', S: 'event-sort-begin', E: 'event-sort-end' };
const IO = { I: 'import', E: 'export', T: 'tables', X: 'exceptions' };

/** &symbol& names of ITF lines (outside '&&'), without output options. */
export function symbolsOf(lines) {
  const out = [];
  for (const l of lines) {
    if (l.format === '/*') continue;
    // <(>…<)> protects its content (a literal '&'); &'pre'NAME(options)'post'& prints NAME between two texts
    const text = String(l.text || '').replace(/<\(>[\s\S]*?<\)>/g, ' ');
    for (const m of text.matchAll(/&(?:'[^']*')?([^&'\s(]+)(?:\([^)]*\))?(?:'[^']*')?&/g)) {
      const name = m[1].replace(/\+\d+$/, '').trim();
      if (name && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

function condOf(nodeEl) {
  const c = kid(kid(nodeEl, 'sf:COND'), 'sf:CONDITION');
  if (!c) return null;
  const cond = items(c, 'COND').map(rec);
  const ocondEl = kid(c, 'OCOND');
  const ocond = ocondEl ? rec(ocondEl) : {};
  return { name: val(kid(c, 'NAME'), 'INAME'), data: cond, layout: ocond };
}

function outattrOf(nodeEl) {
  const o = kid(kid(nodeEl, 'sf:OUTATTR'), 'sf:OUTATTR');
  if (!o) return null;
  const r = rec(o);
  const border = kid(o, 'BORDER');
  const lines = border ? ['TOPLINE', 'BOTTOMLINE', 'LEFTLINE', 'RIGHTLINE'].filter((k) => val(border, k)) : [];
  return { name: val(kid(o, 'NAME'), 'INAME'), stdStyle: r.STDSTYLE || '', lineType: r.T_LINETYPE || '', cellNr: r.T_CELLNR || '',
    lineNr: r.T_LINENR || '', newLine: r.T_NEWLINE === 'X', newCell: r.T_NEWCELL === 'X', borderLines: lines, shading: !!kid(o, 'WSHADING') || !!r.WSHADING,
    box: { left: r.WLEFT || '', top: r.WTOP || '', width: r.WWIDTH || '', height: r.WHEIGHT || '' } };
}

/** The form model from the SmartForm XML (see the header). */
export function loadSmartForm(xmlText) {
  const doc = parseXml(xmlText);
  const sf = kid(doc, 'sf:SMARTFORM');
  if (!sf) throw new Error('not a SmartForm XML (no sf:SMARTFORM element)');
  const head = kid(sf, 'HEADER');
  const formType = { '': 'form', T: 'text-module', P: 'page', W: 'window', C: 'control' }[val(head, 'FORMTYPE')] || `type-${val(head, 'FORMTYPE')}`;
  const iface = { import: [], export: [], tables: [], exceptions: [] };
  for (const it of items(sf, 'INTERFACE')) {
    const r = rec(it);
    (iface[IO[r.IOTYPE]] || (iface.other ||= [])).push({ name: r.NAME, typing: r.TYPING || '', type: r.TYPENAME || '', optional: r.OPTIONAL === 'X', standard: r.STANDARD === 'X' });
  }
  const globals = {
    data: items(sf, 'GDATA').map(rec).filter((r) => r.NAME).map((r) => ({ name: r.NAME, typing: r.TYPING || '', type: r.TYPENAME || '' })),
    typesLines: items(sf, 'GTYPES').length, fieldSymbols: items(sf, 'FSYMBOLS').map(rec).filter((r) => r.NAME).length,
    initLines: items(sf, 'GCODING').length, formRoutineLines: items(sf, 'FCODING').length,
    initParams: items(sf, 'GPLIST').map(rec).filter((r) => r.OPD).map((r) => ({ name: r.OPD, dir: r.OUTIN })),
    refFields: items(sf, 'REFFIELDS').length,
  };
  const vh = kid(kid(sf, 'sf:VARHEADER'), 'sf:item') || kid(sf, 'sf:VARHEADER');
  const model = { form: val(head, 'FORMNAME'), formType, caption: val(head, 'CAPTION'), interface: iface, globals,
    pageFormat: val(vh, 'PAGEFORMAT'), cpi: val(vh, 'CPI'), lpi: val(vh, 'LPI'), style: val(vh, 'STDSTYLE'), pages: [], root: null, nodes: [], byId: new Map() };

  // text modules (FORMTYPE T) keep their one text node outside a page tree
  const objById = new Map();
  let seq = 0;
  const walk = (nodeEl, parent, ctx) => {
    const type = val(nodeEl, 'NODETYPE');
    const objWrap = kid(nodeEl, 'sf:OBJ');
    let obj = objWrap?.children?.[0] || null;
    let ref = false;
    if (obj?.attrs?.IDREF) { ref = true; obj = objById.get(obj.attrs.IDREF.trim()) || obj; }
    else if (obj?.attrs?.ID) objById.set(obj.attrs.ID.trim(), obj);
    const name = val(kid(obj, 'NAME'), 'INAME');
    let kind;
    if (type === 'RP') kind = 'page-root';
    else if (type === 'PA') kind = 'page';
    else if (type === 'WI') kind = `window-${WTYPE[val(obj, 'WTYPE')] || 'secondary'}`;
    else if (type === 'RC') kind = 'control-root';
    else if (type === 'TI') kind = TTYPE[val(obj, 'TTYPE')] || 'text-other';
    else if (type === 'GR') kind = 'graphic';
    else if (type === 'AD') kind = 'address';
    else if (type === 'CM') kind = 'command';
    else if (type === 'CO') kind = 'code';
    else if (type === 'CD') kind = 'alternative';
    else if (type === 'SE') kind = SECT[val(obj, 'SECTTYPE')] || `section-${val(obj, 'SECTTYPE')}`;
    else if (type === 'EV') kind = EVT[val(obj, 'EVTYPE')] || 'event-other';
    else if (type === 'RE') kind = 'reference';
    else kind = 'unknown';
    // a window shown again on a later page: the same object, counted once
    if (ref && type === 'WI') {
      const first = model.nodes.find((n) => n.obj === obj);
      const occ = { id: `n${++seq}`, kind, name, ref: first?.id || '', parent: parent?.id || '', page: ctx.page, outattr: outattrOf(nodeEl), cond: condOf(nodeEl), children: [], obj };
      if (first) first.pages.push(ctx.page);
      parent?.children.push(occ);
      model.byId.set(occ.id, occ);
      return occ;
    }
    const node = { id: `n${++seq}`, kind, nodetype: type, name, caption: val(obj, 'CAPTION'), parent: parent?.id || '',
      page: ctx.page, window: ctx.window, path: [...ctx.path, name || kind].join('/'), outattr: outattrOf(nodeEl), cond: condOf(nodeEl),
      attrs: attrsOf(kind, obj), children: [], obj, pages: type === 'WI' ? [ctx.page] : undefined };
    model.nodes.push(node);
    model.byId.set(node.id, node);
    parent?.children.push(node);
    const next = { ...ctx, path: [...ctx.path, name || kind] };
    if (type === 'PA') { next.page = name; model.pages.push({ name, next: val(kid(obj, 'NEXTPAGE'), 'INAME'), orientation: val(obj, 'PAGEORTN') || 'P', node: node.id }); }
    if (type === 'WI') { next.window = name; for (const n of kids(kid(obj, 'sf:PROC_CTRL'), 'sf:NODE')) walk(n, node, next); }
    for (const n of kids(kid(nodeEl, 'sf:SUCC'), 'sf:NODE').concat(kids(kid(nodeEl, 'sf:SUCC'), 'sf:item').flatMap((i) => kids(i, 'sf:NODE')))) walk(n, node, next);
    return node;
  };
  const tree = kid(vh, 'sf:PAGETREE');
  const top = kids(tree, 'sf:NODE')[0];
  if (top) model.root = walk(top, null, { page: '', window: '', path: [] });
  // a text module has its text node directly under the form (no page tree)
  if (!top) for (const n of [...kids(sf, 'sf:NODE'), ...kids(kid(sf, 'sf:TEXTTREE'), 'sf:NODE')]) walk(n, null, { page: '', window: '', path: [] });
  if (!top && formType === 'text-module' && !model.nodes.length) {
    const t = doc.children[0] && findFirst(sf, 'sf:TEXT');
    if (t) { const node = { id: `n${++seq}`, kind: 'text-element', nodetype: 'TI', name: val(kid(t, 'NAME'), 'INAME'), caption: val(t, 'CAPTION'), parent: '', page: '', window: '', path: val(kid(t, 'NAME'), 'INAME'), outattr: null, cond: null, attrs: attrsOf('text-element', t), children: [], obj: t }; model.nodes.push(node); model.byId.set(node.id, node); }
  }
  return model;
}

function findFirst(el, tag) {
  for (const c of el?.children || []) { if (c.tag === tag) return c; const f = findFirst(c, tag); if (f) return f; }
  return null;
}

function linesOf(obj) {
  return items(obj, 'TEXT').map((it) => ({ format: val(it, 'TDFORMAT'), text: (kid(it, 'TDLINE')?.text ?? '') }));
}

function attrsOf(kind, obj) {
  if (!obj) return {};
  const r = rec(obj);
  if (kind.startsWith('text-')) {
    const lines = kind === 'text-element' ? linesOf(obj) : [];
    return { ttype: r.TTYPE || '', appMode: r.APPMODE || '', style: r.STYLE_NAME || '', lines: lines.length, fields: symbolsOf(lines),
      ref: r.REF_NAME || '', key: rec(kid(obj, 'TKEY')), ignoreMissing: r.IGNORE === 'X', dynField: r.DYNTEXT || r.TDTEXT || '' };
  }
  if (['loop', 'ctable', 'table46'].includes(kind) || kind === 'folder' || kind === 'template' || kind === 'section-complex' || kind === 'row' || kind === 'cell') {
    return { table: r.TABNAME || '', workArea: r.TABHEADER || '', dataType: r.DATATYPE || '', into: r.TABHTYPE || '', firstLine: r.FIRSTLINE || '', lastLine: r.LASTLINE || '',
      where: items(obj, 'WCOND').map(rec), calc: items(obj, 'CALC').map(rec), sort: items(obj, 'SORT').map(rec),
      header: r.OTABHEADER || '', footer: r.OTABFOOTER || '', lineTypes: items(obj, 'DYNLINES').map((x) => val(x, 'NAME')), cells: items(obj, 'CELLS').length,
      templateLines: items(obj, 'LINES').length, width: r.WIDTH || '' };
  }
  if (kind === 'graphic') {
    const k = rec(kid(obj, 'GKEYBDS'));
    return { gtype: r.GTYPE || '', key: k, dynamic: Object.values(k).some((v) => /&.*&/.test(v)), align: r.ALIGNMENT || 'L', resolution: r.RESOLUTION || '' };
  }
  if (kind === 'address') return { addrType: r.ADDRTYPE || '', number: r.NUMB || '', person: r.PERSON || '', paragraph: r.ADDRPAR || '' };
  if (kind === 'command') {
    return { newPage: r.NEWPAGE === 'X', pageName: r.PAGENAME || '', spoolAttrs: items(obj, 'SPOOLATTR').length,
      extra: ['SETDATE', 'DMASK', 'SETTIME', 'TMASK', 'SETSIGN', 'RESETPAR', 'PCONTROL'].filter((k) => r[k]) };
  }
  if (kind === 'code') return { params: items(obj, 'PLIST').map(rec).map((p) => ({ name: p.OPD || '', dir: p.OUTIN || '' })), lines: items(obj, 'CODE').length };
  if (kind === 'alternative') return { cond: items(obj, 'COND').map(rec) };
  if (kind.startsWith('event-')) return { sortField: r.SFIELD || '' };
  if (kind === 'page') return { next: val(kid(obj, 'NEXTPAGE'), 'INAME'), orientation: r.PAGEORTN || 'P' };
  return {};
}

/** Every node counted by kind, with the interface and the printed symbols (see the header). */
export function inventory(model) {
  const counts = {};
  const nodes = model.nodes.map((n) => {
    counts[n.kind] = (counts[n.kind] || 0) + 1;
    const out = { id: n.id, kind: n.kind, name: n.name, caption: n.caption, path: n.path, page: n.page, window: n.window,
      outattr: !!n.outattr, condition: n.cond ? { data: n.cond.data.length, layout: Object.keys(n.cond.layout).filter((k) => n.cond.layout[k]) } : null };
    if (n.pages) out.pages = n.pages;
    const a = n.attrs || {};
    if (a.fields?.length) out.fields = a.fields;
    if (n.kind === 'graphic' && a.dynamic) out.dynamicKey = true;
    if (a.calc?.length) out.calc = a.calc.length;
    if (a.sort?.length) out.sort = a.sort.length;
    if (a.where?.length) out.where = a.where.length;
    if (n.kind === 'code') out.params = a.params.length;
    if (n.kind === 'command') Object.assign(out, { newPage: a.newPage, spoolAttrs: a.spoolAttrs, extra: a.extra });
    return out;
  });
  const symbols = [...new Set(model.nodes.flatMap((n) => n.attrs?.fields || []))].sort();
  const pick = (l) => l.map((p) => ({ name: p.name, type: p.type, standard: p.standard }));
  return { form: model.form, formType: model.formType, caption: model.caption, pageFormat: model.pageFormat, style: model.style,
    pages: model.pages.map((p) => ({ name: p.name, next: p.next, orientation: p.orientation })),
    interface: { import: pick(model.interface.import), export: pick(model.interface.export), tables: pick(model.interface.tables), exceptions: pick(model.interface.exceptions) },
    globals: { data: model.globals.data.length, typesLines: model.globals.typesLines, fieldSymbols: model.globals.fieldSymbols, initLines: model.globals.initLines, formRoutineLines: model.globals.formRoutineLines },
    counts, total: nodes.length, nodes, symbols };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node sf-inventory.mjs <form.xml>'); process.exit(2); }
  try { console.log(JSON.stringify(inventory(loadSmartForm(readFileSync(resolve(file), 'utf8'))), null, 1)); }
  catch (e) { console.error(`sf-inventory: ${e.message}`); process.exit(1); }
}

#!/usr/bin/env node
// Write Form Builder XML (the format of SMARTFORMS > Utilities > Upload) from a
// form spec — the last step of the SmartForm-from-PDF skill. The XML goes to SAP
// with the MCP tool CreateSmartForm.
//
//   node write-form.mjs <spec.json> [--out FORM.xml]
//
// Spec (lengths in mm, line widths in points):
// { form, caption?, language?: "EN", pageFormat?: "DINA4", orientation?: "P",
//   style: "ZSTYLE",                       // form style (STDSTYLE); must exist
//   interface?: [{ name, typing?: "TYPE", type, optional? }],   // importing parameters
//   tables?: [{ name, typing?: "LIKE", type }],                  // TABLES parameters
//   globals?: [{ name, typing?: "TYPE", type }],
//   windows: [{ name, caption?, type?: "T" (secondary) | "M" (main), x, y, w, h,
//               border?: { th, sides?: "LTRB" },  style?,
//               nodes: [ Text | Template ] }] }
// Text:     { kind: "text", name?, lines: [{ f: "L1", t: "Label &GS_X-Y&" }], style? }
// Template: { kind: "template", name?, left?, top?, rows: [{ h, cols: [w...] }],
//             cells?: [{ row, col, borders?: { l, t, r, b } (pt), shade? (0..100),
//                        nodes: [Text] }] }   row / col from 1
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
// el('A', 'text') → <A>text</A>; el('A', [children]) → nested; null / undefined children dropped
function el(tag, body, attrs = '') {
  if (body === undefined || body === null) return '';
  if (Array.isArray(body)) {
    const inner = body.filter((b) => b !== undefined && b !== null && b !== '').join('');
    return inner ? `<${tag}${attrs}>${inner}</${tag}>` : `<${tag}${attrs}/>`;
  }
  return `<${tag}${attrs}>${esc(body)}</${tag}>`;
}
const num = (v, d = 2) => Number(v).toFixed(d);
const n3 = (v) => String(Math.round(v)).padStart(3, '0');

// SAP language key (1 char) for the XML's T_CAPTION rows
const LANG1 = { EN: 'E', DE: 'D', KO: '3', JA: 'J', ZH: '1', FR: 'F', ES: 'S', IT: 'I', PT: 'P', RU: 'R', TR: 'T', HU: 'H', PL: 'L', CS: 'C', NL: 'N' };

const STD_INTERFACE = [
  ['E', 'DOCUMENT_OUTPUT_INFO', 'SSFCRESPD', false], ['E', 'JOB_OUTPUT_INFO', 'SSFCRESCL', false], ['E', 'JOB_OUTPUT_OPTIONS', 'SSFCRESOP', false],
  ['I', 'ARCHIVE_INDEX', 'TOA_DARA', true], ['I', 'ARCHIVE_INDEX_TAB', 'TSFDARA', true], ['I', 'ARCHIVE_PARAMETERS', 'ARC_PARAMS', true],
  ['I', 'CONTROL_PARAMETERS', 'SSFCTRLOP', true], ['I', 'MAIL_APPL_OBJ', 'SWOTOBJID', true], ['I', 'MAIL_RECIPIENT', 'SWOTOBJID', true],
  ['I', 'MAIL_SENDER', 'SWOTOBJID', true], ['I', 'OUTPUT_OPTIONS', 'SSFCOMPOP', true], ['I', 'USER_SETTINGS', 'TDBOOL', true, "'X'"],
];
const STD_EXCEPTIONS = ['FORMATTING_ERROR', 'INTERNAL_ERROR', 'SEND_ERROR', 'USER_CANCELED'];

// a text line holds 132 characters (TDLINE): a longer one goes on in '=' lines;
// it is cut only outside <format> and &field& tags
export function tdlines(text, max = 132) {
  const out = [];
  let rest = String(text);
  while (rest.length > max) {
    let cut = max;
    const inside = (k) => { const lt = rest.lastIndexOf('<', k - 1), gt = rest.lastIndexOf('>', k - 1); const amp = (rest.slice(0, k).match(/&/g) || []).length; return lt > gt || amp % 2 === 1; };
    while (cut > 1 && inside(cut)) cut--;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  out.push(rest);
  return out;
}

export function writeForm(spec) {
  const form = String(spec.form).toUpperCase();
  const lang1 = LANG1[(spec.language || 'EN').toUpperCase()] || 'E';
  const counters = {};
  const auto = (prefix) => `%${prefix}${(counters[prefix] = (counters[prefix] || 0) + 1)}`;
  const tcap = (objtype, iname, caption) => el('T_CAPTION', [el('item', [el('LANGU', lang1), el('FORMNAME', form), el('OBJTYPE', objtype), el('INAME', iname), caption ? el('CAPTION', caption) : null])]);

  const sideAttr = (tag, th) => el(tag, [el('THICKNESS', num((th || 0) * 20)), el('THICKNESSU', 'TW'), el('DISTANCE', '0.00'), el('DISTANCEU', 'CM'), el('COLOR', [el('RED', '000'), el('GREEN', '000'), el('BLUE', '000'), el('TRANS', '000')])]);
  // output attributes of a node: position (windows), cell (template texts), border, style
  const outattr = (o = {}) => {
    const iname = auto('OUTATTRIB');
    const b = o.border || {};
    const sides = b.sides || 'LTRB';
    const th = (s) => (b.th && sides.includes(s) ? b.th : 0);
    return el('sf:OUTATTR', [el('sf:OUTATTR', [
      el('NAME', [el('INAME', iname)]),
      // the style a text prints in is the one of its output options (or its parents')
      o.style ? el('STDSTYLE', o.style) : null,
      o.lineType ? el('T_LINETYPE', o.lineType) : null,
      o.line ? el('T_LINENR', n3(o.line)) : null,
      o.cell ? el('T_CELLNR', n3(o.cell)) : null,
      el('U_WFRAME', 'PT'), el('U_WBOXV', 'CM'), el('U_WBOXH', 'CM'),
      o.x !== undefined ? el('WLEFT', num(o.x)) : null, el('U_WLEFT', 'MM'),
      o.w !== undefined ? el('WWIDTH', num(o.w)) : null, el('U_WWIDTH', 'MM'),
      o.y !== undefined ? el('WTOP', num(o.y)) : null, el('U_WTOP', 'MM'),
      o.h !== undefined ? el('WHEIGHT', num(o.h)) : null, el('U_WHEIGHT', 'MM'),
      el('BORDER', [th('L') ? el('LEFTLINE', 'X') : null, sideAttr('LEFTATTR', th('L')), th('T') ? el('TOPLINE', 'X') : null, sideAttr('TOPATTR', th('T')), th('R') ? el('RIGHTLINE', 'X') : null, sideAttr('RIGHTATTR', th('R')), th('B') ? el('BOTTOMLINE', 'X') : null, sideAttr('BOTTOMATTR', th('B'))]),
      tcap('OA', iname),
    ])]);
  };
  const node = (type, obj, out, succ = []) => el('sf:NODE', [el('NODETYPE', type), el('sf:OBJ', [obj]), out || null, el('sf:SUCC', succ.map((s) => el('sf:item', [s])))]);

  const textNode = (t, cellPos) => {
    const iname = t.name || auto('TEXT');
    const obj = el('sf:TEXT', [
      el('NAME', [el('INAME', iname)]),
      el('CAPTION', t.caption || iname),
      el('NOLANGUAGE', 'X'),
      el('APPMODE', 'P'),
      el('TEXT', t.lines.flatMap((l) => tdlines(l.t ?? '').map((piece, i) => el('item', [el('TDFORMAT', i ? '=' : l.f || '*'), el('TDLINE', piece)])))),
      t.style ? el('STYLE_NAME', t.style) : null,
      el('TEXT_AREA', [el('ENABLED', 'F'), el('NCOLS', '0'), el('NROWS', '0')]),
      tcap('TI', iname, t.caption || iname),
    ]);
    return node('TI', obj, outattr({ ...(cellPos || {}), style: t.style }));
  };

  // CELLS items of a template line (name LINEn) or a table line type: widths and borders
  const cellItems = (lineName, cols, cellOf) => cols.map((w, j) => {
    const q = cellOf(j + 1) || {};
    const b = q.borders || {};
    const tw = (pt) => num((pt || 0) * 20); // border widths in twips
    const color = (tag, used) => el(tag, [el('RED', '000'), el('GREEN', '000'), el('BLUE', '000'), used ? el('USED', 'X') : null]);
    return el('item', [
      el('NAME', lineName), el('COLUMNNR', n3(j + 1)), el('CWIDTH', num(w)), el('U_CWIDTH', 'MM'), el('SHADING', n3(q.shade || 0)),
      el('BORDERS', [el('item', [
        el('IDX', '001'), el('INTENSITY', n3(q.shade || 0)),
        el('LLEFT', tw(b.l)), el('LLEFT_U', 'TW'), el('LTOP', tw(b.t)), el('LTOP_U', 'TW'),
        el('LRIGHT', tw(b.r)), el('LRIGHT_U', 'TW'), el('LBOTTOM', tw(b.b)), el('LBOTTOM_U', 'TW'),
        color('FILLCOLOR', !!q.shade), color('CLEFT', !!b.l), color('CTOP', !!b.t), color('CRIGHT', !!b.r), color('CBOTTOM', !!b.b),
      ])]),
    ]);
  });
  const pattern = el('PATTERN', [el('PATTNUM', '0000'), el('FRAME', '0.00'), el('U_FRAME', 'TW')]);

  const templateNode = (tp) => {
    const iname = tp.name || auto('TEMPLATE');
    const lines = tp.rows.map((r, i) => el('item', [el('NAME', `LINE${i + 1}`), el('LINEFROM', n3(i + 1)), el('LINETO', n3(i + 1)), el('LHEIGHT', num(r.h)), el('U_LHEIGHT', 'MM'), el('SHADING', '000')]));
    const cells = tp.rows.flatMap((r, i) => cellItems(`LINE${i + 1}`, r.cols, (c) => (tp.cells || []).find((q) => q.row === i + 1 && q.col === c)));
    const width = Math.max(...tp.rows.map((r) => r.cols.reduce((s, w) => s + w, 0)));
    const obj = el('sf:SECTION', [
      el('NAME', [el('INAME', iname)]),
      el('CAPTION', tp.caption || iname),
      el('SECTTYPE', 'S'), el('OTABTYPE', 'S'), el('U_FHEIGHT', 'CM'),
      pattern,
      el('USEBORDER', 'X'),
      el('WIDTH', num(width)), el('U_WIDTH', 'MM'),
      el('APPMODE', 'L'), // C would centre the template in its window
      tp.left ? el('LEFT', num(tp.left)) : null, el('U_LEFT', 'MM'),
      tp.top ? el('TOP', num(tp.top)) : null, el('U_TOP', 'MM'),
      el('U_SB', 'CM'), el('U_SA', 'CM'),
      el('STATLINES', lines),
      el('CELLS', cells),
      tcap('SE', iname, tp.caption || iname),
    ]);
    const kids = [];
    for (const q of tp.cells || []) for (const t of q.nodes || []) kids.push(textNode(t, { line: q.row, cell: q.col }));
    return node('SE', obj, outattr({}), kids);
  };

  // a section node without layout of its own (loop, table row, table cell)
  const section = (type, name, caption, extra, out, kids) => node('SE', el('sf:SECTION', [
    el('NAME', [el('INAME', name)]), el('CAPTION', caption || name), el('SECTTYPE', type), ...extra,
    el('U_FHEIGHT', 'CM'), pattern, el('U_WIDTH', 'CM'), el('U_LEFT', 'CM'), el('U_TOP', 'CM'), el('U_SB', 'CM'), el('U_SA', 'CM'),
    tcap('SE', name, caption || name),
  ]), out, kids);
  const loopData = (tb) => [el('DATATYPE', 'L'), el('TABNAME', tb.data), el('TABHTYPE', 'I'), el('TABHEADER', tb.into)];

  // Table: { kind: "table", name?, data: "IT_ITEMS", into: "GS_ITEM", width?, style?,
  //   lineTypes: [{ name: "%LTYPE1", cols: [w...], cells?: [{ col, borders?, shade? }] }],
  //   header?: [Row], body: [Row], footer?: [Row] }   Row: { type: "%LTYPE1", cells: [[Text...] per column] }
  // the body rows print once per line of `data`, read into `into`
  const tableNode = (tb) => {
    const iname = tb.name || auto('TABLE');
    const lt = tb.lineTypes;
    const width = tb.width || Math.max(...lt.map((l) => l.cols.reduce((s, w) => s + w, 0)));
    const obj = el('sf:SECTION', [
      el('NAME', [el('INAME', iname)]), el('CAPTION', tb.caption || iname),
      el('SECTTYPE', 'C'), ...loopData(tb),
      el('OTABTYPE', 'D'), el('OTABHEADER', 'A'), el('OTABFOOTER', 'A'),
      // the space kept free for the footer at a page break (SAP requires it)
      el('FHEIGHT', num(tb.footerHeight ?? Math.max(5, 5 * (tb.footer || []).length))), el('U_FHEIGHT', 'MM'), pattern, el('USEBORDER', 'X'),
      el('WIDTH', num(width)), el('U_WIDTH', 'MM'), el('APPMODE', 'L'),
      el('U_LEFT', 'MM'), el('U_TOP', 'MM'), el('U_SB', 'CM'), el('U_SA', 'CM'),
      el('DYNLINES', lt.map((l, i) => el('item', [el('NAME', l.name), i === 0 ? el('DEFAULTVAL', 'X') : null, el('SHADING', '000')]))),
      el('CELLS', lt.flatMap((l) => cellItems(l.name, l.cols, (c) => (l.cells || []).find((q) => q.col === c)))),
      tcap('SE', iname, tb.caption || iname),
    ]);
    const row = (r) => {
      const rname = auto('ROW');
      const cells = (r.cells || []).map((texts, j) => section('E', auto('CELL'), `Cell ${j + 1}`, [], outattr({}), (texts || []).map((t) => textNode(t))));
      return section('R', rname, r.caption || rname, [], outattr({ lineType: r.type }), cells);
    };
    const event = (type, caption, rows) => node('EV', el('sf:EVENT', [el('NAME', [el('INAME', auto('EVENT'))]), el('CAPTION', caption), el('EVTYPE', type)]), null, (rows || []).map(row));
    return node('SE', obj, outattr({ style: tb.style }), [event('H', 'Header', tb.header), event('B', 'Main Area', tb.body), event('F', 'Footer', tb.footer)]);
  };

  // Loop: { kind: "loop", name?, data: "IT_ITEMS", into: "GS_ITEM", nodes: [...] } — its nodes print once per line
  const loopNode = (lp) => {
    const iname = lp.name || auto('LOOP');
    return section('L', iname, lp.caption || iname, loopData(lp), outattr({}), (lp.nodes || []).map(anyNode));
  };

  const anyNode = (n) => (n.kind === 'template' ? templateNode(n) : n.kind === 'table' ? tableNode(n) : n.kind === 'loop' ? loopNode(n) : textNode(n));

  const windowNode = (w) => {
    const iname = w.name || auto('WINDOW');
    const kids = (w.nodes || []).map(anyNode);
    const proc = el('sf:PROC_CTRL', [el('sf:NODE', [el('NODETYPE', 'RC'), el('sf:SUCC', kids.map((k) => el('sf:item', [k])))])]);
    const obj = el('sf:WINDOW', [el('NAME', [el('INAME', iname)]), el('CAPTION', w.caption || iname), el('WTYPE', w.type || 'T'), tcap('WI', iname, w.caption || iname), proc]);
    return node('WI', obj, outattr({ x: w.x, y: w.y, w: w.w, h: w.h, border: w.border }));
  };

  const page = el('sf:PAGE', [
    el('NAME', [el('INAME', 'FIRST')]), el('CAPTION', 'Page 1'),
    el('NUMB_MODE', 'I'), el('NUMB_TYPE', 'A'), el('PAGEORTN', spec.orientation || 'P'),
    tcap('PA', 'FIRST', 'Page 1'),
  ]);
  const pageNode = node('PA', page, null, spec.windows.map(windowNode));
  const pagetree = el('sf:PAGETREE', [el('sf:NODE', [el('NODETYPE', 'RP'), el('sf:SUCC', [el('sf:item', [pageNode])])])]);

  const iface = [
    ...STD_INTERFACE.map(([io, name, type, opt, def]) => el('item', [el('IOTYPE', io), el('NAME', name), el('TYPING', 'TYPE'), el('TYPENAME', type), opt ? el('OPTIONAL', 'X') : null, el('BYVALUE', 'X'), def ? el('DEFAULTVAL', def) : null, el('STANDARD', 'X')])),
    ...(spec.interface || []).map((p) => el('item', [el('IOTYPE', 'I'), el('NAME', p.name), el('TYPING', p.typing || 'TYPE'), el('TYPENAME', p.type), p.optional ? el('OPTIONAL', 'X') : null])),
    ...(spec.tables || []).map((p) => el('item', [el('IOTYPE', 'T'), el('NAME', p.name), el('TYPING', p.typing || 'LIKE'), el('TYPENAME', p.type)])),
    ...STD_EXCEPTIONS.map((x) => el('item', [el('IOTYPE', 'X'), el('NAME', x), el('STANDARD', 'X')])),
  ];
  const gdata = (spec.globals || []).map((g) => el('item', [el('NAME', g.name), el('TYPING', g.typing || 'TYPE'), el('TYPENAME', g.type)]));

  const body = [
    el('HEADER', [el('FORMNAME', form), el('CAPTION', spec.caption || form), el('MASTERLANG', lang1), el('LANGVECTOR', '*'), el('VERSION', '00001')]),
    el('INTERFACE', iface),
    gdata.length ? el('GDATA', gdata) : null,
    el('sf:VARHEADER', [el('sf:item', [el('PAGEFORMAT', spec.pageFormat || 'DINA4'), el('CPI', '10.00'), el('LPI', '6.00'), el('STDSTYLE', spec.style), pagetree])]),
  ];
  return '<?xml version="1.0" encoding="utf-8"?>' + el('sf:SMARTFORM', body, ` xmlns:sf="urn:sap-com:SmartForms:2000:internal-structure" xmlns="urn:sap-com:sdixml-ifr:2000" sf:language="${(spec.language || 'EN').toUpperCase()}"`);
}

function main(argv) {
  const file = argv[0];
  if (!file) { console.error('usage: node write-form.mjs <spec.json> [--out FORM.xml]'); process.exit(2); }
  const i = argv.indexOf('--out');
  const xml = writeForm(JSON.parse(readFileSync(file, 'utf8')));
  if (i >= 0) writeFileSync(argv[i + 1], xml);
  else process.stdout.write(xml + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));

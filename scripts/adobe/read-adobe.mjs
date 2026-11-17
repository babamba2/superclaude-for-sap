// sc4sap:adobe-preview — readers for what GetAdobeFormContent writes (read-only, no SAP call, no I/O in the functions).
//
// INPUT  mcp-output/adobe/<form>/<form>.form.xml       SFP form download (asx:abap: header, context object heap)
//        mcp-output/adobe/<form>/<interface>.interface.xml   SFP interface download (parameters, globals, coding)
//        mcp-output/adobe/<form>/<form>.layout.xdp      layout (XFA template + data description)
//
//   parseXml(text)              → ordered element tree { tag, attrs, children } — text as { tag: '#text', text }
//   readInterface(xml)          → { params, globals, references, coding { input, output, init } }
//   readContext(formXml)        → { interface, context } — context: tree of { kind, name, active, conditions, … }
//   readXdp(text)               → { template, dataDescription } — template: the <template> element
//   unit(v, dflt)               → a measurement ("10mm", "0.5in", "2cm", "12pt") in mm
//   textOf(el)                  → the concatenated text of an element
//
// Context node kinds (CL_FP_*): context, structure, folder, data, loop, loop-data, single-record, text-module, text,
// address, graphic, alternative, unknown. Inactive nodes (STATE I) stay in the tree with active = false.

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unent = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
  : ENT[e] ?? m));

/** A small ordered XML reader: elements, attributes, text nodes (mixed content kept in order), CDATA. */
export function parseXml(text) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  const addText = (t) => {
    const top = stack[stack.length - 1];
    const last = top.children[top.children.length - 1];
    if (last && last.tag === '#text') last.text += t;
    else top.children.push({ tag: '#text', text: t });
  };
  while ((m = re.exec(String(text)))) {
    if (m[1] !== undefined) addText(m[1]);
    else if (m[2]) {
      const top = stack[stack.length - 1];
      if (top.tag !== m[2]) throw new Error(`XML: </${m[2]}> closes <${top.tag}>`);
      stack.pop();
    } else if (m[3]) {
      const attrs = {};
      for (const a of (m[4] || '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unent(a[2] ?? a[3]);
      const el = { tag: m[3], attrs, children: [] };
      stack[stack.length - 1].children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) addText(unent(m[6]));
  }
  if (stack.length !== 1) throw new Error(`XML: <${stack[stack.length - 1].tag}> is not closed`);
  return root;
}

const local = (tag) => String(tag).replace(/^.*:/, '');
export const kids = (el, tag) => (el?.children || []).filter((c) => c.tag !== '#text' && (tag === undefined || c.tag === tag || local(c.tag) === tag));
export const kid = (el, tag) => kids(el, tag)[0];
export function textOf(el) {
  if (!el) return '';
  if (el.tag === '#text') return el.text;
  return (el.children || []).map(textOf).join('');
}
const val = (el, tag) => textOf(kid(el, tag)).trim();

/** A measurement in mm; a bare number is inches (XFA default unit). */
export function unit(v, dflt = 0) {
  if (v === undefined || v === null || v === '') return dflt;
  const m = /^\s*(-?[\d.]+)\s*(mm|cm|in|pt|mp|px)?\s*$/i.exec(String(v));
  if (!m) return dflt;
  const n = Number(m[1]);
  switch ((m[2] || 'in').toLowerCase()) {
    case 'mm': return n;
    case 'cm': return n * 10;
    case 'pt': return n * 25.4 / 72;
    case 'mp': return n * 25.4 / 72000;
    case 'px': return n * 25.4 / 72;
    default: return n * 25.4;
  }
}

// ── asx heap: objects by id, references by href="#oN" ─────────────────────────────
function heapOf(doc) {
  const abap = kid(doc, 'asx:abap');
  const heap = kid(abap, 'asx:heap');
  const values = kid(abap, 'asx:values');
  const byId = new Map();
  for (const o of kids(heap)) if (o.attrs.id) byId.set(o.attrs.id, o);
  const ref = (el) => { const h = el?.attrs?.href; return h ? byId.get(h.replace(/^#/, '')) : undefined; };
  return { values, heap, byId, ref };
}

/** Interface: import parameters (SFPIOPAR), global data (SFPGDATA), currency / quantity references, coding. */
export function readInterface(xml) {
  const doc = parseXml(xml);
  const { values, ref } = heapOf(doc);
  const data = ref(kid(values, 'INTERFACE'));
  const inner = kid(data, 'CL_FP_INTERFACE_DATA');
  const params = [];
  const pobj = kid(ref(kid(inner, 'PARAMETERS')), 'CL_FP_PARAMETERS');
  for (const sect of kids(pobj)) {
    const kind = { IMPORT_PARAMETERS: 'import', EXPORT_PARAMETERS: 'export', TABLE_PARAMETERS: 'tables', EXCEPTIONS: 'exceptions' }[sect.tag] || sect.tag.toLowerCase();
    for (const p of kids(sect)) {
      params.push({ name: val(p, 'NAME'), kind, typing: val(p, 'TYPING'), type: val(p, 'TYPENAME'),
        optional: val(p, 'OPTIONAL') === 'X', default: val(p, 'DEFAULTVAL') });
    }
  }
  const gobj = kid(ref(kid(inner, 'GLOBAL_DEFINITIONS')), 'CL_FP_GLOBAL_DEFINITIONS');
  const globals = kids(kid(gobj, 'GLOBAL_DATA')).map((g) => ({ name: val(g, 'NAME'), typing: val(g, 'TYPING'), type: val(g, 'TYPENAME'), default: val(g, 'DEFAULTVAL') }));
  const types = kids(kid(gobj, 'TYPES')).map((l) => textOf(l));
  const robj = kid(ref(kid(inner, 'REFERENCE_FIELDS')), 'CL_FP_REFERENCE_FIELDS');
  const references = kids(kid(robj, 'REFERENCE_FIELDS')).map((r) => ({ datatype: val(r, 'DATATYPE'), value: val(r, 'VALUE'), unit: val(r, 'UNIT') }));
  const cobj = kid(ref(kid(inner, 'CODING')), 'CL_FP_CODING');
  const coding = {
    input: kids(kid(cobj, 'INPUT_PARAMETERS')).map((x) => textOf(x).trim()),
    output: kids(kid(cobj, 'OUTPUT_PARAMETERS')).map((x) => textOf(x).trim()),
    init: kids(kid(cobj, 'INITIALIZATION')).map((x) => textOf(x)),
    forms: kids(kid(cobj, 'FORMS')).map((x) => textOf(x)),
  };
  return { params, globals, types, references, coding };
}

const KIND = {
  CL_FP_CONTEXT: 'context', CL_FP_STRUCTURE: 'structure', CL_FP_DATA: 'data', CL_FP_LOOP: 'loop',
  CL_FP_LOOP_DATA: 'loop-data', CL_FP_SINGLE_RECORD: 'single-record', CL_FP_TEXT_MODULE: 'text-module',
  // an SO10 include text is CL_FP_TEXT_INCLUDE (FP_TEST_01 INCLUDETEXT1); CL_FP_INCLUDE_TEXT kept as an alias
  CL_FP_TEXT: 'text', CL_FP_TEXT_INCLUDE: 'text', CL_FP_INCLUDE_TEXT: 'text', CL_FP_ADDRESS: 'address', CL_FP_GRAPHIC: 'graphic',
  CL_FP_ALTERNATIVE: 'alternative', CL_FP_FOLDER: 'folder',
};

function conditionsOf(c) {
  const inner = kid(c, 'CL_FP_CONDITION');
  return kids(kid(inner, 'CONDITIONS')).map((s) => ({
    lop: val(s, 'LOPERATOR'), op1: val(s, 'OPERAND1'), cop: val(s, 'COPERATOR'), op2: val(s, 'OPERAND2'),
  }));
}

/** Context of a form: the node tree the generated function module turns into the data XML ADS gets. */
export function readContext(formXml) {
  const doc = parseXml(formXml);
  const { values, ref } = heapOf(doc);
  const iface = val(values, 'INTERFACE');
  const seen = new Set();
  const build = (o) => {
    if (!o || seen.has(o)) return null;
    seen.add(o);
    const cls = local(o.tag);
    const node = kid(o, 'CL_FP_NODE');
    const n = { kind: KIND[cls] || 'unknown', cls, name: val(node, 'NAME'), active: val(node, 'STATE') !== 'I',
      generated: val(node, 'GENERATED') === 'X', conditions: conditionsOf(ref(kid(node, 'CONDITION'))), children: [] };
    const own = kid(o, cls);
    if (n.kind === 'data') { n.field = val(own, 'FIELD'); n.label = val(own, 'FIELD_LABEL'); }
    if (n.kind === 'loop') {
      Object.assign(n, { table: val(own, 'TABLE_NAME'), into: val(own, 'LOOP_INTO') === 'X', workArea: val(own, 'WORK_AREA'),
        from: Number(val(own, 'FIRST_LINE')) || 0, to: Number(val(own, 'LAST_LINE')) || 0,
        where: conditionsOf(ref(kid(own, 'WHERE_CONDITION'))), sorted: val(own, 'SORTED'), controlLevel: val(own, 'CONTROL_LEVEL') });
    }
    if (n.kind === 'single-record') {
      Object.assign(n, { table: val(own, 'TABLE_NAME'), line: Number(val(own, 'LINE')) || 0, key: conditionsOf(ref(kid(own, 'WITH_KEY_CONDITION'))) });
    }
    if (n.kind === 'text-module' || n.kind === 'text') {
      const t = kid(o, 'CL_FP_TEXT');
      n.append = val(t, 'APPEND_MODE');
      const tn = kid(own, 'TEXT_NAME');
      n.text = { name: val(tn, 'NAME'), nameField: val(tn, 'NAMEFIELD'), language: val(kid(own, 'TEXT_LANGUAGE'), 'LANGUAGE'),
        languageField: val(kid(own, 'TEXT_LANGUAGE'), 'LANGUAGEFIELD'), style: val(own, 'STYLE_NAME'), withStyle: val(own, 'TEXT_STYLE') === 'X',
        // include texts: TEXT_OBJECT { OBJECT, OBJECTFIELD }, TEXT_ID { ID, IDFIELD } (a value or the field holding it)
        object: val(kid(own, 'TEXT_OBJECT'), 'OBJECT'), objectField: val(kid(own, 'TEXT_OBJECT'), 'OBJECTFIELD'),
        id: val(kid(own, 'TEXT_ID'), 'ID'), idField: val(kid(own, 'TEXT_ID'), 'IDFIELD') };
    }
    if (n.kind === 'unknown' || n.kind === 'structure' || n.kind === 'graphic' || n.kind === 'address') {
      // keep the class's own simple fields for later kinds (graphic name, address number, …)
      const extra = {};
      for (const c of kids(own)) if (!kids(c).length) extra[c.tag] = textOf(c).trim();
      if (Object.keys(extra).length) n.attrs = extra;
    }
    for (let c = ref(kid(node, 'CHILD')); c; c = ref(kid(kid(c, 'CL_FP_NODE'), 'SUCCESSOR'))) {
      const child = build(c);
      if (!child) break;
      n.children.push(child);
    }
    return n;
  };
  const root = build(ref(kid(values, 'CONTEXT')));
  return { interface: iface, context: root };
}

/** The XDP's template and its data description (the data XML's shape). */
export function readXdp(text) {
  const doc = parseXml(text);
  const xdp = kid(doc, 'xdp:xdp') || kid(doc, 'xdp');
  const template = kid(xdp, 'template');
  const datasets = kid(xdp, 'xfa:datasets');
  const dataDescription = kid(datasets, 'dd:dataDescription');
  return { template, dataDescription };
}

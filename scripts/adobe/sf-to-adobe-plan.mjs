// sc4sap:smartform-to-adobe — what SAP's own SmartForm → Adobe migration (CL_SSF_MIGRATION=>MIGRATE) makes of a form,
// worked out before anything is written (read-only; P1 of the build spec). Each rule follows the method of
// CL_SSF_MIGRATION that SAP calls for the node (CL_SSF_FB_NODE IF_SSF_FB_GENERAL~MIGRATE dispatches on node type,
// section type, text type and event type); skills/smartform-to-adobe/mapping.md lists the methods and lines.
//
//   OPTION_PRESETS                 'sap-default' (SET_DEFAULT_MIGRATING_OPTIONS — what MIGRATE uses without options)
//                                  and 'full' (every SSFMEXPROPERTIES flag; RECTIFY_MIGRATING_OPTIONS applied)
//   rectifyOptions(o)              RECTIFY_MIGRATING_OPTIONS
//   encodeName(name)               CL_SSF_XFA_XHTML=>ENCODE_SF_NAME (ASCII exact; other characters as UTF-8 hex)
//   fieldSupported(name)           CL_SSF_MIGRATION=>IS_FIELD_SUPPORTED
//   pageList(pages)                CONVERT_SF2XFT_PAGELIST → pageSet / pageArea entries with occurrence
//   planMigration(model, { options, formName, interfaceName })
//     → { form, options, names { form, interface }, interface, context (tree), layout (tree), log [SAP messages
//         predicted, in order], nodes [{ id, kind, name, path, method, status, context, layout, messages, gaps }],
//         gaps [{ node, kind, reason, action, logged }], completeness { nodes, mapped, gap, silent } }
//     status: mapped (no message) | warning (SAP logs W) | gap (SAP logs E, or the node / part of it is dropped
//     without a message — `logged: false`). Every inventory node gets exactly one entry: none is left out.
//
// What the plan does not model: borders / fill / margins of output options (recorded as flags), the XHTML of texts
// (CL_SSF_XFA_XHTML), DDIC checks of fields (an unknown field = a head not declared anywhere → predicted m05), and
// TSP08 page sizes (the format name is kept). Messages are SAP's text symbols m01–m15 in English.
//
// CLI  node sf-to-adobe-plan.mjs <form.xml> [--options full|sap-default|<file.json>] [--form <FP name>] [--interface <name>]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSmartForm } from './sf-inventory.mjs';

const FLAGS = ['interface', 'context', 'layout', 'condition_data', 'condition_layout', 'alternative_all', 'alternative_true', 'table', 'template', 'text',
  'text_append', 'text_binding', 'text_placeholder', 'window', 'address', 'graphic', 'folder', 'output_option', 'header_footer', 'command_pagebreak',
  'command_rest', 'coding'];
const on = (list) => Object.fromEntries(FLAGS.map((f) => [f, list.includes(f)]));
export const OPTION_PRESETS = {
  'sap-default': on(['interface', 'context', 'layout', 'window', 'text', 'text_placeholder', 'address', 'graphic', 'folder', 'template', 'command_pagebreak']),
  full: on(FLAGS),
};

/** RECTIFY_MIGRATING_OPTIONS (applied to options passed in; the default preset is used as it is). */
export function rectifyOptions(o0) {
  const o = { ...on([]), ...o0 };
  if (!o.context) for (const f of ['layout', 'condition_data', 'condition_layout', 'alternative_all', 'alternative_true', 'table', 'template', 'text', 'window', 'address', 'graphic', 'folder', 'output_option', 'header_footer']) o[f] = false;
  if (o.alternative_all) o.alternative_true = false;
  if (!o.text) { o.text_append = false; o.text_binding = false; o.text_placeholder = false; }
  if (o.text_binding) o.text_placeholder = false;
  if (!o.layout) { o.condition_layout = false; o.text_append = false; o.text_binding = false; o.output_option = false; o.command_pagebreak = false; }
  return o;
}

/** ENCODE_SF_NAME: upper case; a first character other than A–Z / 0–9, or a later one other than A–Z / 0–9 / _ / -,
 *  becomes X<hex>_ ; <fs> (a field symbol) becomes X3C_fs. */
export function encodeName(name) {
  const n = String(name || '').toUpperCase();
  if (!n) return '';
  if (n[0] === '<' && n.endsWith('>')) return `X3C_${n.slice(1).split('>')[0]}`;
  let out = '';
  [...n].forEach((ch, i) => {
    const ok = i === 0 ? /[A-Z0-9]/.test(ch) : /[A-Z0-9_-]/.test(ch);
    out += ok ? ch : `X${Buffer.from(ch, 'utf8').toString('hex').toUpperCase()}_`;
  });
  return out;
}

const UNSUPPORTED = ['SFSY-PAGENAME', 'SFSY-WINDOWNAME', 'SFSY-XSF', 'SFSY-XDF', 'SFSY-XDF2', 'SFSY-SUBRC', 'SFSY-COPYCOUNT', 'SFSY-COPYCOUNT0', 'SFSY-JOBPAGES'];
const STD_PARAMS = ['ARCHIVE_INDEX', 'ARCHIVE_INDEX_TAB', 'ARCHIVE_PARAMETERS', 'CONTROL_PARAMETERS', 'MAIL_APPL_OBJ', 'MAIL_RECIPIENT', 'MAIL_SENDER', 'OUTPUT_OPTIONS', 'USER_SETTINGS'];
/** IS_FIELD_SUPPORTED (the CASE compares the name as written; the prefix test takes the first n characters). */
export function fieldSupported(name) {
  const n = String(name ?? '');
  if (UNSUPPORTED.some((u) => n === u || n === u.replace('-', '.'))) return false;
  return !STD_PARAMS.some((p) => n.slice(0, p.length) === p);
}

const PAGE_STOCK = { DINA3: 'a3', DINA4: 'a4', DINA5: 'a5', EXECUTIV: 'executive', JPHAGAKI: 'japanesePostcard', LEGAL: 'legal', LETTER: 'letter' };

/** CONVERT_SF2XFT_PAGELIST: pages [{ name, next }] in tree order → [{ el: pageSet | pageArea | /pageSet, name, min, max }]. */
export function pageList(pages) {
  const list = [{ el: 'pageSet', min: '0', max: '1' }];
  const flags = new Set();
  let nextName = pages[0]?.name;
  for (let guard = 0; guard < pages.length * 4 + 4; guard++) {
    const p = pages.find((x) => x.name === nextName);
    if (!p) break;
    flags.add(p.name);
    const at = list.findIndex((e) => e.el === 'pageArea' && e.name === p.name);
    const firstOpen = () => pages.find((x) => !flags.has(x.name))?.name;
    if (at >= 0) {
      list.splice(at, 0, { el: 'pageSet', min: '0', max: '-1' });
      list.push({ el: '/pageSet' });
      nextName = firstOpen();
      if (!nextName) break;
    } else if (p.name === p.next) {
      list.push({ el: 'pageArea', name: p.name, min: '0', max: '-1' });
      nextName = firstOpen();
      if (!nextName) break;
    } else {
      list.push({ el: 'pageArea', name: p.name, min: '0', max: '1' });
      nextName = p.next;
    }
  }
  list.push({ el: '/pageSet' });
  return list.map((e) => (e.name ? { ...e, name: encodeName(e.name) } : e));
}

const MSG = {
  m01: ['E', 'Node &1. Template cell referenced more than once'],
  m02: ['W', 'Node &1. Paragraph format not supported. Rework in the Template Designer needed'],
  m03: ['W', 'Node &1. Layout conditions cannot be migrated'],
  m04: ['W', 'Node &1. Field &2 not supported'],
  m05: ['E', 'Node &1. Field &2 unknown'],
  m06: ['W', 'Node &1. Properties of a command not completely migrated'],
  m07: ['E', 'Node &1. Obsolete (4.6C) table is migrated as a loop node'],
  m08: ['E', 'Node &1. Complex sections cannot be migrated'],
  m09: ['E', 'Node &1. Calculations cannot be migrated at present'],
  m10: ['E', 'Node &1. Sort criteria cannot be migrated at present'],
  m12: ['E', 'Node &1. Page format &2 is not supported'],
  m13: ['E', 'Migration terminated (the form is not saved; the interface was saved before the context step)'],
  m14: ['W', 'Node &1. Field without name not supported'],
};

/** The plan of one form (see the header). */
export function planMigration(model, { options = 'full', formName = '', interfaceName = '' } = {}) {
  const o = typeof options === 'string' ? (options === 'sap-default' ? { ...OPTION_PRESETS['sap-default'] } : rectifyOptions(OPTION_PRESETS[options] || OPTION_PRESETS.full)) : rectifyOptions(options);
  const log = [];
  const entries = new Map(); // node id → plan entry
  const entry = (n) => {
    if (!entries.has(n.id)) entries.set(n.id, { id: n.id, kind: n.kind, name: n.name, path: n.path, method: METHOD[n.kind] || '', status: 'mapped', context: [], layout: [], messages: [], gaps: [], infos: [] });
    return entries.get(n.id);
  };
  let aborted = null;
  const say = (n, code, a2 = '') => {
    const [type, text] = MSG[code];
    const m = { type, code, node: n.name, text: text.replace('&1', n.name).replace('&2', a2) };
    log.push(m);
    const e = entry(n); e.messages.push(m);
    e.status = type === 'E' ? 'gap' : (e.status === 'gap' ? 'gap' : 'warning');
  };
  const info = (n, note) => { entry(n).infos.push(note); };
  const gap = (n, reason, action) => { const e = entry(n); e.gaps.push({ reason, action, logged: false }); e.status = 'gap'; };
  const ctx = (parent, type, name, from, extra = {}) => { const c = { type, name, from: from?.id || '', children: [], ...extra }; parent.children.push(c); if (from) entry(from).context.push(`${type}:${name}`); return c; };
  const lay = (parent, el, name, from, extra = {}) => { const c = { el, name, from: from?.id || '', children: [], ...extra }; parent.children.push(c); if (from) entry(from).layout.push(`${el}:${name}`); return c; };

  const declared = new Set(['SFSY', 'SY', ...Object.values(model.interface).flat().map((p) => p.name), ...model.globals.data.map((d) => d.name)].map((s) => s.toUpperCase()));
  // GET_XFT_FIELD_TYPE: these get a '$' type (current date / time / page / page count / space) — no context data
  const SYSTEM_TYPED = new Set(['SFSY-DATE', 'SY-DATUM', 'SFSY-TIME', 'SY-UZEIT', 'SFSY-PAGE', 'SFSY-FORMPAGES', 'SPACE']);
  const declaredPlain = new Set([...Object.values(model.interface).flat().map((x) => x.name), ...model.globals.data.map((x) => x.name)].map((x) => x.toUpperCase()));
  const state = { mainDone: false, page: '', activeWas: [], sections: [], evHeader: null, evFooter: null, templates: [] };
  const fpForm = formName || encodeName(model.form);
  const fpIntf = interfaceName || encodeName(model.form);
  const context = { type: 'context', name: fpForm, children: [] };
  const layout = { el: 'template', name: '', children: [] };
  const root = o.layout ? lay(layout, 'subform', encodeName(model.form), null, { script: o.text_append || o.condition_layout ? 'common' : '' }) : layout;

  // ── interface (MIGRATE_INTERFACE): every parameter incl. the standard ones, global data, types, field symbols,
  //    reference fields, initialization and form routine coding with its input / output parameters ───────────────
  const iface = o.interface ? {
    name: fpIntf, type: 'smartforms-compatible',
    import: model.interface.import.map((p) => p.name), export: model.interface.export.map((p) => p.name),
    tables: model.interface.tables.map((p) => p.name), exceptions: model.interface.exceptions.map((p) => p.name),
    globalData: model.globals.data.map((d) => d.name), typesLines: model.globals.typesLines, fieldSymbols: model.globals.fieldSymbols,
    initLines: model.globals.initLines, formRoutineLines: model.globals.formRoutineLines,
    initInput: model.globals.initParams.filter((p) => p.dir === 'I').map((p) => p.name), initOutput: model.globals.initParams.filter((p) => p.dir === 'O').map((p) => p.name),
  } : null;

  const applied = new Map(); // node id → { data, layout } condition parts SAP carries over
  const mark = (n, part) => { const a = applied.get(n.id) || {}; a[part] = true; applied.set(n.id, a); };
  const condData = (n, fpNode) => {
    if (!n.cond || !o.condition_data || !fpNode) return;
    mark(n, 'data');
    // SET_FP_CONDITION: the support check reads the condition row of the previous pass (SAP's own order), so a
    // row is skipped with m04 when the row before it named an unsupported field
    let prev = { op1: '', op2: '' };
    const rows = [];
    for (const c of n.cond.data) {
      if (!fieldSupported(prev.op1)) { say(n, 'm04', prev.op1); continue; }
      if (!fieldSupported(prev.op2)) { say(n, 'm04', prev.op2); continue; }
      if (c.LOP === 'OR' && !c.OP1 && !c.COP && !c.OP2) continue;
      prev = { op1: c.OP1 || '', op2: c.OP2 || '' };
      rows.push([c.LOP || '', c.OP1 || '', c.COP || '', c.OP2 || ''].join(' ').trim());
    }
    if (rows.length) fpNode.condition = rows;
  };
  const condLayout = (n, xNode) => {
    if (!n.cond || !o.condition_layout || !xNode) return;
    mark(n, 'layout');
    const lc = n.cond.layout || {};
    const parts = [];
    if (lc.FPAGE === 'X') parts.push('$layout.absPage(ref($)) == "1"');
    if (lc.NFPAGE === 'X') parts.push('$layout.absPage(ref($)) != "1"');
    if (parts.length) xNode.layoutCondition = parts.join(' & ');
    const lost = Object.keys(lc).filter((k) => lc[k] && !['FPAGE', 'NFPAGE'].includes(k));
    if (lost.length) gap(n, `layout condition ${lost.join(', ')} is not migrated (SET_XFT_CONDITION writes only first page / not first page; SAP adds the hidden condition field with an empty calculate, so the node prints on every page)`, layoutAction(n, lost));
  };
  const inMainWindow = (n) => model.nodes.some((w) => w.kind === 'window-main' && w.name === n.window);
  // the Adobe way to rebuild a lost layout condition (SSFOCOND flags)
  const layoutAction = (n, flags) => {
    const out = [];
    if (flags.includes('NLPAGE')) out.push('not on the last page: FormCalc presence script on layout:ready — if ($layout.page(ref($)) == $layout.pageCount()) then $.presence = "hidden" endif');
    if (flags.includes('LPAGE')) out.push('only on the last page: FormCalc presence script on layout:ready — if ($layout.page(ref($)) <> $layout.pageCount()) then $.presence = "hidden" endif');
    if (flags.includes('PAGENAME')) out.push('only on a named page: put the node on that page area (master page) instead of a script');
    const table = flags.filter((f) => ['HEADER', 'FOOTER', 'PAGEBREAK'].includes(f));
    if (table.length) out.push(`${table.join(' / ')}: confirm in the Form Builder (Conditions tab) which table event the flag means — SSFOCOND has no fixed values; if it is "only at the table start", move the node out of the header subform (reused as overflow leader) into a plain subform before the table, not behind a page-number script`);
    if (!out.length) out.push('add a presence script for the condition in the Adobe layout');
    if (inMainWindow(n) && (flags.includes('NLPAGE') || flags.includes('LPAGE'))) out.push('the node flows in the main window: a presence change on layout:ready reflows the pages and can change the page count it tests — prefer a data condition on a flag set in interface code, and check what the SmartForm prints today');
    return out.join('; ');
  };
  const outattr = (n, xNode) => {
    if (!n.outattr || !o.output_option || !xNode || !o.layout) return;
    xNode.outattr = { box: n.outattr.box, border: n.outattr.borderLines, shading: n.outattr.shading };
    if (n.outattr.lineNr || n.outattr.cellNr) {
      const t = state.templates[state.templates.length - 1];
      if (t) { const key = `${n.outattr.lineNr}|${n.outattr.cellNr}`; if (t.used.has(key)) say({ name: n.outattr.name, id: n.id }, 'm01'); else t.used.add(key); }
    }
  };
  const fieldHead = (f) => f.toUpperCase().split(/[-.]/)[0].replace(/^<|>$/g, '');

  const visit = (n, cParent, xParent) => {
    entry(n);
    const k = n.kind;
    const go = (cp, xp) => { for (const c of n.children) visit(c, cp, xp); };
    if (k === 'page-root') {
      if (!o.layout) return go(cParent, xParent);
      const list = pageList(model.pages);
      const stack = []; let parent = root;
      for (const e of list) {
        if (e.el === 'pageSet') { const ps = lay(parent, 'pageSet', '', n, { occur: [e.min, e.max] }); stack.push(parent); parent = ps; }
        else if (e.el === '/pageSet') parent = stack.pop() || root;
        else {
          const pa = lay(parent, 'pageArea', e.name, n, { occur: [e.min, e.max] });
          const pn = n.children.find((c) => c.kind === 'page' && encodeName(c.name) === e.name);
          if (pn) { state.page = pn.name; visit(pn, cParent, pa); }
        }
      }
      for (const c of n.children) if (!entries.has(c.id)) { entry(c); gap(c, 'page not reached from the first page through next-page links', 'link the page or add it to the page set by hand'); }
      return;
    }
    if (k === 'page') {
      if (o.layout) {
        xParent.medium = { format: model.pageFormat, orientation: n.attrs.orientation === 'L' ? 'landscape' : 'portrait', stock: PAGE_STOCK[model.pageFormat] || '' };
        if (!PAGE_STOCK[model.pageFormat]) say(n, 'm12', model.pageFormat);
      }
      return go(cParent, xParent);
    }
    if (k.startsWith('window-')) {
      const node = n.ref ? model.byId.get(n.ref) : n;
      const occ = n; // this page's occurrence (output options)
      const e = entry(n);
      if (n.ref) e.method = METHOD['window-ref'];
      const main = k === 'window-main';
      let xp = xParent;
      const wName = main ? encodeName(node.name) : `${encodeName(state.page)}_${encodeName(node.name)}`;
      if (main) {
        if (o.window && occ.outattr && o.layout) lay(xParent, 'contentArea', wName, n, { box: occ.outattr.box });
        if (o.window && o.layout && !state.mainDone) { xp = lay(root, 'subform', wName, n, { layout: 'lr-tb', occur: ['1', '1'], keep: 'contentArea' }); }
        else if (!(o.window && o.layout)) xp = xParent;
      } else if (o.window && o.layout) {
        lay(root, 'subform', wName, n, { prototype: true });
        xp = lay(xParent, 'subform', wName, n, { ref: true, layout: 'lr-tb', occur: ['1', '1'], keep: 'contentArea', box: occ.outattr?.box });
      }
      if (!main || !state.mainDone) {
        let cp = cParent;
        if (o.window || o.condition_data) cp = ctx(cParent, 'folder', wName, n, { description: node.caption });
        condData(occ, cp !== cParent ? cp : null);
        if (o.window) condLayout(occ, xp !== xParent ? xp : null);
        if (!n.ref) go(cp, xp);
        else for (const c of node.children) visit({ ...c, id: c.id }, cp, xp); // content again, inside this page's window
      } else if (main && n.ref) e.layout.push('contentArea only (the main window content is migrated once)');
      if (k === 'window-final') gap(n, 'final window: SmartForms fills it after the main window (page X of Y, totals); the Adobe form fills the context in order before the layout, and page numbers exist only in the layout', 'use Designer page-number fields on the master page ($layout.page(ref($)) / $layout.pageCount()); compute any value taken from main-window processing in the interface initialization code');
      if (k === 'window-copies') gap(n, 'copies window: Adobe copies are identical spool copies (SFPOUTPUTPARAMS-COPIES) — there is no copy counter in the layout, and SFSY-COPYCOUNT is not supported (m04)', 'the print program calls the form once per copy and passes a copy-number / original flag in a new interface parameter; put a context condition or presence script on it');
      if (main) state.mainDone = true;
      return;
    }
    if (k === 'control-root') return go(cParent, xParent);
    if (k.startsWith('text-')) {
      if (k === 'text-other') { gap(n, `text type ${n.attrs.ttype} is not migrated (no branch in the node dispatcher)`, 'recreate the text in the Adobe form'); return; }
      if (!o.text) { gap(n, 'text dropped (option text off)', 'migrate with text'); return; }
      const wrap = o.layout && ((n.outattr && o.output_option) || (n.cond && (o.condition_data || o.condition_layout)) || o.text_append);
      const xp = wrap ? lay(xParent, 'subform', encodeName(n.name), n, { layout: 'lr-tb' }) : xParent;
      outattr(n, xp);
      condLayout(n, wrap ? xp : null);
      if (k === 'text-element') {
        if (o.layout) lay(xp, 'draw', encodeName(n.name), n, { text: 'xhtml', appMode: n.attrs.appMode, style: n.attrs.style });
        const fields = n.attrs.fields || [];
        let cp = cParent;
        if ((fields.length && o.text_binding) || (n.cond && o.condition_data)) cp = ctx(cParent, 'folder', encodeName(n.name), n);
        condData(n, cp !== cParent ? cp : null);
        // MIGRATE_TEXT_ELEMENT: with text_placeholder every &field& becomes the literal "{FIELD}" in the text — no
        // field, no context node, no check; with text_binding a hidden field per &field& (parts as subforms) bound to a
        // context data node (parts as folders, under the text's folder) or to the loop work area it belongs to
        const sorted = [...new Set(fields.map((f) => f.toUpperCase()))].sort();
        if (o.text_placeholder) {
          if (sorted.length) gap(n, `fields print as literal placeholders {…} (option text_placeholder): ${sorted.slice(0, 4).join(', ')}${sorted.length > 4 ? ' …' : ''}`, 'migrate with text_binding, or bind each placeholder to a context field by hand');
        } else {
          // loop 1 (layout): m04 for an unsupported field, else its hidden field declaration — a subform per leading
          // part, shared with the previous field when the part names match, and a hidden field for the last part
          let lprev = [];
          for (const f of sorted) {
            if (!fieldSupported(f)) { say(n, 'm04', f); continue; }
            if (!o.layout) continue;
            const lparts = f.split(/[-.]/).map((x) => (/^<.*>$/.test(x) ? `X3C_${x.slice(1, -1)}` : x));
            let lparent = xp;
            const lnow = [];
            lparts.forEach((part, i) => {
              if (i === lparts.length - 1) { lay(lparent, 'field', part, n, { presence: 'hidden', bind: f }); return; }
              const reuse = lprev[i] && lprev[i].name === part ? lprev[i].node : null;
              const node = reuse || lay(lparent, 'subform', part, n);
              lnow.push({ name: part, node });
              lparent = node;
            });
            lprev = lnow;
          }
          // loop 2 (context): GET_XFT_FIELD_TYPE — system fields ('$' types) and fields that are no parameter of the
          // interface / global data (empty type) are skipped; work-area fields too (bound through the loop); the rest
          // get folders + data. A field skipped for an empty type keeps its hidden field, bound to nothing.
          let prev = [];
          for (const f of sorted) {
            if (!fieldSupported(f)) continue; // the context side (no message here; loop 1 logged m04)
            if (SYSTEM_TYPED.has(f)) continue;
            // SY / SFSY fields other than the '$' ones are no parameters either (an Adobe interface has none of them)
            if (!declaredPlain.has(fieldHead(f))) {
              gap(n, `field ${f} is not a parameter of the interface or the global data: GET_XFT_FIELD_TYPE finds no type, so SAP creates no context node — the hidden field stays bound to nothing and prints empty (no message)`, 'declare the field in the interface / global data, or bind the hidden field by hand');
              continue;
            }
            if (state.activeWas.some((w) => f.startsWith(w.toUpperCase()))) { entry(n).context.push(`field:${f} (loop work area)`); continue; }
            // folders for the leading parts are shared with the previous field when the names match (SAP's queue)
            const parts = f.split(/[-.]/);
            let parent = cp;
            const now = [];
            parts.forEach((part, i) => {
              if (i === parts.length - 1) { ctx(parent, 'data', /^<.*>$/.test(part) ? `X3C_${part.slice(1, -1)}` : part, n, { field: f }); return; }
              const reuse = prev[i] && prev[i].name === part ? prev[i].node : null;
              const node = reuse || ctx(parent, 'folder', part, n);
              now.push({ name: part, node });
              parent = node;
            });
            prev = now;
          }
        }
      } else if (k === 'text-include') {
        if (o.layout) lay(xp, 'field', encodeName(n.name), n, { ui: 'textEdit' });
        const c = ctx(cParent, 'text-include', encodeName(n.name), n, { key: n.attrs.key });
        condData(n, c);
      } else if (k === 'text-module') {
        if (o.layout) lay(xp, 'field', encodeName(n.name), n, { ui: 'textEdit' });
        const c = ctx(cParent, 'text-module', encodeName(n.name), n, { module: n.attrs.ref, ignoreMissing: n.attrs.ignoreMissing });
        condData(n, c);
      } else {
        if (o.layout) lay(xp, 'field', encodeName(n.name), n, { ui: 'textEdit' });
        const c = ctx(cParent, 'text-dynamic', encodeName(n.name), n);
        condData(n, c);
      }
      return;
    }
    if (k === 'graphic') {
      if (!o.graphic) { gap(n, 'graphic dropped (option graphic off)', 'migrate with graphic'); return; }
      const g = ctx(cParent, 'graphic-url', encodeName(n.name), n);
      condData(n, g);
      if (o.layout) {
        const inGraphicWindow = model.byId.get(n.parent)?.kind === 'window-graphic' || n.window && model.nodes.find((w) => w.name === n.window)?.kind === 'window-graphic';
        const xp = inGraphicWindow ? xParent : lay(xParent, 'subform', `${encodeName(n.name)}`, n);
        outattr(n, xp);
        condLayout(n, xp);
        const img = lay(xp, 'field', encodeName(n.name), n, { ui: 'imageEdit', align: n.attrs.align, href: n.attrs.dynamic ? '' : 'mime-url-of-bds-graphic' });
        if (n.attrs.dynamic) gap(n, 'graphic key holds a &field&: the image gets no URL (only fixed keys become MIME URLs)', 'bind the image to a context graphic node with the field');
        else img.bds = n.attrs.key;
      }
      return;
    }
    if (k === 'address') {
      if (!o.address) { gap(n, 'address dropped (option address off)', 'migrate with address'); return; }
      const xp = o.layout ? lay(xParent, 'subform', encodeName(n.name), n) : xParent;
      outattr(n, xp);
      condLayout(n, o.layout ? xp : null);
      if (o.layout) lay(xp, 'field', encodeName(n.name), n, { ui: 'textEdit' });
      const c = ctx(cParent, 'address', encodeName(n.name), n, { addressType: n.attrs.addrType, number: n.attrs.number, person: n.attrs.person });
      say(n, 'm02');
      condData(n, c);
      return;
    }
    if (k === 'command') {
      if (!o.command_pagebreak && !o.command_rest) { gap(n, 'command dropped (options command_pagebreak and command_rest off)', 'migrate with the command options'); return; }
      if (o.command_pagebreak && n.attrs.newPage) {
        lay(xParent, 'subform', encodeName(n.name), n, { break: { before: 'contentArea', page: n.attrs.pageName } });
        const target = model.pages.find((p) => p.name === n.attrs.pageName);
        const hasMain = target && model.nodes.some((w) => w.kind === 'window-main' && (w.pages || []).includes(target.name));
        if (n.attrs.pageName && !hasMain) gap(n, `page break to ${n.attrs.pageName}: that page has no main window, so SAP sets no break target`, 'set the break target in the Adobe layout');
      } else if (n.attrs.newPage) gap(n, 'page break dropped (option command_pagebreak off)', 'add a break in the Adobe layout');
      if (o.command_rest && n.attrs.spoolAttrs) ctx(cParent, 'command', encodeName(n.name), n);
      if (o.command_rest && n.attrs.extra.length) say(n, 'm06');
      if (!o.command_rest && (n.attrs.spoolAttrs || n.attrs.extra.length)) gap(n, `command attributes ${[n.attrs.spoolAttrs ? 'spool attributes' : '', ...n.attrs.extra].filter(Boolean).join(', ')} dropped (option command_rest off)`, 'rebuild in the Adobe form or the print program');
      return;
    }
    if (k === 'code') {
      if (!o.coding) { gap(n, 'program lines dropped (option coding off)', 'move the code into the interface initialization or the print program'); return; }
      const c = ctx(cParent, 'program-lines', encodeName(n.name), n);
      if (state.tableArea && !state.sortEvent) gap(n, 'program lines inside a table header / footer area: in the context they sit under the loop data of the table, so they run for every row (before the layout), not once at a page break or at the table end — totals collected there show running or per-row values, and the area prints the value of the row it binds to, not the page / grand total (no message)', 'compute the totals in the interface initialization (or a FormCalc Sum over the rows in the trailer) and drop the program lines from the area');
      if (state.sortEvent) gap(n, 'program lines inside a group begin / end area that SAP flattens into the table body: they now run for every row, so totals and counters are reset or added per row', 'move the group logic into the interface initialization code (grouped tables, precomputed subtotals)');
      for (const p of n.attrs.params) {
        if (!fieldSupported(p.name)) { say(n, 'm04', p.name); continue; }
        if (!p.name) { say(n, 'm14'); continue; }
      }
      condData(n, c);
      if (n.cond && Object.values(n.cond.layout || {}).some(Boolean)) { say(n, 'm03'); mark(n, 'layout'); }
      return;
    }
    if (k === 'alternative') {
      let cp = cParent, xp = xParent;
      if (n.attrs.cond?.length && o.condition_data && o.alternative_all && n.cond) {
        cp = ctx(cParent, 'folder', encodeName(n.name), n); condData(n, cp);
        if (o.layout) xp = lay(xParent, 'subform', encodeName(n.name), n);
      }
      let altC = cp, setX = xp;
      if (o.alternative_all && o.layout) { const sub = lay(xp, 'subform', encodeName(n.name), n); setX = lay(sub, 'subformSet', encodeName(n.name), n, { relation: 'choice' }); condLayout(n, xp !== xParent ? xp : sub); }
      if (o.alternative_all) { altC = ctx(cp, 'alternative', encodeName(n.name), n, { condition: (n.attrs.cond || []).map((c) => [c.LOP || '', c.OP1 || '', c.COP || '', c.OP2 || ''].join(' ').trim()) }); }
      else gap(n, o.alternative_true ? 'alternative: only the TRUE branch is migrated, without its condition (option alternative_true)' : 'alternative: both branches are migrated and print unconditionally (option alternative_all off)', 'rebuild the condition as a context alternative');
      for (const c of n.children) visit(c, altC, setX);
      return;
    }
    if (k === 'event-true' || k === 'event-false') {
      if (k === 'event-false' && o.alternative_true) { gap(n, 'FALSE branch dropped (option alternative_true)', 'rebuild the FALSE branch'); return; }
      let cp = cParent, xp = xParent;
      if (o.alternative_all) {
        cp = { ...cParent, children: (cParent.branches ||= { true: [], false: [] })[k === 'event-true' ? 'true' : 'false'] };
        xp = lay(xParent, 'subform', cParent.name || encodeName(n.name), n, { occur: ['0', '1'], branch: k === 'event-true' ? 'true' : 'false' });
        outattr(n, xp);
      }
      return go(cp, xp);
    }
    if (['folder', 'loop', 'table46', 'ctable', 'template', 'row', 'cell', 'section-complex'].includes(k)) return section(n, cParent, xParent);
    if (k === 'event-header' || k === 'event-footer') {
      const sec = state.sections[state.sections.length - 1];
      const flagSet = k === 'event-header' ? sec?.attrs.header : sec?.attrs.footer;
      const area = k === 'event-header' ? 'header' : 'footer';
      const anchor = k === 'event-header' ? state.evHeader : state.evFooter;
      let flag = false;
      if (o.header_footer) flag = sec?.kind === 'ctable' || sec?.kind === 'loop' ? o.table : sec?.kind === 'folder' ? o.folder : true;
      if (!flagSet) {
        // SmartForms never prints an area whose table has no output flag
        if (!anchor) { info(n, `${area} area: the table has no ${area} output flag, so SmartForms never prints it; SAP skips it as well (CHECK on the ${area} anchor) — nothing is lost`); markInfo(n); return; }
        // the anchor of an earlier table is never cleared (xft_section_ev_${area})
        if (flag && o.layout) { info(n, `${area} area without output flag: SAP builds it as a prototype subform that is placed nowhere (the anchor of the earlier table ${anchor.name} is reused, but no break is set) — it does not print, as in SmartForms`); const xp = lay(xParent, 'subform', `${encodeName(n.name)}-${area}`, n, { prototype: true, placed: false }); return go(cParent, xp); }
        gap(n, `${area} area without output flag: SmartForms never prints it, but SAP migrates its content into the flow (the anchor of the earlier table ${anchor.name} is never cleared and the ${area} option is off) — it prints once`, 'delete the area from the Adobe layout');
        return go(cParent, xParent);
      }
      if (['A', 'P'].includes(flagSet) && fieldsIn(n).length) gap(n, `${area} area at page breaks shows ${fieldsIn(n).slice(0, 4).join(', ')}: SmartForms prints the values current at each page break (running total, carry-forward); the Adobe form fills the context before the layout, so the overflow ${area === 'header' ? 'leader' : 'trailer'} shows the end value`, 'compute the page value in the layout: FormCalc / JavaScript sum of the rows on the current page (or a carry-forward script) in the overflow ' + (area === 'header' ? 'leader' : 'trailer'));
      let xp = xParent;
      if (flag && o.layout) {
        const when = flagSet === 'A' ? 'always (start + overflow ' + (k === 'event-header' ? 'leader' : 'trailer') + ')' : flagSet === 'B' ? 'at the start' : flagSet === 'E' ? 'at the end' : flagSet === 'P' ? 'at a page break (overflow)' : flagSet;
        xp = lay(xParent, 'subform', `${encodeName(n.name)}-${k === 'event-header' ? 'header' : 'footer'}`, n, { layout: 'position', keep: 'contentArea', occur: ['1', '1'], prototype: true, output: when });
      } else gap(n, `${k === 'event-header' ? 'header' : 'footer'} area printed in the flow once, not repeated at page breaks (option header_footer off or the table not migrated)`, 'make it an overflow leader / trailer in the Adobe layout');
      // the area's nodes go into the context under the table's loop data (the walk's parent): its program lines run for
      // every row in the context, not once at the page break / table end
      state.tableArea = (state.tableArea || 0) + 1;
      go(cParent, xp);
      state.tableArea--;
      return;
    }
    if (k === 'event-body') {
      const xp = o.table && o.layout ? lay(xParent, 'subform', encodeName(n.name), n, { layout: 'tb', body: true }) : xParent;
      return go(cParent, xp);
    }
    if (k === 'event-sort-begin' || k === 'event-sort-end' || k === 'event-other') {
      if (k === 'event-sort-begin') gap(n, `group begin (${n.attrs.sortField || 'sort field'}): no own branch in the migration — the area is placed in the table body, so its heading prints for every row and its program lines run (and reset) for every row`, 'group the data in the interface initialization (outer table per group, inner items, subtotal precomputed) and use nested context loops with the heading in the outer subform; a context condition cannot see the previous row — only a first-in-group flag filled by interface code works');
      else if (k === 'event-sort-end') gap(n, `group end (${n.attrs.sortField || 'sort field'}): no own branch in the migration — the area is placed in the table body, so it prints after every row with the values of that row, not the group subtotal`, 'put the subtotal row in the outer group subform after the items (value from interface code or FormCalc Sum(items[*].field)), or condition it on a last-in-group flag set by interface code');
      else gap(n, 'event area: no own branch in the migration — its content is placed in the table body and prints for every row', 'rebuild the event with a context condition or script');
      state.sortEvent = (state.sortEvent || 0) + 1;
      go(cParent, xParent);
      state.sortEvent--;
      return;
    }
    gap(n, `node type ${n.nodetype || k} has no branch in the migration`, 'rebuild by hand');
    go(cParent, xParent);
  };

  const markInfo = (n) => { for (const c of n.children) { info(c, 'inside an area that prints neither in SmartForms nor in the Adobe form'); markInfo(c); } };
  const fieldsIn = (n) => [...new Set([...(n.attrs?.fields || []), ...n.children.flatMap((c) => fieldsIn(c))])];

  const section = (n, cParent, xParent) => {
    const k = n.kind;
    const a = n.attrs;
    state.sections.push(n);
    let cp = cParent, xp = xParent;
    if (k === 'folder') {
      if (o.folder && o.layout) { xp = lay(xParent, 'subform', encodeName(n.name), n, { layout: 'lr-tb' }); outattr(n, xp); }
      if (o.folder || (n.cond && o.condition_data)) { cp = ctx(cParent, 'folder', encodeName(n.name), n); }
      if (o.condition_data && o.folder) condData(n, cp);
      if (o.folder) condLayout(n, xp !== xParent ? xp : null);
      if (!o.folder) gap(n, 'folder not kept as its own subform / context folder (option folder off); its content moves up a level', 'migrate with folder');
      if (a.header) state.evHeader = n; if (a.footer) state.evFooter = n;
    } else if (k === 'loop' || k === 'table46' || k === 'ctable') {
      if (k === 'table46') say(n, 'm07');
      const table = o.table;
      if (table && o.layout) {
        xp = lay(xParent, 'subform', encodeName(n.name), n, { layout: 'tb', table: k === 'ctable' });
        outattr(n, xp);
        const wa = lay(xp, 'subform', a.workArea, n, { layout: 'position', repeat: true });
        xp = lay(wa, 'subform', 'layout_top_to_bottom', n, { layout: 'tb' });
      }
      if (table) {
        const tname = a.table.replace('[]', '');
        if (state.activeWas.some((w) => tname.toUpperCase().startsWith(w.toUpperCase()))) cp = ctx(cParent, 'loop', encodeName(n.name), n, { table: tname, inWorkArea: true });
        else if (!declared.has(fieldHead(tname))) {
          // CREATE_LOOP raises for an unknown table: MIGRATE logs m05, then m13 in its CLEANUP and saves no form
          say(n, 'm05', tname); log[log.length - 1].predicted = true;
          if (!aborted) { aborted = { node: n.name, reason: `loop table ${tname} is not declared in the interface or the global data` }; say(n, 'm13'); }
        }
        else cp = ctx(cParent, 'loop', encodeName(n.name), n, { table: tname, workArea: a.workArea, firstLine: a.firstLine, lastLine: a.lastLine, where: a.where.map((w) => [w.LOP || '', w.OP1 || '', w.COP || '', w.OP2 || ''].join(' ').trim()) });
        // MIGRATE_LOOP: the loop data node is named after the work area (ENCODE_FS_NAME) and holds the rows
        const loopNode = cp !== cParent ? cp : null;
        if (loopNode) cp = ctx(cp, 'loop-data', /^<.*>$/.test(a.workArea) ? `X3C_${a.workArea.slice(1, -1)}` : a.workArea, n);
        if (a.calc.length) say(n, 'm09');
        if (a.sort.length) say(n, 'm10');
        condData(n, loopNode);
        condLayout(n, xp !== xParent ? xp : null);
      } else {
        gap(n, 'table / loop not migrated as a repeating node (option table off): its content is migrated once, without the loop', 'migrate with table or build the loop by hand');
        if (a.calc.length || a.sort.length) gap(n, `${[a.calc.length ? 'calculations' : '', a.sort.length ? 'sort criteria' : ''].filter(Boolean).join(' and ')} not migrated`, 'calculate in the interface code or the print program');
        }
      state.activeWas.unshift(a.workArea);
      if (a.header) state.evHeader = n; if (a.footer) state.evFooter = n;
      for (const c of n.children) visit(c, cp, xp);
      state.activeWas.splice(state.activeWas.indexOf(a.workArea), 1);
      state.sections.pop();
      return;
    } else if (k === 'template') {
      if (o.template && o.layout) { xp = lay(xParent, 'subform', encodeName(n.name), n, { layout: 'table', template: true }); outattr(n, xp); }
      if (o.template) { cp = ctx(cParent, 'folder', encodeName(n.name), n); condData(n, cp); condLayout(n, xp !== xParent ? xp : null); }
      else gap(n, 'template not migrated (option template off): its content is migrated without the grid', 'migrate with template');
      state.templates.push({ node: n, used: new Set() });
      for (const c of n.children) visit(c, cp, xp);
      state.templates.pop();
      state.sections.pop();
      return;
    } else if (k === 'row') {
      if (o.table && o.layout) { xp = lay(xParent, 'subform', encodeName(n.name), n, { layout: 'row', lineType: n.outattr?.lineType || '' }); outattr(n, xp); condLayout(n, xp); }
      if (o.table) { cp = ctx(cParent, 'folder', encodeName(n.name), n); condData(n, cp); }
    } else if (k === 'cell') {
      if (o.table && o.layout) { xp = lay(xParent, 'subform', encodeName(n.name), n, { cell: true }); outattr(n, xp); }
    } else if (k === 'section-complex') {
      say(n, 'm08');
      if (o.layout) { xp = lay(xParent, 'subform', encodeName(n.name), n); outattr(n, xp); }
      if (o.layout) cp = ctx(cParent, 'folder', encodeName(n.name), n);
    }
    for (const c of n.children) visit(c, cp, xp);
    state.sections.pop();
  };

  if (model.formType !== 'form') {
    for (const n of model.nodes) { entry(n); gap(n, `${model.formType}: MIGRATE converts forms; a ${model.formType} has no page tree, so SAP would create an empty Adobe form (interface only)`, 'migrate the forms that use it; the text module becomes a context text-module node there'); }
  } else if (model.root && o.context) visit(model.root, context, root);
  else if (!o.context) for (const n of model.nodes) { entry(n); gap(n, 'option context off: no form / context / layout is created', 'migrate with context'); }

  // condition parts SAP does not carry over for a node (option off, or no condition handling in that method)
  for (const n of model.nodes) {
    if (!n.cond || !entries.has(n.id)) continue;
    const a = applied.get(n.id) || {};
    if (n.cond.data.length && !a.data) gap(n, `data condition not migrated (${o.condition_data ? `${METHOD[n.kind] || 'this node'} takes none here` : 'option condition_data off'}): the node prints unconditionally`, 'add the condition in the context');
    const lc = Object.keys(n.cond.layout || {}).filter((k) => n.cond.layout[k]);
    if (lc.length && !a.layout) gap(n, `layout condition ${lc.join(', ')} not migrated (${o.condition_layout ? `${METHOD[n.kind] || 'this node'} takes none here` : 'option condition_layout off'})`, layoutAction(n, lc));
  }
  // every node exactly once: anything the walk did not reach (should not happen) is a gap, never left out
  for (const n of model.nodes) if (!entries.has(n.id)) { entry(n); gap(n, 'not reached by the migration walk', 'check the node in the SmartForm'); }
  const nodes = model.nodes.map((n) => entries.get(n.id));
  // a window shown again on a later page is the same node; its occurrences are listed apart
  const windowRefs = [...entries.values()].filter((e) => model.byId.get(e.id)?.ref).map((e) => ({ ...e, of: model.byId.get(e.id).ref, page: model.byId.get(e.id).page }));
  for (const r of windowRefs) { const first = entries.get(r.of); if (first) { first.layout.push(...r.layout); first.context.push(...r.context); first.messages.push(...r.messages); first.gaps.push(...r.gaps); first.infos.push(...r.infos); if (r.status === 'gap' || (r.status === 'warning' && first.status === 'mapped')) first.status = r.status; } }
  const gaps = nodes.flatMap((e) => [...e.messages.filter((m) => m.type === 'E').map((m) => ({ node: e.name || e.kind, path: e.path, kind: e.kind, reason: m.text, action: ACTION[m.code] || 'rework in the Adobe form', logged: true, code: m.code })),
    ...e.gaps.map((g) => ({ node: e.name || e.kind, path: e.path, kind: e.kind, ...g }))]);
  // form-wide: MIGRATE builds the layout in the logon language only (CL_FP_FORM=>CREATE( sy-langu ), texts converted from
  // the text of the logon language) — the SmartForm's translations are not carried over
  const langs = [...new Set([model.masterLanguage, ...(model.languages || [])].filter(Boolean))].sort();
  if (model.formType === 'form' && langs.length > 1) gaps.push({ node: model.form, path: model.form, kind: 'form', logged: false,
    reason: `layout translations not migrated: MIGRATE builds the Adobe layout in the logon language only; the SmartForm has texts in ${langs.length} languages (SAP keys ${langs.join(', ')}; master ${model.masterLanguage || '?'}); every other language then prints the logon language's texts (dates and numbers still follow the output language)`,
    action: 'translate the Adobe form (SE63 / XLIFF), or migrate once per language' });
  const infos = nodes.flatMap((e) => [...new Set(e.infos)].map((note) => ({ node: e.name || e.kind, path: e.path, kind: e.kind, note })));
  const count = (s) => nodes.filter((e) => e.status === s).length;
  return {
    form: model.form, formType: model.formType, options: o, names: { form: fpForm, interface: fpIntf }, result: aborted ? 'aborted' : 'migrated', aborted,
    interface: iface, context, layout, log, nodes, windowRefs: windowRefs.map((r) => ({ id: r.id, of: r.of, page: r.page, layout: r.layout })), gaps, infos,
    completeness: { nodes: nodes.length, mapped: count('mapped'), warning: count('warning'), gap: count('gap'), silent: gaps.filter((g) => !g.logged).length,
      byKind: Object.fromEntries([...new Set(nodes.map((e) => e.kind))].map((kk) => [kk, { mapped: nodes.filter((e) => e.kind === kk && e.status !== 'gap').length, gap: nodes.filter((e) => e.kind === kk && e.status === 'gap').length }])) },
  };
}

const ACTION = {
  m01: 'give each template cell one output node', m05: 'declare the field in the interface or global data', m07: 'the context loop and its fields are kept; only the 4.6C formatting is lost (line types, cells, widths, borders, shading — MIGRATE_TABLE_46C treats the table as a loop): rebuild it as a Designer table with a repeating body row bound to the loop, widths and borders from the old line types',
  m08: 'rebuild the section by hand', m09: 'calculate totals in the interface code or the print program', m10: 'sort in the print program or the interface code',
  m12: 'pick a supported page format (A3 / A4 / A5 / letter / legal / executive / Japanese postcard)',
};

// node kind → the CL_SSF_MIGRATION method SAP calls for it
const METHOD = {
  'page-root': 'MIGRATE_PAGE_ROOT', page: 'MIGRATE_PAGE', 'control-root': '(children only)', 'text-element': 'MIGRATE_TEXT_ELEMENT', 'text-include': 'MIGRATE_TEXT_INCLUDE',
  'text-module': 'MIGRATE_TEXT_MODULE', 'text-dynamic': 'MIGRATE_TEXT_DYNAMIC', 'text-other': '(none)', graphic: 'MIGRATE_GRAPHIC', address: 'MIGRATE_ADDRESS', command: 'MIGRATE_COMMAND',
  code: 'MIGRATE_CODE', alternative: 'MIGRATE_ALTERNATIVE', folder: 'MIGRATE_FOLDER', loop: 'MIGRATE_LOOP', table46: 'MIGRATE_TABLE_46C → MIGRATE_LOOP', ctable: 'MIGRATE_CTABLE',
  template: 'MIGRATE_TEMPLATE', row: 'MIGRATE_ROW', cell: 'MIGRATE_CELL', 'section-complex': 'MIGRATE_COMPLEX_SECTION', 'event-header': 'MIGRATE_EVENT_HEADER',
  'event-body': 'MIGRATE_EVENT_BODY', 'event-footer': 'MIGRATE_EVENT_FOOTER', 'event-true': 'MIGRATE_EVENT_TRUE', 'event-false': 'MIGRATE_EVENT_FALSE',
  'event-sort-begin': '(children only)', 'event-sort-end': '(children only)', 'event-other': '(children only)', reference: '(none)', unknown: '(none)',
  'window-main': 'MIGRATE_WINDOW', 'window-secondary': 'MIGRATE_WINDOW', 'window-graphic': 'MIGRATE_WINDOW', 'window-address': 'MIGRATE_WINDOW', 'window-copies': 'MIGRATE_WINDOW',
  'window-final': 'MIGRATE_WINDOW', 'window-ref': 'MIGRATE_WINDOW (same window on a later page)',
};

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const args = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  if (!args[0]) { console.error('Usage: node sf-to-adobe-plan.mjs <form.xml> [--options full|sap-default|<file.json>] [--form <name>] [--interface <name>]'); process.exit(2); }
  try {
    const opt = get('--options') || 'full';
    const options = ['full', 'sap-default'].includes(opt) ? opt : JSON.parse(readFileSync(resolve(opt), 'utf8'));
    const plan = planMigration(loadSmartForm(readFileSync(resolve(args[0]), 'utf8')), { options, formName: get('--form') || '', interfaceName: get('--interface') || '' });
    console.log(JSON.stringify(plan, null, 1));
  } catch (e) { console.error(`sf-to-adobe-plan: ${e.message}`); process.exit(1); }
}

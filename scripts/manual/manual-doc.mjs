// sc4sap:program-to-manual — the manual as a document of the web's manual workbench (no files, no SAP).
//
//   manualDocFromPage(html)                  a manual page (built by build-manual.mjs, or saved from its edit mode)
//                                            → { kind: 'manual', manual, version, history } | null
//   normalizeManualDoc(doc, prev?)           defaults; `prev`: the stored document, whose revision history is kept
//                                            (the page carries only the revisions recorded since it was opened)
//   checkManualDoc(doc)                      { errors, warnings } (manualWarnings: anchors, checkpoints, language mix)
//   manualDocPage(doc, { date })             the page itself (renderManualHtml) — the page contract SC4SAP_PAGE is
//                                            in its editor script (manual-editor.mjs)
//   manualDocId(manual)                      <PROGRAM>-<lang>
//   applyManualOps(doc, ops)                 AI proposals, item by item → { doc, applied, skipped }
//
// What an AI proposal may set: the manual's prose only — intro texts and business rules, scenario titles and goals,
// step titles / notes / results, checkpoints, message causes and actions, glossary descriptions (and new glossary
// entries, checkpoints, business rules), field descriptions. Never the screens or their callouts (text, details,
// anchor, position — user decision 2026-11-17), the program, its TCode, menu path, fields, messages' ids, the
// version or history.

import { manualWarnings, renderManualHtml } from './build-manual.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v, max = 4000) => (v == null ? '' : String(v)).slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);
const VERSION = /^\d+\.\d+$/;

export const MANUAL_DOC_ID = /^[A-Za-z0-9_/-]{1,60}$/;

export function manualDocId(manual) {
  const program = String(manual?.program || 'PROGRAM').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 50);
  return `${program}-${String(manual?.lang || 'ko').slice(0, 2)}`;
}

/** Revisions by version, the newer entry of a version winning; sorted. */
function mergeHistory(a, b) {
  const by = new Map();
  for (const v of [...arr(a), ...arr(b)]) if (v && VERSION.test(String(v.version))) by.set(String(v.version), { version: String(v.version), date: str(v.date, 10), author: str(v.author, 120), note: str(v.note, 500), ...(v.source ? { source: str(v.source, 20) } : {}) });
  const key = (v) => v.split('.').map(Number);
  return [...by.values()].sort((x, y) => key(x.version)[0] - key(y.version)[0] || key(x.version)[1] - key(y.version)[1]);
}

export function normalizeManualDoc(raw, prev = null) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const manual = d.manual && typeof d.manual === 'object' ? d.manual : {};
  const version = VERSION.test(String(d.version)) ? String(d.version) : VERSION.test(String(prev?.version)) ? String(prev.version) : '1.0';
  return { kind: 'manual', manual, version, history: mergeHistory(prev?.history, d.history) };
}

export function manualDocFromPage(html) {
  const m = /<script type="application\/json" id="manual-source">([\s\S]*?)<\/script>/.exec(String(html || ''));
  if (!m) return null;
  try {
    const src = JSON.parse(m[1]);
    if (!src?.manual || typeof src.manual !== 'object' || !src.manual.program) return null;
    return normalizeManualDoc({ manual: src.manual, version: src.version, history: src.history });
  } catch {
    return null;
  }
}

export function checkManualDoc(doc) {
  const d = normalizeManualDoc(doc);
  const errors = [];
  if (!d.manual.program) errors.push('manual.program is missing');
  if (!arr(d.manual.scenarios).length) errors.push('the manual has no scenarios');
  let warnings = [];
  try { warnings = manualWarnings(d.manual); } catch (e) { warnings = [`could not check: ${e.message}`]; }
  return { errors, warnings };
}

export function manualDocPage(doc, { date = '' } = {}) {
  const d = normalizeManualDoc(doc);
  const last = d.history.at(-1);
  return renderManualHtml(d.manual, { version: d.version, date: date || last?.date || today(), config: { ...(d.manual.meta || {}) }, history: d.history });
}

// ── AI proposals ────────────────────────────────────────────────────────────────────────────────────────────
/** Paths of the manual's prose. A proposal may set exactly these, on rows that already exist. */
export const MANUAL_TEXT_PATHS = [
  /^intro\.(purpose|background|users)$/,
  /^intro\.businessRules\[\d+\]$/,
  /^scenarios\[\d+\]\.(title|goal)$/,
  /^scenarios\[\d+\]\.steps\[\d+\]\.(title|note|result)$/,
  /^scenarios\[\d+\]\.checkpoints\[\d+\](\.text)?$/,
  /^messages\[\d+\]\.(cause|action)$/,
  /^glossary\[\d+\]\.description$/,
  /^fields\.(selection|output)\[\d+\]\.description$/,
];
/** Lists a proposal may add one text row to. */
const ADD_LISTS = { 'intro.businessRules': 'text', glossary: 'entry', checkpoints: 'text' };

const steps = (path) => path.match(/[^.[\]]+/g) || [];
function holder(root, path) {
  const ks = steps(path);
  const last = ks.pop();
  let o = root;
  for (const k of ks) { if (o == null || typeof o !== 'object') return null; o = o[/^\d+$/.test(k) ? Number(k) : k]; }
  return o != null && typeof o === 'object' ? { o, k: /^\d+$/.test(last) ? Number(last) : last } : null;
}

/**
 * ops: { op: 'set', path, value } — a prose path that exists
 *      | { op: 'add', list: 'intro.businessRules', text } | { op: 'add', list: 'glossary', term, description }
 *      | { op: 'add', list: 'checkpoints', scenario: <index>, text }
 */
export function applyManualOps(doc0, ops) {
  const doc = normalizeManualDoc(JSON.parse(JSON.stringify(doc0 || {})));
  const m = doc.manual;
  const applied = [], skipped = [];
  for (const op of arr(ops)) {
    const why = (reason) => skipped.push({ op, reason });
    if (!op || typeof op !== 'object') { why('not an object'); continue; }
    if (op.op === 'set') {
      const path = String(op.path || '');
      if (!MANUAL_TEXT_PATHS.some((re) => re.test(path))) { why(`${path.slice(0, 80)} is not a text a proposal may set`); continue; }
      const h = holder(m, path);
      if (!h || !(h.k in h.o) || (typeof h.o[h.k] === 'object' && h.o[h.k] !== null)) { why(`${path.slice(0, 80)} does not exist`); continue; }
      h.o[h.k] = str(op.value, 4000); applied.push(op);
    } else if (op.op === 'add') {
      if (typeof op.list !== 'string' || !Object.hasOwn(ADD_LISTS, op.list)) { why(`rows cannot be added to ${String(op.list).slice(0, 40)}`); continue; }
      if (op.list === 'intro.businessRules') {
        const t = str(op.text, 1000); if (!t) { why('an empty rule'); continue; }
        m.intro = m.intro || {}; m.intro.businessRules = [...arr(m.intro.businessRules), t]; applied.push(op);
      } else if (op.list === 'glossary') {
        const term = str(op.term, 120), description = str(op.description, 1000);
        if (!term || !description) { why('a glossary entry needs a term and a description'); continue; }
        if (arr(m.glossary).some((g) => String(g.term).toLowerCase() === term.toLowerCase())) { why(`${term} is in the glossary already`); continue; }
        m.glossary = [...arr(m.glossary), { term, description }]; applied.push(op);
      } else {
        const sc = arr(m.scenarios)[Number(op.scenario)];
        const t = str(op.text, 1000);
        if (!sc) { why(`no scenario ${op.scenario}`); continue; }
        if (!t) { why('an empty checkpoint'); continue; }
        sc.checkpoints = [...arr(sc.checkpoints), t]; applied.push(op);
      }
    } else why(`unknown op ${String(op.op).slice(0, 30)}`);
  }
  return { doc: normalizeManualDoc(doc), applied, skipped };
}

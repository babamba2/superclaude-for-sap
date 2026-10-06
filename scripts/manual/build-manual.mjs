// sc4sap:program-to-manual — builds the end-user manual (one self-contained HTML).
//
// INPUT  manual.json written by sap-writer (schema: skills/program-to-manual/manual-schema.md)
// OUTPUT <out-dir>/<PROGRAM>-v<version>-<lang>.html
//        <out-dir>/<PROGRAM>-<lang>.history.json   (revision history, one entry per version)
//        <out-dir>/_src/<PROGRAM>-v<version>-<lang>.manual.json   (the input, for regeneration)
//
// Screens are drawn with the program-to-spec renderer (screen-image-renderer.mjs)
// and inlined as SVG — no headless browser is needed. Each step's callouts name
// the element they point at by its data-anchor key (sel:P_WERKS, col:MATNR,
// pai:SEND, …); the page script draws the numbered marks, and this builder
// warns about any key the drawn screen does not contain.
//
// CLI
//   node build-manual.mjs <manual.json> [--out-dir DIR] [--same-version] [--major]
//     --same-version  rebuild the latest version in place (review loop) instead of adding one
//     --major         next version is <major+1>.0 instead of <major>.<minor+1>
//   Prints warnings, then a JSON manifest { html, version, history, source, warnings }.
//   node build-manual.mjs --import <edited.html> <manual.json>
//     writes the manual.json a user saved from the page's edit mode (backs up the old one as .bak)
//     and adds the revision the page recorded on save (+0.1, author, note) to history.json —
//     rebuild with --same-version to publish exactly that version

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderSelectionScreenSVG, renderAlvScreenSVG, renderFlowchartSVG, renderProcessFlowSVG, selectionSchemaWarnings,
  toFreeFlow, freeFlowOptions,
} from '../spec/screen-image-renderer.mjs';
import { FLOW_EDITOR_STYLE, FLOW_EDITOR_SCRIPT, flowEditorLabels } from '../spec/flow-editor.mjs';
import { looksLikeEnglishProse } from '../spec/build-spec.mjs';
import { resolveArtifactBase, readScreenTheme } from '../lib/profile-resolve.mjs';
import { readManualConfig } from './manual-config.mjs';
import { labelsFor, STYLE, SCRIPT, LINK_SCRIPT } from './manual-page.mjs';
import { renderExcelSheetSVG } from './excel-sheet-svg.mjs';
import { EDITOR_STYLE, EDITOR_SCRIPT, QUILL_CSS, QUILL_JS, editorLabels } from './manual-editor.mjs';

/** JSON inside a <script> element: nothing in it may close the element. */
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const embedJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/**
 * Escaped text with **bold**, ==highlight==, `code`, line breaks and "- " bullet lines —
 * the same markup the page's edit mode writes (manual-editor.mjs).
 */
const inline = (s) => String(s ?? '').split(/\r?\n/).map((line) => {
  const bullet = line.startsWith('- ');
  const html = esc(bullet ? line.slice(2) : line)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/==([^=]+)==/g, '<mark class="em">$1</mark>');
  return bullet ? `<span class="bl">${html}</span>` : html;
}).join('<br>');
const arr = (x) => (Array.isArray(x) ? x.filter(v => v != null) : []);
const slug = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, '-');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Screens ─────────────────────────────────────────────────────────────

const isSelection = (key, spec) => key === 'selection' || spec?.kind === 'selection'
  || (spec?.kind !== 'excel' && !spec?.columns && !spec?.panes && (Array.isArray(spec?.blocks) || Array.isArray(spec?.fields)));

/** Selection spec with a step's input values: param/range defaults, checkbox ticks, the chosen radio. */
export function applySelectionValues(selection, values) {
  if (!values || typeof values !== 'object') return selection;
  const has = (n) => n && Object.prototype.hasOwnProperty.call(values, n);
  const item = (it) => {
    if (!it || typeof it !== 'object') return it;
    const t = it.type || (it.range ? 'range' : 'param');
    if (t === 'frame') return { ...it, items: arr(it.items).map(item) };
    if (t === 'radioGroup' && arr(it.options).some(o => has(o.name) && values[o.name])) {
      return { ...it, options: arr(it.options).map(o => ({ ...o, selected: Boolean(has(o.name) && values[o.name]) })) };
    }
    if (t === 'checkboxGroup') {
      return { ...it, options: arr(it.options).map(o => (has(o.name) ? { ...o, checked: Boolean(values[o.name]) } : o)) };
    }
    if (!has(it.name)) return it;
    const v = values[it.name];
    if (t === 'checkbox') return { ...it, checked: Boolean(v) };
    if (Array.isArray(v)) return { ...it, default: v[0] ?? '', defaultHigh: v[1] ?? '' };
    return { ...it, default: v };
  };
  return {
    ...selection,
    blocks: selection.blocks ? arr(selection.blocks).map(b => ({ ...b, items: arr(b.items).map(item) })) : selection.blocks,
    fields: selection.fields ? arr(selection.fields).map(item) : selection.fields,
    optionFields: selection.optionFields ? arr(selection.optionFields).map(f => item({ type: 'checkbox', ...f })) : selection.optionFields,
  };
}

/** Inline SVG without the XML prolog, never drawn wider than its natural size (a small popup stays small). */
const fitSvg = (svg) => String(svg).replace(/^<\?xml[^>]*\?>\s*/, '')
  .replace(/^<svg([^>]*?)\swidth="(\d+)"/, (m, attrs, w) => `<svg${attrs} width="${w}" style="max-width:${w}px"`);

/** A screenshot the user put in place of the drawn screen (edit mode): { src: data URI, width, height }. */
function imageSvg(img) {
  const w = Math.round(Number(img.width) || 1200), h = Math.round(Number(img.height) || 700);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="${esc(img.src)}" x="0" y="0" width="${w}" height="${h}"/></svg>`;
}

export function renderStepScreen(manual, step) {
  if (step?.image?.src) return { key: 'image', image: true, svg: fitSvg(imageSvg(step.image)) };
  const key = step?.screen;
  if (!key) return null;
  const base = manual.screens?.[key];
  if (!base) return { key, error: `screen "${key}" is not in manual.screens` };
  const spec = { ...base, ...(step.patch && typeof step.patch === 'object' ? step.patch : {}) };
  const lang = manual.lang || 'ko';
  const svg = spec.kind === 'excel' ? renderExcelSheetSVG(spec)
    : isSelection(key, spec)
    ? renderSelectionScreenSVG({ ...applySelectionValues(spec, step.values), lang, theme: manual.theme })
    : renderAlvScreenSVG(spec, { lang, theme: manual.theme });
  return { key, svg: fitSvg(svg) };
}

export const svgAnchors = (svg) => [...String(svg).matchAll(/data-anchor="([^"]*)"/g)].map(m => unesc(m[1]));

function anchorCount(anchors, anchor) {
  // Only a trailing #<digits> picks the nth match — labels may contain '#' themselves.
  const [, key, nth] = /^([\s\S]*?)(?:#(\d+))?$/.exec(String(anchor));
  return anchors.filter(a => a === key).length >= (Number(nth) || 1);
}

// ── Checks ──────────────────────────────────────────────────────────────

export function manualWarnings(manual) {
  const warns = [];
  const L = manual.lang || 'ko';
  if (!manual.program) warns.push('manual.program is missing');
  if (!arr(manual.scenarios).length) warns.push('manual.scenarios is empty — a manual needs at least one scenario');
  for (const [key, spec] of Object.entries(manual.screens || {})) {
    if (isSelection(key, spec)) for (const w of selectionSchemaWarnings(spec)) warns.push(`screens.${key}: ${w}`);
  }
  arr(manual.scenarios).forEach((sc, si) => {
    arr(sc.steps).forEach((st, ti) => {
      const where = `scenario ${si + 1} step ${ti + 1}`;
      const drawn = renderStepScreen(manual, st);
      if (drawn?.error) { warns.push(`${where}: ${drawn.error}`); return; }
      const anchors = drawn ? svgAnchors(drawn.svg) : [];
      arr(st.callouts).forEach((c, ci) => {
        if (!c.anchor || drawn?.image) return; // a screenshot has no anchors — its marks use `pos`
        if (!drawn) warns.push(`${where} callout ${ci + 1}: anchor "${c.anchor}" but the step has no screen`);
        else if (!anchorCount(anchors, c.anchor)) {
          warns.push(`${where} callout ${ci + 1}: anchor "${c.anchor}" is not on screen "${drawn.key}" — available: ${[...new Set(anchors)].join(', ') || '(none)'}`);
        }
      });
    });
    if (!arr(sc.checkpoints).length) warns.push(`scenario ${si + 1} "${sc.title || ''}" has no checkpoints — derive them from the source validations or confirm there are none`);
  });
  if (L === 'ko' || L === 'ja') {
    const prose = [];
    const add = (path, v) => { if (v && looksLikeEnglishProse(v)) prose.push(`${path}: ${JSON.stringify(String(v).slice(0, 70))}`); };
    const intro = manual.intro || {};
    ['purpose', 'background', 'users'].forEach(k => add(`intro.${k}`, intro[k]));
    arr(intro.businessRules).forEach((r, i) => add(`intro.businessRules[${i}]`, r));
    arr(manual.scenarios).forEach((sc, si) => {
      add(`scenarios[${si}].title`, sc.title); add(`scenarios[${si}].goal`, sc.goal);
      arr(sc.steps).forEach((st, ti) => {
        ['title', 'note', 'result'].forEach(k => add(`scenarios[${si}].steps[${ti}].${k}`, st[k]));
        arr(st.callouts).forEach((c, ci) => {
          add(`scenarios[${si}].steps[${ti}].callouts[${ci}]`, c.text);
          arr(c.details).forEach((d, di) => add(`scenarios[${si}].steps[${ti}].callouts[${ci}].details[${di}]`, d));
        });
      });
      arr(sc.checkpoints).forEach((c, ci) => add(`scenarios[${si}].checkpoints[${ci}]`, typeof c === 'string' ? c : c?.text));
    });
    arr(manual.messages).forEach((m, i) => { add(`messages[${i}].cause`, m.cause); add(`messages[${i}].action`, m.action); });
    arr(manual.glossary).forEach((g, i) => add(`glossary[${i}].description`, g.description));
    for (const k of ['selection', 'output']) arr(manual.fields?.[k]).forEach((f, i) => add(`fields.${k}[${i}].description`, f.description));
    if (prose.length) warns.push(`LANGUAGE MIX (lang=${L}) — translate:\n    · ${prose.slice(0, 30).join('\n    · ')}${prose.length > 30 ? `\n    · … (${prose.length - 30} more)` : ''}`);
  }
  return warns;
}

// ── Revision history ────────────────────────────────────────────────────

export function nextVersion(history, { sameVersion = false, major = false } = {}) {
  const last = arr(history?.versions).at(-1)?.version;
  if (!last) return '1.0';
  if (sameVersion) return last;
  const [ma, mi] = String(last).split('.').map(n => Number(n) || 0);
  return major ? `${ma + 1}.0` : `${ma}.${mi + 1}`;
}

// ── Page ────────────────────────────────────────────────────────────────

function table(head, rows) {
  if (!rows.length) return '';
  return `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/**
 * A table whose rows the edit mode can add and delete: the table names the array it
 * shows (data-array) and its columns (data-cols: key + kind), each row is one item of
 * that array (data-row), each cell names its key in the item — data-c for text,
 * data-flag for a ● yes/no column. Column `keys` lists fallbacks (header, then label).
 */
function editTable(arrayPath, cols, items, nums) {
  if (!items.length) return '';
  const cell = (col, item, i) => {
    if (col.kind === 'num') return `<td class="fnum">${esc(nums?.[i] ?? '')}</td>`; // read-only, set by the build / edit mode
    const key = col.keys.find(k => item[k] != null) ?? col.keys[0];
    if (col.kind === 'flag') return `<td data-flag="${esc(key)}">${item[key] ? '●' : ''}</td>`;
    const span = `<span data-c="${esc(key)}">${inline(item[key] ?? '')}</span>`;
    return `<td>${col.kind === 'code' ? `<code>${span}</code>` : span}</td>`;
  };
  const spec = cols.map(c => ({ key: c.keys?.[0] ?? '', kind: c.kind || 'text' }));
  return `<table class="ed-table" data-array="${esc(arrayPath)}" data-cols="${esc(JSON.stringify(spec))}">`
    + `<thead><tr>${cols.map(c => `<th${c.kind === 'num' ? ' class="fnum"' : ''}>${esc(c.head)}</th>`).join('')}</tr></thead>`
    + `<tbody>${items.map((it, i) => `<tr data-row="${i}">${cols.map(c => cell(c, it, i)).join('')}</tr>`).join('')}</tbody></table>`;
}

// ── Field reference figures ─────────────────────────────────────────────
// The selection screen and the output grid drawn above their field tables, every
// field / column the table lists numbered on the picture (callouts sel:<name> /
// col:<name>) and in the table's # column, in table order. Rows whose field is not
// on the drawn screen (hidden fields, file columns) get no number.

/** Anchors a table row may point at: its name, or each name in "P_DIST2 / P_DIST1". */
const rowAnchors = (prefix, name) => String(name ?? '').split(/[\s/,]+/).filter(Boolean).map(n => `${prefix}:${n}`);

/**
 * Screens to draw for a field table, in order: the selection screen; for output
 * columns the grid showing most of them, then the grid (popup) showing most of the
 * rest, and so on. Returns [{ key, svg, anchors }].
 */
export function fieldScreens(manual, kind, items) {
  const keys = Object.keys(manual.screens || {});
  const draw = (k) => { const d = renderStepScreen(manual, { screen: k }); return d?.svg ? { key: k, svg: d.svg, anchors: new Set(svgAnchors(d.svg)) } : null; };
  if (kind === 'selection') {
    const k = keys.find(x => isSelection(x, manual.screens[x]));
    const d = k && draw(k);
    return d ? [d] : [];
  }
  const grids = keys.filter(k => !isSelection(k, manual.screens[k]) && manual.screens[k]?.kind !== 'excel').map(draw).filter(Boolean);
  const out = [];
  let rest = items.map(it => rowAnchors('col', it.name));
  for (;;) {
    let best = null, bestHits = 0;
    for (const g of grids) {
      if (out.includes(g)) continue;
      const hits = rest.filter(as => as.some(a => g.anchors.has(a))).length;
      if (hits > bestHits) { best = g; bestHits = hits; }
    }
    if (!best) return out;
    out.push(best);
    rest = rest.filter(as => !as.some(a => best.anchors.has(a)));
  }
}

/** { html, nums, missing }: the numbered figures for a field table, the # of each row, the rows on no screen. */
export function fieldFigure(manual, kind, items, arrayPath) {
  const figs = fieldScreens(manual, kind, items);
  const prefix = kind === 'selection' ? 'sel' : 'col';
  const marks = figs.map(() => []), nums = [], missing = [];
  let no = 0;
  items.forEach((it) => {
    const cands = rowAnchors(prefix, it.name);
    const fi = figs.findIndex(f => cands.some(a => f.anchors.has(a)));
    if (fi < 0) { nums.push(''); missing.push(String(it.name ?? '')); return; }
    no += 1;
    nums.push(String(no));
    marks[fi].push([no, cands.find(a => figs[fi].anchors.has(a)), null, null]);
  });
  const html = figs.map((f, i) => (marks[i].length
    ? `<figure class="screen field-fig" data-for="${esc(arrayPath)}" data-prefix="${prefix}" data-fig="${i}" data-callouts="${esc(JSON.stringify(marks[i]))}">${f.svg}</figure>`
    : '')).join('');
  return { html, nums: no ? nums : [], missing };
}

// Editable text carries its manual.json path so the page's edit mode (manual-editor.mjs)
// can write changes back: data-p = absolute path, data-k = path inside the step.
const ed = (path, s, attr = 'data-p') => `<span ${attr}="${esc(path)}">${inline(s)}</span>`;

/**
 * A bullet list whose items the edit mode can add and delete: the list names the
 * array it shows (data-list), each <li data-i> is one item, its text sits in
 * <span data-l>. An item may be a string or { text, … } (check points keep `source`).
 * `extra(item)` adds read-only markup after the text (badges, source).
 */
function editList(arrayPath, items, extra = () => '') {
  return `<ul class="ed-list" data-list="${esc(arrayPath)}">${items.map((it, i) => {
    const text = typeof it === 'string' ? it : it?.text ?? '';
    return `<li data-i="${i}"><span data-l="">${inline(text)}</span>${extra(it)}</li>`;
  }).join('')}</ul>`;
}
const stepEd = (key, s) => ed(key, s, 'data-k');

/** One callout's mark data for the page script: [number, anchor, offset, pos]. */
const markOf = (c, i) => [i + 1, c.anchor || '', Array.isArray(c.offset) ? c.offset : null, Array.isArray(c.pos) ? c.pos : null];

// A callout always has its details list (empty when none) so the edit mode can add the first one.
function calloutsHtml(callouts) {
  return `<ol class="callouts">${callouts.map((c, i) => `<li data-ci="${i}"><span class="num">${i + 1}</span><div>${stepEd(`callouts.${i}.text`, c.text)}`
    + `<ul>${arr(c.details).map((d, di) => `<li>${stepEd(`callouts.${i}.details.${di}`, d)}</li>`).join('')}</ul></div></li>`).join('')}</ol>`;
}

/** A step note, one item per line, so the edit mode can add, delete and move lines. */
export const noteLines = (note) => (Array.isArray(note) ? note : String(note ?? '').split(/\r?\n/)).map(String).filter(l => l.trim());

function stepHtml(manual, sc, si, st, ti, T, secNo) {
  const drawn = renderStepScreen(manual, st);
  const callouts = arr(st.callouts);
  const marks = callouts.map(markOf).filter(m => m[1] || m[3]);
  const figure = drawn?.svg
    ? `<figure class="screen"${marks.length ? ` data-callouts="${esc(JSON.stringify(marks))}"` : ''}${st.image ? ' data-image=""' : ''}>${drawn.svg}`
      + `<figcaption>${stepEd('caption', st.caption || '')}</figcaption></figure>`
    : '';
  const tcode = st.tcode || sc.tcode || manual.tcode || manual.program;
  const head = `<table class="step-head"><tbody>`
    + `<tr><th>${esc(T.transaction)}</th><td>${esc(`${secNo}-${si + 1}`)} <span class="sc-title">${inline(sc.title)}</span></td></tr>`
    + `<tr><th>${esc(T.description)}</th><td><span class="stepno">${ti + 1}</span>. ${stepEd('title', st.title)}</td></tr>`
    + `<tr><th>${esc(T.tcode)}</th><td><code>${esc(tcode)}</code>${manual.cbo === false ? '' : ` <span class="flag">${esc(T.cbo)}</span>`}</td></tr>`
    + (manual.menuPath ? `<tr><th>${esc(T.menuPath)}</th><td>${inline(manual.menuPath)}</td></tr>` : '')
    + `</tbody></table>`;
  const lines = noteLines(st.note);
  const note = `<ul class="step-note step-notes"${lines.length ? '' : ' hidden'}>${lines.map((l, i) => `<li>${stepEd(`note.${i}`, l)}</li>`).join('')}</ul>`
    + `<p class="step-note"${st.result ? '' : ' hidden'}><strong>${esc(T.result)}:</strong> ${stepEd('result', st.result || '')}</p>`;
  return `<article class="step${ti > 0 ? ' page-break' : ''}" id="s${si + 1}-${ti + 1}" data-si="${si}" data-ti="${ti}">${head}`
    + `<div class="step-body${figure ? ' has-screen' : ''}">${figure}<div>${calloutsHtml(callouts)}${note}</div></div></article>`;
}

export function renderManualHtml(manual, { version, date, config = {}, history = [] }) {
  const T = labelsFor(manual.lang);
  const intro = manual.intro || {};
  const flagged = new Set(arr(intro.unverified));
  const mark = (s) => (flagged.has(s) ? ` <span class="flag">${esc(T.unverified)}</span>` : '');
  const title = manual.title || manual.program;
  const toc = [];
  const sec = [];

  // Cover
  const meta = [
    [T.program, `<code>${esc(manual.program)}</code>`], [T.tcode, `<code>${esc(manual.tcode || manual.program)}</code>`],
    [T.version, `<span data-ver>v${esc(version)}</span>`], [T.date, `<span data-ver-date>${esc(date)}</span>`],
    config.team && [T.team, esc(config.team)], config.author && [T.author, esc(config.author)],
  ].filter(Boolean);
  sec.push(`<section class="cover" id="cover"><div class="kicker">${esc(manual.module ? `${manual.module} · ` : '')}${esc(T.manual)}</div><h1>${ed('title', title)}</h1>`
    + `<dl class="meta">${meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`
    + (config.company ? `<div class="kicker">${esc(config.company)}</div>` : '') + `</section>`);

  // Revision history
  toc.push(['revision', T.revision]);
  sec.push(`<section id="revision" class="page-break"><h2>${esc(T.revision)}</h2>${table([T.version, T.date, T.author, T.change],
    history.map(h => [`v${esc(h.version)}`, esc(h.date), esc(h.author || ''), inline(h.note || '')])).replace('<table>', '<table id="rev-table">')}</section>`);

  // 1. Introduction
  let n = 1;
  const introParts = [];
  if (intro.purpose) introParts.push(`<h3>${esc(T.purpose)}</h3><p>${ed('intro.purpose', intro.purpose)}${mark(intro.purpose)}</p>`);
  if (intro.background) introParts.push(`<h3>${esc(T.background)}</h3><p>${ed('intro.background', intro.background)}${mark(intro.background)}</p>`);
  // Shown even when empty (hidden outside edit mode) so a key user can add the first rule.
  const rules = arr(intro.businessRules);
  introParts.push(`<div class="ed-list-wrap"${rules.length ? '' : ' hidden'}><h3>${esc(T.rules)}</h3>${editList('intro.businessRules', rules, mark)}</div>`);
  if (intro.users) introParts.push(`<h3>${esc(T.users)}</h3><p>${ed('intro.users', intro.users)}${mark(intro.users)}</p>`);
  const pf = manual.processFlow;
  const pfSvg = pf && !Array.isArray(pf) && Array.isArray(pf.nodes) ? renderFlowchartSVG(pf, { lang: manual.lang })
    : Array.isArray(pf) && pf.length ? renderProcessFlowSVG(pf, { lang: manual.lang, orientation: 'horizontal' }) : '';
  // The edit mode turns the figure into a flow editor (flow-editor.mjs), starting from this graph.
  const flowSeed = pfSvg ? { graph: toFreeFlow(pf), opts: freeFlowOptions(manual.lang || 'ko') } : null;
  if (pfSvg) introParts.push(`<h3>${esc(T.flow)}</h3><figure class="screen flow-fig" data-flow="processFlow">${fitSvg(pfSvg)}</figure>`);
  toc.push(['intro', `${n}. ${T.intro}`]);
  sec.push(`<section id="intro" class="page-break"><h2>${n}. ${esc(T.intro)}</h2>${introParts.join('')}</section>`);

  // 2. Scenarios
  n += 1;
  const scToc = [];
  const scHtml = arr(manual.scenarios).map((sc, si) => {
    scToc.push([`s${si + 1}`, `${n}-${si + 1} ${sc.title || ''}`]);
    const steps = arr(sc.steps).map((st, ti) => stepHtml(manual, sc, si, st, ti, T, n)).join('');
    const cps = arr(sc.checkpoints); // unfiltered: data-i is the index in this array
    const cpHtml = `<aside class="checkpoints ed-list-wrap"${cps.some(c => (typeof c === 'string' ? c : c?.text)) ? '' : ' hidden'}><h4>${esc(T.checkpoints)}</h4>`
      + `${editList(`scenarios.${si}.checkpoints`, cps, c => (c?.source ? ` <span class="src">(${esc(c.source)})</span>` : ''))}</aside>`;
    return `<section id="s${si + 1}" data-si="${si}"${si > 0 ? ' class="page-break"' : ''}><h3>${n}-${si + 1} ${ed(`scenarios.${si}.title`, sc.title)}</h3>`
      + `${sc.goal ? `<p class="scenario-goal">${esc(T.goal)}: ${ed(`scenarios.${si}.goal`, sc.goal)}</p>` : ''}${steps}${cpHtml}</section>`;
  }).join('');
  toc.push(['scenarios', `${n}. ${T.scenarios}`, scToc]);
  sec.push(`<section id="scenarios" class="page-break"><h2>${n}. ${esc(T.scenarios)}</h2>${scHtml}</section>`);

  // 3. Fields
  const selF = arr(manual.fields?.selection), outF = arr(manual.fields?.output);
  if (selF.length || outF.length) {
    n += 1;
    toc.push(['fields', `${n}. ${T.fields}`]);
    // Each table gets the screen drawn above it, its fields numbered there and in the # column.
    const selFig = selF.length ? fieldFigure(manual, 'selection', selF, 'fields.selection') : { html: '', nums: [] };
    const outFig = outF.length ? fieldFigure(manual, 'output', outF, 'fields.output') : { html: '', nums: [] };
    const numCol = (fig) => (fig.html ? [{ head: '#', kind: 'num' }] : []);
    sec.push(`<section id="fields" class="page-break"><h2>${n}. ${esc(T.fields)}</h2>`
      + (selF.length ? `<h3>${esc(T.selFields)}</h3>${selFig.html}${editTable('fields.selection', [...numCol(selFig),
        { head: T.field, keys: ['name'], kind: 'code' }, { head: T.label, keys: ['label'] },
        { head: T.required, keys: ['required'], kind: 'flag' }, { head: T.f4, keys: ['f4'], kind: 'flag' },
        { head: T.example, keys: ['example'] }, { head: T.meaning, keys: ['description'] }], selF, selFig.nums)}` : '')
      + (outF.length ? `<h3>${esc(T.outFields)}</h3>${outFig.html}${editTable('fields.output', [...numCol(outFig),
        { head: T.field, keys: ['name'], kind: 'code' }, { head: T.label, keys: ['header', 'label'] },
        { head: T.meaning, keys: ['description'] }], outF, outFig.nums)}` : '')
      + `</section>`);
  }

  // 4. Messages
  const msgs = arr(manual.messages);
  if (msgs.length) {
    n += 1;
    toc.push(['messages', `${n}. ${T.messages}`]);
    sec.push(`<section id="messages" class="page-break"><h2>${n}. ${esc(T.messages)}</h2>${editTable('messages', [
      { head: T.code, keys: ['code'], kind: 'code' }, { head: T.msgType, keys: ['type'] }, { head: T.text, keys: ['text'] },
      { head: T.cause, keys: ['cause'] }, { head: T.action, keys: ['action'] }], msgs)}</section>`);
  }

  // 5. Glossary
  const gl = arr(manual.glossary);
  if (gl.length) {
    n += 1;
    toc.push(['glossary', `${n}. ${T.glossary}`]);
    sec.push(`<section id="glossary" class="page-break"><h2>${n}. ${esc(T.glossary)}</h2>${editTable('glossary', [
      { head: T.term, keys: ['term'] }, { head: T.meaning, keys: ['description'] }], gl)}</section>`);
  }

  const tocHtml = `<ol>${toc.map(([id, label, kids]) => `<li><a href="#${id}">${esc(label)}</a>${kids?.length ? `<ol>${kids.map(([k, l]) => `<li><a href="#${k}">${esc(l)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>`;
  const footer = [config.company, config.confidentiality].filter(Boolean).join(' · ');
  return `<!doctype html>
<html lang="${esc(manual.lang || 'ko')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(T.manual)} v${esc(version)}</title>
<style>${STYLE}${QUILL_CSS}${EDITOR_STYLE}${FLOW_EDITOR_STYLE}</style></head>
<body>
<header class="topbar"><span class="t">${esc(title)} · <code>${esc(manual.program)}</code> · <span data-ver>v${esc(version)}</span></span><span class="ed-bar" id="ed-bar" hidden></span><button id="edit-btn" type="button">${esc(editorLabels(manual.lang).edit)}</button><button id="print-btn" type="button">${esc(T.print)}</button><button id="theme-btn" type="button">${esc(T.theme)}</button></header>
<div class="layout"><nav class="toc" aria-label="${esc(T.contents)}">${tocHtml}</nav><main>
${sec.join('\n')}
<footer class="doc-end"><strong>${esc(T.endOfDoc)}</strong>${config.confidentiality ? inline(config.confidentiality) : ''}</footer>
</main></div>
${footer ? `<div class="print-footer">${esc(footer)} · ${esc(manual.program)} <span data-ver>v${esc(version)}</span></div>` : ''}
<script type="application/json" id="manual-source">${embedJson({ manual, version })}</script>
<script type="application/json" id="editor-labels">${embedJson({ ...editorLabels(manual.lang), flow: flowEditorLabels(manual.lang) })}</script>
${flowSeed ? `<script type="application/json" id="flow-seed">${embedJson(flowSeed)}</script>` : ''}
<script>${SCRIPT}</script>
<script>${LINK_SCRIPT}</script>
${QUILL_JS ? `<script>${QUILL_JS}</script>` : ''}
<script>${FLOW_EDITOR_SCRIPT}</script>
<script>${EDITOR_SCRIPT}</script>
</body></html>
`;
}

// ── Build ───────────────────────────────────────────────────────────────

export function buildManual({ manualPath, outDir, sameVersion = false, major = false, cwd = process.cwd(), verbose = true }) {
  const manual = JSON.parse(readFileSync(manualPath, 'utf8'));
  // Screen theme: manual.json "theme", else the profile config "screenTheme", else Signature.
  if (manual.theme == null) manual.theme = readScreenTheme(cwd) ?? undefined;
  const lang = manual.lang || 'ko';
  const program = String(manual.program || 'PROGRAM');
  const dir = outDir || join(resolveArtifactBase(cwd), 'manuals');
  mkdirSync(join(dir, '_src'), { recursive: true });

  const warnings = manualWarnings(manual);
  if (verbose) for (const w of warnings) console.log(`⚠ build-manual: ${w}`);

  const cfg = readManualConfig(cwd);
  const config = { ...cfg.manual, ...(manual.meta || {}) };
  const historyPath = join(dir, `${slug(program)}-${lang}.history.json`);
  const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, 'utf8')) : { program, lang, versions: [] };
  const version = nextVersion(history, { sameVersion, major });
  const versions = arr(history.versions);
  // A version a user recorded in the page's edit mode (imported with --import) keeps
  // their author, date and note when it is rebuilt in place.
  const last = versions.at(-1);
  const entry = last?.version === version && last.source === 'edit'
    ? last
    : { version, date: today(), author: config.author || '', note: manual.changeNote || '' };
  const previous = versions.at(-1)?.version === version ? versions.at(-2) : versions.at(-1);
  if (verbose && previous && entry.note && previous.note === entry.note) {
    console.log(`⚠ build-manual: changeNote "${entry.note}" repeats v${previous.version}'s note — describe what changed in v${version}`);
  }
  if (versions.at(-1)?.version === version) versions[versions.length - 1] = entry;
  else versions.push(entry);
  history.versions = versions;

  const html = renderManualHtml(manual, { version, date: entry.date, config, history: versions });
  const htmlPath = join(dir, `${slug(program)}-v${version}-${lang}.html`);
  const sourcePath = join(dir, '_src', `${slug(program)}-v${version}-${lang}.manual.json`);
  writeFileSync(htmlPath, html, 'utf8');
  writeFileSync(sourcePath, readFileSync(manualPath, 'utf8'), 'utf8');
  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  if (verbose && !cfg.found && !manual.meta) console.log('⚠ build-manual: no "manual" block in config.json — cover shows no team / author / company (run manual-config.mjs set)');
  return { html: htmlPath, version, history: historyPath, source: sourcePath, warnings };
}

const versionKey = (v) => String(v).split('.').map(n => Number(n) || 0);
const byVersion = (a, b) => { const [x, y] = [versionKey(a.version), versionKey(b.version)]; return x[0] - y[0] || x[1] - y[1]; };

/** history.json next to the manuals: `<dir>/<PROGRAM>-<lang>.history.json`, `dir` = parent of `_draft/` / `_src/`. */
export function historyPathFor(manualPath, manual) {
  const d = dirname(manualPath);
  const dir = /^_(draft|src)$/.test(basename(d)) ? dirname(d) : d;
  return join(dir, `${slug(String(manual.program || 'PROGRAM'))}-${manual.lang || 'ko'}.history.json`);
}

/**
 * Reads the manual.json a user saved from the page's edit mode (embedded as
 * <script id="manual-source">) and writes it to `outPath`, so the next build keeps the edits.
 * Revision entries the page recorded on save ({ version, date, author, note, source: 'edit' })
 * go into history.json; rebuild with --same-version to publish that version.
 */
export function importEditedHtml(htmlPath, outPath, historyPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const m = /<script type="application\/json" id="manual-source">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error(`${htmlPath} has no embedded manual source — was it saved from the page's edit mode?`);
  const { manual, version, history: added } = JSON.parse(m[1]);
  if (existsSync(outPath)) writeFileSync(`${outPath}.bak`, readFileSync(outPath));
  writeFileSync(outPath, `${JSON.stringify(manual, null, 2)}\n`, 'utf8');
  let revisions = null;
  if (arr(added).length) {
    const hp = historyPath || historyPathFor(outPath, manual);
    const history = existsSync(hp) ? JSON.parse(readFileSync(hp, 'utf8')) : { program: manual.program, lang: manual.lang || 'ko', versions: [] };
    const versions = arr(history.versions).filter(v => !arr(added).some(a => a.version === v.version));
    history.versions = [...versions, ...arr(added).map(a => ({ ...a, source: 'edit' }))].sort(byVersion);
    writeFileSync(hp, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
    revisions = { history: hp, added: arr(added).map(a => a.version) };
  }
  return { manual: outPath, fromVersion: version, edited: manual.edited || null, backup: existsSync(`${outPath}.bak`) ? `${outPath}.bak` : null, revisions };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile && process.argv[2] === '--import') {
  const [, , , htmlPath, outPath] = process.argv;
  if (!htmlPath || !outPath) {
    console.error('Usage: node build-manual.mjs --import <edited.html> <manual.json to write>');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(importEditedHtml(resolve(htmlPath), resolve(outPath)), null, 2));
  } catch (e) {
    console.error(`build-manual: ${e.message}`);
    process.exit(1);
  }
} else if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const args = process.argv.slice(2);
  let manualPath;
  let outDir;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out-dir') outDir = args[++i];
    else if (a.startsWith('--out-dir=')) outDir = a.slice('--out-dir='.length);
    else if (!a.startsWith('--')) manualPath = a;
  }
  if (!manualPath || (args.some(a => a.startsWith('--out-dir')) && !outDir)) {
    console.error('Usage: node build-manual.mjs <manual.json> [--out-dir DIR] [--same-version] [--major]');
    process.exit(2);
  }
  try {
    const result = buildManual({
      manualPath: resolve(manualPath),
      outDir: outDir ? resolve(outDir) : undefined,
      sameVersion: args.includes('--same-version'),
      major: args.includes('--major'),
    });
    console.log(JSON.stringify({ ...result, warnings: result.warnings.length }, null, 2));
  } catch (e) {
    console.error(`build-manual: ${e.message}`);
    process.exit(1);
  }
}

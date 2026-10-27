// sc4sap:module-to-process — process-model.json → one self-contained HTML page.
//
//   node build-process-doc.mjs <process-model.json> [--out-dir DIR] [--same-version] [--major] [--check]
//
// Writes, under <artifact-base>/processes/<MODULE>/ (or --out-dir):
//   <MODULE>-process-v<ver>-<lang>.html        the page
//   _src/<MODULE>-process-v<ver>-<lang>.process.json   the model it was built from
//   <MODULE>-process-<lang>.history.json       revision history (one entry per version)
// --check only runs checkModel() and prints errors / warnings (exit 1 on errors).
//
// Page: cover · revision history · module overview (scope, L1/L2 cards) · BPH table
// (filter, collapse) · process details (L2 > L3 headings, one task sheet per L4) ·
// appendix (cross-module, interfaces, conversion notes, open questions, glossary).
// The model is embedded as <script id="process-model"> for the edit mode (P2).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFlowchartSVG } from '../spec/screen-image-renderer.mjs';
import { resolveArtifactBase } from '../lib/profile-resolve.mjs';
import {
  anchorId, checkModel, childrenOf, conversionIndex, interfaceIndex, laneOf, normalizeModel, rollup, systemOf,
} from './process-model.mjs';
import { labelsFor, SCRIPT, STYLE } from './process-page.mjs';
import { EDITOR_SCRIPT, EDITOR_STYLE, editorLabels } from './process-editor.mjs';
import { l3Map, stepLanes } from './swimlane.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** **bold**, `code`, "\n" line break — the same light markup the manual uses. */
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
const embedJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const today = () => new Date().toISOString().slice(0, 10);
const slug = (s) => String(s || 'MODULE').toUpperCase().replace(/[^A-Z0-9_-]+/g, '_');
const stripProlog = (svg) => String(svg || '').replace(/^<\?xml[^>]*>\s*/, '');

// Edit-mode hooks (process-editor.mjs): data-p = "row:<code>|<path>" or "m|<path>"; lists carry data-list.
const P = (code, sub) => `row:${code}|${sub}`;
const ed = (p, text, tag = 'span') => `<${tag} data-p="${esc(p)}">${inline(text ?? '')}</${tag}>`;
/** An editable list: items as <li data-i> / <tr data-i>, a <template> for new items; empty lists show only in edit mode. */
function edList(E, path, shape, items, item, { tag = 'ul', row = 'li', cls = '' } = {}) {
  const del = `<button type="button" class="edx ed-only" data-del="1" title="${esc(E.del)}">✕</button>`;
  const blank = shape === 'rule' ? { text: '' } : shape === 'step' ? { name: '' } : shape === 'term' ? { term: '' } : '';
  const li = (x, i) => (row === 'tr' ? `<tr data-i="${i}">${item(x, i)}<td class="ed-only-cell">${del}</td></tr>` : `<li data-i="${i}">${item(x, i)}${del}</li>`);
  return `<${tag}${cls ? ` class="${cls}"` : ''} data-list="${esc(path)}" data-shape="${shape}">${items.map(li).join('')}<template>${li(blank, 0)}</template></${tag}>`
    + (tag === 'tbody' ? '' : `<button type="button" class="edadd ed-only" data-add="${esc(path)}">${esc(E.add)}</button>`);
}
const strPath = (base, x, i) => (typeof x === 'string' || x == null ? `${base}.${i}` : `${base}.${i}.text`);
const strText = (x) => (typeof x === 'string' ? x : x?.text ?? '');

function table(head, rows, cls = '') {
  if (!rows.length) return '';
  return `<div class="tw"><table${cls ? ` class="${cls}"` : ''}><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const kindBadge = (T, k) => (k ? `<span class="badge k-${esc(k)}">${esc(T[`k_${k}`] || k)}</span>` : '');
const usageMark = (T, u) => (u === 'used' ? `<span class="use-used" title="${esc(T.u_used)}">●</span>`
  : u === 'unused' ? `<span class="use-unused" title="${esc(T.u_unused)}">○</span>`
    : u ? `<span class="use-unknown" title="${esc(T.u_unknown)}">–</span>` : '');
const codes = (list) => arr(list).map(x => `<code>${esc(typeof x === 'string' ? x : x?.name)}</code>`).join(' ');

function sysTag(m, id) {
  if (!id) return '';
  const s = systemOf(m, id);
  const full = s?.label || id;
  const short = String(full).replace(/\s*[(（].*$/, '') || full; // "Portal (proxy …)" → "Portal"; the rest goes to the tooltip
  return `<span class="sys sys-${esc(s?.kind || 'sap')}"${short !== full ? ` title="${esc(full)}"` : ''}>${esc(short)}</span>`;
}

function ownerTag(m, T, id, estimated) {
  if (!id) return estimated ? `<span class="flag">${esc(T.tbd)}</span>` : '';
  const l = laneOf(m, id);
  const est = estimated || l?.estimated;
  return `${esc(l?.label || id)}${est ? ` <span class="est">(${esc(T.estimated)})</span>` : ''}`;
}

function ruleHtml(T, rule, path) {
  const r = typeof rule === 'string' ? { text: rule } : rule || {};
  const s = r.source;
  const src = s ? `${s.object || ''}${s.unit && s.unit !== s.object ? ` ${s.unit}` : ''}${s.line ? ` :${s.line}` : ''}` : '';
  return `${ed(path, r.text)}${src ? `<span class="src">[${esc(T.source)} <code>${esc(src.trim())}</code>]</span>`
    : r.estimated ? ` <span class="est">(${esc(T.estimated)})</span>` : ''}`;
}

/** Colour key under a swimlane: fill = system kind, border = task kind. */
function legend(m, T, kinds) {
  const sys = [...new Set(arr(m.scope.systems).map(s => s.kind || 'sap'))];
  return `<figcaption class="legend">${sys.map(k => `<span class="lg lg-sys-${esc(k)}"></span>${esc(T[`s_${k}`] || k)}`).join(' ')}`
    + ` · ${kinds.map(k => `<span class="lg lg-k-${esc(k)}"></span>${esc(T[`k_${k}`] || k)}`).join(' ')} · ${esc(T.lgIface)}</figcaption>`;
}

/** Tasks of an L3 that have variants: one row per variant. */
function variantMatrix(m, T, code) {
  const tasks = m.rows.filter(r => r.level === 4 && r.code.startsWith(`${code}.`) && r.variants.length);
  if (!tasks.length) return '';
  return `<h5>${esc(T.variantMatrix)}</h5>${table([T.process, T.variant, T.desc, T.kind, T.objects], tasks.flatMap(t => t.variants.map((v, i) => [
    i === 0 ? `<a href="#${anchorId(t.code)}">${esc(t.code)}</a> ${inline(t.label)}` : '', `<code>${esc(t.code)}${esc(v.id)}</code> ${inline(v.label)}`,
    inline(v.desc || ''), kindBadge(T, v.kind), codes(v.objects)])))}`;
}

function taskSheet(m, T, E, row) {
  const t = row.task || {};
  const c = row.code;
  const head = [
    [T.code, `<code>${esc(row.code)}</code>`],
    [T.owner, ownerTag(m, T, row.owner, row.ownerEstimated)],
    [T.system, sysTag(m, row.system)],
    [T.kind, kindBadge(T, row.kind)],
    [T.output, ed(P(c, 'task.output'), t.output), !t.output],
    [T.timing, ed(P(c, 'task.timing'), t.timing), !t.timing],
  ].filter(Boolean);
  const parts = [`<table class="task-head"><tbody>${head.map(([k, v, empty]) => `<tr${empty ? ' class="ed-empty"' : ''}><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</tbody></table>`];
  parts.push(`<div${t.definition ? '' : ' class="ed-empty"'}><h4>${esc(T.definition)}</h4>${ed(P(c, 'task.definition'), t.definition, 'p')}</div>`);
  if (row.variants.length) {
    parts.push(`<h4>${esc(T.variants)}</h4>${table([T.variant, T.desc, T.kind, T.objects], row.variants.map(v => [
      `<code>${esc(v.id)}</code> ${inline(v.label)}`, inline(v.desc || ''), kindBadge(T, v.kind), codes(v.objects)]))}`);
  }
  parts.push(`<div${arr(t.rules).length ? '' : ' class="ed-empty"'}><h4>${esc(T.rules)}</h4>${edList(E, P(c, 'task.rules'), 'rule', arr(t.rules), (r, i) => ruleHtml(T, r, strPath(P(c, 'task.rules'), r, i)), { cls: 'rules' })}</div>`);
  const lanesSvg = stepLanes(m, row);
  if (lanesSvg) parts.push(`<h4>${esc(T.stepLanes)}</h4><figure class="flowfig swim">${lanesSvg}${legend(m, T, [row.kind].filter(Boolean))}</figure>`);
  if (t.flow && arr(t.flow.nodes).length) {
    parts.push(`<h4>${esc(T.flow)}</h4><figure class="flowfig">${stripProlog(renderFlowchartSVG(t.flow, { lang: m.lang, heading: row.label }))}</figure>`);
  }
  {
    const sp = P(c, 'task.steps');
    const body = edList(E, sp, 'step', arr(t.steps), (s, i) => `<td>${ed(`${sp}.${i}.name`, s.name)}</td><td>${ed(`${sp}.${i}.method`, s.method)}</td>`
      + `<td>${ed(`${sp}.${i}.timing`, s.timing)}</td><td>${ownerTag(m, T, s.owner, s.ownerEstimated)}</td><td>${sysTag(m, s.system)}</td>`, { tag: 'tbody', row: 'tr' });
    parts.push(`<div${arr(t.steps).length ? '' : ' class="ed-empty"'}><h4>${esc(T.steps)}</h4><div class="tw"><table class="steps"><thead><tr>${[T.step, T.method, T.timing, T.owner, T.system]
      .map(h => `<th>${esc(h)}</th>`).join('')}<th class="ed-only-cell"></th></tr></thead>${body}</table></div><button type="button" class="edadd ed-only" data-add="${esc(sp)}">${esc(E.add)}</button></div>`);
  }
  const rel = [];
  if (row.tcodes.length) rel.push([T.tcodes, codes(row.tcodes)]);
  const objs = arr(t.objects).length ? arr(t.objects) : row.objects.map(o => ({ name: o }));
  if (objs.length) rel.push([T.objects, objs.map(o => `${usageMark(T, o.usage)} <code>${esc(o.name)}</code>${o.desc ? ` ${inline(o.desc)}` : ''}`).join('<br>')]);
  if (arr(t.exits).length) rel.push([T.exits, codes(t.exits)]);
  if (rel.length) parts.push(`<h4>${esc(T.related)}</h4>${table([T.kind, T.objects], rel.map(([k, v]) => [esc(k), v]))}`);
  if (arr(t.interfaces).length) {
    parts.push(`<h4>${esc(T.interfaces)}</h4>${table([T.system, T.direction, T.objects, T.desc], arr(t.interfaces).map(i => [
      sysTag(m, i.system), esc(i.direction || ''), codes([i.object].filter(Boolean)), inline(i.desc || '')]))}`);
  }
  if (arr(t.links).length) {
    parts.push(`<h4>${esc(T.links)}</h4><ul>${arr(t.links).map(l => {
      const code = typeof l === 'string' ? l : l.code;
      const to = m.rows.find(r => r.code === code);
      return `<li><a href="#${anchorId(code)}">${esc(code)} ${esc(to?.label || '')}</a>${l.note ? ` — ${inline(l.note)}` : ''}</li>`;
    }).join('')}</ul>`);
  }
  const cp = P(c, 'task.conversion'), tp = P(c, 'task.tbd');
  parts.push(`<div${arr(t.conversion).length ? '' : ' class="ed-empty"'}><h4>${esc(T.conversion)}</h4>${edList(E, cp, 'text', arr(t.conversion), (x, i) => ed(strPath(cp, x, i), strText(x)))}</div>`);
  parts.push(`<aside class="tbd${arr(t.tbd).length ? '' : ' ed-empty'}"><strong>${esc(T.tbd)}</strong>${edList(E, tp, 'text', arr(t.tbd), (x, i) => ed(strPath(tp, x, i), strText(x)))}</aside>`);
  return `<section class="task" id="${anchorId(row.code)}"><h4 style="font-size:17px;margin-top:0">${esc(row.code)} ${ed(P(c, 'label'), row.label)}</h4>${parts.join('')}</section>`;
}

function bphTable(m, T) {
  const body = [];
  for (const r of m.rows) {
    const hasKids = m.rows.some(x => x.code.startsWith(`${r.code}.`)) || r.variants.length > 0;
    const toggle = hasKids ? `<button class="tg" type="button" data-code="${esc(r.code)}" aria-label="toggle">▾</button>` : '';
    const label = r.level === 4 ? `${ed(P(r.code, 'label'), r.label)} <a class="go" href="#${anchorId(r.code)}" title="${esc(T.details)}">↘</a>` : ed(P(r.code, 'label'), r.label);
    const pad = `padding-left:${(r.level - 1) * 18}px`;
    body.push(`<tr class="lv${r.level}" data-code="${esc(r.code)}" data-level="${r.level}" data-kind="${esc(r.kind || '')}">`
      + `<td><code>${esc(r.code)}</code></td><td class="p"><span class="ind" style="${pad}">${toggle}${label}</span></td>`
      + `<td>${sysTag(m, r.system)}</td><td>${kindBadge(T, r.kind)}</td><td>${codes(r.tcodes)}</td><td>${codes(r.objects)}</td>`
      + `<td>${r.level === 4 ? ownerTag(m, T, r.owner, r.ownerEstimated) : ''}</td><td>${usageMark(T, r.usage)}</td><td>${r.level === 4 ? ed(P(r.code, 'remark'), r.remark) : ''}</td></tr>`);
    for (const v of r.variants) {
      body.push(`<tr class="var" data-code="${esc(r.code)}" data-level="5" data-kind="${esc(v.kind || r.kind || '')}">`
        + `<td><code>${esc(r.code)}${esc(v.id)}</code></td><td class="p"><span class="ind" style="padding-left:${r.level * 18}px">└ ${esc(T.variant)}: ${inline(v.label)}</span></td>`
        + `<td>${sysTag(m, v.system || r.system)}</td><td>${kindBadge(T, v.kind)}</td><td>${codes(v.tcodes)}</td><td>${codes(v.objects)}</td>`
        + `<td>${v.owner ? ownerTag(m, T, v.owner, v.ownerEstimated) : ''}</td><td>${usageMark(T, v.usage)}</td><td>${inline(v.remark || '')}</td></tr>`);
    }
  }
  const present = [...new Set(m.rows.map(r => r.kind).filter(Boolean))];
  const tools = `<div class="bph-tools"><input id="bph-q" type="search" placeholder="${esc(T.filter)}" aria-label="${esc(T.filter)}">`
    + present.map(k => `<button type="button" data-kind="${esc(k)}" aria-pressed="false">${esc(T[`k_${k}`] || k)}</button>`).join('')
    + `<button type="button" id="bph-collapse">${esc(T.collapse)}</button><button type="button" id="bph-expand">${esc(T.expand)}</button></div>`;
  return tools + `<div class="tw"><table class="bph"><thead><tr>${[T.code, T.process, T.system, T.kind, T.tcodes, T.objects, T.owner, T.usage, T.remark]
    .map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div>`;
}

export function renderProcessHtml(model, { version, date, history = [] }) {
  const m = normalizeModel(model);
  const T = labelsFor(m.lang);
  const E = editorLabels(m.lang);
  const title = m.title || `${m.module} ${T.doc}`;
  const toc = [];
  const sec = [];

  const meta = [
    [T.version, `v${esc(version)}`], [T.date, esc(date)],
    m.system && [T.system, esc(m.system)], m.sapVersion && ['SAP', esc(m.sapVersion)],
    m.modules.length > 1 && ['Modules', esc(m.modules.join(' · '))],
  ].filter(Boolean);
  sec.push(`<section class="cover" id="cover"><div class="kicker">${esc(m.module)} · ${esc(T.doc)}</div><h1>${inline(title)}</h1>`
    + `<dl class="meta">${meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></section>`);

  toc.push(['revision', T.revision]);
  sec.push(`<section id="revision"><h2>${esc(T.revision)}</h2>${table([T.version, T.date, T.author, T.change],
    history.map(h => [`v${esc(h.version)}`, esc(h.date), esc(h.author || ''), inline(h.note || '')]))}</section>`);

  // 1. Overview
  const l1 = m.rows.filter(r => r.level === 1);
  const scope = [
    m.scope.packages.length && [T.packages, m.scope.packages.map(p => (typeof p === 'string' ? `<code>${esc(p)}</code>`
      : `<code>${esc(p.name)}</code>${p.tcodes != null ? ` <span class="est">${esc(p.used ?? 0)}/${esc(p.tcodes)}</span>` : ''}`)).join(' ')],
    m.scope.tcodes.length && [T.tcodes, codes(m.scope.tcodes)],
    [T.systems, m.scope.systems.map(s => `<span class="sys sys-${esc(s.kind || 'sap')}">${esc(s.label || s.id)}</span>`).join('<br>')],
    m.lanes.length && [T.lanes, m.lanes.map(l => `${esc(l.label)}${l.estimated ? ` <span class="est">(${esc(T.estimated)})</span>` : ''}`).join(' · ')],
  ].filter(Boolean);
  const cards = l1.flatMap(a => childrenOf(m, a.code)).map(b => {
    const s = rollup(m, b.code);
    return `<div class="card"><h4><a href="#${anchorId(b.code)}">${esc(b.code)} ${inline(b.label)}</a></h4>`
      + `<ul>${childrenOf(m, b.code).map(c => `<li>${esc(c.code)} ${inline(c.label)}</li>`).join('')}</ul>`
      + `<div class="stats"><span>${esc(T.tasks)} ${s.tasks}</span><span>${esc(T.ztcodes)} ${s.ztcodes}</span>${s.unused ? `<span>${esc(T.unused)} ${s.unused}</span>` : ''}${s.tbd ? `<span>${esc(T.tbd)} ${s.tbd}</span>` : ''}</div></div>`;
  }).join('');
  const handoffs = arr(m.overview?.handoffs);
  toc.push(['overview', `1. ${T.overview}`]);
  sec.push(`<section id="overview" class="page-break"><h2>1. ${esc(T.overview)}</h2>`
    + (m.overview?.summary ? `<p>${inline(m.overview.summary)}</p>` : '')
    + (m.overview?.scopeNote ? `<p class="lead">${inline(m.overview.scopeNote)}</p>` : '')
    + `<dl class="scope">${scope.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`
    + `<div class="cards">${cards}</div>`
    + (handoffs.length ? `<h3>${esc(T.handoffs)}</h3>${table([T.from, T.to, T.via, T.count], handoffs.map(h => [
      `<code>${esc(h.from)}</code>`, `<code>${esc(h.to)}</code>`, inline(h.via || ''), `<span class="num">${esc(h.count ?? '')}</span>`]))}` : '')
    + `</section>`);

  // 2. BPH
  toc.push(['bph', `2. ${T.bph}`]);
  sec.push(`<section id="bph" class="page-break"><h2>2. ${esc(T.bph)}</h2>${bphTable(m, T)}</section>`);

  // 3. Details: L1 > L2 (h3) > L3 (h4 + desc) > task sheets
  const dToc = [];
  const det = [];
  for (const a of l1) {
    for (const b of childrenOf(m, a.code)) {
      dToc.push([anchorId(b.code), `${b.code} ${b.label}`]);
      det.push(`<h3 id="${anchorId(b.code)}" class="page-break">${esc(b.code)} ${ed(P(b.code, 'label'), b.label)}</h3><p class="lead${b.desc ? '' : ' ed-empty'}">${ed(P(b.code, 'desc'), b.desc)}</p>`);
      for (const c of childrenOf(m, b.code)) {
        det.push(`<h4 id="${anchorId(c.code)}">${esc(c.code)} ${ed(P(c.code, 'label'), c.label)}</h4><p class="lead${c.desc ? '' : ' ed-empty'}">${ed(P(c.code, 'desc'), c.desc)}</p>`);
        const map = l3Map(m, c.code, { variantWord: T.variant });
        const kinds = [...new Set(childrenOf(m, c.code).map(r => r.kind).filter(Boolean))];
        if (map) det.push(`<figure class="flowfig swim scenario"><div class="cap">${esc(T.scenarioMap)}</div>${map}${legend(m, T, kinds)}</figure>`);
        det.push(variantMatrix(m, T, c.code));
        for (const d of childrenOf(m, c.code)) det.push(taskSheet(m, T, E, d));
      }
    }
  }
  toc.push(['details', `3. ${T.details}`, dToc]);
  sec.push(`<section id="details"><h2>3. ${esc(T.details)}</h2>${det.join('\n')}</section>`);

  // 4. Appendix
  const app = [];
  if (m.crossModule.length) app.push(`<h3 id="cross">${esc(T.crossModule)}</h3>${table([T.from, T.to, T.via, T.desc], m.crossModule.map(c => [
    esc(c.from || ''), esc(c.to || ''), codes([c.object].filter(Boolean)), inline(c.desc || '')]))}`);
  const ifs = interfaceIndex(m);
  if (ifs.length) app.push(`<h3 id="ifs">${esc(T.interfaces)}</h3>${table([T.code, T.process, T.system, T.direction, T.objects, T.desc], ifs.map(i => [
    `<a href="#${anchorId(i.code)}">${esc(i.code)}</a>`, inline(i.task), sysTag(m, i.system), esc(i.direction || ''), codes([i.object].filter(Boolean)), inline(i.desc || '')]))}`);
  const conv = conversionIndex(m);
  if (conv.length) app.push(`<h3 id="conv">${esc(T.conversion)}</h3>${table([T.code, T.process, T.desc], conv.map(c => [
    `<a href="#${anchorId(c.code)}">${esc(c.code)}</a>`, inline(c.task), inline(c.text)]))}`);
  const rc = m.reconcile;
  if (rc && (arr(rc.matched).length || arr(rc.bphOnly).length || arr(rc.modelOnly).length)) {
    app.push(`<h3 id="bphrc">${esc(T.reconcile)}</h3><p class="lead">${esc(T.reconcileLead)} <code>${esc(rc.source || '')}</code> · ${esc(rc.sheet || '')}</p>`
      + `<h5>${esc(T.rcMatched)} (${arr(rc.matched).length})</h5>${table([T.code, T.process, T.bphId, T.bphLabel, T.score], arr(rc.matched).map(x => [
        `<a href="#${anchorId(x.code)}">${esc(x.code)}</a>`, inline(x.label), `<code>${esc(x.bph)}</code>`, inline(x.bphLabel), `<span class="num">${esc(x.score)}</span>`]))}`
      + `<h5>${esc(T.rcBphOnly)} (${arr(rc.bphOnly).length})</h5>${table([T.bphId, T.bphLabel, T.system], arr(rc.bphOnly).map(x => [`<code>${esc(x.bph)}</code>`, inline(x.bphLabel), esc(x.system || '')]))}`
      + `<h5>${esc(T.rcModelOnly)} (${arr(rc.modelOnly).length})</h5>${table([T.code, T.process, T.kind], arr(rc.modelOnly).map(x => [`<a href="#${anchorId(x.code)}">${esc(x.code)}</a>`, inline(x.label), kindBadge(T, x.kind)]))}`);
  }
  if (m.notEvidenced.length) app.push(`<h3 id="ne">${esc(T.notEvidenced)}</h3>${table([T.backbone, T.process, T.reason], m.notEvidenced.map(n => [
    `<code>${esc(n.backbone || '')}</code>`, inline(n.label || n.path || ''), inline(n.reason || '')]))}`);
  app.push(`<div${m.openQuestions.length ? '' : ' class="ed-empty"'}><h3 id="oq">${esc(T.openQuestions)}</h3>${edList(E, 'm|openQuestions', 'text', m.openQuestions, (q, i) => ed(strPath('m|openQuestions', q, i), strText(q)))}</div>`);
  app.push(`<div${m.glossary.length ? '' : ' class="ed-empty"'}><h3 id="gl">${esc(T.glossary)}</h3><div class="tw"><table><thead><tr><th>${esc(T.term)}</th><th>${esc(T.meaning)}</th><th class="ed-only-cell"></th></tr></thead>`
    + `${edList(E, 'm|glossary', 'term', m.glossary, (g, i) => `<td>${ed(`m|glossary.${i}.term`, g.term)}</td><td>${ed(`m|glossary.${i}.description`, g.description)}</td>`, { tag: 'tbody', row: 'tr' })}</table></div>`
    + `<button type="button" class="edadd ed-only" data-add="m|glossary">${esc(E.add)}</button></div>`);
  {
    toc.push(['appendix', `4. ${T.appendix}`]);
    sec.push(`<section id="appendix" class="page-break"><h2>4. ${esc(T.appendix)}</h2>${app.join('')}</section>`);
  }

  const tocHtml = `<ol>${toc.map(([id, label, kids]) => `<li><a href="#${id}">${esc(label)}</a>${kids?.length ? `<ol>${kids.map(([k, l]) => `<li><a href="#${k}">${esc(l)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>`;
  return `<!doctype html>
<html lang="${esc(m.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} v${esc(version)}</title>
<style>${STYLE}${EDITOR_STYLE}</style></head>
<body>
<header class="topbar"><span class="t">${esc(title)} · v${esc(version)}</span><button id="ed-undo" type="button">${esc(E.undo)}</button><button id="ed-save" type="button">${esc(E.save)}</button><button id="ed-edit" type="button">${esc(E.edit)}</button><button id="print-btn" type="button">${esc(T.print)}</button><button id="theme-btn" type="button">${esc(T.theme)}</button></header>
<div class="ed-bar">${esc(E.hint)}</div>
<div class="layout"><nav class="toc" aria-label="${esc(T.contents)}">${tocHtml}</nav><main>
${sec.join('\n')}
<footer class="doc-end"><strong>${esc(T.endOfDoc)}</strong></footer>
</main></div>
<script type="application/json" id="process-model">${embedJson({ model, version, history })}</script>
<script type="application/json" id="editor-labels">${embedJson(E)}</script>
<script>${SCRIPT}</script>
<script>${EDITOR_SCRIPT}</script>
</body></html>
`;
}

export function nextVersion(history, { sameVersion = false, major = false } = {}) {
  const last = arr(history?.versions).at(-1)?.version;
  if (!last) return '1.0';
  if (sameVersion) return last;
  const [ma, mi] = String(last).split('.').map(n => Number(n) || 0);
  return major ? `${ma + 1}.0` : `${ma}.${mi + 1}`;
}

export function buildProcessDoc({ modelPath, outDir, sameVersion = false, major = false, asVersion = '', cwd = process.cwd() }) {
  const raw = readFileSync(modelPath, 'utf8');
  const model = JSON.parse(raw);
  const { errors, warnings } = checkModel(model);
  if (errors.length) throw new Error(`model has ${errors.length} error(s):\n  · ${errors.join('\n  · ')}`);
  const lang = model.lang || 'ko';
  const key = slug(model.module);
  const dir = outDir || join(resolveArtifactBase(cwd), 'processes', key);
  mkdirSync(join(dir, '_src'), { recursive: true });
  const historyPath = join(dir, `${key}-process-${lang}.history.json`);
  const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, 'utf8')) : { module: model.module, lang, versions: [] };
  // A companion page is built as the version of its primary page (--as-version).
  const version = asVersion || nextVersion(history, { sameVersion, major });
  const versions = arr(history.versions).filter(v => !asVersion || v.version !== asVersion || v.source === 'edit');
  // A version recorded in the page's edit mode (imported with --import) keeps its author, date and note.
  const last = versions.at(-1);
  const entry = last?.version === version && last.source === 'edit'
    ? last : { version, date: today(), author: model.author || '', note: model.changeNote || '' };
  if (versions.at(-1)?.version === version) versions[versions.length - 1] = { ...versions.at(-1), ...entry };
  else versions.push(entry);
  history.versions = versions;
  const html = renderProcessHtml(model, { version, date: entry.date, history: versions });
  const htmlPath = join(dir, `${key}-process-v${version}-${lang}.html`);
  const srcPath = join(dir, '_src', `${key}-process-v${version}-${lang}.process.json`);
  writeFileSync(htmlPath, html, 'utf8');
  writeFileSync(srcPath, raw, 'utf8');
  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  return { html: htmlPath, source: srcPath, history: historyPath, version, warnings };
}

const versionKey = (v) => String(v).split('.').map(n => Number(n) || 0);
const byVersion = (a, b) => { const [x, y] = [versionKey(a.version), versionKey(b.version)]; return x[0] - y[0] || x[1] - y[1]; };

/**
 * Reads the model a user saved from the page's edit mode (<script id="process-model">) into `outPath`
 * (the old file kept as .bak). The page's new revision entries go into the history file with
 * source: 'edit'; rebuild with --same-version to publish that version.
 */
export function importEditedHtml(htmlPath, outPath, historyPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const mm = /<script type="application\/json" id="process-model">([\s\S]*?)<\/script>/.exec(html);
  if (!mm) throw new Error(`${htmlPath} has no embedded process model — was it saved from the page's edit mode?`);
  const { model, version, history = [] } = JSON.parse(mm[1]);
  if (existsSync(outPath)) writeFileSync(`${outPath}.bak`, readFileSync(outPath));
  writeFileSync(outPath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  let added = [];
  if (historyPath) {
    const h = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, 'utf8')) : { module: model.module, lang: model.lang, versions: [] };
    // Only revisions the page recorded after the version it was built as.
    const known = new Set(arr(h.versions).map(v => v.version));
    added = arr(history).filter(v => byVersion(v, { version }) > 0 && !known.has(v.version));
    h.versions = [...arr(h.versions), ...added.map(v => ({ ...v, source: 'edit' }))].sort(byVersion);
    writeFileSync(historyPath, `${JSON.stringify(h, null, 2)}\n`, 'utf8');
  }
  return { model: outPath, fromVersion: version, added: added.map(v => v.version), backup: existsSync(`${outPath}.bak`) ? `${outPath}.bak` : null };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile && process.argv[2] === '--import') {
  const [, , , htmlPath, outPath, historyPath] = process.argv;
  if (!htmlPath || !outPath) {
    console.error('Usage: node build-process-doc.mjs --import <edited.html> <process-model.json to write> [<history.json>]');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(importEditedHtml(resolve(htmlPath), resolve(outPath), historyPath ? resolve(historyPath) : undefined), null, 2));
  } catch (e) {
    console.error(`build-process-doc: ${e.message}`);
    process.exit(1);
  }
} else if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const args = process.argv.slice(2);
  const modelPath = args.find(a => !a.startsWith('--') && !['--out-dir', '--as-version'].includes(args[args.indexOf(a) - 1]));
  const oi = args.indexOf('--out-dir');
  const outDir = oi >= 0 ? args[oi + 1] : undefined;
  if (!modelPath) {
    console.error('Usage: node build-process-doc.mjs <process-model.json> [--out-dir DIR] [--same-version] [--major] [--as-version X.Y] [--check]');
    process.exit(2);
  }
  try {
    if (args.includes('--check')) {
      const res = checkModel(JSON.parse(readFileSync(modelPath, 'utf8')));
      console.log(JSON.stringify(res, null, 2));
      process.exit(res.errors.length ? 1 : 0);
    }
    const res = buildProcessDoc({ modelPath: resolve(modelPath), outDir: outDir ? resolve(outDir) : undefined,
      sameVersion: args.includes('--same-version'), major: args.includes('--major'), asVersion: args.includes('--as-version') ? args[args.indexOf('--as-version') + 1] : '' });
    for (const w of res.warnings) console.log(`⚠ build-process-doc: ${w}`);
    console.log(JSON.stringify({ ...res, warnings: res.warnings.length }, null, 2));
  } catch (e) {
    console.error(`build-process-doc: ${e.message}`);
    process.exit(1);
  }
}

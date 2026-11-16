// sc4sap:module-to-process — gap mode: the Gap analysis document (one self-contained, editable HTML page).
//
//   node build-gap-doc.mjs <process-model.json | gap.json> [--scope conversion|new] [--graph <graph.json>] [--patch <review.json>]
//                          [--usage <SCOPE_DIR>/usage.json] [--usage-tier prd|non-prd|unknown]
//                          [--prev <gap.json>] [--out-dir DIR] [--same-version] [--major] [--as-version X.Y] [--check]
//   (companion: the other-language process model with --prev <primary gap.json> --as-version <primary version>;
//    only the decisions — disposition, WRICEF switch and kind — are carried across languages)
//   node build-gap-doc.mjs --import <edited.html> <gap.json to write> [<history.json>]
//   node build-gap-doc.mjs --wricef <gap.json | edited.html> --out <items.json> [--version X.Y]
//   node build-gap-doc.mjs --blank --module <M> [--scope conversion|new] [--lang ko|en|ja] [--title "…"] [--out-dir DIR]
//        a gap document without a process map: no rows yet; the page's edit mode adds L1–L4 rows (＋ / ✕), Save → --import
//
// Offline: no SAP call. A process model (module-to-process) is turned into a gap model (gap-model.mjs → deriveGap);
// the consultant's edits of the previous version (latest _src/*.gap.json of the same language, or --prev) are carried by
// code. A gap model (kind: "gap", e.g. after --import) is rebuilt as it is.
// Writes, under <artifact-base>/processes/<MODULE>/ (or --out-dir):
//   <MODULE>-gap-v<ver>-<lang>.html            the page (edit mode = the process editor; Save → -edited.html)
//   _src/<MODULE>-gap-v<ver>-<lang>.gap.json   the gap model it was built from
//   <MODULE>-gap-<lang>.history.json           revision history
//   <MODULE>-gap-v<ver>-<lang>.wricef.json     WRICEF candidates for `build-project-doc.mjs add-wricef --file`
// --check prints checkGap() errors / warnings (exit 1 on errors) and writes nothing but the derived gap model
// when --model-out <file> is given (input of the optional consultant review).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveArtifactBase } from '../lib/profile-resolve.mjs';
import { withResponsive } from '../lib/responsive.mjs';
import { STYLE } from './process-page.mjs';
import { EDITOR_SCRIPT, EDITOR_STYLE, editorLabels } from './process-editor.mjs';
import { importEditedHtml, nextVersion } from './build-process-doc.mjs';
import { anchorId } from './process-model.mjs';
import { applyPatch, blankGap, checkGap, deriveGap, DISPOSITIONS, FITS, gapStats, modelFromPage, PRIORITIES, WRICEF, wricefItems } from './gap-model.mjs';
import { GAP_SCRIPT, GAP_STYLE, gapLabels, wbLabels, WB_STYLE, WB_EMBED_STYLE, WB_PRE, WB_SCRIPT } from './gap-page.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
const embedJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const today = () => new Date().toISOString().slice(0, 10);
const slug = (s) => String(s || 'MODULE').toUpperCase().replace(/[^A-Z0-9_-]+/g, '_');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
// gap-model.mjs as page script (exports stripped; it has no imports) — the embed page's row tools use addRow / removeRow
const gapModelInline = () => readFileSync(fileURLToPath(new URL('./gap-model.mjs', import.meta.url)), 'utf8').replace(/^export (const|function|let|async function)/gm, '$1').replace(/<\/script/gi, '<\\/script');
const P = (code, sub) => `row:${code}|${sub}`;
const ed = (p, text, tag = 'span') => `<${tag} data-p="${esc(p)}">${inline(text ?? '')}</${tag}>`;
const codes = (list) => arr(list).map(x => `<code>${esc(x)}</code>`).join(' ');
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

function table(head, rows, cls = '') {
  if (!rows.length) return '';
  return `<div class="tw"><table${cls ? ` class="${cls}"` : ''}><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const fitBadge = (T, f) => `<span class="fit fit-${esc(f)}" title="${esc(T[`fd_${f}`] || '')}">${esc(T[`f_${f}`] || f)}</span>`;
/** ● used / ○ unused / – no data; `r` (a row or coverage object) adds why: a job step, or ST03N "unused" without enough evidence. */
const usageTip = (T, r) => [T[`u_${r?.usage}`] || r?.usage || '', r?.usageWhy === 'job' ? T.usageJob : '', r?.usageRaw === 'unused' ? T.usageRawUnused : ''].filter(Boolean).join(' — ');
const usageMark = (T, u, r = { usage: u }) => (u === 'used' ? `<span class="use-used" title="${esc(usageTip(T, r))}">●</span>`
  : u === 'unused' ? `<span class="use-unused" title="${esc(usageTip(T, r))}">○</span>` : u ? `<span class="use-unknown" title="${esc(usageTip(T, r))}">–</span>` : '');
const usageText = (T, r) => `${usageMark(T, r.usage, r)} ${esc(usageTip(T, r))}`;
const select = (T, path, field, values, cur, prefix) => `<select data-p="${esc(path)}" data-f="${field}" disabled aria-label="${esc(field)}">`
  + values.map(v => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(T[`${prefix}${v}`] || v)}</option>`).join('') + '</select>';
const cover = (T, r) => arr(r.coverage).map(o => `${usageMark(T, o.usage, o)} <code>${esc(o.name)}</code>${o.type ? ` <span class="est">${esc(o.type)}</span>` : ''}`).join('<br>');
const edMark = (T, g, code, f) => (arr(g.edited?.[code]).includes(f) ? `<span class="edmark" title="${esc(T.edited)}">✎</span>` : '');

// Workbench columns (requirement, effort, owner): shown in the web workbench (embed), for a blank document, and
// whenever a row uses them — a document that never used them renders exactly as before.
const usesWb = (g) => g.blank || g.rows.some(r => r.req || (r.effortMd != null && r.effortMd !== '') || r.owner || r.decision || r.wbs);
// row tools (edit mode, workbench only): add a row under a group / a variant under a task, remove a row a person added
const rowTools = (W, r) => `<span class="ed-only wbt">${r.level < 4 ? `<button type="button" class="edx wb-add" data-parent="${esc(r.code)}" title="${esc(W.addChild)}">＋</button>`
  : r.level === 4 ? `<button type="button" class="edx wb-add" data-parent="${esc(r.code)}" data-level="5" title="${esc(W.addVariant)}">＋</button>` : ''}`
  + `${r.manual ? `<button type="button" class="edx wb-del" data-code="${esc(r.code)}" title="${esc(W.removeRow)}">✕</button>` : ''}</span>`;

function groupRowHtml(g, T, r, { wb = false, W = null, tools = false } = {}) {
  const kids = g.rows.some(x => x.code !== r.code && (x.code.startsWith(`${r.code}.`) || x.parent === r.code));
  const tg = kids ? `<span class="tg" role="button" tabindex="0" data-code="${esc(r.code)}" data-level="${r.level}" aria-label="toggle">▾</span>` : '';
  return `<tr class="lv${r.level}" data-code="${esc(r.code)}" data-level="${r.level}"><td><code>${esc(r.code)}</code></td>`
    + `<td class="p" colspan="${wb ? 11 : 8}"><span style="padding-left:${(r.level - 1) * 16}px">${tg}${ed(P(r.code, 'label'), r.label)}</span>${tools ? rowTools(W, r) : ''}</td></tr>`;
}

function taskRowHtml(g, T, r, { wb = false, W = null, tools = false } = {}) {
  const fit = r.fit === 'fit';
  const w = fit ? '' : `<label class="won"><input type="checkbox" data-p="${esc(P(r.code, 'wricef.on'))}" data-f="won" disabled${r.wricef?.on ? ' checked' : ''} aria-label="${esc(T.include)}"></label> `
    + `${select(T, P(r.code, 'wricef.kind'), 'kind', WRICEF, r.wricef?.kind, 'k_')}${edMark(T, g, r.code, 'wricef.kind')}`;
  const wbCells = wb ? `<td class="rq">${ed(P(r.code, 'req.text'), r.req?.text)} ${select(W, P(r.code, 'req.priority'), 'priority', PRIORITIES, r.req?.priority || 'M', 'pr_')}</td>`
    + `<td class="num">${ed(P(r.code, 'effortMd'), r.effortMd ?? '')}</td><td>${ed(P(r.code, 'owner'), r.owner)}</td>` : '';
  return `<tr class="lv${r.level}" data-code="${esc(r.code)}" data-level="${r.level}" data-fit="${esc(r.fit)}" data-usage="${esc(r.usage)}">`
    + `<td><code>${esc(r.code)}</code></td>`
    + `<td class="p">${r.level === 5 ? `└ ${esc(T.variant)}: ` : ''}${ed(P(r.code, 'label'), r.label)}${fit ? '' : ` <a class="go" href="#${anchorId(`g-${r.code}`)}">↘</a>`}${tools ? rowTools(W, r) : ''}</td>`
    + `<td>${fitBadge(T, r.fit)}</td><td>${usageMark(T, r.usage, r)}</td><td>${codes(r.tcodes)}</td><td class="cov">${cover(T, r)}</td>`
    + `<td>${select(T, P(r.code, 'disposition'), 'disposition', DISPOSITIONS, r.disposition, 'd_')}${edMark(T, g, r.code, 'disposition')}</td>`
    + `<td>${w}</td>${wbCells}<td class="nt">${ed(P(r.code, 'note'), r.note)}</td></tr>`;
}

function matrix(g, T, { wb = false, W = null, tools: rt = false } = {}) {
  const body = [];
  for (const r of g.rows) body.push(r.level < 4 ? groupRowHtml(g, T, r, { wb, W, tools: rt }) : taskRowHtml(g, T, r, { wb, W, tools: rt }));
  const opt = (vals, prefix) => `<option value="">${esc(T.all)}</option>` + vals.map(v => `<option value="${esc(v)}">${esc(T[`${prefix}${v}`] || v)}</option>`).join('');
  const tools = `<div class="gtools m-bar"><input id="g-q" type="search" placeholder="${esc(T.filter)}" aria-label="${esc(T.filter)}">`
    + `<select id="g-fit" aria-label="${esc(T.fit)}">${opt(FITS, 'f_')}</select><select id="g-use" aria-label="${esc(T.usage)}">${opt(['used', 'unused', 'unknown'], 'u_')}</select>`
    + `<select id="g-disp" aria-label="${esc(T.disposition)}">${opt(DISPOSITIONS, 'd_')}</select><label><input id="g-w" type="checkbox"> ${esc(T.onlyWricef)}</label>`
    + `<button type="button" id="g-collapse">${esc(T.collapse)}</button><button type="button" id="g-expand">${esc(T.expand)}</button><button type="button" id="g-csv">${esc(T.csvBtn)}</button></div>`;
  const heads = [T.code, T.process, T.fit, T.usage, T.stdTcodes, T.coverage, T.disposition, T.wkind, ...(wb ? [W.req, W.effort, W.owner] : []), T.note];
  // workbench: add an L1 row; templates of a new group / task row (the page script fills the code and label)
  const add = rt ? `<div class="ed-only wbtop"><button type="button" class="edadd wb-add" data-parent="" title="${esc(W.addTop)}">${esc(W.addTop)}</button></div>` : '';
  const tpl = rt ? [1, 4, 5].map((lv) => { const r = { code: '__CODE__', level: lv, label: '__LABEL__', manual: true, fit: 'gap', usage: 'unknown', disposition: 'review', wricef: { on: false, kind: 'R' }, tcodes: [], coverage: [], note: '' };
    return `<template data-wb-level="${lv}">${lv < 4 ? groupRowHtml(g, T, r, { wb, W, tools: true }) : taskRowHtml(g, T, r, { wb, W, tools: true })}</template>`; }).join('') : '';
  return tools + add + `<div class="tw"><table class="gm"><thead><tr>${heads
    .map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div>${tpl}`;
}

/** "PRD · productive (PRD) ST03N · 12 months (measured 6) · 2026-11-01" */
function basisText(T, b) {
  if (!b) return esc(T.tier_unknown);
  const months = b.months != null ? T.monthsN.replace('{n}', b.months) + (b.coverage != null && b.coverage !== b.months ? ` (${T.measured} ${T.monthsN.replace('{n}', b.coverage)})` : '') : '';
  // a tier read from the destination is an estimate (the destination could point at QAS): say so, show the destination
  const tier = `${T[`tier_${b.tier}`] || b.tier}${b.tierBy !== 'user' && b.destination ? ` (${T.tierGuess})` : ''}`;
  return esc([b.system, tier, b.destination ? `${T.destination} ${b.destination}` : '', months, b.measuredAt].filter(Boolean).join(' · '));
}

function gapCard(g, T, r, { wb = false, W = null } = {}) {
  const parts = [`<h4>${esc(r.code)} ${esc(r.label)} ${fitBadge(T, r.fit)} ${usageText(T, r)}</h4>`];
  if (wb) {
    const q = r.req || {};
    parts.push(`<h5>${esc(W.req)}</h5><p>${q.id ? `<code>${esc(q.id)}</code> ` : ''}${ed(P(r.code, 'req.text'), q.text)}${q.priority ? ` <span class="est">${esc(W.priority)} ${esc(W[`pr_${q.priority}`] || q.priority)}</span>` : ''}${q.source ? ` <span class="est">${esc(W.reqSource)} ${esc(q.source)}</span>` : ''}</p>`);
    const facts = [[W.effort, r.effortMd != null && r.effortMd !== '' ? `${esc(r.effortMd)} MD` : ''], [W.owner, esc(r.owner || '')],
      [W.decision, r.decision ? esc([r.decision.by, r.decision.at].filter(Boolean).join(' · ')) : ''],
      [W.wbs, r.wbs?.rowId ? esc([r.wbs.projectId, r.wbs.rowId, r.wbsStatus?.stage || r.wbsStatus?.status || ''].filter(Boolean).join(' · ')) : '']].filter(([, v]) => v);
    if (facts.length) parts.push(`<p class="est">${facts.map(([k, v]) => `${esc(k)}: ${v}`).join(' · ')}</p>`);
  }
  parts.push(`<h5>${esc(T.statement)}${edMark(T, g, r.code, 'statement')}</h5>${ed(P(r.code, 'statement'), r.statement, 'p')}`);
  if (arr(r.why).length) parts.push(`<h5>${esc(T.why)}</h5><ul>${r.why.map(w => `<li>${inline(w.text)}${w.source ? `<span class="src">[<code>${esc([w.source.object, w.source.unit !== w.source.object ? w.source.unit : '', w.source.line ? `:${w.source.line}` : ''].filter(Boolean).join(' '))}</code>]</span>` : ''}</li>`).join('')}</ul>`);
  if (arr(r.coverage).length) parts.push(`<h5>${esc(T.coverage)}</h5><p>${arr(r.coverage).map(o => `${usageMark(T, o.usage, o)} <code>${esc(o.name)}</code>${o.desc ? ` ${inline(o.desc)}` : ''}`).join('<br>')}</p>`);
  if (arr(r.tcodes).length) parts.push(`<h5>${esc(T.stdTcodes)}</h5><p>${codes(r.tcodes)}</p>`);
  if (arr(r.conversion).length) parts.push(`<h5>${esc(T.conversion)}</h5><ul>${r.conversion.map(c => `<li>${inline(c)}</li>`).join('')}</ul>`);
  if (arr(r.tbd).length) parts.push(`<h5>${esc(T.tbd)}</h5><ul>${r.tbd.map(c => `<li>${inline(c)}</li>`).join('')}</ul>`);
  return `<section class="gap-card fit-l-${esc(r.fit)}" id="${anchorId(`g-${r.code}`)}">${parts.join('')}</section>`;
}

/**
 * embed: the page runs inside the web workbench, which stores every change — no file Save, no browser drafts, no
 * leave warning; window.SC4SAP_PAGE = { kind: 'gap', model, edit, editing } and the row tools (add / remove rows).
 * Without embed (and without workbench fields in the model) the output is the CLI page, byte for byte.
 */
export function renderGapHtml(gap, { version, date, history = [], mapHref = '', embed = false }) {
  const g = { ...gap, rows: arr(gap.rows), packages: arr(gap.packages), notEvidenced: arr(gap.notEvidenced), openQuestions: arr(gap.openQuestions) };
  const T = gapLabels(g.lang);
  const E = { ...editorLabels(g.lang), hint: T.edHint };
  const title = g.title || `${g.module} ${T.doc}`;
  const st = gapStats(g);
  const W = wbLabels(g.lang);
  const wb = embed || usesWb(g);
  if (embed) E.hint = W.edHint; // the workbench saves by itself: no Save / --import in the hint
  // row tools: in the workbench, and on a blank document's CLI page (rows can only be added by hand there)
  const rt = embed || !!g.blank;
  const toc = [], sec = [];
  const meta = [[T.version, `v${esc(version)}`], [T.date, esc(date)], [T.scope, esc(T[`sc_${g.scope}`] || g.scope)],
    g.system && [T.system, esc(g.system)], g.sapVersion && ['SAP', esc(g.sapVersion)],
    [T.usageBasis, basisText(T, g.usageBasis)],
    [T.source, mapHref ? `<a href="${esc(mapHref)}">${esc(mapHref)}</a>` : esc(g.source?.process ? basename(g.source.process) : '')]].filter(Boolean);
  sec.push(`<section class="cover" id="cover"><div class="kicker">${esc(g.module)} · ${esc(T.doc)}</div><h1>${ed('m|title', title)}</h1>`
    + `<dl class="meta">${meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`
    + (g.usageBasis && !g.usageBasis.reliable ? `<p class="ubwarn">${esc(T[`ubWarn_${g.usageBasis.reason || 'unknown'}`] || T.ubWarn_unknown)}</p>` : '')
    + (g.scopeChangedFrom ? `<p class="flag">${esc(T.scopeChanged)}${esc(T[`sc_${g.scopeChangedFrom}`] || g.scopeChangedFrom)}</p>` : '') + `</section>`);
  toc.push(['revision', T.revision]);
  sec.push(`<section id="revision"><h2>${esc(T.revision)}</h2>${table([T.version, T.date, T.author, T.change],
    history.map(h => [`v${esc(h.version)}`, esc(h.date), esc(h.author || ''), inline(h.note || '')]))}</section>`);

  // 1. Summary
  const tile = (v, l) => `<div class="tile"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`;
  const tiles = [tile(st.tasks, T.tasks), ...FITS.filter(f => st.byFit[f]).map(f => tile(`${st.byFit[f]} · ${pct(st.byFit[f], st.tasks)}%`, `${T[`f_${f}`]} — ${T[`fd_${f}`]}`)),
    tile(st.gapUsage.used || 0, T.gapUsed), tile(st.gapUsage.unused || 0, T.gapUnused), tile(st.wricef, T.candidates)].join('');
  const legend = `<p class="est">${FITS.map(f => `<span class="sw sw-${f}"></span>${esc(T[`f_${f}`])}`).join('')}</p>`;
  const bars = st.l2.map(b => `<span>${esc(b.code)} ${esc(b.label)}</span><span class="bar" role="img" aria-label="${esc(FITS.map(f => `${T[`f_${f}`]} ${b.byFit[f] || 0}`).join(', '))}">`
    + FITS.filter(f => b.byFit[f]).map(f => `<i class="b-${f}" style="width:${pct(b.byFit[f], b.total)}%"></i>`).join('') + `</span><span class="num">${b.total}</span>`).join('');
  const kinds = WRICEF.filter(k => st.byKind[k]).map(k => [esc(T[`k_${k}`]), `<span class="num">${st.byKind[k]}</span>`]);
  toc.push(['summary', `1. ${T.summary}`]);
  sec.push(`<section id="summary" class="page-break"><h2>1. ${esc(T.summary)}</h2><p class="lead">${esc(T.lead)}</p><ul class="notes"><li>${esc(T.limits)}</li><li>${esc(T.hiddenUse)}</li><li>${esc(T.standardHint)}</li></ul><div class="tiles">${tiles}</div>`
    + (st.l2.length ? `<h3>${esc(T.byL2)}</h3>${legend}<div class="bars">${bars}</div>` : '')
    + (kinds.length ? `<h3>${esc(T.byKind)}</h3>${table([T.wkind, T.candidates], kinds)}` : '') + `</section>`);

  // 2. Matrix
  toc.push(['matrix', `2. ${T.matrix}`]);
  sec.push(`<section id="matrix" class="page-break"><h2>2. ${esc(T.matrix)}</h2>${matrix(g, T, { wb, W, tools: rt })}</section>`);

  // 3. Gap register (everything that is not a plain fit)
  const gaps = g.rows.filter(r => r.level >= 4 && r.fit !== 'fit');
  toc.push(['register', `3. ${T.register}`]);
  sec.push(`<section id="register" class="page-break"><h2>3. ${esc(T.register)}</h2>${gaps.length ? gaps.map(r => gapCard(g, T, r, { wb, W })).join('') : `<p>${esc(T.none)}</p>`}</section>`);

  // 4. WRICEF candidates
  const cand = wricefItems(g, version);
  const rowsByCode = new Map(g.rows.map(r => [r.code, r]));
  toc.push(['wricef', `4. ${T.wricef}`]);
  sec.push(`<section id="wricef" class="page-break"><h2>4. ${esc(T.wricef)}</h2><p class="lead">${esc(T.wricefLead)}</p>`
    + `<div class="wbtns m-bar"><button type="button" id="g-json">${esc(T.jsonBtn)}</button></div>`
    + (cand.length ? table([T.code, T.wkind, T.label, T.module, T.objects, T.disposition, T.reason], cand.map(c => {
      const r = rowsByCode.get(c.source.code);
      return [`<a class="cl" href="#${anchorId(`g-${c.source.code}`)}">${esc(c.source.code)}</a>`, esc(T[`k_${c.kind}`] || c.kind), inline(c.label), esc(c.module), codes(c.objects),
        esc(T[`d_${r.disposition}`] || r.disposition), esc(T[`r_${r.wricef.reason}`] || r.wricef.reason || '')];
    })) : `<p>${esc(T.none)}</p>`)
    + `<p class="est">${esc(T.importCmd)}:</p><div class="cmd">node build-project-doc.mjs add-wricef --project &lt;CODE&gt; --file ${esc(`${slug(g.module)}-gap-v${version}-${g.lang}.wricef.json`)}</div></section>`);

  // 5. Appendix: standard not in use, unused TCodes per package, open questions
  const app = [];
  app.push(`<h3 id="notused">${esc(T.notUsed)}</h3><p class="lead">${esc(T.notUsedLead)}</p>`
    + (g.notEvidenced.length ? table([T.code, T.process, T.reasonCol], g.notEvidenced.map(n => [`<code>${esc(n.backbone || '')}</code>`, inline(n.label || ''), inline(n.reason || '')])) : `<p>${esc(T.none)}</p>`));
  const pk = g.packages.filter(p => p.tcodes != null);
  if (pk.length) app.push(`<h3 id="pkg">${esc(T.pkgUnused)}</h3>${table([T.packages, T.pkgTotal, T.pkgUsed, T.u_unused], pk.map(p => [
    `<code>${esc(p.name)}</code>`, `<span class="num">${esc(p.tcodes)}</span>`, `<span class="num">${esc(p.used ?? 0)}</span>`, `<span class="num">${esc(Math.max(0, (p.tcodes || 0) - (p.used || 0)))}</span>`]))}`);
  app.push(`<h3 id="oq">${esc(T.oq)}</h3>${g.openQuestions.length ? `<ul>${g.openQuestions.map((q, i) => `<li>${ed(`m|openQuestions.${i}`, q)}</li>`).join('')}</ul>` : `<p>${esc(T.none)}</p>`}`);
  toc.push(['appendix', `5. ${T.appendix}`]);
  sec.push(`<section id="appendix" class="page-break"><h2>5. ${esc(T.appendix)}</h2>${app.join('')}</section>`);

  const tocHtml = `<ol>${toc.map(([id, label]) => `<li><a href="#${id}">${esc(label)}</a></li>`).join('')}</ol>`;
  return withResponsive(`<!doctype html>
<html lang="${esc(g.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} v${esc(version)}</title>
<style>${STYLE}${EDITOR_STYLE}${GAP_STYLE}${rt ? WB_STYLE : ''}${embed ? WB_EMBED_STYLE : ''}</style></head>
<body>
<header class="topbar m-bar"><span class="t">${esc(title)} · v${esc(version)}</span>${mapHref ? `<a href="${esc(mapHref)}">${esc(T.openMap)}</a>` : ''}<button id="ed-undo" type="button">${esc(E.undo)}</button><button id="ed-save" type="button">${esc(E.save)}</button><button id="ed-edit" type="button">${esc(E.edit)}</button><button id="print-btn" type="button">${esc(T.print)}</button><button id="theme-btn" type="button">${esc(T.theme)}</button></header>
<div class="ed-bar">${esc(E.hint)}</div>
<div class="layout"><nav class="toc" aria-label="${esc(T.contents)}">${tocHtml}</nav><main>
${sec.join('\n')}
<footer class="doc-end"><strong>${esc(T.endOfDoc)}</strong></footer>
</main></div>
<script type="application/json" id="process-model">${embedJson(embed ? { model: gap, version, history, embed: true } : { model: gap, version, history })}</script>
<script type="application/json" id="editor-labels">${embedJson(E)}</script>
<script type="application/json" id="gap-labels">${embedJson(T)}</script>
${rt ? `<script type="application/json" id="wb-labels">${embedJson(W)}</script>
` : ''}${embed ? `<script>${WB_PRE}</script>
` : ''}<script>${EDITOR_SCRIPT}</script>
<script>${GAP_SCRIPT}</script>
${rt ? `<script>${gapModelInline()}
${WB_SCRIPT}</script>
` : ''}</body></html>
`);
}

const versionOf = (p) => /-v(\d+\.\d+)-/.exec(basename(String(p)))?.[1] || '';

/** The process page next to a `_src/<M>-process-v<ver>-<lang>.process.json` input, relative to the gap page. */
function mapHrefFor(input, dir) {
  const mm = /[\\/]_src[\\/]([^\\/]+)\.process\.json$/.exec(input);
  if (!mm) return '';
  const html = `${mm[1]}.html`;
  return existsSync(join(dir, html)) || resolve(dirname(dirname(input))) === resolve(dir) ? html : '';
}

export function buildGapDoc({ input, scope, graphPath, patchPath, prevPath, usagePath, usageTier = '', outDir, sameVersion = false, major = false, asVersion = '', check = false, modelOut = '', cwd = process.cwd() }) {
  const src = readJson(input);
  const isGap = src.kind === 'gap';
  const lang = src.lang || 'ko';
  const key = slug(src.module);
  const dir = outDir || join(resolveArtifactBase(cwd), 'processes', key);
  const historyPath = join(dir, `${key}-gap-${lang}.history.json`);
  const history = existsSync(historyPath) ? readJson(historyPath) : { module: src.module, lang, versions: [] };
  const lastVer = arr(history.versions).at(-1)?.version;
  const autoPrev = lastVer ? join(dir, '_src', `${key}-gap-v${lastVer}-${lang}.gap.json`) : '';
  let gap;
  if (isGap) gap = patchPath ? deriveFromGap(src, readJson(patchPath)) : src;
  else {
    const prev = prevPath ? readJson(prevPath) : autoPrev && existsSync(autoPrev) ? readJson(autoPrev) : null;
    gap = deriveGap({ ...src, version: versionOf(input) }, {
      scope: scope || prev?.scope || 'conversion', graph: graphPath ? readJson(graphPath) : null, prev,
      usage: usagePath ? readJson(usagePath) : null, usageTier: usageTier || (prev?.usageBasis?.tierBy === 'user' ? prev.usageBasis.tier : ''),
      patch: patchPath ? readJson(patchPath) : null, source: basename(input),
    });
  }
  const { errors, warnings } = checkGap(gap);
  if (check) {
    if (modelOut) writeFileSync(modelOut, `${JSON.stringify(gap, null, 2)}
`, 'utf8');
    return { errors, warnings, rows: gap.rows.length, ...(modelOut ? { model: modelOut } : {}) };
  }
  if (errors.length) throw new Error(`gap model has ${errors.length} error(s):\n  · ${errors.join('\n  · ')}`);
  mkdirSync(join(dir, '_src'), { recursive: true });
  // a companion page is built as the version of its primary page (--as-version)
  const version = asVersion || nextVersion(history, { sameVersion, major });
  const versions = arr(history.versions).filter(v => !asVersion || v.version !== asVersion || v.source === 'edit');
  const last = versions.at(-1);
  const entry = last?.version === version && last.source === 'edit' ? last : { version, date: today(), author: gap.author || '', note: gap.changeNote || (isGap ? '' : `Process map ${gap.source?.process || ''}`) };
  if (last?.version === version) versions[versions.length - 1] = { ...last, ...entry };
  else versions.push(entry);
  history.versions = versions;
  if (!isGap) gap.mapHref = mapHrefFor(resolve(input), dir);
  gap.version = version;
  const html = renderGapHtml(gap, { version, date: entry.date, history: versions, mapHref: gap.mapHref || '' });
  const base = `${key}-gap-v${version}-${lang}`;
  const out = { html: join(dir, `${base}.html`), source: join(dir, '_src', `${base}.gap.json`), history: historyPath, wricef: join(dir, `${base}.wricef.json`) };
  writeFileSync(out.html, html, 'utf8');
  writeFileSync(out.source, `${JSON.stringify(gap, null, 2)}\n`, 'utf8');
  writeFileSync(out.history, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  const items = wricefItems(gap, version);
  writeFileSync(out.wricef, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  return { ...out, version, warnings, rows: gap.rows.length, wricefItems: items.length, carried: Object.keys(gap.edited || {}).length, patchUnknown: gap.patchUnknown || [] };
}

/** A review patch on an existing gap model (no process model at hand). */
function deriveFromGap(gap, patch) {
  const g = JSON.parse(JSON.stringify(gap));
  g.edited ??= {};
  return applyPatch(g, patch);
}

/** Gap model from a gap.json or from a page saved in edit mode. */
export function readGap(path) {
  const text = readFileSync(path, 'utf8');
  if (/\.html?$/i.test(path)) {
    const d = modelFromPage(text); // shared with the web workbench (library import)
    if (!d) throw new Error(`${path} has no embedded gap model`);
    return { gap: d.model, version: d.version };
  }
  const gap = JSON.parse(text);
  return { gap, version: gap.version || versionOf(path) };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const args = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  try {
    if (args[0] === '--import') {
      const [, htmlPath, outPath, historyPath] = args;
      if (!htmlPath || !outPath) { console.error('Usage: node build-gap-doc.mjs --import <edited.html> <gap.json to write> [<history.json>]'); process.exit(2); }
      console.log(JSON.stringify(importEditedHtml(resolve(htmlPath), resolve(outPath), historyPath ? resolve(historyPath) : undefined), null, 2));
    } else if (args[0] === '--blank') {
      const module = String(get('--module') || '').toUpperCase();
      if (!/^[A-Z][A-Z0-9_-]{0,19}$/.test(module)) { console.error('Usage: node build-gap-doc.mjs --blank --module <M> [--scope conversion|new] [--lang ko|en|ja] [--title "…"] [--out-dir DIR]'); process.exit(2); }
      const lang = ['ko', 'en', 'ja'].includes(get('--lang')) ? get('--lang') : 'ko';
      const gap = blankGap({ module, scope: get('--scope') || 'conversion', lang, title: get('--title') || '' });
      const dir = get('--out-dir') ? resolve(get('--out-dir')) : join(resolveArtifactBase(process.cwd()), 'processes', slug(module));
      mkdirSync(join(dir, '_src'), { recursive: true });
      const seed = join(dir, '_src', `${slug(module)}-gap-blank-${lang}.gap.json`);
      writeFileSync(seed, `${JSON.stringify(gap, null, 2)}\n`, 'utf8');
      const res = buildGapDoc({ input: seed, outDir: dir });
      console.log(JSON.stringify({ ...res, warnings: res.warnings.length }, null, 2));
    } else if (args[0] === '--wricef') {
      const out = get('--out');
      if (!args[1] || !out) { console.error('Usage: node build-gap-doc.mjs --wricef <gap.json | edited.html> --out <items.json> [--version X.Y]'); process.exit(2); }
      const { gap, version } = readGap(resolve(args[1]));
      const items = wricefItems(gap, get('--version') || version);
      writeFileSync(resolve(out), `${JSON.stringify(items, null, 2)}\n`, 'utf8');
      console.log(JSON.stringify({ out: resolve(out), items: items.length }, null, 2));
    } else {
      const flags = ['--scope', '--graph', '--patch', '--prev', '--out-dir', '--as-version', '--model-out', '--usage', '--usage-tier'];
      const input = args.find((a, i) => !a.startsWith('--') && !flags.includes(args[i - 1]));
      if (!input) { console.error('Usage: node build-gap-doc.mjs <process-model.json | gap.json> [--scope conversion|new] [--graph g.json] [--patch p.json] [--usage usage.json] [--usage-tier prd|non-prd|unknown] [--prev gap.json] [--out-dir DIR] [--same-version] [--major] [--as-version X.Y] [--check]'); process.exit(2); }
      const res = buildGapDoc({ input: resolve(input), scope: get('--scope'), graphPath: get('--graph') && resolve(get('--graph')), patchPath: get('--patch') && resolve(get('--patch')),
        prevPath: get('--prev') && resolve(get('--prev')), usagePath: get('--usage') && resolve(get('--usage')), usageTier: get('--usage-tier') || '', outDir: get('--out-dir') && resolve(get('--out-dir')),
        sameVersion: args.includes('--same-version'), major: args.includes('--major'), asVersion: get('--as-version') || '', modelOut: get('--model-out') && resolve(get('--model-out')), check: args.includes('--check') });
      if (args.includes('--check')) { console.log(JSON.stringify(res, null, 2)); process.exit(res.errors.length ? 1 : 0); }
      for (const w of res.warnings) console.log(`⚠ build-gap-doc: ${w}`);
      console.log(JSON.stringify({ ...res, warnings: res.warnings.length }, null, 2));
    }
  } catch (e) {
    console.error(`build-gap-doc: ${e.message}`);
    process.exit(1);
  }
}

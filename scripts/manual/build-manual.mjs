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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderSelectionScreenSVG, renderAlvScreenSVG, renderFlowchartSVG, renderProcessFlowSVG, selectionSchemaWarnings,
} from '../spec/screen-image-renderer.mjs';
import { looksLikeEnglishProse } from '../spec/build-spec.mjs';
import { resolveArtifactBase, readScreenTheme } from '../lib/profile-resolve.mjs';
import { readManualConfig } from './manual-config.mjs';
import { labelsFor, STYLE, SCRIPT } from './manual-page.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Escaped text with **bold**, `code` and line breaks. */
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\r?\n/g, '<br>');
const arr = (x) => (Array.isArray(x) ? x.filter(v => v != null) : []);
const slug = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, '-');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Screens ─────────────────────────────────────────────────────────────

const isSelection = (key, spec) => key === 'selection' || spec?.kind === 'selection'
  || (!spec?.columns && !spec?.panes && (Array.isArray(spec?.blocks) || Array.isArray(spec?.fields)));

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

export function renderStepScreen(manual, step) {
  const key = step?.screen;
  if (!key) return null;
  const base = manual.screens?.[key];
  if (!base) return { key, error: `screen "${key}" is not in manual.screens` };
  const spec = { ...base, ...(step.patch && typeof step.patch === 'object' ? step.patch : {}) };
  const lang = manual.lang || 'ko';
  const svg = isSelection(key, spec)
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
        if (!c.anchor) return;
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

function stepHtml(manual, sc, si, st, ti, T, secNo) {
  const drawn = renderStepScreen(manual, st);
  const callouts = arr(st.callouts);
  const marks = callouts.map((c, i) => [i + 1, c.anchor]).filter(c => c[1]);
  const figure = drawn?.svg
    ? `<figure class="screen"${marks.length ? ` data-callouts="${esc(JSON.stringify(marks))}"` : ''}>${drawn.svg}${st.caption ? `<figcaption>${inline(st.caption)}</figcaption>` : ''}</figure>`
    : '';
  const list = callouts.length
    ? `<ol class="callouts">${callouts.map((c, i) => `<li><span class="num">${i + 1}</span><div>${inline(c.text)}${arr(c.details).length ? `<ul>${arr(c.details).map(d => `<li>${inline(d)}</li>`).join('')}</ul>` : ''}</div></li>`).join('')}</ol>`
    : '';
  const tcode = st.tcode || sc.tcode || manual.tcode || manual.program;
  const head = `<table class="step-head"><tbody>`
    + `<tr><th>${esc(T.transaction)}</th><td>${esc(`${secNo}-${si + 1}`)} ${inline(sc.title)}</td></tr>`
    + `<tr><th>${esc(T.description)}</th><td>${ti + 1}. ${inline(st.title)}</td></tr>`
    + `<tr><th>${esc(T.tcode)}</th><td><code>${esc(tcode)}</code>${manual.cbo === false ? '' : ` <span class="flag">${esc(T.cbo)}</span>`}</td></tr>`
    + (manual.menuPath ? `<tr><th>${esc(T.menuPath)}</th><td>${inline(manual.menuPath)}</td></tr>` : '')
    + `</tbody></table>`;
  const note = [st.note && `<p class="step-note">${inline(st.note)}</p>`, st.result && `<p class="step-note"><strong>${esc(T.result)}:</strong> ${inline(st.result)}</p>`].filter(Boolean).join('');
  return `<article class="step${ti > 0 ? ' page-break' : ''}" id="s${si + 1}-${ti + 1}">${head}<div class="step-body${figure ? ' has-screen' : ''}">${figure}<div>${list}${note}</div></div></article>`;
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
    [T.version, `v${esc(version)}`], [T.date, esc(date)],
    config.team && [T.team, esc(config.team)], config.author && [T.author, esc(config.author)],
  ].filter(Boolean);
  sec.push(`<section class="cover" id="cover"><div class="kicker">${esc(manual.module ? `${manual.module} · ` : '')}${esc(T.manual)}</div><h1>${esc(title)}</h1>`
    + `<dl class="meta">${meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`
    + (config.company ? `<div class="kicker">${esc(config.company)}</div>` : '') + `</section>`);

  // Revision history
  toc.push(['revision', T.revision]);
  sec.push(`<section id="revision" class="page-break"><h2>${esc(T.revision)}</h2>${table([T.version, T.date, T.author, T.change],
    history.map(h => [`v${esc(h.version)}`, esc(h.date), esc(h.author || ''), inline(h.note || '')]))}</section>`);

  // 1. Introduction
  let n = 1;
  const introParts = [];
  if (intro.purpose) introParts.push(`<h3>${esc(T.purpose)}</h3><p>${inline(intro.purpose)}${mark(intro.purpose)}</p>`);
  if (intro.background) introParts.push(`<h3>${esc(T.background)}</h3><p>${inline(intro.background)}${mark(intro.background)}</p>`);
  if (arr(intro.businessRules).length) introParts.push(`<h3>${esc(T.rules)}</h3><ul>${arr(intro.businessRules).map(r => `<li>${inline(r)}${mark(r)}</li>`).join('')}</ul>`);
  if (intro.users) introParts.push(`<h3>${esc(T.users)}</h3><p>${inline(intro.users)}${mark(intro.users)}</p>`);
  const pf = manual.processFlow;
  const pfSvg = pf && !Array.isArray(pf) && Array.isArray(pf.nodes) ? renderFlowchartSVG(pf, { lang: manual.lang })
    : Array.isArray(pf) && pf.length ? renderProcessFlowSVG(pf, { lang: manual.lang, orientation: 'horizontal' }) : '';
  if (pfSvg) introParts.push(`<h3>${esc(T.flow)}</h3><figure class="screen">${fitSvg(pfSvg)}</figure>`);
  toc.push(['intro', `${n}. ${T.intro}`]);
  sec.push(`<section id="intro" class="page-break"><h2>${n}. ${esc(T.intro)}</h2>${introParts.join('')}</section>`);

  // 2. Scenarios
  n += 1;
  const scToc = [];
  const scHtml = arr(manual.scenarios).map((sc, si) => {
    scToc.push([`s${si + 1}`, `${n}-${si + 1} ${sc.title || ''}`]);
    const steps = arr(sc.steps).map((st, ti) => stepHtml(manual, sc, si, st, ti, T, n)).join('');
    const cps = arr(sc.checkpoints).map(c => (typeof c === 'string' ? { text: c } : c)).filter(c => c?.text);
    const cpHtml = cps.length
      ? `<aside class="checkpoints"><h4>${esc(T.checkpoints)}</h4><ul>${cps.map(c => `<li>${inline(c.text)}${c.source ? ` <span class="src">(${esc(c.source)})</span>` : ''}</li>`).join('')}</ul></aside>`
      : '';
    return `<section id="s${si + 1}"${si > 0 ? ' class="page-break"' : ''}><h3>${n}-${si + 1} ${inline(sc.title)}</h3>${sc.goal ? `<p class="scenario-goal">${esc(T.goal)}: ${inline(sc.goal)}</p>` : ''}${steps}${cpHtml}</section>`;
  }).join('');
  toc.push(['scenarios', `${n}. ${T.scenarios}`, scToc]);
  sec.push(`<section id="scenarios" class="page-break"><h2>${n}. ${esc(T.scenarios)}</h2>${scHtml}</section>`);

  // 3. Fields
  const selF = arr(manual.fields?.selection), outF = arr(manual.fields?.output);
  if (selF.length || outF.length) {
    n += 1;
    toc.push(['fields', `${n}. ${T.fields}`]);
    sec.push(`<section id="fields" class="page-break"><h2>${n}. ${esc(T.fields)}</h2>`
      + (selF.length ? `<h3>${esc(T.selFields)}</h3>${table([T.field, T.label, T.required, T.f4, T.example, T.meaning],
        selF.map(f => [`<code>${esc(f.name)}</code>`, esc(f.label), f.required ? '●' : '', f.f4 ? '●' : '', esc(f.example ?? ''), inline(f.description)]))}` : '')
      + (outF.length ? `<h3>${esc(T.outFields)}</h3>${table([T.field, T.label, T.meaning],
        outF.map(f => [`<code>${esc(f.name)}</code>`, esc(f.header ?? f.label), inline(f.description)]))}` : '')
      + `</section>`);
  }

  // 4. Messages
  const msgs = arr(manual.messages);
  if (msgs.length) {
    n += 1;
    toc.push(['messages', `${n}. ${T.messages}`]);
    sec.push(`<section id="messages" class="page-break"><h2>${n}. ${esc(T.messages)}</h2>${table([T.code, T.msgType, T.text, T.cause, T.action],
      msgs.map(m => [`<code>${esc(m.code)}</code>`, esc(m.type ?? ''), esc(m.text ?? ''), inline(m.cause), inline(m.action)]))}</section>`);
  }

  // 5. Glossary
  const gl = arr(manual.glossary);
  if (gl.length) {
    n += 1;
    toc.push(['glossary', `${n}. ${T.glossary}`]);
    sec.push(`<section id="glossary" class="page-break"><h2>${n}. ${esc(T.glossary)}</h2>${table([T.term, T.meaning], gl.map(g => [esc(g.term), inline(g.description)]))}</section>`);
  }

  const tocHtml = `<ol>${toc.map(([id, label, kids]) => `<li><a href="#${id}">${esc(label)}</a>${kids?.length ? `<ol>${kids.map(([k, l]) => `<li><a href="#${k}">${esc(l)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>`;
  const footer = [config.company, config.confidentiality].filter(Boolean).join(' · ');
  return `<!doctype html>
<html lang="${esc(manual.lang || 'ko')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(T.manual)} v${esc(version)}</title>
<style>${STYLE}</style></head>
<body>
<header class="topbar"><span class="t">${esc(title)} · <code>${esc(manual.program)}</code> · v${esc(version)}</span><button id="print-btn" type="button">${esc(T.print)}</button><button id="theme-btn" type="button">${esc(T.theme)}</button></header>
<div class="layout"><nav class="toc" aria-label="${esc(T.contents)}">${tocHtml}</nav><main>
${sec.join('\n')}
<footer class="doc-end"><strong>${esc(T.endOfDoc)}</strong>${config.confidentiality ? inline(config.confidentiality) : ''}</footer>
</main></div>
${footer ? `<div class="print-footer">${esc(footer)} · ${esc(manual.program)} v${esc(version)}</div>` : ''}
<script>${SCRIPT}</script>
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
  const entry = { version, date: today(), author: config.author || '', note: manual.changeNote || '' };
  const versions = arr(history.versions);
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

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
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

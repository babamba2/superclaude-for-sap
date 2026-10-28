// sc4sap:module-to-process — integration map page of two (or more) module process maps.
//
//   node build-integration-doc.mjs <integration dir> [--lang ko|en|ja] [--same-version]
//
// <integration dir> holds integration-touchpoints.json (cross-module.mjs) and optionally integration-scenarios.json
// (E2E scenarios written by the consultant pass). The module models are read from the state dirs recorded in the
// touchpoints file; every task links to its anchor in the latest module page of the same language.
// Writes <integration dir>/../<A>-<B>-integration-v<ver>-<lang>.html plus a history file next to it.

import fs from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLE } from './process-page.mjs';
import { drawSwimlane } from './swimlane.mjs';
import { anchorId } from './process-model.mjs';
import { latestPage, stepWhere } from './integration-view.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LABELS = {
  ko: {
    doc: '통합 맵', contents: '목차', version: '버전', date: '작성일', overview: '개요', scenarios: 'E2E 시나리오', matrix: '접점 매트릭스',
    list: '접점 목록', hubs: '공유 마스터·공통 기능', stubs: '경계 스텁 (아직 맵이 없는 모듈)', task: 'Task', object: '객체', role: '동작',
    direction: '방향', evidence: '근거', desc: '설명', other: '상대 Task', none: '상대 모듈에 같은 객체를 쓰는 Task가 없음', module: '모듈',
    count: '건수', users: '사용 Task 수', kind: '구분', master: '마스터·공통 테이블', utility: '공통 기능', search: '검색',
    reads: '읽음', writes: '씀', calls: '호출', note: '분석 메모', touchpoints: '접점', paired: '양쪽 Task 연결', pairs: 'Task 쌍',
    stubLead: '아래 모듈은 아직 프로세스 맵이 없습니다. 그 모듈을 분석하면 이 접점이 상대 Task와 연결됩니다.',
    matrixLead: '행 = {A} Task, 열 = {B} 프로세스 체인(L2). 칸의 숫자는 두 쪽이 함께 쓰는 객체 수입니다.',
    scenLead: '모듈을 넘나드는 업무 흐름입니다. 상자를 누르면 모듈 프로세스 맵의 해당 Task로 갑니다.',
    noScen: 'E2E 시나리오가 아직 없습니다 (컨설턴트 검토 단계에서 작성).', pairNotes: '주요 Task 쌍', openQ: '확인 필요 항목', conversion: '전환 시 유의', steps: '단계', endOfDoc: 'End of Document',
    print: '인쇄', theme: '테마', top: '대표 객체', where: '수행 위치', more: '외 {n}개',
  },
  en: {
    doc: 'Integration Map', contents: 'Contents', version: 'Version', date: 'Date', overview: 'Overview', scenarios: 'E2E Scenarios', matrix: 'Touchpoint Matrix',
    list: 'Touchpoints', hubs: 'Shared master data and utilities', stubs: 'Boundary stubs (modules without a map yet)', task: 'Task', object: 'Object', role: 'Action',
    direction: 'Direction', evidence: 'Evidence', desc: 'Description', other: 'Other side', none: 'No task of the other module touches this object', module: 'Module',
    count: 'Count', users: 'Tasks using it', kind: 'Kind', master: 'Master / shared table', utility: 'Shared function', search: 'Search',
    reads: 'reads', writes: 'writes', calls: 'calls', note: 'analyst note', touchpoints: 'Touchpoints', paired: 'Paired with a task', pairs: 'Task pairs',
    stubLead: 'These modules have no process map yet. Analysing one connects these touchpoints to its tasks.',
    matrixLead: 'Rows = {A} tasks, columns = {B} process chains (L2). A cell counts the objects both sides touch.',
    scenLead: 'Business flows that cross modules. Click a box to open the task in its module process map.',
    noScen: 'No E2E scenarios yet (written in the consultant review).', pairNotes: 'Key task pairs', openQ: 'Open questions', conversion: 'Conversion notes', steps: 'Steps', endOfDoc: 'End of Document',
    print: 'Print', theme: 'Theme', top: 'Main objects', where: 'Where', more: '+{n} more',
  },
};
LABELS.ja = { ...LABELS.en, doc: '統合マップ', overview: '概要', scenarios: 'E2E シナリオ', matrix: '接点マトリクス', list: '接点一覧' };
const labelsFor = (lang) => LABELS[String(lang || 'ko').slice(0, 2)] || LABELS.en;

const latestModulePage = (stateDir, module, lang) => latestPage(resolve(stateDir, '..'), `${module}-process`, lang);

export function renderIntegrationHtml({ tp, scen, models, pages, lang, version, date, outDir }) {
  const T = labelsFor(lang);
  const [A, B] = tp.modules;
  const title = `${tp.modules.join(' ↔ ')} ${T.doc}`;
  const rowOf = (mod, code) => arr(models[mod]?.rows).find(r => r.code === code);
  const href = (mod, code) => (pages[mod] ? `${relative(outDir, pages[mod]).replace(/\\/g, '/')}#${anchorId(code)}` : '');
  const task = (mod, code) => {
    const r = rowOf(mod, code); const h = href(mod, code);
    const txt = `<span class="mod mod-${esc(mod)}">${esc(mod)}</span> <code>${esc(code)}</code> ${esc(r?.label || '')}`;
    return h ? `<a href="${esc(h)}">${txt}</a>` : txt;
  };
  const roleTxt = (r) => T[r] || r;
  const inside = arr(tp.touchpoints).filter(t => tp.modules.includes(t.owner) && t.owner !== t.from.module);
  const paired = inside.filter(t => t.to);
  const pairSet = new Set(paired.flatMap(t => t.to.map(o => [`${t.from.module}|${t.from.code}`, `${o.module}|${o.code}`].sort().join('~'))));
  const toc = [], sec = [];
  const h2 = (id, n, label) => { toc.push([id, `${n}. ${label}`]); return `<h2 id="${id}">${n}. ${esc(label)}</h2>`; };

  // 1. overview
  const dirCount = (x, y) => inside.filter(t => t.from.module === x && t.owner === y).length;
  const stats = [[`${A} → ${B}`, dirCount(A, B)], [`${B} → ${A}`, dirCount(B, A)], [T.paired, paired.length], [T.pairs, pairSet.size], [T.hubs, arr(tp.hubs).length]];
  sec.push(`<section id="overview">${h2('overview', 1, T.overview)}<div class="cards">${stats.map(([k, v]) => `<div class="card"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`).join('')}</div></section>`);

  const stepWhere_ = (steps, i) => stepWhere(tp, rowOf, steps, i, (n) => T.more.replace('{n}', n));
  // 2. scenarios
  const sc = arr(scen?.scenarios);
  const scenHtml = sc.map((s, si) => {
    const lanes = tp.modules.map(m => ({ id: m, label: m }));
    const nodes = arr(s.steps).map((st, i) => ({ id: `n${i}`, label: rowOf(st.module, st.code)?.label || st.label || st.code, sub: `${i + 1} · ${st.module} ${st.code}`, foot: stepWhere_(s.steps, i),
      lane: st.module, col: i, system: 'sap', kind: rowOf(st.module, st.code)?.kind || 'cbo', href: href(st.module, st.code) || undefined }));
    // the handed-over object and the step note are in the table under the drawing; the boxes stay short
    const edges = arr(s.steps).slice(1).map((st, i) => ({ from: `n${i}`, to: `n${i + 1}` }));
    const conv = arr(s.conversion);
    return `<div class="scen" id="scen-${si + 1}"><h3>${esc(`${si + 1}. ${s.title}`)}</h3><p>${esc(s.desc || '')}</p>`
      + `<figure class="flowfig swim">${drawSwimlane({ lanes, nodes, edges })}</figure>`
      + `<div class="tw"><table><thead><tr><th>#</th><th>${esc(T.task)}</th><th>${esc(T.where)}</th><th>${esc(T.object)}</th><th>${esc(T.desc)}</th></tr></thead><tbody>`
      + arr(s.steps).map((st, i) => `<tr><td>${i + 1}</td><td>${task(st.module, st.code)}</td><td>${stepWhere_(s.steps, i).split(' / ').map(w => `<code>${esc(w)}</code>`).join(' ')}</td><td>${st.via ? `<code>${esc(st.via)}</code>` : ''}</td><td>${esc(st.note || '')}</td></tr>`).join('')
      + `</tbody></table></div>${conv.length ? `<div class="tbd"><strong>${esc(T.conversion)}</strong><ul>${conv.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}</div>`;
  }).join('');
  const pn = arr(scen?.pair_notes);
  const pnHtml = pn.length ? `<h3 id="pairs">${esc(T.pairNotes)}</h3><div class="tw"><table><thead><tr><th>${esc(T.task)}</th><th>${esc(T.other)}</th><th>${esc(T.desc)}</th></tr></thead><tbody>`
    + pn.map(p => `<tr><td>${task(p.a.module, p.a.code)}</td><td>${task(p.b.module, p.b.code)}</td><td>${esc(p.desc || '')}</td></tr>`).join('') + '</tbody></table></div>' : '';
  sec.push(`<section id="scenarios" class="page-break">${h2('scenarios', 2, T.scenarios)}<p class="lead">${esc(sc.length ? T.scenLead : T.noScen)}</p>${scenHtml}${pnHtml}</section>`);

  // 3. matrix: rows = A tasks with pairs, cols = B L2
  const l2 = arr(models[B]?.rows).filter(r => r.level === 2);
  const cell = new Map();
  for (const t of paired) for (const o of t.to) {
    const [a, b] = t.from.module === A ? [t.from, o] : [o, t.from];
    if (a.module !== A || b.module !== B) continue;
    const col = b.code.split('.').slice(0, 2).join('.'); const k = `${a.code}|${col}`;
    if (!cell.has(k)) cell.set(k, new Set()); cell.get(k).add(t.object);
  }
  const aRows = [...new Set([...cell.keys()].map(k => k.split('|')[0]))].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  const max = Math.max(1, ...[...cell.values()].map(s => s.size));
  sec.push(`<section id="matrix" class="page-break">${h2('matrix', 3, T.matrix)}<p class="lead">${esc(T.matrixLead.replace('{A}', A).replace('{B}', B))}</p>`
    + `<div class="tw"><table class="mx"><thead><tr><th>${esc(A)} ${esc(T.task)}</th>${l2.map(c => `<th title="${esc(c.label)}"><code>${esc(c.code)}</code><br>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>`
    + aRows.map(a => `<tr><th>${task(A, a)}</th>${l2.map(c => { const s = cell.get(`${a}|${c.code}`); if (!s) return '<td></td>';
      const lvl = Math.ceil((s.size / max) * 4); return `<td class="h${lvl}" title="${esc([...s].join(', '))}">${s.size}</td>`; }).join('')}</tr>`).join('')
    + `</tbody></table></div></section>`);

  // 4. list, grouped by object
  const byObj = new Map();
  for (const t of inside) { const k = `${t.owner}|${t.object}`; if (!byObj.has(k)) byObj.set(k, []); byObj.get(k).push(t); }
  const listRows = [...byObj.entries()].sort((x, y) => x[0].localeCompare(y[0])).flatMap(([, ts]) => ts.map((t, i) => `<tr>`
    + `${i === 0 ? `<td rowspan="${ts.length}"><code>${esc(t.object)}</code><div class="sub">${esc(t.owner)} · ${esc(t.type || '')}</div></td>` : ''}`
    + `<td>${task(t.from.module, t.from.code)}</td><td>${esc(roleTxt(t.role))}</td>`
    + `<td>${t.to ? t.to.map(o => `<div>${task(o.module, o.code)} <span class="sub">${esc(roleTxt(o.role))}</span></div>`).join('') : `<span class="sub">${esc(T.none)}</span>`}</td>`
    + `<td>${t.evidence ? `<code>${esc(t.evidence.from)}</code>${t.evidence.unit ? `<div class="sub">${esc(t.evidence.unit)}${t.evidence.line ? ` ${esc(t.evidence.line)}` : ''}</div>` : ''}` : ''}</td>`
    + `<td>${esc(t.desc || '')}</td></tr>`));
  sec.push(`<section id="list" class="page-break">${h2('list', 4, T.list)}<div class="bph-tools"><input id="ix-q" type="search" placeholder="${esc(T.search)}" aria-label="${esc(T.search)}"></div>`
    + `<div class="tw"><table class="ix"><thead><tr><th>${esc(T.object)}</th><th>${esc(T.task)}</th><th>${esc(T.role)}</th><th>${esc(T.other)}</th><th>${esc(T.evidence)}</th><th>${esc(T.desc)}</th></tr></thead><tbody>${listRows.join('')}</tbody></table></div></section>`);

  // 5. hubs
  const hubs = arr(tp.hubs).filter(h => tp.modules.includes(h.owner));
  sec.push(`<section id="hubs">${h2('hubs', 5, T.hubs)}<div class="tw"><table><thead><tr><th>${esc(T.object)}</th><th>${esc(T.module)}</th><th>${esc(T.kind)}</th>${tp.modules.map(m => `<th>${esc(m)} ${esc(T.users)}</th>`).join('')}</tr></thead><tbody>`
    + hubs.map(h => `<tr><td><code>${esc(h.object)}</code></td><td>${esc(h.owner)}</td><td>${esc(h.kind === 'utility' ? T.utility : T.master)}</td>${tp.modules.map(m => `<td>${(h.users || h.readers || {})[m] || ''}</td>`).join('')}</tr>`).join('')
    + `</tbody></table></div></section>`);

  // 6. stubs
  const stubMods = Object.entries(tp.stubs || {}).sort((x, y) => y[1] - x[1]);
  const topOf = (m) => { const c = {}; for (const t of arr(tp.touchpoints)) if (t.stub && t.owner === m) c[t.object] = (c[t.object] || 0) + 1; return Object.entries(c).sort((x, y) => y[1] - x[1]).slice(0, 8).map(x => x[0]); };
  sec.push(`<section id="stubs">${h2('stubs', 6, T.stubs)}<p class="lead">${esc(T.stubLead)}</p><div class="tw"><table><thead><tr><th>${esc(T.module)}</th><th>${esc(T.touchpoints)}</th><th>${esc(T.top)}</th></tr></thead><tbody>`
    + stubMods.map(([m, n]) => `<tr><td>${esc(m)}</td><td>${n}</td><td>${topOf(m).map(o => `<code>${esc(o)}</code>`).join(' ')}</td></tr>`).join('') + `</tbody></table></div></section>`);

  const oq = arr(scen?.open_questions);
  if (oq.length) sec.push(`<section id="openq">${h2('openq', 7, T.openQ)}<ul>${oq.map(q => `<li>${esc(q)}</li>`).join('')}</ul></section>`);

  const css = `.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}.card .k{color:var(--muted);font-size:13px}.card .v{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
.lead{color:var(--muted)}.sub{color:var(--muted);font-size:12.5px}.mod{display:inline-block;font-size:11px;font-weight:700;border-radius:4px;padding:0 5px;color:#fff;background:var(--accent)}
.mod-${esc(B)}{background:#8a5a00}.scen{border:1px solid var(--line);border-radius:10px;padding:14px;margin:14px 0}
table.mx td{text-align:center;font-variant-numeric:tabular-nums}table.mx th{font-weight:600;font-size:13px;vertical-align:bottom}
table.mx td.h1{background:color-mix(in srgb,var(--accent) 12%,transparent)}table.mx td.h2{background:color-mix(in srgb,var(--accent) 25%,transparent)}
table.mx td.h3{background:color-mix(in srgb,var(--accent) 42%,transparent)}table.mx td.h4{background:color-mix(in srgb,var(--accent) 62%,transparent);color:var(--accent-ink)}
table.ix td{vertical-align:top}`;
  const js = `(function(){var tb=document.getElementById('theme-btn');if(tb)tb.addEventListener('click',function(){var r=document.documentElement,c=r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');r.setAttribute('data-theme',c==='dark'?'light':'dark');});
var pb=document.getElementById('print-btn');if(pb)pb.addEventListener('click',function(){window.print();});
var q=document.getElementById('ix-q');if(q)q.addEventListener('input',function(){var s=q.value.trim().toLowerCase();var rows=document.querySelectorAll('table.ix tbody tr');var obj='';
rows.forEach(function(r){var c=r.cells[0];if(c&&c.hasAttribute('rowspan'))obj=c.textContent.toLowerCase();r.hidden=!!s&&(obj+' '+r.textContent.toLowerCase()).indexOf(s)<0;});});})();`;
  const tocHtml = `<ol>${toc.map(([id, l]) => `<li><a href="#${id}">${esc(l)}</a></li>`).join('')}</ol>`;
  return `<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} v${esc(version)}</title>
<style>${STYLE}${css}</style></head>
<body>
<header class="topbar"><span class="t">${esc(title)} · v${esc(version)}</span><button id="print-btn" type="button">${esc(T.print)}</button><button id="theme-btn" type="button">${esc(T.theme)}</button></header>
<div class="layout"><nav class="toc" aria-label="${esc(T.contents)}">${tocHtml}</nav><main>
<section class="cover" id="cover"><div class="kicker">${esc(tp.modules.join(' · '))} · ${esc(T.doc)}</div><h1>${esc(title)}</h1><dl class="meta"><dt>${esc(T.version)}</dt><dd>v${esc(version)}</dd><dt>${esc(T.date)}</dt><dd>${esc(date)}</dd></dl></section>
${sec.join('\n')}
<footer class="doc-end"><strong>${esc(T.endOfDoc)}</strong></footer>
</main></div>
<script type="application/json" id="integration-model">${JSON.stringify({ touchpoints: tp, scenarios: scen || null }).replace(/</g, '\\u003c')}</script>
<script>${js}</script>
</body></html>
`;
}

export function buildIntegrationDoc({ dir, lang = 'ko', sameVersion = false }) {
  const tp = JSON.parse(fs.readFileSync(join(dir, 'integration-touchpoints.json'), 'utf8'));
  const scenFile = join(dir, `integration-scenarios${lang === 'ko' ? '' : '.' + lang}.json`);
  const scen = fs.existsSync(scenFile) ? JSON.parse(fs.readFileSync(scenFile, 'utf8')) : fs.existsSync(join(dir, 'integration-scenarios.json')) ? JSON.parse(fs.readFileSync(join(dir, 'integration-scenarios.json'), 'utf8')) : null;
  const models = {}, pages = {};
  for (const m of tp.modules) {
    const st = tp.states?.[m]; if (!st) continue;
    const f = join(st, lang === 'ko' ? 'process-model.json' : `process-model.${lang}.json`);
    models[m] = JSON.parse(fs.readFileSync(fs.existsSync(f) ? f : join(st, 'process-model.json'), 'utf8'));
    pages[m] = latestModulePage(st, m, lang);
  }
  const outDir = resolve(dir, '..');
  const name = tp.modules.join('-');
  const histFile = join(outDir, `${name}-integration-${lang}.history.json`);
  const hist = fs.existsSync(histFile) ? JSON.parse(fs.readFileSync(histFile, 'utf8')) : { versions: [] };
  const last = hist.versions.at(-1)?.version;
  const version = !last ? '1.0' : sameVersion ? last : `${last.split('.')[0]}.${+last.split('.')[1] + 1}`;
  const date = new Date().toISOString().slice(0, 10);
  const html = renderIntegrationHtml({ tp, scen, models, pages, lang, version, date, outDir });
  const out = join(outDir, `${name}-integration-v${version}-${lang}.html`);
  fs.writeFileSync(out, html);
  if (!sameVersion || !last) { hist.versions.push({ version, date }); fs.writeFileSync(histFile, JSON.stringify(hist, null, 1)); }
  return { html: out, version, scenarios: arr(scen?.scenarios).length, pages };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const args = process.argv.slice(2);
  const dir = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--lang');
  if (!dir) { console.error('Usage: node build-integration-doc.mjs <integration dir> [--lang ko|en|ja] [--same-version]'); process.exit(2); }
  const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'ko';
  console.log(JSON.stringify(buildIntegrationDoc({ dir, lang, sameVersion: args.includes('--same-version') })));
}

// sc4sap:s4-conversion-readiness — the report page: one self-contained HTML file. Every table has a filter row
// under its header (contains, per column), sorts on a header click and exports the rows shown as CSV.

import { labelsFor } from './readiness-labels.mjs';
import { SEVS, sevRank } from './readiness-scan.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
const tx = (o, lang) => (o && typeof o === 'object' ? o[lang] || o.en || o.ko || '' : o || '');

const sevChip = (s, L) => (s ? `<span class="sv sv-${s}" title="${esc(L.sevHelp[s])}">${esc(L.sev[s])}</span>` : '');

/** A table with a filter row and a CSV button. cols: [{ h, num?, w? }]; rows: arrays of cell HTML. */
function table(id, cols, rows, L) {
  const th = cols.map((c, j) => `<th data-j="${j}"${c.num ? ' class="num"' : ''}${c.w ? ` style="min-width:${c.w}px"` : ''}>${esc(c.h)}</th>`).join('');
  const fr = cols.map(() => `<th><input class="fin" size="1" placeholder="${esc(L.filter)}"></th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((v, j) => `<td${cols[j].num ? ' class="num"' : cols[j].wrap ? ' class="wrap"' : ''}>${v ?? ''}</td>`).join('')}</tr>`).join('');
  return `<div class="tw"><div class="tt"><span class="cnt" data-n="${rows.length}">${esc(fmt(L.rows, { n: rows.length }))}</span><button data-csv="${id}">${esc(L.csv)}</button></div>
<div class="gw"><table class="grid" id="t-${id}"><thead><tr class="hd">${th}</tr><tr class="frow">${fr}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

function summary(m, L, lang, kb) {
  const t = m.totals, score = m.score;
  const tile = (k, v, cls = '', help = '') => `<div class="tile ${cls}"${help ? ` title="${esc(help)}"` : ''}><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`;
  const tiles = tile(L.sum.score, score == null ? '-' : `${score}`, score != null && score < 60 ? 'bad' : '', L.sum.scoreHelp) + tile(L.sum.objects, t.objects) + tile(L.sum.hit, t.hit)
    + tile(L.sum.blockers, t.blockerObjects, t.blockerObjects ? 'bad' : '') + tile(L.sum.days, t.days) + tile(L.sum.exits, `${t.exitsHit} / ${t.exits}`) + tile(L.sum.appends, `${t.appendsHit} / ${t.appends}`);
  const sevBar = `<div class="sevbar">${SEVS.map((s) => `<span>${sevChip(s, L)} ${t.bySev[s] || 0}</span>`).join('')}</div>`;
  const areas = table('areas', [{ h: L.cols.area }, { h: L.cols.worst }, { h: L.cols.findings, num: 1 }, { h: L.cols.objects, num: 1 }], t.areas.map((a) => [esc(a.area), sevChip(a.worst, L), a.n, a.objects]), L);
  const top = [...m.objects].filter((o) => o.findings).sort((a, b) => sevRank(a.worst) - sevRank(b.worst) || b.findings - a.findings).slice(0, 15);
  const topT = table('top', [{ h: L.cols.object }, { h: L.cols.module }, { h: L.cols.worst }, { h: L.cols.findings, num: 1 }, { h: L.cols.items, wrap: 1 }, { h: L.cols.effort }],
    top.map((o) => [`<b>${esc(o.name)}</b> <small>${esc(o.type)}</small>`, esc(o.module), sevChip(o.worst, L), o.findings, esc(o.items.join(', ')), esc(L.effort[o.effort] || '')]), L);
  const nar = arr(m.narrative?.summary);
  const tg = kb.targets?.[m.target];
  return `<h2>${esc(L.tabs.sum)}</h2><div class="tiles">${tiles}</div>${sevBar}
<div class="note"><b>${esc(L.sum.targetNote)}: ${esc(tx(tg?.label, lang))}</b><br>${esc(tx(tg?.note, lang))}</div>
${nar.length ? `<h3>${esc(L.sum.narrative)}</h3><ul class="nar">${nar.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
<h3>${esc(L.sum.areas)}</h3>${areas}<h3>${esc(L.sum.top)}</h3>${topT}`;
}

function targetTab(m, L, lang, kb) {
  const keys = m.target === 'compare' ? ['2023', '2025', 'public'] : [m.target];
  return `<h2>${esc(L.tabs.target)}</h2>${keys.map((k) => `<div class="note"><b>${esc(tx(kb.targets[k]?.label, lang))}</b><br>${esc(tx(kb.targets[k]?.note, lang))}</div>`).join('')}`;
}

function itemsTab(m, L, lang, kb) {
  const rows = [];
  for (const it of [...arr(kb.items), ...arr(kb.patterns)]) {
    const fs = m.findings.filter((f) => f.item === it.id), us = m.usage.filter((u) => u.item === it.id);
    const ap = m.appends.filter((a) => a.item === it.id), ex = m.exits.filter((x) => x.item === it.id);
    if (!fs.length && !us.length && !ap.length && !ex.length) continue;
    const worst = [...fs.map((f) => f.sev), ...us.map((u) => u.sev), ...ap.map((a) => a.sev), ...ex.map((x) => x.sev)].sort((a, b) => sevRank(a) - sevRank(b))[0];
    rows.push([`<b>${esc(it.id)}</b>`, esc(it.area), sevChip(worst, L), `<b>${esc(tx(it.title, lang))}</b><br><small>${esc(tx(it.change, lang))}</small>`, new Set(fs.map((f) => f.object)).size,
      esc(us.map((u) => u.tcode).join(', ')), esc(ap.map((a) => `${a.table} (${a.fields.length})`).join(', ')), esc(tx(it.action, lang))]);
  }
  rows.sort((a, b) => sevRank(a[2].match(/sv-(\w+)/)?.[1]) - sevRank(b[2].match(/sv-(\w+)/)?.[1]));
  return `<h2>${esc(L.tabs.items)}</h2>` + table('items', [{ h: L.cols.id }, { h: L.cols.area }, { h: L.cols.sev }, { h: L.cols.title, wrap: 1, w: 320 }, { h: L.cols.objects, num: 1 }, { h: L.cols.usedTc, wrap: 1 }, { h: L.tabs.appends, wrap: 1 }, { h: L.cols.action, wrap: 1, w: 300 }], rows, L);
}

function objectsTab(m, L) {
  const pub = m.target === 'public' || m.target === 'compare', lvl = m.target === '2025' || m.target === 'compare';
  const cols = [{ h: L.cols.object }, { h: L.cols.type }, { h: L.cols.module }, { h: L.cols.lines, num: 1 }, { h: L.cols.worst }, { h: L.cols.findings, num: 1 }, { h: L.cols.items, wrap: 1 }, { h: L.cols.effort },
    ...(lvl ? [{ h: L.cols.levelCol }] : []), ...(pub ? [{ h: L.cols.cloudCol }] : [])];
  const rows = [...m.objects].sort((a, b) => sevRank(a.worst || 'x') - sevRank(b.worst || 'x') || b.findings - a.findings || a.name.localeCompare(b.name))
    .map((o) => [`<b>${esc(o.name)}</b>`, esc(o.type), esc(o.module), o.lines || '', sevChip(o.worst, L), o.findings || '', esc(o.items.join(', ')), esc(L.effort[o.effort] || ''),
      ...(lvl ? [esc(L.level[o.level])] : []), ...(pub ? [esc(L.cloud[o.cloud])] : [])]);
  return `<h2>${esc(L.tabs.objects)}</h2>` + table('objects', cols, rows, L);
}

function findingsTab(m, L) {
  const rows = [...m.findings].sort((a, b) => sevRank(a.sev) - sevRank(b.sev) || a.object.localeCompare(b.object)).map((f) => [
    `<b>${esc(f.object.split(':')[1])}</b>`, esc(f.module), esc(f.item), esc(L.kind[f.kind] || f.kind), esc(f.target) + (f.bdc ? ' <small>BDC</small>' : ''), sevChip(f.sev, L), esc(f.to),
    arr(f.evidence).map((e) => `<div class="ev"><small>${esc(e.unit)}:${e.line}</small> <code>${esc(e.text)}</code></div>`).join(''), f.count]);
  return `<h2>${esc(L.tabs.findings)}</h2>` + table('findings', [{ h: L.cols.object }, { h: L.cols.module }, { h: L.cols.id }, { h: L.cols.kind }, { h: L.cols.target }, { h: L.cols.sev }, { h: L.cols.to }, { h: L.cols.evidence, wrap: 1, w: 380 }, { h: L.cols.count, num: 1 }], rows, L);
}

function exitsTab(m, L, lang) {
  const pub = m.target === 'public';
  const rows = [...m.exits].sort((a, b) => sevRank(a.sev) - sevRank(b.sev) || a.module.localeCompare(b.module)).map((x) => [esc(x.module), esc(x.kind), `<b>${esc(x.standard)}</b>`, esc(x.desc), esc(x.customs.join(', ')),
    sevChip(x.sev, L), esc(x.note ? tx(x.note, lang) : pub ? L.exitDefault.public : m.target === 'compare' ? `${L.exitDefault.onprem} / ${L.exitDefault.public}` : L.exitDefault.onprem)]);
  return `<h2>${esc(L.tabs.exits)}</h2>` + table('exits', [{ h: L.cols.module }, { h: L.cols.exitKind }, { h: L.cols.standard }, { h: L.cols.desc, wrap: 1 }, { h: L.cols.customs, wrap: 1 }, { h: L.cols.sev }, { h: L.cols.impact, wrap: 1, w: 300 }], rows, L);
}

function appendsTab(m, L, lang, kb) {
  const pub = m.target === 'public', A = kb.tableExtensions?.action || {};
  const act = (a) => (pub ? L.appendPublic : fmt(tx(A[a.kind], lang), { to: a.to, cds: a.cds.join(', ') || '-' }));
  const rows = m.appends.map((a) => [esc(a.module), `<b>${esc(a.table)}</b>`, `${a.fields.length} <small>${esc(a.fields.slice(0, 15).join(', '))}${a.fields.length > 15 ? ' …' : ''}</small>`,
    esc(a.includes.join(', ')), `<span class="st st-${a.kind === 'move' || a.kind === 'proxy' ? 'attention' : 'na'}">${esc(L.extKind[a.kind])}</span>`, sevChip(a.sev, L),
    esc([a.to, a.object].filter(Boolean).join(' · ')), esc(act(a)), esc(a.cds.join(', '))]);
  return `<h2>${esc(L.tabs.appends)}</h2><p class="note">${esc(L.extIntro)}</p>` + table('appends', [{ h: L.cols.module }, { h: L.cols.table }, { h: L.cols.fields, wrap: 1, w: 260 }, { h: L.cols.includes }, { h: L.cols.extKind },
    { h: L.cols.sev }, { h: L.cols.extTarget, wrap: 1 }, { h: L.cols.action, wrap: 1, w: 340 }, { h: L.cols.cds }], rows, L);
}

function integTab(m, L, lang) {
  const id = arr(m.integration);
  const t1 = id.length ? table('idoc', [{ h: L.cols.mestyp }, { h: L.cols.dir }, { h: L.cols.idoctyp }, { h: L.cols.partners, num: 1 }, { h: L.cols.id }, { h: L.cols.sev }, { h: L.cols.impact, wrap: 1, w: 360 }],
    id.map((x) => [`<b>${esc(x.mestyp)}</b>`, esc(L.integ.dir[x.dir] || x.dir), esc(x.idoctyp), x.partners, esc(x.item), sevChip(x.sev, L), esc(x.note ? tx(x.note, lang) : L.integ.other)]), L) : `<p class="note">${esc(arr(m.facts?.errors).some((e) => /^(EDP13|EDP21|SWETYPECOU):/.test(e)) ? L.integ.blocked : Array.isArray(m.facts?.idoc) ? L.integ.empty : L.integ.noIdoc)}</p>`;
  const fs = m.findings.filter((f) => f.area === 'INT').sort((a, b) => a.item.localeCompare(b.item) || a.object.localeCompare(b.object));
  const t2 = table('integ', [{ h: L.cols.object }, { h: L.cols.module }, { h: L.cols.id }, { h: L.cols.kind }, { h: L.cols.target }, { h: L.cols.evidence, wrap: 1, w: 360 }],
    fs.map((f) => [`<b>${esc(f.object.split(':')[1])}</b>`, esc(f.module), esc(f.item), esc(L.kind[f.kind] || f.kind), esc(f.target), arr(f.evidence).map((e) => `<div class="ev"><small>${esc(e.unit)}:${e.line}</small> <code>${esc(e.text)}</code></div>`).join('')]), L);
  return `<h2>${esc(L.tabs.integ)}</h2><h3>${esc(L.integ.idoc)}</h3>${t1}<h3>${esc(L.integ.code)}</h3>${t2}`;
}

function usageTab(m, L, lang, kb) {
  const it = new Map(arr(kb.items).map((x) => [x.id, x]));
  const rows = m.usage.map((u) => [`<b>${esc(u.tcode)}</b>`, esc(u.item), esc(u.area), sevChip(u.sev, L), esc(u.to), esc(tx(it.get(u.item)?.title, lang))]);
  return `<h2>${esc(L.tabs.usage)}</h2>` + table('usage', [{ h: L.cols.tcode }, { h: L.cols.id }, { h: L.cols.area }, { h: L.cols.sev }, { h: L.cols.to }, { h: L.cols.title, wrap: 1 }], rows, L);
}

function extTab(m, L, lang, kb) {
  const keys = Object.keys(kb.extensions || {});
  const rows = keys.map((k) => {
    const e = m.extEvidence[k] || { evidence: [] }, chosen = m.extensions.includes(k);
    const ev = e.evidence.map((x) => `${fmt(L.evid[x.k] || x.k, { n: x.n })}${x.list ? ` <small>(${esc(x.list.join(', '))})</small>` : ''}`).join('<br>');
    const nar = m.narrative?.extensions?.[k];
    return [`<b>${esc(tx(kb.extensions[k].label, lang))}</b>`, chosen ? `<b>${esc(L.note.chosenYes)}</b>` : esc(L.note.chosenNo), ev || esc(L.none), esc(nar || (e.recommend || chosen ? L.extRec[k] : ''))];
  }).sort((a, b) => (b[1].includes('<b>') - a[1].includes('<b>')));
  return `<h2>${esc(L.tabs.ext)}</h2>` + table('ext', [{ h: L.cols.ext }, { h: L.cols.chosen }, { h: L.cols.evid, wrap: 1, w: 260 }, { h: L.cols.rec, wrap: 1, w: 420 }], rows, L);
}

function checkTab(m, L) {
  const rows = m.checklist.map((c) => [esc(c.area), esc(L.check[c.id] || c.id), `<span class="st st-${c.status}">${esc(L.status[c.status])}</span>`,
    esc([c.n != null && c.n !== '' ? c.n : '', c.used != null ? `${c.used} / ${c.measured}` : '', arr(c.list).join(', ')].filter((x) => x !== '').join(' · '))]);
  return `<h2>${esc(L.tabs.check)}</h2>` + table('check', [{ h: L.cols.area }, { h: L.cols.title, wrap: 1, w: 380 }, { h: L.cols.status }, { h: L.cols.detail, wrap: 1 }], rows, L);
}

function methodTab(m, L) {
  const i = m.inputs || {};
  const kv = [[L.method.kb, `v${i.kbVersion || ''}`], [L.method.graphs, arr(i.graphs).join(', ')], [L.method.units, i.units ?? ''], [L.method.usage, arr(i.usage).join(', ')], [L.method.cust, i.cust || ''], [L.method.facts, i.facts || L.note.noFacts]];
  return `<h2>${esc(L.tabs.method)}</h2><p>${esc(L.method.intro)}</p><ul>${L.method.limits.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
<h3>${esc(L.method.inputs)}</h3><table class="plain">${kv.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
<h3>${esc(L.cols.sev)}</h3><table class="plain">${SEVS.map((s) => `<tr><th>${sevChip(s, L)}</th><td>${esc(L.sevHelp[s])}</td></tr>`).join('')}</table>`;
}

const CSS = `:root{--bg:#fff;--fg:#1d2733;--muted:#5a6675;--line:#d3dbe4;--head:#eef2f6;--card:#f6f8fa;--accent:#1d4f73;--red:#c62828;--red-bg:#fdecea;--amber:#b26a00;--amber-bg:#fff4e0;--blue:#1f6fb2;--blue-bg:#e3eefa;--green:#2e7d32;--green-bg:#e8f5e9;--sel:rgba(40,110,200,.14);color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme=light]){--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--card:#161d26;--accent:#5b9bd0;--red:#ef6b6b;--red-bg:#3a1d1d;--amber:#e0a43a;--amber-bg:#3a2c12;--blue:#8cc0ee;--blue-bg:#1d3550;--green:#5cb85f;--green-bg:#1b3320;--sel:rgba(90,160,240,.2);color-scheme:dark}}
:root[data-theme=dark]{--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--card:#161d26;--accent:#5b9bd0;--red:#ef6b6b;--red-bg:#3a1d1d;--amber:#e0a43a;--amber-bg:#3a2c12;--blue:#8cc0ee;--blue-bg:#1d3550;--green:#5cb85f;--green-bg:#1b3320;--sel:rgba(90,160,240,.2);color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif}small{color:var(--muted)}code{font:12px Consolas,monospace}
.topbar{position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 16px;background:var(--bg);border-bottom:1px solid var(--line)}.topbar .t{font-weight:700;flex:1;min-width:200px}.topbar .t small{font-weight:400;margin-left:8px}
button{font:inherit;font-size:13px;padding:3px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}
.tabs{display:flex;gap:2px;overflow-x:auto;padding:0 16px;border-bottom:1px solid var(--line);position:sticky;top:45px;z-index:19;background:var(--bg)}.tabs button{border:0;border-bottom:3px solid transparent;border-radius:0;background:none;color:var(--muted);padding:9px 11px;white-space:nowrap;font-size:14px}.tabs button[aria-selected=true]{color:var(--fg);border-bottom-color:var(--accent);font-weight:600}
main{max-width:1800px;margin:0 auto;padding:6px 16px 30px}section{display:none}section.on{display:block}h2{font-size:18px;margin:14px 0 8px}h3{font-size:15px;margin:18px 0 6px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.tile{border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:var(--card)}.tile .k{color:var(--muted);font-size:12.5px}.tile .v{font-size:22px;font-weight:600}.tile.bad .v{color:var(--red)}
.sevbar{display:flex;flex-wrap:wrap;gap:14px;margin:10px 0}.note{border-left:4px solid var(--accent);background:var(--card);padding:8px 12px;margin:10px 0;border-radius:0 8px 8px 0}.nar li{margin:3px 0}
.sv{display:inline-block;padding:0 8px;border-radius:9px;font-size:12px;font-weight:600;white-space:nowrap}.sv-blocker{background:var(--red-bg);color:var(--red)}.sv-functional{background:var(--amber-bg);color:var(--amber)}.sv-performance{background:var(--blue-bg);color:var(--blue)}.sv-check{background:var(--card);color:var(--fg);border:1px solid var(--line)}.sv-info{color:var(--muted)}
.st{font-weight:600}.st-attention{color:var(--amber)}.st-ok{color:var(--green)}.st-na{color:var(--muted)}
.tw{margin:6px 0 14px}.tt{display:flex;justify-content:space-between;align-items:center;margin:2px 0 4px;font-size:12.5px;color:var(--muted)}
.gw{overflow:auto;border:1px solid var(--line);border-radius:6px;max-height:72vh}table{border-collapse:separate;border-spacing:0;font-size:13px}.grid{min-width:100%}
.grid th,.grid td{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:4px 7px;text-align:left;vertical-align:top;background:var(--bg)}.grid td.num,.grid th.num{text-align:right}.grid td.wrap{white-space:normal;min-width:180px;max-width:520px}
.grid thead th{position:sticky;top:0;z-index:2;background:var(--head);font-weight:600;white-space:nowrap;cursor:pointer}.grid thead th.asc::after{content:' ▲';font-size:10px}.grid thead th.desc::after{content:' ▼';font-size:10px}
.grid thead tr.frow th{top:31px;padding:2px 3px;background:var(--card);cursor:default}.fin{width:100%;min-width:40px;font:inherit;font-size:12px;padding:2px 5px;border:1px solid var(--line);border-radius:4px;background:var(--bg);color:var(--fg)}.fin:not(:placeholder-shown){border-color:var(--accent);background:var(--sel)}
.ev{white-space:normal;margin:1px 0}.plain{border-collapse:collapse}.plain th,.plain td{border:1px solid var(--line);padding:5px 9px;text-align:left;vertical-align:top}.plain th{background:var(--head);white-space:nowrap}
@media (max-width:760px){main{padding:4px 8px 20px}.tabs{position:static}.fin{font-size:16px}.grid td.wrap{max-width:70vw}}
@media print{.topbar button,.tabs,.tt button,.frow{display:none!important}section{display:block!important;break-before:page}.gw{max-height:none;overflow:visible;border:0}}`;

const JS = `(function(){var $=function(s,r){return(r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
function tab(t){$$('.tabs button').forEach(function(b){b.setAttribute('aria-selected',b.dataset.t===t)});$$('main section').forEach(function(s){s.classList.toggle('on',s.id==='s-'+t)});try{localStorage.setItem('sc4sap-s4r-tab',t)}catch(e){}}
$$('.tabs button').forEach(function(b){b.onclick=function(){tab(b.dataset.t)}});var t0;try{t0=localStorage.getItem('sc4sap-s4r-tab')}catch(e){}tab(t0&&$('#s-'+t0)?t0:'sum');
function apply(tbl){var f=$$('tr.frow .fin',tbl).map(function(i){return i.value.trim().toLowerCase()}),n=0,rows=$$('tbody tr',tbl);rows.forEach(function(tr){var ok=f.every(function(q,j){return!q||(tr.cells[j]&&tr.cells[j].textContent.toLowerCase().indexOf(q)>=0)});tr.style.display=ok?'':'none';if(ok)n++});
var c=tbl.closest('.tw').querySelector('.cnt');c.textContent=(n===rows.length?R.rows.replace('{n}',n):R.of.replace('{a}',n).replace('{b}',rows.length))}
document.addEventListener('input',function(e){var i=e.target.closest('.fin');if(!i)return;var tb=i.closest('table');clearTimeout(tb._t);tb._t=setTimeout(function(){apply(tb)},150)});
document.addEventListener('click',function(e){var th=e.target.closest('.grid tr.hd th');if(!th)return;var tb=th.closest('table'),j=+th.dataset.j,d=th.classList.contains('asc')?-1:1;$$('tr.hd th',tb).forEach(function(x){x.classList.remove('asc','desc')});th.classList.add(d>0?'asc':'desc');
var body=$('tbody',tb),rows=$$('tr',body);rows.sort(function(a,b){var x=a.cells[j].textContent.trim(),y=b.cells[j].textContent.trim(),nx=parseFloat(x),ny=parseFloat(y);if(!isNaN(nx)&&!isNaN(ny)&&/^[\\d.,-]+$/.test(x)&&/^[\\d.,-]+$/.test(y))return(nx-ny)*d;return x.localeCompare(y,undefined,{numeric:true})*d});rows.forEach(function(r){body.appendChild(r)})});
document.addEventListener('click',function(e){var b=e.target.closest('[data-csv]');if(!b)return;var tb=$('#t-'+b.dataset.csv),q=function(v){v=String(v).replace(/\\s+/g,' ').trim();return/[",\\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
var lines=[$$('tr.hd th',tb).map(function(th){return q(th.textContent)}).join(',')].concat($$('tbody tr',tb).filter(function(tr){return tr.style.display!=='none'}).map(function(tr){return Array.prototype.map.call(tr.cells,function(td){return q(td.textContent)}).join(',')}));
var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\\ufeff'+lines.join('\\r\\n')],{type:'text/csv;charset=utf-8'}));a.download=(document.body.dataset.code||'s4')+'-'+b.dataset.csv+'.csv';a.click()});
$('#print').onclick=function(){window.print()};$('#theme').onclick=function(){var r=document.documentElement,d=r.dataset.theme==='dark'||(!r.dataset.theme&&matchMedia('(prefers-color-scheme: dark)').matches);r.dataset.theme=d?'light':'dark'};})();`;

/** The whole report page for a readiness model. */
export function renderPage(m, kb) {
  const lang = m.lang === 'en' ? 'en' : 'ko', L = labelsFor(lang);
  const tabs = [['sum', summary], ['target', targetTab], ['items', itemsTab], ['objects', objectsTab], ['findings', findingsTab], ['exits', exitsTab], ['appends', appendsTab], ['integ', integTab], ['usage', usageTab], ['ext', extTab], ['check', checkTab], ['method', methodTab]];
  const tg = tx(kb.targets?.[m.target]?.label, lang);
  const R = JSON.stringify({ rows: L.rows, of: L.of });
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.code)} — ${esc(L.title)} v${esc(m.version)}</title><style>${CSS}</style></head><body data-code="${esc(m.code)}">
<div class="topbar"><div class="t">${esc(m.code)} · ${esc(m.project || L.title)} <small>v${esc(m.version)} · ${esc(m.builtAt)} · ${esc(m.system?.alias || '')} ${esc(m.system?.sapVersion || '')} → ${esc(tg)}</small></div><button id="print">${esc(L.print)}</button><button id="theme">${esc(L.theme)}</button></div>
<nav class="tabs">${tabs.map(([k]) => `<button data-t="${k}">${esc(L.tabs[k])}</button>`).join('')}</nav>
<main>${tabs.map(([k, f]) => `<section id="s-${k}">${f(m, L, lang, kb)}</section>`).join('\n')}</main>
<script>var R=${R};${JS}</script></body></html>`;
}

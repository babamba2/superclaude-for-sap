// sc4sap:project-dashboard — the shared page of the standalone PMO documents (weekly status, cutover plan).
//
//   renderDocPage({ kind, lang, title, model, schema, summaryHtml, fileName, embed })  → one self-contained HTML page
//   modelFromDocPage(html, kind)                                                     → { model } | null
//   csvOf(rows, columns)                                                             → CSV text (BOM, CRLF) for Excel
//   embedJson(value)                                                                 → JSON safe inside <script>
//
// The page draws the model from a schema (sections of fields and tables) with a small script, so the same file
// is the web workbench's page and the download: view mode reads, edit mode turns every cell into an input and
// rows can be added and removed. The model lives in <script type="application/json" id="doc-model">; the
// page contract for the web workbench is window.SC4SAP_PAGE { kind, model(), edit(on), editing() }. Outside
// the workbench a "Save file" button downloads the page with the edited model in it, which modelFromDocPage
// reads back. A4 in print, light / dark, tables become cards on a phone. No network, no external files.
//
// Schema: { sections: [ { type: 'fields', title, fields: [{ path, label, type, options?, ro? }] }
//                     | { type: 'table', title, path, idPrefix?, columns: [{ key, label, type, options?, ro?, wide? }] } ],
//           labels: { edit, done, save, addRow, delRow, empty, saved } }
// Types: text, textarea, number, date, datetime, select (options [{ value, label }]), rag (green/amber/red), list
// (comma separated in the cell, an array in the model).

import { withResponsive } from '../lib/responsive.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const arr = (v) => (Array.isArray(v) ? v : []);
export const str = (v, max = 4000) => (v == null ? '' : String(v)).slice(0, max);
/** JSON inside <script>: no `</script>` and no HTML comment openers (every < escaped). */
export const embedJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const STYLE = `
:root{--bg:#fff;--fg:#1b1d21;--mute:#5d6470;--line:#dfe3e8;--soft:#f5f7f9;--acc:#2f5bd3;--green:#1f9d55;--amber:#d48806;--red:#d4380d}
@media (prefers-color-scheme:dark){:root{--bg:#16181c;--fg:#e8eaed;--mute:#9aa1ab;--line:#2e333a;--soft:#1e2126;--acc:#7da2ff;--green:#4cc38a;--amber:#f0b429;--red:#ff7a59}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,"Segoe UI","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.doc{max-width:1120px;margin:0 auto;padding:24px 20px 64px}
.doc-bar{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}
.doc-bar h1{margin:0;font-size:22px;line-height:1.3}
.doc-bar .tools{display:flex;gap:6px}
button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--soft);color:var(--fg);border-radius:6px;padding:5px 10px}
button.primary{background:var(--acc);border-color:var(--acc);color:#fff}
.doc-sub{color:var(--mute);margin:0 0 16px}
section{margin:22px 0}section h2{font-size:15px;margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid var(--line)}
.fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px 16px}
.field{display:flex;flex-direction:column;gap:2px;min-width:0}.field.wide{grid-column:1/-1}
.field>span:first-child{font-size:12px;color:var(--mute)}
.val{white-space:pre-wrap;word-break:break-word}.val.empty{color:var(--mute)}
table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{font-size:12px;color:var(--mute);font-weight:600;background:var(--soft)}
td.wide{min-width:220px}.empty-row td{color:var(--mute);text-align:center}
input,select,textarea{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:5px;padding:4px 6px;width:100%;min-width:0}
textarea{resize:vertical;min-height:2.4em}
.rag{display:inline-flex;align-items:center;gap:6px}.rag i{width:10px;height:10px;border-radius:50%;display:inline-block;background:var(--line)}
.rag.green i{background:var(--green)}.rag.amber i{background:var(--amber)}.rag.red i{background:var(--red)}
.chip{display:inline-block;padding:0 6px;border-radius:9px;background:var(--soft);border:1px solid var(--line);font-size:12px}
.row-x{border:none;background:none;color:var(--mute);padding:2px 6px}.add-row{margin-top:6px}
.tbl{overflow-x:auto}
body.editing td select{min-width:92px}body.editing td input[type=number]{min-width:64px;max-width:96px}
body.editing td input[type=date]{min-width:132px}body.editing td.wide{min-width:260px}
body.editing td:first-child input{min-width:104px}body.editing td input[type=text]{min-width:72px}
.summary{border:1px solid var(--line);border-radius:8px;padding:12px 14px;background:var(--soft)}
.summary h2{border:none;margin-bottom:4px}.summary .kpis{display:flex;flex-wrap:wrap;gap:8px 18px}
.summary .kpi b{display:block;font-size:18px}.summary .note{color:var(--mute);font-size:12px;margin-top:6px}
.summary ul{margin:6px 0 0;padding-left:18px}
body:not(.editing) .edit-only{display:none}body.editing .view-only{display:none}
@media (max-width:640px){.doc{padding:14px 12px 48px}
 table,thead,tbody,tr,td{display:block}thead{display:none}
 tr{border:1px solid var(--line);border-radius:8px;margin:0 0 10px;padding:4px 8px}
 td{border:none;padding:4px 0;display:grid;grid-template-columns:96px 1fr;gap:8px}
 td::before{content:attr(data-label);color:var(--mute);font-size:12px}
 td.x::before{content:none}.empty-row td{display:block}}
@media print{body{background:#fff;color:#000}.doc{max-width:none;padding:0}.doc-bar .tools,.row-x,.add-row,.edit-only{display:none!important}
 @page{size:A4;margin:14mm}section{break-inside:avoid-page}tr{break-inside:avoid}}
`;

const SCRIPT = String.raw`(function(){
var M=JSON.parse(document.getElementById('doc-model').textContent);
var S=JSON.parse(document.getElementById('doc-schema').textContent);
var L=S.labels||{},root=document.getElementById('doc-root'),body=document.body,editing=false;
function get(o,p){return p.split('.').reduce(function(a,k){return a==null?undefined:a[k]},o)}
function set(o,p,v){var ks=p.split('.'),last=ks.pop(),t=o;ks.forEach(function(k){if(t[k]==null||typeof t[k]!=='object')t[k]={};t=t[k]});t[last]=v}
function h(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function label(f,v){var o=(f.options||[]).filter(function(x){return x.value===v})[0];return o?o.label:(v==null?'':String(v))}
function shown(f,v){if(f.type==='list')return (Array.isArray(v)?v:[]).join(', ');if(f.type==='select'||f.type==='rag')return label(f,v);if(f.type==='datetime')return String(v||'').replace('T',' ');return v==null?'':String(v)}
function view(f,v){
  if(f.type==='rag'){var r=h('span','rag '+(v||''));r.appendChild(h('i'));r.appendChild(document.createTextNode(label(f,v)||'—'));return r}
  var t=shown(f,v),e=h('span','val'+(t?'':' empty'),t||'—');return e}
function input(f,v,put){
  var e;
  if(f.type==='select'||f.type==='rag'){e=h('select');var blank=h('option','','');blank.value='';e.appendChild(blank);
    (f.options||[]).forEach(function(o){var x=h('option','',o.label);x.value=o.value;e.appendChild(x)});e.value=v==null?'':v;
    e.onchange=function(){put(e.value)};return e}
  if(f.type==='textarea'){e=h('textarea');e.rows=2;e.value=v==null?'':v;e.oninput=function(){put(e.value)};return e}
  e=h('input');e.type=f.type==='number'?'number':f.type==='date'?'date':'text';
  if(f.type==='datetime')e.placeholder='YYYY-MM-DD HH:MM';
  e.value=f.type==='list'?(Array.isArray(v)?v:[]).join(', '):f.type==='datetime'?String(v||'').replace('T',' '):(v==null?'':v);
  e.oninput=function(){var x=e.value;
    if(f.type==='number')x=x===''?null:Number(x);
    else if(f.type==='list')x=x.split(',').map(function(s){return s.trim()}).filter(Boolean);
    put(x)};
  return e}
function cell(f,obj,key){return editing&&!f.ro?input(f,obj[key],function(x){obj[key]=x}):view(f,obj[key])}
function nextId(rows,prefix){var n=0;rows.forEach(function(r){var m=String(r.id||'').match(/(\d+)$/);if(m)n=Math.max(n,+m[1])});return prefix+String(n+1).padStart(2,'0')}
function render(){
  root.innerHTML='';
  (S.sections||[]).forEach(function(s){
    var sec=h('section');if(s.title)sec.appendChild(h('h2','',s.title));
    if(s.type==='fields'){var g=h('div','fields');
      s.fields.forEach(function(f){var w=h('label','field'+(f.wide?' wide':''));w.appendChild(h('span','',f.label));
        var parts=f.path.split('.'),key=parts.pop(),obj=parts.length?get(M,parts.join('.')):M;
        if(obj==null){obj={};set(M,parts.join('.'),obj)}
        w.appendChild(cell(f,obj,key));g.appendChild(w)});
      sec.appendChild(g)}
    if(s.type==='table'){var rows=get(M,s.path);if(!Array.isArray(rows)){rows=[];set(M,s.path,rows)}
      var t=h('table'),hd=h('thead'),hr=h('tr');s.columns.forEach(function(c){hr.appendChild(h('th','',c.label))});
      if(editing)hr.appendChild(h('th','x',''));hd.appendChild(hr);t.appendChild(hd);var tb=h('tbody');
      if(!rows.length){var er=h('tr','empty-row'),ed=h('td','',L.empty||'—');ed.colSpan=s.columns.length+(editing?1:0);er.appendChild(ed);tb.appendChild(er)}
      rows.forEach(function(r,i){var tr=h('tr');s.columns.forEach(function(c){var td=h('td',c.wide?'wide':'');td.setAttribute('data-label',c.label);td.appendChild(cell(c,r,c.key));tr.appendChild(td)});
        if(editing){var x=h('td','x'),b=h('button','row-x','✕');b.type='button';b.title=L.delRow||'';b.onclick=function(){rows.splice(i,1);render()};x.appendChild(b);tr.appendChild(x)}
        tb.appendChild(tr)});
      t.appendChild(tb);var wrap=h('div','tbl');wrap.appendChild(t);sec.appendChild(wrap);
      if(editing){var a=h('button','add-row','+ '+(L.addRow||''));a.type='button';a.onclick=function(){var row={};s.columns.forEach(function(c){row[c.key]=c.type==='list'?[]:(c.dflt!=null?c.dflt:'')});if(s.idPrefix)row.id=nextId(rows,s.idPrefix);rows.push(row);render()};sec.appendChild(a)}}
    root.appendChild(sec)});
}
function setEditing(on){editing=!!on;body.classList.toggle('editing',editing);var b=document.getElementById('doc-edit');if(b)b.textContent=editing?(L.done||'Done'):(L.edit||'Edit');render()}
var eb=document.getElementById('doc-edit');if(eb)eb.onclick=function(){setEditing(!editing)};
var sb=document.getElementById('doc-save');if(sb)sb.onclick=function(){
  var copy=document.documentElement.cloneNode(true);copy.querySelector('#doc-model').textContent=JSON.stringify(M).replace(/</g,'\\u003c');
  copy.querySelector('body').classList.remove('editing');var r=copy.querySelector('#doc-root');if(r)r.innerHTML='';
  var blob=new Blob(['<!doctype html>\n'+copy.outerHTML],{type:'text/html'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=S.fileName||'document.html';document.body.appendChild(a);a.click();a.remove()};
window.SC4SAP_PAGE={kind:S.kind,model:function(){return JSON.parse(JSON.stringify(M))},edit:function(on){if(!!on!==editing)setEditing(on)},editing:function(){return editing}};
render();
})();`;

/** One self-contained page. `embed`: the web workbench's frame (no file save button — the workbench saves). */
export function renderDocPage({ kind, lang = 'ko', title, subtitle = '', model, schema, summaryHtml = '', fileName = 'document.html', embed = false }) {
  const L = schema.labels || {};
  const page = { kind, fileName, labels: L, sections: schema.sections };
  return withResponsive(`<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body><main class="doc">
<div class="doc-bar"><h1>${esc(title)}</h1><div class="tools">
<button type="button" id="doc-edit">${esc(L.edit || 'Edit')}</button>${embed ? '' : `<button type="button" id="doc-save" class="primary">${esc(L.save || 'Save file')}</button>`}
</div></div>${subtitle ? `<p class="doc-sub">${esc(subtitle)}</p>` : ''}
${summaryHtml}
<div id="doc-root"></div>
</main>
<script type="application/json" id="doc-model">${embedJson(model)}</script>
<script type="application/json" id="doc-schema">${embedJson(page)}</script>
<script>${SCRIPT}</script>
</body></html>`);
}

/** The model a page carries (downloaded, edited and saved, or as rendered); null when it is not a page of `kind`. */
export function modelFromDocPage(html, kind) {
  const m = /<script type="application\/json" id="doc-model">([\s\S]*?)<\/script>/.exec(String(html || ''));
  if (!m) return null;
  try {
    const model = JSON.parse(m[1]);
    return model && typeof model === 'object' && model.kind === kind ? { model } : null;
  } catch {
    return null;
  }
}

/** CSV for Excel: BOM, CRLF, every cell quoted when it needs to be; a list cell joined with ", ". */
export function csvOf(rows, columns) {
  const q = (v) => {
    const s = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
    // a leading = + - @, tab or CR would be read as a formula by Excel (OWASP CSV injection)
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [columns.map((c) => q(c.label)).join(','), ...arr(rows).map((r) => columns.map((c) => q(r?.[c.key])).join(','))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Options of a select from a value list and a label map. */
export const optionsOf = (values, labels = {}) => values.map((v) => ({ value: v, label: labels[v] || v }));

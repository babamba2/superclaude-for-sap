// sc4sap:role-matrix — in-browser edit mode. Inlined into the page after role-model.mjs and role-render.mjs and the
// labels object E; works from file:// with nothing installed.
//
// Spreadsheet-style editing: click / drag / Shift selects a range, arrows move, Enter · F2 · double-click · typing edits,
// Enter / Tab commit and move, Esc cancels. F · C · D · X · Space · Delete apply to the whole range at once (a click on a
// level cell cycles F → C → D → blank). Ctrl+C / Ctrl+V copy and paste tab-separated text from and to Excel (pasting past
// the last row adds rows), Ctrl+D fills down, Ctrl+Z / Ctrl+Y undo / redo, Ctrl+S saves. Renaming a business or
// technical role ID renames it everywhere. Autosaves a draft to the browser; "Save" adds a revision row and writes the
// page back (same file on Chrome / Edge, a download elsewhere) — build-role-doc.mjs import reads it.

var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var DATA = JSON.parse($('#role-model').textContent);
var model = normalizeModel(DATA.model), version = DATA.version || '0.1', built = JSON.stringify(model);
var view = null, L = labelsFor(model.lang, model.layout), VS = sheetsOf(L), cur = 'cover', editing = false, undoS = [], redoS = [], dirty = 0, fileHandle = null;
var sel = null; // { s: sheet, r0, c0, r1, c1 } — indexes into the visible rows / columns of the sheet's table
var ed = null;  // the open cell editor { input, s, i, k }
var queries = {}, filters = {}; // filters[sheet][column key] = { vals: [...] } | { q: 'text' }
var DRAFT = 'sc4sap-role-' + model.doc.code + '-' + version;
var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function toast(t) { var el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('on'); }, 2600); }
function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return o[k]; }); }

// ---------- drawing ----------
// Only the open sheet is drawn; the others are redrawn when they are opened (a synced matrix is large).
var pages = {}, cpages = {}, stale = {}, viewOf = null;
function viewOpts() { var vw = {}; VS.forEach(function (x) { vw[x] = { q: queries[x] || '', page: pages[x] || 0, cpage: cpages[x] || 0, f: filters[x] || null }; }); return vw; }
function draw() {
  var s = sheetNow(), g0 = s && $('#tab-' + s + ' .gw'), keep = g0 ? [g0.scrollLeft, g0.scrollTop] : null;
  // the counts, totals and checks are worked out again only when the model changed (not on a page turn)
  if (!view || viewOf !== model) { view = deriveView(model); viewOf = model; }
  var a = renderAll(model, { version: version, date: model.doc.date, only: s ? [s] : [], view: viewOpts(), v: view });
  $('#tab-cover .body').innerHTML = a.cover;
  VS.forEach(function (x) { stale[x] = x !== s; });
  if (s) {
    $('#tab-' + s + ' .body').innerHTML = a[s];
    var g = $('#tab-' + s + ' .gw'); if (g && keep) { g.scrollLeft = keep[0]; g.scrollTop = keep[1]; }
  }
  stick(); fit(); paintSel(); state();
}
// Rows of a sheet after the search, the page size and the page shown (clamped like renderSheet).
function pageInfo(s) {
  var hits = sheetRows(s, view, L, queries[s] || '', filters[s] || null), size = pageSize(shownColumns(s, view, L, cpages[s] || 0).cols), n = Math.max(1, Math.ceil(hits.length / size));
  var pg = Math.min(Math.max(0, pages[s] || 0), n - 1);
  return { hits: hits, size: size, pg: pg, pages: n, start: pg * size };
}
// Turns to the page that holds model row i of sheet s; returns its index among the visible rows.
function showIdx(s, i) {
  var p = pageInfo(s), at = p.hits.indexOf(i);
  var cleared = at < 0 && (queries[s] || Object.keys(filters[s] || {}).length);
  if (cleared) toast(E.fCleared);
  if (at < 0) { queries[s] = ''; filters[s] = {}; var inp = $('.stools input[data-s="' + s + '"]'); if (inp) inp.value = ''; p = pageInfo(s); at = p.hits.indexOf(i); }
  if (at < 0) return -1;
  var pg = Math.floor(at / p.size); if (pg !== p.pg || stale[s] || cleared) { pages[s] = pg; draw(); }
  return at - pg * p.size;
}
document.addEventListener('click', function (ev) {
  var fc = ev.target.closest('.pager button[data-fclear]'); if (fc) { filters[fc.dataset.fclear] = {}; pages[fc.dataset.fclear] = 0; sel = null; draw(); return; }
  var b = ev.target.closest('.pager button[data-pg], .pager button[data-cpg]'); if (!b || b.disabled) return;
  var s = b.closest('.pager').dataset.s, col = b.dataset.cpg != null; closeEditor(); sel = null;
  if (col) cpages[s] = +b.dataset.cpg; else pages[s] = +b.dataset.pg;
  draw(); var g = $('#tab-' + s + ' .gw'); if (g) { if (col) g.scrollLeft = 0; else g.scrollTop = 0; }
});
// The number column and the key column (plus the T-code text on wide screens) stay on the left while scrolling.
function stick() {
  $$('section.tab.on table.grid').forEach(function (t) {
    // header rows stack: each row sticks below the ones above it
    var y = 0; $$('thead tr', t).forEach(function (tr) { $$('th', tr).forEach(function (th) { th.style.top = y + 'px'; }); y += tr.offsetHeight; });
    var ths = $$('thead tr.hd th', t), left = 0, wide = window.innerWidth > 760;
    ths.forEach(function (th, j) {
      var c = th.dataset.c, on = j === 0 || th.classList.contains('key') || (wide && t.dataset.s === 'tcodes' && c === 'text') || (wide && t.dataset.s === 'users' && c === 'name');
      if (!on) return;
      var x = left; left += th.offsetWidth;
      $$('tr:not(.grp) > :nth-child(' + (j + 1) + ')', t).forEach(function (td) { if (td.colSpan > 1) return; td.classList.add('stk'); td.style.left = x + 'px'; });
    });
  });
}
// Each sheet fills the screen below the bars, so its header row stays in view (sticky inside the pane).
function fit() {
  var g = $('section.tab.on .gw'); if (!g) return;
  // the bars that stay on screen (the tab row scrolls away on phones) plus the sheet toolbar
  var top = $('.topbar').offsetHeight + (getComputedStyle($('.tabs')).position === 'sticky' ? $('.tabs').offsetHeight : 0) + ($('section.tab.on .stools') ? $('section.tab.on .stools').offsetHeight + 6 : 0);
  var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  g.style.maxHeight = Math.max(260, Math.floor(vh - top - 12)) + 'px';
}
window.addEventListener('resize', function () { stick(); fit(); });
function state() {
  var n = dirty, el = $('#state');
  el.textContent = n ? fmt(E.stDirty, { n: n }) : E.stClean; el.className = 'state' + (n ? ' dirty' : '');
  var b = $('#chk-n'); if (b) { var e = view.checks.filter(function (c) { return c.sev !== 'info'; }).length; b.textContent = e || ''; b.style.display = e ? '' : 'none'; }
}
function tab(t) {
  cur = t; closeEditor(true);
  $$('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.t === t); });
  $$('section.tab').forEach(function (s) { s.classList.toggle('on', s.id === 'tab-' + t); });
  if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t);
  sel = null; if (stale[t]) draw();
  setTimeout(function () { stick(); fit(); }, 0);
}
$$('.tabs button').forEach(function (b) { b.onclick = function () { tab(b.dataset.t); }; });
document.addEventListener('click', function (ev) { var g = ev.target.closest('[data-go]'); if (g && !ev.target.closest('.grid')) { ev.preventDefault(); tab(g.dataset.go); } });

// ---------- filter ----------
// The search runs over the whole sheet (every page), then the first page of the hits is shown.
$$('.stools input[type=search]').forEach(function (inp) {
  inp.oninput = function () {
    clearTimeout(inp.t);
    inp.t = setTimeout(function () { queries[inp.dataset.s] = inp.value; pages[inp.dataset.s] = 0; sel = null; draw(); }, 180);
  };
});

// ---------- model access ----------
function list(s) { return model[s]; }
function cols(s) { return sheetColumns(s, view, L); }
function colOf(s, k) { return cols(s).filter(function (c) { return c.k === k; })[0]; }
function raw(s, i, k) {
  var r = list(s)[i]; if (!r) return '';
  if (k.indexOf('L:') === 0) { var lx = (r.levels || {})[k.slice(2)] || ''; return (lx && L.lvOut && L.lvOut[lx]) || lx; }
  if (k.indexOf('X:') === 0) return (r.roles || {})[k.slice(2)] ? 'X' : '';
  if (k.indexOf('e:') === 0) return (r.ext || {})[k.slice(2)] || '';
  var v = r[k]; return Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
}
function blank(s) {
  var id = function (p, xs, f) { var n = xs.length + 1, v; do { v = p + String(n++).padStart(2, '0'); } while (xs.some(function (x) { return x[f] === v; })); return v; };
  if (s === 'broles') return { id: id((model.doc.module || 'R') + '-', model.broles, 'id'), name: '', troles: [] };
  if (s === 'sod') return { id: id('SOD-', model.sod, 'id'), level: 'M', status: 'open' };
  if (s === 'tcodes') return { levels: {} };
  if (s === 'users') return { roles: {}, approval: 'pending' };
  if (s === 'revisions') return { ver: '', date: today() };
  return {};
}
function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
// Writes one value; returns false when the column cannot take it.
function setVal(s, i, k, v) {
  var c = colOf(s, k); if (!c || c.type === 'ro') return false;
  var rows = list(s); while (rows.length <= i) rows.push(blank(s));
  var r = rows[i]; v = v == null ? '' : String(v).trim();
  // a company layout shows its own level codes and mark; the model keeps F / C / D and X
  if (c.type === 'level') { var u = L.lvIn ? L.lvIn[v.toUpperCase()] || '' : v.toUpperCase(); r.levels = r.levels || {}; if (LEVELS.indexOf(u) >= 0) r.levels[c.role] = u; else if (!v) delete r.levels[c.role]; else return false; r.guess = false; return true; }
  if (c.type === 'x') { r.roles = r.roles || {}; if (v && v !== '0' && v.toUpperCase() !== 'N') r.roles[c.role] = 'X'; else delete r.roles[c.role]; return true; }
  if (c.ext) { r.ext = r.ext || {}; if (c.type === 'num') v = v === '' ? '' : String(Number(v.replace(/,/g, '')) || 0); if (v) r.ext[k.slice(2)] = v; else delete r.ext[k.slice(2)]; return true; }
  if (c.type === 'list') { r[k] = v.split(/[,;\s]+/).map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean); return true; }
  if (c.type === 'num') { r[k] = v === '' ? '' : Number(v.replace(/,/g, '')) || 0; return true; }
  if (c.type === 'enum' && c.lab) { for (var key in c.lab) if (c.lab[key] === v) v = key; if (c.opts.indexOf(v) < 0 && v) return false; }
  if (c.type === 'enum' && !c.free && v && c.opts.indexOf(v) < 0) { var hit = c.opts.filter(function (o) { return o.toUpperCase() === v.toUpperCase(); })[0]; if (!hit) return false; v = hit; }
  if (k === 'id' && s === 'broles' && r.id && v && r.id !== v) { renameBrole(model, r.id, v); return true; }
  if (k === 'id' && s === 'troles') { v = v.toUpperCase(); if (r.id && v && r.id !== v) renameTrole(model, r.id, v); }
  if (/^(tcode|uid|object|field|parent|trole)$/.test(k)) v = v.toUpperCase();
  r[k] = v; return true;
}

// ---------- undo ----------
// Up to 200 steps, fewer for a large synced model (about 150 MB of snapshots at most).
function snap() { var s = JSON.stringify(model), cap = Math.max(10, Math.min(200, Math.floor(15e7 / Math.max(1, s.length)))); undoS.push(s); while (undoS.length > cap) undoS.shift(); redoS = []; }
function changed() { model = normalizeModel(model); dirty++; store(DRAFT, JSON.stringify(model)); draw(); }
function undo() { if (!undoS.length) return; redoS.push(JSON.stringify(model)); model = normalizeModel(JSON.parse(undoS.pop())); dirty = Math.max(0, dirty - 1); store(DRAFT, JSON.stringify(model)); draw(); }
function redo() { if (!redoS.length) return; undoS.push(JSON.stringify(model)); model = normalizeModel(JSON.parse(redoS.pop())); dirty++; store(DRAFT, JSON.stringify(model)); draw(); }
$('#undo').onclick = undo;

// ---------- selection ----------
function grid(s) { return $('table[data-s="' + (s || cur) + '"]'); }
function vrows(s) { var t = grid(s); return t ? $$('tbody tr', t).filter(function (tr) { return tr.style.display !== 'none'; }) : []; }
function vcols(s) { var t = grid(s); return t ? $$('thead tr.hd th', t).slice(1).map(function (th) { return th.dataset.c; }) : []; }
function td(s, ri, ci) { var tr = vrows(s)[ri], k = vcols(s)[ci]; return tr && k ? $('td[data-c="' + cssq(k) + '"]', tr) : null; }
function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }
function pos(cell) { var tr = cell.closest('tr'), s = cell.closest('table').dataset.s; return { s: s, r: vrows(s).indexOf(tr), c: vcols(s).indexOf(cell.dataset.c) }; }
function range() { return sel ? { r0: Math.min(sel.r0, sel.r1), r1: Math.max(sel.r0, sel.r1), c0: Math.min(sel.c0, sel.c1), c1: Math.max(sel.c0, sel.c1) } : null; }
function paintSel() {
  $$('.grid td.sel, .grid td.cur').forEach(function (x) { x.classList.remove('sel', 'cur'); });
  if (!sel || sel.s !== cur) return;
  var g = range();
  for (var r = g.r0; r <= g.r1; r++) for (var c = g.c0; c <= g.c1; c++) { var x = td(sel.s, r, c); if (x) x.classList.add('sel'); }
  var a = td(sel.s, sel.r1, sel.c1); if (a) a.classList.add('cur');
  var n = (g.r1 - g.r0 + 1) * (g.c1 - g.c0 + 1); $('#selinfo').textContent = n > 1 ? fmt(E.selN, { n: n }) : '';
}
function select(s, r, c, extend) {
  var R = vrows(s).length - 1, C = vcols(s).length - 1;
  // moving past the first / last row of a page turns the page (Ctrl+arrow: to the first / last page)
  if (!extend && VS.indexOf(s) >= 0 && (r > R || r < 0)) {
    var p = pageInfo(s), down = r > R, jump = down ? r > R + 1 : r < -1;
    var np = jump ? (down ? p.pages - 1 : 0) : p.pg + (down ? 1 : -1);
    if (np !== p.pg && np >= 0 && np < p.pages) {
      pages[s] = np; draw(); R = vrows(s).length - 1;
      r = jump ? (down ? R : 0) : (down ? 0 : R);
    }
  }
  r = Math.max(0, Math.min(R, r)); c = Math.max(0, Math.min(C, c));
  if (extend && sel && sel.s === s) { sel.r1 = r; sel.c1 = c; } else sel = { s: s, r0: r, c0: c, r1: r, c1: c };
  paintSel(); var x = td(s, r, c); if (x) reveal(x);
}
function reveal(x) {
  var g = x.closest('.gw'), a = x.getBoundingClientRect(), b = g.getBoundingClientRect(), th = $('thead', g).offsetHeight;
  var stk = 0; $$('tr:first-child .stk', x.closest('table')).forEach(function (s) { stk = Math.max(stk, s.offsetLeft + s.offsetWidth); });
  if (a.top < b.top + th) g.scrollTop -= b.top + th - a.top; else if (a.bottom > b.bottom - 14) g.scrollTop += a.bottom - b.bottom + 14;
  if (!x.classList.contains('stk')) { if (a.left < b.left + stk) g.scrollLeft -= b.left + stk - a.left; else if (a.right > b.right - 14) g.scrollLeft += a.right - b.right + 14; }
}
function rowIdx(s, r) { var tr = vrows(s)[r]; return tr ? +tr.dataset.i : -1; }

var drag = null;
document.addEventListener('mousedown', function (ev) {
  var cell = ev.target.closest('.grid tbody td'); if (!cell || ev.button !== 0) return;
  if (ed && ed.input.contains(ev.target)) return;
  closeEditor(true);
  var p = pos(cell); if (p.c < 0) return;
  select(p.s, p.r, p.c, ev.shiftKey); drag = { moved: false, cell: cell };
  ev.preventDefault();
});
document.addEventListener('mouseover', function (ev) { if (!drag) return; var cell = ev.target.closest('.grid tbody td'); if (!cell || cell === drag.cell) return; var p = pos(cell); if (p.c >= 0 && p.s === sel.s) { drag.moved = true; select(p.s, p.r, p.c, true); } });
document.addEventListener('mouseup', function () {
  var d = drag; drag = null; if (!d || d.moved || !editing || d.cell.closest('tr').classList.contains('ft')) return;
  if (d.cell.classList.contains('lv')) openLevels(d.cell); else if (d.cell.classList.contains('xx')) cycle(d.cell);
});
document.addEventListener('dblclick', function (ev) { var cell = ev.target.closest('.grid tbody td'); if (cell && !cell.classList.contains('lv') && !cell.classList.contains('xx')) startEdit(''); });
// Touch: a tap selects; a tap on the selected cell edits (a level / X cell cycles in edit mode).
var tmoved = false;
document.addEventListener('touchstart', function () { tmoved = false; }, { passive: true });
document.addEventListener('touchmove', function () { tmoved = true; }, { passive: true });
document.addEventListener('touchend', function (ev) {
  var cell = ev.target.closest('.grid tbody td'); if (!cell || (ed && ed.input.contains(ev.target))) return;
  if (tmoved) return;
  ev.preventDefault();
  var p = pos(cell); if (p.c < 0) return;
  var again = sel && sel.s === p.s && sel.r1 === p.r && sel.c1 === p.c && sel.r0 === p.r && sel.c0 === p.c;
  closeEditor(true); select(p.s, p.r, p.c, false);
  var pick = function (x) { if (x.classList.contains('lv')) openLevels(x); else cycle(x); };
  if (cell.classList.contains('lv') || cell.classList.contains('xx')) { if (editing) pick(cell); else if (again) needEdit(function () { pick(td(p.s, p.r, p.c)); }); }
  else if (again) startEdit('');
}, { passive: false });

// Header of a role column (matrix sheets): rename the business role in place.
document.addEventListener('click', function (ev) {
  if (ev.target.closest('.flt')) return;
  var th = ev.target.closest('.grid thead th.mx'); if (!th || !editing) return;
  var id = th.dataset.c.slice(2), i = model.broles.map(function (b) { return b.id; }).indexOf(id);
  if (i >= 0) { tab('broles'); setTimeout(function () { var r = showIdx('broles', i); if (r >= 0) { select('broles', r, 0); startEdit(''); } }, 0); }
});

function needEdit(then) { if (editing) { then(); return; } setEditing(true); toast(E.editOn); then(); }
function cycle(cell) {
  var p = pos(cell), i = rowIdx(p.s, p.r), k = vcols(p.s)[p.c], v = raw(p.s, i, k);
  var iv = L.lvIn ? L.lvIn[String(v).toUpperCase()] || '' : v, nx = ({ F: 'C', C: 'D', D: '' })[iv] != null ? ({ F: 'C', C: 'D', D: '' })[iv] : 'F';
  var nv = cell.classList.contains('xx') ? (v ? '' : 'X') : L.single ? (v ? '' : 'F') : (nx && L.lvOut && L.lvOut[nx]) || nx;
  snap(); setVal(p.s, i, k, nv); changed(); select(p.s, p.r, p.c);
}
// Writes one value to every cell of the selection (skips computed cells).
function fill(v) {
  var g = range(); if (!g) return; snap(); var n = 0;
  for (var r = g.r0; r <= g.r1; r++) for (var c = g.c0; c <= g.c1; c++) { var i = rowIdx(sel.s, r); if (i >= 0 && setVal(sel.s, i, vcols(sel.s)[c], v)) n++; }
  if (!n) { undoS.pop(); return; } changed(); paintSel();
}

// ---------- cell editor ----------
function startEdit(first) {
  if (!sel) return;
  needEdit(function () {
    var s = sel.s, r = sel.r1, c = sel.c1, cell = td(s, r, c), k = vcols(s)[c], col = colOf(s, k), i = rowIdx(s, r);
    if (!cell || !col || col.type === 'ro') { if (col && col.type === 'ro') toast(E.roCell); return; }
    if (col.type === 'level' || col.type === 'x') { if (first) fill(first); else cycle(cell); return; }
    closeEditor(true);
    var multi = !!col.wrap, inp = document.createElement(multi ? 'textarea' : 'input');
    inp.className = 'cell-ed'; inp.value = first != null && first !== '' ? first : raw(s, i, k);
    if (col.lab && !first) inp.value = col.lab[raw(s, i, k)] || raw(s, i, k);
    if (col.type === 'enum') { var dl = $('#dl'); dl.innerHTML = col.opts.map(function (o) { return '<option value="' + esc(col.lab ? col.lab[o] : o) + '">'; }).join(''); inp.setAttribute('list', 'dl'); }
    var b = cell.getBoundingClientRect(), g = cell.closest('.gw').getBoundingClientRect();
    inp.style.left = (b.left - g.left + cell.closest('.gw').scrollLeft) + 'px'; inp.style.top = (b.top - g.top + cell.closest('.gw').scrollTop) + 'px';
    inp.style.minWidth = Math.max(b.width, multi ? 260 : 90) + 'px'; inp.style.minHeight = (multi ? Math.max(b.height, 70) : b.height) + 'px';
    cell.closest('.gw').appendChild(inp); inp.focus();
    if (first) inp.setSelectionRange(inp.value.length, inp.value.length); else if (inp.select) inp.select();
    ed = { input: inp, s: s, i: i, k: k, r: r, c: c };
    inp.onkeydown = function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); closeEditor(true); return; }
      if (ev.key === 'Enter' && !(multi && ev.altKey) && !ev.isComposing) { ev.preventDefault(); commit(); select(s, r + (ev.shiftKey ? -1 : 1), c); return; }
      if (ev.key === 'Enter' && multi && ev.altKey) { ev.preventDefault(); var p = inp.selectionStart; inp.value = inp.value.slice(0, p) + '\n' + inp.value.slice(inp.selectionEnd); inp.setSelectionRange(p + 1, p + 1); return; }
      if (ev.key === 'Tab') { ev.preventDefault(); commit(); select(s, r, c + (ev.shiftKey ? -1 : 1)); }
    };
    inp.onblur = function () { if (ed && ed.input === inp) commit(); };
  });
}
function commit() {
  if (!ed) return; var e = ed; ed = null; var v = e.input.value; e.input.remove();
  if (v === (colOf(e.s, e.k) && colOf(e.s, e.k).lab ? (colOf(e.s, e.k).lab[raw(e.s, e.i, e.k)] || raw(e.s, e.i, e.k)) : raw(e.s, e.i, e.k))) return;
  snap(); if (setVal(e.s, e.i, e.k, v)) changed(); else { undoS.pop(); toast(E.badValue); }
}
function closeEditor(cancel) { if (!ed) return; if (cancel) { var e = ed; ed = null; e.input.remove(); } else commit(); }

// ---------- rows ----------
function addRows(where) {
  needEdit(function () {
    var s = sheetNow(); if (!s) return; snap();
    var rows = list(s), at = rows.length;
    if (where === 'above' && !sel) { toast(E.needSel); return; }
    if (sel && where !== 'end') { var g = range(); at = (where === 'above' ? rowIdx(s, g.r0) : rowIdx(s, g.r1) + 1); }
    rows.splice(at, 0, blank(s)); changed();
    var r = showIdx(s, at); if (r >= 0) select(s, r, 0);
  });
}
function delRows() {
  var s = sheetNow(); if (!s || !sel) return;
  needEdit(function () {
    var g = range(), idx = []; for (var r = g.r0; r <= g.r1; r++) idx.push(rowIdx(s, r));
    snap(); idx.sort(function (a, b) { return b - a; }).forEach(function (i) { list(s).splice(i, 1); });
    changed(); toast(fmt(E.deleted, { n: idx.length })); select(s, g.r0, g.c0);
  });
}
function moveRows(d) {
  var s = sheetNow(); if (!s || !sel) return;
  needEdit(function () {
    var g = range(), a = rowIdx(s, g.r0), b = rowIdx(s, g.r1), rows = list(s);
    if (a + d < 0 || b + d >= rows.length) return; snap();
    var chunk = rows.splice(a, b - a + 1); rows.splice(a + d, 0, ...chunk); changed();
    sel.r0 += d; sel.r1 += d; paintSel();
  });
}
function sheetNow() { return VS.indexOf(cur) >= 0 ? cur : null; }
$$('[data-act]').forEach(function (b) {
  b.onclick = function () {
    var a = b.dataset.act;
    if (a === 'add') addRows('end'); else if (a === 'ins') addRows('above'); else if (a === 'del') delRows(); else if (a === 'up') moveRows(-1); else if (a === 'down') moveRows(1);
    else if (a === 'csv') csv(); else if (a === 'role') needEdit(function () { snap(); model.broles.push(blank('broles')); changed(); toast(fmt(E.roleAdded, { x: model.broles[model.broles.length - 1].id })); });
    else if (a === 'fill') { var v = b.dataset.v; needEdit(function () { fill(v); }); }
  };
});

// ---------- pop-ups: value choice, column filter, row menu ----------
var pop = null;
function closePop() { if (pop) { pop.remove(); pop = null; } }
// Opens a pop-up under el (or at the point pt), kept inside the window.
function popAt(el, html, pt) {
  closePop(); pop = document.createElement('div'); pop.className = 'pop'; pop.innerHTML = html; document.body.appendChild(pop);
  var b = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, x = pt ? pt.x : b.left, y = pt ? pt.y : b.bottom + 2;
  if (y + h > window.innerHeight - 8) y = Math.max(8, (pt ? pt.y : b.top) - h - 2);
  pop.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px'; pop.style.top = y + 'px';
  return pop;
}
['mousedown', 'touchstart'].forEach(function (t) { document.addEventListener(t, function (ev) { if (pop && !pop.contains(ev.target)) closePop(); }, { capture: true, passive: true }); });
document.addEventListener('scroll', function (ev) { if (pop && !pop.contains(ev.target)) closePop(); }, true);
window.addEventListener('resize', closePop);

// A matrix cell: the levels to choose from (the company's codes when a layout sets them), for the whole selection.
function legendText(k) { var r = L.cover.legendRows.filter(function (x) { return (x[2] || x[0]) === k; })[0]; return r ? r[1] : ''; }
function openLevels(cell) {
  var p0 = pos(cell), i = rowIdx(p0.s, p0.r), k = vcols(p0.s)[p0.c], r = list(p0.s)[i] || {}, now = (r.levels || {})[k.slice(2)] || '';
  var opts = (L.single ? ['F'] : LEVELS).map(function (x) { return [x, (L.lvOut && L.lvOut[x]) || x, legendText(x)]; }).concat([['', '∅', E.pickBlank]]);
  var p = popAt(cell, '<div class="lvm">' + opts.map(function (o) {
    var on = L.single ? (o[0] ? !!now : !now) : o[0] === now;
    return '<button data-lv="' + o[0] + '"' + (on ? ' class="cur"' : '') + '><b class="' + (o[0] ? 'lv lv-' + o[0] : '') + '">' + esc(o[1]) + '</b>' + esc(o[2]) + '</button>';
  }).join('') + '</div>');
  ($('.lvm button.cur', p) || $('.lvm button', p)).focus();
  p.onclick = function (ev) { var b = ev.target.closest('[data-lv]'); if (!b) return; closePop(); fill(b.dataset.lv); };
}

// Column filter: the values the column shows (with their row counts) to tick, or a text the value contains.
document.addEventListener('click', function (ev) {
  var btn = ev.target.closest('.grid th .flt'); if (!btn) return;
  ev.preventDefault(); ev.stopPropagation(); closeEditor();
  if (pop && pop.dataset.f === btn.dataset.f) { closePop(); return; }
  openFilter(btn);
});
function openFilter(btn) {
  var s = btn.closest('table').dataset.s, k = btn.dataset.f, col = colOf(s, k); if (!col) return;
  var now = (filters[s] || {})[k] || {}, vals = columnValues(s, view, L, k), MAX = 300;
  var chosen = {}; vals.forEach(function (v) { chosen[v[0]] = !now.vals || now.vals.indexOf(v[0]) >= 0; });
  var p = popAt(btn, '<div class="ph">' + esc(col.h) + '</div><input type="search" class="fq" placeholder="' + esc(E.fHas) + '">'
    + '<label class="fa"><input type="checkbox"> ' + esc(E.fAll) + '</label><div class="fl"></div>'
    + '<div class="pb"><button class="fno">' + esc(E.fClear) + '</button><button class="fok">' + esc(E.fApply) + '</button></div>');
  p.dataset.f = k;
  var q = $('.fq', p); q.value = now.q || '';
  var shown = function () { var t = q.value.trim().toLowerCase(); return vals.filter(function (v) { return !t || v[0].toLowerCase().indexOf(t) >= 0; }); };
  function paint() {
    var sh = shown();
    $('.fl', p).innerHTML = sh.slice(0, MAX).map(function (v) { return '<label><input type="checkbox" data-v="' + esc(v[0]) + '"' + (chosen[v[0]] ? ' checked' : '') + '> ' + esc(v[0] || E.fBlank) + '<small>' + v[1] + '</small></label>'; }).join('')
      + (sh.length > MAX ? '<p class="muted">' + esc(fmt(E.fMore, { n: sh.length - MAX })) + '</p>' : '');
    $('.fa input', p).checked = sh.length > 0 && sh.every(function (v) { return chosen[v[0]]; });
  }
  paint();
  q.oninput = paint;
  q.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('.fok', p).click(); } };
  $('.fa input', p).onchange = function () { var on = this.checked; shown().forEach(function (v) { chosen[v[0]] = on; }); paint(); };
  $('.fl', p).onchange = function (e) { var c = e.target.closest('input[data-v]'); if (c) { chosen[c.dataset.v] = c.checked; paint(); } };
  var apply = function (f) { filters[s] = filters[s] || {}; if (f) filters[s][k] = f; else delete filters[s][k]; pages[s] = 0; sel = null; closePop(); draw(); };
  $('.fno', p).onclick = function () { apply(null); };
  $('.fok', p).onclick = function () {
    // a search text keeps the ticked values among those it finds; no text = the ticked values; everything ticked = no filter
    var sh = shown(), keep = (q.value.trim() ? sh : vals).filter(function (v) { return chosen[v[0]]; }).map(function (v) { return v[0]; });
    apply(keep.length === vals.length ? null : { vals: keep });
  };
  q.focus();
}

// The filter row: typing filters as you type (the box keeps its focus across the redraw); a matrix column's choice
// filters at once.
function setFilter(s, k, f) { filters[s] = filters[s] || {}; if (f) filters[s][k] = f; else delete filters[s][k]; pages[s] = 0; sel = null; }
document.addEventListener('input', function (ev) {
  var inp = ev.target.closest('input.fin'); if (!inp) return;
  var s = inp.closest('table').dataset.s, k = inp.dataset.f;
  clearTimeout(inp.t);
  inp.t = setTimeout(function () {
    var at = inp.selectionStart; setFilter(s, k, inp.value.trim() ? { q: inp.value } : null); draw();
    var again = $('table[data-s="' + s + '"] input.fin[data-f="' + cssq(k) + '"]'); if (again) { again.focus(); try { again.setSelectionRange(at, at); } catch (e) { /* not a text box */ } }
  }, 220);
});
document.addEventListener('change', function (ev) {
  var sl = ev.target.closest('select.fin'); if (!sl) return;
  var s = sl.closest('table').dataset.s, k = sl.dataset.f, v = sl.value;
  setFilter(s, k, v === '1' ? { has: true } : v === '0' ? { has: false } : v.indexOf('v:') === 0 ? { vals: [v.slice(2)] } : null); draw();
});

// Right-click on a cell: insert a row above / below it, delete the selected rows.
document.addEventListener('contextmenu', function (ev) {
  var cell = ev.target.closest('.grid tbody td'); if (!cell || cell.closest('tr').classList.contains('ft')) return;
  var p0 = pos(cell); if (p0.c < 0) return;
  ev.preventDefault(); closeEditor();
  var g = range(); if (!(sel && sel.s === p0.s && g && p0.r >= g.r0 && p0.r <= g.r1)) select(p0.s, p0.r, p0.c);
  var p = popAt(cell, '<div class="lvm"><button data-m="above">' + esc(E.insAbove) + '</button><button data-m="below">' + esc(E.insBelow) + '</button><button data-m="del">' + esc(E.del) + '</button></div>', { x: ev.clientX, y: ev.clientY });
  $('.lvm button', p).focus();
  p.onclick = function (e) { var b = e.target.closest('[data-m]'); if (!b) return; closePop(); if (b.dataset.m === 'del') delRows(); else addRows(b.dataset.m); };
});

// ---------- clipboard ----------
function tsvOf() {
  var g = range(); if (!g) return '';
  var out = []; for (var r = g.r0; r <= g.r1; r++) { var line = []; for (var c = g.c0; c <= g.c1; c++) { var x = td(sel.s, r, c); line.push(x ? x.textContent.replace(/\t/g, ' ') : ''); } out.push(line.join('\t')); }
  return out.join('\n');
}
document.addEventListener('copy', function (ev) { if (ed || !sel || isField(document.activeElement)) return; ev.clipboardData.setData('text/plain', tsvOf()); ev.preventDefault(); var g = range(); toast(fmt(E.copied, { n: (g.r1 - g.r0 + 1) * (g.c1 - g.c0 + 1) })); });
document.addEventListener('paste', function (ev) {
  if (ed || !sel || isField(document.activeElement)) return;
  var text = ev.clipboardData.getData('text/plain'); if (!text) return; ev.preventDefault();
  var lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(function (l) { return l.split('\t'); });
  needEdit(function () {
    var s = sel.s, g = range(), C = vcols(s), n = 0; snap();
    var single = lines.length === 1 && lines[0].length === 1, R = single ? g.r1 - g.r0 + 1 : lines.length, W = single ? g.c1 - g.c0 + 1 : 0;
    // rows below the page continue into the next matching rows; past the last one, rows are added
    var p = pageInfo(s), visI = p.hits.slice(p.start), extra = 0;
    for (var r = 0; r < R; r++) {
      var line = single ? lines[0] : lines[r], i = g.r0 + r < visI.length ? visI[g.r0 + r] : list(s).length + extra++;
      var w = single ? W : line.length;
      for (var c = 0; c < w; c++) { var k = C[g.c0 + c]; if (k && setVal(s, i, k, single ? line[0] : line[c])) n++; }
    }
    if (!n) { undoS.pop(); return; } changed(); toast(fmt(E.pasted, { n: n }));
    sel.r1 = Math.min(vrows(s).length - 1, g.r0 + R - 1); sel.c1 = Math.min(C.length - 1, g.c0 + Math.max(1, single ? W : lines[0].length) - 1); paintSel();
  });
});
function isField(el) { return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable); }

// ---------- keys ----------
document.addEventListener('keydown', function (ev) {
  if ($('#save-dlg').open) return;
  var k = ev.key, mod = ev.ctrlKey || ev.metaKey;
  if (mod && k.toLowerCase() === 's') { ev.preventDefault(); save(); return; }
  if (pop) {
    if (k === 'Escape') { ev.preventDefault(); closePop(); return; }
    var bs = $$('.lvm button', pop), at = bs.indexOf(document.activeElement);
    if (bs.length && (k === 'ArrowDown' || k === 'ArrowUp')) { ev.preventDefault(); bs[(at + (k === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus(); return; }
    if (pop.contains(ev.target)) return;
    closePop();
  }
  if (ed || isField(ev.target)) return;
  if (k === '?' ) { $('#help').classList.add('on'); return; }
  if (k === 'Escape') { $('#help').classList.remove('on'); sel = null; paintSel(); return; }
  if (mod && k.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
  if (mod && k.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
  if (!sel || sel.s !== cur) return;
  var d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
  if (d && ev.altKey && d[0]) { ev.preventDefault(); moveRows(d[0]); return; }
  if (d) { ev.preventDefault(); var jump = mod ? 1e6 : 1; select(sel.s, sel.r1 + d[0] * jump, sel.c1 + d[1] * jump, ev.shiftKey); return; }
  if (k === 'Tab') { ev.preventDefault(); select(sel.s, sel.r1, sel.c1 + (ev.shiftKey ? -1 : 1)); return; }
  if (mod && k.toLowerCase() === 'a') { ev.preventDefault(); sel.r0 = 0; sel.c0 = 0; sel.r1 = vrows(sel.s).length - 1; sel.c1 = vcols(sel.s).length - 1; paintSel(); return; }
  if (mod && k.toLowerCase() === 'd') { ev.preventDefault(); var g = range(); var top = rowIdx(sel.s, g.r0); needEdit(function () { snap(); for (var c = g.c0; c <= g.c1; c++) { var kk = vcols(sel.s)[c], v = raw(sel.s, top, kk); for (var r = g.r0 + 1; r <= g.r1; r++) setVal(sel.s, rowIdx(sel.s, r), kk, v); } changed(); paintSel(); }); return; }
  if (mod && (k === 'Enter')) { ev.preventDefault(); addRows('below'); return; }
  if (mod && (k === '-' )) { ev.preventDefault(); delRows(); return; }
  if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); needEdit(function () { fill(''); }); return; }
  if (k === 'Enter' || k === 'F2') { ev.preventDefault(); startEdit(''); return; }
  var cell = td(sel.s, sel.r1, sel.c1);
  if (cell && (cell.classList.contains('lv') || cell.classList.contains('xx')) && !mod && k.length === 1) {
    var u = k.toUpperCase(); ev.preventDefault();
    if (k === ' ') { needEdit(function () { if (cell.classList.contains('lv')) openLevels(cell); else cycle(cell); }); return; }
    var lv = L.lvIn ? L.lvIn[u] : LEVELS.indexOf(u) >= 0 ? u : '';
    if (cell.classList.contains('lv') && lv) { needEdit(function () { fill(L.single ? lv : (L.lvOut && L.lvOut[lv]) || lv); }); return; }
    if (cell.classList.contains('xx') && (u === 'X' || u === 'O' || u === '1' || (L.mark && u === L.mark.toUpperCase()))) { needEdit(function () { fill('X'); }); return; }
    return;
  }
  if (!mod && !ev.altKey && k.length === 1) { ev.preventDefault(); startEdit(k); }
});

// ---------- edit mode, cover fields ----------
function setEditing(on) { editing = on; document.body.classList.toggle('editing', on); $('#edit').textContent = on ? E.done : E.edit; }
$('#edit').onclick = function () { closeEditor(); setEditing(!editing); };
document.addEventListener('click', function (ev) {
  var c = ev.target.closest('#tab-cover td[data-d]'); if (!c || ed) return;
  needEdit(function () {
    var k = c.dataset.d, inp = document.createElement('input'); inp.className = 'cover-ed'; inp.value = model.doc[k] || ''; c.textContent = ''; c.appendChild(inp); inp.focus();
    var done = function (ok) { if (ok && inp.value !== (model.doc[k] || '')) { snap(); model.doc[k] = inp.value; changed(); } else draw(); };
    inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.onblur = null; done(true); } if (e.key === 'Escape') { inp.onblur = null; done(false); } };
    inp.onblur = function () { done(true); };
  });
});

// ---------- CSV ----------
function csv() {
  var s = sheetNow(); if (!s) return;
  // every matching row of the sheet, not only the page on screen
  var cs = cols(s), nm = function (id) { var b = model.broles.filter(function (x) { return x.id === id; })[0]; return b && b.name ? ' ' + b.name : ''; };
  var head = cs.map(function (c) { return c.h + (c.role ? nm(c.role) : ''); });
  var rows = pageInfo(s).hits.map(function (i) { var r = list(s)[i]; return cs.map(function (c) { return String(cellValue(s, r, c, view, L)); }); });
  var blob = new Blob([toCsv(head, rows)], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = model.doc.code + '-' + (L.tabs[s] || s).replace(/[^\w가-힣.-]+/g, '_') + '.csv'; a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

// ---------- draft, save ----------
(function () {
  var d = load(DRAFT); if (!d || d === built) return;
  $('#draft').classList.add('on');
  $('#resume').onclick = function () { model = normalizeModel(JSON.parse(d)); dirty = 1; $('#draft').classList.remove('on'); setEditing(true); draw(); };
  $('#discard').onclick = function () { store(DRAFT, null); $('#draft').classList.remove('on'); };
})();
window.addEventListener('beforeunload', function (ev) { if (dirty) { ev.preventDefault(); ev.returnValue = E.unsaved; } });
$('#save').onclick = save;
function save() {
  closeEditor();
  var dlg = $('#save-dlg'); $('#s-author').value = load('sc4sap-role-author') || model.doc.author || ''; $('#s-note').value = ''; $('#s-note').placeholder = E.noteDefault;
  $('#s-ver').textContent = 'v' + nextVersion(version); dlg.showModal(); $('#s-note').focus();
}
$('#s-cancel').onclick = function () { $('#save-dlg').close(); };
$('#s-ok').onclick = function () {
  var author = $('#s-author').value.trim(), note = $('#s-note').value.trim() || E.noteDefault;
  if (!author) { $('#s-author').focus(); toast(E.needAuthor); return; }
  store('sc4sap-role-author', author); $('#save-dlg').close();
  var nv = nextVersion(version), d = today();
  model.revisions.push({ ver: 'v' + nv, date: d, author: author, change: note, approver: '', note: '' });
  model.doc.date = d; var prev = version; version = nv;
  viewOf = null; // the revision row was added in place
  $('#ver').textContent = 'v' + nv; document.title = document.title.replace(/v[\d.]+$/, 'v' + nv);
  draw();
  var html = pageHtml(prev);
  write(html, model.doc.code + '-role-matrix-v' + nv + '-' + model.lang + '.html').then(function () {
    dirty = 0; store(DRAFT, null); DRAFT = 'sc4sap-role-' + model.doc.code + '-' + version; built = JSON.stringify(model); state(); toast(fmt(E.saved, { v: nv }));
  });
};
function pageHtml(from) {
  var doc = document.documentElement.cloneNode(true);
  var data = JSON.stringify({ model: model, version: version, builtFrom: DATA.builtFrom || from, savedFrom: from }).replace(/</g, '\\u003c');
  doc.querySelector('#role-model').textContent = data;
  // sheets not opened since the last change still hold old tables; the saved file gets every sheet as it is now
  var a = renderAll(model, { version: version, date: model.doc.date, only: VS.filter(function (x) { return stale[x]; }), view: viewOpts(), v: view });
  VS.forEach(function (x) { if (stale[x]) doc.querySelector('#tab-' + x + ' .body').innerHTML = a[x]; });
  var b = doc.querySelector('body'); b.classList.remove('editing'); b.removeAttribute('style');
  $$('.cell-ed, .cover-ed', doc).forEach(function (x) { x.remove(); });
  $$('.sel, .cur', doc).forEach(function (x) { x.classList.remove('sel', 'cur'); });
  doc.querySelector('#draft').classList.remove('on'); doc.querySelector('#toast').classList.remove('on');
  var t = doc.querySelector('title'); if (t) t.textContent = t.textContent.replace(/v[\d.]+/, 'v' + version);
  var vv = doc.querySelector('#ver'); if (vv) vv.textContent = 'v' + version;
  return '<!doctype html>\n' + doc.outerHTML;
}
function write(html, name) {
  if (window.showSaveFilePicker) {
    var go = fileHandle ? Promise.resolve(fileHandle) : window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }] });
    return go.then(function (h) { fileHandle = h; return h.createWritable(); }).then(function (w) { return w.write(html).then(function () { return w.close(); }); })
      .catch(function (e) { if (e && e.name === 'AbortError') throw e; return download(html, name); });
  }
  return download(html, name);
}
function download(html, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = name; a.click(); return Promise.resolve(); }

// ---------- help, theme, print ----------
$('#help-b').onclick = function () { $('#help').classList.add('on'); };
$('#help .hx').onclick = function () { $('#help').classList.remove('on'); };
$('#help').onclick = function (ev) { if (ev.target.id === 'help') $('#help').classList.remove('on'); };
$('#theme').onclick = function () { var r = document.documentElement; r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark'; };
$('#print').onclick = function () { window.print(); };
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

draw();
tab((location.hash || '').slice(1) && $('#tab-' + location.hash.slice(1)) ? location.hash.slice(1) : 'cover');

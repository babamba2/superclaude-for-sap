// sc4sap:project-dashboard — browser code of the page (inlined by project-page.mjs after project-model.mjs,
// project-render.mjs and `var E = <labels>`). Built like a web planning tool: detail panel, command palette,
// spreadsheet keys, Gantt drag (move / resize / progress / link), multi-select with bulk actions, Excel paste
// and copy, dependency arrows, change marks, undo / redo, drafts, and Save that overwrites the same file.
var DATA = JSON.parse(document.getElementById('project-model').textContent);
var model = DATA.model, history = DATA.history || [], ORIG = JSON.parse(JSON.stringify(DATA.model));
var undo = [], redo = [], edits = 0, dirty = false, editing = false, lastDraft = '', savedAt = '';
var L = labelsFor(model.lang);
var today = new Date().toISOString().slice(0, 10);
var key = 'sc4sap-pd:' + (model.project && model.project.code) + ':' + DATA.version;
var nums = {}, ids = {}, view = null;
var closed = {}, filt = { q: '', ws: '', owner: '', late: false }, autoShift = true, zoom = 1, showChanges = false;
var current = null, picked = {}, drawerId = null, fileHandle = null, session = 's' + Date.now();
var selectMode = false, mq = window.matchMedia ? window.matchMedia('(max-width: 760px)') : null;
function narrow() { return !!(mq && mq.matches); }
function setMobileView(v) { document.body.classList.toggle('m-table', v === 'table'); document.body.classList.toggle('m-gantt', v !== 'table'); $$('.mv button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === v); }); store('sc4sap-pd-mview', v); setTimeout(drawArrows, 0); }
function store(k, v) { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }
function hhmm() { return new Date().toTimeString().slice(0, 5); }
function pickedIds() { return Object.keys(picked).filter(function (k) { return picked[k]; }); }

// ---------- drawing ----------
function draw(after) {
  // The WBS pane keeps its scroll position across redraws (every edit redraws it).
  var pane = $('.wbs-w'), keep = pane ? [pane.scrollLeft, pane.scrollTop] : null;
  var a = renderAll(model, { history: history, today: today });
  view = a.v; nums = {}; ids = {};
  a.v.rows.forEach(function (r) { nums[r.id] = r.num; ids[r.num] = r.id; });
  ['sum', 'kpi', 'ms', 'wbs', 'sap', 'team', 'hist'].forEach(function (t) { var el = $('#tab-' + t + ' .body'); if (el) el.innerHTML = a[t]; });
  var rg = $('#overall'); if (rg) { rg.className = 'rag rag-' + a.v.overall; rg.textContent = L.rag[a.v.overall]; }
  var wt = $('.wbs'), span = wt ? +wt.dataset.days || 365 : 365;
  document.documentElement.style.setProperty('--gw', Math.round(Math.max(520, span * (narrow() ? 4 : 3.4)) * zoom) + 'px');
  fillFilters(); if (editing) tools();
  applyView(); renderDrawer(); renderBulk(); updateState();
  fitPane();
  pane = $('.wbs-w'); if (pane && keep) { pane.scrollLeft = keep[0]; pane.scrollTop = keep[1]; drawArrows(); }
  if (after) after();
}
function tab(t) {
  $$('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.t === t); });
  $$('section.tab').forEach(function (s) { s.classList.toggle('on', s.id === 'tab-' + t); });
  store('sc4sap-pd-tab', t); if (t === 'wbs') setTimeout(function () { fitPane(true); drawArrows(); if (narrow() && !tab.done) { tab.done = 1; toToday(); } }, 0);
}
// Phone: the Gantt pane fills the screen below the top bar and the WBS tools, so its header row stays fixed
// (it is sticky inside the pane; a pane taller than the screen let the page scroll the header away).
function fitPane(align) {
  var w = $('.wbs-w'); if (!w) return;
  if (!narrow()) { w.style.height = ''; return; }
  var top = $('.topbar').offsetHeight, tools = $('#tab-wbs .wtools'), th = tools && tools.offsetParent ? tools.offsetHeight + 8 : 0;
  var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  w.style.height = Math.max(240, Math.floor(vh - top - th - 4)) + 'px';
  if (align && w.offsetParent) window.scrollTo(0, Math.max(0, w.getBoundingClientRect().top + window.scrollY - top - th));
}
if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { fitPane(); });
$$('.tabs button').forEach(function (b) { b.onclick = function () { tab(b.dataset.t); }; });
$('#theme').onclick = function () { var r = document.documentElement; r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark'; };
$('#print').onclick = function () { window.print(); };
function setEditing(on) { editing = on; document.body.classList.toggle('editing', on); $('#edit').textContent = on ? E.done : E.edit; draw(); }
$('#edit').onclick = function () { setEditing(!editing); };
function updateState() {
  var s = $('#state'); if (!s) return;
  var chg = showChanges ? changedRows() : null;
  s.textContent = dirty ? E.stDirty.replace('{n}', edits) + (lastDraft ? ' · ' + E.stDraft.replace('{t}', lastDraft) : '') : savedAt ? E.stSaved.replace('{t}', savedAt) : E.stClean;
  if (chg) s.textContent += ' · ' + E.stChanged.replace('{n}', chg.n);
  s.className = dirty ? 'state dirty' : 'state';
}

// ---------- WBS view: filters, collapse, selection, change marks, arrows ----------
function fillFilters() {
  var ws = $('#f-ws'), ow = $('#f-owner'); if (!ws) return;
  var keep = [ws.value, ow.value];
  ws.innerHTML = '<option value="">' + E.allWs + '</option>' + model.workstreams.map(function (w) { return '<option value="' + w.code + '">' + w.code + '</option>'; }).join('');
  ow.innerHTML = '<option value="">' + E.allOwners + '</option>' + model.team.map(function (t) { return '<option value="' + t.id + '">' + t.name + '</option>'; }).join('');
  ws.value = keep[0]; ow.value = keep[1];
}
function filtering() { return !!(filt.q || filt.ws || filt.owner || filt.late); }
function applyView() {
  var rows = $$('.wbs tr.wr[data-id]'), byId = {}, show = {};
  rows.forEach(function (tr) { byId[tr.dataset.id] = tr; });
  var q = filt.q.toLowerCase(), any = filtering();
  model.wbs.forEach(function (w) {
    var tr = byId[w.id]; if (!tr) return;
    var ok = (!q || (tr.textContent || '').toLowerCase().indexOf(q) >= 0) && (!filt.ws || w.ws === filt.ws)
      && (!filt.owner || [w.owner, w.fnOwner, w.devOwner].indexOf(filt.owner) >= 0) && (!filt.late || tr.querySelector('.gb.rag-b-red'));
    if (ok) { show[w.id] = 1; for (var p = w.parent; p; p = (find('w', p) || {}).parent) show[p] = 1; }
  });
  var hide = -1, chg = showChanges ? changedRows() : { rows: {} };
  rows.forEach(function (tr) {
    var d = +tr.dataset.depth, id = tr.dataset.id;
    tr.classList.toggle('collapsed', !!closed[id]);
    tr.classList.toggle('sel', id === current); tr.classList.toggle('pick', !!picked[id] && pickedIds().length > 1);
    tr.classList.toggle('chg', chg.rows[id] === 'chg'); tr.classList.toggle('new', chg.rows[id] === 'new');
    if (hide >= 0 && d > hide) { tr.style.display = 'none'; return; }
    hide = -1; tr.style.display = any && !show[id] ? 'none' : '';
    if (closed[id] && !any) hide = d;
  });
  drawArrows();
}
// Rows that differ from the version the page was built as (new rows, or changed plan fields).
var CHG_FIELDS = ['label', 'start', 'finish', 'pct', 'status', 'owner', 'fnOwner', 'devOwner', 'ws', 'deps', 'parent', 'wricef.stage', 'note'];
function changedRows() {
  var o = {}, out = { rows: {}, n: 0 };
  ORIG.wbs.forEach(function (w) { o[w.id] = w; });
  model.wbs.forEach(function (w) {
    var a = o[w.id]; if (!a) { out.rows[w.id] = 'new'; out.n++; return; }
    if (CHG_FIELDS.some(function (f) { return JSON.stringify(get(a, f) == null ? null : get(a, f)) !== JSON.stringify(get(w, f) == null ? null : get(w, f)); })) { out.rows[w.id] = 'chg'; out.n++; }
  });
  return out;
}
// Finish-to-start arrows between visible bars, drawn over the Gantt column.
function drawArrows() {
  var wrap = $('.wbs-w'); if (!wrap || !wrap.offsetParent) return;
  var svg = $('#arr', wrap);
  if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'arr'; wrap.appendChild(svg); }
  var t = $('table.wbs', wrap); svg.setAttribute('width', t.scrollWidth); svg.setAttribute('height', t.scrollHeight);
  var wr = wrap.getBoundingClientRect(), ox = wrap.scrollLeft - wr.left, oy = wrap.scrollTop - wr.top;
  var bar = function (id) { var b = $('.gb[data-drag="' + cssq(id) + '"]', wrap); return b && b.offsetParent ? b.getBoundingClientRect() : null; };
  var out = ['<defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="ahd"/></marker></defs>'];
  out.push(gridLines(t, wr, ox, oy));
  model.wbs.forEach(function (w) {
    (w.deps || []).forEach(function (d) {
      var a = bar(d), b = bar(w.id); if (!a || !b) return;
      var x1 = a.right + ox, y1 = a.top + a.height / 2 + oy, x2 = b.left + ox, y2 = b.top + b.height / 2 + oy;
      var bad = view && view.byId.get(d) && view.byId.get(w.id) && view.byId.get(w.id).start <= view.byId.get(d).finish;
      var path = x2 > x1 + 12 ? 'M' + x1 + ',' + y1 + ' H' + (x1 + 6) + ' V' + y2 + ' H' + (x2 - 1)
        : 'M' + x1 + ',' + y1 + ' H' + (x1 + 6) + ' V' + (y2 - 9) + ' H' + (x2 - 8) + ' V' + y2 + ' H' + (x2 - 1);
      out.push('<path d="' + path + '" class="ar' + (bad ? ' bad' : '') + '" marker-end="url(#ah)"/>');
    });
  });
  svg.innerHTML = out.join('');
}
// Dotted guide lines down the Gantt column: month starts (stronger), Mondays, and every day once a day is wide enough.
function gridLines(t, wr, ox, oy) {
  var cell = $('td.gantt', t), head = $('th.gantt-h', t); if (!cell || !head) return '';
  var cr = cell.getBoundingClientRect(), s = t.dataset.span, tot = +t.dataset.days || 1, pd = cr.width / tot;
  var y1 = head.getBoundingClientRect().bottom + oy, y2 = t.getBoundingClientRect().bottom + oy, x0 = cr.left + ox, out = [];
  for (var i = 1; i < tot; i++) {
    var d = addDays(s, i), cls = d.slice(8) === '01' ? 'gl-m' : new Date(d + 'T00:00:00Z').getUTCDay() === 1 ? 'gl-w' : pd >= 14 ? 'gl-d' : '';
    if (cls) out.push('<line x1="' + (x0 + i * pd).toFixed(1) + '" x2="' + (x0 + i * pd).toFixed(1) + '" y1="' + y1 + '" y2="' + y2 + '" class="' + cls + '"/>');
  }
  return '<g class="grid">' + out.join('') + '</g>';
}
window.addEventListener('resize', function () { drawArrows(); });
function select(id, mode) {
  if (mode === 'toggle') { picked[id] = !picked[id]; if (picked[id]) current = id; }
  else if (mode === 'range' && current) {
    var vis = $$('.wbs tr.wr[data-id]').filter(function (t) { return t.style.display !== 'none'; }).map(function (t) { return t.dataset.id; });
    var a = vis.indexOf(current), b = vis.indexOf(id); if (a > b) { var x = a; a = b; b = x; }
    picked = {}; vis.slice(a, b + 1).forEach(function (k) { picked[k] = true; });
  } else { picked = {}; picked[id] = true; current = id; }
  applyView(); renderBulk();
}
function goRow(id) {
  tab('wbs'); filt = { q: '', ws: '', owner: '', late: false }; ['#f-q', '#f-ws', '#f-owner'].forEach(function (s) { if ($(s)) $(s).value = ''; }); if ($('#f-late')) $('#f-late').checked = false;
  for (var p = (find('w', id) || {}).parent; p; p = (find('w', p) || {}).parent) closed[p] = false;
  select(id); openDrawer(id);
  var tr = $('.wbs tr.wr[data-id="' + cssq(id) + '"]'); if (tr) tr.scrollIntoView({ block: 'center' });
}
function bindTools() {
  if (!$('#f-q')) return;
  $('#f-q').oninput = function () { filt.q = this.value.trim(); applyView(); };
  $('#f-ws').onchange = function () { filt.ws = this.value; applyView(); };
  $('#f-owner').onchange = function () { filt.owner = this.value; applyView(); };
  $('#f-late').onchange = function () { filt.late = this.checked; applyView(); };
  $('#f-open').onclick = function () { closed = {}; applyView(); };
  $('#f-close').onclick = function () { closed = {}; model.wbs.forEach(function (w) { if (!w.parent) closed[w.id] = 1; }); applyView(); };
  $('#z-in').onclick = function () { zoom = Math.min(8, zoom * 1.5); draw(); };
  $('#z-out').onclick = function () { zoom = Math.max(0.6, zoom / 1.5); draw(); };
  $('#f-today').onclick = toToday;
  $('#f-shift').onchange = function () { autoShift = this.checked; };
  $('#f-chg').onchange = function () { showChanges = this.checked; applyView(); updateState(); };
  $('#f-csv').onclick = exportCsv;
  $('#f-base').onclick = setBaseline;
  $('#f-phase').onclick = addPhase;
  $$('.mv button').forEach(function (b) { b.onclick = function () { setMobileView(b.dataset.v); }; });
  $('#f-sel').onclick = function () { selectMode = !selectMode; this.setAttribute('aria-pressed', selectMode); if (!selectMode) { picked = {}; if (current) picked[current] = true; applyView(); renderBulk(); } toast(selectMode ? E.selOn : E.selOff, false); };
  $('#f-more').onclick = function () { $('.wtools').classList.toggle('open'); };
  $('.wbs-w') && $('.wbs-w').addEventListener('scroll', function () {}, { passive: true });
}
function toToday() { tab('wbs'); var g = $('.wbs .gtoday'), w = $('.wbs-w'); if (g && w) w.scrollLeft = Math.max(0, g.getBoundingClientRect().left - w.getBoundingClientRect().left + w.scrollLeft - w.clientWidth / 2); }

// ---------- model access, undo / redo ----------
function find(scope, id) {
  var list = scope === 'w' ? model.wbs : scope === 'm' ? model.milestones : scope === 'k' ? (model.kpis = model.kpis || []) : model.team;
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
function get(o, f) { return f.split('.').reduce(function (x, k) { return x == null ? x : x[k]; }, o); }
function set(o, f, v) { var ks = f.split('.'), x = o; for (var i = 0; i < ks.length - 1; i++) { x[ks[i]] = x[ks[i]] || {}; x = x[ks[i]]; } x[ks[ks.length - 1]] = v; }
function snap() { undo.push(JSON.stringify(model)); if (undo.length > 300) undo.shift(); redo = []; edits++; dirty = true; queueDraft(); }
var draftTimer = null;
function queueDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(function () { store(key, JSON.stringify({ model: model, history: history })); lastDraft = hhmm(); updateState(); }, 400); }
function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(model)); model = JSON.parse(undo.pop()); edits = Math.max(0, edits - 1); dirty = true; queueDraft(); draw(); }
function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(model)); model = JSON.parse(redo.pop()); edits++; dirty = true; queueDraft(); draw(); }
$('#undo').onclick = doUndo;

// ---------- scheduling ----------
// Finish-to-start, push only: the edited row is fitted to its own predecessors, then successors move right.
function fitToPreds(id, v) {
  var w = find('w', id); if (!w || !w.deps || !w.deps.length || !w.start || !w.finish) return 0;
  var latest = w.deps.map(function (d) { var r = v.byId.get(d); return r && r.finish; }).filter(Boolean).sort().pop();
  if (!latest || w.start > latest) return 0;
  var n = days(w.start, latest) + 1; w.start = addDays(w.start, n); w.finish = addDays(w.finish, n); return 1;
}
function cascade(fromIds) {
  if (!autoShift) return 0;
  var moved = 0, seen = {}, queue = fromIds.slice();
  fromIds.forEach(function (id) { moved += fitToPreds(id, viewModel(model, today)); });
  while (queue.length) {
    var id = queue.shift(); if (seen[id]) continue; seen[id] = 1;
    var v = viewModel(model, today);
    model.wbs.forEach(function (w) { if (w.deps && w.deps.indexOf(id) >= 0 && fitToPreds(w.id, v)) { moved++; queue.push(w.id); } });
    var row = find('w', id); if (row && row.parent) queue.push(row.parent);
  }
  return moved;
}
function dependsOn(a, b) {   // does a (transitively) depend on b?
  var seen = {}, stack = [a];
  while (stack.length) { var x = stack.pop(); if (x === b) return true; if (seen[x]) continue; seen[x] = 1; var w = find('w', x); if (w) stack.push.apply(stack, w.deps || []); }
  return false;
}
function commit(scope, id, f, v) {
  var o = find(scope, id); if (!o) return;
  snap();
  if (f === 'wricef.stage') { o.wricef = o.wricef || {}; o.wricef.stageDates = o.wricef.stageDates || {}; if (v !== 'req') o.wricef.stageDates[v] = today; }
  if (scope === 'w' && f === 'start' && v && o.start && o.finish) o.finish = addDays(o.finish, days(o.start, v));
  if (scope === 'w' && f === 'pct') { if (v >= 100) o.status = 'done'; else if (v > 0 && o.status === 'notstarted') o.status = 'inprogress'; }
  if (scope === 'k' && f === 'actual' && v !== '') o.history = (o.history || []).filter(function (h) { return h.date !== today; }).concat([{ date: today, value: v }]);
  if (scope === 'w' && f === 'deps') v = v.filter(function (d) { return !dependsOn(d, id); });
  if (v === '' || v == null) { var ks = f.split('.'); var p = ks.length > 1 ? get(o, ks.slice(0, -1).join('.')) : o; if (p) delete p[ks[ks.length - 1]]; }
  else set(o, f, v);
  var n = scope === 'w' && /^(start|finish|deps)$/.test(f) ? cascade([id]) : 0;
  if (n) toast(E.shifted.replace('{n}', n), true);
}

// ---------- the inline editor ----------
function parseDate(t, cur) {
  t = String(t || '').trim(); var base = cur || today, y = (cur || today).slice(0, 4), m;
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^(오늘|today|t|\.)$/i.test(t)) return today;
  if ((m = /^([+-])\s*(\d+)\s*([dwm주일달]?)$/i.exec(t))) { var n = +m[2] * (m[1] === '-' ? -1 : 1); var u = m[3].toLowerCase(); if (u === 'w' || u === '주') n *= 7; if (u === 'm' || u === '달') return addMonths(base, n); return addDays(base, n); }
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(t))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t))) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(t)) || (m = /^(\d{2})(\d{2})$/.exec(t))) return y + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  return null;
}
function addMonths(d, n) { var x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); }
function options(kind) {
  if (kind.indexOf('enum:') === 0) { var m = L[kind.slice(5)]; return Object.keys(m).map(function (k) { return [k, m[k]]; }); }
  if (kind === 'owner') return [['', '—']].concat(model.team.filter(function (t) { return isActive(t, today); }).map(function (t) { return [t.id, t.name + ' · ' + (L.role[t.role] || t.role) + (t.module ? ' ' + t.module : '')]; }));
  if (kind === 'ws') return [['', '—']].concat(model.workstreams.map(function (w) { return [w.code, w.code + ' · ' + w.label]; }));
  return null;
}
function scopeOf(el) { return el.closest('#drawer') || $('section.tab.on') || document; }
function editables(root) { return $$('.ed', root).filter(function (e) { return e.offsetParent !== null; }); }
function openEditor(el) {
  if (!el || el.querySelector('input,select')) return;
  var p = el.dataset.f.split('|'), kind = el.dataset.k, o = find(p[0], p[1]); if (!o) return;
  var inDrawer = !!el.closest('#drawer');
  if (p[0] === 'w' && !inDrawer) { current = p[1]; if (!picked[p[1]]) { picked = {}; picked[p[1]] = true; } }
  var cur = get(o, p[2]), opts = options(kind), inp;
  if (opts) {
    inp = document.createElement('select');
    opts.forEach(function (x) { var op = document.createElement('option'); op.value = x[0]; op.textContent = x[1]; if (x[0] === (cur || '')) op.selected = true; inp.appendChild(op); });
  } else {
    inp = document.createElement('input'); inp.type = kind === 'pct' || kind === 'num' ? 'number' : 'text';
    if (kind === 'num') inp.step = 'any'; if (kind === 'pct') { inp.min = 0; inp.max = 100; }
    if (kind === 'date') inp.placeholder = E.datePh;
    if (kind === 'deps') { inp.placeholder = E.depsPh; cur = (cur || []).map(function (d) { return nums[d] || d; }).join(', '); }
    inp.value = kind === 'list' ? (cur || []).join(' · ') : cur == null ? '' : cur;
    inp.size = Math.max(kind === 'date' ? 11 : 6, String(inp.value).length + 2);
  }
  el.innerHTML = ''; el.appendChild(inp);
  var done = false, picking = false;
  if (kind === 'date') {
    var cal = document.createElement('button'); cal.type = 'button'; cal.className = 'cal'; cal.textContent = '📅'; cal.title = E.calendar;
    var pk = document.createElement('input'); pk.type = 'date'; pk.className = 'pk';
    cal.addEventListener('mousedown', function (e) { e.preventDefault(); picking = true; pk.value = parseDate(inp.value, cur) || cur || today; try { pk.showPicker(); } catch (x) { pk.focus(); } });
    pk.addEventListener('change', function () { inp.value = pk.value; picking = false; finish(true); });
    pk.addEventListener('blur', function () { if (picking) { picking = false; inp.focus(); } });
    el.appendChild(cal); el.appendChild(pk);
  }
  inp.focus(); if (inp.select && !opts) inp.select();
  function value() {
    var v = inp.value;
    if (kind === 'pct') return Math.max(0, Math.min(100, Math.round(+v || 0)));
    if (kind === 'num') return v === '' ? '' : +v;
    if (kind === 'list') return v.split(/\s*[·,;]\s*/).filter(Boolean);
    if (kind === 'date') return parseDate(v, cur);
    if (kind === 'deps') return v.split(/[\s,;]+/).filter(Boolean).map(function (n) { return ids[n] || n; }).filter(function (d) { return d !== p[1] && find('w', d); });
    return v;
  }
  function finish(save, move) {
    if (done) return; var v = save ? value() : undefined;
    if (save && v === null) { inp.classList.add('bad-in'); inp.focus(); return; }
    done = true;
    var target = move ? neighbour(el, move) : null;
    var before = get(o, p[2]); before = before == null ? (kind === 'deps' || kind === 'list' ? [] : '') : before;
    if (save && JSON.stringify(v) !== JSON.stringify(before)) commit(p[0], p[1], p[2], v);
    draw(function () { if (target) openEditor($((inDrawer ? '#drawer ' : '') + '.ed[data-f="' + cssq(target) + '"]')); });
  }
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); return; }
    if (kind === 'date' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); var b = parseDate(inp.value, cur) || cur || today; inp.value = addDays(b, (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 7 : 1)); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && p[0] === 'w') { e.preventDefault(); finish(true); addRow(p[1], e.shiftKey); return; }
    if (e.key === 'Enter') { e.preventDefault(); finish(true, e.shiftKey ? 'up' : 'down'); return; }
    if (e.key === 'Tab') { e.preventDefault(); finish(true, e.shiftKey ? 'left' : 'right'); return; }
    if (e.altKey && p[0] === 'w' && /^Arrow/.test(e.key)) { e.preventDefault(); finish(true); rowKey(e.key); }
  });
  inp.addEventListener(opts ? 'change' : 'blur', function () { if (!picking) finish(true); });
  if (opts) inp.addEventListener('blur', function () { finish(false); });
}
function neighbour(el, dir) {
  var all = editables(scopeOf(el)), i = all.indexOf(el);
  if (dir === 'right' || dir === 'left') { var n = all[i + (dir === 'right' ? 1 : -1)]; return n ? n.dataset.f : null; }
  var f = el.dataset.f.split('|'), same = all.filter(function (x) { var g = x.dataset.f.split('|'); return g[0] === f[0] && g[2] === f[2]; });
  var m = same[same.indexOf(el) + (dir === 'down' ? 1 : -1)];
  return m ? m.dataset.f : null;
}

// ---------- clicks ----------
document.addEventListener('click', function (ev) {
  var t = ev.target;
  if (t.closest('.tg')) { var tr0 = t.closest('tr.wr'); closed[tr0.dataset.id] = !closed[tr0.dataset.id]; applyView(); return; }
  var num = t.closest('.wbs tr.wr[data-id] td.num');
  if (num) { var id = num.parentNode.dataset.id; var multi = ev.ctrlKey || ev.metaKey || selectMode; select(id, ev.shiftKey ? 'range' : multi ? 'toggle' : ''); if (!ev.shiftKey && !multi) openDrawer(id); return; }
  var lnk = t.closest('[data-go]'); if (lnk) { goRow(lnk.dataset.go); return; }
  var el = t.closest('.ed'); if (editing && el) { openEditor(el); return; }
  var tr = t.closest('.wbs tr.wr[data-id]');
  if (tr && !t.closest('button,input,select,.gb')) {
    select(tr.dataset.id, ev.shiftKey ? 'range' : ev.ctrlKey || ev.metaKey || selectMode ? 'toggle' : '');
    if (narrow() && !selectMode && !t.closest('.ed')) openDrawer(tr.dataset.id);
  }
});
// Double-click edits right away, also outside edit mode; on an empty Gantt cell it places a one-week bar.
document.addEventListener('dblclick', function (ev) {
  var el = ev.target.closest('.ed');
  if (el) { var inD = !!el.closest('#drawer'); if (!editing) setEditing(true); openEditor($((inD ? '#drawer ' : '') + '.ed[data-f="' + cssq(el.dataset.f) + '"]')); return; }
  var cell = ev.target.closest('.wbs tr.wr[data-id] td.gantt');
  if (cell && !$('.gb', cell)) {
    var w = find('w', cell.parentNode.dataset.id), t = cell.closest('table.wbs'); if (!w) return;
    var d = Math.floor((ev.clientX - cell.getBoundingClientRect().left) / cell.getBoundingClientRect().width * (+t.dataset.days));
    if (!editing) editing = true, document.body.classList.add('editing'), $('#edit').textContent = E.done;
    snap(); w.start = addDays(t.dataset.span, d); w.finish = addDays(w.start, 6); cascade([w.id]); draw();
  }
});

// ---------- detail panel ----------
function openDrawer(id) { drawerId = id; $('#drawer').classList.add('on'); document.body.classList.add('dw'); renderDrawer(); setTimeout(drawArrows, 220); }
function closeDrawer() { drawerId = null; $('#drawer').classList.remove('on'); document.body.classList.remove('dw'); setTimeout(drawArrows, 220); }
function renderDrawer() {
  var box = $('#drawer'); if (!box || !drawerId) return;
  var r = view && view.byId.get(drawerId); if (!r) { closeDrawer(); return; }
  var leaf = r.leaf && r.type !== 'phase', name = function (id) { var t = model.team.filter(function (x) { return x.id === id; })[0]; return t ? t.name : id || ''; };
  var row = function (k, v) { return '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>'; };
  var succ = model.wbs.filter(function (w) { return (w.deps || []).indexOf(r.id) >= 0; });
  var ev = ((model.actuals || {}).evidence || []).filter(function (x) { return x.id === r.id; })[0];
  var h = [];
  h.push('<div class="dh"><span class="dn">' + esc(r.num) + '</span>' + ed('w', r.id, 'label', 'text', esc(r.label)) + '<button id="d-x" title="Esc">✕</button></div>');
  h.push('<p class="muted">' + esc(L.type[r.type] || r.type) + ' · ' + chipHtml(r.rag) + ' · ' + esc(L.status[r.status]) + ' · ' + r.pct + '%</p><dl>');
  h.push(row(L.cols.ws, ed('w', r.id, 'ws', 'ws', esc(r.ws || ''))));
  if (r.type === 'wricef' || r.fnOwner || r.devOwner) { h.push(row(L.side.F, ed('w', r.id, 'fnOwner', 'owner', esc(name(r.fnOwner))))); h.push(row(L.side.D, ed('w', r.id, 'devOwner', 'owner', esc(name(r.devOwner))))); }
  else h.push(row(L.cols.owner, ed('w', r.id, 'owner', 'owner', esc(name(r.owner)))));
  h.push(row(L.cols.start, leaf ? ed('w', r.id, 'start', 'date', r.start || '') : esc(r.start || '')));
  h.push(row(L.cols.finish, leaf ? ed('w', r.id, 'finish', 'date', r.finish || '') : esc(r.finish || '')));
  if (r.baseStart) h.push(row(L.cols.base, esc(r.baseStart + ' → ' + r.baseFinish) + (r.finish && r.baseFinish && r.finish !== r.baseFinish ? ' <span class="bad">' + (days(r.baseFinish, r.finish) > 0 ? '+' : '') + days(r.baseFinish, r.finish) + E.days + '</span>' : '')));
  if (r.type === 'wricef') {
    h.push(row(E.kind, ed('w', r.id, 'wricef.kind', 'enum:wkind', esc(L.wkind[(r.wricef || {}).kind] || ''))));
    h.push(row(L.cols.stage, ed('w', r.id, 'wricef.stage', 'enum:stage', esc(L.stage[(r.wricef || {}).stage || 'req']))));
    var sd = (r.wricef || {}).stageDates || {}; h.push(row(E.stageDates, STAGES.filter(function (s) { return sd[s]; }).map(function (s) { return esc(L.stage[s]) + ' ' + sd[s]; }).join(' · ') || '—'));
    h.push(row(E.objects, ed('w', r.id, 'wricef.objects', 'list', esc(((r.wricef || {}).objects || []).join(' · ')))));
  } else if (leaf) { h.push(row(L.cols.pct, ed('w', r.id, 'pct', 'pct', r.pct + '%'))); h.push(row(L.cols.status, ed('w', r.id, 'status', 'enum:status', esc(L.status[r.status])))); }
  if (leaf) h.push(row(L.cols.deps, ed('w', r.id, 'deps', 'deps', esc((r.deps || []).map(function (d) { return nums[d] || d; }).join(', ')))));
  h.push(row(E.succ, succ.length ? succ.map(function (w) { return '<a href="#" data-go="' + esc(w.id) + '">' + esc((nums[w.id] || '') + ' ' + w.label) + '</a>'; }).join('<br>') : '—'));
  if (ev && ev.objects && ev.objects.length) h.push(row(E.evidence, esc(ev.found + '/' + ev.objects.length) + (ev.suggest ? ' · ' + esc(L.stage[ev.suggest]) + (ev.behind ? ' <span class="bad">' + esc(L.behind) + '</span>' : '') : '') + (ev.trs && ev.trs.length ? '<br><small>' + esc(ev.trs.slice(0, 6).join(', ')) + (ev.trs.length > 6 ? ' …' : '') + '</small>' : '')));
  h.push(row(E.memo, ed('w', r.id, 'note', 'text', esc(r.note || ''))));
  h.push('</dl>');
  h.push('<div class="dacts"><button data-a="below">↓ ' + esc(E.addBelow) + '</button><button data-a="child">+ ' + esc(E.addChild) + '</button><button data-a="out">← ' + esc(E.outdent) + '</button><button data-a="in">→ ' + esc(E.indent) + '</button><button data-a="up">▲ ' + esc(E.up) + '</button><button data-a="down">▼ ' + esc(E.down) + '</button><button data-a="del" class="del">✕ ' + esc(E.del) + '</button></div>');
  h.push('<p class="muted dk">' + esc(editing ? E.drawerEdit : E.drawerView) + '</p>');
  box.innerHTML = h.join('');
  $('#d-x').onclick = closeDrawer;
  $$('#drawer .dacts button').forEach(function (b) { b.onclick = function () { var id = drawerId, a = b.dataset.a;
    if (a === 'below') addRow(id, false); else if (a === 'child') addRow(id, true); else if (a === 'in') indent(id); else if (a === 'out') outdent(id);
    else if (a === 'up') moveRow(id, -1); else if (a === 'down') moveRow(id, 1); else if (a === 'del') delRows([id]); }; });
}
function chipHtml(r) { return '<span class="rag rag-' + r + '">' + esc(L.rag[r]) + '</span>'; }

// ---------- rows ----------
function newId(base) { for (var n = 1; ; n++) { var id = base + '.N' + n; if (!find('w', id)) return id; } }
function kidsOf(pid) { return model.wbs.filter(function (w) { return (w.parent || '') === (pid || ''); }); }
function relayout() { var out = []; (function walk(pid) { kidsOf(pid).forEach(function (w) { out.push(w); walk(w.id); }); })(''); model.wbs = out; }
function countDesc(r) { if (!r) return 0; var n = 0; kidsOf(r.id).forEach(function (k) { n += 1 + countDesc(k); }); return n; }
function blankRow(parent, src, label) {
  var isW = parent && parent.wricefContainer;
  var n = { id: newId(parent ? parent.id : 'X'), label: label || E.newRow, type: isW ? 'wricef' : parent ? 'task' : 'phase', ws: (src || parent || {}).ws, start: (src || parent || {}).start, finish: (src || parent || {}).finish, status: 'notstarted', pct: 0, deps: [] };
  if (parent) n.parent = parent.id;
  if (isW) {
    n.wricef = { kind: 'R', stage: 'req', stageDates: {}, objects: [], trs: [] };
    var pick = function (role) { var t = model.team.filter(function (t) { return t.role === role && isActive(t, today); }); return (t.filter(function (x) { return x.module === n.ws; })[0] || t.filter(function (x) { return !x.module; })[0] || (role === 'dev' ? t[0] : null) || {}).id; };
    n.fnOwner = pick('module'); n.devOwner = pick('dev');
  }
  return n;
}
function addRow(id, asChild) {
  var r = find('w', id); if (!r) return; snap();
  var n = blankRow(asChild ? r : find('w', r.parent) || null, r);
  if (asChild) { closed[r.id] = false; model.wbs.push(n); } else model.wbs.splice(model.wbs.indexOf(r) + 1 + countDesc(r), 0, n);
  relayout(); current = n.id; picked = {}; picked[n.id] = true;
  if (drawerId) drawerId = n.id;
  draw(function () { openEditor($((drawerId ? '#drawer' : '.wbs') + ' .ed[data-f="w|' + cssq(n.id) + '|label"]')); });
}
function addPhase() { if (!editing) setEditing(true); snap(); var n = blankRow(null, { start: today, finish: addDays(today, 27) }, E.newPhase); model.wbs.push(n); relayout(); current = n.id; draw(function () { var tr = $('.wbs tr.wr[data-id="' + cssq(n.id) + '"]'); if (tr) tr.scrollIntoView({ block: 'center' }); openEditor($('.wbs .ed[data-f="w|' + cssq(n.id) + '|label"]')); }); }
function delRows(list) {
  if (!list.length) return; snap();
  var gone = {}; list.forEach(function (id) { gone[id] = 1; }); var ch = true;
  while (ch) { ch = false; model.wbs.forEach(function (w) { if (w.parent && gone[w.parent] && !gone[w.id]) { gone[w.id] = 1; ch = true; } }); }
  var first = find('w', list[0]);
  model.wbs = model.wbs.filter(function (w) { return !gone[w.id]; });
  model.wbs.forEach(function (w) { if (w.deps) w.deps = w.deps.filter(function (d) { return !gone[d]; }); });
  model.milestones.forEach(function (m) { if (gone[m.phase]) delete m.phase; });
  if (gone[drawerId]) closeDrawer(); picked = {}; current = null;
  draw(); toast(list.length > 1 ? E.deletedN.replace('{n}', Object.keys(gone).length) : E.deleted.replace('{x}', first ? first.label : ''), true);
}
function indent(id) { var r = find('w', id), sib = kidsOf(r.parent), k = sib.indexOf(r); if (k < 1) return; snap(); r.parent = sib[k - 1].id; if (r.type === 'phase') r.type = 'deliverable'; closed[sib[k - 1].id] = false; relayout(); draw(); }
function outdent(id) { var r = find('w', id); if (!r.parent) return; var p = find('w', r.parent); snap(); r.parent = p.parent; if (!r.parent) { delete r.parent; r.type = 'phase'; } model.wbs.splice(model.wbs.indexOf(r), 1); model.wbs.splice(model.wbs.indexOf(p) + 1 + countDesc(p), 0, r); relayout(); draw(); }
function moveRow(id, dir) { var r = find('w', id), sib = kidsOf(r.parent), o = sib[sib.indexOf(r) + dir]; if (!o) return; snap(); var a = model.wbs.indexOf(r), b = model.wbs.indexOf(o); model.wbs[a] = o; model.wbs[b] = r; relayout(); draw(); }
function rowKey(k) { if (!current) return; if (k === 'ArrowRight') indent(current); else if (k === 'ArrowLeft') outdent(current); else if (k === 'ArrowUp') moveRow(current, -1); else if (k === 'ArrowDown') moveRow(current, 1); }
function stepRow(dir) {
  var vis = $$('.wbs tr.wr[data-id]').filter(function (t) { return t.style.display !== 'none'; }).map(function (t) { return t.dataset.id; });
  var i = vis.indexOf(current), n = vis[Math.max(0, Math.min(vis.length - 1, i + dir))]; if (!n) return;
  select(n); if (drawerId) openDrawer(n); var tr = $('.wbs tr.wr[data-id="' + cssq(n) + '"]'); if (tr) tr.scrollIntoView({ block: 'nearest' });
}
function tools() {
  $$('.wbs tr.wr').forEach(function (tr) {
    var id = tr.dataset.id; if (!id) return; var t = $('.rowtools', tr); if (!t || t.childNodes.length) return;
    [['+', E.addChild + ' (Ctrl+Shift+Enter)', function () { addRow(id, true); }], ['↓', E.addBelow + ' (Ctrl+Enter)', function () { addRow(id, false); }],
      ['→', E.indent + ' (Alt+→)', function () { indent(id); }], ['←', E.outdent + ' (Alt+←)', function () { outdent(id); }],
      ['▲', E.up + ' (Alt+↑)', function () { moveRow(id, -1); }], ['▼', E.down + ' (Alt+↓)', function () { moveRow(id, 1); }], ['✕', E.del + ' (Delete)', function () { delRows([id]); }]]
      .forEach(function (b) { var x = document.createElement('button'); x.textContent = b[0]; x.title = b[1]; x.onclick = function (e) { e.stopPropagation(); b[2](); }; t.appendChild(x); });
  });
}
$('#add-ms').onclick = function () { snap(); var n = model.milestones.length + 1; while (find('m', 'MS.N' + n)) n++; model.milestones.push({ id: 'MS.N' + n, label: E.newMs, kind: 'other', base: today, forecast: today, status: 'planned', criteria: [] }); if (!editing) setEditing(true); draw(function () { openEditor($('.ed[data-f="m|MS.N' + n + '|label"]')); }); };
$('#add-kpi').onclick = function () { snap(); model.kpis = model.kpis || []; var n = model.kpis.length + 1; while (find('k', 'K' + n)) n++; model.kpis.push({ id: 'K' + n, label: E.newKpi, group: 'other', dir: 'up', unit: '', target: '', actual: '', history: [] }); if (!editing) setEditing(true); draw(function () { openEditor($('.ed[data-f="k|K' + n + '|label"]')); }); };
$('#add-tm').onclick = function () { snap(); var n = model.team.length + 1; while (find('t', 'T' + n)) n++; model.team.push({ id: 'T' + n, name: E.newTm, role: 'module', from: today }); if (!editing) setEditing(true); draw(function () { openEditor($('.ed[data-f="t|T' + n + '|name"]')); }); };

// ---------- bulk actions on picked rows ----------
function renderBulk() {
  var b = $('#bulk'), list = pickedIds(); if (!b) return;
  if (list.length < 2) { b.classList.remove('on'); return; }
  b.classList.add('on');
  if (!b.dataset.ready) {
    b.innerHTML = '<b id="bk-n"></b><span>' + esc(E.bkShift) + '</span><input id="bk-d" type="number" value="7" style="width:64px"><button id="bk-go">' + esc(E.bkApply) + '</button>'
      + '<select id="bk-st"></select><select id="bk-fn"></select><select id="bk-dev"></select><select id="bk-own"></select><button id="bk-del">' + esc(E.del) + '</button><button id="bk-x">' + esc(E.bkClear) + '</button>';
    b.dataset.ready = '1';
    $('#bk-go').onclick = function () { bulk(function (w) { var n = +$('#bk-d').value || 0; if (w.start) w.start = addDays(w.start, n); if (w.finish) w.finish = addDays(w.finish, n); }, true); };
    [['#bk-st', 'status'], ['#bk-fn', 'fnOwner'], ['#bk-dev', 'devOwner'], ['#bk-own', 'owner']].forEach(function (x) { $(x[0]).onchange = function () { var v = this.value; if (v === '*') return; bulk(function (w) { if (x[1] === 'status' && w.type === 'wricef') return; if (v) w[x[1]] = v; else delete w[x[1]]; if (x[1] === 'status' && v === 'done') w.pct = 100; }); this.value = '*'; }; });
    $('#bk-del').onclick = function () { delRows(pickedIds()); };
    $('#bk-x').onclick = function () { picked = {}; applyView(); renderBulk(); };
  }
  $('#bk-n').textContent = E.bkN.replace('{n}', list.length);
  var opt = function (lab, pairs) { return '<option value="*">' + esc(lab) + '</option>' + pairs.map(function (p) { return '<option value="' + esc(p[0]) + '">' + esc(p[1]) + '</option>'; }).join(''); };
  var team = [['', '—']].concat(model.team.filter(function (t) { return isActive(t, today); }).map(function (t) { return [t.id, t.name]; }));
  $('#bk-st').innerHTML = opt(L.cols.status, Object.keys(L.status).map(function (k) { return [k, L.status[k]]; }));
  $('#bk-fn').innerHTML = opt(L.side.F, team); $('#bk-dev').innerHTML = opt(L.side.D, team); $('#bk-own').innerHTML = opt(L.cols.owner, team);
}
function bulk(fn, dates) {
  var list = pickedIds().map(function (id) { return find('w', id); }).filter(function (w) { return w && !kidsOf(w.id).length; });
  if (!list.length) return; snap(); list.forEach(fn);
  var n = dates ? cascade(list.map(function (w) { return w.id; })) : 0;
  draw(); toast(E.bkDone.replace('{n}', list.length) + (n ? ' · ' + E.shifted.replace('{n}', n) : ''), true);
}

// ---------- Gantt drag: move / resize / progress / link; milestone forecast ----------
var drag = null, tip = null;
function dayShift(px, cell) { var t = cell.closest('table.wbs'); return Math.round(px / cell.getBoundingClientRect().width * (+t.dataset.days || 1)); }
function preview(d) {
  if (drag.mode === 'ms') return { f: addDays(drag.ms.forecast || drag.ms.base, d) };
  var s = drag.row.start, f = drag.row.finish;
  if (drag.mode === 'move') { s = addDays(s, d); f = addDays(f, d); } else if (drag.mode === 'start') { s = addDays(s, d); if (s > f) s = f; } else { f = addDays(f, d); if (f < s) f = s; }
  return { s: s, f: f };
}
// Mouse / pen: Pointer events. Touch: Touch events — a tap opens the row; press and hold (≈0.4 s) starts the drag
// (also outside edit mode: the hold switches it on), and from then on the page does not scroll under the finger.
// Holding near a bar's end resizes it; elsewhere it moves. Dragging into the Gantt's left / right edge scrolls it.
var touch = null;
function wrapOf(el) { return el && el.closest('.wbs-w'); }
document.addEventListener('pointerdown', function (ev) {
  if (ev.button !== 0 || ev.pointerType === 'touch') return;
  var bar = ev.target.closest('.gb[data-drag]'), ms = ev.target.closest('.gms[data-ms]'); if (!bar && !ms) return;
  if (!editing) return;
  startDrag(ev, bar, ms, '');
  if (drag && drag.el.setPointerCapture && drag.mode !== 'link') { try { drag.el.setPointerCapture(ev.pointerId); } catch (x) {} }
});
function startDrag(ev, bar, ms, forced) {
  var cell = (bar || ms).closest('td.gantt'); if (ev.preventDefault) ev.preventDefault();
  var wrap = wrapOf(cell);
  if (bar) {
    var w = find('w', bar.dataset.drag); if (!w || !w.start || !w.finish) return;
    var c = ev.target.classList, mode = forced || (c.contains('hl') ? 'start' : c.contains('hr') ? 'finish' : c.contains('hp') ? 'pct' : c.contains('hc') ? 'link' : 'move');
    if (!picked[w.id] || mode !== 'move') { current = w.id; picked = {}; picked[w.id] = true; applyView(); renderBulk(); }
    drag = { el: bar, cell: cell, wrap: wrap, sx: wrap ? wrap.scrollLeft : 0, x: ev.clientX, y: ev.clientY, mode: mode, row: w, left: parseFloat(bar.style.left), width: parseFloat(bar.style.width), group: mode === 'move' ? pickedIds().filter(function (id) { return id !== w.id; }).map(function (id) { var b = $('.gb[data-drag="' + cssq(id) + '"]'); return b && { el: b, left: parseFloat(b.style.left) }; }).filter(Boolean) : [] };
    if (mode === 'link') { var ln = $('#linkline'); var r = bar.getBoundingClientRect(); drag.x0 = r.right; drag.y0 = r.top + r.height / 2; ln.setAttribute('x1', drag.x0); ln.setAttribute('y1', drag.y0); ln.setAttribute('x2', drag.x0); ln.setAttribute('y2', drag.y0); $('#linksvg').classList.add('on'); }
  } else { var m = find('m', ms.dataset.ms); if (!m) return; drag = { el: ms, cell: cell, wrap: wrap, sx: wrap ? wrap.scrollLeft : 0, x: ev.clientX, mode: 'ms', ms: m, left: parseFloat(ms.style.left), group: [] }; }
  tip = document.createElement('div'); tip.className = 'dragtip'; document.body.appendChild(tip);
  drag.el.classList.add('lift');
}
// Horizontal distance moved, including what the Gantt scrolled meanwhile.
function dragPx(x) { return x - drag.x + (drag.wrap ? drag.wrap.scrollLeft - drag.sx : 0); }
var edgeTimer = null, lastPt = null;
function edgeScroll() {   // keeps scrolling while the finger / pointer rests at an edge
  clearTimeout(edgeTimer); if (!drag || !drag.wrap || !lastPt || drag.mode === 'link' || drag.mode === 'pct') return;
  var r = drag.wrap.getBoundingClientRect(), z = 36, v = 0;
  if (lastPt.x > r.right - z) v = 3; else if (lastPt.x < r.left + 120 && drag.wrap.scrollLeft > 0) v = -3;
  if (!v) return;
  drag.wrap.scrollLeft += v; onMove(lastPt); edgeTimer = setTimeout(edgeScroll, 40);
}
function onMove(ev) {
  if (!drag) return; lastPt = { clientX: ev.clientX, clientY: ev.clientY, x: ev.clientX };
  var px = dragPx(ev.clientX), pct = px / drag.cell.getBoundingClientRect().width * 100;
  tip.style.left = Math.min(ev.clientX + 12, window.innerWidth - 180) + 'px'; tip.style.top = (ev.clientY - 44) + 'px';
  if (drag.mode === 'link') { var ln = $('#linkline'); ln.setAttribute('x2', ev.clientX); ln.setAttribute('y2', ev.clientY); var tg = document.elementFromPoint(ev.clientX, ev.clientY); tg = tg && tg.closest('.gb[data-drag]'); tip.textContent = tg && tg.dataset.drag !== drag.row.id ? E.linkTo.replace('{x}', (nums[tg.dataset.drag] || '') + ' ' + (find('w', tg.dataset.drag) || {}).label) : E.linkHint; return; }
  if (drag.mode === 'pct') { var br = drag.el.getBoundingClientRect(); var p = Math.max(0, Math.min(100, Math.round((ev.clientX - br.left) / br.width * 20) * 5)); drag.pct = p; $('i', drag.el).style.width = p + '%'; var hp = $('.hp', drag.el); if (hp) hp.style.left = p + '%'; tip.textContent = p + '%'; return; }
  var d = dayShift(px, drag.cell), q = preview(d);
  if (drag.mode === 'move' || drag.mode === 'ms') { drag.el.style.left = (drag.left + pct) + '%'; drag.group.forEach(function (g) { g.el.style.left = (g.left + pct) + '%'; }); }
  else if (drag.mode === 'start') { drag.el.style.left = (drag.left + pct) + '%'; drag.el.style.width = Math.max(0.4, drag.width - pct) + '%'; }
  else drag.el.style.width = Math.max(0.4, drag.width + pct) + '%';
  tip.textContent = drag.mode === 'ms' ? q.f : q.s + ' → ' + q.f + ' (' + (days(q.s, q.f) + 1) + E.days + ')' + (drag.group.length ? ' · +' + drag.group.length : '');
  if (!edgeTimer) edgeTimer = setTimeout(function () { edgeTimer = null; edgeScroll(); }, 120);
}
function onUp(ev) {
  clearTimeout(edgeTimer); edgeTimer = null; lastPt = null;
  if (!drag) return; var dd = drag; drag = null; if (dd.el) dd.el.classList.remove('lift'); if (tip) { tip.remove(); tip = null; } $('#linksvg').classList.remove('on');
  if (dd.mode === 'link') {
    var tg = document.elementFromPoint(ev.clientX, ev.clientY); tg = tg && tg.closest('.gb[data-drag]');
    if (!tg || tg.dataset.drag === dd.row.id) { draw(); return; }
    var succ = find('w', tg.dataset.drag);
    if (dependsOn(dd.row.id, succ.id)) { toast(E.cycle, false); draw(); return; }
    snap(); succ.deps = (succ.deps || []).filter(function (x) { return x !== dd.row.id; }).concat([dd.row.id]);
    var n0 = cascade([succ.id]); draw(); toast(E.linked.replace('{a}', nums[dd.row.id]).replace('{b}', nums[succ.id]) + (n0 ? ' · ' + E.shifted.replace('{n}', n0) : ''), true); return;
  }
  if (dd.mode === 'pct') { if (dd.pct == null) { draw(); return; } snap(); dd.row.pct = dd.pct; if (dd.pct >= 100) dd.row.status = 'done'; else if (dd.pct > 0 && dd.row.status === 'notstarted') dd.row.status = 'inprogress'; draw(); return; }
  drag = dd; var d = dayShift(dragPx(ev.clientX), dd.cell); var q = preview(d); drag = null;
  if (!d) { draw(); return; }
  snap();
  if (dd.mode === 'ms') dd.ms.forecast = q.f;
  else {
    var moved = [dd.row.id]; dd.row.start = q.s; dd.row.finish = q.f;
    if (dd.mode === 'move') pickedIds().forEach(function (id) { if (id === dd.row.id) return; var w = find('w', id); if (w && w.start && w.finish && !kidsOf(id).length) { w.start = addDays(w.start, d); w.finish = addDays(w.finish, d); moved.push(id); } });
    var n = cascade(moved);
    toast((dd.mode === 'ms' ? '' : (nums[dd.row.id] || '') + ' ' + q.s + ' → ' + q.f) + (n ? ' · ' + E.shifted.replace('{n}', n) : ''), true);
  }
  draw();
}
document.addEventListener('pointermove', function (ev) { if (ev.pointerType !== 'touch') onMove(ev); });
document.addEventListener('pointerup', function (ev) { if (ev.pointerType !== 'touch') onUp(ev); });

// ---- touch ----
document.addEventListener('touchstart', function (e) {
  if (e.touches.length !== 1) { if (touch) { clearTimeout(touch.timer); touch = null; } return; }
  var t0 = e.touches[0], bar = e.target.closest('.gb[data-drag]'), ms = e.target.closest('.gms[data-ms]'); if (!bar && !ms) return;
  var st = touch = { x: t0.clientX, y: t0.clientY, bar: bar, ms: ms, target: e.target, fired: false };
  (bar || ms).classList.add('press');
  st.timer = setTimeout(function () {
    if (touch !== st) return;
    st.fired = true; (bar || ms).classList.remove('press');
    if (!editing) { editing = true; document.body.classList.add('editing'); $('#edit').textContent = E.done; toast(E.editOn, false); }
    if (navigator.vibrate) navigator.vibrate(20);
    var mode = '';
    if (bar) { var r = bar.getBoundingClientRect(), edge = Math.min(24, r.width / 3); mode = st.x - r.left < edge ? 'start' : r.right - st.x < edge ? 'finish' : 'move'; }
    startDrag({ clientX: st.x, clientY: st.y, target: st.target }, bar, ms, mode);
    if (drag) onMove({ clientX: st.x, clientY: st.y });
  }, 400);
}, { passive: true });
document.addEventListener('touchmove', function (e) {
  if (!touch) return;
  var t = e.touches[0];
  if (!touch.fired) {
    if (Math.abs(t.clientX - touch.x) > 10 || Math.abs(t.clientY - touch.y) > 10) { clearTimeout(touch.timer); (touch.bar || touch.ms).classList.remove('press'); touch = null; }
    return;   // still a scroll
  }
  e.preventDefault(); onMove({ clientX: t.clientX, clientY: t.clientY });
}, { passive: false });
document.addEventListener('touchend', function (e) {
  if (!touch) return; var st = touch; touch = null; clearTimeout(st.timer); (st.bar || st.ms).classList.remove('press');
  if (!st.fired) {   // a tap: open the row (or the milestones tab)
    e.preventDefault();
    if (st.bar) { select(st.bar.dataset.drag); openDrawer(st.bar.dataset.drag); } else if (st.ms) tab('ms');
    return;
  }
  e.preventDefault(); var t = e.changedTouches[0]; onUp({ clientX: t.clientX, clientY: t.clientY });
}, { passive: false });
document.addEventListener('touchcancel', function () { if (touch) { clearTimeout(touch.timer); (touch.bar || touch.ms).classList.remove('press'); touch = null; } if (drag) { var dd = drag; drag = null; if (tip) { tip.remove(); tip = null; } dd.el.classList.remove('lift'); draw(); } });
// No text selection / callout menu on a held bar.
document.addEventListener('contextmenu', function (e) { if (e.target.closest('.gb, .gms')) e.preventDefault(); });

// ---------- copy / paste with Excel ----------
document.addEventListener('copy', function (e) {
  if (/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || '') || !$('#tab-wbs').classList.contains('on')) return;
  var list = pickedIds(); if (!list.length || (window.getSelection && String(window.getSelection()))) return;
  var name = function (id) { var t = model.team.filter(function (x) { return x.id === id; })[0]; return t ? t.name : ''; };
  var lines = list.map(function (id) { return view.byId.get(id); }).filter(Boolean).sort(function (a, b) { return view.rows.indexOf(a) - view.rows.indexOf(b); })
    .map(function (r) { return [r.num, r.label, r.start || '', r.finish || '', name(r.owner || r.fnOwner), name(r.devOwner), r.ws || '', r.pct + '%', L.status[r.status]].join('\t'); });
  e.clipboardData.setData('text/plain', lines.join('\n')); e.preventDefault(); toast(E.copied.replace('{n}', lines.length), false);
});
document.addEventListener('paste', function (e) {
  if (!editing || !current || /INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || '')) return;
  var text = (e.clipboardData || window.clipboardData).getData('text'); if (!text) return;
  var lines = text.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); }); if (!lines.length) return;
  e.preventDefault();
  var r = find('w', current), parent = r.wricefContainer ? r : find('w', r.parent) || null, at = r.wricefContainer ? model.wbs.length : model.wbs.indexOf(r) + 1 + countDesc(r);
  var byName = function (s) { s = String(s || '').trim(); var t = model.team.filter(function (x) { return x.name === s || x.sapUser === s; })[0]; return t && t.id; };
  snap(); var added = [];
  lines.forEach(function (l) {
    var c = l.split('\t'); if (/^\d+(\.\d+)*$/.test((c[0] || '').trim()) && c.length > 1) c.shift();   // a copied row number
    var n = blankRow(parent, r, c[0].trim());
    var s = parseDate(c[1], r.start), f = parseDate(c[2], s || r.start);
    if (s) n.start = s; if (f) n.finish = f < n.start ? n.start : f;
    var o1 = byName(c[3]), o2 = byName(c[4]);
    if (n.type === 'wricef') { if (o1) n.fnOwner = o1; if (o2) n.devOwner = o2; } else if (o1) n.owner = o1;
    if (c[5] && model.workstreams.some(function (w) { return w.code === c[5].trim(); })) n.ws = c[5].trim();
    model.wbs.splice(at++, 0, n); added.push(n.id);
  });
  relayout(); picked = {}; added.forEach(function (id) { picked[id] = true; }); current = added[0];
  draw(); toast(E.pasted.replace('{n}', added.length), true);
});

// ---------- baseline, CSV ----------
function setBaseline() {
  if (!editing) setEditing(true); snap();
  model.wbs.forEach(function (w) { if (w.start && w.finish) { w.baseStart = w.start; w.baseFinish = w.finish; } });
  draw(); toast(E.baselined, true);
}
function exportCsv() {
  var name = function (id) { var t = model.team.filter(function (x) { return x.id === id; })[0]; return t ? t.name : ''; };
  var q = function (s) { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  var head = ['#', L.cols.label, L.cols.type, L.cols.ws, L.cols.owner, L.side.F, L.side.D, L.cols.start, L.cols.finish, L.cols.base + ' ' + L.cols.start, L.cols.base + ' ' + L.cols.finish, L.cols.pct, L.cols.status, L.cols.stage, L.cols.deps, 'RAG', 'id'];
  var rows = view.rows.map(function (r) { return [r.num, r.label, L.type[r.type], r.ws, name(r.owner), name(r.fnOwner), name(r.devOwner), r.start, r.finish, r.baseStart, r.baseFinish, r.pct, L.status[r.status], r.wricef ? L.stage[r.wricef.stage || 'req'] : '', (r.deps || []).map(function (d) { return nums[d] || d; }).join(' '), L.rag[r.rag], r.id]; });
  var csv = '\uFEFF' + [head].concat(rows).map(function (r) { return r.map(q).join(','); }).join('\r\n');
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = (model.project.code || 'project') + '-wbs-' + today + '.csv'; document.body.appendChild(a); a.click(); a.remove();
}

// ---------- command palette (Ctrl+K) ----------
function commands() {
  var c = [];
  Object.keys(L.tabs).forEach(function (t) { c.push({ k: 'tab', label: E.palTab + ' · ' + L.tabs[t], run: function () { tab(t); } }); });
  [[E.palEdit, function () { setEditing(!editing); }], [E.save + ' (Ctrl+S)', save], [E.undo + ' (Ctrl+Z)', doUndo], [E.redo + ' (Ctrl+Y)', doRedo],
    [E.newPhase, addPhase], [E.openAll, function () { closed = {}; tab('wbs'); applyView(); }], [E.closeAll, function () { tab('wbs'); $('#f-close').click(); }],
    [E.toToday, toToday], [E.late, function () { tab('wbs'); $('#f-late').checked = !$('#f-late').checked; filt.late = $('#f-late').checked; applyView(); }],
    [E.changes, function () { tab('wbs'); $('#f-chg').checked = !$('#f-chg').checked; showChanges = $('#f-chg').checked; applyView(); updateState(); }],
    [E.csv, exportCsv], [E.baseline, setBaseline], [E.help + ' (?)', toggleHelp], [E.theme, function () { $('#theme').click(); }], [E.print, function () { window.print(); }]].forEach(function (x) { c.push({ k: 'act', label: x[0], run: x[1] }); });
  view.rows.forEach(function (r) { c.push({ k: 'row', label: r.num + ' ' + r.label, sub: [r.ws, L.status[r.status]].filter(Boolean).join(' · '), run: function () { goRow(r.id); } }); });
  model.milestones.forEach(function (m) { c.push({ k: 'ms', label: '◆ ' + m.label, sub: m.forecast || m.base, run: function () { tab('ms'); } }); });
  model.team.forEach(function (t) { c.push({ k: 'tm', label: '👤 ' + t.name, sub: L.role[t.role] || t.role, run: function () { tab('wbs'); $('#f-owner').value = t.id; filt.owner = t.id; applyView(); } }); });
  return c;
}
var palList = [], palIdx = 0;
function openPalette() { var p = $('#pal'); p.classList.add('on'); var i = $('#pal-q'); i.value = ''; renderPalette(); i.focus(); }
function closePalette() { $('#pal').classList.remove('on'); }
function renderPalette() {
  var q = $('#pal-q').value.toLowerCase().trim(), all = commands();
  palList = (q ? all.filter(function (c) { return (c.label + ' ' + (c.sub || '')).toLowerCase().indexOf(q) >= 0; }) : all.filter(function (c) { return c.k !== 'row'; })).slice(0, 40);
  palIdx = 0;
  $('#pal-l').innerHTML = palList.map(function (c, i) { return '<li data-i="' + i + '" class="' + (i === 0 ? 'on' : '') + '"><span>' + esc(c.label) + '</span><small>' + esc(c.sub || '') + '</small></li>'; }).join('') || '<li class="muted">' + esc(L.none) + '</li>';
}
function palMove(d) { var li = $$('#pal-l li[data-i]'); if (!li.length) return; li[palIdx].classList.remove('on'); palIdx = (palIdx + d + li.length) % li.length; li[palIdx].classList.add('on'); li[palIdx].scrollIntoView({ block: 'nearest' }); }
$('#pal-q').addEventListener('input', renderPalette);
$('#pal-q').addEventListener('keydown', function (e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); var c = palList[palIdx]; closePalette(); if (c) c.run(); } else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
});
$('#pal-l').addEventListener('click', function (e) { var li = e.target.closest('li[data-i]'); if (!li) return; var c = palList[+li.dataset.i]; closePalette(); if (c) c.run(); });
$('#pal').addEventListener('click', function (e) { if (e.target.id === 'pal') closePalette(); });
$('#cmd').onclick = openPalette;
function toggleHelp() { $('#help').classList.toggle('on'); }
$('#help').addEventListener('click', function (e) { if (e.target.id === 'help' || e.target.closest('.hx')) toggleHelp(); });

// ---------- keys ----------
document.addEventListener('keydown', function (e) {
  var typing = /INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || ''), k = e.key, mod = e.ctrlKey || e.metaKey;
  if (mod && k.toLowerCase() === 'k') { e.preventDefault(); $('#pal').classList.contains('on') ? closePalette() : openPalette(); return; }
  if (mod && k.toLowerCase() === 's') { e.preventDefault(); save(); return; }
  if (typing) return;
  if (mod && (k.toLowerCase() === 'y' || (e.shiftKey && k.toLowerCase() === 'z'))) { e.preventDefault(); doRedo(); return; }
  if (mod && k.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
  if (k === '?') { e.preventDefault(); toggleHelp(); return; }
  if (k === 'Escape') { if ($('#help').classList.contains('on')) toggleHelp(); else if (drawerId) closeDrawer(); else if (pickedIds().length > 1) { picked = {}; applyView(); renderBulk(); } return; }
  if (!current || !$('#tab-wbs').classList.contains('on')) return;
  if (k === 'ArrowDown' && !e.altKey && !mod) { e.preventDefault(); stepRow(1); return; }
  if (k === 'ArrowUp' && !e.altKey && !mod) { e.preventDefault(); stepRow(-1); return; }
  if (k === 'ArrowLeft' && !e.altKey && !mod && !closed[current] && kidsOf(current).length) { closed[current] = true; applyView(); return; }
  if (k === 'ArrowRight' && !e.altKey && !mod && closed[current]) { closed[current] = false; applyView(); return; }
  if (!editing) { if (k === 'Enter' || k === 'F2') { e.preventDefault(); setEditing(true); openEditor($('.wbs .ed[data-f="w|' + cssq(current) + '|label"]')); } return; }
  if (e.altKey && /^Arrow/.test(k)) { e.preventDefault(); rowKey(k); return; }
  if (k === 'Enter' && mod) { e.preventDefault(); addRow(current, e.shiftKey); return; }
  if (k === 'Delete') { e.preventDefault(); delRows(pickedIds().length > 1 ? pickedIds() : [current]); return; }
  if (k === 'F2' || k === 'Enter') { e.preventDefault(); openEditor($('.wbs .ed[data-f="w|' + cssq(current) + '|label"]')); }
});
window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = E.unsaved; } });

// ---------- toast ----------
var toastTimer = null;
function toast(msg, withUndo) {
  var t = $('#toast'); t.innerHTML = ''; t.appendChild(document.createTextNode(msg + ' '));
  if (withUndo) { var b = document.createElement('button'); b.textContent = E.undo; b.onclick = function () { doUndo(); t.classList.remove('on'); }; t.appendChild(b); }
  t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, 6000);
}

// ---------- draft ----------
var d0 = load(key);
if (d0) { var dr = $('#draft'); dr.classList.add('on'); $('#resume').onclick = function () { var x = JSON.parse(d0); model = x.model; history = x.history || history; dirty = true; edits = 1; dr.classList.remove('on'); draw(); }; $('#discard').onclick = function () { store(key); dr.classList.remove('on'); }; }

// ---------- save: one revision per editing session; overwrite the chosen file where the browser allows ----------
function nextV() { var last = (history[history.length - 1] || {}).version || DATA.version || '1.0'; var p = String(last).split('.'); return p[0] + '.' + ((+p[1] || 0) + 1); }
function save() { var dlg = $('#save-dlg'); $('#s-author').value = load('sc4sap-pd-author') || ''; var last = history[history.length - 1]; $('#s-note').value = last && last.session === session ? last.note : E.noteDefault; dlg.showModal(); ($('#s-author').value ? $('#s-note') : $('#s-author')).focus(); }
$('#save').onclick = save;
$('#s-cancel').onclick = function () { $('#save-dlg').close(); };
$('#s-ok').onclick = function () {
  var a = $('#s-author').value.trim(); if (!a) { $('#s-author').focus(); return; }
  store('sc4sap-pd-author', a);
  var last = history[history.length - 1], note = $('#s-note').value.trim();
  if (last && last.session === session) { last.author = a; last.note = note; last.date = today; }
  else history = history.concat([{ version: nextV(), date: today, author: a, note: note, session: session }]);
  var v = history[history.length - 1].version;
  $('#project-model').textContent = JSON.stringify({ model: model, version: DATA.version, history: history }).replace(/</g, '\\u003c');
  var wasEditing = editing; document.body.classList.remove('editing'); ['#toast', '#drawer', '#bulk', '#pal', '#help'].forEach(function (s) { $(s).classList.remove('on'); });
  var html = '<!doctype html>\n' + document.documentElement.outerHTML; if (wasEditing) document.body.classList.add('editing'); if (drawerId) $('#drawer').classList.add('on'); renderBulk();
  var name = (model.project.code || 'project') + '-dashboard-v' + v + '-' + model.lang + '-edited.html';
  $('#save-dlg').close();
  var done = function () { dirty = false; edits = 0; savedAt = hhmm(); store(key); updateState(); toast(E.saved, false); };
  var download = function () { var blob = new Blob([html], { type: 'text/html' }), u = URL.createObjectURL(blob), x = document.createElement('a'); x.href = u; x.download = name; document.body.appendChild(x); x.click(); x.remove(); done(); };
  if (fileHandle) fileHandle.createWritable().then(function (w) { return w.write(html).then(function () { return w.close(); }); }).then(done, download);
  else if (window.showSaveFilePicker) window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }] })
    .then(function (h) { fileHandle = h; return h.createWritable(); }).then(function (w) { return w.write(html).then(function () { return w.close(); }); }).then(done, function (e) { if (e && e.name === 'AbortError') return; download(); });
  else download();
};

bindTools();
setMobileView(load('sc4sap-pd-mview') || 'gantt');
if (mq && mq.addEventListener) mq.addEventListener('change', function () { draw(); });
tab(load('sc4sap-pd-tab') || 'sum');
draw();

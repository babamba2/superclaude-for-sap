// sc4sap:cbo-relation-map — in-browser code. Inlined into the page by relmap-page.mjs; reads the model from
// <script id="relmap-data">, the UI strings from <script id="relmap-text"> and the colours from
// <script id="relmap-colors">. No libraries, no network.
(function () {
  'use strict';
  const M = JSON.parse(document.getElementById('relmap-data').textContent);
  const T = JSON.parse(document.getElementById('relmap-text').textContent);
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Number(n).toLocaleString();

  // node row: [name, type, scope, group, degree, bizDegree, parent, desc, usage, includes, std, pkg]
  const N = M.nodes.length;
  const nName = (i) => M.nodes[i][0], nType = (i) => M.types[M.nodes[i][1]], nScope = (i) => M.nodes[i][2];
  const nComm = (i) => M.nodes[i][3], nDeg = (i) => M.nodes[i][4], nBiz = (i) => M.nodes[i][5], nParent = (i) => M.nodes[i][6];
  const nDesc = (i) => (M.nodes[i][7] >= 0 ? M.desc[M.nodes[i][7]] : ''), nUsage = (i) => M.nodes[i][8];
  const nInc = (i) => M.inc[i] || [], nStd = (i) => (M.nodes[i][10] >= 0 ? M.std[M.nodes[i][10]] : []);
  const nPkg = (i) => (M.nodes[i][11] >= 0 ? M.pkgs[M.nodes[i][11]] : '');
  const nId = (i) => nType(i) + ':' + nName(i);
  const out = Array.from({ length: N }, () => []), inn = Array.from({ length: N }, () => []);
  M.edges.forEach((e, k) => { out[e[0]].push(k); inn[e[1]].push(k); });
  const byId = new Map(); for (let i = 0; i < N; i++) byId.set(nId(i), i);
  const byName = new Map(); for (let i = 0; i < N; i++) { const a = byName.get(nName(i)) || []; a.push(i); byName.set(nName(i), a); }
  const kindIx = (k) => M.kinds.indexOf(k);
  const multi = (M.meta.packages || []).length > 1;
  const groupName = (g) => `G${g + 1}${M.comms[g] && M.comms[g].label ? ' · ' + M.comms[g].label : ''}`;

  // relation presets: business = everything but typing; DDIC = the DD* kinds; code = what source states
  const DDIC_KINDS = ['types', 'checks', 'valueTable', 'searchHelp', 'rowType', 'basedOn', 'selects', 'contains'];
  const CODE_KINDS = ['include', 'calls', 'submits', 'starts', 'launches', 'reads', 'writes', 'uses'];
  const PRESETS = {
    business: M.kinds.map((k, i) => (k === 'types' ? -1 : i)).filter((i) => i >= 0),
    ddic: M.kinds.map((k, i) => (DDIC_KINDS.includes(k) ? i : -1)).filter((i) => i >= 0),
    code: M.kinds.map((k, i) => (CODE_KINDS.includes(k) ? i : -1)).filter((i) => i >= 0),
    all: M.kinds.map((_, i) => i),
  };
  const nonTypes = M.edges.length - (M.stats.byKind.types || 0);
  const defaultPreset = nonTypes >= Math.max(20, M.edges.length * 0.05) ? 'business' : 'all';

  // ---------- state ----------
  const S = {
    mode: 'none', center: -1, group: -1, path: null, paths: [], pathIx: 0, target: -1, impact: null,
    depth: 1, dir: 'both', max: 200, pathDir: 'any', colorBy: 'type', preset: defaultPreset,
    kinds: new Set(PRESETS[defaultPreset]), types: new Set(M.types.map((_, i) => i)), bases: new Set([0, 1, 2]),
    usage: new Set([-1, 0, 1, 2, 3]), pkgs: new Set([-1, ...M.pkgs.map((_, i) => i)]),
  };
  const edgeOk = (k) => { const e = M.edges[k]; return S.kinds.has(e[2]) && S.bases.has(e[4]); };
  const nodeOk = (i) => S.types.has(M.nodes[i][1]) && S.usage.has(nUsage(i)) && S.pkgs.has(M.nodes[i][11]);

  // ---------- tabs ----------
  function showTab(name) {
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('section.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + name));
    if (name === 'explore') draw();
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#theme').addEventListener('click', () => {
    const r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    r.dataset.theme = dark ? 'light' : 'dark';
  });

  const usageBadge = (i) => (nUsage(i) >= 0 ? ` <span class="u u${nUsage(i)}">${esc(T.usageShort[M.usage[nUsage(i)]])}</span>` : '');
  const nodeLink = (i, withDesc) => `<a href="#" class="nl" data-n="${i}">${esc(nName(i))}</a> <small>${esc(nType(i))}</small>${usageBadge(i)}${withDesc && nDesc(i) ? ` <small class="desc">${esc(nDesc(i))}</small>` : ''}`;
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-n]');
    if (a) { ev.preventDefault(); focusNode(Number(a.dataset.n)); return; }
    const g = ev.target.closest('[data-g]');
    if (g) { ev.preventDefault(); focusGroup(Number(g.dataset.g)); return; }
    const p = ev.target.closest('[data-path]');
    if (p) { ev.preventDefault(); S.pathIx = Number(p.dataset.path); S.path = S.paths[S.pathIx]; draw(); return; }
    if (ev.target.closest('#impact-show')) { ev.preventDefault(); S.mode = 'impact'; record(true); draw(); }
  });

  // ---------- overview ----------
  function overview() {
    const st = M.stats, meta = M.meta;
    const card = (v, l, cls) => `<div class="card ${cls || ''}"><b>${fmt(v)}</b><span>${esc(l)}</span></div>`;
    const typeRows = Object.entries(st.byType).sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `<tr><td><span class="dot t-${esc(t)}"></span>${esc(t)}</td><td class="r">${fmt(c)}</td><td>${esc(T.typeName[t] || '')}</td></tr>`).join('');
    const kindRows = M.kinds.map((k) => `<tr><td><span class="ln k-${esc(k)}"></span>${esc(k)}</td><td class="r">${fmt(st.byKind[k] || 0)}</td><td>${esc(T.kindName[k] || '')}</td></tr>`).join('');
    const hubRow = (deg) => (i, r) => `<tr><td class="r">${r + 1}</td><td>${nodeLink(i, true)}</td><td class="r">${fmt(deg(i))}</td><td>${nComm(i) >= 0 ? `<a href="#" data-g="${nComm(i)}">G${nComm(i) + 1}</a>` : '–'}</td><td>${multi && nPkg(i) ? esc(nPkg(i)) : nScope(i) ? esc(T.scopeCustom) : esc(T.scopeMember)}</td></tr>`;
    const head = `<thead><tr><th>#</th><th>${esc(T.colObject)}</th><th>${esc(T.colDegree)}</th><th>${esc(T.colGroup)}</th><th>${esc(multi ? T.colPkg : T.colScope)}</th></tr></thead>`;
    const notes = [];
    if (!meta.sourcesParsed) notes.push(T.noteNoSource);
    if (st.droppedEdges) notes.push(T.noteDropped.replace('{n}', fmt(st.droppedEdges)));
    if (st.foldedIncludes) notes.push(T.noteFolded.replace('{n}', fmt(st.foldedIncludes)));
    const usageCards = meta.hasUsage ? `<h3>${esc(T.hUsage)}</h3><div class="cards small">${M.usage.map((u, i) => card(st.usage[u] || 0, T.usageName[u], 'u' + i)).join('')}</div><p class="muted">${esc(T.usageHelp)}</p>` : '';
    $('#tab-overview').innerHTML = `
      <h1>${esc(T.title)} — ${esc(meta.package || '')}</h1>
      <p class="sub muted">${esc([meta.module, meta.system, meta.sapVersion].filter(Boolean).join(' · '))} · ${esc(T.graphBuilt)} ${esc((meta.graphBuiltAt || '').slice(0, 10))}</p>
      ${notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}
      <div class="cards">${card(st.nodes, T.cNodes)}${card(st.members, T.scopeMember)}${card(st.custom, T.scopeCustom)}${card(st.edges, T.cEdges)}${card(st.groups, T.cGroups)}${card(st.isolated, T.cIsolated)}</div>
      <div class="cards small">${card(st.byBasis.ddic, T.basis.ddic)}${card(st.byBasis.source, T.basis.source)}${card(st.byBasis.inferred, T.basis.inferred)}</div>
      <p class="muted">${esc(T.basisHelp)}</p>
      ${usageCards}
      <div class="cols">
        <div><h3>${esc(T.hTypes)}</h3><table><tbody>${typeRows}</tbody></table>
             <h3>${esc(T.hKinds)}</h3><table><tbody>${kindRows}</tbody></table></div>
        <div><h3>${esc(T.hHubs)}</h3><p class="muted">${esc(T.hubsHelp)}</p>
             <table>${head}<tbody>${M.hubs.map(hubRow(nBiz)).join('')}</tbody></table>
             <details class="more"><summary>${esc(T.hTypeHubs)}</summary><p class="muted">${esc(T.typeHubsHelp)}</p>
             <table>${head}<tbody>${M.typeHubs.map(hubRow((i) => nDeg(i) - nBiz(i))).join('')}</tbody></table></details></div>
      </div>`;
  }

  // ---------- groups ----------
  function groups() {
    const rows = M.comms.map((c) => {
      const mix = Object.entries(c.mix).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `${esc(t)} ${fmt(n)}`).join(' · ');
      return `<tr><td><a href="#" data-g="${c.id}">G${c.id + 1}</a></td><td>${esc(c.label || '')}</td><td class="r">${fmt(c.size)}</td><td class="r">${fmt(c.inner)}</td><td>${mix}</td><td>${c.top.slice(0, 6).map((i) => nodeLink(i)).join(', ')}</td></tr>`;
    }).join('');
    const more = M.stats.groups > M.comms.length ? `<p class="muted">${esc(T.groupsMore.replace('{n}', fmt(M.stats.groups - M.comms.length)))}</p>` : '';
    $('#tab-groups').innerHTML = `<h2>${esc(T.hGroups)}</h2><p class="muted">${esc(T.groupsHelp)}</p>
      <table><thead><tr><th>${esc(T.colGroup)}</th><th>${esc(T.colLabel)}</th><th>${esc(T.colSize)}</th><th>${esc(T.colInner)}</th><th>${esc(T.colMix)}</th><th>${esc(T.colTop)}</th></tr></thead><tbody>${rows}</tbody></table>${more}`;
  }

  // ---------- tables: who creates / reads / updates / deletes ----------
  const OP_LETTER = { INSERT: 'C', MODIFY: 'CU', UPDATE: 'U', DELETE: 'D' };
  function crudOf(k) {
    const e = M.edges[k], kind = M.kinds[e[2]];
    if (kind === 'reads') return 'R';
    if (kind !== 'writes') return '';
    const ops = e[5] >= 0 ? M.ops[e[5]].split('/') : [];
    const s = new Set(); for (const o of ops) for (const c of OP_LETTER[o] || 'U') s.add(c);
    return ['C', 'U', 'D'].filter((c) => s.has(c)).join('') || 'U';
  }
  function crud() {
    const kr = kindIx('reads'), kw = kindIx('writes');
    const rows = [];
    for (let i = 0; i < N; i++) {
      const t = nType(i); if (t !== 'TABL' && t !== 'VIEW') continue;
      const users = inn[i].filter((k) => M.edges[k][2] === kr || M.edges[k][2] === kw);
      if (!users.length) continue;
      const w = users.filter((k) => M.edges[k][2] === kw).length;
      rows.push([i, users, w, users.length - w]);
    }
    const sec = $('#tab-crud');
    if (!rows.length) { sec.innerHTML = `<h2>${esc(T.hCrud)}</h2><p class="muted">${esc(T.crudNone)}</p>`; return; }
    rows.sort((a, b) => b[2] - a[2] || b[3] - a[3]);
    const render = (q) => {
      const Q = q.trim().toUpperCase();
      const hit = rows.filter(([i]) => !Q || nName(i).includes(Q) || nDesc(i).toUpperCase().includes(Q));
      $('#crud-body').innerHTML = hit.slice(0, 400).map(([i, users, w, r]) => {
        const byObj = new Map();
        for (const k of users) { const o = M.edges[k][0]; byObj.set(o, (byObj.get(o) || '') + crudOf(k)); }
        const list = [...byObj.entries()].map(([o, s]) => [o, ['C', 'R', 'U', 'D'].filter((c) => s.includes(c)).join('')])
          .sort((a, b) => (b[1].replace('R', '').length - a[1].replace('R', '').length) || nName(a[0]).localeCompare(nName(b[0])));
        return `<tr><td>${nodeLink(i)}<div class="desc">${esc(nDesc(i))}</div></td><td class="r">${fmt(w)}</td><td class="r">${fmt(r)}</td>
          <td><details><summary>${esc(T.crudObjects.replace('{n}', fmt(list.length)))}</summary><ul class="el">${list.map(([o, s]) => `<li><span class="crud">${s.split('').map((c) => `<b class="c-${c}">${c}</b>`).join('')}</span> ${nodeLink(o)}</li>`).join('')}</ul></details></td></tr>`;
      }).join('') + (hit.length > 400 ? `<tr><td colspan="4" class="muted">${esc(T.more.replace('{n}', fmt(hit.length - 400)))}</td></tr>` : '');
    };
    sec.innerHTML = `<h2>${esc(T.hCrud)}</h2><p class="muted">${esc(T.crudHelp)}</p>
      <div class="bar"><input id="crud-q" type="search" placeholder="${esc(T.crudSearch)}"><small>${esc(T.crudLegend)}</small></div>
      <table><thead><tr><th>${esc(T.colTable)}</th><th>${esc(T.colWriters)}</th><th>${esc(T.colReaders)}</th><th>${esc(T.colUsers)}</th></tr></thead><tbody id="crud-body"></tbody></table>`;
    render('');
    $('#crud-q').addEventListener('input', (ev) => render(ev.target.value));
  }

  // ---------- explore: controls ----------
  function controls() {
    const kc = new Map(); M.edges.forEach((e) => kc.set(e[2], (kc.get(e[2]) || 0) + 1));
    const tc = new Map(); M.nodes.forEach((n) => tc.set(n[1], (tc.get(n[1]) || 0) + 1));
    // every option carries a small [?] at its upper right; hovering or focusing it shows what the option means
    const qm = (title, text) => (text ? `<span class="qm" tabindex="0" data-tip="${esc(text)}" data-tip-title="${esc(title)}">?</span>` : '');
    const chk = (cls, i, label, count, on, title, tip) => `<label class="ck"><input type="checkbox" data-${cls}="${i}" ${on ? 'checked' : ''}>${label}${qm(title, tip)} <small>${fmt(count)}</small></label>`;
    const kindBoxes = () => { $('#f-kinds').innerHTML = M.kinds.map((k, i) => chk('k', i, `<span class="ln k-${esc(k)}"></span>${esc(k)}`, kc.get(i) || 0, S.kinds.has(i), k, T.kindDesc[k] || T.kindName[k])).join(''); };
    kindBoxes();
    const typeBoxes = () => { $('#f-types').innerHTML = M.types.map((t, i) => chk('t', i, `<span class="dot t-${esc(t)}"></span>${esc(t)}`, tc.get(i) || 0, S.types.has(i), `${t} — ${T.typeName[t] || ''}`, T.typeDesc[t] || T.typeName[t])).join(''); };
    typeBoxes();
    const baseBoxes = () => { $('#f-bases').innerHTML = M.bases.map((b, i) => chk('b', i, esc(T.basis[b]), M.stats.byBasis[b] || 0, S.bases.has(i), T.basis[b], T.basisDesc[b])).join(''); };
    baseBoxes();
    const uc = new Map(); M.nodes.forEach((n) => uc.set(n[8], (uc.get(n[8]) || 0) + 1));
    const usageBoxes = () => { $('#f-usage').innerHTML = [0, 1, 2, 3, -1].map((u) => chk('u', u, u >= 0 ? `<span class="u u${u}">${esc(T.usageShort[M.usage[u]])}</span> ${esc(T.usageName[M.usage[u]])}` : esc(T.usageNone), uc.get(u) || 0, S.usage.has(u), u >= 0 ? T.usageName[M.usage[u]] : T.usageNone, T.usageDesc[u >= 0 ? M.usage[u] : 'none'])).join(''); };
    if (M.meta.hasUsage) usageBoxes(); else $('#f-usage-row').hidden = true;
    const pc = new Map(); M.nodes.forEach((n) => pc.set(n[11], (pc.get(n[11]) || 0) + 1));
    const pkgBoxes = () => { $('#f-pkgs').innerHTML = [...M.pkgs.map((p, i) => [i, p]), [-1, T.scopeCustom]].map(([i, p]) => chk('p', i, `<span class="dot" style="--c:${pkgColour(i)}"></span>${esc(p)}`, pc.get(i) || 0, S.pkgs.has(i), p, i >= 0 ? T.pkgDesc.replace('{p}', p) : T.pkgOutside)).join(''); };
    if (multi) pkgBoxes(); else { $('#f-pkgs-row').hidden = true; $('#color-by').hidden = true; }

    // select all / clear all per group
    const GROUPS = {
      k: [() => S.kinds, (v) => { S.kinds = v; }, M.kinds.map((_, i) => i), kindBoxes],
      t: [() => S.types, (v) => { S.types = v; }, M.types.map((_, i) => i), typeBoxes],
      b: [() => S.bases, (v) => { S.bases = v; }, M.bases.map((_, i) => i), baseBoxes],
      u: [() => S.usage, (v) => { S.usage = v; }, [-1, 0, 1, 2, 3], usageBoxes],
      p: [() => S.pkgs, (v) => { S.pkgs = v; }, [-1, ...M.pkgs.map((_, i) => i)], pkgBoxes],
    };
    document.querySelectorAll('#filters .an').forEach((el) => {
      el.innerHTML = `<button type="button" data-an="1">${esc(T.allOn)}</button><button type="button" data-an="0">${esc(T.allOff)}</button>`;
    });
    $('#filters').addEventListener('click', (ev) => {
      if (ev.target.closest('.qm')) { ev.preventDefault(); return; } // the [?] explains, it does not toggle
      const b = ev.target.closest('[data-an]'); if (!b) return;
      ev.preventDefault();
      const [, set, all, redraw] = GROUPS[b.closest('.an').dataset.grp];
      set(new Set(b.dataset.an === '1' ? all : []));
      if (b.closest('.an').dataset.grp === 'k') { S.preset = ''; presetBar.querySelectorAll('button').forEach((y) => y.classList.remove('on')); }
      redraw(); refresh();
    });
    const presetBar = $('#presets');
    presetBar.innerHTML = ['business', 'ddic', 'code', 'all'].filter((p) => PRESETS[p].length)
      .map((p) => `<button data-preset="${p}" class="${p === S.preset ? 'on' : ''}" title="${esc(T.presetHelp[p])}">${esc(T.preset[p])}</button>`).join('');
    presetBar.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-preset]'); if (!b) return;
      S.preset = b.dataset.preset; S.kinds = new Set(PRESETS[S.preset]);
      presetBar.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      kindBoxes(); refresh();
    });
    $('#filters').addEventListener('change', (ev) => {
      const x = ev.target;
      if (x.dataset.k !== undefined) { toggle(S.kinds, Number(x.dataset.k), x.checked); S.preset = ''; presetBar.querySelectorAll('button').forEach((y) => y.classList.remove('on')); }
      if (x.dataset.t !== undefined) toggle(S.types, Number(x.dataset.t), x.checked);
      if (x.dataset.b !== undefined) toggle(S.bases, Number(x.dataset.b), x.checked);
      if (x.dataset.u !== undefined) toggle(S.usage, Number(x.dataset.u), x.checked);
      if (x.dataset.p !== undefined) toggle(S.pkgs, Number(x.dataset.p), x.checked);
      refresh();
    });
    for (const [id, key, num] of [['#depth', 'depth', true], ['#dir', 'dir', false], ['#max', 'max', true], ['#path-dir', 'pathDir', false], ['#color-by', 'colorBy', false]]) {
      $(id).addEventListener('change', (ev) => { S[key] = num ? Number(ev.target.value) : ev.target.value; if (key === 'pathDir') findPath(); else refresh(); });
    }
    suggest($('#q'), $('#q-list'), (i) => focusNode(i));
    suggest($('#q2'), $('#q2-list'), (i) => { S.target = i; $('#q2').value = nName(i); findPath(true); });
    $('#path-go').addEventListener('click', () => { const i = resolveName($('#q2').value); if (i >= 0) { S.target = i; findPath(true); } });
    $('#path-clear').addEventListener('click', () => { S.path = null; S.paths = []; S.target = -1; $('#q2').value = ''; if (S.center >= 0) S.mode = 'ego'; record(true); draw(); });
    $('#nav-back').addEventListener('click', () => { if (history.state && history.state.d > 0) history.back(); });
    $('#x-png').addEventListener('click', exportPng);
    $('#x-csv').addEventListener('click', exportCsv);
  }
  const toggle = (set, v, on) => (on ? set.add(v) : set.delete(v));
  (function tips() {
    const box = $('#qtip');
    const show = (el) => {
      box.innerHTML = `${el.dataset.tipTitle ? `<b>${esc(el.dataset.tipTitle)}</b>` : ''}${esc(el.dataset.tip)}`;
      box.hidden = false;
      const r = el.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
      let x = r.right + 6, y = r.top - h - 4;
      if (x + w > innerWidth - 8) x = Math.max(8, r.left - w - 6);
      if (y < 8) y = r.bottom + 4;
      box.style.left = x + 'px'; box.style.top = y + 'px';
    };
    const hide = () => { box.hidden = true; };
    document.addEventListener('mouseover', (ev) => { const el = ev.target.closest('[data-tip]'); if (el) show(el); });
    document.addEventListener('mouseout', (ev) => { if (ev.target.closest('[data-tip]')) hide(); });
    document.addEventListener('focusin', (ev) => { const el = ev.target.closest('[data-tip]'); if (el) show(el); });
    document.addEventListener('focusout', hide);
  })();
  // a filter change keeps the current view: recompute the path / impact on the new filters
  function refresh() { if (S.mode === 'path') findPath(); else { if (S.mode === 'impact') S.impact = impactOf(S.center); draw(); } }

  function resolveName(q) {
    q = q.trim().toUpperCase(); if (!q) return -1;
    if (byId.has(q)) return byId.get(q);
    const hit = byName.get(q); return hit ? hit[0] : -1;
  }
  // names first (prefix, then contained), then descriptions
  function suggest(input, list, pick) {
    let items = [];
    const close = () => { list.innerHTML = ''; list.hidden = true; };
    input.addEventListener('input', () => {
      const raw = input.value.trim(), q = raw.toUpperCase();
      if (q.length < 2) return close();
      const pre = [], sub = [], desc = [];
      for (let i = 0; i < N && pre.length < 30; i++) {
        const nm = nName(i);
        if (nm.startsWith(q)) pre.push(i);
        else if (sub.length < 30 && nm.includes(q)) sub.push(i);
        else if (desc.length < 30 && M.meta.hasDesc && nDesc(i).toUpperCase().includes(q)) desc.push(i);
      }
      items = pre.concat(sub).sort((a, b) => nDeg(b) - nDeg(a)).concat(desc).slice(0, 30);
      list.innerHTML = items.map((i) => `<li data-i="${i}"><span class="dot t-${esc(nType(i))}"></span>${esc(nName(i))} <small>${esc(nType(i))} · ${fmt(nDeg(i))}</small>${nDesc(i) ? `<div class="desc">${esc(nDesc(i))}</div>` : ''}</li>`).join('') || `<li class="muted">${esc(T.noMatch)}</li>`;
      list.hidden = false;
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { const i = items[0] !== undefined && list.hidden === false ? items[0] : resolveName(input.value); if (i >= 0) { close(); pick(i); } }
      if (ev.key === 'Escape') close();
    });
    list.addEventListener('mousedown', (ev) => { const li = ev.target.closest('li[data-i]'); if (li) { ev.preventDefault(); close(); pick(Number(li.dataset.i)); } });
    input.addEventListener('blur', () => setTimeout(close, 150));
  }

  // ---------- view history: every move to another object / group / path is a browser history entry, so the
  // in-page Back button and the browser's back / forward both return to the earlier view ----------
  function viewOf() {
    return { m: S.mode, c: S.center >= 0 ? nId(S.center) : '', g: S.group, t: S.target >= 0 ? nId(S.target) : '', pd: S.pathDir };
  }
  function viewLabel(v) {
    if (!v) return '';
    if (v.m === 'group') return groupName(v.g);
    if (v.m === 'path') return `${(v.c || '').split(':')[1] || ''} → ${(v.t || '').split(':')[1] || ''}`;
    return (v.c || '').split(':')[1] || T.tOverview;
  }
  function hashOf(v) {
    if (v.m === 'group') return '#g=' + (v.g + 1);
    if (v.m === 'path') return '#n=' + encodeURIComponent(v.c) + '&to=' + encodeURIComponent(v.t) + (v.pd === 'out' ? '&dir=out' : '');
    if (v.m === 'impact') return '#n=' + encodeURIComponent(v.c) + '&impact=1';
    return v.c ? '#n=' + encodeURIComponent(v.c) : '#';
  }
  const sameView = (a, b) => a && b && a.m === b.m && a.c === b.c && a.g === b.g && a.t === b.t && (a.m !== 'path' || a.pd === b.pd);
  function record(push) {
    const v = viewOf(), cur = history.state;
    if (push && cur && cur.v && !sameView(cur.v, v)) history.pushState({ v, d: (cur.d || 0) + 1, back: viewLabel(cur.v) }, '', hashOf(v));
    else history.replaceState({ v, d: cur ? cur.d || 0 : 0, back: cur ? cur.back : '' }, '', hashOf(v));
    navUI();
  }
  function navUI() {
    const b = $('#nav-back'), st = history.state;
    if (!b) return;
    const can = Boolean(st && st.d > 0);
    b.disabled = !can;
    b.title = can ? T.navBackTo.replace('{v}', st.back || '') : T.navBackNone;
    b.querySelector('span').textContent = can && st.back ? st.back : '';
  }
  function restore(st) {
    const v = st && st.v;
    if (!v || v.m === 'none') { S.mode = 'none'; S.center = -1; navUI(); showTab('overview'); return; }
    const c = v.c ? byId.get(v.c) : -1, t = v.t ? byId.get(v.t) : -1;
    S.path = null; S.paths = []; S.pathDir = v.pd || 'any'; $('#path-dir').value = S.pathDir;
    if (v.m === 'group') { S.mode = 'group'; S.group = v.g; S.center = -1; navUI(); showTab('explore'); return; }
    if (c === undefined || c < 0) { navUI(); showTab('overview'); return; }
    S.center = c; S.impact = impactOf(c); $('#q').value = nName(c);
    if (v.m === 'path' && t >= 0) { S.target = t; $('#q2').value = nName(t); showTab('explore'); findPath(false); navUI(); return; }
    S.target = -1; $('#q2').value = '';
    S.mode = v.m === 'impact' ? 'impact' : 'ego';
    navUI(); showTab('explore');
  }
  addEventListener('popstate', (ev) => restore(ev.state));

  function focusNode(i, push = true) {
    S.mode = 'ego'; S.center = i; S.path = null; S.paths = []; S.target = -1; $('#q2').value = '';
    S.impact = impactOf(i);
    $('#q').value = nName(i);
    record(push);
    showTab('explore');
  }
  function focusGroup(g, push = true) {
    S.mode = 'group'; S.group = g; S.center = -1; S.path = null; S.paths = [];
    record(push);
    showTab('explore');
  }

  // ---------- explore: which nodes ----------
  function neighbours(i) {
    const res = [];
    if (S.dir !== 'in') for (const k of out[i]) if (edgeOk(k)) res.push([M.edges[k][1], k]);
    if (S.dir !== 'out') for (const k of inn[i]) if (edgeOk(k)) res.push([M.edges[k][0], k]);
    return res;
  }
  function egoSet() {
    const depth = new Map([[S.center, 0]]), order = [S.center];
    let frontier = [S.center], total = 0;
    for (let d = 1; d <= S.depth; d++) {
      const next = [];
      for (const i of frontier) for (const [j] of neighbours(i)) if (!depth.has(j) && nodeOk(j)) { depth.set(j, d); next.push(j); }
      total += next.length;
      next.sort((a, b) => nDeg(b) - nDeg(a));
      for (const j of next) if (order.length < S.max) order.push(j);
      frontier = next;
    }
    return { nodes: order, depth, total: total + 1 };
  }
  function groupSet() {
    const all = []; for (let i = 0; i < N; i++) if (nComm(i) === S.group && nodeOk(i)) all.push(i);
    all.sort((a, b) => nDeg(b) - nDeg(a));
    return { nodes: all.slice(0, S.max), depth: new Map(), total: all.length };
  }
  function impactSet() {
    const im = S.impact || { nodes: [] };
    const list = [S.center, ...im.nodes.filter((x) => x !== S.center && nodeOk(x))];
    const prio = (x) => (nType(x) === 'TRAN' ? 0 : 1);
    const keep = [S.center, ...list.slice(1).sort((a, b) => prio(a) - prio(b) || im.depth.get(a) - im.depth.get(b))].slice(0, S.max);
    return { nodes: keep, depth: im.depth, total: list.length };
  }

  // Shortest paths: BFS (direction ignored, or only along the arrows); up to 3 alternatives, each found with one
  // edge of the first path left out (Yen-like, short and enough for "is there another way").
  function bfsPath(from, to, banned) {
    const prev = new Map([[from, [-1, -1]]]); let q = [from];
    while (q.length) {
      const next = [];
      for (const i of q) {
        const steps = [];
        for (const k of out[i]) if (edgeOk(k) && !banned.has(k)) steps.push([M.edges[k][1], k]);
        if (S.pathDir === 'any') for (const k of inn[i]) if (edgeOk(k) && !banned.has(k)) steps.push([M.edges[k][0], k]);
        for (const [j, k] of steps) {
          if (prev.has(j)) continue;
          prev.set(j, [i, k]);
          if (j === to) {
            const nodes = [], edges = [];
            for (let x = to; x !== -1; x = prev.get(x)[0]) { nodes.unshift(x); const kk = prev.get(x)[1]; if (kk >= 0) edges.unshift(kk); }
            return { nodes, edges };
          }
          next.push(j);
        }
      }
      q = next;
    }
    return null;
  }
  function findPath(push = false) {
    if (S.center < 0 || S.target < 0) return;
    let from = S.center, to = S.target;
    let first = from === to ? { nodes: [from], edges: [] } : bfsPath(from, to, new Set());
    // along the arrows the chain may run the other way (TCode → program → table): try it backwards too
    if (!first && S.pathDir === 'out') { first = bfsPath(to, from, new Set()); if (first) [from, to] = [to, from]; }
    S.mode = 'path'; S.pathIx = 0; S.pathRev = from !== S.center;
    if (!first) { S.paths = []; S.path = { nodes: [], edges: [], none: true }; draw(); return; }
    const found = [first], seen = new Set([first.edges.join(',')]);
    for (const k of first.edges) {
      if (found.length >= 3) break;
      const alt = bfsPath(from, to, new Set([k]));
      if (alt && !seen.has(alt.edges.join(','))) { seen.add(alt.edges.join(',')); found.push(alt); }
    }
    found.sort((a, b) => a.edges.length - b.edges.length);
    S.paths = found; S.path = found[0];
    record(push);
    draw();
  }

  // Impact: what is affected when the object changes — reverse reach. First step over every relation
  // (a data element changes the tables typed with it); further steps over code relations only.
  const CODE_IX = new Set(CODE_KINDS.map(kindIx).filter((i) => i >= 0));
  function impactOf(i) {
    const depth = new Map([[i, 0]]); let q = [i];
    for (let d = 1; d <= 6 && q.length; d++) {
      const next = [];
      for (const x of q) for (const k of inn[x]) {
        const e = M.edges[k];
        if (d > 1 && !CODE_IX.has(e[2])) continue;
        if (!depth.has(e[0])) { depth.set(e[0], d); next.push(e[0]); }
      }
      q = next;
    }
    const nodes = [...depth.keys()].filter((x) => x !== i);
    const tcodes = nodes.filter((x) => nType(x) === 'TRAN');
    const progs = nodes.filter((x) => ['PROG', 'FUNC', 'FUGR', 'CLAS', 'INTF'].includes(nType(x)));
    return { nodes, depth, tcodes, progs };
  }

  // ---------- export ----------
  function download(name, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const fileBase = () => `${(M.meta.package || 'relmap').replace(/[^\w+-]+/g, '_')}-${S.mode === 'group' ? 'G' + (S.group + 1) : S.center >= 0 ? nName(S.center).replace(/[^\w-]+/g, '_') : 'view'}`;
  function exportPng() {
    const src = $('#cv'), c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.fillStyle = G.col.ground || '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0);
    // toDataURL, not toBlob: Chrome defers toBlob callbacks in background tabs
    const bin = atob(c.toDataURL('image/png').split(',')[1]), bytes = new Uint8Array(bin.length);
    for (let n = 0; n < bin.length; n++) bytes[n] = bin.charCodeAt(n);
    download(fileBase() + '.png', new Blob([bytes], { type: 'image/png' }));
  }
  function exportCsv() {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const rows = [['from_type', 'from', 'kind', 'to_type', 'to', 'count', 'basis', 'ops', 'evidence'].join(',')];
    for (const k of G.links) {
      const e = M.edges[k];
      rows.push([nType(e[0]), nName(e[0]), M.kinds[e[2]], nType(e[1]), nName(e[1]), e[3], M.bases[e[4]], e[5] >= 0 ? M.ops[e[5]] : '', M.ev[k]].map(q).join(','));
    }
    download(fileBase() + '.csv', new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  }

  // colours: by object type, or by package when several packages are drawn together
  const PKG_COLOURS = ['#1f6fb2', '#d1495b', '#2e9d4e', '#c47f00', '#8e44ad', '#0f8a8a', '#c2185b', '#6a5acd'];
  function pkgColour(p) { return p < 0 ? '#8a94a0' : PKG_COLOURS[p % PKG_COLOURS.length]; }

  // ---------- explore: the drawing ----------
  // Drawn the way Obsidian draws its graph view (as sc4sap_web's ForceGraph): a canvas, round nodes sized by
  // their links, hairline links, a force layout that settles by itself, the hovered node and its neighbours lit
  // while the rest steps back (lit links in their relation's colour with a dash running from user to used),
  // names that fade in as you zoom, nodes you can drag, a click that centres on the object. Sizes are in screen
  // pixels, so nodes and names stay readable at any zoom. Positions are kept per node across redraws.
  const LINK = 90, REPEL = 7600, SPRING = 0.09, GRAVITY = 0.016, DAMP = 0.6;
  const G = {
    canvas: null, ctx: null, w: 800, h: 520, bodies: new Map(), ids: [], links: [], mid: -1, mid2: -1,
    cam: { x: 0, y: 0, k: 1, tx: 0, ty: 0, tk: 1, e: 0.12 }, energy: 0, hover: -1, drag: null, raf: null,
    col: {}, top: new Set(), sel: -1, moved: false, autoFit: false, lastStep: 0, lastFrame: 0, midAt: 0, reduced: false, deg: new Map(),
  };
  const COLORS = JSON.parse(document.getElementById('relmap-colors').textContent), TYPE_COLOR = COLORS.types, KIND_COLOR = COLORS.kinds;

  function readColours() {
    const css = getComputedStyle(document.documentElement), g = (v, d) => css.getPropertyValue(v).trim() || d;
    G.col = { ink: g('--fg', '#e4eaf0'), muted: g('--muted', '#95a1ae'), ground: g('--canvas', '#121820'), line: g('--line', '#36414d') };
    kick();
  }
  const kick = () => { if (G.raf === null) G.raf = requestAnimationFrame(frame); };

  function setGraph(ids, links, mid, mid2) {
    closeCard();
    const map = G.bodies;
    if (mid >= 0 && mid !== G.mid) {
      G.midAt = performance.now();
      const at = map.get(mid);
      if (at) { const { x: dx, y: dy } = at; for (const b of map.values()) { b.x -= dx; b.y -= dy; } G.cam.x -= dx; G.cam.y -= dy; G.cam.tx = 0; G.cam.ty = 0; }
    }
    G.mid = mid; G.mid2 = mid2; G.ids = ids; G.links = links;
    G.deg = new Map();
    const nb = new Map();
    G.top = new Set();
    for (const k of links) {
      const [a, b] = M.edges[k];
      G.deg.set(a, (G.deg.get(a) || 0) + 1); G.deg.set(b, (G.deg.get(b) || 0) + 1);
      (nb.get(a) || nb.set(a, []).get(a)).push(b); (nb.get(b) || nb.set(b, []).get(b)).push(a);
    }
    G.top = new Set([...G.deg.entries()].filter(([i]) => i !== mid).sort((x, y) => y[1] - x[1]).slice(0, 15).map(([i]) => i));
    const want = new Set(ids);
    const kept = ids.filter((i) => map.has(i)).length / Math.max(1, ids.length);
    for (const i of ids) {
      const body = map.get(i);
      if (body) { body.target = 1; continue; }
      // the centred object starts at the origin (the fit keeps the origin in the middle)
      if (i === mid) { map.set(i, { x: 0, y: 0, vx: 0, vy: 0, a: 0, target: 1, s: 0.2, pinned: false }); continue; }
      const near = (nb.get(i) || []).map((n) => map.get(n)).find(Boolean) || (mid >= 0 ? map.get(mid) : undefined);
      const a = Math.random() * Math.PI * 2, r = near ? 30 + Math.random() * 30 : 120 + Math.random() * 160;
      map.set(i, { x: (near ? near.x : 0) + Math.cos(a) * r, y: (near ? near.y : 0) + Math.sin(a) * r, vx: 0, vy: 0, a: 0, target: 1, s: 0.2, pinned: false });
    }
    for (const [i, b] of map) if (!want.has(i)) b.target = 0;
    G.energy = Math.max(G.energy, kept > 0.6 ? 0.45 : 0.9);
    if (G.reduced) { for (let n = 0; n < 300; n++) step(); fit(mid >= 0); }
    else if (kept <= 0.6 && ids.length) {
      // a new drawing: settle most of the layout before the first frame (a background tab gets ~1 frame a
      // second), then let the rest move on screen; the camera starts framed
      // pairwise repulsion is n²: fewer warm-up steps for big drawings (150 up to 200 nodes, ≥ 40)
      const warm = Math.max(40, Math.round(150 * Math.min(1, 200 / ids.length)));
      for (let n = 0; n < warm; n++) step();
      G.energy = Math.min(G.energy, 0.25);
      const f = fitTarget(mid >= 0); if (f) Object.assign(G.cam, f, { x: f.tx, y: f.ty, k: f.tk });
    }
    G.autoFit = !G.reduced; G.moved = false;
    kick();
  }

  function step() {
    const map = G.bodies, list = G.ids.map((i) => [i, map.get(i)]).filter(([, b]) => b), e = G.energy;
    for (let i = 0; i < list.length; i++) {
      const a = list[i][1];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j][1];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
        if (d2 > 160000) continue;
        const f = REPEL / d2, d = Math.sqrt(d2), fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }
    // a link to a hub pulls less, or the most used objects draw everything into one knot
    for (const k of G.links) {
      const [ia, ib] = M.edges[k], a = map.get(ia), b = map.get(ib);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - LINK) * SPRING) / Math.min(G.deg.get(ia) || 1, G.deg.get(ib) || 1);
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const [i, b] of list) {
      if (b.pinned) { b.vx = 0; b.vy = 0; continue; }
      const g = i === G.mid ? 0.18 : GRAVITY;
      b.vx -= b.x * g; b.vy -= b.y * g; b.vx *= DAMP; b.vy *= DAMP;
      b.x += Math.max(-40, Math.min(40, b.vx)) * (0.3 + e); b.y += Math.max(-40, Math.min(40, b.vy)) * (0.3 + e);
    }
    const dt = Math.min(64, Math.max(4, performance.now() - G.lastStep || 16.7));
    G.lastStep = performance.now();
    G.energy = Math.max(0, e * Math.pow(0.975, dt / 16.7) - 0.001 * (dt / 16.7));
  }

  function fitTarget(onMid) {
    const pts = G.ids.map((i) => G.bodies.get(i)).filter((b) => b && b.target > 0);
    if (!pts.length) return null;
    let x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
    if (onMid) { const rx = Math.max(Math.abs(x0), Math.abs(x1)), ry = Math.max(Math.abs(y0), Math.abs(y1)); [x0, x1, y0, y1] = [-rx, rx, -ry, ry]; }
    const k = Math.min(2, Math.max(0.15, Math.min((G.w - 140) / Math.max(1, x1 - x0), (G.h - 140) / Math.max(1, y1 - y0))));
    return { tx: (x0 + x1) / 2, ty: (y0 + y1) / 2, tk: k };
  }
  function fit(onMid) {
    const f = fitTarget(onMid); if (!f) return;
    Object.assign(G.cam, f, { e: 0.12 });
    if (G.reduced) Object.assign(G.cam, { x: f.tx, y: f.ty, k: f.tk });
    kick();
  }
  function zoom(factor, sx, sy) {
    G.autoFit = false; G.moved = true;
    const c = G.cam, px = sx === undefined ? G.w / 2 : sx, py = sy === undefined ? G.h / 2 : sy;
    const k = Math.min(4, Math.max(0.1, c.tk * factor));
    const wx = c.tx + (px - G.w / 2) / c.tk, wy = c.ty + (py - G.h / 2) / c.tk;
    c.tx = wx - (px - G.w / 2) / k; c.ty = wy - (py - G.h / 2) / k; c.tk = k; c.e = 0.2;
    if (G.reduced) Object.assign(c, { x: c.tx, y: c.ty, k: c.tk });
    kick();
  }
  const toScreen = (b) => ({ x: (b.x - G.cam.x) * G.cam.k + G.w / 2, y: (b.y - G.cam.y) * G.cam.k + G.h / 2 });
  const toWorld = (sx, sy) => ({ x: (sx - G.w / 2) / G.cam.k + G.cam.x, y: (sy - G.h / 2) / G.cam.k + G.cam.y });

  function frame() {
    G.raf = null;
    const ctx = G.ctx; if (!ctx) return;
    if (G.energy > 0.004) step();
    const c = G.cam;
    if (G.autoFit) {
      const f = fitTarget(G.mid >= 0);
      if (f) { const calm = G.energy < 0.15; c.tx = f.tx; c.ty = f.ty; c.tk = calm ? f.tk : Math.min(c.tk, f.tk); c.e = 0.06; if (G.energy < 0.02) G.autoFit = false; }
      else G.autoFit = false;
    }
    const now = performance.now(), fdt = Math.min(64, Math.max(4, now - G.lastFrame || 16.7));
    G.lastFrame = now;
    const ease = G.reduced ? 1 : 1 - Math.pow(1 - c.e, fdt / 16.7);
    c.x += (c.tx - c.x) * ease; c.y += (c.ty - c.y) * ease; c.k += (c.tk - c.k) * ease;

    const hv = G.hover, lit = new Set();
    if (hv >= 0) { lit.add(hv); for (const k of G.links) { const [a, b] = M.edges[k]; if (a === hv) lit.add(b); if (b === hv) lit.add(a); } }
    let easing = false;
    const ek = G.reduced ? 1 : 0.14;
    for (const [i, b] of G.bodies) {
      const d = b.target - b.a;
      if (Math.abs(d) > 0.01) { b.a += d * ek; easing = true; }
      else { b.a = b.target; if (b.target === 0) { G.bodies.delete(i); continue; } }
      const want = b.target === 0 ? 0.4 : i === hv ? 1.45 : lit.has(i) ? 1.12 : 1, ds = want - b.s;
      if (Math.abs(ds) > 0.005) { b.s += ds * (G.reduced ? 1 : 0.2); easing = true; } else b.s = want;
    }

    const { w, h } = G, col = G.col, dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // the ground: a faint dot grid that moves and scales with the camera
    const gap = 32 * c.k;
    if (gap > 9) {
      ctx.globalAlpha = Math.min(0.5, (gap - 9) / 30) * 0.55; ctx.fillStyle = col.line;
      const ox = (((w / 2 - c.x * c.k) % gap) + gap) % gap, oy = (((h / 2 - c.y * c.k) % gap) + gap) % gap;
      for (let x = ox; x < w; x += gap) for (let y = oy; y < h; y += gap) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }
    // links: hairlines; the hovered node's in their relation's colour with a running dash; inferred dashed
    const flow = G.reduced ? 0 : (now / 40) % 1000;
    for (const k of G.links) {
      const e = M.edges[k], a = G.bodies.get(e[0]), b = G.bodies.get(e[1]);
      if (!a || !b) continue;
      const pa = toScreen(a), pb = toScreen(b), on = hv >= 0 && (e[0] === hv || e[1] === hv);
      ctx.globalAlpha = Math.min(a.a, b.a) * (hv >= 0 ? (on ? 0.95 : 0.05) : 0.32);
      ctx.strokeStyle = on ? KIND_COLOR[M.kinds[e[2]]] || col.ink : col.ink;
      ctx.lineWidth = on ? 1.8 : 1;
      if (on) { ctx.setLineDash([6, 5]); ctx.lineDashOffset = -flow; } else ctx.setLineDash(e[4] === 2 ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      if (on) arrow(ctx, pa, pb, rOf(e[1], b, c.k));
    }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;

    // nodes: soft disc in the type colour with a crisp ring, sized by links; the centred object solid ink with
    // a halo; names below the node — always for the centred object, the lit ones and small drawings, else
    // fading in between 0.9x and 1.4x zoom
    const few = G.ids.length <= 40;
    const labelAlpha = few ? 1 : Math.max(0, Math.min(1, (c.k - 0.6) / 0.35));
    const font = getComputedStyle(G.canvas).fontFamily || 'sans-serif';
    const sinceMid = now - G.midAt, halo = !G.reduced && sinceMid < 2400, labels = [];
    for (const [i, b] of G.bodies) {
      const p = toScreen(b);
      if (p.x < -80 || p.y < -80 || p.x > w + 80 || p.y > h + 80) continue;
      const rr = rOf(i, b, c.k), colour = (S.colorBy === 'pkg' ? pkgColour(M.nodes[i][11]) : TYPE_COLOR[nType(i)]) || col.muted;
      const alpha = b.a * (hv >= 0 && !lit.has(i) ? 0.16 : 1) * (nUsage(i) === 2 && i !== hv ? 0.4 : 1), main = i === G.mid || i === G.mid2;
      if (main) {
        if (halo && i === G.mid) {
          const t = (sinceMid % 1200) / 1200;
          ctx.globalAlpha = alpha * (1 - t) * 0.35; ctx.fillStyle = col.ink;
          ctx.beginPath(); ctx.arc(p.x, p.y, rr + 4 + t * 16, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = alpha; ctx.fillStyle = col.ink;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = colour; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr + 3.5, 0, Math.PI * 2); ctx.stroke();
      } else {
        const ext = nScope(i) === 1;
        ctx.globalAlpha = alpha * (i === hv ? 1 : ext ? 0.08 : 0.3); ctx.fillStyle = colour;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = alpha; ctx.strokeStyle = colour; ctx.lineWidth = i === hv ? 2.4 : 1.7;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, rr - 0.8), 0, Math.PI * 2); ctx.stroke();
        if (!ext) { ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.6, rr * 0.38), 0, Math.PI * 2); ctx.fill(); }
      }
      if (i === G.sel) {
        ctx.globalAlpha = b.a; ctx.strokeStyle = col.ink; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(p.x, p.y, rr + 7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      const la = main || lit.has(i) ? 1 : (G.top.has(i) ? 1 : labelAlpha) * (hv >= 0 ? 0.2 : 1);
      if (la > 0.02) {
        const pr = main ? 0 : i === hv ? 1 : lit.has(i) ? 2 : G.top.has(i) ? 3 : 4;
        labels.push([pr, -(G.deg.get(i) || 0), i, p.x, p.y + rr + 6, b.a * la, main]);
      }
    }
    // names in priority order (centred object, hovered, its neighbours, hubs, the rest by links); a name that
    // would overlap one already drawn is skipped — zooming in makes room for more
    labels.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const placed = [];
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
    for (const [pr, , i, x, y, a, main] of labels) {
      ctx.font = `${main || i === G.hover ? 650 : 500} ${main ? 15 : 13}px ${font}`;
      const tw = ctx.measureText(nName(i)).width, th = main ? 18 : 16;
      const r = [x - tw / 2 - 2, y - 1, x + tw / 2 + 2, y + th];
      if (pr > 1 && placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
      placed.push(r);
      ctx.globalAlpha = a; ctx.lineWidth = 4; ctx.strokeStyle = col.ground;
      ctx.strokeText(nName(i), x, y);
      ctx.fillStyle = main || i === G.hover ? col.ink : col.muted;
      ctx.fillText(nName(i), x, y);
    }
    ctx.globalAlpha = 1;
    const moving = G.energy > 0.004 || easing || halo || hv >= 0 || Math.abs(c.tk - c.k) > 0.001 || Math.abs(c.tx - c.x) > 0.1 || Math.abs(c.ty - c.y) > 0.1;
    if (moving || G.drag) G.raf = requestAnimationFrame(frame);
  }
  function rOf(i, b, k) {
    const z = Math.min(1.6, Math.max(0.8, k));
    return ((i === G.mid || i === G.mid2 ? 9 : 4.5) + Math.sqrt(G.deg.get(i) || 0) * 1.6) * z * (b ? b.s : 1);
  }
  function arrow(ctx, pa, pb, r) {
    const dx = pb.x - pa.x, dy = pb.y - pa.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const tx = pb.x - ux * (r + 3), ty = pb.y - uy * (r + 3);
    ctx.setLineDash([]); ctx.beginPath();
    ctx.moveTo(tx, ty); ctx.lineTo(tx - ux * 8 - uy * 4, ty - uy * 8 + ux * 4); ctx.lineTo(tx - ux * 8 + uy * 4, ty - uy * 8 - ux * 4);
    ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); ctx.setLineDash([6, 5]);
  }
  function hit(sx, sy) {
    let best = -1, bestD = 16 * 16;
    for (const [i, b] of G.bodies) {
      if (b.target === 0) continue;
      const p = toScreen(b), d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  (function mount() {
    const wrap = $('#stage'), canvas = $('#cv'), tip = $('#tip');
    G.canvas = canvas; G.ctx = canvas.getContext('2d');
    G.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight, dpr = window.devicePixelRatio || 1;
      if (!w || !h) return;
      G.w = w; G.h = h; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      if (!G.moved && G.ids.length) { if (G.reduced) fit(G.mid >= 0); else G.autoFit = true; }
      kick();
    };
    new ResizeObserver(resize).observe(wrap); resize(); readColours();
    new MutationObserver(readColours).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColours);
    canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); closeCard(); const r = canvas.getBoundingClientRect(); zoom(ev.deltaY > 0 ? 1 / 1.15 : 1.15, ev.clientX - r.left, ev.clientY - r.top); }, { passive: false });
    const local = (ev) => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    canvas.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      const p = local(ev);
      G.drag = { id: hit(p.x, p.y), x: p.x, y: p.y, cx: G.cam.tx, cy: G.cam.ty, moved: false };
      canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener('pointermove', (ev) => {
      const p = local(ev), d = G.drag;
      if (!d) {
        const id = hit(p.x, p.y);
        if (id !== G.hover) {
          G.hover = id; canvas.style.cursor = id >= 0 ? 'pointer' : 'grab';
          if (id >= 0) {
            tip.innerHTML = `<span>${esc(nType(id))}</span> ${esc(nName(id))}${usageBadge(id)} <small>· ${esc(T.colDegree)} ${fmt(nBiz(id))}${nComm(id) >= 0 ? ' · G' + (nComm(id) + 1) : ''}${multi && nPkg(id) ? ' · ' + esc(nPkg(id)) : ''}</small>${nDesc(id) ? `<div class="desc">${esc(nDesc(id))}</div>` : ''}`;
            tip.style.left = p.x + 14 + 'px'; tip.style.top = p.y + 14 + 'px'; tip.hidden = false;
          } else tip.hidden = true;
          kick();
        } else if (id >= 0) { tip.style.left = p.x + 14 + 'px'; tip.style.top = p.y + 14 + 'px'; }
        return;
      }
      if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) < 4) return;
      if (!d.moved) closeCard();
      d.moved = true; G.autoFit = false; G.moved = true;
      if (d.id >= 0) {
        const b = G.bodies.get(d.id);
        if (b) { const wp = toWorld(p.x, p.y); Object.assign(b, { x: wp.x, y: wp.y, pinned: true }); G.energy = Math.max(G.energy, 0.35); }
      } else {
        const c = G.cam; c.tx = d.cx - (p.x - d.x) / c.k; c.ty = d.cy - (p.y - d.y) / c.k; c.x = c.tx; c.y = c.ty;
      }
      kick();
    });
    canvas.addEventListener('pointerup', () => {
      const d = G.drag; G.drag = null;
      if (!d) return;
      if (d.id >= 0) {
        const b = G.bodies.get(d.id); if (b) b.pinned = false;
        if (!d.moved) { tip.hidden = true; G.hover = -1; openCard(d.id); }
      } else if (!d.moved) closeCard();
      kick();
    });
    canvas.addEventListener('pointerleave', () => { if (G.hover >= 0) { G.hover = -1; tip.hidden = true; kick(); } });
    canvas.addEventListener('dblclick', () => fit(false));
    $('#z-in').addEventListener('click', () => { closeCard(); zoom(1.25); });
    $('#z-out').addEventListener('click', () => { closeCard(); zoom(1 / 1.25); });
    $('#z-fit').addEventListener('click', () => fit(false));
  })();


  // ---------- node card: details of a clicked node, with the actions as buttons ----------
  function openCard(i) {
    const card = $('#card'), b = G.bodies.get(i);
    if (!b) return;
    G.sel = i;
    const outK = new Map(), inK = new Map();
    for (const k of out[i]) outK.set(M.edges[k][2], (outK.get(M.edges[k][2]) || 0) + 1);
    for (const k of inn[i]) inK.set(M.edges[k][2], (inK.get(M.edges[k][2]) || 0) + 1);
    const kinds = [...new Set([...outK.keys(), ...inK.keys()])].sort((a, z) => ((outK.get(z) || 0) + (inK.get(z) || 0)) - ((outK.get(a) || 0) + (inK.get(a) || 0)));
    const rel = kinds.slice(0, 8).map((kd) => `<span class="cr"><span class="ln k-${esc(M.kinds[kd])}"></span>${esc(M.kinds[kd])}${outK.get(kd) ? ` <b title="${esc(T.outgoing)}">→${fmt(outK.get(kd))}</b>` : ''}${inK.get(kd) ? ` <b title="${esc(T.incoming)}">←${fmt(inK.get(kd))}</b>` : ''}</span>`).join('');
    const im = impactOf(i);
    const facts = [
      `${esc(T.typeName[nType(i)] || nType(i))}${multi && nPkg(i) ? ' · ' + esc(nPkg(i)) : nScope(i) ? ' · ' + esc(T.scopeCustom) : ''}`,
      `${esc(T.colDegree)} ${fmt(nBiz(i))}${nComm(i) >= 0 ? ` · <a href="#" data-g="${nComm(i)}">${esc(groupName(nComm(i)))}</a>` : ''}`,
    ];
    if (im.tcodes.length || im.progs.length) facts.push(`${esc(T.impact)}: ${esc(T.impactCount.replace('{t}', fmt(im.tcodes.length)).replace('{p}', fmt(im.progs.length)))}`);
    if (nInc(i).length) facts.push(`${esc(T.includes)} ${fmt(nInc(i).length)}`);
    if (nStd(i).length) facts.push(`${esc(T.stdChecks)} ${fmt(nStd(i).length)}`);
    const isCenter = i === S.center;
    card.innerHTML = `<div class="ch"><span class="dot t-${esc(nType(i))}"></span><b>${esc(nName(i))}</b> <small>${esc(nType(i))}</small>${usageBadge(i)}<button type="button" class="cx" data-card="close" aria-label="${esc(T.cardClose)}">×</button></div>
      ${nDesc(i) ? `<p class="desc big">${esc(nDesc(i))}</p>` : ''}
      <p class="cf">${facts.join('<br>')}</p>
      ${rel ? `<div class="crs">${rel}</div>` : `<p class="muted">${esc(T.cardNoRel)}</p>`}
      <div class="cb">
        ${isCenter ? `<span class="muted">${esc(T.cardIsCenter)}</span>` : `<button type="button" class="pri" data-card="focus">${esc(T.cardFocus)}</button>`}
      </div>`;
    card.hidden = false;
    const p = toScreen(b), w = card.offsetWidth, h = card.offsetHeight;
    let x = p.x + 18, y = p.y - 20;
    if (x + w > G.w - 8) x = Math.max(8, p.x - w - 18);
    if (y + h > G.h - 8) y = Math.max(8, G.h - h - 8);
    if (y < 8) y = 8;
    card.style.left = x + 'px'; card.style.top = y + 'px';
    card.dataset.n = '';
    card.dataset.node = i;
    kick();
  }
  function closeCard() {
    const card = document.getElementById('card');
    if (card && !card.hidden) card.hidden = true;
    if (G && G.sel >= 0) { G.sel = -1; kick(); }
  }
  document.getElementById('card').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-card]'); if (!btn) return;
    ev.preventDefault(); ev.stopPropagation();
    const i = Number(document.getElementById('card').dataset.node);
    if (btn.dataset.card === 'close') closeCard();
    else if (btn.dataset.card === 'focus') { closeCard(); focusNode(i); }
  });
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeCard(); });

  function draw() {
    const info = $('#vinfo');
    const empty = (msg) => { info.textContent = msg; setGraph([], [], -1, -1); panel(); };
    if (S.mode === 'none') return empty(T.pickHint);
    let set;
    if (S.mode === 'path') {
      if (S.path.none) return empty(T.noPath.replace('{a}', nName(S.center)).replace('{b}', nName(S.target)));
      set = { nodes: S.path.nodes, total: S.path.nodes.length };
    } else set = S.mode === 'ego' ? egoSet() : S.mode === 'impact' ? impactSet() : groupSet();
    const nodes = set.nodes, inSet = new Set(nodes), pathEdges = S.mode === 'path' ? new Set(S.path.edges) : null;
    const drawn = [];
    for (const v of nodes) for (const k of out[v]) {
      if (!inSet.has(M.edges[k][1]) || M.edges[k][0] === M.edges[k][1]) continue;
      if (pathEdges ? !pathEdges.has(k) : !edgeOk(k)) continue;
      if (S.mode === 'impact' && !(S.impact.depth.get(M.edges[k][0]) > (S.impact.depth.get(M.edges[k][1]) ?? -1))) continue;
      drawn.push(k);
    }
    setGraph(nodes, drawn, S.mode === 'group' ? -1 : S.center, S.mode === 'path' ? S.target : -1);
    const shown = nodes.length;
    const msg = S.mode === 'path' ? T.pathInfo.replace('{a}', nName(S.pathRev ? S.target : S.center)).replace('{b}', nName(S.pathRev ? S.center : S.target)).replace('{n}', S.path.edges.length)
      : S.mode === 'impact' ? T.impactInfo.replace('{what}', nName(S.center))
        : S.mode === 'group' ? T.groupInfo.replace('{what}', groupName(S.group)) : T.viewInfo.replace('{what}', nName(S.center));
    info.textContent = msg.replace('{n}', fmt(shown)).replace('{e}', fmt(drawn.length)) + (set.total > shown ? ' ' + T.capped.replace('{n}', fmt(set.total)) : '');
    panel();
  }

  // ---------- side panel ----------
  function panel() {
    const p = $('#panel');
    if (S.mode === 'group') {
      const c = M.comms[S.group];
      p.innerHTML = `<h3>${esc(groupName(S.group))}</h3><p>${esc(T.colSize)} ${fmt(c.size)} · ${esc(T.colInner)} ${fmt(c.inner)}</p>
        <p>${Object.entries(c.mix).map(([t, n]) => `<span class="dot t-${esc(t)}"></span>${esc(t)} ${fmt(n)}`).join(' &nbsp; ')}</p>
        <h4>${esc(T.colTop)}</h4><ul class="el">${c.top.map((i) => `<li>${nodeLink(i, true)}</li>`).join('')}</ul>`;
      return;
    }
    if (S.center < 0) { p.innerHTML = `<p class="muted">${esc(T.pickHint)}</p>`; return; }
    const i = S.center;
    const facts = [
      `${esc(nType(i))} — ${esc(T.typeName[nType(i)] || '')}`,
      `${multi && nPkg(i) ? esc(T.colPkg) + ' ' + esc(nPkg(i)) : nScope(i) ? esc(T.scopeCustom) : esc(T.scopeMember)} · ${esc(T.colDegree)} ${fmt(nBiz(i))}${nDeg(i) !== nBiz(i) ? ` <small>(${esc(T.withTypes)} ${fmt(nDeg(i))})</small>` : ''}`,
    ];
    if (nComm(i) >= 0) facts.push(`${esc(T.colGroup)} <a href="#" data-g="${nComm(i)}">${esc(groupName(nComm(i)))}</a>`);
    if (nUsage(i) >= 0) facts.push(`${esc(T.hUsage)}${usageBadge(i)} ${esc(T.usageName[M.usage[nUsage(i)]])}`);
    if (nParent(i) >= 0) facts.push(`${esc(T.parent)} ${nodeLink(nParent(i))}`);
    let html = `<h3><span class="dot t-${esc(nType(i))}"></span>${esc(nName(i))}</h3>${nDesc(i) ? `<p class="desc big">${esc(nDesc(i))}</p>` : ''}<p>${facts.join('<br>')}</p>`;
    if (nInc(i).length) html += `<details><summary>${esc(T.includes)} <small>${fmt(nInc(i).length)}</small></summary><p class="mono">${nInc(i).map(esc).join(', ')}</p></details>`;
    if (nStd(i).length) html += `<details><summary>${esc(T.stdChecks)} <small>${fmt(nStd(i).length)}</small></summary><p class="muted">${esc(T.stdChecksHelp)}</p><p class="mono">${nStd(i).map(esc).join(', ')}</p></details>`;
    if (S.mode === 'path' && S.path && !S.path.none) {
      if (S.paths.length > 1) html += `<p class="alts">${S.paths.map((pp, x) => `<a href="#" data-path="${x}" class="${x === S.pathIx ? 'on' : ''}">${esc(T.pathAlt.replace('{n}', x + 1).replace('{s}', pp.edges.length))}</a>`).join(' ')}</p>`;
      html += `<h4>${esc(T.pathSteps)}</h4><ol class="steps">` + S.path.edges.map((k) => {
        const e = M.edges[k];
        return `<li>${nodeLink(e[0])} <b>—${esc(M.kinds[e[2]])}→</b> ${nodeLink(e[1])}${evidence(k, true)}</li>`;
      }).join('') + '</ol>';
    }
    const im = S.impact;
    if (im && im.nodes.length) {
      html += `<h4>${esc(T.impact)} <small>${esc(T.impactCount.replace('{t}', fmt(im.tcodes.length)).replace('{p}', fmt(im.progs.length)))}</small></h4>
        <p class="muted">${esc(T.impactHelp)}</p><p><a href="#" id="impact-show">${esc(T.impactShow)}</a></p>
        ${im.tcodes.length ? `<details ${im.tcodes.length <= 15 ? 'open' : ''}><summary>TRAN <small>${fmt(im.tcodes.length)}</small></summary><ul class="el">${im.tcodes.slice(0, 200).map((x) => `<li>${nodeLink(x, true)}</li>`).join('')}</ul></details>` : ''}`;
    }
    html += edgeList(T.outgoing, out[i], 1) + edgeList(T.incoming, inn[i], 0);
    p.innerHTML = html;
  }
  function evidence(k, withBasis) {
    const e = M.edges[k], head = `${withBasis ? esc(T.basis[M.bases[e[4]]]) + (M.ev[k] ? ' · ' : '') : ''}${esc(M.ev[k] || '')}`;
    const si = M.sn ? M.sn[k] : -1;
    if (si === undefined || si < 0) return head ? `<div class="ev">${head}</div>` : '';
    const [unit, start, line, text] = M.snip[si];
    const body = text.split('\n').map((l, x) => `<span class="${start + x === line ? 'hl' : ''}"><i>${start + x}</i>${esc(l)}</span>`).join('\n');
    return `<details class="ev"><summary>${head}</summary><pre class="snip" title="${esc(unit)}">${body}</pre></details>`;
  }
  function edgeList(title, ks, side) {
    if (!ks.length) return '';
    const byKind = new Map();
    for (const k of ks) { const kd = M.edges[k][2]; (byKind.get(kd) || byKind.set(kd, []).get(kd)).push(k); }
    let html = `<h4>${esc(title)} <small>${fmt(ks.length)}</small></h4>`;
    for (const [kd, list] of [...byKind.entries()].sort((a, b) => a[0] - b[0])) {
      const off = !S.kinds.has(kd);
      html += `<details ${list.length <= 12 && !off ? 'open' : ''}><summary><span class="ln k-${esc(M.kinds[kd])}"></span>${esc(M.kinds[kd])} <small>${fmt(list.length)}${off ? ' · ' + esc(T.hidden) : ''}</small></summary><ul class="el">`;
      for (const k of list.slice(0, 300)) {
        const e = M.edges[k], other = e[side], c = crudOf(k);
        html += `<li>${c && c !== 'R' ? `<span class="crud">${c.split('').map((x) => `<b class="c-${x}">${x}</b>`).join('')}</span> ` : ''}${nodeLink(other)}${e[3] > 1 ? ` <small>×${e[3]}</small>` : ''} <span class="b b${e[4]}">${esc(T.basisShort[M.bases[e[4]]])}</span>${evidence(k, false)}</li>`;
      }
      if (list.length > 300) html += `<li class="muted">${esc(T.more.replace('{n}', fmt(list.length - 300)))}</li>`;
      html += '</ul></details>';
    }
    return html;
  }

  // ---------- boot ----------
  window.__relmap = { S, G }; // read-only peek for checks (console / automation); the page never reads it
  overview(); groups(); crud(); controls();
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('dir') === 'out') { S.pathDir = 'out'; $('#path-dir').value = 'out'; }
  const hn = h.get('n') ? resolveName(h.get('n')) : -1, ht = h.get('to') ? resolveName(h.get('to')) : -1;
  if (history.state && history.state.v) restore(history.state); // a reload keeps the history entries
  else if (hn >= 0) {
    focusNode(hn, false);
    if (ht >= 0) { S.target = ht; $('#q2').value = nName(ht); findPath(false); }
    else if (h.get('impact')) { S.mode = 'impact'; record(false); draw(); }
  } else if (h.get('g')) focusGroup(Number(h.get('g')) - 1, false);
  else { history.replaceState({ v: { m: 'none' }, d: 0, back: '' }, '', location.hash || '#'); navUI(); showTab(['groups', 'crud'].includes(h.get('tab')) ? h.get('tab') : 'overview'); }
})();

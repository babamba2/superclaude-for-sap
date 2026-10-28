// sc4sap:module-to-process — the page's edit mode ("편집" / "Edit" in the top bar).
//
// A consultant corrects the finished process map in the browser, with nothing installed and
// nothing loaded from the network:
//   · click a text to change it (plain text): labels, descriptions, task definition / output / timing,
//     rules, steps, conversion notes, to-be-confirmed items, remarks, open questions, glossary
//   · add or delete list items (rules, steps, conversion, tbd, open questions, glossary rows)
//   · BPH table: delete a row (with everything under it), add a task below an L3 / L4 row
//     (its task sheet is drawn at the next build)
//   · undo every change (Ctrl+Z outside a text field, or the Undo button); autosave to the
//     browser (IndexedDB) with "continue editing" on reopen
//   · "Save" asks for author and change note and downloads the page again with the edited
//     model embedded (<script id="process-model">) and the revision entry recorded;
//     `build-process-doc.mjs --import <file>` reads it back, so the next build keeps the edits.
//
// Every editable element carries data-p="row:<code>|<path>" (or "m|<path>" for model-level
// fields); lists carry data-list with the same syntax. Paths address rows by code, so deleting
// or adding rows never shifts another row's path.

export const LABELS = {
  ko: {
    edit: '편집', done: '편집 종료', save: '저장', undo: '되돌리기', add: '+ 추가', del: '삭제',
    delRow: '이 행과 하위 항목을 삭제할까요?', addTask: '+ Task', newTask: '새 Task', newItem: '내용을 입력하세요',
    hint: '편집 모드: 글자를 클릭해 고칩니다. 목록은 + 추가 / ✕ 로 늘리고 줄입니다. BPH 표에서 행을 지우거나 Task를 추가하면 Task 시트는 다음 빌드(--import) 때 그려집니다.',
    draft: '저장하지 않은 편집이 있습니다', resume: '이어서 편집', discard: '버리기', unsaved: '저장하지 않은 변경이 있습니다.',
    saveTitle: '저장 — 개정 이력', author: '작성자', note: '변경 내용', noteDefault: '편집 모드에서 내용 수정', needAuthor: '작성자를 입력하세요.',
    ok: '저장', cancel: '취소', saved: '저장했습니다. 받은 HTML 파일을 담당 컨설턴트에게 보내 주세요.', pending: '다음 빌드 때 반영',
  },
  en: {
    edit: 'Edit', done: 'Done', save: 'Save', undo: 'Undo', add: '+ Add', del: 'Delete',
    delRow: 'Delete this row and everything under it?', addTask: '+ Task', newTask: 'New task', newItem: 'Type here',
    hint: 'Edit mode: click any text to change it. Lists grow and shrink with + Add / ✕. Rows deleted or tasks added in the BPH table get their task sheets at the next build (--import).',
    draft: 'You have unsaved edits', resume: 'Continue editing', discard: 'Discard', unsaved: 'You have unsaved changes.',
    saveTitle: 'Save — revision', author: 'Author', note: 'Change', noteDefault: 'Edited in edit mode', needAuthor: 'Enter the author.',
    ok: 'Save', cancel: 'Cancel', saved: 'Saved. Send the downloaded HTML file to your consultant.', pending: 'applied at the next build',
  },
  ja: {
    edit: '編集', done: '編集終了', save: '保存', undo: '元に戻す', add: '+ 追加', del: '削除',
    delRow: 'この行と配下を削除しますか？', addTask: '+ タスク', newTask: '新しいタスク', newItem: '内容を入力してください',
    hint: '編集モード: 文字をクリックして修正します。リストは + 追加 / ✕ で増減します。BPH 表で削除・追加した行のタスクシートは次のビルド (--import) で描画されます。',
    draft: '保存していない編集があります', resume: '編集を続ける', discard: '破棄', unsaved: '保存していない変更があります。',
    saveTitle: '保存 — 改訂履歴', author: '作成者', note: '変更内容', noteDefault: '編集モードで修正', needAuthor: '作成者を入力してください。',
    ok: '保存', cancel: 'キャンセル', saved: '保存しました。ダウンロードした HTML を担当コンサルタントに送ってください。', pending: '次のビルドで反映',
  },
};
export const editorLabels = (lang) => LABELS[String(lang || '').slice(0, 2).toLowerCase()] || LABELS.en;

export const EDITOR_STYLE = `
.ed-only{display:none}body.editing .ed-only{display:inline-flex}
.ed-only-cell{display:none}body.editing .ed-only-cell{display:table-cell}
.ed-empty{display:none}body.editing .ed-empty{display:block}body.editing tr.ed-empty{display:table-row}
a.go{text-decoration:none;font-size:12px;margin-left:4px}
body.editing [data-p]{outline:1px dashed #9bb3cc;outline-offset:2px;border-radius:3px;cursor:text;min-width:1.5em;display:inline-block}
body.editing [data-p]:focus{outline:2px solid var(--link);background:var(--bg)}
body.editing [data-p]:empty::before{content:attr(data-ph);color:var(--muted)}
.edx{border:0;background:none;color:var(--k-cbo);cursor:pointer;font-size:12px;padding:0 4px;margin-left:4px}
.edadd{border:1px dashed var(--line);background:var(--bg);color:var(--muted);border-radius:6px;font:inherit;font-size:12px;padding:2px 9px;cursor:pointer;margin:4px 0 8px}
.ed-bar{display:none;position:sticky;top:45px;z-index:4;background:var(--warn-bg);border-bottom:1px solid var(--warn-line);font-size:13px;padding:7px 16px}
body.editing .ed-bar{display:block}
#ed-undo,#ed-save{display:none}body.editing #ed-undo,body.editing #ed-save{display:inline-block}
tr.ed-gone{display:none!important}
.ed-pending{font-size:12px;color:var(--flag);margin-left:6px}
.ed-modal{position:fixed;inset:0;background:rgba(10,20,32,.5);display:flex;align-items:center;justify-content:center;z-index:60}
.ed-modal>div{background:var(--bg);color:var(--fg);border-radius:8px;padding:18px 20px;width:min(420px,92vw)}
.ed-modal h3{margin:0 0 12px;font-size:15px}.ed-modal label{display:block;font-size:12.5px;margin:8px 0 3px;color:var(--muted)}
.ed-modal input,.ed-modal textarea{width:100%;font:inherit;padding:6px 9px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
.ed-modal .btns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.ed-modal button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:6px;padding:5px 12px;cursor:pointer}
.ed-modal button.pri{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.ed-draft{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--accent);color:var(--accent-ink);border-radius:8px;padding:10px 14px;z-index:55;display:flex;gap:10px;align-items:center;font-size:13px}
.ed-draft button{font:inherit;font-size:12.5px;border:1px solid currentColor;background:none;color:inherit;border-radius:6px;padding:3px 10px;cursor:pointer}
@media print{.ed-only,.ed-bar,.edx,.edadd{display:none!important}}
`;

// No ${…} below; String.raw keeps backslashes.
export const EDITOR_SCRIPT = String.raw`
(function(){
  var src = document.getElementById('process-model');
  var EL = JSON.parse(document.getElementById('editor-labels').textContent);
  var DATA = JSON.parse(src.textContent); var M = DATA.model; var VERSION = DATA.version;
  var EDIT = false, dirty = false, undo = [];
  var main = document.querySelector('main');
  var $ = function(s){ return document.querySelector(s); };
  var KEY = 'sc4sap-process-edit:' + location.pathname + ':' + (M.module || '') + ':' + VERSION;

  // ── paths ──
  function rowOf(code){ return (M.rows || []).find(function(r){ return r.code === code; }); }
  function resolve(p, create){
    var i = p.indexOf('|'); var head = p.slice(0, i), rest = p.slice(i + 1).split('.');
    var base = head === 'm' ? M : rowOf(head.slice(4));
    if (!base) return null;
    var o = base;
    for (var k = 0; k < rest.length - 1; k++) {
      var key = rest[k];
      if (o[key] == null) { if (!create) return null; o[key] = /^\d+$/.test(rest[k + 1]) ? [] : {}; }
      o = o[key];
    }
    return { obj: o, key: rest[rest.length - 1] };
  }
  function getP(p){ var r = resolve(p, false); return r ? r.obj[r.key] : undefined; }
  function setP(p, v){ var r = resolve(p, true); if (r) r.obj[r.key] = v; }
  function listAt(p){ var v = getP(p); if (Array.isArray(v)) return v; setP(p, []); return getP(p); }

  // ── undo / autosave ──
  function snap(){ undo.push({ m: JSON.stringify(M), h: main.innerHTML }); if (undo.length > 60) undo.shift(); }
  function touch(){ dirty = true; saveDraft(); }
  function idb(f){ return new Promise(function(res){ try { var q = indexedDB.open('sc4sap-process-map', 1);
    q.onupgradeneeded = function(){ q.result.createObjectStore('drafts'); };
    q.onsuccess = function(){ try { f(q.result.transaction('drafts', 'readwrite').objectStore('drafts'), res); } catch (e) { res(null); } };
    q.onerror = function(){ res(null); }; } catch (e) { res(null); } }); }
  function saveDraft(){ return idb(function(s, r){ var q = s.put({ m: JSON.stringify(M), h: main.innerHTML, at: Date.now() }, KEY); q.onsuccess = function(){ r(true); }; q.onerror = function(){ r(false); }; }); }
  function loadDraft(){ return idb(function(s, r){ var q = s.get(KEY); q.onsuccess = function(){ r(q.result || null); }; q.onerror = function(){ r(null); }; }); }
  function dropDraft(){ return idb(function(s, r){ var q = s.delete(KEY); q.onsuccess = function(){ r(true); }; q.onerror = function(){ r(false); }; }); }
  function doUndo(){ var u = undo.pop(); if (!u) return; M = JSON.parse(u.m); main.innerHTML = u.h; arm(); touch(); }

  // ── edit mode on / off ──
  function arm(){
    document.querySelectorAll('[data-p]').forEach(function(el){
      if (EDIT) { el.setAttribute('contenteditable', 'plaintext-only'); el.setAttribute('spellcheck', 'false'); el.setAttribute('data-ph', EL.newItem); }
      else { el.removeAttribute('contenteditable'); }
    });
  }
  function setEdit(on){ EDIT = on; document.body.classList.toggle('editing', on); $('#ed-edit').textContent = on ? EL.done : EL.edit; arm(); }
  $('#ed-edit').addEventListener('click', function(){ setEdit(!EDIT); });
  $('#ed-undo').addEventListener('click', doUndo);
  document.addEventListener('keydown', function(e){
    if (EDIT && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target.closest && e.target.closest('[contenteditable]'))) { e.preventDefault(); doUndo(); }
    var el = EDIT && e.target.closest && e.target.closest('[data-p]');
    if (el && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
  });

  // ── text fields: written back on blur; every element showing the same path follows ──
  document.addEventListener('focusin', function(e){ var el = EDIT && e.target.closest && e.target.closest('[data-p]'); if (el) el.dataset.o = el.innerText; });
  document.addEventListener('focusout', function(e){
    var el = EDIT && e.target.closest && e.target.closest('[data-p]'); if (!el) return;
    var v = el.innerText.replace(/ /g, ' ').replace(/\s+$/, '');
    if (v === String(el.dataset.o || '').replace(/\s+$/, '')) return;
    var p = el.dataset.p;
    var html = main.innerHTML; var before = JSON.stringify(M);
    setP(p, v);
    document.querySelectorAll('[data-p="' + CSS.escape(p) + '"]').forEach(function(x){ if (x !== el) x.textContent = v; });
    undo.push({ m: before, h: html }); el.dataset.o = v; touch();
  });
  // Typing also writes through at once (a field left without a blur — closing the tab, saving — keeps its text).
  // The undo point stays the state when the field was entered.
  var entry = null;
  document.addEventListener('focusin', function(e){ var el = EDIT && e.target.closest && e.target.closest('[data-p]'); if (el) entry = { el: el, m: JSON.stringify(M), h: main.innerHTML, pushed: false }; });
  document.addEventListener('input', function(e){
    var el = EDIT && e.target.closest && e.target.closest('[data-p]'); if (!el) return;
    var v = el.innerText.replace(/\s+$/, '');
    if (entry && entry.el === el && !entry.pushed) { undo.push({ m: entry.m, h: entry.h }); entry.pushed = true; }
    else if (!entry || entry.el !== el) {
      // No focus event came first: rebuild the undo point with the field's previous text.
      var typed = el.textContent; var old = getP(el.dataset.p);
      el.textContent = old == null ? '' : String(old); snap(); el.textContent = typed;
      entry = { el: el, pushed: true };
    }
    setP(el.dataset.p, v);
    document.querySelectorAll('[data-p="' + CSS.escape(el.dataset.p) + '"]').forEach(function(x){ if (x !== el) x.textContent = v; });
    el.dataset.o = el.innerText; touch();
  });

  // ── lists: + add / ✕ delete ──
  function renumber(ul){
    var base = ul.dataset.list;
    Array.prototype.forEach.call(ul.children, function(li, i){
      if (!li.matches('[data-i]')) return;
      li.dataset.i = i;
      li.querySelectorAll('[data-p]').forEach(function(x){
        var rest = x.dataset.p.slice(base.length + 1).replace(/^\d+/, String(i));
        x.dataset.p = base + '.' + rest;
      });
    });
  }
  function itemTemplate(ul){
    var t = ul.querySelector(':scope > template');
    return t ? t.content.firstElementChild.cloneNode(true) : null;
  }
  document.addEventListener('click', function(e){
    if (!EDIT) return;
    var add = e.target.closest('[data-add]'), del = e.target.closest('[data-del]');
    if (add) {
      var ul = document.querySelector('[data-list="' + CSS.escape(add.dataset.add) + '"]'); if (!ul) return;
      snap();
      var list = listAt(ul.dataset.list); var shape = ul.dataset.shape || 'text';
      var item = shape === 'text' ? '' : shape === 'rule' ? { text: '', estimated: true } : shape === 'step' ? { name: '', method: '' } : shape === 'term' ? { term: '', description: '' } : '';
      list.push(item);
      var li = itemTemplate(ul); if (!li) return;
      ul.appendChild(li); renumber(ul); arm();
      var f = li.querySelector('[data-p]'); if (f) f.focus();
      touch(); return;
    }
    if (del) {
      var li2 = del.closest('[data-i]'); var ul2 = li2 && li2.parentElement; if (!ul2) return;
      snap();
      var l = listAt(ul2.dataset.list); l.splice(Number(li2.dataset.i), 1);
      li2.remove(); renumber(ul2); touch();
    }
  });

  // ── BPH rows: delete with descendants, add a task under L3 / after L4 ──
  function addRowTools(){
    document.querySelectorAll('table.bph tbody tr[data-level]').forEach(function(tr){
      if (tr.querySelector('.ed-only') || tr.classList.contains('var')) return;
      var lv = Number(tr.dataset.level); var td = tr.cells[0];
      var box = document.createElement('span'); box.className = 'ed-only';
      box.innerHTML = '<button class="edx" data-rowdel="1" title="' + EL.del + '">✕</button>' + (lv >= 3 ? '<button class="edx" data-rowadd="1" title="' + EL.addTask + '">＋</button>' : '');
      td.appendChild(box);
    });
  }
  addRowTools();
  document.addEventListener('click', function(e){
    if (!EDIT) return;
    var d = e.target.closest('[data-rowdel]'), a = e.target.closest('[data-rowadd]');
    var tr = (d || a) && (d || a).closest('tr'); if (!tr) return;
    var code = tr.dataset.code;
    if (d) {
      if (!confirm(EL.delRow)) return;
      snap();
      M.rows = M.rows.filter(function(r){ return r.code !== code && r.code.indexOf(code + '.') !== 0; });
      document.querySelectorAll('table.bph tr[data-code]').forEach(function(x){ var c = x.dataset.code; if (c === code || c.indexOf(code + '.') === 0) x.classList.add('ed-gone'); });
      var sec = document.getElementById('p-' + code.replace(/[^A-Za-z0-9]+/g, '-')); if (sec) sec.classList.add('ed-gone'), sec.style.display = 'none';
      touch(); return;
    }
    snap();
    var lv = Number(tr.dataset.level); var parent = lv === 3 ? code : code.split('.').slice(0, 3).join('.');
    var kids = M.rows.filter(function(r){ return r.level === 4 && r.code.indexOf(parent + '.') === 0; });
    var max = kids.reduce(function(n, r){ return Math.max(n, Number(r.code.split('.')[3]) || 0); }, 0);
    var nc = parent + '.' + (max + 1);
    var row = { code: nc, level: 4, label: EL.newTask, kind: 'cbo', system: 'sap', tcodes: [], objects: [], variants: [], usage: 'unknown', task: { tbd: [EL.pending] } };
    var after = M.rows.reduce(function(idx, r, i){ return r.code === parent || r.code.indexOf(parent + '.') === 0 ? i : idx; }, -1);
    M.rows.splice(after + 1, 0, row);
    var last = Array.prototype.filter.call(document.querySelectorAll('table.bph tr[data-code]'), function(x){ var c = x.dataset.code; return c === parent || c.indexOf(parent + '.') === 0; }).pop();
    var nt = document.createElement('tr'); nt.className = 'lv4'; nt.dataset.code = nc; nt.dataset.level = '4'; nt.dataset.kind = 'cbo';
    nt.innerHTML = '<td><code>' + nc + '</code></td><td class="p"><span class="ind" style="padding-left:54px"><span data-p="row:' + nc + '|label">' + EL.newTask + '</span><span class="ed-pending">' + EL.pending + '</span></span></td><td></td><td></td><td></td><td></td><td></td><td></td><td><span data-p="row:' + nc + '|remark"></span></td>';
    last.after(nt); addRowTools(); arm(); nt.querySelector('[data-p]').focus(); touch();
  });

  window.addEventListener('beforeunload', function(e){ if (dirty) { e.preventDefault(); e.returnValue = EL.unsaved; } });

  // ── save: the page again with the edited model and a revision entry ──
  function nextVersion(v){ var p = String(v || '1.0').split('.'); return p[0] + '.' + ((Number(p[1]) || 0) + 1); }
  $('#ed-save').addEventListener('click', function(){
    var m = document.createElement('div'); m.className = 'ed-modal';
    var who = ''; try { who = localStorage.getItem('sc4sap-process-author') || ''; } catch (e) {}
    m.innerHTML = '<div><h3></h3><label></label><input id="ed-who"><label></label><textarea id="ed-note" rows="3"></textarea><div class="btns"><button id="ed-x"></button><button class="pri" id="ed-ok"></button></div></div>';
    m.querySelector('h3').textContent = EL.saveTitle;
    var lb = m.querySelectorAll('label'); lb[0].textContent = EL.author; lb[1].textContent = EL.note;
    m.querySelector('#ed-who').value = who; m.querySelector('#ed-note').value = EL.noteDefault;
    m.querySelector('#ed-x').textContent = EL.cancel; m.querySelector('#ed-ok').textContent = EL.ok;
    document.body.appendChild(m);
    m.querySelector('#ed-x').onclick = function(){ m.remove(); };
    m.querySelector('#ed-ok').onclick = function(){
      var author = m.querySelector('#ed-who').value.trim(); if (!author) { alert(EL.needAuthor); return; }
      try { localStorage.setItem('sc4sap-process-author', author); } catch (e) {}
      var note = m.querySelector('#ed-note').value.trim(); m.remove(); download(author, note);
    };
  });
  // Items added but left empty are dropped from the saved model.
  function prune(){
    var blank = function(x){ return x == null || (typeof x === 'string' ? !x.trim() : !Object.keys(x).some(function(k){ return typeof x[k] === 'string' ? x[k].trim() : k !== 'estimated' && x[k] != null; })); };
    (M.rows || []).forEach(function(r){ var t = r.task; if (!t) return; ['rules', 'steps', 'tbd', 'conversion'].forEach(function(k){ if (Array.isArray(t[k])) t[k] = t[k].filter(function(x){ return !blank(x); }); }); });
    ['openQuestions', 'glossary'].forEach(function(k){ if (Array.isArray(M[k])) M[k] = M[k].filter(function(x){ return !blank(x); }); });
  }
  function download(author, note){
    prune();
    var rev = { version: nextVersion(VERSION), date: new Date().toISOString().slice(0, 10), author: author, note: note };
    var history = (DATA.history || []).filter(function(h){ return h.version !== rev.version; }).concat([rev]);
    var doc = document.documentElement.cloneNode(true);
    doc.querySelector('body').className = '';
    doc.querySelectorAll('.ed-modal,.ed-draft').forEach(function(x){ x.remove(); });
    doc.querySelectorAll('[contenteditable]').forEach(function(x){ x.removeAttribute('contenteditable'); });
    doc.querySelector('#ed-edit').textContent = EL.edit;
    doc.querySelector('#process-model').textContent = JSON.stringify({ model: M, version: VERSION, history: history }).replace(/</g, '\\u003c');
    var blob = new Blob(['<!doctype html>\n' + doc.outerHTML], { type: 'text/html' });
    var a = document.createElement('a'); var base = decodeURIComponent(location.pathname.split('/').pop() || 'process.html');
    a.download = /-edited\.html$/.test(base) ? base : base.replace(/\.html?$/i, '') + '-edited.html';
    a.href = URL.createObjectURL(blob); document.body.appendChild(a); a.click(); a.remove();
    DATA.history = history; dirty = false; undo.length = 0; dropDraft(); alert(EL.saved);
  }

  loadDraft().then(function(d){
    if (!d) return;
    var b = document.createElement('div'); b.className = 'ed-draft';
    b.innerHTML = '<span></span><button data-r="1"></button><button data-r="0"></button>';
    b.querySelector('span').textContent = EL.draft; b.querySelector('[data-r="1"]').textContent = EL.resume; b.querySelector('[data-r="0"]').textContent = EL.discard;
    document.body.appendChild(b);
    b.onclick = function(e){ var r = e.target.dataset.r; if (r == null) return; b.remove();
      if (r === '1') { M = JSON.parse(d.m); main.innerHTML = d.h; dirty = true; setEdit(true); } else dropDraft(); };
  });
})();
`;

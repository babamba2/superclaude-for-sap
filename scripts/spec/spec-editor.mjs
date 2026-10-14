// sc4sap:program-to-spec — the edit mode of an editable spec page ("Edit" in the toolbar).
//
// md-to-html.mjs --editable writes the page; this module is its editor. Modelled
// on the manual's edit mode (scripts/manual/manual-editor.mjs), with nothing
// installed and nothing loaded from the network:
//   · click a heading, paragraph, list item, table cell, callout line, figure
//     caption or fact value to change it; selecting text shows a small toolbar
//     (bold, italic, code, strike, link, "technical detail") — Quill 2 in its
//     bubble theme, inlined from scripts/manual/third_party, mounted only on the
//     field being edited. A field holding markup Quill cannot keep (<sub>, an
//     <a id>, an inline image) is edited as plain contenteditable instead.
//   · add / delete table rows, add / delete / move list items
//   · replace an image (button, or click it and Ctrl+V)
//   · flow figures: the flow editor (flow-editor.mjs), under the same Save
//   · undo (Ctrl+Z or the Undo button), autosave to localStorage (guarded —
//     a sandboxed preview has no storage) with "continue editing" on reopen
//   · leaving the edit mode re-links SAP names and §n references in the changed
//     text (tooltips as before) and gives the tables sort / filter again; the
//     Functional view keeps hiding <span class="tech">.
//   · Save asks for the revision (first save of a session = version +0.1, later
//     saves update it) and downloads <OBJECT>-v<ver>-<lang>-edited.html: the
//     edited page with the revision added to <script id="spec-source">.
//     `md-to-html.mjs --import` turns it back into Markdown (html-to-md.mjs).
//
// Every changed top-level block is marked data-edited; html-to-md rewrites only
// those, so the .md diff shows just what the reader changed.

import { existsSync, readFileSync } from 'node:fs';

const QUILL_DIR = new URL('../manual/third_party/quill-2.0.3/', import.meta.url);
let quill = null;
/** Quill's script and bubble stylesheet, read once on first use ('' when the files are missing). */
export function quillAssets() {
  if (!quill) {
    const read = (name) => {
      const url = new URL(name, QUILL_DIR);
      return existsSync(url) ? readFileSync(url, 'utf8') : '';
    };
    quill = { js: read('quill.min.js'), css: read('quill.bubble.css') };
  }
  return quill;
}

const LABELS = {
  ko: {
    edit: '편집', done: '편집 종료', save: '저장', undo: '되돌리기', help: '도움말', ok: '확인', cancel: '취소',
    saved: '저장했습니다. 받은 HTML 파일을 담당자에게 보내 주세요.', unsaved: '저장하지 않은 변경이 있습니다.',
    draft: '저장하지 않은 편집이 있습니다', resume: '이어서 편집', discard: '버리기',
    addRow: '행 추가', insertRow: '아래에 행 추가', delRow: '행 삭제',
    insertItem: '아래에 항목 추가', delItem: '항목 삭제', up: '위로', down: '아래로', itemPh: '내용을 입력하세요',
    image: '이미지 교체',
    bold: '굵게', italic: '기울임', code: '코드', strike: '취소선', link: '링크', tech: '기술 상세 (기능 관점에서 숨김)', clean: '서식 지우기',
    revTitle: '저장 — 개정 이력', revVersion: '버전', revAuthor: '작성자', revNote: '변경 내용', revDefault: '편집 모드에서 내용 수정',
    revNeedAuthor: '작성자를 입력하세요.',
    revision: '개정 이력', version: '버전', date: '일자', author: '작성자', change: '변경 내용',
    guideTitle: '편집 방법',
    guide: [
      '제목, 문단, 목록, 표 칸, 그림 설명을 클릭하면 바로 고칠 수 있습니다. 글자를 선택하면 굵게 · 기울임 · 코드 · 링크 · T(기술 상세) 버튼이 나타납니다.',
      '표는 행 끝의 ＋ ✕ 로 행을 추가 · 삭제하고, 목록은 ▲ ▼ ＋ ✕ 로 순서 변경 · 추가 · 삭제합니다.',
      '그림 위의 [이미지 교체]를 누르거나, 그림을 클릭한 뒤 Ctrl+V 하면 캡처 화면으로 바꿉니다.',
      '흐름도는 도형을 드래그해 옮기고, 도형 가장자리의 점을 다른 도형으로 끌어 화살표를 잇습니다. 더블클릭하면 글자를 고칩니다.',
      '실수하면 Ctrl+Z(되돌리기). 편집 내용은 브라우저에 자동으로 임시 저장됩니다.',
      '다 고쳤으면 [저장]을 누르고, 받은 파일을 담당 컨설턴트에게 보내 주세요.',
    ],
  },
  en: {
    edit: 'Edit', done: 'Done', save: 'Save', undo: 'Undo', help: 'Help', ok: 'OK', cancel: 'Cancel',
    saved: 'Saved. Send the downloaded HTML file to your contact.', unsaved: 'You have unsaved changes.',
    draft: 'You have unsaved edits', resume: 'Continue editing', discard: 'Discard',
    addRow: 'Add row', insertRow: 'Insert a row below', delRow: 'Delete row',
    insertItem: 'Insert an item below', delItem: 'Delete item', up: 'Up', down: 'Down', itemPh: 'Type the text',
    image: 'Replace image',
    bold: 'Bold', italic: 'Italic', code: 'Code', strike: 'Strikethrough', link: 'Link', tech: 'Technical detail (hidden in the Functional view)', clean: 'Clear formatting',
    revTitle: 'Save — revision history', revVersion: 'Version', revAuthor: 'Author', revNote: 'Changes', revDefault: 'Edited in the page edit mode',
    revNeedAuthor: 'Enter the author.',
    revision: 'Revision History', version: 'Version', date: 'Date', author: 'Author', change: 'Changes',
    guideTitle: 'How to edit',
    guide: [
      'Click a heading, paragraph, list item, table cell or caption to change it. Select text to get Bold · Italic · Code · Link · T (technical detail).',
      'Tables have ＋ ✕ at the end of each row to add and delete rows; lists have ▲ ▼ ＋ ✕ to reorder, add and delete items.',
      'Press [Replace image] on a figure, or click the figure and press Ctrl+V, to use a screenshot instead.',
      'In a flow, drag a shape to move it and drag a dot on its edge onto another shape to draw an arrow. Double-click to change text.',
      'Made a mistake? Ctrl+Z (Undo). Your edits are kept in the browser until you save.',
      'When you are done, press [Save] and send the file to your consultant.',
    ],
  },
  ja: {
    edit: '編集', done: '編集終了', save: '保存', undo: '元に戻す', help: 'ヘルプ', ok: 'OK', cancel: 'キャンセル',
    saved: '保存しました。ダウンロードした HTML を担当者に送ってください。', unsaved: '保存していない変更があります。',
    draft: '保存していない編集があります', resume: '編集を続ける', discard: '破棄',
    addRow: '行を追加', insertRow: '下に行を追加', delRow: '行を削除',
    insertItem: '下に項目を追加', delItem: '項目を削除', up: '上へ', down: '下へ', itemPh: '内容を入力してください',
    image: '画像を置換',
    bold: '太字', italic: '斜体', code: 'コード', strike: '取り消し線', link: 'リンク', tech: '技術詳細（機能観点で非表示）', clean: '書式クリア',
    revTitle: '保存 — 改訂履歴', revVersion: '版', revAuthor: '作成者', revNote: '変更内容', revDefault: '編集モードで内容を修正',
    revNeedAuthor: '作成者を入力してください。',
    revision: '改訂履歴', version: '版', date: '日付', author: '作成者', change: '変更内容',
    guideTitle: '編集方法',
    guide: [
      '見出し、段落、リスト、表のセル、図の説明をクリックするとそのまま修正できます。文字を選択すると 太字・斜体・コード・リンク・T（技術詳細）のボタンが出ます。',
      '表は行末の ＋ ✕ で行を追加・削除し、リストは ▲ ▼ ＋ ✕ で並べ替え・追加・削除します。',
      '図の［画像を置換］を押すか、図をクリックして Ctrl+V で、キャプチャ画面に置き換えます。',
      'フローは図形をドラッグで移動し、図形の縁の点を別の図形へドラッグして矢印をつなぎます。ダブルクリックで文字を修正します。',
      '間違えたら Ctrl+Z（元に戻す）。編集内容はブラウザに自動で一時保存されます。',
      '終わったら［保存］を押し、ダウンロードしたファイルを担当コンサルタントに送ってください。',
    ],
  },
};

export const specEditorLabels = (lang) => LABELS[String(lang || '').slice(0, 2).toLowerCase()] || LABELS.en;

export const SPEC_EDITOR_STYLE = `
.ed-bar{display:inline-flex;gap:8px;align-items:center}
.ed-bar[hidden]{display:none}
.ed-bar .status{color:var(--muted);font-size:.85em;max-width:30vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toolbar button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.toolbar button:disabled{opacity:.45;cursor:default}
figcaption:has(>[data-f]:empty){display:none}
body.editing figcaption:has(>[data-f]:empty){display:block}
body.editing [data-b] [data-f]{outline:1px dashed color-mix(in srgb,var(--accent) 45%,transparent);outline-offset:2px;border-radius:2px;cursor:text;min-width:2em;display:inline-block}
body.editing td [data-f],body.editing th [data-f],body.editing p>[data-f],body.editing figcaption>[data-f]{display:block;min-height:1.4em}
body.editing [data-f]:empty::before{content:attr(data-ph);color:var(--muted);font-style:italic}
body.editing [data-f][contenteditable]:focus{outline:2px solid var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent)}
body.editing .ed-quill{display:inline-block!important;min-width:60%;outline:2px solid var(--accent)!important;background:var(--bg);color:var(--fg);border-radius:4px;vertical-align:top}
body.editing td>.ed-quill,body.editing th>.ed-quill,body.editing p>.ed-quill,body.editing figcaption>.ed-quill,body.editing h1>.ed-quill,body.editing h2>.ed-quill,body.editing h3>.ed-quill,body.editing h4>.ed-quill{display:block!important}
.ed-quill .ql-editor{padding:2px 4px;font:inherit;line-height:inherit;overflow:visible;text-align:inherit}
.ed-quill .ql-editor p{margin:0}
.ed-quill .ql-tooltip{z-index:20;font-size:13px;font-weight:400}
.ed-quill .ql-toolbar button.ql-tech{font:700 13px/1 sans-serif;color:#ccc}
.ed-quill .ql-toolbar button.ql-tech.ql-active{color:#06c}
.ed-rowtools,.ed-addrow,.ed-litools,.ed-imgbtn{display:none}
body.editing td.ed-rowtools,body.editing th.ed-rowtools{display:table-cell;width:1%;white-space:nowrap}
body.editing .ed-addrow{display:inline-block;margin:-.6em 0 1em}
body.editing .ed-litools{display:inline;margin-left:8px;white-space:nowrap}
body.editing .ed-imgbtn{display:inline-block;position:absolute;top:8px;left:8px;z-index:3}
body.editing .ed-rowtools button,body.editing .ed-addrow,body.editing .ed-litools button,body.editing .ed-imgbtn{font:inherit;font-size:12px;padding:1px 7px;border:1px solid var(--line);border-radius:5px;background:var(--bg);color:var(--fg);cursor:pointer;margin-right:3px}
body.editing .ed-litools button{font-size:11px;padding:0 6px}
body.editing figure[data-src]{position:relative}
body.editing figure.ed-current{outline:2px solid var(--accent);outline-offset:4px}
body.editing .tbl-tools{display:none}
.ed-draft{display:flex;gap:8px;align-items:center;padding:8px 20px;background:color-mix(in srgb,var(--warning) 14%,var(--bg));border-bottom:1px solid var(--warning);font-size:.9em}
.ed-draft button,.ed-guide button{font:inherit;font-size:.9em;padding:3px 12px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);cursor:pointer}
.ed-guide{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}
.ed-guide>div{max-width:580px;margin:16px;padding:20px 24px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.25)}
.ed-guide h3{margin:0 0 10px}.ed-guide ol{margin:0 0 16px;padding-left:20px;line-height:1.7}
.ed-guide button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.ed-revrow{display:grid;grid-template-columns:90px 1fr;gap:8px;align-items:start;margin:0 0 10px}
.ed-revrow input,.ed-revrow textarea{font:inherit;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);width:100%}
.ed-reverr{color:var(--caution);margin:0 0 8px;font-size:.9em}
.ed-revbar{display:flex;gap:8px;justify-content:flex-end}
@media print{.ed-bar,.ed-draft,.ed-guide,.ed-rowtools,.ed-addrow,.ed-litools,.ed-imgbtn,#spec-edit-btn{display:none!important}}
`;

// The page script. Plain ES2017 in an IIFE, after the page's own script (it adds
// to the toolbar that script builds). String.raw keeps the backslashes as written;
// it uses no ${…}.
export const SPEC_EDITOR_SCRIPT = String.raw`
(function(){
  var srcEl=document.getElementById('spec-source'),labEl=document.getElementById('spec-editor-labels');
  var main=document.querySelector('main');
  if(!srcEl||!labEl||!main)return;
  var SRC=JSON.parse(srcEl.textContent),L=JSON.parse(labEl.textContent),Q=window.Quill||null;
  var editing=false,dirty=false,ready=false,undoStack=[],active=null,activeQ=null,currentFig=null;
  var flows=[],tables=[],gloss=null,saveTimer=null,rev=null,revRow=null;
  var DRAFT_KEY='sc4sap-spec-draft:'+location.pathname,GUIDE_KEY='sc4sap-spec-guide-seen',AUTHOR_KEY='sc4sap-manual-author';
  var UI='.toolbar,.ed-draft,.ed-guide,.ed-rowtools,.ed-addrow,.ed-litools,.ed-imgbtn,.fe-tools,.flow-edit-btn,.fe-label,.fe-bar,.tbl-tools,button.fold,pre>button.copy,.lightbox,.ql-tooltip,.ev-tip';

  function store(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}return null;}
  function arr(x){return Array.prototype.slice.call(x||[]);}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function button(label,fn,title){var b=el('button',null,label);b.type='button';if(title)b.title=title;b.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();fn();});return b;}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function assign(a,b){var o={},k;for(k in a)o[k]=a[k];for(k in b)o[k]=b[k];return o;}
  function blockOf(n){return n.closest('[data-b]');}
  function isField(f){return !!(f&&f.matches('[data-f]')&&blockOf(f)&&!f.closest('[data-rev]'));}
  function newField(){return '<span data-f="" data-ph="'+esc(L.itemPh)+'"></span>';}

  // ── dirty marks: a changed top-level block (and fact row) is rewritten by html-to-md ──
  function touch(node){
    var targets=[blockOf(node),node.closest('[data-fi]')].filter(Boolean);
    var before=targets.map(function(t){return t.hasAttribute('data-edited');});
    targets.forEach(function(t){t.setAttribute('data-edited','');});
    mark();
    return function(){targets.forEach(function(t,i){if(!before[i])t.removeAttribute('data-edited');});};
  }
  function mark(){dirty=true;clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,1500);}
  function pushUndo(fn){undoStack.push(fn);if(undoStack.length>200)undoStack.shift();refreshBar();}
  function undo(){if(active)unmount();var fn=undoStack.pop();if(fn){fn();mark();}refreshBar();}

  // ── field HTML <-> Quill delta (bold, italic, code, strike, link, tech) ──
  function toDelta(node){
    var ops=[],ok=true;
    function put(t,a){if(!t)return;var o={insert:t};if(Object.keys(a).length)o.attributes=a;ops.push(o);}
    function walk(n,a){
      arr(n.childNodes).forEach(function(c){
        if(!ok)return;
        if(c.nodeType===3){put(c.nodeValue.replace(/\s*\n\s*/g,' '),a);return;}
        if(c.nodeType!==1)return;
        var t=c.tagName,cl=c.classList;
        if(t==='BUTTON'||t==='SCRIPT'||cl.contains('ref-target')||cl.contains('hash'))return;
        if(t==='BR'){put('\n',{});return;}
        if(t==='STRONG'||t==='B')return walk(c,assign(a,{bold:true}));
        if(t==='EM'||t==='I')return walk(c,assign(a,{italic:true}));
        if(t==='DEL'||t==='S'||t==='STRIKE')return walk(c,assign(a,{strike:true}));
        if(t==='CODE')return walk(c,assign(a,{code:true}));
        if(t==='A'&&(cl.contains('xref')||cl.contains('secref')))return walk(c,a);
        if(t==='A'&&c.hasAttribute('href'))return walk(c,assign(a,{link:c.getAttribute('href')}));
        if(t==='SPAN'&&cl.contains('tech'))return walk(c,assign(a,{tech:true}));
        if(t==='SPAN'&&!c.attributes.length)return walk(c,a);
        ok=false; // <sub>, <kbd>, <a id>, an image …: Quill would drop it
      });
    }
    walk(node,{});
    return ok?{ops:ops}:null;
  }
  function fromDelta(d){
    var segs=[];
    d.ops.forEach(function(op){if(typeof op.insert==='string')segs.push({t:op.insert,a:op.attributes||{}});});
    if(segs.length)segs[segs.length-1].t=segs[segs.length-1].t.replace(/\n$/,'');
    function one(s){
      var h=esc(s.t).replace(/\n/g,'<br>'),a=s.a;if(!h)return '';
      if(a.code)h='<code>'+h+'</code>';if(a.strike)h='<del>'+h+'</del>';
      if(a.italic)h='<em>'+h+'</em>';if(a.bold)h='<strong>'+h+'</strong>';
      return h;
    }
    var html='',i=0;
    while(i<segs.length){ // runs of the same tech span, and inside them of the same link
      var tech=!!segs[i].a.tech,inner='',group=[];
      while(i<segs.length&&!!segs[i].a.tech===tech)group.push(segs[i++]);
      for(var j=0;j<group.length;){
        var link=group[j].a.link||'',h='';
        while(j<group.length&&(group[j].a.link||'')===link)h+=one(group[j++]);
        inner+=link&&h?'<a href="'+esc(link)+'">'+h+'</a>':h;
      }
      html+=tech&&inner?'<span class="tech">'+inner+'</span>':inner;
    }
    return html;
  }

  // ── fields: Quill on the field being edited; contenteditable without Quill or for rich markup ──
  if(Q){
    var Inline=Q.import('blots/inline');
    class TechBlot extends Inline{}
    TechBlot.blotName='tech';TechBlot.tagName='SPAN';TechBlot.className='tech';
    Q.register(TechBlot,true);
  }
  function labelToolbar(f){
    [['bold',L.bold],['italic',L.italic],['code',L.code],['strike',L.strike],['link',L.link],['tech',L.tech],['clean',L.clean]].forEach(function(p){
      var b=f.querySelector('.ql-'+p[0]);if(b)b.title=p[1];
    });
    var t=f.querySelector('.ql-tech');if(t)t.textContent='T';
  }
  function mount(f){
    if(active===f)return;
    if(active)unmount();
    var before=f.innerHTML,d=Q?toDelta(f):null;
    active=f;f._before=before;activeQ=null;
    if(!d){f.setAttribute('contenteditable','true');f.focus();return;}
    f.innerHTML='';f.classList.add('ed-quill');
    var q=new Q(f,{theme:'bubble',formats:['bold','italic','code','strike','link','tech'],
      modules:{toolbar:[['bold','italic','code','strike'],['link','tech'],['clean']]}});
    labelToolbar(f);
    q.setContents(d,'silent');
    f._d0=JSON.stringify(q.getContents());
    q.on('text-change',function(){mark();});
    q.focus();q.setSelection(q.getLength(),0,'silent');
    activeQ=q;
  }
  function unmount(){
    var f=active,q=activeQ;if(!f)return;
    active=null;activeQ=null;
    var before=f._before,changed;
    if(q){
      changed=JSON.stringify(q.getContents())!==f._d0;
      var html=fromDelta(q.getContents());
      f.classList.remove('ed-quill','ql-container','ql-bubble','ql-disabled');
      if(!f.className)f.removeAttribute('class');
      f.innerHTML=changed?html:before; // unchanged keeps its links and tooltips
    }else{
      f.removeAttribute('contenteditable');changed=f.innerHTML!==before;
    }
    if(!changed)return;
    f._changed=true;
    var restore=touch(f);
    pushUndo(function(){f.innerHTML=before;restore();});
  }
  /** The text of the field being edited, as the saved page would hold it. */
  function liveHtml(f){return f===active&&activeQ?fromDelta(activeQ.getContents()):f.innerHTML;}

  document.addEventListener('mousedown',function(ev){
    if(!editing)return;
    var t=ev.target;if(!t||!t.closest)return;
    if(t.closest('.ed-guide,.toolbar,.ed-rowtools,.ed-litools,.ed-addrow,.ed-imgbtn,.fe-tools,.fe-label'))return;
    var fig=t.closest('figure[data-src]');if(fig)selectFig(fig);
    if(active&&active.contains(t))return;
    var f=t.closest('[data-f]');
    if(active)unmount();
    if(isField(f)){ev.preventDefault();mount(f);}
  });
  // While editing, a click on an image selects it (no zoom) and links inside fields do not navigate.
  document.addEventListener('click',function(ev){
    if(!editing)return;
    var t=ev.target;if(!t||!t.closest)return;
    if(t.tagName==='IMG'&&main.contains(t)){ev.stopPropagation();ev.preventDefault();}
    else if(t.closest('[data-f] a[href]')){ev.preventDefault();}
  },true);

  // ── tables: rows added / deleted in the DOM; the page's sort / filter rebuilt afterwards ──
  function headCells(t){return arr(t.tHead.rows[0].cells).filter(function(c){return !c.classList.contains('ed-rowtools');});}
  function prepareTable(t){
    var body=t.tBodies[0];if(!t.tHead||!body)return;
    resetTable(t);
    var wrap=t.closest('.table-wrap')||t,prev=wrap.previousElementSibling;
    if(prev&&prev.classList.contains('tbl-tools'))prev.remove();
    // a copy of the header row drops the page script's sort handlers (they keep a stale row list)
    var hr=t.tHead.rows[0],copy=hr.cloneNode(true);
    arr(copy.cells).forEach(function(th){th.classList.remove('sortable');if(!th.className)th.removeAttribute('class');th.removeAttribute('tabindex');th.removeAttribute('aria-sort');});
    hr.parentNode.replaceChild(copy,hr);
    copy.appendChild(el('th','ed-rowtools'));
    arr(body.rows).forEach(addRowTools);
    var add=button('＋ '+L.addRow,function(){insertRow(t,null);});add.className='ed-addrow';
    wrap.parentNode.insertBefore(add,wrap.nextSibling);
    tables.push(t);
  }
  function resetTable(t){
    var body=t.tBodies[0],rows=arr(body.rows);
    if(rows.some(function(r){return r.dataset.order!=null;})){
      rows.slice().sort(function(a,b){return (+a.dataset.order||0)-(+b.dataset.order||0);}).forEach(function(r){body.appendChild(r);});
    }
    rows.forEach(function(r){r.hidden=false;});
    headCells(t).forEach(function(th){th.removeAttribute('aria-sort');});
    if(t._filter){t._filter.value='';t._count();}
  }
  function addRowTools(tr){
    var t=tr.closest('table'),td=el('td','ed-rowtools');
    td.appendChild(button('＋',function(){insertRow(t,tr);},L.insertRow));
    td.appendChild(button('✕',function(){deleteRow(tr);},L.delRow));
    tr.appendChild(td);
  }
  function insertRow(t,after){
    if(active)unmount();
    var tr=document.createElement('tr');
    headCells(t).forEach(function(th){var td=document.createElement('td');if(th.style.textAlign)td.style.textAlign=th.style.textAlign;td.innerHTML=newField();tr.appendChild(td);});
    addRowTools(tr);
    t.tBodies[0].insertBefore(tr,after?after.nextSibling:null);
    var restore=touch(t);
    pushUndo(function(){tr.remove();restore();});
    mount(tr.querySelector('[data-f]'));
  }
  function deleteRow(tr){
    if(active&&tr.contains(active))unmount();
    var parent=tr.parentNode,next=tr.nextSibling,restore=touch(parent);
    tr.remove();
    pushUndo(function(){parent.insertBefore(tr,next);restore();});
  }
  /** Sort and filter as the page script does, on the rows the table has now. */
  function enhance(t){
    var body=t.tBodies[0];
    arr(body.rows).forEach(function(r,i){r.dataset.order=i;});
    if(t._enh){if(t._count)t._count();return;}
    t._enh=true;
    var heads=headCells(t);
    heads.forEach(function(th,col){
      th.classList.add('sortable');th.tabIndex=0;
      function sort(){
        if(editing)return;
        var dir=th.getAttribute('aria-sort')==='ascending'?'descending':th.getAttribute('aria-sort')==='descending'?'none':'ascending';
        heads.forEach(function(h){h.removeAttribute('aria-sort');});
        var rows=arr(body.rows);
        if(dir==='none')rows.sort(function(a,b){return a.dataset.order-b.dataset.order;});
        else{
          th.setAttribute('aria-sort',dir);
          rows.sort(function(a,b){
            var x=(a.cells[col]?a.cells[col].textContent:'').trim(),y=(b.cells[col]?b.cells[col].textContent:'').trim();
            if(!x!==!y)return x?-1:1;
            var c=x.localeCompare(y,undefined,{numeric:true,sensitivity:'base'});
            return (dir==='ascending'?c:-c)||a.dataset.order-b.dataset.order;
          });
        }
        rows.forEach(function(r){body.appendChild(r);});
      }
      th.addEventListener('click',sort);
      th.addEventListener('keydown',function(e){if(editing)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();sort();}});
    });
    var tools=el('div','tbl-tools'),input=el('input'),count=el('span','count');
    input.type='search';input.placeholder=(window.L&&window.L.filter)||'';
    t._filter=input;
    t._count=function(){
      var q=input.value.trim().toLowerCase(),rows=arr(body.rows),shown=0;
      rows.forEach(function(r){var hit=!q||r.textContent.toLowerCase().indexOf(q)>=0;r.hidden=!hit;if(hit)shown++;});
      count.textContent=(q?shown+' / ':'')+rows.length+' '+((window.L&&window.L.rows)||'');
      tools.hidden=rows.length<5&&!q;
    };
    input.addEventListener('input',t._count);
    tools.appendChild(input);tools.appendChild(count);
    var wrap=t.closest('.table-wrap')||t;wrap.parentNode.insertBefore(tools,wrap);
    t._count();
  }

  // ── lists ──
  function prepareList(list){
    if(list.closest('nav,.chips,[data-rev]'))return;
    arr(list.children).forEach(function(li){if(li.tagName==='LI')addItemTools(li);});
  }
  function addItemTools(li){
    var s=el('span','ed-litools');
    s.appendChild(button('▲',function(){moveItem(li,-1);},L.up));
    s.appendChild(button('▼',function(){moveItem(li,1);},L.down));
    s.appendChild(button('＋',function(){insertItem(li);},L.insertItem));
    s.appendChild(button('✕',function(){deleteItem(li);},L.delItem));
    var f=li.querySelector(':scope>[data-f]');
    li.insertBefore(s,f?f.nextSibling:li.firstChild);
  }
  function insertItem(after){
    if(active)unmount();
    var li=document.createElement('li');li.innerHTML=newField();addItemTools(li);
    after.parentNode.insertBefore(li,after.nextSibling);
    var restore=touch(after);
    pushUndo(function(){li.remove();restore();});
    mount(li.querySelector('[data-f]'));
  }
  function deleteItem(li){
    if(active&&li.contains(active))unmount();
    var parent=li.parentNode,next=li.nextSibling,restore=touch(li);
    li.remove();
    pushUndo(function(){parent.insertBefore(li,next);restore();});
  }
  function moveItem(li,dir){
    var sib=dir<0?li.previousElementSibling:li.nextElementSibling;if(!sib)return;
    if(active)unmount();
    var parent=li.parentNode,next=li.nextSibling,restore=touch(li);
    if(dir<0)parent.insertBefore(li,sib);else parent.insertBefore(sib,li);
    pushUndo(function(){parent.insertBefore(li,next);restore();});
  }

  // ── images: a screenshot in place of a figure's image ──
  function prepareFigure(fig){
    if(fig.querySelector('.flow-fig')||!fig.querySelector('img'))return;
    var b=button('🖼 '+L.image,function(){selectFig(fig);pickImage(fig);});b.className='ed-imgbtn';
    fig.insertBefore(b,fig.firstChild);
  }
  function selectFig(f){if(currentFig)currentFig.classList.remove('ed-current');currentFig=f;f.classList.add('ed-current');}
  function pickImage(fig){
    var inp=document.createElement('input');inp.type='file';inp.accept='image/*';
    inp.addEventListener('change',function(){if(inp.files[0])useImage(fig,inp.files[0]);});inp.click();
  }
  function useImage(fig,file){
    var r=new FileReader();
    r.onload=function(){
      var img=fig.querySelector('img');if(!img)return;
      var before=img.getAttribute('src'),was=img.hasAttribute('data-replaced');
      img.setAttribute('src',r.result);img.setAttribute('data-replaced','');
      var restore=touch(fig);
      pushUndo(function(){img.setAttribute('src',before);if(!was)img.removeAttribute('data-replaced');restore();});
    };
    r.readAsDataURL(file);
  }
  document.addEventListener('paste',function(ev){
    if(!editing)return;
    var items=(ev.clipboardData&&ev.clipboardData.items)||[];
    for(var i=0;i<items.length;i++){
      if(items[i].type.indexOf('image/')!==0)continue;
      var fig=(ev.target.closest&&ev.target.closest('figure[data-src]'))||currentFig;
      if(fig&&!fig.querySelector('.flow-fig')){ev.preventDefault();ev.stopPropagation();useImage(fig,items[i].getAsFile());}
      return;
    }
    if(Q||!active)return; // Quill keeps only its own formats from pasted text
    ev.preventDefault();document.execCommand('insertText',false,ev.clipboardData.getData('text/plain'));
  },true);

  // ── flows: flow-editor.mjs on each flow figure; Save writes the changed graphs ──
  function prepareFlows(){
    if(!window.sc4sapFlow)return;
    arr(main.querySelectorAll('figure.flow-fig')).forEach(function(fig){
      var s=fig.querySelector(':scope>script.flow-graph'),d=null;
      try{d=s?JSON.parse(s.textContent):null;}catch(e){d=null;}
      if(!d||!d.graph)return;
      var fl={fig:fig,data:d,edited:!!d.edited};
      fl.ctl=window.sc4sapFlow.attach(fig,{graph:d.graph,opts:d.opts,labels:L.flow,onChange:function(next,prev){
        var was=fl.edited;fl.edited=true;mark();
        pushUndo(function(){fl.ctl.set(prev);fl.edited=was;});
      }});
      flows.push(fl);
    });
  }

  // ── leaving the edit mode: SAP names and §n in the changed text link again ──
  function rowTip(target){
    var td=target.closest('td'),tr=td&&td.parentNode;if(!tr)return '';
    var text=arr(tr.cells).filter(function(c){return c!==td&&!c.classList.contains('ed-rowtools');})
      .map(function(c){return c.textContent.replace(/\s+/g,' ').trim();})
      .filter(function(c){return c&&!/^[\d\s.,:✓✔✗×—–\-·()]*$/.test(c);}).join(' · ');
    return text.length>160?text.slice(0,159)+'…':text;
  }
  function glossary(){
    if(gloss)return gloss;
    gloss={names:{},secs:{}};
    var tips={};
    arr(main.querySelectorAll('a.xref[href^="#ref-"]')).forEach(function(a){var n=a.getAttribute('href').slice(5);if(a.title&&!tips[n])tips[n]=a.title;});
    arr(main.querySelectorAll('span.ref-target[id^="ref-"]')).forEach(function(s){var n=s.id.slice(4);gloss.names[n]={tip:tips[n]||rowTip(s),cell:s.parentNode,id:s.id};});
    arr(main.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')).forEach(function(h){
      var f=h.querySelector(':scope>[data-f]')||h,m=/^(\d+(?:\.\d+)*)\.?\s/.exec(f.textContent.trim());
      if(m&&!gloss.secs[m[1]])gloss.secs[m[1]]=h.id;
    });
    return gloss;
  }
  function xref(name,e,inner){
    var a=el('a','xref');a.href='#'+e.id;if(e.tip)a.title=e.tip;
    if(inner)a.appendChild(inner);else a.textContent=name;return a;
  }
  function relink(f){
    var g=glossary();
    arr(f.querySelectorAll('code')).forEach(function(c){
      var n=c.textContent.trim(),e=g.names[n];
      if(e&&!c.closest('a')&&!e.cell.contains(c)){var p=c.parentNode,nx=c.nextSibling;p.insertBefore(xref(n,e,c),nx);}
    });
    var texts=[],w=document.createTreeWalker(f,NodeFilter.SHOW_TEXT);
    while(w.nextNode())if(!w.currentNode.parentNode.closest('a,code'))texts.push(w.currentNode);
    var re=/§\s?(\d+(?:\.\d+)*)|(?<![A-Za-z0-9_-])([A-Za-z][A-Za-z0-9_]{2,})(?![A-Za-z0-9_])/g;
    texts.forEach(function(node){
      var s=node.nodeValue,last=0,m,frag=document.createDocumentFragment(),hit=false;
      re.lastIndex=0;
      while((m=re.exec(s))){
        var link=null;
        if(m[1]&&g.secs[m[1]]){link=el('a','secref',m[0]);link.href='#'+g.secs[m[1]];}
        else if(m[2]&&g.names[m[2]]&&!g.names[m[2]].cell.contains(node))link=xref(m[2],g.names[m[2]]);
        if(!link)continue;
        frag.appendChild(document.createTextNode(s.slice(last,m.index)));frag.appendChild(link);last=re.lastIndex;hit=true;
      }
      if(!hit)return;
      frag.appendChild(document.createTextNode(s.slice(last)));node.parentNode.replaceChild(frag,node);
    });
  }

  // ── on / off ──
  function prepare(){
    if(ready)return;ready=true;
    arr(main.querySelectorAll('[data-b] table')).forEach(prepareTable);
    arr(main.querySelectorAll('ul[data-b],ol[data-b],[data-b] ul,[data-b] ol')).forEach(prepareList);
    arr(main.querySelectorAll('figure[data-src]')).forEach(prepareFigure);
    prepareFlows();
  }
  function setEditing(on){
    prepare();
    if(!on&&active)unmount();
    editing=on;
    document.body.classList.toggle('editing',on);
    // the Functional view hides technical detail; editing shows everything
    if(on&&document.body.classList.contains('view-functional')){var all=document.querySelector('.toolbar .seg button');if(all)all.click();}
    flows.forEach(function(f){f.ctl.setEditing(on);});
    tables.forEach(on?resetTable:enhance);
    if(!on)arr(main.querySelectorAll('[data-f]')).forEach(function(f){if(f._changed){relink(f);f._changed=false;}});
    editBtn.textContent=on?L.done:L.edit;
    edBar.hidden=!on;
    var seen=store(GUIDE_KEY);if(on&&!seen)guide();
  }

  // ── autosave (localStorage, may be refused): the changed blocks and flows ──
  function cleanTree(root){
    arr(root.querySelectorAll(UI)).forEach(function(e){e.remove();});
    arr(root.querySelectorAll('th')).forEach(function(th){th.classList.remove('sortable');if(!th.className)th.removeAttribute('class');th.removeAttribute('tabindex');th.removeAttribute('aria-sort');});
    arr(root.querySelectorAll('tr[data-order],tr[hidden]')).forEach(function(tr){tr.removeAttribute('data-order');tr.removeAttribute('hidden');});
    arr(root.querySelectorAll('.collapsed,.ed-current,.active,.fe-on,.fe-linking,.ed-quill')).forEach(function(e){
      e.classList.remove('collapsed','ed-current','active','fe-on','fe-linking','ed-quill','ql-container','ql-bubble','ql-disabled');
      if(!e.className)e.removeAttribute('class');
    });
    arr(root.querySelectorAll('[contenteditable]')).forEach(function(e){e.removeAttribute('contenteditable');});
    arr(root.querySelectorAll('pre.mermaid[data-src]')).forEach(function(p){p.textContent=p.getAttribute('data-src');p.removeAttribute('data-processed');});
  }
  /** A copy of node without the edit tools, the field being edited holding its current text. */
  function cleanCopy(node){
    var copy=node.cloneNode(true);
    if(active&&node.contains(active)){
      var i=arr(node.querySelectorAll('[data-f]')).indexOf(active),f=copy.querySelectorAll('[data-f]')[i];
      if(f){f.innerHTML=liveHtml(active);f.removeAttribute('contenteditable');}
    }
    cleanTree(copy);
    return copy;
  }
  function saveDraft(){
    if(!dirty||!ready)return;
    var blocks={},fl=[];
    arr(main.querySelectorAll('[data-b][data-edited]')).forEach(function(b){blocks[b.getAttribute('data-b')]=cleanCopy(b).outerHTML;});
    flows.forEach(function(f,i){if(f.edited)fl.push([i,f.ctl.get()]);});
    store(DRAFT_KEY,JSON.stringify({at:Date.now(),version:SRC.version,blocks:blocks,flows:fl}));
  }
  function offerDraft(){
    var raw=store(DRAFT_KEY),d=null;
    try{d=raw?JSON.parse(raw):null;}catch(e){d=null;}
    if(!d||d.version!==SRC.version||(!Object.keys(d.blocks||{}).length&&!(d.flows||[]).length))return;
    var box=el('div','ed-draft');
    box.appendChild(document.createTextNode(L.draft+' ('+new Date(d.at).toLocaleString()+')'));
    box.appendChild(button(L.resume,function(){box.remove();resume(d);}));
    box.appendChild(button(L.discard,function(){store(DRAFT_KEY,null);box.remove();}));
    var top=document.querySelector('.toolbar');
    if(top)top.parentNode.insertBefore(box,top.nextSibling);else document.body.insertBefore(box,document.body.firstChild);
  }
  function resume(d){
    Object.keys(d.blocks||{}).forEach(function(k){
      var b=main.querySelector('[data-b="'+k+'"]');if(!b)return;
      var tpl=document.createElement('template');tpl.innerHTML=d.blocks[k];
      var nb=tpl.content.firstElementChild;if(!nb)return;
      nb.setAttribute('data-edited','');b.parentNode.replaceChild(nb,b);
      arr(nb.querySelectorAll('[data-f]')).forEach(function(f){f._changed=true;});
    });
    setEditing(true);
    (d.flows||[]).forEach(function(p){var f=flows[p[0]];if(f){f.ctl.set(p[1]);f.edited=true;}});
    dirty=true;
  }

  // ── save: revision dialog, then the page with the edits and the revision embedded ──
  function today(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
  function nextVersion(v){var p=String(v||'1.0').split('.');return (+p[0]||1)+'.'+((+p[1]||0)+1);}
  function dialog(){var o=el('div','ed-guide'),box=el('div');o.appendChild(box);return {o:o,box:box};}
  function askRevision(then){
    var dl=dialog(),box=dl.box,ver=rev?rev.version:nextVersion(SRC.version);
    box.appendChild(el('h3',null,L.revTitle));
    function row(label,input){var l=el('label','ed-revrow');l.appendChild(el('span',null,label));l.appendChild(input);box.appendChild(l);return input;}
    row(L.revVersion,el('strong',null,'v'+ver+' · '+today()));
    var who=row(L.revAuthor,el('input'));who.value=rev?rev.author:(store(AUTHOR_KEY)||'');
    var note=row(L.revNote,el('textarea'));note.rows=3;note.value=rev?rev.note:L.revDefault;
    var err=el('p','ed-reverr',L.revNeedAuthor);err.hidden=true;box.appendChild(err);
    var bar=el('div','ed-revbar');
    function close(){dl.o.remove();}
    function ok(){
      var a=who.value.trim();if(!a){err.hidden=false;who.focus();return;}
      store(AUTHOR_KEY,a);setRevision(ver,a,note.value.trim()||L.revDefault);close();then();
    }
    bar.appendChild(button(L.cancel,close));
    var s=button(L.save,ok);s.className='primary';bar.appendChild(s);box.appendChild(bar);
    dl.o.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Escape')close();else if(e.key==='Enter'&&e.target===who){e.preventDefault();ok();}});
    document.body.appendChild(dl.o);(who.value?note:who).focus();
  }
  function setRevision(ver,author,note){
    var prev=SRC.version;
    if(!rev){rev={version:ver,date:today(),author:author,note:note};SRC.revisions=SRC.revisions||[];SRC.revisions.push(rev);}
    else{rev.author=author;rev.note=note;rev.date=today();}
    SRC.version=ver;
    var t=document.getElementById('rev-table');
    if(t){
      if(!revRow){revRow=el('tr');for(var i=0;i<4;i++)revRow.appendChild(el('td'));t.tBodies[0].appendChild(revRow);}
      var c=revRow.cells;c[0].textContent='v'+rev.version;c[1].textContent=rev.date;c[2].textContent=rev.author;c[3].innerHTML=esc(rev.note).replace(/\n/g,'<br>');
    }
    arr(document.querySelectorAll('[data-ver]')).forEach(function(e){e.textContent='v'+ver;});
    if(prev&&prev!==ver&&document.title.indexOf('v'+prev)>=0)document.title=document.title.split('v'+prev).join('v'+ver);
  }
  function pageHtml(){
    if(active)unmount();
    var doc=document.documentElement.cloneNode(true);
    var live=arr(main.querySelectorAll('figure.flow-fig')),copies=arr(doc.querySelectorAll('main figure.flow-fig'));
    flows.forEach(function(fl){
      var f=copies[live.indexOf(fl.fig)];if(!f)return;
      var c=f.querySelector(':scope>.flow-canvas');if(c)c.innerHTML=fl.ctl.staticSvg();
      var s=f.querySelector(':scope>script.flow-graph');
      if(s&&fl.edited){var d=JSON.parse(JSON.stringify(fl.data));d.graph=fl.ctl.get();d.edited=true;s.textContent=JSON.stringify(d).replace(/</g,'\\u003c');}
    });
    cleanTree(doc);
    var body=doc.querySelector('body');body.classList.remove('editing','view-functional','diff-only');if(!body.className)body.removeAttribute('class');
    doc.removeAttribute('data-theme');
    doc.querySelector('#spec-source').textContent=JSON.stringify(SRC).replace(/</g,'\\u003c');
    return '<!doctype html>\n'+doc.outerHTML;
  }
  function fileName(){
    if(SRC.object)return SRC.object+'-v'+SRC.version+'-'+(SRC.lang||'en')+'-edited.html';
    var f=decodeURIComponent(location.pathname.split('/').pop()||'spec.html');
    return /-edited\.html$/i.test(f)?f:f.replace(/\.html?$/i,'')+'-edited.html';
  }
  function writeFile(){
    var blob=new Blob([pageHtml()],{type:'text/html'});
    function done(){dirty=false;clearTimeout(saveTimer);store(DRAFT_KEY,null);status(L.saved);}
    function download(){var a=el('a');a.href=URL.createObjectURL(blob);a.download=fileName();document.body.appendChild(a);a.click();a.remove();done();}
    if(window.showSaveFilePicker){
      window.showSaveFilePicker({suggestedName:fileName(),types:[{description:'HTML',accept:{'text/html':['.html']}}]})
        .then(function(h){return h.createWritable();}).then(function(w){return w.write(blob).then(function(){return w.close();});}).then(done)
        .catch(function(e){if(e&&e.name!=='AbortError')download();});
    }else download();
  }

  // ── toolbar, guide, keys ──
  var bar=document.querySelector('.toolbar');
  if(!bar){bar=el('div','toolbar');document.body.insertBefore(bar,document.body.firstChild);}
  var edBar=el('span','ed-bar'),statusEl=el('span','status'),undoBtn=button('↶ '+L.undo,undo,'Ctrl+Z');
  var saveBtn=button(L.save,function(){if(active)unmount();askRevision(writeFile);});saveBtn.className='primary';
  edBar.hidden=true;
  [statusEl,undoBtn,button('? '+L.help,guide),saveBtn].forEach(function(b){edBar.appendChild(b);});
  var editBtn=button(L.edit,function(){setEditing(!editing);});editBtn.id='spec-edit-btn';
  bar.appendChild(edBar);bar.appendChild(editBtn);
  function status(t){statusEl.textContent=t;}
  function refreshBar(){undoBtn.disabled=!undoStack.length;}
  refreshBar();
  function guide(){
    var dl=dialog(),ol=el('ol');
    dl.box.appendChild(el('h3',null,L.guideTitle));
    L.guide.forEach(function(t){ol.appendChild(el('li',null,t));});
    dl.box.appendChild(ol);
    var ok=button(L.ok,function(){dl.o.remove();});ok.className='primary';dl.box.appendChild(ok);
    dl.o.addEventListener('click',function(e){if(e.target===dl.o)dl.o.remove();});
    document.body.appendChild(dl.o);store(GUIDE_KEY,'1');
  }
  document.addEventListener('keydown',function(ev){
    if(!editing||!(ev.ctrlKey||ev.metaKey)||ev.shiftKey||String(ev.key).toLowerCase()!=='z')return;
    var t=ev.target;
    if((active&&active.contains(t))||t.isContentEditable||/^(INPUT|TEXTAREA)$/.test(t.tagName))return;
    ev.preventDefault();undo();
  });
  window.addEventListener('beforeunload',function(e){if(dirty){saveDraft();e.preventDefault();e.returnValue=L.unsaved;return L.unsaved;}});
  offerDraft();
})();
`;

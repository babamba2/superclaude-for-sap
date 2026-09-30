// sc4sap:program-to-manual — the page's edit mode ("Edit" button in the top bar).
//
// Lets a key user change the finished manual like a slide deck, with no tool
// installed and nothing loaded from the network:
//   · click any text to change it; selecting text shows a small toolbar
//     (bold, highlight, bullet list) — Quill 2 in its bubble theme, inlined from
//     third_party/ and mounted only on the field being edited
//   · move, duplicate, delete steps; add or delete callouts
//   · drag a callout badge to a better place (a leader line keeps it tied to its frame)
//   · replace a drawn screen with a real screenshot (button, or Ctrl+V on the step)
//   · undo every change (Ctrl+Z or the Undo button), autosave to the browser
//     (IndexedDB) with "continue editing" on reopen, a first-time guide
//   · "Save" writes the page again with the edited manual.json embedded
//     (<script id="manual-source">); `build-manual.mjs --import <file>` reads it
//     back, so the next version keeps the user's edits.
//
// Text markup shared with build-manual.mjs inline(): **bold**, ==highlight==,
// `code`, a line starting with "- " is a bullet, "\n" a line break.
// Without Quill (file missing) the fields fall back to plain contenteditable.

import { existsSync, readFileSync } from 'node:fs';

const QUILL_DIR = new URL('./third_party/quill-2.0.3/', import.meta.url);
const readVendor = (name) => {
  const url = new URL(name, QUILL_DIR);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};
export const QUILL_JS = readVendor('quill.min.js');
export const QUILL_CSS = readVendor('quill.bubble.css');

const LABELS = {
  ko: {
    edit: '편집', done: '편집 종료', save: '저장', up: '위로', down: '아래로', dup: '복제', del: '삭제',
    addCallout: '번호 추가', image: '캡처로 교체', restore: '원래 화면', newCallout: '새 설명을 입력하세요.',
    confirmDel: '이 스텝을 삭제할까요? (Ctrl+Z로 되돌릴 수 있습니다)', saved: '저장했습니다. 받은 HTML 파일을 담당자에게 보내 주세요.',
    unsaved: '저장하지 않은 변경이 있습니다.', delCallout: '이 번호 삭제', undo: '되돌리기', help: '도움말',
    draft: '저장하지 않은 편집이 있습니다', resume: '이어서 편집', discard: '버리기', ok: '확인',
    addRow: '행 추가', insertRow: '아래에 행 추가', delRow: '행 삭제',
    bold: '굵게', em: '강조', list: '목록', clean: '서식 지우기',
    guideTitle: '편집 방법',
    guide: [
      '글자를 클릭하면 바로 고칠 수 있습니다. 글자를 선택하면 굵게 · 강조 · 목록 버튼이 나타납니다.',
      '화면 위 번호는 드래그해서 옮깁니다. 스텝 위의 버튼으로 번호 추가, 스텝 이동 · 복제 · 삭제를 합니다. 표는 행 오른쪽 ＋ / ✕ 로 행을 추가 · 삭제하고, ● 칸은 클릭하면 켜고 꺼집니다.',
      '스텝을 클릭한 뒤 Ctrl+V 하면 그림 대신 실제 캡처 화면이 들어갑니다.',
      '실수하면 Ctrl+Z(되돌리기). 편집 내용은 브라우저에 자동으로 임시 저장됩니다.',
      '다 고쳤으면 [저장]을 누르고, 받은 파일을 담당 컨설턴트에게 보내 주세요.',
    ],
  },
  en: {
    edit: 'Edit', done: 'Done', save: 'Save', up: 'Up', down: 'Down', dup: 'Duplicate', del: 'Delete',
    addCallout: 'Add callout', image: 'Use screenshot', restore: 'Original screen', newCallout: 'Type the new instruction.',
    confirmDel: 'Delete this step? (Ctrl+Z brings it back)', saved: 'Saved. Send the downloaded HTML file to your contact.',
    unsaved: 'You have unsaved changes.', delCallout: 'Delete this callout', undo: 'Undo', help: 'Help',
    draft: 'You have unsaved edits', resume: 'Continue editing', discard: 'Discard', ok: 'OK',
    addRow: 'Add row', insertRow: 'Insert a row below', delRow: 'Delete row',
    bold: 'Bold', em: 'Highlight', list: 'List', clean: 'Clear formatting',
    guideTitle: 'How to edit',
    guide: [
      'Click any text to change it. Select text to get Bold · Highlight · List buttons.',
      'Drag a number on the screen to move it. The buttons above a step add callouts and move, duplicate or delete the step. In tables, ＋ / ✕ at the end of a row add and delete rows; click a ● cell to switch it.',
      'Click a step and press Ctrl+V to use a real screenshot instead of the drawing.',
      'Made a mistake? Ctrl+Z (Undo). Your edits are kept in the browser until you save.',
      'When you are done, press [Save] and send the file to your consultant.',
    ],
  },
  ja: {
    edit: '編集', done: '編集終了', save: '保存', up: '上へ', down: '下へ', dup: '複製', del: '削除',
    addCallout: '番号追加', image: 'キャプチャに置換', restore: '元の画面', newCallout: '新しい説明を入力してください。',
    confirmDel: 'このステップを削除しますか？（Ctrl+Z で元に戻せます）', saved: '保存しました。ダウンロードした HTML を担当者に送ってください。',
    unsaved: '保存していない変更があります。', delCallout: 'この番号を削除', undo: '元に戻す', help: 'ヘルプ',
    draft: '保存していない編集があります', resume: '編集を続ける', discard: '破棄', ok: 'OK',
    addRow: '行を追加', insertRow: '下に行を追加', delRow: '行を削除',
    bold: '太字', em: '強調', list: 'リスト', clean: '書式クリア',
    guideTitle: '編集方法',
    guide: [
      '文字をクリックするとそのまま修正できます。文字を選択すると 太字・強調・リスト のボタンが出ます。',
      '画面上の番号はドラッグで移動します。ステップ上のボタンで番号追加、ステップの移動・複製・削除ができます。表は行末の ＋ / ✕ で行を追加・削除し、● の欄はクリックで切り替えます。',
      'ステップをクリックして Ctrl+V で、図の代わりに実際のキャプチャ画面を使えます。',
      '間違えたら Ctrl+Z（元に戻す）。編集内容はブラウザに自動で一時保存されます。',
      '終わったら［保存］を押し、ダウンロードしたファイルを担当コンサルタントに送ってください。',
    ],
  },
};

export const editorLabels = (lang) => LABELS[String(lang || '').slice(0, 2).toLowerCase()] || LABELS.en;

export const EDITOR_STYLE = `
.screen figcaption:has(>span:empty){display:none}
.ed-bar{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--muted)}
.ed-bar[hidden]{display:none}
.ed-bar .status{max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.topbar button.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.topbar button:disabled{opacity:.45;cursor:default}
.ed-draft{display:flex;gap:8px;align-items:center;padding:8px 16px;background:var(--warn-bg);border-bottom:1px solid var(--warn-line);font-size:13.5px}
.ed-draft button{font:inherit;font-size:13px;padding:3px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}
.ed-guide{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}
.ed-guide>div{max-width:560px;margin:16px;padding:20px 24px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.25)}
.ed-guide h3{margin:0 0 10px}.ed-guide ol{margin:0 0 16px;padding-left:20px;line-height:1.7}
.ed-guide button{font:inherit;padding:5px 16px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:var(--accent-ink);cursor:pointer}
.ed-tools{display:none}
body.editing .ed-tools{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
body.editing .ed-tools button,body.editing .ed-x{font:inherit;font-size:12px;padding:2px 8px;border:1px solid var(--line);border-radius:5px;background:var(--card);color:var(--fg);cursor:pointer}
body.editing .ed-tools button:hover,body.editing .ed-x:hover{border-color:var(--accent)}
.ed-x{display:none}
body.editing .ed-x{display:inline-block;padding:0 6px;align-self:start}
body.editing .callouts>li{grid-template-columns:26px 1fr auto}
body.editing [data-p],body.editing [data-k],body.editing [data-c]{outline:1px dashed color-mix(in srgb,var(--accent) 45%,transparent);outline-offset:2px;border-radius:2px;cursor:text;min-width:2em;display:inline-block}
body.editing li>[data-p],body.editing li>[data-k]{display:inline}
body.editing td [data-c]{display:block;min-height:1.4em}
body.editing td code>[data-c]{display:inline-block;min-width:3em;min-height:0;outline:0}
.ed-rowtools,.ed-addrow{display:none}
body.editing td.ed-rowtools,body.editing th.ed-rowtools{display:table-cell;width:1%;white-space:nowrap}
body.editing .ed-addrow{display:inline-block;margin:-8px 0 16px}
body.editing td[data-flag]{cursor:pointer;text-align:center;outline:1px dashed color-mix(in srgb,var(--accent) 45%,transparent);outline-offset:-3px}
body.editing .ed-rowtools button,body.editing .ed-addrow{font:inherit;font-size:12px;padding:1px 7px;border:1px solid var(--line);border-radius:5px;background:var(--card);color:var(--fg);cursor:pointer;margin-right:4px}
body.editing [data-p]:focus,body.editing [data-k]:focus{outline:2px solid var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent)}
body.editing .ed-quill{display:block!important;outline:2px solid var(--accent)!important;background:var(--bg);color:var(--fg);border-radius:4px}
.ed-quill .ql-editor{padding:2px 4px;font:inherit;line-height:inherit;overflow:visible}
.ed-quill .ql-editor p{margin:0}.ed-quill .ql-editor ul,.ed-quill .ql-editor ol{padding-left:4px;margin:0}
.ed-quill mark.em{background:none}
.ed-quill .ql-tooltip{z-index:20}
body.editing .step-note[hidden],body.editing .screen figcaption{display:block!important}
body.editing .step.ed-current{box-shadow:0 0 0 2px var(--accent)}
body.editing .callout-badge{cursor:grab}
body.editing .callout-badge:active{cursor:grabbing}
@media print{.ed-rowtools,.ed-addrow,.ed-tools,.ed-x,.ed-bar,.ed-draft,.ed-guide,#edit-btn{display:none!important}}
`;

// String.raw keeps the script's backslashes as written; the script uses no ${…}.
export const EDITOR_SCRIPT = String.raw`
(function(){
  var srcEl=document.getElementById('manual-source'),labEl=document.getElementById('editor-labels');
  var btn=document.getElementById('edit-btn'),bar=document.getElementById('ed-bar');
  if(!srcEl||!btn||!bar)return;
  var SRC=JSON.parse(srcEl.textContent),M=SRC.manual,L=JSON.parse(labEl.textContent);
  var Q=window.Quill||null;
  var editing=false,dirty=false,ready=false,current=null,original={},undoStack=[],active=null,activeQ=null;
  var BT='\x60',DRAFT_KEY=location.pathname,GUIDE_KEY='sc4sap-manual-guide-seen',RESUME_KEY='sc4sap-manual-resume';
  var FIELDS='[data-p],[data-k],[data-c]'; // absolute path · path in a step · key in a table row

  // ── markup <-> HTML / Quill delta ──
  var RE=new RegExp('\\*\\*([^*]+)\\*\\*|==([^=]+)==|'+BT+'([^'+BT+']+)'+BT,'g');
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function inline(s){
    return String(s==null?'':s).split(/\r?\n/).map(function(line){
      var bl=/^- /.test(line),h=esc(bl?line.slice(2):line)
        .replace(new RegExp(BT+'([^'+BT+']+)'+BT,'g'),'<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/==([^=]+)==/g,'<mark class="em">$1</mark>');
      return bl?'<span class="bl">'+h+'</span>':h;
    }).join('<br>');
  }
  function assign(a,b){var o={},k;for(k in a)o[k]=a[k];for(k in b)o[k]=b[k];return o;}
  function pushOp(ops,t,a){if(!t)return;var o={insert:t};if(Object.keys(a).length)o.attributes=a;ops.push(o);}
  function parseInline(s,a,ops){
    var re=new RegExp(RE.source,'g'),last=0,m;
    while((m=re.exec(s))){
      if(m.index>last)pushOp(ops,s.slice(last,m.index),a);
      if(m[1]!=null)parseInline(m[1],assign(a,{bold:true}),ops);
      else if(m[2]!=null)parseInline(m[2],assign(a,{em:true}),ops);
      else pushOp(ops,m[3],assign(a,{code:true}));
      last=re.lastIndex;
    }
    if(last<s.length)pushOp(ops,s.slice(last),a);
  }
  function toDelta(markup){
    var ops=[];
    String(markup==null?'':markup).split(/\r?\n/).forEach(function(line){
      var bl=/^- /.test(line);parseInline(bl?line.slice(2):line,{},ops);
      ops.push(bl?{insert:'\n',attributes:{list:'bullet'}}:{insert:'\n'});
    });
    return {ops:ops};
  }
  function fromDelta(d){
    var lines=[],cur='';
    d.ops.forEach(function(op){
      if(typeof op.insert!=='string')return;
      var a=op.attributes||{};
      op.insert.split('\n').forEach(function(p,i){
        if(i>0){lines.push((a.list?'- ':'')+cur);cur='';}
        if(p){var t=p;if(a.code)t=BT+t+BT;if(a.bold)t='**'+t+'**';if(a.em)t='=='+t+'==';cur+=t;}
      });
    });
    if(cur)lines.push(cur);
    return lines.join('\n').replace(/\s+$/,'');
  }
  function toText(node){ // fallback editor: contenteditable HTML -> markup
    var out='';
    node.childNodes.forEach(function(n){
      if(n.nodeType===3){out+=n.nodeValue;return;}
      if(n.nodeType!==1)return;
      var t=n.tagName,inner=toText(n);
      if(t==='BR')out+='\n';
      else if(t==='STRONG'||t==='B')out+=inner.trim()?'**'+inner+'**':inner;
      else if(t==='MARK')out+=inner.trim()?'=='+inner+'==':inner;
      else if(t==='CODE')out+=BT+inner+BT;
      else if(n.classList&&n.classList.contains('bl'))out+='- '+inner;
      else if(t==='DIV'||t==='P')out+=(out&&!/\n$/.test(out)?'\n':'')+inner;
      else out+=inner;
    });
    return out.replace(/ /g,' ');
  }

  // ── model ──
  function getPath(o,path){var ks=path.split('.');for(var i=0;i<ks.length;i++){if(o==null)return undefined;o=o[ks[i]];}return o;}
  function setPath(o,path,v){var ks=path.split('.');for(var i=0;i<ks.length-1;i++){if(o[ks[i]]==null)o[ks[i]]=/^\d+$/.test(ks[i+1])?[]:{};o=o[ks[i]];}o[ks[ks.length-1]]=v;}
  function clone(o){return JSON.parse(JSON.stringify(o));}
  function fieldRef(el){
    if(el.hasAttribute('data-p'))return {obj:M,path:el.getAttribute('data-p')};
    if(el.hasAttribute('data-c')){var tr=el.closest('tr[data-row]');return tr&&tr._row?{obj:tr._row,path:el.getAttribute('data-c'),row:tr}:null;}
    var art=el.closest('article.step');return art?{obj:art._step,path:el.getAttribute('data-k'),art:art}:null;
  }
  function valueOf(el){var r=fieldRef(el);var v=r&&getPath(r.obj,r.path);return v==null?'':String(v);}
  function setValue(el,v){
    var r=fieldRef(el);if(!r)return;setPath(r.obj,r.path,v);
    var m=r.obj===M&&/^scenarios\.(\d+)\.title$/.exec(r.path);
    if(m){var sec=document.querySelector('section[data-si="'+m[1]+'"]');if(sec)sec.querySelectorAll('.sc-title').forEach(function(t){t.innerHTML=inline(v);});}
  }
  function findField(ref){
    if(ref.row)return ref.row.querySelector('[data-c="'+ref.path+'"]');
    if(!ref.art)return document.querySelector('[data-p="'+ref.path+'"]');
    return ref.art.querySelector('[data-k="'+ref.path+'"]');
  }

  // ── tables: rows keep their own item; the array is rebuilt from row order on save ──
  function tables(){return Array.prototype.slice.call(document.querySelectorAll('table.ed-table[data-array]'));}
  function rowsOf(t){return Array.prototype.slice.call(t.querySelectorAll(':scope>tbody>tr[data-row]'));}
  function prepareTable(t){
    var items=getPath(M,t.getAttribute('data-array'))||[];
    rowsOf(t).forEach(function(tr,i){tr._row=clone(items[+tr.getAttribute('data-row')]||{});addRowTools(t,tr);});
    var th=document.createElement('th');th.className='ed-rowtools';t.querySelector('thead tr').appendChild(th);
    var add=button('＋ '+L.addRow,function(){insertRow(t,null);});add.className='ed-addrow';
    t.parentNode.insertBefore(add,t.nextSibling);
  }
  function addRowTools(t,tr){
    var td=document.createElement('td');td.className='ed-rowtools';
    var ins=button('＋',function(){insertRow(t,tr);});ins.title=L.insertRow;
    var del=button('✕',function(){deleteRow(tr);});del.title=L.delRow;
    td.appendChild(ins);td.appendChild(del);tr.appendChild(td);
  }
  function insertRow(t,after){
    if(active)unmount();
    var cols=JSON.parse(t.getAttribute('data-cols')||'[]'),tr=document.createElement('tr'),item={};
    tr.setAttribute('data-row','');
    cols.forEach(function(c){
      var td=document.createElement('td');
      if(c.kind==='flag'){item[c.key]=false;td.setAttribute('data-flag',c.key);}
      else{item[c.key]='';var sp='<span data-c="'+c.key+'"></span>';td.innerHTML=c.kind==='code'?'<code>'+sp+'</code>':sp;}
      tr.appendChild(td);
    });
    tr._row=item;addRowTools(t,tr);
    var body=t.querySelector('tbody');body.insertBefore(tr,after?after.nextSibling:null);
    editable(tr,true);mark();
    pushUndo(function(){tr.remove();});
    var first=tr.querySelector('[data-c]');if(first){if(Q)mount(first);else first.focus();}
  }
  function deleteRow(tr){
    if(active&&tr.contains(active))unmount();
    var parent=tr.parentNode,next=tr.nextSibling;tr.remove();mark();
    pushUndo(function(){parent.insertBefore(tr,next);});
  }
  function toggleFlag(td){
    var tr=td.closest('tr[data-row]');if(!tr||!tr._row)return;
    var k=td.getAttribute('data-flag');
    function set(v){tr._row[k]=v;td.textContent=v?'●':'';}
    var before=!!tr._row[k];set(!before);mark();
    pushUndo(function(){set(before);});
  }

  // ── undo / dirty / autosave ──
  var saveTimer=null;
  function mark(){dirty=true;clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,1500);}
  function pushUndo(fn){undoStack.push(fn);if(undoStack.length>200)undoStack.shift();refreshBar();}
  function undo(){
    if(active)unmount();
    var fn=undoStack.pop();if(fn){fn();renumber();mark();}
    refreshBar();
  }
  function snapshot(art){
    var fig=art.querySelector('figure.screen');
    return {step:clone(art._step),fig:fig?fig.outerHTML:null};
  }
  function restoreSnap(art,s){
    art._step=s.step;
    var fig=art.querySelector('figure.screen'),body=art.querySelector('.step-body');
    if(s.fig){var tmp=document.createElement('div');tmp.innerHTML=s.fig;var nf=tmp.firstChild;if(fig)fig.replaceWith(nf);else body.insertBefore(nf,body.firstChild);body.classList.add('has-screen');}
    else if(fig){fig.remove();body.classList.remove('has-screen');}
    redrawCallouts(art);refreshTools(art);
    art.querySelectorAll('[data-k="title"],[data-k="note"],[data-k="result"],[data-k="caption"]').forEach(function(e){e.innerHTML=inline(valueOf(e));});
  }
  function stepChange(art,fn){var s=snapshot(art);fn();pushUndo(function(){restoreSnap(art,s);});mark();}

  function idb(cb){
    try{
      var r=indexedDB.open('sc4sap-manual',1);
      r.onupgradeneeded=function(){r.result.createObjectStore('drafts');};
      r.onsuccess=function(){try{cb(r.result.transaction('drafts','readwrite').objectStore('drafts'));}catch(e){}};
    }catch(e){}
  }
  function saveDraft(){if(!dirty||!ready)return;collect();var html=pageHtml();idb(function(st){st.put({at:Date.now(),html:html},DRAFT_KEY);});status('');}
  function clearDraft(){idb(function(st){st.delete(DRAFT_KEY);});}
  function offerDraft(){
    idb(function(st){
      var g=st.get(DRAFT_KEY);
      g.onsuccess=function(){
        var d=g.result;if(!d||!d.html)return;
        var box=document.createElement('div');box.className='ed-draft';
        var when=new Date(d.at).toLocaleString();
        box.appendChild(document.createTextNode(L.draft+' ('+when+')'));
        box.appendChild(button(L.resume,function(){
          try{sessionStorage.setItem(RESUME_KEY,DRAFT_KEY);}catch(e){}
          document.open();document.write(d.html);document.close();
        }));
        box.appendChild(button(L.discard,function(){clearDraft();box.remove();}));
        var top=document.querySelector('.topbar');top.parentNode.insertBefore(box,top.nextSibling);
      };
    });
  }

  // ── fields: Quill on the field being edited, contenteditable without Quill ──
  if(Q){
    var Inline=Q.import('blots/inline');
    class EmBlot extends Inline{}
    EmBlot.blotName='em';EmBlot.tagName='MARK';EmBlot.className='em';
    Q.register(EmBlot,true);
  }
  function mount(el){
    if(active===el)return;
    if(active)unmount();
    var before=valueOf(el);
    el.classList.add('ed-quill');el.innerHTML='';
    var q=new Q(el,{theme:'bubble',formats:['bold','em','code','list'],
      modules:{toolbar:[['bold','em'],[{list:'bullet'}],['clean']]}});
    var eb=el.querySelector('.ql-em');if(eb){eb.innerHTML='<span style="color:#D6336C;font-weight:700;font-size:14px">A</span>';eb.title=L.em;}
    var bb=el.querySelector('.ql-bold');if(bb)bb.title=L.bold;
    var lb=el.querySelector('.ql-list');if(lb)lb.title=L.list;
    var cb=el.querySelector('.ql-clean');if(cb)cb.title=L.clean;
    q.setContents(toDelta(before),'silent');
    q.on('text-change',function(){setValue(el,fromDelta(q.getContents()));mark();});
    q.focus();q.setSelection(q.getLength(),0,'silent');
    active=el;activeQ=q;el._before=before;
  }
  function unmount(){
    var el=active,q=activeQ;if(!el)return;active=null;activeQ=null;
    var v=fromDelta(q.getContents()),before=el._before,ref=fieldRef(el);
    setValue(el,v);
    el.classList.remove('ed-quill','ql-container','ql-bubble','ql-disabled');el.innerHTML=inline(v);
    if(v!==before&&ref)pushUndo(function(){var f=findField(ref)||el;setPath(ref.obj,ref.path,before);setValue(f,before);f.innerHTML=inline(before);});
  }
  function editable(root,on){
    if(Q)return; // Quill mounts on click instead
    root.querySelectorAll(FIELDS).forEach(function(e){if(on)e.setAttribute('contenteditable','true');else e.removeAttribute('contenteditable');});
  }
  document.addEventListener('mousedown',function(ev){
    if(!editing)return;
    var art=ev.target.closest&&ev.target.closest('article.step');if(art)select(art);
    var flag=ev.target.closest&&ev.target.closest('td[data-flag]');
    if(flag){if(active)unmount();ev.preventDefault();toggleFlag(flag);return;}
    if(!Q)return;
    if(active&&active.contains(ev.target))return;
    var f=ev.target.closest&&ev.target.closest(FIELDS);
    if(active)unmount();
    if(f){ev.preventDefault();mount(f);}
  });
  var fallbackBefore=new WeakMap();
  document.addEventListener('focusin',function(ev){
    if(!editing||Q)return;var e=ev.target.closest&&ev.target.closest(FIELDS);if(e&&!fallbackBefore.has(e))fallbackBefore.set(e,valueOf(e));
  });
  document.addEventListener('focusout',function(ev){
    if(!editing||Q)return;var e=ev.target.closest&&ev.target.closest(FIELDS);if(!e||!fallbackBefore.has(e))return;
    var before=fallbackBefore.get(e),v=valueOf(e),ref=fieldRef(e);fallbackBefore.delete(e);
    if(v!==before&&ref)pushUndo(function(){var f=findField(ref)||e;setValue(f,before);f.innerHTML=inline(before);});
  });
  document.addEventListener('input',function(ev){
    if(!editing||Q)return;
    var e=ev.target.closest&&ev.target.closest(FIELDS);if(!e)return;
    setValue(e,toText(e).trim());mark();
  });

  // ── steps ──
  function articles(sec){return Array.prototype.slice.call(sec.querySelectorAll(':scope>article.step'));}
  function sections(){return Array.prototype.slice.call(document.querySelectorAll('section[data-si]'));}
  function prepare(){
    if(ready)return;ready=true;
    sections().forEach(function(sec){
      var si=+sec.getAttribute('data-si');
      articles(sec).forEach(function(art){
        var st=M.scenarios[si].steps[+art.getAttribute('data-ti')];
        art._step=clone(st);
        var fig=art.querySelector('figure.screen');
        art._origFig=fig&&!st.image?fig.outerHTML:null;
        addTools(art);
      });
    });
    tables().forEach(prepareTable);
    document.querySelectorAll('[data-p]').forEach(function(e){original[e.getAttribute('data-p')]=getPath(M,e.getAttribute('data-p'));});
  }
  function button(label,fn){var b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',function(ev){ev.stopPropagation();fn();});return b;}
  function addTools(art){
    var t=document.createElement('div');t.className='ed-tools';
    t.appendChild(button('▲ '+L.up,function(){move(art,-1,true);}));
    t.appendChild(button('▼ '+L.down,function(){move(art,1,true);}));
    t.appendChild(button('⧉ '+L.dup,function(){duplicate(art);}));
    t.appendChild(button('✕ '+L.del,function(){
      if(!window.confirm(L.confirmDel))return;
      if(active&&art.contains(active))unmount();
      var parent=art.parentNode,next=art.nextSibling;art.remove();renumber();mark();
      pushUndo(function(){parent.insertBefore(art,next);});
    }));
    t.appendChild(button('＋ '+L.addCallout,function(){addCallout(art);}));
    t.appendChild(button('🖼 '+L.image,function(){pickImage(art);}));
    if(art._step.image)t.appendChild(button('↺ '+L.restore,function(){restore(art);}));
    art.insertBefore(t,art.firstChild);
    addCalloutX(art);
  }
  function refreshTools(art){var t=art.querySelector('.ed-tools');if(t)t.remove();art.querySelectorAll('.ed-x').forEach(function(x){x.remove();});addTools(art);}
  function addCalloutX(art){
    art.querySelectorAll('ol.callouts>li').forEach(function(li){
      if(li.querySelector('.ed-x'))return;
      var x=document.createElement('button');x.type='button';x.className='ed-x';x.textContent='✕';x.title=L.delCallout;
      x.addEventListener('click',function(){stepChange(art,function(){art._step.callouts.splice(+li.getAttribute('data-ci'),1);redrawCallouts(art);});});
      li.appendChild(x);
    });
  }
  function renumber(){
    sections().forEach(function(sec){
      var si=+sec.getAttribute('data-si');
      articles(sec).forEach(function(art,ti){
        art.setAttribute('data-ti',ti);art.id='s'+(si+1)+'-'+(ti+1);
        art.classList.toggle('page-break',ti>0);
        var n=art.querySelector('.stepno');if(n)n.textContent=ti+1;
      });
    });
  }
  function move(art,dir,record){
    var sib=dir<0?art.previousElementSibling:art.nextElementSibling;
    if(!sib||!sib.matches('article.step'))return;
    if(dir<0)art.parentNode.insertBefore(art,sib);else art.parentNode.insertBefore(sib,art);
    renumber();mark();art.scrollIntoView({block:'nearest'});
    if(record)pushUndo(function(){move(art,-dir,false);});
  }
  function duplicate(art){
    if(active&&art.contains(active))unmount();
    var copy=art.cloneNode(true);
    copy.querySelectorAll('.ed-tools,.ed-x,g.callout-layer').forEach(function(e){e.remove();});
    copy._step=clone(art._step);copy._origFig=art._origFig;
    art.parentNode.insertBefore(copy,art.nextSibling);
    addTools(copy);editable(copy,true);renumber();placeFig(copy);mark();
    pushUndo(function(){copy.remove();});
  }
  function marksOf(st){
    return (st.callouts||[]).map(function(c,i){return [i+1,c.anchor||'',c.offset||null,c.pos||null];}).filter(function(m){return m[1]||m[3];});
  }
  function placeFig(art){
    var fig=art.querySelector('figure.screen');if(!fig)return;
    fig.setAttribute('data-callouts',JSON.stringify(marksOf(art._step)));
    if(window.sc4sapPlace)window.sc4sapPlace(fig);
  }
  function redrawCallouts(art){
    if(active&&art.contains(active))unmount();
    var st=art._step,ol=art.querySelector('ol.callouts');
    ol.innerHTML=(st.callouts||[]).map(function(c,i){
      var d=(c.details||[]).map(function(x,di){return '<li><span data-k="callouts.'+i+'.details.'+di+'">'+inline(x)+'</span></li>';}).join('');
      return '<li data-ci="'+i+'"><span class="num">'+(i+1)+'</span><div><span data-k="callouts.'+i+'.text">'+inline(c.text)+'</span>'+(d?'<ul>'+d+'</ul>':'')+'</div></li>';
    }).join('');
    editable(ol,true);addCalloutX(art);placeFig(art);
  }
  function addCallout(art){
    stepChange(art,function(){
      var st=art._step;st.callouts=st.callouts||[];
      var n=st.callouts.length;st.callouts.push({text:L.newCallout,pos:[24,24+n*26]});
      redrawCallouts(art);
    });
    var last=art.querySelector('ol.callouts>li:last-child [data-k]');
    if(last){if(Q)mount(last);else last.focus();}
  }

  // ── screenshots ──
  function pickImage(art){
    var inp=document.createElement('input');inp.type='file';inp.accept='image/*';
    inp.addEventListener('change',function(){if(inp.files[0])useImage(art,inp.files[0]);});inp.click();
  }
  function useImage(art,file){
    var r=new FileReader();
    r.onload=function(){
      var img=new Image();
      img.onload=function(){
        stepChange(art,function(){
          var st=art._step;st.image={src:r.result,width:img.naturalWidth,height:img.naturalHeight};
          (st.callouts||[]).forEach(function(c,i){if(!c.pos)c.pos=[24,24+i*26];});
          var w=st.image.width,h=st.image.height;
          var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" style="max-width:'+w+'px"><image href="'+r.result+'" x="0" y="0" width="'+w+'" height="'+h+'"/></svg>';
          var fig=art.querySelector('figure.screen'),cap='<figcaption><span data-k="caption">'+inline(st.caption||'')+'</span></figcaption>';
          if(!fig){fig=document.createElement('figure');fig.className='screen';var body=art.querySelector('.step-body');body.insertBefore(fig,body.firstChild);body.classList.add('has-screen');}
          fig.setAttribute('data-image','');fig.innerHTML=svg+cap;editable(fig,true);
          refreshTools(art);placeFig(art);
        });
      };
      img.src=r.result;
    };
    r.readAsDataURL(file);
  }
  function restore(art){
    stepChange(art,function(){
      var st=art._step;delete st.image;
      var fig=art.querySelector('figure.screen');
      if(art._origFig){var tmp=document.createElement('div');tmp.innerHTML=art._origFig;var nf=tmp.firstChild;fig.replaceWith(nf);editable(nf,true);}
      else if(fig){fig.remove();art.querySelector('.step-body').classList.remove('has-screen');}
      refreshTools(art);placeFig(art);
    });
  }

  // ── dragging a badge ──
  function svgPoint(svg,ev){var p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
  document.addEventListener('pointerdown',function(ev){
    if(!editing)return;
    var g=ev.target.closest&&ev.target.closest('.callout-badge');if(!g)return;
    var svg=g.ownerSVGElement,art=g.closest('article.step');if(!svg||!art)return;
    ev.preventDefault();
    var num=+g.getAttribute('data-num'),c=art._step.callouts[num-1];if(!c)return;
    var snap=snapshot(art),start=svgPoint(svg,ev),base=g.getAttribute('data-base'),o0=c.offset||[0,0],p0=c.pos||[0,0],moved=false;
    function mv(e){var p=svgPoint(svg,e);moved=true;g.setAttribute('transform','translate('+(p.x-start.x)+','+(p.y-start.y)+')');}
    function up(e){
      document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);
      if(!moved)return;
      var p=svgPoint(svg,e),dx=Math.round(p.x-start.x),dy=Math.round(p.y-start.y);
      if(base)c.offset=[o0[0]+dx,o0[1]+dy];else c.pos=[p0[0]+dx,p0[1]+dy];
      placeFig(art);mark();pushUndo(function(){restoreSnap(art,snap);});
    }
    document.addEventListener('pointermove',mv);document.addEventListener('pointerup',up);
  });

  // ── keyboard, paste, selection ──
  function select(art){if(current)current.classList.remove('ed-current');current=art;art.classList.add('ed-current');}
  document.addEventListener('keydown',function(ev){
    if(!editing||!(ev.ctrlKey||ev.metaKey)||ev.shiftKey||String(ev.key).toLowerCase()!=='z')return;
    if(active&&active.contains(ev.target))return;          // Quill undoes inside the field
    if(ev.target.isContentEditable)return;                 // native undo inside the field
    ev.preventDefault();undo();
  });
  document.addEventListener('paste',function(ev){
    if(!editing)return;
    var items=(ev.clipboardData&&ev.clipboardData.items)||[];
    for(var i=0;i<items.length;i++){
      if(items[i].type.indexOf('image/')===0){
        var art=(ev.target.closest&&ev.target.closest('article.step'))||current;
        if(art){ev.preventDefault();ev.stopPropagation();useImage(art,items[i].getAsFile());}
        return;
      }
    }
    if(Q)return; // Quill keeps only bold / highlight / list from pasted text
    var e=ev.target.closest&&ev.target.closest(FIELDS);
    if(e){ev.preventDefault();document.execCommand('insertText',false,ev.clipboardData.getData('text/plain'));}
  },true);

  // ── save ──
  function collect(){
    sections().forEach(function(sec){
      var si=+sec.getAttribute('data-si');
      M.scenarios[si].steps=articles(sec).map(function(a){return a._step;});
    });
    var un=(M.intro&&M.intro.unverified)||[];
    Object.keys(original).forEach(function(p){
      var now=getPath(M,p),i=un.indexOf(original[p]);
      if(i>=0&&now!==original[p]){un[i]=now;original[p]=now;}
    });
    tables().forEach(function(t){setPath(M,t.getAttribute('data-array'),rowsOf(t).map(function(tr){return tr._row;}));});
    M.edited={at:new Date().toISOString().slice(0,19).replace('T',' ')};
  }
  function pageHtml(){
    var doc=document.documentElement.cloneNode(true);
    doc.querySelectorAll('.ed-tools,.ed-x,.ed-rowtools,.ed-addrow,g.callout-layer,.ed-draft,.ed-guide').forEach(function(e){e.remove();});
    doc.querySelectorAll('table.ed-table').forEach(function(t){rowsOf(t).forEach(function(tr,i){tr.setAttribute('data-row',i);});});
    doc.querySelectorAll('[contenteditable]').forEach(function(e){e.removeAttribute('contenteditable');});
    doc.querySelectorAll('.ed-current').forEach(function(e){e.classList.remove('ed-current');});
    if(active){ // the field being edited: its text, not Quill's editor
      var live=[].slice.call(document.querySelectorAll(FIELDS)).indexOf(active);
      var copy=doc.querySelectorAll(FIELDS)[live];
      if(copy){copy.classList.remove('ed-quill','ql-container','ql-bubble');copy.innerHTML=inline(valueOf(active));}
    }
    doc.querySelectorAll('.step-note').forEach(function(p){var s=p.querySelector('[data-k]');if(s)p.hidden=!s.textContent.trim();});
    doc.querySelector('body').classList.remove('editing');
    var eb=doc.querySelector('#ed-bar');if(eb){eb.hidden=true;eb.innerHTML='';}
    var eBtn=doc.querySelector('#edit-btn');if(eBtn)eBtn.textContent=L.edit;
    doc.querySelector('#manual-source').textContent=JSON.stringify(SRC).replace(/</g,'\\u003c');
    return '<!doctype html>\n'+doc.outerHTML;
  }
  function fileName(){
    var f=decodeURIComponent((location.pathname.split('/').pop()||'manual.html'));
    return /-edited\.html$/i.test(f)?f:f.replace(/\.html?$/i,'')+'-edited.html';
  }
  function save(){
    collect();
    var html=pageHtml(),blob=new Blob([html],{type:'text/html'});
    function done(){dirty=false;clearTimeout(saveTimer);clearDraft();status(L.saved);}
    function download(){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fileName();document.body.appendChild(a);a.click();a.remove();done();}
    if(window.showSaveFilePicker){
      window.showSaveFilePicker({suggestedName:fileName(),types:[{description:'HTML',accept:{'text/html':['.html']}}]})
        .then(function(h){return h.createWritable();}).then(function(w){return w.write(blob).then(function(){return w.close();});}).then(done)
        .catch(function(e){if(e&&e.name!=='AbortError')download();});
    }else download();
  }

  // ── bar, guide, on / off ──
  var undoBtn=null,statusEl=null;
  function status(t){if(statusEl)statusEl.textContent=t;}
  function refreshBar(){if(undoBtn)undoBtn.disabled=!undoStack.length;}
  function guide(){
    var o=document.createElement('div');o.className='ed-guide';
    var box=document.createElement('div'),h=document.createElement('h3'),ol=document.createElement('ol');
    h.textContent=L.guideTitle;L.guide.forEach(function(t){var li=document.createElement('li');li.textContent=t;ol.appendChild(li);});
    box.appendChild(h);box.appendChild(ol);box.appendChild(button(L.ok,function(){o.remove();}));
    o.appendChild(box);o.addEventListener('click',function(e){if(e.target===o)o.remove();});
    document.body.appendChild(o);
    try{localStorage.setItem(GUIDE_KEY,'1');}catch(e){}
  }
  function setEditing(on){
    prepare();
    if(!on&&active)unmount();
    editing=on;
    document.body.classList.toggle('editing',on);
    editable(document,on);
    btn.textContent=on?L.done:L.edit;
    bar.hidden=!on;
    if(on&&!bar.childNodes.length){
      statusEl=document.createElement('span');statusEl.className='status';
      undoBtn=button('↶ '+L.undo,undo);undoBtn.title='Ctrl+Z';
      var s=button(L.save,save);s.className='primary';
      bar.appendChild(statusEl);bar.appendChild(undoBtn);bar.appendChild(button('? '+L.help,guide));bar.appendChild(s);
      refreshBar();
    }
    document.querySelectorAll('figure.screen[data-zoom]').forEach(function(f){f.classList.remove('zoomed');});
    var seen=false;try{seen=!!localStorage.getItem(GUIDE_KEY);}catch(e){}
    if(on&&!seen)guide();
  }
  btn.addEventListener('click',function(){setEditing(!editing);});
  window.addEventListener('beforeunload',function(e){if(dirty){saveDraft();e.preventDefault();e.returnValue=L.unsaved;return L.unsaved;}});
  var resumed=false;try{resumed=sessionStorage.getItem(RESUME_KEY)===DRAFT_KEY;if(resumed)sessionStorage.removeItem(RESUME_KEY);}catch(e){}
  if(resumed){setEditing(true);dirty=true;}else offerDraft();
})();
`;

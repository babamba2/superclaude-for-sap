// interface-mapping-spec — the page's edit mode ("Edit" in the top bar).
//
// Nothing installed, nothing loaded from the network:
//   · every item is plain text (code-list items are drop-downs), multi-line
//     items keep their line breaks; the checks run again after every change
//   · grid rows: add, insert, delete, move — the No column is renumbered and
//     every MAPPING follows its row; ✓ confirms a proposed row (editing a row
//     confirms it too)
//   · conversion rules, extraction SQL lines and revision rows: add / delete;
//     the response block can be added (synchronous) or dropped
//   · undo (Ctrl+Z outside a text field, or the button), autosave to the
//     browser (IndexedDB) with "continue editing" on reopen
//   · "Save" asks for author, change and approver, raises the version by 0.1,
//     adds the revision row and downloads the page with the model embedded —
//     the file `build-if-spec.mjs --import` takes back.

const LABELS = {
  ko: {
    edit: '편집', done: '편집 종료', save: '저장', undo: '되돌리기', addRow: '+ 행 추가', addRule: '+ 변환규칙 추가', addSql: '+ 조건 추가',
    addGroup: '+ 그룹 추가', delGroup: '그룹과 그 행 삭제', addResponse: '+ 응답 블록 추가 (동기)', dropResponse: '응답 블록 삭제', confirm: '제안 확인', confirmAll: '제안 모두 확인',
    draft: '저장하지 않은 편집이 있습니다', resume: '이어서 편집', discard: '버리기', unsaved: '저장하지 않은 변경이 있습니다.',
    saveTitle: '저장 — 개정이력', author: '작성자', note: '변경 내용', approver: '승인자 (선택)', noteDefault: '매핑 정의서 수정',
    needAuthor: '작성자를 입력하세요.', ok: '저장', cancel: '취소', saved: '저장했습니다 (v{v}). 받은 HTML 파일을 담당자에게 보내 주세요.',
    hint: '편집 모드: 칸을 클릭해 고칩니다. 코드 항목은 목록에서 고릅니다. ▸ 그룹 행에 필드를 실어 나르는 단위(파라미터 · 구조 · 테이블)와 필수(반복)를 적습니다. 행을 고치면 "제안" 표시가 사라집니다. 오른쪽 위 "검증"에서 빠진 항목과 매핑 경고를 확인하세요.',
  },
  en: {
    edit: 'Edit', done: 'Done', save: 'Save', undo: 'Undo', addRow: '+ Add row', addRule: '+ Add rule', addSql: '+ Add condition',
    addGroup: '+ Add group', delGroup: 'Delete the group and its rows', addResponse: '+ Add response block (synchronous)', dropResponse: 'Remove response block', confirm: 'Confirm proposal', confirmAll: 'Confirm all proposals',
    draft: 'You have unsaved edits', resume: 'Continue editing', discard: 'Discard', unsaved: 'You have unsaved changes.',
    saveTitle: 'Save — revision', author: 'Author', note: 'Change', approver: 'Approver (optional)', noteDefault: 'Mapping specification updated',
    needAuthor: 'Enter the author.', ok: 'Save', cancel: 'Cancel', saved: 'Saved (v{v}). Send the downloaded HTML file to the owner of the specification.',
    hint: 'Edit mode: click a cell to change it; code items are picked from a list. The ▸ group rows name the unit the fields travel in (parameters, structure, table) and its occurrence. Editing a row removes its "Proposal" mark. "Checks" (top right) lists missing items and mapping warnings.',
  },
};
export const editorLabels = (lang) => LABELS[String(lang || '').slice(0, 2)] || LABELS.en;
export const EDITOR_LABELS_SRC = JSON.stringify(LABELS);

export const EDITOR_STYLE = `
body.editing .ed{outline:1px dashed #9bb3cc;outline-offset:-2px;cursor:text}
body.editing .ed:focus{outline:2px solid var(--accent);background:#fff}
body.editing td select{width:100%;font:inherit;font-size:12px;border:1px solid #9bb3cc;border-radius:3px;background:#fff;padding:1px 2px}
.edx{border:0;background:none;color:var(--err);cursor:pointer;font-size:12px;padding:0 4px}.edx.ok{color:#1d6b2c;font-weight:700}
.grid td.tools{white-space:nowrap;text-align:center}.grid td.tools .edx{color:var(--ink2)}.grid td.tools .edx[data-row$="|del"]{color:var(--err)}
.edadd{border:1px dashed var(--line);background:#fff;color:var(--ink2);border-radius:6px;font:inherit;font-size:11.5px;padding:2px 9px;cursor:pointer;margin:6px 0 2px}
.ie-bar{display:none;position:sticky;top:40px;z-index:15;background:#fff8dc;border-bottom:1px solid #e8d9a0;color:#6b5a1f;font-size:12.5px;padding:7px 18px}
body.editing .ie-bar{display:block}#ie-undo,#ie-save{display:none!important}body.editing #ie-undo,body.editing #ie-save{display:inline-block!important}
.ie-modal{position:fixed;inset:0;background:rgba(10,20,32,.5);display:flex;align-items:center;justify-content:center;z-index:60}
.ie-modal div{background:#fff;border-radius:8px;padding:18px 20px;width:min(420px,92vw)}
.ie-modal h3{margin:0 0 12px;font-size:15px}.ie-modal label{display:block;font-size:12.5px;margin:8px 0 3px;color:var(--ink2)}
.ie-modal input,.ie-modal textarea{width:100%;font:inherit;padding:6px 9px;border:1px solid var(--line);border-radius:6px}
.ie-modal .btns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.ie-modal button{font:inherit;border:1px solid var(--line);background:#fff;border-radius:6px;padding:5px 12px;cursor:pointer}
.ie-modal button.pri{background:var(--ink);color:#fff;border-color:var(--ink)}
.ie-draft{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;border-radius:8px;padding:10px 14px;z-index:55;display:flex;gap:10px;align-items:center;font-size:13px}
.ie-draft button{font:inherit;font-size:12.5px;border:1px solid #4b6a8a;background:none;color:#fff;border-radius:6px;padding:3px 10px;cursor:pointer}
`;

// Runs after the page script: uses D, $, esc, getAt, setAt, render, renumber, LANG.
export const EDITOR_SCRIPT = String.raw`
const EL=(${EDITOR_LABELS_SRC})[LANG]||(${EDITOR_LABELS_SRC}).en;
$('#ie-edit').textContent=EL.edit;$('#ie-undo').textContent=EL.undo;$('#ie-save').textContent=EL.save;$('#ie-bar').textContent=EL.hint;
const undo=[];let dirty=false;
const KEY='sc4sap-if-edit:'+location.pathname+':'+D.ifId+':'+D.lang+':'+D.version;
const idb=f=>new Promise(r=>{try{const q=indexedDB.open('sc4sap-if-spec',1);q.onupgradeneeded=()=>q.result.createObjectStore('drafts');q.onsuccess=()=>{try{const tx=q.result.transaction('drafts','readwrite');f(tx.objectStore('drafts'),r)}catch(e){r(null)}};q.onerror=()=>r(null)}catch(e){r(null)}});
const saveDraft=()=>idb((s,r)=>{const q=s.put({model:JSON.stringify(D),at:Date.now()},KEY);q.onsuccess=()=>r(true);q.onerror=()=>r(false)});
const loadDraft=()=>idb((s,r)=>{const q=s.get(KEY);q.onsuccess=()=>r(q.result||null);q.onerror=()=>r(null)});
const dropDraft=()=>idb((s,r)=>{const q=s.delete(KEY);q.onsuccess=()=>r(true);q.onerror=()=>r(false)});
function replace(m){for(const k of Object.keys(D))delete D[k];Object.assign(D,m)}
function rerender(){const y=window.scrollY;const f=document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.p;render();window.scrollTo(0,y);return f}
function change(fn){undo.push(JSON.stringify(D));if(undo.length>300)undo.shift();fn();dirty=true;saveDraft()}
// A changed grid cell confirms its row's proposal.
const rowOf=p=>{const m=/^(request|response)\.rows\.(\d+)\./.exec(p);return m?getAt(D,m[1]+'.rows.'+m[2]):null};
function commit(p,v){if((getAt(D,p)??'')===v)return false;change(()=>{setAt(D,p,v);const r=rowOf(p);if(r&&!/\.no$/.test(p))delete r.proposed;const rm=/^rules\.(\d+)\./.exec(p);if(rm&&D.rules[rm[1]])delete D.rules[rm[1]].proposed});return true}
// Excel paste: a block of cells (tabs / line breaks) fills the grid from the cell it lands on, adding rows as needed.
const GRIDCOLS=['s.table','s.field','s.key','s.type','s.size','s.nul','s.desc','r','t.table','t.field','t.key','t.type','t.size','t.nul','map','t.desc'];
document.addEventListener('paste',e=>{const el=EDIT&&e.target.closest&&e.target.closest('[contenteditable][data-p]');if(!el)return;const m=/^(request|response)\.rows\.(\d+)\.(.+)$/.exec(el.dataset.p);if(!m)return;
const text=(e.clipboardData&&e.clipboardData.getData('text/plain'))||'';if(!/[\t\n]/.test(text.replace(/\r?\n$/,'')))return;e.preventDefault();
const lines=text.replace(/\r/g,'').replace(/\n$/,'').split('\n').map(l=>l.split('\t'));const c0=GRIDCOLS.indexOf(m[3]);if(c0<0)return;const bk=m[1];const i0=Number(m[2]);
change(()=>{const rows=D[bk].rows;const g0=rows[i0]&&rows[i0].g;lines.forEach((cols,j)=>{const i=i0+j;if(!rows[i])rows.push({no:'',g:g0,s:newCell(),r:'',t:newCell(),map:''});cols.forEach((v,k)=>{const col=GRIDCOLS[c0+k];if(!col)return;v=v.trim();if(/(key|nul|type)$|^(r|map)$/.test(col))v=v.toUpperCase();setAt(rows[i],col,v)});delete rows[i].proposed});orderRows(D[bk]);renumber(D[bk].rows,bk==='request'?'A':'B')});rerender()});
document.addEventListener('focusin',e=>{const el=EDIT&&e.target.closest&&e.target.closest('[contenteditable][data-p]');if(el)el.dataset.o=el.innerText});
document.addEventListener('focusout',e=>{const el=EDIT&&e.target.closest&&e.target.closest('[contenteditable][data-p]');if(!el)return;let v=el.innerText.replace(/ /g,' ');v=el.dataset.ml?v.replace(/\s+$/,''):v.trim();
if(/\.(map|r|no|id)$/.test(el.dataset.p)||/\.s\.(key|nul)$|\.t\.(key|nul)$/.test(el.dataset.p))v=v.toUpperCase();if(commit(el.dataset.p,v))setTimeout(()=>{if(!document.activeElement||!document.activeElement.closest('[contenteditable]'))rerender();else checks()},0)});
document.addEventListener('keydown',e=>{const el=EDIT&&e.target.closest&&e.target.closest('[contenteditable][data-p]');if(el&&e.key==='Enter'&&!el.dataset.ml){e.preventDefault();el.blur()}});
document.addEventListener('change',e=>{const s=EDIT&&e.target.closest('select[data-p]');if(!s)return;if(commit(s.dataset.p,s.value))rerender()});
const newCell=()=>({table:'',field:'',key:'',type:'',size:'',nul:'',desc:''});
// Deleted rows: MAPPING that pointed at them is kept with "?" so the checks show it.
function dropRows(rows,gone){const nos=new Set(gone.map(r=>String(r.no).toUpperCase()));for(const r of gone)rows.splice(rows.indexOf(r),1);for(const r of rows)if(nos.has(String(r.map).toUpperCase()))r.map=String(r.map).toUpperCase()+'?'}
document.addEventListener('click',e=>{if(!EDIT)return;const b=e.target.closest('button');if(!b)return;const d=b.dataset;
if(d.row){const [bk,is,a]=d.row.split('|');const i=Number(is);const pre=bk==='request'?'A':'B';
change(()=>{const b=D[bk];const rows=b.rows;const gs=b.groups||[];const lastG=gs.length?gs[gs.length-1].id:'';
if(a==='add'||a==='ins'){const g=a==='add'?lastG:rows[i].g;rows.splice(a==='add'?rows.length:i+1,0,{no:'',g,s:newCell(),r:'',t:newCell(),map:''})}
else if(a==='del')dropRows(rows,[rows[i]]);
else if(a==='up'&&i>0&&rows[i-1].g===rows[i].g)rows.splice(i-1,0,rows.splice(i,1)[0]);else if(a==='down'&&i<rows.length-1&&rows[i+1].g===rows[i].g)rows.splice(i+1,0,rows.splice(i,1)[0]);else if(a==='ok')delete rows[i].proposed;
orderRows(b);renumber(b.rows,pre)});rerender();return}
if(d.grow){const [bk,gs,a]=d.grow.split('|');const b=D[bk];const g=b.groups[Number(gs)];const pre=bk==='request'?'A':'B';
change(()=>{if(a==='add')b.rows.push({no:'',g:g.id,s:newCell(),r:'',t:newCell(),map:''});else{dropRows(b.rows,b.rows.filter(r=>r.g===g.id));b.groups.splice(Number(gs),1);if(!b.groups.length)b.groups.push({id:'g1',s:{name:'',kind:'TABLE',card:'1:N'},t:{name:'',kind:'TABLE',card:'1:N'}})}
orderRows(b);renumber(b.rows,pre)});rerender();return}
if(d.gadd){const b=D[d.gadd];const pre=d.gadd==='request'?'A':'B';change(()=>{b.groups=b.groups||[];const id=newGroupId(b);b.groups.push({id,s:{name:'',kind:'TABLE',card:'1:N'},t:{name:'',kind:'TABLE',card:'1:N'}});b.rows.push({no:'',g:id,s:newCell(),r:'',t:newCell(),map:''});orderRows(b);renumber(b.rows,pre)});rerender();return}
if(d.confirm){change(()=>{for(const r of D[d.confirm].rows)delete r.proposed});rerender();return}
if(d.ladd){change(()=>{const l=D[d.ladd]||(D[d.ladd]=[]);if(d.ladd==='rules')l.push({id:'R'+(Math.max(0,...l.map(x=>Number(String(x.id).replace(/\D/g,''))||0))+1),text:''});else l.push('')});rerender();const n=D[d.ladd].length-1;const f=document.querySelector('[data-p="'+d.ladd+'.'+n+(d.ladd==='rules'?'.text':'')+'"]');if(f)f.focus();return}
if(d.ldel){const [k,i]=d.ldel.split('|');change(()=>D[k].splice(Number(i),1));rerender();return}
if(d.radd){change(()=>D.revisions.push({seq:D.revisions.length+1,version:D.version,date:new Date().toISOString().slice(0,10),text:'',author:'',approver:''}));rerender();return}
if(d.rdel){change(()=>D.revisions.splice(Number(d.rdel),1));rerender();return}
if(d.resp!=null){change(()=>{if(d.resp==='1'){const side=()=>({object:'',structure:'PARAMETER',cardinality:'1:1'});D.response={source:{object:''},target:{object:''},groups:[{id:'g1',s:{name:'',kind:'PARAMETER',card:'1:1'},t:{name:'',kind:'PARAMETER',card:'1:1'}}],rows:[{no:'B01',g:'g1',s:newCell(),r:'',t:newCell(),map:''}]}}else D.response=null});rerender();return}});
function setEdit(on){EDIT=on;document.body.classList.toggle('editing',on);$('#ie-edit').textContent=on?EL.done:EL.edit;if(on)document.body.classList.add('checks');rerender()}
$('#ie-edit').onclick=()=>setEdit(!EDIT);
function doUndo(){const u=undo.pop();if(!u)return;replace(JSON.parse(u));dirty=true;saveDraft();rerender()}
$('#ie-undo').onclick=doUndo;
document.addEventListener('keydown',e=>{if(EDIT&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!(e.target.closest&&e.target.closest('[contenteditable]'))){e.preventDefault();doUndo()}});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=EL.unsaved}});
const bump=v=>{const [a,b]=String(v||'0.0').split('.').map(n=>Number(n)||0);return a+'.'+(b+1)};
$('#ie-save').onclick=()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();const m=document.createElement('div');m.className='ie-modal';let who='';try{who=localStorage.getItem('sc4sap-if-author')||''}catch(e){}
m.innerHTML='<div><h3>'+esc(EL.saveTitle)+' — v'+esc(bump(D.version))+'</h3><label>'+esc(EL.author)+'</label><input id="ie-who" value="'+esc(who)+'"><label>'+esc(EL.note)+'</label><textarea id="ie-note" rows="3">'+esc(EL.noteDefault)+'</textarea><label>'+esc(EL.approver)+'</label><input id="ie-appr"><div class="btns"><button id="ie-x">'+esc(EL.cancel)+'</button><button class="pri" id="ie-ok">'+esc(EL.ok)+'</button></div></div>';document.body.appendChild(m);
m.querySelector('#ie-x').onclick=()=>m.remove();m.querySelector('#ie-ok').onclick=()=>{const author=m.querySelector('#ie-who').value.trim();if(!author){alert(EL.needAuthor);return}try{localStorage.setItem('sc4sap-if-author',author)}catch(e){}
const note=m.querySelector('#ie-note').value.trim();const approver=m.querySelector('#ie-appr').value.trim();m.remove();download(author,note,approver)}};
function download(author,note,approver){const base=D.version;D.baseVersion=D.baseVersion||base;D.version=bump(base);D.revisions.push({seq:D.revisions.length+1,version:D.version,date:new Date().toISOString().slice(0,10),text:note,author,approver});
// same name as build-if-spec.mjs pageBase(): <IF_ID>_<SAP object>_<name>
function pageBase(m){const id=s=>String(s||'').trim().replace(/[^A-Za-z0-9_.-]/g,'_');const sap=m.sap||{};const side=sap.side==='target'?'target':'source';const o=(sap[side]&&sap[side].object)||(sap.side==='both'&&sap.target&&sap.target.object)||(m.request&&m.request[side==='target'?'t':'s']||{}).object||'';const n=String((m.header&&m.header.name)||'').replace(/[\\/:*?"<>|\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);return [id(m.ifId),o?id(o):'',n].filter(Boolean).join('_')}
const doc=document.documentElement.cloneNode(true);doc.querySelector('#doc').innerHTML='';doc.querySelector('#checks ul').innerHTML='';doc.querySelector('body').className='';doc.querySelectorAll('.ie-modal,.ie-draft').forEach(x=>x.remove());
doc.querySelector('#if-model').textContent=JSON.stringify(D).replace(/</g,'\\u003c');
const blob=new Blob(['<!doctype html>\n'+doc.outerHTML],{type:'text/html'});const a=document.createElement('a');a.download=pageBase(D)+'-v'+D.version+'-'+D.lang+'-edited.html';a.href=URL.createObjectURL(blob);document.body.appendChild(a);a.click();a.remove();
dirty=false;undo.length=0;dropDraft();rerender();alert(EL.saved.replace('{v}',D.version))}
loadDraft().then(d=>{if(!d||!d.model||d.model===JSON.stringify(D))return;const b=document.createElement('div');b.className='ie-draft';b.innerHTML='<span>'+esc(EL.draft)+'</span><button data-r="1">'+esc(EL.resume)+'</button><button data-r="0">'+esc(EL.discard)+'</button>';document.body.appendChild(b);
b.onclick=e=>{const r=e.target.dataset.r;if(r==null)return;b.remove();if(r==='1'){replace(JSON.parse(d.model));dirty=true;setEdit(true)}else dropDraft()}});
`;

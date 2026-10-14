// config-to-document — the page's edit mode ("Edit" button in the top bar).
//
// A consultant or key user corrects the consultant notes and the reference
// panel in the finished document, with nothing installed and nothing loaded
// from the network. The system's values stay read-only: only the text written
// about them can change.
//   · click a text to change it (plain text); add or delete list items, add
//     notes to an activity that has none, delete a source
//   · undo every change (Ctrl+Z outside a text field, or the Undo button),
//     autosave to the browser (IndexedDB) with "continue editing" on reopen
//   · "Save" asks for author and change note and downloads the page again with
//     every edited note embedded (<script id="config-edits">);
//     `build-config-doc.mjs --import <file>` merges them into notes/edits.json,
//     so the next version keeps the edits.
//
// Edits replace the whole note of an activity and are system-specific: the
// knowledge base (notes.mjs kb) never takes them.

const LABELS = {
  ko: {
    edit: '편집', done: '편집 종료', save: '저장', undo: '되돌리기', add: '+ 항목 추가', del: '삭제', newNote: '+ 해설 추가',
    edited: '편집됨', draft: '저장하지 않은 편집이 있습니다', resume: '이어서 편집', discard: '버리기', unsaved: '저장하지 않은 변경이 있습니다.',
    saveTitle: '저장 — 변경 기록', author: '작성자', note: '변경 내용', noteDefault: '편집 모드에서 해설 수정', needAuthor: '작성자를 입력하세요.',
    ok: '저장', cancel: '취소', saved: '저장했습니다. 받은 HTML 파일을 담당 컨설턴트에게 보내 주세요.', placeholder: '내용을 입력하세요',
    hint: '편집 모드: 해설과 참고자료의 글자를 클릭해 고칩니다. 설정값 표는 시스템 값이라 고칠 수 없습니다.',
  },
  en: {
    edit: 'Edit', done: 'Done', save: 'Save', undo: 'Undo', add: '+ Add item', del: 'Delete', newNote: '+ Add notes',
    edited: 'Edited', draft: 'You have unsaved edits', resume: 'Continue editing', discard: 'Discard', unsaved: 'You have unsaved changes.',
    saveTitle: 'Save — change record', author: 'Author', note: 'Change', noteDefault: 'Notes edited in edit mode', needAuthor: 'Enter the author.',
    ok: 'Save', cancel: 'Cancel', saved: 'Saved. Send the downloaded HTML file to your consultant.', placeholder: 'Type here',
    hint: 'Edit mode: click any text of the notes and the reference panel to change it. The value tables are the system\'s and stay read-only.',
  },
};
export const editorLabels = (lang) => LABELS[String(lang || '').slice(0, 2).toLowerCase()] || LABELS.en;

export const EDITOR_STYLE = `
body.editing .ed{outline:1px dashed #9bb3cc;outline-offset:2px;border-radius:3px;cursor:text;min-width:2em;display:inline-block}
body.editing .ed:empty::before{content:attr(data-ph);color:var(--mute)}
body.editing .ed:focus{outline:2px solid #0a6ed1;background:#fff}
body.editing p.ed,body.editing td.ed{display:block}
.edx{border:0;background:none;color:var(--blocked);cursor:pointer;font-size:11px;padding:0 4px;margin-left:4px}
.edadd{border:1px dashed var(--line);background:#fff;color:var(--ink2);border-radius:6px;font:inherit;font-size:11.5px;padding:2px 9px;cursor:pointer;margin:2px 0 8px}
.edbadge{color:#7a4fb5;background:#efe6fa}
.ce-bar{display:none;position:sticky;top:0;z-index:5;background:#fff8dc;border-bottom:1px solid #e8d9a0;color:#6b5a1f;font-size:12.5px;padding:7px 34px}
body.editing .ce-bar{display:block}
#ce-undo,#ce-save{display:none}body.editing #ce-undo,body.editing #ce-save{display:inline-block}
.ce-modal{position:fixed;inset:0;background:rgba(10,20,32,.5);display:flex;align-items:center;justify-content:center;z-index:60}
.ce-modal div{background:#fff;border-radius:8px;padding:18px 20px;width:min(420px,92vw)}
.ce-modal h3{margin:0 0 12px;font-size:15px}.ce-modal label{display:block;font-size:12.5px;margin:8px 0 3px;color:var(--ink2)}
.ce-modal input,.ce-modal textarea{width:100%;font:inherit;padding:6px 9px;border:1px solid var(--line);border-radius:6px}
.ce-modal .btns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.ce-modal button{font:inherit;border:1px solid var(--line);background:#fff;border-radius:6px;padding:5px 12px;cursor:pointer}
.ce-modal button.pri{background:var(--ink);color:#fff;border-color:var(--ink)}
.ce-draft{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;border-radius:8px;padding:10px 14px;z-index:55;display:flex;gap:10px;align-items:center;font-size:13px}
.ce-draft button{font:inherit;font-size:12.5px;border:1px solid #4b6a8a;background:none;color:#fff;border-radius:6px;padding:3px 10px;cursor:pointer}
@media print{.edx,.edadd,.ce-bar{display:none!important}}
`;

// Runs inside the page script's closure: uses D, T, $, esc, cur, show, renderTree.
// The page's renderers call F() / FL() / EDIT to draw editable fields.
export const EDITOR_SCRIPT = String.raw`
const EL=D.EL;let EDIT=false;let dirty=false;const undo=[];const touched=new Set();
const CE=(()=>{try{return JSON.parse(document.getElementById('config-edits').textContent||'{}')}catch(e){return {}}})();
CE.edits=CE.edits||{};CE.log=CE.log||[];
// Diagrams are drawn at build time: an embedded edit keeps the drawing of an unchanged flow.
const keepSvg=(n,o)=>{for(const [i,c] of ((n&&n.cases&&n.cases.list)||[]).entries()){const p=o&&o.cases&&o.cases.list[i];if(!c.svg&&p&&JSON.stringify(p.flow)===JSON.stringify(c.flow))c.svg=p.svg}return n};
D.notes=D.notes||{};for(const [k,v] of Object.entries(CE.edits))if(v)D.notes[k]=keepSvg(v,D.notes[k]);
// Each note as the page opened it, to drop changes that were undone back to it.
const bare=n=>n?JSON.stringify({...n,edited:undefined}):null;const orig={};
const F=(path,text,tag,cls)=>{tag=tag||'span';const c=[cls,EDIT?'ed':''].filter(Boolean).join(' ');return '<'+tag+(c?' class="'+c+'"':'')+(EDIT?' contenteditable="plaintext-only" spellcheck="false" data-ph="'+esc(EL.placeholder)+'" data-a="'+esc(cur)+'" data-ef="'+esc(path)+'"':'')+'>'+esc(text)+'</'+tag+'>'};
const FL=(path,list,cls)=>{list=list||[];if(!EDIT)return list.length?'<ul'+(cls?' class="'+cls+'"':'')+'>'+list.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'';return '<ul'+(cls?' class="'+cls+'"':'')+'>'+list.map((x,i)=>'<li>'+F(path+'.'+i,x)+'<button class="edx" data-del="'+esc(path+'.'+i)+'" title="'+esc(EL.del)+'">✕</button></li>').join('')+'</ul><button class="edadd" data-add="'+esc(path)+'">'+esc(EL.add)+'</button>'};
const editedBadge=n=>n&&n.edited?'<span class="badge edbadge">'+esc(EL.edited)+(n.edited.author?' · '+esc(n.edited.author):'')+(n.edited.at?' · '+esc(new Date(n.edited.at).toLocaleDateString()):'')+'</span>':'';
const getAt=(o,p)=>p.split('.').reduce((x,k)=>x==null?x:x[k],o);
const setAt=(o,p,v)=>{const ks=p.split('.');const last=ks.pop();const t=ks.reduce((x,k)=>x[k]??(x[k]={}),o);t[last]=v};
const KEY='sc4sap-config-edit:'+location.pathname+':'+D.meta.system+':'+D.meta.module+':'+D.meta.extractedAt;
const idb=f=>new Promise(r=>{try{const q=indexedDB.open('sc4sap-config-doc',1);q.onupgradeneeded=()=>q.result.createObjectStore('drafts');q.onsuccess=()=>{try{const tx=q.result.transaction('drafts','readwrite');f(tx.objectStore('drafts'),r)}catch(e){r(null)}};q.onerror=()=>r(null)}catch(e){r(null)}});
const saveDraft=()=>idb((s,r)=>{const edits={};for(const id of touched)edits[id]=D.notes[id];const q=s.put({edits,at:Date.now()},KEY);q.onsuccess=()=>r(true);q.onerror=()=>r(false)});
const loadDraft=()=>idb((s,r)=>{const q=s.get(KEY);q.onsuccess=()=>r(q.result||null);q.onerror=()=>r(null)});
const dropDraft=()=>idb((s,r)=>{const q=s.delete(KEY);q.onsuccess=()=>r(true);q.onerror=()=>r(false)});
function rerender(){const m=$('#main').scrollTop,rf=$('#ref').scrollTop;cur?show(cur):home();$('#main').scrollTop=m;$('#ref').scrollTop=rf}
function change(id,fn){const before=D.notes[id]?JSON.stringify(D.notes[id]):null;if(!(id in orig))orig[id]=bare(D.notes[id]);fn();const n=D.notes[id];if(n)n.edited={...(n.edited||{}),at:new Date().toISOString()};undo.push({id,before});if(undo.length>300)undo.shift();touched.add(id);dirty=true;saveDraft()}
function setEdit(on){EDIT=on;document.body.classList.toggle('editing',on);$('#ce-edit').textContent=on?EL.done:EL.edit;rerender()}
$('#ce-edit').onclick=()=>setEdit(!EDIT);
$('#ce-undo').onclick=()=>doUndo();
function doUndo(){const u=undo.pop();if(!u)return;if(u.before==null)delete D.notes[u.id];else D.notes[u.id]=JSON.parse(u.before);touched.add(u.id);dirty=true;saveDraft();renderTree();rerender()}
document.addEventListener('keydown',e=>{if(EDIT&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.target.closest('[contenteditable]')){e.preventDefault();doUndo()}});
// Text fields: the note is written back when the field loses focus.
document.addEventListener('focusout',e=>{const el=EDIT&&e.target.closest&&e.target.closest('[contenteditable][data-ef]');const id=el&&el.dataset.a;if(!el||!id||!D.notes[id])return;const v=el.innerText.replace(/ /g,' ').replace(/\s+$/,'');const p=el.dataset.ef;if((getAt(D.notes[id],p)??'')===v)return;change(id,()=>setAt(D.notes[id],p,v))});
document.addEventListener('keydown',e=>{const el=EDIT&&e.target.closest&&e.target.closest('[contenteditable][data-ef]');if(el&&e.key==='Enter'){e.preventDefault();el.blur()}});
document.addEventListener('click',e=>{if(!EDIT||!cur)return;const a=e.target.closest('[data-add]');const d=e.target.closest('[data-del]');const nn=e.target.closest('[data-newnote]');
if(nn){change(cur,()=>{D.notes[cur]={purpose:'',impact:[],cautions:[],refs:[],sapdoc:'',cases:null,mix:'',compare:[],checklist:[],criteria:{},sources:[],review:'none',issues:[]}});renderTree();rerender();const f=document.querySelector('[data-ef="purpose"]');if(f)f.focus();return}
if(a){const p=a.dataset.add;change(cur,()=>{const l=getAt(D.notes[cur],p);if(Array.isArray(l))l.push('');else setAt(D.notes[cur],p,[''])});rerender();const l=getAt(D.notes[cur],p);const f=document.querySelector('[data-ef="'+p+'.'+(l.length-1)+'"]');if(f)f.focus();return}
if(d){const ks=d.dataset.del.split('.');const i=Number(ks.pop());const p=ks.join('.');change(cur,()=>getAt(D.notes[cur],p).splice(i,1));rerender()}});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=EL.unsaved}});
// Save: the page again, with every edit embedded; rendered parts are emptied so the file stays the original page.
$('#ce-save').onclick=()=>{const m=document.createElement('div');m.className='ce-modal ce-ui';let who='';try{who=localStorage.getItem('sc4sap-config-author')||''}catch(e){}
m.innerHTML='<div><h3>'+esc(EL.saveTitle)+'</h3><label>'+esc(EL.author)+'</label><input id="ce-who" value="'+esc(who)+'"><label>'+esc(EL.note)+'</label><textarea id="ce-note" rows="3">'+esc(EL.noteDefault)+'</textarea><div class="btns"><button id="ce-x">'+esc(EL.cancel)+'</button><button class="pri" id="ce-ok">'+esc(EL.ok)+'</button></div></div>';document.body.appendChild(m);
m.querySelector('#ce-x').onclick=()=>m.remove();m.querySelector('#ce-ok').onclick=()=>{const author=m.querySelector('#ce-who').value.trim();if(!author){alert(EL.needAuthor);return}try{localStorage.setItem('sc4sap-config-author',author)}catch(e){}const note=m.querySelector('#ce-note').value.trim();m.remove();download(author,note)}};
function download(author,note){const at=new Date().toISOString();const ids=[...touched].filter(id=>bare(D.notes[id])!==orig[id]);for(const id of ids){if(D.notes[id]){D.notes[id].edited={author,at};CE.edits[id]=D.notes[id]}else CE.edits[id]=null}CE.system=D.meta.system;CE.module=D.meta.module;CE.log.push({author,at,note,activities:ids});
const doc=document.documentElement.cloneNode(true);for(const s of ['#main','#ref','#tree'])doc.querySelector(s).innerHTML='';doc.querySelector('#count').textContent='';doc.querySelector('body').className='';doc.querySelectorAll('.ce-ui').forEach(x=>x.remove());doc.querySelector('#lb div').innerHTML='';doc.querySelector('#ce-edit').textContent=EL.edit;doc.querySelectorAll('.chip[aria-pressed]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.f==='all')));
doc.querySelector('#config-edits').textContent=JSON.stringify(CE).replace(/</g,'\\u003c');
const blob=new Blob(['<!doctype html>\n'+doc.outerHTML],{type:'text/html'});const a=document.createElement('a');const base=decodeURIComponent(location.pathname.split('/').pop()||'config.html');a.download=/-edited\.html$/.test(base)?base:base.replace(/\.html?$/i,'')+'-edited.html';a.href=URL.createObjectURL(blob);document.body.appendChild(a);a.click();a.remove();
dirty=false;touched.clear();undo.length=0;for(const k of Object.keys(orig))delete orig[k];dropDraft();renderTree();rerender();alert(EL.saved)}
loadDraft().then(d=>{if(!d||!d.edits||!Object.keys(d.edits).length)return;const b=document.createElement('div');b.className='ce-draft ce-ui';b.innerHTML='<span>'+esc(EL.draft)+'</span><button data-r="1">'+esc(EL.resume)+'</button><button data-r="0">'+esc(EL.discard)+'</button>';document.body.appendChild(b);
b.onclick=e=>{const r=e.target.dataset.r;if(r==null)return;b.remove();if(r==='1'){for(const [id,n] of Object.entries(d.edits)){if(!(id in orig))orig[id]=bare(D.notes[id]);if(n)D.notes[id]=keepSvg(n,D.notes[id]);else delete D.notes[id];touched.add(id)}dirty=true;renderTree();setEdit(true)}else dropDraft()}});
`;

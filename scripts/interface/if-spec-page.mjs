// interface-mapping-spec — the page: one self-contained HTML file laid out like
// the mapping-specification template (cover, revision history, mapping sheet
// with request / response grids and footer, field guide), drawn in the browser
// from the embedded model. Edit mode lives in if-spec-editor.mjs.

import { GUIDE, codeLists } from './if-codes.mjs';
import { VALIDATE_SRC, MESSAGES_SRC } from './if-validate.mjs';
import { renumber, orderRows, newGroupId } from './if-model.mjs';
import { EDITOR_STYLE, EDITOR_SCRIPT } from './if-spec-editor.mjs';

const LABELS = {
  ko: {
    cover: '표지', history: '개정이력', sheet: '매핑 정의서', guide: '항목설명',
    seq: '순번', version: '버전', date: '변경 일자', change: '변경 내용', author: '작성자', approver: '승인자',
    historyNote: '※ 변경이 발생되는 위치와 변경 내용을 자세히 기록', required: '※ 별표(*)는 필수 항목',
    asyncNote: '※ 송신 시스템이 보내고 수신 시스템이 받고 끝나는 비동기 인터페이스는 응답 블록 없이 작성',
    source: 'Source System', target: 'Target System', response: '응답 (Source ← Target)', request: '요청 (Source → Target)',
    ifId: '인터페이스 ID', name: '인터페이스 명', summary: '인터페이스 개요', detail: '인터페이스 상세 설명', transfer: '전송방식',
    trigger: '인터페이스 구동방식', cycle: '인터페이스 주기', cycleCount: '인터페이스 주기 별 회수', perRun: '1회 전송 건수',
    recordSize: '건당 데이터 크기', relation: '송/수신 시스템 관계', targetLogic: 'Target 기본 로직', writtenBy: '매핑 정의서 작성자',
    writtenAt: '매핑 정의서 작성일', system: '시스템 명', module: '모듈 명', region: '지역', owner: '시스템 담당자',
    adapter: 'I/F Methods (Adapter)', object: 'Object', structure: 'Structure', cardinality: '필수(반복) 구분',
    table: 'Table', field: 'Field', key: 'Key', type: 'Type', size: 'Size', nul: 'Null', desc: 'Desc', 
    rules: '컬럼별 변환규칙', extract: '데이터 추출조건', remarks: '특이사항', etc: '기타',
    item: '항목', req: '필수', expl: '설명', checks: '검증', noFindings: '검증 결과 문제가 없습니다.', print: '인쇄',
    errors: '오류', warns: '경고', infos: '확인', proposed: '제안', added: 'SAP 추가', changed: 'SAP 변경', removed: 'SAP 삭제',
    ddic: 'SAP DDIC', was: '이전', companion: 'English', fromGroups: '아래 그리드의 그룹(▸)에서 자동 요약', groupName: '이름', sapRead: 'SAP에서 읽음', guideTitle: '매핑 정의서 항목설명',
  },
  en: {
    cover: 'Cover', history: 'Revision history', sheet: 'Mapping specification', guide: 'Field guide',
    seq: 'No.', version: 'Version', date: 'Date', change: 'Change', author: 'Author', approver: 'Approver',
    historyNote: '※ Record where the change happened and what changed, in detail', required: '※ Items marked * are required',
    asyncNote: '※ A one-way asynchronous interface (sender sends, receiver takes it, done) has no response block',
    source: 'Source system', target: 'Target system', response: 'Response (Source ← Target)', request: 'Request (Source → Target)',
    ifId: 'Interface ID', name: 'Interface name', summary: 'Summary', detail: 'Details', transfer: 'Transfer mode',
    trigger: 'Trigger', cycle: 'Cycle', cycleCount: 'Runs per cycle', perRun: 'Records per run',
    recordSize: 'Size per record', relation: 'Sender / receiver relation', targetLogic: 'Target logic', writtenBy: 'Author',
    writtenAt: 'Date written', system: 'System', module: 'Module', region: 'Region', owner: 'System owner',
    adapter: 'I/F method (adapter)', object: 'Object', structure: 'Structure', cardinality: 'Occurrence',
    table: 'Table', field: 'Field', key: 'Key', type: 'Type', size: 'Size', nul: 'Null', desc: 'Desc', 
    rules: 'Conversion rules', extract: 'Extraction condition', remarks: 'Remarks', etc: 'Other',
    item: 'Item', req: 'Req.', expl: 'Explanation', checks: 'Checks', noFindings: 'No findings.', print: 'Print',
    errors: 'Errors', warns: 'Warnings', infos: 'To confirm', proposed: 'Proposal', added: 'Added in SAP', changed: 'Changed in SAP', removed: 'Removed in SAP',
    ddic: 'SAP DDIC', was: 'Before', companion: '한국어', fromGroups: 'Summary of the groups (▸) in the grid below', groupName: 'Name', sapRead: 'Read from SAP', guideTitle: 'Mapping specification — field guide',
  },
};
export const pageLabels = (lang) => LABELS[String(lang || '').slice(0, 2)] || LABELS.en;

const STYLE = `
:root{--src:#eef4fb;--srch:#d7e5f5;--srcd:#2c5a8c;--tgt:#eff8ec;--tgth:#d9ecd2;--tgtd:#3d7343;--ink:#1d2d3e;--ink2:#475e75;--mute:#8396a8;--line:#c9d3dd;--soft:#f3f6f9;--head:#dfe8f1;--accent:#0a6ed1;--err:#bb0000;--warn:#c35500;--info:#0a6ed1;--prop:#eef6ff;--added:#e8f6ea;--changed:#fff6db;--removed:#fbeaea}
*{box-sizing:border-box}html,body{margin:0}body{background:#eef1f4;color:var(--ink);font:13px/1.45 "Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif}
.top{position:sticky;top:0;z-index:20;background:var(--ink);color:#fff;display:flex;align-items:center;gap:10px;padding:8px 18px;flex-wrap:wrap}
.top h1{font-size:14.5px;margin:0;font-weight:600;flex:1;min-width:200px}.top .ver{background:#ffffff26;border-radius:10px;padding:1px 8px;font-size:12px}
.top button,.top a{font:inherit;font-size:12.5px;background:none;border:1px solid #ffffff55;color:#fff;border-radius:6px;padding:3px 11px;cursor:pointer;text-decoration:none}
.top .cnt{display:inline-block;min-width:18px;border-radius:9px;padding:0 5px;margin-left:4px;font-size:11px;background:#ffffff33}.top .cnt.e{background:var(--err)}
#doc{max-width:1500px;margin:0 auto;padding:18px 16px 60px}
section.pg{background:#fff;border:1px solid var(--line);border-radius:6px;padding:22px 26px;margin:0 0 18px}
section.pg>h2{font-size:16px;margin:0 0 14px;padding-bottom:6px;border-bottom:2px solid var(--ink)}
.cover{text-align:center;padding:60px 26px 30px!important;min-height:520px;display:flex;flex-direction:column}
.cover .proj{font-size:15px;color:var(--ink2);margin-top:40px}.cover .title{font-size:30px;font-weight:700;margin:26px 0 30px;letter-spacing:.04em}
.cover .docno{font-size:14px}.cover .ifname{font-size:14px;margin-top:4px}.cover .cv{font-size:14px;margin-top:4px;font-weight:600}
.cover .copy{margin-top:auto;font-size:11.5px;color:var(--ink2)}
table{border-collapse:collapse;width:100%}th,td{border:1px solid var(--line);padding:4px 6px;vertical-align:top;text-align:left}
th{background:var(--head);font-weight:600;white-space:nowrap}td{word-break:break-word}
.hdr th{width:15%}.hdr td{width:35%}
.sides th{width:15%}.sides td{width:31%}.sides .arrow{width:8%;text-align:center;font-size:22px;color:var(--ink2);vertical-align:middle;background:var(--soft)}
.blk{margin-top:18px}.blk>h3{font-size:13.5px;margin:0 0 8px;color:var(--ink2)}
.grid{font-size:12px;table-layout:fixed}.grid th{text-align:center}.grid td{min-height:20px}
.grid .grp{background:var(--ink);color:#fff}.grid .rc{background:#fff4e0;text-align:center;font-weight:600}
.grid td.no{text-align:center;white-space:nowrap;font-weight:600}.grid td.cen{text-align:center}
td.sc{background:var(--src)}td.tc{background:var(--tgt)}th.sc{background:var(--srch)}th.tc{background:var(--tgth)}
.grp.sc,.grid th.grp.sc{background:var(--srcd);color:#fff}.grp.tc,.grid th.grp.tc{background:var(--tgtd);color:#fff}
.grid tr.gh td{font-weight:600;font-size:11.5px;padding:3px 6px;border-top:2px solid var(--ink2)}.grid tr.gh td.sc{background:var(--srch)}.grid tr.gh td.tc{background:var(--tgth)}
.grid tr.gh .gk{color:var(--ink2);font-weight:400;margin-left:6px}.grid tr.gh span.ed{min-width:3em;display:inline-block}.grid tr.gh select{width:auto!important;margin-left:4px}
.sides td.sum{color:var(--ink2);font-size:12px}
.grid tr.prop td.pc{color:#1f5fa8;font-style:italic}.grid tr.sync-added td.no{background:var(--added)}.grid tr.sync-changed td.no{background:var(--changed)}
.grid tr.sync-removed td{text-decoration:line-through;color:var(--mute);background:var(--removed)}
.bdg{display:inline-block;font-size:10px;font-weight:600;border-radius:8px;padding:0 5px;margin-left:3px;vertical-align:1px;text-decoration:none}
.bdg.p{background:#d6e9ff;color:#0a4f99}.bdg.a{background:#cdebd2;color:#1d6b2c}.bdg.c{background:#ffe7a8;color:#7a5200}.bdg.r{background:#f6c9c9;color:#8a1010}
.dd{border-bottom:1px dotted var(--mute);cursor:help}
.foot th{width:15%;vertical-align:top}.foot td.rid{width:60px;text-align:center;font-weight:600}.mono{font-family:Consolas,"D2Coding",monospace;font-size:12px;white-space:pre-wrap}
.ml{white-space:pre-wrap}.tip{color:var(--mute);cursor:help;font-weight:400;margin-left:3px}
.note{color:var(--ink2);font-size:12px;margin:4px 0}.right{text-align:right}
.v-error{box-shadow:inset 0 0 0 2px var(--err)}.v-warn{box-shadow:inset 0 0 0 2px var(--warn)}.flash{animation:fl 1.2s 2}@keyframes fl{50%{background:#ffe08a}}
#checks{position:fixed;right:14px;top:56px;bottom:14px;width:330px;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 6px 24px #0002;z-index:30;display:none;flex-direction:column}
body.checks #checks{display:flex}#checks h3{margin:0;padding:10px 14px;font-size:13.5px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between}
#checks h3 button{border:0;background:none;cursor:pointer;font-size:14px}#checks ul{list-style:none;margin:0;padding:6px 8px;overflow:auto}
#checks li{padding:5px 8px;border-radius:5px;cursor:pointer;font-size:12.5px;display:flex;gap:7px}#checks li:hover{background:var(--soft)}
#checks .s{font-weight:700;flex:none;width:14px}#checks .s.error{color:var(--err)}#checks .s.warn{color:var(--warn)}#checks .s.info{color:var(--info)}
#checks .where{color:var(--mute);font-size:11px;display:block}
@media (max-width:900px){#doc{padding:10px}section.pg{padding:14px}.gwrap{overflow-x:auto}.grid{min-width:1100px}#checks{width:auto;left:10px}}
@media print{@page{size:A4 landscape;margin:10mm}body{background:#fff}.top,#checks,.noprint{display:none!important}#doc{max-width:none;padding:0}
section.pg{border:0;padding:0;margin:0 0 6mm;break-after:page}section.pg:last-child{break-after:auto}.grid{font-size:9.5px}.v-error,.v-warn{box-shadow:none}.tip{display:none}}
`;

// Page renderer (runs in the browser). D = model, P = cover settings, C = code lists, G = guide, L = labels.
const SCRIPT = String.raw`
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const D=JSON.parse($('#if-model').textContent);const P=JSON.parse($('#if-project').textContent);const C=JSON.parse($('#if-codes').textContent);
const G=JSON.parse($('#if-guide').textContent);const L=JSON.parse($('#if-labels').textContent);const M=JSON.parse($('#if-msgs').textContent);const LANG=D.lang||'ko';
const getAt=(o,p)=>p.split('.').reduce((x,k)=>x==null?x:x[k],o);
const setAt=(o,p,v)=>{const ks=p.split('.');const last=ks.pop();const t=ks.reduce((x,k)=>x[k]??(x[k]={}),o);t[last]=v};
const FC={kind:'structure',card:'cardinality',transfer:'transfer',trigger:'trigger',cycle:'cycle',relation:'relation',region:'region',adapter:'adapter',structure:'structure',cardinality:'cardinality',key:'yn',type:'dataType',nul:'yn'};
const cv=e=>typeof e==='string'?e:e.v;const cl=e=>typeof e==='string'?e:(e[LANG]||e.en||e.v);
let EDIT=false;let FINDINGS=[];
const isSap=side=>D.sap&&(D.sap.side===side||D.sap.side==='both');
// Display text of a stored value: code labels in the page language.
function shown(path,v){const f=path.split('.').pop();const list=C[FC[f]];if(list&&v!==''&&v!=null){const e=list.find(x=>cv(x)===v);if(e)return cl(e)}return v??''}
// One cell: plain text, a code-list select or a multi-line text, editable in edit mode.
function cell(path,o){o=o||{};const tag=o.tag||'td';const v=getAt(D,path)??'';const f=path.split('.').pop();const code=o.code===false?null:C[FC[f]]&&!o.free?FC[f]:null;
const cls=[o.cls,o.ml?'ml':'',o.mono?'mono':''].filter(Boolean).join(' ');const attrs=(cls?' class="'+cls+'"':'')+' data-p="'+esc(path)+'"'+(o.title?' title="'+esc(o.title)+'"':'')+(o.colspan?' colspan="'+o.colspan+'"':'');
if(EDIT&&!o.ro){if(code){const list=C[code];const opts=['<option value=""></option>'].concat(list.map(e=>'<option value="'+esc(cv(e))+'"'+(cv(e)===v?' selected':'')+'>'+esc(cl(e))+'</option>'));if(v&&!list.some(e=>cv(e)===v))opts.push('<option selected value="'+esc(v)+'">'+esc(v)+'</option>');return '<'+tag+attrs+'><select data-p="'+esc(path)+'">'+opts.join('')+'</select></'+tag+'>'}
return '<'+tag+attrs.replace(' class="',' class="ed ')+(cls?'':' class="ed"')+' contenteditable="plaintext-only" spellcheck="false"'+(o.ml?' data-ml="1"':'')+'>'+esc(v)+'</'+tag+'>'}
return '<'+tag+attrs+'>'+esc(shown(path,v))+(o.after||'')+'</'+tag+'>'}
function lbl(k,star){const g=G[k];const req=star!=null?star:(g&&g[0]);return (req?'* ':'')+esc(L[k==='author'?'writtenBy':k]||k)+(g?'<span class="tip" title="'+esc(LANG==='ko'?g[1]:g[2])+'">ⓘ</span>':'')}
function cover(){const ver='Ver '+esc(D.version);const copy=(P.copyright||[]).map(x=>'<div>'+esc(x)+'</div>').join('');
return '<section class="pg cover" id="s-cover"><div class="proj">'+esc(P.projectName||'')+'</div><div class="title">'+esc(P.title||'')+'</div><div class="docno">'+esc(P.docNo||'')+'</div><div class="ifname">('+esc(D.header.name||'')+')</div><div class="cv">'+ver+'</div><div class="copy">'+copy+'</div></section>'}
function history(){const rows=(D.revisions||[]).map((r,i)=>'<tr>'+'<td class="right">'+(i+1)+'</td>'+cell('revisions.'+i+'.version')+cell('revisions.'+i+'.date')+cell('revisions.'+i+'.text',{ml:true})+cell('revisions.'+i+'.author')+cell('revisions.'+i+'.approver')+(EDIT?'<td class="noprint"><button class="edx" data-rdel="'+i+'">✕</button></td>':'')+'</tr>').join('');
return '<section class="pg" id="s-history"><h2>'+esc(L.history)+'</h2><table><thead><tr><th style="width:56px">'+esc(L.seq)+'</th><th style="width:70px">'+esc(L.version)+'</th><th style="width:110px">'+esc(L.date)+'</th><th>'+esc(L.change)+'</th><th style="width:150px">'+esc(L.author)+'</th><th style="width:150px">'+esc(L.approver)+'</th>'+(EDIT?'<th class="noprint"></th>':'')+'</tr></thead><tbody>'+rows+'</tbody></table>'+(EDIT?'<button class="edadd" data-radd="1">'+esc(EL.addRow)+'</button>':'')+'<p class="note">'+esc(L.historyNote)+'</p></section>'}
function header(){const H=[['ifId'],['name'],['summary'],['detail'],['transfer','trigger'],['cycle','cycleCount'],['perRun','recordSize'],['relation','targetLogic'],['author','writtenAt']];
return '<table class="hdr">'+H.map(r=>'<tr>'+r.map(k=>'<th>'+lbl(k)+'</th>'+cell(k==='ifId'?'ifId':'header.'+k,{colspan:r.length===1?3:1,ro:k==='ifId',ml:['detail','summary'].includes(k),free:k==='targetLogic'})).join('')+'</tr>').join('')+'</table>'}
function carrierText(c){c=c||{};return [c.name,shown('x.kind',c.kind||''),c.card].filter(Boolean).join(' · ')}
function summary(b,sd){const seen=new Set();return (b.groups||[]).map(g=>g[sd]||{}).filter(c=>c.kind).map(c=>shown('x.kind',c.kind)+' '+(c.card||'')+(c.name?' ('+c.name+')':'')).filter(x=>!seen.has(x)&&seen.add(x)).join(', ')}
function sides(bk){const b=D[bk];const items=bk==='request'?['system','module','region','owner','adapter','object']:['object'];
const star=(k,side)=>k==='module'?isSap(side):k==='adapter'?side==='source':null;
return '<table class="sides"><tr><th colspan="2" class="grp sc">'+esc(L.source)+(isSap('source')?' <span class="bdg p">SAP</span>':'')+'</th><td class="arrow" rowspan="'+(items.length+2)+'">'+(bk==='request'?'→':'←')+'</td><th colspan="2" class="grp tc">'+esc(L.target)+(isSap('target')?' <span class="bdg p">SAP</span>':'')+'</th></tr>'+
items.map(k=>'<tr><th class="sc">'+lbl(k,star(k,'source'))+'</th>'+cell(bk+'.source.'+k,{cls:'sc'})+'<th class="tc">'+lbl(k,star(k,'target'))+'</th>'+cell(bk+'.target.'+k,{cls:'tc'})+'</tr>').join('')+
'<tr><th class="sc">'+lbl('structure',true)+' / '+esc(L.cardinality)+'</th><td class="sc sum" title="'+esc(L.fromGroups)+'">'+esc(summary(b,'s'))+'</td><th class="tc">'+lbl('structure',true)+' / '+esc(L.cardinality)+'</th><td class="tc sum" title="'+esc(L.fromGroups)+'">'+esc(summary(b,'t'))+'</td></tr></table>'}
const COLS=['table','field','key','type','size','nul','desc'];
const W={no:46,table:96,field:110,key:38,type:84,size:46,nul:38,desc:150,r:34,map:62};
function cellTitle(c,k,r,sd){const t=[];if(k==='type'&&c.ddic)t.push(L.ddic+': '+c.ddic);if(r.was&&r.sync==='changed'&&((sd==='s'&&isSap('source'))||(sd==='t'&&isSap('target')))&&k in r.was)t.push(L.was+': '+r.was[k]);return t.join('\n')}
function grid(bk){const b=D[bk];const rows=b.rows||[];
const head='<colgroup><col style="width:'+W.no+'px">'+COLS.map(k=>'<col style="width:'+W[k]+'px">').join('')+'<col style="width:'+W.r+'px">'+COLS.slice(0,6).map(k=>'<col style="width:'+W[k]+'px">').join('')+'<col style="width:'+W.map+'px"><col style="width:'+W.desc+'px">'+(EDIT?'<col class="noprint" style="width:118px">':'')+'</colgroup>'+
'<thead><tr><th colspan="8" class="grp sc">'+esc(L.source)+'</th><th class="grp">'+(bk==='request'?'→':'←')+'</th><th colspan="8" class="grp tc">'+esc(L.target)+'</th>'+(EDIT?'<th class="noprint"></th>':'')+'</tr><tr><th>No</th>'+
COLS.map(k=>'<th class="sc">'+lbl(k,k==='table'?false:null)+'</th>').join('')+'<th class="rc">R'+'<span class="tip" title="'+esc(LANG==='ko'?G.rule[1]:G.rule[2])+'">ⓘ</span></th>'+COLS.slice(0,6).map(k=>'<th class="tc">'+lbl(k,k==='table'?false:null)+'</th>').join('')+'<th class="tc">MAPPING<span class="tip" title="'+esc(LANG==='ko'?G.mapping[1]:G.mapping[2])+'">ⓘ</span></th><th class="tc">'+lbl('desc')+'</th>'+(EDIT?'<th class="noprint"></th>':'')+'</tr></thead>';
const pside=isSap('source')&&!isSap('target')?'t':isSap('target')&&!isSap('source')?'s':'';
const rowHtml=(r,i)=>{const p=bk+'.rows.'+i;const sy=['added','changed','removed'].includes(r.sync)?r.sync:'';const bd=(r.proposed?'<span class="bdg p">'+esc(L.proposed)+'</span>':'')+(sy?'<span class="bdg '+sy[0]+'">'+esc(L[sy])+'</span>':'');
const cc=(sd,k)=>['key','size','nul'].includes(k)?'cen ':'';const sc=k=>cell(p+'.s.'+k,{cls:cc('s',k)+'sc'+(pside==='s'?' pc':''),title:cellTitle(r.s||{},k,r,'s')});
const tc=k=>cell(p+'.t.'+k,{cls:cc('t',k)+'tc'+(pside==='t'?' pc':''),title:cellTitle(r.t||{},k,r,'t')});
const tools=EDIT?'<td class="noprint tools">'+[['up','↑'],['down','↓'],['ins','+'],['del','✕']].map(([a,s])=>'<button class="edx" data-row="'+bk+'|'+i+'|'+a+'">'+s+'</button>').join('')+(r.proposed?'<button class="edx ok" data-row="'+bk+'|'+i+'|ok" title="'+esc(EL.confirm)+'">✓</button>':'')+'</td>':'';
return '<tr class="'+[r.proposed?'prop':'',sy?'sync-'+sy:''].join(' ')+'"><td class="no" data-p="'+p+'.no">'+esc(r.no)+bd+'</td>'+COLS.map(sc).join('')+cell(p+'.r',{cls:'rc'})+COLS.slice(0,6).map(tc).join('')+cell(p+'.map',{cls:'cen tc'})+tc('desc')+tools+'</tr>'};
const sapRo=sd=>!!(D.sap&&D.sap[sd==='s'?'source':'target']&&D.sap[sd==='s'?'source':'target'].object);
const gHead=(g,gi)=>{const half=sd=>{const c=g[sd]||{};const gp=bk+'.groups.'+gi+'.'+sd;if(!EDIT)return '▸ '+(c.kind==='PARAMETER'&&!c.name?['kind','card']:['name','kind','card']).map(k=>'<span data-p="'+gp+'.'+k+'">'+esc(shown(gp+'.'+k,c[k]||'')||'—')+'</span>').join(' · ')+(c.ddic&&c.ddic!==c.name?'<span class="gk">'+esc(c.ddic)+'</span>':'');
return '▸ '+cell(gp+'.name',{tag:'span',ro:sapRo(sd)&&!!c.name,code:false})+cell(gp+'.kind',{tag:'span'})+cell(gp+'.card',{tag:'span'})};
const tools=EDIT?'<td class="noprint tools"><button class="edx" data-grow="'+bk+'|'+gi+'|add" title="'+esc(EL.addRow)+'">+</button><button class="edx" data-grow="'+bk+'|'+gi+'|del" title="'+esc(EL.delGroup)+'">✕</button></td>':'';
return '<tr class="gh"><td colspan="8" class="sc">'+half('s')+'</td><td class="rc"></td><td colspan="8" class="tc">'+half('t')+'</td>'+tools+'</tr>'};
const groups=b.groups&&b.groups.length?b.groups:[{id:'',s:{},t:{}}];
const body=groups.map((g,gi)=>(b.groups&&b.groups.length?gHead(g,gi):'')+rows.map((r,i)=>r.g===g.id||!b.groups||!b.groups.length?rowHtml(r,i):'').join('')).join('');
return '<div class="gwrap"><table class="grid">'+head+'<tbody>'+body+'</tbody></table></div>'+(EDIT?'<div class="noprint"><button class="edadd" data-row="'+bk+'|'+rows.length+'|add">'+esc(EL.addRow)+'</button> <button class="edadd" data-gadd="'+bk+'">'+esc(EL.addGroup)+'</button>'+(rows.some(r=>r.proposed)?' <button class="edadd" data-confirm="'+bk+'">✓ '+esc(EL.confirmAll)+'</button>':'')+'</div>':'')}
function foot(){const rules=D.rules||[];const ex=D.extract||[];
const rr=rules.map((r,i)=>'<tr>'+(i===0?'<th rowspan="'+rules.length+'">'+lbl('rules')+'</th>':'')+cell('rules.'+i+'.id',{cls:'rid',after:r.proposed?'<span class="bdg p">'+esc(L.proposed)+'</span>':''})+cell('rules.'+i+'.text',{ml:true})+(EDIT?'<td class="noprint"><button class="edx" data-ldel="rules|'+i+'">✕</button></td>':'')+'</tr>').join('')||'<tr><th>'+lbl('rules')+'</th><td colspan="2"></td>'+(EDIT?'<td class="noprint"></td>':'')+'</tr>';
const er=ex.map((x,i)=>'<tr>'+(i===0?'<th rowspan="'+ex.length+'">'+lbl('extract')+'</th>':'')+cell('extract.'+i,{ml:true,mono:true,colspan:2})+(EDIT?'<td class="noprint"><button class="edx" data-ldel="extract|'+i+'">✕</button></td>':'')+'</tr>').join('')||'<tr><th>'+lbl('extract')+'</th><td colspan="2"></td>'+(EDIT?'<td class="noprint"></td>':'')+'</tr>';
return '<table class="foot blk">'+rr+(EDIT?'<tr class="noprint"><th></th><td colspan="3"><button class="edadd" data-ladd="rules">'+esc(EL.addRule)+'</button></td></tr>':'')+er+(EDIT?'<tr class="noprint"><th></th><td colspan="3"><button class="edadd" data-ladd="extract">'+esc(EL.addSql)+'</button></td></tr>':'')+
'<tr><th>'+lbl('remarks')+'</th>'+cell('remarks',{ml:true,colspan:2})+(EDIT?'<td class="noprint"></td>':'')+'</tr><tr><th>'+lbl('etc')+'</th>'+cell('etc',{ml:true,colspan:2})+(EDIT?'<td class="noprint"></td>':'')+'</tr></table>'}
function sheet(){const res=D.response?'<div class="blk"><h3>'+esc(L.response)+(EDIT?' <button class="edadd" data-resp="0">'+esc(EL.dropResponse)+'</button>':'')+'</h3>'+sides('response')+'<div style="height:8px"></div>'+grid('response')+'</div>':(EDIT?'<div class="blk noprint"><button class="edadd" data-resp="1">'+esc(EL.addResponse)+'</button></div>':'');
return '<section class="pg" id="s-sheet"><h2>'+esc(P.title||L.sheet)+'</h2><p class="note right">'+esc(L.required)+'</p><p class="note">'+esc(L.asyncNote)+'</p>'+header()+'<div class="blk"><h3>'+esc(L.request)+'</h3>'+sides('request')+'<div style="height:8px"></div>'+grid('request')+'</div>'+res+foot()+'</section>'}
function guide(){return '<section class="pg" id="s-guide"><h2>'+esc(L.guideTitle)+'</h2><table><thead><tr><th style="width:200px">'+esc(L.item)+'</th><th style="width:60px">'+esc(L.req)+'</th><th>'+esc(L.expl)+'</th></tr></thead><tbody>'+
Object.entries(G).map(([k,g])=>'<tr><td>'+esc(L[k==='author'?'writtenBy':k]||(k==='rule'?'R':k==='mapping'?'MAPPING':k))+'</td><td class="cen">'+(g[0]?'Y':'N')+'</td><td class="ml">'+esc(LANG==='ko'?g[1]:g[2])+'</td></tr>').join('')+'</tbody></table></section>'}
function where(path){const gm=/^(request|response)\.groups\.(\d+)\.(s|t)\.(\w+)$/.exec(path);if(gm){const c=getAt(D,gm[1]+'.groups.'+gm[2]+'.'+gm[3])||{};return (gm[3]==='s'?L.source:L.target)+' · ▸ '+(c.name||shown('x.kind',c.kind||'')||'—')+' · '+(gm[4]==='kind'?L.structure:gm[4]==='card'?L.cardinality:L.groupName)}
const m=/^(request|response)\.rows\.(\d+)\.(s|t|r|map|no)\.?(\w*)$/.exec(path);if(m){const r=getAt(D,m[1]+'.rows.'+m[2]);return (r&&r.no||'')+' · '+(m[3]==='s'?L.source:m[3]==='t'?L.target:m[3]==='r'?'R':m[3]==='map'?'MAPPING':'No')+(m[4]?' · '+m[4]:'')}
const k=path.split('.');const last=k[k.length-1];return (k[0]==='request'||k[0]==='response'?(k[1]==='source'?L.source:L.target)+' · ':'')+(L[last==='author'?'writtenBy':last]||last)}
function msg(f){return (M[LANG]||M.en)[f.code].replace(/\{(\w+)\}/g,(_,k)=>f.args&&f.args[k]!=null?f.args[k]:'')}
function checks(){FINDINGS=ifValidate(D);const n={error:0,warn:0,info:0};for(const f of FINDINGS)n[f.sev]++;
$('#ck-n').textContent=n.error+n.warn;$('#ck-n').className='cnt'+(n.error?' e':'');
$('#checks ul').innerHTML=FINDINGS.length?FINDINGS.map((f,i)=>'<li data-f="'+i+'"><span class="s '+f.sev+'">'+(f.sev==='error'?'✕':f.sev==='warn'?'!':'i')+'</span><span>'+esc(msg(f))+'<span class="where">'+esc(where(f.path))+'</span></span></li>').join(''):'<li>'+esc(L.noFindings)+'</li>';
$('#ck-sum').textContent=L.errors+' '+n.error+' · '+L.warns+' '+n.warn+' · '+L.infos+' '+n.info;
document.querySelectorAll('.v-error,.v-warn').forEach(x=>x.classList.remove('v-error','v-warn'));
for(const f of FINDINGS){if(f.sev==='info')continue;const el=document.querySelector('td[data-p="'+CSS.escape(f.path)+'"],th[data-p="'+CSS.escape(f.path)+'"],span[data-p="'+CSS.escape(f.path)+'"]');if(el&&!el.classList.contains('v-error'))el.classList.add(f.sev==='error'?'v-error':'v-warn')}}
function render(){$('#doc').innerHTML=cover()+history()+sheet()+guide();$('#ttl').textContent=D.ifId+' · '+(D.header.name||'');$('#ver').textContent='v'+D.version;checks()}
$('#ck-btn').onclick=()=>document.body.classList.toggle('checks');$('#ck-x').onclick=()=>document.body.classList.remove('checks');
$('#checks ul').addEventListener('click',e=>{const li=e.target.closest('li[data-f]');if(!li)return;const f=FINDINGS[li.dataset.f];const el=document.querySelector('[data-p="'+CSS.escape(f.path)+'"]');if(!el)return;el.scrollIntoView({block:'center',behavior:'smooth'});el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash')});
$('#pr-btn').onclick=()=>window.print();
`;

const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

/**
 * The page. model = the document model; project = { projectName, title, docNo, copyright[] } for the
 * page language; codes = project code-list overrides; companion = file name of the other-language page.
 */
export function pageHtml({ model, project = {}, codes = {}, companion = '' }) {
  const lang = /^[a-z]{2}$/.test(model.lang || '') ? model.lang : 'ko';
  const L = pageLabels(lang);
  const title = `${model.ifId} ${model.header?.name || ''} — ${project.title || L.sheet} v${model.version}`;
  const guide = Object.fromEntries(Object.entries(GUIDE));
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/[<&]/g, '')}</title>
<meta name="generator" content="sc4sap interface-mapping-spec">
<style>${STYLE}${EDITOR_STYLE}</style></head>
<body>
<div class="top"><h1 id="ttl"></h1><span class="ver" id="ver"></span>
<button id="ck-btn">${L.checks}<span class="cnt" id="ck-n">0</span></button>
<button id="ie-edit"></button><button id="ie-undo"></button><button id="ie-save"></button>
<button id="pr-btn">${L.print}</button>${companion ? `<a href="${encodeURI(companion)}">${L.companion}</a>` : ''}</div>
<div class="ie-bar" id="ie-bar"></div>
<main id="doc"></main>
<aside id="checks"><h3><span>${L.checks}</span><button id="ck-x">✕</button></h3><div class="note" id="ck-sum" style="padding:6px 14px 0"></div><ul></ul></aside>
<script type="application/json" id="if-model">${json(model)}</script>
<script type="application/json" id="if-project">${json(project)}</script>
<script type="application/json" id="if-codes">${json(codeLists(codes))}</script>
<script type="application/json" id="if-guide">${json(guide)}</script>
<script type="application/json" id="if-labels">${json(L)}</script>
<script type="application/json" id="if-msgs">${MESSAGES_SRC.replace(/</g, '\\u003c')}</script>
<script>
${VALIDATE_SRC}
${renumber.toString()}
${orderRows.toString()}
${newGroupId.toString()}
${SCRIPT}
${EDITOR_SCRIPT}
render();
</script>
</body></html>
`;
}

/** The model embedded in a page (an edited page handed back for --import). */
export function modelFromPage(html) {
  const m = /<script type="application\/json" id="if-model">([\s\S]*?)<\/script>/.exec(String(html));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

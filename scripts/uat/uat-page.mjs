// sc4sap:uat-scenarios — the scenario set as one editable HTML page (user, 2026-11-16: "html 기반, 편집 가능").
//
// The same pattern as the project dashboard (scripts/project/project-page.mjs): the set travels inside the page
// (<script type="application/json" id="uat-model">), and uat-model.mjs is inlined so the page redraws, checks and
// counts with exactly the code the CLI uses. Tabs: Dashboard · Scenarios · Issues · Checks. Edit mode turns every
// cell into a field (results per cycle as a select, lists one per line), adds / removes steps, scenarios and
// issues, logs an issue from a failed step, keeps a draft in the browser, and "Save" downloads the page again with
// the edited set. `build-uat.mjs import <page>` reads it back into the JSON (and rewrites the workbooks).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const inline = (f) => readFileSync(join(here, f), 'utf8').replace(/^import .*$/gm, '').replace(/^export (const|function|async function|let)/gm, '$1');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

const LABELS = {
  ko: {
    dash: '대시보드', scen: '시나리오', issues: '이슈', checks: '확인할 점', edit: '편집', done: '편집 끝', save: '저장', print: '인쇄', undo: '되돌리기', dark: '다크 모드', light: '라이트 모드',
    search: '검색 (활동, T-code, 모듈)', all: '전체', onlyFail: '실패만', onlyOpen: '미실행만',
    scenarios: '시나리오', steps: '단계', cycle: '회차', pass: 'Pass', fail: 'Fail', blocked: 'Blocked', na: 'N/A', open: '미실행',
    perModule: '주관 모듈별', perCompany: '법인별', plan: '계획', due: '오늘까지 예정', tested: '실행', rate: '진척', participation: '모듈 참여',
    issuesOpen: '미결', issuesWaiting: '대기', issuesDone: '완료',
    cols: { id: 'STEP', phase: '구간', module: '모듈', activity: '활동', system: '시스템', tcode: 'T-code', checks: '확인 항목', inputs: '입력 데이터', outputs: '기대 결과', user: '테스트 ID', tester: '담당', status: '상태', followUp: '후속 조치' },
    sc: { theme: '프로세스 체인', process: '프로세스', task: '태스크', leadModule: '주관 모듈', company: '법인', channel: '유통 채널', productGroup: '제품군', focus: '중점 체크포인트', legacyId: '이전 시나리오 ID', owner: '현업 담당', consultant: '운영 담당', date: '예정일', actualDate: '실제일', result: '결과', description: '설명' },
    ic: { id: '번호', scenario: '시나리오', step: 'STEP', module: '모듈', type: '유형', text: '이슈 내용', raisedOn: '제기일', raisedBy: '제기자', followUp: '후속 조치', state: '상태', owner: '담당' },
    addStep: '+ STEP', addScenario: '+ 시나리오', addIssue: '+ 이슈', raise: '이슈 등록', del: '삭제', notInCycle: '미대상',
    hint: '편집 모드: 칸을 고치면 바로 반영되고 브라우저에 임시 저장돼요. "저장"을 누르면 고친 페이지를 내려받아요 — 그 파일을 담당자에게 보내거나 `build-uat.mjs import`로 세트에 반영해요.',
    draft: '저장하지 않은 편집이 있어요.', resume: '이어서 편집', discard: '버리기', saved: '저장했어요. 내려받은 파일을 세트 담당자에게 보내 주세요.', unsaved: '저장하지 않은 편집이 있어요.',
    nothing: '확인할 점이 없어요.', noIssues: '등록된 이슈가 없어요.', failedText: (a) => `${a} 실패`,
  },
  en: {
    dash: 'Dashboard', scen: 'Scenarios', issues: 'Issues', checks: 'Checks', edit: 'Edit', done: 'Done', save: 'Save', print: 'Print', undo: 'Undo', dark: 'Dark mode', light: 'Light mode',
    search: 'Search (activity, T-code, module)', all: 'All', onlyFail: 'Failed', onlyOpen: 'Not run',
    scenarios: 'Scenarios', steps: 'Steps', cycle: 'Cycle', pass: 'Pass', fail: 'Fail', blocked: 'Blocked', na: 'N/A', open: 'Open',
    perModule: 'Per lead module', perCompany: 'Per company', plan: 'Plan', due: 'Due by today', tested: 'Tested', rate: 'Progress', participation: 'Module participation',
    issuesOpen: 'Open', issuesWaiting: 'Waiting', issuesDone: 'Done',
    cols: { id: 'STEP', phase: 'Phase', module: 'Module', activity: 'Activity', system: 'System', tcode: 'T-code', checks: 'Check points', inputs: 'Input data', outputs: 'Expected output', user: 'Test user', tester: 'Tester', status: 'Status', followUp: 'Follow-up' },
    sc: { theme: 'Process chain', process: 'Process', task: 'Task', leadModule: 'Lead module', company: 'Company', channel: 'Channel', productGroup: 'Product group', focus: 'Key check point', legacyId: 'Earlier ID', owner: 'Business owner', consultant: 'Consultant', date: 'Planned', actualDate: 'Actual', result: 'Result', description: 'Description' },
    ic: { id: 'No.', scenario: 'Scenario', step: 'Step', module: 'Module', type: 'Type', text: 'Issue', raisedOn: 'Raised on', raisedBy: 'Raised by', followUp: 'Follow-up', state: 'State', owner: 'Owner' },
    addStep: '+ Step', addScenario: '+ Scenario', addIssue: '+ Issue', raise: 'Log issue', del: 'Remove', notInCycle: 'Not in cycle',
    hint: 'Edit mode: changes apply at once and a draft is kept in this browser. "Save" downloads the edited page — send it to the owner of the set, or read it back with `build-uat.mjs import`.',
    draft: 'There is an unsaved edit.', resume: 'Resume', discard: 'Discard', saved: 'Saved. Send the downloaded file to the owner of the set.', unsaved: 'There are unsaved edits.',
    nothing: 'Nothing to check.', noIssues: 'No issue logged.', failedText: (a) => `${a} failed`,
  },
};

const STYLE = `
:root{--bg:#fff;--fg:#1d2733;--muted:#5a6675;--line:#d3dbe4;--head:#f2f5f8;--card:#f6f8fa;--accent:#1d4f73;--red:#c62828;--amber:#b26a00;--green:#2e7d32;--red-bg:#fdecea;--amber-bg:#fff4e0;--green-bg:#e8f5e9;--blue-bg:#e8f0fa;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--card:#161d26;--accent:#5b9bd0;--red:#ef6b6b;--amber:#e0a43a;--green:#5cb85f;--red-bg:#3a1d1d;--amber-bg:#3a2c12;--green-bg:#1b3320;--blue-bg:#16263a;color-scheme:dark}}
:root[data-theme=dark]{--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--card:#161d26;--accent:#5b9bd0;--red:#ef6b6b;--amber:#e0a43a;--green:#5cb85f;--red-bg:#3a1d1d;--amber-bg:#3a2c12;--green-bg:#1b3320;--blue-bg:#16263a;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:13.5px/1.5 -apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif}
.topbar{position:sticky;top:0;z-index:6;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 16px;background:var(--bg);border-bottom:1px solid var(--line)}
.topbar .t{font-weight:700;flex:1;min-width:200px}.topbar .t small{font-weight:400;color:var(--muted);margin-left:8px}
button,select,input,textarea{font:inherit;color:var(--fg)}
.topbar button,.tools button,.tools select,.tools input{font-size:13px;padding:3px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);cursor:pointer}
.topbar .state{font-size:12px;color:var(--amber);font-weight:600}
.tabs{position:sticky;top:45px;z-index:5;display:flex;gap:2px;padding:0 16px;background:var(--bg);border-bottom:1px solid var(--line)}
.tabs button{border:0;border-bottom:3px solid transparent;background:none;color:var(--muted);padding:9px 14px;cursor:pointer}.tabs button[aria-selected=true]{color:var(--fg);border-bottom-color:var(--accent);font-weight:600}
.tabs .n{display:inline-block;min-width:18px;margin-left:5px;padding:0 5px;border-radius:9px;background:var(--red-bg);color:var(--red);font-size:11px}
main{max-width:1800px;margin:0 auto;padding:12px 16px 64px}section.tab{display:none}section.tab.on{display:block}
.hint{display:none;padding:7px 12px;margin:8px 0;border-radius:8px;background:var(--blue-bg);font-size:12.5px}.editing .hint{display:block}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:8px 0 14px}.tile{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--card)}.tile .k{color:var(--muted);font-size:12px}.tile .v{font-size:20px;margin-top:2px}
.tile .bar{display:flex;height:7px;border-radius:4px;overflow:hidden;margin-top:6px;background:var(--line)}.bar i{display:block;height:100%}.bar .p{background:var(--green)}.bar .f{background:var(--red)}.bar .b{background:var(--amber)}.bar .n{background:var(--muted)}
h3{font-size:15px;margin:18px 0 8px}.grid2{display:grid;gap:0 24px;grid-template-columns:minmax(0,1fr)}@media(min-width:1100px){.grid2{grid-template-columns:1fr 1fr}}
.tw{overflow-x:auto;margin:4px 0 14px}table{border-collapse:collapse;width:100%;font-size:12.8px}th,td{border:1px solid var(--line);padding:4px 7px;text-align:left;vertical-align:top}th{background:var(--head);font-weight:600;white-space:nowrap;position:sticky;top:0}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.sc{border:1px solid var(--line);border-radius:10px;margin:14px 0;overflow:hidden}.sc>header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 12px;background:var(--head)}
.sc>header code{font-weight:700}.sc>header .ti{font-weight:600;flex:1}.pill{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;font-weight:600}
.pill.pass{background:var(--green-bg);color:var(--green)}.pill.fail{background:var(--red-bg);color:var(--red)}.pill.none{background:var(--card);color:var(--muted)}
.fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px 14px;padding:8px 12px;font-size:12.5px}.fields .k{color:var(--muted);font-size:11.5px}.fields .wide{grid-column:1/-1}
tr.ph td{background:var(--card);font-weight:600;color:var(--accent)}tr.failed td{background:var(--red-bg)}
.r{display:inline-block;min-width:28px;text-align:center;border-radius:5px;font-weight:700}.r.pass{background:var(--green-bg);color:var(--green)}.r.fail{background:var(--red-bg);color:var(--red)}.r.blocked{background:var(--amber-bg);color:var(--amber)}.r.na,.r.skip{color:var(--muted)}
ul.l{margin:0;padding-left:16px}ul.l li{margin:0}
.editing td[data-p],.editing .fields [data-p]{background:var(--blue-bg)}
td textarea,td input,td select,.fields input,.fields textarea,.fields select{width:100%;min-width:70px;border:1px solid var(--line);border-radius:4px;background:var(--bg);padding:2px 4px;font-size:12.5px}td textarea{min-width:140px;resize:vertical}
.ed{display:none}.editing .ed{display:inline-block}.ed button,button.ed{font-size:12px;padding:1px 7px;border:1px solid var(--line);border-radius:5px;background:var(--card);cursor:pointer;margin:2px 2px 0 0}
.checks li.error{color:var(--red)}.checks li.warn{color:var(--amber)}.muted{color:var(--muted)}
.draft{position:fixed;right:16px;bottom:16px;z-index:9;display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:8px;background:var(--fg);color:var(--bg)}.draft button{border:0;border-radius:5px;padding:2px 9px;cursor:pointer}
.chk-n{display:inline-block;margin-left:4px;padding:0 6px;border-radius:9px;background:var(--amber-bg);color:var(--amber);font-size:11px}
@media print{.topbar,.tabs,.tools,.ed,.hint{display:none!important}section.tab{display:block!important}.sc{break-inside:avoid}}
`;

// The browser side: render every tab from D (the set), edit mode, draft, save. Plain ES2017, no libraries.
const CLIENT = String.raw`
const $=(s)=>document.querySelector(s);const L=JSON.parse($('#uat-labels').textContent);let D=normalize(JSON.parse($('#uat-model').textContent));
const E=(s)=>String(s==null?'':s).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let EDIT=false,dirty=false,TAB='dash',Q='',F='all';const undo=[];const KEY='sc4sap-uat:'+D.id;
const RES={pass:'O',fail:'X',blocked:'△','n/a':'N/A','':'–'};
function getAt(o,p){return p.split('.').reduce((a,k)=>a==null?a:a[k],o)}
function setAt(o,p,v){const ks=p.split('.');const last=ks.pop();const t=ks.reduce((a,k)=>a[k],o);t[last]=v}
function change(fn){undo.push(JSON.stringify(D));if(undo.length>200)undo.shift();fn();D=normalize(D);dirty=true;try{localStorage.setItem(KEY,JSON.stringify(D))}catch(e){}render()}
const list=(a)=>a&&a.length?'<ul class="l">'+a.map((x)=>'<li>'+E(x)+'</li>').join('')+'</ul>':'';
const fld=(p,v,kind)=>{if(!EDIT)return kind==='list'?list(v):E(v);if(kind==='list')return '<textarea rows="3" data-p="'+p+'" data-k="list">'+E((v||[]).join('\n'))+'</textarea>';if(kind==='area')return '<textarea rows="2" data-p="'+p+'">'+E(v)+'</textarea>';return '<input data-p="'+p+'" value="'+E(v)+'">'};
const sel=(p,v,opts)=>'<select data-p="'+p+'">'+opts.map(([k,l])=>'<option value="'+E(k)+'"'+(k===v?' selected':'')+'>'+E(l)+'</option>').join('')+'</select>';
function dash(){const p=progress(D);const c=D.cycles.map((cy)=>{const b=p.byCycle[cy];const t=b.pass+b.fail+b.blocked+b['n/a']+b.open||1;const w=(n)=>(100*n/t).toFixed(1)+'%';
return '<div class="tile"><div class="k">'+E(cy)+' '+E(L.cycle)+'</div><div class="v">'+b.pass+' / '+(t)+'</div><div class="bar"><i class="p" style="width:'+w(b.pass)+'"></i><i class="f" style="width:'+w(b.fail)+'"></i><i class="b" style="width:'+w(b.blocked)+'"></i><i class="n" style="width:'+w(b['n/a'])+'"></i></div><div class="k">'+L.fail+' '+b.fail+' · '+L.blocked+' '+b.blocked+' · '+L.na+' '+b['n/a']+' · '+L.open+' '+b.open+'</div></div>'}).join('');
const tally=(title,key,map)=>'<div><h3>'+E(title)+'</h3><div class="tw"><table><tr><th>'+E(key)+'</th><th class="num">'+L.plan+'</th><th class="num">'+L.due+'</th><th class="num">'+L.tested+'</th><th class="num">'+L.rate+'</th><th class="num">'+L.pass+'</th><th class="num">'+L.fail+'</th></tr>'+Object.entries(map).map(([k,t])=>'<tr><td>'+E(k)+'</td><td class="num">'+t.plan+'</td><td class="num">'+t.due+'</td><td class="num">'+t.tested+'</td><td class="num">'+(t.plan?Math.round(100*t.tested/t.plan):0)+'%</td><td class="num">'+t.pass+'</td><td class="num">'+t.fail+'</td></tr>').join('')+'</table></div></div>';
const part='<h3>'+E(L.participation)+'</h3><div class="tw"><table><tr><th>'+E(L.scen)+'</th>'+p.modules.map((m)=>'<th>'+E(m)+'</th>').join('')+'<th>'+E(L.sc.result)+'</th></tr>'+D.scenarios.map((s,i)=>'<tr><td><code>'+E(s.id)+'</code> '+E(s.title)+'</td>'+p.modules.map((m)=>'<td style="text-align:center">'+(p.participation[i].modules.includes(m)?'●':'')+'</td>').join('')+'<td>'+pill(s.result)+'</td></tr>').join('')+'</table></div>';
return '<div class="tiles"><div class="tile"><div class="k">'+L.scenarios+'</div><div class="v">'+p.scenarios+'</div></div><div class="tile"><div class="k">'+L.steps+'</div><div class="v">'+p.steps+'</div></div>'+c+'<div class="tile"><div class="k">'+L.issues+'</div><div class="v">'+p.issues.open+'</div><div class="k">'+L.issuesWaiting+' '+p.issues.waiting+' · '+L.issuesDone+' '+p.issues.done+'</div></div></div>'
+'<div class="grid2">'+tally(L.perModule,L.cols.module,p.byModule)+(Object.keys(p.byCompany).some((k)=>k!=='-')?tally(L.perCompany,L.sc.company,p.byCompany):'<div></div>')+'</div>'+part}
const pill=(r)=>'<span class="pill '+(r||'none')+'">'+E(r==='pass'?'Pass':r==='fail'?'Fail':'–')+'</span>';
function match(st){if(F==='fail'&&!D.cycles.some((c)=>st.results[c]==='fail'))return false;if(F==='open'&&!D.cycles.some((c)=>runsIn(st,c)&&!st.results[c]))return false;if(!Q)return true;const q=Q.toLowerCase();return [st.activity,st.tcode,st.module,st.phase,st.system].some((v)=>String(v||'').toLowerCase().includes(q))}
function scen(){const cols=['id','phase','module','activity','system','tcode','checks','inputs','outputs','user','tester'];
return '<div class="tools"><input type="search" id="q" placeholder="'+E(L.search)+'" value="'+E(Q)+'"> <select id="f"><option value="all"'+(F==='all'?' selected':'')+'>'+L.all+'</option><option value="fail"'+(F==='fail'?' selected':'')+'>'+L.onlyFail+'</option><option value="open"'+(F==='open'?' selected':'')+'>'+L.onlyOpen+'</option></select> <button class="ed" data-a="addsc">'+L.addScenario+'</button></div>'
+D.scenarios.map((s,si)=>{const P='scenarios.'+si+'.';const rows=[];let ph=null;s.steps.forEach((st,ti)=>{if(!match(st))return;if(st.phase&&st.phase!==ph){ph=st.phase;rows.push('<tr class="ph"><td colspan="'+(cols.length+D.cycles.length+3)+'">'+E(st.phase)+'</td></tr>')}const S=P+'steps.'+ti+'.';const failed=D.cycles.some((c)=>st.results[c]==='fail');const logged=D.issues.some((i)=>i.scenario===s.id&&i.step===st.id);
rows.push('<tr class="'+(failed?'failed':'')+'"><td><code>'+E(st.id)+'</code></td>'+cols.slice(1).map((c)=>'<td'+(EDIT?' data-p':'')+'>'+fld(S+c,st[c],['checks','inputs','outputs'].includes(c)?'list':c==='activity'?'area':'')+'</td>').join('')
+D.cycles.map((c)=>'<td style="text-align:center">'+(EDIT?'<select data-r="'+si+'.'+ti+'.'+E(c)+'">'+[['',RES['']],['pass','O'],['fail','X'],['blocked','△'],['n/a','N/A'],['skip',L.notInCycle]].map(([k,l])=>'<option value="'+k+'"'+((runsIn(st,c)?st.results[c]:'skip')===k?' selected':'')+'>'+E(l)+'</option>').join('')+'</select>':(runsIn(st,c)?'<span class="r '+(st.results[c]==='n/a'?'na':st.results[c])+'">'+RES[st.results[c]||'']+'</span>':'<span class="r skip">'+E(L.notInCycle)+'</span>'))+'</td>').join('')
+'<td>'+(EDIT?sel(S+'status',st.status,['open','in-progress','done','on-hold'].map((x)=>[x,x])):E(st.status))+'</td><td>'+fld(S+'followUp',st.followUp,'area')+(failed&&!logged?' <button class="ed" data-a="raise" data-s="'+si+'" data-t="'+ti+'">'+L.raise+'</button>':'')+'</td>'
+'<td><span class="ed"><button data-a="ins" data-s="'+si+'" data-t="'+ti+'">+</button><button data-a="dels" data-s="'+si+'" data-t="'+ti+'">✕</button></span></td></tr>')});
const keys=['theme','process','task','leadModule','company','channel','productGroup','focus','legacyId','owner','consultant','date','actualDate'];
return '<section class="sc"><header><code>'+E(s.id)+'</code><span class="ti">'+(EDIT?'<input data-p="'+P+'title" value="'+E(s.title)+'">':E(s.title))+'</span>'+(EDIT?sel(P+'result',s.result,[['','–'],['pass','Pass'],['fail','Fail']]):pill(s.result))+'<span class="ed"><button data-a="addst" data-s="'+si+'">'+L.addStep+'</button><button data-a="delsc" data-s="'+si+'">'+L.del+'</button></span></header>'
+'<div class="fields">'+keys.map((k)=>'<div><div class="k">'+E(L.sc[k])+'</div>'+fld(P+k,s[k])+'</div>').join('')+'<div class="wide"><div class="k">'+E(L.sc.description)+'</div>'+fld(P+'description',s.description,'area')+'</div></div>'
+'<div class="tw"><table><tr>'+cols.map((c)=>'<th>'+E(L.cols[c])+'</th>').join('')+D.cycles.map((c)=>'<th>'+E(c)+'</th>').join('')+'<th>'+L.cols.status+'</th><th>'+L.cols.followUp+'</th><th></th></tr>'+rows.join('')+'</table></div></section>'}).join('')}
function iss(){const k=['scenario','step','module','type','text','raisedOn','raisedBy','followUp','state','owner'];
return '<div class="tools"><button class="ed" data-a="addi">'+L.addIssue+'</button></div>'+(D.issues.length?'<div class="tw"><table><tr><th>'+L.ic.id+'</th>'+k.map((c)=>'<th>'+E(L.ic[c])+'</th>').join('')+'<th></th></tr>'+D.issues.map((i,ii)=>{const P='issues.'+ii+'.';
return '<tr><td><code>'+E(i.id)+'</code></td>'+k.map((c)=>'<td>'+(EDIT&&c==='type'?sel(P+c,i[c],ISSUE_TYPES.map((x)=>[x,x])):EDIT&&c==='state'?sel(P+c,i[c],ISSUE_STATES.map((x)=>[x,x])):fld(P+c,i[c],c==='text'||c==='followUp'?'area':''))+'</td>').join('')+'<td><span class="ed"><button data-a="deli" data-i="'+ii+'">✕</button></span></td></tr>'}).join('')+'</table></div>':'<p class="muted">'+L.noIssues+'</p>')}
function chk(){const v=validate(D);return v.length?'<ul class="checks">'+v.map((x)=>'<li class="'+x.level+'"><code>'+E(x.path)+'</code> '+E(x.text)+'</li>').join('')+'</ul>':'<p class="muted">'+L.nothing+'</p>'}
function render(){const ae=document.activeElement;const fp=ae&&ae.dataset?(ae.dataset.p||ae.dataset.r):null;document.body.classList.toggle('editing',EDIT);$('#ed').textContent=EDIT?L.done:L.edit;$('#st').textContent=dirty?L.unsaved:'';
const v=validate(D).length;$('#nchk').textContent=v||'';$('#nchk').style.display=v?'':'none';const io=D.issues.filter((i)=>i.state==='open').length;$('#niss').textContent=io||'';$('#niss').style.display=io?'':'none';
$('#t-dash').innerHTML=dash();$('#t-scen').innerHTML=scen();$('#t-iss').innerHTML=iss();$('#t-chk').innerHTML=chk();
document.querySelectorAll('.tabs button').forEach((b)=>b.setAttribute('aria-selected',b.dataset.t===TAB));document.querySelectorAll('section.tab').forEach((s)=>s.classList.toggle('on',s.id==='t-'+TAB));if(fp){const el=document.querySelector('[data-p="'+fp+'"],[data-r="'+fp+'"]');if(el)el.focus()}}
document.addEventListener('click',(e)=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.t){TAB=b.dataset.t;render();return}
const a=b.dataset.a;if(!a)return;const si=+b.dataset.s,ti=+b.dataset.t;
if(a==='addsc')change(()=>D.scenarios.push({id:D.module+String(D.scenarios.length+1).padStart(2,'0'),title:'',leadModule:D.module,steps:[{activity:''}]}));
if(a==='delsc')change(()=>D.scenarios.splice(si,1));
if(a==='addst')change(()=>{const s=D.scenarios[si];const last=s.steps[s.steps.length-1];s.steps.push({phase:last?last.phase:'',module:last?last.module:D.module,activity:'',system:'SAP'})});
if(a==='ins')change(()=>{const s=D.scenarios[si];s.steps.splice(ti+1,0,{phase:s.steps[ti].phase,module:s.steps[ti].module,activity:'',system:'SAP'})});
if(a==='dels')change(()=>D.scenarios[si].steps.splice(ti,1));
if(a==='addi')change(()=>D.issues.push({raisedOn:new Date().toISOString().slice(0,10),state:'open',type:'defect',module:D.module}));
if(a==='deli')change(()=>D.issues.splice(+b.dataset.i,1));
if(a==='raise')change(()=>{const s=D.scenarios[si],st=s.steps[ti];D.issues.push({scenario:s.id,step:st.id,module:st.module,type:'defect',text:L.failedText(st.activity),raisedOn:new Date().toISOString().slice(0,10),state:'open'})});});
document.addEventListener('change',(e)=>{const el=e.target;if(el.id==='f'){F=el.value;render();return}
if(el.dataset.r){const [si,ti,c]=el.dataset.r.split('.');change(()=>{const st=D.scenarios[+si].steps[+ti];const all=D.cycles;let scope=st.cycles&&st.cycles.length?st.cycles.slice():all.slice();
if(el.value==='skip'){scope=scope.filter((y)=>y!==c);st.results[c]=''}else{if(!scope.includes(c))scope.push(c);st.results[c]=el.value}st.cycles=scope.length===all.length?[]:all.filter((y)=>scope.includes(y))});return}
if(el.dataset.p){const p=el.dataset.p;const v=el.dataset.k==='list'?el.value.split(/\r?\n/).map((x)=>x.trim()).filter(Boolean):el.value;if(JSON.stringify(getAt(D,p))===JSON.stringify(v))return;change(()=>setAt(D,p,v))}});
document.addEventListener('input',(e)=>{if(e.target.id==='q'){Q=e.target.value;const pos=e.target.selectionStart;render();const q=$('#q');q.focus();q.setSelectionRange(pos,pos)}});
$('#ed').onclick=()=>{EDIT=!EDIT;render()};$('#pr').onclick=()=>window.print();
// Theme: the saved choice, else the system's; the button names the mode it switches to. A host page (the web
// workbench) can set it too: postMessage({type:'theme',theme:'dark'|'light'}).
const ROOT=document.documentElement;const isDark=()=>ROOT.getAttribute('data-theme')==='dark'||(!ROOT.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme: dark)').matches);
const paintTheme=()=>{$('#th').textContent=isDark()?'☀ '+L.light:'☾ '+L.dark};
const setTheme=(t)=>{ROOT.setAttribute('data-theme',t);try{localStorage.setItem('sc4sap-uat-theme',t)}catch(e){}paintTheme()};
try{const t=localStorage.getItem('sc4sap-uat-theme');if(t==='dark'||t==='light')ROOT.setAttribute('data-theme',t)}catch(e){}
$('#th').onclick=()=>setTheme(isDark()?'light':'dark');
window.addEventListener('message',(e)=>{if(e.data&&e.data.type==='theme'&&(e.data.theme==='dark'||e.data.theme==='light')){ROOT.setAttribute('data-theme',e.data.theme);paintTheme()}});
paintTheme();
$('#un').onclick=()=>{const u=undo.pop();if(!u)return;D=normalize(JSON.parse(u));dirty=true;render()};
window.addEventListener('beforeunload',(e)=>{if(dirty){e.preventDefault();e.returnValue=L.unsaved}});
$('#sv').onclick=()=>{const doc=document.documentElement.cloneNode(true);doc.querySelector('#uat-model').textContent=JSON.stringify(D).replace(/</g,'\\u003c');
['#t-dash','#t-scen','#t-iss','#t-chk'].forEach((s)=>{doc.querySelector(s).innerHTML=''});doc.querySelector('body').className='';doc.querySelectorAll('.draft').forEach((x)=>x.remove());
const a=document.createElement('a');a.download=D.id+'-uat-edited.html';a.href=URL.createObjectURL(new Blob(['<!doctype html>\n'+doc.outerHTML],{type:'text/html'}));document.body.appendChild(a);a.click();a.remove();
dirty=false;try{localStorage.removeItem(KEY)}catch(e){}render();const t=document.createElement('div');t.className='draft';t.textContent=L.saved;document.body.appendChild(t);setTimeout(()=>t.remove(),4000)};
try{const d=localStorage.getItem(KEY);if(d&&d!==JSON.stringify(D)){const b=document.createElement('div');b.className='draft';b.innerHTML='<span>'+E(L.draft)+'</span><button data-r="1">'+E(L.resume)+'</button><button data-r="0">'+E(L.discard)+'</button>';document.body.appendChild(b);
b.onclick=(e)=>{const r=e.target.dataset.r;if(r==null)return;b.remove();if(r==='1'){D=normalize(JSON.parse(d));dirty=true;EDIT=true;render()}else localStorage.removeItem(KEY)}}}catch(e){}
render();
`;

/** The page of one set. `lang` picks the labels (the set's own language by default). */
export function pageHtml(set, lang = set.lang) {
  const L = LABELS[String(lang || '').slice(0, 2)] || LABELS.en;
  const labels = { ...L, failedText: undefined };
  const failed = String(L.failedText('§')).replace('§', '');
  const kind = set.kind === 'sit' ? (L === LABELS.ko ? '통합 테스트' : 'Integration test') : 'UAT';
  return `<!doctype html>
<html lang="${esc(String(lang || 'en').slice(0, 2))}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(set.id)} ${esc(set.title)} — ${kind}</title>
<meta name="generator" content="sc4sap uat-scenarios">
<style>${STYLE}</style></head>
<body>
<div class="topbar"><div class="t">${esc(set.title || set.id)}<small>${kind} · ${esc(set.id)} · ${esc(set.module)} · v${esc(set.version)}</small></div>
<span class="state" id="st"></span><button id="ed"></button><button id="un">${esc(L.undo)}</button><button id="sv">${esc(L.save)}</button><button id="pr">${esc(L.print)}</button><button id="th" type="button"></button></div>
<nav class="tabs"><button data-t="dash">${esc(L.dash)}</button><button data-t="scen">${esc(L.scen)}</button><button data-t="iss">${esc(L.issues)}<span class="n" id="niss"></span></button><button data-t="chk">${esc(L.checks)}<span class="chk-n" id="nchk"></span></button></nav>
<main><p class="hint">${esc(L.hint)}</p>
<section class="tab" id="t-dash"></section><section class="tab" id="t-scen"></section><section class="tab" id="t-iss"></section><section class="tab" id="t-chk"></section></main>
<script type="application/json" id="uat-model">${json(set)}</script>
<script type="application/json" id="uat-labels">${json(labels)}</script>
<script>
${inline('uat-model.mjs')}
L_FAILED=${json(failed)};
</script>
<script>
${CLIENT.replace("const L=JSON.parse($('#uat-labels').textContent);", "const L=Object.assign(JSON.parse($('#uat-labels').textContent),{failedText:(a)=>a+L_FAILED});")}
</script>
</body></html>
`;
}

/** The set embedded in a page (an edited page handed back for `import`). */
export function setFromPage(html) {
  const m = /<script type="application\/json" id="uat-model">([\s\S]*?)<\/script>/.exec(String(html));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

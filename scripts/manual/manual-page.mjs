// sc4sap:program-to-manual — the page's labels, stylesheet and script.
//
// Kept apart from build-manual.mjs so the builder reads as document assembly.
// Everything is inlined into the one .html file; nothing loads from the network.
//
// On screen the manual is a scrolling document with a contents sidebar. In
// print (or "Save as PDF") every scenario step starts a new A4 landscape page,
// like a slide, and the confidentiality notice repeats at the foot of each page.
//
// The script draws the callouts: for each screen figure it finds the elements
// the step names (the renderer wraps them in <g data-anchor>), and adds a red
// frame and a numbered badge in the SVG's own coordinates, so the marks scale
// and print with the image. Without the script the numbered list still reads.

export const LABELS = {
  ko: {
    manual: '사용자 매뉴얼', contents: '목차', revision: '개정 이력', version: '버전', date: '일자',
    author: '작성자', team: '작성 팀', change: '변경 내용', program: '프로그램', tcode: 'T-Code',
    menuPath: 'Menu Path', objType: '구분', cbo: 'CBO', standard: '표준', transaction: 'Transaction',
    description: 'Description', intro: '개요', purpose: '업무 목적', background: '업무 배경',
    rules: 'Business Rule', users: '사용자', flow: '처리 흐름', scenarios: '업무 시나리오',
    goal: '사용 시점', result: '결과', checkpoints: '※ Check Points', fields: '필드 설명',
    selFields: '선택 화면', outFields: '출력 화면', field: '필드', label: '항목', required: '필수',
    f4: 'F4', example: '입력 예', meaning: '설명', messages: '오류 메시지 및 조치', code: '코드',
    msgType: '유형', text: '메시지', cause: '원인', action: '조치', glossary: '용어집', term: '용어',
    unverified: '확인 필요', endOfDoc: 'End of Document', print: '인쇄', theme: '테마', page: '쪽',
  },
  en: {
    manual: 'User Manual', contents: 'Contents', revision: 'Revision History', version: 'Version', date: 'Date',
    author: 'Author', team: 'Team', change: 'Changes', program: 'Program', tcode: 'T-Code',
    menuPath: 'Menu Path', objType: 'Type', cbo: 'CBO', standard: 'Standard', transaction: 'Transaction',
    description: 'Description', intro: 'Introduction', purpose: 'Purpose', background: 'Background',
    rules: 'Business Rules', users: 'Users', flow: 'Process Flow', scenarios: 'Business Scenarios',
    goal: 'When to use', result: 'Result', checkpoints: '※ Check Points', fields: 'Field Reference',
    selFields: 'Selection screen', outFields: 'Output screen', field: 'Field', label: 'Label', required: 'Required',
    f4: 'F4', example: 'Example', meaning: 'Description', messages: 'Messages and Actions', code: 'Code',
    msgType: 'Type', text: 'Message', cause: 'Cause', action: 'Action', glossary: 'Glossary', term: 'Term',
    unverified: 'To be confirmed', endOfDoc: 'End of Document', print: 'Print', theme: 'Theme', page: 'page',
  },
  ja: {
    manual: 'ユーザーマニュアル', contents: '目次', revision: '改訂履歴', version: '版', date: '日付',
    author: '作成者', team: '作成チーム', change: '変更内容', program: 'プログラム', tcode: 'T-Code',
    menuPath: 'Menu Path', objType: '区分', cbo: 'CBO', standard: '標準', transaction: 'Transaction',
    description: 'Description', intro: '概要', purpose: '業務目的', background: '業務背景',
    rules: 'Business Rule', users: '利用者', flow: '処理フロー', scenarios: '業務シナリオ',
    goal: '利用タイミング', result: '結果', checkpoints: '※ Check Points', fields: '項目説明',
    selFields: '選択画面', outFields: '出力画面', field: '項目', label: '項目名', required: '必須',
    f4: 'F4', example: '入力例', meaning: '説明', messages: 'エラーメッセージと対処', code: 'コード',
    msgType: '種類', text: 'メッセージ', cause: '原因', action: '対処', glossary: '用語集', term: '用語',
    unverified: '要確認', endOfDoc: 'End of Document', print: '印刷', theme: 'テーマ', page: 'ページ',
  },
};

export const labelsFor = (lang) => LABELS[String(lang || '').slice(0, 2).toLowerCase()] || LABELS.en;

const LIGHT = '--bg:#ffffff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--head:#f3f6f9;--card:#f6f8fa;--accent:#1f4e79;--accent-ink:#ffffff;--link:#0969da;--call:#d6336c;--warn-bg:#fff8e6;--warn-line:#e3b341;--flag:#9a6700';
const DARK = '--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#3d444d;--head:#151b23;--card:#151b23;--accent:#4f8cc9;--accent-ink:#0d1117;--link:#4493f8;--call:#f06595;--warn-bg:#2b2111;--warn-line:#9e6a03;--flag:#d29922';

export const STYLE = `
:root{${LIGHT};color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme=light]){${DARK};color-scheme:dark}}
:root[data-theme=dark]{${DARK};color-scheme:dark}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Hiragino Sans","Noto Sans CJK KR",sans-serif}
[id]{scroll-margin-top:64px}
a{color:var(--link)}
code{font:13px Consolas,"SFMono-Regular",monospace;background:var(--card);border:1px solid var(--line);border-radius:4px;padding:0 4px}
.topbar{position:sticky;top:0;z-index:5;display:flex;gap:12px;align-items:center;padding:8px 16px;background:var(--bg);border-bottom:1px solid var(--line)}
.topbar .t{font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.topbar button{font:inherit;font-size:13px;padding:4px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}
.layout{max-width:1480px;margin:0 auto;padding:0 16px 64px;display:grid;grid-template-columns:minmax(0,1fr);gap:0 32px}
@media (min-width:1100px){.layout{grid-template-columns:240px minmax(0,1fr)}}
.toc{display:none}
@media (min-width:1100px){.toc{display:block;position:sticky;top:56px;align-self:start;max-height:calc(100vh - 72px);overflow:auto;padding:20px 0;font-size:13.5px}}
.toc ol{list-style:none;margin:0;padding:0}.toc ol ol{padding-left:14px}
.toc a{display:block;padding:3px 8px;border-radius:5px;color:var(--fg);text-decoration:none}
.toc a:hover{background:var(--card)}
main{min-width:0}
h2{font-size:24px;margin:48px 0 16px;padding-bottom:6px;border-bottom:2px solid var(--accent)}
h3{font-size:19px;margin:32px 0 10px}
h4{font-size:16px;margin:20px 0 8px}
table{border-collapse:collapse;width:100%;margin:10px 0 18px;font-size:14px}
th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
th{background:var(--head);font-weight:600}
.cover{min-height:auto;display:flex;flex-direction:column;justify-content:center;gap:10px;padding:48px 0;border-bottom:1px solid var(--line)}
.cover .kicker{color:var(--muted);font-size:15px;letter-spacing:.04em}
.cover h1{font-size:36px;line-height:1.25;margin:0}
.cover .meta{display:grid;grid-template-columns:max-content 1fr;gap:4px 18px;margin-top:24px;font-size:15px}
.cover .meta dt{color:var(--muted)}.cover .meta dd{margin:0}
.flag{display:inline-block;font-size:12px;font-weight:700;color:var(--flag);border:1px solid var(--flag);border-radius:10px;padding:0 7px;margin-left:6px;vertical-align:1px}
.scenario-goal{color:var(--muted);margin:-4px 0 12px}
.step{border:1px solid var(--line);border-radius:10px;padding:16px;margin:18px 0}
.step-head{width:100%;margin:0 0 14px}
.step-head th{width:130px;background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.step-body{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
@media (min-width:900px){.step-body.has-screen{grid-template-columns:minmax(0,1fr) 300px;align-items:start}}
.screen{margin:0;padding:14px;background:#ffffff;border:1px solid var(--line);border-radius:8px;overflow:auto}
.screen>svg{display:block;width:100%;height:auto;overflow:visible}
.screen figcaption{color:#59636e;font-size:12.5px;margin-top:6px}
.screen[data-zoom]{cursor:zoom-in}
.screen.zoomed{cursor:zoom-out}
.screen.zoomed>svg{width:auto;max-width:none}
.callouts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.callouts>li{display:grid;grid-template-columns:26px 1fr;gap:8px;align-items:start}
.num{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--call);color:#fff;font-size:12.5px;font-weight:700}
.callouts ul{margin:4px 0 0;padding-left:18px;color:var(--muted);font-size:14px}
.step-note{margin:12px 0 0;color:var(--muted)}
.step-notes{list-style:none;padding:0}.step-notes>li+li{margin-top:4px}
.callouts ul:empty{display:none}
.field-fig{margin:6px 0 12px}
.field-fig>svg{width:auto;max-width:none}
@media print{.field-fig>svg{width:100%!important;max-width:100%!important}}
th.fnum,td.fnum{width:2.6em;text-align:center;font-weight:700;color:var(--call);white-space:nowrap}
a.gl{color:inherit;text-decoration:underline dotted;text-underline-offset:3px;cursor:help}
a.msg{color:var(--link);text-decoration:underline dotted;text-underline-offset:3px;font-weight:600}
mark.em{background:none;color:var(--call);font-weight:700}
.bl::before{content:"• "}
.checkpoints{margin:16px 0 8px;padding:12px 16px;background:var(--warn-bg);border-left:4px solid var(--warn-line);border-radius:6px}
.checkpoints h4{margin:0 0 6px}.checkpoints ul{margin:0;padding-left:20px}
.checkpoints .src{color:var(--muted);font-size:12.5px}
.doc-end{margin:48px 0 0;padding:24px 0;border-top:2px solid var(--accent);text-align:center;color:var(--muted)}
.doc-end strong{display:block;font-size:18px;color:var(--fg);margin-bottom:6px}
.print-footer{display:none}
@page{size:A4 landscape;margin:10mm 12mm 14mm}
@media print{
  :root,:root:not([data-theme=light]),:root[data-theme=dark]{${LIGHT};color-scheme:light}
  *{print-color-adjust:exact;-webkit-print-color-adjust:exact}
  body{font-size:11.5pt}
  .topbar,.toc{display:none!important}
  .layout{display:block;max-width:none;padding:0}
  .cover{min-height:auto;height:170mm;border:0}
  .page-break{break-before:page}
  h2{margin-top:0}
  .step{border:0;padding:0;margin:0;break-inside:avoid}
  .step-body.has-screen{grid-template-columns:minmax(0,1fr) 88mm}
  .screen>svg{max-height:135mm}
  .screen.zoomed>svg{width:100%;max-width:100%}
  table,tr,.checkpoints{break-inside:avoid}
  .print-footer{display:block;position:fixed;bottom:-9mm;left:0;right:0;text-align:center;font-size:8.5pt;color:#59636e}
}
`;

// Cross-links read from the page's own tables, so the edit mode re-links after a
// change (window.sc4sapLinkTerms):
//   · glossary terms (and both halves of "용어 (Term)") → their glossary row, meaning as
//     tooltip, dotted underline — first occurrence per step, check-point box or section
//   · message codes (E07, Q01 — codes of letters + digits only) → their row in the
//     messages table, message text as tooltip — every occurrence, including
//     the check-point sources "(FORM … (E16, E17))"
// No ${…} below; String.raw keeps backslashes.
export const LINK_SCRIPT = String.raw`
(function(){
  function rows(sel){var t=document.querySelector(sel);return t?Array.prototype.slice.call(t.querySelectorAll('tbody>tr')):[];}
  function targets(){
    var out=[];
    rows('#glossary table').forEach(function(tr,i){
      var td=tr.querySelectorAll('td');if(td.length<2)return;
      var term=td[0].textContent.trim(),desc=td[1].textContent.trim();if(!term)return;
      tr.id='gl-'+(i+1);
      var vars=[term],m=/^(.+?)\s*[(（]([^)）]+)[)）]\s*$/.exec(term);
      if(m)vars.push(m[1].trim(),m[2].trim());
      vars.forEach(function(v){if(v.length>=2)out.push({v:v,id:tr.id,tip:desc,cls:'gl',once:true});});
    });
    rows('#messages table').forEach(function(tr){
      var td=tr.querySelectorAll('td');if(td.length<3)return;
      var code=td[0].textContent.trim();if(!/^[A-Z]{1,3}\d{2,4}$/.test(code))return;
      tr.id='msg-'+code;
      out.push({v:code,id:tr.id,tip:td[2].textContent.trim(),cls:'msg',once:false});
    });
    return out.sort(function(a,b){return b.v.length-a.v.length;});
  }
  function esc(s){return s.replace(/[.*+?^$(){}|[\]\\]/g,'\\$&');}
  function unlink(root){
    Array.prototype.slice.call(root.querySelectorAll('a.gl,a.msg')).forEach(function(a){a.replaceWith(document.createTextNode(a.textContent));});
    root.normalize();
  }
  function link(){
    var main=document.querySelector('main');if(!main)return;
    unlink(main);
    var list=targets();if(!list.length)return;
    var byKey={};list.forEach(function(t){var k=t.v.toLowerCase();if(!byKey[k])byKey[k]=t;});
    var re=new RegExp(list.map(function(t){return /^[A-Za-z0-9 _-]+$/.test(t.v)?'\\b'+esc(t.v)+'\\b':esc(t.v);}).join('|'),'gi');
    var seenIn=new Map(); // glossary: one link per term per step / check-point box / section
    main.querySelectorAll('[data-p],[data-k],[data-l],.src').forEach(function(f){
      if(f.closest('#glossary,#messages,h1,h2,h3,h4,.cover,.ed-quill'))return;
      var box=f.closest('article.step,aside,section')||main;
      if(!seenIn.has(box))seenIn.set(box,{});
      var seen=seenIn.get(box),walker=document.createTreeWalker(f,NodeFilter.SHOW_TEXT,null),nodes=[],n;
      while((n=walker.nextNode()))if(!n.parentNode.closest('code,a'))nodes.push(n);
      nodes.forEach(function(node){
        var s=node.nodeValue,last=0,m,frag=null;re.lastIndex=0;
        while((m=re.exec(s))){
          var t=byKey[m[0].toLowerCase()];if(!t||(t.once&&seen[t.id]))continue;
          if(t.cls==='msg'&&m[0]!==t.v)continue; // codes match case-sensitively
          seen[t.id]=1;frag=frag||document.createDocumentFragment();
          frag.appendChild(document.createTextNode(s.slice(last,m.index)));
          var a=document.createElement('a');a.className=t.cls;a.href='#'+t.id;a.title=t.tip;a.textContent=m[0];frag.appendChild(a);
          last=m.index+m[0].length;
        }
        if(frag){frag.appendChild(document.createTextNode(s.slice(last)));node.replaceWith(frag);}
      });
    });
  }
  window.sc4sapLinkTerms=link;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',link);else link();
})();
`;

export const SCRIPT = `
(function(){
  var NS='http://www.w3.org/2000/svg';
  function el(name,attrs){var e=document.createElementNS(NS,name);for(var k in attrs)e.setAttribute(k,attrs[k]);return e;}
  function find(svg,anchor){
    var m=/^([\\s\\S]*?)(?:#([0-9]+))?$/.exec(String(anchor)),key=m[1],nth=parseInt(m[2]||'1',10)||1;
    var all=svg.querySelectorAll('[data-anchor]'),hits=[];
    for(var i=0;i<all.length;i++)if(all[i].getAttribute('data-anchor')===key)hits.push(all[i]);
    return hits[nth-1]||null;
  }
  // A mark is [number, anchor, offset, pos]: the frame goes round the anchor and the
  // badge sits on its top-left corner, moved by offset [dx,dy] when the user dragged
  // it (with a leader line back). pos [x,y] places a badge with no anchor, e.g. on a
  // screenshot. All in the SVG's own coordinates, so marks scale and print with it.
  function badge(layer,num,cx,cy){
    var g=el('g',{'class':'callout-badge','data-num':num});
    g.appendChild(el('circle',{cx:cx,cy:cy,r:10,fill:'#D6336C',stroke:'#FFFFFF','stroke-width':1.5}));
    var t=el('text',{x:cx,y:cy+4,'text-anchor':'middle','font-size':12,'font-weight':700,fill:'#FFFFFF','font-family':'Arial,sans-serif'});
    t.textContent=String(num);g.appendChild(t);layer.appendChild(g);return g;
  }
  function place(fig){
    var svg=fig.querySelector('svg'),list;
    try{list=JSON.parse(fig.getAttribute('data-callouts')||'[]');}catch(e){return;}
    if(!svg)return;
    var old=svg.querySelector('g.callout-layer');if(old)old.remove();
    if(!list.length||!svg.getScreenCTM)return;
    var root=svg.getScreenCTM();if(!root)return;
    var inv=root.inverse(),layer=el('g',{'class':'callout-layer'}),used={};
    svg.appendChild(layer);
    list.forEach(function(c){
      var off=c[2]||[0,0],pos=c[3];
      var target=c[1]&&find(svg,c[1]);
      if(!target){if(pos)badge(layer,c[0],pos[0],pos[1]);return;}
      var b=target.getBBox(),m=target.getScreenCTM();if(!m)return;
      m=inv.multiply(m);
      var p=svg.createSVGPoint();p.x=b.x;p.y=b.y;var a=p.matrixTransform(m);
      p.x=b.x+b.width;p.y=b.y+b.height;var z=p.matrixTransform(m);
      var x=Math.min(a.x,z.x)-3,y=Math.min(a.y,z.y)-3,w=Math.abs(z.x-a.x)+6,h=Math.abs(z.y-a.y)+6;
      layer.appendChild(el('rect',{x:x,y:y,width:w,height:h,rx:3,fill:'none',stroke:'#D6336C','stroke-width':2}));
      var k=Math.round(x)+':'+Math.round(y),shift=(used[k]||0)*20;used[k]=(used[k]||0)+1;
      var cx=x+shift,cy=y;
      if(off[0]||off[1])layer.appendChild(el('line',{x1:cx,y1:cy,x2:cx+off[0],y2:cy+off[1],stroke:'#D6336C','stroke-width':1.5}));
      badge(layer,c[0],cx+off[0],cy+off[1]).setAttribute('data-base',cx+','+cy);
    });
  }
  window.sc4sapPlace=place;
  function init(){
    var figs=document.querySelectorAll('figure[data-callouts]');
    for(var i=0;i<figs.length;i++){try{place(figs[i]);}catch(e){}}
    var root=document.documentElement;
    try{var saved=localStorage.getItem('sc4sap-manual-theme');if(saved)root.setAttribute('data-theme',saved);}catch(e){}
    var tb=document.getElementById('theme-btn');
    if(tb)tb.addEventListener('click',function(){
      var dark=root.getAttribute('data-theme')==='dark'||(!root.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme: dark)').matches);
      var next=dark?'light':'dark';root.setAttribute('data-theme',next);
      try{localStorage.setItem('sc4sap-manual-theme',next);}catch(e){}
    });
    // A screen drawn smaller than its natural size opens at full size on click
    // (scrolling sideways inside its frame) and closes on a second click.
    var shots=document.querySelectorAll('figure.screen');
    for(var j=0;j<shots.length;j++)(function(f){
      var s=f.querySelector(':scope>svg');if(!s)return;
      var natural=parseFloat(s.getAttribute('width'))||0;
      if(!natural||s.getBoundingClientRect().width>=natural-1)return;
      f.setAttribute('data-zoom','');
      f.addEventListener('click',function(){if(!document.body.classList.contains('editing'))f.classList.toggle('zoomed');});
    })(shots[j]);
    var pb=document.getElementById('print-btn');
    if(pb)pb.addEventListener('click',function(){window.print();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
`;

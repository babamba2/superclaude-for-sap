// sc4sap — edit a process flowchart inside the page (manual edit mode, spec HTML).
//
// What the reader can do on a flow figure, with nothing installed:
//   · drag a shape to move it
//   · add a step (process, decision, message, start, end) — below the selected
//     shape and joined to it with an arrow
//   · drag one of the four dots on a shape's edge onto another shape to draw
//     an arrow; dropping on empty space makes a new step there
//   · click an arrow, then drag its end dot to another shape to reconnect it
//   · double-click a shape or an arrow to change its text (예 / 아니오 on arrows)
//   · change a shape's kind, delete a shape or an arrow (Delete key)
// The figure then holds a free graph (flow-draw.mjs) — every node keeps its
// position; the build draws the same picture from it (renderFlowchartSVG).
//
// Hosts
//   · program-to-manual: manual-editor.mjs attaches the editor to the
//     "processFlow" figure in edit mode; changes go to manual.processFlow and
//     its undo stack, and Save embeds them with the rest of the manual.
//   · program-to-spec HTML: FLOW_PAGE_SCRIPT gives each flow figure an
//     "Edit flow" button and a Save bar of its own. md-to-html.mjs writes the
//     figures from the <image>.graph.json files render-md-images.mjs leaves
//     next to each flow PNG.
//
// CLI (spec)
//   node flow-editor.mjs --import <edited.html> <image-spec.json>
//     writes the flows a user changed in the page into processFlow /
//     buttonFlows[].flow (backs up the old file as .bak).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOW_KIT_SOURCE } from './flow-draw.mjs';

const LABELS = {
  ko: {
    addProcess: '＋ 처리', addDecision: '＋ 판단', addIo: '＋ 메시지', addStart: '＋ 시작', addEnd: '＋ 종료',
    shape: '모양', types: { process: '처리', decision: '판단', io: '메시지', start: '시작', end: '종료' },
    text: '✎ 글자', del: '✕ 삭제', newStep: '새 단계',
    hint: '드래그=이동 · 도형 가장자리 점을 다른 도형으로 끌기=화살표 · 더블클릭=글자 수정 · Delete=삭제',
    editFlow: '✎ 흐름도 편집', doneFlow: '편집 종료', save: '저장', undo: '↶ 되돌리기',
    saved: '저장했습니다. 받은 HTML 파일을 담당자에게 보내 주세요.', unsaved: '저장하지 않은 변경이 있습니다.',
  },
  en: {
    addProcess: '＋ Process', addDecision: '＋ Decision', addIo: '＋ Message', addStart: '＋ Start', addEnd: '＋ End',
    shape: 'Shape', types: { process: 'Process', decision: 'Decision', io: 'Message', start: 'Start', end: 'End' },
    text: '✎ Text', del: '✕ Delete', newStep: 'New step',
    hint: 'Drag = move · drag a dot on a shape onto another shape = arrow · double-click = edit text · Delete = remove',
    editFlow: '✎ Edit flow', doneFlow: 'Done', save: 'Save', undo: '↶ Undo',
    saved: 'Saved. Send the downloaded HTML file to your contact.', unsaved: 'You have unsaved changes.',
  },
  ja: {
    addProcess: '＋ 処理', addDecision: '＋ 分岐', addIo: '＋ メッセージ', addStart: '＋ 開始', addEnd: '＋ 終了',
    shape: '形', types: { process: '処理', decision: '分岐', io: 'メッセージ', start: '開始', end: '終了' },
    text: '✎ 文字', del: '✕ 削除', newStep: '新しいステップ',
    hint: 'ドラッグ=移動 · 図形の縁の点を別の図形へドラッグ=矢印 · ダブルクリック=文字修正 · Delete=削除',
    editFlow: '✎ フロー編集', doneFlow: '編集終了', save: '保存', undo: '↶ 元に戻す',
    saved: '保存しました。ダウンロードした HTML を担当者に送ってください。', unsaved: '保存していない変更があります。',
  },
};

export const flowEditorLabels = (lang) => LABELS[String(lang || '').slice(0, 2).toLowerCase()] || LABELS.en;

export const FLOW_EDITOR_STYLE = `
.flow-fig{position:relative}
.flow-canvas>svg{display:block;width:100%;height:auto;margin:0 auto}
.fe-tools{display:none;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 10px;font-size:12px}
.flow-fig.fe-on .fe-tools{display:flex}
.fe-tools button,.fe-tools select,.flow-edit-btn,.fe-bar button{font:inherit;font-size:12px;padding:2px 8px;border:1px solid #d1d9e0;border-radius:5px;background:#f6f8fa;color:#1f2328;cursor:pointer}
.fe-tools button:hover,.flow-edit-btn:hover{border-color:#1f4e79}
.fe-tools button:disabled,.fe-tools select:disabled{opacity:.45;cursor:default}
.fe-tools .fe-hint{color:#59636e;flex-basis:100%}
.flow-fig.fe-on{outline:2px solid #1f6feb;outline-offset:2px}
.flow-fig .fp{opacity:0;transition:opacity .12s}
.flow-fig .fn:hover .fp,.flow-fig .fp:hover,.flow-fig.fe-linking .fp{opacity:1}
.fe-label{position:absolute;z-index:6;font:13px/1.4 Arial,sans-serif;text-align:center;padding:4px;border:2px solid #1f6feb;border-radius:4px;background:#fff;color:#1f2328;resize:none;box-shadow:0 4px 14px rgba(0,0,0,.18)}
.flow-edit-btn{position:absolute;top:8px;right:8px;z-index:3}
.fe-bar{position:fixed;right:16px;bottom:16px;z-index:20;display:flex;gap:8px;align-items:center;padding:8px 12px;background:#fff;border:1px solid #d1d9e0;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);font-size:13px;color:#1f2328}
.fe-bar button.primary{background:#1f4e79;color:#fff;border-color:#1f4e79}
@media print{.fe-tools,.flow-edit-btn,.fe-bar,.fe-label{display:none!important}.flow-fig.fe-on{outline:0}}
`;

// The editor proper. Uses no ${…}; String.raw keeps its backslashes.
const EDITOR_CORE = String.raw`
(function(){
  var FK=window.sc4sapFlowKit,seq=0;
  function clone(o){return JSON.parse(JSON.stringify(o));}
  function assign(a,b){var o={},k;for(k in a)o[k]=a[k];for(k in b)o[k]=b[k];return o;}
  function btn(label,fn){var b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();fn();});return b;}

  // cfg: { graph, opts (drawFreeFlow options), labels, onChange(next, prev) }
  function attach(fig,cfg){
    var L=cfg.labels,G=clone(cfg.graph||{layout:'free',nodes:[],edges:[]}),sel=null,frame=null,editing=false,uid='fx'+(++seq);
    G.layout='free';G.nodes=G.nodes||[];G.edges=G.edges||[];
    var canvas=fig.querySelector(':scope>.flow-canvas');
    if(!canvas){
      canvas=document.createElement('div');canvas.className='flow-canvas';
      Array.prototype.slice.call(fig.children).forEach(function(c){if(c.tagName!=='FIGCAPTION'&&!c.classList.contains('flow-edit-btn')&&c.tagName!=='SCRIPT')c.remove();});
      fig.insertBefore(canvas,fig.firstChild);
    }
    var tools=document.createElement('div');tools.className='fe-tools';
    [['addProcess','process'],['addDecision','decision'],['addIo','io'],['addStart','start'],['addEnd','end']].forEach(function(p){tools.appendChild(btn(L[p[0]],function(){addNode(p[1]);}));});
    var shape=document.createElement('select');shape.title=L.shape;
    ['process','decision','io','start','end'].forEach(function(t){var o=document.createElement('option');o.value=t;o.textContent=L.shape+': '+L.types[t];shape.appendChild(o);});
    shape.addEventListener('change',function(){var n=selNode();if(!n||n.type===shape.value)return;var prev=clone(G);n.type=shape.value;render();commit(prev);});
    var textBtn=btn(L.text,function(){if(sel)openLabel(sel);}),delBtn=btn(L.del,del);
    tools.appendChild(shape);tools.appendChild(textBtn);tools.appendChild(delBtn);
    var hint=document.createElement('span');hint.className='fe-hint';hint.textContent=L.hint;tools.appendChild(hint);
    fig.insertBefore(tools,canvas);

    function svg(){return canvas.querySelector('svg');}
    function node(id){for(var i=0;i<G.nodes.length;i++)if(G.nodes[i].id===id)return G.nodes[i];return null;}
    function selNode(){return sel&&sel.kind==='node'?node(sel.id):null;}
    function render(){
      var r=FK.draw(G,assign(cfg.opts||{},{uid:uid,frame:frame,edit:editing?{sel:sel}:null}));
      canvas.innerHTML=r.svg;var s=svg();if(s)s.style.maxWidth=r.width+'px';
      var n=selNode();shape.disabled=!n;if(n)shape.value=n.type||'process';
      textBtn.disabled=!sel;delBtn.disabled=!sel;
    }
    function commit(prev){if(cfg.onChange)cfg.onChange(clone(G),prev);}
    function select(s){sel=s;render();}
    function pt(ev){var s=svg(),p=s.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(s.getScreenCTM().inverse());}
    function snap(v){return Math.round(v/5)*5;}
    function newId(){var k=G.nodes.length+1;while(node('n'+k))k++;return 'n'+k;}
    function nearestSide(n,p){
      var b=FK.measure(n),best='N',bd=Infinity;
      ['N','E','S','W'].forEach(function(s){var q=FK.port(b,s),d=Math.pow(q.x-p.x,2)+Math.pow(q.y-p.y,2);if(d<bd){bd=d;best=s;}});
      return best;
    }
    function nodeAt(ev){var e=document.elementFromPoint(ev.clientX,ev.clientY);var g=e&&e.closest&&e.closest('.fn');return g&&canvas.contains(g)?node(g.getAttribute('data-id')):null;}

    function addNode(type,at,from,fromSide){
      var prev=clone(G),base=selNode(),n={id:newId(),type:type,label:L.newStep,x:0,y:0};
      if(at){n.x=snap(at.x);n.y=snap(at.y);}
      else if(base){var b=FK.measure(base);n.x=base.x;n.y=snap(b.b+40+FK.measure(n).h/2);}
      else if(G.nodes.length){var low=G.nodes.reduce(function(m,x){return FK.measure(x).b>FK.measure(m).b?x:m;});n.x=low.x;n.y=snap(FK.measure(low).b+40+FK.measure(n).h/2);}
      G.nodes.push(n);
      var src=from||(at?null:base);
      if(src)G.edges.push(fromSide?{from:src.id,to:n.id,fromSide:fromSide,toSide:nearestSide(n,FK.port(FK.measure(src),fromSide))}:{from:src.id,to:n.id});
      sel={kind:'node',id:n.id};render();commit(prev);openLabel(sel,true);
    }
    function del(){
      if(!sel)return;var prev=clone(G);
      if(sel.kind==='node'){var id=sel.id;G.nodes=G.nodes.filter(function(n){return n.id!==id;});G.edges=G.edges.filter(function(e){return e.from!==id&&e.to!==id;});}
      else G.edges.splice(sel.i,1);
      sel=null;render();commit(prev);
    }

    // ── text ──
    var box=null;
    function closeLabel(save){if(!box)return;var b=box;box=null;if(save&&b._done)b._done(b.value);b.remove();}
    function openLabel(s,selectAll){
      closeLabel(true);
      var target=s.kind==='node'?canvas.querySelector('.fn[data-id="'+CSS.escape(s.id)+'"]'):canvas.querySelector('.fe[data-ei="'+s.i+'"]');
      if(!target)return;
      var item=s.kind==='node'?node(s.id):G.edges[s.i];if(!item)return;
      var fr=fig.getBoundingClientRect(),r=target.getBoundingClientRect();
      var w=s.kind==='node'?Math.max(160,r.width):140,h=s.kind==='node'?Math.max(48,r.height):30;
      var cx=r.left+r.width/2-fr.left,cy=r.top+r.height/2-fr.top;
      box=document.createElement(s.kind==='node'?'textarea':'input');box.className='fe-label';
      box.style.left=Math.max(0,cx-w/2)+'px';box.style.top=Math.max(0,cy-h/2)+'px';box.style.width=w+'px';box.style.height=h+'px';
      box.value=item.label||'';
      box._done=function(v){if(v===(item.label||''))return;var prev=clone(G);if(v)item.label=v;else delete item.label;render();commit(prev);};
      box.addEventListener('keydown',function(e){
        e.stopPropagation();
        if(e.key==='Escape'){box._done=null;closeLabel(false);}
        else if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();closeLabel(true);}
      });
      box.addEventListener('blur',function(){closeLabel(true);});
      fig.appendChild(box);box.focus();if(selectAll)box.select();
    }

    // ── pointer: move, connect, reconnect, select ──
    var last={key:'',at:0};
    canvas.addEventListener('pointerdown',function(ev){
      if(!editing||ev.button!==0)return;
      var t=ev.target,fp=t.closest('.fp'),feh=t.closest('.feh'),fn=t.closest('.fn'),fe=t.closest('.fe');
      closeLabel(true);ev.preventDefault();
      if(fp&&fn){link(ev,{from:fn.getAttribute('data-id'),side:fp.getAttribute('data-side')});return;}
      if(feh&&fe){link(ev,{edge:+fe.getAttribute('data-ei'),end:feh.getAttribute('data-end')});return;}
      var key=fn?'n:'+fn.getAttribute('data-id'):fe?'e:'+fe.getAttribute('data-ei'):'';
      var dbl=key&&key===last.key&&Date.now()-last.at<400;last={key:key,at:Date.now()};
      if(fn){var id=fn.getAttribute('data-id');if(!sel||sel.kind!=='node'||sel.id!==id)select({kind:'node',id:id});if(dbl){openLabel(sel);return;}drag(ev,node(id));return;}
      if(fe){var i=+fe.getAttribute('data-ei');if(!sel||sel.kind!=='edge'||sel.i!==i)select({kind:'edge',i:i});if(dbl)openLabel(sel);return;}
      if(sel)select(null);
    });
    function drag(ev,n){
      if(!n)return;
      var prev=clone(G),p0=pt(ev),x0=n.x,y0=n.y,moved=false;frame=FK.bounds(G);
      function mv(e){var p=pt(e);var nx=snap(x0+p.x-p0.x),ny=snap(y0+p.y-p0.y);if(nx===n.x&&ny===n.y)return;moved=true;n.x=nx;n.y=ny;render();}
      function up(){document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);frame=null;render();if(moved)commit(prev);}
      document.addEventListener('pointermove',mv);document.addEventListener('pointerup',up);
    }
    function link(ev,what){
      var s=svg(),NS='http://www.w3.org/2000/svg',start;
      if(what.edge!=null){
        var e=G.edges[what.edge],a=node(e.from),b=node(e.to);if(!a||!b)return;
        var auto=FK.autoSides(FK.measure(a),FK.measure(b));
        start=what.end==='to'?FK.port(FK.measure(a),e.fromSide||auto[0]):FK.port(FK.measure(b),e.toSide||auto[1]);
      }else start=FK.port(FK.measure(node(what.from)),what.side);
      var line=document.createElementNS(NS,'line');
      line.setAttribute('x1',start.x);line.setAttribute('y1',start.y);line.setAttribute('x2',start.x);line.setAttribute('y2',start.y);
      line.setAttribute('stroke','#1f6feb');line.setAttribute('stroke-width','2');line.setAttribute('stroke-dasharray','6 4');line.style.pointerEvents='none';
      s.appendChild(line);fig.classList.add('fe-linking');
      function mv(e){var p=pt(e);line.setAttribute('x2',p.x);line.setAttribute('y2',p.y);}
      function up(e){
        document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);
        fig.classList.remove('fe-linking');line.remove();
        var p=pt(e),hit=nodeAt(e),prev=clone(G);
        if(what.edge!=null){
          var ed=G.edges[what.edge];
          if(!hit)return;
          if(what.end==='to'){if(hit.id===ed.from)return;ed.to=hit.id;ed.toSide=nearestSide(hit,p);}
          else{if(hit.id===ed.to)return;ed.from=hit.id;ed.fromSide=nearestSide(hit,p);}
          sel={kind:'edge',i:what.edge};render();commit(prev);return;
        }
        if(hit){
          if(hit.id===what.from)return;
          G.edges.push({from:what.from,to:hit.id,fromSide:what.side,toSide:nearestSide(hit,p)});
          sel={kind:'edge',i:G.edges.length-1};render();commit(prev);return;
        }
        if(Math.abs(p.x-start.x)+Math.abs(p.y-start.y)<30)return;
        addNode('process',p,node(what.from),what.side);
      }
      document.addEventListener('pointermove',mv);document.addEventListener('pointerup',up);
    }
    document.addEventListener('keydown',function(ev){
      if(!editing||!sel||box)return;
      if(ev.key!=='Delete'&&ev.key!=='Backspace')return;
      var t=ev.target;if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))return;
      ev.preventDefault();del();
    });

    var ctl={
      fig:fig,
      get:function(){return clone(G);},
      set:function(g){closeLabel(false);G=clone(g);sel=null;render();},
      setEditing:function(on){closeLabel(true);editing=!!on;if(!on)sel=null;fig.classList.toggle('fe-on',editing);render();},
      staticSvg:function(){var r=FK.draw(G,assign(cfg.opts||{},{uid:uid}));return r.svg.replace('<svg ','<svg style="max-width:'+r.width+'px" ');}
    };
    fig._flow=ctl;render();
    return ctl;
  }
  window.sc4sapFlow={attach:attach};
})();
`;

/** The kit (flow-draw.mjs) and the editor, for one inline <script>. */
export const FLOW_EDITOR_SCRIPT = `window.sc4sapFlowKit=(${FLOW_KIT_SOURCE})();\n${EDITOR_CORE}`;

/**
 * Spec HTML host: every <figure class="flow-fig"> holding a
 * <script type="application/json" class="flow-graph">{ key, graph, opts }</script>
 * gets an "Edit flow" button; the first change shows a Save / Undo bar.
 * Save downloads the page with each changed flow's JSON marked "edited".
 */
export const FLOW_PAGE_SCRIPT = String.raw`
(function(){
  var labEl=document.getElementById('flow-editor-labels');if(!labEl||!window.sc4sapFlow)return;
  var L=JSON.parse(labEl.textContent),undo=[],dirty=false,bar=null,statusEl=null,undoBtn=null;
  var figs=Array.prototype.slice.call(document.querySelectorAll('figure.flow-fig'));
  function data(fig){var s=fig.querySelector(':scope>script.flow-graph');return s?JSON.parse(s.textContent):null;}
  function btn(label,fn){var b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();fn();});return b;}
  function refresh(){if(undoBtn)undoBtn.disabled=!undo.length;}
  function showBar(){
    if(bar)return;bar=document.createElement('div');bar.className='fe-bar';
    statusEl=document.createElement('span');undoBtn=btn(L.undo,doUndo);var s=btn(L.save,save);s.className='primary';
    bar.appendChild(statusEl);bar.appendChild(undoBtn);bar.appendChild(s);document.body.appendChild(bar);refresh();
  }
  function doUndo(){var fn=undo.pop();if(fn)fn();refresh();}
  figs.forEach(function(fig){
    var d=data(fig);if(!d||!d.graph)return;
    var b=btn(L.editFlow,function(){
      if(!fig._flow){
        fig._flow=window.sc4sapFlow.attach(fig,{graph:d.graph,opts:d.opts,labels:L,onChange:function(next,prev){
          fig._edited=true;dirty=true;showBar();statusEl.textContent='';
          undo.push(function(){fig._flow.set(prev);});refresh();
        }});
      }
      var on=!fig.classList.contains('fe-on');fig._flow.setEditing(on);b.textContent=on?L.doneFlow:L.editFlow;
    });
    b.className='flow-edit-btn';fig.appendChild(b);
  });
  document.addEventListener('keydown',function(ev){
    if(!bar||!(ev.ctrlKey||ev.metaKey)||ev.shiftKey||String(ev.key).toLowerCase()!=='z')return;
    var t=ev.target;if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA)$/.test(t.tagName)))return;
    ev.preventDefault();doUndo();
  });
  function pageHtml(){
    var doc=document.documentElement.cloneNode(true),live=figs;
    doc.querySelectorAll('figure.flow-fig').forEach(function(f,i){
      var src=live[i];
      f.querySelectorAll('.fe-tools,.flow-edit-btn,.fe-label').forEach(function(e){e.remove();});
      f.classList.remove('fe-on','fe-linking');
      if(src&&src._flow){
        var c=f.querySelector(':scope>.flow-canvas');if(c)c.innerHTML=src._flow.staticSvg();
        var s=f.querySelector(':scope>script.flow-graph'),d=data(src);
        if(s&&d&&src._edited){d.graph=src._flow.get();d.edited=true;s.textContent=JSON.stringify(d).replace(/</g,'\\u003c');}
      }
    });
    doc.querySelectorAll('.fe-bar').forEach(function(e){e.remove();});
    return '<!doctype html>\n'+doc.outerHTML;
  }
  function fileName(){var f=decodeURIComponent(location.pathname.split('/').pop()||'spec.html');return /-edited\.html$/i.test(f)?f:f.replace(/\.html?$/i,'')+'-edited.html';}
  function save(){
    var blob=new Blob([pageHtml()],{type:'text/html'});
    function done(){dirty=false;statusEl.textContent=L.saved;}
    function download(){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fileName();document.body.appendChild(a);a.click();a.remove();done();}
    if(window.showSaveFilePicker){
      window.showSaveFilePicker({suggestedName:fileName(),types:[{description:'HTML',accept:{'text/html':['.html']}}]})
        .then(function(h){return h.createWritable();}).then(function(w){return w.write(blob).then(function(){return w.close();});}).then(done)
        .catch(function(e){if(e&&e.name!=='AbortError')download();});
    }else download();
  }
  window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue=L.unsaved;return L.unsaved;}});
})();
`;

// ── spec import ───────────────────────────────────────────────────────────

/** Flows the user changed in a spec page: [{ key, graph }]. key = "processFlow" | "buttonFlow:<CODE>". */
export function editedFlows(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script type="application\/json" class="flow-graph">([\s\S]*?)<\/script>/g)) {
    let d;
    try { d = JSON.parse(m[1]); } catch { continue; }
    if (d?.edited && d.key && d.graph) out.push({ key: d.key, graph: d.graph });
  }
  return out;
}

/** Writes edited flows into image-spec.json. Returns { written: [key…], missing: [key…], backup }. */
export function importEditedFlows(htmlPath, specPath) {
  const flows = editedFlows(readFileSync(htmlPath, 'utf8'));
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const written = [], missing = [];
  for (const { key, graph } of flows) {
    if (key === 'processFlow') { spec.processFlow = graph; written.push(key); continue; }
    const code = /^buttonFlow:(.+)$/.exec(key)?.[1];
    const bf = code && Array.isArray(spec.buttonFlows) ? spec.buttonFlows.find(f => String(f?.code) === code) : null;
    if (bf) { bf.flow = graph; written.push(key); } else missing.push(key);
  }
  let backup = null;
  if (written.length) {
    if (existsSync(specPath)) { backup = `${specPath}.bak`; writeFileSync(backup, readFileSync(specPath)); }
    writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  }
  return { written, missing, backup };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [flag, htmlPath, specPath] = process.argv.slice(2);
  if (flag !== '--import' || !htmlPath || !specPath) {
    console.error('Usage: node flow-editor.mjs --import <edited.html> <image-spec.json>');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(importEditedFlows(resolve(htmlPath), resolve(specPath)), null, 2));
  } catch (e) {
    console.error(`flow-editor: ${e.message}`);
    process.exit(1);
  }
}

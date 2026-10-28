// sc4sap:project-dashboard — the page: style, shell, and the in-browser library + edit mode.
//
// The model travels inside the page (<script type="application/json" id="project-model">{ model, version, history }).
// project-model.mjs and project-render.mjs are inlined (imports / exports stripped), so the edit mode redraws every
// tab from the edited model with the same code that built the page. "Save" downloads the page again with the
// edited model and a new revision entry; build-project-doc.mjs import reads it back.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAll, esc, labelsFor } from './project-render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const inline = (f) => readFileSync(join(here, f), 'utf8').replace(/^import .*$/gm, '').replace(/^export (const|function|async function|let)/gm, '$1');

const LIGHT = '--bg:#ffffff;--fg:#1d2733;--muted:#5a6675;--line:#d3dbe4;--head:#f2f5f8;--card:#f6f8fa;--accent:#1d4f73;--link:#0b62c4;'
  + '--red:#c62828;--amber:#b26a00;--green:#2e7d32;--red-bg:#fdecea;--amber-bg:#fff4e0;--green-bg:#e8f5e9;--F:#1f6fb2;--D:#b3541e;--X:#6b7480;--bar:#9fb6cc';
const DARK = '--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--card:#161d26;--accent:#5b9bd0;--link:#5aa2f0;'
  + '--red:#ef6b6b;--amber:#e0a43a;--green:#5cb85f;--red-bg:#3a1d1d;--amber-bg:#3a2c12;--green-bg:#1b3320;--F:#5b9bd0;--D:#e08a55;--X:#9aa3ad;--bar:#4a6680';

export const STYLE = `
:root{${LIGHT};color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme=light]){${DARK};color-scheme:dark}}
:root[data-theme=dark]{${DARK};color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR",sans-serif}
a{color:var(--link)}.muted{color:var(--muted)}.bad{color:var(--red);font-weight:600}small{color:var(--muted)}
.topbar{position:sticky;top:0;z-index:6;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 16px;background:var(--bg);border-bottom:1px solid var(--line)}
.topbar .t{font-weight:700;flex:1;min-width:180px}.topbar .t small{font-weight:400;margin-left:8px}
.topbar button,.tools button,.rowtools button{font:inherit;font-size:13px;padding:3px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}
.tabs{position:sticky;top:45px;z-index:5;display:flex;gap:2px;overflow-x:auto;padding:0 16px;background:var(--bg);border-bottom:1px solid var(--line)}
.tabs button{font:inherit;border:0;border-bottom:3px solid transparent;background:none;color:var(--muted);padding:9px 14px;cursor:pointer;white-space:nowrap}
.tabs button[aria-selected=true]{color:var(--fg);border-bottom-color:var(--accent);font-weight:600}
main{max-width:1680px;margin:0 auto;padding:12px 16px 64px}section.tab{display:none}section.tab.on{display:block}
h3{font-size:16px;margin:22px 0 8px}h4{font-size:14px;margin:12px 0 6px;color:var(--muted)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:8px 0 6px}
.tile{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--card)}.tile .k{color:var(--muted);font-size:12.5px}.tile .v{font-size:20px;margin-top:2px}
.grid2{display:grid;grid-template-columns:minmax(0,1fr);gap:0 28px}@media (min-width:1100px){.grid2{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.tw{overflow-x:auto;margin:6px 0 14px}table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:middle}th{background:var(--head);font-weight:600;white-space:nowrap}
.num{text-align:right;font-variant-numeric:tabular-nums}
.rag{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;font-weight:600}
.rag-red{background:var(--red-bg);color:var(--red)}.rag-amber{background:var(--amber-bg);color:var(--amber)}.rag-green{background:var(--green-bg);color:var(--green)}
.heat{display:inline-block;min-width:26px;text-align:center;border-radius:5px;font-weight:600}.heat-red{background:var(--red-bg);color:var(--red)}.heat-amber{background:var(--amber-bg);color:var(--amber)}.heat-green{background:var(--green-bg);color:var(--green)}
.pbar{display:inline-block;width:54px;height:7px;border-radius:4px;background:var(--line);vertical-align:middle;margin-right:5px;overflow:hidden}.pbar i{display:block;height:100%;background:var(--accent)}
.chart{width:100%;max-width:640px;height:auto}.chart .g{stroke:var(--line)}.chart .ax{fill:var(--muted);font-size:10.5px}
.chart .pl{fill:none;stroke:var(--muted);stroke-width:2;stroke-dasharray:5 4}.chart .ac{fill:none;stroke:var(--accent);stroke-width:2.5}.chart .acd{fill:var(--accent)}
.chart .pl-k{fill:var(--muted)}.chart .ac-k{fill:var(--accent)}.chart .td{stroke:var(--red);stroke-dasharray:3 3}.chart .bF{fill:var(--F)}.chart .bD{fill:var(--D)}.chart .bX{fill:var(--red)}
.tl-w{overflow-x:auto;padding:0 8px}.timeline{position:relative;margin:6px 70px 4px 40px;min-width:1000px}
.tl-track{position:absolute;left:0;right:0;top:34px;height:6px;border-radius:3px;background:var(--line)}.tl-past{height:100%;border-radius:3px;background:var(--muted);opacity:.45}
.tl-tick{position:absolute;top:34px;height:14px;border-left:1px solid var(--line)}.tl-tick span{position:absolute;top:14px;left:-20px;width:40px;text-align:center;font-size:11.5px;color:var(--muted);white-space:nowrap}.tl-tick span b{display:block;font-weight:600;color:var(--fg)}
.tl-today{position:absolute;top:18px;bottom:0;border-left:2px dashed var(--red);z-index:1}.tl-today b{position:absolute;top:-18px;left:0;transform:translateX(-50%);font-size:11.5px;font-weight:600;color:#fff;background:var(--red);border-radius:9px;padding:0 7px;white-space:nowrap}
.tl-slip{position:absolute;top:36px;border-top:2px dashed var(--amber);z-index:2}.tl-base{position:absolute;top:30px;width:12px;height:12px;margin-left:-6px;transform:rotate(45deg);border:2px dashed var(--muted);background:var(--bg);z-index:2}
.tl-ms{position:absolute;top:27px;z-index:3}.tl-ms i{position:absolute;left:-10px;width:20px;height:20px;transform:rotate(45deg);background:var(--green);border:2px solid var(--bg);box-shadow:0 0 0 1px rgba(0,0,0,.18)}
.tl-ms.k-golive i{left:-13px;top:-3px;width:26px;height:26px;transform:none;border:0;box-shadow:none;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.tl-ms.k-signoff i,.tl-ms.k-cutover i,.tl-ms.k-other i{border-radius:50%;transform:none}
.tl-ms.done i::after{content:'✓';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;transform:rotate(-45deg)}.tl-ms.done.k-golive i::after,.tl-ms.done.k-signoff i::after,.tl-ms.done.k-cutover i::after,.tl-ms.done.k-other i::after{transform:none}
.tl-ms span{position:absolute;left:-8px;white-space:nowrap;font-size:13px;font-weight:600;line-height:1.3;color:var(--fg);background:var(--bg);padding:2px 6px;border:1px solid var(--line);border-radius:6px}.tl-ms span small{display:block;font-size:12px;font-weight:400;color:var(--muted)}
.tl-ms.tl-r span{left:auto;right:-8px;text-align:right}.tl-ms span::before{content:'';position:absolute;left:7px;top:calc(-1 * var(--lead) - 1px);height:var(--lead);border-left:1px solid var(--muted)}.tl-ms.tl-r span::before{left:auto;right:7px}
.tl-ms.rag-b-red span{border-color:var(--red)}.tl-ms.rag-b-amber span{border-color:var(--amber)}
.tl-legend{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin:2px 0 14px;padding:0 8px;font-size:12.5px;color:var(--muted)}.tl-legend span{display:inline-flex;align-items:center;gap:6px}.tl-legend .sep{width:1px;height:14px;background:var(--line)}
.tl-legend .lg{display:inline-block;width:11px;height:11px;background:var(--muted)}.lg.k-qgate{transform:rotate(45deg)}.lg.k-signoff,.lg.c{border-radius:50%}.lg.k-golive{width:14px;height:14px;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.lg.c.rag-b-red{background:var(--red)}.lg.c.rag-b-amber{background:var(--amber)}.lg.c.rag-b-green{background:var(--green)}.lg.base{transform:rotate(45deg);background:none;border:2px dashed var(--muted)}.lg.now{width:2px;height:14px;background:none;border-left:2px dashed var(--red)}
.rag-b-red i,.gms.rag-b-red{background:var(--red)!important}.rag-b-amber i,.gms.rag-b-amber{background:var(--amber)!important}
.wbs{width:auto;min-width:100%}.wbs td,.wbs th{white-space:nowrap}.wbs .lbl{min-width:280px}.wbs td.gantt{position:relative;min-width:var(--gw,520px);padding:0;height:26px}.wbs th.gantt-h{position:sticky;top:0;z-index:3;min-width:var(--gw,520px);padding:0}
.months{position:relative;height:28px}.months span{position:absolute;top:6px;font-size:11px;color:var(--muted);border-left:1px solid var(--line);padding-left:3px}
.gb{position:absolute;top:7px;height:12px;border-radius:3px;background:var(--bar);overflow:hidden}.gb i{display:block;height:100%;background:var(--accent)}
.gb-phase{top:5px;height:16px;background:var(--line)}.gb.rag-b-red{outline:2px solid var(--red)}.gb.rag-b-amber{outline:2px solid var(--amber)}
.gbase{position:absolute;top:20px;height:3px;background:var(--muted);opacity:.55}.gtoday{position:absolute;top:0;bottom:0;border-left:1.5px dashed var(--red)}
.editing .gb[data-drag]{cursor:grab}.editing .gb[data-drag]:active{cursor:grabbing}.gb .h{position:absolute;top:0;bottom:0;width:7px;display:none}.editing .gb .h{display:block;cursor:ew-resize}.gb .hl{left:0}.gb .hr{right:0}.editing .gms[data-ms]{cursor:grab}
.wtools{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0 8px}.wtools input[type=search]{min-width:220px}.wtools input,.wtools select,.wtools button{font:inherit;font-size:13px;padding:3px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg)}.wtools .sep{flex:1}.wtools .eo{display:none}.editing .wtools .eo{display:inline}
#toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:30;display:none;padding:8px 14px;border-radius:8px;background:var(--fg);color:var(--bg);font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.25)}#toast.on{display:block}#toast button{margin-left:10px;font:inherit;border:0;border-radius:5px;padding:2px 8px;cursor:pointer}
.wbs tr.sel td{box-shadow:inset 0 0 0 9999px rgba(80,140,220,.13)}.bad-in{outline:2px solid var(--red)!important}
.wbs td:nth-child(1),.wbs th:nth-child(1){position:sticky;left:0;z-index:2;background:var(--bg);min-width:46px}.wbs td:nth-child(2),.wbs th:nth-child(2){position:sticky;left:46px;z-index:2;background:var(--bg)}.wr-phase td:nth-child(1),.wr-phase td:nth-child(2){background:var(--head)}
.state{font-size:12px;color:var(--muted)}.state.dirty{color:var(--amber);font-weight:600}
.wbs-w{max-height:calc(100vh - 150px);overflow:auto;position:relative}.wbs thead th{position:sticky;top:0;z-index:3;background:var(--head)}.wbs thead th:nth-child(1),.wbs thead th:nth-child(2){z-index:5}
#arr{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}#arr .ar{fill:none;stroke:var(--muted);stroke-width:1.3}#arr .ar.bad{stroke:var(--red);stroke-dasharray:4 3}#arr .ahd{fill:var(--muted)}
#arr .grid line{stroke:var(--muted);stroke-width:1;stroke-dasharray:2 3;opacity:.55}#arr .grid .gl-m{stroke:var(--fg);stroke-dasharray:5 3;opacity:.45}#arr .grid .gl-d{opacity:.25}
.gb .hp{position:absolute;top:-2px;bottom:-2px;width:4px;margin-left:-2px;background:var(--fg);opacity:.0;cursor:col-resize;border-radius:2px}.editing .gb:hover .hp{opacity:.7}
.gb .hc{position:absolute;right:-12px;top:50%;width:9px;height:9px;margin-top:-5px;border-radius:50%;border:2px solid var(--accent);background:var(--bg);display:none;cursor:crosshair}.editing .gb:hover .hc{display:block}.gb{overflow:visible}.gb i{border-radius:3px}
#linksvg{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:25;display:none}#linksvg.on{display:block}#linkline{stroke:var(--accent);stroke-width:2;stroke-dasharray:5 4}
.wbs tr.pick td{box-shadow:inset 0 0 0 9999px rgba(80,140,220,.2)}.wbs tr.chg td:nth-child(2){box-shadow:inset 3px 0 0 var(--amber)}.wbs tr.new td:nth-child(2){box-shadow:inset 3px 0 0 var(--green)}
.wbs td.num{cursor:pointer;color:var(--link)}
body.dw main,body.dw .banner{padding-right:min(436px,94vw);transition:padding .18s}body.dw .topbar{padding-right:min(436px,94vw)}
#drawer{position:fixed;top:0;right:0;bottom:0;width:min(420px,92vw);z-index:15;background:var(--bg);border-left:1px solid var(--line);box-shadow:-8px 0 24px rgba(0,0,0,.18);padding:14px 16px;overflow:auto;transform:translateX(105%);transition:transform .18s}#drawer.on{transform:none}
#drawer .dh{display:flex;gap:8px;align-items:center;font-size:17px;font-weight:600}#drawer .dh .ed{flex:1}#drawer .dn{color:var(--muted);font-weight:400}#drawer #d-x{border:0;background:none;color:var(--muted);font-size:16px;cursor:pointer}
#drawer dl{display:grid;grid-template-columns:110px 1fr;gap:7px 10px;margin:10px 0}#drawer dt{color:var(--muted);font-size:12.5px;padding-top:2px}#drawer dd{margin:0}#drawer .dk{font-size:12px}
#bulk{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:16;display:none;gap:6px;align-items:center;flex-wrap:wrap;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:0 6px 20px rgba(0,0,0,.2);font-size:13px}#bulk.on{display:flex}#bulk input,#bulk select,#bulk button{font:inherit;font-size:13px;padding:2px 6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
#pal,#help{position:fixed;inset:0;z-index:40;display:none;background:rgba(0,0,0,.35);align-items:flex-start;justify-content:center;padding-top:12vh}#pal.on,#help.on{display:flex}
#pal .pbox,#help .hbox{width:min(620px,94vw);background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.3);overflow:hidden}
#pal-q{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:0;border-bottom:1px solid var(--line);background:var(--bg);color:var(--fg);outline:none}
#pal-l{list-style:none;margin:0;padding:6px;max-height:50vh;overflow:auto}#pal-l li{display:flex;justify-content:space-between;gap:12px;padding:7px 10px;border-radius:7px;cursor:pointer}#pal-l li.on{background:var(--card);outline:1px solid var(--line)}#pal-l small{color:var(--muted)}
#help .hbox{padding:6px 18px 16px;max-height:80vh;overflow:auto;position:relative}#help .hx{position:absolute;right:10px;top:10px;border:0;background:none;color:var(--muted);font-size:16px;cursor:pointer}#help th{white-space:nowrap;background:none;border:0;border-bottom:1px solid var(--line);padding:6px 12px 6px 0;font-family:Consolas,monospace;font-size:12.5px}#help td{border:0;border-bottom:1px solid var(--line);padding:6px 0}
@media print{#drawer,#bulk,#pal,#help,#cmd,.state{display:none!important}.wbs-w{max-height:none;overflow:visible}}
.mv,.mo{display:none}.mv{display:none;border:1px solid var(--line);border-radius:7px;overflow:hidden}.mv button{border:0!important;border-radius:0!important}.mv button[aria-pressed=true],.mo[aria-pressed=true]{background:var(--accent)!important;color:var(--bg)!important}
.gb.lift{box-shadow:0 0 0 3px var(--accent);z-index:4}.t-touch{display:none}
.gb,.gms{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}.gb.press{box-shadow:0 0 0 2px var(--accent);transition:box-shadow .4s}
@media (pointer: coarse){.t-touch{display:table}.t-keys{display:none}.gb .hc,.gb .hp{display:none!important}}
@media (max-width: 760px){
 .topbar{gap:6px;padding:6px 10px}.topbar .t{min-width:0;flex-basis:100%;font-size:14px}.topbar .t small{display:block;margin:0}#print,#theme,.state{display:none}
 .topbar button,.wtools button,.wtools select,.wtools input{min-height:34px}.tabs{top:auto;position:static}main{padding:8px 10px 80px}
 .mv{display:inline-flex}.mo{display:inline-block}.wtools > input,.wtools > select,.wtools > label,.wtools > button:not(.mo),.wtools .sep{display:none}.wtools.open > input,.wtools.open > select,.wtools.open > label,.wtools.open > button{display:inline-block}.editing .wtools.open .eo{display:inline-block}
 .wbs-w{max-height:none}.wbs .lbl{min-width:0;max-width:36vw;overflow:hidden;text-overflow:ellipsis}.wbs td,.wbs th{padding:4px 6px}.wbs td:nth-child(1),.wbs th:nth-child(1){min-width:34px;font-size:11.5px}.wbs td:nth-child(2),.wbs th:nth-child(2){left:34px}.wbs .lbl .wk{display:none}
 body.m-gantt .wbs th:nth-child(n+3):nth-child(-n+9),body.m-gantt .wbs td:nth-child(n+3):nth-child(-n+9){display:none}
 body.m-table .wbs th.gantt-h,body.m-table .wbs td.gantt,body.m-table #arr{display:none}
 .wbs td.gantt{height:38px}.gb{top:10px;height:18px}.gb-phase{top:9px;height:20px}.gms{top:12px;width:14px;height:14px}.gbase{top:30px}.rowtools{display:none!important}
 body.dw main,body.dw .banner,body.dw .topbar{padding-right:10px}
 #drawer{top:auto;left:0;right:0;width:100%;height:74vh;border-left:0;border-top:1px solid var(--line);border-radius:14px 14px 0 0;transform:translateY(105%)}#drawer.on{transform:none}#drawer::before{content:"";display:block;width:42px;height:4px;border-radius:2px;background:var(--line);margin:0 auto 10px}
 #drawer dl{grid-template-columns:96px 1fr}#drawer .ed{min-height:28px}
 #bulk{left:8px;right:8px;transform:none;bottom:12px}#toast{bottom:12px;max-width:92vw}#pal{padding-top:6vh}.banner{margin:6px 10px;font-size:13px}
 .tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.tile .v{font-size:17px}
 .topbar .tx{display:none}.topbar .t{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.topbar .t small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .tw:has(table.rt){overflow:visible}table.rt thead{display:none}table.rt,table.rt tbody,table.rt tr{display:block;width:100%}
 table.rt tr{border:1px solid var(--line);border-radius:10px;margin:0 0 8px;padding:6px 12px;background:var(--card)}
 table.rt td{display:flex;gap:12px;justify-content:space-between;align-items:center;border:0;padding:4px 0;min-height:26px;text-align:right}
 table.rt td::before{content:attr(data-l);color:var(--muted);font-size:12px;text-align:left;flex:none;max-width:45%}
 table.rt td:first-child{font-weight:600;text-align:left;display:block}table.rt td:first-child::before{display:none}table.rt td:empty{display:none}
 .editing .ed{min-height:32px;min-width:32px;padding:4px 8px;display:inline-flex;align-items:center}.ed select,.ed input{font-size:16px;min-height:32px}
 .timeline{margin:6px 60px 4px 30px}
 #drawer .dacts{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 4px}#drawer .dacts button{font:inherit;font-size:14px;min-height:38px;padding:4px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg)}#drawer .dacts .del{color:var(--red)}
}
.topbar .ic{display:none}@media (max-width: 760px){.topbar .ic{display:inline}}
#drawer .dacts{display:none}@media (max-width: 760px){.editing #drawer .dacts{display:flex}}
.dragtip{position:fixed;z-index:20;padding:3px 8px;border-radius:6px;background:var(--fg);color:var(--bg);font-size:12px;pointer-events:none;white-space:nowrap}
.gms{position:absolute;top:7px;width:11px;height:11px;transform:translateX(-5px) rotate(45deg);background:var(--green)}
.wr-phase td{background:var(--head);font-weight:600}.wr-deliverable .lbl{font-weight:500}
.tg{border:0;background:none;color:var(--muted);cursor:pointer;padding:0 4px 0 0;font-size:12px}.collapsed .tg{transform:rotate(-90deg)}
.wk{display:inline-block;min-width:18px;text-align:center;font-size:11px;font-weight:700;border-radius:4px;background:var(--card);border:1px solid var(--line);margin-right:5px}
.stage{display:inline-block;padding:0 7px;border-radius:5px;font-size:12px;font-weight:600;color:#fff}.stage-F{background:var(--F)}.stage-D{background:var(--D)}.stage-X{background:var(--X)}
.side{display:inline-block;margin-right:6px;padding-left:6px;border-left:3px solid}.side-F{border-color:var(--F)}.side-D{border-color:var(--D)}
.spark polyline{fill:none;stroke:var(--accent);stroke-width:1.6}.st{font-size:12px}.st-blocked{color:var(--red);font-weight:600}.st-done{color:var(--green)}
.rowtools{display:none;margin-left:8px}.editing tr.wr:hover .rowtools,.editing tr.sel .rowtools{display:inline}.cal{border:0;background:none;cursor:pointer;padding:0 2px}.pk{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.rowtools button{padding:0 5px;font-size:11px;margin-left:2px}
.editing .ed{outline:1px dashed var(--accent);outline-offset:1px;cursor:pointer;min-width:16px;display:inline-block;border-radius:3px}
.editing .ed:empty::before{content:"·";color:var(--muted)}
.tools{display:none;gap:6px;margin:6px 0}.editing .tools{display:flex}
.banner{display:none;margin:8px 16px;padding:8px 12px;border:1px solid var(--amber);background:var(--amber-bg);border-radius:8px}
.editing .banner.hint,.banner.on{display:block}
dialog{border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);min-width:320px}dialog input{width:100%;font:inherit;padding:5px;margin:4px 0 10px}
@media print{.topbar button,.tabs,.tools,.rowtools,.banner{display:none!important}section.tab{display:block!important;break-before:page}.wbs td.gantt{min-width:360px}}
`;

/** In-browser code: the inlined model + render library, the labels, then project-client.js. */
function clientScript(E) {
  return `(function(){\n${inline('project-model.mjs')}\n${inline('project-render.mjs')}\nvar E=${JSON.stringify(E)};\n${readFileSync(join(here, 'project-client.js'), 'utf8')}\n})();`;
}

const EDIT = {
  ko: { edit: '편집', done: '편집 종료', save: '저장', undo: '되돌리기', print: '인쇄', theme: '테마', addChild: '하위 항목 추가', addBelow: '아래에 추가', indent: '들여쓰기', outdent: '내어쓰기', up: '위로', down: '아래로', del: '삭제',
    delRow: '이 항목과 하위 항목을 삭제할까요?', newRow: '새 항목', newMs: '새 마일스톤', newTm: '새 팀원', newKpi: '새 KPI', days: '일', addMs: '+ 마일스톤', addTm: '+ 팀원', addKpi: '+ KPI',
    hint: '편집 모드 — 칸을 눌러 고치고 Enter로 다음 행으로 갑니다. 간트 막대는 끌어서 옮깁니다. 단축키는 ?, 모든 명령은 Ctrl+K.',
    allWs: '모든 워크스트림', allOwners: '모든 담당', search: '검색 (항목·담당·워크스트림)', late: '지연만', openAll: '모두 펼치기', closeAll: '단계만', zoomIn: '확대', zoomOut: '축소', toToday: '오늘로', redo: "다시 실행", stDirty: "변경 {n}건", stDraft: "초안 저장됨 {t}", stSaved: "저장됨 {t}", stClean: "변경 없음", stChanged: "빌드 이후 바뀐 행 {n}", kind: "WRICEF 유형", stageDates: "단계 완료일", objects: "SAP 객체", succ: "후속 작업", evidence: "시스템 근거", memo: "메모", drawerEdit: "칸을 눌러 고칩니다. Enter: 다음 칸 · Esc: 닫기", drawerView: "칸을 두 번 누르면 바로 편집합니다. Esc: 닫기", newPhase: "새 단계", deletedN: "{n}개 행 삭제함.", bkShift: "일정 이동(일)", bkApply: "적용", bkClear: "선택 해제", bkN: "{n}개 선택", bkDone: "{n}개 행에 적용함.", linkTo: "→ {x} 의 선행으로 연결", linkHint: "다른 막대 위에서 놓으면 연결됩니다", cycle: "순환 연결이라 연결하지 않았습니다.", linked: "{a} → {b} 연결함.", copied: "{n}개 행 복사함 — 엑셀에 붙여넣을 수 있습니다.", pasted: "{n}개 행을 붙여넣었습니다.", baselined: "현재 일정을 기준선으로 저장했습니다.", palTab: "탭", palEdit: "편집 모드 켜기/끄기", changes: "변경 표시", csv: "CSV 내보내기", baseline: "기준선 저장", help: "단축키", cmd: "명령 (Ctrl+K)", palPh: "항목·사람·명령 검색…", helpRows: [["Ctrl+K","명령 팔레트 — 항목·사람·동작 찾기"],["# 클릭","행 상세 패널"],["Ctrl/Shift + # 클릭","여러 행 선택 → 일괄 일정·상태·담당·삭제"],["↑ ↓","행 이동"],["← →","접기·펼치기"],["Enter / F2 / 두 번 클릭","편집 시작"],["Enter · Tab · Esc","저장 후 아래 · 다음 칸 · 취소"],["Ctrl+Enter / Ctrl+Shift+Enter","아래에 행 / 하위 행 추가"],["Alt + ← → ↑ ↓","내어쓰기·들여쓰기·순서"],["Delete","선택 행 삭제 (되돌리기 가능)"],["날짜","0315 · 3/15 · +3 · -2 · +2w · +1m · 오늘 · ↑↓(±1일) · Shift+↑↓(±1주) · 📅"],["간트 막대","끌기: 이동 · 양 끝: 시작·종료 · 안의 세로선: 진척률 · 오른쪽 점: 다른 막대로 끌어 선행 연결"],["빈 간트 칸 두 번 클릭","1주 일정 생성"],["Ctrl+C / Ctrl+V","선택 행 복사 → 엑셀 · 엑셀 여러 줄 붙여넣기 → 행 생성 (항목, 시작, 종료, 담당, 개발, 워크스트림)"],["Ctrl+Z / Ctrl+Y","되돌리기 / 다시 실행"],["Ctrl+S","저장 (같은 파일에 덮어쓰기)"],["?","이 도움말"]],
    editOn: '편집 모드를 켰습니다.', vGantt: '간트', vTable: '표', select: '선택', filters: '필터', selOn: '선택 모드 — 행을 누르면 선택에 더해집니다.', selOff: '선택 모드 끔',
    touchRows: [['행·막대 탭', '상세 패널 (아래에서 올라옴) — 여기서 날짜·상태·담당 수정'], ['막대 길게 누르기', '진동 후 끌어서 일정 이동 (편집 모드가 자동으로 켜짐) · 막대 끝을 길게 누르면 시작·종료일 · 화면 끝으로 끌면 간트가 따라 스크롤'], ['선택', '여러 행을 눌러 선택 → 일괄 일정·상태·담당·삭제'], ['간트 | 표', '간트만 보기 / 모든 칸 보기'], ['⌘K', '항목·사람·명령 찾기']],
    autoShift: '후속 작업 자동 이동', calendar: '달력에서 고르기',
    datePh: '2026-03-15 · 0315 · +3 · +2w · 오늘 · ↑↓', depsPh: '행 번호: 2.1, 3.4', shifted: '후속 작업 {n}개를 함께 옮겼습니다.', deleted: '‘{x}’ 삭제함.',
    draft: '저장하지 않은 편집이 있습니다.', resume: '이어서 편집', discard: '버리기', unsaved: '저장하지 않은 변경이 있습니다.',
    saveTitle: '저장 — 개정 이력', author: '작성자', note: '변경 내용', noteDefault: '편집 모드에서 계획 수정', ok: '저장', cancel: '취소',
    saved: '저장했습니다. 이 파일을 PMO(또는 담당자)에게 보내면 import 해서 다음 버전이 됩니다. 계속 편집하고 Ctrl+S 하면 같은 파일에 덮어씁니다.' },
  en: { edit: 'Edit', done: 'Done', save: 'Save', undo: 'Undo', print: 'Print', theme: 'Theme', addChild: 'Add child', addBelow: 'Add below', indent: 'Indent', outdent: 'Outdent', up: 'Move up', down: 'Move down', del: 'Delete',
    delRow: 'Delete this item and everything under it?', newRow: 'New item', newMs: 'New milestone', newTm: 'New member', newKpi: 'New KPI', days: ' d', addMs: '+ Milestone', addTm: '+ Member', addKpi: '+ KPI',
    hint: 'Edit mode — click a cell to change it, Enter goes to the next row. Drag Gantt bars to move them. Shortcuts: ?, every command: Ctrl+K.',
    allWs: 'All workstreams', allOwners: 'All owners', search: 'Search (item, owner, workstream)', late: 'Late only', openAll: 'Expand all', closeAll: 'Phases only', zoomIn: 'Zoom in', zoomOut: 'Zoom out', toToday: 'Today', redo: "Redo", stDirty: "{n} change(s)", stDraft: "draft saved {t}", stSaved: "saved {t}", stClean: "no changes", stChanged: "{n} row(s) changed since build", kind: "WRICEF kind", stageDates: "Stage done", objects: "SAP objects", succ: "Successors", evidence: "System evidence", memo: "Note", drawerEdit: "Click a value to change it. Enter: next · Esc: close", drawerView: "Double-click a value to edit it. Esc: close", newPhase: "New phase", deletedN: "{n} row(s) deleted.", bkShift: "Shift days", bkApply: "Apply", bkClear: "Clear", bkN: "{n} selected", bkDone: "Applied to {n} row(s).", linkTo: "→ make it a predecessor of {x}", linkHint: "drop on another bar to link", cycle: "Not linked: it would make a loop.", linked: "{a} → {b} linked.", copied: "{n} row(s) copied — paste them into Excel.", pasted: "{n} row(s) pasted.", baselined: "Current dates saved as the baseline.", palTab: "Tab", palEdit: "Toggle edit mode", changes: "Show changes", csv: "Export CSV", baseline: "Save baseline", help: "Shortcuts", cmd: "Commands (Ctrl+K)", palPh: "Search items, people, commands…", helpRows: [["Ctrl+K","Command palette — find items, people, actions"],["Click #","Row detail panel"],["Ctrl/Shift + click #","Select rows → bulk dates, status, owners, delete"],["↑ ↓","Move between rows"],["← →","Collapse / expand"],["Enter / F2 / double-click","Start editing"],["Enter · Tab · Esc","Save and go down · next cell · cancel"],["Ctrl+Enter / Ctrl+Shift+Enter","Add row below / child"],["Alt + ← → ↑ ↓","Outdent, indent, reorder"],["Delete","Delete selected rows (undo available)"],["Dates","0315 · 3/15 · +3 · -2 · +2w · +1m · today · ↑↓ (±1 day) · Shift+↑↓ (±1 week) · 📅"],["Gantt bar","drag: move · ends: start / finish · inner line: progress · right dot: drag onto another bar to link"],["Double-click an empty Gantt cell","Create a one-week schedule"],["Ctrl+C / Ctrl+V","Copy selected rows to Excel · paste lines from Excel to create rows (item, start, finish, owner, developer, workstream)"],["Ctrl+Z / Ctrl+Y","Undo / redo"],["Ctrl+S","Save (overwrites the same file)"],["?","This help"]],
    editOn: 'Edit mode on.', vGantt: 'Gantt', vTable: 'Table', select: 'Select', filters: 'Filters', selOn: 'Select mode — tap rows to add them.', selOff: 'Select mode off',
    touchRows: [['Tap a row or bar', 'Detail sheet (slides up) — change dates, status, owners there'], ['Press and hold a bar', 'After the buzz, drag to move (edit mode switches on) · hold near an end for start / finish · drag to the edge and the Gantt scrolls'], ['Select', 'Tap rows to select → bulk dates, status, owners, delete'], ['Gantt | Table', 'Gantt only / every column'], ['⌘K', 'Find items, people, commands']],
    autoShift: 'Successors follow', calendar: 'Pick from calendar',
    datePh: '2026-03-15 · 0315 · +3 · +2w · today · ↑↓', depsPh: 'row numbers: 2.1, 3.4', shifted: '{n} successor(s) moved along.', deleted: '“{x}” deleted.',
    draft: 'You have unsaved edits.', resume: 'Continue editing', discard: 'Discard', unsaved: 'You have unsaved changes.',
    saveTitle: 'Save — revision', author: 'Author', note: 'Change', noteDefault: 'Plan edited in edit mode', ok: 'Save', cancel: 'Cancel',
    saved: 'Saved. Send this file to the PMO (or owner) — importing it makes the next version. Keep editing; Ctrl+S overwrites the same file.' },
};

/** WBS toolbar: filters and zoom for everyone, auto-shift in edit mode. */
const wbsTools = (E) => `<div class="wtools"><span class="mv"><button data-v="gantt">${esc(E.vGantt)}</button><button data-v="table">${esc(E.vTable)}</button></span><button id="f-sel" class="mo" aria-pressed="false">${esc(E.select)}</button><button id="f-more" class="mo">${esc(E.filters)} ▾</button><input id="f-q" type="search" placeholder="${esc(E.search)}"><select id="f-ws"></select><select id="f-owner"></select>
<label><input id="f-late" type="checkbox"> ${esc(E.late)}</label><button id="f-open">${esc(E.openAll)}</button><button id="f-close">${esc(E.closeAll)}</button>
<span class="sep"></span><button id="z-out" title="${esc(E.zoomOut)}">−</button><button id="z-in" title="${esc(E.zoomIn)}">+</button><button id="f-today">${esc(E.toToday)}</button>
<label><input id="f-chg" type="checkbox"> ${esc(E.changes)}</label><button id="f-csv">${esc(E.csv)}</button>
<label class="eo"><input id="f-shift" type="checkbox" checked> ${esc(E.autoShift)}</label><button class="eo" id="f-base">${esc(E.baseline)}</button><button class="eo" id="f-phase">+ ${esc(E.newPhase)}</button></div>`;

/** The whole page for a model. */
export function renderPage(model, { version, date, history = [], today, companion = '' }) {
  const { v, L, ...tabs } = renderAll(model, { history, today });
  const E = EDIT[String(v.m.lang).slice(0, 2)] || EDIT.en;
  const p = v.m.project;
  const data = JSON.stringify({ model, version, history }).replace(/</g, '\\u003c');
  const sec = (t, extra = '') => `<section class="tab" id="tab-${t}">${extra}<div class="body">${tabs[t]}</div></section>`;
  return `<!doctype html>
<html lang="${esc(v.m.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} — ${esc(L.tabs.sum)} v${esc(version)}</title><style>${STYLE}</style></head>
<body>
<div class="topbar"><div class="t">${esc(p.code)} · ${esc(p.name)} <small>v${esc(version)} · ${esc(date)} · Go-Live ${esc(p.goLive)}</small></div>
<span id="state" class="state"></span><span id="overall" class="rag rag-${v.overall}">${esc(L.rag[v.overall])}</span><button id="cmd" title="${esc(E.cmd)}">⌘K</button>
${companion ? `<a href="${esc(companion)}">${v.m.lang === 'en' ? '한국어' : 'English'}</a>` : ''}
<button id="edit">${E.edit}</button><button id="undo" title="${E.undo} (Ctrl+Z)"><span class="ic">↶</span><span class="tx">${E.undo}</span></button><button id="save" title="${E.save} (Ctrl+S)"><span class="ic">💾</span><span class="tx">${E.save}</span></button><button id="print">${E.print}</button><button id="theme">${E.theme}</button></div>
<nav class="tabs">${Object.entries(L.tabs).map(([k, t]) => `<button data-t="${k}">${esc(t)}</button>`).join('')}</nav>
<div class="banner hint">${esc(E.hint)}</div>
<div class="banner" id="draft">${esc(E.draft)} <button id="resume">${E.resume}</button> <button id="discard">${E.discard}</button></div>
<main>
${sec('sum')}${sec('kpi', `<div class="tools"><button id="add-kpi">${E.addKpi}</button></div>`)}${sec('ms', `<div class="tools"><button id="add-ms">${E.addMs}</button></div>`)}${sec('wbs', wbsTools(E))}${sec('sap')}${sec('team', `<div class="tools"><button id="add-tm">${E.addTm}</button></div>`)}${sec('hist')}
</main>
<dialog id="save-dlg"><h3>${E.saveTitle}</h3><label>${E.author}<input id="s-author"></label><label>${E.note}<input id="s-note"></label>
<div><button id="s-ok">${E.ok}</button> <button id="s-cancel">${E.cancel}</button></div></dialog>
<script type="application/json" id="project-model">${data}</script>
<div id="toast" role="status"></div>
<aside id="drawer" aria-label="detail"></aside>
<div id="bulk"></div>
<div id="pal"><div class="pbox"><input id="pal-q" placeholder="${esc(E.palPh)}" autocomplete="off"><ul id="pal-l"></ul></div></div>
<div id="help"><div class="hbox"><button class="hx">✕</button><h3>${esc(E.help)}</h3><table class="t-touch">${E.touchRows.map(([k, d]) => `<tr><th>${esc(k)}</th><td>${esc(d)}</td></tr>`).join('')}</table><table class="t-keys">${E.helpRows.map(([k, d]) => `<tr><th>${esc(k)}</th><td>${esc(d)}</td></tr>`).join('')}</table></div></div>
<svg id="linksvg"><line id="linkline"/></svg>
<script>${clientScript(E)}</script>
</body></html>`;
}

export { labelsFor };

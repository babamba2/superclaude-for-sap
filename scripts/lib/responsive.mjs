// Phone layer for the HTML deliverables (spec, manual, process, config, project, role, relmap, ops, transport,
// interface mapping, UAT). Applies only under 600px — PC and print stay exactly as they were.
//
//   import { RESPONSIVE_CSS, RESPONSIVE_JS } from '../lib/responsive.mjs';
//   <style>…${RESPONSIVE_CSS}</style> … <script>${RESPONSIVE_JS}</script></body>
//
// What it does on a phone:
//   · key–value tables (rows like label | value | label | value, no <thead>) → one label | value pair per line,
//     label stacked over value below 380px. The script tags them `m-kv`; a builder can tag a table itself, or
//     opt out with `m-keep`. Cells with class `m-hide` disappear (decorative arrows).
//   · other tables wider than their box → wrapped in `.m-scroll` (scrolls sideways inside the wrapper, the
//     page never does); the first column stays put while scrolling (cells without colspan).
//   · toolbars tagged `m-bar` wrap; their buttons and every form control get 44px touch targets; inputs 16px
//     (iOS does not zoom into them).
// The script re-runs after a page re-renders (MutationObserver) and when the width crosses 600px.

export const RESPONSIVE_CSS = `
@media (max-width:600px){
html{-webkit-text-size-adjust:100%}
p,li,dd,dt,blockquote,h1,h2,h3,h4{overflow-wrap:anywhere}img,video{max-width:100%;height:auto}pre{overflow-x:auto;max-width:100%}
th,td{min-width:3em}
table.m-kv{display:block;width:100%!important;max-width:100%;table-layout:auto!important}
table.m-kv>tbody,table.m-kv>thead,table.m-kv>tfoot{display:grid;grid-template-columns:minmax(6.5em,36%) minmax(0,1fr)}
table.m-kv>tbody>tr,table.m-kv>thead>tr,table.m-kv>tfoot>tr{display:contents}
table.m-kv th,table.m-kv td{width:auto!important;min-width:0!important;max-width:none!important;white-space:normal!important;overflow-wrap:anywhere;word-break:normal}
table.m-kv th[colspan]:not([colspan="1"]),table.m-kv .m-full{grid-column:1/-1}
table.m-kv .m-hide{display:none!important}
.m-scroll{overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
.m-scroll>table{min-width:var(--m-min,560px)}
.m-scroll tr>th:first-child:not([colspan]),.m-scroll tr>td:first-child:not([colspan]){position:sticky;left:0;z-index:2;background-color:var(--m-sticky-bg,#fff);box-shadow:1px 0 0 rgba(0,0,0,.12)}
.m-bar{flex-wrap:wrap!important;row-gap:6px;height:auto!important}
.m-bar button,.m-bar a,.m-bar select,.m-bar label{min-height:44px;min-width:44px;box-sizing:border-box}
button,select,input[type=button],input[type=submit]{min-height:44px;min-width:44px}
input,select,textarea{font-size:16px!important}
input:not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea{min-height:44px;box-sizing:border-box}
}
@media (max-width:380px){
table.m-kv>tbody,table.m-kv>thead,table.m-kv>tfoot{grid-template-columns:minmax(0,1fr)}
table.m-kv th{border-bottom:0!important}
}
@media print{.m-scroll{overflow:visible!important}}
`;

// Kept as a plain function so a test can run it against a DOM; serialized into the page.
function mobileLayer() {
  var mq = window.matchMedia && window.matchMedia('(max-width:600px)');
  if (!mq) return;
  function kvLike(t) {
    if (t.tHead || t.classList.contains('m-keep') || t.closest('.m-keep')) return false;
    for (var i = 0; i < t.rows.length; i++) {
      var c = t.rows[i].cells;
      for (var j = 1; j < c.length; j++) if (c[j].tagName === 'TH' && c[j - 1].tagName === 'TD') return true;
    }
    return false;
  }
  function scrolls(el) {
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      var o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
    return false;
  }
  // a table that fits only by squeezing: a cell under 48px whose short text breaks onto several lines
  function squeezed(t) {
    for (var i = 0; i < Math.min(t.rows.length, 6); i++) {
      var c = t.rows[i].cells;
      for (var j = 0; j < c.length; j++) {
        var w = c[j].getBoundingClientRect().width, txt = (c[j].textContent || '').trim();
        if (w > 0 && w < 48 && txt.length > 2) {
          var r = document.createRange(); r.selectNodeContents(c[j]);
          var tops = {}, n = 0, rs = r.getClientRects();
          for (var k = 0; k < rs.length; k++) if (rs[k].width > 0 && !tops[Math.round(rs[k].top)]) { tops[Math.round(rs[k].top)] = 1; n++; }
          if (n > 1) return true;
        }
      }
    }
    return false;
  }
  function cols(t) {
    var n = 0;
    for (var i = 0; i < Math.min(t.rows.length, 6); i++) {
      var m = 0, c = t.rows[i].cells;
      for (var j = 0; j < c.length; j++) m += c[j].colSpan || 1;
      if (m > n) n = m;
    }
    return n;
  }
  // set the width, then widen by half while a cell is still squeezed (at most twice, at most 2000px)
  function grow(t, w) {
    t.style.minWidth = w;
    for (var k = 0; k < 2 && squeezed(t); k++) {
      var next = Math.min(2000, Math.round(parseFloat(t.style.minWidth) * 1.5));
      if (next <= parseFloat(t.style.minWidth)) break;
      t.style.minWidth = next + 'px';
    }
  }
  var busy = false;
  function scan() {
    if (!mq.matches || busy) return;
    busy = true;
    var ts = document.querySelectorAll('table');
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      if (t.classList.contains('m-kv') || kvLike(t)) { t.classList.add('m-kv'); continue; }
      if (t.closest('.m-kv')) continue;
      var tight = squeezed(t);
      // squeezed: about 90px per column, at least 560px
      var widen = tight ? Math.max(560, cols(t) * 90) + 'px' : '';
      if (scrolls(t)) { if (widen && !t.style.minWidth) grow(t, widen); continue; }
      var box = t.parentElement;
      if (box && (tight || t.scrollWidth > box.clientWidth + 2)) {
        var w = document.createElement('div');
        w.className = 'm-scroll';
        box.insertBefore(w, t);
        w.appendChild(t);
        if (widen) grow(t, widen);
      }
    }
    busy = false;
  }
  var queued = false;
  function later() { if (!queued) { queued = true; requestAnimationFrame(function () { queued = false; scan(); }); } }
  if (window.MutationObserver) new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] });
  if (mq.addEventListener) mq.addEventListener('change', later);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  window.addEventListener('load', scan);
  window.addEventListener('resize', later);
}

export const RESPONSIVE_JS = `(${mobileLayer.toString()})();`;

/** Put the layer into a finished page: CSS before </head>, script before </body>. Idempotent. */
export function withResponsive(html) {
  const s = String(html);
  if (s.includes('data-sc4sap-responsive')) return s;
  const css = `<style data-sc4sap-responsive>${RESPONSIVE_CSS}</style>`;
  const js = `<script data-sc4sap-responsive>${RESPONSIVE_JS}</script>`;
  const head = s.lastIndexOf('</head>'), body = s.lastIndexOf('</body>');
  if (head < 0 || body < 0) return s;
  return s.slice(0, head) + css + s.slice(head, body) + js + s.slice(body);
}

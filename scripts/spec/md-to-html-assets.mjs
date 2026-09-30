// sc4sap md-to-html — the page's stylesheet, its script, and UI labels.
//
// Kept apart from the converter so the converter reads as a Markdown parser.
// Everything the page needs is inlined into the one .html file; nothing here
// loads from the network.
//
// The script is progressive enhancement only. The HTML the converter writes
// is a complete document without it — the table of contents, the fact card,
// cross-reference links and their tooltips all work in a mail client's
// preview that runs no script. What the script adds: table sort / filter /
// TSV copy, section folding, the current-section marker in the contents,
// image zoom, the theme and audience switches, and print preparation.
//
// It must also run inside a sandboxed iframe with no same-origin (the web
// app's preview): storage access throws there, and clipboard access may be
// refused, so both are guarded.

export const LABELS = {
  en: {
    contents: 'Contents', expandAll: 'Expand all', collapseAll: 'Collapse all',
    fold: 'Fold section', filter: 'Filter rows…', copyTsv: 'Copy TSV', copy: 'Copy',
    copied: 'Copied', copyFailed: 'Copy failed', rows: 'rows', viewAll: 'All',
    viewFunctional: 'Functional', view: 'View', theme: 'Theme', print: 'Print',
    close: 'Close', code: 'Show code ({n} lines)', link: 'Link to this section',
    callout: { NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important', WARNING: 'Warning', CAUTION: 'Caution' },
  },
  ko: {
    contents: '목차', expandAll: '모두 펼치기', collapseAll: '모두 접기',
    fold: '섹션 접기', filter: '행 필터…', copyTsv: 'TSV 복사', copy: '복사',
    copied: '복사됨', copyFailed: '복사 실패', rows: '행', viewAll: '전체',
    viewFunctional: '기능 관점', view: '보기', theme: '테마', print: '인쇄',
    close: '닫기', code: '코드 보기 ({n}줄)', link: '이 섹션 링크',
    callout: { NOTE: '참고', TIP: '팁', IMPORTANT: '중요', WARNING: '경고', CAUTION: '주의' },
  },
  ja: {
    contents: '目次', expandAll: 'すべて展開', collapseAll: 'すべて折りたたむ',
    fold: 'セクションを折りたたむ', filter: '行を絞り込み…', copyTsv: 'TSVコピー', copy: 'コピー',
    copied: 'コピーしました', copyFailed: 'コピー失敗', rows: '行', viewAll: 'すべて',
    viewFunctional: '機能観点', view: '表示', theme: 'テーマ', print: '印刷',
    close: '閉じる', code: 'コードを表示 ({n}行)', link: 'このセクションへのリンク',
    callout: { NOTE: '注記', TIP: 'ヒント', IMPORTANT: '重要', WARNING: '警告', CAUTION: '注意' },
  },
};

export const labelsFor = (lang) => LABELS[String(lang || '').slice(0, 2).toLowerCase()] || LABELS.en;

const LIGHT = '--bg:#ffffff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--head:#f6f8fa;--code:#f6f8fa;--link:#0969da;--quote:#8c959f;--card:#f6f8fa;--accent:#0969da;--hl:#fff8c5;--note:#0969da;--tip:#1a7f37;--important:#8250df;--warning:#9a6700;--caution:#cf222e';
const DARK = '--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#3d444d;--head:#151b23;--code:#151b23;--link:#4493f8;--quote:#656c76;--card:#151b23;--accent:#4493f8;--hl:#3b2e00;--note:#4493f8;--tip:#3fb950;--important:#ab7df8;--warning:#d29922;--caution:#f85149';

export const STYLE = `
:root{${LIGHT};color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme=light]){${DARK};color-scheme:dark}}
:root[data-theme=dark]{${DARK};color-scheme:dark}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.65 -apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Hiragino Sans","Noto Sans CJK KR",sans-serif}
[id]{scroll-margin-top:64px}
.layout{max-width:1440px;margin:0 auto;padding:0 20px 64px;display:grid;grid-template-columns:minmax(0,1fr);gap:0 36px}
main{min-width:0;max-width:1120px}
h1,h2,h3,h4{line-height:1.3;margin:1.6em 0 .6em;position:relative}
h1{font-size:1.9em;margin-top:.8em}
h2{font-size:1.45em;border-bottom:1px solid var(--line);padding-bottom:.25em}
h3{font-size:1.15em}
a{color:var(--link)}
a.hash{position:absolute;left:-1.1em;padding-right:.3em;color:var(--muted);text-decoration:none;opacity:0;font-weight:400}
h2:hover a.hash,h3:hover a.hash,h4:hover a.hash,a.hash:focus{opacity:1}
p,ul,ol,blockquote,pre,.table-wrap,figure,details{margin:0 0 1em}
blockquote{border-left:4px solid var(--quote);padding:.2em 1em;color:var(--muted)}
blockquote>:last-child,.callout>:last-child{margin-bottom:0}
code{background:var(--code);border-radius:4px;padding:.1em .35em;font:.9em ui-monospace,Consolas,monospace}
pre{background:var(--code);border:1px solid var(--line);border-radius:6px;padding:12px 14px;overflow-x:auto;position:relative}
pre code{background:none;padding:0}
pre.mermaid{background:none;border:0;text-align:center}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:6px}
.table-wrap.tall{max-height:75vh;overflow:auto}
table{border-collapse:collapse;min-width:100%}
th,td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:6px 10px;vertical-align:top;text-align:left}
th:last-child,td:last-child{border-right:0}
tbody tr:last-child td{border-bottom:0}
th{background:var(--head);position:sticky;top:0;z-index:1}
tbody tr:hover{background:color-mix(in srgb,var(--head) 70%,transparent)}
tr:has(.ref-target:target){background:var(--hl)}
table.meta th{width:1%;white-space:nowrap}
img{max-width:100%;height:auto;background:#fff;border-radius:4px}
figure{margin-left:0;margin-right:0;text-align:center}
figure img{border:1px solid var(--line);cursor:zoom-in}
figcaption{color:var(--muted);font-size:.9em;margin-top:.4em}
details{border:1px solid var(--line);border-radius:6px;padding:.4em .8em}
details>summary{cursor:pointer;color:var(--muted)}
details.code{border:0;padding:0}
details.code>summary{margin-bottom:.4em}
hr{border:0;border-top:1px solid var(--line);margin:2em 0}
.sec>hr:last-child,.hero>hr:last-child{display:none}
.tech{color:var(--muted);font-size:.92em}
a.xref{color:inherit;text-decoration:underline dotted color-mix(in srgb,var(--accent) 60%,transparent);text-underline-offset:3px}
a.xref:hover{color:var(--link)}
a.secref{white-space:nowrap}
.callout{border-left:4px solid var(--c);background:color-mix(in srgb,var(--c) 8%,transparent);border-radius:0 6px 6px 0;padding:.6em 1em;margin:0 0 1em}
.callout-title{font-weight:600;color:var(--c);margin:0 0 .3em}
.callout-note{--c:var(--note)}.callout-tip{--c:var(--tip)}.callout-important{--c:var(--important)}.callout-warning{--c:var(--warning)}.callout-caution{--c:var(--caution)}
.hero{padding-bottom:.5em}
.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin:0 0 1.2em;padding:0}
.facts>div{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px}
.facts dt{font-size:.8em;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.facts dd{margin:.15em 0 0}
.chips{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:0 0 1.2em}
.chips a{display:inline-flex;gap:.5em;align-items:baseline;border:1px solid var(--line);border-radius:999px;padding:.2em .8em;text-decoration:none;color:var(--fg);font-size:.9em}
.chips a:hover{border-color:var(--accent)}
.chips .n{color:var(--muted);font-size:.9em}
.toc{font-size:.9em}
.toc>details{border:1px solid var(--line);border-radius:8px;padding:.5em .9em;margin:16px 0}
.toc ol{list-style:none;margin:.3em 0;padding:0}
.toc ol ol{padding-left:1em}
.toc a{display:block;padding:.2em .5em;border-left:2px solid transparent;color:var(--muted);text-decoration:none;border-radius:0 4px 4px 0}
.toc a:hover{color:var(--fg);background:var(--head)}
.toc a.active{color:var(--fg);border-left-color:var(--accent);background:var(--head);font-weight:600}
@media (min-width:1100px){
  .layout{grid-template-columns:270px minmax(0,1fr)}
  .toc{position:sticky;top:56px;align-self:start;max-height:calc(100vh - 72px);overflow:auto}
  .toc>details{border:0;padding:0}
  .toc>details>summary{list-style:none;pointer-events:none;font-weight:600;color:var(--fg)}
}
.toolbar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 20px;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
.toolbar .title{font-weight:600;margin-right:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50vw}
.toolbar button,.tbl-tools button,.tbl-tools input{font:inherit;font-size:.85em;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:.25em .7em;cursor:pointer}
.toolbar button:hover,.tbl-tools button:hover{border-color:var(--accent)}
.toolbar .seg{display:inline-flex}
.toolbar .seg button{border-radius:0}
.toolbar .seg button:first-child{border-radius:6px 0 0 6px}
.toolbar .seg button:last-child{border-radius:0 6px 6px 0;border-left:0}
.toolbar button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.tbl-tools{display:flex;gap:8px;align-items:center;margin:0 0 .4em}
.tbl-tools input{cursor:text;min-width:12em}
.tbl-tools .count{color:var(--muted);font-size:.85em;margin-right:auto}
th.sortable{cursor:pointer;user-select:none}
th.sortable::after{content:"↕";opacity:.3;margin-left:.4em;font-size:.85em}
th[aria-sort=ascending]::after{content:"↑";opacity:.9}
th[aria-sort=descending]::after{content:"↓";opacity:.9}
button.fold{position:absolute;left:-1.6em;top:.15em;border:0;background:none;color:var(--muted);cursor:pointer;font-size:.8em;padding:.2em;transition:transform .15s}
.sec.collapsed>button.fold,.sec.collapsed>h2>button.fold{transform:rotate(-90deg)}
.sec.collapsed>:not(h2){display:none}
pre>button.copy{position:absolute;top:6px;right:6px;opacity:0;font-size:.75em;border:1px solid var(--line);border-radius:4px;background:var(--bg);color:var(--fg);cursor:pointer}
pre:hover>button.copy{opacity:1}
.lightbox{position:fixed;inset:0;z-index:10;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:24px}
.lightbox img{max-width:100%;max-height:100%;object-fit:contain}
body.view-functional .tech,body.view-functional [data-audience=technical]{display:none}
@media print{
  :root,:root[data-theme]{${LIGHT};color-scheme:light}
  @page{size:A4;margin:16mm 14mm 18mm;@bottom-right{content:counter(page) " / " counter(pages);font-size:9pt;color:#666}}
  body{font-size:10.5pt}
  .toolbar,.toc,.tbl-tools,button.fold,button.copy,a.hash{display:none!important}
  .layout{display:block;padding:0;max-width:none}
  main{max-width:none}
  .hero{break-after:page}
  .sec.collapsed>:not(h2){display:revert}
  .table-wrap,.table-wrap.tall{max-height:none;overflow:visible;border:0}
  th,td{border:1px solid #bbb}
  th{position:static}
  tr,pre,img,figure,.callout{break-inside:avoid}
  h2,h3{break-after:avoid}
  a.xref,a.secref{color:inherit;text-decoration:none}
}
`;

// Plain ES2017 in an IIFE; `L` (labels) is declared just before it.
export const SCRIPT = `
(function () {
  var root = document.documentElement;
  var body = document.body;
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
  }
  // A malformed fragment (\`#50%\`) must not stop the rest of the script.
  function fragment(hash) {
    var raw = String(hash || '').slice(1);
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function copyText(text, button, label) {
    function done(ok) {
      button.textContent = ok ? L.copied : L.copyFailed;
      setTimeout(function () { button.textContent = label; }, 1400);
    }
    function fallback() {
      var area = el('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      body.removeChild(area);
      done(ok);
    }
    try {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } catch (e) { fallback(); }
  }

  // Theme: remembered where storage exists, otherwise follows the system.
  var theme = store('sc4sap-theme');
  if (theme === 'dark' || theme === 'light') root.dataset.theme = theme;
  function effectiveTheme() {
    return root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  var main = document.querySelector('main');
  var sections = Array.prototype.slice.call(document.querySelectorAll('section.sec'));
  var toc = document.querySelector('nav.toc > details');
  var narrow = function () { return innerWidth < 1100; };
  if (toc && narrow()) toc.open = false;

  // Toolbar.
  var bar = el('div', 'toolbar');
  var h1 = document.querySelector('main h1');
  bar.appendChild(el('span', 'title', h1 ? h1.textContent.replace(/#$/, '') : document.title));
  function button(text, onClick, title) {
    var b = el('button', null, text);
    b.type = 'button';
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    bar.appendChild(b);
    return b;
  }
  if (toc) button(L.contents, function () {
    toc.open = !toc.open;
    if (toc.open && narrow()) toc.scrollIntoView({ block: 'start' });
  });
  if (document.querySelector('.tech, [data-audience="technical"]')) {
    var seg = el('span', 'seg');
    seg.title = L.view;
    var views = [['all', L.viewAll], ['functional', L.viewFunctional]];
    var buttons = views.map(function (v) {
      var b = el('button', null, v[1]);
      b.type = 'button';
      b.addEventListener('click', function () { setView(v[0]); });
      seg.appendChild(b);
      return b;
    });
    var setView = function (view) {
      body.classList.toggle('view-functional', view === 'functional');
      buttons.forEach(function (b, i) { b.setAttribute('aria-pressed', String(views[i][0] === view)); });
      store('sc4sap-view', view);
    };
    bar.appendChild(seg);
    setView(store('sc4sap-view') === 'functional' ? 'functional' : 'all');
  }
  if (sections.length > 1) {
    button(L.expandAll, function () { sections.forEach(function (s) { setFold(s, false); }); });
    button(L.collapseAll, function () { sections.forEach(function (s) { setFold(s, true); }); });
  }
  button('◐', function () {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    store('sc4sap-theme', next);
  }, L.theme);
  button('⎙', function () { window.print(); }, L.print);
  body.insertBefore(bar, body.firstChild);

  // Section folding.
  function setFold(section, folded) {
    section.classList.toggle('collapsed', folded);
    var b = section.querySelector(':scope > h2 > button.fold');
    if (b) b.setAttribute('aria-expanded', String(!folded));
  }
  sections.forEach(function (section) {
    var h2 = section.querySelector(':scope > h2');
    if (!h2) return;
    var b = el('button', 'fold', '▾');
    b.type = 'button';
    b.title = L.fold;
    b.setAttribute('aria-expanded', 'true');
    b.addEventListener('click', function () { setFold(section, !section.classList.contains('collapsed')); });
    h2.insertBefore(b, h2.firstChild);
  });
  // A link into a folded section or a closed <details> opens it first.
  function reveal(hash) {
    if (!hash || hash.length < 2) return;
    var target = document.getElementById(fragment(hash));
    if (!target) return;
    var section = target.closest('section.sec');
    if (section && section.classList.contains('collapsed') && target.tagName !== 'H2') setFold(section, false);
    for (var node = target.parentElement; node; node = node.parentElement) {
      if (node.tagName === 'DETAILS' && !node.classList.contains('toc-box')) node.open = true;
    }
  }
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href^="#"]');
    if (!link) return;
    reveal(link.getAttribute('href'));
    if (toc && narrow() && toc.contains(link)) toc.open = false;
  });
  reveal(location.hash);

  // Current section in the contents.
  var tocLinks = {};
  if (toc) Array.prototype.forEach.call(toc.querySelectorAll('a[href^="#"]'), function (a) {
    tocLinks[fragment(a.getAttribute('href'))] = a;
  });
  var headings = Array.prototype.slice.call(document.querySelectorAll('main h2[id], main h3[id]'))
    .filter(function (h) { return tocLinks[h.id]; });
  var active = null;
  var pending = false;
  function spy() {
    pending = false;
    var current = null;
    for (var i = 0; i < headings.length; i++) {
      if (headings[i].getBoundingClientRect().top < 100 && headings[i].offsetParent) current = headings[i];
      else if (current) break;
    }
    var link = current ? tocLinks[current.id] : null;
    if (link === active) return;
    if (active) active.classList.remove('active');
    if (link) link.classList.add('active');
    active = link;
  }
  // A timer rather than requestAnimationFrame: rAF stops in a hidden frame,
  // and a preview iframe is often exactly that when it scrolls.
  addEventListener('scroll', function () { if (!pending) { pending = true; setTimeout(spy, 60); } }, { passive: true });
  spy();

  // Tables: sort by any column; filter and TSV copy on the longer ones.
  Array.prototype.forEach.call(document.querySelectorAll('main table:not(.meta)'), function (table) {
    var tbody = table.tBodies[0];
    if (!table.tHead || !tbody || tbody.rows.length < 2) return;
    var rows = Array.prototype.slice.call(tbody.rows);
    rows.forEach(function (row, i) { row.dataset.order = i; });
    var headers = Array.prototype.slice.call(table.tHead.rows[0].cells);
    headers.forEach(function (th, col) {
      th.classList.add('sortable');
      th.tabIndex = 0;
      function sort() {
        var dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending'
          : th.getAttribute('aria-sort') === 'descending' ? 'none' : 'ascending';
        headers.forEach(function (h) { h.removeAttribute('aria-sort'); });
        var sorted = rows.slice();
        if (dir === 'none') {
          sorted.sort(function (a, b) { return a.dataset.order - b.dataset.order; });
        } else {
          th.setAttribute('aria-sort', dir);
          sorted.sort(function (a, b) {
            var x = (a.cells[col] ? a.cells[col].textContent : '').trim();
            var y = (b.cells[col] ? b.cells[col].textContent : '').trim();
            if (!x !== !y) return x ? -1 : 1;
            var c = x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
            return (dir === 'ascending' ? c : -c) || a.dataset.order - b.dataset.order;
          });
        }
        sorted.forEach(function (row) { tbody.appendChild(row); });
      }
      th.addEventListener('click', sort);
      th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); } });
    });
    if (rows.length < 5) return;
    var tools = el('div', 'tbl-tools');
    var input = el('input');
    input.type = 'search';
    input.placeholder = L.filter;
    var count = el('span', 'count', rows.length + ' ' + L.rows);
    var copy = el('button', null, L.copyTsv);
    copy.type = 'button';
    tools.appendChild(input);
    tools.appendChild(count);
    tools.appendChild(copy);
    var wrap = table.closest('.table-wrap') || table;
    wrap.parentNode.insertBefore(tools, wrap);
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      rows.forEach(function (row) {
        var hit = !q || row.textContent.toLowerCase().indexOf(q) >= 0;
        row.hidden = !hit;
        if (hit) shown++;
      });
      count.textContent = (q ? shown + ' / ' : '') + rows.length + ' ' + L.rows;
    });
    copy.addEventListener('click', function () {
      var cell = function (c) { return c.textContent.replace(/[\\t\\r\\n]+/g, ' ').trim(); };
      var lines = [headers.map(cell).join('\\t')];
      Array.prototype.forEach.call(tbody.rows, function (row) {
        if (!row.hidden) lines.push(Array.prototype.map.call(row.cells, cell).join('\\t'));
      });
      copyText(lines.join('\\n'), copy, L.copyTsv);
    });
  });

  // Copy buttons on code blocks.
  Array.prototype.forEach.call(document.querySelectorAll('main pre > code'), function (code) {
    var b = el('button', 'copy', L.copy);
    b.type = 'button';
    b.addEventListener('click', function () { copyText(code.textContent, b, L.copy); });
    code.parentNode.appendChild(b);
  });

  // Image zoom.
  main.addEventListener('click', function (event) {
    var img = event.target;
    if (img.tagName !== 'IMG' || img.closest('a')) return;
    var box = el('div', 'lightbox');
    box.setAttribute('role', 'dialog');
    box.title = L.close;
    var big = el('img');
    big.src = img.src;
    big.alt = img.alt;
    box.appendChild(big);
    function close() { box.remove(); removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    box.addEventListener('click', close);
    addEventListener('keydown', onKey);
    body.appendChild(box);
  });

  // Print: everything open, then put it back.
  var restore = [];
  addEventListener('beforeprint', function () {
    restore = [];
    Array.prototype.forEach.call(document.querySelectorAll('details:not([open])'), function (d) {
      d.open = true;
      restore.push(function () { d.open = false; });
    });
  });
  addEventListener('afterprint', function () { restore.forEach(function (fn) { fn(); }); restore = []; });
})();
`;

// sc4sap:module-to-process — the page's labels, stylesheet and script.
//
// Everything is inlined into the one .html file; nothing loads from the network.
// On screen: a scrolling document with a contents sidebar; the BPH table filters by text,
// by kind (Std / CBO / Enh / Manual / Ext) and collapses per level. In print every task
// sheet starts a new A4 landscape page.

export const LABELS = {
  ko: {
    doc: '프로세스 맵', contents: '목차', revision: '개정 이력', version: '버전', date: '일자', author: '작성자', change: '변경 내용',
    overview: '모듈 개요', scope: '범위', packages: '패키지', tcodes: 'TCode', systems: '시스템', lanes: '조직/역할', system: '시스템',
    bph: 'Business Process Hierarchy', details: '프로세스 상세', appendix: '부록', code: '코드', process: '프로세스', kind: '구분',
    objects: '프로그램/객체', owner: '담당', usage: '사용', remark: '비고', variant: 'Variant', variants: 'Variant',
    tasks: 'Task', cbo: 'CBO', ztcodes: 'Z TCode', std: '표준', unused: '미사용', tbd: '확인필요', estimated: '추정',
    definition: '정의', output: 'Output', timing: '주기/시점', rules: 'Business Rule', flow: '처리 흐름', steps: 'Step 수행 방법',
    step: 'Step', method: '수행 방법', related: '관련 객체', standard: '표준', exits: 'Enhancement', interfaces: '인터페이스',
    links: '연관 Task', conversion: 'Conversion 메모', direction: '방향', desc: '설명', crossModule: '모듈 간 접점',
    from: '출발', to: '도착', via: '연결 객체', openQuestions: '확인필요 항목', glossary: '용어집', term: '용어', meaning: '설명',
    filter: '검색', all: '전체', expand: '모두 펼치기', collapse: 'L2까지 접기', print: '인쇄', theme: '테마', none: '없음',
    k_std: '표준', k_cbo: 'CBO', k_enh: 'Enh', k_manual: '수작업', k_ext: '외부',
    u_used: '사용', u_unused: '미사용', u_unknown: '실적 없음', source: '근거', endOfDoc: 'End of Document',
    handoffs: '패키지 간 연결', count: '건수', scenarioMap: '시나리오 맵 (레인 = 담당, 색 = 시스템, 테두리 = 구분)', stepLanes: '담당별 수행 흐름', variantMatrix: 'Variant 매트릭스', lgIface: '이중 테두리 = 인터페이스', s_sap: 'SAP', s_legacy: 'Legacy', s_external: '외부', s_manual: '수작업', notEvidenced: '이 시스템에서 근거가 없는 표준 프로세스', reconcile: '기존 BPH 대조', reconcileLead: '고객 BPH의 L4와 이 문서의 L4를 라벨로 대조한 제안입니다. 점수가 낮은 매칭은 확인이 필요합니다.', rcMatched: '매칭 제안', rcBphOnly: 'BPH에만 있음 (이 시스템에서 사용 근거 없음)', rcModelOnly: '이 문서에만 있음 (BPH에 없는 업무)', bphId: 'BPH ID', bphLabel: 'BPH 프로세스', score: '점수', reason: '사유', backbone: '표준 ID',
  },
  en: {
    doc: 'Process Map', contents: 'Contents', revision: 'Revision History', version: 'Version', date: 'Date', author: 'Author', change: 'Changes',
    overview: 'Module Overview', scope: 'Scope', packages: 'Packages', tcodes: 'TCodes', systems: 'Systems', lanes: 'Organisations / roles', system: 'System',
    bph: 'Business Process Hierarchy', details: 'Process Details', appendix: 'Appendix', code: 'Code', process: 'Process', kind: 'Type',
    objects: 'Programs / objects', owner: 'Owner', usage: 'Usage', remark: 'Remark', variant: 'Variant', variants: 'Variants',
    tasks: 'Tasks', cbo: 'CBO', ztcodes: 'Z TCodes', std: 'Standard', unused: 'Unused', tbd: 'To be confirmed', estimated: 'estimated',
    definition: 'Definition', output: 'Output', timing: 'Timing / cycle', rules: 'Business Rules', flow: 'Process Flow', steps: 'Steps',
    step: 'Step', method: 'Method', related: 'Related Objects', standard: 'Standard', exits: 'Enhancements', interfaces: 'Interfaces',
    links: 'Related Tasks', conversion: 'Conversion Notes', direction: 'Direction', desc: 'Description', crossModule: 'Cross-Module Touch Points',
    from: 'From', to: 'To', via: 'Via', openQuestions: 'Open Questions', glossary: 'Glossary', term: 'Term', meaning: 'Meaning',
    filter: 'Search', all: 'All', expand: 'Expand all', collapse: 'Collapse to L2', print: 'Print', theme: 'Theme', none: 'None',
    k_std: 'Std', k_cbo: 'CBO', k_enh: 'Enh', k_manual: 'Manual', k_ext: 'Ext',
    u_used: 'Used', u_unused: 'Unused', u_unknown: 'No data', source: 'Source', endOfDoc: 'End of Document',
    handoffs: 'Package hand-offs', count: 'Count', scenarioMap: 'Scenario map (lane = owner, fill = system, border = type)', stepLanes: 'Steps by owner', variantMatrix: 'Variant matrix', lgIface: 'double border = interface', s_sap: 'SAP', s_legacy: 'Legacy', s_external: 'External', s_manual: 'Manual', notEvidenced: 'Standard processes without evidence in this system', reconcile: 'Existing BPH reconciliation', reconcileLead: 'Proposed matches between the customer BPH L4 rows and the L4 tasks of this document, by label. Low scores need confirmation.', rcMatched: 'Proposed matches', rcBphOnly: 'Only in the BPH (no usage evidence in this system)', rcModelOnly: 'Only in this document (not in the BPH)', bphId: 'BPH ID', bphLabel: 'BPH process', score: 'Score', reason: 'Reason', backbone: 'Standard ID',
  },
  ja: {
    doc: 'プロセスマップ', contents: '目次', revision: '改訂履歴', version: '版', date: '日付', author: '作成者', change: '変更内容',
    overview: 'モジュール概要', scope: '範囲', packages: 'パッケージ', tcodes: 'TCode', systems: 'システム', lanes: '組織・役割', system: 'システム',
    bph: 'Business Process Hierarchy', details: 'プロセス詳細', appendix: '付録', code: 'コード', process: 'プロセス', kind: '区分',
    objects: 'プログラム・オブジェクト', owner: '担当', usage: '利用', remark: '備考', variant: 'バリアント', variants: 'バリアント',
    tasks: 'タスク', cbo: 'CBO', ztcodes: 'Z TCode', std: '標準', unused: '未使用', tbd: '要確認', estimated: '推定',
    definition: '定義', output: 'アウトプット', timing: '周期・タイミング', rules: 'Business Rule', flow: '処理フロー', steps: 'ステップ',
    step: 'ステップ', method: '実施方法', related: '関連オブジェクト', standard: '標準', exits: '拡張', interfaces: 'インターフェース',
    links: '関連タスク', conversion: 'コンバージョンメモ', direction: '方向', desc: '説明', crossModule: 'モジュール間接点',
    from: '発', to: '着', via: '経由', openQuestions: '要確認事項', glossary: '用語集', term: '用語', meaning: '説明',
    filter: '検索', all: 'すべて', expand: 'すべて展開', collapse: 'L2まで折りたたむ', print: '印刷', theme: 'テーマ', none: 'なし',
    k_std: '標準', k_cbo: 'CBO', k_enh: '拡張', k_manual: '手作業', k_ext: '外部',
    u_used: '利用', u_unused: '未使用', u_unknown: '実績なし', source: '根拠', endOfDoc: 'End of Document',
    handoffs: 'パッケージ間連携', count: '件数', scenarioMap: 'シナリオマップ (レーン = 担当, 色 = システム, 枠 = 区分)', stepLanes: '担当別の実施フロー', variantMatrix: 'バリアント一覧', lgIface: '二重枠 = インターフェース', s_sap: 'SAP', s_legacy: 'レガシー', s_external: '外部', s_manual: '手作業', notEvidenced: 'このシステムで根拠のない標準プロセス', reconcile: '既存 BPH との照合', reconcileLead: '顧客 BPH の L4 と本書の L4 をラベルで照合した提案です。低スコアは確認が必要です。', rcMatched: '照合候補', rcBphOnly: 'BPH のみ (本システムで利用根拠なし)', rcModelOnly: '本書のみ (BPH にない業務)', bphId: 'BPH ID', bphLabel: 'BPH プロセス', score: 'スコア', reason: '理由', backbone: '標準ID',
  },
};

export const labelsFor = (lang) => LABELS[String(lang || '').slice(0, 2).toLowerCase()] || LABELS.en;

// Layout: sticky top bar + contents sidebar + one main column; tables scroll on their own.
const LIGHT = '--bg:#ffffff;--fg:#1d2733;--muted:#5a6675;--line:#d3dbe4;--head:#f2f5f8;--card:#f6f8fa;--accent:#1d4f73;--accent-ink:#ffffff;--link:#0b62c4;'
  + '--sys-sap:#1f6fb2;--sys-legacy:#7a4fb0;--sys-manual:#6b7480;--sys-external:#0f8a7a;'
  + '--k-std:#1f6fb2;--k-cbo:#b3541e;--k-enh:#8a5a00;--k-manual:#6b7480;--k-ext:#0f8a7a;--warn-bg:#fff8e6;--warn-line:#e3b341;--flag:#9a6700;--l1:#e8eef5;--l2:#f3f6fa';
const DARK = '--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--card:#161d26;--accent:#5b9bd0;--accent-ink:#0f141a;--link:#5aa2f0;'
  + '--sys-sap:#5b9bd0;--sys-legacy:#a989d6;--sys-manual:#9aa3ad;--sys-external:#4cc2b0;'
  + '--k-std:#5b9bd0;--k-cbo:#e08a55;--k-enh:#d6a640;--k-manual:#9aa3ad;--k-ext:#4cc2b0;--warn-bg:#2a2112;--warn-line:#9e6a03;--flag:#d6a640;--l1:#1b2633;--l2:#151d27';

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
.topbar button,.bph-tools button{font:inherit;font-size:13px;padding:4px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}
.layout{max-width:1560px;margin:0 auto;padding:0 16px 64px;display:grid;grid-template-columns:minmax(0,1fr);gap:0 32px}
@media (min-width:1100px){.layout{grid-template-columns:250px minmax(0,1fr)}}
.toc{display:none}
@media (min-width:1100px){.toc{display:block;position:sticky;top:56px;align-self:start;max-height:calc(100vh - 72px);overflow:auto;padding:20px 0;font-size:13.5px}}
.toc ol{list-style:none;margin:0;padding:0}.toc ol ol{padding-left:14px}
.toc a{display:block;padding:3px 8px;border-radius:5px;color:var(--fg);text-decoration:none}
.toc a:hover{background:var(--card)}
main{min-width:0}
h2{font-size:24px;margin:48px 0 16px;padding-bottom:6px;border-bottom:2px solid var(--accent)}
h3{font-size:19px;margin:34px 0 10px}
h4{font-size:16px;margin:22px 0 8px}
p.lead{color:var(--muted);margin:-4px 0 12px}
.tw{overflow-x:auto;margin:10px 0 18px}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
th{background:var(--head);font-weight:600;white-space:nowrap}
.num{text-align:right;font-variant-numeric:tabular-nums}
.cover{display:flex;flex-direction:column;gap:10px;padding:48px 0;border-bottom:1px solid var(--line)}
.cover .kicker{color:var(--muted);letter-spacing:.04em}
.cover h1{font-size:36px;line-height:1.25;margin:0;text-wrap:balance}
.cover .meta{display:grid;grid-template-columns:max-content 1fr;gap:4px 18px;margin-top:20px}
.cover .meta dt{color:var(--muted)}.cover .meta dd{margin:0}
.scope{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 18px;margin:8px 0 20px}
.scope dt{color:var(--muted)}.scope dd{margin:0;display:flex;flex-wrap:wrap;gap:6px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin:12px 0 8px}
.card{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--bg)}
.card h4{margin:0 0 6px;font-size:15.5px}.card h4 a{color:inherit;text-decoration:none}
.card ul{margin:0;padding-left:18px;font-size:14px}
.card .stats{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}
.badge{display:inline-block;font-size:12px;font-weight:700;border:1px solid currentColor;border-radius:10px;padding:0 7px;white-space:nowrap;line-height:1.55}
.k-std{color:var(--k-std)}.k-cbo{color:var(--k-cbo)}.k-enh{color:var(--k-enh)}.k-manual{color:var(--k-manual)}.k-ext{color:var(--k-ext)}
.sys{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.sys::before{content:"";width:10px;height:10px;border-radius:2px;background:var(--sys-c,var(--sys-sap))}
.sys-sap{--sys-c:var(--sys-sap)}.sys-legacy{--sys-c:var(--sys-legacy)}.sys-manual{--sys-c:var(--sys-manual)}.sys-external{--sys-c:var(--sys-external)}
.flag{display:inline-block;font-size:12px;font-weight:700;color:var(--flag);border:1px solid var(--flag);border-radius:10px;padding:0 7px;margin-left:4px;vertical-align:1px;white-space:nowrap}
.est{color:var(--muted);font-size:12.5px}
.use-used{color:var(--k-std)}.use-unused{color:var(--k-cbo)}.use-unknown{color:var(--muted)}
.bph-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
.bph-tools input{font:inherit;font-size:14px;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);min-width:0;flex:1 1 180px;max-width:320px}
.bph-tools button[aria-pressed=true]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
table.bph td{white-space:nowrap}
table.bph td.p{white-space:normal;min-width:240px}
table.bph tr.lv1 td{background:var(--l1);font-weight:700}
table.bph tr.lv2 td{background:var(--l2);font-weight:600}
table.bph tr.var td{color:var(--muted);font-size:13.5px}
table.bph .ind{display:inline-block}
table.bph .tg{cursor:pointer;border:0;background:none;color:var(--muted);padding:0 4px 0 0;font:inherit}
.task{border:1px solid var(--line);border-radius:10px;padding:16px;margin:18px 0}
.task-head{margin:0 0 12px}
.task-head th{width:140px;background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.task h4{margin:16px 0 6px}
.task ul{margin:4px 0;padding-left:20px}
.rule .src{color:var(--muted);font-size:12.5px;margin-left:6px}
.flowfig{margin:6px 0 12px;padding:12px;background:#ffffff;border:1px solid var(--line);border-radius:8px;overflow:auto}
.flowfig>svg{display:block;max-width:100%;height:auto}
.flowfig.swim>svg{max-width:none}
.flowfig .cap{font-size:13px;font-weight:600;color:#1D4F73;margin:0 0 6px}
.legend{margin-top:8px;font-size:12px;color:#5A6675;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center}
.lg{display:inline-block;width:14px;height:10px;border-radius:2px;margin-right:3px;vertical-align:-1px;border:1.6px solid #5E7388;background:#FFFFFF}
.lg-sys-sap{background:#E3EEF9;border-color:#E3EEF9}.lg-sys-legacy{background:#EEE6F7;border-color:#EEE6F7}.lg-sys-external{background:#DDF2EE;border-color:#DDF2EE}.lg-sys-manual{background:#EEF0F2;border-color:#EEF0F2}
.lg-k-std{border-color:#1F6FB2}.lg-k-cbo{border-color:#B3541E}.lg-k-enh{border-color:#8A5A00}.lg-k-manual{border-color:#6B7480}.lg-k-ext{border-color:#0F8A7A}
h5{font-size:14px;margin:14px 0 6px}
.tbd{margin:12px 0 0;padding:10px 14px;background:var(--warn-bg);border-left:4px solid var(--warn-line);border-radius:6px}
.tbd ul{margin:4px 0 0}
.doc-end{margin:48px 0 0;padding:24px 0;border-top:2px solid var(--accent);text-align:center;color:var(--muted)}
.doc-end strong{display:block;font-size:18px;color:var(--fg);margin-bottom:6px}
@page{size:A4 landscape;margin:10mm 12mm 14mm}
@media print{
  :root,:root:not([data-theme=light]),:root[data-theme=dark]{${LIGHT};color-scheme:light}
  *{print-color-adjust:exact;-webkit-print-color-adjust:exact}
  body{font-size:10.5pt}
  .topbar,.toc,.bph-tools{display:none!important}
  .layout{display:block;max-width:none;padding:0}
  .page-break,.task{break-before:page}
  .task{border:0;padding:0;margin:0}
  table.bph tr{display:table-row!important}
  tr,.card{break-inside:avoid}
}
`;

// No ${…} below; String.raw keeps backslashes.
export const SCRIPT = String.raw`
(function(){
  var root = document.documentElement;
  var tb = document.getElementById('theme-btn');
  if (tb) tb.addEventListener('click', function(){
    var cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    root.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
  });
  var pb = document.getElementById('print-btn');
  if (pb) pb.addEventListener('click', function(){ window.print(); });

  // Rows and the table are looked up on every use: the edit mode may replace them (undo, draft).
  var tbl = function(){ return document.querySelector('table.bph'); };
  if (!tbl()) return;
  var rowsNow = function(){ return Array.prototype.slice.call(tbl().tBodies[0].rows); };
  var kinds = {}, closed = {};
  var q = document.getElementById('bph-q');
  function under(code, other){ return other !== code && other.indexOf(code + '.') === 0; }
  function apply(){
    var rows = rowsNow(), table = tbl();
    var text = (q && q.value || '').trim().toLowerCase();
    var anyKind = Object.keys(kinds).some(function(k){ return kinds[k]; });
    var keep = {};
    rows.forEach(function(r){
      var ok = (!text || r.textContent.toLowerCase().indexOf(text) >= 0) && (!anyKind || kinds[r.getAttribute('data-kind')]);
      if (ok && (text || anyKind)) {
        var c = r.getAttribute('data-code');
        keep[c] = true;
        var seg = c.split('.');
        for (var i = 1; i < seg.length; i++) keep[seg.slice(0, i).join('.')] = true;
      }
    });
    rows.forEach(function(r){
      var c = r.getAttribute('data-code');
      var hiddenByTree = Object.keys(closed).some(function(k){ return closed[k] && (under(k, c) || (r.classList.contains('var') && c === k)); });
      var hiddenByFilter = (text || anyKind) && !keep[c];
      r.hidden = !!(hiddenByTree || hiddenByFilter);
    });
    table.querySelectorAll('.tg').forEach(function(b){ b.textContent = closed[b.getAttribute('data-code')] ? '▸' : '▾'; });
  }
  if (q) q.addEventListener('input', apply);
  document.querySelectorAll('.bph-tools [data-kind]').forEach(function(b){
    b.addEventListener('click', function(){
      var k = b.getAttribute('data-kind');
      kinds[k] = !kinds[k];
      b.setAttribute('aria-pressed', kinds[k] ? 'true' : 'false');
      apply();
    });
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('table.bph .tg');
    if (!b) return;
    var c = b.getAttribute('data-code');
    closed[c] = !closed[c];
    apply();
  });
  var ex = document.getElementById('bph-expand');
  if (ex) ex.addEventListener('click', function(){ closed = {}; apply(); });
  var co = document.getElementById('bph-collapse');
  if (co) co.addEventListener('click', function(){
    closed = {};
    rowsNow().forEach(function(r){ if (r.getAttribute('data-level') === '2') closed[r.getAttribute('data-code')] = true; });
    apply();
  });
})();
`;

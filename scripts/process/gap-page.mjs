// sc4sap:module-to-process — gap mode: labels, extra stylesheet and page script of the Gap analysis document.
//
// The page reuses the process page stylesheet (process-page.mjs STYLE) and the process edit mode
// (process-editor.mjs: text fields, <select data-p>, checkboxes, undo, autosave, Save → -edited.html).
// Its own script: theme / print, matrix filters (text, fit, usage, disposition, WRICEF only), collapse per L3,
// a disposition change switches the WRICEF toggle, CSV of the matrix and the WRICEF JSON download
// (same content as `build-gap-doc.mjs --wricef`, built from the edited state).

export const GAP_LABELS = {
  ko: {
    doc: 'Gap 분석서', contents: '목차', revision: '개정 이력', version: '버전', date: '일자', author: '작성자', change: '변경 내용',
    scope: '프로젝트 유형', sc_conversion: '컨버전 (ECC → S/4HANA)', sc_new: '신규 구축', system: '시스템', source: '기준 프로세스 맵', packages: '패키지',
    summary: '요약', matrix: 'Fit / Gap 매트릭스', register: 'Gap 상세', wricef: 'WRICEF 후보', notUsed: '사용하지 않는 표준 프로세스', oq: '확인 필요 사항', appendix: '부록',
    lead: '모듈의 L3 / L4 업무마다 표준으로 처리되는지(Fit), 표준 + 개선(Enhancement)인지, CBO가 메우는 Gap인지를 보여 줍니다. 사용 여부는 운영 시스템 ST03N 사용 실적 기준입니다.',
    code: '코드', process: '프로세스 / Task', fit: 'Fit / Gap', usage: '사용', stdTcodes: '표준 TCode', coverage: '현재 Gap을 메우는 CBO', disposition: '처리 방안', wkind: 'WRICEF', note: '비고',
    f_fit: 'Fit', f_partial: 'Partial', f_gap: 'Gap', f_manual: '수작업', f_external: '외부 시스템',
    fd_fit: '표준 그대로 처리', fd_partial: '표준 + Enhancement', fd_gap: 'CBO 프로그램이 처리', fd_manual: '시스템 밖 수작업', fd_external: '외부 시스템이 처리',
    d_keep: '표준 유지', d_adopt: '표준 적용', d_retrofit: 'CBO 이관 (Retrofit)', d_rebuild: '재개발', d_standard: '표준으로 대체', d_retire: '폐기', d_review: '검토 필요',
    k_R: 'R 보고서', k_I: 'I 인터페이스', k_C: 'C 데이터 변환', k_E: 'E 개선', k_F: 'F 서식', k_W: 'W 워크플로',
    r_interface: '인터페이스가 있음', r_enhancement: 'Exit / BAdI', r_form: '서식 객체', r_workflow: '워크플로 객체', r_migration: '데이터 이관 단계', r_program: 'Z 프로그램', r_review: '컨설턴트 검토',
    u_used: '사용', u_unused: '미사용', u_unknown: '실적 없음',
    tasks: 'Task', candidates: 'WRICEF 후보', gapUsed: 'Gap 중 사용', gapUnused: 'Gap 중 미사용', byL2: '프로세스 체인별 Fit / Gap', byKind: 'WRICEF 유형별',
    statement: 'Gap 내용', why: '근거 (비즈니스 룰)', conversion: '컨버전 메모', tbd: '확인 필요', variant: '변형',
    include: '후보', objects: '객체', module: '모듈', label: '항목', reason: '분류 근거',
    wricefLead: '처리 방안이 "CBO 이관" 또는 "재개발"인 행이 후보입니다. 편집 모드에서 후보 여부와 유형을 고친 뒤 JSON을 받아 프로젝트 대시보드의 WRICEF 목록으로 가져옵니다.',
    importCmd: '가져오기', jsonBtn: 'WRICEF JSON 받기', csvBtn: 'CSV 받기',
    notUsedLead: '표준 백본에는 있지만 이 시스템에서 사용 근거가 없는 프로세스입니다. 정말 쓰지 않는지 확인하세요.', reasonCol: '사유',
    pkgUnused: '패키지별 미사용 TCode', pkgTotal: '전체', pkgUsed: '사용', none: '없음',
    filter: '검색', all: '전체', onlyWricef: 'WRICEF 후보만', collapse: '접기', expand: '펼치기', print: '인쇄', theme: '테마',
    usageBasis: '사용 실적 기준', tier_prd: '운영(PRD) ST03N', 'tier_non-prd': '운영 외 시스템 ST03N', tier_unknown: '출처 확인 안 됨', monthsN: '{n}개월', measured: '측정',
    ubWarn_unknown: '사용 실적의 출처를 확인할 수 없습니다. 미사용으로 나온 항목도 "실적 없음"으로 보고 폐기를 제안하지 않습니다.',
    ubWarn_nonprd: '운영(PRD) 시스템의 실적이 아닙니다. 미사용으로 나온 항목도 "실적 없음"으로 보고 폐기를 제안하지 않습니다.',
    ubWarn_short: '측정 기간이 짧습니다 (3개월 미만). 미사용으로 나온 항목도 "실적 없음"으로 보고 폐기를 제안하지 않습니다.',
    tierGuess: 'RFC 목적지 기준 추정', destination: 'RFC 목적지',
    usageJob: '배치 잡 스텝으로 실행', usageRawUnused: 'ST03N에는 미사용 — 근거가 부족해 실적 없음으로 봅니다',
    limits: '시스템이 아는 것은 현재(as-is) 모습뿐입니다. to-be 요구사항은 컨설턴트가 입력합니다.',
    standardHint: '"표준으로 대체"는 자동으로 제안하지 않습니다. 표준으로 바꿀 수 있는지는 컨설턴트가 검토합니다.',
    hiddenUse: '인터페이스(RFC 호출), 서식(출력 조건), Exit / BAdI, 외부 시스템 행은 ST03N에 나오지 않을 수 있어 미사용이어도 "검토 필요"로 둡니다.',
    edHint: '편집 모드: 글자를 클릭해 고칩니다. 처리 방안, WRICEF 후보와 유형은 목록에서 고릅니다. 저장하면 수정본 HTML을 받습니다 (--import 로 다음 빌드에 반영).',
    edited: '컨설턴트 수정', scopeChanged: '이전 버전과 프로젝트 유형이 다릅니다: ', endOfDoc: 'End of Document', openMap: '프로세스 맵 열기',
  },
  en: {
    doc: 'Gap Analysis', contents: 'Contents', revision: 'Revision history', version: 'Version', date: 'Date', author: 'Author', change: 'Change',
    scope: 'Project type', sc_conversion: 'Conversion (ECC → S/4HANA)', sc_new: 'New implementation', system: 'System', source: 'Process map', packages: 'Packages',
    summary: 'Summary', matrix: 'Fit / gap matrix', register: 'Gap register', wricef: 'WRICEF candidates', notUsed: 'Standard processes not in use', oq: 'Open questions', appendix: 'Appendix',
    lead: 'For every L3 / L4 task of the module: handled by the standard (fit), by the standard plus an enhancement (partial), or by a CBO program (gap). Usage comes from ST03N of the productive system.',
    code: 'Code', process: 'Process / task', fit: 'Fit / gap', usage: 'Usage', stdTcodes: 'Standard TCodes', coverage: 'CBO covering the gap today', disposition: 'Disposition', wkind: 'WRICEF', note: 'Note',
    f_fit: 'Fit', f_partial: 'Partial', f_gap: 'Gap', f_manual: 'Manual', f_external: 'External',
    fd_fit: 'standard as is', fd_partial: 'standard + enhancement', fd_gap: 'a CBO program carries it', fd_manual: 'manual, outside any system', fd_external: 'a non-SAP system carries it',
    d_keep: 'Keep standard', d_adopt: 'Adopt standard', d_retrofit: 'Retrofit CBO', d_rebuild: 'Rebuild', d_standard: 'Replace by standard', d_retire: 'Retire', d_review: 'To be decided',
    k_R: 'R Report', k_I: 'I Interface', k_C: 'C Conversion', k_E: 'E Enhancement', k_F: 'F Form', k_W: 'W Workflow',
    r_interface: 'has an interface', r_enhancement: 'exit / BAdI', r_form: 'form object', r_workflow: 'workflow object', r_migration: 'data migration step', r_program: 'Z program', r_review: 'consultant review',
    u_used: 'Used', u_unused: 'Unused', u_unknown: 'No data',
    tasks: 'Tasks', candidates: 'WRICEF candidates', gapUsed: 'Gaps in use', gapUnused: 'Gaps not used', byL2: 'Fit / gap per process chain', byKind: 'By WRICEF kind',
    statement: 'Gap', why: 'Evidence (business rules)', conversion: 'Conversion notes', tbd: 'To be confirmed', variant: 'Variant',
    include: 'Candidate', objects: 'Objects', module: 'Module', label: 'Item', reason: 'Why this kind',
    wricefLead: 'Rows with the disposition "Retrofit CBO" or "Rebuild" are candidates. Correct the switch and the kind in edit mode, then download the JSON and import it into the project dashboard\'s WRICEF list.',
    importCmd: 'Import', jsonBtn: 'Download WRICEF JSON', csvBtn: 'Download CSV',
    notUsedLead: 'Processes of the standard backbone without any evidence of use in this system. Confirm they are really not used.', reasonCol: 'Reason',
    pkgUnused: 'Unused TCodes per package', pkgTotal: 'Total', pkgUsed: 'Used', none: 'None',
    filter: 'Search', all: 'All', onlyWricef: 'WRICEF candidates only', collapse: 'Collapse', expand: 'Expand', print: 'Print', theme: 'Theme',
    usageBasis: 'Usage basis', tier_prd: 'productive (PRD) ST03N', 'tier_non-prd': 'ST03N of a non-productive system', tier_unknown: 'source not confirmed', monthsN: '{n} months', measured: 'measured',
    ubWarn_unknown: 'The source of the usage figures is not confirmed. Items shown as unused count as "no data"; none is proposed for retirement.',
    ubWarn_nonprd: 'The usage figures are not from the productive system. Items shown as unused count as "no data"; none is proposed for retirement.',
    ubWarn_short: 'The measured period is short (under 3 months). Items shown as unused count as "no data"; none is proposed for retirement.',
    tierGuess: 'estimated from the RFC destination', destination: 'RFC destination',
    usageJob: 'runs as a background job step', usageRawUnused: 'unused in ST03N — not enough evidence, counted as no data',
    limits: 'The system only knows the as-is. To-be requirements come from the consultant.',
    standardHint: '"Replace by standard" is never proposed automatically. Whether the standard can replace a program is the consultant\'s call.',
    hiddenUse: 'Interfaces (RFC calls), forms (output conditions), exits / BAdIs and external rows may not show in ST03N, so they stay "to be decided" even when unused.',
    edHint: 'Edit mode: click a text to change it. Pick the disposition, the WRICEF switch and kind from the lists. Save downloads the edited HTML (--import carries it into the next build).',
    edited: 'edited by the consultant', scopeChanged: 'Project type differs from the previous version: ', endOfDoc: 'End of Document', openMap: 'Open the process map',
  },
  ja: {
    doc: 'ギャップ分析書', contents: '目次', revision: '改訂履歴', version: '版', date: '日付', author: '作成者', change: '変更内容',
    scope: 'プロジェクト種別', sc_conversion: 'コンバージョン (ECC → S/4HANA)', sc_new: '新規導入', system: 'システム', source: 'プロセスマップ', packages: 'パッケージ',
    summary: '概要', matrix: 'Fit / Gap マトリクス', register: 'ギャップ詳細', wricef: 'WRICEF 候補', notUsed: '使われていない標準プロセス', oq: '要確認事項', appendix: '付録',
    lead: 'モジュールの L3 / L4 タスクごとに、標準で処理されるか (Fit)、標準 + 拡張か、CBO が埋めるギャップかを示します。利用有無は本番 ST03N の実績です。',
    code: 'コード', process: 'プロセス / タスク', fit: 'Fit / Gap', usage: '利用', stdTcodes: '標準 TCode', coverage: '現在ギャップを埋める CBO', disposition: '対応方針', wkind: 'WRICEF', note: '備考',
    f_fit: 'Fit', f_partial: 'Partial', f_gap: 'Gap', f_manual: '手作業', f_external: '外部',
    fd_fit: '標準のまま', fd_partial: '標準 + 拡張', fd_gap: 'CBO プログラムが処理', fd_manual: 'システム外の手作業', fd_external: '外部システムが処理',
    d_keep: '標準維持', d_adopt: '標準適用', d_retrofit: 'CBO 移行', d_rebuild: '再開発', d_standard: '標準へ置換', d_retire: '廃止', d_review: '要検討',
    k_R: 'R 帳票', k_I: 'I インターフェース', k_C: 'C データ移行', k_E: 'E 拡張', k_F: 'F フォーム', k_W: 'W ワークフロー',
    r_interface: 'インターフェースあり', r_enhancement: 'Exit / BAdI', r_form: 'フォーム', r_workflow: 'ワークフロー', r_migration: 'データ移行', r_program: 'Z プログラム', r_review: 'コンサルタント確認',
    u_used: '利用', u_unused: '未使用', u_unknown: '実績なし',
    tasks: 'タスク', candidates: 'WRICEF 候補', gapUsed: '利用中のギャップ', gapUnused: '未使用のギャップ', byL2: 'プロセスチェーン別 Fit / Gap', byKind: 'WRICEF 種別',
    statement: 'ギャップ内容', why: '根拠 (ビジネスルール)', conversion: 'コンバージョンメモ', tbd: '要確認', variant: 'バリアント',
    include: '候補', objects: 'オブジェクト', module: 'モジュール', label: '項目', reason: '分類根拠',
    wricefLead: '対応方針が「CBO 移行」または「再開発」の行が候補です。編集モードで候補と種別を直し、JSON を取得してプロジェクトダッシュボードの WRICEF 一覧に取り込みます。',
    importCmd: '取込み', jsonBtn: 'WRICEF JSON 取得', csvBtn: 'CSV 取得',
    notUsedLead: '標準バックボーンにはあるが、このシステムで利用の根拠がないプロセスです。本当に使っていないか確認してください。', reasonCol: '理由',
    pkgUnused: 'パッケージ別 未使用 TCode', pkgTotal: '全体', pkgUsed: '利用', none: 'なし',
    filter: '検索', all: 'すべて', onlyWricef: 'WRICEF 候補のみ', collapse: '折りたたむ', expand: '展開', print: '印刷', theme: 'テーマ',
    usageBasis: '利用実績の根拠', tier_prd: '本番 (PRD) ST03N', 'tier_non-prd': '本番以外のシステムの ST03N', tier_unknown: '出所未確認', monthsN: '{n}か月', measured: '測定',
    ubWarn_unknown: '利用実績の出所を確認できません。未使用と出た項目も「実績なし」とみなし、廃止は提案しません。',
    ubWarn_nonprd: '本番 (PRD) システムの実績ではありません。未使用と出た項目も「実績なし」とみなし、廃止は提案しません。',
    ubWarn_short: '測定期間が短すぎます (3か月未満)。未使用と出た項目も「実績なし」とみなし、廃止は提案しません。',
    tierGuess: 'RFC 宛先からの推定', destination: 'RFC 宛先',
    usageJob: 'バックグラウンドジョブのステップで実行', usageRawUnused: 'ST03N では未使用 — 根拠不足のため実績なしとみなします',
    limits: 'システムが知っているのは現状 (as-is) だけです。to-be の要件はコンサルタントが入力します。',
    standardHint: '「標準へ置換」は自動では提案しません。標準で置き換えられるかはコンサルタントが判断します。',
    hiddenUse: 'インターフェース (RFC 呼出)、フォーム (出力条件)、Exit / BAdI、外部システムの行は ST03N に出ないことがあるため、未使用でも「要検討」とします。',
    edHint: '編集モード: 文字をクリックして修正します。対応方針・WRICEF 候補と種別はリストから選びます。保存すると修正版 HTML を取得します (--import で次のビルドに反映)。',
    edited: 'コンサルタント修正', scopeChanged: '前の版とプロジェクト種別が異なります: ', endOfDoc: 'End of Document', openMap: 'プロセスマップを開く',
  },
};
export const gapLabels = (lang) => GAP_LABELS[String(lang || '').slice(0, 2).toLowerCase()] || GAP_LABELS.en;

export const GAP_STYLE = `
.fit{display:inline-block;font-size:12px;font-weight:700;border-radius:10px;padding:0 8px;white-space:nowrap;line-height:1.6;color:#fff}
.fit-fit{background:var(--k-std)}.fit-partial{background:var(--k-enh)}.fit-gap{background:var(--k-cbo)}.fit-manual{background:var(--k-manual)}.fit-external{background:var(--k-ext)}
:root[data-theme=dark] .fit,.dark .fit{color:#0f141a}
@media (prefers-color-scheme: dark){:root:not([data-theme=light]) .fit{color:#0f141a}}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin:14px 0}
.tile{border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:var(--card)}
.tile .v{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2}.tile .l{color:var(--muted);font-size:13px}
.bars{display:grid;grid-template-columns:minmax(120px,30%) minmax(0,1fr) max-content;gap:6px 12px;align-items:center;margin:10px 0 18px;font-size:14px}
.bar{display:flex;height:16px;border-radius:4px;overflow:hidden;background:var(--head)}
.bar i{display:block;height:100%}.bar i+i{border-left:1px solid var(--bg)}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 10px;vertical-align:0}
.sw-fit,.bar .b-fit{background:var(--k-std)}.sw-partial,.bar .b-partial{background:var(--k-enh)}.sw-gap,.bar .b-gap{background:var(--k-cbo)}.sw-manual,.bar .b-manual{background:var(--k-manual)}.sw-external,.bar .b-external{background:var(--k-ext)}
table.gm td{white-space:nowrap}table.gm td.p{white-space:normal;min-width:220px}table.gm td.cov{white-space:normal;min-width:180px}table.gm td.nt{white-space:normal;min-width:160px}
table.gm tr.lv1 td{background:var(--l1);font-weight:700}table.gm tr.lv2 td{background:var(--l2);font-weight:600}table.gm tr.lv3 td{font-weight:600}
table.gm tr.lv5 td{font-size:13.5px}table.gm tr.lv5 td.p{padding-left:40px}
table.gm select{font:inherit;font-size:13px;padding:1px 4px;border:1px solid var(--line);border-radius:5px;background:var(--bg);color:var(--fg)}
table.gm select:disabled{border-color:transparent;background:none;color:var(--fg);opacity:1;-webkit-appearance:none;appearance:none;padding:1px 0}
table.gm input[type=checkbox]:disabled{opacity:.8}
table.gm label.won{display:inline-flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;vertical-align:middle;cursor:pointer}table.gm label.won input{width:20px;height:20px;margin:0}
@media (max-width:600px){a.cl,.topbar a,.cover .meta a{min-width:44px;min-height:44px;display:inline-flex;align-items:center}table.gm label.won,table.gm a.go{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center}table.gm a.go{margin-left:0}}
table.gm .tg{cursor:pointer;color:var(--muted);display:inline-block;width:1.2em;user-select:none}
.gtools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
.gtools input[type=search],.gtools select{font:inherit;font-size:14px;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
.gtools input[type=search]{flex:1 1 180px;max-width:300px;min-width:0}
.gtools button,.wbtns button{font:inherit;font-size:13px;padding:4px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}
.gtools label{font-size:13.5px;display:inline-flex;gap:4px;align-items:center}
.wbtns{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.gap-card{border:1px solid var(--line);border-left:4px solid var(--k-cbo);border-radius:8px;padding:10px 14px;margin:12px 0;background:var(--bg)}
.gap-card.fit-l-partial{border-left-color:var(--k-enh)}.gap-card.fit-l-manual{border-left-color:var(--k-manual)}.gap-card.fit-l-external{border-left-color:var(--k-ext)}
.gap-card h4{margin:0 0 6px;font-size:15.5px}.gap-card h5{margin:10px 0 4px;font-size:13.5px;color:var(--muted)}
.gap-card ul{margin:0;padding-left:18px}.gap-card .src{color:var(--muted);font-size:12.5px;margin-left:6px}
.ubwarn{border:1px solid var(--warn-line);background:var(--warn-bg);border-radius:8px;padding:8px 12px;margin:10px 0;font-size:14px}
.notes{color:var(--muted);font-size:13.5px;margin:6px 0 14px;padding-left:18px}
.edmark{color:var(--flag);font-size:12px;margin-left:4px}
.cmd{font:12.5px Consolas,monospace;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:6px 10px;overflow-x:auto;white-space:pre}
@media print{.gtools,.wbtns,.topbar,.toc{display:none!important}table.gm select{-webkit-appearance:none;appearance:none;border:0}}
`;

// No ${…} below; String.raw keeps backslashes.
export const GAP_SCRIPT = String.raw`
(function(){
  var L = JSON.parse(document.getElementById('gap-labels').textContent);
  var root = document.documentElement;
  var tb = document.getElementById('theme-btn');
  try { var t0 = localStorage.getItem('sc4sap-theme'); if (t0) root.setAttribute('data-theme', t0); } catch (e) {}
  if (tb) tb.addEventListener('click', function(){
    var dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', dark ? 'light' : 'dark'); try { localStorage.setItem('sc4sap-theme', root.getAttribute('data-theme')); } catch (e) {}
  });
  var pb = document.getElementById('print-btn'); if (pb) pb.addEventListener('click', function(){ window.print(); });
  function model(){ if (window.sc4sapEditModel) return window.sc4sapEditModel(); return JSON.parse(document.getElementById('process-model').textContent).model; }
  function version(){ return JSON.parse(document.getElementById('process-model').textContent).version || ''; }

  // ── matrix filters: text, fit, usage, disposition, WRICEF only; a group row stays while one of its tasks shows ──
  // Everything below is delegated from document: the edit mode's undo / draft restore replaces main.innerHTML.
  var $ = function(id){ return document.getElementById(id); };
  var closed = {};
  function apply(){
    var q = $('g-q'), ff = $('g-fit'), fu = $('g-use'), fd = $('g-disp'), fw = $('g-w');
    var s = (q && q.value || '').trim().toLowerCase();
    var rows = Array.prototype.slice.call(document.querySelectorAll('table.gm tbody tr[data-code]'));
    var show = {};
    rows.forEach(function(tr){
      if (Number(tr.dataset.level) < 4) return;
      var sel = tr.querySelector('select[data-f="disposition"]'), cb = tr.querySelector('input[data-f="won"]');
      var ok = (!s || tr.textContent.toLowerCase().indexOf(s) >= 0)
        && (!ff || !ff.value || tr.dataset.fit === ff.value) && (!fu || !fu.value || tr.dataset.usage === fu.value)
        && (!fd || !fd.value || (sel && sel.value) === fd.value) && (!fw || !fw.checked || (cb && cb.checked));
      var c = tr.dataset.code, hidden = Object.keys(closed).some(function(k){ return closed[k] && c.indexOf(k + '.') === 0; });
      tr.hidden = !ok || hidden;
      if (ok) c.split('.').forEach(function(_, i, a){ show[a.slice(0, i + 1).join('.')] = 1; });
    });
    rows.forEach(function(tr){ if (Number(tr.dataset.level) < 4) tr.hidden = !show[tr.dataset.code]; });
  }
  var FILTERS = ['g-q', 'g-fit', 'g-use', 'g-disp', 'g-w'];
  document.addEventListener('input', function(e){ if (e.target && FILTERS.indexOf(e.target.id) >= 0) apply(); });
  document.addEventListener('change', function(e){ if (e.target && FILTERS.indexOf(e.target.id) >= 0) apply(); });
  document.addEventListener('click', function(e){
    var t = e.target.closest && e.target.closest('.tg'); if (!t) return;
    var c = t.dataset.code; closed[c] = !closed[c]; t.textContent = closed[c] ? '▸' : '▾'; apply();
  });
  document.addEventListener('keydown', function(e){ var t = e.target.closest && e.target.closest('.tg'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.click(); } });
  function collapseAll(){ document.querySelectorAll('table.gm .tg[data-level="3"]').forEach(function(b){ closed[b.dataset.code] = true; b.textContent = '▸'; }); apply(); }
  function expandAll(){ closed = {}; document.querySelectorAll('table.gm .tg').forEach(function(b){ b.textContent = '▾'; }); apply(); }

  // ── a disposition change switches the WRICEF toggle (retrofit / rebuild on, everything else off) ──
  document.addEventListener('ed:change', function(e){
    var d = e.detail || {}; if (!/\|disposition$/.test(d.path || '')) return;
    var tr = d.el.closest('tr'); var cb = tr && tr.querySelector('input[data-f="won"]'); if (!cb || tr.dataset.fit === 'fit') return;
    var on = d.value === 'retrofit' || d.value === 'rebuild';
    if (cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  });

  function save(name, text, type){
    var a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(new Blob([text], { type: type }));
    document.body.appendChild(a); a.click(); a.remove();
  }
  var base = decodeURIComponent(location.pathname.split('/').pop() || 'gap.html').replace(/(-edited)?\.html?$/i, '');
  function wricefJson(){
    var m = model(), v = version();
    var items = (m.rows || []).filter(function(r){ return r.level >= 4 && r.wricef && r.wricef.on; }).map(function(r){
      var objs = []; (r.coverage || []).forEach(function(o){ if (objs.indexOf(o.name) < 0) objs.push(o.name); });
      return { label: r.label, kind: r.wricef.kind, module: r.module || m.module, objects: objs, note: 'Gap ' + r.code + ' · ' + (L['d_' + r.disposition] || r.disposition) + ' · ' + (L['u_' + r.usage] || r.usage),
        source: { doc: 'gap', module: m.module, code: r.code, version: v } };
    });
    save(base + '.wricef.json', JSON.stringify(items, null, 2) + '\n', 'application/json');
  }
  function csv(){
    var m = model();
    var cell = function(x){ x = String(x == null ? '' : x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    var head = [L.code, L.process, L.fit, L.usage, L.stdTcodes, L.coverage, L.disposition, L.include, L.wkind, L.note];
    var lines = [head.map(cell).join(',')];
    (m.rows || []).forEach(function(r){
      if (r.level < 4) { lines.push([r.code, r.label].map(cell).join(',')); return; }
      lines.push([r.code, r.label, L['f_' + r.fit] || r.fit, L['u_' + r.usage] || r.usage, (r.tcodes || []).join(' '), (r.coverage || []).map(function(o){ return o.name; }).join(' '),
        L['d_' + r.disposition] || r.disposition, r.wricef && r.wricef.on ? 'X' : '', r.wricef ? r.wricef.kind : '', r.note || ''].map(cell).join(','));
    });
    save(base + '.csv', '﻿' + lines.join('\r\n') + '\r\n', 'text/csv');
  }
  var ACTIONS = { 'g-collapse': collapseAll, 'g-expand': expandAll, 'g-json': wricefJson, 'g-csv': csv };
  document.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('button[id]'); if (b && ACTIONS[b.id]) ACTIONS[b.id](); });
})();
`;

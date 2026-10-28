// sc4sap:role-matrix — the page: style, shell, and the in-browser library + edit mode.
//
// The model travels inside the page (<script type="application/json" id="role-model">{ model, version }). role-model.mjs
// and role-render.mjs are inlined (imports / exports stripped), so the edit mode redraws every sheet from the edited
// model with the same code that built the page. "Save" writes the page again with the edited model and a new revision
// row; build-role-doc.mjs import reads it back.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAll, esc, sheetsOf } from './role-render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const inline = (f) => readFileSync(join(here, f), 'utf8').replace(/^import .*$/gm, '').replace(/^export \{[^}]*\};?$/gm, '').replace(/^export (const|function|async function|let)/gm, '$1');

const LIGHT = '--bg:#ffffff;--fg:#1d2733;--muted:#5a6675;--line:#d3dbe4;--head:#eef2f6;--card:#f6f8fa;--accent:#1d4f73;--link:#0b62c4;--sel:rgba(40,110,200,.14);'
  + '--red:#c62828;--amber:#b26a00;--green:#2e7d32;--red-bg:#fdecea;--amber-bg:#fff4e0;--green-bg:#e8f5e9;--F:#1f6fb2;--F-bg:#dcebf8;--C:#2e7d32;--C-bg:#e3f2e4;--D:#6b7480;--D-bg:#eceff2;--in:#fffbe6;--headfg:#1d2733';
const DARK = '--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--card:#161d26;--accent:#5b9bd0;--link:#5aa2f0;--sel:rgba(90,160,240,.2);'
  + '--red:#ef6b6b;--amber:#e0a43a;--green:#5cb85f;--red-bg:#3a1d1d;--amber-bg:#3a2c12;--green-bg:#1b3320;--F:#8cc0ee;--F-bg:#1d3550;--C:#8fd18f;--C-bg:#1d3a22;--D:#b4bcc6;--D-bg:#283039;--in:#2a2716;--headfg:#e4eaf0';

const STYLE = `
:root{${LIGHT};color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme=light]){${DARK};color-scheme:dark}}
:root[data-theme=dark]{${DARK};color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR",sans-serif}
a{color:var(--link)}.muted{color:var(--muted)}.bad{color:var(--red);font-weight:600}small{color:var(--muted)}
.topbar{position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 16px;background:var(--bg);border-bottom:1px solid var(--line)}
.topbar .t{font-weight:700;flex:1;min-width:180px}.topbar .t small{font-weight:400;margin-left:8px}
button{font:inherit;font-size:13px;padding:3px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}
#chk-n{display:inline-block;min-width:18px;margin-left:4px;padding:0 5px;border-radius:9px;background:var(--red);color:#fff;font-size:11px;text-align:center}
.tabs{position:sticky;top:45px;z-index:19;display:flex;gap:2px;overflow-x:auto;padding:0 16px;background:var(--bg);border-bottom:1px solid var(--line)}
.tabs button{border:0;border-bottom:3px solid transparent;border-radius:0;background:none;color:var(--muted);padding:9px 12px;white-space:nowrap;font-size:14px}
.tabs button[aria-selected=true]{color:var(--fg);border-bottom-color:var(--accent);font-weight:600}
main{max-width:1800px;margin:0 auto;padding:6px 16px 30px}section.tab{display:none}section.tab.on{display:block}
h1{font-size:22px;margin:14px 0 4px}h2{font-size:17px;margin:12px 0 2px}h3{font-size:15px;margin:18px 0 6px}.sub{margin:0 0 6px;font-size:13px}
.pager{display:flex;gap:8px;align-items:center;margin:4px 0 6px;font-size:13px}.pager button{font:inherit;padding:2px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}.pager button:disabled{opacity:.4;cursor:default}
.stools{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}.stools input[type=search]{font:inherit;font-size:13px;padding:3px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);min-width:200px}
.stools .eo{display:none}.editing .stools .eo{display:inline-block}.stools .sep{flex:1}#selinfo{font-size:12px;color:var(--muted)}
.gw{position:relative;overflow:auto;border:1px solid var(--line);border-radius:6px;max-height:70vh;overscroll-behavior:contain}
table{border-collapse:separate;border-spacing:0;font-size:13px}
.grid{min-width:100%}.grid th,.grid td{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:4px 7px;text-align:left;vertical-align:top;white-space:nowrap;background:var(--bg)}
.grid thead th{position:sticky;top:0;z-index:4;background:var(--head);color:var(--headfg);font-weight:600;vertical-align:bottom}.grid thead tr.grp th{height:26px;padding:2px 7px;text-align:center;vertical-align:middle;overflow:hidden}.grid thead tr.grp th.g0{border-bottom-color:transparent}.grid thead tr.frow th{padding:2px 3px;background:var(--card);color:var(--fg);vertical-align:middle;font-weight:400}.grid .fin{width:100%;min-width:38px;box-sizing:border-box;font:inherit;font-size:12px;padding:2px 5px;border:1px solid var(--line);border-radius:4px;background:var(--bg);color:var(--fg)}.grid .fin:focus{outline:2px solid var(--accent);outline-offset:-1px}.grid input.fin:not(:placeholder-shown),.grid select.fin:has(option:checked:not([value=''])){border-color:var(--accent);background:var(--sel)}.grid thead th.stk{z-index:6}.grid .stk{position:sticky;z-index:2}
.grid th .flt{border:0;background:none;color:inherit;padding:0 2px;margin-left:3px;min-height:0;font-size:11px;opacity:.5;cursor:pointer}.grid th .flt:hover{opacity:1}.grid th .flt.on{opacity:1;color:var(--accent);font-weight:700}.pager .fon{color:var(--accent);font-weight:600}
.pop{position:fixed;z-index:30;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.22);padding:6px;width:max-content;max-width:min(340px,92vw);font-size:13px}.pop .lvm{display:flex;flex-direction:column;gap:2px}.pop .lvm button{text-align:left;border:0;background:none;padding:6px 10px;border-radius:6px;white-space:normal}.pop .lvm button:hover,.pop .lvm button:focus{background:var(--card);outline:none}.pop .lvm button.cur{font-weight:600;box-shadow:inset 3px 0 0 var(--accent)}.pop .lvm b{display:inline-block;min-width:24px;text-align:center;margin-right:6px;border-radius:4px}.pop .ph{font-weight:600;margin:0 2px 6px}.pop .fq{width:100%;font:inherit;padding:4px 7px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg)}.pop .fl{max-height:min(300px,45vh);min-width:200px;overflow:auto;margin:4px 0;border-top:1px solid var(--line)}.pop label{display:flex;gap:6px;align-items:center;padding:3px 2px;white-space:nowrap}.pop label small{margin-left:auto;padding-left:10px}.pop .pb{display:flex;gap:6px;justify-content:flex-end;margin-top:6px}
.grid th small{display:block;font-weight:400;font-size:11px;max-width:96px;white-space:normal;line-height:1.2;color:inherit;opacity:.75}
.grid td.wrap{white-space:pre-wrap;min-width:180px;max-width:420px}.grid td.no,.grid th.no{color:var(--muted);text-align:right;font-size:12px;min-width:34px}
.grid td.ro{color:var(--muted);background:var(--card)}.grid td.key{font-weight:600}.grid td.num{text-align:right}
.grid th.mx,.grid td.lv,.grid td.xx{text-align:center;min-width:46px;padding-left:3px;padding-right:3px}.grid th.mx{cursor:default}.editing .grid th.mx{cursor:pointer}
.lv{font-weight:700}.lv-F{color:var(--F);background:var(--F-bg)!important}.lv-C{color:var(--C);background:var(--C-bg)!important}.lv-D{color:var(--D);background:var(--D-bg)!important}
.legend .lv{display:inline-block;min-width:26px;text-align:center;border-radius:4px;padding:0 4px}
.xx.on{font-weight:700;color:var(--accent);background:var(--F-bg)!important}
.rk-H{color:var(--red);font-weight:700}.rk-M{color:var(--amber);font-weight:700}
tr.guess td.lv:not(:empty){font-style:italic;box-shadow:inset 0 0 0 1px var(--amber)}tr.guess td[data-c=tcode]::after{content:" ?";color:var(--amber)}
tr.sodbad td[data-c=uid]{box-shadow:inset 3px 0 0 var(--red)}
.grid tfoot td{position:sticky;bottom:0;background:var(--head);color:var(--headfg);font-weight:600;border-top:1px solid var(--line)}.grid tr.ft:not(:first-child) td{position:static}
.grid td.sel{background-image:linear-gradient(var(--sel),var(--sel))}.grid td.cur{outline:2px solid var(--accent);outline-offset:-2px}
.editing .grid td:not(.ro):not(.no){background-color:var(--in)}.editing .grid td.lv-F,.editing .grid td.lv-C,.editing .grid td.lv-D,.editing .grid td.xx.on{background-color:revert}
.grid{user-select:none;-webkit-user-select:none}
.cell-ed{position:absolute;z-index:8;font:inherit;font-size:13px;padding:4px 7px;border:2px solid var(--accent);background:var(--bg);color:var(--fg);outline:none;box-shadow:0 4px 14px rgba(0,0,0,.18);resize:both}
.cover-ed{font:inherit;width:100%;padding:2px 5px;border:1px solid var(--accent);background:var(--bg);color:var(--fg)}
.cv{display:grid;grid-template-columns:minmax(0,1fr);gap:0 28px}@media (min-width:1100px){.cv{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.plain{border-collapse:collapse;width:100%}.plain th,.plain td{border:1px solid var(--line);padding:5px 9px;text-align:left;vertical-align:top}.plain th{background:var(--head);color:var(--headfg);white-space:nowrap}
.kv th{width:150px}.editing #tab-cover td[data-d]{background:var(--in);cursor:text}.plain tr[data-go]{cursor:pointer}.plain tr[data-go]:hover td{background:var(--card)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}.tile{border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:var(--card)}.tile .k{color:var(--muted);font-size:12.5px}.tile .v{font-size:20px}
.sev{display:inline-block;padding:0 8px;border-radius:9px;font-size:12px;font-weight:600}.sev-err{background:var(--red-bg);color:var(--red)}.sev-warn{background:var(--amber-bg);color:var(--amber)}.sev-info{background:var(--card);color:var(--muted)}
.state{font-size:12px;color:var(--muted)}.state.dirty{color:var(--amber);font-weight:600}
.banner{display:none;margin:8px 16px;padding:8px 12px;border:1px solid var(--amber);background:var(--amber-bg);border-radius:8px}.banner.on,.editing .banner.hint{display:block}
#toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:40;display:none;padding:8px 14px;border-radius:8px;background:var(--fg);color:var(--bg);font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:92vw}#toast.on{display:block}
#help{position:fixed;inset:0;z-index:45;display:none;background:rgba(0,0,0,.35);align-items:flex-start;justify-content:center;padding-top:8vh}#help.on{display:flex}
#help .hbox{width:min(680px,94vw);max-height:84vh;overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:6px 18px 16px;position:relative}
#help .hx{position:absolute;right:10px;top:10px;border:0;background:none;color:var(--muted);font-size:16px}#help th{white-space:nowrap;text-align:left;border-bottom:1px solid var(--line);padding:6px 12px 6px 0;font-family:Consolas,monospace;font-size:12.5px;vertical-align:top}#help td{border-bottom:1px solid var(--line);padding:6px 0}
.t-touch{display:none}@media (pointer: coarse){.t-touch{display:table}.t-keys{display:none}}
.cvh{display:flex;align-items:center;gap:14px}.cvh .logo{max-height:56px;max-width:220px}.topbar .logo{height:24px;max-width:120px;object-fit:contain}
dialog{border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);min-width:320px}dialog label{display:block;font-size:13px}dialog input{width:100%;font:inherit;padding:5px;margin:4px 0 10px}
@media (max-width: 760px){
 .topbar .tx,#help-b,.editing .banner.hint,.sub{display:none}.stools input[type=search]{flex-basis:100%}.stools button{padding:3px 9px}.gw{overscroll-behavior:auto}
 .topbar{gap:6px;padding:6px 10px}.topbar .t{flex-basis:100%;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#print,#theme,.state{display:none}
 .tabs{top:auto;position:static;padding:0 6px}.tabs button{padding:9px 9px;font-size:13px}main{padding:4px 8px 20px}
 .grid td.wrap{min-width:150px;max-width:62vw}.grid th small{max-width:70px}.grid td,.grid th{padding:6px 6px}.grid td.lv,.grid td.xx{min-width:44px;height:38px}
 .grid .fin{font-size:16px;padding:3px 5px}button{min-height:34px}.stools input[type=search]{min-width:0;flex:1;font-size:16px;min-height:34px}.cell-ed{font-size:16px}h1{font-size:19px}
}
@media print{.topbar button,.tabs,.stools,.banner,#help,#toast,.grid tr.frow{display:none!important}section.tab{display:block!important;break-before:page}.gw{max-height:none!important;overflow:visible;border:0}.grid .stk{position:static}}
`;

const EDIT = {
  ko: { edit: '편집', done: '편집 종료', save: '저장', undo: '되돌리기', print: '인쇄', theme: '테마', help: '도움말', checks: '점검',
    add: '+ 맨 끝 행', ins: '행 삽입', del: '행 삭제', up: '▲', down: '▼', csv: 'CSV', addRole: '+ 업무역할 열', search: '검색', selN: '{n}칸 선택',
    hint: '편집 모드 — 칸을 고르고 바로 입력하세요. F·C·D·X는 선택한 범위 전체에 한 번에 들어갑니다. 매트릭스 칸을 누르면 넣을 값을 고를 수 있습니다. 행 삽입은 고른 칸의 위쪽에 들어갑니다(오른쪽 클릭 메뉴도 있습니다). 머리글의 ▾로 열을 거를 수 있습니다. 도움말은 ?',
    filter: '필터', fAll: '(모두 선택)', fBlank: '(공란)', fHas: '포함하는 값으로 찾기', fApply: '적용', fClear: '이 열 필터 해제', fMore: '{n}개 더 있습니다 — 위 칸에 입력해 좁히세요.', pickBlank: '공란 (권한 없음)',
    insAbove: '위에 행 삽입', insBelow: '아래에 행 삽입', needSel: '행을 넣을 위치의 칸을 먼저 누르세요.', fCleared: '새 행이 보이도록 검색과 필터를 해제했습니다.',
    editOn: '편집 모드를 켰습니다.', roCell: '자동 계산 칸입니다.', badValue: '목록에 없는 값이라 넣지 않았습니다.', copied: '{n}칸 복사함 — 엑셀에 붙여 넣을 수 있습니다.', pasted: '{n}칸 붙여 넣음.', deleted: '{n}개 행 삭제함 (Ctrl+Z로 되돌리기).',
    roleAdded: '업무역할 {x}을(를) 추가했습니다. 1.업무역할에서 이름을 적어 주세요.', stDirty: '변경 {n}건', stClean: '변경 없음',
    draft: '저장하지 않은 편집이 있습니다.', resume: '이어서 편집', discard: '버리기', unsaved: '저장하지 않은 변경이 있습니다.',
    saveTitle: '저장 — 변경 이력', author: '작성자', note: '변경 내용', noteDefault: '편집 모드에서 수정', needAuthor: '작성자를 입력하세요.', ok: '저장', cancel: '취소',
    saved: '저장했습니다 (v{v}). 7.변경이력에 한 줄 추가됐습니다. 계속 편집하고 Ctrl+S 하면 같은 파일에 덮어씁니다.',
    keys: [['칸 클릭 · 끌기 · Shift+클릭', '칸 / 범위 선택'], ['방향키 · Shift+방향키 · Ctrl+방향키', '이동 · 범위 늘리기 · 끝으로'], ['바로 입력 · Enter · F2 · 두 번 클릭', '편집 시작'],
      ['Enter · Tab · Esc', '저장 후 아래로 · 오른쪽으로 · 취소 (긴 글 칸 줄바꿈: Alt+Enter)'], ['F · C · D (매트릭스)', '선택 범위 전체에 권한 수준 입력 · Space: 값 고르기 · Delete: 비우기'], ['X · Space (사용자-역할)', '배정 / 해제'],
      ['편집 모드에서 매트릭스 칸 클릭', '넣을 값 고르기 (F·C·D·공란) / X 토글'], ['머리글 아래 필터 줄', '열마다 포함하는 값으로 거르기 · 매트릭스 열은 있음 / 공란'], ['머리글 ▾', '열 필터 — 목록에서 값 고르기'], ['칸에서 오른쪽 클릭', '위에 행 삽입 · 아래에 행 삽입 · 행 삭제'], ['Ctrl+C · Ctrl+V', '엑셀과 복사·붙여넣기 (마지막 행 아래로 붙이면 행이 생김)'], ['Ctrl+D', '맨 윗줄 값으로 아래 채우기'],
      ['행 삽입 버튼 · Ctrl+Enter · Ctrl+-', '고른 칸 위에 행 삽입 · 아래에 행 추가 · 선택 행 삭제'], ['Alt+↑ ↓', '행 순서 바꾸기'], ['Ctrl+A', '시트 전체 선택'], ['Ctrl+Z · Ctrl+Y', '되돌리기 · 다시 실행'], ['Ctrl+S', '저장'],
      ['매트릭스 열 머리글 클릭 (편집 모드)', '그 업무역할로 가서 ID·이름 고치기 — ID를 바꾸면 모든 시트에 반영'], ['?', '이 도움말']],
    touch: [['칸 탭', '선택 · 한 번 더 탭하면 편집'], ['매트릭스 칸 탭 (편집 모드)', '넣을 값 고르기 / X 토글'], ['위 버튼', '행 삽입(고른 칸 위)·삭제·순서, CSV'], ['검색 · 머리글 ▾', '행 거르기 · 열 필터']] },
  en: { edit: 'Edit', done: 'Done', save: 'Save', undo: 'Undo', print: 'Print', theme: 'Theme', help: 'Help', checks: 'Checks',
    add: '+ Row at end', ins: 'Insert row', del: 'Delete rows', up: '▲', down: '▼', csv: 'CSV', addRole: '+ Business role column', search: 'Search', selN: '{n} cells',
    hint: 'Edit mode — pick a cell and type. F, C, D and X fill the whole selection; a click on a matrix cell offers the values to choose from. Insert row puts the row above the picked cell (right-click for more). ▾ in a header filters the column. Help: ?',
    filter: 'Filter', fAll: '(Select all)', fBlank: '(blank)', fHas: 'Find values containing', fApply: 'Apply', fClear: 'Clear this filter', fMore: '{n} more — type above to narrow.', pickBlank: 'Blank (no access)',
    insAbove: 'Insert row above', insBelow: 'Insert row below', needSel: 'First pick a cell where the row goes.', fCleared: 'Search and filters cleared so the new row shows.',
    editOn: 'Edit mode on.', roCell: 'Computed cell.', badValue: 'Not in the list — not entered.', copied: '{n} cell(s) copied — paste them into Excel.', pasted: '{n} cell(s) pasted.', deleted: '{n} row(s) deleted (Ctrl+Z to undo).',
    roleAdded: 'Business role {x} added — name it in sheet 1.', stDirty: '{n} change(s)', stClean: 'no changes',
    draft: 'You have unsaved edits.', resume: 'Continue editing', discard: 'Discard', unsaved: 'You have unsaved changes.',
    saveTitle: 'Save — change history', author: 'Author', note: 'Change', noteDefault: 'Edited in edit mode', needAuthor: 'Enter the author.', ok: 'Save', cancel: 'Cancel',
    saved: 'Saved (v{v}); one row added to sheet 7. Keep editing — Ctrl+S overwrites the same file.',
    keys: [['Click · drag · Shift+click', 'Select a cell / range'], ['Arrows · Shift+arrows · Ctrl+arrows', 'Move · extend · jump to the end'], ['Type · Enter · F2 · double-click', 'Edit'],
      ['Enter · Tab · Esc', 'Save and go down · right · cancel (new line in long text: Alt+Enter)'], ['F · C · D (matrix)', 'Level for the whole selection · Space: choose · Delete: clear'], ['X · Space (user × role)', 'Assign / remove'],
      ['Click a matrix cell in edit mode', 'Choose the value (F, C, D or blank) / toggle X'], ['Filter row under the headers', 'Filter each column by text it contains · matrix columns: any / blank'], ['▾ in a header', 'Column filter — pick values from a list'], ['Right-click a cell', 'Insert row above · below · delete rows'], ['Ctrl+C · Ctrl+V', 'Copy / paste with Excel (pasting below the last row adds rows)'], ['Ctrl+D', 'Fill down from the top row'],
      ['Insert row · Ctrl+Enter · Ctrl+-', 'Row above the picked cell · add a row below · delete the selected rows'], ['Alt+↑ ↓', 'Reorder rows'], ['Ctrl+A', 'Select the sheet'], ['Ctrl+Z · Ctrl+Y', 'Undo · redo'], ['Ctrl+S', 'Save'],
      ['Click a matrix column header (edit mode)', 'Go to that business role to change its ID / name — a new ID follows into every sheet'], ['?', 'This help']],
    touch: [['Tap a cell', 'Select · tap again to edit'], ['Tap a matrix cell (edit mode)', 'Choose the value / toggle X'], ['Buttons above', 'Insert (above the picked cell), delete, reorder rows; CSV'], ['Search · ▾ in a header', 'Filter rows · column filter']] },
};

function clientScript(E) {
  return `(function(){\n${inline('role-model.mjs')}\n${inline('role-render.mjs')}\nvar E=${JSON.stringify(E)};\n${readFileSync(join(here, 'role-client.js'), 'utf8')}\n})();`;
}

const tools = (s, E, L) => `<div class="stools"><input type="search" data-s="${s}" placeholder="${esc(E.search)}">
<button class="eo" data-act="add">${esc(E.add)}</button><button class="eo" data-act="ins">${esc(E.ins)}</button><button class="eo" data-act="del">${esc(E.del)}</button><button class="eo" data-act="up" title="Alt+↑">${E.up}</button><button class="eo" data-act="down" title="Alt+↓">${E.down}</button>
${s === 'tcodes' ? (L.single ? [L.single] : ['F', 'C', 'D'].map((x) => (L.lvOut && L.lvOut[x]) || x)).map((x) => `<button class="eo" data-act="fill" data-v="${esc(x)}">${esc(x)}</button>`).join('') + `<button class="eo" data-act="fill" data-v="">∅</button>` : ''}${s === 'users' ? `<button class="eo" data-act="fill" data-v="X">${esc(L.mark || 'X')}</button><button class="eo" data-act="fill" data-v="">∅</button>` : ''}
${s === 'tcodes' || s === 'users' ? `<button class="eo" data-act="role">${esc(E.addRole)}</button>` : ''}<span class="sep"></span><button data-act="csv">${esc(E.csv)}</button></div>`;

// Company layout theme: colours and font over the light theme (the dark theme keeps its own colours), as CSS.
const HEX = /^#[0-9a-f]{3,8}$/i;
function themeCss(t) {
  if (!t || typeof t !== 'object') return '';
  const vars = [['accent', '--accent'], ['head', '--head'], ['headFg', '--headfg'], ['line', '--line'], ['link', '--link']]
    .filter(([k]) => HEX.test(String(t[k] || ''))).map(([k, v]) => `${v}:${t[k]}`);
  // role-column headers of the two matrices in a colour of their own (light theme only, like the rest)
  const mxr = `.grid thead th.mx{background:${t.mxHead};color:var(--headfg)}`;
  const mx = HEX.test(String(t.mxHead || '')) ? `@media (prefers-color-scheme: light){:root:not([data-theme=dark]) ${mxr}}:root[data-theme=light] ${mxr}` : '';
  const font = String(t.font || '').replace(/[^\w\s\uAC00-\uD7A3\u3040-\u30FF\u4E00-\u9FFF-]/g, '').trim();
  return `${vars.length ? `:root{${vars.join(';')}}` : ''}${mx}${font ? `body{font-family:"${font}","Segoe UI","Malgun Gothic",sans-serif}` : ''}`;
}

/** Edit texts that name F / C / D / X, rewritten with the layout's codes and mark. */
function withCodes(E, L) {
  if (!L.lvOut || (!Object.keys(L.lvOut).length && !L.mark)) return E;
  // a code that is no key on the keyboard (●, ◐ …) is shown with the letter that still types it
  const key = (k) => { const x = L.lvOut[k]; if (!x) return k; return /^[A-Za-z0-9]$/.test(x) || L.lvIn[k] !== k ? x : `${x}(${k})`; };
  const c = { F: key('F'), C: key('C'), D: key('D'), X: L.mark || 'X' };
  // one mark for every level (levelMark): "F, C and D" becomes that mark alone
  const lv = (a, b) => (L.single ? `${L.single}(F)` : `${c.F}${a}${c.C}${b}${c.D}`);
  const sw = (s) => s.replace(/F([·,→ ]+(?:and )?)C([·,→ ]+(?:and )?)D(?:([·,]+ ?(?:and )?)X)?/g, (_, a, b, x) => `${lv(a, b)}${x != null && !(L.single && c.X === L.single) ? `${x}${c.X}` : ''}`)
    .replace(/\bX\b(?= ·|·| \(| toggle| 토글)/g, c.X);
  return JSON.parse(JSON.stringify(E), (k, v) => (typeof v === 'string' ? sw(v) : v));
}

/** The whole page for a model. */
export function renderPage(model, { version, date }) {
  const { v, L, ...tabs } = renderAll(model, { version, date });
  const E = withCodes(EDIT[v.m.lang] || EDIT.en, L);
  const d = v.m.doc;
  const data = JSON.stringify({ model, version, builtFrom: version }).replace(/</g, '\\u003c');
  const sec = (t) => `<section class="tab" id="tab-${t}">${t === 'cover' ? '' : tools(t, E, L)}<div class="body">${tabs[t]}</div></section>`;
  const shown = ['cover', ...sheetsOf(L)];
  const logo = /^data:image\//.test(L.layout?.theme?.logo || '') ? `<img class="logo" alt="" src="${esc(L.layout.theme.logo)}">` : '';
  const title = `${d.project || d.code} — ${L.title}`;
  return `<!doctype html>
<html lang="${esc(v.m.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} v${esc(version)}</title><style>${STYLE}${themeCss(L.layout?.theme)}</style></head>
<body>
<div class="topbar">${logo}<div class="t">${esc(d.code)} · ${esc(d.project || L.title)} <small><span id="ver">v${esc(version)}</span> · ${esc(date)}${d.system ? ` · ${esc(d.system)}` : ''}</small></div>
<span id="selinfo" class="state"></span><span id="state" class="state"></span><button data-go="cover" title="${esc(E.checks)}">${esc(E.checks)}<span id="chk-n"></span></button><button id="help-b">${esc(E.help)}</button>
<button id="edit">${esc(E.edit)}</button><button id="undo" title="${esc(E.undo)} (Ctrl+Z)">↶<span class="tx"> ${esc(E.undo)}</span></button><button id="save" title="${esc(E.save)} (Ctrl+S)">💾<span class="tx"> ${esc(E.save)}</span></button><button id="print">${esc(E.print)}</button><button id="theme">${esc(E.theme)}</button></div>
<nav class="tabs">${shown.map((k) => `<button data-t="${k}">${esc(L.tabs[k])}</button>`).join('')}</nav>
<div class="banner hint">${esc(E.hint)}</div>
<div class="banner" id="draft">${esc(E.draft)} <button id="resume">${esc(E.resume)}</button> <button id="discard">${esc(E.discard)}</button></div>
<main>${shown.map(sec).join('\n')}</main>
<datalist id="dl"></datalist>
<dialog id="save-dlg"><h3>${esc(E.saveTitle)} <small id="s-ver"></small></h3><label>${esc(E.author)}<input id="s-author"></label><label>${esc(E.note)}<input id="s-note"></label>
<div><button id="s-ok">${esc(E.ok)}</button> <button id="s-cancel">${esc(E.cancel)}</button></div></dialog>
<script type="application/json" id="role-model">${data}</script>
<div id="toast" role="status"></div>
<div id="help"><div class="hbox"><button class="hx">✕</button><h3>${esc(E.help)}</h3><table class="t-touch">${E.touch.map(([k, x]) => `<tr><th>${esc(k)}</th><td>${esc(x)}</td></tr>`).join('')}</table><table class="t-keys">${E.keys.map(([k, x]) => `<tr><th>${esc(k)}</th><td>${esc(x)}</td></tr>`).join('')}</table></div></div>
<script>${clientScript(E)}</script>
</body></html>`;
}

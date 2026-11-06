// sc4sap:cbo-relation-map — the page: style, shell, UI strings, model JSON and the inlined client.
// One self-contained HTML file; no library, no network. Read-only view — rebuilt from graph.json each run.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const TYPE_COLOR = {
  TABL: '#1f6fb2', STRU: '#4f8fc9', VIEW: '#0f8a8a', TTYP: '#6a5acd', DTEL: '#2e9d4e', DOMA: '#8a9a2a', SHLP: '#c47f00',
  TRAN: '#d1495b', PROG: '#8e44ad', INCL: '#a77cc0', FUGR: '#b5651d', FUNC: '#d68a3c', CLAS: '#c2185b', INTF: '#e06c9f',
};
const KIND_COLOR = {
  types: '#9aa7b4', checks: '#1f6fb2', valueTable: '#0f8a8a', searchHelp: '#c47f00', rowType: '#6a5acd', basedOn: '#0f8a8a',
  selects: '#c47f00', contains: '#c47f00', include: '#a77cc0', calls: '#8e44ad', submits: '#8e44ad', starts: '#d1495b',
  launches: '#d1495b', reads: '#2e9d4e', writes: '#d84315', uses: '#c2185b',
};

const LIGHT = '--bg:#ffffff;--fg:#1d2733;--muted:#5a6675;--line:#d3dbe4;--head:#eef2f6;--card:#f6f8fa;--accent:#1d4f73;--link:#0b62c4;--canvas:#fbfcfd;--label:#1d2733;--halo:#ffffff;--note:#fff4e0;--notefg:#7a4a00';
const DARK = '--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--card:#161d26;--accent:#5b9bd0;--link:#5aa2f0;--canvas:#121820;--label:#e4eaf0;--halo:#121820;--note:#3a2c12;--notefg:#f0c27a';

const STYLE = `
:root{${LIGHT};color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme=light]){${DARK};color-scheme:dark}}
:root[data-theme=dark]{${DARK};color-scheme:dark}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR",sans-serif}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}.muted,small{color:var(--muted)}
.topbar{position:sticky;top:0;z-index:20;display:flex;gap:8px;align-items:center;padding:8px 16px;background:var(--bg);border-bottom:1px solid var(--line)}
.topbar .t{font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.topbar .t small{font-weight:400;margin-left:8px}
button,select,input{font:inherit;font-size:13px;padding:3px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg)}button{cursor:pointer}
.tabs{position:sticky;top:45px;z-index:19;display:flex;gap:2px;overflow-x:auto;padding:0 16px;background:var(--bg);border-bottom:1px solid var(--line)}
.tabs button{border:0;border-bottom:3px solid transparent;border-radius:0;background:none;color:var(--muted);padding:9px 12px;white-space:nowrap;font-size:14px}
.tabs button[aria-selected=true]{color:var(--fg);border-bottom-color:var(--accent);font-weight:600}
main{max-width:1800px;margin:0 auto;padding:6px 16px 30px}section.tab{display:none}section.tab.on{display:block}
h1{font-size:22px;margin:14px 0 4px}h2{font-size:17px;margin:12px 0 4px}h3{font-size:15px;margin:16px 0 6px}h4{font-size:13px;margin:12px 0 4px}.sub{margin:0 0 8px;font-size:13px}
.note{background:var(--note);color:var(--notefg);padding:6px 10px;border-radius:6px;margin:6px 0;font-size:13px}
.cards{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 14px;min-width:120px}
.card b{display:block;font-size:20px}.card span{font-size:12px;color:var(--muted)}.cards.small .card b{font-size:16px}
.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:24px}@media (max-width:900px){.cols{grid-template-columns:1fr}}
table{border-collapse:collapse;font-size:13px;width:100%}th,td{border-bottom:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}th{background:var(--head);font-weight:600}td.r{text-align:right;white-space:nowrap}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:var(--c,#888);vertical-align:-1px}
.ln{display:inline-block;width:18px;height:0;border-top:3px solid var(--k,#888);margin-right:6px;vertical-align:3px}
.explore{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px;margin-top:8px}@media (max-width:1000px){.explore{grid-template-columns:1fr}}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}.bar label{font-size:13px}
.sg{position:relative}.sg input{min-width:240px}.sg ul{position:absolute;z-index:30;left:0;top:100%;margin:2px 0 0;padding:4px 0;list-style:none;min-width:320px;max-height:360px;overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.15)}
.sg li{padding:3px 10px;cursor:pointer;font-size:13px;white-space:nowrap}.sg li:hover{background:var(--head)}
#filters{border:1px solid var(--line);border-radius:6px;padding:4px 10px;margin:4px 0}#filters summary{cursor:pointer;font-size:13px}
.fl{display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0}.fl b{font-size:12px;color:var(--muted);width:100%}.ck{font-size:12px;white-space:nowrap}.ck input{margin:0 4px 0 0;vertical-align:-2px}
#vinfo{font-size:13px;color:var(--muted);margin:4px 0}
.stage{position:relative;border:1px solid var(--line);border-radius:12px;background:var(--canvas);height:74vh;min-height:440px;overflow:hidden}
#cv{display:block;touch-action:none;cursor:grab;user-select:none;font-family:-apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR",sans-serif}#cv:active{cursor:grabbing}
.zoom{position:absolute;top:10px;right:10px;display:flex;gap:2px;padding:2px;border:1px solid var(--line);border-radius:9px;background:var(--bg);z-index:1}
.zoom button{width:28px;height:28px;padding:0;border:0;border-radius:7px;background:none;color:var(--muted);font-size:15px;line-height:1}.zoom button:hover{color:var(--fg);background:var(--head)}
#tip{position:absolute;pointer-events:none;max-width:420px;padding:5px 9px;font-size:13px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px -12px rgba(0,0,0,.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#tip span{color:var(--muted);margin-right:4px}
#panel{border:1px solid var(--line);border-radius:8px;padding:6px 12px;max-height:80vh;overflow:auto;font-size:13px}
#panel details{margin:2px 0}#panel summary{cursor:pointer}ul.el{margin:2px 0 6px;padding-left:18px}ul.el li{margin:2px 0}.ev{color:var(--muted);font-size:11.5px;font-family:Consolas,monospace;word-break:break-all}
.b{font-size:10.5px;padding:0 5px;border-radius:8px;border:1px solid var(--line);color:var(--muted)}.b.b2{border-style:dashed}
ol.steps{padding-left:20px}ol.steps li{margin:4px 0}
.desc{color:var(--muted);font-size:12px}.desc.big{font-size:13px;margin:2px 0 6px}.mono{font-family:Consolas,monospace;font-size:12px;word-break:break-all}
.u{display:inline-block;font-size:10.5px;line-height:16px;padding:0 6px;border-radius:8px;border:1px solid var(--line);color:var(--muted)}.u.u0{color:#2e9d4e;border-color:#2e9d4e}.u.u1{color:#4f8fc9;border-color:#4f8fc9}.u.u2{color:#d84315;border-color:#d84315}.u.u3{border-style:dashed}
.card.u0 b{color:#2e9d4e}.card.u1 b{color:#4f8fc9}.card.u2 b{color:#d84315}
.crud{font-family:Consolas,monospace;font-size:11px;letter-spacing:1px}.crud b{font-weight:700}.c-C{color:#2e9d4e}.c-R{color:#4f8fc9}.c-U{color:#c47f00}.c-D{color:#d84315}
pre.snip{margin:4px 0 6px;padding:6px 8px;max-height:280px;overflow:auto;background:var(--head);border-radius:6px;font-size:11.5px;line-height:1.45}pre.snip span{display:block}pre.snip span.hl{background:rgba(255,196,0,.22)}pre.snip i{display:inline-block;width:42px;color:var(--muted);font-style:normal;user-select:none}
details.ev summary{cursor:pointer;list-style:none}details.ev summary::before{content:'▸ ';color:var(--muted)}details.ev[open] summary::before{content:'▾ '}
.alts a{display:inline-block;margin:2px 6px 2px 0;padding:1px 8px;border:1px solid var(--line);border-radius:10px;font-size:12px}.alts a.on{background:var(--head);color:var(--fg);font-weight:600}
#presets{display:inline-flex;gap:0}#presets button{border-radius:0;margin-left:-1px}#presets button:first-child{border-radius:999px 0 0 999px}#presets button:last-child{border-radius:0 999px 999px 0}#presets button.on{background:var(--head);font-weight:600}
details.more{margin-top:12px}details.more summary{cursor:pointer;font-weight:600}
.qm{display:inline-grid;place-items:center;width:12px;height:12px;margin:0 3px 0 1px;vertical-align:5px;font-size:9px;line-height:1;font-weight:700;color:var(--muted);border:1px solid var(--line);border-radius:3px;background:var(--bg);cursor:help;user-select:none}
.qm:hover,.qm:focus{color:var(--fg);border-color:var(--muted);outline:none}
#qtip{position:fixed;z-index:60;max-width:340px;padding:7px 10px;font-size:12.5px;line-height:1.45;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px -10px rgba(0,0,0,.35);pointer-events:none}
#qtip b{display:block;margin-bottom:2px}
.an{display:inline-flex;gap:4px;margin-left:8px;vertical-align:1px}.an button{font-size:11px;padding:0 7px;border-radius:999px;line-height:18px}
.fl > b{display:flex;align-items:center}
#nav-back{position:absolute;top:10px;left:10px;z-index:2;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:4px 12px;border-radius:9px;background:var(--bg);font-weight:600}
#nav-back span{font-weight:400;color:var(--muted);margin-left:4px}#nav-back:disabled{display:none}
#card{position:absolute;z-index:3;width:320px;max-width:calc(100% - 16px);padding:10px 12px 12px;background:var(--bg);border:1px solid var(--line);border-radius:12px;box-shadow:0 14px 36px -14px rgba(0,0,0,.5);font-size:13px}
#card .ch{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-right:22px;position:relative}#card .ch b{font-size:15px;word-break:break-all}
#card .cx{position:absolute;right:-4px;top:-4px;width:24px;height:24px;padding:0;border:0;background:none;color:var(--muted);font-size:18px;line-height:1}#card .cx:hover{color:var(--fg)}
#card .cf{margin:6px 0;line-height:1.6}#card .crs{display:flex;flex-wrap:wrap;gap:4px 10px;margin:4px 0 10px;font-size:12px}#card .cr b{font-weight:600;color:var(--muted)}
#card .cb{display:flex;gap:6px;flex-wrap:wrap}#card .cb button{padding:5px 12px;border-radius:8px}#card .cb .pri{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);margin:6px 0}
${Object.entries(TYPE_COLOR).map(([t, c]) => `.t-${t}{--c:${c}}`).join('')}
${Object.entries(KIND_COLOR).map(([k, c]) => `.k-${k}{--k:${c}}`).join('')}
`;

export const TEXT = {
  ko: {
    allOn: "전체 선택",
    allOff: "전체 해제",
    kindDesc: {"types": "필드가 어떤 데이터 요소를 쓰는지, 데이터 요소가 어떤 도메인을 쓰는지, 구조가 어떤 구조를 .INCLUDE / .APPEND 하는지예요. DD03L·DD04L에 적혀 있어요.", "checks": "필드 값이 검사 테이블에 있어야 하는 관계(외래 키)예요. 카디널리티와 필드 대응은 DD08L·DD05S에서 가져와요.", "valueTable": "도메인의 값 테이블이에요(DD01L). 입력 도움말과 외래 키 제안에 쓰여요.", "searchHelp": "데이터 요소나 테이블 필드에 붙은 서치헬프(F4)예요(DD04L·DD35L).", "rowType": "테이블 타입의 한 줄이 어떤 구조·테이블·데이터 요소인지예요(DD40L).", "basedOn": "뷰가 어떤 테이블을 기준으로 만들어졌는지예요(DD26S).", "selects": "서치헬프가 값을 고르는 테이블·뷰(선택 방법)예요(DD30L).", "contains": "묶음 서치헬프가 포함하는 하위 서치헬프예요(DD31S).", "include": "프로그램·함수 그룹이 INCLUDE 문으로 소스를 넣는 관계예요. 기본은 인클루드를 포함한 프로그램·함수 그룹 노드 하나로 합쳐서 보여 줘요(카드·패널의 \"포함된 인클루드\").", "calls": "CALL FUNCTION이나 메서드 호출처럼 다른 객체를 부르는 관계예요.", "submits": "SUBMIT으로 다른 리포트를 실행하는 관계예요.", "starts": "CALL TRANSACTION / LEAVE TO TRANSACTION으로 트랜잭션을 시작하는 관계예요.", "launches": "트랜잭션이 실행하는 프로그램이나 SM30·SM34 뷰예요(TSTC).", "reads": "SELECT로 테이블·뷰를 읽는 관계예요.", "writes": "INSERT / UPDATE / MODIFY / DELETE로 테이블을 고치는 관계예요. 패널과 CRUD 탭에 C·U·D로 표시해요.", "uses": "TYPE REF TO, 클래스·인터페이스 사용, 객체 생성처럼 클래스를 쓰는 관계예요."},
    typeDesc: {"TABL": "투명 테이블이에요. 데이터를 DB에 저장해요.", "STRU": "구조예요. 필드 묶음이고 DB에 저장하지 않아요.", "VIEW": "데이터베이스 뷰·유지보수 뷰예요. 여러 테이블을 합쳐 보여 줘요.", "TTYP": "테이블 타입이에요. 내부 테이블의 줄 형식을 정해요.", "DTEL": "데이터 요소예요. 필드의 의미와 화면 라벨을 정해요.", "DOMA": "도메인이에요. 타입·길이·고정값·값 테이블을 정해요.", "SHLP": "서치헬프(F4 입력 도움말)예요.", "TRAN": "트랜잭션 코드예요. 사용자가 화면을 여는 입구예요.", "PROG": "프로그램(리포트·모듈 풀)이에요.", "INCL": "인클루드예요. 다른 프로그램 안에 들어가는 소스 조각이에요.", "FUGR": "함수 그룹이에요. 함수 모듈을 묶고 전역 데이터를 함께 써요.", "FUNC": "함수 모듈이에요.", "CLAS": "클래스예요.", "INTF": "인터페이스예요.", "ENQU": "잠금 객체예요.", "MSAG": "메시지 클래스예요.", "SPRX": "프록시 객체예요(PI/XI 인터페이스).", "ENHO": "확장 구현이에요.", "SXCI": "BAdI 구현(클래식)이에요.", "ENHC": "복합 확장이에요(확장 구현을 묶어요).", "PARA": "SET/GET 파라미터 ID예요."},
    basisDesc: {"ddic": "DD* 테이블(DD03L, DD08L 등)에 정의된 관계예요. 가장 확실한 근거예요.", "source": "ABAP 소스에 객체 이름이 그대로 적혀 있어요. 패널의 근거 줄을 누르면 소스를 볼 수 있어요.", "inferred": "상수나 변수로 이름을 짐작한 관계예요. 실제와 다를 수 있어서 점선으로 그려요."},
    usageDesc: {"direct": "운영 시스템에서 이 TCode가 실행됐거나 이 프로그램이 잡으로 돌았어요.", "indirect": "직접 쓰인 객체가 부르거나 포함해서 함께 쓰이는 객체예요.", "unused": "실적 기간에 실행 기록이 없어요. 기간 밖에서는 쓰였을 수 있어요.", "no-evidence": "판정할 근거가 없어요. RFC·워크플로·BAdI처럼 밖에서 불릴 수 있어서 미사용과는 달라요.", "none": "사용 실적을 판정하지 않는 객체예요(DDIC 객체 등)."},
    pkgDesc: "{p} 패키지에 속한 객체예요.",
    pkgOutside: "합친 패키지 어디에도 속하지 않은 Z/Y 객체예요.",
    cardFocus: '이 객체 그래프 보기', cardClose: '닫기', cardIsCenter: '지금 가운데에 있는 객체예요.', cardNoRel: '거르기와 상관없이 연결이 없는 객체예요.',
    navBack: '뒤로', navBackTo: '이전 보기로 돌아가요: {v}', navBackNone: '돌아갈 이전 보기가 없어요',
    title: 'CBO 관계도', tOverview: '개요', tExplore: '탐색', tGroups: '그룹', tCrud: '테이블 CRUD', theme: '테마',
    noteFolded: '인클루드 {n}개는 그 인클루드를 포함한 프로그램·함수 그룹 노드 하나로 합쳐서 보여 줘요. 연결은 소유 객체로 옮기고 근거에는 인클루드 이름과 줄을 남겨요.',
    hTypeHubs: '필드 타입으로 가장 많이 쓰인 객체', typeHubsHelp: '데이터 요소·도메인처럼 필드 타입(types)으로만 많이 이어진 객체예요. 위 순위에서는 뺐어요.',
    colPkg: '패키지', colLabel: '이름', withTypes: '타입 포함',
    hUsage: '사용 실적', usageHelp: '운영 시스템의 TCode·잡 사용 실적으로 판정했어요. 근거 없음은 미사용이 아니에요(RFC, 워크플로, BAdI 호출은 보이지 않아요).',
    usageName: { direct: '직접 사용', indirect: '간접 사용', unused: '미사용', 'no-evidence': '근거 없음' }, usageShort: { direct: '사용', indirect: '간접', unused: '미사용', 'no-evidence': '?' }, usageNone: '판정 없음',
    fUsage: '사용 실적', fPkgs: '패키지', colorType: '색: 객체 종류', colorPkg: '색: 패키지',
    preset: { business: '업무 관계', ddic: 'DDIC 전체', code: '코드만', all: '전체' },
    presetHelp: { business: '필드 타입(types)을 뺀 모든 관계', ddic: 'DDIC 관계(타입·검사 테이블·서치헬프·값 테이블·행 타입·뷰 기준)', code: '소스에 적힌 관계(INCLUDE·호출·SUBMIT·트랜잭션·읽기·쓰기)', all: '모든 관계' },
    pathAny: '방향 무시', pathOut: '화살표 방향만', pathDirHelp: '경로를 찾을 때 연결 방향을 따를지 정해요', pathAlt: '경로 {n} · {s}단계',
    exportPng: 'PNG', exportCsv: 'CSV',
    includes: '포함된 인클루드', stdChecks: '표준 검사 테이블', stdChecksHelp: '표준 테이블이라 그림에는 그리지 않아요. 필드 → 검사 테이블이에요.',
    impact: '바꾸면 영향 받는 객체', impactCount: 'TCode {t}개 · 프로그램·함수·클래스 {p}개', impactShow: '그림으로 보기',
    impactHelp: '이 객체를 쓰는 쪽을 거꾸로 따라갔어요. 첫 단계는 모든 관계, 그다음은 코드 관계만 따라가요(최대 6단계).',
    impactInfo: '{what} 변경 시 영향 받는 객체 — {n}개, 연결 {e}개.',
    hCrud: '테이블을 누가 만들고·읽고·고치고·지우나', crudHelp: '소스의 SELECT / INSERT / UPDATE / MODIFY / DELETE로 만든 표예요. 쓰는 객체가 많은 테이블부터 보여 줘요. 표준 테이블은 빼요.',
    crudNone: '이 그래프에는 소스 관계가 없어서 표를 만들 수 없어요. analyze-cbo-obj를 소스(G1)까지 실행하면 생겨요.', crudSearch: '테이블 이름·설명', crudLegend: 'C 만들기 · R 읽기 · U 고치기 · D 지우기 (MODIFY = C+U)',
    colTable: '테이블', colWriters: '쓰는 객체', colReaders: '읽는 객체', colUsers: '객체', crudObjects: '{n}개 객체',
    graphBuilt: '그래프 작성', cNodes: '객체', cEdges: '연결', cGroups: '그룹', cIsolated: '연결 없음',
    scopeMember: '패키지 안', scopeCustom: '패키지 밖 Z/Y',
    basis: { ddic: 'DDIC에 적힘', source: '소스에 적힘', inferred: '추정' }, basisShort: { ddic: 'DDIC', source: '소스', inferred: '추정' },
    basisHelp: 'DDIC에 적힘 = DD* 테이블에 정의된 관계예요. 소스에 적힘 = ABAP 소스에 이름이 그대로 적힌 관계예요. 추정 = 상수나 변수로 짐작한 관계라 점선으로 그려요.',
    noteNoSource: '프로그램 소스를 읽지 않은 그래프예요. 프로그램·함수·클래스 사이 연결은 없고 DDIC 관계만 있어요.',
    noteDropped: '표준 객체로 가는 연결 {n}개는 뺐어요. 이 관계도는 고객(Z/Y·네임스페이스) 객체만 보여 줘요.',
    hTypes: '객체 종류', hKinds: '연결 종류', hHubs: '연결이 가장 많은 객체',
    hubsHelp: '필드 타입을 뺀 업무 관계로 서로 다른 객체와 가장 많이 이어진 객체예요. 바꾸면 영향이 넓게 퍼질 수 있어요.',
    colObject: '객체', colDegree: '이웃 수', colGroup: '그룹', colScope: '위치', colSize: '객체 수', colInner: '그룹 안 연결', colMix: '구성', colTop: '대표 객체',
    hGroups: '서로 묶이는 객체 그룹', groupsHelp: '안쪽 연결이 많고 바깥 연결이 적은 객체끼리 묶었어요(Louvain). 그룹 하나가 대개 업무 기능 하나예요.',
    groupsMore: '객체가 적은 그룹 {n}개는 목록에서 뺐어요.',
    search: '객체 검색', searchPh: '이름 2글자 이상', depth: '단계', dir: '방향', dirBoth: '양방향', dirOut: '나가는 쪽', dirIn: '들어오는 쪽', max: '최대 노드',
    filters: '거르기', fKinds: '연결 종류', fTypes: '객체 종류', fBases: '근거',
    pathTo: '경로 찾기 →', pathPh: '도착 객체', pathGo: '찾기', pathClear: '지우기',
    pickHint: '객체를 검색하거나 개요·그룹에서 객체를 누르면 그 주변을 그려요.',
    viewInfo: '{what} 주변 — 객체 {n}개, 연결 {e}개.', groupInfo: '{what} — 객체 {n}개, 연결 {e}개.', capped: '(전체 {n}개 중 이웃 수가 많은 순서로 일부만 그렸어요.)',
    pathInfo: '{a} → {b} 최단 경로 — {n}단계.', noPath: '{a} → {b}: 지금 거르기로는 이어지는 경로가 없어요.', pathSteps: '경로',
    outgoing: '나가는 연결', incoming: '들어오는 연결', hidden: '거르기로 숨김', more: '{n}개 더 있어요.', parent: '소속', noMatch: '맞는 객체가 없어요.',
    legendHelp: '속이 빈 원 = 패키지 밖 Z/Y 객체 · 점선 = 추정 · 마우스를 올리면 이웃만 밝아지고 연결 방향이 흘러요 · 휠 = 확대/축소(확대하면 이름이 나와요) · 빈 곳 끌기 = 이동 · 노드 끌기 = 옮기기 · 노드 클릭 = 상세 카드(카드에서 그 객체 그래프 보기) · 더블클릭 = 전체 보기',
    typeName: { TABL: '테이블', STRU: '구조', VIEW: '뷰', TTYP: '테이블 타입', DTEL: '데이터 요소', DOMA: '도메인', SHLP: '서치헬프', TRAN: '트랜잭션', PROG: '프로그램', INCL: '인클루드', FUGR: '함수 그룹', FUNC: '함수 모듈', CLAS: '클래스', INTF: '인터페이스', ENQU: '잠금 객체', MSAG: '메시지 클래스' },
    kindName: { types: '필드 → 데이터 요소, 데이터 요소 → 도메인, .INCLUDE', checks: '필드 → 검사 테이블(외래 키)', valueTable: '도메인 → 값 테이블', searchHelp: '필드·데이터 요소 → 서치헬프', rowType: '테이블 타입 → 행 타입', basedOn: '뷰 → 기준 테이블', selects: '서치헬프 → 선택 방법', contains: '묶음 서치헬프 → 하위 서치헬프', include: 'INCLUDE', calls: 'CALL FUNCTION / 메서드 호출', submits: 'SUBMIT', starts: 'CALL TRANSACTION', launches: '트랜잭션 → 프로그램', reads: 'SELECT', writes: 'INSERT / UPDATE / MODIFY / DELETE', uses: 'TYPE REF TO / 클래스 사용' },
  },
  en: {
    allOn: "Select all",
    allOff: "Clear all",
    kindDesc: {"types": "Which data element a field uses, which domain a data element uses, which structure a structure .INCLUDEs / .APPENDs. Stated in DD03L / DD04L.", "checks": "A field whose values must exist in a check table (foreign key). Cardinality and field map from DD08L / DD05S.", "valueTable": "A domain's value table (DD01L), used for input help and foreign key proposals.", "searchHelp": "The search help (F4) attached to a data element or a table field (DD04L / DD35L).", "rowType": "The line type of a table type: a structure, table or data element (DD40L).", "basedOn": "The tables a view is built on (DD26S).", "selects": "The table or view a search help selects its values from (DD30L).", "contains": "The elementary search helps inside a collective search help (DD31S).", "include": "A program or function group pulling in source with INCLUDE. Includes are folded into their owner by default.", "calls": "Calling another object, e.g. CALL FUNCTION or a method call.", "submits": "Running another report with SUBMIT.", "starts": "Starting a transaction with CALL TRANSACTION / LEAVE TO TRANSACTION.", "launches": "The program or SM30 / SM34 view a transaction runs (TSTC).", "reads": "Reading a table or view with SELECT.", "writes": "Changing a table with INSERT / UPDATE / MODIFY / DELETE, shown as C / U / D in the panel and the CRUD tab.", "uses": "Using a class: TYPE REF TO, class or interface use, object creation."},
    typeDesc: {"TABL": "Transparent table; stores data in the database.", "STRU": "Structure; a group of fields, not stored in the database.", "VIEW": "Database or maintenance view over one or more tables.", "TTYP": "Table type; the line format of an internal table.", "DTEL": "Data element; the meaning and screen labels of a field.", "DOMA": "Domain; type, length, fixed values, value table.", "SHLP": "Search help (F4 input help).", "TRAN": "Transaction code; where users start a screen.", "PROG": "Program (report or module pool).", "INCL": "Include; a piece of source inside another program.", "FUGR": "Function group; holds function modules and their shared data.", "FUNC": "Function module.", "CLAS": "Class.", "INTF": "Interface.", "ENQU": "Lock object.", "MSAG": "Message class.", "SPRX": "Proxy object (PI / XI interface).", "ENHO": "Enhancement implementation.", "SXCI": "Classic BAdI implementation.", "ENHC": "Composite enhancement (groups enhancement implementations).", "PARA": "SET / GET parameter ID."},
    basisDesc: {"ddic": "Defined in a DD* table (DD03L, DD08L, …). The surest basis.", "source": "The object name is written literally in ABAP source. Open the source from the evidence line in the panel.", "inferred": "Guessed from a constant or variable; may differ from reality, so it is drawn dashed."},
    usageDesc: {"direct": "This TCode ran in the productive system, or this program ran as a job.", "indirect": "Called or included by an object that is used directly.", "unused": "No run recorded in the measured window; it may have run outside it.", "no-evidence": "Nothing to judge by. RFC, workflow and BAdI callers are invisible, so this is not unused.", "none": "Not rated for usage (DDIC objects and the like)."},
    pkgDesc: "Objects of package {p}.",
    pkgOutside: "Z/Y objects outside every merged package.",
    cardFocus: 'Show its graph', cardClose: 'Close', cardIsCenter: 'This is the object in the middle.', cardNoRel: 'This object has no relations at all.',
    navBack: 'Back', navBackTo: 'Back to {v}', navBackNone: 'No earlier view',
    title: 'CBO relation map', tOverview: 'Overview', tExplore: 'Explore', tGroups: 'Groups', tCrud: 'Table CRUD', theme: 'Theme',
    noteFolded: '{n} includes are folded into the program or function group that owns them. Their relations move to the owner; the evidence keeps the include name and line.',
    hTypeHubs: 'Most used as field types', typeHubsHelp: 'Objects linked mostly as field types (types), such as data elements and domains. Left out of the list above.',
    colPkg: 'Package', colLabel: 'Name', withTypes: 'with types',
    hUsage: 'Usage', usageHelp: 'From TCode and job statistics of the productive system. No evidence is not unused: RFC, workflow and BAdI callers are invisible.',
    usageName: { direct: 'used directly', indirect: 'used indirectly', unused: 'unused', 'no-evidence': 'no evidence' }, usageShort: { direct: 'used', indirect: 'indirect', unused: 'unused', 'no-evidence': '?' }, usageNone: 'not rated',
    fUsage: 'Usage', fPkgs: 'Packages', colorType: 'Colour: object type', colorPkg: 'Colour: package',
    preset: { business: 'Business', ddic: 'All DDIC', code: 'Code only', all: 'All' },
    presetHelp: { business: 'every relation except field typing (types)', ddic: 'DDIC relations (typing, check tables, search helps, value tables, row types, view bases)', code: 'relations stated in source (INCLUDE, calls, SUBMIT, transactions, reads, writes)', all: 'every relation' },
    pathAny: 'any direction', pathOut: 'along the arrows', pathDirHelp: 'whether the path follows the direction of the relations', pathAlt: 'path {n} · {s} steps',
    exportPng: 'PNG', exportCsv: 'CSV',
    includes: 'Includes inside', stdChecks: 'Standard check tables', stdChecksHelp: 'Standard tables are not drawn. Field → check table.',
    impact: 'Affected by a change', impactCount: '{t} TCodes · {p} programs, functions, classes', impactShow: 'Draw it',
    impactHelp: 'Followed backwards from what uses this object: the first step over every relation, then code relations only (up to 6 steps).',
    impactInfo: 'Affected when {what} changes — {n} objects, {e} relations.',
    hCrud: 'Who creates, reads, updates and deletes each table', crudHelp: 'Built from SELECT / INSERT / UPDATE / MODIFY / DELETE in source. Tables with the most writers first. Standard tables are left out.',
    crudNone: 'This graph holds no source relations, so there is no table. Run analyze-cbo-obj with sources (G1) to get it.', crudSearch: 'table name or description', crudLegend: 'C create · R read · U update · D delete (MODIFY = C+U)',
    colTable: 'Table', colWriters: 'Writers', colReaders: 'Readers', colUsers: 'Objects', crudObjects: '{n} objects',
    graphBuilt: 'graph built', cNodes: 'objects', cEdges: 'relations', cGroups: 'groups', cIsolated: 'unconnected',
    scopeMember: 'in package', scopeCustom: 'Z/Y outside package',
    basis: { ddic: 'stated in DDIC', source: 'stated in source', inferred: 'inferred' }, basisShort: { ddic: 'DDIC', source: 'source', inferred: 'inferred' },
    basisHelp: 'Stated in DDIC = defined in a DD* table. Stated in source = the name is written literally in ABAP source. Inferred = guessed from a constant or variable; drawn dashed.',
    noteNoSource: 'Program sources were not read for this graph. It holds DDIC relations only — no links between programs, functions and classes.',
    noteDropped: '{n} relations to standard objects are left out. This map shows customer (Z/Y, namespace) objects only.',
    hTypes: 'Object types', hKinds: 'Relation kinds', hHubs: 'Most connected objects',
    hubsHelp: 'Objects linked to the most distinct other objects by business relations (field typing left out). A change here can spread widely.',
    colObject: 'Object', colDegree: 'Neighbours', colGroup: 'Group', colScope: 'Where', colSize: 'Objects', colInner: 'Links inside', colMix: 'Mix', colTop: 'Main objects',
    hGroups: 'Groups of related objects', groupsHelp: 'Objects with many links inside and few outside (Louvain). One group is usually one business function.',
    groupsMore: '{n} small groups are not listed.',
    search: 'Find object', searchPh: 'name, 2+ characters', depth: 'Depth', dir: 'Direction', dirBoth: 'both', dirOut: 'outgoing', dirIn: 'incoming', max: 'Max nodes',
    filters: 'Filters', fKinds: 'Relation kinds', fTypes: 'Object types', fBases: 'Basis',
    pathTo: 'Path to →', pathPh: 'target object', pathGo: 'Find', pathClear: 'Clear',
    pickHint: 'Search for an object, or click one in Overview or Groups, to draw its neighbourhood.',
    viewInfo: 'Around {what} — {n} objects, {e} relations.', groupInfo: '{what} — {n} objects, {e} relations.', capped: '(of {n}; the most connected are drawn.)',
    pathInfo: 'Shortest path {a} → {b} — {n} steps.', noPath: 'No path between {a} and {b} with the current filters.', pathSteps: 'Path',
    outgoing: 'Outgoing', incoming: 'Incoming', hidden: 'hidden by filter', more: '{n} more.', parent: 'Part of', noMatch: 'No matching object.',
    legendHelp: 'Hollow circle = Z/Y object outside the package · dashed = inferred · hover lights the neighbours and runs the direction · wheel = zoom (names appear as you zoom in) · drag the ground = pan · drag a node = move it · click a node = detail card (show its graph from there) · double click = fit',
    typeName: { TABL: 'table', STRU: 'structure', VIEW: 'view', TTYP: 'table type', DTEL: 'data element', DOMA: 'domain', SHLP: 'search help', TRAN: 'transaction', PROG: 'program', INCL: 'include', FUGR: 'function group', FUNC: 'function module', CLAS: 'class', INTF: 'interface', ENQU: 'lock object', MSAG: 'message class' },
    kindName: { types: 'field → data element, data element → domain, .INCLUDE', checks: 'field → check table (foreign key)', valueTable: 'domain → value table', searchHelp: 'field / data element → search help', rowType: 'table type → row type', basedOn: 'view → base table', selects: 'search help → selection method', contains: 'collective → elementary search help', include: 'INCLUDE', calls: 'CALL FUNCTION / method call', submits: 'SUBMIT', starts: 'CALL TRANSACTION', launches: 'transaction → program', reads: 'SELECT', writes: 'INSERT / UPDATE / MODIFY / DELETE', uses: 'TYPE REF TO / class use' },
  },
};

const json = (x) => JSON.stringify(x).replace(/</g, '\\u003c');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderPage(model, { lang = 'ko' } = {}) {
  const T = TEXT[lang] || TEXT.ko;
  const client = readFileSync(join(here, 'relmap-client.js'), 'utf8');
  const pkg = model.meta.package || '';
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pkg)} ${esc(T.title)}</title>
<style>${STYLE}</style></head>
<body>
<div class="topbar"><div class="t">${esc(T.title)} · ${esc(pkg)}<small>${esc([model.meta.system, model.meta.sapVersion].filter(Boolean).join(' · '))}</small></div><button id="theme">${esc(T.theme)}</button></div>
<nav class="tabs"><button data-tab="overview">${esc(T.tOverview)}</button><button data-tab="explore">${esc(T.tExplore)}</button><button data-tab="groups">${esc(T.tGroups)}</button><button data-tab="crud">${esc(T.tCrud)}</button></nav>
<main>
<section class="tab" id="tab-overview"></section>
<section class="tab" id="tab-explore">
  <div class="bar">
    <label>${esc(T.search)}</label><span class="sg"><input id="q" type="search" placeholder="${esc(T.searchPh)}" autocomplete="off"><ul id="q-list" hidden></ul></span>
    <label>${esc(T.depth)} <select id="depth"><option>1</option><option>2</option><option>3</option></select></label>
    <label>${esc(T.dir)} <select id="dir"><option value="both">${esc(T.dirBoth)}</option><option value="out">${esc(T.dirOut)}</option><option value="in">${esc(T.dirIn)}</option></select></label>
    <label>${esc(T.max)} <select id="max"><option>100</option><option selected>200</option><option>400</option><option>600</option></select></label>
    <label>${esc(T.pathTo)}</label><span class="sg"><input id="q2" type="search" placeholder="${esc(T.pathPh)}" autocomplete="off"><ul id="q2-list" hidden></ul></span>
    <select id="path-dir" title="${esc(T.pathDirHelp)}"><option value="any">${esc(T.pathAny)}</option><option value="out">${esc(T.pathOut)}</option></select>
    <button id="path-go">${esc(T.pathGo)}</button><button id="path-clear">${esc(T.pathClear)}</button>
  </div>
  <div class="bar"><span id="presets"></span>
    <select id="color-by"><option value="type">${esc(T.colorType)}</option><option value="pkg">${esc(T.colorPkg)}</option></select>
    <span style="flex:1"></span><button id="x-png">${esc(T.exportPng)}</button><button id="x-csv">${esc(T.exportCsv)}</button></div>
  <details id="filters"><summary>${esc(T.filters)}</summary>
    <div class="fl"><b>${esc(T.fKinds)}<span class="an" data-grp="k"></span></b><span id="f-kinds" class="fl"></span></div>
    <div class="fl"><b>${esc(T.fTypes)}<span class="an" data-grp="t"></span></b><span id="f-types" class="fl"></span></div>
    <div class="fl"><b>${esc(T.fBases)}<span class="an" data-grp="b"></span></b><span id="f-bases" class="fl"></span></div>
    <div class="fl" id="f-usage-row"><b>${esc(T.fUsage)}<span class="an" data-grp="u"></span></b><span id="f-usage" class="fl"></span></div>
    <div class="fl" id="f-pkgs-row"><b>${esc(T.fPkgs)}<span class="an" data-grp="p"></span></b><span id="f-pkgs" class="fl"></span></div>
  </details>
  <div id="vinfo"></div>
  <div class="explore"><div class="stage" id="stage"><canvas id="cv"></canvas><button id="nav-back" type="button" disabled>← ${esc(T.navBack)} <span></span></button><div class="zoom"><button id="z-in" title="+">+</button><button id="z-out" title="−">−</button><button id="z-fit" title="fit">⤢</button></div><div id="tip" hidden></div><div id="card" hidden></div></div><aside id="panel"></aside></div>
  <div id="qtip" hidden></div>
  <div class="legend">${esc(T.legendHelp)}</div>
</section>
<section class="tab" id="tab-groups"></section>
<section class="tab" id="tab-crud"></section>
</main>
<script type="application/json" id="relmap-data">${json(model)}</script>
<script type="application/json" id="relmap-text">${json(T)}</script>
<script type="application/json" id="relmap-colors">${json({ types: TYPE_COLOR, kinds: KIND_COLOR })}</script>
<script>${client}</script>
</body></html>
`;
}

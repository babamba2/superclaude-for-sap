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
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR",sans-serif}
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
details.more{margin-top:12px}details.more summary{cursor:pointer;font-weight:600}.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);margin:6px 0}
${Object.entries(TYPE_COLOR).map(([t, c]) => `.t-${t}{--c:${c}}`).join('')}
${Object.entries(KIND_COLOR).map(([k, c]) => `.k-${k}{--k:${c}}`).join('')}
`;

export const TEXT = {
  ko: {
    title: 'CBO 관계도', tOverview: '개요', tExplore: '탐색', tGroups: '그룹', tCrud: '테이블 CRUD', theme: '테마',
    noteFolded: '인클루드 {n}개는 그 인클루드를 가진 프로그램·함수 그룹 안으로 접었어요. 연결은 소유 객체로 옮기고 근거에는 인클루드 이름과 줄을 남겨요.',
    hTypeHubs: '필드 타입으로 가장 많이 쓰인 객체', typeHubsHelp: '데이터 요소·도메인처럼 필드 타입(types)으로만 많이 이어진 객체예요. 위 순위에서는 뺐어요.',
    colPkg: '패키지', colLabel: '이름', withTypes: '타입 포함',
    hUsage: '사용 실적', usageHelp: '운영 시스템의 TCode·잡 사용 실적으로 판정했어요. 근거 없음은 미사용이 아니에요(RFC, 워크플로, BAdI 호출은 보이지 않아요).',
    usageName: { direct: '직접 사용', indirect: '간접 사용', unused: '미사용', 'no-evidence': '근거 없음' }, usageShort: { direct: '사용', indirect: '간접', unused: '미사용', 'no-evidence': '?' }, usageNone: '판정 없음',
    fUsage: '사용 실적', fPkgs: '패키지', colorType: '색: 객체 종류', colorPkg: '색: 패키지',
    preset: { business: '업무 관계', ddic: 'DDIC 전체', code: '코드만', all: '전체' },
    presetHelp: { business: '필드 타입(types)을 뺀 모든 관계', ddic: 'DDIC 관계(타입·검사 테이블·서치헬프·값 테이블·행 타입·뷰 기준)', code: '소스에 적힌 관계(INCLUDE·호출·SUBMIT·트랜잭션·읽기·쓰기)', all: '모든 관계' },
    pathAny: '방향 무시', pathOut: '화살표 방향만', pathDirHelp: '경로를 찾을 때 연결 방향을 따를지 정해요', pathAlt: '경로 {n} · {s}단계',
    exportPng: 'PNG', exportCsv: 'CSV',
    includes: '접힌 인클루드', stdChecks: '표준 검사 테이블', stdChecksHelp: '표준 테이블이라 그림에는 그리지 않아요. 필드 → 검사 테이블이에요.',
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
    legendHelp: '속이 빈 원 = 패키지 밖 Z/Y 객체 · 점선 = 추정 · 마우스를 올리면 이웃만 밝아지고 연결 방향이 흘러요 · 휠 = 확대/축소(확대하면 이름이 나와요) · 빈 곳 끌기 = 이동 · 노드 끌기 = 옮기기 · 노드 클릭 = 그 객체 중심으로 · 더블클릭 = 전체 보기',
    typeName: { TABL: '테이블', STRU: '구조', VIEW: '뷰', TTYP: '테이블 타입', DTEL: '데이터 요소', DOMA: '도메인', SHLP: '서치헬프', TRAN: '트랜잭션', PROG: '프로그램', INCL: '인클루드', FUGR: '함수 그룹', FUNC: '함수 모듈', CLAS: '클래스', INTF: '인터페이스', ENQU: '잠금 객체', MSAG: '메시지 클래스' },
    kindName: { types: '필드 → 데이터 요소, 데이터 요소 → 도메인, .INCLUDE', checks: '필드 → 검사 테이블(외래 키)', valueTable: '도메인 → 값 테이블', searchHelp: '필드·데이터 요소 → 서치헬프', rowType: '테이블 타입 → 행 타입', basedOn: '뷰 → 기준 테이블', selects: '서치헬프 → 선택 방법', contains: '묶음 서치헬프 → 하위 서치헬프', include: 'INCLUDE', calls: 'CALL FUNCTION / 메서드 호출', submits: 'SUBMIT', starts: 'CALL TRANSACTION', launches: '트랜잭션 → 프로그램', reads: 'SELECT', writes: 'INSERT / UPDATE / MODIFY / DELETE', uses: 'TYPE REF TO / 클래스 사용' },
  },
  en: {
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
    includes: 'Folded includes', stdChecks: 'Standard check tables', stdChecksHelp: 'Standard tables are not drawn. Field → check table.',
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
    legendHelp: 'Hollow circle = Z/Y object outside the package · dashed = inferred · hover lights the neighbours and runs the direction · wheel = zoom (names appear as you zoom in) · drag the ground = pan · drag a node = move it · click a node = centre on it · double click = fit',
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
    <div class="fl"><b>${esc(T.fKinds)}</b><span id="f-kinds" class="fl"></span></div>
    <div class="fl"><b>${esc(T.fTypes)}</b><span id="f-types" class="fl"></span></div>
    <div class="fl"><b>${esc(T.fBases)}</b><span id="f-bases" class="fl"></span></div>
    <div class="fl" id="f-usage-row"><b>${esc(T.fUsage)}</b><span id="f-usage" class="fl"></span></div>
    <div class="fl" id="f-pkgs-row"><b>${esc(T.fPkgs)}</b><span id="f-pkgs" class="fl"></span></div>
  </details>
  <div id="vinfo"></div>
  <div class="explore"><div class="stage" id="stage"><canvas id="cv"></canvas><div class="zoom"><button id="z-in" title="+">+</button><button id="z-out" title="−">−</button><button id="z-fit" title="fit">⤢</button></div><div id="tip" hidden></div></div><aside id="panel"></aside></div>
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

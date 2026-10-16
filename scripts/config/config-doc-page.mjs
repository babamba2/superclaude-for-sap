// config-to-document — the HTML page (layout, styles, client script).
// Data and drawn screens are embedded (gzip + base64); the page renders
// everything client-side, so one file works offline.

import { gzipSync } from 'zlib';
import { EDITOR_SCRIPT, EDITOR_STYLE, editorLabels } from './config-doc-editor.mjs';

const TEXT = {
  ko: {
    title: (m) => `SAP ${m} 설정 문서`, search: '항목 · T-Code · 뷰 · 테이블 검색', all: '전체', custom: '고객 변경', standard: '표준값',
    empty: '미설정', none: '값 없음', blocked: '읽기 제한', checks: '점검', expand: '모두 펼치기', collapse: '모두 접기', home: '개요',
    ref: '점검 리스트', items: '항목', rows: '행', custRows: '고객 변경 행', tables: '테이블', screen: '화면', values: '설정값',
    history: '변경 이력 (고객 TR)', doc: 'SAP IMG 문서', noDoc: '이 활동에는 SAP 문서가 없습니다.', onlyCust: '고객 변경 행만', colInfo: '컬럼 설명', badi: 'BAdI 고객 구현', badiAll: '이 시스템의 BAdI 고객 구현', badiNone: '고객 구현 없음', badiBlocked: '클래식 BAdI 구현은 읽지 못했습니다 (디스패처 허용 목록).', impl: '구현', kind: '유형', klass: '구현 클래스', activeF: '활성', badiFilter: '필터', changedF: '변경', kinds: { classic: '클래식', enh: 'Enhancement' }, methodF: '메서드', codeF: '코드', doesF: '하는 일', refsF: '호출 객체', readsF: '읽기', writesF: '변경', emptyM: '빈 메서드', linesU: '줄', srcF: '소스 보기', srcErr: '구현 클래스 소스를 읽지 못했습니다', badiDraft: '검토 전', badiFix: '검토 지적 있음', colField: '컬럼', colMeaning: '업무 의미', colF1: 'SAP F1 문서 원문', colVals: '값', colValText: 'SAP 텍스트', colValMeaning: '의미',
    filter: '표 안에서 찾기', noRows: '등록된 항목이 없습니다.', truncated: (n) => `처음 ${n}행만 가져왔습니다.`, prev: '이전', next: '다음',
    request: 'TR', date: '날짜', user: '사용자', text: '내역', struct: '대화 구조', tcode: 'T-Code', objects: '설정 객체',
    statusLegend: '상태', recent: '최근 고객 변경', areas: '영역', checkNone: '점검 결과 문제 없음', checked: (n) => `${n}건 확인`,
    found: (n) => `${n}건`, skipped: '건너뜀', zoom: '크게 보기', zoomIn: '확대', zoomOut: '축소', fit: '화면 맞춤', close: '닫기', lead: (m) => `${m.system} (클라이언트 ${m.client}) · ${m.sapVersion} · ${m.extractedAt.slice(0, 10)} 추출`,
    showAll: (n) => `전체 ${n}행 보기`, custHint: '고객 TR로 바뀐 행', more: (n) => `외 ${n}건`, historyMore: '최근 순으로 20건까지 보여 줍니다.',
    sev: { error: '오류', warn: '경고', info: '정보' }, back: '뒤로',
    notes: '컨설턴트 해설', purpose: '목적', impact: '이 시스템에서의 기능 영향', cautions: '주의사항', refs: '참고',
    rv: { ok: '검토 통과', revised: '검토 의견 반영', open: '검토 의견 미반영', none: '검토 전' }, rvBy: '작성 {c} · 검토 sap-critic',
    refPanel: '참고자료', docOrig: 'SAP IMG 문서 원문 (영어)', sapdocKo: 'SAP 문서 요약', thisSys: '이 시스템', when: '적합한 경우',
    cmp: '설정·운영 차이', checklist: '결정 체크리스트', criteria: '결정 기준', sources: '출처 자료',
    noRef: '이 항목에는 아직 컨설턴트 참고자료가 없습니다. 스킬을 다시 실행할 때 해설 범위에 이 항목을 넣으면 작성됩니다.',
    crit: { rev: '되돌리기', chain: '연쇄 항목', pre: '선행 조건', ind: '산업별 편차', risk: '흔한 실수', s4: 'S/4 · Fiori', auth: '권한 · 조직', mig: '이관 · 인터페이스', rec: '기본 권고' },
  },
  en: {
    title: (m) => `SAP ${m} Configuration`, search: 'Search item · T-code · view · table', all: 'All', custom: 'Customer-changed', standard: 'Standard',
    empty: 'Not set', none: 'No values', blocked: 'Not readable', checks: 'Checks', expand: 'Expand all', collapse: 'Collapse all', home: 'Overview',
    ref: 'Checklist', items: 'items', rows: 'rows', custRows: 'customer rows', tables: 'Tables', screen: 'Screen', values: 'Values',
    history: 'Change history (customer requests)', doc: 'SAP IMG documentation', noDoc: 'No SAP documentation for this activity.', onlyCust: 'Customer rows only', colInfo: 'Column meanings', badi: 'BAdI customer implementations', badiAll: 'Customer BAdI implementations in this system', badiNone: 'No customer implementation', badiBlocked: 'Classic BAdI implementations could not be read (dispatcher allow list).', impl: 'Implementation', kind: 'Kind', klass: 'Class', activeF: 'Active', badiFilter: 'Filter', changedF: 'Changed', kinds: { classic: 'Classic', enh: 'Enhancement' }, methodF: 'Method', codeF: 'Code', doesF: 'What it does', refsF: 'Calls', readsF: 'Reads', writesF: 'Changes', emptyM: 'empty', linesU: 'lines', srcF: 'Show source', srcErr: 'The implementing class source could not be read', badiDraft: 'not reviewed', badiFix: 'review findings open', colField: 'Column', colMeaning: 'Business meaning', colF1: 'SAP F1 documentation', colVals: 'Values', colValText: 'SAP text', colValMeaning: 'Meaning',
    filter: 'Find in table', noRows: 'No entries.', truncated: (n) => `Only the first ${n} rows were read.`, prev: 'Previous', next: 'Next',
    request: 'Request', date: 'Date', user: 'User', text: 'Description', struct: 'Dialog structure', tcode: 'T-code', objects: 'Objects',
    statusLegend: 'Status', recent: 'Recent customer changes', areas: 'Areas', checkNone: 'No findings', checked: (n) => `${n} checked`,
    found: (n) => `${n}`, skipped: 'skipped', zoom: 'Zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit', close: 'Close', lead: (m) => `${m.system} (client ${m.client}) · ${m.sapVersion} · extracted ${m.extractedAt.slice(0, 10)}`,
    showAll: (n) => `Show all ${n} rows`, custHint: 'Row changed by a customer request', more: (n) => `+${n} more`, historyMore: 'Latest 20 shown.',
    sev: { error: 'Error', warn: 'Warning', info: 'Info' }, back: 'Back',
    notes: 'Consultant notes', purpose: 'Purpose', impact: 'Effect in this system', cautions: 'Cautions', refs: 'References',
    rv: { ok: 'Review passed', revised: 'Review findings applied', open: 'Review findings open', none: 'Not reviewed' }, rvBy: 'Written by {c} · reviewed by sap-critic',
    refPanel: 'Reference', docOrig: 'SAP IMG documentation (original)', sapdocKo: 'SAP documentation in short', thisSys: 'This system', when: 'Fits when',
    cmp: 'Setup and operation compared', checklist: 'Decision checklist', criteria: 'Decision criteria', sources: 'Sources',
    noRef: 'No consultant reference for this activity yet. Include it in the notes scope on the next run.',
    crit: { rev: 'Reversibility', chain: 'Linked settings', pre: 'Prerequisites', ind: 'Industry variance', risk: 'Common mistakes', s4: 'S/4 · Fiori', auth: 'Authorisation · org', mig: 'Migration · interfaces', rec: 'Default recommendation' },
  },
};

const CSS = `
:root{--ink:#16324f;--ink2:#4a5d73;--mute:#8a98a8;--line:#d9e0e8;--bg:#f3f6f9;--panel:#fff;--sel:#e3ecf6;--hl:#fff1a8;
--custom:#1f5fa8;--custombg:#e2edf9;--std:#2f6f5e;--stdbg:#e3f1ec;--empty:#8a98a8;--emptybg:#eef2f6;--none:#a9b4c0;--nonebg:#f4f6f8;
--blocked:#b4432a;--blockedbg:#fbe9e4;--warn:#8a6d1f;--warnbg:#f6efd8;--sbw:340px}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif;font-size:14px;line-height:1.55;color:var(--ink);background:var(--bg);display:flex;flex-direction:column;height:100vh;overflow:hidden}
header{height:52px;flex:none;background:var(--ink);color:#fff;display:flex;align-items:center;gap:14px;padding:0 16px}
header h1{font-size:16px;margin:0;font-weight:600}header .sub{font-size:12px;color:#b9c8d8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
header button{background:none;border:1px solid #4b6a8a;color:#fff;border-radius:6px;padding:5px 9px;font:inherit;font-size:12px;cursor:pointer}
#menubtn{display:none}#refbtn{margin-left:auto}
.wrap{flex:1;display:flex;min-height:0}
aside{width:var(--sbw);flex:none;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.search{padding:12px;border-bottom:1px solid var(--line)}
.search input{width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:6px;font:inherit}
.search input:focus{outline:2px solid var(--ink);outline-offset:1px}
.chips{display:flex;gap:5px;margin-top:8px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:2px 9px;font:inherit;font-size:11.5px;cursor:pointer;color:var(--ink2);display:inline-flex;align-items:center;gap:5px}
.chip[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
.chip i{width:7px;height:7px;border-radius:50%;display:inline-block}
.count{font-size:12px;color:var(--mute);margin-top:6px}
.tools{display:flex;gap:10px;padding:6px 12px;border-bottom:1px solid var(--line);font-size:12px}
.tools button{background:none;border:0;color:var(--ink2);cursor:pointer;font:inherit;font-size:12px;padding:0}.tools button:hover{text-decoration:underline}
#tree{flex:1;overflow:auto;padding:6px 8px 20px;min-height:0}
#tree ul{list-style:none;margin:0;padding:0 0 0 12px}#tree>ul{padding:0}
.row{display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;cursor:pointer;user-select:none;font-size:13px;color:var(--ink2)}
.row:hover{background:#eef2f6}.lv0>.row{font-weight:600;color:var(--ink)}
.tw{width:12px;font-size:10px;color:var(--mute);transition:transform .15s;flex:none}
li.open>.row .tw{transform:rotate(90deg)}li:not(.open)>ul{display:none}
.row .cnt{margin-left:auto;font-size:11px;color:var(--mute);background:#eef2f6;border-radius:999px;padding:0 7px;flex:none}
.leaf{display:flex;align-items:baseline;gap:7px;padding:4px 8px;border-radius:6px;font-size:13px;color:var(--ink);cursor:pointer}
.leaf:hover{background:#eef2f6}.leaf.active{background:var(--sel);font-weight:600}.leaf .nb{margin-left:auto;font-size:11px}
.dot{width:7px;height:7px;border-radius:50%;flex:none;align-self:center}
.s-custom{background:var(--custom)}.s-standard{background:var(--std)}.s-empty{background:var(--empty)}.s-none{background:var(--none)}.s-blocked{background:var(--blocked)}
.hidden{display:none!important}mark{background:var(--hl);padding:0}
main{flex:1;overflow:auto;min-width:0;padding:26px 34px 60px}
.detail{max-width:980px}
.crumb{font-size:12.5px;color:var(--ink2);margin-bottom:8px}.crumb span+span::before{content:"›";color:var(--mute);padding:0 7px}
h2{font-size:23px;margin:0 0 4px;line-height:1.3}.en{color:var(--mute);font-size:13px;margin-bottom:12px}
.badge{display:inline-block;padding:3px 10px;border-radius:5px;font-size:12px;font-weight:600;margin-right:6px}
.b-custom{color:var(--custom);background:var(--custombg)}.b-standard{color:var(--std);background:var(--stdbg)}.b-empty{color:var(--empty);background:var(--emptybg)}
.b-none{color:var(--ink2);background:var(--nonebg)}.b-blocked{color:var(--blocked);background:var(--blockedbg)}
.b-error{color:var(--blocked);background:var(--blockedbg)}.b-warn{color:var(--warn);background:var(--warnbg)}.b-info{color:var(--ink2);background:var(--emptybg)}
.tcs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 18px}
.tc{font-family:ui-monospace,Consolas,monospace;font-size:13.5px;font-weight:600;padding:5px 11px;border-radius:6px;background:#eef2f6;color:var(--ink)}
.tc.spro{background:var(--warnbg);color:var(--warn)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px 18px;margin-bottom:14px}
.card h3{margin:0 0 10px;font-size:13px;color:var(--ink2);font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.card h3 .mono{color:var(--mute);font-weight:400}
.kpis{display:flex;gap:22px;flex-wrap:wrap}.kpi b{display:block;font-size:20px}.kpi span{font-size:12px;color:var(--ink2)}
.mono{font-family:ui-monospace,Consolas,monospace;font-size:12.5px}
.mock{border:1px solid var(--line);border-radius:6px;overflow:auto;background:#fafbfc;cursor:zoom-in;max-height:420px}
.mock svg{display:block;max-width:100%;height:auto}
.struct{font-size:13px;margin:0 0 12px;padding:8px 12px;background:#f7f9fb;border:1px solid var(--line);border-radius:6px}
.struct div{padding:2px 0}.struct .act{font-weight:600}
.tblbar{display:flex;gap:10px;align-items:center;margin:10px 0 6px;flex-wrap:wrap;font-size:12.5px}
.tblbar input[type=search]{padding:5px 9px;border:1px solid var(--line);border-radius:6px;font:inherit;font-size:12.5px;min-width:200px}
.tblwrap{overflow:auto;max-height:460px;border:1px solid var(--line);border-radius:6px}
table.vals{border-collapse:collapse;font-size:12.5px;min-width:100%}
table.vals th{position:sticky;top:0;background:#e9eef4;text-align:left;padding:6px 9px;border-bottom:1px solid var(--line);white-space:nowrap;font-weight:600}
table.ci{border:0;background:none;color:var(--custom);cursor:pointer;font-size:12px;padding:0 0 0 4px}#cipop{position:fixed;z-index:30;max-width:min(360px,92vw);background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 6px 24px rgba(22,50,79,.18);padding:10px 12px;font-size:12.5px;display:none}#cipop b{display:block;margin-bottom:4px}#cipop .f1{color:var(--ink2);margin-top:6px;font-size:11.5px}#cipop{max-height:70vh;overflow:auto}table.cv{border-collapse:collapse;width:100%;margin-top:6px;font-size:11.5px}table.cv td,table.cv th{border-bottom:1px solid var(--line);padding:3px 6px;text-align:left;vertical-align:top}table.cv th{background:#f1f4f7;font-weight:600}table.cv td:first-child{font-family:ui-monospace,Consolas,monospace;white-space:nowrap}
.colinfo{margin:8px 0;font-size:12.5px}.colinfo summary{cursor:pointer;color:var(--custom)}.colinfo table{border-collapse:collapse;width:100%;margin-top:6px}.colinfo td,.colinfo th{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}.colinfo td small{display:block;color:var(--mute);font-family:ui-monospace,Consolas,monospace}.colinfo details{margin-top:3px;color:var(--ink2);font-size:11.5px}
.vals th small{display:block;color:var(--mute);font-weight:400;font-family:ui-monospace,Consolas,monospace;font-size:10.5px}
table.vals td{padding:5px 9px;border-bottom:1px solid #eef2f6;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis}
table.vals tr.cust td{background:#eef4fc}table.vals tr.cust td:first-child{box-shadow:inset 3px 0 0 var(--custom)}
table.vals td.k{font-weight:600}
.note{font-size:12px;color:var(--mute);margin-top:6px}
table.hist{border-collapse:collapse;width:100%;font-size:12.5px}
table.hist th{text-align:left;background:#eef2f6;padding:5px 8px;font-weight:600}
tr.bsrc>td{background:#fafbfc}.bsum{margin:4px 0 8px;font-size:12.5px;color:var(--ink)}
table.bm{border-collapse:collapse;width:100%;font-size:12px}table.bm th{text-align:left;background:#f1f4f7;padding:4px 7px;font-weight:600}
table.bm td{padding:4px 7px;border-bottom:1px solid #eef2f6;vertical-align:top}table.bm tr.mempty td{color:var(--mute)}table.bm small{color:var(--mute);margin-right:4px}
table.bm tr.msrc td{border-bottom:1px solid #eef2f6;padding-top:0}table.bm summary{cursor:pointer;color:var(--custom);font-size:11.5px}
pre.src{max-height:360px;overflow:auto;background:#0f1d2b;color:#e6edf3;padding:10px;border-radius:6px;font-size:11.5px;line-height:1.45;white-space:pre;margin:4px 0 0}table.hist td{padding:5px 8px;border-bottom:1px solid #eef2f6;vertical-align:top}
.doc h4{margin:14px 0 6px;font-size:13.5px;padding-bottom:4px;border-bottom:1px solid var(--line)}.doc h4:first-child{margin-top:0}
.doc p{margin:0 0 8px}.doc ul,.doc ol{margin:4px 0 10px;padding-left:22px}.doc li{margin:2px 0}
.chk{border-left:3px solid var(--line);padding:6px 10px;margin:0 0 10px;background:#fbfcfd;border-radius:0 6px 6px 0}
.chk.error{border-color:var(--blocked)}.chk.warn{border-color:var(--warn)}.chk.info{border-color:var(--mute)}
.chk b{font-size:13px}.chk p{margin:4px 0;font-size:12.5px;color:var(--ink2)}.chk ul{margin:4px 0 0;padding-left:18px;font-size:12px}
.navbtns{display:flex;justify-content:space-between;gap:12px;margin-top:22px}
.navbtns button{flex:1;max-width:48%;text-align:left;background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px 14px;font:inherit;cursor:pointer;color:var(--ink)}
.navbtns button:last-child{text-align:right}.navbtns button small{display:block;color:var(--mute);font-size:11px}.navbtns button:disabled{opacity:.4;cursor:default}
.ov h2{margin-bottom:4px}.ov .lead{color:var(--ink2);margin:0 0 20px}
.area{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px 16px;cursor:pointer}
.area:hover{border-color:var(--ink)}.area b{display:block;margin-bottom:6px}.area span{font-size:12px;color:var(--ink2)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:24px}
.bar{display:flex;height:7px;border-radius:4px;overflow:hidden;background:#eef2f6;margin-top:8px}.bar i{display:block;height:100%}
#ref{width:420px;flex:none;background:var(--panel);border-left:1px solid var(--line);overflow:auto;padding:16px}
#ref h3{font-size:14px;margin:0 0 10px}#ref .chk{cursor:pointer}
#ref .tabs{display:flex;gap:6px;margin-bottom:12px}#ref .tabs button{font:inherit;font-size:12.5px;border:1px solid var(--line);background:#fff;border-radius:999px;padding:4px 12px;cursor:pointer;color:var(--ink2)}
#ref .tabs button[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
#ref h4{margin:16px 0 7px;font-size:12.5px;color:var(--ink)}#ref .txt{font-size:12.5px;color:var(--ink2);margin:0}
#ref .vchk{font-size:11.5px;color:var(--mute);display:flex;align-items:center;gap:4px;flex-wrap:wrap}
#ref .case{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:9px;background:#fcfdfe}
#ref .case.this{border-color:var(--custom);box-shadow:inset 3px 0 0 var(--custom)}
#ref .case b{font-size:12.5px;display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap}
#ref .case svg{display:block;max-width:100%;height:auto;margin:2px 0 8px}
#ref .case p{margin:0 0 6px;font-size:12px;color:var(--ink2);line-height:1.5}
#ref .case .when{font-size:11.5px;color:var(--mute);border-top:1px dashed var(--line);padding-top:5px;margin-top:4px}
#ref .mix{font-size:11.5px;color:var(--mute);margin:0 0 10px}
#ref .cmp{width:100%;border-collapse:collapse;font-size:11px;margin:2px 0 10px}
#ref .cmp th{background:#eef2f6;font-weight:600;padding:5px 6px;text-align:left;border:1px solid var(--line)}
#ref .cmp td{padding:5px 6px;border:1px solid var(--line);vertical-align:top;color:var(--ink2);line-height:1.45}
#ref .cmp td:first-child{color:var(--ink);font-weight:600}#ref .crit td:first-child{width:96px;white-space:nowrap}
#ref .crit tr.rec td{background:#e3f1ec;color:#2f6f5e;font-weight:600}
#ref .chklist{font-size:11.5px;color:var(--ink2);margin:0 0 10px;padding-left:16px}#ref .chklist li{margin-bottom:3px}
#ref .rf{border-left:3px solid var(--line);padding:4px 10px;margin:0 0 10px}#ref .rf b{font-size:12px}#ref .rf .src{font-size:11px;color:var(--mute)}
#ref .rf p{margin:4px 0;font-size:11.5px;color:var(--ink2)}#ref .rf a{font-size:11px;word-break:break-all;color:#0a6ed1}
details.card summary{cursor:pointer;font-size:13px;color:var(--ink2);font-weight:600}details.card[open] summary{margin-bottom:10px}
.legend{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--ink2);margin-bottom:14px}.legend span{display:inline-flex;align-items:center;gap:5px}
.lb{position:fixed;inset:0;background:rgba(10,20,32,.86);display:none;flex-direction:column;z-index:50}.lb.on{display:flex}
.lbbar{display:flex;gap:6px;justify-content:flex-end;align-items:center;padding:10px 14px}.lbbar span{color:#fff;font-size:12px;min-width:48px;text-align:center}
.lbbar button{background:#fff;border:0;border-radius:5px;min-width:34px;height:30px;padding:0 9px;font:inherit;font-size:14px;cursor:pointer}
.lbv{flex:1;overflow:auto;display:flex;padding:0 24px 24px;cursor:grab;touch-action:none}.lbv.drag{cursor:grabbing}
.lbc{margin:auto;flex:none;background:#fff;border-radius:6px;line-height:0}.lbc svg,.lbc img{display:block;width:100%;height:100%;user-select:none;-webkit-user-drag:none}
#ref .case .flow{cursor:zoom-in}
.mock.shot img{display:block;max-width:100%;height:auto}
@media (max-width:1300px){#ref{position:fixed;top:52px;right:0;bottom:0;z-index:10;transform:translateX(100%);transition:transform .2s;width:min(440px,92vw)}body.ref-open #ref{transform:none;box-shadow:0 0 0 100vw rgba(22,50,79,.35)}}
@media (max-width:860px){aside{position:fixed;top:52px;bottom:0;left:0;z-index:11;transform:translateX(-100%);transition:transform .2s;width:min(340px,90vw)}body.menu-open aside{transform:none}#menubtn{display:block}main{padding:18px 16px 40px}}
@media (max-width:600px){header{gap:8px;padding:0 10px}header h1{font-size:14px;flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}header .sub{display:none}header button{white-space:nowrap;padding:4px 7px;flex:none}#refbtn{margin-left:0}}
@media print{header,aside,#ref,.navbtns,.tblbar{display:none!important}body{height:auto;overflow:visible;display:block}main{overflow:visible;padding:0}.tblwrap,.mock{max-height:none;overflow:visible}}
`;

// Data and drawings travel gzip-compressed (base64) and are unpacked with the
// browser's DecompressionStream — a full module is ~20 MB as plain JSON.
const SCRIPT = String.raw`
// A browser that cannot run the page (no DecompressionStream, out of memory) shows why instead of a blank page.
const fail=e=>{const m=document.querySelector('main');if(m&&!m.dataset.ready)m.innerHTML='<div style="padding:24px;color:#a33"><b>This browser could not open the document.</b><br>'+String(e&&(e.message||e.reason&&e.reason.message||e.reason)||e).replace(/[<>&]/g,'')+'<br><br>Open it in Chrome, Edge or Safari (iOS 16.4 or later).</div>'};
addEventListener('error',fail);addEventListener('unhandledrejection',fail);
if(typeof DecompressionStream==='undefined')fail('DecompressionStream is not supported');
(async()=>{
const unz=async id=>{const b=atob(document.getElementById(id).textContent.trim());const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return JSON.parse(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text())};
const D=await unz('data');const SV=await unz('svgs');setTimeout(()=>{const m=document.querySelector('main');if(m&&m.innerHTML.trim())m.dataset.ready='1'},0);
const T=D.T;const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let term='',filt='all',cur=null;const order=[];const paths={};const opened=new Set();
const STATUS=['custom','standard','empty','none','blocked'];
function valTable(x){if(!x.v||!x.v.length)return '';const vm=x.vm||{};const hasM=x.v.some(p=>vm[p[0]]);return '<table class="cv"><tr><th>'+esc(T.colVals)+'</th><th>'+esc(T.colValText)+'</th>'+(hasM?'<th>'+esc(T.colValMeaning)+'</th>':'')+'</tr>'+x.v.map(p=>'<tr><td>'+esc(p[0]===''?'␣':p[0])+'</td><td>'+esc(p[1])+'</td>'+(hasM?'<td>'+esc(vm[p[0]]||'')+'</td>':'')+'</tr>').join('')+'</table>'}
const pop=document.createElement('div');pop.id='cipop';document.body.appendChild(pop);
addEventListener('click',e=>{const b=e.target.closest('[data-ci]');if(!b){if(!e.target.closest('#cipop'))pop.style.display='none';return}e.stopPropagation();const x=(D.fields||{})[b.dataset.ci]||{};pop.innerHTML='<b>'+esc(b.dataset.cl)+' <small style="color:var(--mute);font-weight:400">'+esc(b.dataset.ci)+'</small></b>'+esc(x.m||'')+valTable(x)+(x.f1?'<div class="f1">'+esc(T.colF1)+': '+esc(x.f1)+'</div>':'');pop.style.display='block';const r=b.getBoundingClientRect();const w=pop.offsetWidth,h=pop.offsetHeight;pop.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left-20))+'px';pop.style.top=(r.bottom+h+8<innerHeight?r.bottom+6:Math.max(8,r.top-h-6))+'px'},true);
/*EDITOR*/
const checksOf=id=>D.checks.filter(c=>c.items.length&&c.activities.includes(id));
function walk(nodes,path,out){for(const n of nodes){if(n.kind==='activity'){if(!D.acts[n.activity])continue;order.push(n.activity);paths[n.activity]=path;out.push({leaf:n.activity});}else{const kids=[];walk(n.children||[],n.text?[...path,n.text]:path,kids);if(!kids.length)continue;if(!n.text)out.push(...kids);else out.push({text:n.text,en:n.textEn,kids});}}return out}
const TREE=walk(D.tree,[],[]);
const match=a=>{if(filt==='checks'&&!checksOf(a.id).length)return false;if(filt==='notes'&&!(D.notes||{})[a.id])return false;if(!['all','checks','notes'].includes(filt)&&a.status!==filt)return false;if(!term)return true;const h=[a.title,a.titleEn,a.tcode,a.id,...a.viewKeys,...a.tables].join(' ').toLowerCase();return h.includes(term)};
const hl=s=>{s=esc(s);if(!term)return s;const i=s.toLowerCase().indexOf(term);return i<0?s:s.slice(0,i)+'<mark>'+s.slice(i,i+term.length)+'</mark>'+s.slice(i+term.length)};
function renderTree(){let shown=0;const lv=(items,d)=>'<ul>'+items.map(it=>{if(it.leaf){const a=D.acts[it.leaf];if(!match(a))return'';shown++;return '<li><div class="leaf'+(cur===a.id?' active':'')+'" data-id="'+a.id+'"><i class="dot s-'+a.status+'"></i><span>'+hl(a.title)+'</span>'+((D.notes||{})[a.id]?'<span class="nb" title="'+esc(T.refPanel)+'">📎</span>':'')+'</div></li>'}const inner=lv(it.kids,d+1);const n=(inner.match(/class="leaf/g)||[]).length;if(!n)return'';const k=d+':'+it.text;const open=term||filt!=='all'||opened.has(k);return '<li class="lv'+d+(open?' open':'')+'" data-k="'+esc(k)+'"><div class="row"><span class="tw">▶</span><span>'+hl(it.text)+'</span><span class="cnt">'+n+'</span></div>'+inner+'</li>'}).join('')+'</ul>';
$('#tree').innerHTML=lv(TREE,0);$('#count').textContent=shown+' '+T.items;
if(cur){const el=$('#tree .leaf.active');if(el){let p=el.closest('li').parentElement.closest('li');while(p){p.classList.add('open');opened.add(p.dataset.k);p=p.parentElement.closest('li')}}}}
$('#tree').addEventListener('click',e=>{const l=e.target.closest('.leaf');if(l){go(l.dataset.id);document.body.classList.remove('menu-open');return}const r=e.target.closest('.row');if(r){const li=r.parentElement;li.classList.toggle('open');li.classList.contains('open')?opened.add(li.dataset.k):opened.delete(li.dataset.k)}});
$('#q').addEventListener('input',e=>{term=e.target.value.trim().toLowerCase();renderTree()});
document.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',()=>{filt=b.dataset.f;document.querySelectorAll('.chip').forEach(x=>x.setAttribute('aria-pressed',x===b));renderTree()}));
$('#expall').onclick=()=>document.querySelectorAll('#tree li[data-k]').forEach(l=>{l.classList.add('open');opened.add(l.dataset.k)});
$('#colall').onclick=()=>{opened.clear();document.querySelectorAll('#tree li').forEach(l=>l.classList.remove('open'))};
$('#home').onclick=()=>{location.hash='';};
const badge=s=>'<span class="badge b-'+s+'">'+esc(T[s])+'</span>';
function checkHtml(c){const more=c.items.length>12?'<li>'+esc(T.more(c.items.length-12))+'</li>':'';return '<div class="chk '+c.severity+'" data-act="'+esc(c.activities[0]||'')+'"><b><span class="badge b-'+c.severity+'">'+esc(T.sev[c.severity])+'</span>'+esc(c.title)+' · '+esc(T.found(c.items.length))+'</b>'+(c.detail?'<p>'+esc(c.detail)+'</p>':'')+'<ul>'+c.items.slice(0,12).map(i=>'<li class="mono">'+esc(i)+'</li>').join('')+more+'</ul></div>'}
function docHtml(id){const d=D.docs[D.acts[id].docuId];if(!d||!d.blocks.length)return '<p class="note">'+esc(T.noDoc)+'</p>';let h='',list='';const close=()=>{if(list){h+='</'+list+'>';list=''}};for(const b of d.blocks){if(b.t==='li'||b.t==='ol'){const tag=b.t==='li'?'ul':'ol';if(list!==tag){close();h+='<'+tag+'>';list=tag}h+='<li>'+esc(b.text)+'</li>';continue}close();h+=b.t==='h'?'<h4>'+esc(b.text)+'</h4>':'<p>'+esc(b.text)+'</p>'}close();return '<div class="doc">'+h+'</div>'}
// Change history of a view: the customer requests that touched it, or the list edited in edit mode.
function histOf(v){if(v.histList)return v.histList;const trs=(v.history||[]).map(t=>D.transports[t]).filter(Boolean);const req={};for(const t of trs){const r=D.transports[t.request]||t;req[r.trkorr]=r}return Object.values(req).sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(r=>({date:r.date,trkorr:r.trkorr,user:r.user,text:r.text}))}
function histHtml(v){const list=histOf(v);if(!list.length&&!EDIT)return'';const k=v.key;return '<h3 style="margin-top:14px">'+esc(T.history)+' · '+list.length+'</h3><table class="hist"><tr><th>'+T.date+'</th><th>'+T.request+'</th><th>'+T.user+'</th><th>'+T.text+'</th>'+(EDIT?'<th></th>':'')+'</tr>'+(EDIT?list:list.slice(0,20)).map((r,i)=>'<tr>'+FV(k,'h.'+i+'.date',r.date,'td','mono')+FV(k,'h.'+i+'.trkorr',r.trkorr,'td','mono')+FV(k,'h.'+i+'.user',r.user,'td')+FV(k,'h.'+i+'.text',r.text,'td')+(EDIT?'<td><button class="edx" data-vdel="'+esc(k)+'|h.'+i+'" title="'+esc(EL.delRow)+'">✕</button></td>':'')+'</tr>').join('')+'</table>'+(EDIT?'<button class="edadd" data-vadd="'+esc(k)+'|h">'+esc(EL.addRow)+'</button>':list.length>20?'<p class="note">'+esc(T.historyMore)+'</p>':'')}
const FIRST=200;const tblKey={};
function valsHtml(v,i){if(v.error)return '<p class="note">'+esc(v.error)+'</p>';if(!v.rows.length&&!EDIT)return '<p class="note">'+esc(T.noRows)+'</p>';tblKey[i]=v.key;const FD=D.fields||{};const head='<tr>'+v.cols.map(c=>'<th>'+esc(c.label)+(FD[c.de]?'<button class="ci" data-ci="'+esc(c.de)+'" data-cl="'+esc(c.label)+'" aria-label="'+esc(T.colInfo)+'">ⓘ</button>':'')+'<small>'+esc(c.name)+'</small></th>').join('')+(EDIT?'<th></th>':'')+'</tr>';const more=v.rows.length>FIRST?'<button class="chip" data-all="'+i+'">'+esc(T.showAll(v.rows.length))+'</button>':'';const info=v.cols.filter(c=>FD[c.de]);const ci=info.length?'<details class="colinfo"><summary>'+esc(T.colInfo)+' ('+info.length+')</summary><table><tr><th>'+esc(T.colField)+'</th><th>'+esc(T.colMeaning)+'</th></tr>'+info.map(c=>{const x=FD[c.de];return '<tr><td>'+esc(c.label)+'<small>'+esc(c.name)+'</small></td><td>'+esc(x.m||'')+(x.v?'<details><summary>'+esc(T.colVals)+' ('+x.v.length+')</summary>'+valTable(x)+'</details>':'')+(x.f1?'<details><summary>'+esc(T.colF1)+'</summary>'+esc(x.f1)+'</details>':'')+'</td></tr>'}).join('')+'</table></details>':'';return ci+'<div class="tblbar"><input type="search" placeholder="'+esc(T.filter)+'" data-tbl="'+i+'"><label><input type="checkbox" data-cust="'+i+'"> '+esc(T.onlyCust)+' ('+v.cust.length+')</label><span class="note" style="margin:0">'+v.rows.length+' '+T.rows+'</span>'+more+'</div><div class="tblwrap"><table class="vals" id="tbl'+i+'"'+(more?'':' data-full="1"')+'>'+head+rowsHtml(v,FIRST)+'</table></div>'+(EDIT?'<button class="edadd" data-vadd="'+esc(v.key)+'|r">'+esc(EL.addRow)+'</button>':'')+(v.truncated?'<p class="note">'+esc(T.truncated(D.meta.maxRows))+'</p>':'')}
// Large views draw their first rows only; the rest on demand (show all, filter, customer rows).
function fullTable(i){const t=$('#tbl'+i);if(!t||t.dataset.full)return t;const v=D.views[tblKey[i]];t.innerHTML=t.rows[0].outerHTML+rowsHtml(v,Infinity);t.dataset.full='1';const b=$('[data-all="'+i+'"]');if(b)b.remove();return t}
function rowsHtml(v,limit){const custSet=new Set(v.cust);return v.rows.slice(0,limit).map((r,ri)=>'<tr'+(custSet.has(ri)?' class="cust" title="'+esc(T.custHint+': '+((v.trOf||{})[ri]||[]).join(', '))+'"':'')+'>'+r.map((x,ci)=>{const col=v.cols[ci]||{};if(EDIT)return FV(v.key,'r.'+ri+'.'+ci,x,'td',col.key?'k':'');const dom=col.dom;const tx=dom&&D.domains[dom]&&D.domains[dom][x];return '<td'+(col.key?' class="k"':'')+(tx?' title="'+esc(tx)+'"':'')+'>'+esc(x)+(tx?' <span style="color:var(--mute)">· '+esc(tx)+'</span>':'')+'</td>'}).join('')+(EDIT?'<td><button class="edx" data-vdel="'+esc(v.key)+'|r.'+ri+'" title="'+esc(EL.delRow)+'">✕</button></td>':'')+'</tr>').join('')}
// A view's screen: the drawn SM30 screen, or the screenshot that replaced it in edit mode.
function pic(v,key,style){const im=(v.shots||{})[key];const ok=typeof im==='string'&&/^data:image\/(png|jpeg|gif|webp);base64,/.test(im);if(!ok&&!SV[key])return key===v.key?shotTools(v.key,key,false):'';return '<div class="mock'+(ok?' shot':'')+'"'+(style||'')+' data-svg="'+esc(key)+'" title="'+esc(T.zoom)+'">'+(ok?'<img src="'+esc(im)+'" alt="">':SV[key])+'</div>'+shotTools(v.key,key,ok)}
function viewCard(k,i,title){const v=D.views[k];if(!v)return'';const svg=pic(v,k);const det=pic(v,k+'#detail',' style="margin-top:10px"');const stale=v.svgStale&&SV[k]&&!(v.shots||{})[k]?'<p class="note">'+esc(EL.svgStale)+'</p>':'';return '<div class="card"><h3>'+FV(k,'title',v.cardTitle||title||v.title||k)+editedBadge(v)+' <span class="mono">'+esc(k)+(v.root!==k?' · '+esc(v.root):'')+(v.tableTitle?' · '+esc(v.tableTitle):'')+'</span>'+(v.cust.length?'<span class="badge b-custom">'+esc(T.custRows)+' '+v.cust.length+'</span>':'')+'</h3>'+svg+det+stale+valsHtml(v,i)+histHtml(v)+'</div>'}
function badiRows(list){return '<table class="hist"><tr><th>'+esc(T.impl)+'</th><th>'+esc(T.kind)+'</th><th>'+esc(T.klass)+'</th><th>'+esc(T.activeF)+'</th><th>'+esc(T.badiFilter)+'</th><th>'+esc(T.changedF)+'</th></tr>'+list.map(x=>badiImplRow(x)+badiSrcRow(x)).join('')+'</table>'}
function badiImplRow(x){return '<tr><td class="mono">'+esc(x.name)+'</td><td>'+esc(T.kinds[x.kind]||x.kind)+'</td><td class="mono">'+esc(x.class)+'</td><td>'+(x.active?'✔':'—')+'</td><td class="mono">'+esc((x.filters||[]).join(', '))+'</td><td>'+esc([x.user,(d=>d.length===8?d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6):d)(String(x.date||''))].filter(Boolean).join(' · '))+'</td></tr>'}
function badiSrcRow(x){const s=(D.badiSrc||{})[x.class];if(!s)return '';const N=(D.badiNotes||{})[x.name]||{};let h='<tr class="bsrc"><td colspan="6">';if(N.summary)h+='<p class="bsum">'+esc(N.summary)+(N.state==='draft'?' <span class="badge b-warn">'+esc(T.badiDraft)+'</span>':N.state==='fix'?' <span class="badge b-warn">'+esc(T.badiFix)+'</span>':'')+'</p>';if(s.error)h+='<p class="note">'+esc(T.srcErr)+'</p>';if(s.methods.length)h+='<table class="bm"><tr><th>'+esc(T.methodF)+'</th><th>'+esc(T.codeF)+'</th><th>'+esc(T.doesF)+'</th><th>'+esc(T.refsF)+'</th></tr>'+s.methods.map(m=>{const r=m.refs||{};const refs=[['FM',r.fms],[T.readsF,r.reads],[T.writesF,r.writes],['Class',r.classes],['SUBMIT',r.submits],['INCLUDE',r.includes]].filter(p=>p[1]&&p[1].length).map(p=>'<div><small>'+esc(p[0])+'</small>'+p[1].map(esc).join(', ')+'</div>').join('');return '<tr'+(m.empty?' class="mempty"':'')+'><td class="mono">'+esc(m.key)+'</td><td>'+(m.empty?esc(T.emptyM):m.lines+' '+esc(T.linesU))+'</td><td>'+esc((N.methods||{})[m.key]||'')+'</td><td class="mono">'+refs+'</td></tr>'+(m.empty?'':'<tr class="msrc"><td colspan="4"><details><summary>'+esc(T.srcF)+'</summary><pre class="src">'+esc(m.source)+(m.truncated?' …':'')+'</pre>'+inclSrc(s,(m.refs||{}).includes)+'</details></td></tr>')}).join('')+'</table>';return h+'</td></tr>'}
function inclSrc(s,names){const I=s.includes||{},seen=new Set();let h='';const walk=l=>{for(const n of l||[]){if(seen.has(n)||!I[n])continue;seen.add(n);const x=I[n];h+='<div class="note" style="margin-top:8px">INCLUDE '+esc(n)+(x.lines!=null?' · '+x.lines+' '+esc(T.linesU):'')+'</div>'+(x.source?'<pre class="src">'+esc(x.source)+'</pre>':'');walk((x.refs||{}).includes)}};walk(names);return h}
function badiHtml(a){if(!(a.badis||[]).length)return'';const I=D.badiImpls||{},E=D.badiErrors||{};return '<div class="card"><h3>'+esc(T.badi)+'</h3>'+a.badis.map(b=>{const l=I[b]||[];return '<h4 class="mono">'+esc(b)+'</h4>'+(l.length?badiRows(l):'<p class="note">'+esc(E.classic?T.badiBlocked:T.badiNone)+'</p>')}).join('')+'</div>'}
function go(id){location.hash='act='+encodeURIComponent(id)}
function show(id){const a=D.acts[id];if(!a)return home();cur=id;renderTree();const p=paths[id]||[];const idx=order.indexOf(id);let h='<div class="ce-bar">'+esc(EL.hint)+'</div><div class="detail"><div class="crumb">'+p.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div><h2>'+esc(a.title)+'</h2><div class="en">'+esc(a.titleEn||'')+' · <span class="mono">'+esc(a.id)+'</span></div><div>'+badge(a.status)+'</div><div class="tcs"><span class="tc spro">SPRO</span>'+(a.tcode?'<span class="tc">'+esc(a.tcode)+'</span>':'')+a.objects.filter(o=>o.kind==='tcode').map(o=>'<span class="tc">'+esc(o.key)+'</span>').join('')+'</div>';
h+='<div class="card"><div class="kpis"><div class="kpi"><b>'+a.rows+'</b><span>'+T.rows+'</span></div><div class="kpi"><b>'+a.cust+'</b><span>'+T.custRows+'</span></div><div class="kpi"><b>'+a.tables.length+'</b><span>'+T.tables+'</span></div></div>'+(a.tables.length?'<p class="note mono">'+esc(a.tables.join(', '))+'</p>':'')+'</div>';
const nt=(D.notes||{})[id];if(nt){const ul=(k)=>EDIT||nt[k]&&nt[k].length?'<h4>'+esc(T[k])+'</h4>'+FL(k,nt[k]):'';const rc=nt.review==='ok'||nt.review==='revised'?'b-standard':nt.review==='open'?'b-warn':'b-none';h+='<div class="card"><h3>'+esc(T.notes)+'<span class="badge '+rc+'">'+esc(T.rv[nt.review]||T.rv.none)+'</span>'+editedBadge(nt)+'<span class="mono">'+esc(T.rvBy.replace('{c}','sap-'+String(D.meta.module).toLowerCase()+'-consultant'))+'</span></h3><div class="doc"><h4>'+esc(T.purpose)+'</h4>'+F('purpose',nt.purpose,'p')+ul('impact')+ul('cautions')+ul('refs')+(nt.issues&&nt.issues.length?'<div class="chk warn"><b>'+esc(T.rv.open)+'</b><ul>'+nt.issues.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':'')+'</div></div>'}else if(EDIT)h+='<div class="card"><h3>'+esc(T.notes)+'</h3><button class="edadd" data-newnote="1">'+esc(EL.newNote)+'</button></div>';
h+=badiHtml(a);
const cs=checksOf(id);if(cs.length)h+='<div class="card"><h3>'+esc(T.checks)+'</h3>'+cs.map(c=>checkHtml(c.id==='READ-BLOCKED'?{...c,items:[c.items[c.activities.indexOf(id)]]}:c)).join('')+'</div>';
let i=0;for(const o of a.objects){if(o.kind==='cluster'){h+='<div class="card"><h3>'+esc(o.title)+' <span class="mono">'+esc(o.key)+'</span></h3><div class="struct"><b>'+esc(T.struct)+'</b>'+o.members.map(m=>'<div style="padding-left:'+((m.level-1)*16)+'px" class="'+(m.start?'act':'')+'">▸ '+esc(m.title||m.view)+' <span class="mono" style="color:var(--mute)">'+esc(m.view)+'</span></div>').join('')+'</div></div>';for(const m of o.members)h+=viewCard(m.view,i++,m.title)}else if(o.kind==='view'||o.kind==='table')h+=viewCard(o.key,i++,a.title)}
h+='<details class="card"><summary>'+esc(T.docOrig)+'</summary>'+docHtml(id)+'</details>';
const pv=order[idx-1],nx=order[idx+1];h+='<div class="navbtns"><button '+(pv?'data-go="'+esc(pv)+'"':'disabled')+'><small>'+T.prev+'</small>'+(pv?esc(D.acts[pv].title):'')+'</button><button '+(nx?'data-go="'+esc(nx)+'"':'disabled')+'><small>'+T.next+'</small>'+(nx?esc(D.acts[nx].title):'')+'</button></div></div>';
$('#main').innerHTML=h;$('#main').scrollTop=0;renderRef()}
function home(){cur=null;renderTree();renderRef();const cnt=s=>Object.values(D.acts).filter(a=>a.status===s).length;const total=Object.keys(D.acts).length;
let h='<div class="ov detail"><h2>'+esc(T.title(D.meta.module))+'</h2><p class="lead">'+esc(T.lead(D.meta))+'</p><div class="card"><div class="kpis"><div class="kpi"><b>'+total+'</b><span>IMG '+T.items+'</span></div>'+STATUS.map(s=>'<div class="kpi"><b>'+cnt(s)+'</b><span><i class="dot s-'+s+'" style="display:inline-block;margin-right:5px"></i>'+esc(T[s])+'</span></div>').join('')+'</div></div><h3>'+esc(T.areas)+'</h3><div class="grid">';
for(const a of TREE.filter(x=>!x.leaf)){const ids=[];const col=n=>n.leaf?ids.push(n.leaf):n.kids.forEach(col);col(a);const c=s=>ids.filter(i=>D.acts[i].status===s).length;h+='<div class="area" data-area="'+esc(a.text)+'"><b>'+esc(a.text)+'</b><span>'+ids.length+' '+T.items+' · '+esc(T.custom)+' '+c('custom')+'</span><div class="bar">'+STATUS.map(s=>'<i class="s-'+s+'" style="width:'+(100*c(s)/Math.max(1,ids.length))+'%"></i>').join('')+'</div></div>'}
h+='</div>';const recent=Object.values(D.transports).filter(t=>t.request===t.trkorr).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,15);
{const I=D.badiImpls||{};const rows=[];for(const ac of Object.values(D.acts))for(const b of ac.badis||[])for(const x of I[b]||[])rows.push({ac,b,x});if(rows.length)h+='<div class="card"><h3>'+esc(T.badiAll)+' · '+rows.length+'</h3><table class="hist"><tr><th>BAdI</th><th>'+esc(T.impl)+'</th><th>'+esc(T.kind)+'</th><th>'+esc(T.activeF)+'</th><th>IMG</th></tr>'+rows.map(r=>'<tr><td class="mono">'+esc(r.b)+'</td><td class="mono">'+esc(r.x.name)+'</td><td>'+esc(T.kinds[r.x.kind]||r.x.kind)+'</td><td>'+(r.x.active?'✔':'—')+'</td><td><a href="#" data-go="'+esc(r.ac.id)+'">'+esc(r.ac.title)+'</a></td></tr>').join('')+'</table></div>'}
if(recent.length)h+='<div class="card"><h3>'+esc(T.recent)+'</h3><table class="hist"><tr><th>'+T.date+'</th><th>'+T.request+'</th><th>'+T.user+'</th><th>'+T.text+'</th></tr>'+recent.map(r=>'<tr><td class="mono">'+esc(r.date)+'</td><td class="mono">'+esc(r.trkorr)+'</td><td>'+esc(r.user)+'</td><td>'+esc(r.text)+'</td></tr>').join('')+'</table></div>';
$('#main').innerHTML=h+'</div>';$('#main').scrollTop=0}
$('#main').addEventListener('click',e=>{const g=e.target.closest('[data-go]');if(g){e.preventDefault();return go(g.dataset.go)}const al=e.target.closest('[data-all]');if(al)return fullTable(al.dataset.all);const m=e.target.closest('.mock');if(m)return openLb(m.classList.contains('shot')?m.innerHTML:SV[m.dataset.svg]||'');const ar=e.target.closest('.area');if(ar){term='';$('#q').value='';renderTree();document.querySelectorAll('#tree .lv0').forEach(l=>{if(l.querySelector('.row span:nth-child(2)').textContent===ar.dataset.area)l.classList.add('open')})}});
$('#main').addEventListener('input',e=>{const i=e.target.dataset.tbl??e.target.dataset.cust;if(i==null)return;const t=fullTable(i);const q=$('[data-tbl="'+i+'"]').value.trim().toLowerCase();const only=$('[data-cust="'+i+'"]').checked;t.querySelectorAll('tr').forEach((r,ri)=>{if(!ri)return;r.classList.toggle('hidden',(only&&!r.classList.contains('cust'))||(q&&!r.textContent.toLowerCase().includes(q)))})});
// Lightbox: a drawing opens fitted to the window; the wheel, the bar buttons and + - 0 zoom
// around the pointer, dragging pans, a double click toggles fit and 2x, Esc or the backdrop closes.
let lbW=0,lbH=0,lbZ=1,lbFit=1,lbDrag=null,lbMoved=false;
function lbZoom(z,cx,cy){const v=$('#lbv'),c=$('#lbc'),r=c.getBoundingClientRect(),vr=v.getBoundingClientRect();if(cx==null){cx=vr.left+vr.width/2;cy=vr.top+vr.height/2}
const px=r.width?(cx-r.left)/r.width:.5,py=r.height?(cy-r.top)/r.height:.5;lbZ=Math.min(lbFit*8,Math.max(lbFit/4,z));c.style.width=lbW*lbZ+'px';c.style.height=lbH*lbZ+'px';
const r2=c.getBoundingClientRect();v.scrollLeft+=r2.left+px*r2.width-cx;v.scrollTop+=r2.top+py*r2.height-cy;$('#lbpct').textContent=Math.round(lbZ*100)+'%'}
async function openLb(html){const c=$('#lbc');c.innerHTML=html;const el=c.firstElementChild;if(!el)return;$('#lb').classList.add('on');
if(el.tagName.toLowerCase()==='img'){await el.decode().catch(()=>{});lbW=el.naturalWidth;lbH=el.naturalHeight}
else{const n=a=>{const s=el.getAttribute(a)||'';return /%/.test(s)?0:parseFloat(s)||0};const vb=(el.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
lbW=n('width')||vb[2]||800;lbH=n('height')||vb[3]||600;if(!el.getAttribute('viewBox'))el.setAttribute('viewBox','0 0 '+lbW+' '+lbH)}
const v=$('#lbv');lbFit=Math.min((v.clientWidth-48)/lbW,(v.clientHeight-24)/lbH,4);c.style.width=c.style.height='';lbZoom(lbFit)}
const closeLb=()=>{$('#lb').classList.remove('on');$('#lbc').innerHTML=''};
$('#lb').addEventListener('click',e=>{const b=e.target.closest('[data-z]');if(b){const z=b.dataset.z;return z==='x'?closeLb():lbZoom(z==='fit'?lbFit:lbZ*(z==='+'?1.25:0.8))}if(!lbMoved&&(e.target.id==='lb'||e.target.id==='lbv'))closeLb()});
$('#lbv').addEventListener('wheel',e=>{e.preventDefault();lbZoom(lbZ*Math.exp(-e.deltaY*0.0015),e.clientX,e.clientY)},{passive:false});
$('#lbv').addEventListener('pointerdown',e=>{if(e.button)return;const v=$('#lbv');lbDrag={x:e.clientX,y:e.clientY,l:v.scrollLeft,t:v.scrollTop};lbMoved=false;v.setPointerCapture(e.pointerId)});
$('#lbv').addEventListener('pointermove',e=>{if(!lbDrag)return;const dx=e.clientX-lbDrag.x,dy=e.clientY-lbDrag.y;if(Math.abs(dx)+Math.abs(dy)>4){lbMoved=true;$('#lbv').classList.add('drag')}$('#lbv').scrollLeft=lbDrag.l-dx;$('#lbv').scrollTop=lbDrag.t-dy});
$('#lbv').addEventListener('pointerup',()=>{lbDrag=null;$('#lbv').classList.remove('drag')});
$('#lbc').addEventListener('dblclick',e=>lbZoom(Math.abs(lbZ-lbFit)<.01?lbFit*2:lbFit,e.clientX,e.clientY));
document.addEventListener('keydown',e=>{if(!$('#lb').classList.contains('on'))return;const k=e.key;if(k==='Escape')closeLb();else if(k==='+'||k==='=')lbZoom(lbZ*1.25);else if(k==='-')lbZoom(lbZ*0.8);else if(k==='0')lbZoom(lbFit);else return;e.preventDefault()});
// Right panel: the activity's reference material (consultant-written, reviewed) on a detail
// page, the module checklist on the overview; tabs switch between the two.
let refTab='ref';
$('#ref').addEventListener('click',e=>{const t=e.target.closest('[data-tab]');if(t){refTab=t.dataset.tab;return renderRef()}const c=e.target.closest('.chk');if(c&&c.dataset.act){go(c.dataset.act);document.body.classList.remove('ref-open')}const f=e.target.closest('.flow');if(f)openLb(f.innerHTML)});
$('#refbtn').onclick=()=>document.body.classList.toggle('ref-open');$('#menubtn').onclick=()=>document.body.classList.toggle('menu-open');
const found=D.checks.filter(c=>c.items.length).sort((a,b)=>['error','warn','info'].indexOf(a.severity)-['error','warn','info'].indexOf(b.severity));
function checklistHtml(){return '<div class="legend">'+STATUS.map(s=>'<span><i class="dot s-'+s+'"></i>'+esc(T[s])+'</span>').join('')+'</div>'+(found.length?found.map(checkHtml).join(''):'<p class="note">'+esc(T.checkNone)+'</p>')+D.checks.filter(c=>c.skipped).map(c=>'<p class="note">'+esc(c.id)+' '+esc(T.skipped)+': '+esc(c.skipped)+'</p>').join('')}
function refHtml(id){const n=(D.notes||{})[id];if(!n||!EDIT&&!(n.sapdoc||n.cases||n.sources&&n.sources.length))return '<p class="note">'+esc(T.noRef)+'</p>';let h='';
const rc=n.review==='ok'||n.review==='revised'?'b-standard':n.review==='open'?'b-warn':'b-none';h+='<div class="vchk"><span class="badge '+rc+'">'+esc(T.rv[n.review]||T.rv.none)+'</span>'+editedBadge(n)+esc(T.rvBy.replace('{c}','sap-'+String(D.meta.module).toLowerCase()+'-consultant'))+'</div>';
if(n.sapdoc||EDIT)h+='<h4>'+esc(T.sapdocKo)+'</h4>'+F('sapdoc',n.sapdoc,'p','txt');
const C=n.cases;if(C&&C.list.length){h+=F('cases.title',C.title,'h4')+C.list.map((c,i)=>{const yes=/^(yes|예|해당)/i.test(c.thisSystem||'');const P='cases.list.'+i+'.';return '<div class="case'+(yes?' this':'')+'"><b>'+F(P+'title',c.title)+(yes?'<span class="badge b-custom">'+esc(T.thisSys)+'</span>':'')+'</b>'+(c.svg?'<div class="flow" title="'+esc(T.zoom)+'">'+c.svg+'</div>':'')+F(P+'desc',c.desc,'p')+(c.when||EDIT?'<div class="when">'+esc(T.when)+' — '+F(P+'when',c.when)+'</div>':'')+(EDIT?'<div class="when">'+esc(T.thisSys)+': '+F(P+'thisSystem',c.thisSystem)+'</div>':c.thisSystem?'<div class="when">'+esc(T.thisSys)+': '+esc(c.thisSystem.replace(/^(yes|no|예|아니오)\s*[—–-]?\s*/i,''))+'</div>':'')+'</div>'}).join('');if(n.mix||EDIT)h+=F('mix',n.mix,'p','mix')}
if(n.compare&&n.compare.length>1)h+='<h4>'+esc(T.cmp)+'</h4><table class="cmp"><tr>'+n.compare[0].map((x,c)=>F('compare.0.'+c,x,'th')).join('')+'</tr>'+n.compare.slice(1).map((r,ri)=>'<tr>'+r.map((x,c)=>F('compare.'+(ri+1)+'.'+c,x,'td')).join('')+'</tr>').join('')+'</table>';
if(EDIT||n.checklist&&n.checklist.length)h+='<h4>'+esc(T.checklist)+'</h4>'+FL('checklist',n.checklist,'chklist');
const cr=n.criteria||{};const ck=Object.keys(T.crit).filter(k=>EDIT||cr[k]);if(ck.length)h+='<h4>'+esc(T.criteria)+'</h4><table class="cmp crit">'+ck.map(k=>'<tr'+(k==='rec'?' class="rec"':'')+'><td>'+esc(T.crit[k])+'</td>'+F('criteria.'+k,cr[k]||'','td')+'</tr>').join('')+'</table>';
if(n.sources&&n.sources.length)h+='<h4>'+esc(T.sources)+'</h4>'+n.sources.map((s,i)=>'<div class="rf"><b>'+F('sources.'+i+'.title',s.title)+'</b>'+(EDIT?'<button class="edx" data-del="sources.'+i+'" title="'+esc(EL.del)+'">✕</button>':'')+'<div class="src">'+esc(s.source)+'</div>'+(s.summary||EDIT?F('sources.'+i+'.summary',s.summary,'p'):'')+(/^https?:\/\//.test(s.url)?'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.url)+'</a>':'')+'</div>').join('');
return h}
function renderRef(){const tabs='<div class="tabs"><button data-tab="ref" aria-pressed="'+(refTab==='ref')+'">'+esc(T.refPanel)+'</button><button data-tab="chk" aria-pressed="'+(refTab==='chk')+'">'+esc(T.ref)+' '+found.length+'</button></div>';$('#ref').innerHTML=tabs+(refTab==='chk'||!cur?checklistHtml():refHtml(cur))}
const route=()=>{const m=/act=([^&]+)/.exec(location.hash);m?show(decodeURIComponent(m[1])):home()};window.addEventListener('hashchange',route);route();
})();
`;

const packed = (v) => gzipSync(Buffer.from(JSON.stringify(v), 'utf8'), { level: 9 }).toString('base64');

export function pageHtml(data, svgs) {
  const T = TEXT[data.lang] || TEXT.en;
  const clientT = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, typeof v === 'function' ? undefined : v]).filter(([, v]) => v !== undefined));
  const EL = editorLabels(data.lang);
  const title = T.title(data.meta.module);
  const fn = `T.title=${T.title.toString()};T.truncated=${T.truncated.toString()};T.lead=${T.lead.toString()};T.checked=${T.checked.toString()};T.found=${T.found.toString()};T.more=${T.more.toString()};T.showAll=${T.showAll.toString()};`;
  const chips = ['all', 'custom', 'standard', 'empty', 'none', 'blocked', 'checks', 'notes']
    .map((f) => `<button class="chip" data-f="${f}" aria-pressed="${f === 'all'}">${['all', 'checks', 'notes'].includes(f) ? '' : `<i class="s-${f}"></i>`}${f === 'notes' ? `📎 ${T.refPanel}` : T[f]}</button>`).join('');
  return `<!doctype html>
<html lang="${data.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ${data.meta.system}</title><style>${CSS}${EDITOR_STYLE}</style></head>
<body>
<header><button id="menubtn">☰</button><h1>${title}</h1><span class="sub">${T.lead(data.meta)}</span><button id="refbtn">${T.refPanel}</button><button id="ce-undo">${EL.undo}</button><button id="ce-save">${EL.save}</button><button id="ce-edit">${EL.edit}</button></header>
<div class="wrap">
<aside><div class="search"><input id="q" type="search" placeholder="${T.search}"><div class="chips">${chips}</div><div class="count" id="count"></div></div>
<div class="tools"><button id="expall">${T.expand}</button><button id="colall">${T.collapse}</button><button id="home">${T.home}</button></div>
<div id="tree"></div></aside>
<main id="main"></main>
<section id="ref"></section>
</div>
<div class="lb" id="lb"><div class="lbbar"><button data-z="-" title="${T.zoomOut}">−</button><span id="lbpct"></span><button data-z="+" title="${T.zoomIn}">+</button><button data-z="fit">${T.fit}</button><button data-z="x" title="${T.close}">×</button></div><div class="lbv" id="lbv"><div class="lbc" id="lbc"></div></div></div>
<script type="application/octet-stream" id="data">${packed({ ...data, edits: undefined, T: clientT, EL })}</script>
<script type="application/json" id="config-edits">${JSON.stringify(data.edits || {}).replace(/</g, '\\u003c')}</script>
<script type="application/octet-stream" id="svgs">${packed(svgs)}</script>
<script>${SCRIPT.replace('const T=D.T;', `const T=D.T;${fn}`).replace('/*EDITOR*/', () => EDITOR_SCRIPT)}</script>
</body></html>
`;
}

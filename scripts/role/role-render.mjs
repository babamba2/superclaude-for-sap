// sc4sap:role-matrix — the sheets as HTML. Isomorphic: the build draws the page with it, and the edit mode in the
// browser redraws a sheet with the same functions after every change.
//
// Every editable cell is <td data-c="<column key>"> inside <tr data-i="<row index>"> inside <table data-s="<sheet>">;
// the column definitions (SHEETS / sheetColumns) tell the editor how to edit it (text, number, list, level, X).

import { arr, deriveView, LEVELS, ROLE_TYPES, TROLE_STATUS, APPROVAL, RISK, SOD_STATUS, MODULES, ORG_LEVELS } from './role-model.mjs';

export const fmtL = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => o[k]);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LABELS = {
  ko: {
    title: 'SAP 권한 매트릭스 (Role Matrix)',
    tabs: { cover: '표지', broles: '1.업무역할', troles: '2.기술역할', tcodes: '3.역할-TCode', users: '4.사용자-역할', auths: '5.권한객체', sod: '6.SoD점검', revisions: '7.변경이력' },
    heads: {
      broles: ['1. 업무역할(Business Role) 정의', '업무 관점의 역할입니다. 업무역할 ID는 3.역할-TCode, 4.사용자-역할 시트의 열이 됩니다.'],
      troles: ['2. 기술역할(SAP PFCG Role) 정의', 'PFCG에 만들 역할입니다. Derived 역할은 상위(Master) 역할과 조직 값을 적습니다.'],
      tcodes: ['3. 업무역할 × T-Code 권한 매트릭스', '칸 값: F=전체, C=변경, D=조회, 공란=권한 없음. 편집 모드에서 칸을 누르면 넣을 값을 고를 수 있습니다.'],
      users: ['4. 사용자 × 업무역할 배정', '배정할 업무역할에 X. 기술역할은 1.업무역할의 매핑에 따라 BC 담당이 PFCG에서 부여합니다.'],
      auths: ['5. 기술역할별 권한객체(Authorization Object) 상세', 'PFCG 반영 기준. 실제 값은 SU24 제안값과 단위테스트(SU53) 결과로 확정합니다.'],
      sod: ['6. 직무분리(SoD) 점검', '함께 부여하면 안 되는 역할 조합입니다. 4.사용자-역할 배정을 자동으로 점검합니다.'],
      revisions: ['7. 문서 변경 이력', ''],
    },
    cover: { info: '■ 문서 정보', sheets: '■ 시트 구성', legend: '■ 표기 규칙', summary: '■ 현황 요약 (자동 계산)', checks: '■ 점검 결과', noChecks: '점검할 항목이 없습니다.',
      fields: { project: '프로젝트명', system: '대상 시스템 / 모듈', author: '작성자 / 소속', date: '작성일', version: '문서 버전', reviewer: '검토자 / 승인자', source: '원천' },
      sheetRows: [['broles', '업무 관점의 역할 정의 — 누가 어떤 업무를 하는가', '현업 PI / 모듈 담당', '요구사항 분석'], ['troles', 'PFCG 역할 정의 — Single/Composite/Derived, 조직레벨', 'BC(권한) 담당', '설계'],
        ['tcodes', '업무역할 × T-Code 매트릭스 — 핵심 산출물 (F/C/D)', '모듈 담당 + 현업 확인', '설계 ~ 테스트'], ['users', '사용자 × 업무역할 배정 — 실제 ID 부여 기준', '현업 부서장 확정', '이관 전'],
        ['auths', '기술역할별 권한객체·필드·값 (PFCG 반영 기준)', 'BC(권한) 담당', '개발'], ['sod', '직무분리 충돌 역할 조합 점검과 완화 통제', '보안 / 감사 담당', '설계·운영'], ['revisions', '문서 변경 이력', '작성자', '수시']],
      sheetCols: ['시트', '목적', '작성 주체', '작성 시점'],
      legendRows: [['F', 'Full — 생성·변경·삭제·조회 (ACTVT 01/02/03/06 등)'], ['C', 'Change — 변경·조회 (ACTVT 02/03)'], ['D', 'Display — 조회 전용 (ACTVT 03)'], ['(공란)', '권한 없음'], ['X', '4.사용자-역할: 해당 업무역할 배정'], ['추정', 'SAP에서 읽은 권한값으로 수준(F/C/D)을 추정한 칸 — 확인 필요']],
      sum: { broles: '업무역할 수', troles: '기술역할 수', tcodes: '매트릭스 T-Code 수', users: '사용자 수', auths: '권한객체 행 수', sod: 'SoD 규칙 수', sodBroken: 'SoD 위반 규칙 수' },
      mode: { new: '신규 설계', sap: 'SAP 연동' } },
    cols: {
      no: 'No', id: '업무역할 ID', name: '업무역할명(국문)', nameEn: '업무역할명(영문)', module: '모듈', desc: '역할 설명', tasks: '주요 업무(요약)', org: '담당 조직 / 직무', troles: '매핑 기술역할 ID', users: '예상 사용자수', note: '비고', tcN: 'T-Code 수', userN: '배정 사용자',
      tid: '기술역할 ID', tdesc: '역할명(설명)', bname: '업무역할명', bdesc: '업무역할 설명', type: '역할 유형', parent: '상위(Master) 역할', brole: '업무역할 ID', orgLevel: '조직 레벨', orgValue: '조직 값', owner: 'Role Owner', status: '상태', children: '구성 역할',
      area: '업무영역', tcode: 'T-Code', text: 'T-Code 명', roleN: '권한부여 역할 수',
      empNo: '사번', uid: '사용자 ID', uname: '성명', dept: '부서', pos: '직위/직무', plant: 'Plant', assigned: '배정 역할 수', approval: '부서장 승인', sodWarn: 'SoD', valid: '유효기간',
      trole: '기술역할 ID', object: '권한객체', objText: '권한객체 설명', field: '필드', fieldText: '필드 설명', value: '값',
      sid: '충돌 ID', a: '역할 A', b: '역할 B', kind: '충돌 유형', risk: '위험 내용', level: '위험도', mitigation: '완화 통제', approver: '승인자', sodUsers: '위반 사용자', inherent: '역할 자체 충돌',
      ver: '버전', date: '일자', author: '작성자', change: '변경 내용' },
    pager: { range: '{a}–{b} / {n}행', of: '전체 {n}행', page: '{p} / {n}쪽', cols: '역할 열 {a}–{b} / {n}', fOn: '필터 {n}개', fClear: '필터 모두 해제', filter: '필터', fAny: '있음', fNone: '공란', fPicked: '{n}개 선택', fType: '포함 검색' },
    foot: { tcAll: '역할별 T-Code 수', F: '└ F(전체)', C: '└ C(변경)', D: '└ D(조회)', users: '역할별 배정 사용자 수' },
    enums: { type: Object.fromEntries(ROLE_TYPES.map((t) => [t, t])), status: { design: '설계', build: '개발', unit: '단위테스트', integration: '통합테스트', live: '운영이관', retired: '폐기' },
      approval: { pending: '대기', approved: '승인', rejected: '반려' }, sodStatus: { open: '확인중', mitigated: '완화적용', accepted: '승인(수용)', resolved: '해소' }, level: { H: 'H', M: 'M', L: 'L' } },
    checks: { dupBrole: '업무역할 ID 중복', dupTrole: '기술역할 ID 중복', dupTcode: 'T-Code 중복 행', noTrole: '매핑된 기술역할 없음', unknownTrole: '2.기술역할에 없는 기술역할', noTcode: 'T-Code가 하나도 없는 업무역할',
      noParent: 'Derived인데 상위 역할 없음', parentNotListed: '상위 역할이 2.기술역할에 없음', unknownBrole: '1.업무역할에 없는 업무역할', tcodeNoRole: '어느 역할에도 없는 T-Code', userNoRole: '배정 역할 없는 사용자',
      dupUser: '여러 행이 같은 사용자 ID를 씀 (공용 ID)', authUnknownTrole: '2.기술역할에 없는 기술역할의 권한객체', sodUsers: 'SoD 위반 사용자', sodInherent: '한 역할 안에 충돌하는 T-Code' },
    sev: { err: '오류', warn: '주의', info: '참고' }, guess: '추정', none: '없음',
  },
  en: {
    title: 'SAP role matrix',
    tabs: { cover: 'Cover', broles: '1.Business roles', troles: '2.Technical roles', tcodes: '3.Role × T-code', users: '4.User × role', auths: '5.Auth objects', sod: '6.SoD', revisions: '7.History' },
    heads: {
      broles: ['1. Business roles', 'Roles from the business view. Their IDs are the columns of sheets 3 and 4.'],
      troles: ['2. Technical roles (PFCG)', 'Roles to build in PFCG. Derived roles name their master role and organizational values.'],
      tcodes: ['3. Business role × T-code matrix', 'F = full, C = change, D = display, blank = none. In edit mode a click offers the values to choose from.'],
      users: ['4. User × business role', 'Mark the business roles to assign with X. Basis assigns the technical roles mapped in sheet 1.'],
      auths: ['5. Authorization objects per technical role', 'What goes into PFCG. Final values come from SU24 proposals and unit tests (SU53).'],
      sod: ['6. Segregation of duties', 'Role pairs one user must not hold together. Sheet 4 is checked automatically.'],
      revisions: ['7. Change history', ''],
    },
    cover: { info: '■ Document', sheets: '■ Sheets', legend: '■ Legend', summary: '■ Summary (computed)', checks: '■ Checks', noChecks: 'Nothing to check.',
      fields: { project: 'Project', system: 'System / module', author: 'Author / team', date: 'Date', version: 'Version', reviewer: 'Reviewer / approver', source: 'Source' },
      sheetRows: [['broles', 'Business roles — who does what', 'Business PI / module consultant', 'Requirements'], ['troles', 'PFCG roles — single / composite / derived, org levels', 'Basis (security)', 'Design'],
        ['tcodes', 'Business role × T-code matrix — the core deliverable (F/C/D)', 'Module consultant + business', 'Design to test'], ['users', 'User × business role — basis of user provisioning', 'Department heads', 'Before go-live'],
        ['auths', 'Authorization objects, fields, values per technical role', 'Basis (security)', 'Build'], ['sod', 'Conflicting role pairs and mitigating controls', 'Security / audit', 'Design, operation'], ['revisions', 'Change history', 'Author', 'Any time']],
      sheetCols: ['Sheet', 'Purpose', 'Owner', 'When'],
      legendRows: [['F', 'Full — create, change, delete, display (ACTVT 01/02/03/06 …)'], ['C', 'Change — change, display (ACTVT 02/03)'], ['D', 'Display only (ACTVT 03)'], ['(blank)', 'No access'], ['X', 'Sheet 4: business role assigned'], ['guess', 'Level derived from the authorization values read from SAP — please confirm']],
      sum: { broles: 'Business roles', troles: 'Technical roles', tcodes: 'T-codes in the matrix', users: 'Users', auths: 'Authorization rows', sod: 'SoD rules', sodBroken: 'SoD rules broken' },
      mode: { new: 'New design', sap: 'Read from SAP' } },
    cols: {
      no: 'No', id: 'Business role ID', name: 'Name', nameEn: 'Name (English)', module: 'Module', desc: 'Description', tasks: 'Main tasks', org: 'Organization / job', troles: 'Technical roles', users: 'Expected users', note: 'Note', tcN: 'T-codes', userN: 'Users assigned',
      tid: 'Technical role ID', tdesc: 'Description', bname: 'Business role name', bdesc: 'Business role description', type: 'Type', parent: 'Master role', brole: 'Business role', orgLevel: 'Org level', orgValue: 'Org value', owner: 'Role owner', status: 'Status', children: 'Contains',
      area: 'Area', tcode: 'T-code', text: 'T-code text', roleN: 'Roles',
      empNo: 'Employee no.', uid: 'User ID', uname: 'Name', dept: 'Department', pos: 'Position', plant: 'Plant', assigned: 'Roles', approval: 'Approval', sodWarn: 'SoD', valid: 'Valid',
      trole: 'Technical role', object: 'Auth object', objText: 'Object text', field: 'Field', fieldText: 'Field text', value: 'Value',
      sid: 'Conflict ID', a: 'Role A', b: 'Role B', kind: 'Conflict type', risk: 'Risk', level: 'Level', mitigation: 'Mitigating control', approver: 'Approver', sodUsers: 'Users in conflict', inherent: 'Conflict inside a role',
      ver: 'Version', date: 'Date', author: 'Author', change: 'Change' },
    pager: { range: '{a}–{b} of {n} rows', of: '{n} in all', page: 'page {p} of {n}', cols: 'role columns {a}–{b} of {n}', fOn: '{n} filter(s)', fClear: 'Clear filters', filter: 'Filter', fAny: 'any', fNone: 'blank', fPicked: '{n} picked', fType: 'contains' },
    foot: { tcAll: 'T-codes per role', F: '└ F (full)', C: '└ C (change)', D: '└ D (display)', users: 'Users per role' },
    enums: { type: Object.fromEntries(ROLE_TYPES.map((t) => [t, t])), status: { design: 'Design', build: 'Build', unit: 'Unit test', integration: 'Integration test', live: 'Live', retired: 'Retired' },
      approval: { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }, sodStatus: { open: 'Open', mitigated: 'Mitigated', accepted: 'Accepted', resolved: 'Resolved' }, level: { H: 'H', M: 'M', L: 'L' } },
    checks: { dupBrole: 'Duplicate business role ID', dupTrole: 'Duplicate technical role ID', dupTcode: 'T-code listed twice', noTrole: 'No technical role mapped', unknownTrole: 'Technical role not in sheet 2', noTcode: 'Business role without T-codes',
      noParent: 'Derived role without master', parentNotListed: 'Master role not in sheet 2', unknownBrole: 'Business role not in sheet 1', tcodeNoRole: 'T-code in no role', userNoRole: 'User without roles',
      dupUser: 'User ID on several rows (shared ID)', authUnknownTrole: 'Authorization row of a role not in sheet 2', sodUsers: 'Users in SoD conflict', sodInherent: 'Conflicting T-codes inside one role' },
    sev: { err: 'Error', warn: 'Warning', info: 'Note' }, guess: 'guess', none: 'none',
  },
};
export const SHEETS = ['broles', 'troles', 'tcodes', 'users', 'auths', 'sod', 'revisions'];

/**
 * Labels of a language, with a company layout laid over them (skills/role-matrix/layout.md): document title, tab and
 * sheet titles, column headers, cover fields, level codes. The model keeps F / C / D and X whatever the layout shows.
 */
export function labelsFor(lang, layout) {
  const base = LABELS[String(lang || '').slice(0, 2)] || LABELS.en;
  if (!layout || typeof layout !== 'object') return base;
  const L = JSON.parse(JSON.stringify(base));
  L.layout = layout;
  if (layout.title) L.title = String(layout.title);
  for (const sh of arr(layout.sheets)) {
    if (!SHEETS.includes(sh.key)) continue;
    if (sh.tab || sh.title) L.tabs[sh.key] = String(sh.tab || sh.title);
    L.heads[sh.key] = [String(sh.title || L.heads[sh.key][0]), sh.sub != null ? String(sh.sub) : L.heads[sh.key][1]];
  }
  for (const f of arr(layout.cover?.fields)) if (f.k && f.h) L.cover.fields[f.k] = String(f.h);
  // level codes: out = what a cell shows, in = what typing / pasting accepts (the company code wins over F / C / D)
  L.lvOut = {}; L.lvIn = { F: 'F', C: 'C', D: 'D' };
  // levelMark: the form marks access with one sign, no F / C / D — every level shows it, typing it gives F
  const one = layout.levelMark?.code ? String(layout.levelMark.code) : '';
  if (one) { L.single = one; for (const k of LEVELS) L.lvOut[k] = one; L.lvIn[one.toUpperCase()] = 'F'; }
  for (const k of LEVELS) {
    const x = layout.levels?.[k]; if (one || !x?.code) continue;
    L.lvOut[k] = String(x.code); L.lvIn[String(x.code).toUpperCase()] = k;
    L.foot[k] = `└ ${x.code}${x.text ? ` (${x.text})` : ''}`;
  }
  if (layout.mark) L.mark = String(layout.mark);
  L.cover.legendRows = L.cover.legendRows.flatMap(([k, t]) => {
    if (one && LEVELS.includes(k)) return k === 'F' ? [[one, String(layout.levelMark.text || t), 'F']] : [];
    const x = layout.levels?.[k];
    if (x) return [[x.code || k, x.text || t, k]];
    if (k === 'X' && L.mark) return [[L.mark, t, 'X']];
    return [[k, t, k]];
  });
  return L;
}

/** Sheets shown, in the layout's order (every sheet without a layout). */
export const sheetsOf = (L) => {
  const ks = arr(L?.layout?.sheets).map((s) => s.key).filter((k) => SHEETS.includes(k));
  return ks.length ? [...new Set(ks)] : SHEETS;
};

/** Column definitions of the fixed sheets. type: text | num | enum | list (comma list) | ro (computed). */
export function sheetColumns(sheet, v, L, all = false) {
  const C = L.cols, E = L.enums;
  const mod = { type: 'enum', opts: MODULES, free: true };
  const S = {
    broles: [{ k: 'id', h: C.id, key: 1 }, { k: 'name', h: C.name, w: 160 }, { k: 'nameEn', h: C.nameEn }, { k: 'module', h: C.module, ...mod }, { k: 'desc', h: C.desc, wrap: 1, w: 260 },
      { k: 'tasks', h: C.tasks, wrap: 1, w: 220 }, { k: 'org', h: C.org }, { k: 'troles', h: C.troles, type: 'list' }, { k: 'users', h: C.users, type: 'num' },
      { k: '_tc', h: C.tcN, type: 'ro' }, { k: '_un', h: C.userN, type: 'ro' }, { k: 'note', h: C.note, wrap: 1 }],
    troles: [{ k: 'id', h: C.tid, key: 1 }, { k: 'desc', h: C.tdesc, w: 220 }, { k: 'type', h: C.type, type: 'enum', opts: ROLE_TYPES }, { k: 'parent', h: C.parent }, { k: 'module', h: C.module, ...mod },
      { k: 'brole', h: C.brole, type: 'enum', opts: v.ids, free: true }, { k: 'orgLevel', h: C.orgLevel, type: 'enum', opts: ORG_LEVELS, free: true }, { k: 'orgValue', h: C.orgValue },
      { k: 'children', h: C.children, type: 'list' }, { k: 'owner', h: C.owner }, { k: 'status', h: C.status, type: 'enum', opts: TROLE_STATUS, lab: E.status }, { k: 'note', h: C.note, wrap: 1 },
      // shown only when a layout names them: the business role's name and description beside the technical role
      { k: '_bname', h: C.bname, type: 'ro', opt: 1 }, { k: '_bdesc', h: C.bdesc, type: 'ro', wrap: 1, opt: 1 }],
    tcodes: [{ k: 'module', h: C.module, ...mod }, { k: 'area', h: C.area }, { k: 'tcode', h: C.tcode, key: 1 }, { k: 'text', h: C.text, w: 180 },
      ...v.ids.map((id) => ({ k: `L:${id}`, h: id, type: 'level', role: id })), { k: '_n', h: C.roleN, type: 'ro' }, { k: 'note', h: C.note, wrap: 1 }],
    users: [{ k: 'empNo', h: C.empNo }, { k: 'uid', h: C.uid, key: 1 }, { k: 'name', h: C.uname }, { k: 'dept', h: C.dept }, { k: 'pos', h: C.pos }, { k: 'plant', h: C.plant },
      ...v.ids.map((id) => ({ k: `X:${id}`, h: id, type: 'x', role: id })), { k: '_n', h: C.assigned, type: 'ro' }, { k: 'approval', h: C.approval, type: 'enum', opts: APPROVAL, lab: E.approval },
      { k: '_sod', h: C.sodWarn, type: 'ro' }, { k: 'valid', h: C.valid }, { k: 'note', h: C.note, wrap: 1 }],
    auths: [{ k: 'trole', h: C.trole, type: 'enum', opts: v.m.troles.map((t) => t.id), free: true, key: 1 }, { k: 'object', h: C.object }, { k: 'objText', h: C.objText, w: 180 }, { k: 'field', h: C.field },
      { k: 'fieldText', h: C.fieldText }, { k: 'value', h: C.value, wrap: 1, w: 280 }, { k: 'note', h: C.note, wrap: 1 }],
    sod: [{ k: 'id', h: C.sid, key: 1 }, { k: 'a', h: C.a, type: 'enum', opts: v.ids, free: true }, { k: 'b', h: C.b, type: 'enum', opts: v.ids, free: true }, { k: 'kind', h: C.kind },
      { k: 'risk', h: C.risk, wrap: 1, w: 260 }, { k: 'level', h: C.level, type: 'enum', opts: RISK }, { k: 'mitigation', h: C.mitigation, wrap: 1, w: 260 }, { k: 'approver', h: C.approver },
      { k: 'status', h: C.status, type: 'enum', opts: SOD_STATUS, lab: E.sodStatus }, { k: '_users', h: C.sodUsers, type: 'ro' }, { k: '_inh', h: C.inherent, type: 'ro' }, { k: 'note', h: C.note, wrap: 1 }],
    revisions: [{ k: 'ver', h: C.ver, key: 1 }, { k: 'date', h: C.date }, { k: 'author', h: C.author }, { k: 'change', h: C.change, wrap: 1, w: 420 }, { k: 'approver', h: C.approver }, { k: 'note', h: C.note, wrap: 1 }],
  };
  const base = S[sheet] || [];
  const lay = arr(L.layout?.sheets).find((s) => s.key === sheet);
  return lay && arr(lay.cols).length ? layoutColumns(base, lay.cols) : all ? base : base.filter((c) => !c.opt);
}

/**
 * The layout's columns: its order and headers; `e:<name>` = a company column of its own (row.ext); `@roles` = where
 * the role columns of a matrix sheet go (after the plain columns when left out). The key column always stays.
 */
function layoutColumns(base, lcols) {
  const byK = new Map(base.map((c) => [c.k, c]));
  const out = [];
  let at = -1;
  for (const lc of lcols) {
    const k = String(lc?.k || '');
    if (k === '@roles') { at = out.length; continue; }
    const w = Number(lc.w) || undefined;
    if (/^e:\w+$/.test(k)) out.push({ k, h: String(lc.h || k.slice(2)), w, wrap: lc.wrap ? 1 : undefined, type: lc.type === 'num' ? 'num' : undefined, ext: 1 });
    else if (byK.has(k) && !out.some((c) => c.k === k)) { const c = byK.get(k); out.push({ ...c, h: lc.h ? String(lc.h) : c.h, w: w || c.w }); }
  }
  const mx = base.filter((c) => c.type === 'level' || c.type === 'x');
  if (mx.length) out.splice(at < 0 ? out.length : at, 0, ...mx);
  const key = base.find((c) => c.key);
  if (key && !out.some((c) => c.k === key.k)) out.unshift(key);
  return out;
}

/** Display value of one cell (text for the table; the editor reads the raw value from the model). */
export function cellValue(sheet, row, col, v, L) {
  const k = col.k;
  if (k.startsWith('L:')) { const x = row.levels?.[col.role] || ''; return (x && L.lvOut?.[x]) || x; }
  if (k.startsWith('X:')) return row.roles?.[col.role] ? L.mark || 'X' : '';
  if (k.startsWith('e:')) return row.ext?.[k.slice(2)] ?? '';
  if (sheet === 'broles' && k === '_tc') return v.tcCount[row.id]?.all || '';
  if (sheet === 'broles' && k === '_un') return v.userCount[row.id] || '';
  if (sheet === 'tcodes' && k === '_n') return Object.keys(row.levels || {}).filter((r) => v.idSet.has(r)).length || '';
  if (sheet === 'users' && k === '_n') return Object.keys(row.roles || {}).filter((r) => v.idSet.has(r)).length || '';
  if (sheet === 'users' && k === '_sod') return (v.sodUsers.get(row.uid || row.name) || []).join(', ');
  if (sheet === 'troles' && (k === '_bname' || k === '_bdesc')) {
    const b = (v.bById ||= new Map(v.m.broles.map((x) => [x.id, x]))).get(row.brole || row.parent || row.id);
    return b ? (k === '_bname' ? b.name || b.nameEn : b.desc) : '';
  }
  if (sheet === 'sod' && k === '_users') return arr(v.hitById.get(row.id)?.users).join(', ');
  if (sheet === 'sod' && k === '_inh') return arr(v.hitById.get(row.id)?.inherent).join(', ');
  const raw = row[k];
  if (Array.isArray(raw)) return raw.join(', ');
  if (col.lab) return col.lab[raw] || raw || '';
  return raw ?? '';
}

const listOf = (v, sheet) => (sheet === 'revisions' ? v.m.revisions : v.m[sheet]);

// A synced system can hold hundreds of roles × thousands of T-codes; a page of a sheet draws about this many cells.
// Role columns are paged too: laying out a thousand columns at once takes the browser seconds.
const PAGE_CELLS = 20000, MX_COLS = 50;
export const pageSize = (cols) => Math.min(300, Math.max(50, Math.floor(PAGE_CELLS / Math.max(1, cols.length))));

/** Columns drawn for a sheet: the plain ones plus one page of role columns (matrix sheets). */
export function shownColumns(sheet, v, L, cpage = 0) {
  const cols = sheetColumns(sheet, v, L);
  const mx = cols.filter((c) => c.type === 'level' || c.type === 'x');
  const cpages = Math.max(1, Math.ceil(mx.length / MX_COLS)), cpg = Math.min(Math.max(0, cpage), cpages - 1);
  if (cpages === 1) return { cols, cpages, cpg, mx: mx.length, from: 0 };
  const keep = new Set(mx.slice(cpg * MX_COLS, (cpg + 1) * MX_COLS));
  return { cols: cols.filter((c) => !(c.type === 'level' || c.type === 'x') || keep.has(c)), cpages, cpg, mx: mx.length, from: cpg * MX_COLS };
}

/** Active column filters of a sheet: [column key, { vals: [shown values] } | { q: text it contains }]. */
const activeFilters = (f) => Object.entries(f || {}).filter(([, x]) => x && (Array.isArray(x.vals) || String(x.q || '').trim() || typeof x.has === 'boolean'));

/**
 * Model indexes of the rows that match the search text and the column filters (every row without them). A filter
 * keeps the rows whose shown value is one of `vals`, contains `q`, or (`has`) is filled / blank.
 */
export function sheetRows(sheet, v, L, q = '', f = null) {
  const rows = listOf(v, sheet), cols = sheetColumns(sheet, v, L), s = String(q).trim().toLowerCase();
  const idx = rows.map((_, i) => i);
  const fs = activeFilters(f).map(([k, x]) => [cols.find((c) => c.k === k), x.vals ? new Set(x.vals) : null, String(x.q || '').trim().toLowerCase(), typeof x.has === 'boolean' ? x.has : null]).filter(([c]) => c);
  if (!s && !fs.length) return idx;
  const plain = cols.filter((c) => c.type !== 'level' && c.type !== 'x');
  return idx.filter((i) => {
    const r = rows[i];
    for (const [c, vals, fq, has] of fs) {
      const val = String(cellValue(sheet, r, c, v, L) ?? '');
      if (has != null && has !== (val !== '')) return false;
      if (vals && !vals.has(val)) return false;
      if (fq && !val.toLowerCase().includes(fq)) return false;
    }
    if (!s) return true;
    const text = plain.map((c) => cellValue(sheet, r, c, v, L)).join(' ') + ' ' + Object.keys(r.levels || r.roles || {}).join(' ');
    return text.toLowerCase().includes(s);
  });
}

/** Values a column shows, with how many rows show each (blank first, then in text order) — the filter's list. */
export function columnValues(sheet, v, L, k) {
  const col = sheetColumns(sheet, v, L).find((c) => c.k === k);
  const n = new Map();
  if (col) for (const r of listOf(v, sheet)) { const x = String(cellValue(sheet, r, col, v, L) ?? ''); n.set(x, (n.get(x) || 0) + 1); }
  return [...n].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[0].localeCompare(b[0], undefined, { numeric: true })));
}

/**
 * One sheet: heading, the grid (sticky header and key column), totals rows for the two matrices.
 * opts.q filters the rows, opts.page picks the page when the sheet is longer than one page, opts.cpage the page of
 * role columns.
 */
export function renderSheet(sheet, v, L, { q = '', page = 0, cpage = 0, f = null } = {}) {
  const SC = shownColumns(sheet, v, L, cpage), cols = SC.cols;
  const all = listOf(v, sheet);
  const fOn = new Set(activeFilters(f).map(([k]) => k));
  const hits = sheetRows(sheet, v, L, q, f), size = pageSize(cols), pages = Math.max(1, Math.ceil(hits.length / size));
  const pg = Math.min(Math.max(0, page), pages - 1);
  const shown = hits.slice(pg * size, (pg + 1) * size);
  const rows = shown.map((i) => all[i]);
  const isMx = sheet === 'tcodes' || sheet === 'users';
  const names = new Map(v.m.broles.map((b) => [b.id, b.name])), nameOf = (id) => names.get(id) || '';
  const th = cols.map((c, j) => `<th data-c="${esc(c.k)}" class="${c.type === 'level' || c.type === 'x' ? 'mx' : ''}${c.key ? ' key' : ''}"${c.w ? ` style="min-width:${c.w}px"` : ''}>${esc(c.h)}<button class="flt${fOn.has(c.k) ? ' on' : ''}" data-f="${esc(c.k)}" title="${esc(L.pager.filter)}" aria-label="${esc(L.pager.filter)}">▾</button>${(c.type === 'level' || c.type === 'x') ? `<small>${esc(nameOf(c.role))}</small>` : ''}</th>`).join('');
  const body = rows.map((r, n) => {
    const i = shown[n];
    const sodBad = sheet === 'users' && v.sodUsers.has(r.uid || r.name);
    return `<tr data-i="${i}"${r.guess ? ' class="guess"' : ''}${sodBad ? ' class="sodbad"' : ''}><td class="no">${i + 1}</td>${cols.map((c) => {
      const val = cellValue(sheet, r, c, v, L);
      // empty matrix cells stay small: a synced matrix is mostly blank
      if ((c.type === 'level' || c.type === 'x') && !val) return `<td data-c="${esc(c.k)}" class="${c.type === 'level' ? 'lv' : 'xx'}"></td>`;
      const cls = [c.type === 'ro' ? 'ro' : '', c.type === 'level' ? `lv lv-${r.levels?.[c.role] || ''}` : '', c.type === 'x' ? `xx${val ? ' on' : ''}` : '', c.wrap ? 'wrap' : '', c.type === 'num' ? 'num' : '', c.key ? 'key' : '',
        sheet === 'sod' && c.k === 'level' ? `rk rk-${val}` : '', sheet === 'sod' && c.k === '_users' && val ? 'bad' : '', sheet === 'users' && c.k === '_sod' && val ? 'bad' : ''].filter(Boolean).join(' ');
      return `<td data-c="${esc(c.k)}"${cls ? ` class="${cls}"` : ''}>${esc(val)}</td>`;
    }).join('')}</tr>`;
  }).join('');
  let foot = '';
  if (sheet === 'tcodes') {
    const span = cols.findIndex((c) => c.type === 'level') + 1;
    const line = (lab, f) => `<tr class="ft"><td colspan="${span}">${esc(lab)}</td>${cols.slice(span - 1).map((c) => `<td class="num">${c.type === 'level' ? f(v.tcCount[c.role] || {}) || '' : ''}</td>`).join('')}</tr>`;
    foot = line(L.foot.tcAll, (x) => x.all) + (L.single ? '' : line(L.foot.F, (x) => x.F) + line(L.foot.C, (x) => x.C) + line(L.foot.D, (x) => x.D));
  } else if (sheet === 'users') {
    const span = cols.findIndex((c) => c.type === 'x') + 1;
    foot = `<tr class="ft"><td colspan="${span}">${esc(L.foot.users)}</td>${cols.slice(span - 1).map((c) => `<td class="num">${c.type === 'x' ? v.userCount[c.role] || '' : ''}</td>`).join('')}</tr>`;
  }
  const [h, sub] = L.heads[sheet];
  const P = L.pager;
  const grp = groupRow(sheet, cols, L);
  const rowPager = pages > 1 || q || fOn.size ? `<button data-pg="${pg - 1}"${pg ? '' : ' disabled'}>◀</button>
<span>${esc(fmtL(P.range, { a: hits.length ? pg * size + 1 : 0, b: pg * size + rows.length, n: hits.length }))}${q ? ` · ${esc(fmtL(P.of, { n: all.length }))}` : ''}</span>
<button data-pg="${pg + 1}"${pg < pages - 1 ? '' : ' disabled'}>▶</button>${pages > 1 ? `<span class="muted">${esc(fmtL(P.page, { p: pg + 1, n: pages }))}</span>` : ''}${fOn.size ? `<span class="fon">${esc(fmtL(P.fOn, { n: fOn.size }))}</span><button data-fclear="${sheet}">${esc(P.fClear)}</button>` : ''}` : '';
  const c0 = SC.from, c1 = Math.min(SC.mx, SC.from + MX_COLS);
  const colPager = SC.cpages > 1 ? `<span class="sep"></span><button data-cpg="${SC.cpg - 1}"${SC.cpg ? '' : ' disabled'}>◀</button>
<span>${esc(fmtL(P.cols, { a: c0 + 1, b: c1, n: SC.mx }))}</span><button data-cpg="${SC.cpg + 1}"${SC.cpg < SC.cpages - 1 ? '' : ' disabled'}>▶</button>` : '';
  const pager = rowPager || colPager ? `<div class="pager" data-s="${sheet}">${rowPager}${colPager}</div>` : '';
  return `<h2>${esc(h)}</h2>${sub ? `<p class="muted sub">${esc(sub)}</p>` : ''}${pager}
<div class="gw"><table class="grid${isMx ? ' mxt' : ''}" data-s="${sheet}"><thead>${grp}<tr class="hd"><th class="no">#</th>${th}</tr>${filterRow(cols, f, L)}</thead><tbody>${body}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`;
}

/**
 * The filter row under the column headers, always there: a "contains" box per column, filled / blank (and the level
 * codes) for a matrix column. ▾ in the header picks values from a list.
 */
function filterRow(cols, f, L) {
  const P = L.pager;
  return `<tr class="frow"><th class="no"></th>${cols.map((c) => {
    const x = (f || {})[c.k] || {}, k = esc(c.k);
    if (c.type === 'level' || c.type === 'x') {
      const codes = c.type === 'level' && !L.single ? LEVELS.map((lv) => (L.lvOut && L.lvOut[lv]) || lv) : [];
      const on = (val) => (x.vals && x.vals.length === 1 && x.vals[0] === val ? ' selected' : '');
      return `<th data-c="${k}"><select class="fin" data-f="${k}" aria-label="${esc(P.filter)} ${esc(c.h)}"><option value=""></option><option value="1"${x.has === true ? ' selected' : ''}>${esc(P.fAny)}</option><option value="0"${x.has === false ? ' selected' : ''}>${esc(P.fNone)}</option>${codes.map((cd) => `<option value="v:${esc(cd)}"${on(cd)}>${esc(cd)}</option>`).join('')}</select></th>`;
    }
    return `<th data-c="${k}"><input class="fin" data-f="${k}" size="1" value="${esc(x.q || '')}" placeholder="${esc(x.vals ? fmtL(P.fPicked, { n: x.vals.length }) : P.fType)}" aria-label="${esc(P.filter)} ${esc(c.h)}"></th>`;
  }).join('')}</tr>`;
}

/**
 * The layout's header groups (a band over several columns, `@roles` = the role columns) as a row above the header
 * row (the column header row is tr.hd).
 */
function groupRow(sheet, cols, L) {
  const groups = arr(arr(L.layout?.sheets).find((s) => s.key === sheet)?.groups).filter((g) => g?.h && arr(g.cols).length);
  if (!groups.length) return '';
  const gOf = (c) => groups.findIndex((g) => arr(g.cols).some((k) => k === c.k || (k === '@roles' && (c.type === 'level' || c.type === 'x'))));
  const cells = [{ g: -1, n: 1 }];
  for (const c of cols) { const g = gOf(c), last = cells[cells.length - 1]; if (last.g === g) last.n++; else cells.push({ g, n: 1 }); }
  return `<tr class="grp">${cells.map((x) => `<th${x.n > 1 ? ` colspan="${x.n}"` : ''} class="${x.g < 0 ? 'g0' : 'g'}">${x.g < 0 ? '' : esc(groups[x.g].h)}</th>`).join('')}</tr>`;
}

/** Cover: document fields (editable), sheet guide, legend, computed summary, checks. */
export function renderCover(v, L, { version = '', date = '' } = {}) {
  const F = L.cover.fields, d = v.m.doc;
  const shownSet = new Set(sheetsOf(L)); // a check on a sheet the layout hides is listed, not linked
  const field = (k, val, ro) => `<tr><th>${esc(F[k] || k)}</th><td${ro ? ' class="ro"' : ` data-d="${esc(k)}"`}>${esc(val)}</td></tr>`;
  const src = v.m.source ? `${L.cover.mode.sap} · ${v.m.source.system || ''} · ${v.m.source.readAt || ''}${v.m.source.patterns ? ` · ${arr(v.m.source.patterns).join(', ')}` : ''}` : L.cover.mode[d.mode] || '';
  const sum = Object.entries(L.cover.sum).map(([k, lab]) => `<div class="tile"><div class="k">${esc(lab)}</div><div class="v${k === 'sodBroken' && v.totals[k] ? ' bad' : ''}">${v.totals[k]}</div></div>`).join('');
  const checks = v.checks.length ? `<div class="gw"><table class="plain chk"><tbody>${v.checks.map((c) => `<tr${shownSet.has(c.sheet) ? ` data-go="${c.sheet}"` : ''}><td><span class="sev sev-${c.sev}">${esc(L.sev[c.sev])}</span></td><td>${esc(L.tabs[c.sheet])}</td><td>${esc(L.checks[c.text] || c.text)}</td><td>${esc(c.ref)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(L.cover.noChecks)}</p>`;
  // cover fields: the layout's list and order (`e_<name>` = a company field of its own, kept in doc), else the default
  const RO = { date: date || d.date, version: version ? `v${version}` : '', source: src };
  const keys = arr(L.layout?.cover?.fields).map((f) => String(f.k || '')).filter((k) => k in F || /^e_\w+$/.test(k));
  const info = (keys.length ? keys : ['project', 'system', 'author', 'date', 'version', 'reviewer', 'source']).map((k) => (k in RO ? field(k, RO[k], 1) : field(k, d[k] ?? ''))).join('');
  const hide = new Set(arr(L.layout?.cover?.hide));
  const logo = /^data:image\//.test(L.layout?.theme?.logo || '') ? `<img class="logo" alt="" src="${esc(L.layout.theme.logo)}">` : '';
  const guide = sheetsOf(L).map((k) => L.cover.sheetRows.find((x) => x[0] === k)).filter(Boolean);
  return `<div class="cvh">${logo}<h1>${esc(L.title)}</h1></div>
<div class="cv"><section><h3>${esc(L.cover.info)}</h3><table class="plain kv"><tbody>${info}</tbody></table>
${hide.has('summary') ? '' : `<h3>${esc(L.cover.summary)}</h3><div class="tiles">${sum}</div>`}</section>
${hide.has('checks') ? '' : `<section><h3>${esc(L.cover.checks)}</h3>${checks}</section>`}</div>
${hide.has('sheets') ? '' : `<h3>${esc(L.cover.sheets)}</h3><div class="gw"><table class="plain"><thead><tr>${L.cover.sheetCols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${guide.map(([k, a, b, c]) => `<tr data-go="${k}"><td><a href="#${k}">${esc(L.tabs[k])}</a></td><td>${esc(a)}</td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join('')}</tbody></table></div>`}
${hide.has('legend') ? '' : `<h3>${esc(L.cover.legend)}</h3><table class="plain legend"><tbody>${L.cover.legendRows.map(([k, t, cls]) => `<tr><th><span class="lv lv-${esc(cls || k)}">${esc(k)}</span></th><td>${esc(t)}</td></tr>`).join('')}</tbody></table>`}`;
}

/** Tabs of a model — every sheet, or only opts.only; opts.view[sheet] = { q, page }. */
export function renderAll(model, opts = {}) {
  const v = opts.v || deriveView(model), L = labelsFor(v.m.lang, v.m.layout);
  const out = { v, L, cover: renderCover(v, L, opts) };
  for (const s of opts.only || sheetsOf(L)) out[s] = renderSheet(s, v, L, (opts.view || {})[s]);
  return out;
}

export { LEVELS };

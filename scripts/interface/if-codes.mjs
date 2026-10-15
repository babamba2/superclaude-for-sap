// interface-mapping-spec — code lists, field guide and type conversion.
//
// Code lists are the defaults; `interfaces/project.json` → `codes` overrides
// any list by name. An entry is a plain string (stored and shown as is) or
// { v, ko, en } (v stored, the label shown in the page language).

export const DEFAULT_CODES = {
  region: [
    { v: 'KR', ko: '한국', en: 'Korea' }, { v: 'CN', ko: '중국', en: 'China' },
    { v: 'APAC', ko: '아태', en: 'Asia-Pacific' }, { v: 'EU', ko: '구주', en: 'Europe' },
    { v: 'AM', ko: '미주', en: 'Americas' }, { v: 'GLOBAL', ko: '글로벌', en: 'Global' },
  ],
  trigger: ['PUSH', 'PULL'],
  cycle: [
    { v: 'YEAR', ko: '년', en: 'Year' }, { v: 'MONTH', ko: '월', en: 'Month' }, { v: 'WEEK', ko: '주', en: 'Week' },
    { v: 'DAY', ko: '일', en: 'Day' }, { v: 'HOUR', ko: '시', en: 'Hour' }, { v: 'MIN', ko: '분', en: 'Minute' },
    { v: 'SEC', ko: '초', en: 'Second' }, { v: 'REALTIME', ko: '실시간', en: 'Real time' },
    { v: 'ADHOC', ko: '수시(수동)', en: 'On demand (manual)' }, { v: 'OTHER', ko: '기타', en: 'Other' },
  ],
  dataType: ['CHAR', 'NCHAR', 'VARCHAR', 'VARCHAR2', 'NVARCHAR2', 'NUMBER', 'FLOAT', 'INTEGER', 'LONG', 'DATE',
    'TIMESTAMP', 'RAW', 'LONG RAW', 'BLOB', 'CLOB', 'NCLOB', 'BFILE'],
  yn: ['Y', 'N'],
  relation: ['1:1', '1:N', 'N:1'],
  cardinality: ['0:1', '0:N', '1:1', '1:N'],
  structure: ['PARAMETER', 'STRUCTURE', 'TABLE'],
  transfer: [
    { v: 'SYNC', ko: '동기(Synchronous)', en: 'Synchronous' },
    { v: 'ASYNC', ko: '비동기(Asynchronous)', en: 'Asynchronous' },
    { v: 'ASYNC_CB', ko: '비동기 콜백(Asynchronous Call Back)', en: 'Asynchronous call back' },
  ],
  adapter: ['JDBC (Oracle)', 'JDBC (MS-SQL)', 'JDBC (Sybase)', 'JDBC (DB2)', 'ABAP Proxy',
    { v: 'SOAP', ko: '웹서비스 (SOAP)', en: 'Web service (SOAP)' }, 'REST (HTTP)', 'FTP', 'SFTP', 'RFC', 'IDoc', 'DB LINK',
    { v: 'ETC', ko: '기타', en: 'Other' }],
};

/** Code lists with the project overrides applied (unknown names are kept as extra lists). */
export function codeLists(overrides = {}) {
  const out = { ...DEFAULT_CODES };
  for (const [k, v] of Object.entries(overrides || {})) if (Array.isArray(v) && v.length) out[k] = v;
  return out;
}

export const codeValue = (e) => (typeof e === 'string' ? e : e.v);
export const codeLabel = (e, lang) => (typeof e === 'string' ? e : e[lang] || e.en || e.v);

// Which code list each header / side / grid field draws from.
export const FIELD_CODES = {
  transfer: 'transfer', trigger: 'trigger', cycle: 'cycle', relation: 'relation',
  region: 'region', adapter: 'adapter', structure: 'structure', cardinality: 'cardinality',
  key: 'yn', type: 'dataType', nul: 'yn',
};

// ── DDIC → DB type ────────────────────────────────────────────────────────
// SAP side: the DDIC type shown as the DB type of the code list (decision 11);
// the original DDIC type stays in `ddic` and is shown as a tooltip.
const DDIC_TO_DB = {
  CHAR: 'CHAR', CLNT: 'CHAR', LANG: 'CHAR', CUKY: 'CHAR', UNIT: 'CHAR', ACCP: 'CHAR', TIMS: 'CHAR', LCHR: 'LONG',
  SSTR: 'VARCHAR2', STRG: 'CLOB', STRING: 'CLOB',
  NUMC: 'NUMBER', DEC: 'NUMBER', CURR: 'NUMBER', QUAN: 'NUMBER', PREC: 'NUMBER', D16D: 'NUMBER', D34D: 'NUMBER',
  INT1: 'INTEGER', INT2: 'INTEGER', INT4: 'INTEGER', INT8: 'INTEGER', FLTP: 'FLOAT',
  DATS: 'DATE', DATN: 'DATE', TIMN: 'CHAR', UTCL: 'TIMESTAMP',
  RAW: 'RAW', LRAW: 'LONG RAW', RSTR: 'BLOB', RAWSTRING: 'BLOB',
};
const NO_SIZE = new Set(['DATE', 'TIMESTAMP', 'CLOB', 'NCLOB', 'BLOB', 'BFILE', 'LONG', 'LONG RAW', 'INTEGER', 'FLOAT']);

export function ddicToDb(datatype, leng) {
  const t = String(datatype || '').toUpperCase();
  const type = DDIC_TO_DB[t] || (t ? 'CHAR' : '');
  const size = NO_SIZE.has(type) || leng == null || leng === '' ? '' : String(Number(leng));
  return { type, size };
}

/** Proposed type on a non-SAP (DB) side for a SAP field (decision 12). */
export function proposeDbType(datatype, leng) {
  const t = String(datatype || '').toUpperCase();
  const n = leng == null || leng === '' ? '' : String(Number(leng));
  if (['NUMC', 'CHAR', 'CLNT', 'LANG', 'CUKY', 'UNIT', 'ACCP', 'SSTR'].includes(t)) return { type: 'VARCHAR2', size: n };
  if (t === 'TIMS' || t === 'TIMN') return { type: 'VARCHAR2', size: '6' };
  if (['DATS', 'DATN'].includes(t)) return { type: 'DATE', size: '' };
  return ddicToDb(t, leng);
}

/** Type family for the mismatch warning; a DDIC type that reads as text and as a value counts for both. */
export function typeFamilies(type, ddic) {
  const d = String(ddic || '').split(' ')[0].toUpperCase();
  if (d === 'NUMC') return ['text', 'number'];
  if (d === 'DATS' || d === 'DATN') return ['date', 'text'];
  if (d === 'TIMS' || d === 'TIMN') return ['text'];
  const t = String(type || '').toUpperCase();
  if (['NUMBER', 'FLOAT', 'INTEGER'].includes(t)) return ['number'];
  if (['DATE', 'TIMESTAMP'].includes(t)) return ['date'];
  if (['RAW', 'LONG RAW', 'BLOB', 'BFILE'].includes(t)) return ['binary'];
  return t ? ['text'] : [];
}

export const sizeOptional = (type) => NO_SIZE.has(String(type || '').toUpperCase());

// ── Field guide (the template's "항목설명" sheet, made generic) ───────────
// key → [required, ko, en]. Shown as ⓘ tooltips and as the guide section.
export const GUIDE = {
  ifId: [true, '인터페이스 명명 규칙에 따라 부여한 인터페이스 ID', 'Interface ID given by the interface naming rule'],
  name: [true, '인터페이스 명', 'Interface name'],
  summary: [true, '인터페이스 개요(목적)를 간략하게 서술', 'Short summary (purpose) of the interface'],
  detail: [false, '인터페이스 요건에 대한 상세 내용', 'Details of the interface requirement'],
  transfer: [false, 'Source와 Target 간 처리 결과 및 조회 데이터를 돌려주는 방식 (동기 / 비동기 / 비동기 콜백). 통합 담당자와 협의 후 결정', 'How results or queried data come back between source and target (synchronous / asynchronous / asynchronous call back). Agree it with the integration team'],
  trigger: [true, 'PUSH: Target System에 Transaction 발생\nPULL: Target System의 데이터를 받아와 Source System에 Transaction 발생', 'PUSH: the transaction happens in the target system\nPULL: data is fetched from the target system and the transaction happens in the source system'],
  cycle: [true, '인터페이스 실행 주기. 두 가지 이상이면 대표 하나를 고르고 특이사항에 추가로 기록', 'How often the interface runs. If more than one applies, pick the main one and note the rest under remarks'],
  cycleCount: [false, '주기별 실행 횟수 (실시간 · 수시 제외 필수)\n예) 주 3회 → 주, 3 / 5분마다 → 시, 12 / 매일 2시·14시 → 일, 2', 'Runs per cycle (required except real time / on demand)\nE.g. 3 times a week → Week, 3 / every 5 minutes → Hour, 12 / daily at 2:00 and 14:00 → Day, 2'],
  perRun: [false, '1회 전송 건수', 'Records per run'],
  recordSize: [false, '건당 데이터 크기 (단위: Byte, KB, MB)', 'Data size per record (Byte, KB, MB)'],
  relation: [true, '송수신 시스템 관계 (1:1, 1:N, N:1)', 'Sender / receiver relation (1:1, 1:N, N:1)'],
  targetLogic: [true, 'Target System에서 수행되는 처리 로직 (Insert, Update, Delete, Select — 여러 개 입력 가능)', 'Processing in the target system (Insert, Update, Delete, Select — several allowed)'],
  author: [true, '매핑 정의서 작성자 (이름, 연락처, 이메일). 여러 명이면 대표 외에는 ( )에 표시 — 대표가 연락 창구', 'Author of the mapping specification (name, phone, e-mail). Several people: the others in ( ) — the first is the contact point'],
  writtenAt: [true, '작성일 (YYYY-MM-DD)', 'Date written (YYYY-MM-DD)'],
  system: [true, 'Source · Target 각 시스템 명', 'Name of the source / target system'],
  module: [true, '시스템의 모듈 명 — SAP이면 필수 (CO, FI, MM, SD …)', 'Module of the system — required for SAP (CO, FI, MM, SD …)'],
  region: [true, '시스템 지역', 'Region of the system'],
  owner: [true, '시스템 담당자 (이름, 연락처, 이메일). 여러 명이면 대표 외에는 ( )에 표시', 'System owner (name, phone, e-mail). Several people: the others in ( )'],
  adapter: [true, '어댑터 종류 (RFC, Proxy, JDBC, DB Link, File, FTP, HTTP, SOAP …). 애매하면 통합 담당자와 협의', 'Adapter (RFC, Proxy, JDBC, DB Link, File, FTP, HTTP, SOAP …). When unsure, ask the integration team'],
  object: [true, '인터페이스와 관련된 객체 명 (RFC 명, 테이블 명, 프로시저 명, 프로그램 명 등)', 'Object behind the interface (RFC, table, procedure, program …)'],
  structure: [true, '필드를 실어 나르는 단위 — PARAMETER(개별 파라미터), STRUCTURE(한 건의 구조), TABLE(여러 건의 테이블). 그리드의 ▸ 그룹 행마다 적고, 시스템 블록에는 자동 요약됩니다', 'Unit the fields travel in — PARAMETER (single parameters), STRUCTURE (one record), TABLE (many records). Set on each ▸ group row of the grid; the system block shows the summary'],
  cardinality: [true, '데이터 필수 여부 — 0:1 없거나 한 건, 0:N 없거나 N건, 1:1 반드시 한 건, 1:N 한 건 이상', 'Occurrence — 0:1 none or one, 0:N none or many, 1:1 exactly one, 1:N one or more'],
  table: [false, '필드가 속한 테이블', 'Table of the field'],
  field: [true, '인터페이스에 쓰이는 필드 명', 'Field name used by the interface'],
  key: [true, 'Primary Key 여부 (Y, N)', 'Primary key (Y, N)'],
  type: [true, '필드 타입. SAP 측은 DDIC 타입을 DB 타입으로 바꿔 보여 줍니다 (원래 타입은 툴팁)', 'Field type. The SAP side shows the DDIC type as a DB type (the original in the tooltip)'],
  size: [true, '필드 길이', 'Field length'],
  nul: [true, 'Null 허용 여부 — N: Not Null, Y: Null', 'Null allowed — N: not null, Y: null'],
  desc: [true, '필드 설명', 'Field description'],
  rule: [false, '변환 규칙 ID (R1부터 차례로). 규칙 내용은 아래 "컬럼별 변환규칙"에 기술', 'Conversion rule ID (R1, R2 …), described under "Conversion rules"'],
  mapping: [true, 'Target 필드에 매핑되는 Source 행의 No', 'No of the source row this target field is mapped from'],
  rules: [false, 'Source에서 Target으로 값을 옮길 때의 변환. 예) RegDate 2014-01-01 → 20140101 ("-" 삭제), Rate 14.256 → 14 (소수점 이하 버림)', 'Value conversions from source to target. E.g. RegDate 2014-01-01 → 20140101 (drop "-"), Rate 14.256 → 14 (truncate decimals)'],
  extract: [false, '데이터 추출 조건 — 추출 SELECT 문, 추출 후 UPDATE 문 등', 'Extraction condition — the SELECT that reads the data, the UPDATE after reading, …'],
  remarks: [false, '특이사항 — 처리 제한시간, 여러 인터페이스의 처리 순서, 예외 처리 등', 'Remarks — time limits, order between interfaces, exception handling, …'],
  etc: [false, '기타', 'Other'],
};

// ── Scenario presets (decision 20) ────────────────────────────────────────
// Picked first in the interview; the answers given afterwards win.
export const PRESETS = {
  'master-out': {
    ko: '마스터 송신 (SAP → 외부, 정기)', en: 'Master data outbound (SAP → external, scheduled)', sapSide: 'source', response: false,
    header: { transfer: 'ASYNC', trigger: 'PUSH', cycle: 'DAY', cycleCount: '1', relation: '1:N', targetLogic: 'INSERT, UPDATE' },
    side: { structure: 'TABLE', cardinality: '0:N' },
  },
  'txn-out': {
    ko: '트랜잭션 송신 (SAP 문서 발생 시 → 외부)', en: 'Transaction outbound (SAP document → external, on event)', sapSide: 'source', response: false,
    header: { transfer: 'ASYNC', trigger: 'PUSH', cycle: 'REALTIME', relation: '1:1', targetLogic: 'INSERT' },
    side: { structure: 'TABLE', cardinality: '1:N' },
  },
  inbound: {
    ko: '수신 후 SAP 처리 (외부 → SAP 문서 생성, 결과 회신)', en: 'Inbound into SAP (external → SAP document, result returned)', sapSide: 'target', response: true,
    header: { transfer: 'SYNC', trigger: 'PUSH', cycle: 'REALTIME', relation: '1:1', targetLogic: 'INSERT' },
    side: { structure: 'TABLE', cardinality: '1:N' }, adapter: { target: 'RFC' },
  },
  query: {
    ko: '조회 (외부가 SAP 데이터 요청, 동기 응답)', en: 'Query (external system asks SAP, synchronous answer)', sapSide: 'target', response: true,
    header: { transfer: 'SYNC', trigger: 'PULL', cycle: 'ADHOC', relation: '1:1', targetLogic: 'SELECT' },
    side: { structure: 'PARAMETER', cardinality: '1:1' }, adapter: { target: 'RFC' },
  },
};

// ── Conversion rules proposed from the field types (decision 20) ──────────
// Domains with the ALPHA conversion exit (internal value with leading zeros).
export const ALPHA_DOMAINS = new Set(['MATNR', 'KUNNR', 'LIFNR', 'VBELN', 'EBELN', 'AUFNR', 'BELNR', 'MBLNR', 'BANFN',
  'EQUNR', 'QMNUM', 'KOSTL', 'PRCTR', 'SAKNR', 'ANLN1', 'KUNAG', 'TKNUM', 'DELNR', 'CO_AUFNR', 'AUFNR_NEU']);

const RULE_TEXT = {
  'date-out': ['날짜: SAP 내부 형식 YYYYMMDD → 상대 형식으로 변환 (00000000은 NULL)', 'Date: SAP internal YYYYMMDD → the receiver format (00000000 becomes NULL)'],
  'date-in': ['날짜: 받은 값을 SAP 내부 형식 YYYYMMDD로 변환 (빈 값은 00000000)', 'Date: received value → SAP internal YYYYMMDD (empty becomes 00000000)'],
  'time-out': ['시간: SAP 내부 형식 HHMMSS 6자리 그대로 전송', 'Time: SAP internal HHMMSS sent as 6 characters'],
  'time-in': ['시간: 받은 값을 HHMMSS 6자리로 변환', 'Time: received value → HHMMSS (6 characters)'],
  'alpha-out': ['앞자리 0: SAP 내부값(앞자리 0 포함)을 그대로 전송할지, 화면 표시값(0 제거, CONVERSION_EXIT_ALPHA_OUTPUT)으로 보낼지 협의', 'Leading zeros: send the SAP internal value (with zeros) or the display value (CONVERSION_EXIT_ALPHA_OUTPUT) — agree with the receiver'],
  'alpha-in': ['앞자리 0 채움: 받은 값을 SAP 내부 형식으로 변환 (CONVERSION_EXIT_ALPHA_INPUT)', 'Leading zeros: received value → SAP internal format (CONVERSION_EXIT_ALPHA_INPUT)'],
  'curr-out': ['통화 금액: 통화별 소수 자리로 바꿔 전송 (예: KRW · JPY는 SAP 내부값 ×100, BAPI_CURRENCY_CONV_TO_EXTERNAL) — 통화키 필드를 함께 전송', 'Currency amount: convert to the currency\'s decimals before sending (e.g. KRW, JPY: SAP internal ×100, BAPI_CURRENCY_CONV_TO_EXTERNAL) — send the currency key too'],
  'curr-in': ['통화 금액: 받은 금액을 SAP 내부 금액으로 변환 (BAPI_CURRENCY_CONV_TO_INTERNAL) — 통화키 필드 필요', 'Currency amount: received amount → SAP internal amount (BAPI_CURRENCY_CONV_TO_INTERNAL) — needs the currency key'],
  'quan-out': ['수량: 단위 필드와 함께 전송, ISO 단위 코드로 바꿀지 협의 (CONVERSION_EXIT_CUNIT_OUTPUT)', 'Quantity: send with its unit; agree whether units go as ISO codes (CONVERSION_EXIT_CUNIT_OUTPUT)'],
  'quan-in': ['수량: 단위 필드와 함께 수신, 단위를 SAP 내부 단위로 변환 (CONVERSION_EXIT_CUNIT_INPUT)', 'Quantity: received with its unit; unit → SAP internal unit (CONVERSION_EXIT_CUNIT_INPUT)'],
};
export const ruleText = (kind, lang) => (RULE_TEXT[kind] || ['', ''])[lang === 'ko' ? 0 : 1];

/** Kind of conversion a SAP cell needs; `out` = SAP sends. Null when none. */
export function ruleKind(cell, out) {
  const t = String(cell?.ddic || '').split(' ')[0].toUpperCase();
  const dir = out ? 'out' : 'in';
  if (t === 'DATS') return `date-${dir}`;
  if (t === 'TIMS') return `time-${dir}`;
  if (t === 'CURR') return `curr-${dir}`;
  if (t === 'QUAN' || t === 'UNIT') return `quan-${dir}`;
  if (t === 'NUMC' || ALPHA_DOMAINS.has(String(cell?.dom || '').toUpperCase())) return `alpha-${dir}`;
  return null;
}

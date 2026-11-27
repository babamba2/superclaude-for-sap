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

// ── Field guide ─────────────────────────────────────────────────────────────
// key → [required, ko, en]. Shown as ⓘ tooltips and as the guide section.
export const GUIDE = {
  ifId: [true, '프로젝트 ID 규칙으로 정한 고유 번호', 'Unique number from the project ID rule'],
  name: [true, '이 인터페이스를 부르는 짧은 이름', 'Short name people use for this interface'],
  summary: [true, '무엇을 왜 주고받는지 한두 문장', 'One or two sentences: what is exchanged and why'],
  detail: [false, '요건, 업무 흐름, 예외 상황 등 자세한 내용', 'Requirements, business flow, exceptions in detail'],
  transfer: [false, '결과를 바로 돌려받는지 — 동기 / 비동기 / 비동기 콜백. 연계 담당과 함께 정해요', 'Whether the caller waits for the result — synchronous / asynchronous / asynchronous callback. Decide with the integration team'],
  trigger: [true, 'PUSH: 보내는 쪽이 시작해 수신 시스템에서 처리\nPULL: 받는 쪽이 데이터를 가져가 송신 시스템에서 처리', 'PUSH: the sender starts it and the receiver processes\nPULL: the other side fetches the data and the sender processes'],
  cycle: [true, '얼마나 자주 도는지. 여러 개면 주된 것 하나를 고르고 나머지는 참고에 적어요', 'How often it runs. Several? Pick the main one and add the others under notes'],
  cycleCount: [false, '한 주기에 몇 번 도는지 (실시간 · 수시가 아니면 필수)\n예) 주 3회 → 주, 3 / 5분마다 → 시, 12 / 매일 2시 · 14시 → 일, 2', 'How many runs per period (required unless real time / on demand)\nE.g. 3 times a week → Week, 3 / every 5 minutes → Hour, 12 / daily at 2:00 and 14:00 → Day, 2'],
  perRun: [false, '한 번 실행할 때 오가는 건수 (대략)', 'Records moved in one run (roughly)'],
  recordSize: [false, '한 건의 크기 (Byte, KB, MB)', 'Size of one record (Byte, KB, MB)'],
  relation: [true, '송신 : 수신 시스템 수 (1:1, 1:N, N:1)', 'Number of senders : receivers (1:1, 1:N, N:1)'],
  targetLogic: [true, '받는 쪽이 하는 처리 — Insert, Update, Delete, Select (여러 개 가능)', 'What the receiver does — Insert, Update, Delete, Select (several allowed)'],
  author: [true, '작성자 이름과 연락처. 여러 명이면 첫 사람이 창구, 나머지는 ( ) 안에', 'Author name and contact. Several people: the first is the contact, the others in ( )'],
  writtenAt: [true, '처음 쓴 날짜 (YYYY-MM-DD)', 'Date first written (YYYY-MM-DD)'],
  system: [true, '보내는 쪽 · 받는 쪽 시스템 이름', 'Name of the sending / receiving system'],
  module: [true, '해당 모듈 — SAP 쪽은 꼭 적어요 (FI, CO, MM, SD …)', 'Module — required on the SAP side (FI, CO, MM, SD …)'],
  region: [true, '시스템이 있는 지역 · 법인', 'Region or company the system serves'],
  owner: [true, '시스템 담당자 이름과 연락처. 여러 명이면 나머지는 ( ) 안에', 'System contact name and details. Several people: the others in ( )'],
  adapter: [true, '연결 기술 (RFC, Proxy, JDBC, DB Link, File, FTP, HTTP, SOAP …). 모르면 연계 담당에게 확인', 'Connection technology (RFC, Proxy, JDBC, DB Link, File, FTP, HTTP, SOAP …). Not sure? Ask the integration team'],
  object: [true, '실제로 호출 · 사용하는 대상 (RFC, 테이블, 프로시저, 프로그램 등)', 'What is actually called or used (RFC, table, procedure, program …)'],
  structure: [true, '필드를 담는 단위 — PARAMETER(낱개 값), STRUCTURE(한 건), TABLE(여러 건). 표의 ▸ 그룹 행에 적으면 시스템 블록에 요약돼요', 'Container of the fields — PARAMETER (single values), STRUCTURE (one record), TABLE (many records). Set on each ▸ group row; the system block shows the summary'],
  cardinality: [true, '몇 건이 오가는지 — 0:1 없거나 한 건, 0:N 없거나 여러 건, 1:1 꼭 한 건, 1:N 한 건 이상', 'How many — 0:1 none or one, 0:N none or many, 1:1 exactly one, 1:N one or more'],
  table: [false, '필드가 있는 테이블', 'Table the field lives in'],
  field: [true, '주고받는 필드 이름', 'Name of the exchanged field'],
  key: [true, '키 필드인지 (Y, N)', 'Key field (Y, N)'],
  type: [true, '데이터 타입. SAP 쪽은 DDIC 타입을 DB 타입으로 보여 줘요 (원래 타입은 툴팁)', 'Data type. The SAP side shows the DDIC type as a DB type (the original in the tooltip)'],
  size: [true, '길이', 'Length'],
  nul: [true, '빈 값 허용 — N: 안 됨, Y: 됨', 'Empty allowed — N: no, Y: yes'],
  desc: [true, '필드 뜻', 'What the field means'],
  rule: [false, '적용할 변환 규칙 번호 (R1, R2 …). 내용은 아래 변환 규칙에 적어요', 'Conversion rule number (R1, R2 …), written out under conversion rules'],
  mapping: [true, '이 수신 필드가 값을 받는 송신 행 번호', 'Number of the source row this target field takes its value from'],
  rules: [false, '값을 옮기며 바꾸는 방법. 예) 2014-01-01 → 20140101 ("-" 빼기), 14.256 → 14 (소수 버림)', 'How values change on the way. E.g. 2014-01-01 → 20140101 (drop "-"), 14.256 → 14 (drop decimals)'],
  extract: [false, '어떤 데이터를 고르는지 — 읽는 SELECT, 읽은 뒤의 UPDATE 등', 'Which data is picked — the SELECT that reads it, an UPDATE afterwards, …'],
  remarks: [false, '알아 둘 점 — 시간 제한, 다른 인터페이스와의 순서, 오류 처리 등', 'Good to know — time limits, order with other interfaces, error handling, …'],
  etc: [false, '그 밖의 내용', 'Anything else'],
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

/**
 * program-test — pure functions (no I/O). Used by pt.mjs (CLI) and pt-capture.mjs (hook side).
 *
 * The skill tests an existing program on DEV with rows read from DEV (default), QA or PRD,
 * injected as test doubles into a $TMP harness program. Everything that decides a verdict
 * lives here so it can be unit-tested: masking, data-plan checks, harness build + lint,
 * mutants, the tamper copy and the per-case verdict.
 */

import { createHash } from 'node:crypto';

export const SOURCES = ['dev', 'qa', 'prd'];
export const MAX_ROUNDS = 5;
export const ROW_CAP_DEFAULT = 20;
export const ROW_CAP_MAX = 200;

const up = (s) => String(s ?? '').trim().toUpperCase();
export const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
/** Source text hash that ignores CR / trailing blanks (the file and the upload may differ only there). */
export const srcSha = (s) => sha(String(s ?? '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, ''));

// ── personal data ───────────────────────────────────────────────────────

/** Field names holding personal data: names, address, contact, bank, tax / ID numbers, birth data, user IDs. */
export const PERSONAL_EXACT = new Set([
  'NAME1', 'NAME2', 'NAME3', 'NAME4', 'NAME_CO', 'NAMEV', 'NAME_FIRST', 'NAME_LAST', 'NAME_LST2', 'NAME_TEXT', 'NAMEMIDDLE',
  'NAME_ORG1', 'NAME_ORG2', 'NAME_ORG3', 'NAME_ORG4', 'MC_NAME1', 'MC_NAME2', 'MCOD1', 'MCOD2', 'SORTL', 'SORT1', 'SORT2', 'ENAME', 'VORNA', 'NACHN', 'RUFNM',
  'STRAS', 'STREET', 'STR_SUPPL1', 'STR_SUPPL2', 'STR_SUPPL3', 'HOUSE_NUM1', 'HOUSE_NUM2', 'PFACH', 'PSTL2', 'PO_BOX', 'ORT01', 'ORT02', 'CITY1', 'CITY2', 'MC_STREET', 'MC_CITY1',
  'TELF1', 'TELF2', 'TELFX', 'TELTX', 'TELX1', 'TELBX', 'TEL_NUMBER', 'TEL_EXTENS', 'FAX_NUMBER', 'FAX_EXTENS', 'MOB_NUMBER', 'SMTP_ADDR', 'E_MAIL', 'EMAIL', 'INTAD',
  'BANKN', 'BKONT', 'IBAN', 'KOINH', 'ACCNAME', 'BKREF', 'CCNUM', 'CCINS_NUM',
  'STCD1', 'STCD2', 'STCD3', 'STCD4', 'STCD5', 'STCEG', 'STENR', 'STKZN', 'TAXNUM', 'J_1KFREPRE', 'J_1KFTBUS', 'J_1KFTIND',
  'GBDAT', 'GBORT', 'BIRTHDT', 'BIRTHPL', 'PERID', 'ICNUM', 'IDNUMBER', 'PASSPORT', 'PERNR', 'GESCH',
  'ERNAM', 'AENAM', 'UNAME', 'USNAM', 'BNAME', 'CREATED_BY', 'CHANGED_BY', 'LAST_CHANGED_BY', 'CRUSR', 'CHUSR', 'USERNAME',
  'NAME', 'NAME_LAST2', 'NAME1_TEXT', 'NAMECOMBINED', 'NAME_GRP1', 'NAME_GRP2', 'NICKNAME', 'INITIALS', 'SPNAM', 'EMPLO', 'MCOD3', 'MC_NAMEFIR', 'MC_NAMELAS', 'BU_SORT1', 'BU_SORT2', 'SORT_PHN', 'ANRED', 'FORM', 'PASSNAME', 'PASSFORM', 'PROFESSION', 'CITY', 'HOME_CITY', 'POSTCODE', 'POSTBOX', 'PSTLZ', 'POST_CODE1', 'POST_CODE2', 'POST_CODE3', 'PO_BOX_LOC', 'PO_BOX_LOBBY', 'HOUSE_NUM3', 'LOCATION', 'BUILDING', 'FLOOR', 'ROOMNUMBER', 'EXTENSION1', 'EXTENSION2', 'COUNTY', 'TOWNSHIP', 'MC_COUNTY', 'MC_TOWNSHIP', 'TELEPHONE', 'PHONE', 'MOBILE', 'FAX', 'TELNR_LONG', 'TELNR_CALL', 'SMTP_SRCH', 'WEBUSER', 'KNURL', 'LFURL', 'PASSBIRTH', 'DEATHDT', 'SEX', 'SEXKZ', 'GENDER', 'XSEXM', 'XSEXF', 'XSEXU', 'MARST', 'FAMST', 'NATIO', 'PERNO', 'STCD6', 'XUBNAME',
]);
const DATE_FIELDS = new Set(['GBDAT', 'BIRTHDT']);

/** Tables never read for test data: HR, user / credential, contact / bank detail, secure store. */
const REFUSED_TABLES = [/^PA\d{4}$/, /^PB\d{4}$/, /^HRP\d{4}$/, /^PCL\d$/, /^USR\d\d$/, /^USH\d\d$/, /^UST\d\d$/, /^AGR_/, /^RSECTAB$/, /^RSECSTORE/, /^SSF_PSE/, /^ADR[2-6]$/, /^ADRP$/, /^BUT0ID$/, /^KNBK$/, /^LFBK$/, /^BUT0BK$/, /^TIBAN$/, /^PCA_/];

/** Data elements / domains of personal data (checked on the source field's DDIC, so renamed or custom fields are caught). */
export const PERSONAL_DTEL = new Set([
  'NAME1_GP', 'NAME2_GP', 'NAME3_GP', 'NAME4_GP', 'NAME1', 'NAME2', 'AD_NAME1', 'AD_NAME2', 'AD_NAME3', 'AD_NAME4', 'AD_NAMEFIR', 'AD_NAMELAS', 'AD_NAMEMID', 'AD_NAME_CO', 'AD_NAMTEXT',
  'BU_NAMEP_F', 'BU_NAMEP_L', 'BU_NAMEOR1', 'BU_NAMEOR2', 'BU_NAMEOR3', 'BU_NAMEOR4', 'BU_NAMEPL2', 'BU_MCNAME1', 'BU_MCNAME2', 'NAMEV_VP', 'NAME1_VP', 'EMNAM', 'PAD_VORNA', 'PAD_NACHN', 'VORNA', 'NACHN',
  'STRAS_GP', 'AD_STREET', 'AD_STRSPP1', 'AD_STRSPP2', 'AD_STRSPP3', 'AD_HSNM1', 'AD_HSNM2', 'ORT01_GP', 'ORT02_GP', 'AD_CITY1', 'AD_CITY2', 'PFACH', 'AD_POBX', 'AD_MC_STRT', 'AD_MC_CITY',
  'TELF1', 'TELF2', 'TELFX', 'TELTX', 'TELX1', 'TELBX', 'AD_TLNMBR', 'AD_TLNMBR1', 'AD_TLXTNS', 'AD_FXNMBR', 'AD_FXNMBR1', 'AD_FXXTNS', 'AD_MBNMBR1', 'AD_SMTPADR', 'INTAD',
  'BANKN', 'BKONT', 'IBAN', 'KOINH_FI', 'BU_KOINH', 'BKREF', 'CCNUM', 'CVVAL', 'STCD1', 'STCD2', 'STCD3', 'STCD4', 'STCD5', 'STCEG', 'STENR', 'BPTAXNUM', 'BPTAXNUMXL',
  'GBDAT', 'GBDAT_GP', 'BU_BIRTHDT', 'BU_BIRTHPL', 'GBORT', 'PERID', 'ICNUM', 'PRDNI', 'PERNR_D', 'P_PERNR', 'PERSNO', 'GESCH', 'BU_SEXID',
  'ERNAM', 'AENAM', 'USNAM', 'UNAME', 'XUBNAME', 'SYUNAME', 'BNAME', 'CRUSR', 'CHUSR', 'ABP_CREATION_USER', 'ABP_LASTCHANGE_USER', 'VDM_CREATEDBYUSERID', 'VDM_LASTCHANGEDBYUSERID',
  'S_CUSTNAME', 'S_FORM', 'S_STREET', 'S_POSTBOX', 'S_PHONENO', 'S_EMAIL', 'S_WEBNAME', 'S_PASSNAME', 'S_BIRTHDAT', 'POSTCODE', 'CITY', 'PSTLZ', 'PSTL2', 'NAMECOMBINED', 'SPNAM', 'ANRED', 'ANRED_AP', 'FAMST', 'AD_NAMLAS2', 'AD_INITS', 'AD_SEX', 'AD_PROFESS', 'AD_POBXLOC', 'AD_LCTN', 'AD_BLDNG', 'AD_FLOOR', 'AD_ROOMNUM', 'AD_EXTENS1', 'AD_EXTENS2', 'AD_COUNTY', 'AD_TOWNSHIP', 'AD_TELNRLG', 'AD_TELNRCL', 'BU_NAME1TX', 'BU_NICKNAM', 'BU_EMPLO', 'BU_MARST', 'BU_NATIO', 'BU_PERNO', 'BU_XUBNAME', 'BU_XSEXM', 'BU_XSEXF', 'BU_XSEXU', 'GBDAT_Q', 'GBORT_Q', 'SEXKZ', 'STCD6', 'ERNAM_RF', 'AENAM_RF', 'REPRES',
]);
export const PERSONAL_DOMAIN = new Set(['AD_SMTPADR', 'AD_TLNMBR', 'AD_FXNMBR', 'XUBNAME', 'USNAM', 'PERNR', 'BANKN', 'IBAN', 'STCD1', 'STCD2', 'STCD3', 'STCEG', 'GBDAT', 'BU_BIRTHDT', 'TELF1', 'AD_STREET', 'AD_NAME', 'NAME', 'ORT01', 'STRAS',
  'AD_SMTPAD2', 'AD_TELNRLG', 'AD_TELNRCL', 'AD_NAMEFIR', 'AD_NAMELAS', 'BU_NAME', 'S_CUSTNAME', 'S_PHONENO', 'S_EMAIL', 'POSTCODE', 'PSTLZ', 'TELF2', 'TELFX',
]);

/** Field-name shapes of personal data (names, phone / fax / mobile, e-mail, birth, street lines, bank and tax numbers). */
export const PERSONAL_NAME_PATTERNS = [
  /^NAME(\d|_|$|V$|COMBINED|MIDDLE)/, /_NAME\d?$/,
  // custom fields (Z tables): CUSTNAME, FULLNAME, CONTACT_NAME, NAME_KR, …
  /NAME\d?$|_NAME|NAME_/, /CONTACT|ANSPR|SACHB|OWNER|RESP_?PERS|TITLE_LET|SALUT/, /HOMEPAGE|URL|URI$|IP_?ADDR/,
  /^MC_(NAME|STREET|CITY|COUNTY|TOWNSHIP)/, /TELEPHONE|PHONE|MOBILE/, /^(TEL|FAX|MOB)/,
  /SMTP|MAIL/, /BIRTH|GBDAT|GEB|DOB|DEATHDT/, /^(STREET|STRAS|STR_SUPPL|HOUSE_NUM|POST_CODE|PSTLZ|ORT0)/, /^CITY\d?$/, /IBAN|BANKN/, /^STCD\d$/,
];
/** Data element / domain shapes of personal data — checked on the source field's DDIC. */
export const PERSONAL_DDIC_PATTERNS = [
  /^AD_NAME/, /^AD_MC_/, /^AD_(TLNMBR|TLXTNS|FXNMBR|FXXTNS|MBNMBR|TELNR|SMTPAD|STRSPP|HSNM|PSTCD|SORT|SRTPHN|CITY\d)/,
  /^BU_(NAME|MCNAME|BIRTH|DEATH|NICKNAM|SORT\d|XSEX)/, /^NAME\d/, /^NAMEV/, /^(TELF|TELX|TELBX|TELTX)/, /^(STRAS|ORT0\d|PSTLZ|PSTL2|PFACH)(_|$)/,
  /^MCD[DK]\d$/, /SMTP|E_?MAIL/, /PHONE|TELNR|FAXNR|MOBNR/, /BIRTH|GBDAT|GBORT|GEB|DOB/, /IBAN|BANKN|BKONT/, /^STCD\d/,
  // custom data elements (Z*): ZZ_CUSTNAME, Z_CONTACT_NAME, ZURL, …
  /NAME\d?$|_NAME|NAME_/, /CONTACT|ANSPR|SACHB|OWNER|RESP_?PERS|TITLE_LET|SALUT/, /HOMEPAGE|URL|URI$|IP_?ADDR/,
];

export function isPersonalField(name, extra = [], ddic = null) {
  const n = up(name);
  if (PERSONAL_EXACT.has(n) || extra.map(up).includes(n)) return true;
  if (PERSONAL_NAME_PATTERNS.some((re) => re.test(n))) return true;
  if (!ddic) return false;
  const r = up(ddic.rollname);
  const d = up(ddic.domname);
  return PERSONAL_DTEL.has(r) || PERSONAL_DOMAIN.has(d) || PERSONAL_DDIC_PATTERNS.some((re) => (r && re.test(r)) || (d && re.test(d)));
}

/**
 * Data elements / domains that are clearly non-personal (client, org keys, country / region / language, partner and
 * document numbers, type / status / flag codes, plain document dates, amounts, quantities, currency and unit keys).
 * Anything not on this list is masked on a masked read.
 */
export const CLEAR_DDIC = new Set([
  'MANDT', 'S_MANDT', 'BUKRS', 'WERKS', 'WERKS_D', 'WERKS_EXT', 'VKORG', 'VTWEG', 'SPART', 'VKBUR', 'VKGRP', 'EKORG', 'EKGRP', 'LGORT',
  'LGORT_D', 'LGNUM', 'KOKRS', 'KOSTL', 'PRCTR', 'GSBER', 'VSTEL', 'BWKEY', 'LAND1', 'LAND1_GP', 'S_COUNTRY', 'AD_COMCTRY', 'AD_POBXCTY', 'AD_NATION',
  'REGIO', 'S_REGION', 'REGIOGROUP', 'SPRAS', 'LANGU', 'BU_LANGU_CORR', 'LZONE', 'AD_TZONE', 'TZNZONE', 'TXJCD', 'AD_TXJCD', 'KUNNR', 'LIFNR', 'BU_PARTNER',
  'PARNR', 'ADRNR', 'AD_ADDRNUM', 'AD_PERSNUM', 'AD_CONSNUM', 'S_CUSTOMER', 'MATNR', 'CHARG_D', 'VBELN', 'VBELN_VA', 'VBELN_VL', 'VBELN_VF', 'POSNR', 'POSNR_VA',
  'POSNR_VL', 'POSNR_VF', 'EBELN', 'EBELP', 'BANFN', 'BNFPO', 'BELNR', 'BELNR_D', 'BUZEI', 'GJAHR', 'MBLNR', 'MJAHR', 'MBLPO', 'AUFNR',
  'SAKNR', 'HKONT', 'S_CARR_ID', 'S_CONN_ID', 'S_BOOK_ID', 'S_AGNCYNUM', 'S_COUNTNUM', 'KTOKD', 'KTOKK', 'BU_GROUP', 'BU_GRPTYP', 'BU_LEGENTY', 'BU_INDSECT', 'BRSCH',
  'KUKLA', 'KDGRP', 'AUART', 'BSART', 'BLART', 'BWART', 'PSTYV', 'S_CUSTTYPE', 'S_CLASS', 'S_CANCEL', 'S_RESERV', 'S_INVFLAG', 'S_SMOKER', 'AD_GROUP',
  'AD_COMM', 'AD_FLGDFAD', 'AD_FLGDFNR', 'AD_FLNOUSE', 'AD_FLGHOME', 'LOEVM_X', 'SPERB_X', 'SPERM_X', 'AUFSD_X', 'LIFSD_X', 'FAKSD_X', 'CASSD_X', 'NODEL_X', 'XCPDK',
  'BU_XBLCK', 'BU_XDELE', 'BU_XPCPT', 'AD_XPCPT', 'XFELD', 'DATA_TEMPERATURE', 'ERDAT', 'ERDAT_RF', 'AEDAT', 'UPDAT_RF', 'UPTIM_RF', 'BUDAT', 'BLDAT', 'CPUDT',
  'CPUTM', 'AUDAT', 'BEDAT', 'EINDT', 'S_BDATE', 'AD_DATE_FR', 'AD_DATE_TO', 'AD_VALFROM', 'AD_VALTO', 'BU_BP_VALID_FROM', 'BU_BP_VALID_TO', 'WAERS',
  'WAERK', 'S_CURR', 'S_CURRCODE', 'S_F_CUR_PR', 'S_L_CUR_PR', 'S_DISCOUNT', 'NETWR', 'NETWR_AP', 'NETPR', 'DMBTR', 'WRBTR', 'KBETR', 'MENGE_D', 'BSTMG',
  'KWMENG', 'LFIMG', 'FKIMG', 'MEINS', 'VRKME', 'BSTME', 'S_LUGWEIGH', 'S_WEIUNIT', 'BRGEW', 'NTGEW', 'GEWEI',
]);
/** DDIC data types that are never personal on their own. */
export const CLEAR_DATATYPES = new Set(['CURR', 'QUAN', 'CUKY', 'UNIT']);

/** Keep this field in clear on a masked read? Only with its DDIC, on the clear list, and matching no personal shape. */
export function isClearField(name, extra = [], ddic = null) {
  if (!ddic) return false;
  if (isPersonalField(name, extra, ddic)) return false;
  return CLEAR_DDIC.has(up(ddic.rollname)) || CLEAR_DDIC.has(up(ddic.domname)) || CLEAR_DATATYPES.has(up(ddic.datatype));
}

/**
 * Field → { rollname, domname } of one table from a GetTable response: the ECC bridge JSON
 * (DD03L rows) or the S/4 table source (`name : data_element;`). null when nothing is found.
 */
export function ddicFromGetTable(text) {
  const d = safeJson(text);
  const body = d && typeof d.table_data === 'string' ? d.table_data : typeof text === 'string' ? text : '';
  const fields = {};
  const asJson = safeJson(body);
  if (asJson && typeof asJson === 'object') {
    const walk = (o, depth = 0) => {
      if (!o || typeof o !== 'object' || depth > 5) return;
      if (Array.isArray(o)) return o.forEach((x) => walk(x, depth + 1));
      const k = Object.fromEntries(Object.entries(o).map(([a, b]) => [a.toLowerCase(), b]));
      if (typeof k.fieldname === 'string' && k.fieldname && !k.fieldname.startsWith('.')) fields[up(k.fieldname)] = { rollname: up(k.rollname || k.data_element || ''), domname: up(k.domname || k.domain || ''), datatype: up(k.datatype || k.data_type || '') };
      for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, depth + 1);
    };
    walk(asJson);
  } else {
    for (const line of String(body).replace(/\r/g, '').split('\n')) {
      const m = line.match(/^\s*(?:key\s+)?([a-z0-9_/]+)\s*:\s*([a-z0-9_/]+)(?:\.([a-z0-9_]+))?/i);
      if (m && !/^(include|annotation|@)/i.test(m[1])) fields[up(m[1])] = /^abap$/i.test(m[2]) ? { rollname: '', domname: '', datatype: up(m[3]) } : { rollname: up(m[2]), domname: '' };
    }
  }
  return Object.keys(fields).length ? fields : null;
}

/** Table names a SELECT text mentions after FROM / JOIN (also inside sub-queries) — for the refusal check only. */
export function tablesInSql(sql) {
  return [...String(sql || '').matchAll(/\b(?:FROM|JOIN)\s+([\w/]+)/gi)].map((m) => up(m[1]));
}

const SQL_DENY_WORDS = /\b(?:UNION|INTERSECT|EXCEPT|WITH|JOIN|INNER|OUTER|LEFT|RIGHT|CROSS|EXISTS|GROUP|HAVING|CASE|CAST|COALESCE|OFFSET|CLIENT|USING|BYPASSING|APPENDING|INTO|FOR|PACKAGE|CONNECTION|ALL|ANY|SOME)\b/i;
const COND_WORDS = new Set(['AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'INITIAL', 'ESCAPE', 'EQ', 'NE', 'LT', 'GT', 'LE', 'GE']);
const COND_TOKEN = /'L'|-?\d+(?:\.\d+)?|<>|<=|>=|=|<|>|\(|\)|,|[\w/]+(?:~[\w/]+)?|\s+/gy;

/** WHERE condition of the strict grammar: fields, literals, comparisons, AND / OR / NOT, IN ( list ), BETWEEN, LIKE, IS [NOT] NULL / INITIAL. */
function simpleCondition(cond) {
  const toks = [];
  COND_TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < cond.length) {
    COND_TOKEN.lastIndex = pos;
    const m = COND_TOKEN.exec(cond);
    if (!m || m.index !== pos) return false; // a character outside the grammar
    pos += m[0].length;
    if (m[0].trim()) toks.push(m[0]);
  }
  let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === '(') {
      const prev = up(toks[i - 1] || '');
      if (i > 0 && !['IN', 'AND', 'OR', 'NOT', '('].includes(prev)) return false; // no function calls
      depth++;
    } else if (t === ')') {
      if (--depth < 0) return false;
    } else if (/^[A-Za-z_/]/.test(t) && !COND_WORDS.has(up(t)) && toks[i + 1] === '(') return false;
  }
  return depth === 0;
}

/**
 * Strict allow-list for SELECTs whose rows may be saved:
 *   SELECT [SINGLE] [DISTINCT] <field [AS alias]>… | * FROM <one table> [[AS] alias]
 *     [WHERE <simple condition>] [UP TO n ROWS] [ORDER BY fields [ASC|DESC]]
 * One SELECT, one table, plain fields only. No JOIN, sub-query, UNION / INTERSECT / EXCEPT, WITH,
 * expression, host variable, comment or semicolon. Anything else → { ok: false, why }.
 * @returns {{ok: true, table: string, columns: Map<string,string>, star: boolean} | {ok: false, why: string}}
 */
export function parseSelect(sql) {
  const raw = String(sql || '');
  if (/^\s*\*/m.test(raw)) return { ok: false, why: 'comment line' };
  // string literals out first ('' is an escaped quote); an unterminated one fails
  let s = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "'") { s += raw[i]; continue; }
    let j = i + 1;
    for (;;) {
      if (j >= raw.length) return { ok: false, why: 'unterminated literal' };
      if (raw[j] === "'" && raw[j + 1] === "'") { j += 2; continue; }
      if (raw[j] === "'") break;
      j++;
    }
    s += "'L'";
    i = j;
  }
  if (/["`;@|{}#\\]|--|\/\*|\*\//.test(s)) return { ok: false, why: 'comment, host variable, template or statement separator' };
  s = s.replace(/\s+/g, ' ').trim();
  if ((s.match(/\bSELECT\b/gi) || []).length !== 1 || (s.match(/\bFROM\b/gi) || []).length !== 1) return { ok: false, why: 'more than one SELECT / FROM' };
  if (SQL_DENY_WORDS.test(s)) return { ok: false, why: `not in the strict grammar: ${s.match(SQL_DENY_WORDS)[0].toUpperCase()}` };
  const m = s.match(/^SELECT (?:SINGLE )?(?:DISTINCT )?(.+?) FROM ([\w/]+)(?: (?:AS )?(?!WHERE\b|UP\b|ORDER\b)(\w+))?(?: WHERE (.+?))?(?: UP TO \d+ ROWS)?(?: ORDER BY [\w~/]+(?: ?, ?[\w~/]+)*(?: (?:ASCENDING|DESCENDING|ASC|DESC))?)?$/i);
  if (!m) return { ok: false, why: 'statement shape outside the strict grammar' };
  if (m[4] && !simpleCondition(m[4])) return { ok: false, why: 'WHERE outside the strict grammar' };
  const columns = new Map();
  let star = false;
  const toks = m[1].split(/\s*,\s*|\s+/).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === '*' || /^\w+~\*$/.test(t)) { star = true; continue; }
    const f = t.match(/^(?:[\w/]+~)?([\w/]+)$/);
    if (!f || /^AS$/i.test(t)) return { ok: false, why: `select list item ${t} is not a plain field` };
    let out = up(f[1]);
    if (/^AS$/i.test(toks[i + 1] || '')) {
      const alias = toks[i + 2];
      if (!alias || !/^[\w/]+$/.test(alias)) return { ok: false, why: 'AS without an alias' };
      out = up(alias);
      i += 2;
    }
    // a repeated output name would let one column's values be saved under another field's rules
    if (columns.has(out)) return { ok: false, why: `output name ${out} repeats` };
    columns.set(out, up(f[1]));
  }
  if (!columns.size && !star) return { ok: false, why: 'empty select list' };
  if (star && columns.size) return { ok: false, why: '* together with named columns' };
  return { ok: true, table: up(m[2]), columns, star };
}

export function isRefusedTable(name) {
  const t = up(name);
  return REFUSED_TABLES.some((re) => re.test(t));
}

/** Deterministic stand-in: same input → same token (joins between tables still match), length ≤ original. */
export function maskValue(value, field, salt) {
  const s = String(value ?? '');
  if (!s.trim()) return s;
  const f = up(field);
  if (DATE_FIELDS.has(f)) return /^\d{4}-\d{2}-\d{2}$/.test(s) ? '1900-01-01' : '19000101';
  if (/BIRTH|GBDAT|GEB|DOB|DEATHDT/.test(f) && /^(\d{8}|\d{4}-\d{2}-\d{2})$/.test(s.trim())) return s.includes('-') ? '1900-01-01' : '19000101';
  const h = sha(`${salt}|${s.trim()}`);
  if (/^\d+$/.test(s)) return [...s].map((_, i) => String(parseInt(h[i % h.length], 16) % 10)).join('');
  const len = Math.min(s.length, 12);
  return ('M' + h.toUpperCase()).slice(0, len);
}

/** Salted fingerprint of a raw personal value — kept so a leak into harness source can be found without keeping the value. */
export const fingerprint = (value, salt) => sha(`fp|${salt}|${String(value).trim()}`);

/** Token schemes of the MCP server's `mask` (`masking.version`) this plugin accepts — v2 only: v1 servers kept fields of unlisted data elements in clear. */
export const MASK_VERSIONS = ['hmac-v2'];

/**
 * Production test data stays locked until the MCP release with HMAC masking is pinned and
 * installed (flipped only in that release commit, after the user's OK). The read gate's
 * masked-probe proof applies on top at run time.
 */
export const MASKING_RELEASE_PINNED = false;
export const PRD_LOCKED = 'Production rows are locked until the MCP release that masks with its own key is pinned and installed — use QA or DEV data.';

/**
 * Mask every personal column of the rows. Default-deny when `opts.ddic` is given: a column is kept
 * only if it maps (through `opts.columns`, alias → source field, or by its own name) to a DDIC field
 * of the table that is not personal by name, data element or domain; anything unmapped is masked.
 * @param {{ddic?: Record<string,{rollname:string,domname:string}>|null, columns?: Map<string,string|null>|null, star?: boolean}} [opts]
 * @returns {{rows: object[], masked: string[], fingerprints: string[]}}
 */
export function maskRows(rows, salt, extra = [], opts = {}) {
  const masked = new Set();
  const fps = new Set();
  const personal = (col) => {
    if (!opts.ddic) return true; // no DDIC: nothing is known to be clear
    const C = up(col);
    let src;
    if (opts.columns) src = opts.columns.has(C) ? opts.columns.get(C) : opts.star ? C : null; // SELECT: by its list
    else src = C;
    if (!src) return true; // expression or unknown column
    const dd = opts.ddic[src];
    if (!dd) return true; // not a field of this table
    return !isClearField(src, extra, dd) || isPersonalField(C, extra);
  };
  const out = rows.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r || {})) {
      if (personal(k) && String(v ?? '').trim()) {
        masked.add(up(k));
        if (String(v).trim().length >= 3) fps.add(fingerprint(v, salt));
        o[k] = maskValue(v, k, salt);
      } else o[k] = v;
    }
    return o;
  });
  return { rows: out, masked: [...masked].sort(), fingerprints: [...fps] };
}

/** Rows of a table-read MCP response (GetTableContents / GetSqlQuery / GetRemoteTableContents), or null. */
export function extractRows(text) {
  let data;
  try {
    data = JSON.parse(text);
    if (typeof data === 'string') data = JSON.parse(data);
  } catch {
    return null;
  }
  const find = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 3) return null;
    if (Array.isArray(o.rows)) return o;
    for (const k of ['result', 'data', 'content']) {
      const hit = find(typeof o[k] === 'string' ? safeJson(o[k]) : o[k], depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  const hit = find(data);
  if (!hit) return null;
  const cols = (hit.columns || hit.fields || []).map((c) => (typeof c === 'string' ? c : c?.name)).filter(Boolean);
  const rows = hit.rows.map((r) => {
    // array rows need a name for every value — an unnamed column could not be masked
    if (Array.isArray(r)) return r.length <= cols.length ? Object.fromEntries(r.map((v, i) => [cols[i], v])) : null;
    return r && typeof r === 'object' ? r : null;
  });
  if (rows.some((r) => r === null)) return null;
  return { columns: cols, rows };
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ── data plan ───────────────────────────────────────────────────────────

/**
 * Check a data plan: { source, destination?, tables: [{ table, fields[], where?, max_rows?, cases[] }] }.
 * @returns {string[]} problems (empty = OK)
 */
export function checkPlan(plan, caseIds = []) {
  const p = [];
  if (!SOURCES.includes(plan?.source)) p.push(`source must be one of ${SOURCES.join(' / ')}`);
  if (plan?.source === 'prd' && !MASKING_RELEASE_PINNED) p.push(PRD_LOCKED);
  if (plan?.source !== 'dev' && !String(plan?.destination || '').trim()) p.push(`source ${plan?.source} needs the SM59 destination from config.json → testDataSources.${plan?.source}`);
  if (plan?.source === 'dev' && plan?.destination) p.push('source dev reads the connected system — no destination');
  const tables = Array.isArray(plan?.tables) ? plan.tables : [];
  if (!tables.length) p.push('no tables in the plan');
  const known = new Set(caseIds.map(up));
  for (const t of tables) {
    const name = up(t.table);
    if (!name) { p.push('a table entry without a name'); continue; }
    if (isRefusedTable(name)) p.push(`${name}: personal / credential table — not read for test data`);
    if (!Array.isArray(t.fields) || !t.fields.length) p.push(`${name}: list the fields the logic reads (no full-row reads)`);
    const personal = (t.fields || []).filter((f) => isPersonalField(f));
    if (personal.length && !t.personal_reason) p.push(`${name}: personal fields ${personal.join(', ')} need personal_reason (they are masked, but read only when the logic uses them)`);
    const cap = t.max_rows ?? ROW_CAP_DEFAULT;
    if (!(cap > 0 && cap <= ROW_CAP_MAX)) p.push(`${name}: max_rows ${cap} outside 1..${ROW_CAP_MAX}`);
    if (plan.source !== 'dev' && !String(t.where || '').trim()) p.push(`${name}: a WHERE on key / indexed fields is required for ${plan.source}`);
    if (!Array.isArray(t.cases) || !t.cases.length) p.push(`${name}: name the cases that need it`);
    for (const c of t.cases || []) if (known.size && !known.has(up(c))) p.push(`${name}: unknown case ${c}`);
  }
  return p;
}

/** Cases file checks: ids, methods, assertion basis, the not-testable reason. */
export function checkCases(cases) {
  const p = [];
  const list = Array.isArray(cases?.cases) ? cases.cases : [];
  if (!list.length) p.push('no cases');
  const ids = new Set();
  const methods = new Set();
  for (const c of list) {
    const id = up(c.id);
    if (!/^C\d{2,3}$/.test(id)) p.push(`${c.id}: id must look like C01`);
    if (ids.has(id)) p.push(`${id}: duplicate id`);
    ids.add(id);
    if (!c.rule) p.push(`${id}: rule (spec section or source line) missing`);
    if (c.testable === false) {
      if (!c.not_testable_reason) p.push(`${id}: not_testable_reason missing`);
      continue;
    }
    const m = up(c.method);
    if (!/^[A-Z][A-Z0-9_]{0,29}$/.test(m)) p.push(`${id}: method name must be an ABAP name ≤ 30`);
    if (!m.startsWith(id)) p.push(`${id}: method must start with the case id (${id}_…)`);
    if (methods.has(m)) p.push(`${id}: duplicate method ${m}`);
    methods.add(m);
    if (!['osql', 'override', 'param'].includes(c.double)) p.push(`${id}: double must be osql / override / param`);
  }
  const kinds = new Set(list.map((c) => c.kind));
  for (const k of ['positive', 'negative']) if (list.length && !kinds.has(k)) p.push(`no ${k} case`);
  return p;
}

/** Expected file checks: every testable case has ≥ 1 concrete value. */
export function checkExpected(cases, expected) {
  const p = [];
  for (const c of cases?.cases || []) {
    if (c.testable === false) continue;
    const e = expected?.cases?.[c.id] || expected?.cases?.[up(c.id)];
    if (!e) { p.push(`${c.id}: no expected entry`); continue; }
    const vals = (e.values || []).filter((v) => v && v.value !== undefined && v.value !== null && String(v.value) !== '');
    if (!vals.length) p.push(`${c.id}: at least one concrete expected value is required`);
    if (!e.basis) p.push(`${c.id}: basis (how the value follows from the spec and the rows) missing`);
  }
  return p;
}

// ── harness ─────────────────────────────────────────────────────────────

/** Harness / mutant / tamper program names (customer namespace kept, ≤ 30 chars). */
export function harnessNames(prog) {
  const P = up(prog);
  const base = /^[ZY]/.test(P) ? P.slice(0, 27) : `ZPT_${sha(P).slice(0, 8).toUpperCase()}`;
  return { harness: `${base}_PT`, mutants: [1, 2, 3].map((i) => `${base}_M${i}`), tamper: `${base}_TX` };
}

/** Harness = the main program with its REPORT / PROGRAM name swapped + the local test class appended. Includes stay referenced, never copied. */
export function buildHarness(mainSource, name, testClass) {
  const src = String(mainSource).replace(/\r/g, '');
  const re = /^(\s*)(REPORT|PROGRAM)(\s+)([\w/]+)/im;
  if (!re.test(src)) throw new Error('no REPORT / PROGRAM statement in the main program source');
  const head = src.replace(re, (_, a, kw, b) => `${a}REPORT${b}${up(name)}`);
  return `${head.replace(/\n+$/, '')}\n\n* ---- program-test harness (generated by scripts/program-test/pt.mjs; do not edit) ----\n${String(testClass).replace(/\r/g, '').replace(/\n+$/, '')}\n`;
}

/** Body text of METHOD m … ENDMETHOD. in source, or null. */
export function methodBody(source, m) {
  const re = new RegExp(`^\\s*METHOD\\s+${m}\\s*\\.([\\s\\S]*?)^\\s*ENDMETHOD\\s*\\.`, 'im');
  const hit = String(source).match(re);
  return hit ? hit[1] : null;
}

const stripComments = (s) => String(s).replace(/\r/g, '').split('\n').filter((l) => !/^\*/.test(l)).map((l) => l.replace(/".*$/, '')).join('\n');
const VALUE_ASSERT = /cl_abap_unit_assert=>(assert_equals|assert_table_contains|assert_char_cp|assert_number_between|assert_differs)\b/i;

function literalPresent(body, value) {
  const v = String(value);
  if (/^-?\d+(\.\d+)?$/.test(v)) return new RegExp(`(^|[^\\w.])'?${v.replace('.', '\\.')}'?($|[^\\w])`).test(body);
  const esc = v.replace(/'/g, "''");
  return body.includes(`'${esc}'`) || body.includes(`\`${v}\``) || body.includes(`|${v}|`);
}

/**
 * Lint the test class against cases + expected + data plan.
 * @returns {string[]} problems (empty = OK)
 */
export function lintHarness(testClass, cases, expected, plan, fingerprints = [], salt = '') {
  const p = [];
  const src = stripComments(testClass);
  if (!/FOR\s+TESTING/i.test(src)) p.push('no FOR TESTING class');
  if (!/RISK\s+LEVEL\s+HARMLESS/i.test(src)) p.push('test class must be RISK LEVEL HARMLESS');
  if (/\bCOMMIT\s+WORK\b/i.test(src)) p.push('COMMIT WORK in the test class');
  if (/\bIN\s+UPDATE\s+TASK\b/i.test(src)) p.push('update-task call in the test class');
  if (/\b(INSERT\s+(INTO\s+)?[a-z]\w*\s+(VALUES|FROM\s+TABLE)|UPDATE\s+[a-z]\w*\s+SET|DELETE\s+FROM\s+[a-z]\w*)\b/i.test(src) && !/cl_osql_test_environment/i.test(src))
    p.push('database write statement in the test class');
  if (/cl_abap_unit_assert=>skip/i.test(src)) p.push('skipped test (assert=>skip)');
  const osqlCases = (cases?.cases || []).filter((c) => c.testable !== false && c.double === 'osql');
  if (osqlCases.length) {
    if (!/cl_osql_test_environment=>create/i.test(src)) p.push('osql cases but no cl_osql_test_environment=>create');
    for (const t of plan?.tables || []) {
      if (!t.cases?.some((id) => osqlCases.some((c) => up(c.id) === up(id)))) continue;
      if (!new RegExp(`'${up(t.table)}'`, 'i').test(src)) p.push(`${up(t.table)} is not in the osql dependency list`);
    }
  }
  for (const c of cases?.cases || []) {
    if (c.testable === false) continue;
    const m = up(c.method);
    const body = methodBody(src, m);
    if (body === null) { p.push(`${c.id}: METHOD ${m} not implemented`); continue; }
    if (!new RegExp(`\\b${m}\\b[^.]*FOR\\s+TESTING`, 'i').test(src) && !new RegExp(`METHODS\\s*:?[^.]*\\b${m}\\b[^.]*FOR\\s+TESTING`, 'i').test(src))
      p.push(`${c.id}: ${m} is not declared FOR TESTING`);
    if (!VALUE_ASSERT.test(body)) p.push(`${c.id}: no value assertion (assert_equals / assert_table_contains / …)`);
    const same = body.match(/act\s*=\s*([\w\-\>\[\]()]+)\s+exp\s*=\s*([\w\-\>\[\]()]+)/i);
    if (same && same[1].toLowerCase() === same[2].toLowerCase()) p.push(`${c.id}: act and exp are the same expression`);
    const e = expected?.cases?.[c.id] || expected?.cases?.[up(c.id)];
    for (const v of e?.values || []) if (!literalPresent(body, v.value)) p.push(`${c.id}: expected value ${JSON.stringify(v.value)} (${v.what}) is not asserted in ${m}`);
  }
  if (fingerprints.length) {
    const fp = new Set(fingerprints);
    const lits = [...String(testClass).matchAll(/'((?:[^']|'')*)'|`([^`]*)`|\|([^|{}]*)\|/g)].map((x) => (x[1] ?? x[2] ?? x[3] ?? '').replace(/''/g, "'").trim());
    const nums = [...String(testClass).matchAll(/\b\d{5,}\b/g)].map((x) => x[0]);
    const leaked = [...new Set([...lits, ...nums])].filter((v) => v.length >= 3 && fp.has(fingerprint(v, salt)));
    if (leaked.length) p.push(`${leaked.length} unmasked personal value(s) in the test class — use the masked rows (pt.mjs abap-rows)`);
  }
  return p;
}

/** ABAP VALUE #( … ) rows for a test double from masked rows. */
export function abapRows(rows, fields) {
  const cols = (fields?.length ? fields : Object.keys(rows[0] || {})).map(up);
  const lit = (v) => {
    let s = String(v ?? '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = s.replace(/-/g, '');
    return `'${s.replace(/'/g, "''")}'`;
  };
  const lines = rows.map((r) => {
    const byUp = Object.fromEntries(Object.entries(r).map(([k, v]) => [up(k), v]));
    const parts = cols.filter((c) => byUp[c] !== undefined && String(byUp[c]) !== '').map((c) => `${c.toLowerCase()} = ${lit(byUp[c])}`);
    return `    ( ${parts.join(' ')} )`;
  });
  return `VALUE #(\n${lines.join('\n')}\n  )`;
}

// ── mutants + tamper ────────────────────────────────────────────────────

const FLIPS = [
  [/ >= /, ' < '], [/ <= /, ' > '], [/ > /, ' <= '], [/ < /, ' >= '], [/ <> /, ' = '], [/ = /, ' <> '],
  [/ GE /i, ' LT '], [/ LE /i, ' GT '], [/ GT /i, ' LE '], [/ LT /i, ' GE '], [/ NE /i, ' EQ '], [/ EQ /i, ' NE '],
  [/ IS NOT INITIAL/i, ' IS INITIAL'], [/ IS INITIAL/i, ' IS NOT INITIAL'], [/ AND /i, ' OR '], [/ OR /i, ' AND '],
];
const CONDITION_LINE = /^\s*(IF|ELSEIF|CHECK|WHERE|AND|OR|WHEN|WHILE|CASE|DELETE\s+\w+\s+WHERE|LOOP\s+AT\s+.*\bWHERE)\b|\bWHERE\b/i;

/**
 * Mutation candidates on the source lines the cases cite ("INCLUDE:line").
 * @param {Record<string,string>} sources name → source
 * @param {string[]} cites e.g. ["ZPROG_F01:120"]
 */
export function mutationCandidates(sources, cites, max = 3) {
  const out = [];
  const seen = new Set();
  for (const cite of cites) {
    const m = String(cite).match(/^([\w/]+):(\d+)$/);
    if (!m) continue;
    const name = up(m[1]);
    const lineNo = Number(m[2]);
    const src = sources[name];
    if (!src) continue;
    const lines = src.replace(/\r/g, '').split('\n');
    // the cited line or the nearest condition line within 3 lines after it
    for (let k = lineNo; k <= Math.min(lineNo + 3, lines.length); k++) {
      const line = lines[k - 1];
      if (!line || /^\*/.test(line) || !CONDITION_LINE.test(line)) continue;
      const code = line.replace(/".*$/, '');
      const flip = FLIPS.find(([re]) => re.test(code));
      if (!flip) continue;
      const key = `${name}:${k}`;
      if (seen.has(key)) break;
      seen.add(key);
      out.push({ include: name, line: k, before: line.trim(), after: line.replace(flip[0], flip[1]).trim() });
      break;
    }
    if (out.length >= max) break;
  }
  return out;
}

/** Mutant program: the harness with the mutated include copied in place of its INCLUDE statement (or the main body mutated). */
export function buildMutant(harnessSource, name, mutation, sources, mainName) {
  const H = String(harnessSource).replace(/\r/g, '');
  const rename = (s) => s.replace(/^(\s*)REPORT(\s+)([\w/]+)/im, (_, a, b) => `${a}REPORT${b}${up(name)}`);
  const mutateText = (text) => {
    const lines = text.replace(/\r/g, '').split('\n');
    const orig = lines[mutation.line - 1];
    const flip = FLIPS.find(([re]) => re.test(orig.replace(/".*$/, '')));
    if (!flip) throw new Error(`no flip on ${mutation.include}:${mutation.line}`);
    lines[mutation.line - 1] = `${orig.replace(flip[0], flip[1])} " program-test mutant`;
    return lines.join('\n');
  };
  if (up(mutation.include) === up(mainName)) {
    // main program body: harness = main + test class; the main lines keep their numbers.
    return rename(mutateText(H));
  }
  const inc = sources[up(mutation.include)];
  if (!inc) throw new Error(`include ${mutation.include} source not captured`);
  const re = new RegExp(`^\\s*INCLUDE\\s+${up(mutation.include).replace('/', '\\/')}\\s*\\.\\s*$`, 'im');
  if (!re.test(H)) throw new Error(`INCLUDE ${mutation.include} not found in the harness main body`);
  const body = mutateText(inc).replace(/^\s*(REPORT|PROGRAM|FUNCTION-POOL)\b[^.]*\./im, '');
  return rename(H.replace(re, () => `* ---- mutant copy of ${up(mutation.include)} ----\n${body}\n* ---- end of copy ----`));
}

/** Tamper copy: one expected literal in one case method flipped — the run must fail. */
export function buildTamper(harnessSource, name, cases, expected) {
  const H = String(harnessSource).replace(/\r/g, '');
  for (const c of cases?.cases || []) {
    if (c.testable === false) continue;
    const m = up(c.method);
    const e = expected?.cases?.[c.id] || expected?.cases?.[up(c.id)];
    const body = methodBody(H, m);
    if (!body || !e) continue;
    for (const v of e.values || []) {
      const s = String(v.value);
      const isNum = /^-?\d+(\.\d+)?$/.test(s);
      const from = isNum ? new RegExp(`(^|[^\\w.'])('?)${s.replace('.', '\\.')}('?)(?=$|[^\\w])`) : null;
      let nb = null;
      if (isNum && from.test(body)) nb = body.replace(from, (_, a, q1, q2) => `${a}${q1}${String(Number(s) + 1)}${q2}`);
      else if (!isNum && body.includes(`'${s.replace(/'/g, "''")}'`)) nb = body.replace(`'${s.replace(/'/g, "''")}'`, `'${s}#TAMPER'`);
      if (nb === null) continue;
      const out = H.replace(body, () => nb).replace(/^(\s*)REPORT(\s+)([\w/]+)/im, (_, a, b) => `${a}REPORT${b}${up(name)}`);
      return { source: out, case: c.id, method: m, value: v.value };
    }
  }
  return null;
}

// ── verdict ─────────────────────────────────────────────────────────────

const ts = (e) => e?.t || '';

/** Newest AUnit result (with method_results) for program `prog` after time `after`. */
function lastResult(entries, prog, after) {
  const P = up(prog);
  const runs = new Map();
  for (const e of entries) if (e.tool === 'RunUnitTest' && e.run_id && (e.containers || []).includes(P)) runs.set(e.run_id, e);
  const hits = entries.filter((e) => ts(e) >= after && e.aunit && !e.aunit.unparsed && (((e.containers || []).includes(P) && e.tool === 'RunUnitTest') || (e.tool === 'GetUnitTestResult' && runs.has(e.run_id) && (runs.get(e.run_id).containers || []).includes(P)) || (e.aunit.programs || []).includes(P)));
  return hits[hits.length - 1] || null;
}

function lastWrite(entries, name) {
  const N = up(name);
  return entries.filter((e) => e.kind === 'write' && (e.names || []).includes(N)).pop() || null;
}

/** First successful activation of `name` at or after time t, or null. */
function activationAfter(entries, name, t) {
  const N = up(name);
  return entries.find((e) => e.tool === 'ActivateObjects' && !e.error && ts(e) >= t && (e.objects || []).some((o) => o.name === N && o.status !== 'failed')) || null;
}

/** Upload of `name` matches the file the script generated, activated afterwards, and run after that. */
function programRun(entries, name, wantSha) {
  const w = lastWrite(entries, name);
  if (!w) return { ok: false, why: `${name} never uploaded` };
  if (wantSha && w.source_sha256 && w.source_sha256 !== wantSha) return { ok: false, why: `${name} uploaded source differs from the generated file` };
  if (wantSha && !w.source_sha256) return { ok: false, why: `${name} upload carries no source hash` };
  const act = activationAfter(entries, name, ts(w));
  if (!act) return { ok: false, why: `${name} not activated after its last upload` };
  // results count only from the activation on: a run between upload and activation ran the old version
  const r = lastResult(entries, name, ts(act));
  if (!r) return { ok: false, why: `${name} has no ABAP Unit result after its activation` };
  return { ok: true, result: r };
}

/**
 * Per-case verdict + overall verdict.
 * @param {object} state  state.json (program, srcNames, frozen, harness, mutants, tamper, rows)
 * @param {object} cases  cases.json
 * @param {string} expectedSha current sha of expected.json
 * @param {object[]} entries evidence ledger lines (sorted or not)
 */
export function decide(state, cases, expectedSha, entries) {
  const L = [...entries].sort((a, b) => (ts(a) < ts(b) ? -1 : ts(a) > ts(b) ? 1 : 0));
  const problems = [];
  const list = cases?.cases || [];
  const notTestable = list.filter((c) => c.testable === false);
  const share = list.length ? notTestable.length / list.length : 0;

  if (!state.frozen?.expected_sha) problems.push({ kind: 'INVALID', text: 'expected.json was never frozen' });
  else if (expectedSha !== state.frozen.expected_sha) problems.push({ kind: 'INVALID', text: 'expected.json changed after it was frozen' });
  const changed = (state.srcNames || []).filter((n) => L.some((e) => e.kind === 'write' && ts(e) >= state.created_at && (e.names || []).includes(up(n))));
  if (changed.length) problems.push({ kind: 'INVALID', text: `program under test changed during the run: ${changed.join(', ')}` });
  for (const t of state.plan_tables || []) {
    const r = state.rows?.[up(t)];
    if (!r || !r.count) problems.push({ kind: 'INCOMPLETE', text: `${up(t)}: no rows captured — the double would be empty` });
    else if (r.sources && r.sources.some((s) => s !== state.source)) problems.push({ kind: 'INVALID', text: `${up(t)}: rows from ${r.sources.join(' + ')}, but this run reads ${state.source}` });
  }
  if (state.lint_problems?.length) problems.push({ kind: 'INCOMPLETE', text: `harness lint: ${state.lint_problems.length} problem(s) open` });

  const H = state.harness?.name;
  const run = H ? programRun(L, H, state.harness?.sha) : { ok: false, why: 'harness not built' };
  const perCase = list.map((c) => {
    if (c.testable === false) return { id: c.id, status: 'NOT_TESTABLE', why: c.not_testable_reason };
    if (!run.ok) return { id: c.id, status: 'NOT_RUN', why: run.why };
    const mr = (run.result.aunit.method_results || []).find((x) => x.name === up(c.method));
    if (!mr) return { id: c.id, status: 'NOT_RUN', why: `${up(c.method)} not in the result` };
    return { id: c.id, status: mr.failed ? 'FAIL' : 'PASS', why: mr.failed ? mr.alert || 'assertion failed' : '' };
  });
  if (run.ok && run.result.aunit.outside_fail) problems.push({ kind: 'INCOMPLETE', text: `harness run failed outside the test methods: ${run.result.aunit.first_alert || ''}` });

  // A mutant counts as killed only by a method that passed on the real harness — a method that
  // already fails there proves nothing about the mutation.
  const greenOnReal = new Set(run.ok ? (run.result.aunit.method_results || []).filter((x) => !x.failed).map((x) => x.name) : []);
  const mutants = (state.mutants || []).map((m) => {
    const { file, sha: _s, ...shown } = m;
    const r = programRun(L, m.name, m.sha);
    if (!r.ok) return { ...shown, status: 'NOT_RUN', why: r.why };
    const killers = (r.result.aunit.method_results || []).filter((x) => x.failed && greenOnReal.has(x.name)).map((x) => x.name);
    return { ...shown, status: killers.length ? 'KILLED' : 'SURVIVED', killed_by: killers };
  });
  let tamper = { status: 'NOT_RUN', why: 'tamper copy not built' };
  if (state.tamper?.name) {
    const r = programRun(L, state.tamper.name, state.tamper.sha);
    const tm = up(state.tamper.method);
    const hit = r.ok && (r.result.aunit.method_results || []).some((x) => x.name === tm && x.failed);
    tamper = r.ok ? { status: hit ? 'CAUGHT' : 'MISSED', case: state.tamper.case } : { status: 'NOT_RUN', why: r.why };
  }

  const testable = perCase.filter((c) => c.status !== 'NOT_TESTABLE');
  const failed = testable.filter((c) => c.status === 'FAIL');
  const notRun = testable.filter((c) => c.status === 'NOT_RUN');
  let verdict;
  if (problems.some((x) => x.kind === 'INVALID')) verdict = 'INVALID';
  else if (!testable.length) verdict = 'NOT_TESTABLE';
  else if (notRun.length || problems.length) verdict = 'INCOMPLETE';
  // A red case against the frozen expected value on a sound harness is a defect candidate; mutants and
  // the tamper copy guard against a false green, so they decide only when every testable case is green.
  else if (failed.length) verdict = 'PROGRAM_DEFECT';
  else if (!mutants.length) {
    verdict = 'INCOMPLETE';
    problems.push({ kind: 'INCOMPLETE', text: 'no mutant built — the cases cite no condition line' });
  } else if (mutants.some((m) => m.status === 'NOT_RUN') || tamper.status === 'NOT_RUN') verdict = 'INCOMPLETE';
  else if (mutants.some((m) => m.status === 'SURVIVED') || tamper.status === 'MISSED') verdict = 'TEST_WEAK';
  else verdict = notTestable.length ? 'PARTIAL' : 'PASS';

  return {
    program: up(state.program),
    source: state.source,
    verdict,
    counts: { cases: list.length, pass: testable.filter((c) => c.status === 'PASS').length, fail: failed.length, not_run: notRun.length, not_testable: notTestable.length, not_testable_share: Math.round(share * 100) },
    cases: perCase,
    mutants,
    tamper,
    problems,
  };
}

/** Exit code per verdict: 0 PASS, 1 PROGRAM_DEFECT / TEST_WEAK / INVALID, 2 INCOMPLETE, 4 PARTIAL / NOT_TESTABLE. */
export const exitCode = (v) => ({ PASS: 0, PROGRAM_DEFECT: 1, TEST_WEAK: 1, INVALID: 1, INCOMPLETE: 2, PARTIAL: 4, NOT_TESTABLE: 4 })[v] ?? 3;

/** One evidence line per case: id | rule | expected | actual | verdict | source. */
export function evidenceLines(result, cases, expected) {
  const byId = Object.fromEntries((cases?.cases || []).map((c) => [up(c.id), c]));
  const lines = [`Program test ${result.program} · data ${result.source.toUpperCase()} · verdict ${result.verdict}`,
    `Cases ${result.counts.cases} · pass ${result.counts.pass} · fail ${result.counts.fail} · not run ${result.counts.not_run} · NOT TESTABLE ${result.counts.not_testable} (${result.counts.not_testable_share}%)`];
  for (const c of result.cases) {
    const k = byId[up(c.id)] || {};
    const e = expected?.cases?.[c.id] || expected?.cases?.[up(c.id)];
    const exp = (e?.values || []).map((v) => `${v.what}=${JSON.stringify(v.value)}`).join('; ');
    lines.push(`- ${c.id} | ${k.rule || ''} | ${exp || '-'} | ${c.status}${c.why ? ` (${c.why})` : ''} | ${result.source}`);
  }
  for (const m of result.mutants) lines.push(`- mutant ${m.name} ${m.include}:${m.line} → ${m.status}${m.why ? ` (${m.why})` : ''}`);
  lines.push(`- tamper → ${result.tamper.status}${result.tamper.why ? ` (${result.tamper.why})` : ''}`);
  for (const p of result.problems) lines.push(`- ${p.kind}: ${p.text}`);
  return lines.join('\n');
}

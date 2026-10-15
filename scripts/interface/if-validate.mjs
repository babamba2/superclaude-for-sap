// interface-mapping-spec — checks of a mapping model.
//
// Runs at build time (CLI summary) and inside the page on every edit: the
// functions below are self-contained (no imports, no module constants) so the
// page embeds their source text (VALIDATE_SRC).
//
// Finding: { sev: 'error' | 'warn' | 'info', code, path, args }
//   path = the model path of the cell the finding points at (the page marks it)
//   REQ            a required (*) item is empty
//   MAP_MISSING    MAPPING names a No the other side does not have
//   RULE_MISSING   R names a rule id that is not in the conversion-rule list
//   TRUNC          receiving size smaller than sending size, no R rule
//   TYPE_MISMATCH  type families differ (text / number / date / binary), no R rule
//   UNMAPPED       target field with neither MAPPING nor R
//   KEY_MISMATCH   a source key field is unmapped or lands on a non-key target field
//   SAP_REMOVED    the field is gone from SAP (last --refresh)
//   PROPOSED       the row still holds the proposal nobody confirmed
//   PROPOSED_RULE  a conversion rule proposed from the field types, not confirmed
//   NEEDS_RESOLVE  a SAP field typed by hand (TABLE-FIELD / data element) not read from DDIC yet

export function ifSizeOptional(type) {
  return ['DATE', 'TIMESTAMP', 'CLOB', 'NCLOB', 'BLOB', 'BFILE', 'LONG', 'LONG RAW', 'INTEGER', 'FLOAT'].includes(String(type || '').toUpperCase());
}

export function ifTypeFamilies(type, ddic) {
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

export function ifValidate(m) {
  const out = [];
  const blank = (v) => v == null || String(v).trim() === '';
  const req = (v, path) => { if (blank(v)) out.push({ sev: 'error', code: 'REQ', path }); };
  const h = m.header || {};
  for (const k of ['name', 'summary', 'trigger', 'cycle', 'relation', 'targetLogic', 'author', 'writtenAt']) req(h[k], 'header.' + k);
  req(m.ifId, 'ifId');
  if (!blank(h.cycle) && !['REALTIME', 'ADHOC'].includes(h.cycle)) req(h.cycleCount, 'header.cycleCount');
  const sapSide = (m.sap && m.sap.side) || '';
  const isSap = (side) => sapSide === side || sapSide === 'both';
  const ruleIds = new Set((m.rules || []).map((r) => String(r.id || '').trim().toUpperCase()).filter(Boolean));
  (m.rules || []).forEach((r, i) => { if (r.proposed) out.push({ sev: 'info', code: 'PROPOSED_RULE', path: 'rules.' + i + '.text', args: { id: r.id } }); });
  const blocks = [['request', m.request], ['response', m.response]];
  for (const [bk, b] of blocks) {
    if (!b) continue;
    for (const side of ['source', 'target']) {
      const s = b[side] || {};
      const items = bk === 'request' ? ['system', 'region', 'owner', 'object'] : ['object'];
      for (const k of items) req(s[k], bk + '.' + side + '.' + k);
      if (bk === 'request' && side === 'source') req(s.adapter, bk + '.source.adapter');
      if (bk === 'request' && isSap(side)) req(s.module, bk + '.' + side + '.module');
    }
    const rows = b.rows || [];
    // Carriers: kind and occurrence on each side that carries fields; a structure or table needs its name.
    (b.groups || []).forEach((g, gi) => {
      const mine = rows.filter((r) => r.g === g.id);
      for (const sd of ['s', 't']) {
        const used = mine.some((r) => r[sd] && !blank(r[sd].field));
        if (!used) continue;
        const c = g[sd] || {};
        const gp = bk + '.groups.' + gi + '.' + sd;
        req(c.kind, gp + '.kind');
        req(c.card, gp + '.card');
        if (!blank(c.kind) && c.kind !== 'PARAMETER') req(c.name, gp + '.name');
      }
    });
    const byNo = new Map(rows.map((r) => [String(r.no || '').toUpperCase(), r]));
    // Data flows source → target in the request and target → source in the response.
    const from = bk === 'request' ? 's' : 't';
    const to = bk === 'request' ? 't' : 's';
    rows.forEach((r, i) => {
      const p = bk + '.rows.' + i;
      const has = (x) => x && ['table', 'field', 'type', 'size', 'desc'].some((k) => !blank(x[k]));
      for (const sd of ['s', 't']) {
        const c = r[sd];
        if (!has(c)) continue;
        if (isSap(sd === 's' ? 'source' : 'target') && !blank(c.field) && blank(c.ddic) && blank(c.type)) continue; // filled from DDIC at import
        for (const k of ['field', 'key', 'type', 'nul', 'desc']) req(c[k], p + '.' + sd + '.' + k);
        if (!ifSizeOptional(c.type)) req(c.size, p + '.' + sd + '.size');
      }
      if (r.sync === 'removed') out.push({ sev: 'warn', code: 'SAP_REMOVED', path: p + '.' + (isSap('source') ? 's' : 't') + '.field', args: { no: r.no } });
      if (r.proposed) out.push({ sev: 'info', code: 'PROPOSED', path: p + '.no', args: { no: r.no } });
      for (const sd of ['s', 't']) if (isSap(sd === 's' ? 'source' : 'target') && r[sd] && !blank(r[sd].field) && blank(r[sd].ddic)) out.push({ sev: 'info', code: 'NEEDS_RESOLVE', path: p + '.' + sd + '.field', args: { no: r.no, field: r[sd].field } });
      const rule = String(r.r || '').trim().toUpperCase();
      if (rule) for (const id of rule.split(/[\s,]+/).filter(Boolean)) if (!ruleIds.has(id)) out.push({ sev: 'error', code: 'RULE_MISSING', path: p + '.r', args: { id } });
      const map = String(r.map || '').trim().toUpperCase();
      if (!has(r[to])) return;
      if (!map) {
        if (!rule) out.push({ sev: 'warn', code: 'UNMAPPED', path: p + '.map', args: { no: r.no, field: r[to].field } });
        return;
      }
      const srcRow = byNo.get(map);
      if (!srcRow || !has(srcRow[from])) { out.push({ sev: 'error', code: 'MAP_MISSING', path: p + '.map', args: { no: map } }); return; }
      if (rule) return;
      const a = srcRow[from];
      const z = r[to];
      const na = Number(String(a.size || '').split(',')[0]);
      const nz = Number(String(z.size || '').split(',')[0]);
      if (na > 0 && nz > 0 && nz < na) out.push({ sev: 'warn', code: 'TRUNC', path: p + '.' + to + '.size', args: { no: r.no, from: na, to: nz } });
      const fa = ifTypeFamilies(a.type, a.ddic);
      const fz = ifTypeFamilies(z.type, z.ddic);
      if (fa.length && fz.length && !fa.some((x) => fz.includes(x))) out.push({ sev: 'warn', code: 'TYPE_MISMATCH', path: p + '.' + to + '.type', args: { no: r.no, from: a.type, to: z.type } });
    });
    if (bk !== 'request') continue;
    rows.forEach((r, i) => {
      if (String(r.s && r.s.key || '').toUpperCase() !== 'Y' || blank(r.s.field)) return;
      const no = String(r.no || '').toUpperCase();
      const targets = rows.filter((x) => String(x.map || '').trim().toUpperCase() === no && x.t && !blank(x.t.field));
      if (!targets.length) out.push({ sev: 'warn', code: 'KEY_MISMATCH', path: 'request.rows.' + i + '.s.key', args: { no: r.no, field: r.s.field, unmapped: true } });
      else if (targets.every((x) => String(x.t.key || '').toUpperCase() !== 'Y')) out.push({ sev: 'warn', code: 'KEY_MISMATCH', path: 'request.rows.' + rows.indexOf(targets[0]) + '.t.key', args: { no: r.no, field: r.s.field } });
    });
  }
  return out;
}

export const VALIDATE_SRC = [ifSizeOptional, ifTypeFamilies, ifValidate].map((f) => f.toString()).join('\n');

const MSG = {
  ko: {
    REQ: '필수 항목이 비어 있습니다', MAP_MISSING: 'MAPPING {no}에 해당하는 행이 없습니다', RULE_MISSING: '변환규칙 {id}가 목록에 없습니다',
    TRUNC: '{no}: 길이 {from} → {to} — 값이 잘릴 수 있습니다 (변환규칙 없음)', TYPE_MISMATCH: '{no}: 타입 {from} → {to} 계열이 다릅니다 (변환규칙 없음)',
    UNMAPPED: '{no} {field}: MAPPING도 변환규칙도 없습니다 — 고정값·시스템값이면 R로 설명하세요',
    KEY_MISMATCH: '키 필드 {no} {field}가 Target 키에 매핑되지 않았습니다', SAP_REMOVED: '{no}: SAP에서 삭제된 필드입니다', PROPOSED: '{no}: 제안값 — 확인 후 고치세요',
    NEEDS_RESOLVE: '{no} {field}: SAP 정의를 아직 읽지 않았습니다 — 가져오기(import) 때 채워집니다', PROPOSED_RULE: '{id}: 자동 제안된 변환규칙 — 확인 후 고치세요',
  },
  en: {
    REQ: 'Required item is empty', MAP_MISSING: 'MAPPING {no} names no row', RULE_MISSING: 'Conversion rule {id} is not in the list',
    TRUNC: '{no}: size {from} → {to} — values may be cut (no conversion rule)', TYPE_MISMATCH: '{no}: type {from} → {to} differs in kind (no conversion rule)',
    UNMAPPED: '{no} {field}: neither MAPPING nor a conversion rule — describe a constant or system value with an R rule',
    KEY_MISMATCH: 'Key field {no} {field} does not land on a target key', SAP_REMOVED: '{no}: field no longer in SAP', PROPOSED: '{no}: proposal — check and correct it',
    NEEDS_RESOLVE: '{no} {field}: not read from SAP yet — filled at the next import', PROPOSED_RULE: '{id}: proposed conversion rule — check and correct it',
  },
};
export const MESSAGES_SRC = JSON.stringify(MSG);

/** Text of one finding (CLI summary). */
export function findingText(f, lang = 'en') {
  const t = (MSG[lang] || MSG.en)[f.code] || f.code;
  return t.replace(/\{(\w+)\}/g, (_, k) => (f.args && f.args[k] != null ? f.args[k] : '')) + (f.code === 'REQ' ? ` (${f.path})` : '');
}

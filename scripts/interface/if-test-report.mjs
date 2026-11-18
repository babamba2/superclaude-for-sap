// interface-mapping-spec — "인터페이스 테스트": what one IF.TEST.CALL returned, checked against the spec's response
// mapping, and the HTML report of a test run (cases, input, output, RETURN messages, document numbers, verdict).
//
// No SAP access here: the caller (the web's test route, or the CLI) runs PREVIEW / EXECUTE of IF.TEST.CALL and
// hands the business-action results in. Pure functions, so the web page and the tests use the same code.
//
//   fromResult(result)            → { output, messages, docNos, committed, failed, posting }
//   outputCheck(model, output)    → [{ no, param, field, status: 'ok' | 'missing' | 'long' | 'type', value, spec }]
//   statusFlags(output)           → [{ path, value }]  status fields of the output that report E / A (XSTAT, EV_STATUS…)
//   caseVerdict(call, check)      → { pass, outcome: 'pass' | 'review' | 'fail', reasons, review }
//   caseOutcome(model, result)    → 'pass' | 'review' | 'fail'  (the verdict of one stored EXECUTE answer)
//   formatAt(iso, lang)           → '2026-11-18 11:45 KST' (ko) / '2026-11-18 02:45 UTC' (en)
//   reportHtml({ model, system, user, at, cases, lang }) → one self-contained HTML page

import { withResponsive } from '../lib/responsive.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const UP = (v) => String(v ?? '').trim().toUpperCase();
const NUMERIC = new Set(['NUMBER', 'INTEGER', 'FLOAT', 'DEC', 'CURR', 'QUAN', 'INT1', 'INT2', 'INT4', 'INT8', 'FLTP', 'NUMC']);

/** The business-action result of IF.TEST.CALL → the parts a report shows. */
export function fromResult(result) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const val = (name) => rows.find((r) => r.name === name)?.value;
  let output = null;
  const raw = val('fm_result');
  if (typeof raw === 'string' && raw) {
    try {
      output = JSON.parse(raw);
    } catch {
      output = null;
    }
  }
  return {
    output,
    messages: (Array.isArray(result?.messages) ? result.messages : []).map((m) => ({ type: String(m.type ?? ''), id: String(m.id ?? ''), number: String(m.number ?? ''), message: String(m.message ?? '') })),
    docNos: rows.filter((r) => String(r.name).startsWith('doc_no.')).map((r) => ({ name: String(r.name).slice(7), value: String(r.value ?? '') })),
    committed: String(val('committed') ?? ''),
    failed: result?.failed === true,
    truncated: result?.truncated === true,
    posting: rows.filter((r) => String(r.name).startsWith('posting.')).map((r) => ({ name: String(r.name).slice(8), value: String(r.value ?? '') })),
  };
}

/** Case-insensitive member of an object. */
const pick = (o, k) => {
  if (!o || typeof o !== 'object') return undefined;
  const key = Object.keys(o).find((x) => UP(x) === UP(k));
  return key === undefined ? undefined : o[key];
};

/**
 * The output against the spec's response block: every response row on the SAP side (the module's exports /
 * tables) — present in the output, within the spec's length, numeric where the spec says so. Tables are checked
 * on their first line (present = the table has a line carrying the field).
 */
export function outputCheck(model, output) {
  const b = model?.response;
  if (!b?.rows?.length) return [];
  const sd = model?.sap?.side === 'target' ? 't' : 's';
  const groupName = (id) => UP((b.groups || []).find((g) => g.id === id)?.[sd]?.name);
  const out = [];
  for (const r of b.rows) {
    const c = r[sd];
    if (!c?.field) continue;
    const param = groupName(r.g) || UP(c.field);
    let carrier = pick(output, param);
    let value;
    if (UP(param) === UP(c.field)) value = carrier;
    else {
      if (Array.isArray(carrier)) carrier = carrier[0];
      value = pick(carrier, c.field);
    }
    const spec = `${c.type || ''} ${c.size || ''}`.trim();
    const base = { no: r.no, param, field: UP(c.field), spec, value: value === undefined ? '' : String(value).slice(0, 120) };
    if (value === undefined) { out.push({ ...base, status: 'missing' }); continue; }
    const size = Number(String(c.size || '').split(/[,.]/)[0]);
    const type = UP(String(c.ddic || '').split(' ')[0] || c.type);
    if (NUMERIC.has(type) && String(value).trim() !== '' && Number.isNaN(Number(String(value).trim()))) out.push({ ...base, status: 'type' });
    else if (size > 0 && !NUMERIC.has(type) && String(value).length > size) out.push({ ...base, status: 'long' });
    else out.push({ ...base, status: 'ok' });
  }
  return out;
}

/**
 * Status fields of the output that report an error the RETURN messages do not carry: a module may end "called"
 * with no E message and still have failed (XSTAT = 'E', EV_STATUS = 'A' …, user decision 2026-11-18). Keys
 * matching STATUS_KEY whose value is E or A; depth 4, 100 lines per table, 20 flags at most. The web dialog
 * keeps the same rule (web/src/lib/if-test-ops.ts statusFlags; a test pins them together).
 */
export const STATUS_KEY = /(STATUS|^XSTAT|^(EV|E|ES|O|OV|EX)_STAT)/;
export function statusFlags(output) {
  const out = [];
  const walk = (v, path, depth) => {
    if (out.length >= 20 || depth > 4 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.slice(0, 100).forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1)); return; }
    for (const [k, x] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (typeof x === 'string' && STATUS_KEY.test(k.toUpperCase()) && ['E', 'A'].includes(x.trim().toUpperCase())) {
        if (out.length < 20) out.push({ path: p, value: x.trim().toUpperCase() });
      } else walk(x, p, depth + 1);
    }
  };
  walk(output, '', 0);
  return out;
}

/**
 * Pass when the call did not fail, no E / A message came back and every mapped output field arrived and fits;
 * "review" (확인 필요) when it would pass but a status field of the output reports E / A; otherwise fail.
 */
export function caseVerdict(call, check) {
  const reasons = [];
  if (call.failed) reasons.push('call failed');
  for (const m of call.messages) if (m.type === 'E' || m.type === 'A' || m.type === 'X') reasons.push(`${m.type}: ${m.message}`.slice(0, 200));
  for (const c of check) if (c.status !== 'ok') reasons.push(`${c.no} ${c.param}-${c.field}: ${c.status}`);
  const review = statusFlags(call.output).map((f) => `${f.path} = ${f.value}`);
  const outcome = reasons.length ? 'fail' : review.length ? 'review' : 'pass';
  return { pass: outcome === 'pass', outcome, reasons, review };
}

/** The verdict of one stored EXECUTE answer (the handler's result) against the spec — what the report shows. */
export function caseOutcome(model, result) {
  const call = fromResult(result);
  return caseVerdict(call, outputCheck(model, call.output)).outcome;
}

/** The run time for a reader: Korea time for a Korean report, UTC otherwise; the text as given when it is not a date. */
export function formatAt(at, lang = 'ko') {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return String(at ?? '');
  const ko = lang !== 'en';
  const z = new Date(d.getTime() + (ko ? 9 * 3600_000 : 0));
  const p = (n) => String(n).padStart(2, '0');
  return `${z.getUTCFullYear()}-${p(z.getUTCMonth() + 1)}-${p(z.getUTCDate())} ${p(z.getUTCHours())}:${p(z.getUTCMinutes())} ${ko ? 'KST' : 'UTC'}`;
}

const T = {
  ko: { title: '인터페이스 테스트 보고서', spec: '정의서', system: '시스템', user: '실행자', at: '실행 시각', fm: '함수 모듈', cases: '케이스', input: '입력', output: '출력', messages: '반환 메시지', docs: '전표 번호', check: '매핑 대조', verdict: '판정', pass: '통과', review: '확인 필요', reviewWhy: '출력의 상태 필드가 오류를 알려요. 메시지가 없어도 실패일 수 있어요', fail: '실패', committed: '커밋', none: '없음', truncated: '출력이 길어 일부만 실었어요.', runOf: '실행 기준', stale: (n) => `실행 ${n}건은 지금 정의서와 다른 버전이나 함수 모듈로 실행했어요. 다시 실행해 확인하세요.`, staleChip: '이전 정의서', status: { ok: 'OK', missing: '없음', long: '길이 초과', type: '형식 불일치' }, col: { type: '유형', id: 'ID', no: '번호', message: '메시지', param: '파라미터', field: '필드', spec: '정의서 형식', value: '값' } },
  en: { title: 'Interface test report', spec: 'Specification', system: 'System', user: 'Run by', at: 'Run at', fm: 'Function module', cases: 'Cases', input: 'Input', output: 'Output', messages: 'Return messages', docs: 'Document numbers', check: 'Mapping check', verdict: 'Verdict', pass: 'Pass', review: 'Check', reviewWhy: 'A status field of the output reports an error. The call may have failed even without messages', fail: 'Fail', committed: 'Committed', none: 'none', truncated: 'The output was long: only part of it is shown.', runOf: 'Run against', stale: (n) => `${n} run(s) used a different specification version or function module than the current one. Run them again to confirm.`, staleChip: 'older spec', status: { ok: 'OK', missing: 'missing', long: 'too long', type: 'wrong type' }, col: { type: 'Type', id: 'ID', no: 'No', message: 'Message', param: 'Param', field: 'Field', spec: 'Spec', value: 'Value' } },
};

const json = (v) => esc(JSON.stringify(v ?? null, null, 2));

/** True when a run was made against another spec version or FM than the report's current ones (unknown values never count). */
export function runIsStale(run, model, fm = '') {
  const v = run?.specVersion, cur = model?.version;
  const vDiff = v != null && v !== '' && cur != null && cur !== '' && String(v) !== String(cur);
  const fDiff = !!run?.fm && !!fm && String(run.fm).toUpperCase() !== String(fm).toUpperCase();
  return vDiff || fDiff;
}

/** One self-contained HTML report of a test run. cases: [{ name, input, result, specVersion?, fm? }] (result = the EXECUTE answer; specVersion / fm = what that run was made against). */
export function reportHtml({ model, system = '', user = '', at = new Date().toISOString(), fm = '', cases = [], lang = 'ko' }) {
  const t = T[lang === 'en' ? 'en' : 'ko'];
  const col = t.col;
  const rows = cases.map((c, i) => {
    const call = fromResult(c.result);
    const check = outputCheck(model, call.output);
    const v = caseVerdict(call, check);
    return { i: i + 1, name: c.name || `#${i + 1}`, input: c.input, call, check, v, specVersion: c.specVersion, fm: c.fm, stale: runIsStale(c, model, fm) };
  });
  const passed = rows.filter((r) => r.v.outcome === 'pass').length;
  const toCheck = rows.filter((r) => r.v.outcome === 'review').length;
  const stale = rows.filter((r) => r.stale).length;
  const caseHtml = rows.map((r) => `
<section class="case ${r.v.outcome}">
  <h2>${r.i}. ${esc(r.name)} <span class="chip">${t[r.v.outcome]}</span>${r.stale ? ` <span class="chip stale">${t.staleChip}</span>` : ''}</h2>
  ${r.specVersion != null || r.fm ? `<p class="runof${r.stale ? ' stale' : ''}">${t.runOf}: ${r.specVersion != null && r.specVersion !== '' ? `v${esc(r.specVersion)}` : '—'} · ${esc(r.fm || '—')}</p>` : ''}
  ${r.v.reasons.length ? `<ul class="why">${r.v.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  ${r.v.review.length ? `<p class="warn" role="note">${esc(t.reviewWhy)}: ${r.v.review.map(esc).join(' · ')}</p>` : ''}
  <h3>${t.input}</h3><pre>${json(r.input)}</pre>
  <h3>${t.messages}</h3>${r.call.messages.length ? `<table class="cards"><tr><th>${col.type}</th><th>${col.id}</th><th>${col.no}</th><th>${col.message}</th></tr>${r.call.messages.map((m) => `<tr><td data-l="${col.type}">${esc(m.type)}</td><td data-l="${col.id}">${esc(m.id)}</td><td data-l="${col.no}">${esc(m.number)}</td><td data-l="${col.message}">${esc(m.message)}</td></tr>`).join('')}</table>` : `<p>${t.none}</p>`}
  <h3>${t.docs}</h3>${r.call.docNos.length ? `<ul>${r.call.docNos.map((d) => `<li>${esc(d.name)}: <b>${esc(d.value)}</b></li>`).join('')}</ul>` : `<p>${t.none}</p>`}
  <p>${t.committed}: ${esc(r.call.committed || '—')}</p>
  <h3>${t.check}</h3>${r.check.length ? `<table class="cards"><tr><th>${col.no}</th><th>${col.param}</th><th>${col.field}</th><th>${col.spec}</th><th>${col.value}</th><th>${t.verdict}</th></tr>${r.check.map((x) => `<tr class="${x.status}"><td data-l="${col.no}">${esc(x.no)}</td><td data-l="${col.param}">${esc(x.param)}</td><td data-l="${col.field}">${esc(x.field)}</td><td data-l="${col.spec}">${esc(x.spec)}</td><td data-l="${col.value}">${esc(x.value)}</td><td data-l="${t.verdict}">${esc(t.status[x.status])}</td></tr>`).join('')}</table>` : `<p>${t.none}</p>`}
  <h3>${t.output}</h3>${r.call.truncated ? `<p class="note">${t.truncated}</p>` : ''}<pre>${json(r.call.output)}</pre>
</section>`).join('\n');
  return withResponsive(`<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'ko'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)} · ${esc(model?.ifId || '')}</title>
<style>
:root { --ink:#1b1f24; --muted:#5b6672; --line:#d9dee4; --ok:#1a7f37; --bad:#c62828; --warn:#9a5b00; --bg:#fff; }
@media (prefers-color-scheme: dark) { :root { --ink:#e6e9ee; --muted:#9aa4af; --line:#333a42; --ok:#4cc26a; --bad:#ff6b6b; --warn:#f0b35a; --bg:#14171b; } }
body { margin:0; padding:24px 16px; background:var(--bg); color:var(--ink); font:14px/1.55 system-ui, sans-serif; }
main { max-width:960px; margin:0 auto; } h1 { font-size:1.4rem; margin:0 0 8px; } h2 { font-size:1.1rem; } h3 { font-size:.95rem; margin:14px 0 6px; color:var(--muted); }
dl { display:grid; grid-template-columns:max-content 1fr; gap:4px 14px; margin:0 0 16px; } dt { color:var(--muted); }
.case { border:1px solid var(--line); border-radius:10px; padding:4px 16px 12px; margin:14px 0; } .case.fail { border-color:var(--bad); } .case.review { border-color:var(--warn); }
.chip { font-size:.75rem; border:1px solid currentColor; border-radius:999px; padding:1px 8px; } .pass .chip { color:var(--ok); } .fail .chip { color:var(--bad); } .review .chip { color:var(--warn); }
.why { color:var(--bad); } table { border-collapse:collapse; width:100%; display:block; overflow-x:auto; } th, td { border:1px solid var(--line); padding:4px 8px; text-align:left; vertical-align:top; }
tr.missing td, tr.long td, tr.type td { color:var(--bad); } pre { background:color-mix(in srgb, var(--line) 35%, transparent); padding:10px; border-radius:8px; overflow-x:auto; white-space:pre-wrap; word-break:break-word; } .note { color:var(--muted); } .runof { color:var(--muted); margin:0 0 6px; } .chip.stale, .runof.stale { color:var(--warn); } .warn { border:1px solid var(--warn); border-left-width:4px; border-radius:8px; padding:8px 12px; margin:0 0 14px; }
/* Phones: each table row becomes a labelled card, so the verdict and the value are never scrolled off the right edge. */
@media (max-width:600px) { body { padding:16px; } .case { padding:4px 12px 12px; } table.cards, table.cards tbody, table.cards tr, table.cards td { display:block; } table.cards { overflow:visible; } table.cards tr:first-child { display:none; } table.cards tr { border:1px solid var(--line); border-radius:8px; padding:6px 10px; margin:0 0 8px; } table.cards td { border:0; padding:2px 0; display:grid; grid-template-columns:5.5em minmax(0,1fr); gap:8px; overflow-wrap:anywhere; } table.cards td::before { content:attr(data-l); color:var(--muted); } }
</style></head><body><main>
<h1>${esc(t.title)}</h1>
<dl><dt>${t.spec}</dt><dd>${esc(model?.ifId || '')} v${esc(model?.version || '')} — ${esc(model?.header?.name || '')}</dd>
<dt>${t.fm}</dt><dd>${esc(fm)}</dd><dt>${t.system}</dt><dd>${esc(system)}</dd><dt>${t.user}</dt><dd>${esc(user)}</dd><dt>${t.at}</dt><dd><time datetime="${esc(at)}">${esc(formatAt(at, lang))}</time></dd>
<dt>${t.cases}</dt><dd>${passed} / ${rows.length} ${t.pass}${toCheck ? ` · ${toCheck} ${t.review}` : ''}</dd></dl>
${stale ? `<p class="warn" role="note">${esc(t.stale(stale))}</p>` : ''}
${caseHtml}
</main></body></html>
`);
}

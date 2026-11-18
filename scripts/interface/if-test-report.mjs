// interface-mapping-spec — "인터페이스 테스트": what one IF.TEST.CALL returned, checked against the spec's response
// mapping, and the HTML report of a test run (cases, input, output, RETURN messages, document numbers, verdict).
//
// No SAP access here: the caller (the web's test route, or the CLI) runs PREVIEW / EXECUTE of IF.TEST.CALL and
// hands the business-action results in. Pure functions, so the web page and the tests use the same code.
//
//   fromResult(result)            → { output, messages, docNos, committed, failed, posting }
//   outputCheck(model, output)    → [{ no, param, field, status: 'ok' | 'missing' | 'long' | 'type', value, spec }]
//   caseVerdict(call, check)      → { pass, reasons }
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

/** Pass when the call did not fail, no E / A message came back and every mapped output field arrived and fits. */
export function caseVerdict(call, check) {
  const reasons = [];
  if (call.failed) reasons.push('call failed');
  for (const m of call.messages) if (m.type === 'E' || m.type === 'A' || m.type === 'X') reasons.push(`${m.type}: ${m.message}`.slice(0, 200));
  for (const c of check) if (c.status !== 'ok') reasons.push(`${c.no} ${c.param}-${c.field}: ${c.status}`);
  return { pass: reasons.length === 0, reasons };
}

const T = {
  ko: { title: '인터페이스 테스트 보고서', spec: '정의서', system: '시스템', user: '실행자', at: '실행 시각', fm: '함수 모듈', cases: '케이스', input: '입력', output: '출력', messages: '반환 메시지', docs: '전표 번호', check: '매핑 대조', verdict: '판정', pass: '통과', fail: '실패', committed: '커밋', none: '없음', truncated: '출력이 길어 일부만 실었어요.', runOf: '실행 기준', stale: (n) => `실행 ${n}건은 지금 정의서와 다른 버전이나 함수 모듈로 실행했어요. 다시 실행해 확인하세요.`, staleChip: '이전 정의서', status: { ok: 'OK', missing: '없음', long: '길이 초과', type: '형식 불일치' } },
  en: { title: 'Interface test report', spec: 'Specification', system: 'System', user: 'Run by', at: 'Run at', fm: 'Function module', cases: 'Cases', input: 'Input', output: 'Output', messages: 'Return messages', docs: 'Document numbers', check: 'Mapping check', verdict: 'Verdict', pass: 'Pass', fail: 'Fail', committed: 'Committed', none: 'none', truncated: 'The output was long: only part of it is shown.', runOf: 'Run against', stale: (n) => `${n} run(s) used a different specification version or function module than the current one. Run them again to confirm.`, staleChip: 'older spec', status: { ok: 'OK', missing: 'missing', long: 'too long', type: 'wrong type' } },
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
  const rows = cases.map((c, i) => {
    const call = fromResult(c.result);
    const check = outputCheck(model, call.output);
    const v = caseVerdict(call, check);
    return { i: i + 1, name: c.name || `#${i + 1}`, input: c.input, call, check, v, specVersion: c.specVersion, fm: c.fm, stale: runIsStale(c, model, fm) };
  });
  const passed = rows.filter((r) => r.v.pass).length;
  const stale = rows.filter((r) => r.stale).length;
  const caseHtml = rows.map((r) => `
<section class="case ${r.v.pass ? 'pass' : 'fail'}">
  <h2>${r.i}. ${esc(r.name)} <span class="chip">${r.v.pass ? t.pass : t.fail}</span>${r.stale ? ` <span class="chip stale">${t.staleChip}</span>` : ''}</h2>
  ${r.specVersion != null || r.fm ? `<p class="runof${r.stale ? ' stale' : ''}">${t.runOf}: ${r.specVersion != null && r.specVersion !== '' ? `v${esc(r.specVersion)}` : '—'} · ${esc(r.fm || '—')}</p>` : ''}
  ${r.v.reasons.length ? `<ul class="why">${r.v.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  <h3>${t.input}</h3><pre>${json(r.input)}</pre>
  <h3>${t.messages}</h3>${r.call.messages.length ? `<table class="cards"><tr><th>Type</th><th>ID</th><th>No</th><th>Message</th></tr>${r.call.messages.map((m) => `<tr><td data-l="Type">${esc(m.type)}</td><td data-l="ID">${esc(m.id)}</td><td data-l="No">${esc(m.number)}</td><td data-l="Message">${esc(m.message)}</td></tr>`).join('')}</table>` : `<p>${t.none}</p>`}
  <h3>${t.docs}</h3>${r.call.docNos.length ? `<ul>${r.call.docNos.map((d) => `<li>${esc(d.name)}: <b>${esc(d.value)}</b></li>`).join('')}</ul>` : `<p>${t.none}</p>`}
  <p>${t.committed}: ${esc(r.call.committed || '—')}</p>
  <h3>${t.check}</h3>${r.check.length ? `<table class="cards"><tr><th>No</th><th>Param</th><th>Field</th><th>Spec</th><th>Value</th><th>${t.verdict}</th></tr>${r.check.map((x) => `<tr class="${x.status}"><td data-l="No">${esc(x.no)}</td><td data-l="Param">${esc(x.param)}</td><td data-l="Field">${esc(x.field)}</td><td data-l="Spec">${esc(x.spec)}</td><td data-l="Value">${esc(x.value)}</td><td data-l="${t.verdict}">${esc(t.status[x.status])}</td></tr>`).join('')}</table>` : `<p>${t.none}</p>`}
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
.case { border:1px solid var(--line); border-radius:10px; padding:4px 16px 12px; margin:14px 0; } .case.fail { border-color:var(--bad); }
.chip { font-size:.75rem; border:1px solid currentColor; border-radius:999px; padding:1px 8px; } .pass .chip { color:var(--ok); } .fail .chip { color:var(--bad); }
.why { color:var(--bad); } table { border-collapse:collapse; width:100%; display:block; overflow-x:auto; } th, td { border:1px solid var(--line); padding:4px 8px; text-align:left; vertical-align:top; }
tr.missing td, tr.long td, tr.type td { color:var(--bad); } pre { background:color-mix(in srgb, var(--line) 35%, transparent); padding:10px; border-radius:8px; overflow-x:auto; white-space:pre-wrap; word-break:break-word; } .note { color:var(--muted); } .runof { color:var(--muted); margin:0 0 6px; } .chip.stale, .runof.stale { color:var(--warn); } .warn { border:1px solid var(--warn); border-left-width:4px; border-radius:8px; padding:8px 12px; margin:0 0 14px; }
/* Phones: each table row becomes a labelled card, so the verdict and the value are never scrolled off the right edge. */
@media (max-width:600px) { body { padding:16px; } .case { padding:4px 12px 12px; } table.cards, table.cards tbody, table.cards tr, table.cards td { display:block; } table.cards { overflow:visible; } table.cards tr:first-child { display:none; } table.cards tr { border:1px solid var(--line); border-radius:8px; padding:6px 10px; margin:0 0 8px; } table.cards td { border:0; padding:2px 0; display:grid; grid-template-columns:5.5em minmax(0,1fr); gap:8px; overflow-wrap:anywhere; } table.cards td::before { content:attr(data-l); color:var(--muted); } }
</style></head><body><main>
<h1>${esc(t.title)}</h1>
<dl><dt>${t.spec}</dt><dd>${esc(model?.ifId || '')} v${esc(model?.version || '')} — ${esc(model?.header?.name || '')}</dd>
<dt>${t.fm}</dt><dd>${esc(fm)}</dd><dt>${t.system}</dt><dd>${esc(system)}</dd><dt>${t.user}</dt><dd>${esc(user)}</dd><dt>${t.at}</dt><dd>${esc(at)}</dd>
<dt>${t.cases}</dt><dd>${passed} / ${rows.length} ${t.pass}</dd></dl>
${stale ? `<p class="warn" role="note">${esc(t.stale(stale))}</p>` : ''}
${caseHtml}
</main></body></html>
`);
}

// sc4sap:role-matrix triage — the one-page report and the ticket summary of an authorization triage (auth-triage.mjs).
// The title carries the T-code and date only; the user ID appears in the body.

import { withResponsive } from '../lib/responsive.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arr = (v) => (Array.isArray(v) ? v : []);
const d8 = (s) => (/^\d{8}$/.test(String(s)) && s !== '00000000' ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '');

const L = {
  ko: {
    title: '권한 오류 분석', user: '사용자', tcode: 'T-code', system: '시스템', date: '분석일', mode: '근거',
    modes: { su53: 'SU53 검사 내용', start: 'T-code 시작 검사 (S_TCODE, TSTCA)', estimate: 'SU24 제안값 기준 추정' },
    verdict: '판정', verdicts: { A: 'A 미보유', B: 'B 보유하나 미반영', C: 'C 오늘 유효하지 않은 할당', D: 'D 불명확' },
    say: {
      A: '사용자의 유효한 역할 중 어느 것도 이 객체·값을 주지 않아요. 아래 후보 역할과 SoD 영향을 보고 보안 담당자가 결정해요.',
      B: '유효한 역할이 이 값을 주는데도 오류가 났어요. 역할의 프로파일 생성(PFCG), 사용자 비교(PFUD), SU01 프로파일 탭을 확인해요. 이 분석은 생성된 프로파일(AGR_1016)과 직접 할당 프로파일(UST04)을 읽지 않아 확정할 수 없어요.',
      C: '값을 주는 역할이 있지만 그 할당 기간이 오늘을 벗어나요 (이미 끝났거나 아직 시작 전). 끝났으면 기간 연장을, 시작 전이면 시작일을 확인해요.',
      D: '검사할 객체·값이 없어 확정할 수 없어요. SU53 화면 캡처나 STAUTHTRACE 결과를 받아 다시 분석해요. 아래 SU24 기준 목록은 추정이에요.',
    },
    reasonNotRead: '필요한 테이블을 읽지 못해 "미보유"로 판정하지 않았어요.',
    reasonStartOk: '사용자는 T-code 시작 검사를 통과하고 SU24 제안 객체도 모두 가지고 있어요. 오류는 트랜잭션 안의 다른 검사에서 났을 거예요. 오류 직후 SU53 화면을 받아 다시 분석해요.',
    reasonPartial: '사용자 역할의 권한 값이 읽기 상한(5000행)에 걸려 일부만 읽혔어요. 그래서 "미보유"로 판정하지 않았어요.',
    checks: '검사 내용', object: '권한 객체', field: '필드 = 값', evidence: '근거', nearest: '가장 가까운 권한', gaps: '부족한 값', held: '보유 값',
    grantedBy: '부여 역할', expired: '할당 기간', periods: { expired: '종료됨', future: '시작 전' }, dateNote: '할당 유효 여부는 분석을 실행한 컴퓨터의 날짜로 판정해요.', estimates: 'SU24 제안 객체 중 보유하지 않은 것 (추정)',
    roles: '사용자의 역할 할당', role: '역할', valid: '유효', from: '시작', to: '종료', via: '복합 역할', relObjects: '관련 객체', yes: '예', no: '아니오',
    cands: '후보 역할', candNote: (p, n) => `역할 패턴 ${p} 안에서 ${n}개 역할이 해결해요. 최소 권한 순(그 T-code 포함, * · 범위 값 적은 순, T-code 수 적은 순)으로 5개까지 보여요. 할당은 보안 담당자가 결정해요.`, unknown: '읽지 않음',
    covers: '해결하는 검사', givesT: 'T-code 포함', nT: 'T-code 수', sodNew: '새 SoD 충돌', none: '없음', noCand: '패턴 안에서 해결하는 역할을 찾지 못했어요.',
    candTrunc: (o) => `객체 ${o}의 역할 행이 5000행을 넘어 일부만 읽었어요. 패턴을 좁혀 다시 실행해요.`,
    sodExisting: '이미 있는 SoD 충돌 (참고)', sodApprox: 'SoD는 T-code 수준 근사예요 (sod-library). 권한 객체 수준 판단은 보안 담당자가 해요.',
    next: '다음 조치 (사람이 함)', limits: '읽지 못한 것과 한계',
    limitProfiles: '직접 할당 프로파일(SAP_ALL 등, UST04)은 읽지 않아요.',
    profile: '생성된 프로파일', generatedFlag: '생성 표시', pstate: '상태', times: '역할 시각 (AGR_TIMEB)', factsOnly: '읽은 값 그대로예요. 프로파일이 오래됐는지는 판정하지 않아요.',
    limitReadOnly: '이 분석은 읽기만 해요. 역할 변경, 할당, PFCG 작업은 하지 않아요.',
    notRead: '읽지 못한 테이블', truncated: '5000행 상한에 걸린 읽기',
    ticket: '티켓 답변 (복사용)',
  },
  en: {
    title: 'Authorization triage', user: 'User', tcode: 'T-code', system: 'System', date: 'Date', mode: 'Based on',
    modes: { su53: 'SU53 checks', start: 'T-code start checks (S_TCODE, TSTCA)', estimate: 'Estimate from SU24 proposals' },
    verdict: 'Verdict', verdicts: { A: 'A missing', B: 'B held, not in effect', C: 'C assignment not valid today', D: 'D unclear' },
    say: {
      A: 'No role valid today gives the user this object and these values. The security owner decides from the candidate roles and their SoD impact below.',
      B: 'A role valid today gives these values, yet the check failed. Check the role profile generation (PFCG), the user comparison (PFUD) and the SU01 profiles tab. This triage does not read generated profiles (AGR_1016) or directly assigned profiles (UST04), so it cannot confirm the cause.',
      C: 'A role gives these values, but its assignment period does not cover today (already ended, or not started yet). Ended: ask for an extension. Not started: check the start date.',
      D: 'There is no object or value to check. Get the SU53 screen or an STAUTHTRACE result and run again. The SU24 list below is an estimate.',
    },
    reasonNotRead: 'A needed table could not be read, so nothing is reported as missing.',
    reasonStartOk: 'The user passes the T-code start checks and holds every SU24 proposal object. The failing check is elsewhere in the transaction — get the SU53 screen right after the error and run again.',
    reasonPartial: "The user's role values hit the read limit (5000 rows) and were partly read, so nothing is reported as missing.",
    checks: 'Checks', object: 'Object', field: 'Field = value', evidence: 'Evidence', nearest: 'Nearest authorization', gaps: 'Missing values', held: 'held',
    grantedBy: 'Granted by', expired: 'Assignment', periods: { expired: 'ended', future: 'not started yet' }, dateNote: 'Assignment validity is judged by the date of the computer that ran the triage.', estimates: 'SU24 proposal objects the user does not hold (estimate)',
    roles: 'Role assignments of the user', role: 'Role', valid: 'Valid', from: 'From', to: 'To', via: 'Composite', relObjects: 'Related objects', yes: 'yes', no: 'no',
    cands: 'Candidate roles', candNote: (p, n) => `${n} roles within patterns ${p} fix it. Up to 5 shown, least privilege first (gives the T-code, fewer * / range values, fewer T-codes). The security owner decides the assignment.`, unknown: 'not read',
    covers: 'Fixes', givesT: 'Gives T-code', nT: 'T-codes', sodNew: 'New SoD conflicts', none: 'none', noCand: 'No role within the patterns fixes the checks.',
    candTrunc: (o) => `Role rows of object ${o} exceeded 5000 and were partly read. Narrow the patterns and run again.`,
    sodExisting: 'SoD conflicts the user already has (for reference)', sodApprox: 'SoD is a T-code level approximation (sod-library). The security owner judges at object level.',
    next: 'Next steps (done by people)', limits: 'Not read and limits',
    limitProfiles: 'Directly assigned profiles (SAP_ALL etc., UST04) are not read.',
    profile: 'Generated profile', generatedFlag: 'generated', pstate: 'status', times: 'Role time stamps (AGR_TIMEB)', factsOnly: 'Values as read. Whether the profile is out of date is not judged.',
    limitReadOnly: 'Read-only. No role change, assignment or PFCG work is done.',
    notRead: 'Tables not read', truncated: 'Reads at the 5000-row limit',
    ticket: 'Ticket reply (copy)',
  },
};
export const labels = (lang) => L[lang === 'en' ? 'en' : 'ko'];

const nT = (c, t) => (c.tcodes == null ? t.unknown : `${c.tcodesPartial ? '≥' : ''}${c.tcodes}`);
const fieldsText = (f) => Object.entries(f || {}).map(([k, v]) => `${k} = ${v}`).join(', ');

function evidence(r, t, m) {
  if (r.verdict === 'B') {
    const prof = arr(r.profiles).map((p) => `${t.profile}: ${esc(p.profile)} · ${t.generatedFlag} ${esc(p.generated || '—')} · ${t.pstate} ${esc(p.pstate || '—')}`);
    const times = arr(r.times).map((x) => `${esc(x.AGR_TYPE || '—')}: ${esc(d8(x.CREATE_DAT))} ${esc(x.CREATE_TIM || '')} / ${esc(d8(x.CHANGE_DAT))} ${esc(x.CHANGE_TIM || '')}`);
    const facts = [...prof, ...(times.length ? [`${t.times}: ${times.join('; ')}`] : [])];
    return `${t.grantedBy}: ${esc(r.role)} <small>(${esc(r.auth)})</small>${facts.length ? `<br>${facts.join('<br>')}<br><small>${esc(t.factsOnly)}</small>` : ''}`;
  }
  if (r.verdict === 'C') return `${t.grantedBy}: ${esc(r.role)} · ${t.expired} ${esc(d8(r.assignment?.from))} ~ ${esc(d8(r.assignment?.to))} <b>(${esc(t.periods[r.period] || t.periods.expired)})</b>`;
  if (r.reason === 'notRead') return esc(t.reasonNotRead);
  if (r.reason === 'partial') return esc(t.reasonPartial);
  const n = r.nearest;
  if (!n) return `${t.nearest}: ${t.none}`;
  return `${t.nearest}: ${esc(n.role)} <small>(${esc(n.auth)})</small><br>${t.gaps}: ${n.gaps.map((g) => `${esc(g.field)} = ${esc(g.wanted)} <small>(${t.held}: ${esc(g.held || '—')})</small>`).join('; ')}`;
}

const reasonOf = (m) => { const r = [m.reason, ...m.results.map((x) => x.reason)]; return r.includes('notRead') ? 'reasonNotRead' : r.includes('partial') ? 'reasonPartial' : r.includes('startOk') ? 'reasonStartOk' : ''; };

function nextSteps(m, t) {
  const v = new Set([m.verdict, ...m.results.map((r) => r.verdict)]);
  return ['A', 'C', 'B', 'D'].filter((x) => v.has(x)).map((x) => `<li><b>${esc(t.verdicts[x])}</b> — ${esc(t.say[x])}</li>`).join('');
}

/** Ticket summary (Markdown, short; pasted into the AMS ticket). */
export function renderTriageMd(m) {
  const t = labels(m.lang);
  const lines = [`# ${t.title} · ${m.tcode}${m.tcodeText ? ` (${m.tcodeText})` : ''} · ${m.date}`, '',
    `- ${t.user}: ${m.user} · ${t.system}: ${m.system || '—'} · ${t.mode}: ${t.modes[m.mode]}`,
    `- ${t.verdict}: **${t.verdicts[m.verdict]}** — ${t.say[m.verdict]}`];
  for (const r of m.results) lines.push(`- ${r.check.object} (${fieldsText(r.check.fields)}): ${t.verdicts[r.verdict]}${r.role ? ` — ${r.role}` : r.nearest ? ` — ${t.nearest} ${r.nearest.role}: ${r.nearest.gaps.map((g) => `${g.field} = ${g.wanted}`).join(', ')}` : ''}`);
  for (const r of m.estimates) lines.push(`- (${t.estimates}) ${r.check.object}: ${fieldsText(r.check.fields)}`);
  if (m.candidates.length) {
    lines.push('', `## ${t.cands}`);
    for (const c of m.candidates) lines.push(`- ${c.role} — ${t.covers}: ${c.covers.join(', ')} · ${t.nT}: ${nT(c, t)} · ${t.sodNew}: ${!c.sod ? t.unknown : c.sod.added.length ? c.sod.added.map((s) => `${s.kind} (${s.level})`).join('; ') : t.none}`);
  }
  lines.push('', `${t.limitProfiles} ${t.limitReadOnly}`);
  if (m.notRead.length) lines.push(`${t.notRead}: ${m.notRead.join(', ')}`);
  return `${lines.join('\n')}\n`;
}

const STYLE = `
:root{--bg:#fff;--fg:#1d2733;--muted:#5a6675;--line:#d3dbe4;--head:#eef2f6;--card:#f6f8fa;--accent:#1d4f73;--A:#c62828;--A-bg:#fdecea;--B:#b26a00;--B-bg:#fff4e0;--C:#6a3fb5;--C-bg:#f0e9fb;--D:#5a6675;--D-bg:#eceff2;color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme=light]){--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--card:#161d26;--accent:#5b9bd0;--A:#ef6b6b;--A-bg:#3a1d1d;--B:#e0a43a;--B-bg:#3a2c12;--C:#b79af0;--C-bg:#2a2140;--D:#b4bcc6;--D-bg:#283039;color-scheme:dark}}
:root[data-theme=dark]{--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--card:#161d26;--accent:#5b9bd0;--A:#ef6b6b;--A-bg:#3a1d1d;--B:#e0a43a;--B-bg:#3a2c12;--C:#b79af0;--C-bg:#2a2140;--D:#b4bcc6;--D-bg:#283039;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR",sans-serif}
main{max-width:1040px;margin:0 auto;padding:20px 16px 48px}h1{font-size:22px;margin:0 0 4px;color:var(--accent)}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
small,.muted{color:var(--muted)}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}th{background:var(--head);font-weight:600}
.meta{display:flex;flex-wrap:wrap;gap:6px 18px;color:var(--muted)}.meta b{color:var(--fg);font-weight:600}
.verdict{margin:16px 0;padding:12px 14px;border-radius:8px;border:1px solid var(--line)}.verdict .v{font-size:18px;font-weight:700}
.v-A{background:var(--A-bg);color:var(--A)}.v-B{background:var(--B-bg);color:var(--B)}.v-C{background:var(--C-bg);color:var(--C)}.v-D{background:var(--D-bg);color:var(--D)}
.verdict p{margin:6px 0 0;color:var(--fg)}.tag{display:inline-block;padding:0 8px;border-radius:10px;font-weight:600;font-size:12px;white-space:nowrap}
ul{margin:6px 0;padding-left:20px}pre{white-space:pre-wrap;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:10px;font-size:13px}
@media print{main{max-width:none}h2{break-after:avoid}}
/* Phones: each row of a check / candidate / role table is a card, every cell labelled from data-l (a label column beside the cell's own flow — the cell's <b> / <br> / <small> stay in line), so the verdict and
   the evidence never sit off-screen in a sideways-scrolling table. The header row (the first, there is no thead) hides. */
@media (max-width:600px){table.cards,table.cards>tbody,table.cards>tbody>tr,table.cards td{display:block}table.cards{margin:6px 0 10px}
table.cards>tbody>tr:first-child{display:none}table.cards>tbody>tr{border:1px solid var(--line);border-radius:8px;padding:6px 10px;margin:0 0 8px;background:var(--bg)}
table.cards td{position:relative;border:0;padding:3px 0 3px 7em;min-width:0;min-height:1.9em;overflow-wrap:anywhere}
table.cards td::before{content:attr(data-l);position:absolute;left:0;top:3px;width:6.5em;color:var(--muted);font-size:12px;line-height:1.9;overflow-wrap:anywhere}}`;

/** The page. */
export function renderTriagePage(m) {
  const t = labels(m.lang);
  const tag = (v) => `<span class="tag v-${v}">${esc(t.verdicts[v])}</span>`;
  const checkRows = (list) => list.map((r) => `<tr><td data-l="${esc(t.object)}"><b>${esc(r.check.object)}</b><br><small>${esc(m.texts.objects?.[r.check.object] || '')}</small></td><td data-l="${esc(t.field)}">${Object.entries(r.check.fields).map(([k, v]) => `${esc(k)} = ${esc(v)}${m.texts.fields?.[k] ? ` <small>${esc(m.texts.fields[k])}</small>` : ''}`).join('<br>')}</td><td data-l="${esc(t.verdict)}">${tag(r.verdict)}</td><td data-l="${esc(t.evidence)}">${evidence(r, t, m)}</td></tr>`).join('');
  const head = `<tr><th>${t.object}</th><th>${t.field}</th><th>${t.verdict}</th><th>${t.evidence}</th></tr>`;
  const roles = m.assignments.map((a) => `<tr><td data-l="${esc(t.role)}">${esc(a.role)}</td><td data-l="${esc(t.valid)}">${a.valid ? t.yes : `<b>${t.no}</b>`}</td><td data-l="${esc(t.from)}">${esc(d8(a.from))}</td><td data-l="${esc(t.to)}">${esc(d8(a.to))}</td><td data-l="${esc(t.via)}">${esc(a.via)}</td><td data-l="${esc(t.relObjects)}">${esc(a.objects.join(', '))}</td></tr>`).join('');
  const sodList = (list) => (list.length ? list.map((s) => `${esc(s.kind)} <span class="tag v-${s.level === 'H' ? 'A' : s.level === 'M' ? 'B' : 'D'}">${esc(s.level)}</span> <small>${esc(s.a.join(', '))} / ${esc(s.b.join(', '))}</small>`).join('<br>') : esc(t.none));
  const cands = m.candidates.map((c, i) => `<tr><td data-l="#">${i + 1}</td><td data-l="${esc(t.role)}"><b>${esc(c.role)}</b></td><td data-l="${esc(t.covers)}">${esc(c.covers.join(', '))}</td><td data-l="${esc(t.givesT)}">${c.givesTcode ? t.yes : t.no}</td><td data-l="${esc(t.nT)}">${nT(c, t)}</td><td data-l="${esc(t.sodNew)}">${c.sod ? sodList(c.sod.added) : esc(t.unknown)}</td></tr>`).join('');
  const showCands = m.results.some((r) => r.verdict === 'A' || r.verdict === 'C');
  const body = `<main>
<h1>${esc(t.title)} · ${esc(m.tcode)}</h1>
<div class="meta"><span>${t.user} <b>${esc(m.user)}</b></span><span>${t.tcode} <b>${esc(m.tcode)}</b> ${esc(m.tcodeText)}</span><span>${t.system} <b>${esc(m.system || '—')}</b></span><span>${t.date} <b>${esc(m.date)}</b></span><span>${t.mode} <b>${esc(t.modes[m.mode])}</b></span></div>
<div class="verdict v-${m.verdict}"><div class="v">${esc(t.verdict)}: ${esc(t.verdicts[m.verdict])}</div><p>${esc(t.say[m.verdict])}${reasonOf(m) ? ` ${esc(t[reasonOf(m)])}` : ''}</p></div>
${m.results.length ? `<h2>${t.checks}</h2><table class="cards">${head}${checkRows(m.results)}</table>` : ''}
${m.estimates.length ? `<h2>${t.estimates}</h2><table class="cards">${head}${checkRows(m.estimates)}</table>` : ''}
${showCands ? `<h2>${t.cands}</h2><p class="muted">${esc(t.candNote(m.patterns.join(', '), m.candidateTotal))}</p>${m.candidates.length ? `<table class="cards"><tr><th>#</th><th>${t.role}</th><th>${t.covers}</th><th>${t.givesT}</th><th>${t.nT}</th><th>${t.sodNew}</th></tr>${cands}</table>` : `<p>${esc(t.noCand)}</p>`}${m.candidateTruncated.map((o) => `<p class="muted">${esc(t.candTrunc(o))}</p>`).join('')}<p class="muted">${esc(t.sodApprox)}</p>` : ''}
${m.sodExisting.length ? `<h2>${t.sodExisting}</h2><p>${sodList(m.sodExisting)}</p>` : ''}
<h2>${t.roles}</h2>${m.assignments.length ? `<table class="cards"><tr><th>${t.role}</th><th>${t.valid}</th><th>${t.from}</th><th>${t.to}</th><th>${t.via}</th><th>${t.relObjects}</th></tr>${roles}</table>` : `<p>${esc(t.none)}</p>`}
<h2>${t.next}</h2><ul>${nextSteps(m, t)}</ul>
<h2>${t.limits}</h2><ul><li>${esc(t.limitProfiles)}</li><li>${esc(t.limitReadOnly)}</li><li>${esc(t.dateNote)}</li>${m.notRead.length ? `<li>${t.notRead}: ${esc(m.notRead.join(', '))}</li>` : ''}${m.truncated.length ? `<li>${t.truncated}: ${esc(m.truncated.join(', '))}</li>` : ''}${m.readErrors.map((e) => `<li><small>${esc(e)}</small></li>`).join('')}</ul>
<h2>${t.ticket}</h2><pre>${esc(renderTriageMd(m))}</pre>
</main>`;
  return withResponsive(`<!doctype html>
<html lang="${m.lang === 'en' ? 'en' : 'ko'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)} · ${esc(m.tcode)} · ${esc(m.date)}</title><style>${STYLE}</style></head>
<body>${body}</body></html>`);
}

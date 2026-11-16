// sc4sap:analyze-symptom job / IDoc incidents — the short facts page and its Markdown summary (from incident-model.mjs).
// Facts only: the hypotheses are written by analyze-symptom.

import { withResponsive } from '../lib/responsive.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arr = (v) => (Array.isArray(v) ? v : []);

const L = {
  en: {
    jobTitle: 'Job failure facts', idocTitle: 'IDoc facts', system: 'System', readAt: 'Read', failure: 'Failed run', lastOk: 'Last good run', none: 'none found',
    historyCut: 'The 30-day history has more runs than one read returns (5000): counts are at least these. The aborted runs and the finished runs around the failure were read again in full.', recentCut: 'Even the aborted runs or the runs around the failure exceed one read: the failed run or the last good run may be missing — check SM37.',
    history: 'History (30 days)', runs: 'runs', aborted: 'aborted', finished: 'finished', inRow: 'aborted in a row', periodic: 'periodic', every: 'every',
    steps: 'Steps of the failed run', step: 'Step', program: 'Program', variant: 'Variant', external: 'External program', status: 'Status',
    flags: 'Signals (facts, not a verdict)', flag: {
      codeChange: 'A request changed a step program between the last good run and the failure',
      dump: 'A dump of a step program around the failure time',
      system: 'Other jobs aborted within 30 minutes of the failure',
      dataOrVariant: 'None of the above — the cause is likely in the data or the variant; the job log (SM37) shows the message',
      error: 'The IDoc is in an error status', mass: 'Many IDocs of this message type and partner sit in the same status (7 days)', single: 'Only this IDoc of the type and partner is in this status (7 days)',
    },
    yes: 'yes', no: 'no', unknown: 'unknown', notReadSec: 'not read — see "Not read" below', skippedSec: 'not checked (nothing to check against)', stepsUnknown: 'could not check — steps unknown', dumps: 'Dumps around the failure', at: 'At', error: 'Runtime error', matched: 'Step program',
    suspects: 'Requests that changed the code', request: 'Request', date: 'Date', text: 'Text', between: 'Between runs',
    concurrent: 'Other jobs aborted ±30 min', idoc: 'IDoc', mestyp: 'Message type', idoctp: 'Basic type', direction: 'Direction', partner: 'Partner', port: 'Port',
    created: 'Created', updated: 'Changed', volume: 'Same type and partner, 7 days', sameStatus: 'in the same status', anyError: 'in an error status', total: 'in total',
    others: 'Other IDocs read', inboundFm: 'Inbound function', processCode: 'Process code', interfaces: 'Interface specs for this message type',
    notRead: 'Not read', limits: 'Phase 1 limits',
    limit: { jobLog: 'The job log is not read — check SM37 (job log) for the message that stopped the job.', owners: 'Step users and job owners are not read.',
      statusRecords: 'IDoc status records (error message, segment / field) are not read — check WE02 / BD87.', partnerProfile: 'The partner profile (process code) is not read — check WE20; a given process code names the inbound function.' }, closed: 'This system\'s dispatcher does not allow job / IDoc reads — use the TCodes below.', noFocus: 'No IDoc in error found for the input.',
  },
  ko: {
    jobTitle: '잡 실패 사실', idocTitle: 'IDoc 사실', system: '시스템', readAt: '읽은 시각', failure: '실패한 실행', lastOk: '마지막 정상 실행', none: '찾지 못함',
    historyCut: '30일 실행 수가 한 번에 읽는 상한(5000)을 넘어요. 건수는 최소값이에요. 중단된 실행과 실패 전후의 완료 실행은 다시 전부 읽었어요.', recentCut: '중단된 실행이나 실패 전후 실행도 상한을 넘어요. 실패한 실행이나 마지막 정상 실행이 빠졌을 수 있어요. SM37에서 확인해요.',
    history: '이력 (30일)', runs: '실행', aborted: '중단', finished: '완료', inRow: '연속 중단', periodic: '주기 잡', every: '주기',
    steps: '실패한 실행의 스텝', step: '스텝', program: '프로그램', variant: '변형', external: '외부 프로그램', status: '상태',
    flags: '신호 (사실이며 판정이 아니에요)', flag: {
      codeChange: '마지막 정상 실행과 실패 사이에 스텝 프로그램을 바꾼 요청이 있어요',
      dump: '실패 시각 근처에 스텝 프로그램의 덤프가 있어요',
      system: '실패 30분 안에 다른 잡도 중단됐어요',
      dataOrVariant: '위 신호가 없어요 — 원인은 데이터나 변형일 가능성이 커요. 잡 로그(SM37)에서 메시지를 확인해요',
      error: 'IDoc이 오류 상태예요', mass: '같은 메시지 유형·파트너의 IDoc이 같은 상태에 많이 있어요 (7일)', single: '같은 유형·파트너 중 이 IDoc만 이 상태예요 (7일)',
    },
    yes: '예', no: '아니오', unknown: '알 수 없음', notReadSec: '읽지 못함 — 아래 "읽지 못한 것"을 봐요', skippedSec: '확인 못 함 (비교할 대상이 없어요)', stepsUnknown: '스텝을 몰라 확인 못 함', dumps: '실패 시각 근처 덤프', at: '시각', error: '런타임 오류', matched: '스텝 프로그램',
    suspects: '코드를 바꾼 요청', request: '요청', date: '날짜', text: '내역', between: '실행 사이',
    concurrent: '±30분 안에 중단된 다른 잡', idoc: 'IDoc', mestyp: '메시지 유형', idoctp: '기본 유형', direction: '방향', partner: '파트너', port: '포트',
    created: '생성', updated: '변경', volume: '같은 유형·파트너, 7일', sameStatus: '같은 상태', anyError: '오류 상태', total: '전체',
    others: '함께 읽은 IDoc', inboundFm: '인바운드 함수', processCode: '프로세스 코드', interfaces: '이 메시지 유형의 인터페이스 스펙',
    notRead: '읽지 못한 것', limits: '1단계 한계',
    limit: { jobLog: '잡 로그는 읽지 않아요. 잡을 멈춘 메시지는 SM37 잡 로그에서 확인해요.', owners: '스텝 사용자와 잡 소유자는 읽지 않아요.',
      statusRecords: 'IDoc 상태 레코드(오류 메시지, 세그먼트·필드)는 읽지 않아요. WE02 / BD87에서 확인해요.', partnerProfile: '파트너 프로파일(프로세스 코드)은 읽지 않아요. WE20에서 확인하고, 프로세스 코드를 주면 인바운드 함수를 찾아요.' }, closed: '이 시스템의 디스패처는 잡 / IDoc 읽기를 허용하지 않아요. 아래 TCode로 확인해요.', noFocus: '입력에 맞는 오류 IDoc을 찾지 못했어요.',
  },
};
export const labels = (lang) => L[lang === 'ko' ? 'ko' : 'en'];

const table = (head, rows) => (rows.length ? `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>` : '');
const run = (r, t) => (r ? `${esc(r.startDate)} ${esc(r.startTime)} → ${esc(r.endDate)} ${esc(r.endTime)}${r.minutes != null ? ` (${r.minutes} min)` : ''} · ${esc(r.statusText)}` : esc(t.none));

const yn = (v, t) => (v === true ? t.yes : v === false ? t.no : t.unknown);
/** A section that was not read or not checked says so instead of "none found". */
const gap = (f, k, t) => { const s = f.state?.[k]; return s === 'notRead' ? `<p class="warn">${esc(t.notReadSec)}</p>` : s === 'skipped' ? `<p class="warn">${esc(t.skippedSec)}</p>` : ''; };
const orNone = (f, k, t, html) => gap(f, k, t) || html || esc(t.none);
/** Dumps and changing requests are matched to the step programs: without the steps an empty result proves nothing. */
const stepsGap = (f, t) => (f.kind === 'job' && f.state && f.state.steps !== 'read' ? `<p class="warn">${esc(t.stepsUnknown)}</p>` : '');
const orNoneSteps = (f, k, t, html) => gap(f, k, t) || html || stepsGap(f, t) || esc(t.none);

function flagList(f, t) {
  return `<ul>${Object.entries(f.flags || {}).map(([k, v]) => `<li><b>${esc(yn(v, t))}</b> — ${esc(t.flag[k] || k)}</li>`).join('')}</ul>`;
}

/** Markdown summary for the chat / ticket. */
export function renderIncidentMd(f) {
  const t = labels(f.lang);
  const lines = [];
  if (f.kind === 'job' && f.state?.runs === 'notRead') lines.push(`# ${t.jobTitle} · ${f.job}`, '', `- ${t.failure}: ${t.notReadSec}`);
  else if (f.kind === 'job') {
    lines.push(`# ${t.jobTitle} · ${f.job}`, '', `- ${t.failure}: ${f.failure ? `${f.failure.endDate} ${f.failure.endTime}` : t.none} · ${t.lastOk}: ${f.lastOk ? `${f.lastOk.startDate} ${f.lastOk.startTime}` : t.none}`,
      ...(f.history.cut ? [`- ${f.history.recentCut ? t.recentCut : t.historyCut}`] : []),
      `- ${t.history}: ${f.history.cut ? '≥' : ''}${f.history.runs} ${t.runs}, ${f.history.aborted} ${t.aborted}, ${f.history.abortedInRow} ${t.inRow}`,
      `- ${t.steps}: ${f.steps.map((s) => `${s.step} ${s.program || s.external}${s.variant ? ` (${s.variant})` : ''}`).join('; ') || (f.state?.steps === 'read' ? t.none : f.state?.steps === 'notRead' ? t.notReadSec : t.skippedSec)}`);
  } else if (f.focus) {
    lines.push(`# ${t.idocTitle} · ${f.focus.docnum}`, '', `- ${f.focus.mestyp} / ${f.focus.idoctp} · ${f.focus.direction} · ${t.partner} ${f.focus.partner} · ${t.status} ${f.focus.status} ${f.focus.statusText}`,
      ...(f.volume ? [`- ${t.volume}: ${f.volume.sameStatus} ${t.sameStatus}, ${f.volume.anyError} ${t.anyError}, ${f.volume.total} ${t.total}`] : []));
  } else lines.push(`# ${t.idocTitle}`, '', `- ${f.state?.idocs === 'notRead' ? t.notReadSec : t.noFocus}`);
  lines.push('', `## ${t.flags}`, ...Object.entries(f.flags || {}).map(([k, v]) => `- ${yn(v, t)} — ${t.flag[k] || k}`));
  const gaps = Object.entries(f.state || {}).filter(([, s]) => s !== 'read');
  if (gaps.length) lines.push('', ...gaps.map(([k, s]) => `- ${k}: ${s === 'notRead' ? t.notReadSec : t.skippedSec}`));
  if (arr(f.suspects).length) lines.push('', `## ${t.suspects}`, ...f.suspects.map((s) => `- ${s.trkorr} ${s.date} ${s.status} — ${s.text}${s.betweenRuns ? ` (${t.between})` : ''}`));
  if (f.notRead.length) lines.push('', `${t.notRead}: ${f.notRead.map((n) => n.section).join(', ')}`);
  lines.push('', `${t.limits}: ${f.phase1Limits.map((k) => t.limit[k] || k).join(' ')}`);
  return `${lines.join('\n')}\n`;
}

const STYLE = `
:root{--bg:#fff;--fg:#1d2733;--muted:#5a6675;--line:#d3dbe4;--head:#eef2f6;--card:#f6f8fa;--accent:#1d4f73;--red:#c62828;color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme=light]){--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--card:#161d26;--accent:#5b9bd0;--red:#ef6b6b;color-scheme:dark}}
:root[data-theme=dark]{--bg:#0f141a;--fg:#e4eaf0;--muted:#95a1ae;--line:#36414d;--head:#18202a;--card:#161d26;--accent:#5b9bd0;--red:#ef6b6b;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR",sans-serif}
main{max-width:1040px;margin:0 auto;padding:20px 16px 48px}h1{font-size:22px;margin:0 0 4px;color:var(--accent)}h2{font-size:16px;margin:26px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
.meta{color:var(--muted)}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}th{background:var(--head);font-weight:600}
.box{overflow-x:auto}.warn{color:var(--red);font-weight:600}ul{margin:6px 0;padding-left:20px}pre{white-space:pre-wrap;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:10px;font-size:13px}`;

/** The page. */
export function renderIncidentPage(f) {
  const t = labels(f.lang);
  const parts = [];
  if (f.kind === 'job') {
    parts.push(`<h1>${esc(t.jobTitle)} · ${esc(f.job)}</h1>`);
    if (gap(f, 'runs', t)) parts.push(gap(f, 'runs', t));
    if (f.history?.cut) parts.push(`<p class="warn">${esc(f.history.recentCut ? t.recentCut : t.historyCut)}</p>`);
    if (gap(f, 'runs', t)) { /* shown above */ } else parts.push(`<p>${t.failure}: ${run(f.failure, t)}<br>${t.lastOk}: ${run(f.lastOk, t)}<br>${t.history}: ${f.history.runs} ${t.runs} · ${f.history.aborted} ${t.aborted} · ${f.history.finished} ${t.finished} · ${f.history.abortedInRow} ${t.inRow}${f.history.periodic ? ` · ${t.periodic} (${t.every} ${esc(f.history.period)})` : ''}</p>`);
    parts.push(`<h2>${t.flags}</h2>${flagList(f, t)}`);
    parts.push(`<h2>${t.steps}</h2><div class="box">${orNone(f, 'steps', t, table([t.step, t.program, t.variant, t.external, t.status], f.steps.map((s) => [s.step, esc(s.program), esc(s.variant), esc(s.external), esc(s.status)])))}</div>`);
    parts.push(`<h2>${t.dumps}</h2><div class="box">${orNoneSteps(f, 'dumps', t, table([t.at, t.error, t.program, t.matched], f.dumps.map((d) => [`${esc(d.date)} ${esc(d.time)}`, esc(d.error), esc(d.program), d.matched ? t.yes : t.no])))}</div>`);
    parts.push(`<h2>${t.concurrent}${f.state?.others === 'read' ? ` (${f.concurrentTotal})` : ''}</h2><div>${orNone(f, 'others', t, f.concurrent.map((x) => `${esc(x.job)} <small>${esc(x.endDate)} ${esc(x.endTime)}</small>`).join(', '))}</div>`);
  } else {
    parts.push(`<h1>${esc(t.idocTitle)}${f.focus ? ` · ${esc(f.focus.docnum)}` : ''}</h1>`);
    if (f.focus) {
      const x = f.focus;
      parts.push(`<div class="box">${table([t.mestyp, t.idoctp, t.direction, t.partner, t.port, t.status, t.created, t.updated], [[esc(x.mestyp), esc(x.idoctp), esc(x.direction), `${esc(x.partner)} <small>${esc(x.partnerType)}</small>`, esc(x.port), `<span class="${x.error ? 'warn' : ''}">${esc(x.status)}</span> ${esc(x.statusText)}`, esc(x.created), esc(x.updated)]])}</div>`);
      if (gap(f, 'volume', t)) parts.push(`<p>${t.volume}:</p>${gap(f, 'volume', t)}`);
      else if (f.volume) parts.push(`<p>${t.volume}: <b>${f.volume.sameStatus}</b> ${t.sameStatus} · ${f.volume.anyError} ${t.anyError} · ${f.volume.total}${f.volumeTruncated ? '+' : ''} ${t.total}</p>`);
    } else parts.push(gap(f, 'idocs', t) || `<p>${esc(t.noFocus)}</p>`);
    parts.push(`<h2>${t.flags}</h2>${flagList(f, t)}`);
    parts.push(`<p>${t.processCode}: ${esc(f.processCode || '—')} · ${t.inboundFm}: ${esc(f.inboundFm || '—')}</p>`);
    if (f.interfaces.length) parts.push(`<h2>${t.interfaces}</h2><ul>${f.interfaces.map((i) => `<li>${esc(i.ifId)} ${esc(i.name)}</li>`).join('')}</ul>`);
    if (f.others.length) parts.push(`<h2>${t.others}</h2><div class="box">${table([t.idoc, t.status, t.partner, t.created], f.others.map((i) => [esc(i.docnum), `${esc(i.status)} ${esc(i.statusText)}`, esc(i.partner), esc(i.created)]))}</div>`);
  }
  parts.push(`<h2>${t.suspects}</h2><div class="box">${orNoneSteps(f, 'changes', t, table([t.request, t.date, t.status, t.text, t.between], arr(f.suspects).map((s) => [esc(s.trkorr), esc(s.date), esc(s.status), esc(s.text), s.betweenRuns ? t.yes : t.no])))}</div>`);
  const nr = f.notRead.map((n) => `<li>${esc(n.section)} <small>${esc(n.error)}</small></li>`).join('');
  parts.push(`<h2>${t.notRead} · ${t.limits}</h2>${f.dispatcherClosed ? `<p class="warn">${esc(t.closed)}</p>` : ''}<ul>${nr}${f.phase1Limits.map((k) => `<li>${esc(t.limit[k] || k)}</li>`).join('')}</ul>`);
  const title = f.kind === 'job' ? `${t.jobTitle} · ${f.job}` : `${t.idocTitle}${f.focus ? ` · ${f.focus.docnum}` : ''}`;
  return withResponsive(`<!doctype html>
<html lang="${f.lang === 'ko' ? 'ko' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body><main><p class="meta">${t.system} ${esc(f.system || '—')} · ${t.readAt} ${esc(f.readAt)}</p>${parts.join('\n')}<h2>Markdown</h2><pre>${esc(renderIncidentMd(f))}</pre></main></body></html>`);
}

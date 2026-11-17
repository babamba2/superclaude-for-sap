// sc4sap:transport-readiness (cab mode) — the CAB change-notes page (self-contained HTML) and its summary.
//
// One card per request: risk, CTS verdict, the business text (AI draft until a person edits it), objects,
// affected TCodes and jobs, test evidence, rollback facts, and the CAB decision + comment (entered by people).
// Edit mode makes only the business text, the decision and the comment editable; "Save" downloads the page with
// the edits embedded (<script type="application/json" id="cab-edits">) next to the model it was drawn from
// (id="cab-model"); `build-cab-notes.mjs import` reads both back. A4 landscape in print, a card never splits.

import { withResponsive } from '../lib/responsive.mjs';

const T = {
  en: {
    title: 'Change notes for the CAB', system: 'System', target: 'Into', cabDate: 'CAB date', readAt: 'Read at',
    risk: { H: 'High', M: 'Medium', L: 'Low' }, verdict: { ready: 'CTS ready', check: 'CTS check', blocked: 'CTS blocked' },
    what: 'What changes', aiDraft: 'AI draft — review', edited: 'Edited', noNote: 'No business text yet.', objects: 'Objects', more: 'more',
    impact: 'Affected', tcodes: 'TCodes', programs: 'programs / functions / classes', jobs: 'Scheduled jobs', jobsUnread: 'jobs not read', truncated: 'truncated — list incomplete', jobsOwn: 'not collected — only the programs in the request were checked', jobsPartial: (n) => `none found — checked for ${n} program(s) only (part of the impact not collected)`,
    jobUsage: 'run in a job step (ST03N)', notCollected: 'Impact not collected — run the CBO object collection (stock-cbo) for', partial: 'Impact partly known — no graph for',
    noImpact: 'No TCode reached in the graph.', usage: { direct: 'used', indirect: 'used indirectly', unused: 'unused', 'no-evidence': 'no usage data' },
    evidence: 'Test evidence', noEvidence: 'No test evidence.', how: { direct: 'linked', objects: 'same objects', heuristic: 'same T-code (heuristic)' },
    src: { wricef: 'WRICEF', issue: 'UAT issue', uat: 'UAT step' }, rollback: 'Rollback',
    rb: { 'no-auto': 'No automatic rollback.', customizing: 'Table entries have no version history — undo with a new request that holds the previous values.',
      'ddic-data': (x) => `${x.obj}: hard to roll back (table data / conversion) — plan a forward fix.`,
      'prev-version': (x) => `${x.obj}: the target holds the version of ${x.korrnum} — restore that version from version management and move it with a new request; do not import the old request again.`,
      'new-object': (x) => `${x.obj}: not in the target (new) — undo with a deletion request.`,
      'target-unread': 'Target not checked — previous versions unknown.', more: (x) => `+${x.n} more objects not listed.` },
    reasons: { blocked: 'CTS blocked', ddic: 'DDIC table / data element / domain change', 'tcodes-many': (x) => `${x.n} TCodes affected`, 'direct-tcode': (x) => `used TCode affected (${x.names.join(', ')})`,
      job: (x) => `${x.n} scheduled job(s) affected`, 'jobs-truncated': 'job list truncated — affected jobs may be missing', check: 'CTS warnings', customizing: 'customizing request', 'tcodes-some': (x) => `${x.n} TCode(s) affected`, 'no-evidence': 'no test evidence' },
    decision: 'CAB decision', comment: 'Comment', dec: { '': '—', approve: 'Approve', conditional: 'Approve with conditions', hold: 'Hold' },
    uatUnread: 'UAT sets not read', why: { 'invalid-id': 'invalid ID', missing: 'not found' },
    edit: 'Edit', done: 'Done', save: 'Save', print: 'Print', dark: 'Dark', light: 'Light', unsaved: 'Unsaved changes', saved: 'Saved',
    note: 'Read-only notes. Impact, jobs, evidence and rollback are read from the system and the files given; the business text is an AI draft until a person edits it. The CAB decision is made by people.',
  },
  ko: {
    title: 'CAB 변경 노트', system: '시스템', target: '대상', cabDate: 'CAB 일자', readAt: '조회 시각',
    risk: { H: '높음', M: '보통', L: '낮음' }, verdict: { ready: 'CTS 이관 가능', check: 'CTS 확인 필요', blocked: 'CTS 이관 불가' },
    what: '무엇이 바뀌나', aiDraft: 'AI 초안 — 검토 필요', edited: '수정됨', noNote: '업무 설명이 아직 없어요.', objects: '오브젝트', more: '개 더',
    impact: '영향', tcodes: 'TCode', programs: '프로그램·함수·클래스', jobs: '예약 잡', jobsUnread: '잡 조회 안 함', truncated: '잘림 — 목록 불완전', jobsOwn: '미수집 — 요청 자체 프로그램만 확인했어요', jobsPartial: (n) => `일부만 확인 (${n}개 프로그램) — 영향 일부 미수집`,
    jobUsage: '잡 스텝에서 실행 (ST03N)', notCollected: '영향도 미수집 — 먼저 CBO 오브젝트 수집(stock-cbo)을 실행하세요:', partial: '영향도 일부만 확인 — graph 없음:',
    noImpact: 'graph에서 닿는 TCode가 없어요.', usage: { direct: '사용', indirect: '간접 사용', unused: '미사용', 'no-evidence': '사용 정보 없음' },
    evidence: '테스트 증빙', noEvidence: '증빙 없음.', how: { direct: '직접 연결', objects: '같은 오브젝트', heuristic: '같은 T-code (추정)' },
    src: { wricef: 'WRICEF', issue: 'UAT 이슈', uat: 'UAT 스텝' }, rollback: '되돌리기',
    rb: { 'no-auto': '자동 롤백 없음.', customizing: '테이블 항목은 버전 이력이 없어요. 이전 값을 담은 새 요청으로 되돌려요.',
      'ddic-data': (x) => `${x.obj}: 되돌리기 어려움 (데이터·변환) — 후속 수정으로 대응해요.`,
      'prev-version': (x) => `${x.obj}: 이전 버전 (${x.korrnum})을 버전 관리에서 복원해 새 요청으로 이관 — 예전 요청 재이관 금지.`,
      'new-object': (x) => `${x.obj}: 대상에 없음 (신규) — 삭제 요청으로 되돌려요.`,
      'target-unread': '대상 미확인 — 이전 버전을 알 수 없어요.', more: (x) => `외 ${x.n}개 오브젝트는 생략했어요.` },
    reasons: { blocked: 'CTS 이관 불가', ddic: 'DDIC 테이블·데이터 요소·도메인 변경', 'tcodes-many': (x) => `영향 TCode ${x.n}개`, 'direct-tcode': (x) => `사용 중인 TCode 영향 (${x.names.join(', ')})`,
      job: (x) => `예약 잡 ${x.n}개 영향`, 'jobs-truncated': '잡 목록이 잘림 — 영향 잡이 빠졌을 수 있어요', check: 'CTS 경고', customizing: '커스터마이징 요청', 'tcodes-some': (x) => `영향 TCode ${x.n}개`, 'no-evidence': '테스트 증빙 없음' },
    decision: 'CAB 결정', comment: '의견', dec: { '': '—', approve: '승인', conditional: '조건부 승인', hold: '보류' },
    uatUnread: '읽지 못한 UAT 세트', why: { 'invalid-id': '잘못된 ID', missing: '파일 없음' },
    edit: '편집', done: '편집 끝', save: '저장', print: '인쇄', dark: '다크', light: '라이트', unsaved: '저장 안 됨', saved: '저장됨',
    note: '조회 전용 노트예요. 영향·잡·증빙·되돌리기는 시스템과 받은 파일에서 읽었고, 업무 설명은 사람이 고치기 전까지 AI 초안이에요. CAB 결정은 사람이 해요.',
  },
};
export const labelsOf = (lang) => T[lang] || T.en;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const say = (v, x) => (typeof v === 'function' ? v(x) : v ?? '');
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

function impactBlock(r, t) {
  const i = r.impact;
  const parts = [];
  if (i.status === 'not-collected') parts.push(`<p class="warn">${esc(t.notCollected)} ${esc(i.missingPackages.join(', ') || '—')}</p>`);
  else {
    if (i.status === 'partial') parts.push(`<p class="warn">${esc(t.partial)} ${esc(i.missingPackages.join(', '))}</p>`);
    parts.push(i.tcodes.length
      ? `<p><b>${esc(t.tcodes)} ${i.tcodes.length}</b> · ${i.programs.length} ${esc(t.programs)}</p><p class="chips">${i.tcodes.slice(0, 40).map((x) => `<span class="chip ${x.usage === 'direct' ? 'hot' : ''}" title="${esc(t.usage[x.usage] || '')}"><code>${esc(x.name)}</code>${x.text ? ` ${esc(x.text)}` : ''}</span>`).join('')}${i.tcodes.length > 40 ? ` +${i.tcodes.length - 40}` : ''}</p>`
      : `<p class="muted">${esc(t.noImpact)}</p>`);
  }
  const jobs = r.jobs === null ? `<span class="muted">${esc(t.jobsUnread)}</span>`
    : !r.jobs.length && r.jobsScope === 'own' ? `<span class="warn">${esc(t.jobsOwn)}</span>`
    : !r.jobs.length && r.jobsScope === 'partial' ? `<span class="warn">${esc(t.jobsPartial(new Set([...r.impact.programs, ...r.objects.filter((o) => o.type === 'PROG').map((o) => o.name)]).size))}</span>`
    : r.jobs.length ? r.jobs.slice(0, 20).map((j) => `<code>${esc(j.job || j.program)}</code>${j.job ? ` <small>${esc(j.program)}</small>` : ` <small>${esc(t.jobUsage)}</small>`}`).join(' · ') : '0';
  parts.push(`<p><b>${esc(t.jobs)}</b>: ${jobs}${r.jobsTruncated ? ` <span class="warn">(${esc(t.truncated)})</span>` : ''}</p>`);
  return parts.join('');
}

function card(r, t) {
  const k = esc(r.trkorr);
  const badge = r.note.source === 'human' ? `<span class="b ed-b">${esc(t.edited)}</span>` : r.note.text ? `<span class="b ai">${esc(t.aiDraft)}</span>` : '';
  const objs = r.objects.slice(0, 20).map((o) => `<li><code>${esc(o.type)} ${esc(o.name)}</code>${o.text ? ` ${esc(o.text)}` : ''}</li>`).join('');
  const ev = r.evidence.length ? `<ul>${r.evidence.slice(0, 12).map((e) => `<li><b>${esc(t.src[e.source])}</b> <code>${esc(e.ref)}</code> ${esc(e.text)} — ${esc(e.result)} <small>(${esc(t.how[e.how])})</small></li>`).join('')}</ul>` : `<p class="warn">${esc(t.noEvidence)}</p>`;
  const dec = Object.entries(t.dec).map(([v, l]) => `<option value="${esc(v)}"${r.decision === v ? ' selected' : ''}>${esc(l)}</option>`).join('');
  return `<section class="card r${r.risk.level}">
<h2><code>${k}</code> <span class="risk r${r.risk.level}">${esc(t.risk[r.risk.level])}</span> <span class="v ${r.verdict}">${esc(t.verdict[r.verdict])}</span></h2>
<p class="meta">${esc(r.text)} · ${esc(r.kind)} · ${esc(r.owner)}${r.risk.reasons.length ? ` · ${r.risk.reasons.map((x) => esc(say(t.reasons[x.code], x))).join(' · ')}` : ''}</p>
<div class="grid"><div><h3>${esc(t.what)} ${badge}</h3><div class="txt" data-e="note-${k}">${esc(r.note.text)}</div>${r.note.text ? '' : `<p class="muted hint">${esc(t.noNote)}</p>`}
<h3>${esc(t.objects)} (${r.objects.length})</h3><ul class="objs">${objs}</ul>${r.objects.length > 20 ? `<p class="muted">+${r.objects.length - 20} ${esc(t.more)}</p>` : ''}</div>
<div><h3>${esc(t.impact)}</h3>${impactBlock(r, t)}<h3>${esc(t.evidence)}</h3>${ev}
<h3>${esc(t.rollback)}</h3><ul class="rb">${r.rollback.map((x) => `<li>${esc(say(t.rb[x.code], x))}</li>`).join('')}</ul></div></div>
<div class="dec"><label><b>${esc(t.decision)}</b> <select data-e="decision-${k}" disabled>${dec}</select></label>
<div><b>${esc(t.comment)}</b><div class="txt cm" data-e="comment-${k}">${esc(r.comment)}</div></div></div>
</section>`;
}

const STYLE = `:root{--bg:#fff;--fg:#1d2430;--muted:#5d6878;--line:#d9dee6;--soft:#f3f5f8;--red:#c0392b;--amber:#b7791f;--green:#2f855a;--edit:#eaf1fb;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14181f;--fg:#e4e8ee;--muted:#9aa5b4;--line:#2c3440;--soft:#1c222b;--edit:#1d2a3d;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#14181f;--fg:#e4e8ee;--muted:#9aa5b4;--line:#2c3440;--soft:#1c222b;--edit:#1d2a3d;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:0}h3{font-size:13px;margin:10px 0 2px}
.meta,.muted,.note,small{color:var(--muted)}.warn{color:var(--amber)}.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
button,select{font:inherit;padding:4px 10px;border:1px solid var(--line);border-radius:6px;background:var(--soft);color:var(--fg)}
.card{border:1px solid var(--line);border-left:5px solid var(--green);border-radius:6px;padding:10px 14px;margin:14px 0}
.card.rM{border-left-color:var(--amber)}.card.rH{border-left-color:var(--red)}
.risk,.v,.b{font-size:12px;padding:1px 8px;border-radius:999px;color:#fff;background:var(--green)}.risk.rM,.v.check{background:var(--amber)}.risk.rH,.v.blocked{background:var(--red)}
.b.ai{background:#6b5bd2}.b.ed-b{background:var(--muted)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.chips{display:flex;flex-wrap:wrap;gap:4px}.chip{border:1px solid var(--line);border-radius:4px;padding:0 6px;font-size:12px}.chip.hot{border-color:var(--red)}
ul{margin:2px 0;padding-left:18px}.objs{columns:2;font-size:12px}.txt{white-space:pre-wrap;min-height:1.5em}
body.editing .txt{background:var(--edit);outline:1px dashed var(--line);padding:2px 4px}.dec{display:flex;gap:24px;flex-wrap:wrap;border-top:1px dashed var(--line);margin-top:8px;padding-top:6px}.dec>div{flex:1;min-width:200px}
@media (max-width:600px){.grid{grid-template-columns:minmax(0,1fr)}.objs{columns:1}}
@page{size:A4 landscape;margin:10mm}@media print{.bar{display:none}.card{break-inside:avoid}.hint{display:none}select{border:0;appearance:none;background:none}}`;

const CLIENT = String.raw`(function(){
var root=document.documentElement,L=JSON.parse(document.getElementById('cab-labels').textContent),E={};
try{E=JSON.parse(document.getElementById('cab-edits').textContent)||{};}catch(e){}
var KEY='sc4sap-cab-theme';try{var s=localStorage.getItem(KEY);if(s)root.setAttribute('data-theme',s);}catch(e){}
var tb=document.getElementById('theme-btn');function dark(){return root.getAttribute('data-theme')==='dark'||(!root.getAttribute('data-theme')&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);}
function tl(){tb.textContent=dark()?L.light:L.dark;}tb.addEventListener('click',function(){var n=dark()?'light':'dark';root.setAttribute('data-theme',n);try{localStorage.setItem(KEY,n);}catch(e){}tl();});tl();
var cells=document.querySelectorAll('[data-e]');
for(var i=0;i<cells.length;i++){var k=cells[i].getAttribute('data-e');if(E[k]==null)continue;if(cells[i].tagName==='SELECT')cells[i].value=E[k];else cells[i].textContent=E[k];}
var editing=false,dirty=false,st=document.getElementById('st'),eb=document.getElementById('ed-btn');
function setEdit(on){editing=on;document.body.classList.toggle('editing',on);eb.textContent=on?L.done:L.edit;
for(var i=0;i<cells.length;i++){if(cells[i].tagName==='SELECT')cells[i].disabled=!on;else if(on)cells[i].setAttribute('contenteditable','true');else cells[i].removeAttribute('contenteditable');}}
eb.addEventListener('click',function(){setEdit(!editing);});
function mark(){dirty=true;st.textContent=L.unsaved;}document.addEventListener('input',function(e){if(e.target&&e.target.getAttribute&&e.target.getAttribute('data-e'))mark();});document.addEventListener('change',mark);
function collect(){var o={};for(var i=0;i<cells.length;i++){var c=cells[i],v=c.tagName==='SELECT'?c.value:(c.innerText||c.textContent||'').replace(/\s+$/,'');o[c.getAttribute('data-e')]=v;}return o;}
document.getElementById('sv-btn').addEventListener('click',function(){E=collect();var doc=root.cloneNode(true);
doc.querySelector('#cab-edits').textContent=JSON.stringify(E).replace(/</g,'\\u003c');
var ce=doc.querySelectorAll('[contenteditable]');for(var i=0;i<ce.length;i++)ce[i].removeAttribute('contenteditable');
var se=doc.querySelectorAll('select[data-e]');for(var j=0;j<se.length;j++){se[j].setAttribute('disabled','');var o=se[j].querySelectorAll('option');for(var n=0;n<o.length;n++){if(o[n].value===E[se[j].getAttribute('data-e')])o[n].setAttribute('selected','');else o[n].removeAttribute('selected');}}
doc.removeAttribute('data-theme');var b=doc.querySelector('body');if(b)b.className='';var s2=doc.querySelector('#st');if(s2)s2.textContent='';
var a=document.createElement('a');a.download=L.file+'-edited.html';a.href=URL.createObjectURL(new Blob(['<!doctype html>\n'+doc.outerHTML],{type:'text/html'}));
document.body.appendChild(a);a.click();a.remove();dirty=false;st.textContent=L.saved;});
document.getElementById('pr-btn').addEventListener('click',function(){window.print();});
window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue=L.unsaved;}});
})();`;

export function renderHtml(m, lang = 'en') {
  const t = labelsOf(lang);
  const labels = { edit: t.edit, done: t.done, dark: t.dark, light: t.light, unsaved: t.unsaved, saved: t.saved, file: `cab-notes-${m.cabDate || 'draft'}-${lang}` };
  return withResponsive(`<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.title)} · ${esc(m.system)}</title><style>${STYLE}</style></head><body><main>
<h1>${esc(t.title)}</h1>
<p class="meta">${esc(t.system)} <b>${esc(m.system)}</b>${m.target ? ` · ${esc(t.target)} ${esc(m.target)}` : ''}${m.cabDate ? ` · ${esc(t.cabDate)} ${esc(m.cabDate)}` : ''}${m.readAt ? ` · ${esc(t.readAt)} ${esc(m.readAt)}` : ''}</p>
${m.uatUnread?.length ? `<p class="warn">${esc(t.uatUnread)}: ${m.uatUnread.map((x) => `${esc(x.id)} (${esc(t.why[x.reason] || x.reason)})`).join(', ')}</p>` : ''}
<p class="meta">${esc(t.risk.H)} ${m.summary.H} · ${esc(t.risk.M)} ${m.summary.M} · ${esc(t.risk.L)} ${m.summary.L}</p>
<div class="bar"><button id="ed-btn">${esc(t.edit)}</button><button id="sv-btn">${esc(t.save)}</button><button id="pr-btn">${esc(t.print)}</button><button id="theme-btn">${esc(t.dark)}</button><span id="st" class="muted"></span></div>
${m.requests.map((r) => card(r, t)).join('\n')}
<p class="note">${esc(t.note)}</p>
</main>
<script type="application/json" id="cab-model">${json(m)}</script>
<script type="application/json" id="cab-edits">{}</script>
<script type="application/json" id="cab-labels">${json(labels)}</script>
<script>${CLIENT}</script>
</body></html>
`);
}

/** The model and the edits a saved page carries: { model, edits } or null. */
export function fromPage(html) {
  const get = (id) => {
    const x = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(String(html));
    if (!x) return null;
    try { return JSON.parse(x[1]); } catch { return null; }
  };
  const model = get('cab-model');
  return model ? { model, edits: get('cab-edits') || {} } : null;
}

/** Apply page edits to the model: an edited business text becomes the person's (source human). */
export function applyEdits(m, edits = {}) {
  const out = structuredClone(m);
  for (const r of out.requests) {
    const note = edits[`note-${r.trkorr}`];
    if (typeof note === 'string' && note.trim() !== String(r.note.text || '').trim()) r.note = { text: note.trim(), source: note.trim() ? 'human' : '' };
    if (typeof edits[`decision-${r.trkorr}`] === 'string') r.decision = edits[`decision-${r.trkorr}`];
    if (typeof edits[`comment-${r.trkorr}`] === 'string') r.comment = edits[`comment-${r.trkorr}`].trim();
  }
  return out;
}

export function renderSummary(m, lang = 'en') {
  const t = labelsOf(lang);
  return [
    `${t.title} · ${m.system}${m.target ? ` → ${m.target}` : ''} · ${t.risk.H} ${m.summary.H} · ${t.risk.M} ${m.summary.M} · ${t.risk.L} ${m.summary.L}`,
    ...m.requests.map((r) => `- ${r.trkorr} ${t.risk[r.risk.level]} · ${t.verdict[r.verdict]}${r.risk.reasons.length ? `: ${r.risk.reasons.map((x) => say(t.reasons[x.code], x)).join(', ')}` : ''}`),
  ].join('\n');
}

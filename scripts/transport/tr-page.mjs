// sc4sap:transport-readiness — the report page (self-contained HTML) and its chat summary.

const T = {
  en: {
    title: 'Transport readiness', system: 'System', target: 'Before import into', readAt: 'Read at',
    verdict: { ready: 'Ready', check: 'Check', blocked: 'Blocked' }, request: 'Request', owner: 'Owner', type: 'Type',
    status: 'Status', objects: 'Objects', none: 'Nothing to report.',
    kinds: { 'open-task': 'Open task', inactive: 'Inactive', 'local-package': 'Local package', 'other-request': 'In another open request', dependency: 'Needs an unreleased request', released: 'Released', 'inactive-unread': 'Inactive — not read', 'inactive-partial': 'Inactive — own only', 'dependency-unread': 'Dependencies — not read', empty: 'Empty' },
    note: 'Read-only check. "Blocked" means the request would fail or break the target; "Check" means it can move, in the right order.',
  },
  ko: {
    title: '이관 전 점검', system: '시스템', target: '이관 대상', readAt: '조회 시각',
    verdict: { ready: '이관 가능', check: '확인 필요', blocked: '이관 불가' }, request: '요청', owner: '소유자', type: '유형',
    status: '상태', objects: '오브젝트', none: '확인할 것 없음.',
    kinds: { 'open-task': '열린 작업', inactive: '비활성', 'local-package': '로컬 패키지', 'other-request': '다른 열린 요청에도 있음', dependency: '미릴리스 요청에 의존', released: '릴리스됨', 'inactive-unread': '비활성 — 조회 못 함', 'inactive-partial': '비활성 — 본인 것만 조회', 'dependency-unread': '의존성 — 조회 못 함', empty: '빈 요청' },
    note: '조회 전용 점검이에요. "이관 불가"는 이관이 실패하거나 대상 시스템을 깨뜨릴 수 있다는 뜻이고, "확인 필요"는 순서만 맞추면 이관할 수 있다는 뜻이에요.',
  },
  ja: {
    title: '移送前チェック', system: 'システム', target: '移送先', readAt: '照会時刻',
    verdict: { ready: '移送可', check: '確認が必要', blocked: '移送不可' }, request: '依頼', owner: '所有者', type: '種別',
    status: 'ステータス', objects: 'オブジェクト', none: '指摘なし。',
    kinds: { 'open-task': '未リリースのタスク', inactive: '非有効', 'local-package': 'ローカルパッケージ', 'other-request': '他の未リリース依頼にもある', dependency: '未リリース依頼に依存', released: 'リリース済み', 'inactive-unread': '非有効 — 照会不可', 'inactive-partial': '非有効 — 本人分のみ', 'dependency-unread': '依存関係 — 照会不可', empty: '空の依頼' },
    note: '照会のみのチェックです。「移送不可」は移送の失敗や移送先の破損につながるもの、「確認が必要」は順序を守れば移送できるものです。',
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderHtml(m, lang = 'en') {
  const t = T[lang] || T.en;
  const cards = m.requests.map((r) => `<section class="req ${r.verdict}">
<h2><code>${esc(r.trkorr)}</code> <span class="v ${r.verdict}">${esc(t.verdict[r.verdict])}</span></h2>
<p class="meta">${esc(r.text)} · ${esc(t.owner)} ${esc(r.owner)} · ${esc(t.type)} ${esc(r.kind)} · ${esc(t.status)} ${esc(r.status)} · ${esc(t.objects)} ${r.objects}</p>
${r.findings.length ? `<ul>${r.findings.map((f) => `<li class="${f.level}"><b>${esc(t.kinds[f.kind] || f.kind)}</b> — ${esc(f.text)}${f.objects.length ? `<br><small>${f.objects.slice(0, 30).map(esc).join(' · ')}${f.objects.length > 30 ? ' …' : ''}</small>` : ''}</li>`).join('')}</ul>` : `<p class="none">${esc(t.none)}</p>`}
</section>`).join('\n');
  return `<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.title)} · ${esc(m.system)}</title>
<style>
:root{--bg:#fff;--fg:#1d2430;--muted:#5d6878;--line:#d9dee6;--red:#c0392b;--amber:#b7791f;--green:#2f855a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14181f;--fg:#e4e8ee;--muted:#9aa5b4;--line:#2c3440}}
:root[data-theme="dark"]{--bg:#14181f;--fg:#e4e8ee;--muted:#9aa5b4;--line:#2c3440}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}
.meta,.none,.note{color:var(--muted)}.sum span{margin-right:14px}
.req{border:1px solid var(--line);border-left:4px solid var(--green);border-radius:6px;padding:8px 12px;margin:12px 0}
.req.check{border-left-color:var(--amber)}.req.blocked{border-left-color:var(--red)}
h2{font-size:15px;margin:0}.v{font-size:12px;padding:1px 8px;border-radius:999px;color:#fff;background:var(--green)}
.v.check{background:var(--amber)}.v.blocked{background:var(--red)}
li.block b{color:var(--red)}li.warn b{color:var(--amber)}small{color:var(--muted)}
@page{size:A4;margin:12mm}@media print{.req{break-inside:avoid}}
</style></head><body><main>
<h1>${esc(t.title)}</h1>
<p class="meta">${esc(t.system)} <b>${esc(m.system)}</b>${m.target ? ` · ${esc(t.target)} ${esc(m.target)}` : ''}${m.readAt ? ` · ${esc(t.readAt)} ${esc(m.readAt)}` : ''}</p>
<p class="sum"><span>${esc(t.verdict.ready)} ${m.summary.ready}</span><span>${esc(t.verdict.check)} ${m.summary.check}</span><span>${esc(t.verdict.blocked)} ${m.summary.blocked}</span></p>
${cards}
<p class="note">${esc(t.note)}</p>
</main></body></html>
`;
}

export function renderSummary(m, lang = 'en') {
  const t = T[lang] || T.en;
  return [
    `${t.title} · ${m.system}${m.target ? ` → ${m.target}` : ''} · ${t.verdict.ready} ${m.summary.ready} · ${t.verdict.check} ${m.summary.check} · ${t.verdict.blocked} ${m.summary.blocked}`,
    ...m.requests.map((r) => `- ${r.trkorr} ${t.verdict[r.verdict]}${r.findings.length ? `: ${r.findings.map((f) => t.kinds[f.kind] || f.kind).join(', ')}` : ''}`),
  ].join('\n');
}

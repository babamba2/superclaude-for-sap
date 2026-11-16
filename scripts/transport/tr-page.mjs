// sc4sap:transport-readiness — the report page (self-contained HTML) and its chat summary.

import { withResponsive } from '../lib/responsive.mjs';
const T = {
  en: {
    title: 'Transport check (CTS)', system: 'System', target: 'Before import into', readAt: 'Read at',
    verdict: { ready: 'Ready', check: 'Check', blocked: 'Blocked' }, request: 'Request', owner: 'Owner', type: 'Type',
    status: 'Status', objects: 'Objects', none: 'Nothing to report.',
    kinds: { 'open-task': 'Open task', inactive: 'Inactive', 'local-package': 'Local package', 'other-request': 'In another open request', dependency: 'Needs an unreleased request', released: 'Released', 'inactive-unread': 'Inactive — not read', 'inactive-partial': 'Inactive — own only', 'dependency-unread': 'Dependencies — not read', empty: 'Empty', 'target-diverged': 'Changed in the target', 'missing-in-target': 'Missing in the target', 'older-than-target': 'Older than the target', 'target-unread': 'Target — not read', 'target-partial': 'Target — partly read' },
    merge: { title: 'Target merge', dest: 'Destination', checked: 'Objects checked', existing: 'Already in the target', diverged: 'Changed in the target (not from the source)', missing: 'Used DDIC missing in the target', pending: 'Reaches the target only with', older: 'Later version in the target', unread: 'The target did not answer — nothing is known about it.', clean: 'No conflict with the target.' },
    note: 'Read-only check. "Blocked" means the request would fail or break the target; "Check" means it can move, in the right order.',
  },
  ko: {
    title: 'CTS 점검', system: '시스템', target: '이관 대상', readAt: '조회 시각',
    verdict: { ready: '이관 가능', check: '확인 필요', blocked: '이관 불가' }, request: '요청', owner: '소유자', type: '유형',
    status: '상태', objects: '오브젝트', none: '확인할 것 없음.',
    kinds: { 'open-task': '열린 작업', inactive: '비활성', 'local-package': '로컬 패키지', 'other-request': '다른 열린 요청에도 있음', dependency: '미릴리스 요청에 의존', released: '릴리스됨', 'inactive-unread': '비활성 — 조회 못 함', 'inactive-partial': '비활성 — 본인 것만 조회', 'dependency-unread': '의존성 — 조회 못 함', empty: '빈 요청', 'target-diverged': '대상 시스템에서 변경됨', 'missing-in-target': '대상 시스템에 없음', 'older-than-target': '대상 시스템보다 오래됨', 'target-unread': '대상 시스템 — 조회 못 함', 'target-partial': '대상 시스템 — 일부만 조회' },
    merge: { title: '대상 시스템 병합', dest: '연결(SM59)', checked: '점검 오브젝트', existing: '대상에 이미 있음', diverged: '대상에서 바뀜(원본에 없는 요청)', missing: '대상에 없는 사용 DDIC', pending: '다른 릴리스 요청으로만 들어감', older: '대상에 더 최신 버전', unread: '대상 시스템이 응답하지 않았어요. 대상 상태는 알 수 없어요.', clean: '대상 시스템과 충돌 없음.' },
    note: '조회 전용 점검이에요. "이관 불가"는 이관이 실패하거나 대상 시스템을 깨뜨릴 수 있다는 뜻이고, "확인 필요"는 순서만 맞추면 이관할 수 있다는 뜻이에요.',
  },
  ja: {
    title: 'CTS チェック', system: 'システム', target: '移送先', readAt: '照会時刻',
    verdict: { ready: '移送可', check: '確認が必要', blocked: '移送不可' }, request: '依頼', owner: '所有者', type: '種別',
    status: 'ステータス', objects: 'オブジェクト', none: '指摘なし。',
    kinds: { 'open-task': '未リリースのタスク', inactive: '非有効', 'local-package': 'ローカルパッケージ', 'other-request': '他の未リリース依頼にもある', dependency: '未リリース依頼に依存', released: 'リリース済み', 'inactive-unread': '非有効 — 照会不可', 'inactive-partial': '非有効 — 本人分のみ', 'dependency-unread': '依存関係 — 照会不可', empty: '空の依頼', 'target-diverged': '移送先で変更済み', 'missing-in-target': '移送先に存在しない', 'older-than-target': '移送先より古い', 'target-unread': '移送先 — 照会不可', 'target-partial': '移送先 — 一部のみ照会' },
    merge: { title: '移送先へのマージ', dest: '接続先 (SM59)', checked: 'チェック対象', existing: '移送先に既存', diverged: '移送先で変更 (移送元にない依頼)', missing: '移送先にない使用 DDIC', pending: '別のリリース済み依頼でのみ移送', older: '移送先の方が新しいバージョン', unread: '移送先が応答しませんでした。移送先の状態は不明です。', clean: '移送先との競合なし。' },
    note: '照会のみのチェックです。「移送不可」は移送の失敗や移送先の破損につながるもの、「確認が必要」は順序を守れば移送できるものです。',
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mergeBlock(g, t) {
  const L = t.merge;
  const list = (label, xs) => (xs.length ? `<li><b>${esc(label)}</b> (${xs.length})<br><small>${xs.slice(0, 30).map(esc).join(' · ')}${xs.length > 30 ? ' …' : ''}</small></li>` : '');
  const head = `<h3>${esc(L.title)}${g.label ? ` · ${esc(g.label)}` : ''}</h3><p class="meta">${esc(L.dest)} <code>${esc(g.dest)}</code>${g.ok ? ` · ${esc(L.checked)} ${g.checked} · ${esc(L.existing)} ${g.existing}` : ''}</p>`;
  if (!g.ok) return `<div class="merge">${head}<p class="warn">${esc(L.unread)}${g.error ? ` <small>${esc(g.error)}</small>` : ''}</p></div>`;
  const items = list(L.diverged, g.diverged) + list(L.missing, g.missing) + list(L.pending, g.pending) + list(L.older, g.older);
  return `<div class="merge">${head}${items ? `<ul>${items}</ul>` : `<p class="none">${esc(L.clean)}</p>`}</div>`;
}

/**
 * The verdicts the page carries for other tools (the project dashboard's weekly status reads a CTS page as
 * evidence): system, target, read time, summary and request → verdict. No object lists.
 */
export function trSummary(m) {
  const s = { system: m.system || '', target: m.target || '', readAt: m.readAt || '', summary: m.summary,
    requests: (m.requests || []).map((r) => ({ trkorr: r.trkorr, verdict: r.verdict })) };
  return JSON.stringify(s).replace(/</g, '\\u003c');
}

export function renderHtml(m, lang = 'en') {
  const t = T[lang] || T.en;
  const cards = m.requests.map((r) => `<section class="req ${r.verdict}">
<h2><code>${esc(r.trkorr)}</code> <span class="v ${r.verdict}">${esc(t.verdict[r.verdict])}</span></h2>
<p class="meta">${esc(r.text)} · ${esc(t.owner)} ${esc(r.owner)} · ${esc(t.type)} ${esc(r.kind)} · ${esc(t.status)} ${esc(r.status)} · ${esc(t.objects)} ${r.objects}</p>
${r.findings.length ? `<ul>${r.findings.map((f) => `<li class="${f.level}"><b>${esc(t.kinds[f.kind] || f.kind)}</b> — ${esc(f.text)}${f.objects.length ? `<br><small>${f.objects.slice(0, 30).map(esc).join(' · ')}${f.objects.length > 30 ? ' …' : ''}</small>` : ''}</li>`).join('')}</ul>` : `<p class="none">${esc(t.none)}</p>`}
${r.merge ? mergeBlock(r.merge, t) : ''}
</section>`).join('\n');
  return withResponsive(`<!doctype html>
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
li.block b{color:var(--red)}.merge{border-top:1px dashed var(--line);margin-top:6px}h3{font-size:13px;margin:6px 0 0}p.warn{color:var(--amber)}li.warn b{color:var(--amber)}small{color:var(--muted)}
@page{size:A4;margin:12mm}@media print{.req{break-inside:avoid}}
</style></head><body><main>
<h1>${esc(t.title)}</h1>
<p class="meta">${esc(t.system)} <b>${esc(m.system)}</b>${m.target ? ` · ${esc(t.target)} ${esc(m.target)}` : ''}${m.readAt ? ` · ${esc(t.readAt)} ${esc(m.readAt)}` : ''}</p>
<p class="sum"><span>${esc(t.verdict.ready)} ${m.summary.ready}</span><span>${esc(t.verdict.check)} ${m.summary.check}</span><span>${esc(t.verdict.blocked)} ${m.summary.blocked}</span></p>
${cards}
<p class="note">${esc(t.note)}</p>
</main>
<script type="application/json" id="tr-summary">${trSummary(m)}</script>
</body></html>
`);
}

export function renderSummary(m, lang = 'en') {
  const t = T[lang] || T.en;
  return [
    `${t.title} · ${m.system}${m.target ? ` → ${m.target}` : ''} · ${t.verdict.ready} ${m.summary.ready} · ${t.verdict.check} ${m.summary.check} · ${t.verdict.blocked} ${m.summary.blocked}`,
    ...m.requests.map((r) => `- ${r.trkorr} ${t.verdict[r.verdict]}${r.findings.length ? `: ${r.findings.map((f) => t.kinds[f.kind] || f.kind).join(', ')}` : ''}`),
  ].join('\n');
}

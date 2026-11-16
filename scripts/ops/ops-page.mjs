// sc4sap:ops-health-check — the report page (one self-contained HTML file) and its Markdown summary.

import { FALLBACK_TCODE } from './ops-model.mjs';

const T = {
  en: {
    title: 'SAP operations health check', period: 'Period', previous: 'compared with', system: 'System', readAt: 'Read at',
    verdict: { red: 'Needs action', amber: 'Look at it', green: 'Healthy' },
    dumps: 'Short dumps (ST22)', jobs: 'Aborted background jobs (SM37)', updates: 'Update errors (SM13)',
    idocs: 'IDocs in error (WE02)', transports: 'Transports in the period', next: 'Next steps',
    error: 'Runtime error', program: 'Program', count: 'Count', users: 'Users', last: 'Last seen', trend: 'Before',
    noCompare: 'previous period not reached — no comparison', isNew: 'new', suspects: 'Changed by', none: 'None in the period.', unread: 'Not readable on this system',
    lookIn: 'check in', job: 'Job', tcode: 'Transaction', report: 'Program', mestyp: 'Message type', status: 'Status',
    direction: 'Dir.', partners: 'Partners', trkorr: 'Request', kind: 'Type', date: 'Date', text: 'Description',
    total: 'total', groups: 'groups',
    whyRelease: 'The sc4sap dispatcher on this system (BASIS < 7.50) is older than these reads — reinstall it with /sc4sap:setup.', whyBlocked: 'The table blocklist does not allow this read.', note: 'Read-only check. User IDs are counted, never listed. Counts are capped by the read limit.',
  },
  ko: {
    title: 'SAP 운영 점검', period: '기간', previous: '비교 기간', system: '시스템', readAt: '조회 시각',
    verdict: { red: '조치 필요', amber: '확인 필요', green: '정상' },
    dumps: '숏 덤프 (ST22)', jobs: '중단된 배치 잡 (SM37)', updates: '업데이트 오류 (SM13)',
    idocs: '오류 IDoc (WE02)', transports: '기간 내 전송 요청', next: '다음 할 일',
    error: '런타임 오류', program: '프로그램', count: '건수', users: '사용자 수', last: '마지막 발생', trend: '이전',
    noCompare: '이전 기간까지 읽지 못해 비교 안 함', isNew: '신규', suspects: '관련 변경', none: '기간 내 없음.', unread: '이 시스템에서는 읽을 수 없음',
    lookIn: '확인 위치', job: '잡', tcode: '트랜잭션', report: '프로그램', mestyp: '메시지 유형', status: '상태',
    direction: '방향', partners: '파트너', trkorr: '요청', kind: '유형', date: '일자', text: '내역',
    total: '건', groups: '그룹',
    whyRelease: '이 시스템(BASIS 7.50 미만)의 sc4sap 디스패처가 예전 버전이라 읽지 못했어요. /sc4sap:setup으로 다시 설치하세요.', whyBlocked: '테이블 차단 목록이 이 조회를 막아요.', note: '조회 전용 점검이에요. 사용자 ID는 수만 세고 목록에 넣지 않아요. 건수는 조회 한도 안에서 센 값이에요.',
  },
  ja: {
    title: 'SAP 運用ヘルスチェック', period: '期間', previous: '比較期間', system: 'システム', readAt: '照会時刻',
    verdict: { red: '対応が必要', amber: '確認が必要', green: '正常' },
    dumps: 'ショートダンプ (ST22)', jobs: '中断したバッチジョブ (SM37)', updates: '更新エラー (SM13)',
    idocs: 'エラー IDoc (WE02)', transports: '期間内の移送依頼', next: '次にすること',
    error: 'ランタイムエラー', program: 'プログラム', count: '件数', users: 'ユーザー数', last: '最終発生', trend: '前期間',
    noCompare: '前期間まで読めず比較なし', isNew: '新規', suspects: '関連する変更', none: '期間内になし。', unread: 'このシステムでは読めません',
    lookIn: '確認先', job: 'ジョブ', tcode: 'トランザクション', report: 'プログラム', mestyp: 'メッセージタイプ', status: 'ステータス',
    direction: '方向', partners: 'パートナー', trkorr: '依頼', kind: '種別', date: '日付', text: '内容',
    total: '件', groups: 'グループ',
    whyRelease: 'このシステム(BASIS 7.50 未満)の sc4sap ディスパッチャーが古いため読めませんでした。/sc4sap:setup で再インストールしてください。', whyBlocked: 'テーブルのブロックリストがこの照会を許可していません。', note: '照会のみのチェックです。ユーザー ID は数だけ数え、一覧には載せません。件数は照会上限内の値です。',
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const table = (heads, rows) => `<table><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

/** Why a section was not read, in the reader's words where the cause is known. */
export function reasonOf(error, t) {
  if (/not allowed[\s\S]*BASIS < 7\.50/i.test(error)) return t.whyRelease;
  if (/blocklist|blocked|forbidden/i.test(error)) return t.whyBlocked;
  return error.replace(/^MCP error -?\d+:\s*/i, '').slice(0, 160);
}

function section(t, key, m, body) {
  const s = m[key];
  const head = `<h2>${esc(t[key])}</h2>`;
  if (!s.ok) return `<section class="unread">${head}<p>${esc(t.unread)} — ${esc(t.lookIn)} <b>${esc(FALLBACK_TCODE[key])}</b>.</p><p class="why">${esc(reasonOf(s.error, t))}</p></section>`;
  return `<section>${head}${body()}</section>`;
}

/** The report page. */
export function renderHtml(m, lang = 'en') {
  const t = T[lang] || T.en;
  const dumps = () => {
    if (!m.dumps.groups.length) return `<p class="none">${esc(t.none)}</p>`;
    const prev = m.dumps.previousTotal === null ? ` · ${esc(t.noCompare)}` : ` · ${esc(t.trend)} ${m.dumps.previousTotal}`;
    return `<p class="sum">${m.dumps.total} ${esc(t.total)} · ${m.dumps.groups.length} ${esc(t.groups)}${prev}</p>` + table(
      [t.error, t.program, t.count, t.trend, t.users, t.last, t.suspects],
      m.dumps.groups.map((g) => `<tr${g.suspects.length ? ' class="hot"' : ''}><td><code>${esc(g.error)}</code>${g.isNew ? ` <span class="tag">${esc(t.isNew)}</span>` : ''}</td><td><code>${esc(g.program)}</code>${g.include && g.include !== g.program ? `<br><small>${esc(g.include)}</small>` : ''}</td><td class="n">${g.count}</td><td class="n">${g.previous === null ? "–" : g.previous}</td><td class="n">${g.users}</td><td>${esc(g.last)}</td><td>${g.suspects.map((s) => `<code>${esc(s.trkorr)}</code> ${esc(s.date)}<br><small>${esc(s.objects.join(', '))}</small>`).join('<br>')}</td></tr>`),
    );
  };
  const jobs = () => (m.jobs.groups.length
    ? table([t.job, t.report, t.count, t.last], m.jobs.groups.map((g) => `<tr><td><code>${esc(g.job)}</code></td><td><code>${esc(g.program)}</code></td><td class="n">${g.count}</td><td>${esc(g.last)}</td></tr>`))
    : `<p class="none">${esc(t.none)}</p>`);
  const updates = () => (m.updates.groups.length
    ? table([t.tcode, t.report, t.count, t.last], m.updates.groups.map((g) => `<tr class="hot"><td><code>${esc(g.tcode)}</code></td><td><code>${esc(g.report)}</code></td><td class="n">${g.count}</td><td>${esc(g.last)}</td></tr>`))
    : `<p class="none">${esc(t.none)}</p>`);
  const idocs = () => (m.idocs.groups.length
    ? table([t.mestyp, t.status, t.direction, t.count, t.partners, t.last], m.idocs.groups.map((g) => `<tr><td><code>${esc(g.mestyp)}</code></td><td>${esc(g.status)}</td><td>${esc(g.direction)}</td><td class="n">${g.count}</td><td>${esc(g.partners.join(', '))}</td><td>${esc(g.last)}</td></tr>`))
    : `<p class="none">${esc(t.none)}</p>`);
  const transports = () => (m.transports.list.length
    ? table([t.trkorr, t.kind, t.status, t.date, t.text], m.transports.list.slice(0, 60).map((r) => `<tr><td><code>${esc(r.trkorr)}</code></td><td>${esc(r.kind)}</td><td>${esc(r.status)}</td><td>${esc(r.date)}</td><td>${esc(r.text)}</td></tr>`))
    : `<p class="none">${esc(t.none)}</p>`);
  const next = m.next.length
    ? `<ol>${m.next.map((n) => `<li>${esc(n.text)} → <code>${esc(n.action)}</code></li>`).join('')}</ol>`
    : `<p class="none">${esc(t.none)}</p>`;
  return `<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.title)} · ${esc(m.system)} · ${esc(m.to)}</title>
<style>
:root{--bg:#fff;--fg:#1d2430;--muted:#5d6878;--line:#d9dee6;--head:#f3f5f8;--red:#c0392b;--amber:#b7791f;--green:#2f855a;--hot:#fdf1ef}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14181f;--fg:#e4e8ee;--muted:#9aa5b4;--line:#2c3440;--head:#1c222b;--hot:#3a2220}}
:root[data-theme="dark"]{--bg:#14181f;--fg:#e4e8ee;--muted:#9aa5b4;--line:#2c3440;--head:#1c222b;--hot:#3a2220}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
.meta{color:var(--muted);margin:0 0 16px}.verdict{display:inline-block;padding:4px 12px;border-radius:999px;color:#fff;font-weight:600}
.verdict.red{background:var(--red)}.verdict.amber{background:var(--amber)}.verdict.green{background:var(--green)}
table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}
th{background:var(--head);font-weight:600}td.n{text-align:right;font-variant-numeric:tabular-nums}tr.hot td{background:var(--hot)}
.tag{font-size:11px;padding:1px 6px;border-radius:4px;background:var(--amber);color:#fff}.none,.sum,.why,.note{color:var(--muted)}
.unread h2{color:var(--amber)}code{font-size:12.5px}small{color:var(--muted)}
@media (max-width:700px){table{display:block;overflow-x:auto}}
@page{size:A4 landscape;margin:12mm}@media print{main{max-width:none;padding:0}tr{break-inside:avoid}}
</style></head><body><main>
<h1>${esc(t.title)}</h1>
<p class="meta">${esc(t.system)} <b>${esc(m.system)}</b>${m.sapVersion ? ` (${esc(m.sapVersion)})` : ''} · ${esc(t.period)} ${esc(m.from)} – ${esc(m.to)}${m.prevFrom ? ` · ${esc(t.previous)} ${esc(m.prevFrom)} – ${esc(m.prevTo)}` : ''}${m.readAt ? ` · ${esc(t.readAt)} ${esc(m.readAt)}` : ''}</p>
<p><span class="verdict ${esc(m.verdict)}">${esc(t.verdict[m.verdict])}</span></p>
<h2>${esc(t.next)}</h2>${next}
${section(t, 'dumps', m, dumps)}
${section(t, 'jobs', m, jobs)}
${section(t, 'updates', m, updates)}
${section(t, 'idocs', m, idocs)}
${section(t, 'transports', m, transports)}
<p class="note">${esc(t.note)}</p>
</main></body></html>
`;
}

/** The short summary the skill relays in chat. */
export function renderSummary(m, lang = 'en') {
  const t = T[lang] || T.en;
  const line = (key, n) => `- ${t[key]}: ${m[key].ok ? n : `${t.unread} → ${FALLBACK_TCODE[key]}`}`;
  return [
    `${t.title} · ${m.system} · ${m.from} – ${m.to} · ${t.verdict[m.verdict]}`,
    line('dumps', `${m.dumps.total} (${m.dumps.groups.length} ${t.groups}, ${m.dumps.previousTotal === null ? t.noCompare : `${m.dumps.groups.filter((g) => g.isNew).length} ${t.isNew}`})`),
    line('jobs', m.jobs.groups.reduce((s, g) => s + g.count, 0)),
    line('updates', m.updates.groups.reduce((s, g) => s + g.count, 0)),
    line('idocs', m.idocs.groups.reduce((s, g) => s + g.count, 0)),
    line('transports', m.transports.list.length),
    ...m.next.slice(0, 5).map((n, i) => `${i + 1}. ${n.text} → ${n.action}`),
  ].join('\n');
}

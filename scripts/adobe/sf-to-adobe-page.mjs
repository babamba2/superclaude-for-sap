// sc4sap:smartform-to-adobe — the conversion plan as one self-contained HTML report (plus its Markdown summary),
// drawn from the JSON of sf-to-adobe-plan.mjs. Read-only, offline; no SAP call.
//
//   renderPlanHtml(plan, lang)     → HTML (header, KPI tiles, interface, node kinds, SAP log, gap list, effort, next steps)
//   renderPlanMarkdown(plan, lang) → the same content as Markdown (adobe-plan-<lang>.md)
//   renderPlanSummary(plan, lang)  → the chat summary lines (skill Output_Format)
//
// SAP's message texts, reasons and manual steps stay as the plan writes them (English; they cite SAP methods).
//
// CLI  node sf-to-adobe-page.mjs <adobe-plan.json> --out-dir <folder> [--lang ko|en|ja]
//      → <folder>/adobe-plan-<lang>.html + adobe-plan-<lang>.md; prints { ok, html, md, summary }

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withResponsive } from '../lib/responsive.mjs';
import { OPTION_PRESETS, rectifyOptions } from './sf-to-adobe-plan.mjs';

const T = {
  en: {
    beta: 'Beta — output quality is still low. The predictions and gap rows can be wrong or incomplete; check the result in SFP before relying on it.',
    title: 'SmartForm → Adobe form · conversion plan', form: 'Form', target: 'Adobe form / interface', options: 'Options',
    result: { migrated: 'Migrates', aborted: 'Migration stops' }, nodes: 'Nodes', mapped: 'Mapped', warning: 'SAP warning',
    gap: 'Gaps', silent: 'Silent manual steps', logged: 'Logged', silentWord: 'Silent', iface: 'Interface', imp: 'Import', exp: 'Export',
    tables: 'Tables', exc: 'Exceptions', glob: 'Global data', init: 'Init code lines', kinds: 'Node kinds', kind: 'Kind',
    log: 'SAP log (predicted)', type: 'Type', code: 'Message', node: 'Node', text: 'Text', gaps: 'Gap list', path: 'Node path',
    how: 'Logged / silent', reason: 'Reason', action: 'Manual step', effort: 'Manual steps by kind', count: 'Steps',
    abortedAt: 'Stops at node', none: 'None.', next: 'Next', gapNodes: 'Gap nodes', steps: 'Manual steps', silentLine: 'Silent', reviewed: 'reviewed',
    nextLines: ['Fix the gaps marked silent first: SAP drops them without a message.',
      'After the migration, draw the Adobe form\'s print with /sc4sap:adobe-preview <FORM>.',
      'SAP example SmartForms only, DEV only: ask to run the migration into new $TMP objects (Step 7).'],
    note: 'Read-only plan from the form definition. Reasons and manual steps cite SAP\'s migration methods (CL_SSF_MIGRATION) and stay in English.',
  },
  ko: {
    beta: '베타 버전이에요. 아직 결과 품질이 낮아요. 예측과 갭 목록이 틀리거나 빠질 수 있으니 SFP에서 꼭 확인해 주세요.',
    title: '스마트폼 → 어도비 폼 · 전환 계획', form: '폼', target: '어도비 폼 / 인터페이스', options: '옵션',
    result: { migrated: '전환 가능', aborted: '전환 중단' }, nodes: '노드', mapped: '매핑됨', warning: 'SAP 경고',
    gap: '갭', silent: '로그 없는 갭', logged: '로그 있음', silentWord: '로그 없음', iface: '인터페이스', imp: 'Import', exp: 'Export',
    tables: 'Tables', exc: 'Exceptions', glob: '전역 데이터', init: '초기화 코드 줄 수', kinds: '노드 종류별', kind: '종류',
    log: 'SAP 로그 (예측)', type: '유형', code: '메시지', node: '노드', text: '내용', gaps: '갭 목록', path: '노드 경로',
    how: '로그 여부', reason: '이유', action: '수작업', effort: '종류별 수작업 수', count: '건수',
    abortedAt: '중단 노드', none: '없음.', next: '다음 할 일', gapNodes: '갭 노드', steps: '수작업', silentLine: '로그 없음', reviewed: '검토 반영',
    nextLines: ['로그 없는 갭부터 보세요. SAP가 메시지 없이 버리는 부분이에요.',
      '전환한 뒤에는 /sc4sap:adobe-preview <FORM>으로 어도비 폼 출력 모습을 그려 볼 수 있어요.',
      'SAP 예제 스마트폼이고 DEV라면, 새 $TMP 오브젝트로 실제 전환을 실행해 달라고 하세요(Step 7).'],
    note: '폼 정의만 읽은 계획이에요. 이유와 수작업은 SAP 전환 메서드(CL_SSF_MIGRATION) 기준이라 영어로 둬요.',
  },
  ja: {
    beta: 'ベータ版です。出力品質はまだ低く、予測やギャップ一覧が誤っている・不足している場合があります。必ず SFP で確認してください。',
    title: 'スマートフォーム → Adobe フォーム · 移行計画', form: 'フォーム', target: 'Adobe フォーム / インターフェース', options: 'オプション',
    result: { migrated: '移行可', aborted: '移行が停止' }, nodes: 'ノード', mapped: 'マッピング済み', warning: 'SAP 警告',
    gap: 'ギャップ', silent: 'サイレントギャップ', logged: 'ログあり', silentWord: 'ログなし', iface: 'インターフェース', imp: 'Import', exp: 'Export',
    tables: 'Tables', exc: 'Exceptions', glob: 'グローバルデータ', init: '初期化コード行数', kinds: 'ノード種別', kind: '種別',
    log: 'SAP ログ (予測)', type: 'タイプ', code: 'メッセージ', node: 'ノード', text: '内容', gaps: 'ギャップ一覧', path: 'ノードパス',
    how: 'ログ / サイレント', reason: '理由', action: '手作業', effort: '種別ごとの手作業数', count: '件数',
    abortedAt: '停止ノード', none: 'なし。', next: '次の作業', gapNodes: 'ギャップノード', steps: '手作業', silentLine: 'ログなし', reviewed: 'レビュー反映',
    nextLines: ['ログなし (サイレント) のギャップから確認してください。SAP がメッセージなしで落とす部分です。',
      '移行後は /sc4sap:adobe-preview <FORM> で Adobe フォームの出力イメージを描けます。',
      'SAP のサンプルスマートフォームかつ DEV なら、新しい $TMP オブジェクトへの移行実行を依頼できます (Step 7)。'],
    note: 'フォーム定義だけを読んだ計画です。理由と手作業は SAP の移行メソッド (CL_SSF_MIGRATION) に基づくため英語のままです。',
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t0 = (lang) => T[lang] || T.en;
const onOptions = (o) => Object.entries(o || {}).filter(([, v]) => v).map(([k]) => k);
/** 'full' / 'sap-default' when the options are a preset (as given or after RECTIFY), else the flags that are on. */
export function optionLabel(o) {
  const key = (x) => onOptions(x).sort().join(',');
  for (const [name, p] of Object.entries(OPTION_PRESETS)) if (key(o) === key(p) || key(o) === key(rectifyOptions(p))) return name;
  return onOptions(o).join(', ');
}

/** Manual steps per node kind, most first. */
function effortByKind(plan) {
  const m = new Map();
  for (const g of plan.gaps || []) m.set(g.kind, (m.get(g.kind) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function counts(plan) {
  const c = plan.completeness || {};
  const gaps = plan.gaps || [];
  return { nodes: c.nodes ?? (plan.nodes || []).length, mapped: c.mapped ?? 0, warning: c.warning ?? 0,
    gapNodes: c.gap ?? 0, gaps: gaps.length, silent: gaps.filter((g) => !g.logged).length, logged: gaps.filter((g) => g.logged).length };
}

export function renderPlanSummary(plan, lang = 'en') {
  const t = t0(lang);
  const n = counts(plan);
  const res = t.result[plan.result] || plan.result;
  const lines = [t.beta, `${plan.form} → Adobe (${t.options}: ${optionLabel(plan.options)}) — ${res}, ${t.nodes} ${n.nodes}: ${t.mapped} ${n.mapped} · ${t.warning} ${n.warning} · ${t.gapNodes} ${n.gapNodes} — ${t.steps} ${n.gaps} (${t.logged} ${n.logged}, ${t.silentWord} ${n.silent})`];
  if (plan.aborted) lines.push(`${t.abortedAt}: ${plan.aborted.node} — ${plan.aborted.reason}`);
  const i = plan.interface || {};
  lines.push(`${t.iface}: ${t.imp} ${(i.import || []).length} · ${t.tables} ${(i.tables || []).length} · ${t.exp} ${(i.export || []).length} · ${t.glob} ${(i.globalData || []).length} · ${t.init} ${i.initLines ?? 0}`);
  const log = plan.log || [];
  if (log.length) lines.push(`${t.log}: ${log.slice(0, 6).map((l) => `${l.code} ${l.type} ${l.node}`).join(' · ')}${log.length > 6 ? ' …' : ''}`);
  const silent = effortByKind({ gaps: (plan.gaps || []).filter((g) => !g.logged) });
  if (silent.length) lines.push(`${t.silentLine}: ${silent.map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  const eff = effortByKind(plan);
  if (eff.length) lines.push(`${t.effort}: ${eff.map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  return lines.join('\n');
}

export function renderPlanMarkdown(plan, lang = 'en') {
  const t = t0(lang);
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const i = plan.interface || {};
  const kinds = Object.entries(plan.completeness?.byKind || {});
  const out = [`# ${t.title} — ${plan.form}`, '', `> **${t.beta}**`, '', renderPlanSummary(plan, lang).split('\n').slice(1).join('\n'), '',
    `## ${t.iface}`, '', `- ${t.imp}: ${(i.import || []).join(', ') || '—'}`, `- ${t.tables}: ${(i.tables || []).join(', ') || '—'}`,
    `- ${t.exp}: ${(i.export || []).join(', ') || '—'}`, `- ${t.glob}: ${(i.globalData || []).join(', ') || '—'}`, '',
    `## ${t.kinds}`, '', `| ${t.kind} | ${t.mapped} | ${t.gap} |`, '|---|---|---|', ...kinds.map(([k, v]) => `| ${k} | ${v.mapped} | ${v.gap} |`), '',
    `## ${t.log}`, '', ...((plan.log || []).length ? [`| ${t.type} | ${t.code} | ${t.node} | ${t.text} |`, '|---|---|---|---|', ...plan.log.map((l) => `| ${l.type} | ${l.code} | ${cell(l.node)} | ${cell(l.text)} |`)] : [t.none]), '',
    `## ${t.gaps}`, '', ...((plan.gaps || []).length ? [`| ${t.path} | ${t.kind} | ${t.how} | ${t.reason} | ${t.action} |`, '|---|---|---|---|---|',
      ...plan.gaps.map((g) => `| ${cell(g.path || g.node)} | ${g.kind} | ${g.logged ? `${t.logged}${g.code ? ` ${g.code}` : ''}` : t.silentWord} | ${cell(g.reason)} | ${cell(g.action)}${g.reviewedBy ? ` (${t.reviewed})` : ''} |`)] : [t.none]), '',
    `## ${t.next}`, '', ...t.nextLines.map((l) => `- ${l.replace('<FORM>', plan.names?.form || plan.form)}`), ''];
  return out.join('\n');
}

export function renderPlanHtml(plan, lang = 'en') {
  const t = t0(lang);
  const n = counts(plan);
  const i = plan.interface || {};
  const list = (xs) => ((xs || []).length ? (xs || []).map((x) => `<code>${esc(x)}</code>`).join(' ') : '—');
  const kinds = Object.entries(plan.completeness?.byKind || {});
  const tile = (v, label, cls = '') => `<div class="tile ${cls}"><b>${v}</b><span>${esc(label)}</span></div>`;
  const gaps = [...(plan.gaps || [])].sort((a, b) => Number(a.logged) - Number(b.logged));
  return withResponsive(`<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(plan.form)} → Adobe</title>
<style>
:root{--bg:#fff;--fg:#1d2430;--muted:#5d6878;--line:#d9dee6;--soft:#f4f6f9;--red:#c0392b;--amber:#b7791f;--green:#2f855a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14181f;--fg:#e4e8ee;--muted:#9aa5b4;--line:#2c3440;--soft:#1b2029}}
:root[data-theme="dark"]{--bg:#14181f;--fg:#e4e8ee;--muted:#9aa5b4;--line:#2c3440;--soft:#1b2029}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
.meta,.note,small{color:var(--muted)}code{font:12px ui-monospace,Consolas,monospace;background:var(--soft);border-radius:3px;padding:0 3px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:14px 0}
.tile{border:1px solid var(--line);border-radius:8px;padding:8px 12px}.tile b{display:block;font-size:22px}.tile span{color:var(--muted);font-size:12px}
.tile.red b{color:var(--red)}.tile.amber b{color:var(--amber)}.tile.green b{color:var(--green)}
.v{display:inline-block;font-size:12px;padding:1px 8px;border-radius:999px;color:#fff;background:var(--green)}.v.aborted{background:var(--red)}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}th{background:var(--soft)}
td.silent{color:var(--red);font-weight:600}.beta{border:1px solid var(--amber);border-left:4px solid var(--amber);border-radius:6px;padding:8px 12px;margin:0 0 14px;font-weight:600;color:var(--amber)}td.logged{color:var(--amber)}.abort{border-left:4px solid var(--red);padding:6px 10px;background:var(--soft)}
@page{size:A4 landscape;margin:10mm}@media print{tr{break-inside:avoid}}
</style></head><body><main>
<p class="beta" role="note">${esc(t.beta)}</p>
<h1>${esc(t.title)}</h1>
<p class="meta">${esc(t.form)} <b>${esc(plan.form)}</b> · ${esc(t.target)} <code>${esc(plan.names?.form)}</code> / <code>${esc(plan.names?.interface)}</code> · <span class="v ${esc(plan.result)}">${esc(t.result[plan.result] || plan.result)}</span></p>
<p class="meta">${esc(t.options)}: <b>${esc(optionLabel(plan.options))}</b> <small>${onOptions(plan.options).map(esc).join(' · ')}</small></p>
${plan.aborted ? `<p class="abort"><b>${esc(t.abortedAt)}: ${esc(plan.aborted.node)}</b> — ${esc(plan.aborted.reason)}</p>` : ''}
<div class="tiles">${tile(n.nodes, t.nodes)}${tile(n.mapped, t.mapped, 'green')}${tile(n.warning, t.warning, 'amber')}${tile(n.gapNodes, t.gapNodes, 'amber')}${tile(n.gaps, t.steps)}${tile(n.silent, t.silent, 'red')}</div>
<h2>${esc(t.iface)}</h2>
<table class="m-kv"><tbody>
<tr><th>${esc(t.imp)}</th><td>${list(i.import)}</td></tr><tr><th>${esc(t.tables)}</th><td>${list(i.tables)}</td></tr>
<tr><th>${esc(t.exp)}</th><td>${list(i.export)}</td></tr><tr><th>${esc(t.exc)}</th><td>${list(i.exceptions)}</td></tr>
<tr><th>${esc(t.glob)}</th><td>${list(i.globalData)}</td></tr><tr><th>${esc(t.init)}</th><td>${i.initLines ?? 0}</td></tr>
</tbody></table>
<h2>${esc(t.gaps)} (${gaps.length})</h2>
${gaps.length ? `<table><thead><tr><th>${esc(t.path)}</th><th>${esc(t.kind)}</th><th>${esc(t.how)}</th><th>${esc(t.reason)}</th><th>${esc(t.action)}</th></tr></thead><tbody>
${gaps.map((g) => `<tr><td><code>${esc(g.path || g.node)}</code></td><td>${esc(g.kind)}</td><td class="${g.logged ? 'logged' : 'silent'}">${esc(g.logged ? `${t.logged}${g.code ? ` ${g.code}` : ''}` : t.silentWord)}</td><td>${esc(g.reason)}</td><td>${esc(g.action)}${g.reviewedBy ? ` <small>(${esc(t.reviewed)})</small>` : ''}</td></tr>`).join('\n')}
</tbody></table>` : `<p>${esc(t.none)}</p>`}
<h2>${esc(t.effort)}</h2>
${effortByKind(plan).length ? `<table><thead><tr><th>${esc(t.kind)}</th><th>${esc(t.count)}</th></tr></thead><tbody>${effortByKind(plan).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</tbody></table>` : `<p>${esc(t.none)}</p>`}
<h2>${esc(t.log)}</h2>
${(plan.log || []).length ? `<table><thead><tr><th>${esc(t.type)}</th><th>${esc(t.code)}</th><th>${esc(t.node)}</th><th>${esc(t.text)}</th></tr></thead><tbody>${plan.log.map((l) => `<tr><td>${esc(l.type)}</td><td>${esc(l.code)}</td><td><code>${esc(l.node)}</code></td><td>${esc(l.text)}</td></tr>`).join('')}</tbody></table>` : `<p>${esc(t.none)}</p>`}
<h2>${esc(t.kinds)}</h2>
<table><thead><tr><th>${esc(t.kind)}</th><th>${esc(t.mapped)}</th><th>${esc(t.gap)}</th></tr></thead><tbody>${kinds.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.mapped}</td><td>${v.gap}</td></tr>`).join('')}</tbody></table>
<h2>${esc(t.next)}</h2>
<ul>${t.nextLines.map((l) => `<li>${esc(l.replace('<FORM>', plan.names?.form || plan.form))}</li>`).join('')}</ul>
<p class="note">${esc(t.note)}</p>
</main></body></html>
`);
}

function main(argv) {
  const file = argv[0];
  const arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
  if (!file || file.startsWith('--')) { console.error('usage: sf-to-adobe-page.mjs <adobe-plan.json> --out-dir <folder> [--lang ko|en|ja]'); process.exit(2); }
  const lang = ['ko', 'en', 'ja'].includes(arg('--lang', 'en')) ? arg('--lang', 'en') : 'en';
  const outDir = resolve(arg('--out-dir', '.'));
  let plan;
  try { plan = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.log(JSON.stringify({ ok: false, error: `cannot read the plan ${file}: ${e.message}` })); process.exit(1); }
  mkdirSync(outDir, { recursive: true });
  const html = join(outDir, `adobe-plan-${lang}.html`);
  const md = join(outDir, `adobe-plan-${lang}.md`);
  writeFileSync(html, renderPlanHtml(plan, lang));
  writeFileSync(md, renderPlanMarkdown(plan, lang));
  console.log(JSON.stringify({ ok: true, html, md, summary: renderPlanSummary(plan, lang) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

// Area menu view of the process page (model.menu written by area-menu.mjs --apply).
// Appendix section: summary counts, gap list (used + in menu, no task yet), menu tree by top folder with
// usage and the task codes each TCode belongs to, used TCodes no menu carries. Task sheet: menu path line.
import { anchorId } from './process-model.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const L = {
  ko: {
    title: '에어리어 메뉴 대조', lead: '고객 에어리어 메뉴(SE43)의 TCode를 사용 실적과 이 문서의 Task에 대조한 결과입니다.',
    menu: '메뉴', entries: '메뉴 항목', tcodes: 'TCode', core: '사용 · 문서화됨', gap: '사용 · 문서에 없음', dead: '메뉴에만 있음 (미사용)',
    unmeasured: '실적 미측정', elsewhere: '다른 맵에 있음', offMenu: '메뉴 밖에서 사용', gapTitle: '사용 중이지만 이 문서에 Task가 없는 메뉴 TCode',
    gapLead: '다음 버전에서 Task로 배치할 후보입니다.', tree: '메뉴 트리', folder: '폴더', text: '메뉴 텍스트', usage: '사용', task: 'Task',
    offTitle: '어느 메뉴에도 없는 사용 TCode', offLead: '직접 호출하거나 다른 메뉴(역할 메뉴 등)에서 실행하는 TCode입니다.',
    used: '사용', unused: '미사용', unm: '미측정', menuPath: '에어리어 메뉴', window: '실적 기준',
  },
  en: {
    title: 'Area menu cross-check', lead: 'TCodes of the customer area menu (SE43) checked against usage and against the tasks of this document.',
    menu: 'Menu', entries: 'Menu entries', tcodes: 'TCodes', core: 'Used · documented', gap: 'Used · not documented', dead: 'Menu only (unused)',
    unmeasured: 'Not measured', elsewhere: 'In another map', offMenu: 'Used outside the menu', gapTitle: 'Menu TCodes in use without a task in this document',
    gapLead: 'Candidates to place as tasks in the next version.', tree: 'Menu tree', folder: 'Folder', text: 'Menu text', usage: 'Usage', task: 'Task',
    offTitle: 'Used TCodes in no menu', offLead: 'Run directly or from another menu (e.g. a role menu).',
    used: 'used', unused: 'unused', unm: 'not measured', menuPath: 'Area menu', window: 'Usage window',
  },
  ja: {
    title: 'エリアメニュー照合', lead: '顧客エリアメニュー (SE43) の TCode を利用実績と本書のタスクに照合した結果です。',
    menu: 'メニュー', entries: 'メニュー項目', tcodes: 'TCode', core: '利用 · 記載あり', gap: '利用 · 記載なし', dead: 'メニューのみ (未使用)',
    unmeasured: '実績未測定', elsewhere: '他のマップに記載', offMenu: 'メニュー外で利用', gapTitle: '利用中だが本書にタスクがないメニュー TCode',
    gapLead: '次の版でタスクに配置する候補です。', tree: 'メニューツリー', folder: 'フォルダ', text: 'メニューテキスト', usage: '利用', task: 'タスク',
    offTitle: 'どのメニューにもない利用 TCode', offLead: '直接実行、または別メニュー (ロールメニューなど) から実行されています。',
    used: '利用', unused: '未使用', unm: '未測定', menuPath: 'エリアメニュー', window: '実績基準',
  },
};
export const menuLabels = (lang) => L[lang] || L.en;

const mark = (T, u) => (u === 'used' ? `<span class="mu used">● ${esc(T.used)}</span>` : u === 'unused' ? `<span class="mu unused">○ ${esc(T.unused)}</span>` : `<span class="mu unm">– ${esc(T.unm)}</span>`);
const taskLinks = (m, codes) => arr(codes).map((c) => {
  const r = m.rows.find((x) => x.code === c);
  return `<a href="#${anchorId(c)}" title="${esc(r?.label || '')}">${esc(c)}</a>`;
}).join(' ');
const tbl = (head, rows) => `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

/** Task sheet head row: [label, html] or null. */
export function menuHeadRow(m, row) {
  if (!m.menu || !arr(row.menuPaths).length) return null;
  const T = menuLabels(m.lang);
  return [T.menuPath, arr(row.menuPaths).map((p) => `<code>${esc(p)}</code>`).join('<br>')];
}

/** Appendix section (h3 + content) or ''. */
export function menuSection(m) {
  const mm = m.menu;
  if (!mm || !arr(mm.entries).length) return '';
  const T = menuLabels(m.lang);
  const c = mm.counts || {};
  const menus = arr(mm.menus).map((x) => `<code>${esc(x.menu)}</code>${x.title ? ` ${esc(x.title)}` : ''}${arr(x.menusRead).length > 1 ? ` (+ ${arr(x.menusRead).slice(1).map(esc).join(', ')})` : ''}`).join(' · ');
  const win = arr(mm.usage).map((u) => `${esc(u.system)} ${esc(u.measuredAt || '')}${u.coverage ? ` · ${esc(u.coverage)}/${esc(u.months)}` : ''}`)[0] || '';
  const out = [`<h3 id="amenu">${esc(T.title)}</h3><p class="lead">${esc(T.lead)}</p>`];
  out.push(tbl([T.menu, T.entries, T.tcodes, T.core, T.gap, T.elsewhere, T.dead, T.unmeasured, T.offMenu, T.window],
    [[menus, esc(c.entries ?? ''), esc(c.tcodes ?? ''), esc(c.core ?? ''), esc(c.gap ?? ''), esc(c.elsewhere ?? 0), esc(c.dead ?? ''), esc(c.unmeasured ?? ''), esc(c.offMenu ?? ''), win]]));
  const byT = new Map(arr(mm.entries).map((e) => [e.t, e]));
  if (arr(mm.quadrants?.gap).length) {
    out.push(`<h4 id="amenu-gap">${esc(T.gapTitle)} (${mm.quadrants.gap.length})</h4><p class="lead">${esc(T.gapLead)}</p>`);
    out.push(tbl([T.tcodes, T.text, T.folder], mm.quadrants.gap.map((t) => {
      const e = byT.get(t) || {};
      return [`<code>${esc(t)}</code>`, esc(e.x || ''), esc([e.m, ...arr(e.p)].join(' > '))];
    })));
  }
  // tree: one <details> per top folder, rows in menu order
  const groups = new Map();
  for (const e of arr(mm.entries)) {
    const top = `${e.m} > ${arr(e.p)[0] ?? ''}`;
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top).push(e);
  }
  out.push(`<h4 id="amenu-tree">${esc(T.tree)}</h4>`);
  for (const [top, es] of groups) {
    const used = es.filter((e) => e.u === 'used').length;
    out.push(`<details class="amenu"><summary><b>${esc(top)}</b> · ${es.length} ${esc(T.tcodes)} · ● ${used}</summary>`
      + tbl([T.folder, T.tcodes, T.text, T.usage, T.task], es.map((e) => [esc(arr(e.p).slice(1).join(' > ')), `<code>${esc(e.t)}</code>`, esc(e.x || ''), mark(T, e.u), taskLinks(m, e.r) || arr(e.o).map((x) => `<span class="mu unm">${esc(x)}</span>`).join(' ')]))
      + '</details>');
  }
  if (arr(mm.quadrants?.offMenu).length) {
    const off = mm.quadrants.offMenu;
    out.push(`<h4 id="amenu-off">${esc(T.offTitle)} (${off.length})</h4><p class="lead">${esc(T.offLead)}</p><p>${off.map((t) => `<code>${esc(t)}</code>`).join(' ')}</p>`);
  }
  return out.join('');
}

export const MENU_CSS = '.mu.used{color:var(--ok,#1a7f37)}.mu.unused{color:var(--muted,#888)}.mu.unm{color:var(--muted,#888)}details.amenu{margin:.4em 0}details.amenu>summary{cursor:pointer}';

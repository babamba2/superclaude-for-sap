// sc4sap:module-to-process — the gap model as an .xlsx workbook (zero-dependency; the UAT writer's workbook()).
//
//   gapXlsx(gap, lang?) → Buffer
// Six sheets: summary, fit / gap matrix (with the workbench columns: requirement, effort, owner, decision, WBS link),
// gap register, WRICEF candidates (the same items as `build-gap-doc.mjs --wricef`), standard not in use, open questions.
// Words come from the page labels (gap-page.mjs), so the workbook reads like the page.

import { workbook } from '../uat/uat-xlsx.mjs';
import { gapStats, wricefItems, FITS } from './gap-model.mjs';
import { gapLabels, wbLabels } from './gap-page.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const H = (cells) => cells.map((v) => ({ v, s: 1 }));
const SHEETS = {
  ko: ['요약', 'Fit-Gap 매트릭스', 'Gap 상세', 'WRICEF 후보', '미사용 표준', '확인 필요'],
  en: ['Summary', 'Fit-gap matrix', 'Gap register', 'WRICEF candidates', 'Standard not in use', 'Open questions'],
  ja: ['概要', 'Fit-Gap マトリクス', 'ギャップ詳細', 'WRICEF 候補', '未使用の標準', '要確認事項'],
};
const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : '');

export function gapXlsx(gap, lang = '') {
  const L = String(lang || gap?.lang || 'en').slice(0, 2);
  const T = gapLabels(L), W = wbLabels(L), S = SHEETS[L] || SHEETS.en;
  const rows = arr(gap?.rows);
  const tasks = rows.filter((r) => r.level >= 4);
  const st = gapStats({ ...gap, rows });
  const word = (prefix, v) => T[`${prefix}${v}`] || v || '';
  const summary = [H([T.summary, '']),
    [T.doc, gap?.title || `${gap?.module || ''} ${T.doc}`], [T.scope, word('sc_', gap?.scope)], [T.system, gap?.system || ''], ['SAP', gap?.sapVersion || ''],
    [T.version, gap?.version || ''], [T.tasks, st.tasks],
    ...FITS.map((f) => [`${T[`f_${f}`]} — ${T[`fd_${f}`]}`, st.byFit[f] || 0]),
    [T.gapUsed, st.gapUsage.used || 0], [T.gapUnused, st.gapUsage.unused || 0], [T.candidates, st.wricef],
    [W.effort, tasks.reduce((s, r) => s + (num(r.effortMd) || 0), 0)]];
  const matrix = [H([T.code, T.process, T.fit, T.usage, T.stdTcodes, T.coverage, T.disposition, T.include, T.wkind, W.reqId, W.req, W.priority, W.effort, W.owner, W.decision, W.wbs, T.note]),
    ...rows.map((r) => (r.level < 4
      ? [r.code, `${'  '.repeat(r.level - 1)}${r.label}`]
      : [r.code, `${'  '.repeat(Math.min(r.level, 4) - 1)}${r.level === 5 ? '└ ' : ''}${r.label}`, word('f_', r.fit), word('u_', r.usage), arr(r.tcodes).join(' '),
        arr(r.coverage).map((o) => o.name).join(' '), word('d_', r.disposition), r.wricef?.on ? 'X' : '', r.fit === 'fit' ? '' : r.wricef?.kind || '',
        r.req?.id || '', r.req?.text || '', r.req?.priority ? W[`pr_${r.req.priority}`] || r.req.priority : '', num(r.effortMd), r.owner || '',
        r.decision ? [r.decision.by, r.decision.at].filter(Boolean).join(' · ') : '', r.wbs?.rowId ? [r.wbs.projectId, r.wbs.rowId, r.wbsStatus?.stage || r.wbsStatus?.status || ''].filter(Boolean).join(' · ') : '',
        r.note || '']))];
  const register = [H([T.code, T.process, T.fit, T.usage, T.statement, T.why, T.coverage, T.conversion, T.tbd]),
    ...tasks.filter((r) => r.fit !== 'fit').map((r) => [r.code, r.label, word('f_', r.fit), word('u_', r.usage), r.statement || '',
      arr(r.why).map((w) => (typeof w === 'string' ? w : w.text)).join('\n'), arr(r.coverage).map((o) => o.name).join(' '),
      arr(r.conversion).join('\n'), arr(r.tbd).join('\n')])];
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const wricef = [H([T.code, T.wkind, T.label, T.module, T.objects, T.disposition, T.reason, W.effort, T.note]),
    ...wricefItems(gap).map((c) => { const r = byCode.get(c.source.code) || {};
      return [c.source.code, word('k_', c.kind), c.label, c.module, c.objects.join(' '), word('d_', r.disposition), word('r_', r.wricef?.reason), num(r.effortMd), c.note]; })];
  const notUsed = [H([T.code, T.process, T.reasonCol]), ...arr(gap?.notEvidenced).map((n) => [n.backbone || '', n.label || '', n.reason || ''])];
  const oq = [H([T.oq]), ...arr(gap?.openQuestions).map((q) => [typeof q === 'string' ? q : q?.text || ''])];
  return workbook([
    { name: S[0], rows: summary, widths: [40, 40] },
    { name: S[1], rows: matrix, widths: [12, 44, 10, 10, 16, 24, 16, 8, 12, 10, 40, 9, 10, 16, 20, 24, 30] },
    { name: S[2], rows: register, widths: [12, 36, 10, 10, 50, 50, 24, 40, 40] },
    { name: S[3], rows: wricef, widths: [12, 14, 40, 8, 30, 16, 16, 10, 50] },
    { name: S[4], rows: notUsed, widths: [16, 40, 40] },
    { name: S[5], rows: oq, widths: [90] },
  ]);
}

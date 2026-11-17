// sc4sap:project-dashboard — the project model as an .xlsx workbook (zero-dependency; the UAT writer's workbook()).
//
//   projectWorkbook(model, { today, lang }) → Buffer
// Nine sheets: summary, milestones and criteria, WBS (with WRICEF columns), risks, issues, decisions, cutover tasks,
// go / no-go, weekly status log. Figures come from viewModel (the page's own numbers); nothing is computed twice.

import { workbook } from '../uat/uat-xlsx.mjs';
import { arr, normalizeModel, viewModel } from './project-model.mjs';

const T = {
  ko: {
    sheets: ['요약', '마일스톤과 기준', 'WBS', '리스크', '이슈', '결정', '컷오버 작업', 'Go-No-Go', '주간 현황 이력'],
    sum: ['항목', '값'], code: '코드', name: '프로젝트', type: '유형', pm: 'PM', start: '시작', goLive: 'Go-Live', modules: '모듈', today: '기준일',
    overall: '전체 상태', planned: '계획 진척(%)', actual: '실적 진척(%)', late: '지연 항목', risks: '열린 리스크', issues: '열린 이슈', decisions: '열린 결정', comment: '주간 코멘트',
    ms: ['ID', '마일스톤', '유형', '기준일', '예상일', '실제일', '상태', '승인자', '기준'],
    wbs: ['번호', 'ID', '항목', '유형', '워크스트림', '담당', '시작', '종료', '기준 시작', '기준 종료', '진척(%)', '상태', 'RAG', '선행', 'WRICEF 유형', 'WRICEF 단계', '기능 담당', '개발 담당', '객체', '이관 요청', '메모'],
    rk: ['ID', '리스크', '영향', '상태', '담당', '기한', '등록일'],
    is: ['ID', '이슈', '우선순위', '상태', '담당', '등록일', '기한', '관련 WBS', '해결 내용', '메모'],
    dc: ['ID', '결정 사항', '상태', '담당', '기한', '결정일', '메모'],
    ct: ['ID', '단계', '작업', '워크스트림', '담당', '기간(시간)', '선행', '점검', '상태', '메모'],
    gng: ['ID', '기준', '담당', '상태', '증빙'],
    log: ['주 종료일', '전체', '계산값', '워크스트림', '열린 리스크', '열린 결정', '코멘트'],
  },
  en: {
    sheets: ['Summary', 'Milestones and criteria', 'WBS', 'Risks', 'Issues', 'Decisions', 'Cutover tasks', 'Go-No-Go', 'Weekly status log'],
    sum: ['Item', 'Value'], code: 'Code', name: 'Project', type: 'Type', pm: 'PM', start: 'Start', goLive: 'Go-live', modules: 'Modules', today: 'As of',
    overall: 'Overall', planned: 'Planned progress (%)', actual: 'Actual progress (%)', late: 'Late items', risks: 'Open risks', issues: 'Open issues', decisions: 'Open decisions', comment: 'Weekly comment',
    ms: ['ID', 'Milestone', 'Kind', 'Baseline', 'Forecast', 'Actual', 'Status', 'Approver', 'Criteria'],
    wbs: ['No', 'ID', 'Item', 'Type', 'Workstream', 'Owner', 'Start', 'Finish', 'Baseline start', 'Baseline finish', 'Progress (%)', 'Status', 'RAG', 'Predecessors', 'WRICEF kind', 'WRICEF stage', 'Functional owner', 'Developer', 'Objects', 'Transports', 'Note'],
    rk: ['ID', 'Risk', 'Impact', 'Status', 'Owner', 'Due', 'Raised'],
    is: ['ID', 'Issue', 'Priority', 'Status', 'Owner', 'Raised', 'Due', 'WBS rows', 'Resolution', 'Note'],
    dc: ['ID', 'Decision', 'Status', 'Owner', 'Due', 'Decided', 'Note'],
    ct: ['ID', 'Phase', 'Task', 'Workstream', 'Owner', 'Duration (h)', 'Predecessors', 'Check', 'Status', 'Note'],
    gng: ['ID', 'Criterion', 'Owner', 'Status', 'Evidence'],
    log: ['Week end', 'Overall', 'Computed', 'Workstreams', 'Open risks', 'Open decisions', 'Comment'],
  },
};

const H = (cells) => cells.map((v) => ({ v, s: 1 }));
const list = (v) => arr(v).join(', ');
const txt = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v);

export function projectWorkbook(model0, { today, lang = '' } = {}) {
  return projectXlsx(model0, { today, lang });
}

/** Same as projectWorkbook — the name the web workbench calls. */
export function projectXlsx(model0, { today, lang = '' } = {}) {
  const m = normalizeModel(model0 || {});
  const L = T[String(lang || m.lang).slice(0, 2)] || T.en;
  const v = viewModel(m, today);
  const p = m.project || {};
  const people = new Map(arr(m.team).map((t) => [t.id, t.name || t.id]));
  const who = (id) => (id ? people.get(id) || id : '');
  const c = m.cutover || {};
  const summary = [H(L.sum),
    [L.code, p.code || ''], [L.name, p.name || ''], [L.type, p.type || ''], [L.pm, who(p.pm)], [L.start, p.start || ''], [L.goLive, p.goLive || ''],
    [L.modules, list(p.modules)], [L.today, v.today], [L.overall, m.status?.overall || v.overall], [L.planned, v.progress.planned], [L.actual, v.progress.actual],
    [L.late, v.late.length], [L.risks, m.risks.filter((r) => r.status !== 'closed').length], [L.issues, m.issues.filter((x) => x.status !== 'resolved' && x.status !== 'closed').length], [L.decisions, m.decisions.filter((d) => d.status !== 'decided').length],
    [L.comment, m.status?.comment || '']];
  const ms = [H(L.ms), ...v.milestones.map((x) => [x.id, x.label, x.kind || '', x.base || '', x.forecast || '', x.actual || '', x.status || '', who(x.approver), arr(x.criteria).join('\n')])];
  const wbs = [H(L.wbs), ...v.rows.map((r) => [r.num, r.id, `${'  '.repeat(r.depth)}${r.label}`, r.type, r.ws || '', who(r.owner), r.start || '', r.finish || '', r.baseStart || '', r.baseFinish || '',
    r.pct ?? '', r.status || '', r.rag || '', list(r.deps), r.wricef?.kind || '', r.wricef?.stage || '', who(r.fnOwner), who(r.devOwner), list(r.wricef?.objects), list(r.wricef?.trs), txt(r.note)])];
  const rk = [H(L.rk), ...m.risks.map((r) => [r.id, r.text || '', r.impact || '', r.status || '', who(r.owner), r.due || '', r.raised || ''])];
  const is = [H(L.is), ...m.issues.map((x) => [x.id, x.text || '', x.priority || '', x.status || '', who(x.owner), x.raised || '', x.due || '', list(x.rowIds), txt(x.resolution), txt(x.note)])];
  const dc = [H(L.dc), ...m.decisions.map((d) => [d.id, d.text || '', d.status || '', who(d.owner), d.due || '', d.decided || '', txt(d.note)])];
  const ct = [H(L.ct), ...arr(c.tasks).map((t) => [t.id, t.phase || '', t.label || '', t.ws || '', who(t.owner), t.durationH ?? '', list(t.deps), txt(t.check), t.status || '', txt(t.note)])];
  const gng = [H(L.gng), ...arr(c.goNoGo).map((g) => [g.id, g.text || '', who(g.owner), g.status || '', txt(g.evidence)])];
  const log = [H(L.log), ...arr(m.statusLog).slice().sort((a, b) => (a.weekEnd < b.weekEnd ? 1 : -1))
    .map((e) => [e.weekEnd, e.overall || '', e.computed || '', Object.entries(e.ws || {}).map(([k, r]) => `${k} ${r}`).join(', '), arr(e.risks).length, arr(e.decisions).length, e.comment || ''])];
  const widths = { summary: [24, 50], ms: [12, 34, 10, 12, 12, 12, 12, 16, 60], wbs: [8, 14, 44, 10, 10, 16, 11, 11, 11, 11, 9, 11, 7, 14, 8, 9, 16, 16, 24, 24, 30],
    rk: [8, 60, 8, 10, 16, 11, 11], is: [8, 60, 9, 11, 16, 11, 11, 18, 40, 30], dc: [8, 50, 10, 16, 11, 11, 40], ct: [12, 9, 44, 10, 16, 10, 16, 30, 10, 30], gng: [12, 60, 16, 10, 30], log: [12, 9, 9, 40, 10, 10, 50] };
  return workbook([
    { name: L.sheets[0], rows: summary, widths: widths.summary },
    { name: L.sheets[1], rows: ms, widths: widths.ms },
    { name: L.sheets[2], rows: wbs, widths: widths.wbs },
    { name: L.sheets[3], rows: rk, widths: widths.rk },
    { name: L.sheets[4], rows: is, widths: widths.is },
    { name: L.sheets[5], rows: dc, widths: widths.dc },
    { name: L.sheets[6], rows: ct, widths: widths.ct },
    { name: L.sheets[7], rows: gng, widths: widths.gng },
    { name: L.sheets[8], rows: log, widths: widths.log },
  ]);
}

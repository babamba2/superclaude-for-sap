// sc4sap:ops-health-check — the operations report (one self-contained HTML document) and its Markdown summary.
//
// Renamed from "health check" to "operations report" (user, 2026-11-16): a document an SM / AMS lead hands to the
// customer or the PMO — cover, executive summary, KPI tiles, dump trend, one section per area, issues & actions,
// areas not read, appendix. Cover author, action owner / due and a comments box are editable in the page; "Save"
// downloads the page with the edits embedded (<script type="application/json" id="ops-edits">). The model the page
// was drawn from sits next to it (id="ops-model"). No user names and no dump ids anywhere.

import { FALLBACK_TCODE } from './ops-model.mjs';
import { withResponsive } from '../lib/responsive.mjs';

const fmtN = (n) => (n === null || n === undefined ? '–' : String(n));

const T = {
  en: {
    areaCol: 'Area', title: 'Operations report', kicker: 'SAP operations', system: 'System', period: 'Reporting period', previous: 'Compared with',
    prepared: 'Prepared on', author: 'Prepared by', authorPh: 'Name, team', readAt: 'Data read at',
    verdict: { red: 'Action required', amber: 'Attention', green: 'Stable' },
    s1: 'Executive summary', s2: 'Key figures', s3: 'Short dumps per day', s4: 'Status by area', s5: 'Issues and actions', s6: 'Areas not read', s7: 'Appendix',
    area: { dumps: 'Short dumps', jobs: 'Background jobs', updates: 'Update errors', idocs: 'IDocs', transports: 'Transport requests', unread: 'Not read' },
    sub: { dumps: 'Short dumps (ST22)', jobs: 'Aborted background jobs (SM37)', updates: 'Update errors (SM13)', idocs: 'IDocs in error (WE02)', transports: 'Transport requests in the period' },
    kpi: { dumps: 'Short dumps', dumpGroups: 'Dump groups', newGroups: 'New dump groups', jobs: 'Aborted jobs', updates: 'Update errors', idocs: 'IDocs in error' },
    vsPrev: 'previous', noPrev: 'no comparison', notRead: 'not read', same: 'no change', newHint: 'not seen in the previous period',
    thisPeriod: 'This period', prevPeriod: 'Previous period', tableView: 'Show as table', date: 'Date', count: 'Count', noTrend: 'Dumps were not read — no trend.',
    error: 'Runtime error', program: 'Program', prev: 'Prev.', delta: 'Change', users: 'Users', last: 'Last seen', changedBy: 'Related transport', isNew: 'new',
    job: 'Job', tcode: 'Transaction', mestyp: 'Message type', status: 'Status', direction: 'Direction', dir: { in: 'inbound', out: 'outbound' }, partners: 'Partners',
    trkorr: 'Request', kind: 'Type', text: 'Description', none: 'None in the period.', more: (n) => `${n} more not shown.`, unreadHere: 'Not read on this system — see section 6.',
    no: 'No.', sev: 'Priority', severity: { high: 'High', medium: 'Medium', low: 'Low' }, finding: 'Finding', impact: 'Impact', action: 'Recommended action', owner: 'Owner', due: 'Due',
    noIssues: 'No issue needs action in this period.', comments: 'Comments', commentsPh: 'Review comments, agreements, follow-ups …',
    tcodeCheck: 'Check in', reason: 'Reason', allRead: 'Every area was read.',
    sources: 'Data sources', source: 'Source', defs: 'Definitions', rules: 'Verdict rules',
    srcText: {
      dumps: 'ST22 dump list (RuntimeListDumps): runtime error, program, include, time', transports: 'E070 / E07T / E071: request header, text, code objects',
      jobs: 'TBTCO status A, first step from TBTCP', updates: 'VBHDR with return code ≠ 0', idocs: 'EDIDC in an error status (02 04 05 25 26 29 51 56 60 61 63 65)',
    },
    defPeriod: 'Reporting period', defPrev: 'Comparison period (same length, directly before)', defLookback: 'Transport requests read from',
    ruleRed: 'Action required: a new dump group with 5 or more dumps, a dump group whose program a transport changed, a job aborted 3 times or more, or any update error.',
    ruleAmber: 'Attention: anything else found, or an area that could not be read.', ruleGreen: 'Stable: nothing found and every area read.',
    note: 'Read-only report. User IDs are counted, never listed; dump IDs are not shown. Counts are capped by the read limit (5,000 rows per table, 1,000 dumps). A related transport is a lead to check, not a proven cause.',
    edit: 'Edit', done: 'Done', save: 'Save', print: 'Print', dark: 'Dark', light: 'Light', unsaved: 'Unsaved edits', saved: 'Saved — send the downloaded file.',
    editHint: 'Edit mode: the cover author, the owner and due cells and the comments box can be changed. "Save" downloads the report with the edits.',
    whyRelease: 'The sc4sap dispatcher on this system (BASIS < 7.50) is older than these reads — reinstall it with /sc4sap:setup.', whyBlocked: 'The table blocklist does not allow this read.',
  },
  ko: {
    areaCol: '영역', title: '운영 보고서', kicker: 'SAP 운영', system: '시스템', period: '보고 기간', previous: '비교 기간',
    prepared: '작성일', author: '작성자', authorPh: '이름, 소속', readAt: '데이터 조회 시각',
    verdict: { red: '조치 필요', amber: '주의', green: '안정' },
    s1: '요약', s2: '핵심 지표', s3: '일별 숏 덤프 추이', s4: '영역별 현황', s5: '이슈 및 조치 사항', s6: '조회하지 못한 영역', s7: '부록',
    area: { dumps: '숏 덤프', jobs: '배치 잡', updates: '업데이트 오류', idocs: 'IDoc', transports: '전송 요청', unread: '미조회' },
    sub: { dumps: '숏 덤프 (ST22)', jobs: '중단된 배치 잡 (SM37)', updates: '업데이트 오류 (SM13)', idocs: '오류 IDoc (WE02)', transports: '기간 내 전송 요청' },
    kpi: { dumps: '숏 덤프', dumpGroups: '덤프 그룹', newGroups: '신규 덤프 그룹', jobs: '중단된 잡', updates: '업데이트 오류', idocs: '오류 IDoc' },
    vsPrev: '이전', noPrev: '비교 없음', notRead: '조회 불가', same: '변동 없음', newHint: '이전 기간에 없던 그룹',
    thisPeriod: '보고 기간', prevPeriod: '비교 기간', tableView: '표로 보기', date: '일자', count: '건수', noTrend: '숏 덤프를 조회하지 못해 추이가 없습니다.',
    error: '런타임 오류', program: '프로그램', prev: '이전', delta: '증감', users: '사용자 수', last: '마지막 발생', changedBy: '관련 전송 요청', isNew: '신규',
    job: '잡', tcode: '트랜잭션', mestyp: '메시지 유형', status: '상태', direction: '방향', dir: { in: '인바운드', out: '아웃바운드' }, partners: '파트너',
    trkorr: '요청', kind: '유형', text: '내역', none: '기간 내 없음.', more: (n) => `그 외 ${n}건은 생략.`, unreadHere: '이 시스템에서 조회 불가 — 6장 참고.',
    no: '번호', sev: '우선순위', severity: { high: '높음', medium: '중간', low: '낮음' }, finding: '발견 사항', impact: '영향', action: '권고 조치', owner: '담당자', due: '기한',
    noIssues: '이번 기간에 조치가 필요한 이슈 없음.', comments: '검토 의견', commentsPh: '검토 의견, 합의 사항, 후속 조치 …',
    tcodeCheck: '확인 T-code', reason: '사유', allRead: '모든 영역을 조회함.',
    sources: '데이터 출처', source: '출처', defs: '기간 정의', rules: '판정 기준',
    srcText: {
      dumps: 'ST22 덤프 목록 (RuntimeListDumps): 런타임 오류, 프로그램, 인클루드, 시각', transports: 'E070 / E07T / E071: 요청 헤더, 내역, 코드 오브젝트',
      jobs: 'TBTCO 상태 A, 첫 스텝 프로그램은 TBTCP', updates: 'VBHDR 리턴 코드 ≠ 0', idocs: 'EDIDC 오류 상태 (02 04 05 25 26 29 51 56 60 61 63 65)',
    },
    defPeriod: '보고 기간', defPrev: '비교 기간 (같은 길이, 직전 기간)', defLookback: '전송 요청 조회 시작일',
    ruleRed: '조치 필요: 5건 이상인 신규 덤프 그룹, 전송 요청이 프로그램을 변경한 덤프 그룹, 3회 이상 중단된 잡, 업데이트 오류 1건 이상.',
    ruleAmber: '주의: 그 밖의 발견 사항이 있거나 조회하지 못한 영역이 있음.', ruleGreen: '안정: 발견 사항 없음, 모든 영역 조회 완료.',
    note: '조회 전용 보고서입니다. 사용자 ID는 수만 집계하며 목록에 넣지 않습니다. 덤프 ID는 표시하지 않습니다. 건수는 조회 한도(테이블당 5,000행, 덤프 1,000건) 안의 값입니다. 관련 전송 요청은 확인할 단서이며 원인으로 확정된 것은 아닙니다.',
    edit: '편집', done: '편집 끝', save: '저장', print: '인쇄', dark: '다크', light: '라이트', unsaved: '저장하지 않은 편집 있음', saved: '저장됨 — 내려받은 파일을 전달하세요.',
    editHint: '편집 모드: 표지의 작성자, 이슈의 담당자·기한, 검토 의견을 수정할 수 있습니다. "저장"을 누르면 편집 내용이 담긴 보고서를 내려받습니다.',
    whyRelease: '이 시스템(BASIS 7.50 미만)의 sc4sap 디스패처가 이전 버전이라 조회하지 못했습니다. /sc4sap:setup으로 다시 설치가 필요합니다.', whyBlocked: '테이블 차단 목록이 이 조회를 허용하지 않습니다.',
  },
  ja: {
    areaCol: '領域', title: '運用レポート', kicker: 'SAP 運用', system: 'システム', period: '報告期間', previous: '比較期間',
    prepared: '作成日', author: '作成者', authorPh: '氏名、所属', readAt: 'データ照会時刻',
    verdict: { red: '対応が必要', amber: '注意', green: '安定' },
    s1: '概要', s2: '主要指標', s3: '日別ショートダンプ推移', s4: '領域別の状況', s5: '課題と対応', s6: '照会できなかった領域', s7: '付録',
    area: { dumps: 'ショートダンプ', jobs: 'バッチジョブ', updates: '更新エラー', idocs: 'IDoc', transports: '移送依頼', unread: '未照会' },
    sub: { dumps: 'ショートダンプ (ST22)', jobs: '中断したバッチジョブ (SM37)', updates: '更新エラー (SM13)', idocs: 'エラー IDoc (WE02)', transports: '期間内の移送依頼' },
    kpi: { dumps: 'ショートダンプ', dumpGroups: 'ダンプグループ', newGroups: '新規ダンプグループ', jobs: '中断ジョブ', updates: '更新エラー', idocs: 'エラー IDoc' },
    vsPrev: '前期間', noPrev: '比較なし', notRead: '照会不可', same: '変化なし', newHint: '前期間になかったグループ',
    thisPeriod: '報告期間', prevPeriod: '比較期間', tableView: '表で表示', date: '日付', count: '件数', noTrend: 'ショートダンプを照会できず推移はありません。',
    error: 'ランタイムエラー', program: 'プログラム', prev: '前期間', delta: '増減', users: 'ユーザー数', last: '最終発生', changedBy: '関連する移送依頼', isNew: '新規',
    job: 'ジョブ', tcode: 'トランザクション', mestyp: 'メッセージタイプ', status: 'ステータス', direction: '方向', dir: { in: 'インバウンド', out: 'アウトバウンド' }, partners: 'パートナー',
    trkorr: '依頼', kind: '種別', text: '内容', none: '期間内になし。', more: (n) => `ほか ${n} 件は省略。`, unreadHere: 'このシステムでは照会不可 — 6 章を参照。',
    no: 'No.', sev: '優先度', severity: { high: '高', medium: '中', low: '低' }, finding: '検出事項', impact: '影響', action: '推奨対応', owner: '担当者', due: '期限',
    noIssues: '今期間に対応が必要な課題はありません。', comments: 'レビューコメント', commentsPh: 'レビューコメント、合意事項、フォローアップ …',
    tcodeCheck: '確認 T-code', reason: '理由', allRead: 'すべての領域を照会済み。',
    sources: 'データソース', source: 'ソース', defs: '期間の定義', rules: '判定基準',
    srcText: {
      dumps: 'ST22 ダンプ一覧 (RuntimeListDumps): ランタイムエラー、プログラム、インクルード、時刻', transports: 'E070 / E07T / E071: 依頼ヘッダ、内容、コードオブジェクト',
      jobs: 'TBTCO ステータス A、最初のステップは TBTCP', updates: 'VBHDR リターンコード ≠ 0', idocs: 'EDIDC エラーステータス (02 04 05 25 26 29 51 56 60 61 63 65)',
    },
    defPeriod: '報告期間', defPrev: '比較期間 (同じ長さの直前期間)', defLookback: '移送依頼の照会開始日',
    ruleRed: '対応が必要: 5 件以上の新規ダンプグループ、移送依頼がプログラムを変更したダンプグループ、3 回以上中断したジョブ、更新エラー 1 件以上。',
    ruleAmber: '注意: その他の検出事項、または照会できなかった領域がある。', ruleGreen: '安定: 検出事項なし、全領域を照会済み。',
    note: '照会のみのレポートです。ユーザー ID は数のみ集計し、一覧には載せません。ダンプ ID は表示しません。件数は照会上限(テーブルあたり 5,000 行、ダンプ 1,000 件)内の値です。関連する移送依頼は確認の手がかりであり、原因と確定したものではありません。',
    edit: '編集', done: '編集終了', save: '保存', print: '印刷', dark: 'ダーク', light: 'ライト', unsaved: '未保存の編集あり', saved: '保存しました — ダウンロードしたファイルを共有してください。',
    editHint: '編集モード: 表紙の作成者、課題の担当者・期限、レビューコメントを変更できます。「保存」で編集内容を含むレポートをダウンロードします。',
    whyRelease: 'このシステム(BASIS 7.50 未満)の sc4sap ディスパッチャーが古いため照会できませんでした。/sc4sap:setup で再インストールが必要です。', whyBlocked: 'テーブルのブロックリストがこの照会を許可していません。',
  },
};

/** Wording of one issue (finding, impact, recommended action) in the reader's language. */
const WORDS = {
  en: {
    finding: (i, t) => ({
      dumpChanged: `${i.error} in ${i.program} — ${i.count}× (previous ${fmtN(i.previous)}), after transport ${i.trkorr?.join(', ')}`,
      dumpNew: `New dump ${i.error} in ${i.program} — ${i.count}×`,
      dumpRising: `${i.error} in ${i.program} rising — ${i.count}× (previous ${fmtN(i.previous)})`,
      job: `Job ${i.job}${i.program ? ` (${i.program})` : ''} aborted ${i.count}×`,
      update: `Update error in ${i.tcode || i.program} — ${i.count}×`,
      idoc: `IDoc ${i.mestyp} status ${i.status} (${t.dir[i.direction]}) — ${i.count}`,
      unread: `${t.area[i.section]} not read`,
    }[i.kind]),
    impact: {
      dumpChanged: 'The program keeps terminating after a recent change; the business step it runs can fail.',
      dumpNew: 'An error not seen before — a new defect or a data problem.', dumpRising: 'A known error is occurring more often.',
      job: 'Batch results (follow-on jobs, interfaces, reports) can be missing.', update: 'Postings did not reach the database; data can be inconsistent.',
      idoc: 'Interface data was not processed; the partner system can be out of sync.', unread: 'This area is not covered by the report.',
    },
    action: (i) => ({
      dumpChanged: 'Check the change with the request owner; analyse the dump in ST22', dumpNew: 'Analyse the dump in ST22 and fix the cause',
      dumpRising: 'Analyse the dump in ST22; check the data that triggers it', job: 'Read the job log in SM37; decide on a restart',
      update: 'Find the cause in SM13; reprocess or have the user re-enter', idoc: 'Read the status message in WE02; reprocess in BD87',
      unread: `Check manually in ${i.action}`,
    }[i.kind]),
  },
  ko: {
    finding: (i, t) => ({
      dumpChanged: `${i.error} — ${i.program} ${i.count}건 (이전 ${fmtN(i.previous)}), 전송 요청 ${i.trkorr?.join(', ')} 이후 발생`,
      dumpNew: `신규 덤프 ${i.error} — ${i.program} ${i.count}건`,
      dumpRising: `${i.error} — ${i.program} ${i.count}건으로 증가 (이전 ${fmtN(i.previous)})`,
      job: `배치 잡 ${i.job}${i.program ? ` (${i.program})` : ''} ${i.count}회 중단`,
      update: `${i.tcode || i.program} 업데이트 오류 ${i.count}건`,
      idoc: `IDoc ${i.mestyp} 상태 ${i.status} (${t.dir[i.direction]}) ${i.count}건`,
      unread: `${t.area[i.section]} 조회 불가`,
    }[i.kind]),
    impact: {
      dumpChanged: '최근 변경 이후 프로그램이 반복 중단되어 해당 업무 처리가 실패할 수 있음.',
      dumpNew: '이전에 없던 오류로, 신규 결함 또는 데이터 문제 가능성.', dumpRising: '기존 오류의 발생 빈도가 증가함.',
      job: '배치 처리 결과(후속 잡, 인터페이스, 리포트)가 누락될 수 있음.', update: '전기 내용이 DB에 반영되지 않아 데이터 불일치 가능.',
      idoc: '인터페이스 데이터가 처리되지 않아 상대 시스템과 불일치 가능.', unread: '이 영역은 보고서로 확인할 수 없음.',
    },
    action: (i) => ({
      dumpChanged: '전송 요청 담당자와 변경 내용 확인, ST22에서 덤프 원인 분석', dumpNew: 'ST22에서 덤프 원인 분석 후 수정',
      dumpRising: 'ST22에서 덤프 분석, 발생 데이터 확인', job: 'SM37에서 잡 로그 확인 후 재실행 여부 결정',
      update: 'SM13에서 오류 원인 확인 후 재처리 또는 사용자 재입력', idoc: 'WE02에서 상태 메시지 확인 후 BD87로 재처리',
      unread: `${i.action}에서 수동 확인`,
    }[i.kind]),
  },
  ja: {
    finding: (i, t) => ({
      dumpChanged: `${i.error} — ${i.program} ${i.count} 件 (前期間 ${fmtN(i.previous)})、移送依頼 ${i.trkorr?.join(', ')} の後に発生`,
      dumpNew: `新規ダンプ ${i.error} — ${i.program} ${i.count} 件`,
      dumpRising: `${i.error} — ${i.program} ${i.count} 件に増加 (前期間 ${fmtN(i.previous)})`,
      job: `バッチジョブ ${i.job}${i.program ? ` (${i.program})` : ''} が ${i.count} 回中断`,
      update: `${i.tcode || i.program} の更新エラー ${i.count} 件`,
      idoc: `IDoc ${i.mestyp} ステータス ${i.status} (${t.dir[i.direction]}) ${i.count} 件`,
      unread: `${t.area[i.section]} 照会不可`,
    }[i.kind]),
    impact: {
      dumpChanged: '最近の変更以降プログラムが繰り返し中断し、該当業務が失敗する可能性。',
      dumpNew: '以前になかったエラー。新しい不具合またはデータの問題の可能性。', dumpRising: '既知のエラーの発生頻度が増加。',
      job: 'バッチ処理結果(後続ジョブ、インターフェース、レポート)が欠落する可能性。', update: '転記内容が DB に反映されず、データ不整合の可能性。',
      idoc: 'インターフェースデータが処理されず、相手システムと不整合の可能性。', unread: 'この領域はレポートで確認できない。',
    },
    action: (i) => ({
      dumpChanged: '移送依頼の担当者と変更内容を確認、ST22 でダンプ原因を分析', dumpNew: 'ST22 でダンプ原因を分析し修正',
      dumpRising: 'ST22 でダンプを分析、発生データを確認', job: 'SM37 でジョブログを確認し再実行を判断',
      update: 'SM13 で原因を確認し再処理またはユーザー再入力', idoc: 'WE02 でステータスメッセージを確認し BD87 で再処理',
      unread: `${i.action} で手動確認`,
    }[i.kind]),
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const table = (heads, rows, cls = '') => `<div class="tw"><table${cls ? ` class="${cls}"` : ''}><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const signed = (d) => (d > 0 ? `+${d}` : String(d));

/** Why a section was not read, in the reader's words where the cause is known. */
export function reasonOf(error, t) {
  if (/not allowed[\s\S]*BASIS < 7\.50/i.test(error)) return t.whyRelease;
  if (/blocklist|blocked|forbidden/i.test(error)) return t.whyBlocked;
  return String(error || '').replace(/^MCP error -?\d+:\s*/i, '').slice(0, 160);
}

/** The wording of one issue. */
export function issueText(i, lang = 'en') {
  const t = T[lang] || T.en;
  const w = WORDS[lang] || WORDS.en;
  return { finding: w.finding(i, t), impact: w.impact[i.kind], action: w.action(i) };
}

/** Executive summary: 3–5 sentences from the model — verdict, dumps vs the previous period, the other areas, the worst area, the top action. */
export function summarySentences(m, lang = 'en') {
  const t = T[lang] || T.en;
  const ko = lang === 'ko';
  const ja = lang === 'ja';
  const out = [];
  const period = `${m.from} – ${m.to}`;
  const v = t.verdict[m.verdict];
  out.push(ko ? `${period} 기간 ${m.system} 시스템의 운영 상태를 점검한 결과, 종합 판정은 '${v}'입니다.`
    : ja ? `${period} の ${m.system} システムの運用状況を確認した結果、総合判定は「${v}」です。`
      : `The operation of ${m.system} in the period ${period} was reviewed; the overall verdict is "${v}".`);
  if (m.dumps.ok) {
    const d = m.dumps.previousTotal === null ? null : m.dumps.total - m.dumps.previousTotal;
    const n = m.dumps.groups.filter((g) => g.isNew).length;
    if (ko) {
      const head = `숏 덤프는 ${m.dumps.total}건(${m.dumps.groups.length}개 그룹)`;
      if (d === null) out.push(`${head}이 발생했으며, 이전 기간과는 비교하지 못했습니다.`);
      else out.push(`${head}으로 이전 기간 ${m.dumps.previousTotal}건 대비 ${d > 0 ? `${d}건 증가했습니다` : d < 0 ? `${-d}건 감소했습니다` : '변동이 없습니다'}${n ? `(신규 그룹 ${n}개)` : ''}.`);
    }
    else if (ja) out.push(`ショートダンプは ${m.dumps.total} 件(${m.dumps.groups.length} グループ)で、${d === null ? '前期間とは比較できませんでした' : `前期間 ${m.dumps.previousTotal} 件に対し ${d > 0 ? `${d} 件増加しました` : d < 0 ? `${-d} 件減少しました` : '変化はありません'}`}${d !== null && n ? `。新規グループは ${n} 件です` : ''}。`);
    else out.push(`There were ${m.dumps.total} short dumps in ${m.dumps.groups.length} groups${d === null ? '; the previous period could not be compared' : `, ${d > 0 ? `${d} more than` : d < 0 ? `${-d} fewer than` : 'the same as'} the previous period (${m.dumps.previousTotal})`}${d !== null && n ? `; ${n} group${n === 1 ? ' is' : 's are'} new` : ''}.`);
  } else {
    out.push(ko ? '숏 덤프는 이 시스템에서 조회하지 못해 ST22에서 직접 확인이 필요합니다.' : ja ? 'ショートダンプはこのシステムで照会できず、ST22 での直接確認が必要です。' : 'Short dumps could not be read on this system and need a manual check in ST22.');
  }
  const part = (key) => {
    const s = m[key];
    const low = { jobs: 'aborted jobs', updates: 'update errors', idocs: 'IDocs in error' }[key];
    if (!s.ok) return ko ? `${t.kpi[key]} 조회 불가` : ja ? `${t.kpi[key]} 照会不可` : `${low} not read`;
    const prev = s.previousTotal === null || s.previousTotal === undefined ? '' : ko ? ` (이전 ${s.previousTotal}건)` : ja ? ` (前期間 ${s.previousTotal} 件)` : ` (previous ${s.previousTotal})`;
    return ko ? `${t.kpi[key]} ${s.total}건${prev}` : ja ? `${t.kpi[key]} ${s.total} 件${prev}` : `${s.total} ${low}${prev}`;
  };
  const parts = ['jobs', 'updates', 'idocs'].map(part);
  out.push(ko ? `그 밖에 ${parts.join(', ')}입니다.` : ja ? `その他、${parts.join('、')} です。` : `Besides, ${parts.join(', ')}.`);
  const top = m.issues[0];
  if (m.worst) {
    const first = m.issues.find((i) => i.area === m.worst);
    const f = issueText(first, lang).finding;
    out.push(ko ? `가장 주의가 필요한 영역은 ${t.area[m.worst]}이며, 주요 항목은 ${f}입니다.` : ja ? `最も注意が必要な領域は${t.area[m.worst]}で、主な項目は ${f} です。` : `The area that needs most attention is ${t.area[m.worst].toLowerCase()}: ${f}.`);
  }
  if (top) {
    const a = issueText(top, lang).action;
    out.push(ko ? `우선 권고 조치는 '${a}'입니다.` : ja ? `最優先の推奨対応は「${a}」です。` : `The first recommended action: ${a}.`);
  } else {
    out.push(ko ? '이번 기간에 조치가 필요한 항목은 없습니다.' : ja ? '今期間に対応が必要な項目はありません。' : 'Nothing needs action in this period.');
  }
  return out.slice(0, 5);
}

/** One KPI tile. More is worse for every figure here, so up is red and down is green. */
function tile(k, t) {
  const label = esc(t.kpi[k.key]);
  if (!k.ok) return `<div class="kpi off"><div class="kl">${label}</div><div class="kv">—</div><div class="kd">${esc(t.notRead)}</div></div>`;
  let d;
  if (k.key === 'newGroups') d = `<span class="flat">${esc(t.newHint)}</span>`;
  else if (k.delta === null) d = `<span class="flat">${esc(t.noPrev)}</span>`;
  else if (k.delta > 0) d = `<span class="up">▲ ${signed(k.delta)}</span> <span class="flat">${esc(t.vsPrev)} ${k.previous}</span>`;
  else if (k.delta < 0) d = `<span class="down">▼ ${signed(k.delta)}</span> <span class="flat">${esc(t.vsPrev)} ${k.previous}</span>`;
  else d = `<span class="flat">= ${esc(t.same)} (${esc(t.vsPrev)} ${k.previous})</span>`;
  return `<div class="kpi"><div class="kl">${label}</div><div class="kv">${k.value}</div><div class="kd">${d}</div></div>`;
}

/** Bars per day: the comparison period (muted) then the reporting period (accent), one count axis. */
export function trendSvg(m, t) {
  const cur = m.dumps.byDay || [];
  const prev = m.dumps.prevByDay || [];
  const bars = [...prev.map((d) => ({ ...d, prev: true })), ...cur.map((d) => ({ ...d, prev: false }))];
  if (!bars.length) return '';
  const W = 680, H = 200, L = 36, R = 8, TOP = 12, B = 30;
  const max = Math.max(1, ...bars.map((b) => b.count));
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * Math.ceil(max / step);
  const gap = prev.length ? 14 : 0;
  const slot = (W - L - R - gap) / bars.length;
  const bw = Math.max(3, Math.min(48, slot - 4));
  const y = (v) => TOP + (H - TOP - B) * (1 - v / top);
  const every = Math.ceil(bars.length / 12);
  const grid = [];
  for (let v = 0; v <= top; v += step) grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="g"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="ax">${v}</text>`);
  const marks = bars.map((b, i) => {
    const x = L + i * slot + (b.prev ? 0 : gap) + (slot - bw) / 2;
    const h = Math.max(0, y(0) - y(b.count));
    const r = Math.min(4, bw / 2, h);
    const path = h > 0 ? `M${x.toFixed(1)},${y(0).toFixed(1)}V${(y(b.count) + r).toFixed(1)}q0,-${r} ${r},-${r}h${(bw - 2 * r).toFixed(1)}q${r},0 ${r},${r}V${y(0).toFixed(1)}Z` : '';
    const label = i % every === 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${H - B + 16}" text-anchor="middle" class="ax">${esc(b.date.slice(5))}</text>` : '';
    const val = b.count && bars.length <= 14 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y(b.count) - 4).toFixed(1)}" text-anchor="middle" class="vl">${b.count}</text>` : '';
    return `<g><title>${esc(b.date)} · ${b.prev ? esc(t.prevPeriod) : esc(t.thisPeriod)}: ${b.count}</title><rect x="${(x - 2).toFixed(1)}" y="${TOP}" width="${(bw + 4).toFixed(1)}" height="${H - TOP - B}" class="hit"/>${path ? `<path d="${path}" class="${b.prev ? 'bp' : 'bc'}"/>` : ''}${val}${label}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t.s3)}" class="trend">${grid.join('')}<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="base"/>${marks}</svg>`;
}

function areaSection(t, key, m, n, body) {
  const s = m[key];
  const head = `<h3>4.${n} ${esc(t.sub[key])}</h3>`;
  if (!s.ok) return `<div class="area unread">${head}<p class="muted">${esc(t.unreadHere)}</p></div>`;
  return `<div class="area">${head}${body()}</div>`;
}

/** The report page. `opts.file` names the download of an edited copy. */
export function renderHtml(m, lang = 'en', opts = {}) {
  const t = T[lang] || T.en;
  const none = `<p class="muted">${esc(t.none)}</p>`;
  const prepared = (m.readAt || m.to || '').slice(0, 10);
  const deltaCell = (cur, prev) => (prev === null || prev === undefined ? '–' : cur - prev === 0 ? '0' : `<span class="${cur > prev ? 'up' : 'down'}">${cur > prev ? '▲' : '▼'} ${signed(cur - prev)}</span>`);

  const dumps = () => {
    if (!m.dumps.groups.length) return none;
    const shown = m.dumps.groups.slice(0, 15);
    return table([t.error, t.program, t.count, t.prev, t.delta, t.users, t.last, t.changedBy], shown.map((g) => `<tr${g.suspects.length ? ' class="hot"' : ''}><td><code>${esc(g.error)}</code>${g.isNew ? ` <span class="tag">${esc(t.isNew)}</span>` : ''}</td><td><code>${esc(g.program)}</code>${g.include && g.include !== g.program ? `<br><small>${esc(g.include)}</small>` : ''}</td><td class="n">${g.count}</td><td class="n">${fmtN(g.previous)}</td><td class="n">${deltaCell(g.count, g.previous)}</td><td class="n">${g.users}</td><td class="nw">${esc(g.last)}</td><td>${g.suspects.map((s) => `<code>${esc(s.trkorr)}</code> <small>${esc(s.date)}</small><br><small>${esc(s.text)}</small>`).join('<br>') || '–'}</td></tr>`))
      + (m.dumps.groups.length > shown.length ? `<p class="muted">${esc(t.more(m.dumps.groups.length - shown.length))}</p>` : '');
  };
  const jobs = () => (m.jobs.groups.length ? table([t.job, t.program, t.count, t.last], m.jobs.groups.slice(0, 20).map((g) => `<tr${g.count >= 3 ? ' class="hot"' : ''}><td><code>${esc(g.job)}</code></td><td><code>${esc(g.program)}</code></td><td class="n">${g.count}</td><td class="nw">${esc(g.last)}</td></tr>`)) : none);
  const updates = () => (m.updates.groups.length ? table([t.tcode, t.program, t.count, t.last], m.updates.groups.slice(0, 20).map((g) => `<tr class="hot"><td><code>${esc(g.tcode)}</code></td><td><code>${esc(g.report)}</code></td><td class="n">${g.count}</td><td class="nw">${esc(g.last)}</td></tr>`)) : none);
  const idocs = () => (m.idocs.groups.length ? table([t.mestyp, t.status, t.direction, t.count, t.partners, t.last], m.idocs.groups.slice(0, 20).map((g) => `<tr><td><code>${esc(g.mestyp)}</code></td><td>${esc(g.status)}</td><td>${esc(t.dir[g.direction] || g.direction)}</td><td class="n">${g.count}</td><td>${esc(g.partners.join(', '))}</td><td class="nw">${esc(g.last)}</td></tr>`)) : none);
  const transports = () => (m.transports.list.length ? table([t.trkorr, t.kind, t.status, t.date, t.text], m.transports.list.slice(0, 30).map((r) => `<tr><td><code>${esc(r.trkorr)}</code></td><td>${esc(r.kind)}</td><td>${esc(r.status)}</td><td class="nw">${esc(r.date)}</td><td>${esc(r.text)}</td></tr>`))
    + (m.transports.list.length > 30 ? `<p class="muted">${esc(t.more(m.transports.list.length - 30))}</p>` : '') : none);

  const issues = m.issues.length
    ? table([t.no, t.sev, t.areaCol, t.finding, t.impact, t.action, t.owner, t.due], m.issues.map((i, n) => {
      const w = issueText(i, lang);
      // job / IDoc: the analyze-symptom command, marked for the web viewer's prefill link (data-sc4sap-next)
      const tool = i.action && i.kind.startsWith('dump') ? `<br><code class="cmd">${esc(i.action)}</code>`
        : i.next ? `<br><code class="cmd" data-sc4sap-next="${esc(JSON.stringify(i.next))}">${esc(i.command)}</code>` : '';
      return `<tr><td class="n">${n + 1}</td><td><span class="sev ${i.severity}">${esc(t.severity[i.severity])}</span></td><td>${esc(t.area[i.area])}</td><td>${esc(w.finding)}</td><td>${esc(w.impact)}</td><td>${esc(w.action)}${tool}</td><td class="ed" data-e="owner-${n + 1}"></td><td class="ed nw" data-e="due-${n + 1}"></td></tr>`;
    }), 'issues')
    : `<p class="muted">${esc(t.noIssues)}</p>`;

  const unread = Object.keys(FALLBACK_TCODE).filter((s) => !m[s].ok);
  const unreadBody = unread.length
    ? table([t.areaCol, t.tcodeCheck, t.reason], unread.map((s) => `<tr><td>${esc(t.area[s])}</td><td><b>${esc(FALLBACK_TCODE[s])}</b></td><td>${esc(reasonOf(m[s].error, t))}</td></tr>`))
    : `<p class="muted">${esc(t.allRead)}</p>`;

  const trend = m.dumps.ok
    ? `<div class="legend">${m.dumps.prevByDay ? `<span><i class="sw bp"></i>${esc(t.prevPeriod)} ${esc(m.prevFrom)} – ${esc(m.prevTo)}</span>` : ''}<span><i class="sw bc"></i>${esc(t.thisPeriod)} ${esc(m.from)} – ${esc(m.to)}</span></div>${trendSvg(m, t)}
<details class="no-print"><summary>${esc(t.tableView)}</summary>${table([t.date, t.count], [...(m.dumps.prevByDay || []), ...m.dumps.byDay].map((d) => `<tr><td>${esc(d.date)}</td><td class="n">${d.count}</td></tr>`))}</details>`
    : `<p class="muted">${esc(t.noTrend)}</p>`;

  const labels = { edit: t.edit, done: t.done, unsaved: t.unsaved, saved: t.saved, dark: t.dark, light: t.light, file: opts.file || `ops-report-${m.to}-${lang}` };
  return withResponsive(`<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.title)} · ${esc(m.system)} · ${esc(m.to)}</title>
<meta name="generator" content="sc4sap ops-health-check">
<style>${STYLE}</style></head><body>
<div class="bar no-print"><span class="bt">${esc(t.title)} · ${esc(m.system)} · ${esc(m.to)}</span><span class="st" id="st"></span><button id="ed-btn" type="button">${esc(t.edit)}</button><button id="sv-btn" type="button">${esc(t.save)}</button><button id="pr-btn" type="button">${esc(t.print)}</button><button id="theme-btn" type="button" aria-label="theme">${esc(t.dark)}</button></div>
<main class="doc">
<p class="hint no-print">${esc(t.editHint)}</p>
<header class="cover">
<p class="kicker">${esc(t.kicker)}</p>
<h1>${esc(t.title)}</h1>
<p class="sys">${esc(m.system)}${m.sapVersion ? ` · ${esc(m.sapVersion)}` : ''} · ${esc(m.from)} – ${esc(m.to)}</p>
<p><span class="verdict ${esc(m.verdict)}">${esc(t.verdict[m.verdict])}</span></p>
<dl class="facts">
<dt>${esc(t.system)}</dt><dd>${esc(m.system)}${m.sapVersion ? ` (${esc(m.sapVersion)})` : ''}</dd>
<dt>${esc(t.period)}</dt><dd>${esc(m.from)} – ${esc(m.to)}</dd>
<dt>${esc(t.previous)}</dt><dd>${m.prevFrom ? `${esc(m.prevFrom)} – ${esc(m.prevTo)}` : '–'}</dd>
<dt>${esc(t.prepared)}</dt><dd>${esc(prepared)}</dd>
<dt>${esc(t.author)}</dt><dd class="ed" data-e="author" data-ph="${esc(t.authorPh)}"></dd>
</dl>
</header>
<section id="s1"><h2>1. ${esc(t.s1)}</h2><div class="exec ${esc(m.verdict)}">${summarySentences(m, lang).map((s) => `<p>${esc(s)}</p>`).join('')}</div></section>
<section id="s2"><h2>2. ${esc(t.s2)}</h2><div class="kpis">${m.kpis.map((k) => tile(k, t)).join('')}</div></section>
<section id="s3"><h2>3. ${esc(t.s3)}</h2>${trend}</section>
<section id="s4"><h2>4. ${esc(t.s4)}</h2>
${areaSection(t, 'dumps', m, 1, dumps)}
${areaSection(t, 'jobs', m, 2, jobs)}
${areaSection(t, 'updates', m, 3, updates)}
${areaSection(t, 'idocs', m, 4, idocs)}
${areaSection(t, 'transports', m, 5, transports)}
</section>
<section id="s5"><h2>5. ${esc(t.s5)}</h2>${issues}
<h3>${esc(t.comments)}</h3><div class="comments ed" data-e="comments" data-ph="${esc(t.commentsPh)}"></div></section>
<section id="s6"><h2>6. ${esc(t.s6)}</h2>${unreadBody}</section>
<section id="s7"><h2>7. ${esc(t.s7)}</h2>
<h3>${esc(t.sources)}</h3>${table([t.areaCol, t.source, 'T-code'], ['dumps', 'transports', 'jobs', 'updates', 'idocs'].map((s) => `<tr><td>${esc(t.area[s])}</td><td>${esc(t.srcText[s])}</td><td>${esc(FALLBACK_TCODE[s])}</td></tr>`))}
<h3>${esc(t.defs)}</h3><dl class="facts small">
<dt>${esc(t.defPeriod)}</dt><dd>${esc(m.from)} – ${esc(m.to)}</dd>
<dt>${esc(t.defPrev)}</dt><dd>${m.prevFrom ? `${esc(m.prevFrom)} – ${esc(m.prevTo)}` : '–'}</dd>
<dt>${esc(t.defLookback)}</dt><dd>${esc(m.lookbackFrom || '–')}</dd>
<dt>${esc(t.readAt)}</dt><dd>${esc(m.readAt || '–')}</dd>
</dl>
<h3>${esc(t.rules)}</h3><ul class="rules"><li>${esc(t.ruleRed)}</li><li>${esc(t.ruleAmber)}</li><li>${esc(t.ruleGreen)}</li></ul>
<p class="muted note">${esc(t.note)}</p>
</section>
</main>
<script type="application/json" id="ops-model">${json(embedded(m, t))}</script>
<script type="application/json" id="ops-edits">{}</script>
<script type="application/json" id="ops-labels">${json(labels)}</script>
<script>${CLIENT}</script>
</body></html>
`);
}

/** The model as the page carries it: a section's raw read error in the reader's words (no MCP internals). */
function embedded(m, t) {
  const out = JSON.parse(JSON.stringify(m));
  for (const k of Object.keys(FALLBACK_TCODE)) if (out[k]?.error) out[k].error = reasonOf(out[k].error, t);
  return out;
}

/** The edits embedded in a saved page (author, owner-<n>, due-<n>, comments), or null. */
export function editsFromPage(html) {
  const x = /<script type="application\/json" id="ops-edits">([\s\S]*?)<\/script>/.exec(String(html));
  if (!x) return null;
  try { return JSON.parse(x[1]); } catch { return null; }
}

const STYLE = `
:root{--bg:#eef1f5;--paper:#fff;--fg:#1d2430;--muted:#5d6878;--line:#d9dee6;--head:#f3f5f8;--accent:#2b5cab;--red:#c0392b;--amber:#b7791f;--green:#2f855a;--hot:#fdf1ef;--prev:#b8c0cc;--cur:#2b5cab;--edit:#eaf1fb;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0e1117;--paper:#161b22;--fg:#e4e8ee;--muted:#9aa5b4;--line:#2c3440;--head:#1c222b;--accent:#7aa7e8;--red:#e5675a;--amber:#d9a441;--green:#58b383;--hot:#3a2220;--prev:#4a5462;--cur:#7aa7e8;--edit:#1d2a3d;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0e1117;--paper:#161b22;--fg:#e4e8ee;--muted:#9aa5b4;--line:#2c3440;--head:#1c222b;--accent:#7aa7e8;--red:#e5675a;--amber:#d9a441;--green:#58b383;--hot:#3a2220;--prev:#4a5462;--cur:#7aa7e8;--edit:#1d2a3d;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 system-ui,-apple-system,"Segoe UI","Malgun Gothic","Yu Gothic",sans-serif}
.bar{position:sticky;top:0;z-index:5;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 16px;background:var(--paper);border-bottom:1px solid var(--line)}
.bar .bt{font-weight:600;margin-right:auto}.bar .st{color:var(--amber);font-size:12.5px}
.bar button{font:inherit;font-size:13px;padding:4px 12px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--fg);cursor:pointer}
.bar button:hover{border-color:var(--accent)}
.doc{max-width:860px;margin:20px auto;padding:40px 48px;background:var(--paper);border:1px solid var(--line);border-radius:6px}
.hint{display:none;padding:8px 12px;border-radius:6px;background:var(--edit);font-size:12.5px}.editing .hint{display:block}
.cover{border-bottom:3px solid var(--accent);padding-bottom:18px;margin-bottom:8px}
.kicker{margin:0;color:var(--accent);font-weight:600;letter-spacing:.06em;text-transform:uppercase;font-size:12px}
h1{font-size:30px;margin:4px 0 2px}.sys{margin:0 0 10px;color:var(--muted)}
h2{font-size:18px;margin:30px 0 10px;padding-bottom:4px;border-bottom:1px solid var(--line)}h3{font-size:15px;margin:20px 0 6px}
.verdict{display:inline-block;padding:4px 14px;border-radius:999px;color:#fff;font-weight:700}
.verdict.red{background:var(--red)}.verdict.amber{background:var(--amber)}.verdict.green{background:var(--green)}
.facts{display:grid;grid-template-columns:max-content 1fr;gap:4px 18px;margin:12px 0 0}.facts dt{color:var(--muted)}.facts dd{margin:0}
.facts.small{font-size:13px}
.exec{border-left:4px solid var(--muted);padding:4px 14px;background:var(--head);border-radius:0 6px 6px 0}.exec p{margin:6px 0}
.exec.red{border-color:var(--red)}.exec.amber{border-color:var(--amber)}.exec.green{border-color:var(--green)}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.kpi{border:1px solid var(--line);border-radius:8px;padding:10px 12px}.kpi.off{opacity:.7}
.kl{color:var(--muted);font-size:12.5px}.kv{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.3}.kd{font-size:12.5px}
.up{color:var(--red);font-weight:600}.down{color:var(--green);font-weight:600}.flat{color:var(--muted)}
.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-bottom:4px}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}.sw.bp{background:var(--prev)}.sw.bc{background:var(--cur)}
.trend{width:100%;height:auto;display:block}.trend .g{stroke:var(--line);stroke-width:1}.trend .base{stroke:var(--muted);stroke-width:1}
.trend .ax{fill:var(--muted);font-size:11px}.trend .vl{fill:var(--fg);font-size:11px}.trend .bp{fill:var(--prev)}.trend .bc{fill:var(--cur)}
.trend .hit{fill:transparent}.trend g:hover .hit{fill:var(--head)}
details summary{cursor:pointer;color:var(--accent);font-size:12.5px;margin-top:6px}
.tw{overflow-x:auto}
table{width:100%;border-collapse:collapse;margin:6px 0;font-size:13px}
th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}
th{background:var(--head);font-weight:600}td.n{text-align:right;font-variant-numeric:tabular-nums}.nw{white-space:nowrap}
tr.hot td{background:var(--hot)}
.tag{font-size:11px;padding:1px 6px;border-radius:4px;background:var(--amber);color:#fff}
.sev{font-size:11.5px;font-weight:700;padding:1px 7px;border-radius:4px;color:#fff;white-space:nowrap}.sev.high{background:var(--red)}.sev.medium{background:var(--amber)}.sev.low{background:var(--green)}
.muted{color:var(--muted)}small{color:var(--muted)}code{font-size:12.5px}code.cmd{font-size:11.5px;color:var(--muted);word-break:break-all}
.unread h3{color:var(--amber)}
.ed:empty::before{content:attr(data-ph);color:var(--muted);font-style:italic}
.editing .ed{background:var(--edit);outline:1px dashed var(--accent);outline-offset:-1px}
.comments{min-height:70px;border:1px solid var(--line);border-radius:6px;padding:8px 10px;white-space:pre-wrap}
.rules{margin:4px 0;padding-left:20px}.note{font-size:12.5px;margin-top:18px}
@media (max-width:700px){.doc{margin:0;padding:20px 16px;border:0;border-radius:0}.kpis{grid-template-columns:repeat(2,1fr)}h1{font-size:24px}}
@page{size:A4 portrait;margin:14mm}
@media print{
:root,:root:not([data-theme="light"]),:root[data-theme="dark"]{--bg:#fff;--paper:#fff;--fg:#1d2430;--muted:#5d6878;--line:#c9d0da;--head:#f3f5f8;--accent:#2b5cab;--red:#c0392b;--amber:#b7791f;--green:#2f855a;--hot:#fdf1ef;--prev:#b8c0cc;--cur:#2b5cab;color-scheme:light}
.no-print,.hint{display:none!important}body{background:#fff;font-size:11.5px}
.doc{max-width:none;margin:0;padding:0;border:0}
h2{break-after:avoid}h3{break-after:avoid}tr,.kpi,.trend{break-inside:avoid}.tw{overflow:visible}
.ed:empty::before{content:""}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}`;

// The browser side: theme switch, edit mode, save with the edits embedded. Plain ES5, no libraries.
const CLIENT = String.raw`(function(){
var root=document.documentElement;
var L=JSON.parse(document.getElementById('ops-labels').textContent);
var E={};try{E=JSON.parse(document.getElementById('ops-edits').textContent)||{};}catch(e){}
var KEY='sc4sap-ops-report-theme';
try{var saved=localStorage.getItem(KEY);if(saved)root.setAttribute('data-theme',saved);}catch(e){}
var tb=document.getElementById('theme-btn');
function isDark(){return root.getAttribute('data-theme')==='dark'||(!root.getAttribute('data-theme')&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);}
function themeLabel(){tb.textContent=isDark()?L.light:L.dark;}
tb.addEventListener('click',function(){var next=isDark()?'light':'dark';root.setAttribute('data-theme',next);try{localStorage.setItem(KEY,next);}catch(e){}themeLabel();});
themeLabel();
var cells=document.querySelectorAll('[data-e]');
for(var i=0;i<cells.length;i++){var k=cells[i].getAttribute('data-e');if(E[k]!=null)cells[i].textContent=E[k];}
var editing=false,dirty=false,st=document.getElementById('st'),eb=document.getElementById('ed-btn');
function setEdit(on){editing=on;document.body.classList.toggle('editing',on);eb.textContent=on?L.done:L.edit;
for(var i=0;i<cells.length;i++){if(on)cells[i].setAttribute('contenteditable','true');else cells[i].removeAttribute('contenteditable');}}
eb.addEventListener('click',function(){setEdit(!editing);});
document.addEventListener('input',function(e){if(e.target&&e.target.getAttribute&&e.target.getAttribute('data-e')){dirty=true;st.textContent=L.unsaved;}});
function collect(){var o={};for(var i=0;i<cells.length;i++){var v=(cells[i].innerText||cells[i].textContent||'').replace(/\s+$/,'');if(v)o[cells[i].getAttribute('data-e')]=v;}return o;}
document.getElementById('sv-btn').addEventListener('click',function(){
E=collect();var doc=root.cloneNode(true);
doc.querySelector('#ops-edits').textContent=JSON.stringify(E).replace(/</g,'\\u003c');
var ce=doc.querySelectorAll('[contenteditable]');for(var i=0;i<ce.length;i++)ce[i].removeAttribute('contenteditable');
doc.removeAttribute('data-theme');var b=doc.querySelector('body');if(b)b.className='';
var stc=doc.querySelector('#st');if(stc)stc.textContent='';
var a=document.createElement('a');a.download=L.file+'-edited.html';
a.href=URL.createObjectURL(new Blob(['<!doctype html>\n'+doc.outerHTML],{type:'text/html'}));
document.body.appendChild(a);a.click();a.remove();dirty=false;st.textContent=L.saved;setTimeout(function(){if(!dirty)st.textContent='';},4000);});
document.getElementById('pr-btn').addEventListener('click',function(){window.print();});
window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue=L.unsaved;}});
})();`;

/** The short summary the skill relays in chat. */
export function renderSummary(m, lang = 'en') {
  const t = T[lang] || T.en;
  const line = (key, n) => `- ${t.sub[key]}: ${m[key].ok ? n : `${t.notRead} → ${FALLBACK_TCODE[key]}`}`;
  const d = (s) => (s.previousTotal === null || s.previousTotal === undefined ? '' : ` (${t.vsPrev} ${s.previousTotal})`);
  return [
    `${t.title} · ${m.system} · ${m.from} – ${m.to} · ${t.verdict[m.verdict]}`,
    line('dumps', `${m.dumps.total} (${m.dumps.groups.length} ${lang === 'en' ? 'groups' : lang === 'ko' ? '그룹' : 'グループ'}, ${m.dumps.previousTotal === null ? t.noPrev : `${m.dumps.groups.filter((g) => g.isNew).length} ${t.isNew}, ${t.vsPrev} ${m.dumps.previousTotal}`})`),
    line('jobs', `${m.jobs.total}${d(m.jobs)}`),
    line('updates', `${m.updates.total}${d(m.updates)}`),
    line('idocs', `${m.idocs.total}${d(m.idocs)}`),
    line('transports', m.transports.list.length),
    ...m.next.slice(0, 5).map((n, i) => `${i + 1}. ${n.text} → ${n.action}`),
  ].join('\n');
}

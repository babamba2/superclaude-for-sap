// sc4sap:package-to-process — BPML (Business Process Master List) builder.
// Emits .xlsx (styled two-sheet workbook) OR .md (same data as Markdown) —
// CLI picks the mode from the output file extension.
//
// LANGUAGE: overview sheet name + every label follows meta.language
// (built-in dictionaries ko/en/ja, unknown → en; meta.labels overrides any
// key for other languages). The BPML sheet name is ALWAYS English "BPML"
// (lingua franca) regardless of language.
//
// xlsx shape:
//   Sheet 1 (localized 개요/Overview/概要) —
//                       dark 14pt title banner (row 1, merged A1:D1) +
//                       package meta + entry-point summary + WRICEF legend +
//                       "(추정)/(확인필요)" notation guide (values merged B:D
//                       so long text never gets buried)
//   Sheet 2 「BPML」  — STAIRCASE hierarchy matrix: every level L1~L5 gets its
//                       OWN row. Each L1 GROUP gets its own color family
//                       (blue / green / orange / purple / teal, cycling);
//                       shading applies to L1·L2 ONLY (L3+ stay white so the
//                       sheet isn't a wall of color). Dark header, frozen
//                       header row, AutoFilter, light-yellow highlight on
//                       "(확인필요)". Whole workbook font = 굴림.
//   Sheets 3+ (one per L1 group, named "<seg>. <L1 label>") — PROCESS FLOW
//                       sheets: every L2–L5 row of that group gets a heading
//                       band + its v13 sequence-diagram PNG embedded below
//                       (oneCellAnchor at col A). The BPML sheet's L1 label
//                       cell hyperlinks to its group sheet's A1 (blue
//                       underline); each flow sheet links back to BPML!A1.
//                       PNGs are rasterized via headless Edge/Chrome and
//                       cached in _img/bpml-png-<lang>/ keyed by SVG content
//                       (unchanged diagrams are never re-rendered). If no
//                       headless browser is available the workbook silently
//                       falls back to the 2-sheet layout (no dead links).
//
// Column widths are AUTO-COMPUTED from content (Korean glyphs ≈ 2 units);
// long-text columns get a generous cap (업무 내용 = 100). Row height is a
// FLAT 16 everywhere (exceptions: overview title banner 30, notation-guide
// wrap row) — no auto multi-line heights.
//
// Zero external deps — OOXML assembled by hand, zipped via xlsx-zip.mjs.
//
// INPUT JSON SHAPE
//   {
//     "meta": { package, module, sap_version, abap_release, industry, country,
//               active_modules[], generated_at, language,
//               entry_points:[{program,tcode,short,persona}],
//               wricef_legend:{...} },
//     "rows": [
//       // hierarchy row (lv 1–4): label goes in its own level column
//       { "lv":1, "code":"1",     "l1":"구매관리", "task_desc":"…요약…" },
//       { "lv":2, "code":"1.1",   "l2":"구매요청(PR) 관리", "task_desc":"…" },
//       // leaf row (lv 5): carries program attributes
//       { "lv":5, "code":"1.1.1.1.1", "l5":"PR 결재현황 조회",
//         "program","tcode","std_cbo","task_desc","io","wricef",
//         "dept","legacy","note" }
//     ]
//   }
//   Any cell string containing "확인필요" is auto-highlighted yellow.
//   Group color = first segment of `code` (1-based) cycling the palette.
//   프로세스ID (column between 프로세스코드 and L1) is AUTO-NUMBERED by the
//   builder for L5 rows only — [meta.module]-001, -002, … in document order.
//   Do NOT supply `proc_id` in the JSON; it is overwritten.
//
// CLI
//   node build-bpml.mjs <bpml.json> <out.xlsx>   → styled workbook (+ per-L1
//                                                  flow sheets w/ seq images)
//   node build-bpml.mjs <bpml.json> <out.md>     → same data as Markdown
//   (run twice for both formats; --no-images = legacy 2-sheet xlsx)
//
// md mode extras: after the BPML table, every L2–L5 row gets a detail
// section (title + description + diagram SVG in _img/bpml-flows-<lang>/);
// the table's process-code cells hyperlink to those sections. Image pick
// order per row: `seq` (v13 horizontal scenario sequence diagram — same
// style as the process document; PREFERRED) → `flow: {nodes, edges}` (v12
// vertical flowchart) → auto-derived linear flow (last resort: L2–L4 =
// chain of direct children, L5 = 입력→task→출력 from `io`).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipFiles } from './xlsx-zip.mjs';
import {
  renderFlowchartSVG, flowchartMetrics,
  renderSequenceDiagramSVG, sequenceDiagramMetrics,
  rasterizeSvgToPng,
} from './screen-image-renderer.mjs';

// ── Column model — key · max width cap · centered (headers → L10N) ──────
const COLUMNS = [
  { key: 'lv',        cap: 5,   center: true, num: true },
  { key: 'code',      cap: 14 },               // left-aligned
  { key: 'proc_id',   cap: 14,  center: true }, // L5 채번: [모듈]-001…
  { key: 'l1',        cap: 20 },
  { key: 'l2',        cap: 22 },
  { key: 'l3',        cap: 24 },
  { key: 'l4',        cap: 26 },
  { key: 'l5',        cap: 28 },
  { key: 'program',   cap: 15,  center: true },
  { key: 'tcode',     cap: 13,  center: true },
  { key: 'std_cbo',   cap: 14,  min: 12, center: true },   // 헤더 '표준/CBO'가 랩되어 묻히지 않게 최소폭 강제
  { key: 'task_desc', cap: 100 },
  { key: 'io',        cap: 80 },
  { key: 'wricef',    cap: 11,  center: true },
  { key: 'dept',      cap: 18 },
  { key: 'legacy',    cap: 60 },
  { key: 'note',      cap: 26 },
];
const NCOL = COLUMNS.length;

// ── L10N — meta.language picks the dictionary (ko/en/ja, unknown → en);
//    meta.labels {overviewSheet?, title?, headers?{}, ov?{}} overrides keys
//    so any other language can be supplied at runtime. BPML sheet name is
//    intentionally NOT localizable.
const L10N = {
  ko: {
    overviewSheet: '개요',
    title: '업무 프로세스 마스터리스트 (BPML)',
    headers: { lv: 'Lv', code: '프로세스코드', proc_id: '프로세스ID', l1: 'L1 대분류', l2: 'L2 중분류', l3: 'L3 소분류', l4: 'L4 단위업무', l5: 'L5 Task(단위활동)', program: '프로그램/FM', tcode: 'TCode/실행', std_cbo: '표준/CBO', task_desc: '업무 내용', io: '입력/출력', wricef: 'WRICEF', dept: '담당부서', legacy: '연관 레거시', note: '비고' },
    ov: { pkgBand: '패키지 개요', package: '패키지', module: '모듈', sapVersion: 'SAP 버전', abapRelease: 'ABAP 릴리즈', industry: '산업', country: '국가', activeModules: '활성 모듈', generatedAt: '생성 일시', language: '언어', levelCounts: '레벨별 행 수', epBand: '진입점 요약', epProgram: '프로그램', epTcode: 'TCode', epShort: '기능 설명', epPersona: '전형적 사용자', legendBand: 'WRICEF 범례', guideBand: '표기 안내', guide: '"(추정)" · "(확인필요)" 로 표기된 값(담당부서·연관 레거시 등)은 ABAP 코드에서 직접 추출되지 않아 AI가 추정한 값입니다. 실제 조직도·인터페이스 목록으로 검증 후 확정하세요. 노란색 셀 = 확인 필요.' },
    flow: { detailBand: '프로세스 상세', start: '시작', end: '종료', backToTable: '↑ BPML 표로', desc: '설명', noImg: '⚠ 다이어그램 렌더 불가 (headless 브라우저 없음)' },
  },
  en: {
    overviewSheet: 'Overview',
    title: 'Business Process Master List (BPML)',
    headers: { lv: 'Lv', code: 'Process Code', proc_id: 'Process ID', l1: 'L1 Category', l2: 'L2 Group', l3: 'L3 Subgroup', l4: 'L4 Work Unit', l5: 'L5 Task (Activity)', program: 'Program/FM', tcode: 'TCode/Exec', std_cbo: 'Std/CBO', task_desc: 'Task Description', io: 'Input/Output', wricef: 'WRICEF', dept: 'Owning Dept', legacy: 'Related Legacy', note: 'Notes' },
    ov: { pkgBand: 'Package Overview', package: 'Package', module: 'Module', sapVersion: 'SAP Version', abapRelease: 'ABAP Release', industry: 'Industry', country: 'Country', activeModules: 'Active Modules', generatedAt: 'Generated At', language: 'Language', levelCounts: 'Rows per Level', epBand: 'Entry-Point Summary', epProgram: 'Program', epTcode: 'TCode', epShort: 'Description', epPersona: 'Typical User', legendBand: 'WRICEF Legend', guideBand: 'Notation Guide', guide: 'Values marked "(estimated)" or "(TBD)" (owning dept, related legacy, etc.) were inferred by AI, not extracted from ABAP code. Verify against the actual org chart / interface list before finalizing. Yellow cells = needs confirmation.' },
    flow: { detailBand: 'Process Details', start: 'Start', end: 'End', backToTable: '↑ Back to BPML', desc: 'Description', noImg: '⚠ diagram not rendered (no headless browser)' },
  },
  ja: {
    overviewSheet: '概要',
    title: '業務プロセスマスターリスト (BPML)',
    headers: { lv: 'Lv', code: 'プロセスコード', proc_id: 'プロセスID', l1: 'L1 大分類', l2: 'L2 中分類', l3: 'L3 小分類', l4: 'L4 単位業務', l5: 'L5 タスク(単位活動)', program: 'プログラム/FM', tcode: 'TCode/実行', std_cbo: '標準/CBO', task_desc: '業務内容', io: '入力/出力', wricef: 'WRICEF', dept: '担当部署', legacy: '関連レガシー', note: '備考' },
    ov: { pkgBand: 'パッケージ概要', package: 'パッケージ', module: 'モジュール', sapVersion: 'SAPバージョン', abapRelease: 'ABAPリリース', industry: '業種', country: '国', activeModules: '有効モジュール', generatedAt: '生成日時', language: '言語', levelCounts: 'レベル別行数', epBand: 'エントリポイント要約', epProgram: 'プログラム', epTcode: 'TCode', epShort: '機能説明', epPersona: '典型ユーザー', legendBand: 'WRICEF凡例', guideBand: '表記ガイド', guide: '「(推定)」「(要確認)」と表記された値（担当部署・関連レガシーなど）はABAPコードから直接抽出されたものではなく、AIによる推定値です。実際の組織図・インターフェース一覧で検証のうえ確定してください。黄色セル＝要確認。' },
    flow: { detailBand: 'プロセス詳細', start: '開始', end: '終了', backToTable: '↑ BPML表へ', desc: '説明', noImg: '⚠ ダイアグラム描画不可 (headlessブラウザなし)' },
  },
};
function pickLang(meta) {
  const code = String(meta.language || 'ko').toLowerCase().slice(0, 2);
  const base = L10N[code] || L10N.en;
  const o = meta.labels || {};
  return {
    ...base, ...o,
    headers: { ...base.headers, ...(o.headers || {}) },
    ov: { ...base.ov, ...(o.ov || {}) },
    flow: { ...base.flow, ...(o.flow || {}) },
  };
}

// 프로세스ID 채번 — L5(leaf) 행에만 문서 순서대로 [모듈]-001, -002, … 부여.
function assignProcIds(meta, rows) {
  const modPrefix = String(meta.module || 'XX').toUpperCase();
  let seq = 0;
  for (const r of rows) {
    if (r.lv === 5) r.proc_id = `${modPrefix}-${String(++seq).padStart(3, '0')}`;
  }
}

// ── Per-L1-group color families — shading L1·L2 ONLY (L3+ = white) ──────
const GROUP_PALETTES = [
  ['FF9DC3E6', 'FFDDEBF7'],   // 1 blue
  ['FFA9D08E', 'FFE2EFDA'],   // 2 green
  ['FFF4B183', 'FFFCE4D6'],   // 3 orange
  ['FFB1A0C7', 'FFE4DFEC'],   // 4 purple
  ['FF8ED0CD', 'FFDAF0EF'],   // 5 teal
];
const NGROUP = GROUP_PALETTES.length;

// ── XML / text helpers ──────────────────────────────────────────────────
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function colLetter(n) {
  let s = '', x = n;
  do { s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) - 1; } while (x >= 0);
  return s;
}
const WARN_MARKERS = ['확인필요', '要確認', 'TBD'];
const isWarn = (v) => typeof v === 'string' && WARN_MARKERS.some((m) => v.includes(m));

// Display width in Excel column units: ASCII ≈ 1.0, CJK(굴림) ≈ 2.0.
function dispW(s) {
  let w = 0;
  for (const ch of String(s ?? '')) w += ch.codePointAt(0) > 255 ? 2.0 : 1.05;
  return w;
}

function cell(colIdx, rowNum, value, style, type) {
  const ref = `${colLetter(colIdx)}${rowNum}`;
  const s = style != null ? ` s="${style}"` : '';
  if (value == null || value === '') return `<c r="${ref}"${s}/>`;
  if (type === 'n') return `<c r="${ref}"${s}><v>${esc(value)}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

// ── styles.xml (generated) — whole workbook font = 굴림 ─────────────────
// fonts: 0 굴림10 · 1 굴림10 bold white · 2 굴림10 bold · 3 굴림14 bold white ·
//        4 굴림10 bold underline blue (hyperlink)
// fills: 0 none · 1 gray125 · 2 header FF595959 · 3 warn FFFFF2CC ·
//        4 ov-label FFE7E7E7 · 5.. group fills (g*2 + lv-1)
// cellXfs:
//   0 default · 1 header · 2 title(dark banner) · 3 ov-label · 4 ov-value
//   5 L5 base(white) · 6 L5 center · 7 warn
//   8.. group/level (L1·L2 only): base = 8 + (g*2 + lv-1)*2, center = base+1
//   then NGROUP L1-hyperlink variants (group fill + blue underline font),
//   then 1 back-link style (no fill/border) for the flow sheets.
const XF_L5 = 5, XF_WARN = 7, XF_GROUP0 = 8;
const groupXf = (g, lv, center) => XF_GROUP0 + (g * 2 + (lv - 1)) * 2 + (center ? 1 : 0);
const XF_L1LINK0 = XF_GROUP0 + NGROUP * 4;
const l1LinkXf = (g) => XF_L1LINK0 + g;
const XF_BACKLINK = XF_L1LINK0 + NGROUP;

function stylesXml() {
  const fillDefs = ['<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF595959"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE7E7E7"/></patternFill></fill>'];
  for (const pal of GROUP_PALETTES) for (const rgb of pal)
    fillDefs.push(`<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/></patternFill></fill>`);

  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
  ];
  GROUP_PALETTES.forEach((pal, g) => {
    pal.forEach((_, li) => {
      const fillId = 5 + g * 2 + li;
      const fontId = li === 0 ? 2 : 0;                    // L1 rows bold
      xfs.push(`<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`);
      xfs.push(`<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`);
    });
  });
  // L1 hyperlink cells — group L1 fill + blue underline bold (font 4).
  GROUP_PALETTES.forEach((_, g) => {
    xfs.push(`<xf numFmtId="0" fontId="4" fillId="${5 + g * 2}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`);
  });
  // flow-sheet back-link (↑ BPML) — no fill, no border.
  xfs.push('<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5">
<font><sz val="10"/><name val="굴림"/></font>
<font><sz val="10"/><b/><color rgb="FFFFFFFF"/><name val="굴림"/></font>
<font><sz val="10"/><b/><name val="굴림"/></font>
<font><sz val="14"/><b/><color rgb="FFFFFFFF"/><name val="굴림"/></font>
<font><sz val="10"/><b/><u/><color rgb="FF0B5394"/><name val="굴림"/></font>
</fonts>
<fills count="${fillDefs.length}">${fillDefs.join('')}</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border>
<left style="thin"><color rgb="FFA6A6A6"/></left>
<right style="thin"><color rgb="FFA6A6A6"/></right>
<top style="thin"><color rgb="FFA6A6A6"/></top>
<bottom style="thin"><color rgb="FFA6A6A6"/></bottom>
<diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

// ── width auto-fit (row height is a flat 16 everywhere) ─────────────────
function computeWidths(rows, headers) {
  return COLUMNS.map((c, i) => {
    let w = dispW(headers[i]);
    for (const r of rows) w = Math.max(w, dispW(r[c.key]));
    return Math.min(Math.max(w + 2.5, c.min ?? 6), c.cap);
  });
}

// ── BPML sheet ──────────────────────────────────────────────────────────
// `l1SheetOf` (optional Map<row, sheetName>) turns each L1 row's L1-label
// cell into an internal hyperlink to its process-flow sheet's A1 (blue
// underline, group fill preserved).
const L1_COL_IDX = COLUMNS.findIndex((c) => c.key === 'l1');
const quoteSheet = (n) => `'${String(n).replace(/'/g, "''")}'`;

function bpmlSheetXml(rows, headers, l1SheetOf) {
  const widths = computeWidths(rows, headers);
  const colsXml = widths.map((w, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${w.toFixed(1)}" customWidth="1"/>`).join('');

  const headerCells = COLUMNS.map((c, i) => cell(i, 1, headers[i], 1)).join('');
  const body = [`<row r="1" ht="16" customHeight="1">${headerCells}</row>`];
  const hyperlinks = [];

  rows.forEach((r, ri) => {
    const rowNum = ri + 2;
    const seg1 = parseInt(String(r.code).split('.')[0], 10);
    const g = (Number.isFinite(seg1) && seg1 > 0 ? seg1 - 1 : 0) % NGROUP;
    const linkSheet = r.lv === 1 && l1SheetOf ? l1SheetOf.get(r) : undefined;
    const cells = COLUMNS.map((c, i) => {
      const raw = r[c.key];
      let style;
      if (isWarn(raw)) style = XF_WARN;
      else if (r.lv >= 3 || !r.lv) style = c.center ? XF_L5 + 1 : XF_L5;   // 음영은 L2까지만
      else if (linkSheet && i === L1_COL_IDX) style = l1LinkXf(g);
      else style = groupXf(g, r.lv, c.center);
      return cell(i, rowNum, raw, style, c.num ? 'n' : undefined);
    }).join('');
    if (linkSheet) {
      hyperlinks.push(`<hyperlink ref="${colLetter(L1_COL_IDX)}${rowNum}" location="${esc(quoteSheet(linkSheet))}!A1" display="${esc(r.l1 || '')}"/>`);
    }
    body.push(`<row r="${rowNum}" ht="16" customHeight="1">${cells}</row>`);
  });

  const lastRef = `${colLetter(NCOL - 1)}${rows.length + 1}`;
  const linksXml = hyperlinks.length ? `<hyperlinks>${hyperlinks.join('')}</hyperlinks>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView tabSelected="1" workbookViewId="0">
<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16" customHeight="1"/>
<cols>${colsXml}</cols>
<sheetData>${body.join('')}</sheetData>
<autoFilter ref="A1:${lastRef}"/>
${linksXml}
<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
</worksheet>`;
}

// ── 개요/Overview sheet (labels from L10N `t`) ──────────────────────────
// Values merge B:D so long text (timestamps, legend prose, level counts)
// never gets visually buried behind the next cell border.
function overviewSheetXml(meta, counts, t) {
  const out = [];
  const merges = [];
  let r = 1;
  const push = (cells, ht) => {
    out.push(`<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>`);
    r++;
  };
  const band = (label) => push(cell(0, r, label, 1) + cell(1, r, '', 1) + cell(2, r, '', 1) + cell(3, r, '', 1), 16);
  const kv = (label, value) => {
    merges.push(`B${r}:D${r}`);
    push(cell(0, r, label, 3) + cell(1, r, value, 4) + cell(2, r, '', 4) + cell(3, r, '', 4), 16);
  };

  // Title banner — style 2 (14pt bold white on dark) on EVERY merged cell so
  // Excel renders the full banner rectangle, not just the top-left cell.
  const title = `${meta.package || ''} — ${t.title}`;
  push(cell(0, r, title, 2) + cell(1, r, '', 2) + cell(2, r, '', 2) + cell(3, r, '', 2), 30);
  merges.push(`A1:D1`);
  push('');

  band(t.ov.pkgBand);
  kv(t.ov.package, meta.package);
  kv(t.ov.module, meta.module);
  kv(t.ov.sapVersion, meta.sap_version);
  kv(t.ov.abapRelease, meta.abap_release);
  kv(t.ov.industry, meta.industry);
  kv(t.ov.country, meta.country);
  kv(t.ov.activeModules, (meta.active_modules || []).join(', '));
  kv(t.ov.generatedAt, meta.generated_at);
  kv(t.ov.language, meta.language);
  kv(t.ov.levelCounts, `L1 ${counts[1] || 0} · L2 ${counts[2] || 0} · L3 ${counts[3] || 0} · L4 ${counts[4] || 0} · L5 ${counts[5] || 0}`);
  push('');

  const eps = meta.entry_points || [];
  if (eps.length) {
    band(t.ov.epBand);
    push(cell(0, r, t.ov.epProgram, 3) + cell(1, r, t.ov.epTcode, 3) + cell(2, r, t.ov.epShort, 3) + cell(3, r, t.ov.epPersona, 3), 16);
    for (const e of eps) {
      push(cell(0, r, e.program, 4) + cell(1, r, e.tcode || '-', 4) + cell(2, r, e.short, 4) + cell(3, r, e.persona, 4), 16);
    }
    push('');
  }

  const leg = meta.wricef_legend || {};
  const legKeys = Object.keys(leg);
  if (legKeys.length) {
    band(t.ov.legendBand);
    for (const k of legKeys) kv(k, leg[k]);
    push('');
  }

  band(t.ov.guideBand);
  merges.push(`A${r}:D${r}`);
  push(cell(0, r, t.ov.guide, 4) + cell(1, r, '', 4) + cell(2, r, '', 4) + cell(3, r, '', 4), 58);

  const cols = `<col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="46" customWidth="1"/><col min="3" max="3" width="36" customWidth="1"/><col min="4" max="4" width="24" customWidth="1"/>`;
  const mergesXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="16" customHeight="1"/>
<cols>${cols}</cols>
<sheetData>${out.join('')}</sheetData>
${mergesXml}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
</worksheet>`;
}

// ── Process-flow sheets (one per L1 group) ──────────────────────────────
const EMU_PER_PX = 9525;          // 96 DPI: 1 px = 9525 EMU
const PX_PER_ROW = 16 * 4 / 3;    // flat 16pt row height → 21.33 px

// Excel sheet names: ≤31 chars, no  : \ / ? * [ ]  — and unique per book.
function sheetNameFor(seg, label, used) {
  const base = `${seg}. ${label}`.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31).trim() || `L1-${seg}`;
  let name = base, k = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 27)} (${k++})`;
  used.add(name.toLowerCase());
  return name;
}

// Group rows by L1 (document order) and pre-render each L2–L5 row's diagram
// SVG (seq preferred → flow/auto-derived flowchart fallback — same pick
// order as md mode). Returns [{seg, label, l1Row, sheetName, items}].
function buildFlowGroups(rows, t, lang2, reservedNames) {
  const used = new Set([...reservedNames].map((n) => n.toLowerCase()));
  const groups = [];
  let cur = null;
  rows.forEach((r, idx) => {
    if (r.lv === 1) {
      cur = { seg: String(r.code), label: r.l1 || String(r.code), l1Row: r, items: [] };
      groups.push(cur);
      return;
    }
    if (!cur || !r.lv || r.lv < 2) return;
    const label = r[`l${r.lv}`] || '';
    let svg = null, w = 0, h = 0;
    if (r.seq && Array.isArray(r.seq.actors) && r.seq.actors.length) {
      svg = renderSequenceDiagramSVG(r.seq, { lang: lang2, title: `${r.code} ${label}`.trim() });
      ({ width: w, height: h } = sequenceDiagramMetrics(r.seq));
    } else {
      const graph = autoFlowGraph(rows, idx, t);
      if (graph) {
        svg = renderFlowchartSVG(graph, { lang: lang2, heading: `${r.code} ${label}`.trim() });
        ({ width: w, height: h } = flowchartMetrics(graph));
      }
    }
    cur.items.push({ row: r, label, svg, w, h, png: null });
  });
  for (const g of groups) g.sheetName = sheetNameFor(g.seg, g.label, used);
  return groups;
}

async function mapPool(thunks, n) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, thunks.length) }, async () => {
    while (i < thunks.length) await thunks[i++]();
  }));
}

// Rasterize every item SVG → PNG, content-addressed cache in pngDir:
// flow-<anchor>.png is reused iff the stored flow-<anchor>.svg matches the
// freshly rendered SVG byte-for-byte. Rendering runs 4 browsers in parallel.
async function renderGroupPngs(groups, pngDir) {
  const jobs = [];
  for (const g of groups) for (const it of g.items) if (it.svg) jobs.push(it);
  if (!jobs.length) return { rendered: 0, cached: 0, failed: 0 };
  mkdirSync(pngDir, { recursive: true });
  let rendered = 0, cached = 0, failed = 0, done = 0;
  await mapPool(jobs.map((it) => async () => {
    const base = `flow-${anchorOf(it.row.code)}`;
    const svgFp = join(pngDir, `${base}.svg`);
    const pngFp = join(pngDir, `${base}.png`);
    if (existsSync(svgFp) && existsSync(pngFp) && readFileSync(svgFp, 'utf8') === it.svg) {
      it.png = readFileSync(pngFp);
      cached++;
    } else {
      const png = await rasterizeSvgToPng(it.svg, { width: it.w, height: it.h });
      if (png) {
        writeFileSync(pngFp, png);
        writeFileSync(svgFp, it.svg, 'utf8');
        it.png = png;
        rendered++;
      } else failed++;
    }
    if (it.png) {   // actual IHDR dims (fallback path may return padded PNG)
      it.pngW = it.png.readUInt32BE(16);
      it.pngH = it.png.readUInt32BE(20);
    }
    done++;
    if (done % 10 === 0 || done === jobs.length) {
      console.log(`build-bpml: flow images ${done}/${jobs.length} (${cached} cached, ${failed} failed)`);
    }
  }), 4);
  return { rendered, cached, failed };
}

// One flow sheet: dark title banner + ↑BPML back-link + per-row heading band
// with the PNG anchored one row below (col A). Returns worksheet XML plus the
// drawing anchor list (0-based row/col) for items that actually got a PNG.
function flowSheetXml(g, t) {
  const out = [], merges = [], anchors = [];
  const band = (r, text, s, ht) => {
    let cells = '';
    for (let ci = 0; ci < 10; ci++) cells += cell(ci, r, ci === 0 ? text : '', s);
    merges.push(`A${r}:J${r}`);
    out.push(`<row r="${r}" ht="${ht}" customHeight="1">${cells}</row>`);
  };
  band(1, `${g.seg}. ${g.label} — ${t.flow.detailBand}`, 2, 30);
  out.push(`<row r="3" ht="16" customHeight="1">${cell(0, 3, t.flow.backToTable, XF_BACKLINK)}</row>`);
  const links = [`<hyperlink ref="A3" location="BPML!A1" display="${esc(t.flow.backToTable)}"/>`];

  let r = 5;
  for (const it of g.items) {
    const row = it.row;
    let head = `[L${row.lv}] ${row.code} ${it.label}`.trim();
    if (row.lv === 5) {
      const extra = [row.proc_id, row.program, row.tcode].filter(Boolean).join(' · ');
      if (extra) head += `  (${extra})`;
    }
    band(r, head, 3, 16);
    if (it.png) {
      anchors.push({ row0: r, col0: 0, cx: it.pngW * EMU_PER_PX, cy: it.pngH * EMU_PER_PX });
      r += 1 + Math.ceil(it.pngH / PX_PER_ROW) + 2;
    } else if (it.svg) {
      out.push(`<row r="${r + 1}" ht="16" customHeight="1">${cell(0, r + 1, t.flow.noImg, 4)}</row>`);
      r += 4;
    } else {
      r += 2;
    }
  }

  const mergesXml = `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
  const cols = '<col min="1" max="1" width="14" customWidth="1"/>';
  const hasDrawing = anchors.length > 0;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="16" customHeight="1"/>
<cols>${cols}</cols>
<sheetData>${out.join('')}</sheetData>
${mergesXml}
<hyperlinks>${links.join('')}</hyperlinks>
<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
${hasDrawing ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
  return { xml, anchors };
}

function drawingXml(anchors) {
  const parts = anchors.map((a, i) =>
    `<xdr:oneCellAnchor><xdr:from><xdr:col>${a.col0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${a.cx}" cy="${a.cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 1}" name="flow${i + 1}"/><xdr:cNvPicPr preferRelativeResize="0"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${parts}</xdr:wsDr>`;
}

function drawingRelsXml(mediaIds) {
  const rels = mediaIds.map((m, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${m}.png"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

// ── package parts ───────────────────────────────────────────────────────
function contentTypes(nSheets, nDrawings, hasPng) {
  const sheets = Array.from({ length: nSheets }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n');
  const drawings = Array.from({ length: nDrawings }, (_, i) =>
    `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${hasPng ? '<Default Extension="png" ContentType="image/png"/>' : ''}
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets}
${drawings}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}
function rootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}
function workbookXml(sheetNames) {
  // Sheet 1 name follows meta.language; sheet 2 is always English "BPML";
  // sheets 3+ are the per-L1 process-flow sheets.
  const sheets = sheetNames.map((n, i) =>
    `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
${sheets}
</sheets>
</workbook>`;
}
function workbookRels(nSheets) {
  const rels = Array.from({ length: nSheets }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}
<Relationship Id="rId${nSheets + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

// `flowSheets: false` restores the legacy 2-sheet workbook (no images).
export async function buildBpml({ meta = {}, rows = [], outPath, flowSheets = true }) {
  if (!outPath) throw new Error('build-bpml: outPath is required');
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('build-bpml: rows[] is empty');
  const t = pickLang(meta);
  const headers = COLUMNS.map((c) => t.headers[c.key]);
  const counts = {};
  for (const r of rows) counts[r.lv] = (counts[r.lv] || 0) + 1;
  assignProcIds(meta, rows);   // before flow sheets — L5 headings show proc_id

  // ── per-L1 process-flow sheets (skipped entirely if no browser) ───────
  const lang2 = String(meta.language || 'ko').toLowerCase().slice(0, 2);
  let groups = [];
  let imgStat = null;
  if (flowSheets && rows.some((r) => r.lv >= 2)) {
    groups = buildFlowGroups(rows, t, lang2, new Set([t.overviewSheet, 'BPML']));
    const pngDir = join(dirname(outPath), '_img', `bpml-png-${lang2}`);
    imgStat = await renderGroupPngs(groups, pngDir);
    if (!groups.some((g) => g.items.some((it) => it.png))) {
      console.warn('build-bpml: no headless browser found — flow sheets skipped (2-sheet fallback)');
      groups = [];
    }
  }
  const l1SheetOf = new Map(groups.map((g) => [g.l1Row, g.sheetName]));

  const sheetNames = [t.overviewSheet, 'BPML', ...groups.map((g) => g.sheetName)];
  const nSheets = sheetNames.length;
  const entries = [
    { name: '_rels/.rels', data: Buffer.from(rootRels(), 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml(sheetNames), 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels(nSheets), 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(stylesXml(), 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(overviewSheetXml(meta, counts, t), 'utf8') },
    { name: 'xl/worksheets/sheet2.xml', data: Buffer.from(bpmlSheetXml(rows, headers, l1SheetOf), 'utf8') },
  ];

  let mediaSeq = 0, drawingSeq = 0;
  groups.forEach((g, gi) => {
    const sheetNo = gi + 3;
    const { xml, anchors } = flowSheetXml(g, t);
    entries.push({ name: `xl/worksheets/sheet${sheetNo}.xml`, data: Buffer.from(xml, 'utf8') });
    if (!anchors.length) return;
    const dNo = ++drawingSeq;
    const mediaIds = [];
    for (const it of g.items) {
      if (!it.png) continue;
      const m = ++mediaSeq;
      mediaIds.push(m);
      entries.push({ name: `xl/media/image${m}.png`, data: it.png });
    }
    entries.push({ name: `xl/drawings/drawing${dNo}.xml`, data: Buffer.from(drawingXml(anchors), 'utf8') });
    entries.push({ name: `xl/drawings/_rels/drawing${dNo}.xml.rels`, data: Buffer.from(drawingRelsXml(mediaIds), 'utf8') });
    entries.push({
      name: `xl/worksheets/_rels/sheet${sheetNo}.xml.rels`,
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${dNo}.xml"/></Relationships>`, 'utf8'),
    });
  });
  entries.unshift({ name: '[Content_Types].xml', data: Buffer.from(contentTypes(nSheets, drawingSeq, mediaSeq > 0), 'utf8') });

  const buf = zipFiles(entries);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buf);
  return {
    outPath, bytes: buf.length, rows: rows.length, counts,
    flowSheets: groups.length, images: mediaSeq,
    imgCached: imgStat?.cached ?? 0, imgRendered: imgStat?.rendered ?? 0, imgFailed: imgStat?.failed ?? 0,
  };
}

// ── Auto flow graph for one row (md detail sections) ────────────────────
// L2–L4: linear chain of DIRECT children (next-level rows until the level
// pops back). L5: 입력 → task(program·tcode) → 출력 parsed from `io`.
// A row may override with its own `flow: {nodes, edges}` (renderer schema).
function autoFlowGraph(rows, idx, t) {
  const r = rows[idx];
  if (r.flow && Array.isArray(r.flow.nodes) && r.flow.nodes.length) return r.flow;
  const nodes = [], edges = [];
  const chain = (ids) => { for (let i = 0; i < ids.length - 1; i++) edges.push({ from: ids[i], to: ids[i + 1] }); };
  if (r.lv === 5) {
    const io = String(r.io || '');
    const mIn = io.match(/(?:입력|Input|入力)\s*[::]\s*([^/]+)/i);
    const mOut = io.match(/(?:출력|Output|出力)\s*[::]\s*(.+)$/i);
    const sub = [r.program, r.tcode].filter(Boolean).join(' · ');
    nodes.push({ id: 's', type: 'start', label: mIn ? mIn[1].trim() : t.flow.start });
    nodes.push({ id: 'p', type: 'process', label: sub ? `${r.l5 || r.code}\n${sub}` : (r.l5 || r.code) });
    nodes.push({ id: 'e', type: 'end', label: mOut ? mOut[1].trim() : t.flow.end });
    chain(['s', 'p', 'e']);
    return { nodes, edges };
  }
  const kids = [];
  for (let i = idx + 1; i < rows.length; i++) {
    const c = rows[i];
    if (c.lv <= r.lv) break;
    if (c.lv === r.lv + 1) kids.push(c);
  }
  if (!kids.length) return null;
  nodes.push({ id: 's', type: 'start', label: t.flow.start });
  const ids = ['s'];
  kids.forEach((k, i) => {
    const lbl = k[`l${k.lv}`] || k.task_desc || k.code;
    const sub = k.lv === 5 ? [k.program, k.tcode].filter(Boolean).join(' · ') : '';
    nodes.push({ id: `n${i}`, type: 'process', label: sub ? `${lbl}\n${sub}` : lbl });
    ids.push(`n${i}`);
  });
  nodes.push({ id: 'e', type: 'end', label: t.flow.end });
  ids.push('e');
  chain(ids);
  return { nodes, edges };
}

const anchorOf = (code) => `bpml-${String(code).replace(/[^0-9A-Za-z]+/g, '-')}`;

// ── Markdown mode — same data, Excel parity: overview section + full BPML
//    staircase table + per-row detail sections (L2–L5 each: title +
//    description + flow SVG under `_img/bpml-flows-<lang>/`; process-code
//    cells hyperlink to their section). Warn cells get a "⚠ " prefix
//    (md has no yellow fill); L1 rows render bold. Sheet-name rule carries
//    over: BPML heading is always English "BPML", overview heading localized.
export function buildBpmlMd({ meta = {}, rows = [], outPath }) {
  if (!outPath) throw new Error('build-bpml: outPath is required');
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('build-bpml: rows[] is empty');
  const t = pickLang(meta);
  const counts = {};
  for (const r of rows) counts[r.lv] = (counts[r.lv] || 0) + 1;
  assignProcIds(meta, rows);

  const md = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  const L = [];
  L.push(`# ${meta.package || ''} — ${t.title}`, '');

  L.push(`## ${t.ov.pkgBand}`, '');
  const kv = (label, value) => { if (value) L.push(`- **${label}**: ${md(value)}`); };
  kv(t.ov.package, meta.package);
  kv(t.ov.module, meta.module);
  kv(t.ov.sapVersion, meta.sap_version);
  kv(t.ov.abapRelease, meta.abap_release);
  kv(t.ov.industry, meta.industry);
  kv(t.ov.country, meta.country);
  kv(t.ov.activeModules, (meta.active_modules || []).join(', '));
  kv(t.ov.generatedAt, meta.generated_at);
  kv(t.ov.language, meta.language);
  kv(t.ov.levelCounts, `L1 ${counts[1] || 0} · L2 ${counts[2] || 0} · L3 ${counts[3] || 0} · L4 ${counts[4] || 0} · L5 ${counts[5] || 0}`);
  L.push('');

  const eps = meta.entry_points || [];
  if (eps.length) {
    L.push(`## ${t.ov.epBand}`, '');
    L.push(`| ${t.ov.epProgram} | ${t.ov.epTcode} | ${t.ov.epShort} | ${t.ov.epPersona} |`);
    L.push('|---|---|---|---|');
    for (const e of eps) L.push(`| ${md(e.program)} | ${md(e.tcode || '-')} | ${md(e.short)} | ${md(e.persona)} |`);
    L.push('');
  }

  const leg = meta.wricef_legend || {};
  if (Object.keys(leg).length) {
    L.push(`## ${t.ov.legendBand}`, '');
    for (const k of Object.keys(leg)) L.push(`- **${md(k)}**: ${md(leg[k])}`);
    L.push('');
  }

  L.push('<a id="bpml-table" name="bpml-table"></a>', '');
  L.push('## BPML', '');
  // task_desc header padded with &nbsp; so HTML renderers give the column
  // generous min-width instead of squeezing it between 16 siblings.
  const hdr = (c) => t.headers[c.key] + (c.key === 'task_desc' ? '&nbsp;'.repeat(60) : '');
  L.push(`| ${COLUMNS.map(hdr).join(' | ')} |`);
  L.push(`|${COLUMNS.map((c) => (c.center ? ':---:' : '---')).join('|')}|`);
  for (const r of rows) {
    const cells = COLUMNS.map((c) => {
      const raw = r[c.key];
      let v = md(raw);
      if (isWarn(raw)) v = `⚠ ${v}`;
      if (r.lv === 1 && v && (c.key === 'code' || c.key === 'l1')) v = `**${v}**`;
      if (c.key === 'code' && r.lv >= 2 && v) v = `[${v}](#${anchorOf(r.code)})`;
      return v;
    });
    L.push(`| ${cells.join(' | ')} |`);
  }
  L.push('');

  // ── Per-row detail sections (L2–L5, document order) ──────────────────
  const lang2 = String(meta.language || 'ko').toLowerCase().slice(0, 2);
  const flowDirName = `_img/bpml-flows-${lang2}`;
  const flowDir = join(dirname(outPath), ...flowDirName.split('/'));
  let flowCount = 0, seqCount = 0;
  const detail = rows.some((r) => r.lv >= 2);
  if (detail) {
    L.push(`## ${t.flow.detailBand}`, '');
    rows.forEach((r, idx) => {
      if (!r.lv || r.lv < 2) return;
      const label = r[`l${r.lv}`] || '';
      L.push(`<a id="${anchorOf(r.code)}" name="${anchorOf(r.code)}"></a>`, '');
      L.push(`### [L${r.lv}] ${md(r.code)} ${md(label)}`.trimEnd(), '');
      if (r.lv === 5) {
        const facts = [r.proc_id && `**${r.proc_id}**`, r.program, r.tcode, r.wricef && `WRICEF: ${r.wricef}`]
          .filter(Boolean).map(md).join(' · ');
        if (facts) L.push(facts, '');
      }
      const desc = r.desc || r.task_desc;
      if (desc) L.push(`${md(desc)}`, '');
      // Image preference: row.seq (v13 horizontal scenario sequence diagram —
      // same style as the process document) → row.flow / auto-derived
      // vertical flowchart as fallback.
      let svg = null;
      if (r.seq && Array.isArray(r.seq.actors) && r.seq.actors.length) {
        svg = renderSequenceDiagramSVG(r.seq, { lang: lang2, title: `${r.code} ${label}`.trim() });
        seqCount++;
      } else {
        const graph = autoFlowGraph(rows, idx, t);
        if (graph) {
          svg = renderFlowchartSVG(graph, { lang: lang2, heading: `${r.code} ${label}`.trim() });
          flowCount++;
        }
      }
      if (svg) {
        const fname = `flow-${anchorOf(r.code)}.svg`;
        mkdirSync(flowDir, { recursive: true });
        writeFileSync(join(flowDir, fname), svg, 'utf8');
        L.push(`![${md(r.code)} flow](${flowDirName}/${fname})`, '');
      }
      L.push(`[${t.flow.backToTable}](#bpml-table)`, '');
    });
  }

  L.push(`## ${t.ov.guideBand}`, '');
  L.push(`> ⚠ ${t.ov.guide}`, '');

  const buf = Buffer.from(L.join('\n'), 'utf8');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buf);
  return { outPath, bytes: buf.length, rows: rows.length, counts, seqs: seqCount, flows: flowCount };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const args = process.argv.slice(2).filter((a) => a !== '--no-images');
  const noImages = process.argv.includes('--no-images');
  const [jsonPath, outPath] = args;
  if (!jsonPath || !outPath) {
    console.error('Usage: node build-bpml.mjs <bpml.json> <out.xlsx|out.md> [--no-images]');
    process.exit(2);
  }
  try {
    const spec = JSON.parse(readFileSync(resolve(jsonPath), 'utf8'));
    const isMd = outPath.toLowerCase().endsWith('.md');
    const res = isMd
      ? buildBpmlMd({ meta: spec.meta, rows: spec.rows, outPath: resolve(outPath) })
      : await buildBpml({ meta: spec.meta, rows: spec.rows, outPath: resolve(outPath), flowSheets: !noImages });
    const lv = Object.entries(res.counts).map(([k, v]) => `L${k}:${v}`).join(' ');
    const fl = res.flows != null ? `, ${res.seqs || 0} seq + ${res.flows} flow SVGs` : '';
    const fs2 = res.flowSheets != null ? `, ${res.flowSheets} flow sheets · ${res.images} images (${res.imgCached} cached / ${res.imgRendered} rendered / ${res.imgFailed} failed)` : '';
    console.log(`build-bpml: wrote ${res.outPath} (${res.bytes} bytes, ${res.rows} rows — ${lv}${fl}${fs2})`);
  } catch (e) {
    console.error(`build-bpml: ${e.message}`);
    process.exit(1);
  }
}

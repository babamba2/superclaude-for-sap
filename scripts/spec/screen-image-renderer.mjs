// sc4sap:program-to-spec — Screen mockup renderer (SVG → PNG)
//
// PURPOSE
//   Produce PNG images of Selection Screen and ALV layout for the
//   "Inputs & Screens" sheet of a generated spec xlsx. Replaces the older
//   cell-border wireframe approach (v5..v7) with embedded images.
//
// PUBLIC API
//   renderSelectionScreenSVG({ fields, blockLabels? })       → svg string
//   renderAlvLayoutSVG({ columns, sampleRows, maxRows=3 })   → svg string
//   rasterizeSvgToPng(svg, { width, height })                → Promise<Buffer|null>
//   renderScreenImages(spec)                                 → Promise<{selection,alv}|null>
//
// TOKEN ECONOMY (MANDATORY — propagated from SKILL.md)
//   · ALV sample rows capped at 3 (configurable up to 5).
//   · Minimal SVG: no gradients, no shadows, no emoji glyph payloads.
//   · Drop SVG/PNG temp files after rasterization (tmp folder auto-cleaned).
//
// FALLBACK POLICY
//   rasterizeSvgToPng returns null when no headless browser is available
//   (Edge/Chrome/Chromium not on PATH, or spawn error). Callers must
//   degrade to the legacy cell-border wireframe helpers in
//   rich-xlsx-template.mjs (screenFrameRow/screenSubtitleRow/screenMerge)
//   so spec generation never crashes on CI without Chrome.

import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';

// ──────────────────────────────────────────────────────────────
// SVG templates — minimal, no gradients
// ──────────────────────────────────────────────────────────────

function xml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapTextSvg(text, charsPerLine = 60) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    if (current.length + w.length + 1 > charsPerLine && current) {
      lines.push(current);
      current = w;
    } else {
      current = current ? current + ' ' + w : w;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

// ──────────────────────────────────────────────────────────────
// Localized legend strings (auto-derived per spec).
// Extended by adding a new `lang` key; missing keys fall back to 'ko'.
// ──────────────────────────────────────────────────────────────
const LEGEND = {
  ko: {
    required:       '필수 입력',
    dropdown:       '▼ 복수 선택',
    range:          '~ 범위(LOW~HIGH)',
    status_done:    '완료',
    status_partial: '부분입고',
    status_open:    '미입고',
    hotspot_text:   '밑줄 파랑',
    hotspot_label:  'Hotspot (더블클릭 이동)',
    editable_cell:  '노랑 셀',
    editable_label: '편집 가능',
    block_label:    '조회 조건',
    option_label:   '옵션',
    flow_heading:   '처리 흐름도',
    pane_caption:   '트리 노드 클릭 시 우측 갱신',
    fc_terminal:    '시작 · 종료',
    fc_process:     '처리',
    fc_decision:    '분기 (조건)',
    fc_message:     '메시지 · 예외',
    fc_yes:         '예',
    fc_no:          '아니오',
  },
  en: {
    required:       'Required',
    dropdown:       '▼ Multi-select',
    range:          '~ Range (LOW~HIGH)',
    status_done:    'Done',
    status_partial: 'Partial',
    status_open:    'Open',
    hotspot_text:   'Blue underline',
    hotspot_label:  '= Hotspot (click to navigate)',
    editable_cell:  'Yellow cell',
    editable_label: '= Editable',
    block_label:    'Selection Criteria',
    option_label:   'Options',
    flow_heading:   'Process Flow',
    pane_caption:   'Click a tree node to refresh the right pane',
    fc_terminal:    'Start · End',
    fc_process:     'Process',
    fc_decision:    'Decision',
    fc_message:     'Message · Exception',
    fc_yes:         'Yes',
    fc_no:          'No',
  },
  ja: {
    required:       '必須入力',
    dropdown:       '▼ 複数選択',
    range:          '~ 範囲(LOW~HIGH)',
    status_done:    '完了',
    status_partial: '一部入荷',
    status_open:    '未入荷',
    hotspot_text:   '青下線',
    hotspot_label:  '= Hotspot (ダブルクリックで遷移)',
    editable_cell:  '黄色セル',
    editable_label: '= 編集可能',
    block_label:    '照会条件',
    option_label:   'オプション',
    flow_heading:   '処理フロー',
    pane_caption:   'ツリーノードをクリックすると右側を更新',
    fc_terminal:    '開始 · 終了',
    fc_process:     '処理',
    fc_decision:    '分岐 (条件)',
    fc_message:     'メッセージ · 例外',
    fc_yes:         'はい',
    fc_no:          'いいえ',
  },
};
function legendFor(lang) { return LEGEND[lang] || LEGEND.ko; }

// Output scale factor — applied to the outer SVG width/height (and to the
// metrics helpers so the headless browser viewport matches). The viewBox
// stays at the original coordinate space so all internal positions/fonts are
// unchanged; the browser simply renders the same SVG content at 15% larger.
// Raise to make mockup PNGs bigger/crisper; lower if embedded images become
// too wide for the Inputs & Screens sheet.
const RENDER_SCALE = 1.15;

// Approximate pixel width of a text string at 12 px font.
// Conservative estimate: ASCII ≈ 7 px, CJK/full-width ≈ 13 px.
// Used to lay out the selection-screen label column dynamically so that
// long English labels (e.g. "Distribution Channel (S_VTWEG)") don't run
// underneath the input boxes — the previous fixed inputX=200 truncated
// anything wider than 162 px.
function approxTextWidthPx(s) {
  let w = 0;
  for (const ch of String(s ?? '')) {
    w += (ch.charCodeAt(0) > 0x7F ? 13 : 7);
  }
  return w;
}

/**
 * fields: [{
 *   required?: boolean,
 *   label: string,             e.g. '구매조직'
 *   name: string,              e.g. 'S_EKORG'
 *   range?: boolean,           true → LOW ~ HIGH two inputs
 *   note?: string,
 * }, ...]
 *
 * NOTE: `defaultLow` / `defaultHigh` are ACCEPTED in the field schema for
 *  spec documentation (they show up in the Parameters table), but they are
 *  NOT rendered inside the input-box graphic any more. The field name is
 *  already labeled next to the box; stuffing "BOM" / "1000" / "오늘" inside
 *  the input box just adds visual noise. Callers can still pass these
 *  values — the renderer silently ignores them.
 *
 * `lang` controls the bottom legend text ('ko' | 'en' | 'ja').
 */
// Shared image-mockup polish (v13): soft drop-shadow + rounded-top header path,
// so Selection/ALV mockups match the v12 flowchart + v13 process/sequence look.
const IMG_SHADOW = '<filter id="imgsh" x="-8%" y="-20%" width="116%" height="142%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.6" flood-color="#8C9BAA" flood-opacity="0.4"/></filter>';
function roundedTopRectPath(x, y, w, h, r) {
  return `M${x},${y + h} V${y + r} a${r},${r} 0 0 1 ${r},-${r} H${x + w - r} a${r},${r} 0 0 1 ${r},${r} V${y + h} Z`;
}

export function renderSelectionScreenSVG({
  fields = [],
  blockLabel = null,
  optionFields = [],
  optionBlockLabel = null,
  lang = 'ko',
} = {}) {
  const L = legendFor(lang);
  // Lang-aware defaults: when the caller omits the block labels, fall back to
  // the localized strings so an EN/JA spec never inherits the Korean default
  // (and vice-versa). Explicit caller values always win.
  blockLabel = blockLabel || L.block_label;
  optionBlockLabel = optionBlockLabel || L.option_label;
  const rowH = 24;
  const padTop = 40, padBottom = 60, optionBlockH = optionFields.length ? 24 + optionFields.length * rowH : 0;

  // ── Dynamic label-column layout ───────────────────────────────
  // Compute the label column's pixel width from the actual longest
  // label across BOTH the main block and the option block, then push
  // every input-box x-coord right of that so labels never overlap the
  // inputs. Minimum inputX stays at 200 to preserve the legacy look
  // for short CJK labels (typical 구매조직 (S_EKORG) ≈ 135 px).
  const LABEL_X = 38;
  const LABEL_GAP = 16;            // gap between label end and input start
  const BOX_W = 150;
  const SEP_GAP = 8;
  const allLabels = [
    ...fields.map(f => `${f.label} (${f.name})`),
    ...optionFields.map(f => `${f.label} (${f.name})`),
  ];
  const maxLabelPx = allLabels.length ? Math.max(...allLabels.map(approxTextWidthPx)) : 150;
  const inputX = Math.max(200, LABEL_X + maxLabelPx + LABEL_GAP);
  const sepX   = inputX + BOX_W + SEP_GAP;              // '~' center
  const highX  = sepX + 10;                              // HIGH box left
  const rangeDropX = highX + BOX_W + 2;                  // range dropdown
  const singleDropX = inputX + BOX_W + 2;                // single dropdown
  const rangeNoteX = rangeDropX + 28;
  const singleNoteX = singleDropX + 28;
  // Trailing note text can be up to ~200 px wide; block frame + 10 margin.
  const noteReserve = 200;
  const w = Math.max(900, rangeNoteX + noteReserve);
  const h = padTop + fields.length * rowH + padBottom + optionBlockH + 60;

  const rows = fields.map((f, i) => {
    const y = padTop + (i + 1) * rowH - 6;
    const star = f.required ? `<text x="25" y="${y}" fill="#B00020" font-weight="700">*</text>` : '';
    const label = `<text x="${LABEL_X}" y="${y}">${xml(f.label)} (${xml(f.name)})</text>`;
    if (f.range) {
      return [
        star, label,
        `<rect x="${inputX}" y="${y - 12}" width="${BOX_W}" height="16" fill="#FFFFFF" stroke="#9AA7B4" rx="2"/>`,
        `<text x="${sepX}" y="${y}" text-anchor="middle">~</text>`,
        `<rect x="${highX}" y="${y - 12}" width="${BOX_W}" height="16" fill="#FFFFFF" stroke="#9AA7B4" rx="2"/>`,
        `<rect x="${rangeDropX}" y="${y - 12}" width="16" height="16" fill="#E7EEF5" stroke="#9AA7B4" rx="2"/><text x="${rangeDropX + 8}" y="${y}" text-anchor="middle">▼</text>`,
        f.note ? `<text x="${rangeNoteX}" y="${y}" fill="#666">${xml(f.note)}</text>` : '',
      ].join('');
    }
    return [
      star, label,
      `<rect x="${inputX}" y="${y - 12}" width="${BOX_W}" height="16" fill="#FFFFFF" stroke="#9AA7B4" rx="2"/>`,
      `<rect x="${singleDropX}" y="${y - 12}" width="16" height="16" fill="#E7EEF5" stroke="#9AA7B4" rx="2"/><text x="${singleDropX + 8}" y="${y}" text-anchor="middle">▼</text>`,
      f.note ? `<text x="${singleNoteX}" y="${y}" fill="#666">${xml(f.note)}</text>` : '',
    ].join('');
  }).join('');

  const blockTop = 20;
  const blockH = padTop + fields.length * rowH + 20;
  const optBlockY = blockTop + blockH + 20;

  const optionRows = optionFields.map((f, i) => {
    const y = optBlockY + 34 + i * rowH;
    return [
      `<rect x="${inputX}" y="${y - 10}" width="12" height="12" fill="#FFF" stroke="#555"/>`,
      `<text x="${inputX + 20}" y="${y}">${xml(f.label)} (${xml(f.name)})</text>`,
      f.note ? `<text x="${inputX + 220}" y="${y}" fill="#666">${xml(f.note)}</text>` : '',
    ].join('');
  }).join('');

  const legendY = optBlockY + optionBlockH + 30;

  // Dynamic legend — only emit items that actually apply to this spec.
  // (No required fields → omit *; no ranges → omit ~; empty field set →
  // omit legend entirely.)
  const allFields = [...fields, ...optionFields];
  const legendParts = [];
  if (allFields.some(f => f.required)) legendParts.push(`<tspan fill="#B00020" font-weight="700">*</tspan> ${xml(L.required)}`);
  if (fields.length) legendParts.push(xml(L.dropdown));
  if (fields.some(f => f.range)) legendParts.push(xml(L.range));
  const legendSvg = legendParts.length
    ? `<text x="25" y="${legendY}" fill="#555" font-size="11">${legendParts.join(' · ')}</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * RENDER_SCALE)}" height="${Math.round(h * RENDER_SCALE)}" viewBox="0 0 ${w} ${h}" font-family="Arial,sans-serif" font-size="12">
<defs>${IMG_SHADOW}</defs>
<rect width="${w}" height="${h}" fill="#FFF"/>
<rect x="10" y="${blockTop}" width="${w - 20}" height="${blockH}" rx="8" fill="#FFFFFF" stroke="#3E7DB3" stroke-width="1.3" filter="url(#imgsh)"/>
<rect x="28" y="${blockTop - 9}" width="${Math.max(120, approxTextWidthPx(blockLabel) + 46)}" height="18" rx="4" fill="#DCE7F1" stroke="#9DBBD6"/>
<text x="38" y="${blockTop + 4}" font-weight="700" fill="#24598F">◆ ${xml(blockLabel)}</text>
${rows}
${optionFields.length ? `
<rect x="10" y="${optBlockY}" width="${w - 20}" height="${optionBlockH}" rx="8" fill="#FFFFFF" stroke="#3E7DB3" stroke-width="1.3" filter="url(#imgsh)"/>
<rect x="28" y="${optBlockY - 9}" width="${Math.max(70, approxTextWidthPx(optionBlockLabel) + 46)}" height="18" rx="4" fill="#DCE7F1" stroke="#9DBBD6"/>
<text x="38" y="${optBlockY + 4}" font-weight="700" fill="#24598F">◆ ${xml(optionBlockLabel)}</text>
${optionRows}
` : ''}
${legendSvg}
</svg>`;
}

/**
 * Compute final SVG dimensions for a selection-screen spec — matches the
 * internal math of renderSelectionScreenSVG so renderScreenImages() can
 * allocate the headless browser viewport without duplicating formulas.
 */
export function selectionScreenMetrics({ fields = [], optionFields = [] } = {}) {
  const rowH = 24;
  const padTop = 40, padBottom = 60;
  const optionBlockH = optionFields.length ? 24 + optionFields.length * rowH : 0;
  const h = padTop + fields.length * rowH + padBottom + optionBlockH + 60;
  const LABEL_X = 38, LABEL_GAP = 16, BOX_W = 150, SEP_GAP = 8;
  const allLabels = [
    ...fields.map(f => `${f.label} (${f.name})`),
    ...optionFields.map(f => `${f.label} (${f.name})`),
  ];
  const maxLabelPx = allLabels.length ? Math.max(...allLabels.map(approxTextWidthPx)) : 150;
  const inputX = Math.max(200, LABEL_X + maxLabelPx + LABEL_GAP);
  const rangeNoteX = inputX + BOX_W + SEP_GAP + 10 + BOX_W + 2 + 28;
  const w = Math.max(900, rangeNoteX + 200);
  return { width: Math.round(w * RENDER_SCALE), height: Math.round(h * RENDER_SCALE) };
}

/**
 * columns: [{ name, header, width?, align?: 'left'|'center'|'end', hotspot?, editable? }]
 * sampleRows: [{ [colName]: value, _status?: '●'|'○'|'◉', _locked?: boolean }]
 *
 * `lang` controls the bottom legend text ('ko' | 'en' | 'ja'). The legend
 * items are also **auto-derived** from the actual spec — if no column has
 * `hotspot: true`, the Hotspot item is omitted; if no column has
 * `editable: true`, the Editable item is omitted; if no `_status` column
 * exists (and no sampleRow sets `_status`), the traffic-light items are
 * omitted. When nothing applies, the legend row is skipped entirely and
 * the SVG height shrinks by ~30 px. This stops the renderer from telling
 * readers that a program has features it does not actually have.
 */
export function renderAlvLayoutSVG({ columns = [], sampleRows = [], maxRows = 3, lang = 'ko' } = {}) {
  const L = legendFor(lang);
  const rows = sampleRows.slice(0, Math.max(1, Math.min(maxRows, 5)));
  const totalW = columns.reduce((s, c) => s + (c.width || 100), 0) + 20;
  const w = Math.max(900, Math.min(totalW, 1600));
  const rowH = 24;
  const headerH = 22;
  // Spec-driven legend feature detection — only include items that apply.
  const hasStatus   = columns.some(c => c.name === '_status') || rows.some(r => r && r._status);
  const hasHotspot  = columns.some(c => c.hotspot);
  const hasEditable = columns.some(c => c.editable);
  const hasLegend   = hasStatus || hasHotspot || hasEditable;
  const legendPad   = hasLegend ? 80 : 30;
  const h = 10 + headerH + rows.length * rowH + legendPad;

  let x = 10;
  const colX = columns.map(c => { const left = x; x += (c.width || 100); return left; });
  const gridRight = x;

  const headerCells = columns.map((c, i) => {
    const cx = colX[i] + (c.width || 100) / 2;
    return `<text x="${cx}" y="${10 + headerH - 7}" text-anchor="middle" font-weight="700" fill="#FFFFFF">${xml(c.header || c.name)}</text>`;
  }).join('');

  const sepLines = colX.slice(1).map(lx =>
    `<line x1="${lx}" y1="${10 + headerH}" x2="${lx}" y2="${10 + headerH + rows.length * rowH}" stroke="#C8D4E2"/>`).join('');

  const dataRows = rows.map((r, rIdx) => {
    const y = 10 + headerH + rIdx * rowH;
    const bg = r._locked ? '#F0F5FA' : (rIdx % 2 === 1 ? '#F5F9FC' : '#FFF');
    const bandBg = rIdx % 2 === 1 || r._locked
      ? `<rect x="10" y="${y}" width="${gridRight - 10}" height="${rowH}" fill="${bg}"/>` : '';
    const cells = columns.map((c, ci) => {
      const cx = colX[ci] + (c.width || 100) / 2;
      const leftX = colX[ci] + 8, rightX = colX[ci] + (c.width || 100) - 8;
      const cy = y + rowH - 8;
      const val = r[c.name];
      const statusFill = { '●': '#D4A017', '○': '#C0392B', '◉': '#1E8449' };
      if (c.name === '_status' || c.editable) {
        if (c.editable) {
          const editBg = r._locked ? '#E5E5E5' : '#FFF6C8';
          const editStroke = r._locked ? '#999' : '#A67F25';
          return `<rect x="${colX[ci] + 2}" y="${y + 3}" width="${(c.width || 100) - 4}" height="${rowH - 6}" fill="${editBg}" stroke="${editStroke}"/>`
            + (val !== undefined ? `<text x="${rightX}" y="${cy}" text-anchor="end" font-family="monospace" fill="${r._locked ? '#888' : '#000'}">${xml(val)}</text>` : '');
        }
      }
      if (val === undefined || val === null || val === '') return '';
      const strVal = String(val);
      if (c.name === '_status') {
        return `<text x="${cx}" y="${cy}" text-anchor="middle" fill="${statusFill[strVal] || '#555'}" font-weight="700">${xml(strVal)}</text>`;
      }
      if (c.hotspot) {
        return `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="monospace" fill="#1F5AA0" text-decoration="underline">${xml(strVal)}</text>`;
      }
      const anchor = c.align === 'end' ? 'end' : (c.align === 'left' ? 'start' : 'middle');
      const tx = anchor === 'end' ? rightX : anchor === 'start' ? leftX : cx;
      const fam = /^[\d.,\-]+$/.test(strVal) ? 'monospace' : 'Arial,sans-serif';
      return `<text x="${tx}" y="${cy}" text-anchor="${anchor}" font-family="${fam}">${xml(strVal)}</text>`;
    }).join('');
    return bandBg + cells;
  }).join('');

  const legendY = 10 + headerH + rows.length * rowH + 30;

  const legendParts = [];
  if (hasStatus) {
    legendParts.push(
      `<tspan fill="#1E8449" font-weight="700">◉</tspan> ${xml(L.status_done)}`,
      `<tspan fill="#D4A017" font-weight="700">●</tspan> ${xml(L.status_partial)}`,
      `<tspan fill="#C0392B" font-weight="700">○</tspan> ${xml(L.status_open)}`,
    );
  }
  if (hasHotspot)  legendParts.push(`<tspan fill="#1F5AA0" text-decoration="underline">${xml(L.hotspot_text)}</tspan> ${xml(L.hotspot_label)}`);
  if (hasEditable) legendParts.push(`<tspan>${xml(L.editable_cell)}</tspan> ${xml(L.editable_label)}`);
  const legendSvg = hasLegend
    ? `<text x="10" y="${legendY}" font-size="11" fill="#555">${legendParts.join(' · ')}</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * RENDER_SCALE)}" height="${Math.round(h * RENDER_SCALE)}" viewBox="0 0 ${w} ${h}" font-family="Arial,sans-serif" font-size="12">
<defs>${IMG_SHADOW}</defs>
<rect width="${w}" height="${h}" fill="#FFF"/>
<rect x="10" y="10" width="${gridRight - 10}" height="${headerH + rows.length * rowH}" rx="7" fill="#FFFFFF" stroke="#C8D4E2" filter="url(#imgsh)"/>
<path d="${roundedTopRectPath(10, 10, gridRight - 10, headerH, 7)}" fill="#2E6FB0" stroke="#24598F" stroke-width="1.1"/>
${headerCells}
${dataRows}
${sepLines}
<rect x="10" y="10" width="${gridRight - 10}" height="${headerH + rows.length * rowH}" rx="7" fill="none" stroke="#C8D4E2"/>
${legendSvg}
</svg>`;
}

/**
 * ALV layout dimensions — mirrors the formulas in renderAlvLayoutSVG so
 * callers (renderScreenImages) can size the headless browser viewport
 * without duplicating the feature-detection logic.
 */
export function alvLayoutMetrics({ columns = [], sampleRows = [], maxRows = 3 } = {}) {
  const rows = sampleRows.slice(0, Math.max(1, Math.min(maxRows, 5)));
  const totalW = columns.reduce((s, c) => s + (c.width || 100), 0) + 20;
  const w = Math.max(900, Math.min(totalW, 1600));
  const hasStatus   = columns.some(c => c.name === '_status') || rows.some(r => r && r._status);
  const hasHotspot  = columns.some(c => c.hotspot);
  const hasEditable = columns.some(c => c.editable);
  const legendPad   = (hasStatus || hasHotspot || hasEditable) ? 80 : 30;
  const h = 10 + 22 + rows.length * 24 + legendPad;
  return { width: Math.round(w * RENDER_SCALE), height: Math.round(h * RENDER_SCALE) };
}

// ──────────────────────────────────────────────────────────────
// Process flow chart renderer (v11)
// ──────────────────────────────────────────────────────────────

/**
 * Render PROCESS_FLOW items array as a vertical flowchart SVG.
 * items: string[] — same format as PROCESS_FLOW constant:
 *   plain text → process box (rectangle)
 *   '?' prefix → decision (diamond shape, yellow fill)
 *   '!' prefix → terminal (rounded rectangle, gray fill)
 * opts: { lang, heading, width? }
 */
// CJK-aware text wrapping for process flow boxes.
// Korean / Chinese / Japanese chars take ~2x width of ASCII at 12px Arial.
// Returns lines that fit within `maxPx` visual pixels per line.
function wrapTextPx(text, maxPx, charPx = 7) {
  const str = String(text ?? '');
  const charWidth = (ch) => {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x1100 && cp <= 0x11FF) || (cp >= 0x2E80 && cp <= 0x303F) ||
        (cp >= 0x3040 && cp <= 0x30FF) || (cp >= 0x3400 && cp <= 0x9FFF) ||
        (cp >= 0xAC00 && cp <= 0xD7AF) || (cp >= 0xFF00 && cp <= 0xFFEF) ||
        cp >= 0x1F000) {
      return charPx * 1.8;
    }
    return charPx;
  };
  const lines = [];
  let cur = '', curW = 0;
  // Split on spaces but allow breaking at every char for CJK.
  const tokens = str.split(/(\s+)/);
  for (const tok of tokens) {
    if (!tok) continue;
    const tokW = [...tok].reduce((s, ch) => s + charWidth(ch), 0);
    if (curW + tokW <= maxPx) {
      cur += tok;
      curW += tokW;
    } else if (tokW > maxPx) {
      // Token itself is too long — char-by-char break
      if (cur) { lines.push(cur); cur = ''; curW = 0; }
      for (const ch of tok) {
        const cw = charWidth(ch);
        if (curW + cw > maxPx) {
          if (cur) lines.push(cur);
          cur = ch; curW = cw;
        } else {
          cur += ch; curW += cw;
        }
      }
    } else {
      if (cur) lines.push(cur);
      cur = tok.replace(/^\s+/, ''); // drop leading whitespace on new line
      curW = [...cur].reduce((s, ch) => s + charWidth(ch), 0);
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// Compute the height a label needs given its wrap lines.
function labelLinesAndHeight(label, boxW, kind) {
  // Padding inside the box: leave 24px each side for process, 60px for diamond (tapered)
  const padX = kind === 'decision' ? 60 : 24;
  const maxLineW = boxW - padX * 2;
  const lines = wrapTextPx(label, maxLineW);
  return lines;
}

export function renderProcessFlowSVG(items = [], { lang = 'ko', heading = null, width = 760, orientation = 'vertical' } = {}) {
  heading = heading || legendFor(lang).flow_heading;
  if (orientation === 'horizontal') {
    return renderProcessFlowHorizontalSVG(items, { lang, heading });
  }
  const BOX_W = 680;
  const BOX_H_MIN = 38;
  const TERM_H_MIN = 38;
  const DIAMOND_H_MIN = 60;
  const LINE_H = 18;          // px per text line
  const PAD_TOP = 48;
  const PAD_BOT = 28;
  const ARROW_H = 30;
  const LEFT = (width - BOX_W) / 2;
  const BLUE = '#0A4F8C';
  const YELLOW = '#FFFDE7';
  const GRAY_FILL = '#EFEFEF';

  let y = PAD_TOP;
  const parts = [];

  // Heading row
  parts.push(`<text x="${width / 2}" y="${y - 16}" text-anchor="middle" font-size="15" font-weight="700" fill="${BLUE}">${xml(heading)}</text>`);

  items.forEach((raw, i) => {
    const txt = String(raw ?? '');
    const isDecision = /^\?\s*/.test(txt);
    const isTerminal = /^!\s*/.test(txt);
    const label = isDecision ? txt.replace(/^\?\s*/, '')
                 : isTerminal ? txt.replace(/^!\s*/, '')
                 : txt;
    const kind = isDecision ? 'decision' : isTerminal ? 'terminal' : 'process';
    const lines = labelLinesAndHeight(label, BOX_W, kind);
    const lineCount = lines.length;
    const textBlockH = lineCount * LINE_H;

    if (isDecision) {
      const boxH = Math.max(DIAMOND_H_MIN, textBlockH + 28);
      const cx = width / 2, cy = y + boxH / 2;
      const dx = BOX_W / 2, dy = boxH / 2;
      parts.push(`<polygon points="${cx},${cy - dy} ${cx + dx},${cy} ${cx},${cy + dy} ${cx - dx},${cy}" fill="${YELLOW}" stroke="${BLUE}" stroke-width="1.6"/>`);
      const startY = cy - ((lineCount - 1) * LINE_H) / 2 + 5;
      lines.forEach((line, li) => {
        parts.push(`<text x="${cx}" y="${startY + li * LINE_H}" text-anchor="middle" font-size="12" fill="#222">${xml(line)}</text>`);
      });
      y += boxH;
    } else if (isTerminal) {
      const boxH = Math.max(TERM_H_MIN, textBlockH + 16);
      parts.push(`<rect x="${LEFT}" y="${y}" width="${BOX_W}" height="${boxH}" rx="${boxH / 2}" fill="${GRAY_FILL}" stroke="${BLUE}" stroke-width="1.6"/>`);
      const startY = y + boxH / 2 - ((lineCount - 1) * LINE_H) / 2 + 5;
      lines.forEach((line, li) => {
        parts.push(`<text x="${width / 2}" y="${startY + li * LINE_H}" text-anchor="middle" font-size="12" font-weight="700" fill="${BLUE}">${xml(line)}</text>`);
      });
      y += boxH;
    } else {
      const boxH = Math.max(BOX_H_MIN, textBlockH + 16);
      parts.push(`<rect x="${LEFT}" y="${y}" width="${BOX_W}" height="${boxH}" fill="#FFFFFF" stroke="${BLUE}" stroke-width="1.6"/>`);
      const startY = y + boxH / 2 - ((lineCount - 1) * LINE_H) / 2 + 5;
      lines.forEach((line, li) => {
        parts.push(`<text x="${width / 2}" y="${startY + li * LINE_H}" text-anchor="middle" font-size="12" fill="#222">${xml(line)}</text>`);
      });
      y += boxH;
    }

    // Arrow between items
    if (i < items.length - 1) {
      const arrowX = width / 2;
      parts.push(`<line x1="${arrowX}" y1="${y}" x2="${arrowX}" y2="${y + ARROW_H - 8}" stroke="${BLUE}" stroke-width="1.6"/>`);
      parts.push(`<polygon points="${arrowX - 7},${y + ARROW_H - 10} ${arrowX + 7},${y + ARROW_H - 10} ${arrowX},${y + ARROW_H}" fill="${BLUE}"/>`);
      y += ARROW_H;
    }
  });

  const totalH = y + PAD_BOT;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * RENDER_SCALE)}" height="${Math.round(totalH * RENDER_SCALE)}" viewBox="0 0 ${width} ${totalH}" font-family="Arial,sans-serif" font-size="12">
<rect width="${width}" height="${totalH}" fill="#FFF"/>
${parts.join('\n')}
</svg>`;
}

export function processFlowMetrics(items = [], { width = 760, orientation = 'vertical' } = {}) {
  if (orientation === 'horizontal') {
    return processFlowHorizontalMetrics(items);
  }
  const BOX_W = 680;
  const BOX_H_MIN = 38, TERM_H_MIN = 38, DIAMOND_H_MIN = 60;
  const LINE_H = 18, ARROW_H = 30, PAD_TOP = 48, PAD_BOT = 28;
  let h = PAD_TOP;
  items.forEach((raw, i) => {
    const txt = String(raw ?? '');
    const isDecision = /^\?\s*/.test(txt);
    const isTerminal = /^!\s*/.test(txt);
    const label = isDecision ? txt.replace(/^\?\s*/, '')
                 : isTerminal ? txt.replace(/^!\s*/, '')
                 : txt;
    const kind = isDecision ? 'decision' : isTerminal ? 'terminal' : 'process';
    const lines = labelLinesAndHeight(label, BOX_W, kind);
    const textBlockH = lines.length * LINE_H;
    if (isDecision) h += Math.max(DIAMOND_H_MIN, textBlockH + 28);
    else if (isTerminal) h += Math.max(TERM_H_MIN, textBlockH + 16);
    else h += Math.max(BOX_H_MIN, textBlockH + 16);
    if (i < items.length - 1) h += ARROW_H;
  });
  h += PAD_BOT;
  return { width: Math.round(width * RENDER_SCALE), height: Math.round(h * RENDER_SCALE) };
}

// ──────────────────────────────────────────────────────────────
// Horizontal Process Flow renderer (xlsx embed — sheet4 anchor B19).
//
// Why horizontal: spec readers (PM / consultant) need to grasp the end-to-end
// flow at a glance. A tall vertical chart forces them to scroll the
// "Processing Logic" sheet; a horizontal chart fits one Excel viewport and
// keeps the whole flow visible without scrolling.
//
// Box width is dynamic per label (min 150, max 220) so longer step labels
// don't get aggressively truncated. The chart stays on ONE row — wrapping
// is intentionally not introduced; Excel scrolls horizontally if many steps.
// User guidance (2026-05-24): "타이트하지 않게 가시성 우선".
// ──────────────────────────────────────────────────────────────

const PF_H_BOX_W_MIN = 150;
const PF_H_BOX_W_MAX = 220;
const PF_H_BOX_H = 78;
const PF_H_ARROW_W = 28;
const PF_H_PAD_X = 28;
const PF_H_PAD_TOP = 50;
const PF_H_PAD_BOT = 24;
const PF_H_LINE_H = 18;

function pfHorizontalBoxWidth(label) {
  const innerMax = PF_H_BOX_W_MAX - 24;
  const oneLine = wrapTextPx(label, innerMax);
  if (oneLine.length === 1) {
    const w = approxTextWidthPx(oneLine[0], 12) + 32;
    return Math.max(PF_H_BOX_W_MIN, Math.min(PF_H_BOX_W_MAX, Math.round(w)));
  }
  return PF_H_BOX_W_MAX;
}

function pfHorizontalLayout(items) {
  const boxes = items.map(raw => {
    const txt = String(raw ?? '');
    const isDecision = /^\?\s*/.test(txt);
    const isTerminal = /^!\s*/.test(txt);
    const label = isDecision ? txt.replace(/^\?\s*/, '')
                 : isTerminal ? txt.replace(/^!\s*/, '')
                 : txt;
    const kind = isDecision ? 'decision' : isTerminal ? 'terminal' : 'process';
    const boxW = pfHorizontalBoxWidth(label);
    const lines = wrapTextPx(label, boxW - (kind === 'decision' ? 40 : 24));
    return { kind, label, boxW, lines };
  });
  let totalW = PF_H_PAD_X * 2;
  boxes.forEach((b, i) => {
    totalW += b.boxW;
    if (i < boxes.length - 1) totalW += PF_H_ARROW_W;
  });
  return { boxes, totalW };
}

export function renderProcessFlowHorizontalSVG(items = [], { lang = 'ko', heading = null } = {}) {
  heading = heading || legendFor(lang).flow_heading;
  const BLUE = '#0A4F8C';
  const YELLOW = '#FFFDE7';
  const GRAY_FILL = '#EFEFEF';
  const { boxes, totalW } = pfHorizontalLayout(items);
  const width = totalW;
  const totalH = PF_H_PAD_TOP + PF_H_BOX_H + PF_H_PAD_BOT;
  const cy = PF_H_PAD_TOP + PF_H_BOX_H / 2;
  const parts = [];
  parts.push(`<text x="${width / 2}" y="${PF_H_PAD_TOP - 16}" text-anchor="middle" font-size="15" font-weight="700" fill="${BLUE}">${xml(heading)}</text>`);
  let x = PF_H_PAD_X;
  boxes.forEach((b, i) => {
    const textY = cy - ((b.lines.length - 1) * PF_H_LINE_H) / 2 + 5;
    if (b.kind === 'decision') {
      const dx = b.boxW / 2, dy = PF_H_BOX_H / 2;
      const ccx = x + dx;
      parts.push(`<polygon points="${ccx},${cy - dy} ${ccx + dx},${cy} ${ccx},${cy + dy} ${ccx - dx},${cy}" fill="${YELLOW}" stroke="${BLUE}" stroke-width="1.6"/>`);
      b.lines.forEach((line, li) => {
        parts.push(`<text x="${ccx}" y="${textY + li * PF_H_LINE_H}" text-anchor="middle" font-size="12" fill="#222">${xml(line)}</text>`);
      });
    } else if (b.kind === 'terminal') {
      parts.push(`<rect x="${x}" y="${PF_H_PAD_TOP}" width="${b.boxW}" height="${PF_H_BOX_H}" rx="${PF_H_BOX_H / 2}" fill="${GRAY_FILL}" stroke="${BLUE}" stroke-width="1.6"/>`);
      b.lines.forEach((line, li) => {
        parts.push(`<text x="${x + b.boxW / 2}" y="${textY + li * PF_H_LINE_H}" text-anchor="middle" font-size="12" font-weight="700" fill="${BLUE}">${xml(line)}</text>`);
      });
    } else {
      parts.push(`<rect x="${x}" y="${PF_H_PAD_TOP}" width="${b.boxW}" height="${PF_H_BOX_H}" fill="#FFFFFF" stroke="${BLUE}" stroke-width="1.6"/>`);
      b.lines.forEach((line, li) => {
        parts.push(`<text x="${x + b.boxW / 2}" y="${textY + li * PF_H_LINE_H}" text-anchor="middle" font-size="12" fill="#222">${xml(line)}</text>`);
      });
    }
    x += b.boxW;
    if (i < boxes.length - 1) {
      const ax1 = x + 2, ax2 = x + PF_H_ARROW_W - 8;
      parts.push(`<line x1="${ax1}" y1="${cy}" x2="${ax2}" y2="${cy}" stroke="${BLUE}" stroke-width="1.6"/>`);
      parts.push(`<polygon points="${ax2},${cy - 6} ${ax2},${cy + 6} ${x + PF_H_ARROW_W},${cy}" fill="${BLUE}"/>`);
      x += PF_H_ARROW_W;
    }
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * RENDER_SCALE)}" height="${Math.round(totalH * RENDER_SCALE)}" viewBox="0 0 ${width} ${totalH}" font-family="Arial,sans-serif" font-size="12">
<rect width="${width}" height="${totalH}" fill="#FFF"/>
${parts.join('\n')}
</svg>`;
}

export function processFlowHorizontalMetrics(items = []) {
  const { totalW } = pfHorizontalLayout(items);
  const totalH = PF_H_PAD_TOP + PF_H_BOX_H + PF_H_PAD_BOT;
  return { width: Math.round(totalW * RENDER_SCALE), height: Math.round(totalH * RENDER_SCALE) };
}

// ──────────────────────────────────────────────────────────────
// Branching flowchart renderer (v12) — Mermaid-style decision flow
//
// Why: the linear horizontal renderer can only show a single chain of boxes.
// Real ABAP report logic branches (validation fail → re-enter, empty result →
// exit) and loops back. To make the xlsx "처리 흐름도" read like the Markdown
// spec's `flowchart TD`, this renderer consumes a small graph:
//   {
//     nodes: [{ id, type:'start'|'end'|'process'|'decision'|'io', label,
//               lane?: 'right' }],          // lane:'right' = exception side-path
//     edges: [{ from, to, label?, route? }] // route auto-derived from geometry
//   }
// Layout: spine nodes (lane != 'right', in array order) stack down the centre
// column; side nodes align to the y of the decision that branches into them.
// Edges enter side targets from the east so loop-backs / exits never collide
// with the vertical spine arrows. `\n` in a label forces a line break.
// Design: rounded process boxes, amber decision diamonds, red message
// parallelograms, blue start/end pills, drop-shadows, marker arrowheads,
// colour-coded 예/아니오 edge chips, and a localized shape legend.
// ──────────────────────────────────────────────────────────────

const FC_CENTER_X = 250;
const FC_RIGHT_X  = 620;
const FC_WIDTH    = 800;
const FC_PROC_W   = 300;
const FC_DEC_W    = 240;
const FC_LINE_H   = 17;
const FC_VGAP     = 48;
const FC_PAD_TOP  = 66;
const FC_PAD_BOT  = 56;
const FC_INK      = '#2B3A4A';
const FC_EDGE     = '#5E7388';

function fcWrap(label, maxPx) {
  return String(label ?? '').split('\n').flatMap(seg => wrapTextPx(seg, maxPx));
}

function fcMeasure(n) {
  const type = n.type || 'process';
  if (type === 'decision') {
    const lines = fcWrap(n.label, FC_DEC_W - 86);
    // Diamond taper: lines off-centre sit where the polygon is narrower.
    // Size the half-height so the widest outer line still fits INSIDE the
    // diamond edge (avail half-width at offset o = (w/2)·(1 − o/dy)).
    const maxW = Math.max(...lines.map(l => approxTextWidthPx(l)));
    const maxOff = ((lines.length - 1) / 2) * FC_LINE_H + 12;
    const dy = maxOff / Math.max(0.3, 1 - maxW / FC_DEC_W);
    return { type, w: FC_DEC_W, h: Math.max(92, Math.round(dy * 2), lines.length * FC_LINE_H + 34), lines };
  }
  if (type === 'start' || type === 'end') {
    const lines = fcWrap(n.label, 240);
    const tw = Math.max(...lines.map(l => approxTextWidthPx(l)));
    return { type, w: Math.max(120, tw + 56), h: Math.max(42, lines.length * FC_LINE_H + 18), lines };
  }
  const W = FC_PROC_W;
  const lines = fcWrap(n.label, W - 30);
  return { type, w: W, h: Math.max(46, lines.length * FC_LINE_H + 20), lines };
}

function layoutFlowchart(graph = {}) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const pos = {};
  // Stack spine nodes (centre column).
  let y = FC_PAD_TOP;
  for (const n of nodes) {
    if (n.lane === 'right') continue;
    const m = fcMeasure(n);
    pos[n.id] = { ...m, x: FC_CENTER_X, yTop: y, cy: y + m.h / 2 };
    y += m.h + FC_VGAP;
  }
  let maxY = y - FC_VGAP;
  // Place side nodes aligned to the decision that points at them.
  for (const n of nodes) {
    if (n.lane !== 'right') continue;
    const m = fcMeasure(n);
    const src = edges.find(e => e.to === n.id && pos[e.from]);
    const cy = src ? pos[src.from].cy : FC_PAD_TOP + m.h / 2;
    pos[n.id] = { ...m, x: FC_RIGHT_X, yTop: cy - m.h / 2, cy };
    if (cy + m.h / 2 > maxY) maxY = cy + m.h / 2;
  }
  return { nodes, edges, byId, pos, width: FC_WIDTH, height: maxY + FC_PAD_BOT };
}

function fcNodeSvg(p, n) {
  const cx = p.x, cy = p.cy, w = p.w, h = p.h, top = p.yTop;
  const startY = cy - ((p.lines.length - 1) * FC_LINE_H) / 2 + 4;
  const texts = (fill, weight) => p.lines.map((ln, i) =>
    `<text x="${cx}" y="${startY + i * FC_LINE_H}" text-anchor="middle" font-size="12.5"${weight ? ' font-weight="700"' : ''} fill="${fill}">${xml(ln)}</text>`).join('');
  if (p.type === 'decision') {
    const dx = w / 2, dy = h / 2;
    return `<polygon points="${cx},${top} ${cx + dx},${cy} ${cx},${top + h} ${cx - dx},${cy}" fill="#FFF6D8" stroke="#D9A400" stroke-width="1.6" filter="url(#fcsh)"/>${texts(FC_INK)}`;
  }
  if (p.type === 'start' || p.type === 'end') {
    return `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${h / 2}" ry="${h / 2}" fill="#2E6FB0" stroke="#24598F" stroke-width="1.4" filter="url(#fcsh)"/>${texts('#FFFFFF', true)}`;
  }
  if (p.type === 'io') {
    const sk = 14, L = cx - w / 2, R = cx + w / 2;
    return `<polygon points="${L + sk},${top} ${R},${top} ${R - sk},${top + h} ${L},${top + h}" fill="#FCE7E4" stroke="#C0563E" stroke-width="1.5" filter="url(#fcsh)"/>${texts(FC_INK)}`;
  }
  return `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="7" ry="7" fill="#F4F8FC" stroke="#5A85AE" stroke-width="1.5" filter="url(#fcsh)"/>${texts(FC_INK)}`;
}

function fcChip(x, y, text, color) {
  const w = approxTextWidthPx(text) + 12;
  return `<rect x="${x - w / 2}" y="${y - 11}" width="${w}" height="16" rx="3" fill="#FFFFFF" stroke="#D7DEE6"/>`
    + `<text x="${x}" y="${y + 1}" text-anchor="middle" font-size="11" font-weight="700" fill="${color}">${xml(text)}</text>`;
}

function fcEdgeSvg(e, L, lang) {
  const a = L.pos[e.from], b = L.pos[e.to];
  if (!a || !b) return '';
  const aSide = L.byId[e.from]?.lane === 'right';
  const bSide = L.byId[e.to]?.lane === 'right';
  const south = p => ({ x: p.x, y: p.yTop + p.h });
  const north = p => ({ x: p.x, y: p.yTop });
  const east  = p => ({ x: p.x + p.w / 2, y: p.cy });
  let pts, label = e.label, lx, ly, lcol = '#56657A';
  if (!aSide && bSide) {                       // decision → exception (horizontal)
    pts = [east(a), { x: b.x - b.w / 2, y: a.cy }];
    lx = (a.x + a.w / 2 + b.x - b.w / 2) / 2; ly = a.cy - 7;
    if (label === legendFor(lang).fc_no || /no|아니|いいえ/i.test(label || '')) lcol = '#B0402F';
  } else if (aSide && !bSide) {                // side → spine (loop-back up / exit down)
    const start = b.cy < a.cy ? north(a) : south(a);
    pts = [start, { x: a.x, y: b.cy }, east(b)];
    lx = a.x; ly = (start.y + b.cy) / 2; lcol = '#7A4B9C';
  } else {                                      // spine vertical
    pts = [south(a), north(b)];
    lx = a.x + 12; ly = south(a).y + 17;
    if (label === legendFor(lang).fc_yes || /yes|예|はい/i.test(label || '')) lcol = '#1E7A46';
  }
  const poly = `<polyline points="${pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${FC_EDGE}" stroke-width="1.7" marker-end="url(#fcarrow)"/>`;
  return poly + (label ? fcChip(lx, ly, label, lcol) : '');
}

function fcLegendSvg(lang, y, width) {
  const L = legendFor(lang);
  const items = [
    ['terminal', L.fc_terminal], ['process', L.fc_process],
    ['decision', L.fc_decision], ['message', L.fc_message],
  ];
  const swatch = (kind, x) => {
    if (kind === 'terminal') return `<rect x="${x}" y="${y - 9}" width="22" height="13" rx="6.5" fill="#2E6FB0" stroke="#24598F"/>`;
    if (kind === 'decision') return `<polygon points="${x + 11},${y - 10} ${x + 22},${y - 2} ${x + 11},${y + 6} ${x},${y - 2}" fill="#FFF6D8" stroke="#D9A400"/>`;
    if (kind === 'message')  return `<polygon points="${x + 4},${y - 9} ${x + 22},${y - 9} ${x + 18},${y + 4} ${x},${y + 4}" fill="#FCE7E4" stroke="#C0563E"/>`;
    return `<rect x="${x}" y="${y - 9}" width="22" height="13" rx="3" fill="#F4F8FC" stroke="#5A85AE"/>`;
  };
  // Lay the four legend entries out centred under the chart.
  const cellW = 165;
  const startX = Math.max(20, (width - cellW * items.length) / 2);
  return items.map((it, i) => {
    const x = startX + i * cellW;
    return swatch(it[0], x) + `<text x="${x + 30}" y="${y + 1}" font-size="11.5" fill="#56657A">${xml(it[1])}</text>`;
  }).join('');
}

export function renderFlowchartSVG(graph = {}, { lang = 'ko', heading = null } = {}) {
  heading = heading || legendFor(lang).flow_heading;
  const L = layoutFlowchart(graph);
  const defs = `<defs>`
    + `<marker id="fcarrow" markerWidth="11" markerHeight="11" refX="8.5" refY="3.2" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L9.5,3.2 L0,6.4 Z" fill="${FC_EDGE}"/></marker>`
    + `<filter id="fcsh" x="-12%" y="-25%" width="124%" height="150%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.5" flood-color="#8C9BAA" flood-opacity="0.45"/></filter>`
    + `</defs>`;
  const edgeSvg = (L.edges || []).map(e => fcEdgeSvg(e, L, lang)).join('\n');
  const nodeSvg = (L.nodes || []).map(n => fcNodeSvg(L.pos[n.id], n)).join('\n');
  const legendSvg = fcLegendSvg(lang, L.height - 22, L.width);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(L.width * RENDER_SCALE)}" height="${Math.round(L.height * RENDER_SCALE)}" viewBox="0 0 ${L.width} ${L.height}" font-family="Arial,sans-serif" font-size="12">
${defs}
<rect width="${L.width}" height="${L.height}" fill="#FFF"/>
<text x="${L.width / 2}" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0A4F8C">${xml(heading)}</text>
${edgeSvg}
${nodeSvg}
${legendSvg}
</svg>`;
}

export function flowchartMetrics(graph = {}) {
  const L = layoutFlowchart(graph);
  return { width: Math.round(L.width * RENDER_SCALE), height: Math.round(L.height * RENDER_SCALE) };
}

// ──────────────────────────────────────────────────────────────
// Sequence diagram renderer (v13) — high-quality PNG replacement for the
// Mermaid `sequenceDiagram` blocks in package-to-process. Lifelines,
// sync (solid/filled) + return (dashed/open) arrows, self-messages, notes,
// and alt/opt/loop frames with label tabs + else dividers. Coloured actor
// (human) vs participant (system/object) headers, drop-shadows, marker arrows.
//
// spec: {
//   actors: [{ id, label, kind:'actor'|'participant' }],   // left→right order
//   items: [
//     { m:[from,to], t:'text' },           // sync call  (solid, filled arrow)
//     { m:[from,to], t:'text', r:true },   // return     (dashed, open arrow)
//     { note:'text', over:[id,...] },      // note box over one/more lifelines
//     { alt:'label' } | { opt:'label' } | { loop:'label' },  // open a frame
//     { elselbl:'label' },                 // else divider inside an alt frame
//     { end:true },                        // close the most-recent frame
//   ]
// }
// ──────────────────────────────────────────────────────────────
// SQ_COL_W compressed 198→156 so wide multi-actor diagrams (up to ~14
// lifelines) render at a smaller absolute px width — markdown viewers
// downscale to body width, so a narrower source image = larger apparent
// text. Paired with the +1 font bumps below (header 12→13, label 11.5→12.5)
// the font/column ratio rises ~40%, the lever that actually drives on-screen
// legibility (apparent_font ≈ font_px · containerWidth / imageWidth).
const SQ_COL_W = 156, SQ_LEFT = 30, SQ_TOP = 56, SQ_HEAD_H = 50;
const SQ_HEAD_GAP = 22, SQ_ROW = 48, SQ_NOTE = 42, SQ_BOT = 30;
// SQ_FRAG_CLOSE 14→22: a label right after a frame close stacks upward from
// its arrow (rect top ≈ close+14−18) — at 14 the white label box always
// clipped ~4px of the frame's bottom border.
const SQ_FRAG_OPEN = 32, SQ_FRAG_ELSE = 26, SQ_FRAG_CLOSE = 22, SQ_SELF = 40;
const SQ_HEAD_W = SQ_COL_W - 34;
const SQ_INK = '#2B3A4A', SQ_LIFE = '#A7B3C0', SQ_MLINE = '#3C5063', SQ_RET = '#6B7C8D';
function seqActorX(i) { return SQ_LEFT + SQ_HEAD_W / 2 + i * SQ_COL_W; }

function layoutSequence(spec = {}) {
  const actors = spec.actors || [];
  const idx = Object.fromEntries(actors.map((a, i) => [a.id, i]));
  const placed = [], frames = [], stack = [];
  let y = SQ_TOP + SQ_HEAD_H + SQ_HEAD_GAP;
  for (const it of (spec.items || [])) {
    if (it.alt != null || it.opt != null || it.loop != null) {
      const kind = it.alt != null ? 'alt' : it.opt != null ? 'opt' : 'loop';
      const fr = { kind, label: it.alt ?? it.opt ?? it.loop, y0: y - 8, elses: [],
                   minI: 0, maxI: Math.max(0, actors.length - 1) };
      stack.push(fr); frames.push(fr); y += SQ_FRAG_OPEN;
    } else if (it.elselbl != null) {
      const fr = stack[stack.length - 1]; if (fr) fr.elses.push({ y: y - 4, label: it.elselbl });
      y += SQ_FRAG_ELSE;
    } else if (it.end) {
      const fr = stack.pop(); if (fr) fr.y1 = y; y += SQ_FRAG_CLOSE;
    } else if (it.note != null) {
      const ids = (it.over && it.over.length) ? it.over : [actors[0]?.id];
      const is = ids.map(id => idx[id]).filter(v => v != null);
      const lo = Math.min(...is), hi = Math.max(...is);
      // Same wrap width the renderer uses ((x1-x0)-18) so layout and paint
      // agree; advance y by the REAL box height, not the fixed slot, so a
      // tall note never bleeds into the next row.
      const nLines = wrapTextPx(String(it.note), (hi - lo) * SQ_COL_W + SQ_HEAD_W - 18);
      const h = Math.max(SQ_NOTE - 10, nLines.length * 15 + 12);
      placed.push({ type: 'note', y, lo, hi, text: it.note, h });
      y += h + 10;
    } else if (it.m) {
      const fi = idx[it.m[0]], ti = idx[it.m[1]];
      if (fi == null || ti == null) continue;
      const self = fi === ti;
      // Message labels stack UPWARD from the arrow (seqLabel), so a wrapped
      // 2-3 line label pokes into whatever sits above — the actor headers
      // (painted later → they cover the text), a frame tab, or the previous
      // row. Reserve the extra lines' height BEFORE placing the arrow.
      const nLines = it.t ? wrapTextPx(String(it.t), 138).length : 1;
      y += (nLines - 1) * 15;
      placed.push({ type: 'msg', y, fi, ti, self, text: it.t || '', ret: !!it.r });
      y += self ? SQ_SELF : SQ_ROW;
    }
  }
  for (const fr of stack) fr.y1 = y;
  const width = SQ_LEFT * 2 + Math.max(0, actors.length - 1) * SQ_COL_W + SQ_HEAD_W;
  return { actors, idx, placed, frames, width, height: y + SQ_BOT };
}

function seqLabel(cx, y, text, anchor = 'middle', ret = false) {
  if (!text) return '';
  const lines = wrapTextPx(String(text), 138);
  const lh = 14.5, top = y - (lines.length - 1) * lh;
  const cw = Math.max(...lines.map(l => approxTextWidthPx(l))) + 10;
  const x0 = anchor === 'start' ? cx : cx - cw / 2;
  const out = [`<rect x="${x0}" y="${top - 11}" width="${cw}" height="${lines.length * lh + 1}" rx="2.5" fill="#FFFFFF" fill-opacity="0.92"/>`];
  lines.forEach((ln, li) => out.push(`<text x="${anchor === 'start' ? x0 + 5 : cx}" y="${top + li * lh}" text-anchor="${anchor === 'start' ? 'start' : 'middle'}" font-size="12.5" fill="${ret ? '#5B7088' : SQ_INK}">${xml(ln)}</text>`));
  return out.join('');
}

export function renderSequenceDiagramSVG(spec = {}, { lang = 'ko', title = null } = {}) {
  const L = layoutSequence(spec);
  const { actors, placed, frames, width, height } = L;
  const defs = `<defs>`
    + `<marker id="sqf" markerWidth="12" markerHeight="10" refX="9.5" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,4 L0,8 Z" fill="${SQ_MLINE}"/></marker>`
    + `<marker id="sqo" markerWidth="13" markerHeight="10" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,0 L11,4 L1,8" fill="none" stroke="${SQ_RET}" stroke-width="1.4"/></marker>`
    + `<filter id="sqsh" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.3" flood-color="#8C9BAA" flood-opacity="0.4"/></filter>`
    + `</defs>`;
  const parts = [];
  // 1. alt/opt/loop frames (behind everything)
  for (const fr of frames) {
    const x0 = seqActorX(fr.minI) - SQ_COL_W / 2 + 14;
    const x1 = seqActorX(fr.maxI) + SQ_COL_W / 2 - 14;
    const y1 = fr.y1 || fr.y0 + 24;
    parts.push(`<rect x="${x0}" y="${fr.y0}" width="${x1 - x0}" height="${y1 - fr.y0}" rx="5" fill="#F5F8FB" fill-opacity="0.5" stroke="#9DAEC0" stroke-width="1.2"/>`);
    const tab = (fr.kind.toUpperCase() + '  ' + fr.label);
    const tabW = approxTextWidthPx(tab) + 16;
    parts.push(`<path d="M${x0},${fr.y0} h${tabW} l-9,15 h-${tabW - 9} z" fill="#DCE7F1" stroke="#9DAEC0" stroke-width="1"/>`);
    parts.push(`<text x="${x0 + 8}" y="${fr.y0 + 12}" font-size="10.5" font-weight="700" fill="#3C5A75">${xml(fr.kind.toUpperCase())} <tspan font-weight="400">${xml(fr.label)}</tspan></text>`);
    for (const el of fr.elses) {
      parts.push(`<line x1="${x0}" y1="${el.y}" x2="${x1}" y2="${el.y}" stroke="#9DAEC0" stroke-width="1" stroke-dasharray="5,3"/>`);
      parts.push(`<text x="${x0 + 8}" y="${el.y - 4}" font-size="10" font-style="italic" fill="#5B7088">[${xml(el.label)}]</text>`);
    }
  }
  // 2. lifelines
  actors.forEach((a, i) => {
    const x = seqActorX(i);
    parts.push(`<line x1="${x}" y1="${SQ_TOP + SQ_HEAD_H}" x2="${x}" y2="${height - SQ_BOT + 8}" stroke="${SQ_LIFE}" stroke-width="1.2" stroke-dasharray="3,4"/>`);
  });
  // 3. messages + notes
  for (const p of placed) {
    if (p.type === 'note') {
      const x0 = seqActorX(p.lo) - SQ_HEAD_W / 2, x1 = seqActorX(p.hi) + SQ_HEAD_W / 2;
      const lines = wrapTextPx(p.text, (x1 - x0) - 18);
      const h = p.h ?? Math.max(SQ_NOTE - 10, lines.length * 15 + 12);
      parts.push(`<rect x="${x0}" y="${p.y - 4}" width="${x1 - x0}" height="${h}" rx="3" fill="#FFF6D8" stroke="#D9A400" filter="url(#sqsh)"/>`);
      lines.forEach((ln, li) => parts.push(`<text x="${(x0 + x1) / 2}" y="${p.y + 12 + li * 15}" text-anchor="middle" font-size="12.5" fill="${SQ_INK}">${xml(ln)}</text>`));
      continue;
    }
    if (p.self) {
      const x = seqActorX(p.fi);
      parts.push(`<path d="M${x},${p.y} h36 v18 h-32" fill="none" stroke="${SQ_MLINE}" stroke-width="1.5" marker-end="url(#sqf)"/>`);
      parts.push(seqLabel(x + 42, p.y + 1, p.text, 'start'));
    } else {
      const x1 = seqActorX(p.fi), x2 = seqActorX(p.ti), dir = x2 > x1 ? 1 : -1;
      parts.push(`<line x1="${x1}" y1="${p.y}" x2="${x2 - dir}" y2="${p.y}" stroke="${p.ret ? SQ_RET : SQ_MLINE}" stroke-width="1.5"${p.ret ? ' stroke-dasharray="6,3" marker-end="url(#sqo)"' : ' marker-end="url(#sqf)"'}/>`);
      parts.push(seqLabel((x1 + x2) / 2, p.y - 7, p.text, 'middle', p.ret));
    }
  }
  // 4. actor headers (top)
  actors.forEach((a, i) => {
    const x = seqActorX(i), isActor = a.kind === 'actor';
    const fill = isActor ? '#6B4FA0' : '#2E6FB0', stroke = isActor ? '#553F80' : '#24598F';
    parts.push(`<rect x="${x - SQ_HEAD_W / 2}" y="${SQ_TOP}" width="${SQ_HEAD_W}" height="${SQ_HEAD_H}" rx="7" fill="${fill}" stroke="${stroke}" filter="url(#sqsh)"/>`);
    if (isActor) {  // small stick-figure to mark a human actor
      const gx = x - SQ_HEAD_W / 2 + 12, gy = SQ_TOP + 13;
      parts.push(`<circle cx="${gx}" cy="${gy}" r="3.2" fill="none" stroke="#FFFFFF" stroke-width="1.3"/><line x1="${gx}" y1="${gy + 3}" x2="${gx}" y2="${gy + 9}" stroke="#FFFFFF" stroke-width="1.3"/><line x1="${gx - 3}" y1="${gy + 5}" x2="${gx + 3}" y2="${gy + 5}" stroke="#FFFFFF" stroke-width="1.3"/>`);
    }
    const lines = wrapTextPx(a.label, SQ_HEAD_W - 18);
    const sy = SQ_TOP + SQ_HEAD_H / 2 - (lines.length - 1) * 8 + 5;
    lines.forEach((ln, li) => parts.push(`<text x="${x}" y="${sy + li * 15}" text-anchor="middle" font-size="13" font-weight="700" fill="#FFFFFF">${xml(ln)}</text>`));
  });
  const heading = title || spec.title;
  const headingSvg = heading ? `<text x="${width / 2}" y="32" text-anchor="middle" font-size="15" font-weight="700" fill="#0A4F8C">${xml(heading)}</text>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * RENDER_SCALE)}" height="${Math.round(height * RENDER_SCALE)}" viewBox="0 0 ${width} ${height}" font-family="Arial,sans-serif" font-size="12">
${defs}
<rect width="${width}" height="${height}" fill="#FFF"/>
${headingSvg}
${parts.join('\n')}
</svg>`;
}

export function sequenceDiagramMetrics(spec = {}) {
  const L = layoutSequence(spec);
  return { width: Math.round(L.width * RENDER_SCALE), height: Math.round(L.height * RENDER_SCALE) };
}

// ──────────────────────────────────────────────────────────────
// Process map renderer (v13) — high-quality PNG replacement for the Mermaid
// macro `flowchart LR` in package-to-process. Lays a small process DAG into
// left→right layers (longest-path layering), draws numbered process cards
// with bezier connectors + arrowheads. Each card = one business process.
//
// spec: { nodes:[{ id, label, num? }], edges:[{ from, to, label? }] }
// ──────────────────────────────────────────────────────────────
const PM_NW = 200, PM_PAD_X = 36, PM_PAD_TOP = 58, PM_PAD_BOT = 30;
const PM_ARROW_GAP = 116, PM_ROW_GAP = 28, PM_LINE_H = 16;
// Boustrophedon (snake) wrap: a left→right process chain longer than
// PM_MAX_COLS columns wraps onto a second/third row instead of growing
// unbounded to the right. A very wide single-row image is downscaled hard
// by markdown viewers (→ tiny text); wrapping trades width for height so the
// rendered text stays large. Rows alternate flow direction (row 0 L→R,
// row 1 R→L, …) and connect with a vertical U-turn at the fold. Maps with
// ≤ PM_MAX_COLS columns lay out exactly as before (single row, unchanged).
const PM_MAX_COLS = 4;     // columns per row before wrapping
const PM_BAND_GAP = 64;    // vertical gap between wrapped rows (room for the fold connector)

function pmMeasure(n) {
  const lines = fcWrap(n.label, PM_NW - 56);
  return { lines, h: Math.max(56, lines.length * PM_LINE_H + 26) };
}

function layoutProcessMap(spec = {}) {
  const nodes = spec.nodes || [], edges = spec.edges || [];
  const ids = nodes.map(n => n.id);
  const preds = Object.fromEntries(ids.map(id => [id, []]));
  for (const e of edges) if (preds[e.to]) preds[e.to].push(e.from);
  // longest-path layer assignment (iterate to fixpoint — DAG assumed)
  const layer = Object.fromEntries(ids.map(id => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let moved = false;
    for (const id of ids) for (const p of preds[id]) {
      if (layer[id] < layer[p] + 1) { layer[id] = layer[p] + 1; moved = true; }
    }
    if (!moved) break;
  }
  const byLayer = {};
  for (const n of nodes) (byLayer[layer[n.id]] ||= []).push(n);
  const meas = Object.fromEntries(nodes.map(n => [n.id, pmMeasure(n)]));
  const maxLayer = Math.max(...Object.values(layer));
  const totalCols = maxLayer + 1;
  // Per-layer (column) stack height.
  const colH = {};
  for (const [lyr, ns] of Object.entries(byLayer)) {
    colH[lyr] = ns.reduce((s, n) => s + meas[n.id].h, 0) + (ns.length - 1) * PM_ROW_GAP;
  }
  // Wrap the column sequence into balanced rows (snake direction).
  const rows = Math.max(1, Math.ceil(totalCols / PM_MAX_COLS));
  const perRow = Math.ceil(totalCols / rows);
  const layerRow = {}, layerVisCol = {};
  for (let l = 0; l < totalCols; l++) {
    const r = Math.floor(l / perRow), p = l % perRow;
    const colsInRow = Math.min(perRow, totalCols - r * perRow);
    layerRow[l] = r;
    layerVisCol[l] = (r % 2 === 0) ? p : (colsInRow - 1 - p);   // odd rows flow right→left
  }
  // Row band heights + tops.
  const rowH = [], rowTop = [];
  for (let r = 0; r < rows; r++) {
    let h = 60;
    for (let l = r * perRow; l < Math.min(totalCols, (r + 1) * perRow); l++) h = Math.max(h, colH[l] || 60);
    rowH[r] = h;
  }
  let yBand = PM_PAD_TOP;
  for (let r = 0; r < rows; r++) { rowTop[r] = yBand; yBand += rowH[r] + PM_BAND_GAP; }
  // Place nodes — each column vertically centred within its row band.
  const pos = {};
  for (const [lyr, ns] of Object.entries(byLayer)) {
    const l = +lyr, r = layerRow[l];
    const x = PM_PAD_X + layerVisCol[l] * (PM_NW + PM_ARROW_GAP);
    let y = rowTop[r] + (rowH[r] - colH[l]) / 2;
    for (const n of ns) {
      const m = meas[n.id];
      pos[n.id] = { x, y, w: PM_NW, h: m.h, cy: y + m.h / 2, lines: m.lines, num: n.num, layer: l, row: r };
      y += m.h + PM_ROW_GAP;
    }
  }
  const width = PM_PAD_X * 2 + perRow * PM_NW + (perRow - 1) * PM_ARROW_GAP;
  const height = rowTop[rows - 1] + rowH[rows - 1] + PM_PAD_BOT;
  return { nodes, edges, pos, width, height };
}

export function renderProcessMapSVG(spec = {}, { lang = 'ko', title = null } = {}) {
  const L = layoutProcessMap(spec);
  const { nodes, edges, pos, width, height } = L;
  const defs = `<defs>`
    + `<marker id="pmar" markerWidth="11" markerHeight="11" refX="8.5" refY="3.2" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L9.5,3.2 L0,6.4 Z" fill="#5E7388"/></marker>`
    + `<filter id="pmsh" x="-15%" y="-25%" width="130%" height="150%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.5" flood-color="#8C9BAA" flood-opacity="0.45"/></filter>`
    + `</defs>`;
  const parts = [];
  // edges (behind) — bezier from source right to target left (or vertical within a column)
  for (const e of edges) {
    const a = pos[e.from], b = pos[e.to]; if (!a || !b) continue;
    let d;
    if (b.row === a.row + 1 && b.layer === a.layer + 1) {
      // snake fold — consecutive columns that wrapped onto the next row share
      // the turn column; drop a vertical U-turn from a's bottom into b's top.
      const cxA = a.x + a.w / 2, cxB = b.x + b.w / 2, h = PM_BAND_GAP * 0.55;
      d = `M${cxA},${a.y + a.h} C${cxA},${a.y + a.h + h} ${cxB},${b.y - h} ${cxB},${b.y - 2}`;
    } else if (b.x > a.x) {
      const x1 = a.x + a.w, x2 = b.x, mx = (x1 + x2) / 2;
      d = `M${x1},${a.cy} C${mx},${a.cy} ${mx},${b.cy} ${x2 - 2},${b.cy}`;
    } else if (a.x === b.x) {              // same column → side loop
      const x = a.x + a.w, off = 26;
      d = `M${x},${a.cy} C${x + off},${a.cy} ${x + off},${b.cy} ${x},${b.cy}`;
    } else {
      const x1 = a.x, x2 = b.x + b.w, mx = (x1 + x2) / 2;
      d = `M${x1},${a.cy} C${mx},${a.cy} ${mx},${b.cy} ${x2 + 2},${b.cy}`;
    }
    parts.push(`<path d="${d}" fill="none" stroke="#5E7388" stroke-width="1.7" marker-end="url(#pmar)"/>`);
  }
  // nodes
  for (const n of nodes) {
    const p = pos[n.id];
    parts.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="9" fill="#EAF1F8" stroke="#3E7DB3" stroke-width="1.5" filter="url(#pmsh)"/>`);
    if (p.num != null) {
      const bx = p.x + 20, by = p.y + p.h / 2;
      parts.push(`<circle cx="${bx}" cy="${by}" r="13" fill="#2E6FB0" stroke="#24598F" stroke-width="1"/>`);
      parts.push(`<text x="${bx}" y="${by + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="#FFFFFF">${xml(p.num)}</text>`);
    }
    const tx = p.x + (p.num != null ? 40 : 14), tw = p.w - (p.num != null ? 50 : 24);
    const lines = fcWrap(n.label, tw);
    const sy = p.cy - (lines.length - 1) * 8 + 4;
    lines.forEach((ln, li) => parts.push(`<text x="${tx + tw / 2}" y="${sy + li * PM_LINE_H}" text-anchor="middle" font-size="13" font-weight="600" fill="#234">${xml(ln)}</text>`));
  }
  const heading = title || spec.title;
  const headingSvg = heading ? `<text x="${width / 2}" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0A4F8C">${xml(heading)}</text>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * RENDER_SCALE)}" height="${Math.round(height * RENDER_SCALE)}" viewBox="0 0 ${width} ${height}" font-family="Arial,sans-serif" font-size="12">
${defs}
<rect width="${width}" height="${height}" fill="#FFF"/>
${headingSvg}
${parts.join('\n')}
</svg>`;
}

export function processMapMetrics(spec = {}) {
  const L = layoutProcessMap(spec);
  return { width: Math.round(L.width * RENDER_SCALE), height: Math.round(L.height * RENDER_SCALE) };
}

// ──────────────────────────────────────────────────────────────
// Multi-pane ALV (v10) — Split / Tabstrip / Sequence
//
// Many ABAP programs render two or more ALV grids on one screen:
//   · Docking + Splitter container (top + bottom)        — ZMMR1001
//   · Side-by-side grids                                 — comparison reports
//   · Tabstrip pages each carrying their own grid        — multi-aspect viewers
// A single-grid PNG can never capture the click-to-drill interaction
// readers need to understand the program. v10 introduces composite ALV
// rendering: each pane gets its own grid + title bar, panes are stacked
// with an interaction caption + ↓ arrow between them so the user-visible
// flow ("double-click row in top → bottom refreshes") is documented in
// the image itself, not buried in prose elsewhere in the spec.
//
// Schema (within ALV_IMAGE_SPEC):
//   {
//     layout: 'split-vertical' | 'split-horizontal' | 'tabstrip',
//     interaction: '상단 더블클릭 → 하단 갱신',  // caption between panes
//     panes: [
//       { title, columns, sampleRows, maxRows },             // populated pane
//       { title, columns, sampleRows: [], placeholder },     // dynamic / empty pane
//     ],
//   }
// Backward compat: when `panes` is absent the legacy single-pane shape
// `{columns, sampleRows, maxRows}` continues to work.
// ──────────────────────────────────────────────────────────────

// Strip <?xml ?> + outer <svg ...> ... </svg> wrapper so the inner
// content can be re-anchored inside a parent SVG via <g transform>.
function extractInnerSvg(svgString) {
  return svgString
    .replace(/<\?xml[^>]*\?>\s*/, '')
    .replace(/^<svg[^>]*>\s*/, '')
    .replace(/<\/svg>\s*$/, '');
}

// Per-pane visual constants — kept here so multipaneAlvMetrics() and
// renderMultipaneAlvSVG() stay in lockstep (any change to one MUST
// change the other to keep the rasterizer viewport sized correctly).
const PANE_TITLE_H   = 24;
const PANE_GAP       = 8;
const PANE_INTER_H   = 28;
const PANE_PLACE_H   = 60;
const PANE_PAD_TOP   = 10;
const PANE_PAD_BOT   = 10;
const SIDE_DIVIDER_W = 4;    // vertical bar width between left/right panes
const SIDE_CANVAS_W  = 1400; // total canvas width for split-vertical layouts

function paneIsEmpty(p) {
  return !p?.treeRows && (!Array.isArray(p?.sampleRows) || p.sampleRows.length === 0);
}
function paneInnerMetrics(p, allocW) {
  if (p?.treeRows) {
    const rowH = 22;
    return { width: allocW || 560, height: p.treeRows.length * rowH + 10 };
  }
  if (paneIsEmpty(p) && p?.placeholder) return { width: allocW || 900, height: PANE_PLACE_H };
  return alvLayoutMetrics({ columns: p?.columns || [], sampleRows: p?.sampleRows || [], maxRows: p?.maxRows });
}

// ── ALV Tree inner SVG renderer ────────────────────────────────
// Renders CL_GUI_ALV_TREE hierarchy (no outer <svg> wrapper — used
// inside a parent SVG via <g transform>).
// treeRows: [{ level: 0|1|2, label: string, expanded?: bool, selected?: bool }]
function renderAlvTreeInnerSVG({ treeRows = [], paneW = 560 } = {}) {
  const rowH = 22;
  const parts = [];
  treeRows.forEach((row, i) => {
    const lv = row.level || 0;
    const y  = i * rowH;
    const indent = 10 + lv * 16;
    const isLeaf = lv >= 2;
    const icon = isLeaf
      ? (row.selected ? '●' : '○')
      : (row.expanded === false ? '▶' : '▼');
    const textFill  = row.selected ? '#1F5AA0' : (lv === 0 ? '#0A4F8C' : '#222');
    const iconFill  = isLeaf ? (row.selected ? '#1F5AA0' : '#666') : textFill;
    const fontW     = lv === 0 ? '700' : '400';
    if (row.selected) {
      parts.push(`<rect x="0" y="${y}" width="${paneW}" height="${rowH}" fill="#D4E6F5"/>`);
    } else if (i % 2 === 1) {
      parts.push(`<rect x="0" y="${y}" width="${paneW}" height="${rowH}" fill="#F5F9FC"/>`);
    }
    parts.push(`<text x="${indent}" y="${y + 15}" font-size="11" fill="${iconFill}">${xml(icon)}</text>`);
    parts.push(`<text x="${indent + 14}" y="${y + 15}" font-size="11" fill="${textFill}" font-weight="${fontW}">${xml(row.label || '')}</text>`);
  });
  return parts.join('\n');
}

export function multipaneAlvMetrics({ panes = [], layout = 'split-horizontal', splitRatio = [40, 60] } = {}) {
  if (!panes.length) return { width: 900, height: 100 };

  // ── split-vertical: side-by-side (left | right) ────────────────
  if (layout === 'split-vertical' && panes.length === 2) {
    const totalW = SIDE_CANVAS_W;
    const leftW  = Math.round(totalW * splitRatio[0] / 100);
    const rightW = totalW - leftW - SIDE_DIVIDER_W;
    const leftM  = paneInnerMetrics(panes[0], leftW);
    const rightM = paneInnerMetrics(panes[1], rightW);
    const rightNatW = rightM.width;
    const rightScale = rightNatW > rightW ? rightW / rightNatW : 1;
    const rightRenderH = Math.ceil(rightM.height * rightScale);
    const bodyH  = Math.max(leftM.height, rightRenderH);
    const capH   = 36; // always reserve caption row
    const rawH   = PANE_PAD_TOP + PANE_TITLE_H + bodyH + capH + PANE_PAD_BOT;
    return { width: Math.round(totalW * RENDER_SCALE), height: Math.round(rawH * RENDER_SCALE) };
  }

  // ── split-horizontal (default): vertical stacking ──────────────
  let totalH = PANE_PAD_TOP;
  let totalW = 900;
  panes.forEach((p, i) => {
    const m = paneInnerMetrics(p);
    totalH += PANE_TITLE_H + m.height;
    if (i < panes.length - 1) totalH += PANE_GAP + PANE_INTER_H;
    if (m.width > totalW) totalW = m.width;
  });
  totalH += PANE_PAD_BOT;
  return { width: Math.round(totalW * RENDER_SCALE), height: Math.round(totalH * RENDER_SCALE) };
}

// ── Side-by-side renderer (split-vertical) ─────────────────────
function renderSideBySideAlvSVG({ panes = [], splitRatio = [40, 60], interaction = '', lang = 'ko' } = {}) {
  const [leftPane, rightPane] = panes;
  const totalW = SIDE_CANVAS_W;
  const leftW  = Math.round(totalW * splitRatio[0] / 100);
  const rightW = totalW - leftW - SIDE_DIVIDER_W;
  const rightX = leftW + SIDE_DIVIDER_W;

  const leftBodyM  = paneInnerMetrics(leftPane, leftW);
  const rightBodyM = paneInnerMetrics(rightPane, rightW);
  const rightNatW  = rightBodyM.width;
  const rightScale = rightNatW > rightW ? rightW / rightNatW : 1;
  const rightRenderH = Math.ceil(rightBodyM.height * rightScale);
  const bodyH  = Math.max(leftBodyM.height, rightRenderH);
  const capH   = 36;
  const totalH = PANE_PAD_TOP + PANE_TITLE_H + bodyH + capH + PANE_PAD_BOT;

  const titleY = PANE_PAD_TOP;
  const bodyY  = titleY + PANE_TITLE_H;
  const parts  = [];

  // Left title bar
  parts.push(`<rect x="0" y="${titleY}" width="${leftW}" height="${PANE_TITLE_H - 2}" fill="#E7E6E6" stroke="#888"/>`);
  parts.push(`<text x="10" y="${titleY + PANE_TITLE_H - 9}" font-weight="700" fill="#333">${xml(leftPane.title || 'Pane 1')}</text>`);
  // Left body frame
  parts.push(`<rect x="0" y="${bodyY}" width="${leftW}" height="${bodyH}" fill="#FFF" stroke="#C8D4E2"/>`);
  if (leftPane.treeRows) {
    const treeSvg = renderAlvTreeInnerSVG({ treeRows: leftPane.treeRows, paneW: leftW });
    parts.push(`<g transform="translate(0, ${bodyY + 4})">${treeSvg}</g>`);
  } else if (paneIsEmpty(leftPane) && leftPane.placeholder) {
    parts.push(`<text x="${leftW / 2}" y="${bodyY + bodyH / 2 + 4}" text-anchor="middle" fill="#888" font-style="italic">${xml(leftPane.placeholder)}</text>`);
  } else {
    const innerSvg = renderAlvLayoutSVG({ columns: leftPane.columns || [], sampleRows: leftPane.sampleRows || [], maxRows: leftPane.maxRows, lang });
    parts.push(`<g transform="translate(0, ${bodyY})">${extractInnerSvg(innerSvg)}</g>`);
  }

  // Vertical divider
  parts.push(`<rect x="${leftW}" y="${titleY}" width="${SIDE_DIVIDER_W}" height="${PANE_TITLE_H - 2 + bodyH}" fill="#5A85AE"/>`);

  // Right title bar
  parts.push(`<rect x="${rightX}" y="${titleY}" width="${rightW}" height="${PANE_TITLE_H - 2}" fill="#E7E6E6" stroke="#888"/>`);
  parts.push(`<text x="${rightX + 10}" y="${titleY + PANE_TITLE_H - 9}" font-weight="700" fill="#333">${xml(rightPane.title || 'Pane 2')}</text>`);
  // Right body frame
  parts.push(`<rect x="${rightX}" y="${bodyY}" width="${rightW}" height="${bodyH}" fill="#FFF" stroke="#C8D4E2"/>`);
  if (paneIsEmpty(rightPane) && rightPane.placeholder) {
    parts.push(`<text x="${rightX + rightW / 2}" y="${bodyY + bodyH / 2 + 4}" text-anchor="middle" fill="#888" font-style="italic">${xml(rightPane.placeholder)}</text>`);
  } else {
    const innerSvg = renderAlvLayoutSVG({ columns: rightPane.columns || [], sampleRows: rightPane.sampleRows || [], maxRows: rightPane.maxRows, lang });
    if (rightScale < 1) {
      parts.push(`<svg x="${rightX}" y="${bodyY}" width="${rightW}" height="${rightRenderH}" viewBox="0 0 ${rightNatW} ${rightBodyM.height}" preserveAspectRatio="xMinYMin meet">`);
      parts.push(extractInnerSvg(innerSvg));
      parts.push(`</svg>`);
    } else {
      parts.push(`<g transform="translate(${rightX}, ${bodyY})">${extractInnerSvg(innerSvg)}</g>`);
    }
  }

  // Interaction caption
  const caption = interaction ? `← ${xml(interaction)} →` : `← ${xml(legendFor(lang).pane_caption)} →`;
  parts.push(`<text x="${totalW / 2}" y="${bodyY + bodyH + 22}" text-anchor="middle" font-size="12" fill="#1F5AA0" font-weight="600">${caption}</text>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(totalW * RENDER_SCALE)}" height="${Math.round(totalH * RENDER_SCALE)}" viewBox="0 0 ${totalW} ${totalH}" font-family="Arial,sans-serif" font-size="12">
<rect width="${totalW}" height="${totalH}" fill="#FFF"/>
${parts.join('\n')}
</svg>`;
}

export function renderMultipaneAlvSVG({ layout = 'split-horizontal', interaction = '', panes = [], splitRatio = [40, 60], lang = 'ko' } = {}) {
  if (!panes.length) {
    return renderAlvLayoutSVG({ columns: [], sampleRows: [], lang });
  }

  // ── split-vertical: delegate to side-by-side renderer ──────────
  if (layout === 'split-vertical' && panes.length === 2) {
    return renderSideBySideAlvSVG({ panes, splitRatio, interaction, lang });
  }

  // ── split-horizontal (default): vertical stacking ──────────────
  const { width: totalW, height: totalH } = multipaneAlvMetrics({ panes, layout: 'split-horizontal' });

  let cursorY = PANE_PAD_TOP;
  const parts = [];
  panes.forEach((p, i) => {
    // Title bar (light grey + bold) — same palette as v8 grey headers.
    parts.push(`<rect x="0" y="${cursorY}" width="${totalW}" height="${PANE_TITLE_H - 2}" fill="#E7E6E6" stroke="#888"/>`);
    parts.push(`<text x="14" y="${cursorY + PANE_TITLE_H - 9}" font-weight="700" fill="#333">${xml(p.title || `Pane ${i + 1}`)}</text>`);
    cursorY += PANE_TITLE_H;

    // Pane body — actual grid OR placeholder box.
    const m = paneInnerMetrics(p);
    if (paneIsEmpty(p) && p.placeholder) {
      parts.push(`<rect x="10" y="${cursorY}" width="${totalW - 20}" height="${m.height}" fill="#FAFAFA" stroke="#C8D4E2" stroke-dasharray="4,3"/>`);
      parts.push(`<text x="${totalW / 2}" y="${cursorY + m.height / 2 + 4}" text-anchor="middle" fill="#888" font-style="italic">${xml(p.placeholder)}</text>`);
    } else {
      const innerSvg = renderAlvLayoutSVG({ columns: p.columns || [], sampleRows: p.sampleRows || [], maxRows: p.maxRows, lang });
      parts.push(`<g transform="translate(0, ${cursorY})">${extractInnerSvg(innerSvg)}</g>`);
    }
    cursorY += m.height;

    // Interaction caption + ↓ arrow between consecutive panes.
    if (i < panes.length - 1) {
      cursorY += PANE_GAP;
      const caption = interaction
        ? `↓ ${xml(interaction)}`
        : `↓`;
      parts.push(`<text x="${totalW / 2}" y="${cursorY + 18}" text-anchor="middle" font-size="12" fill="#1F5AA0" font-weight="600">${caption}</text>`);
      cursorY += PANE_INTER_H;
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(totalW * RENDER_SCALE)}" height="${Math.round(totalH * RENDER_SCALE)}" viewBox="0 0 ${totalW} ${totalH}" font-family="Arial,sans-serif" font-size="12">
<rect width="${totalW}" height="${totalH}" fill="#FFF"/>
${parts.join('\n')}
</svg>`;
}

// ──────────────────────────────────────────────────────────────
// Rasterizer — headless Edge/Chrome/Chromium
// ──────────────────────────────────────────────────────────────

function findBrowser() {
  const candidates = platform() === 'win32'
    ? [
      // Edge (modern x64 install path) — Win11 default location since 2022.
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      // Edge (legacy WOW6432 install path) — older Win10 / downgraded installs.
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      // Chrome (both bitness variants).
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ]
    : platform() === 'darwin'
      ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
      : ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge'];
  for (const p of candidates) {
    if (p.includes('/') || p.includes('\\')) {
      if (existsSync(p)) return p;
    } else {
      const r = spawnSync('which', [p]);
      if (r.status === 0 && r.stdout?.toString().trim()) return p;
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
// PNG top-left crop — used by rasterizeSvgToPng to strip the browser-
// chrome reservation that Chrome/Edge subtracts from --window-size.
// Pure zlib + Buffer, no native deps.
// ──────────────────────────────────────────────────────────────
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function pngCrc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBuf, data]);
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(pngCrc32(payload), 0);
  return Buffer.concat([lenBuf, payload, crcBuf]);
}
/**
 * Crop an 8-bit, non-interlaced PNG to its top-left (targetW × targetH).
 * All PNG filter modes (None/Sub/Up/Average/Paeth) reference only LEFT
 * and ABOVE pixels, so keeping the top-left rectangle with its original
 * filter bytes is lossless — no need to re-filter the scanlines.
 * Chrome/Edge headless screenshots are always 8-bit RGB/RGBA non-interlaced
 * so this covers every case rasterizeSvgToPng produces. Throws on unknown
 * PNG shape; caller falls back to returning the unprocessed buffer.
 */
function cropPngTopLeft(pngBuf, targetW, targetH) {
  if (!pngBuf.slice(0, 8).equals(PNG_SIG)) throw new Error('not a PNG');
  let idx = 8;
  let ihdr = null;
  const idatParts = [];
  const preChunks = [];
  while (idx < pngBuf.length) {
    const len = pngBuf.readUInt32BE(idx);
    const type = pngBuf.toString('ascii', idx + 4, idx + 8);
    const data = pngBuf.slice(idx + 8, idx + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idatParts.push(data);
    else if (type === 'IEND') break;
    else if (idatParts.length === 0) preChunks.push({ type, data });
    idx += 8 + len + 4;
  }
  if (!ihdr || idatParts.length === 0) throw new Error('invalid PNG');
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr.readUInt8(8);
  const colorType = ihdr.readUInt8(9);
  const interlace = ihdr.readUInt8(12);
  if (bitDepth !== 8 || interlace !== 0) throw new Error('unsupported PNG variant');
  const bppMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bpp = bppMap[colorType];
  if (!bpp) throw new Error('unsupported PNG color type ' + colorType);
  if (targetW >= width && targetH >= height) return pngBuf;
  const cropW = Math.min(targetW, width);
  const cropH = Math.min(targetH, height);
  const raw = inflateSync(Buffer.concat(idatParts));
  const oldRowBytes = 1 + width * bpp;
  const newRowBytes = 1 + cropW * bpp;
  const newRaw = Buffer.alloc(cropH * newRowBytes);
  for (let r = 0; r < cropH; r++) {
    newRaw[r * newRowBytes] = raw[r * oldRowBytes];
    raw.copy(newRaw, r * newRowBytes + 1, r * oldRowBytes + 1, r * oldRowBytes + 1 + cropW * bpp);
  }
  const newIdat = deflateSync(newRaw);
  const newIhdr = Buffer.from(ihdr);
  newIhdr.writeUInt32BE(cropW, 0);
  newIhdr.writeUInt32BE(cropH, 4);
  const parts = [PNG_SIG, pngChunk('IHDR', newIhdr)];
  for (const c of preChunks) parts.push(pngChunk(c.type, c.data));
  parts.push(pngChunk('IDAT', newIdat));
  parts.push(pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

// ──────────────────────────────────────────────────────────────
// Browser-chrome compensation.
//
// Even in headless mode, Chrome/Edge reserves pixels for the title bar,
// tab strip, omnibox, and scrollbar gutter, so a `--window-size=W,H`
// produces an INNER viewport of ~(W-24) × (H-92). Probed on Edge 147
// (both legacy `--headless` and `--headless=new`) — and the same
// subtraction has been present since Chrome 60+ on Windows.
//
// Result (without compensation): a 900×328 window renders the first
// 876×236 pixels of content, and the remaining 64w × 92h area of the
// screenshot is painted with body background (white). Users reported it
// as "image cut off halfway with blank below".
//
// Fix: pad the window by (W_SLACK, H_SLACK) — both generous (~1.5× the
// observed miss) to absorb version drift — then crop the resulting PNG
// back to exactly the requested W × H. The chrome-reserved area is
// outside the crop box, so users see a pixel-perfect target-size PNG.
// ──────────────────────────────────────────────────────────────
const CHROME_W_SLACK = 40;
const CHROME_H_SLACK = 140;

export async function rasterizeSvgToPng(svg, { width, height } = {}) {
  const browser = findBrowser();
  if (!browser) return null;
  const dir = mkdtempSync(join(tmpdir(), 'sc4sap-svg-'));
  try {
    const htmlPath = join(dir, 'in.html');
    const pngPath = join(dir, 'out.png');
    // INLINE the SVG into the HTML body (rather than <img src="in.svg">)
    // so the browser paints it synchronously with the initial parse. This
    // eliminates a load-vs-paint race that could also clip the output.
    const svgInline = String(svg).replace(/^<\?xml[^?]*\?>\s*/, '');
    writeFileSync(
      htmlPath,
      `<!doctype html><html><head><meta charset="utf-8">`
        + `<style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style>`
        + `</head><body>${svgInline}</body></html>`,
      'utf8',
    );
    const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
    const winW = width + CHROME_W_SLACK;
    const winH = height + CHROME_H_SLACK;
    // Async spawn — allows the caller to Promise.all() multiple rasterize jobs
    // in parallel (selection + ALV) so two headless browsers run concurrently.
    await new Promise((resolve, reject) => {
      const child = spawn(browser, [
        '--headless', '--disable-gpu', '--hide-scrollbars',
        // Pin DPR=1 so --window-size pixels map 1:1 to the screenshot
        // regardless of the host's Windows display scaling (125 % / 150 %).
        '--force-device-scale-factor=1',
        '--default-background-color=FFFFFFFF',
        `--screenshot=${pngPath}`,
        `--window-size=${winW},${winH}`,
        fileUrl,
      ], { windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
        reject(new Error('headless browser timeout (30s)'));
      }, 30000);
      child.once('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`headless browser exited with code ${code}`));
      });
      child.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    if (!existsSync(pngPath)) return null;
    const padded = readFileSync(pngPath);
    // Crop off the chrome-slack padding so callers get an exact W × H PNG.
    try {
      return cropPngTopLeft(padded, width, height);
    } catch {
      // On any unexpected PNG shape, fall back to the padded buffer rather
      // than losing the render entirely — oversized but visually complete.
      return padded;
    }
  } catch {
    return null;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/**
 * Convenience — render screens and optional process flow chart from a spec dict.
 * spec: { selection: { fields, optionFields, ... }, alv: { columns, sampleRows, maxRows? },
 *         processFlow?: string[], lang? }
 * Returns { selection: { pngBuffer, width, height } | null,
 *           alv: { ... } | null,
 *           processFlow: { ... } | null }.
 * Null values signal the caller to fall back to cell-border wireframes.
 *
 * `lang` is forwarded to all sub-renderers so the auto-derived legends
 * come out in the spec's language. When absent it defaults to 'ko' inside
 * the renderers, preserving backward-compatible behaviour.
 */
export async function renderScreenImages({ selection, alv, processFlow, lang = 'ko' } = {}) {
  const out = { selection: null, alv: null, processFlow: null };
  // PARALLEL RENDERING — selection + ALV + processFlow rasterize concurrently.
  // Each rasterizeSvgToPng() spawns its own headless browser process, so
  // Promise.all() cuts wall-clock time roughly in half. Each task is
  // self-contained: a rasterize failure or timeout in one does not affect
  // the other — the output of the failed branch simply stays null and the
  // caller falls back to the cell-border wireframe for that section only.
  const tasks = [];
  if (selection) {
    tasks.push((async () => {
      try {
        const svg = renderSelectionScreenSVG({ ...selection, lang });
        // Use the shared metrics helper so we stay in lockstep with the
        // renderer's actual layout — avoids the bug where a longer label
        // widened the SVG but the viewport stayed at 900 and cropped it.
        const { width, height } = selectionScreenMetrics(selection);
        const png = await rasterizeSvgToPng(svg, { width, height });
        if (png) out.selection = { pngBuffer: png, width, height };
      } catch { /* keep selection null → wireframe fallback */ }
    })());
  }
  if (alv) {
    tasks.push((async () => {
      try {
        // v10: when `panes` is supplied we route to the multipane composer
        // (Split-ALV / Tabstrip / Sequence). Otherwise the legacy single-grid
        // path renders unchanged. The shape detection happens here, not at
        // the driver level, so existing per-spec drivers keep working as-is.
        const isMultipane = Array.isArray(alv.panes) && alv.panes.length > 0;
        const svg = isMultipane
          ? renderMultipaneAlvSVG({ ...alv, lang })
          : renderAlvLayoutSVG({ ...alv, lang });
        const { width, height } = isMultipane
          ? multipaneAlvMetrics({ ...alv })
          : alvLayoutMetrics(alv);
        const png = await rasterizeSvgToPng(svg, { width, height });
        if (png) out.alv = { pngBuffer: png, width, height };
      } catch { /* keep alv null → wireframe fallback */ }
    })());
  }
  // processFlow accepts TWO shapes:
  //   · string[]          → legacy linear horizontal flow (back-compat)
  //   · { nodes, edges }  → v12 branching flowchart (Mermaid-style TD), the
  //                         richer form that mirrors the Markdown spec's flow
  //                         with decisions / exception side-paths / loop-backs.
  const isGraph = processFlow && !Array.isArray(processFlow) && Array.isArray(processFlow.nodes);
  if (isGraph || (Array.isArray(processFlow) && processFlow.length > 0)) {
    tasks.push((async () => {
      try {
        const svg = isGraph
          ? renderFlowchartSVG(processFlow, { lang })
          // xlsx embed path → horizontal orientation (user mandate 2026-05-24:
          // 가로 레이아웃 강제, 가시성 우선) for the legacy linear form.
          : renderProcessFlowSVG(processFlow, { lang, orientation: 'horizontal' });
        const { width, height } = isGraph
          ? flowchartMetrics(processFlow)
          : processFlowMetrics(processFlow, { orientation: 'horizontal' });
        const png = await rasterizeSvgToPng(svg, { width, height });
        if (png) out.processFlow = { pngBuffer: png, width, height };
      } catch { /* keep processFlow null → text fallback */ }
    })());
  }
  await Promise.all(tasks);
  return out;
}

/**
 * Draws a manual screen of `kind: "excel"` as an Excel worksheet — title bar,
 * formula bar, column letters, row numbers, note / header / data rows and the
 * sheet tab — for steps the user performs inside an upload template, where an
 * SAP-styled grid would show the wrong application.
 *
 *   { kind: 'excel', file, sheet?, note?, headerRow?, activeCell?, emptyRows?,
 *     columns: [{ name, header, width?, align?, headerFill?, headerColor? }],
 *     sampleRows: [{ [name]: value }] }
 *
 * `note` is the text of cell A1 (the header row then defaults to 2); data rows
 * follow the header row. Anchors: `title`, `note`, `col:<name>` (header cell),
 * `row:<n>` (row number) and `sheet` (tab) — same <g data-anchor> contract as
 * spec/screen-image-renderer.mjs.
 */

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const anchored = (key, inner) => `<g data-anchor="${xml(key)}">${inner}</g>`;
const arr = (v) => (Array.isArray(v) ? v : []);

// Wide (CJK) glyphs take about twice the width of Latin ones at the same size.
const textPx = (s, size = 12) => [...String(s ?? '')].reduce((w, ch) => w + (/[ᄀ-ￜ]/.test(ch) ? size : size * 0.58), 0);
function fit(s, maxPx, size = 12) {
  const str = String(s ?? '');
  if (textPx(str, size) <= maxPx) return str;
  let out = '';
  for (const ch of str) { if (textPx(out + ch + '…', size) > maxPx) break; out += ch; }
  return out + '…';
}
const colLetter = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const isNumber = (v) => /^-?[\d.,]+$/.test(String(v ?? '').trim());

const C = {
  brand: '#217346', grid: '#D4D4D4', head: '#F3F3F3', headLine: '#BDBDBD', headText: '#444444',
  bar: '#FFFFFF', barLine: '#C8C8C8', text: '#000000', active: '#217346', noteText: '#ED7D31', headerFill: '#D9E1F2',
};

export function renderExcelSheetSVG(spec = {}) {
  const cols = arr(spec.columns);
  const rows = arr(spec.sampleRows);
  const note = spec.note ? String(spec.note) : '';
  const headerRow = Number(spec.headerRow) || (note ? 2 : 1);
  const emptyRows = Number.isInteger(spec.emptyRows) ? spec.emptyRows : 2;
  const rowNumW = 40, rowH = 22, letterH = 20, titleH = 30, fxH = 30, tabH = 28;
  const colW = cols.map(c => Math.max(Number(c.width) || 90, Math.ceil(textPx(c.header || c.name, 12) * 1.08) + 14));
  const colX = []; colW.reduce((x, w, i) => (colX[i] = x, x + w), rowNumW);
  const gridW = rowNumW + colW.reduce((a, b) => a + b, 0);
  const W = Math.max(640, gridW + 20);
  const lastRow = headerRow + rows.length + emptyRows;
  const gridTop = titleH + fxH + 6;
  const bodyTop = gridTop + letterH;
  const H = bodyTop + lastRow * rowH + tabH + 8;
  const rowY = (r) => bodyTop + (r - 1) * rowH;
  const font = 'font-family="Calibri,Arial,sans-serif" font-size="12"';
  const out = [];

  // Title bar
  const title = `${spec.file || 'Book1.xlsx'} - Excel`;
  out.push(anchored('title', `<rect x="0" y="0" width="${W}" height="${titleH}" fill="${C.brand}"/>`
    + `<rect x="12" y="8" width="14" height="14" rx="2" fill="#FFFFFF"/><text x="19" y="19" text-anchor="middle" font-family="Arial" font-size="10" font-weight="700" fill="${C.brand}">X</text>`
    + `<text x="${W / 2}" y="20" text-anchor="middle" ${font} fill="#FFFFFF">${xml(fit(title, W - 80))}</text>`));

  // Formula bar: name box + fx + content of the active cell
  const active = String(spec.activeCell || `A${headerRow + 1}`).toUpperCase();
  const m = /^([A-Z]+)(\d+)$/.exec(active);
  const aCol = m ? [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : 0;
  const aRow = m ? Number(m[2]) : headerRow + 1;
  const cellValue = (r, ci) => {
    if (ci < 0 || ci >= cols.length) return '';
    if (r === headerRow) return cols[ci].header || cols[ci].name;
    if (r === 1 && note && ci === 0) return note;
    const row = rows[r - headerRow - 1];
    return row ? row[cols[ci].name] ?? '' : '';
  };
  out.push(`<rect x="0" y="${titleH}" width="${W}" height="${fxH}" fill="${C.bar}" stroke="${C.barLine}"/>`
    + `<rect x="8" y="${titleH + 5}" width="72" height="20" fill="#FFFFFF" stroke="${C.barLine}"/><text x="14" y="${titleH + 19}" ${font}>${xml(active)}</text>`
    + `<text x="98" y="${titleH + 19}" font-family="Times New Roman,serif" font-style="italic" font-size="13" fill="#666">fx</text>`
    + `<rect x="120" y="${titleH + 5}" width="${W - 128}" height="20" fill="#FFFFFF" stroke="${C.barLine}"/>`
    + `<text x="126" y="${titleH + 19}" ${font}>${xml(fit(cellValue(aRow, aCol), W - 140))}</text>`);

  // Column letters and row numbers
  out.push(`<rect x="0" y="${gridTop}" width="${gridW}" height="${letterH}" fill="${C.head}" stroke="${C.headLine}"/>`);
  cols.forEach((c, i) => {
    const on = i === aCol;
    out.push(`<rect x="${colX[i]}" y="${gridTop}" width="${colW[i]}" height="${letterH}" fill="${on ? '#D2D2D2' : C.head}" stroke="${C.headLine}"/>`
      + `<text x="${colX[i] + colW[i] / 2}" y="${gridTop + 14}" text-anchor="middle" ${font} fill="${C.headText}">${colLetter(i)}</text>`);
  });
  for (let r = 1; r <= lastRow; r++) {
    const y = rowY(r);
    out.push(anchored(`row:${r}`, `<rect x="0" y="${y}" width="${rowNumW}" height="${rowH}" fill="${r === aRow ? '#D2D2D2' : C.head}" stroke="${C.headLine}"/>`
      + `<text x="${rowNumW / 2}" y="${y + 15}" text-anchor="middle" ${font} fill="${C.headText}">${r}</text>`));
  }

  // Cells
  for (let r = 1; r <= lastRow; r++) {
    const y = rowY(r);
    cols.forEach((c, i) => {
      const x = colX[i], w = colW[i];
      const isHead = r === headerRow;
      const fill = isHead ? (c.headerFill || C.headerFill) : '#FFFFFF';
      let cell = `<rect x="${x}" y="${y}" width="${w}" height="${rowH}" fill="${fill}" stroke="${isHead ? '#8C8C8C' : C.grid}"/>`;
      if (r === 1 && note && i === 0) return; // the note overflows into the next cells, drawn below
      const v = cellValue(r, i);
      if (v !== '') {
        const right = !isHead && (c.align === 'end' || (c.align !== 'left' && isNumber(v)));
        const tx = right ? x + w - 5 : x + 5;
        cell += `<text x="${tx}" y="${y + 15}"${right ? ' text-anchor="end"' : ''} ${font}${isHead ? ` font-weight="700" fill="${c.headerColor || C.text}"` : ''}>${xml(fit(v, w - 10))}</text>`;
      }
      out.push(isHead ? anchored(`col:${c.name}`, cell) : cell);
    });
  }
  if (note && cols.length) {
    const y = rowY(1);
    const noteW = Math.min(gridW - rowNumW, Math.max(colW[0], Math.ceil(textPx(note) * 1.08) + 12));
    out.push(anchored('note', `<rect x="${rowNumW}" y="${y}" width="${noteW}" height="${rowH}" fill="#FFFFFF" stroke="${C.grid}"/>`
      + `<text x="${rowNumW + 5}" y="${y + 15}" ${font} font-weight="700" fill="${spec.noteColor || C.noteText}">${xml(fit(note, noteW - 10))}</text>`));
  }

  // Active cell frame
  if (aCol < cols.length && aRow <= lastRow) {
    out.push(`<rect x="${colX[aCol]}" y="${rowY(aRow)}" width="${colW[aCol]}" height="${rowH}" fill="none" stroke="${C.active}" stroke-width="2"/>`
      + `<rect x="${colX[aCol] + colW[aCol] - 3}" y="${rowY(aRow) + rowH - 3}" width="6" height="6" fill="${C.active}" stroke="#FFFFFF"/>`);
  }

  // Sheet tab bar
  const tabY = rowY(lastRow + 1) + 4;
  const sheet = spec.sheet || 'Sheet1';
  const tabW = Math.ceil(textPx(sheet)) + 28;
  out.push(`<rect x="0" y="${tabY}" width="${W}" height="${tabH}" fill="${C.head}" stroke="${C.headLine}"/>`
    + `<text x="12" y="${tabY + 18}" ${font} fill="#999">◀ ▶</text>`
    + anchored('sheet', `<rect x="56" y="${tabY}" width="${tabW}" height="${tabH - 2}" fill="#FFFFFF" stroke="${C.headLine}"/>`
      + `<rect x="56" y="${tabY + tabH - 5}" width="${tabW}" height="3" fill="${C.brand}"/>`
      + `<text x="${56 + tabW / 2}" y="${tabY + 17}" text-anchor="middle" ${font} font-weight="700" fill="${C.brand}">${xml(sheet)}</text>`)
    + `<text x="${56 + tabW + 14}" y="${tabY + 19}" font-family="Arial" font-size="16" fill="#777">⊕</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="#FFFFFF"/>${out.join('')}</svg>`;
}

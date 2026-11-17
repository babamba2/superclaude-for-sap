// Shared by the form renderers: advance widths of the PDF standard sans fonts (Helvetica / Helvetica-Bold,
// metric-compatible with Arial), 1/1000 em, for text measuring without a browser (line breaks, right and
// centre alignment). ADS writes Arial text as the standard 14 fonts Helvetica / Helvetica-Bold, whose
// widths are the published AFM metrics below. Characters outside the table count as an 'n'.
//
//   textWidthMm(text, pt, { bold, face }) → width in mm (face Courier*: monospaced 600 / 1000 em)
//   charWidth(ch, bold)               → 1/1000 em
//   VMETRICS                          → vertical metrics in em (Arial OS/2 typo ascent / descent / gap, hhea line)

const ASCII = {
  // code 32 … 126
  regular: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
  bold: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
};

// Latin-1 160 … 255
const LATIN1 = {
  regular: [278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
    400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
    667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
    722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
    556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500],
  bold: [278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
    400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
    722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
    722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
    556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
    611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556],
};

// typographic punctuation and a few signs (Unicode → [regular, bold])
const EXTRA = {
  '€': [556, 556], '‚': [222, 278], 'ƒ': [556, 556], '„': [333, 500], '…': [1000, 1000],
  '†': [556, 556], '‡': [556, 556], 'ˆ': [333, 333], '‰': [1000, 1000], 'Š': [667, 667],
  '‹': [333, 333], 'Œ': [1000, 1000], 'Ž': [611, 611], '‘': [222, 278], '’': [222, 278],
  '“': [333, 500], '”': [333, 500], '•': [350, 350], '–': [556, 556], '—': [1000, 1000],
  '˜': [333, 333], '™': [1000, 1000], 'š': [500, 556], '›': [333, 333], 'œ': [944, 944],
  'ž': [500, 500], 'Ÿ': [667, 667], ' ': [278, 278],
};

export function charWidth(ch, bold = false) {
  const c = ch.codePointAt(0);
  const k = bold ? 'bold' : 'regular';
  if (c >= 32 && c <= 126) return ASCII[k][c - 32];
  if (c >= 160 && c <= 255) return LATIN1[k][c - 160];
  const e = EXTRA[ch];
  if (e) return e[bold ? 1 : 0];
  if (c >= 0x1100) return 1000; // CJK and other wide scripts: one em
  return ASCII[k]['n'.charCodeAt(0) - 32];
}

export function textWidthMm(text, pt, { bold = false, face = '' } = {}) {
  let w = 0;
  // Courier / Courier New: every character 600 / 1000 em
  if (/courier/i.test(String(face))) { for (const ch of String(text)) w += ch.codePointAt(0) >= 0x1100 ? 1000 : 600; return (w / 1000) * pt * (25.4 / 72); }
  for (const ch of String(text)) w += charWidth(ch, bold);
  return (w / 1000) * pt * (25.4 / 72);
}

/** Vertical metrics in em: typo ascent / descent / line gap (Arial OS/2), the hhea line (ascent + descent + gap) and
 *  the line pitch ADS uses for draws / rich text / captions of XFA 2.4+ templates (measured on its PDFs). */
export const VMETRICS = { ascent: 0.728, descent: 0.21, gap: 0.15, line: 1.15, richLine: 1.1376 };

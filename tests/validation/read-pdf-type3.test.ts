import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { readPdf } from '../../scripts/smartform/read-pdf.mjs';

// A Type3 font the way Chrome writes a synthesized fallback font: glyph widths in 1/2048 em (FontMatrix), not 1/1000.
const PT = 25.4 / 72;
function type3Pdf(matrix: string, width: number): Buffer {
  const content = 'BT /T1 10 Tf 100 700 Td (AB) Tj ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /MediaBox [0 0 595 842] /Parent 2 0 R /Resources << /Font << /T1 4 0 R >> >> /Contents 5 0 R >>',
    `<< /Type /Font /Subtype /Type3 /FontMatrix ${matrix} /FontBBox [0 0 1 1] /CharProcs << >> /FirstChar 65 /LastChar 66 /Widths [${width} ${width}] /Encoding << /Type /Encoding /Differences [65 /A /B] >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  objs.forEach((o, i) => { pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  pdf += 'trailer\n<< /Root 1 0 R >>\n%%EOF\n';
  return Buffer.from(pdf, 'latin1');
}

describe('read-pdf: Type3 widths', () => {
  it('scales Widths by the FontMatrix (1/2048 em): 1024 units = half an em', () => {
    const { page } = readPdf(type3Pdf('[0.00048828125 0 0 -0.00048828125 0 0]', 1024));
    const w = page.runs[0].w;
    expect(w).toBeCloseTo(2 * 0.5 * 10 * PT, 2);
    expect(page.runs[0].wEst).toBeUndefined();
  });
  it('keeps the 1/1000 rule for a 0.001 matrix', () => {
    const { page } = readPdf(type3Pdf('[0.001 0 0 0.001 0 0]', 500));
    expect(page.runs[0].w).toBeCloseTo(2 * 0.5 * 10 * PT, 2);
  });
});

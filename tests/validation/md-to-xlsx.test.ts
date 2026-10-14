import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { mdToXlsx, parseMd } from '../../scripts/spec/md-to-xlsx.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { unzipEntries } from '../../scripts/spec/xlsx-zip.mjs';

// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const MD = `# 프로그램 비교: ZA vs ZB

- **프로그램**: ZA · ZB
- **결과**: 상이 1 · 동일 1

## 1. 요약

두 프로그램 모두 입고 내역을 조회합니다.

> [!WARNING]
> ZA는 전기합니다.

## 2. 매트릭스

| # | 차원 | ZA | ZB | 판정 |
|---|---|---|---|---|
| 1 | 모듈 | MM <span class="ev">BAPI_GOODSMVT_CREATE (L10)</span> | CO | ⚠️ 상이 |
| 2 | 범위 | 전체 | 전체 | ✅ 동일 |

| 필드 | ZA | ZB |
|---|---|---|
| S_MATNR | ● | ○ |

\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

## 3. 화면

<!-- layout: side-by-side -->
![ZA 화면](a.png)

![ZB 화면](b.png)

![단독](missing.png)
`;

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'md-to-xlsx-'));
  writeFileSync(join(dir, 'a.png'), PNG);
  writeFileSync(join(dir, 'b.png'), PNG);
  try {
    const res = mdToXlsx(MD, { baseDir: dir, lang: 'ko' });
    const files = new Map(unzipEntries(res.buffer).map((e: { name: string; data: Buffer }) => [e.name, e.data.toString('utf8')]));
    return { res, files };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('md-to-xlsx', () => {
  it('reads the title, the fact list and one section per ## heading', () => {
    const doc = parseMd(MD);
    expect(doc.title).toBe('프로그램 비교: ZA vs ZB');
    expect(doc.facts).toEqual([['프로그램', 'ZA · ZB'], ['결과', '상이 1 · 동일 1']]);
    expect(doc.sections.map((s: { title: string }) => s.title)).toEqual(['1. 요약', '2. 매트릭스', '3. 화면']);
  });

  it('builds an overview sheet plus one sheet per section, in order', () => {
    const { res, files } = build();
    expect(res.sheets).toEqual(['개요', '1. 요약', '2. 매트릭스', '3. 화면']);
    expect(files.get('xl/workbook.xml')).toContain('<sheet name="개요" sheetId="1" r:id="rId1"/>');
    expect(files.has('[Content_Types].xml')).toBe(true);
  });

  it('styles verdict and presence cells and keeps evidence as a grey second run', () => {
    const { files } = build();
    const sheet = files.get('xl/worksheets/sheet3.xml')!;
    expect(sheet).toMatch(/<c r="E\d+" s="12" t="inlineStr"><is><t xml:space="preserve">⚠️ 상이<\/t>/); // vDiv
    expect(sheet).toMatch(/<c r="E\d+" s="10" t="inlineStr"><is><t xml:space="preserve">✅ 동일<\/t>/); // vSame
    expect(sheet).toMatch(/s="14" t="inlineStr"><is><t xml:space="preserve">●/);
    expect(sheet).toMatch(/s="15" t="inlineStr"><is><t xml:space="preserve">○/);
    expect(sheet).toContain('<r><t xml:space="preserve">MM</t></r><r><rPr><sz val="8"/>');
    expect(sheet).toContain('(BAPI_GOODSMVT_CREATE (L10))');
    expect(sheet).toContain('HTML 문서에서 확인하세요');
  });

  it('embeds side-by-side images in one row and reports missing images', () => {
    const { res, files } = build();
    expect(res.images).toBe(2);
    expect(res.missing).toEqual(['missing.png']);
    const drawing = [...files.entries()].find(([n]) => /xl\/drawings\/drawing\d+\.xml$/.test(n))![1];
    const anchors = [...drawing.matchAll(/<xdr:col>(\d+)<\/xdr:col><xdr:colOff>0<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row>/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(anchors).toHaveLength(2);
    expect(anchors[0][1]).toBe(anchors[1][1]);
    expect(anchors[1][0]).toBeGreaterThan(anchors[0][0]);
    expect(files.has('xl/media/image1.png')).toBe(true);
  });
});

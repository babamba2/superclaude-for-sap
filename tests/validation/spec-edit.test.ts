import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { Script } from 'vm';
// @ts-expect-error — plain .mjs script, no type declarations
import { mdToHtml } from '../../scripts/spec/md-to-html.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { htmlToMd, parseHtml } from '../../scripts/spec/html-to-md.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { SPEC_EDITOR_SCRIPT, specEditorLabels } from '../../scripts/spec/spec-editor.mjs';
import {
  buildSpecHtml, importEditedSpec, nextVersion, recordVersion, parseSpecName,
  // @ts-expect-error — plain .mjs script, no type declarations
} from '../../scripts/spec/spec-version.mjs';

const MD_TO_HTML = join(__dirname, '..', '..', 'scripts', 'spec', 'md-to-html.mjs');

/** Every construct md-to-html emits, written the way html-to-md writes it back. */
const SPEC = `---
lang: ko
owner: Team A
---
# Specification: ZDEMO01 — 데모 리포트

- **Type**: Report (ALV 0100) · **Transaction**: ZD01
- **Package**: ZPKG
- **Purpose**: 미결 오더를 조회합니다.

> [!NOTE]
> 줄 번호(L)는 include별로 적습니다.

## 1. 업무 맥락

1. **사용자.** 영업관리자가 사용합니다.
2. **계산 항목.** 품목마다 다음을 구합니다.
   - 미결수량 = 인콰이어리 수량 − 판매오더 수량
   - 창고 ATP. ZWH* 유형만 고려합니다.
3. **후속 문서.** §2 와 §3.1 을 봅니다.

> [!WARNING]
> No AUTHORITY-CHECK before \`BAPI_SALESORDER_CHANGE\` (L120).

| 유형 (P_AUART) | 허용 | 비고 |
|---|:---:|---:|
| ZWH1 / ZWH2 | ZINS만 | MR_AUART_WITH_ATP |
| ZDF1 | ZIN2만 \\| 예외 | \`A\\|B\` 코드 |

## 2. 데이터 모델

DB 직접 쓰기는 없습니다. 모든 문서는 \`BAPI_TRANSACTION_COMMIT WAIT='X'\`로 커밋합니다.

| Table | 접근 | 목적 |
|---|---|---|
| **VBAK / VBAP** | 읽기 | 판매오더 헤더와 품목 |
| ZSDT0001 | 쓰기 | 로그 테이블 |

## 3. 입력 및 화면

### 3.1 선택화면

![선택화면 (ZDEMO01 selection screen)](_assets/ZDEMO01-ko/selection.png)

- **AT SELECTION-SCREEN**: 판매조직 권한을 확인합니다. <span class="tech">(Z 46–47, C 1795)</span>
- 기본값은 *오늘* −1개월이며, ~~구버전~~ 값은 무시합니다. [SAP Help](https://help.sap.com "SAP") 와 <https://example.com> 참고.
- 5 < 6 이고 A&B, H<sub>2</sub>O, &nbsp;공백, \\*강조 아님\\* 은 별표.

## 4. 주요 로직

### 4.1 화면 흐름

\`\`\`mermaid
flowchart LR
  S[선택화면] --> M[0100 ALV]
\`\`\`

<details>
<summary>원본 소스</summary>

\`\`\`abap
WRITE 'x'.
\`\`\`

</details>

---

## 9. 메서드
<!-- audience: technical -->

| 메서드 | 목적 |
|---|---|
| GET_DATA | VBAK 조회 |

### 9.1 내부
<!-- audience: technical -->

LCL_DATA 정의 C 11–199.

> 일반 인용입니다.
`;

const norm = (s: string) => s.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

/** Changes the page as the edit mode would: replace `from` with `to` and mark the top-level block holding it. */
function edit(html: string, from: string, to: string, markOnly = false): string {
  const at = html.indexOf(from);
  expect(at, `"${from}" in the page`).toBeGreaterThan(0);
  const b = html.lastIndexOf(' data-b="', at);
  const tag = /^ data-b="[^"]*"/.exec(html.slice(b))![0];
  const marked = `${html.slice(0, b)}${tag} data-edited=""${html.slice(b + tag.length)}`;
  return markOnly ? marked : marked.replace(from, to);
}

describe('comparison page round trip (compare-programs)', () => {
  const CMP = `# Compare ZA vs ZB

- **Programs**: ZA · ZB

## 1. Matrix

| # | Dimension | ZA | ZB | Verdict |
|---|---|---|---|---|
| 1 | Module | SD | SD | ✅ Same |
| 2 | Logic | qty <span class="ev">COLLECT menge (F01 L120)</span> | value | ⚠️ Divergent |

| Field | ZA | ZB |
|---|---|---|
| KUNNR | ● | ○ |

## 2. Screens

<!-- layout: side-by-side -->
![ZA selection](a.png)

![ZB selection](b.png)
`;
  const page: string = mdToHtml(CMP, { editable: true, version: '1.0', object: 'ZA__vs__ZB' });

  it('keeps the source byte for byte when nothing was edited', () => {
    expect(page).toContain('class="fig-row"');
    const res = htmlToMd(page);
    expect(res.md).toBe(CMP);
    expect(res.missing).toEqual([]);
  });

  it('rewrites only an edited verdict table, keeping the directive and the figures', () => {
    const res = htmlToMd(edit(page, 'qty', 'quantity'));
    expect(res.md).toBe(CMP.replace('| qty <span', '| quantity <span'));
    expect(res.changed).toHaveLength(1);
  });

  it('finds figures inside the side-by-side row', () => {
    const res = htmlToMd(edit(page, '>ZB selection</span>', '>ZB screen</span>'));
    expect(res.md).toContain('![ZB screen](b.png)');
    expect(res.md).toContain('<!-- layout: side-by-side -->\n![ZA selection](a.png)');
  });
});

describe('spec HTML ↔ Markdown round trip', () => {
  const html: string = mdToHtml(SPEC, { editable: true, version: '1.0', object: 'ZDEMO01' });

  it('reproduces the source byte for byte when nothing was edited', () => {
    const res = htmlToMd(html);
    expect(res.md).toBe(SPEC);
    expect(res.changed).toEqual([]);
    expect(res.missing).toEqual([]);
  });

  it('converts every construct back without the source map (whitespace-normalized)', () => {
    const res = htmlToMd(html, { plain: true });
    expect(norm(res.md)).toEqual(norm(SPEC));
  });

  it('keeps CRLF sources line for line', () => {
    const crlf = SPEC.replace(/\n/g, '\r\n');
    expect(htmlToMd(mdToHtml(crlf, { editable: true })).md).toBe(SPEC);
  });

  it('drops what the page generated: links, anchors, chips, contents, version row, revision history', () => {
    const page: string = mdToHtml(SPEC, { editable: true, version: '1.3', history: [{ version: '1.3', date: '2026-10-12', author: 'A', note: 'n' }] });
    expect(page).toContain('class="xref"');
    expect(page).toContain('id="rev-table"');
    expect(page).toContain('<span data-ver="">v1.3</span>');
    const md: string = htmlToMd(page, { plain: true }).md;
    expect(md).not.toMatch(/xref|ref-target|rev-table|v1\.3|Revision|개정 이력/);
    expect(norm(md)).toEqual(norm(SPEC));
  });

  it('reads a browser-serialized page (entities, attribute order, closed tags)', () => {
    const page = html.replace(/ > /g, ' &gt; ').replace(/<br>/g, '<br>');
    expect(htmlToMd(page).md).toBe(SPEC);
    const doc = parseHtml('<p title="a &amp; b">x &lt;y&gt; &#x41;&#66;&nbsp;</p>');
    expect(doc.children[0].attrs.title).toBe('a & b');
    expect(doc.children[0].children[0].text).toBe('x <y> AB ');
  });

});

describe('importing an edited page', () => {
  it('rewrites only the edited blocks', () => {
    const html: string = mdToHtml(SPEC, { editable: true, version: '1.0' });
    let page = html.replace('<span data-f="">로그 테이블</span></td></tr>',
      '<span data-f="">로그 테이블</span></td></tr>\n<tr><td><span data-f="">ZNEW</span></td><td><span data-f="">읽기</span></td><td><span data-f="">새 행</span></td></tr>');
    page = edit(page, '<span data-f="">로그 테이블</span>', '<span data-f="">감사 로그 <strong>테이블</strong> | 보관</span>');
    page = edit(page, '<span data-f="">DB 직접 쓰기는 없습니다.', '<span data-f="">DB 쓰기는 <em>없습니다</em>.');
    page = edit(page, /<li><span data-f="">5 &lt; 6[\s\S]*?<\/li>/.exec(page)![0], '');
    page = edit(page, '<dd><span data-f="">ZPKG</span></dd>', '<dd><span data-f="">ZPKG_NEW</span></dd>');
    page = page.replace('<div data-fi="1">', '<div data-fi="1" data-edited="">');

    const res = htmlToMd(page);
    const before = SPEC.split('\n');
    const after: string[] = res.md.split('\n');
    const removed = before.filter((l) => !after.includes(l));
    const added = after.filter((l) => !before.includes(l));
    expect(removed).toEqual([
      '- **Package**: ZPKG',
      'DB 직접 쓰기는 없습니다. 모든 문서는 `BAPI_TRANSACTION_COMMIT WAIT=\'X\'`로 커밋합니다.',
      '| ZSDT0001 | 쓰기 | 로그 테이블 |',
      '- 5 < 6 이고 A&B, H<sub>2</sub>O, &nbsp;공백, \\*강조 아님\\* 은 별표.',
    ]);
    expect(added).toEqual([
      '- **Package**: ZPKG_NEW',
      'DB 쓰기는 *없습니다*. 모든 문서는 `BAPI_TRANSACTION_COMMIT WAIT=\'X\'`로 커밋합니다.',
      '| ZSDT0001 | 쓰기 | 감사 로그 **테이블** \\| 보관 |',
      '| ZNEW | 읽기 | 새 행 |',
    ]);
    expect(res.changed).toEqual(expect.arrayContaining(['facts']));
    // The rest of the fact list and the untouched table rows keep their exact source lines.
    expect(res.md).toContain('- **Type**: Report (ALV 0100) · **Transaction**: ZD01\n- **Package**: ZPKG_NEW\n- **Purpose**');
    expect(res.md).toContain('| Table | 접근 | 목적 |\n|---|---|---|\n| **VBAK / VBAP** | 읽기 | 판매오더 헤더와 품목 |');
  });

  it('turns a replaced image into a file next to the original', () => {
    const html: string = mdToHtml(SPEC, { editable: true });
    const img = /<img [^>]*data-src="_assets\/ZDEMO01-ko\/selection.png">/.exec(html)![0];
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const page = edit(html, img, img.replace(/src="[^"]*"/, `src="${png}"`).replace('<img ', '<img data-replaced="" '));
    const res = htmlToMd(page, { exists: (p: string) => p.endsWith('selection-edited.png') });
    expect(res.md).toContain('![선택화면 (ZDEMO01 selection screen)](_assets/ZDEMO01-ko/selection-edited-2.png)');
    expect(res.assets).toHaveLength(1);
    expect(res.assets[0].path).toBe('_assets/ZDEMO01-ko/selection-edited-2.png');
    expect(res.assets[0].data.subarray(1, 4).toString()).toBe('PNG');
  });

  describe('end to end: build, edit, import', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'spec-edit-'));
      mkdirSync(join(dir, '_assets', 'ZDEMO01-ko'), { recursive: true });
      mkdirSync(join(dir, '_img'));
      const flow = { key: 'processFlow', graph: { layout: 'free', nodes: [{ id: 'n1', type: 'start', label: '시작', x: 100, y: 40 }], edges: [] }, opts: {} };
      writeFileSync(join(dir, '_assets', 'ZDEMO01-ko', 'flow.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
      writeFileSync(join(dir, '_assets', 'ZDEMO01-ko', 'flow.graph.json'), JSON.stringify(flow));
      writeFileSync(join(dir, '_img', 'ZDEMO01-20261012.image-spec.json'), JSON.stringify({ lang: 'ko', processFlow: ['시작'] }));
      const md = SPEC.replace('### 4.1 화면 흐름\n', '### 4.1 화면 흐름\n\n![메인 흐름](_assets/ZDEMO01-ko/flow.png)\n');
      writeFileSync(join(dir, 'ZDEMO01-v1.0-ko.md'), md.replace(/\n/g, '\r\n'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('writes the next version .md, the flows, the revision — and the rebuild publishes it', () => {
      const built = buildSpecHtml({ mdPath: join(dir, 'ZDEMO01-v1.0-ko.md'), version: '1.0', author: 'Writer', note: 'First' });
      expect(built.html).toBe(join(dir, 'ZDEMO01-v1.0-ko.html'));
      let page = readFileSync(built.html, 'utf8');
      expect(page).toContain('<figure class="flow-fig">');
      expect(page).not.toContain('FLOW_PAGE_SCRIPT');
      // the reader: one cell, a moved flow node, Save with revision 1.1
      page = edit(page, '<span data-f="">로그 테이블</span>', '<span data-f="">감사 로그</span>');
      page = page.replace('class="flow-graph">{"key":"processFlow","graph":{"layout":"free","nodes":[{"id":"n1","type":"start","label":"시작","x":100',
        'class="flow-graph">{"edited":true,"key":"processFlow","graph":{"layout":"free","nodes":[{"id":"n1","type":"start","label":"시작","x":160');
      page = page.replace(/(<script type="application\/json" id="spec-source">)([\s\S]*?)(<\/script>)/, (_, a, json, c) => {
        const S = JSON.parse(json);
        S.version = '1.1';
        S.revisions = [{ version: '1.1', date: '2026-10-12', author: 'Kim', note: '로그 설명 수정' }];
        return a + JSON.stringify(S).replace(/</g, '\\u003c') + c;
      });
      const edited = join(dir, 'ZDEMO01-v1.1-ko-edited.html');
      writeFileSync(edited, page);

      const res = importEditedSpec(edited, join(dir, 'ZDEMO01-v1.0-ko.md'));
      expect(res.md).toBe(join(dir, 'ZDEMO01-v1.1-ko.md'));
      expect(res.sourceChanged).toBe(false);
      const v11 = readFileSync(res.md, 'utf8');
      expect(v11).toContain('| ZSDT0001 | 쓰기 | 감사 로그 |\r\n');
      expect(v11.replace('감사 로그', '로그 테이블')).toBe(readFileSync(join(dir, 'ZDEMO01-v1.0-ko.md'), 'utf8'));
      expect(res.flows.written).toEqual(['processFlow']);
      expect(JSON.parse(readFileSync(join(dir, '_img', 'ZDEMO01-20261012.image-spec.json'), 'utf8')).processFlow.nodes[0].x).toBe(160);
      const history = JSON.parse(readFileSync(join(dir, 'ZDEMO01-ko.history.json'), 'utf8'));
      expect(history.versions.map((v: { version: string; source?: string }) => [v.version, v.source])).toEqual([['1.0', undefined], ['1.1', 'edit']]);

      const again = buildSpecHtml({ mdPath: res.md, sameVersion: true });
      expect(again.version).toBe('1.1');
      expect(again.html).toBe(join(dir, 'ZDEMO01-v1.1-ko.html'));
      const h2 = JSON.parse(readFileSync(join(dir, 'ZDEMO01-ko.history.json'), 'utf8'));
      expect(h2.versions[1]).toMatchObject({ version: '1.1', author: 'Kim', date: '2026-10-12', source: 'edit' });
      const v11page = readFileSync(again.html, 'utf8');
      expect(v11page).toContain('<span data-ver="">v1.1</span>');
      expect(v11page).toMatch(/<td>v1\.1<\/td><td>2026-10-12<\/td><td>Kim<\/td><td>로그 설명 수정<\/td>/);
    });

    it('runs from the md-to-html CLI', () => {
      const out = execFileSync(process.execPath, [MD_TO_HTML, join(dir, 'ZDEMO01-v1.0-ko.md'), '--editable', '--author', 'W'], { encoding: 'utf8' });
      expect(JSON.parse(out.slice(out.indexOf('{')))).toMatchObject({ version: '1.0' });
      const next = execFileSync(process.execPath, [MD_TO_HTML, '--next-version', '--history', join(dir, 'ZDEMO01-ko.history.json')], { encoding: 'utf8' });
      expect(next.trim()).toBe('1.1');
      const page = readFileSync(join(dir, 'ZDEMO01-v1.0-ko.html'), 'utf8');
      writeFileSync(join(dir, 'edited.html'), edit(page, '<span data-f="">로그 테이블</span>', '<span data-f="">로그</span>'));
      const imp = execFileSync(process.execPath, [MD_TO_HTML, '--import', join(dir, 'edited.html'), join(dir, 'ZDEMO01-v1.0-ko.md')], { encoding: 'utf8' });
      const res = JSON.parse(imp);
      // no revision recorded on the page → written in place, the old file kept
      expect(res.md).toBe(join(dir, 'ZDEMO01-v1.0-ko.md'));
      expect(existsSync(`${res.md}.bak`)).toBe(true);
      expect(readFileSync(res.md, 'utf8')).toContain('| ZSDT0001 | 쓰기 | 로그 |');
    });
  });
});

describe('versions', () => {
  it('numbers like the manual: 1.0, +0.1, same, +1.0', () => {
    expect(nextVersion({ versions: [] })).toBe('1.0');
    const h = { versions: [{ version: '1.0' }, { version: '1.4' }] };
    expect(nextVersion(h)).toBe('1.5');
    expect(nextVersion(h, { sameVersion: true })).toBe('1.4');
    expect(nextVersion(h, { major: true })).toBe('2.0');
  });

  it('keeps a page edit\'s author, date and note when that version is rebuilt', () => {
    const h = { versions: [{ version: '1.1', date: '2026-01-02', author: 'Kim', note: 'edit', source: 'edit' }] };
    recordVersion(h, '1.1', { defaultAuthor: 'Config' });
    expect(h.versions[0]).toMatchObject({ date: '2026-01-02', author: 'Kim', note: 'edit' });
    recordVersion(h, '1.2', { defaultAuthor: 'Config', note: 'next' });
    expect(h.versions[1]).toMatchObject({ version: '1.2', author: 'Config', note: 'next' });
  });

  it('parses spec file names', () => {
    expect(parseSpecName('x/ZSDR01-v1.2-ko.md')).toEqual({ object: 'ZSDR01', version: '1.2', lang: 'ko' });
    expect(parseSpecName('ZSDR01-v1.3-en-edited.html')).toEqual({ object: 'ZSDR01', version: '1.3', lang: 'en' });
    expect(parseSpecName('ZSDR01-20261012-ja.md')).toEqual({ object: 'ZSDR01', date: '20261012', lang: 'ja' });
  });

  describe('builds', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'spec-ver-'));
      writeFileSync(join(dir, 'ZDEMO01-ko.md'), SPEC);
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('adds a version per build, copying the .md to each version\'s name', () => {
      const v10 = buildSpecHtml({ mdPath: join(dir, 'ZDEMO01-ko.md'), note: 'first' });
      expect([v10.version, v10.md, v10.html]).toEqual(['1.0', join(dir, 'ZDEMO01-v1.0-ko.md'), join(dir, 'ZDEMO01-v1.0-ko.html')]);
      const same = buildSpecHtml({ mdPath: v10.md, sameVersion: true });
      expect([same.version, same.md]).toEqual(['1.0', v10.md]);
      const v11 = buildSpecHtml({ mdPath: v10.md, note: 'second' });
      expect([v11.version, v11.md]).toEqual(['1.1', join(dir, 'ZDEMO01-v1.1-ko.md')]);
      expect(readFileSync(v11.md, 'utf8')).toBe(SPEC);
      const v20 = buildSpecHtml({ mdPath: v11.md, major: true });
      expect(v20.version).toBe('2.0');
      const history = JSON.parse(readFileSync(join(dir, 'ZDEMO01-ko.history.json'), 'utf8'));
      expect(history.versions.map((v: { version: string }) => v.version)).toEqual(['1.0', '1.1', '2.0']);
      const page = readFileSync(v20.html, 'utf8');
      expect((page.match(/<tr><td>v\d\.\d<\/td>/g) || []).length).toBe(3);
      expect(page).toMatch(/<li><a href="#revision-history">개정 이력<\/a><\/li>/);
    });

    it('mirrors a given version (English companion)', () => {
      const en = buildSpecHtml({ mdPath: join(dir, 'ZDEMO01-ko.md'), version: '1.3', historyPath: join(dir, 'ZDEMO01-en.history.json') });
      expect(en.version).toBe('1.3');
      expect(JSON.parse(readFileSync(join(dir, 'ZDEMO01-en.history.json'), 'utf8')).versions[0].version).toBe('1.3');
    });
  });
});

describe('editable page vs plain page', () => {
  it('leaves the plain page (package-to-process, other skills) without any edit markup', () => {
    const plain: string = mdToHtml(SPEC, { lang: 'ko' });
    expect(plain).not.toMatch(/data-b=|data-f=|data-src=|spec-source|spec-edit|data-edited|rev-table|ql-editor/);
    expect(plain).toContain('<dl class="facts"><div><dt>lang</dt>');
  });

  it('carries the editor, its labels and Quill inline — nothing from the network but Mermaid', () => {
    const page: string = mdToHtml(SPEC, { editable: true, version: '1.0', lang: 'ja' });
    expect(page).toContain('<script type="application/json" id="spec-editor-labels">');
    expect(page).toContain(`"edit":"${specEditorLabels('ja').edit}"`);
    expect(page).toContain('window.Quill');
    const srcs = [...page.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs.every((s) => /mermaid/.test(s))).toBe(true);
    expect(page).toContain('<pre class="mermaid" data-src="flowchart LR');
    expect(page).toMatch(/<figure data-src="_assets\/ZDEMO01-ko\/selection.png" data-b="\d+">/);
  });

  it('ships an editor script that compiles and guards its storage', () => {
    expect(() => new Script(SPEC_EDITOR_SCRIPT)).not.toThrow();
    expect(SPEC_EDITOR_SCRIPT).toMatch(/function store\(k,v\)\{try\{/);
    for (const lang of ['ko', 'en', 'ja']) {
      const L = specEditorLabels(lang);
      expect(Object.keys(L)).toEqual(Object.keys(specEditorLabels('en')));
      expect(L.guide).toHaveLength(6);
    }
  });
});

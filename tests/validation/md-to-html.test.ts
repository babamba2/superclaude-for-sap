import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { mdToHtml } from '../../scripts/spec/md-to-html.mjs';

const SPEC = `# Specification: ZTEST01 — Demo report

- **Type**: Report · **Transaction**: ZT01
- **Package**: ZPKG
- **Purpose**: Lists open sales orders

> Scope: the whole program.

## 1. Business context

Reads **VBAK** and calls \`BAPI_SALESORDER_CHANGE\`; see §2 and §3.1.

> [!WARNING]
> No AUTHORITY-CHECK before the update.

> ⚠ Hard-coded sales org.

## 2. Data model

| Table | Use | Access |
|---|---|---|
| **VBAK / VBAP** | Sales order header and items | R |
| ZSDT0001 | Log table | W |

| Step | BAPI | Where |
|---|---|---|
| Change | \`BAPI_SALESORDER_CHANGE\` | L120 |
| Commit | \`BAPI_TRANSACTION_COMMIT\` | L130 |

## 3. Inputs

### 3.1 Selection screen

Reads VBAP items for S_VBELN. <span class="tech">(FORM get_data, L40)</span>

![Selection screen](_assets/none.png)

## 9. Routines
<!-- audience: technical -->

| Routine | Purpose |
|---|---|
| GET_DATA | Reads VBAK |
| SHOW_ALV | Displays |

\`\`\`abap
${Array.from({ length: 35 }, (_, i) => `WRITE ${i}.`).join('\n')}
\`\`\`
`;

describe('md-to-html', () => {
  const html: string = mdToHtml(SPEC, { lang: 'en' });

  it('keeps a complete page without the script: toc, cover card, sections', () => {
    expect(html).toContain('<nav class="toc"');
    expect(html).toMatch(/<dl class="facts">.*<dt>Type<\/dt>.*<dt>Transaction<\/dt>.*<dt>Package<\/dt>/s);
    expect(html).not.toMatch(/<ul>\s*<li><strong>Type/);
    expect((html.match(/<section class="sec"/g) || []).length).toBe(4);
    expect(html).toContain('<title>Specification: ZTEST01 — Demo report</title>');
  });

  it('turns each table key column into anchors, linked from the text with a tooltip', () => {
    expect(html).toContain('id="ref-VBAK"');
    expect(html).toContain('id="ref-VBAP"');
    expect(html).toContain('id="ref-BAPI_SALESORDER_CHANGE"');
    expect(html).toMatch(/<a class="xref" href="#ref-VBAK" title="Sales order header and items · R">VBAK<\/a>/);
    expect(html).toMatch(/<a class="xref" href="#ref-BAPI_SALESORDER_CHANGE"[^>]*><code>BAPI_SALESORDER_CHANGE<\/code><\/a>/);
    // The defining cell does not link to itself; the routine table's GET_DATA row links back to VBAK.
    expect(html).not.toMatch(/id="ref-VBAK"><\/span><a class="xref"/);
    expect(html).toMatch(/Reads <a class="xref" href="#ref-VBAK"/);
  });

  it('links §n references to numbered headings', () => {
    expect(html).toMatch(/<a class="secref" href="#2-data-model">§2<\/a>/);
    expect(html).toMatch(/<a class="secref" href="#31-selection-screen">§3\.1<\/a>/);
  });

  it('renders alerts and ⚠ quotes as callouts', () => {
    expect(html).toContain('<div class="callout callout-warning"><p class="callout-title">Warning</p>');
    expect((html.match(/class="callout callout-warning"/g) || []).length).toBe(2);
  });

  it('marks technical detail for the functional view', () => {
    expect(html).toContain('<span class="tech">');
    expect(html).toMatch(/<section class="sec" aria-labelledby="9-routines" data-audience="technical">/);
    expect(html).toMatch(/<li data-audience="technical"><a href="#9-routines">/);
    expect(html).not.toContain('audience: technical');
  });

  it('wraps a lone image in a figure and folds long code', () => {
    expect(html).toMatch(/<figure><img [^>]*alt="Selection screen"><figcaption>Selection screen<\/figcaption><\/figure>/);
    expect(html).toContain('<details class="code"><summary>Show code (35 lines)</summary>');
  });

  it('localizes labels and still renders a document with no headings or tables', () => {
    expect(mdToHtml('# 제목\n\n본문', { lang: 'ko' })).toContain('var L={"contents":"목차"');
    const plain = mdToHtml('Just a paragraph.');
    expect(plain).toContain('<p>Just a paragraph.</p>');
    expect(plain).not.toContain('<nav class="toc"');
  });

  describe('review regressions', () => {
    const GLOSSARY = '| Table | Use |\n|---|---|\n| VBAK | Header |\n| VBAP | Items |\n\n';

    it('never nests a cross-reference inside a writer link', () => {
      const out = mdToHtml(`${GLOSSARY}Text <a href="#z">\`VBAK\`</a> and \`VBAK\`.`);
      expect(out).toContain('<a href="#z"><code>VBAK</code></a>');
      expect(out).toMatch(/and <a class="xref" href="#ref-VBAK"[^>]*><code>VBAK<\/code><\/a>/);
    });

    it('restores placeholders in alt, title and link labels', () => {
      const out = mdToHtml(`${GLOSSARY}![see \`VBAK\` here](x.png)\n\n[the \`VBAP\` item](#x "t \`VBAK\`") and [a\\_b](#y)`);
      expect(out).not.toMatch(/\u0000/);
      expect(out).toContain('alt="see VBAK here"');
      expect(out).toContain('title="t VBAK"');
      expect(out).toContain('>the <code>VBAP</code> item</a>');
      expect(out).toContain('>a_b</a>');
      expect(out.slice(out.indexOf('<main>'), out.indexOf('</main>'))).not.toContain('undefined');
    });

    it('does not turn severity words into glossary links', () => {
      const out = mdToHtml('| Severity | Meaning |\n|---|---|\n| HIGH | Must fix |\n| MEDIUM | Should fix |\n| LOW | Nice |\n\nOne HIGH finding.');
      expect(out).not.toContain('class="xref"');
      expect(out).not.toContain('id="ref-HIGH"');
    });

    it('keeps text that follows a comment on the same line', () => {
      expect(mdToHtml('<!-- note --> Visible text here')).toContain('<p>Visible text here</p>');
    });

    it('keeps quotes in fact values', () => {
      const out = mdToHtml('# T\n\n- **Mode**: "Quick" mode\n- **Note**: it\'s \'x\'\n');
      expect(out).toContain('<dd>"Quick" mode</dd>');
      expect(out).toContain("<dd>it's 'x'</dd>");
    });

    it('marks a technical h3 in the contents too', () => {
      const out = mdToHtml('# T\n\n## 1. A\n\ntext\n\n### 1.1 Internals\n<!-- audience: technical -->\n\nx\n\n## 2. B\n\ny');
      expect(out).toMatch(/<li data-audience="technical"><a href="#11-internals">/);
      expect(out).toMatch(/<div class="sub" data-audience="technical">\n<h3 id="11-internals">/);
    });

    it('nests the contents correctly and leaves unmarked h3s unwrapped', () => {
      const out = mdToHtml('### Early\n\n## 1. A\n\n<details>\n\n### 1.1 Inside\n\ntext\n\n</details>\n\n## 2. B\n\nz');
      const toc = out.match(/<nav class="toc"[\s\S]*?<\/nav>/)![0];
      expect(toc).toContain('<ol><li><ol><li><a href="#early">Early</a></li></ol></li><li><a href="#1-a">');
      expect(toc).not.toMatch(/<ol><ol>/);
      expect(out).not.toContain('<div class="sub"');
      expect(out).toMatch(/<details>\n<h3 id="11-inside">[\s\S]*<\/details>\n<\/section>/);
    });

    it('guards the page script against a malformed fragment', () => {
      expect(mdToHtml('x')).toContain('try { return decodeURIComponent(raw); } catch (e) { return raw; }');
    });
  });

  it('reads frontmatter into the cover card', () => {
    const out = mdToHtml('---\nlang: ja\nowner: Team A\n---\n# T\n\n## 1. A\n\ntext\n\n## 2. B\n\ntext');
    expect(out).toContain('<html lang="ja">');
    expect(out).toMatch(/<dt>owner<\/dt><dd>Team A<\/dd>/);
  });
});

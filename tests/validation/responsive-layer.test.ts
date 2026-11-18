import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESPONSIVE_CSS, RESPONSIVE_JS, withResponsive } from '../../scripts/lib/responsive.mjs';

const ROOT = join(__dirname, '..', '..');
// Page builders are discovered, not listed: every script that imports the layer. A new builder is tested once it is
// in the tree, and no builder has to edit this file.
function scripts(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? scripts(join(dir, d.name)) : d.name.endsWith('.mjs') ? [join(dir, d.name)] : []));
}
const SCRIPTS = join(ROOT, 'scripts');
const BUILDERS = scripts(SCRIPTS).filter((f) => !f.endsWith(join('lib', 'responsive.mjs')) && /from '\.\.\/lib\/responsive\.mjs'/.test(readFileSync(f, 'utf8')))
  .map((f) => relative(SCRIPTS, f).replace(/\\/g, '/')).sort();

/** top-level CSS blocks: every rule must sit inside an @media block (PC and print untouched) */
function topLevelBlocks(css: string) {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') { if (depth === 0) out.push(css.slice(start, i).trim()); depth++; }
    else if (css[i] === '}') { depth--; if (depth === 0) start = i + 1; }
  }
  return out;
}

describe('phone layer for HTML deliverables', () => {
  it('CSS applies only on phones (≤ 600 / 380 px) or keeps print as it was — plus the one Korean line-break rule', () => {
    const heads = topLevelBlocks(RESPONSIVE_CSS);
    expect(heads.length).toBeGreaterThan(0);
    // the only rule outside a media block: Korean pages break between words at every width, a too-long ID still breaks
    const global = heads.filter((h) => !h.startsWith('@media'));
    expect(global).toEqual(['html[lang=ko]']);
    expect(RESPONSIVE_CSS).toMatch(/html\[lang=ko\]\{word-break:keep-all;overflow-wrap:break-word\}/);
    for (const h of heads.filter((x) => x.startsWith('@media'))) expect(h).toMatch(/^@media (\(max-width:(600|380)px\)|print)$/);
    expect(RESPONSIVE_CSS).toMatch(/table\.m-kv>tbody[^{]*\{display:grid/);
    expect(RESPONSIVE_CSS).toMatch(/input,select,textarea\{font-size:16px/);
    expect(RESPONSIVE_CSS).toMatch(/min-height:44px/);
    expect(RESPONSIVE_CSS).toMatch(/input:not\(\[type=checkbox\]\):not\(\[type=radio\]\):not\(\[type=hidden\]\),textarea\{min-height:44px/);
    // edit-mode cells of every page (contenteditable) on phones: no iOS zoom, touchable
    const phone = RESPONSIVE_CSS.slice(RESPONSIVE_CSS.indexOf('@media (max-width:600px)'), RESPONSIVE_CSS.indexOf('@media (max-width:380px)'));
    expect(phone).toMatch(/\[contenteditable\]:not\(\[contenteditable=false\]\)\{font-size:16px!important;min-height:44px!important;min-width:44px!important/);
    // inline editables take sizes only as inline-block; table cells take a height (a minimum for a cell)
    expect(phone).toMatch(/span\[contenteditable\]:not\(\[contenteditable=false\]\)[^{]*\{display:inline-block/);
    expect(phone).toMatch(/td\[contenteditable\]:not\(\[contenteditable=false\]\),th\[contenteditable\]:not\(\[contenteditable=false\]\)\{height:44px!important\}/);
  });

  it('script is self-contained and keyed to the same breakpoint', () => {
    expect(RESPONSIVE_JS).toMatch(/matchMedia\('\(max-width:600px\)'\)/);
    expect(RESPONSIVE_JS).not.toMatch(/\bimport\b|\brequire\(/);
    expect(() => new Function(RESPONSIVE_JS)).not.toThrow();
  });

  it('a table slightly wider than its padded box is wrapped (the box padding is not room for the table)', () => {
    // minimal stand-in DOM: a 390px phone, <main> with 16px side padding, a table of a given width
    const run = (tableWidth: number, vw = 390, pad = 16, cls = '') => {
      const body: any = { tagName: 'BODY' };
      const box: any = { tagName: 'MAIN', parentElement: body, clientWidth: vw, style: {}, kids: [] as any[], insertBefore(w: any) { this.kids.push(w); } };
      const t: any = {
        tHead: null, rows: [{ cells: [{ tagName: 'TD', textContent: 'col0xx', getBoundingClientRect: () => ({ width: tableWidth / 5 }) }] }],
        classList: { contains: (k: string) => k === cls, add() {} }, closest: () => null, style: {}, parentElement: box,
        scrollWidth: tableWidth, getBoundingClientRect: () => ({ width: tableWidth, right: pad + tableWidth }),
      };
      const wraps: any[] = [];
      const document: any = {
        readyState: 'complete', body, documentElement: { clientWidth: vw },
        querySelectorAll: () => [t], createElement: () => { const w: any = { className: '', appendChild(x: any) { x.parentElement = w; } }; wraps.push(w); return w; },
        createRange: () => ({ selectNodeContents() {}, getClientRects: () => [{ width: 10, top: 0 }] }),
      };
      const window: any = { matchMedia: () => ({ matches: true, addEventListener() {} }), addEventListener() {} };
      const getComputedStyle = (el: any) => (el === box ? { paddingLeft: `${pad}px`, paddingRight: `${pad}px`, overflowX: 'visible' } : { overflowX: 'visible' });
      new Function('window', 'document', 'getComputedStyle', 'requestAnimationFrame', 'MutationObserver', RESPONSIVE_JS)(window, document, getComputedStyle, (f: any) => f(), undefined);
      return wraps.filter((w) => w.className === 'm-scroll').length;
    };
    // a page's own phone cards (table.cards) are left alone even when wider than the box
    expect(run(600, 390, 16, 'cards')).toBe(0);
    expect(run(376)).toBe(1);   // 376 > 390 − 2 × 16 = 358: wrapped (before: compared with 390, left 2px sideways scroll)
    expect(run(360)).toBe(1);
    expect(run(350)).toBe(0);   // fits the content box
    expect(run(400, 412)).toBe(1);
    expect(run(376, 412)).toBe(0);
    expect(RESPONSIVE_CSS).toMatch(/\.m-scroll\{overflow-x:auto;max-width:100%;box-sizing:border-box/);
  });

  it('withResponsive puts the layer into a page once', () => {
    const page = '<!doctype html><html><head><title>x</title></head><body><p>a</p></body></html>';
    const once = withResponsive(page);
    expect(once.indexOf('<style data-sc4sap-responsive>')).toBeLessThan(once.indexOf('</head>'));
    expect(once.indexOf('<script data-sc4sap-responsive>')).toBeLessThan(once.indexOf('</body>'));
    expect(withResponsive(once)).toBe(once);
    expect(withResponsive('<p>fragment</p>')).toBe('<p>fragment</p>');
  });

  // Reverse check: every script that writes an HTML page imports the layer — except these, which are not pages a
  // person reads on a phone. Add a script here only with its reason.
  const NOT_PHONE_PAGES: Record<string, string> = {
    // in-page "Save" of an open page: re-serialises the page it runs in, which already carries the layer
    'config/config-doc-editor.mjs': 'saves the open config page',
    'interface/if-spec-editor.mjs': 'saves the open interface spec page',
    'manual/manual-editor.mjs': 'saves the open manual page',
    'process/process-editor.mjs': 'saves the open process page',
    'spec/flow-editor.mjs': 'saves the open spec page (flow editor)',
    'spec/spec-editor.mjs': 'saves the open spec page',
    // drawn at print size and turned into an image or compared pixel by pixel — never opened as a page
    'adobe/build-adobe-preview.mjs': 'Adobe form print preview: A4 pages at mm size, printed to PDF / JPG for the score',
    'smartform/build-preview.mjs': 'SmartForm print preview rendered to a JPG at mm size',
    'smartform/otf-draw.mjs': 'SmartForm print drawn for an image comparison',
    'spec/screen-image-renderer.mjs': 'SAP screen mock-ups rendered to images',
  };
  it('every script that writes an HTML page imports the layer (or is a listed non-phone page)', () => {
    const writers = scripts(SCRIPTS).filter((f) => !f.endsWith(join('lib', 'responsive.mjs')) && /<!doctype html/i.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SCRIPTS, f).replace(/\\/g, '/'));
    expect(writers.length).toBeGreaterThan(10);
    const missing = writers.filter((f) => !BUILDERS.includes(f) && !(f in NOT_PHONE_PAGES));
    expect(missing, 'pages without the phone layer: import withResponsive, or list the script with its reason').toEqual([]);
    for (const f of Object.keys(NOT_PHONE_PAGES)) expect(writers, `${f} no longer writes HTML: drop it from the list`).toContain(f);
  });

  it('discovers the page builders (at least the ones shipped with the layer)', () => {
    for (const f of ['interface/if-spec-page.mjs', 'uat/uat-page.mjs', 'spec/md-to-html.mjs', 'project/project-page.mjs', 'transport/tr-page.mjs', 'project/status-page.mjs'])
      expect(BUILDERS).toContain(f);
  });

  it.each(BUILDERS)('%s wraps every page it writes with the layer', (f) => {
    const src = readFileSync(join(SCRIPTS, f), 'utf8');
    expect(src).toMatch(/import \{ withResponsive \} from '\.\.\/lib\/responsive\.mjs';/);
    // each full page (a template literal starting <!doctype html) goes through withResponsive — directly, or as a
    // variable handed to it
    const pages = [...src.matchAll(/`<!doctype html/gi)];
    expect(pages.length).toBeGreaterThan(0);
    for (const m of pages) {
      const before = src.slice(Math.max(0, m.index! - 40), m.index);
      const v = /(?:const|let)\s+(\w+)\s*=\s*$/.exec(before)?.[1];
      const wrapped = /withResponsive\(\s*$/.test(before) || (!!v && new RegExp(`withResponsive\\(\\s*${v}\\s*\\)`).test(src));
      expect(wrapped, `${f}: page at ${m.index}`).toBe(true);
    }
  });

  it('the UAT page carries the layer and pins the step grid on phones', async () => {
    const { normalize } = await import('../../scripts/uat/uat-model.mjs');
    const { pageHtml } = await import('../../scripts/uat/uat-page.mjs');
    const html = pageHtml(normalize({ id: 'X-UAT', module: 'SD', title: 't', scenarios: [{ id: 'S1', title: 's', steps: [{ activity: 'a', tcode: 'VA01' }] }] }), 'en');
    expect(html.match(/data-sc4sap-responsive/g)).toHaveLength(2);
    expect(html).toMatch(/class="topbar m-bar"/);
    expect(html).toMatch(/\.tw>table\{min-width:1100px\}/);
  });
});

describe('Korean line breaks are not undone by a page', () => {
  it('prose and table cells of the document pages keep keep-all (no word-break override), long IDs still wrap', () => {
    // doc-kit (cutover / weekly / meeting / migration), the interface spec and the process map's filter labels
    for (const rel of ['project/doc-kit.mjs', 'interface/if-spec-page.mjs', 'process/process-page.mjs']) {
      const src = readFileSync(join(SCRIPTS, rel), 'utf8');
      expect(src, rel).not.toMatch(/word-break:\s*break-(word|all)/);
      expect(src, rel).toMatch(/overflow-wrap:(anywhere|break-word)/);
    }
    // the layer's own key-value cells reset word-break on phones: Korean pages get keep-all back there
    expect(RESPONSIVE_CSS).toContain('html[lang=ko] table.m-kv th,html[lang=ko] table.m-kv td{word-break:keep-all}');
  });
});

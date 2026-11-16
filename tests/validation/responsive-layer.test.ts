import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESPONSIVE_CSS, RESPONSIVE_JS, withResponsive } from '../../scripts/lib/responsive.mjs';

const ROOT = join(__dirname, '..', '..');
const BUILDERS = [
  'interface/if-spec-page.mjs', 'uat/uat-page.mjs', 'spec/md-to-html.mjs', 'manual/build-manual.mjs',
  'process/build-process-doc.mjs', 'process/build-integration-doc.mjs', 'config/config-doc-page.mjs',
  'project/project-page.mjs', 'project/build-project-doc.mjs', 'role/role-page.mjs', 'relmap/relmap-page.mjs',
  'ops/ops-page.mjs', 'transport/tr-page.mjs',
];

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
  it('CSS applies only on phones (≤ 600 / 380 px) or keeps print as it was', () => {
    const heads = topLevelBlocks(RESPONSIVE_CSS);
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) expect(h).toMatch(/^@media (\(max-width:(600|380)px\)|print)$/);
    expect(RESPONSIVE_CSS).toMatch(/table\.m-kv>tbody[^{]*\{display:grid/);
    expect(RESPONSIVE_CSS).toMatch(/input,select,textarea\{font-size:16px/);
    expect(RESPONSIVE_CSS).toMatch(/min-height:44px/);
    expect(RESPONSIVE_CSS).toMatch(/input:not\(\[type=checkbox\]\):not\(\[type=radio\]\):not\(\[type=hidden\]\),textarea\{min-height:44px/);
  });

  it('script is self-contained and keyed to the same breakpoint', () => {
    expect(RESPONSIVE_JS).toMatch(/matchMedia\('\(max-width:600px\)'\)/);
    expect(RESPONSIVE_JS).not.toMatch(/\bimport\b|\brequire\(/);
    expect(() => new Function(RESPONSIVE_JS)).not.toThrow();
  });

  it('withResponsive puts the layer into a page once', () => {
    const page = '<!doctype html><html><head><title>x</title></head><body><p>a</p></body></html>';
    const once = withResponsive(page);
    expect(once.indexOf('<style data-sc4sap-responsive>')).toBeLessThan(once.indexOf('</head>'));
    expect(once.indexOf('<script data-sc4sap-responsive>')).toBeLessThan(once.indexOf('</body>'));
    expect(withResponsive(once)).toBe(once);
    expect(withResponsive('<p>fragment</p>')).toBe('<p>fragment</p>');
  });

  it.each(BUILDERS)('%s wraps its page with the layer', (f) => {
    const src = readFileSync(join(ROOT, 'scripts', f), 'utf8');
    expect(src).toMatch(/import \{ withResponsive \} from '\.\.\/lib\/responsive\.mjs';/);
    expect(src).toMatch(/withResponsive\(`<!doctype html>/i);
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

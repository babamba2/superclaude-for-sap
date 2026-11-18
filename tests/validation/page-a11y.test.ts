/**
 * Touch and screen-reader details of the generated pages (2026-11-18, from the phone review of the sample pages):
 *   spec image zoom: a real viewer (pinch / − + / fit, 44 px buttons on touch, focus kept and restored);
 *   configuration document: a closed drawer (reference panel, IMG menu) is hidden, so its controls are out of reach;
 *   IMG tree rows: a 44 px tap area on a touch screen, the desktop look unchanged;
 *   configuration document zoom viewer (#lb): the spec viewer's treatment (pinch, 44 px bar, modal, keyboard);
 *   process / gap pages: every fold toggle has aria-expanded and a label that says what it does.
 * The interaction itself was checked on touch emulation (tools outside this repo); these hold the contract.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { LABELS as SPEC_LABELS, STYLE as SPEC_STYLE, SCRIPT as SPEC_SCRIPT } from '../../scripts/spec/md-to-html-assets.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { pageHtml } from '../../scripts/config/config-doc-page.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderProcessHtml } from '../../scripts/process/build-process-doc.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { SCRIPT as PROCESS_SCRIPT } from '../../scripts/process/process-page.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderGapHtml } from '../../scripts/process/build-gap-doc.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { deriveGap } from '../../scripts/process/gap-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { GAP_SCRIPT } from '../../scripts/process/gap-page.mjs';

const ROOT = join(__dirname, '..', '..');
const fixture = (f: string) => JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/process', f), 'utf8'));
const attrs = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[0]);

describe('spec image zoom', () => {
  it('has its words in every language', () => {
    for (const l of ['en', 'ko', 'ja']) for (const k of ['zoom', 'zoomIn', 'zoomOut', 'fit', 'close']) expect(SPEC_LABELS[l][k], `${l}.${k}`).toBeTruthy();
  });
  it('is a modal viewer: pinch and pan on pointers, − + fit ×, keys, focus in and back', () => {
    expect(() => new Function('L', 'main', 'body', SPEC_SCRIPT)).not.toThrow();
    for (const s of ["setAttribute('aria-modal', 'true')", 'function openZoom', 'pinch = {', 'Math.hypot', "addEventListener('wheel'", 'closer.focus()', 'back.focus()', "k === 'Tab'", "body.style.overflow = 'hidden'"]) {
      expect(SPEC_SCRIPT, s).toContain(s);
    }
    // keyboard: pictures are buttons (Tab, Enter / Space)
    for (const s of ["img.tabIndex = 0", "img.setAttribute('role', 'button')", "event.key !== 'Enter' && event.key !== ' '"]) expect(SPEC_SCRIPT, s).toContain(s);
    expect(SPEC_STYLE).toContain('main img.zoomable:focus-visible{');
    // never enlarged past the picture's own size when fitted
    expect(SPEC_SCRIPT).toMatch(/fit = Math\.min\(w \/ W, h \/ H, 1\)/);
  });
  it('44 px buttons on touch and phones, the pinch area takes the gestures', () => {
    expect(SPEC_STYLE).toContain('@media (pointer:coarse),(max-width:600px){.lightbox .lb-bar button{min-width:44px;height:44px');
    expect(SPEC_STYLE).toMatch(/\.lightbox \.lb-view\{[^}]*touch-action:none/);
  });
});

describe('configuration document', () => {
  const html: string = pageHtml({ meta: { module: 'MM', system: 'DEV', client: '100', sapVersion: 'ECC', extractedAt: '2026-11-18T00:00:00Z', maxRows: 1000, lang: 'ko' }, lang: 'ko', tree: [], acts: {}, views: {}, checks: [], transports: {}, domains: {}, docs: {} }, {});
  it('a closed drawer is hidden (not only moved off screen), an open one shown', () => {
    expect(html).toMatch(/#ref\{[^}]*transform:translateX\(100%\);visibility:hidden;transition:transform \.2s,visibility 0s \.2s/);
    expect(html).toMatch(/body\.ref-open #ref\{transform:none;visibility:visible/);
    expect(html).toMatch(/aside\{[^}]*transform:translateX\(-100%\);visibility:hidden/);
    expect(html).toMatch(/body\.menu-open aside\{transform:none;visibility:visible/);
  });
  it('the drawer buttons say whether their drawer is open', () => {
    expect(html).toContain("$('#refbtn').setAttribute('aria-controls','ref')");
    expect(html).toMatch(/const drawerState=\(\)=>\{\$\('#refbtn'\)\.setAttribute\('aria-expanded'/);
  });
  it('zoom viewer: a modal with labelled buttons, 44 px on touch and phones, pinch and double tap on pointers', () => {
    expect(html).toContain('<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="크게 보기">');
    expect(html.match(/<button type="button" data-z="[-+x]" title="[^"]+" aria-label="[^"]+">/g)?.length).toBe(3);
    expect(html).toContain('@media (pointer:coarse),(max-width:600px){.lbbar{');
    expect(html).toContain('.lbbar button{min-width:44px;height:44px;font-size:16px}');
    for (const s of ['lbPinch={d:Math.hypot(', "$('#lbv').addEventListener('pointercancel',lbUp)", 'if(now-lbTap<320)', "$('#lb [data-z=\"x\"]').focus()", 'lbBack.focus()', "k==='Tab'"]) expect(html, s).toContain(s);
    // the old mouse-only double click is gone (a double tap would have toggled twice)
    expect(html).not.toContain("$('#lbc').addEventListener('dblclick'");
  });
  it('zoom viewer: a drawing is a button (Tab, Enter / Space)', () => {
    expect(html).toContain('tabindex="0" role="button" aria-label="\'+esc(T.zoom)+\'">\'');
    expect(html).toContain(".closest('.mock[data-svg],#ref .case .flow');if(z&&(e.key==='Enter'||e.key===' ')){e.preventDefault();z.click()}");
  });
  it('IMG tree rows: 44 px on a touch screen; the desktop rule is unchanged', () => {
    expect(html).toContain('@media (pointer:coarse){.row,.leaf{min-height:44px;align-items:center}}');
    expect(html).toContain('.row{display:flex;align-items:center;gap:6px;padding:4px 8px;');
  });
});

describe('fold toggles', () => {
  it('process page: aria-expanded and a "collapse <code>" label on every toggle; the script keeps them in step', () => {
    const html: string = renderProcessHtml(fixture('model-mm.json'), { version: '1.0', date: '2026-11-18' });
    const tg = attrs(html, /<button class="tg"[^>]*>/g);
    expect(tg.length).toBeGreaterThan(0);
    for (const b of tg) {
      expect(b).toContain('aria-expanded="true"');
      expect(b).not.toContain('aria-label="toggle"');
      expect(b).toMatch(/aria-label="\S+ [^"]+"/);
    }
    expect(html).toMatch(/<table class="bph" data-fold-open="[^"]+" data-fold-closed="[^"]+">/);
    expect(PROCESS_SCRIPT).toContain("b.setAttribute('aria-expanded', shut ? 'false' : 'true')");
    // column filter buttons: true while the popup is open, false again on close
    expect(PROCESS_SCRIPT).toMatch(/function openPop\(btn\)\{\s*closePop\(\);\s*btn\.setAttribute\('aria-expanded', 'true'\);/);
    expect(PROCESS_SCRIPT).toContain("b.setAttribute('aria-expanded', 'false')");
  });
  it('gap page: the same on its toggles', () => {
    const html: string = renderGapHtml(deriveGap(fixture('model-gap-mm.json'), { scope: 'conversion' }), { version: '1.0', date: '2026-11-18' });
    const tg = attrs(html, /<span class="tg"[^>]*>/g);
    expect(tg.length).toBeGreaterThan(0);
    for (const b of tg) {
      expect(b).toContain('aria-expanded="true"');
      expect(b).toMatch(/aria-label="\S+ [^"]+"/);
    }
    expect(GAP_SCRIPT).toContain('function tgSync(b)');
    expect(GAP_SCRIPT).not.toMatch(/b\.textContent = '▸'; \}\); apply\(\)/);
  });
});

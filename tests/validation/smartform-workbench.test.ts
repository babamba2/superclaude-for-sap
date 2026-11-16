import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { listSymbols, Renderer } from '../../scripts/smartform/build-preview.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { applySampleOps, buildIndex, fieldsFrom, renderPreview, sampleOf, sampleValues } from '../../scripts/smartform/preview-workbench.mjs';

// Invented forms (tests/fixtures/smartform): the golden HTML was written by the renderer before `inspect` existed.
const FX = join(__dirname, '..', 'fixtures', 'smartform');
const load = (k: string) => ({
  content: JSON.parse(readFileSync(join(FX, `form-${k}.content.json`), 'utf8')),
  values: JSON.parse(readFileSync(join(FX, `form-${k}.values.json`), 'utf8')),
  golden: readFileSync(join(FX, `form-${k}.golden.html`), 'utf8').replace(/\r\n/g, '\n'),
});
const DDIC = {
  ZTEST_S_HEADB: { fields: { NAME1: { type: 'CHAR', length: 35, desc: 'Name 1' }, CITY1: { type: 'CHAR', length: 40 }, VBELN: { type: 'CHAR', length: 10 }, FKDAT: { type: 'DATS', length: 8 }, KDGRP: { type: 'CHAR', length: 2 } } },
  WRBTR: { type: 'CURR', length: 13, decimals: 2, desc: 'Amount' },
  ZTEST_T_POS: { lineType: 'ZTEST_S_POS' },
  ZTEST_S_POS: { fields: [{ name: 'POSNR', type: 'NUMC', length: 6 }, { name: 'ARKTX', type: 'CHAR', length: 40 }, { name: 'NETWR', type: 'CURR', length: 15, decimals: 2 }] },
};

describe('preview workbench — render', () => {
  for (const k of ['a', 'b']) {
    it(`form ${k}: without inspect the page is byte for byte the CLI's`, () => {
      const { content, values, golden } = load(k);
      expect(new Renderer(content, values).page().html).toBe(golden);
      expect(renderPreview(content, values).html).toBe(golden);
      expect(renderPreview(content, values, { page: 1 }).html).toBe(golden);
    });

    it(`form ${k}: with inspect every printed symbol has data-sym, the index is there, and nothing else changes`, () => {
      const { content, values, golden } = load(k);
      const { html } = renderPreview(content, values, { inspect: true });
      const printed = listSymbols(content).symbols.filter((s: any) => s.occurrences.some((o: any) => !o.condition)).map((s: any) => s.name);
      for (const name of printed) expect(html).toContain(`data-sym="${name}"`);
      const idx = JSON.parse(/<script type="application\/json" id="sf-index">([\s\S]*?)<\/script>/.exec(html)![1]);
      expect(Object.keys(idx.windows)).toEqual(content.pages[0].windows.map((w: any) => w.name));
      expect(Object.keys(idx.symbols).sort()).toEqual(listSymbols(content).symbols.map((s: any) => s.name).sort());
      // the same page once the inspect markup is taken out again
      const plain = html.replace(/<script type="application\/json" id="sf-index">[\s\S]*?<\/script>/, '')
        .replace(/<span data-sym="[^"]*">([^<]*)<\/span>/g, '$1').replace(/ data-sym="[^"]*"/g, '')
        .replace(/ data-node="%(GRAPHIC|ADDRESS)\d+"/g, '');
      expect(plain).toBe(golden);
    });
  }

  it('form b: graphics and address boxes get data-node; the index knows windows, nodes and fields', () => {
    const { content, values } = load('b');
    const fields = fieldsFrom(content, DDIC);
    const { html } = renderPreview(content, values, { inspect: true, fields });
    expect(html).toContain('data-node="%GRAPHIC1"');
    expect(html).toContain('data-node="%ADDRESS1"');
    const idx = buildIndex(content, fields);
    expect(idx.windows.LOGO).toEqual({ type: 'GRAPHIC', mm: { left: 5, top: 5, width: 40, height: 15 }, condition: '' });
    expect(idx.nodes['%TEXT12']).toMatchObject({ window: 'INFO', kind: 'text', condition: "GS_HEAD-KDGRP = '01'", paragraph: 'C8', loop: false });
    expect(idx.nodes['%TEXT21']).toMatchObject({ window: 'MAIN', loop: true });
    expect(idx.symbols['GS_POS-ARKTX']).toMatchObject({ type: 'CHAR', length: 40, inLoop: true });
    expect(idx.symbols['GS_POS-ARKTX'].occurrences[0]).toMatchObject({ window: 'MAIN', node: '%TEXT21', inLoop: true });
  });

  it('graphics: renderPreview never reads a path — only the graphics map; the CLI renderer reads only inside the content folder', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'sf-gfx-'));
    try {
      const run = join(dir, 'run');
      mkdirSync(run);
      writeFileSync(join(dir, 'secret.txt'), 'TOP-SECRET-SERVER-FILE');
      writeFileSync(join(run, 'logo.bmp'), 'BMPDATA');
      const b64 = (s: string) => Buffer.from(s).toString('base64');
      const SECRET = b64('TOP-SECRET-SERVER-FILE');
      const { content, values } = load('b');
      const withFile = (file: string) => ({ ...content, graphics: [{ object: 'GRAPHICS', name: 'ZTEST_LOGO', id: 'BMAP', btype: 'BCOL', widthMm: 30, heightMm: 10, file }] });
      const secret = join(dir, 'secret.txt');
      // workbench: no path is read, whatever the content says (absolute, ../, even a file inside a folder)
      for (const file of [secret, '../secret.txt', join(run, 'logo.bmp'), 'logo.bmp']) {
        for (const inspect of [false, true]) {
          const html = renderPreview(withFile(file), values, { inspect }).html;
          expect(html).not.toContain(SECRET);
          expect(html).not.toContain(b64('BMPDATA'));
          expect(html).toContain('class="missing"');
          expect(html).toContain('>ZTEST_LOGO</div>'); // the labelled box
        }
      }
      // workbench: the graphics map (name → { mime, base64 }) draws the picture; a bad mime or bad base64 does not
      expect(renderPreview(withFile(secret), values, { graphics: { ZTEST_LOGO: { mime: 'image/png', base64: b64('PNGDATA') } } }).html).toContain(`src="data:image/png;base64,${b64('PNGDATA')}"`);
      expect(renderPreview(withFile(secret), values, { graphics: { ZTEST_LOGO: { mime: 'text/html', base64: b64('x') } } }).html).toContain('class="missing"');
      expect(renderPreview(withFile(secret), values, { graphics: { ZTEST_LOGO: { base64: '<script>' } } }).html).toContain('class="missing"');
      expect(renderPreview(withFile(secret), values, { graphics: JSON.parse('{"__proto__": {"base64": "QUJD"}}') }).html).toContain('class="missing"');
      // CLI renderer: only files inside the content.json's folder
      const cli = (file: string) => new Renderer(withFile(file), values, { graphicsBase: run }).page().html;
      expect(cli('logo.bmp')).toContain(b64('BMPDATA'));
      expect(cli(join(run, 'logo.bmp'))).toContain(b64('BMPDATA'));
      for (const file of ['../secret.txt', secret, join(run, '..', 'secret.txt')]) expect(cli(file)).not.toContain(SECRET);
      let linked = false;
      try { symlinkSync(secret, join(run, 'link.bmp')); linked = true; } catch { /* no symlink right on this machine */ }
      if (linked) expect(cli('link.bmp')).not.toContain(SECRET);
      // a directory link (junction on Windows, no admin right needed) pointing out of the folder is refused too
      symlinkSync(dir, join(run, 'out'), 'junction');
      expect(cli(join('out', 'secret.txt'))).not.toContain(SECRET);
      expect(cli(join(run, 'out', 'secret.txt'))).not.toContain(SECRET);
      // without graphicsBase / map (a plain Renderer) nothing is read
      expect(new Renderer(withFile(join(run, 'logo.bmp')), values).page().html).not.toContain(b64('BMPDATA'));
      // the CLI passes the content.json's own folder
      expect(readFileSync(join(__dirname, '..', '..', 'scripts', 'smartform', 'build-preview.mjs'), 'utf8')).toContain('new Renderer(content, values, { graphicsBase: dirname(resolve(contentFile)) })');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('escapes the index (no </script> break-out from a caption)', () => {
    const { content, values } = load('a');
    const evil = structuredClone(content);
    evil.pages[0].windows[0].content[0].caption = '</script><script>alert(1)</script>';
    const { html } = renderPreview(evil, values, { inspect: true });
    expect(html.match(/<script>alert\(1\)<\/script>/g)).toBeNull();
  });
});

describe('preview workbench — fields and samples', () => {
  const { content } = load('b');
  const fields = fieldsFrom(content, DDIC);

  it('fieldsFrom: types through structures, table types and elements; unknown stays unknown; no system symbols', () => {
    expect(fields['GS_HEAD-NAME1']).toEqual({ type: 'CHAR', length: 35, decimals: 0, desc: 'Name 1', inLoop: false, windows: ['ADDR'], declaration: 'GS_HEAD' });
    expect(fields['GS_POS-NETWR']).toMatchObject({ type: 'CURR', length: 15, decimals: 2, inLoop: true });
    expect(fields.GV_TOTAL).toMatchObject({ type: 'CURR', length: 13, decimals: 2, desc: 'Amount' });
    expect(fieldsFrom(content, {})['GS_HEAD-NAME1']).toMatchObject({ type: '', length: 0 });
    expect(Object.keys(fieldsFrom(load('a').content, {}))).not.toContain('SFSY-PAGE');
  });

  it('CLI `fields` writes fields.json from ddic.json and lists the symbols without a type', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { execFileSync } = await import('node:child_process');
    const dir = mkdtempSync(join(tmpdir(), 'sf-fields-'));
    try {
      writeFileSync(join(dir, 'ddic.json'), JSON.stringify({ ZTEST_S_HEADB: DDIC.ZTEST_S_HEADB }));
      const out = JSON.parse(execFileSync(process.execPath, [join(__dirname, '..', '..', 'scripts', 'smartform', 'build-preview.mjs'), 'fields', join(FX, 'form-b.content.json'), '--ddic', join(dir, 'ddic.json'), '--out', join(dir, 'fields.json')], { encoding: 'utf8' }));
      expect(out.unknownType).toEqual(['GS_POS-ARKTX', 'GS_POS-NETWR', 'GS_POS-POSNR', 'GV_TOTAL']);
      expect(JSON.parse(readFileSync(join(dir, 'fields.json'), 'utf8'))['GS_HEAD-NAME1'].length).toBe(35);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('sampleValues: deterministic, by type, within the DDIC length, one value per loop row', () => {
    const a = sampleValues(listSymbols(content).symbols, fields, { rows: 4 });
    expect(sampleValues(listSymbols(content).symbols, fields, { rows: 4 })).toEqual(a);
    expect(a.rows).toBe(4);
    expect(a.values['GS_POS-ARKTX']).toHaveLength(4);
    expect(a.values['GS_HEAD-FKDAT']).toMatch(/^2026\.\d{2}\.\d{2}$/);
    for (const v of a.values['GS_POS-POSNR']) expect(v).toMatch(/^\d{6}$/);
    // CURR 15,2: digits, separators, decimals and the sign place, right-justified in its output length
    for (const v of a.values['GS_POS-NETWR']) { expect(v).toMatch(/^ *[\d,]+\.\d{2} $/); expect(v.length).toBe(15 + 4 + 1 + 1); }
    for (const k of ['GS_HEAD-NAME1', 'GS_HEAD-CITY1']) { expect(a.values[k].length).toBeLessThanOrEqual(fields[k].length); expect(a.values[k].length).toBeGreaterThanOrEqual(fields[k].length * 0.5 - 1); }
    expect(a.values['GS_HEAD-KDGRP']).toHaveLength(2);
    expect(Object.keys(sampleValues(['SFSY-PAGE', 'X'], {}).values)).toEqual(['X']);
    expect(sampleOf('Q', { type: 'QUAN', length: 13, decimals: 3 }, 0, { numberFormat: 'de' })).toMatch(/^ *[\d.]+,\d{3}$/);
    expect(sampleOf('D', { type: 'DATS' }, 0, { dateFormat: 'DD.MM.YYYY' })).toMatch(/^\d{2}\.\d{2}\.2026$/);
  });
});

describe('preview workbench — sample operations', () => {
  const { content } = load('b');
  const fields = fieldsFrom(content, DDIC);
  const base = sampleValues(listSymbols(content).symbols, fields, { rows: 3 });

  it('applies the allowed operations; loop arrays always have one value per row', () => {
    const before = structuredClone(base);
    const r = applySampleOps(base, [
      { op: 'set-value', sym: 'GS_HEAD-NAME1', value: 'Sample Buyer Ltd.' },
      { op: 'set-rows', n: 5 },
      { op: 'set-row-value', sym: 'GS_POS-ARKTX', row: 5, value: 'Fifth' },
      { op: 'add-row', after: 2 },
      { op: 'remove-row', row: 1 },
      { op: 'set-default-paragraph', value: 'aa' },
      { op: 'set-value', sym: 'GS_POS-POSNR', value: '000010' },
    ], fields);
    expect(r.skipped).toEqual([]);
    expect(r.sample.rows).toBe(5);
    for (const v of Object.values(r.sample.values)) if (Array.isArray(v)) expect(v).toHaveLength(5);
    expect(r.sample.values['GS_POS-ARKTX'][4]).toBe('Fifth');
    expect(r.sample.values['GS_POS-POSNR']).toEqual(Array(5).fill('000010'));
    expect(r.sample.defaultParagraph).toBe('AA');
    expect(base).toEqual(before); // the input is not changed
  });

  it('refuses what is not allowed, with the reason, and never throws', () => {
    const r = applySampleOps(base, [
      { op: 'set-value', sym: '__proto__', value: 'x' },
      { op: 'set-value', sym: 'constructor', value: 'x' },
      { op: 'set-value', sym: 'NOT_A_FIELD', value: 'x' },
      { op: 'set-value', sym: 'GS_HEAD-NAME1', value: { a: 1 } },
      { op: 'set-rows', n: 51 },
      { op: 'set-row-value', sym: 'GS_POS-ARKTX', row: 9, value: 'x' },
      { op: 'remove-row', row: 0 },
      { op: 'set-default-paragraph', value: '<b>' },
      { op: 'drop-table' }, null, 42, 'set-rows',
    ], fields);
    expect(r.applied).toEqual([]);
    expect(r.skipped.map((s: any) => s.why)).toEqual([
      'unknown symbol __proto__', 'unknown symbol constructor', 'unknown symbol NOT_A_FIELD', 'value must be text or a number',
      'rows must be 1…50', 'row 9 is not 1…3', 'row 0 is not 1…3', 'a paragraph name of 1–2 letters or digits',
      'unknown op drop-table', 'not an operation', 'not an operation', 'not an operation',
    ]);
    expect(({} as any).x).toBeUndefined();
    expect(() => applySampleOps(null, null, null)).not.toThrow();
    expect(applySampleOps(null, [{ op: 'set-rows', n: 2 }], {}).sample).toEqual({ values: {}, rows: 2 });
  });

  it('a value longer than the DDIC length is applied with a warning (to see the overflow)', () => {
    const r = applySampleOps(base, [{ op: 'set-value', sym: 'GS_HEAD-KDGRP', value: 'ABC' }], fields);
    expect(r.sample.values['GS_HEAD-KDGRP']).toBe('ABC');
    expect(r.warnings).toEqual([{ index: 0, sym: 'GS_HEAD-KDGRP', why: '3 characters, the field holds 2 — kept to show the overflow' }]);
  });

  it('the last row stays; add-row is capped at 50', () => {
    expect(applySampleOps({ rows: 1, values: { A: ['x'] } }, [{ op: 'remove-row', row: 1 }], {}).skipped[0].why).toBe('the last row stays');
    expect(applySampleOps({ rows: 50, values: {} }, [{ op: 'add-row' }], {}).skipped[0].why).toBe('at most 50 rows');
  });
});
